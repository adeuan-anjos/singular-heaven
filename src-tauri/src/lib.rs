mod youtube_music;

use std::sync::Arc;
use tauri::Manager;
use tokio::sync::Mutex;

use youtube_music::client::YtMusicState;

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

/// Set WebView2 Tracking Prevention to Basic level.
/// Default (Balanced) blocks storage for CDN domains like yt3.ggpht.com, which
/// pollutes the console with warnings. Basic still protects against malicious
/// trackers (fingerprinters, cryptominers) without false-flagging content CDNs.
#[cfg(target_os = "windows")]
fn set_tracking_prevention_basic(
    webview_window: &tauri::WebviewWindow<impl tauri::Runtime>,
) {
    use webview2_com::Microsoft::Web::WebView2::Win32::{
        ICoreWebView2_13, ICoreWebView2Profile3,
        COREWEBVIEW2_TRACKING_PREVENTION_LEVEL_BASIC,
    };

    let _ = webview_window.with_webview(|platform_webview| unsafe {
        let controller = platform_webview.controller();
        let core_webview = controller
            .CoreWebView2()
            .expect("Failed to get CoreWebView2");

        let wv13: ICoreWebView2_13 = windows_core::Interface::cast(&core_webview)
            .expect("Failed to cast to ICoreWebView2_13 — requires WebView2 Runtime v104+");

        let profile = wv13.Profile().expect("Failed to get Profile");

        let profile3: ICoreWebView2Profile3 = windows_core::Interface::cast(&profile)
            .expect("Failed to cast to ICoreWebView2Profile3");

        profile3
            .SetPreferredTrackingPreventionLevel(COREWEBVIEW2_TRACKING_PREVENTION_LEVEL_BASIC)
            .expect("Failed to set tracking prevention level");

        println!("[Rust] WebView2 tracking prevention set to Basic");
    });
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .setup(|app| {
            #[cfg(target_os = "windows")]
            if let Some(ww) = app.get_webview_window("main") {
                set_tracking_prevention_basic(&ww);
            }

            println!("[setup] Initializing YtMusicState...");

            let app_data_dir = app.handle().path().app_data_dir().ok();

            // Priority 1: Try loading saved cookies from disk
            let saved_cookies = app_data_dir.as_ref().and_then(|dir| {
                println!("[setup] Checking for saved cookies...");
                match YtMusicState::load_cookies(dir) {
                    Ok(cookies) => cookies,
                    Err(e) => {
                        eprintln!("[setup] Error loading saved cookies: {e}");
                        None
                    }
                }
            });

            if let Some(cookie_string) = saved_cookies {
                println!("[setup] Found saved cookies, creating cookie-auth client...");
                match YtMusicState::new_from_cookies(cookie_string) {
                    Ok(mut state) => {
                        // Restore saved brand account (pageId) if available
                        if let Some(ref dir) = app_data_dir {
                            if let Some(page_id) = YtMusicState::load_page_id(dir) {
                                println!("[setup] Restoring saved page_id: {page_id}");
                                state.client.set_on_behalf_of_user(Some(page_id));
                            }
                        }
                        println!("[setup] Cookie-auth client created from saved cookies.");
                        app.manage(Arc::new(Mutex::new(state)));
                        println!("[setup] YtMusicState added to managed state.");
                        return Ok(());
                    }
                    Err(e) => {
                        eprintln!("[setup] Failed to create cookie-auth client: {e}");
                        println!("[setup] Falling back to unauthenticated...");
                    }
                }
            }

            // Priority 2: Unauthenticated
            println!("[setup] No saved credentials, creating unauthenticated client...");
            let state = match YtMusicState::new_unauthenticated() {
                Ok(s) => s,
                Err(e) => {
                    eprintln!("[setup] Failed to create YtMusicState: {e}");
                    return Ok(());
                }
            };

            app.manage(Arc::new(Mutex::new(state)));
            println!("[setup] YtMusicState added to managed state.");
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            greet,
            youtube_music::commands::yt_search,
            youtube_music::commands::yt_search_suggestions,
            youtube_music::commands::yt_get_home,
            youtube_music::commands::yt_get_artist,
            youtube_music::commands::yt_get_album,
            youtube_music::commands::yt_get_explore,
            youtube_music::commands::yt_get_mood_categories,
            youtube_music::commands::yt_get_library_playlists,
            youtube_music::commands::yt_get_library_songs,
            youtube_music::commands::yt_get_playlist,
            youtube_music::commands::yt_get_playlist_continuation,
            youtube_music::commands::yt_get_watch_playlist,
            youtube_music::commands::yt_get_lyrics,
            youtube_music::commands::yt_auth_status,
            youtube_music::commands::yt_auth_logout,
            youtube_music::commands::yt_detect_browsers,
            youtube_music::commands::yt_auth_from_browser,
            youtube_music::commands::yt_get_accounts,
            youtube_music::commands::yt_switch_account,
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
