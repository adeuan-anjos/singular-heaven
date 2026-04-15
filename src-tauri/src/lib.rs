mod playlist_cache;
mod playback_queue;
mod thumb_cache;
mod youtube_music;

use std::collections::HashSet;
use std::sync::Arc;
use tauri::image::Image;
use tauri::Manager;
use tauri::tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent};
use tokio::sync::RwLock;

/// App icon embedded at compile time (128x128@2x = 256x256 PNG).
/// Workaround for tauri-codegen bug #14596 which only reads the first ICO entry,
/// producing a tiny/wrong icon for taskbar and Alt+Tab in production builds.
const ICON_BYTES: &[u8] = include_bytes!("../icons/128x128@2x.png");

use youtube_music::client::YtMusicState;
use youtube_music::session::SessionActivity;

#[tauri::command]
fn yt_set_memory_level(window: tauri::WebviewWindow, low: bool) {

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

    let _level_name = if low { "Low" } else { "Normal" };
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

    });
}

/// Set the window icon for taskbar and Alt+Tab using Win32 API directly.
/// Loads the icon from the exe's embedded resource (ID 32512), which tauri-build
/// writes to resource.rc during compilation. This bypasses Tauri's buggy
/// default_window_icon / set_icon path (tauri-codegen bug #14596).
#[cfg(target_os = "windows")]
fn set_window_icon_from_resource(window: &tauri::WebviewWindow<impl tauri::Runtime>) {
    use std::ffi::c_void;

    type HANDLE = *mut c_void;

    const IMAGE_ICON: u32 = 1;
    const LR_SHARED: u32 = 0x0000_8000;
    const WM_SETICON: u32 = 0x0080;
    const ICON_SMALL: usize = 0;
    const ICON_BIG: usize = 1;

    extern "system" {
        fn GetModuleHandleW(lpModuleName: *const u16) -> *mut c_void;
        fn LoadImageW(
            hInst: *mut c_void,
            name: *const u16,
            r#type: u32,
            cx: i32,
            cy: i32,
            fuLoad: u32,
        ) -> HANDLE;
        fn SendMessageW(
            hWnd: *mut c_void,
            msg: u32,
            wParam: usize,
            lParam: isize,
        ) -> isize;
    }

    match window.hwnd() {
        Ok(hwnd) => unsafe {
            let hinstance = GetModuleHandleW(std::ptr::null());
            // Resource ID 32512: standard icon ID that tauri-build embeds in resource.rc
            let resource_id = 32512u16 as *const u16;

            let icon_big = LoadImageW(hinstance, resource_id, IMAGE_ICON, 48, 48, LR_SHARED);
            let icon_small = LoadImageW(hinstance, resource_id, IMAGE_ICON, 16, 16, LR_SHARED);

            let hwnd_ptr = hwnd.0 as *mut c_void;

            if !icon_big.is_null() {
                SendMessageW(hwnd_ptr, WM_SETICON, ICON_BIG, icon_big as isize);

            } else {
                eprintln!("[setup] LoadImageW failed for ICON_BIG.");
            }
            if !icon_small.is_null() {
                SendMessageW(hwnd_ptr, WM_SETICON, ICON_SMALL, icon_small as isize);

            } else {
                eprintln!("[setup] LoadImageW failed for ICON_SMALL.");
            }
        },
        Err(e) => eprintln!("[setup] Failed to get HWND for icon: {e}"),
    }
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

    });
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    #[cfg(target_os = "windows")]
    std::env::set_var(
        "WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS",
        "--disable-features=msWebOOUI,msPdfOOUI,msSmartScreenProtection \
         --enable-features=SmoothScrolling,FractionalScrollOffsets",
    );

    tauri::Builder::default()
        .plugin(tauri_plugin_single_instance::init(|app, _argv, _cwd| {
            // A second instance was launched — focus the existing window

            if let Some(window) = app.get_webview_window("main") {
                let _ = window.show();
                let _ = window.unminimize();
                let _ = window.set_focus();
            }
        }))
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

                // SECURITY: Only allow YouTube/Google CDN domains (SSRF prevention)
                let is_allowed = original_url.starts_with("https://") && {
                    // Extract host from https://HOST/... or https://HOST?...
                    let after_scheme = &original_url[8..];
                    let host = after_scheme
                        .split('/')
                        .next()
                        .unwrap_or("")
                        .split('?')
                        .next()
                        .unwrap_or("")
                        .split(':')
                        .next()
                        .unwrap_or("");
                    host.ends_with(".ytimg.com")
                        || host.ends_with(".ggpht.com")
                        || host.ends_with(".googleusercontent.com")
                        || host.ends_with(".gstatic.com")
                        || host == "ytimg.com"
                        || host == "ggpht.com"
                        || host == "googleusercontent.com"
                        || host == "gstatic.com"
                };

                if !original_url.is_empty() && !is_allowed {

                    let resp = tauri::http::Response::builder()
                        .status(403)
                        .body("Forbidden: URL domain not allowed".as_bytes().to_vec())
                        .unwrap();
                    responder.respond(resp);
                    return;
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

                let client = reqwest::Client::builder()
                    .pool_max_idle_per_host(0)
                    .tcp_keepalive(None)
                    .build()
                    .unwrap_or_else(|_| reqwest::Client::new());
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


                // SECURITY: Validate videoId format (exactly 11 chars, base64url alphabet)
                let is_valid_video_id = video_id.len() == 11
                    && video_id.chars().all(|c| c.is_ascii_alphanumeric() || c == '_' || c == '-');

                if !is_valid_video_id {
                    eprintln!("[stream://] BLOCKED: invalid videoId format: {video_id}");
                    let resp = tauri::http::Response::builder()
                        .status(400)
                        .body("Invalid videoId format".as_bytes().to_vec())
                        .unwrap();
                    responder.respond(resp);
                    return;
                }

                let state = app.state::<Arc<RwLock<YtMusicState>>>();
                let result = {
                    let st = state.read().await;
                    st.client.fetch_audio_bytes(video_id).await
                };

                match result {
                    Ok((bytes, mime_type)) => {

                        let len = bytes.len();
                        let resp = tauri::http::Response::builder()
                            .status(200)
                            .header("Content-Type", &mime_type)
                            .header("Content-Length", len.to_string())
                            .header("Accept-Ranges", "bytes")
                            .header("Content-Range", format!("bytes 0-{}/{}", len.saturating_sub(1), len))
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

            // ── Window Icon (taskbar / Alt+Tab) ─────────────────────────
            // Uses Win32 API directly to load icon from exe resource, bypassing
            // Tauri's buggy codegen path (bug #14596).
            #[cfg(target_os = "windows")]
            if let Some(window) = app.get_webview_window("main") {
                set_window_icon_from_resource(&window);
            }

            // ── System Tray ──────────────────────────────────────────────
            let show_item = tauri::menu::MenuItem::with_id(app, "show", "Mostrar", true, None::<&str>)?;
            let quit_item = tauri::menu::MenuItem::with_id(app, "quit", "Sair", true, None::<&str>)?;
            let tray_menu = tauri::menu::MenuBuilder::new(app)
                .item(&show_item)
                .separator()
                .item(&quit_item)
                .build()?;

            TrayIconBuilder::new()
                .icon(Image::from_bytes(ICON_BYTES).expect("failed to load tray icon"))
                .menu(&tray_menu)
                .show_menu_on_left_click(false)
                .tooltip("Singular Haven")
                .on_menu_event(|app, event| {
                    match event.id.as_ref() {
                        "show" => {
                            if let Some(w) = app.get_webview_window("main") {
                                let _ = w.show();
                                let _ = w.unminimize();
                                let _ = w.set_focus();
                            }
                        }
                        "quit" => {

                            app.exit(0);
                        }
                        _ => {}
                    }
                })
                .on_tray_icon_event(|tray, event| {
                    if let TrayIconEvent::Click {
                        button: MouseButton::Left,
                        button_state: MouseButtonState::Up,
                        ..
                    } = event
                    {
                        let app = tray.app_handle();
                        if let Some(w) = app.get_webview_window("main") {
                            let _ = w.show();
                            let _ = w.unminimize();
                            let _ = w.set_focus();
                        }
                    }
                })
                .build(app)?;



            // Session activity tracker — last successful authenticated call timestamp
            // and refresh serialization mutex. Independent of auth state.
            app.manage(Arc::new(SessionActivity::new()));


            let app_data_dir = app.handle().path().app_data_dir().ok();

            // Initialize playlist cache (SQLite)
            if let Some(ref dir) = app_data_dir {

                let cache = playlist_cache::PlaylistCache::open(dir)
                    .map_err(|e| format!("Failed to open playlist cache: {e}"))?;
                app.manage(Arc::new(tokio::sync::Mutex::new(cache)));

                app.manage(Arc::new(tokio::sync::Mutex::new(HashSet::<String>::new())));

                app.manage(Arc::new(tokio::sync::Mutex::new(
                    playback_queue::PlaybackQueue::default(),
                )));

            }

            // Priority 1: Try loading saved cookies from disk
            let saved_cookies = app_data_dir.as_ref().and_then(|dir| {

                match YtMusicState::load_cookies(dir) {
                    Ok(cookies) => cookies,
                    Err(e) => {
                        eprintln!("[setup] Error loading saved cookies: {e}");
                        None
                    }
                }
            });

            if let Some(cookie_string) = saved_cookies {
                let auth_user = app_data_dir.as_ref()
                    .and_then(|dir| YtMusicState::load_auth_user(dir))
                    .unwrap_or(0);

                match YtMusicState::new_from_cookies(cookie_string, auth_user) {
                    Ok(mut state) => {
                        // Restore saved brand account (pageId) if available
                        if let Some(ref dir) = app_data_dir {
                            if let Some(page_id) = YtMusicState::load_page_id(dir) {
                                state.client.set_on_behalf_of_user(Some(page_id));
                            }
                        }
                        app.manage(Arc::new(RwLock::new(state)));

                        return Ok(());
                    }
                    Err(e) => {
                        eprintln!("[setup] failed to create cookie-auth client: {e}");

                    }
                }
            } else {

            }

            // Priority 2: Unauthenticated


            let state = match YtMusicState::new_unauthenticated() {
                Ok(s) => s,
                Err(e) => {
                    eprintln!("[setup] failed to create YtMusicState: {e}");
                    return Ok(());
                }
            };

            app.manage(Arc::new(RwLock::new(state)));

            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            yt_set_memory_level,
            youtube_music::commands::yt_search,
            youtube_music::commands::yt_search_suggestions,
            youtube_music::commands::yt_get_home,
            youtube_music::commands::yt_get_artist,
            youtube_music::commands::yt_get_album,
            youtube_music::commands::yt_get_explore,
            youtube_music::commands::yt_get_mood_categories,
            youtube_music::commands::yt_get_library_playlists,
            youtube_music::commands::yt_get_sidebar_playlists,
            youtube_music::commands::yt_get_sidebar_playlists_cached,
            youtube_music::commands::yt_get_library_songs,
            youtube_music::commands::yt_get_liked_track_ids,
            youtube_music::commands::yt_get_liked_track_ids_cached,
            youtube_music::commands::yt_get_library_playlists_cached,
            youtube_music::commands::yt_rate_song,
            youtube_music::commands::yt_rate_playlist,
            youtube_music::commands::yt_get_playlist,
            youtube_music::commands::yt_get_playlist_continuation,
            youtube_music::commands::yt_create_playlist,
            youtube_music::commands::yt_edit_playlist,
            youtube_music::commands::yt_set_playlist_thumbnail,
            youtube_music::commands::yt_delete_playlist,
            youtube_music::commands::yt_add_playlist_items,
            youtube_music::commands::yt_remove_playlist_items,
            youtube_music::commands::yt_get_watch_playlist,
            youtube_music::commands::yt_get_lyrics,
            youtube_music::lyrics_lrclib::yt_lyrics_lrclib,
            youtube_music::commands::yt_auth_status,
            youtube_music::commands::yt_ensure_session,
            youtube_music::commands::yt_auth_logout,
            youtube_music::commands::yt_detect_browsers,
            youtube_music::commands::yt_auth_from_browser,
            youtube_music::commands::yt_detect_google_accounts,
            youtube_music::commands::yt_get_accounts,
            youtube_music::commands::yt_switch_account,
            youtube_music::commands::yt_get_stream_url,
            youtube_music::commands::yt_load_playlist,
            youtube_music::commands::yt_cache_collection_snapshot,
            youtube_music::commands::yt_get_cached_tracks,
            youtube_music::commands::yt_get_collection_track_ids,
            youtube_music::commands::yt_get_collection_window,
            youtube_music::commands::yt_get_playlist_track_ids,
            youtube_music::commands::yt_get_playlist_track_ids_complete,
            youtube_music::commands::yt_get_playlist_window,
            youtube_music::commands::yt_queue_set,
            youtube_music::commands::yt_queue_get_state,
            youtube_music::commands::yt_queue_get_window,
            youtube_music::commands::yt_queue_play_index,
            youtube_music::commands::yt_queue_next,
            youtube_music::commands::yt_queue_previous,
            youtube_music::commands::yt_queue_handle_track_end,
            youtube_music::commands::yt_queue_add_next,
            youtube_music::commands::yt_queue_add_collection_next,
            youtube_music::commands::yt_queue_append_collection,
            youtube_music::commands::yt_queue_remove,
            youtube_music::commands::yt_queue_toggle_shuffle,
            youtube_music::commands::yt_queue_cycle_repeat,
            youtube_music::commands::yt_queue_clear,
            youtube_music::commands::yt_radio_start,
            youtube_music::commands::yt_radio_reroll,
            youtube_music::commands::yt_radio_load_more,
            #[cfg(debug_assertions)]
            youtube_music::commands::yt_dev_corrupt_cookies,
            #[cfg(debug_assertions)]
            youtube_music::commands::yt_dev_backdate_activity,
            #[cfg(debug_assertions)]
            youtube_music::commands::yt_dev_session_stats,
        ])
        .on_window_event(|window, event| {
            // ── Close → hide to tray (intercept Alt+F4, taskbar close, etc.) ──
            if let tauri::WindowEvent::CloseRequested { api, .. } = event {

                api.prevent_close();
                let _ = window.hide();
            }

            if let tauri::WindowEvent::Focused(focused) = event {
                // Memory level (Windows-only — existing behavior)
                #[cfg(target_os = "windows")]
                if let Some(ww) = window.get_webview_window(window.label()) {
                    set_webview_memory_level(&ww, !focused);
                }

                // Proactive session refresh (cross-platform — new behavior).
                // When the window regains focus and the session has been idle for
                // longer than `STALE_THRESHOLD_SECS`, kick off a refresh in the
                // background so that the user's first authenticated action after
                // returning to the app does not pay the retry-after-401 cost.
                if *focused {
                    let app = window.app_handle().clone();
                    tauri::async_runtime::spawn(async move {
                        let activity = app.state::<Arc<SessionActivity>>();
                        let state = app.state::<Arc<RwLock<YtMusicState>>>();

                        let stale = activity
                            .seconds_since()
                            .map(|s| s > youtube_music::session::STALE_THRESHOLD_SECS)
                            .unwrap_or(false);

                        if !stale {
                            return;
                        }
                        if !state.read().await.is_authenticated() {

                            return;
                        }

                        if let Err(_e) = youtube_music::session::refresh_cookies_and_rebuild_state(
                            &app,
                            state.inner(),
                            activity.inner(),
                        )
                        .await
                        {

                        } else {

                        }
                    });
                }
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
