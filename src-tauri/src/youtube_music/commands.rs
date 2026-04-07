use std::sync::Arc;

use serde::Serialize;
use tauri::{AppHandle, Manager, State};
use tokio::sync::Mutex;

use super::client::YtMusicState;

// ---------------------------------------------------------------------------
// Auth response DTOs
// ---------------------------------------------------------------------------
#[derive(Serialize)]
pub struct AuthStatusResponse {
    pub authenticated: bool,
    pub method: String,
}

#[derive(Serialize)]
pub struct BrowserInfo {
    pub name: String,
    #[serde(rename = "hasCookies")]
    pub has_cookies: bool,
    #[serde(rename = "cookieCount")]
    pub cookie_count: usize,
}

// ---------------------------------------------------------------------------
// Cookie extraction helpers
// ---------------------------------------------------------------------------

/// Extract YouTube cookies from a specific browser using the `rookie` crate.
/// Returns the cookie string in "key1=val1; key2=val2" format, or None if no cookies found.
fn extract_cookies_from_browser(browser: &str) -> Result<Option<String>, String> {
    println!("[extract_cookies] Trying browser: {browser}");

    let domains = Some(vec![".youtube.com".to_string()]);

    let cookies = match browser {
        "chrome" => rookie::chrome(domains.clone()),
        "firefox" => rookie::firefox(domains.clone()),
        "edge" => rookie::edge(domains.clone()),
        "brave" => rookie::brave(domains.clone()),
        "chromium" => rookie::chromium(domains.clone()),
        "opera" => rookie::opera(domains.clone()),
        "vivaldi" => rookie::vivaldi(domains.clone()),
        _ => return Err(format!("[extract_cookies] Unknown browser: {browser}")),
    };

    match cookies {
        Ok(cookie_list) => {
            println!(
                "[extract_cookies] {browser}: found {} cookies",
                cookie_list.len()
            );
            if cookie_list.is_empty() {
                return Ok(None);
            }
            // Format as "key1=val1; key2=val2; ..."
            let cookie_string: String = cookie_list
                .iter()
                .map(|c| format!("{}={}", c.name, c.value))
                .collect::<Vec<_>>()
                .join("; ");
            println!(
                "[extract_cookies] {browser}: cookie string length = {} chars",
                cookie_string.len()
            );
            Ok(Some(cookie_string))
        }
        Err(e) => {
            println!("[extract_cookies] {browser}: error reading cookies: {e}");
            Err(format!(
                "[extract_cookies] Failed to read {browser} cookies: {e}"
            ))
        }
    }
}

/// Try browsers in priority order until one yields YouTube cookies.
fn extract_cookies_auto() -> Result<(String, String), String> {
    let browsers = ["edge", "chrome", "firefox", "brave", "chromium", "opera", "vivaldi"];

    println!("[extract_cookies_auto] Trying browsers in order: {browsers:?}");

    for browser in browsers {
        match extract_cookies_from_browser(browser) {
            Ok(Some(cookies)) => {
                println!("[extract_cookies_auto] Success with {browser}");
                return Ok((browser.to_string(), cookies));
            }
            Ok(None) => {
                println!("[extract_cookies_auto] {browser}: no YouTube cookies");
            }
            Err(e) => {
                println!("[extract_cookies_auto] {browser}: skipped ({e})");
            }
        }
    }

    Err("[extract_cookies_auto] No browser with YouTube cookies found".to_string())
}

// ---------------------------------------------------------------------------
// Search
// ---------------------------------------------------------------------------

#[tauri::command]
pub async fn yt_search(
    query: String,
    filter: Option<String>,
    state: State<'_, Arc<Mutex<YtMusicState>>>,
) -> Result<String, String> {
    println!("[yt_search] query={query} filter={filter:?}");
    let state = state.lock().await;
    let result = state.client.search(&query, filter.as_deref()).await
        .map_err(|e| format!("[yt_search] {e}"))?;
    serde_json::to_string(&result)
        .map_err(|e| format!("[yt_search] serialization: {e}"))
}

#[tauri::command]
pub async fn yt_search_suggestions(
    query: String,
    state: State<'_, Arc<Mutex<YtMusicState>>>,
) -> Result<String, String> {
    println!("[yt_search_suggestions] query={query}");
    let state = state.lock().await;
    let result = state.client.get_search_suggestions(&query).await
        .map_err(|e| format!("[yt_search_suggestions] {e}"))?;
    serde_json::to_string(&result)
        .map_err(|e| format!("[yt_search_suggestions] serialization: {e}"))
}

// ---------------------------------------------------------------------------
// Browsing
// ---------------------------------------------------------------------------

#[tauri::command]
pub async fn yt_get_home(
    limit: Option<usize>,
    state: State<'_, Arc<Mutex<YtMusicState>>>,
) -> Result<String, String> {
    let limit = limit.unwrap_or(6);
    println!("[yt_get_home] limit={limit}");
    let state = state.lock().await;
    let result = state.client.get_home(limit).await
        .map_err(|e| format!("[yt_get_home] {e}"))?;
    serde_json::to_string(&result)
        .map_err(|e| format!("[yt_get_home] serialization: {e}"))
}

