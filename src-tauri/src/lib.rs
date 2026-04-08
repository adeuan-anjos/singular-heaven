mod playlist_cache;
mod thumb_cache;
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

#[tauri::command]
fn yt_set_memory_level(window: tauri::WebviewWindow, low: bool) {
    println!("[yt_set_memory_level] low={low}");
    #[cfg(target_os = "windows")]
    set_webview_memory_level(&window, low);
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
        .register_asynchronous_uri_scheme_protocol("thumb", |ctx, request, responder| {
            let app = ctx.app_handle().clone();
            tauri::async_runtime::spawn(async move {
                // Parse query params from URL
                let uri = request.uri().to_string();
                let query = uri.split('?').nth(1).unwrap_or("");

                let mut original_url = String::new();
                let mut size: u32 = 60;

                for param in query.split('&') {
                    if let Some(val) = param.strip_prefix("url=") {
                        original_url = urlencoding::decode(val).unwrap_or_default().to_string();
                    } else if let Some(val) = param.strip_prefix("s=") {
                        size = val.parse().unwrap_or(60);
                    }
                }

                if original_url.is_empty() {
                    // Empty URL — return 1x1 transparent PNG silently (from <img src="">)
                    // 1x1 transparent PNG
                    let pixel: Vec<u8> = vec![
                        0x89,0x50,0x4E,0x47,0x0D,0x0A,0x1A,0x0A,0x00,0x00,0x00,0x0D,
                        0x49,0x48,0x44,0x52,0x00,0x00,0x00,0x01,0x00,0x00,0x00,0x01,
                        0x08,0x06,0x00,0x00,0x00,0x1F,0x15,0xC4,0x89,0x00,0x00,0x00,
                        0x0A,0x49,0x44,0x41,0x54,0x78,0x9C,0x62,0x00,0x00,0x00,0x02,
                        0x00,0x01,0xE5,0x27,0xDE,0xFC,0x00,0x00,0x00,0x00,0x49,0x45,
                        0x4E,0x44,0xAE,0x42,0x60,0x82,
                    ];
                    let resp = tauri::http::Response::builder()
                        .status(200)
                        .header("Content-Type", "image/png")
                        .body(pixel)
                        .unwrap();
                    responder.respond(resp);
                    return;
                }

                // Modify URL to request exact size from YouTube CDN
                let sized_url = resize_thumbnail_url(&original_url, size);

                // Check cache
                let app_data_dir = match app.path().app_data_dir() {
                    Ok(dir) => dir,
                    Err(_) => {
                        let resp = tauri::http::Response::builder()
                            .status(500)
                            .body("No app data dir".as_bytes().to_vec())
                            .unwrap();
                        responder.respond(resp);
                        return;
                    }
                };

                // Try disk cache first
                if let Ok(bytes) = thumb_cache::read(&app_data_dir, &sized_url, size) {
                    println!("[thumb://] CACHE HIT: {} bytes", bytes.len());
                    let content_type = guess_content_type(&sized_url);
                    let resp = tauri::http::Response::builder()
                        .status(200)
                        .header("Content-Type", content_type)
                        .header("Cache-Control", "max-age=31536000")
                        .body(bytes)
                        .unwrap();
                    responder.respond(resp);
                    return;
                }

                // Cache miss — download from CDN
                println!("[thumb://] CACHE MISS: downloading from CDN...");
                let client = reqwest::Client::new();
                match client.get(&sized_url)
                    .header("Referer", "")
                    .send()
                    .await
                {
                    Ok(resp) if resp.status().is_success() => {
                        let content_type = resp.headers()
                            .get("content-type")
                            .and_then(|v| v.to_str().ok())
                            .unwrap_or("image/jpeg")
                            .to_string();

                        match resp.bytes().await {
                            Ok(bytes) => {
                                // Save to disk cache
                                println!("[thumb://] Downloaded {} bytes, saving to disk", bytes.len());
                                let _ = thumb_cache::save(&app_data_dir, &sized_url, size, &bytes);

                                let resp = tauri::http::Response::builder()
                                    .status(200)
                                    .header("Content-Type", &content_type)
                                    .header("Cache-Control", "max-age=31536000")
                                    .body(bytes.to_vec())
                                    .unwrap();
                                responder.respond(resp);
                            }
                            Err(e) => {
                                let resp = tauri::http::Response::builder()
                                    .status(502)
                                    .body(format!("Download error: {e}").as_bytes().to_vec())
                                    .unwrap();
                                responder.respond(resp);
                            }
                        }
                    }
                    Ok(resp) => {
                        let status = resp.status().as_u16();
                        let resp = tauri::http::Response::builder()
                            .status(status)
                            .body(format!("CDN returned {status}").as_bytes().to_vec())
                            .unwrap();
                        responder.respond(resp);
                    }
                    Err(e) => {
                        let resp = tauri::http::Response::builder()
                            .status(502)
                            .body(format!("Request error: {e}").as_bytes().to_vec())
                            .unwrap();
                        responder.respond(resp);
                    }
                }
            });
        })
        .register_asynchronous_uri_scheme_protocol("stream", |ctx, request, responder| {
            let app = ctx.app_handle().clone();
            tauri::async_runtime::spawn(async move {
                let path = request.uri().path().trim_start_matches('/').to_string();
                let video_id = path.as_str();
                println!("[stream://] Request for videoId={video_id}");

                let state = app.state::<Arc<Mutex<YtMusicState>>>();
                let result = {
                    let st = state.lock().await;
                    st.client.fetch_audio_bytes(video_id).await
                };

                match result {
                    Ok((bytes, mime_type)) => {
                        println!("[stream://] Serving {} bytes, mime={}", bytes.len(), mime_type);
                        let len = bytes.len();
                        let resp = tauri::http::Response::builder()
                            .status(200)
                            .header("Content-Type", &mime_type)
                            .header("Content-Length", len.to_string())
                            .header("Accept-Ranges", "bytes")
                            .header("Content-Range", format!("bytes 0-{}/{}", len.saturating_sub(1), len))
                            .header("Access-Control-Allow-Origin", "*")
                            .body(bytes)
                            .unwrap();
                        responder.respond(resp);
                    }
                    Err(e) => {
                        eprintln!("[stream://] Error: {e}");
                        let resp = tauri::http::Response::builder()
                            .status(500)
                            .body(format!("Stream error: {e}").into_bytes())
                            .unwrap();
                        responder.respond(resp);
                    }
                }
            });
        })
        .setup(|app| {
            #[cfg(target_os = "windows")]
            if let Some(ww) = app.get_webview_window("main") {
                set_tracking_prevention_basic(&ww);
            }

            println!("[setup] Initializing YtMusicState...");

            let app_data_dir = app.handle().path().app_data_dir().ok();

            // Initialize playlist cache (SQLite)
            if let Some(ref dir) = app_data_dir {
                println!("[setup] Initializing PlaylistCache...");
                let cache = playlist_cache::PlaylistCache::open(dir)
                    .map_err(|e| format!("Failed to open playlist cache: {e}"))?;
                app.manage(Arc::new(tokio::sync::Mutex::new(cache)));
                println!("[setup] PlaylistCache added to managed state.");
            }

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
            yt_set_memory_level,
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
            youtube_music::commands::yt_get_stream_url,
            youtube_music::commands::yt_load_playlist,
            youtube_music::commands::yt_get_cached_tracks,
            youtube_music::commands::yt_get_playlist_track_ids,
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

/// Modify a YouTube thumbnail URL to request a specific size.
/// Only googleusercontent.com and ggpht.com URLs support size params.
/// Handles both `=w60-h60-...` and `=s192` formats.
/// All other URLs (ytimg.com, gstatic.com, etc.) are returned unchanged.
fn resize_thumbnail_url(url: &str, size: u32) -> String {
    let supports_resize = url.contains("googleusercontent.com") || url.contains("ggpht.com");
    if !supports_resize {
        return url.to_string();
    }

    // Match =w{n}-h{n}... or =s{n} at end of URL
    let re_wh = regex::Regex::new(r"=w\d+-h\d+[^&]*").unwrap();
    let re_s = regex::Regex::new(r"=s\d+[^&]*$").unwrap();

    if re_wh.is_match(url) {
        re_wh.replace(url, format!("=w{size}-h{size}").as_str()).to_string()
    } else if re_s.is_match(url) {
        re_s.replace(url, format!("=s{size}").as_str()).to_string()
    } else {
        format!("{url}=w{size}-h{size}")
    }
}

fn guess_content_type(url: &str) -> &'static str {
    if url.contains(".webp") { "image/webp" }
    else if url.contains(".png") { "image/png" }
    else { "image/jpeg" }
}
