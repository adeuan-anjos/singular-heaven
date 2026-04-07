mod youtube_music;

use std::sync::Arc;
use tauri::Manager;
use tokio::sync::Mutex;

use youtube_music::client::YtMusicClient;
use youtube_music::commands::PendingOAuthCode;

// Learn more about Tauri commands at https://tauri.app/develop/calling-rust/
#[tauri::command]
fn greet(name: &str) -> String {
    format!("Hello, {}! You've been greeted from Rust!", name)
}

/// On Windows, adjusts WebView2 memory usage target level based on window focus.
/// When the window loses focus, memory is set to Low (WebView2 swaps data to disk).
/// When the window regains focus, memory is restored to Normal.
#[cfg(target_os = "windows")]
fn set_webview_memory_level(
    webview_window: &tauri::WebviewWindow<impl tauri::Runtime>,
    low: bool,
) {
    use webview2_com::Microsoft::Web::WebView2::Win32::{
        ICoreWebView2_19, COREWEBVIEW2_MEMORY_USAGE_TARGET_LEVEL,
        COREWEBVIEW2_MEMORY_USAGE_TARGET_LEVEL_LOW,
        COREWEBVIEW2_MEMORY_USAGE_TARGET_LEVEL_NORMAL,
    };

    let level_name = if low { "Low" } else { "Normal" };
    let target_level: COREWEBVIEW2_MEMORY_USAGE_TARGET_LEVEL = if low {
        COREWEBVIEW2_MEMORY_USAGE_TARGET_LEVEL_LOW
    } else {
        COREWEBVIEW2_MEMORY_USAGE_TARGET_LEVEL_NORMAL
    };

    let _ = webview_window.with_webview(move |platform_webview| unsafe {
        let controller = platform_webview.controller();
        let core_webview = controller
            .CoreWebView2()
            .expect("Failed to get CoreWebView2 from controller");

        let webview_19: ICoreWebView2_19 = windows_core::Interface::cast(&core_webview)
            .expect("Failed to cast to ICoreWebView2_19 — requires WebView2 Runtime v119+");

        webview_19
            .SetMemoryUsageTargetLevel(target_level)
            .expect("Failed to set WebView2 memory usage target level");

        println!("[Rust] WebView2 memory usage set to {level_name}");
    });
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .setup(|app| {
            // Register the pending OAuth code state (empty initially)
            app.manage(PendingOAuthCode(Mutex::new(None)));

            let handle = app.handle().clone();
            tauri::async_runtime::spawn(async move {
                println!("[setup] Initializing YtMusicClient...");

                let app_data_dir = handle.path().app_data_dir().ok();

                // Priority 1: Try loading saved cookies from disk
                let saved_cookies = app_data_dir.as_ref().and_then(|dir| {
                    println!("[setup] Checking for saved cookies...");
                    match YtMusicClient::load_cookies(dir) {
                        Ok(cookies) => cookies,
                        Err(e) => {
                            eprintln!("[setup] Error loading saved cookies: {e}");
                            None
                        }
                    }
                });

                if let Some(cookie_string) = saved_cookies {
                    println!("[setup] Found saved cookies, creating cookie-auth client...");
                    match YtMusicClient::new_from_cookies(&cookie_string).await {
                        Ok(client) => {
                            println!("[setup] Cookie-auth client created from saved cookies.");
                            handle.manage(Arc::new(Mutex::new(client)));
                            println!("[setup] YtMusicClient added to managed state.");
                            return;
                        }
                        Err(e) => {
                            eprintln!("[setup] Failed to create cookie-auth client: {e}");
                            println!("[setup] Falling back to OAuth token...");
                        }
                    }
                }

                // Priority 2: Try loading saved OAuth token from disk
                let saved_token = app_data_dir.as_ref().and_then(|dir| {
                    println!("[setup] Checking for saved OAuth token...");
                    match YtMusicClient::load_token(dir) {
                        Ok(token) => token,
                        Err(e) => {
                            eprintln!("[setup] Error loading saved token: {e}");
                            None
                        }
                    }
                });

                let client = if let Some(token) = saved_token {
                    println!("[setup] Found saved token, creating authenticated client...");
                    let c = YtMusicClient::new_authenticated(token);
                    println!("[setup] Authenticated client created from saved token.");
                    c
                } else {
                    // Priority 3: Unauthenticated
                    println!("[setup] No saved credentials, creating unauthenticated client...");
                    match YtMusicClient::new_unauthenticated().await {
                        Ok(c) => c,
                        Err(e) => {
                            eprintln!("[setup] Failed to create YtMusicClient: {e}");
                            return;
                        }
                    }
                };

                handle.manage(Arc::new(Mutex::new(client)));
                println!("[setup] YtMusicClient added to managed state.");
            });
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            greet,
            youtube_music::commands::yt_search,
            youtube_music::commands::yt_auth_start,
            youtube_music::commands::yt_auth_complete,
            youtube_music::commands::yt_auth_status,
            youtube_music::commands::yt_auth_logout,
            youtube_music::commands::yt_detect_browsers,
            youtube_music::commands::yt_auth_from_browser,
        ])
        .on_window_event(|window, event| {
            #[cfg(target_os = "windows")]
            match event {
                tauri::WindowEvent::Focused(focused) => {
                    if let Some(ww) = window.get_webview_window(window.label()) {
                        set_webview_memory_level(&ww, !focused);
                    }
                }
                _ => {}
            }
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