#[tauri::command]
pub async fn yt_get_artist(
    browse_id: String,
    state: State<'_, Arc<Mutex<YtMusicState>>>,
) -> Result<String, String> {
    println!("[yt_get_artist] browse_id={browse_id}");
    let state = state.lock().await;
    let result = state.client.get_artist(&browse_id).await
        .map_err(|e| format!("[yt_get_artist] {e}"))?;
    serde_json::to_string(&result)
        .map_err(|e| format!("[yt_get_artist] serialization: {e}"))
}

#[tauri::command]
pub async fn yt_get_album(
    browse_id: String,
    state: State<'_, Arc<Mutex<YtMusicState>>>,
) -> Result<String, String> {
    println!("[yt_get_album] browse_id={browse_id}");
    let state = state.lock().await;
    let result = state.client.get_album(&browse_id).await
        .map_err(|e| format!("[yt_get_album] {e}"))?;
    serde_json::to_string(&result)
        .map_err(|e| format!("[yt_get_album] serialization: {e}"))
}

// ---------------------------------------------------------------------------
// Explore
// ---------------------------------------------------------------------------

#[tauri::command]
pub async fn yt_get_explore(
    state: State<'_, Arc<Mutex<YtMusicState>>>,
) -> Result<String, String> {
    println!("[yt_get_explore]");
    let state = state.lock().await;
    let result = state.client.get_explore().await
        .map_err(|e| format!("[yt_get_explore] {e}"))?;
    serde_json::to_string(&result)
        .map_err(|e| format!("[yt_get_explore] serialization: {e}"))
}

#[tauri::command]
pub async fn yt_get_mood_categories(
    state: State<'_, Arc<Mutex<YtMusicState>>>,
) -> Result<String, String> {
    println!("[yt_get_mood_categories]");
    let state = state.lock().await;
    let result = state.client.get_mood_categories().await
        .map_err(|e| format!("[yt_get_mood_categories] {e}"))?;
    serde_json::to_string(&result)
        .map_err(|e| format!("[yt_get_mood_categories] serialization: {e}"))
}

// ---------------------------------------------------------------------------
// Library
// ---------------------------------------------------------------------------

#[tauri::command]
pub async fn yt_get_library_playlists(
    state: State<'_, Arc<Mutex<YtMusicState>>>,
) -> Result<String, String> {
    println!("[yt_get_library_playlists]");
    let state = state.lock().await;
    let result = state.client.get_library_playlists().await
        .map_err(|e| format!("[yt_get_library_playlists] {e}"))?;
    serde_json::to_string(&result)
        .map_err(|e| format!("[yt_get_library_playlists] serialization: {e}"))
}

#[tauri::command]
pub async fn yt_get_library_songs(
    state: State<'_, Arc<Mutex<YtMusicState>>>,
) -> Result<String, String> {
    println!("[yt_get_library_songs]");
    let state = state.lock().await;
    let result = state.client.get_library_songs().await
        .map_err(|e| format!("[yt_get_library_songs] {e}"))?;
    serde_json::to_string(&result)
        .map_err(|e| format!("[yt_get_library_songs] serialization: {e}"))
}

// ---------------------------------------------------------------------------
// Playlist
// ---------------------------------------------------------------------------

#[tauri::command]
pub async fn yt_get_playlist(
    playlist_id: String,
    state: State<'_, Arc<Mutex<YtMusicState>>>,
) -> Result<String, String> {
    println!("[yt_get_playlist] playlist_id={playlist_id}");
    let state = state.lock().await;
    let result = state.client.get_playlist(&playlist_id).await
        .map_err(|e| format!("[yt_get_playlist] {e}"))?;
    serde_json::to_string(&result)
        .map_err(|e| format!("[yt_get_playlist] serialization: {e}"))
}

// ---------------------------------------------------------------------------
// Watch / Player
// ---------------------------------------------------------------------------

#[tauri::command]
pub async fn yt_get_watch_playlist(
    video_id: String,
    state: State<'_, Arc<Mutex<YtMusicState>>>,
) -> Result<String, String> {
    println!("[yt_get_watch_playlist] video_id={video_id}");
    let state = state.lock().await;
    let result = state.client.get_watch_playlist(&video_id).await
        .map_err(|e| format!("[yt_get_watch_playlist] {e}"))?;
    serde_json::to_string(&result)
        .map_err(|e| format!("[yt_get_watch_playlist] serialization: {e}"))
}

#[tauri::command]
pub async fn yt_get_lyrics(
    browse_id: String,
    state: State<'_, Arc<Mutex<YtMusicState>>>,
) -> Result<String, String> {
    println!("[yt_get_lyrics] browse_id={browse_id}");
    let state = state.lock().await;
    let result = state.client.get_lyrics(&browse_id).await
        .map_err(|e| format!("[yt_get_lyrics] {e}"))?;
    serde_json::to_string(&result)
        .map_err(|e| format!("[yt_get_lyrics] serialization: {e}"))
}

// ---------------------------------------------------------------------------
// Browser cookie auth commands
// ---------------------------------------------------------------------------

/// Detect which installed browsers have YouTube cookies.
#[tauri::command]
pub async fn yt_detect_browsers() -> Result<Vec<BrowserInfo>, String> {
    println!("[yt_detect_browsers] Scanning installed browsers for YouTube cookies...");

    let browsers = ["edge", "chrome", "firefox", "brave", "chromium", "opera", "vivaldi"];
    let mut results = Vec::new();

    for browser in browsers {
        let (has_cookies, cookie_count) = match extract_cookies_from_browser(browser) {
            Ok(Some(cookie_str)) => {
                let count = cookie_str.matches(';').count() + 1;
                (true, count)
            }
            Ok(None) => (false, 0),
            Err(_) => (false, 0),
        };

        let display_name = match browser {
            "edge" => "Microsoft Edge",
            "chrome" => "Google Chrome",
            "firefox" => "Mozilla Firefox",
            "brave" => "Brave",
            "chromium" => "Chromium",
            "opera" => "Opera",
            "vivaldi" => "Vivaldi",
            _ => browser,
        };

        if has_cookies {
            println!(
                "[yt_detect_browsers] {display_name}: {} cookies found",
                cookie_count
            );
            results.push(BrowserInfo {
                name: browser.to_string(),
                has_cookies,
                cookie_count,
            });
        } else {
            println!("[yt_detect_browsers] {display_name}: no cookies or not installed");
        }
    }

    println!(
        "[yt_detect_browsers] Found {} browsers with YouTube cookies",
        results.len()
    );
    Ok(results)
}

/// Authenticate YouTube Music using cookies extracted from a browser.
/// `browser` can be "chrome", "firefox", "edge", "brave", or "auto" to try all.
#[tauri::command]
pub async fn yt_auth_from_browser(
    browser: String,
    app: AppHandle,
    state: State<'_, Arc<Mutex<YtMusicState>>>,
) -> Result<AuthStatusResponse, String> {
    println!("[yt_auth_from_browser] browser={browser}");

    // 1. Extract cookies
    let (used_browser, cookie_string) = if browser == "auto" {
        extract_cookies_auto()?
    } else {
        let cookies = extract_cookies_from_browser(&browser)?
            .ok_or_else(|| format!("[yt_auth_from_browser] No YouTube cookies found in {browser}"))?;
        (browser.clone(), cookies)
    };

    println!(
        "[yt_auth_from_browser] Using cookies from {used_browser} ({} chars)",
        cookie_string.len()
    );

    // 2. Create YtMusicState with cookies (sync — no .await)
    let new_state = YtMusicState::new_from_cookies(cookie_string.clone())?;

    // 3. Save cookies to disk for persistence
    let app_data_dir = app
        .path()
        .app_data_dir()
        .map_err(|e| format!("[yt_auth_from_browser] Failed to resolve app data dir: {e}"))?;
    YtMusicState::save_cookies(&app_data_dir, &cookie_string)?;

    // 4. Replace state
    let mut state_guard = state.lock().await;
    *state_guard = new_state;
    println!("[yt_auth_from_browser] Cookie-auth client is now active (from {used_browser}).");

    Ok(AuthStatusResponse {
        authenticated: true,
        method: "cookie".to_string(),
    })
}

/// Check whether the client is authenticated and which method is active.
#[tauri::command]
pub async fn yt_auth_status(
    state: State<'_, Arc<Mutex<YtMusicState>>>,
) -> Result<AuthStatusResponse, String> {
    let state = state.lock().await;
    let authenticated = state.is_authenticated();
    let method = state.auth_method().to_string();
    println!("[yt_auth_status] authenticated={authenticated}, method={method}");
    Ok(AuthStatusResponse {
        authenticated,
        method,
    })
}

/// Delete saved cookies and revert to unauthenticated client.
#[tauri::command]
pub async fn yt_auth_logout(
    app: AppHandle,
    state: State<'_, Arc<Mutex<YtMusicState>>>,
) -> Result<AuthStatusResponse, String> {
    println!("[yt_auth_logout] Logging out...");

    let app_data_dir = app
        .path()
        .app_data_dir()
        .map_err(|e| format!("[yt_auth_logout] Failed to resolve app data dir: {e}"))?;

    // Delete saved cookie file
    YtMusicState::delete_cookies(&app_data_dir)?;

    // Recreate unauthenticated state (sync — no .await)
    println!("[yt_auth_logout] Recreating unauthenticated client...");
    let new_state = YtMusicState::new_unauthenticated()?;

    let mut state_guard = state.lock().await;
    *state_guard = new_state;
    println!("[yt_auth_logout] Reverted to unauthenticated client.");

    Ok(AuthStatusResponse {
        authenticated: false,
        method: "none".to_string(),
    })
}
