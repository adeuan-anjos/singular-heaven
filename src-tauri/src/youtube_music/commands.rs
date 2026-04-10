use std::collections::HashSet;
use std::sync::Arc;

use serde::{Deserialize, Serialize};
use tauri::{AppHandle, Emitter, Manager, State};
use tokio::sync::Mutex;
use ytmusic_api::types::common::LikeStatus;

use super::client::YtMusicState;
use crate::playback_queue::{PlaybackQueue, QueueCommandResponse, QueueSnapshot, QueueWindowResponse};
use crate::playlist_cache::{self, CachedCollectionMeta, CachedPlaylistMeta, CachedTrack, PlaylistCache};

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

#[derive(Deserialize)]
#[serde(rename_all = "SCREAMING_SNAKE_CASE")]
pub enum TrackLikeStatusInput {
    Like,
    Dislike,
    Indifferent,
}

impl From<TrackLikeStatusInput> for LikeStatus {
    fn from(value: TrackLikeStatusInput) -> Self {
        match value {
            TrackLikeStatusInput::Like => LikeStatus::Like,
            TrackLikeStatusInput::Dislike => LikeStatus::Dislike,
            TrackLikeStatusInput::Indifferent => LikeStatus::Indifferent,
        }
    }
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct TrackLikeStatusResponse {
    pub video_id: String,
    pub like_status: LikeStatus,
}

#[derive(Deserialize)]
#[serde(rename_all = "SCREAMING_SNAKE_CASE")]
pub enum PlaylistLikeStatusInput {
    Like,
    Dislike,
    Indifferent,
}

impl From<PlaylistLikeStatusInput> for LikeStatus {
    fn from(value: PlaylistLikeStatusInput) -> Self {
        match value {
            PlaylistLikeStatusInput::Like => LikeStatus::Like,
            PlaylistLikeStatusInput::Dislike => LikeStatus::Dislike,
            PlaylistLikeStatusInput::Indifferent => LikeStatus::Indifferent,
        }
    }
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PlaylistLikeStatusResponse {
    pub playlist_id: String,
    pub like_status: LikeStatus,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CreatePlaylistInput {
    pub title: String,
    pub description: Option<String>,
    pub privacy_status: Option<String>,
    pub video_ids: Option<Vec<String>>,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct EditPlaylistInput {
    pub playlist_id: String,
    pub title: Option<String>,
    pub description: Option<String>,
    pub privacy_status: Option<String>,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SetPlaylistThumbnailInput {
    pub playlist_id: String,
    pub image_bytes: Vec<u8>,
    pub mime_type: String,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PlaylistItemRemoveInput {
    pub video_id: String,
    pub set_video_id: String,
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
pub async fn yt_get_sidebar_playlists(
    state: State<'_, Arc<Mutex<YtMusicState>>>,
) -> Result<String, String> {
    println!("[yt_get_sidebar_playlists]");
    let state = state.lock().await;
    let result = state
        .client
        .get_sidebar_playlists()
        .await
        .map_err(|e| format!("[yt_get_sidebar_playlists] {e}"))?;
    serde_json::to_string(&result)
        .map_err(|e| format!("[yt_get_sidebar_playlists] serialization: {e}"))
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

#[tauri::command]
pub async fn yt_get_liked_track_ids(
    state: State<'_, Arc<Mutex<YtMusicState>>>,
) -> Result<Vec<String>, String> {
    println!("[yt_get_liked_track_ids]");
    let state = state.lock().await;
    state
        .client
        .get_liked_track_ids()
        .await
        .map_err(|e| format!("[yt_get_liked_track_ids] {e}"))
}

#[tauri::command]
pub async fn yt_rate_song(
    video_id: String,
    rating: TrackLikeStatusInput,
    state: State<'_, Arc<Mutex<YtMusicState>>>,
) -> Result<TrackLikeStatusResponse, String> {
    let like_status: LikeStatus = rating.into();
    println!(
        "[yt_rate_song] video_id={} like_status={:?}",
        video_id, like_status
    );
    let state = state.lock().await;
    state
        .client
        .rate_song(&video_id, like_status.clone())
        .await
        .map_err(|e| format!("[yt_rate_song] {e}"))?;
    Ok(TrackLikeStatusResponse {
        video_id,
        like_status,
    })
}

#[tauri::command]
pub async fn yt_rate_playlist(
    playlist_id: String,
    rating: PlaylistLikeStatusInput,
    state: State<'_, Arc<Mutex<YtMusicState>>>,
) -> Result<PlaylistLikeStatusResponse, String> {
    let like_status: LikeStatus = rating.into();
    println!(
        "[yt_rate_playlist] playlist_id={} like_status={:?}",
        playlist_id, like_status
    );
    let state = state.lock().await;
    state
        .client
        .rate_playlist(&playlist_id, like_status.clone())
        .await
        .map_err(|e| format!("[yt_rate_playlist] {e}"))?;
    Ok(PlaylistLikeStatusResponse {
        playlist_id,
        like_status,
    })
}

// ---------------------------------------------------------------------------
// Playlist
// ---------------------------------------------------------------------------

fn resolve_remote_playlist_id(playlist_id: &str) -> &str {
    if playlist_id == "liked" {
        "LM"
    } else {
        playlist_id
    }
}

#[tauri::command]
pub async fn yt_get_playlist(
    playlist_id: String,
    state: State<'_, Arc<Mutex<YtMusicState>>>,
) -> Result<String, String> {
    let remote_playlist_id = resolve_remote_playlist_id(&playlist_id).to_string();
    println!(
        "[yt_get_playlist] playlist_id={} remote_playlist_id={}",
        playlist_id, remote_playlist_id
    );
    let state = state.lock().await;
    let (playlist, continuation) = state.client.get_playlist(&remote_playlist_id).await
        .map_err(|e| format!("[yt_get_playlist] {e}"))?;
    let response = serde_json::json!({
        "playlist": serde_json::to_value(&playlist).unwrap_or_default(),
        "continuation": continuation,
    });
    serde_json::to_string(&response)
        .map_err(|e| format!("[yt_get_playlist] serialization: {e}"))
}

#[tauri::command]
pub async fn yt_get_playlist_continuation(
    continuation_token: String,
    state: State<'_, Arc<Mutex<YtMusicState>>>,
) -> Result<String, String> {
    println!("[yt_get_playlist_continuation]");
    let state = state.lock().await;
    let (tracks, next_token) = state.client.get_playlist_continuation(&continuation_token).await
        .map_err(|e| format!("[yt_get_playlist_continuation] {e}"))?;
    let response = serde_json::json!({
        "tracks": serde_json::to_value(&tracks).unwrap_or_default(),
        "continuation": next_token,
    });
    serde_json::to_string(&response)
        .map_err(|e| format!("[yt_get_playlist_continuation] serialization: {e}"))
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
// Streaming
// ---------------------------------------------------------------------------

#[tauri::command]
pub async fn yt_get_stream_url(
    video_id: String,
    state: State<'_, Arc<Mutex<YtMusicState>>>,
) -> Result<String, String> {
    println!("[yt_get_stream_url] Fetching stream URL for {video_id}");
    let state = state.lock().await;
    let stream_data = state.client.get_stream_url(&video_id).await
        .map_err(|e| format!("[yt_get_stream_url] {e}"))?;
    println!("[yt_get_stream_url] Got URL, mime: {}, bitrate: {}", stream_data.mime_type, stream_data.bitrate);
    serde_json::to_string(&stream_data)
        .map_err(|e| format!("[yt_get_stream_url] serialization: {e}"))
}

// ---------------------------------------------------------------------------
// Account switching (brand accounts)
// ---------------------------------------------------------------------------

#[tauri::command]
pub async fn yt_get_accounts(
    state: State<'_, Arc<Mutex<YtMusicState>>>,
) -> Result<String, String> {
    println!("[yt_get_accounts]");
    let state = state.lock().await;
    let result = state.client.get_accounts().await
        .map_err(|e| format!("[yt_get_accounts] {e}"))?;
    serde_json::to_string(&result)
        .map_err(|e| format!("[yt_get_accounts] serialization: {e}"))
}

#[tauri::command]
pub async fn yt_switch_account(
    page_id: Option<String>,
    app: AppHandle,
    state: State<'_, Arc<Mutex<YtMusicState>>>,
) -> Result<String, String> {
    println!("[yt_switch_account] page_id={page_id:?}");
    let mut state = state.lock().await;
    state.client.set_on_behalf_of_user(page_id.clone());

    // Persist pageId to disk
    if let Ok(dir) = app.path().app_data_dir() {
        if let Some(ref pid) = page_id {
            let _ = YtMusicState::save_page_id(&dir, pid);
        } else {
            YtMusicState::delete_page_id(&dir);
        }
    }

    // Return updated account info
    let result = state.client.get_accounts().await
        .map_err(|e| format!("[yt_switch_account] {e}"))?;
    serde_json::to_string(&result)
        .map_err(|e| format!("[yt_switch_account] serialization: {e}"))
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

    // Delete saved cookie file and page_id
    YtMusicState::delete_cookies(&app_data_dir)?;
    YtMusicState::delete_page_id(&app_data_dir);

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

// ---------------------------------------------------------------------------
// Playlist Cache commands
// ---------------------------------------------------------------------------

/// Event payload emitted when background fetch adds tracks to the cache.
#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct PlaylistTracksUpdated {
    playlist_id: String,
    new_track_ids: Vec<String>,
    total_tracks: usize,
    is_complete: bool,
}

fn build_cached_playlist_response(
    meta: &CachedPlaylistMeta,
    tracks: Vec<playlist_cache::CachedTrack>,
    track_ids: Vec<String>,
) -> Result<String, String> {
    let thumbnails = meta
        .thumbnail_url
        .as_ref()
        .map(|url| {
            vec![serde_json::json!({
                "url": url,
                "width": 226,
                "height": 226,
            })]
        })
        .unwrap_or_default();

    let response = serde_json::json!({
        "playlistId": meta.playlist_id,
        "title": meta.title,
        "author": meta.author_name.as_ref().map(|name| serde_json::json!({
            "name": name,
            "id": meta.author_id,
        })),
        "description": meta.description,
        "privacyStatus": meta.privacy_status,
        "trackCount": meta.track_count,
        "thumbnails": thumbnails,
        "isOwnedByUser": meta.is_owned_by_user,
        "isEditable": meta.is_editable,
        "isSpecial": meta.is_special,
        "tracks": tracks,
        "trackIds": track_ids,
        "isComplete": meta.is_complete,
    });

    serde_json::to_string(&response)
        .map_err(|e| format!("[yt_load_playlist] cached serialization: {e}"))
}

async fn ensure_playlist_track_ids_complete(
    playlist_id: &str,
    state: &Arc<Mutex<YtMusicState>>,
    cache: &Arc<tokio::sync::Mutex<PlaylistCache>>,
) -> Result<(Vec<String>, bool), String> {
    {
        let db = cache.lock().await;
        let track_ids = db
            .get_track_ids(playlist_id)
            .map_err(|e| format!("[yt_get_playlist_track_ids_complete] get_track_ids: {e}"))?;
        let is_complete = db
            .is_complete(playlist_id)
            .map_err(|e| format!("[yt_get_playlist_track_ids_complete] is_complete: {e}"))?;
        if is_complete {
            println!(
                "[yt_get_playlist_track_ids_complete] cache-hit playlist_id={} count={}",
                playlist_id,
                track_ids.len()
            );
            return Ok((track_ids, true));
        }
        println!(
            "[yt_get_playlist_track_ids_complete] cache-partial playlist_id={} cached_count={}",
            playlist_id,
            track_ids.len()
        );
    }

    let remote_playlist_id = resolve_remote_playlist_id(playlist_id).to_string();
    println!(
        "[yt_get_playlist_track_ids_complete] fetching full playlist playlist_id={} remote_playlist_id={}",
        playlist_id, remote_playlist_id
    );

    let (page, mut continuation) = {
        let st = state.lock().await;
        st.client
            .get_playlist(&remote_playlist_id)
            .await
            .map_err(|e| format!("[yt_get_playlist_track_ids_complete] API error: {e}"))?
    };

    let mut all_track_ids: Vec<String> = page.tracks.iter().map(|t| t.video_id.clone()).collect();
    let track_rows = playlist_cache::playlist_tracks_to_rows(&page.tracks);

    {
        let db = cache.lock().await;
        db.clear_playlist_tracks(playlist_id)
            .map_err(|e| format!("[yt_get_playlist_track_ids_complete] clear_playlist_tracks: {e}"))?;
        db.save_meta(
            playlist_id,
            &page.title,
            page.author.as_ref().map(|a| a.name.as_str()),
            page.author.as_ref().and_then(|a| a.id.as_deref()),
            page.description.as_deref(),
            page.privacy_status.as_deref(),
            page.track_count.as_deref(),
            page.thumbnails.first().map(|t| t.url.as_str()),
            page.is_owned_by_user,
            page.is_editable,
            page.is_special,
        )
        .map_err(|e| format!("[yt_get_playlist_track_ids_complete] save_meta: {e}"))?;
        db.save_tracks(playlist_id, 0, &track_rows)
            .map_err(|e| format!("[yt_get_playlist_track_ids_complete] save_tracks: {e}"))?;
        db.save_collection_meta(
            "playlist",
            playlist_id,
            &page.title,
            page.author.as_ref().map(|a| a.name.as_str()),
            page.thumbnails.first().map(|t| t.url.as_str()),
            continuation.is_none(),
        )
        .map_err(|e| format!("[yt_get_playlist_track_ids_complete] save_collection_meta: {e}"))?;
        db.save_collection_tracks("playlist", playlist_id, 0, &track_rows)
            .map_err(|e| format!("[yt_get_playlist_track_ids_complete] save_collection_tracks: {e}"))?;
        if continuation.is_none() {
            db.mark_complete(playlist_id)
                .map_err(|e| format!("[yt_get_playlist_track_ids_complete] mark_complete: {e}"))?;
        }
    }

    let mut offset = page.tracks.len();

    while let Some(token) = continuation {
        let (tracks, next_token) = {
            let st = state.lock().await;
            st.client
                .get_playlist_continuation(&token)
                .await
                .map_err(|e| format!("[yt_get_playlist_track_ids_complete] continuation: {e}"))?
        };

        println!(
            "[yt_get_playlist_track_ids_complete] continuation playlist_id={} offset={} received={} has_more={}",
            playlist_id,
            offset,
            tracks.len(),
            next_token.is_some()
        );

        let ids: Vec<String> = tracks.iter().map(|t| t.video_id.clone()).collect();
        let rows = playlist_cache::playlist_tracks_to_rows(&tracks);

        {
            let db = cache.lock().await;
            db.save_tracks(playlist_id, offset, &rows)
                .map_err(|e| format!("[yt_get_playlist_track_ids_complete] save_tracks: {e}"))?;
            db.save_collection_tracks("playlist", playlist_id, offset, &rows)
                .map_err(|e| format!("[yt_get_playlist_track_ids_complete] save_collection_tracks: {e}"))?;
            if next_token.is_none() {
                db.mark_complete(playlist_id)
                    .map_err(|e| format!("[yt_get_playlist_track_ids_complete] mark_complete: {e}"))?;
                db.save_collection_meta(
                    "playlist",
                    playlist_id,
                    &page.title,
                    page.author.as_ref().map(|a| a.name.as_str()),
                    page.thumbnails.first().map(|t| t.url.as_str()),
                    true,
                )
                .map_err(|e| format!("[yt_get_playlist_track_ids_complete] save_collection_meta: {e}"))?;
            }
        }

        all_track_ids.extend(ids);
        offset += tracks.len();
        continuation = next_token;
    }

    Ok((all_track_ids, true))
}

fn emit_queue_state_updated(app: &AppHandle, snapshot: &QueueSnapshot) {
    if let Err(error) = app.emit("queue-state-updated", snapshot) {
        eprintln!("[queue-state-updated] emit error: {error}");
    }
}

#[derive(Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CollectionSnapshotInput {
    pub collection_type: String,
    pub collection_id: String,
    pub title: String,
    pub subtitle: Option<String>,
    pub thumbnail_url: Option<String>,
    pub is_complete: bool,
    pub tracks: Vec<CachedTrack>,
}

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CollectionTrackIdsResponse {
    pub track_ids: Vec<String>,
    pub is_complete: bool,
}

fn persist_collection_snapshot(
    db: &PlaylistCache,
    snapshot: &CollectionSnapshotInput,
) -> Result<(), String> {
    let rows = playlist_cache::cached_tracks_to_rows(&snapshot.tracks);
    db.clear_collection_tracks(&snapshot.collection_type, &snapshot.collection_id)
        .map_err(|e| format!("[persist_collection_snapshot] clear_collection_tracks: {e}"))?;
    db.save_collection_meta(
        &snapshot.collection_type,
        &snapshot.collection_id,
        &snapshot.title,
        snapshot.subtitle.as_deref(),
        snapshot.thumbnail_url.as_deref(),
        snapshot.is_complete,
    )
    .map_err(|e| format!("[persist_collection_snapshot] save_collection_meta: {e}"))?;
    db.save_collection_tracks(
        &snapshot.collection_type,
        &snapshot.collection_id,
        0,
        &rows,
    )
    .map_err(|e| format!("[persist_collection_snapshot] save_collection_tracks: {e}"))?;
    Ok(())
}

/// Load a playlist: fetch first page from InnerTube, cache in SQLite,
/// return compact data to the frontend, and spawn a background task for
/// any remaining continuation pages.
#[tauri::command]
pub async fn yt_load_playlist(
    playlist_id: String,
    state: State<'_, Arc<Mutex<YtMusicState>>>,
    cache: State<'_, Arc<tokio::sync::Mutex<PlaylistCache>>>,
    playlist_loads: State<'_, Arc<tokio::sync::Mutex<HashSet<String>>>>,
    app: AppHandle,
) -> Result<String, String> {
    let remote_playlist_id = resolve_remote_playlist_id(&playlist_id).to_string();
    println!(
        "[yt_load_playlist] playlist_id={} remote_playlist_id={}",
        playlist_id, remote_playlist_id
    );

    let already_loading = {
        let loads = playlist_loads.lock().await;
        loads.contains(&playlist_id)
    };

    if already_loading {
        println!(
            "[yt_load_playlist] playlist_id={} already loading, reusing cached snapshot",
            playlist_id
        );
        let db = cache.lock().await;
        let meta = db
            .get_meta(&playlist_id)
            .map_err(|e| format!("[yt_load_playlist] get_meta: {e}"))?;
        let track_ids = db
            .get_track_ids(&playlist_id)
            .map_err(|e| format!("[yt_load_playlist] get_track_ids: {e}"))?;
        let tracks = db
            .get_tracks_for_playlist(&playlist_id)
            .map_err(|e| format!("[yt_load_playlist] get_tracks_for_playlist: {e}"))?;

        if let Some(meta) = meta {
            println!(
                "[yt_load_playlist] playlist_id={} returning cached snapshot with {} tracks",
                playlist_id,
                track_ids.len()
            );
            return build_cached_playlist_response(&meta, tracks, track_ids);
        }

        println!(
            "[yt_load_playlist] playlist_id={} marked in-flight but no cached snapshot yet; continuing with direct fetch",
            playlist_id
        );
    }

    // 1. Fetch first page from InnerTube
    let (page, continuation) = {
        let st = state.lock().await;
        st.client.get_playlist(&remote_playlist_id).await
            .map_err(|e| format!("[yt_load_playlist] API error: {e}"))?
    };

    println!(
        "[yt_load_playlist] Got page: title={} tracks={} continuation={}",
        page.title,
        page.tracks.len(),
        continuation.is_some()
    );

    // 2. Save to SQLite
    let track_rows = playlist_cache::playlist_tracks_to_rows(&page.tracks);
    let initial_track_ids: Vec<String> = page.tracks.iter().map(|t| t.video_id.clone()).collect();
    {
        let db = cache.lock().await;
        db.clear_playlist_tracks(&playlist_id)
            .map_err(|e| format!("[yt_load_playlist] clear_playlist_tracks: {e}"))?;
        db.save_meta(
            &playlist_id,
            &page.title,
            page.author.as_ref().map(|a| a.name.as_str()),
            page.author.as_ref().and_then(|a| a.id.as_deref()),
            page.description.as_deref(),
            page.privacy_status.as_deref(),
            page.track_count.as_deref(),
            page.thumbnails.first().map(|t| t.url.as_str()),
            page.is_owned_by_user,
            page.is_editable,
            page.is_special,
        )
        .map_err(|e| format!("[yt_load_playlist] save_meta: {e}"))?;

        db.save_tracks(&playlist_id, 0, &track_rows)
            .map_err(|e| format!("[yt_load_playlist] save_tracks: {e}"))?;
        db.save_collection_meta(
            "playlist",
            &playlist_id,
            &page.title,
            page.author.as_ref().map(|a| a.name.as_str()),
            page.thumbnails.first().map(|t| t.url.as_str()),
            continuation.is_none(),
        )
        .map_err(|e| format!("[yt_load_playlist] save_collection_meta: {e}"))?;
        db.save_collection_tracks("playlist", &playlist_id, 0, &track_rows)
            .map_err(|e| format!("[yt_load_playlist] save_collection_tracks: {e}"))?;

        if continuation.is_none() {
            db.mark_complete(&playlist_id)
                .map_err(|e| format!("[yt_load_playlist] mark_complete: {e}"))?;
        }
    }

    let is_complete = continuation.is_none();

    // 3. Spawn background fetch for remaining pages
    if let Some(cont_token) = continuation {
        let should_spawn = {
            let mut loads = playlist_loads.lock().await;
            if loads.insert(playlist_id.clone()) {
                println!(
                    "[yt_load_playlist] playlist_id={} registered as in-flight",
                    playlist_id
                );
                true
            } else {
                println!(
                    "[yt_load_playlist] playlist_id={} already registered in-flight after fetch; skipping duplicate spawn",
                    playlist_id
                );
                false
            }
        };

        if should_spawn {
        let state_arc = state.inner().clone();
        let cache_arc = cache.inner().clone();
        let loads_arc = playlist_loads.inner().clone();
        let queue_arc = app.state::<Arc<tokio::sync::Mutex<PlaybackQueue>>>().inner().clone();
        let pid = playlist_id.clone();
        let app_handle = app.clone();
        let mut offset = page.tracks.len();
        let collection_title = page.title.clone();
        let collection_subtitle = page.author.as_ref().map(|a| a.name.clone());
        let collection_thumbnail = page.thumbnails.first().map(|t| t.url.clone());

        tokio::spawn(async move {
            println!("[yt_load_playlist:bg] Starting background fetch for {pid}");
            let mut token = cont_token;

            loop {
                // Throttle between API calls
                tokio::time::sleep(std::time::Duration::from_millis(300)).await;

                println!("[yt_load_playlist:bg] Fetching continuation for {pid} offset={offset}");
                let fetch_result = {
                    let st = state_arc.lock().await;
                    st.client.get_playlist_continuation(&token).await
                };

                match fetch_result {
                    Ok((tracks, next_token)) => {
                        let rows = playlist_cache::playlist_tracks_to_rows(&tracks);
                        let new_ids: Vec<String> =
                            tracks.iter().map(|t| t.video_id.clone()).collect();
                        let track_count = tracks.len();

                        let complete = next_token.is_none();

                        // Save to SQLite
                        {
                            let db = cache_arc.lock().await;
                            if let Err(e) = db.save_tracks(&pid, offset, &rows) {
                                eprintln!("[yt_load_playlist:bg] save_tracks error: {e}");
                                break;
                            }
                            if let Err(e) = db.save_collection_tracks("playlist", &pid, offset, &rows) {
                                eprintln!("[yt_load_playlist:bg] save_collection_tracks error: {e}");
                                break;
                                }
                                if complete {
                                    if let Err(e) = db.mark_complete(&pid) {
                                        eprintln!("[yt_load_playlist:bg] mark_complete error: {e}");
                                    }
                                if let Err(e) = db.save_collection_meta(
                                    "playlist",
                                    &pid,
                                    &collection_title,
                                    collection_subtitle.as_deref(),
                                    collection_thumbnail.as_deref(),
                                    true,
                                ) {
                                    eprintln!("[yt_load_playlist:bg] save_collection_meta error: {e}");
                                }
                            }
                        }

                        offset += track_count;

                        // Emit event to frontend
                        let payload = PlaylistTracksUpdated {
                            playlist_id: pid.clone(),
                            new_track_ids: new_ids,
                            total_tracks: offset,
                            is_complete: complete,
                        };
                        if let Err(e) = app_handle.emit("playlist-tracks-updated", &payload) {
                            eprintln!("[yt_load_playlist:bg] emit error: {e}");
                        }

                        let snapshot = {
                            let mut queue = queue_arc.lock().await;
                            if queue.append_playlist_batch(&pid, &payload.new_track_ids, complete) {
                                Some(queue.snapshot())
                            } else {
                                None
                            }
                        };

                        if let Some(snapshot) = snapshot {
                            emit_queue_state_updated(&app_handle, &snapshot);
                        }

                        println!(
                            "[yt_load_playlist:bg] Saved {} tracks, total={offset}, complete={complete}",
                            track_count
                        );

                        if complete {
                            break;
                        }
                        token = next_token.unwrap();
                    }
                    Err(e) => {
                        eprintln!("[yt_load_playlist:bg] continuation error: {e}");
                        break;
                    }
                }
            }

            {
                let mut loads = loads_arc.lock().await;
                let removed = loads.remove(&pid);
                println!(
                    "[yt_load_playlist:bg] playlist_id={} cleared from in-flight registry removed={}",
                    pid, removed
                );
            }
            println!("[yt_load_playlist:bg] Background fetch done for {pid}");
        });
        }
    }

    // 4. Build response
    let cached_tracks = playlist_cache::playlist_tracks_to_cached(&page.tracks);
    let response = serde_json::json!({
        "playlistId": playlist_id,
        "title": page.title,
        "author": page.author,
        "description": page.description,
        "privacyStatus": page.privacy_status,
        "trackCount": page.track_count,
        "thumbnails": page.thumbnails,
        "isOwnedByUser": page.is_owned_by_user,
        "isEditable": page.is_editable,
        "isSpecial": page.is_special,
        "tracks": cached_tracks,
        "trackIds": initial_track_ids,
        "isComplete": is_complete,
    });

    println!(
        "[yt_load_playlist] Returning {} tracks, isComplete={is_complete}",
        cached_tracks.len()
    );

    serde_json::to_string(&response)
        .map_err(|e| format!("[yt_load_playlist] serialization: {e}"))
}

/// Resolve tracks by video IDs from the SQLite cache.
#[tauri::command]
pub async fn yt_get_cached_tracks(
    video_ids: Vec<String>,
    cache: State<'_, Arc<tokio::sync::Mutex<PlaylistCache>>>,
) -> Result<String, String> {
    println!(
        "[yt_get_cached_tracks] Resolving {} video IDs",
        video_ids.len()
    );

    let db = cache.lock().await;
    let tracks = db
        .get_tracks_by_ids(&video_ids)
        .map_err(|e| format!("[yt_get_cached_tracks] {e}"))?;

    println!(
        "[yt_get_cached_tracks] Found {} tracks out of {} requested",
        tracks.len(),
        video_ids.len()
    );

    serde_json::to_string(&tracks)
        .map_err(|e| format!("[yt_get_cached_tracks] serialization: {e}"))
}

/// Get all cached video IDs for a playlist, with completion status.
#[tauri::command]
pub async fn yt_get_playlist_track_ids(
    playlist_id: String,
    cache: State<'_, Arc<tokio::sync::Mutex<PlaylistCache>>>,
) -> Result<String, String> {
    println!("[yt_get_playlist_track_ids] playlist_id={playlist_id}");

    let db = cache.lock().await;
    let track_ids = db
        .get_track_ids(&playlist_id)
        .map_err(|e| format!("[yt_get_playlist_track_ids] get_track_ids: {e}"))?;
    let is_complete = db
        .is_complete(&playlist_id)
        .map_err(|e| format!("[yt_get_playlist_track_ids] is_complete: {e}"))?;

    println!(
        "[yt_get_playlist_track_ids] Found {} track IDs, isComplete={is_complete}",
        track_ids.len()
    );

    let response = serde_json::json!({
        "trackIds": track_ids,
        "isComplete": is_complete,
    });

    serde_json::to_string(&response)
        .map_err(|e| format!("[yt_get_playlist_track_ids] serialization: {e}"))
}

#[tauri::command]
pub async fn yt_get_playlist_track_ids_complete(
    playlist_id: String,
    state: State<'_, Arc<Mutex<YtMusicState>>>,
    cache: State<'_, Arc<tokio::sync::Mutex<PlaylistCache>>>,
) -> Result<String, String> {
    println!("[yt_get_playlist_track_ids_complete] playlist_id={playlist_id}");

    let (track_ids, is_complete) =
        ensure_playlist_track_ids_complete(&playlist_id, state.inner(), cache.inner()).await?;

    println!(
        "[yt_get_playlist_track_ids_complete] Found {} track IDs, isComplete={is_complete}",
        track_ids.len()
    );

    let response = serde_json::json!({
        "trackIds": track_ids,
        "isComplete": is_complete,
    });

    serde_json::to_string(&response)
        .map_err(|e| format!("[yt_get_playlist_track_ids_complete] serialization: {e}"))
}

/// Get a paginated window of cached playlist tracks, ordered by playlist position.
#[tauri::command]
pub async fn yt_get_playlist_window(
    playlist_id: String,
    offset: usize,
    limit: usize,
    cache: State<'_, Arc<tokio::sync::Mutex<PlaylistCache>>>,
) -> Result<String, String> {
    println!(
        "[yt_get_playlist_window] playlist_id={} offset={} limit={}",
        playlist_id, offset, limit
    );

    let db = cache.lock().await;
    let items = db
        .get_playlist_window(&playlist_id, offset, limit)
        .map_err(|e| format!("[yt_get_playlist_window] get_playlist_window: {e}"))?;
    let total_loaded = db
        .track_count(&playlist_id)
        .map_err(|e| format!("[yt_get_playlist_window] track_count: {e}"))?;
    let is_complete = db
        .is_complete(&playlist_id)
        .map_err(|e| format!("[yt_get_playlist_window] is_complete: {e}"))?;

    let first = items.first().map(|item| {
        serde_json::json!({
            "position": item.position,
            "videoId": item.track.video_id,
        })
    });
    let last = items.last().map(|item| {
        serde_json::json!({
            "position": item.position,
            "videoId": item.track.video_id,
        })
    });

    println!(
        "[yt_get_playlist_window] returned={} totalLoaded={} isComplete={} first={} last={}",
        items.len(),
        total_loaded,
        is_complete,
        first.unwrap_or_default(),
        last.unwrap_or_default()
    );

    let response = serde_json::json!({
        "items": items,
        "offset": offset,
        "limit": limit,
        "totalLoaded": total_loaded,
        "isComplete": is_complete,
    });

    serde_json::to_string(&response)
        .map_err(|e| format!("[yt_get_playlist_window] serialization: {e}"))
}

#[tauri::command]
pub async fn yt_cache_collection_snapshot(
    snapshot: CollectionSnapshotInput,
    cache: State<'_, Arc<tokio::sync::Mutex<PlaylistCache>>>,
) -> Result<CachedCollectionMeta, String> {
    println!(
        "[yt_cache_collection_snapshot] type={} id={} tracks={}",
        snapshot.collection_type,
        snapshot.collection_id,
        snapshot.tracks.len()
    );
    let db = cache.lock().await;
    persist_collection_snapshot(&db, &snapshot)?;
    Ok(CachedCollectionMeta {
        collection_type: snapshot.collection_type,
        collection_id: snapshot.collection_id,
        title: snapshot.title,
        subtitle: snapshot.subtitle,
        thumbnail_url: snapshot.thumbnail_url,
        is_complete: snapshot.is_complete,
    })
}

#[tauri::command]
pub async fn yt_get_collection_track_ids(
    collection_type: String,
    collection_id: String,
    cache: State<'_, Arc<tokio::sync::Mutex<PlaylistCache>>>,
) -> Result<CollectionTrackIdsResponse, String> {
    println!(
        "[yt_get_collection_track_ids] type={} id={}",
        collection_type, collection_id
    );
    let db = cache.lock().await;
    let track_ids = db
        .get_collection_track_ids(&collection_type, &collection_id)
        .map_err(|e| format!("[yt_get_collection_track_ids] get_collection_track_ids: {e}"))?;
    let is_complete = db
        .is_collection_complete(&collection_type, &collection_id)
        .map_err(|e| format!("[yt_get_collection_track_ids] is_collection_complete: {e}"))?;
    Ok(CollectionTrackIdsResponse {
        track_ids,
        is_complete,
    })
}

#[tauri::command]
pub async fn yt_create_playlist(
    input: CreatePlaylistInput,
    state: State<'_, Arc<Mutex<YtMusicState>>>,
) -> Result<String, String> {
    println!(
        "[yt_create_playlist] title=\"{}\" privacy={:?} video_ids={}",
        input.title,
        input.privacy_status,
        input.video_ids.as_ref().map(|ids| ids.len()).unwrap_or(0)
    );
    let state = state.lock().await;
    let response = state
        .client
        .create_playlist(
            &input.title,
            input.description.as_deref().unwrap_or(""),
            input.privacy_status.as_deref().unwrap_or("PRIVATE"),
            input.video_ids.as_deref().unwrap_or(&[]),
        )
        .await
        .map_err(|e| format!("[yt_create_playlist] {e}"))?;
    serde_json::to_string(&response)
        .map_err(|e| format!("[yt_create_playlist] serialization: {e}"))
}

#[tauri::command]
pub async fn yt_delete_playlist(
    playlist_id: String,
    state: State<'_, Arc<Mutex<YtMusicState>>>,
) -> Result<String, String> {
    println!("[yt_delete_playlist] playlist_id={}", playlist_id);
    let state = state.lock().await;
    let response = state
        .client
        .delete_playlist(&playlist_id)
        .await
        .map_err(|e| format!("[yt_delete_playlist] {e}"))?;
    serde_json::to_string(&response)
        .map_err(|e| format!("[yt_delete_playlist] serialization: {e}"))
}

#[tauri::command]
pub async fn yt_edit_playlist(
    input: EditPlaylistInput,
    state: State<'_, Arc<Mutex<YtMusicState>>>,
    cache: State<'_, Arc<tokio::sync::Mutex<PlaylistCache>>>,
) -> Result<String, String> {
    println!(
        "[yt_edit_playlist] playlist_id={} title={} description={} privacy={:?}",
        input.playlist_id,
        input.title.is_some(),
        input.description.is_some(),
        input.privacy_status
    );

    let updated_page = {
        let state = state.lock().await;
        state
            .client
            .edit_playlist(
                &input.playlist_id,
                input.title.as_deref(),
                input.description.as_deref(),
                input.privacy_status.as_deref(),
            )
            .await
            .map_err(|e| format!("[yt_edit_playlist] edit: {e}"))?;

        state
            .client
            .get_playlist(&input.playlist_id)
            .await
            .map_err(|e| format!("[yt_edit_playlist] refresh: {e}"))?
            .0
    };

    {
        let db = cache.lock().await;
        let existing_track_ids = db
            .get_track_ids(&input.playlist_id)
            .map_err(|e| format!("[yt_edit_playlist] get_track_ids: {e}"))?;
        let existing_complete = db
            .is_complete(&input.playlist_id)
            .map_err(|e| format!("[yt_edit_playlist] is_complete: {e}"))?;

        db.save_meta(
            &input.playlist_id,
            &updated_page.title,
            updated_page.author.as_ref().map(|a| a.name.as_str()),
            updated_page.author.as_ref().and_then(|a| a.id.as_deref()),
            updated_page.description.as_deref(),
            updated_page.privacy_status.as_deref(),
            updated_page.track_count.as_deref(),
            updated_page.thumbnails.first().map(|t| t.url.as_str()),
            updated_page.is_owned_by_user,
            updated_page.is_editable,
            updated_page.is_special,
        )
        .map_err(|e| format!("[yt_edit_playlist] save_meta: {e}"))?;

        if existing_complete && !existing_track_ids.is_empty() {
            db.mark_complete(&input.playlist_id)
                .map_err(|e| format!("[yt_edit_playlist] mark_complete: {e}"))?;
        }
    }

    serde_json::to_string(&serde_json::json!({
        "playlistId": input.playlist_id,
        "title": updated_page.title,
        "description": updated_page.description,
        "privacyStatus": updated_page.privacy_status,
    }))
    .map_err(|e| format!("[yt_edit_playlist] serialization: {e}"))
}

#[tauri::command]
pub async fn yt_set_playlist_thumbnail(
    input: SetPlaylistThumbnailInput,
    state: State<'_, Arc<Mutex<YtMusicState>>>,
    cache: State<'_, Arc<tokio::sync::Mutex<PlaylistCache>>>,
) -> Result<String, String> {
    println!(
        "[yt_set_playlist_thumbnail] playlist_id={} bytes={} mime={}",
        input.playlist_id,
        input.image_bytes.len(),
        input.mime_type
    );

    let updated_page = {
        let state = state.lock().await;
        state
            .client
            .set_playlist_thumbnail(&input.playlist_id, &input.image_bytes, &input.mime_type)
            .await
            .map_err(|e| format!("[yt_set_playlist_thumbnail] apply: {e}"))?;

        state
            .client
            .get_playlist(&input.playlist_id)
            .await
            .map_err(|e| format!("[yt_set_playlist_thumbnail] refresh: {e}"))?
            .0
    };

    {
        let db = cache.lock().await;
        let existing_track_ids = db
            .get_track_ids(&input.playlist_id)
            .map_err(|e| format!("[yt_set_playlist_thumbnail] get_track_ids: {e}"))?;
        let existing_complete = db
            .is_complete(&input.playlist_id)
            .map_err(|e| format!("[yt_set_playlist_thumbnail] is_complete: {e}"))?;

        db.save_meta(
            &input.playlist_id,
            &updated_page.title,
            updated_page.author.as_ref().map(|a| a.name.as_str()),
            updated_page.author.as_ref().and_then(|a| a.id.as_deref()),
            updated_page.description.as_deref(),
            updated_page.privacy_status.as_deref(),
            updated_page.track_count.as_deref(),
            updated_page.thumbnails.first().map(|t| t.url.as_str()),
            updated_page.is_owned_by_user,
            updated_page.is_editable,
            updated_page.is_special,
        )
        .map_err(|e| format!("[yt_set_playlist_thumbnail] save_meta: {e}"))?;

        if existing_complete && !existing_track_ids.is_empty() {
            db.mark_complete(&input.playlist_id)
                .map_err(|e| format!("[yt_set_playlist_thumbnail] mark_complete: {e}"))?;
        }
    }

    serde_json::to_string(&serde_json::json!({
        "playlistId": input.playlist_id,
        "thumbnails": updated_page.thumbnails,
    }))
    .map_err(|e| format!("[yt_set_playlist_thumbnail] serialization: {e}"))
}

#[tauri::command]
pub async fn yt_add_playlist_items(
    playlist_id: String,
    video_ids: Vec<String>,
    source_playlist_id: Option<String>,
    state: State<'_, Arc<Mutex<YtMusicState>>>,
) -> Result<String, String> {
    println!(
        "[yt_add_playlist_items] playlist_id={} video_ids={} source_playlist_id={:?}",
        playlist_id,
        video_ids.len(),
        source_playlist_id
    );
    let state = state.lock().await;
    let response = state
        .client
        .add_playlist_items(&playlist_id, &video_ids, source_playlist_id.as_deref())
        .await
        .map_err(|e| format!("[yt_add_playlist_items] {e}"))?;
    serde_json::to_string(&response)
        .map_err(|e| format!("[yt_add_playlist_items] serialization: {e}"))
}

#[tauri::command]
pub async fn yt_remove_playlist_items(
    playlist_id: String,
    items: Vec<PlaylistItemRemoveInput>,
    state: State<'_, Arc<Mutex<YtMusicState>>>,
) -> Result<String, String> {
    println!(
        "[yt_remove_playlist_items] playlist_id={} items={}",
        playlist_id,
        items.len()
    );
    let items: Vec<(String, String)> = items
        .into_iter()
        .map(|item| (item.video_id, item.set_video_id))
        .collect();
    let state = state.lock().await;
    let response = state
        .client
        .remove_playlist_items(&playlist_id, &items)
        .await
        .map_err(|e| format!("[yt_remove_playlist_items] {e}"))?;
    serde_json::to_string(&response)
        .map_err(|e| format!("[yt_remove_playlist_items] serialization: {e}"))
}

#[tauri::command]
pub async fn yt_get_collection_window(
    collection_type: String,
    collection_id: String,
    offset: usize,
    limit: usize,
    cache: State<'_, Arc<tokio::sync::Mutex<PlaylistCache>>>,
) -> Result<String, String> {
    println!(
        "[yt_get_collection_window] type={} id={} offset={} limit={}",
        collection_type, collection_id, offset, limit
    );
    let db = cache.lock().await;
    let items = db
        .get_collection_window(&collection_type, &collection_id, offset, limit)
        .map_err(|e| format!("[yt_get_collection_window] get_collection_window: {e}"))?;
    let total_loaded = db
        .collection_track_count(&collection_type, &collection_id)
        .map_err(|e| format!("[yt_get_collection_window] collection_track_count: {e}"))?;
    let is_complete = db
        .is_collection_complete(&collection_type, &collection_id)
        .map_err(|e| format!("[yt_get_collection_window] is_collection_complete: {e}"))?;
    let first = items.first().map(|item| {
        serde_json::json!({
            "position": item.position,
            "videoId": item.track.video_id,
        })
    });
    let last = items.last().map(|item| {
        serde_json::json!({
            "position": item.position,
            "videoId": item.track.video_id,
        })
    });
    println!(
        "[yt_get_collection_window] returned={} totalLoaded={} isComplete={} first={} last={}",
        items.len(),
        total_loaded,
        is_complete,
        first.unwrap_or_default(),
        last.unwrap_or_default()
    );

    let response = serde_json::json!({
        "items": items,
        "offset": offset,
        "limit": limit,
        "totalLoaded": total_loaded,
        "isComplete": is_complete,
    });

    serde_json::to_string(&response)
        .map_err(|e| format!("[yt_get_collection_window] serialization: {e}"))
}

#[tauri::command]
pub async fn yt_queue_set(
    track_ids: Vec<String>,
    start_index: usize,
    playlist_id: Option<String>,
    is_complete: bool,
    shuffle: bool,
    queue: State<'_, Arc<tokio::sync::Mutex<PlaybackQueue>>>,
    app: AppHandle,
) -> Result<QueueCommandResponse, String> {
    println!(
        "[yt_queue_set] count={} start_index={} playlist_id={:?} is_complete={} shuffle={}",
        track_ids.len(),
        start_index,
        playlist_id,
        is_complete,
        shuffle
    );

    let response = {
        let mut queue = queue.lock().await;
        queue.set_queue(track_ids, start_index, playlist_id, is_complete, shuffle)
    };

    emit_queue_state_updated(&app, &response.snapshot);
    Ok(response)
}

#[tauri::command]
pub async fn yt_queue_get_state(
    queue: State<'_, Arc<tokio::sync::Mutex<PlaybackQueue>>>,
) -> Result<QueueSnapshot, String> {
    let queue = queue.lock().await;
    Ok(queue.snapshot())
}

#[tauri::command]
pub async fn yt_queue_get_window(
    offset: usize,
    limit: usize,
    queue: State<'_, Arc<tokio::sync::Mutex<PlaybackQueue>>>,
) -> Result<QueueWindowResponse, String> {
    let queue = queue.lock().await;
    let response = queue.get_window(offset, limit);
    let first = response.items.first().map(|item| {
        serde_json::json!({
            "index": item.index,
            "videoId": item.video_id,
        })
    });
    let last = response.items.last().map(|item| {
        serde_json::json!({
            "index": item.index,
            "videoId": item.video_id,
        })
    });
    println!(
        "[yt_queue_get_window] offset={} limit={} returned={} first={} last={}",
        offset,
        limit,
        response.items.len(),
        first.unwrap_or_default(),
        last.unwrap_or_default()
    );
    Ok(response)
}

#[tauri::command]
pub async fn yt_queue_play_index(
    index: usize,
    queue: State<'_, Arc<tokio::sync::Mutex<PlaybackQueue>>>,
    app: AppHandle,
) -> Result<QueueCommandResponse, String> {
    let response = {
        let mut queue = queue.lock().await;
        queue.play_index(index)
    };
    emit_queue_state_updated(&app, &response.snapshot);
    Ok(response)
}

#[tauri::command]
pub async fn yt_queue_next(
    queue: State<'_, Arc<tokio::sync::Mutex<PlaybackQueue>>>,
    app: AppHandle,
) -> Result<QueueCommandResponse, String> {
    let response = {
        let mut queue = queue.lock().await;
        queue.next_track()
    };
    emit_queue_state_updated(&app, &response.snapshot);
    Ok(response)
}

#[tauri::command]
pub async fn yt_queue_previous(
    queue: State<'_, Arc<tokio::sync::Mutex<PlaybackQueue>>>,
    app: AppHandle,
) -> Result<QueueCommandResponse, String> {
    let response = {
        let mut queue = queue.lock().await;
        queue.previous_track()
    };
    emit_queue_state_updated(&app, &response.snapshot);
    Ok(response)
}

#[tauri::command]
pub async fn yt_queue_handle_track_end(
    queue: State<'_, Arc<tokio::sync::Mutex<PlaybackQueue>>>,
    app: AppHandle,
) -> Result<QueueCommandResponse, String> {
    let response = {
        let mut queue = queue.lock().await;
        queue.handle_track_end()
    };
    emit_queue_state_updated(&app, &response.snapshot);
    Ok(response)
}

#[tauri::command]
pub async fn yt_queue_add_next(
    video_id: String,
    queue: State<'_, Arc<tokio::sync::Mutex<PlaybackQueue>>>,
    app: AppHandle,
) -> Result<QueueCommandResponse, String> {
    println!("[yt_queue_add_next] video_id={video_id}");
    let response = {
        let mut queue = queue.lock().await;
        queue.add_next(video_id)
    };
    emit_queue_state_updated(&app, &response.snapshot);
    Ok(response)
}

#[tauri::command]
pub async fn yt_queue_add_collection_next(
    track_ids: Vec<String>,
    queue: State<'_, Arc<tokio::sync::Mutex<PlaybackQueue>>>,
    app: AppHandle,
) -> Result<QueueCommandResponse, String> {
    println!(
        "[yt_queue_add_collection_next] count={} sample={}",
        track_ids.len(),
        serde_json::to_string(&track_ids.iter().take(5).cloned().collect::<Vec<_>>())
            .unwrap_or_else(|_| "[]".to_string())
    );
    let response = {
        let mut queue = queue.lock().await;
        queue.add_collection_next(track_ids)
    };
    emit_queue_state_updated(&app, &response.snapshot);
    Ok(response)
}

#[tauri::command]
pub async fn yt_queue_append_collection(
    track_ids: Vec<String>,
    queue: State<'_, Arc<tokio::sync::Mutex<PlaybackQueue>>>,
    app: AppHandle,
) -> Result<QueueCommandResponse, String> {
    println!(
        "[yt_queue_append_collection] count={} sample={}",
        track_ids.len(),
        serde_json::to_string(&track_ids.iter().take(5).cloned().collect::<Vec<_>>())
            .unwrap_or_else(|_| "[]".to_string())
    );
    let response = {
        let mut queue = queue.lock().await;
        queue.append_collection(track_ids)
    };
    emit_queue_state_updated(&app, &response.snapshot);
    Ok(response)
}

#[tauri::command]
pub async fn yt_queue_remove(
    index: usize,
    queue: State<'_, Arc<tokio::sync::Mutex<PlaybackQueue>>>,
    app: AppHandle,
) -> Result<QueueCommandResponse, String> {
    println!("[yt_queue_remove] index={index}");
    let response = {
        let mut queue = queue.lock().await;
        queue.remove_index(index)
    };
    emit_queue_state_updated(&app, &response.snapshot);
    Ok(response)
}

#[tauri::command]
pub async fn yt_queue_toggle_shuffle(
    queue: State<'_, Arc<tokio::sync::Mutex<PlaybackQueue>>>,
    app: AppHandle,
) -> Result<QueueCommandResponse, String> {
    let response = {
        let mut queue = queue.lock().await;
        queue.toggle_shuffle()
    };
    emit_queue_state_updated(&app, &response.snapshot);
    Ok(response)
}

#[tauri::command]
pub async fn yt_queue_cycle_repeat(
    queue: State<'_, Arc<tokio::sync::Mutex<PlaybackQueue>>>,
    app: AppHandle,
) -> Result<QueueCommandResponse, String> {
    let response = {
        let mut queue = queue.lock().await;
        queue.cycle_repeat()
    };
    emit_queue_state_updated(&app, &response.snapshot);
    Ok(response)
}

#[tauri::command]
pub async fn yt_queue_clear(
    queue: State<'_, Arc<tokio::sync::Mutex<PlaybackQueue>>>,
    app: AppHandle,
) -> Result<QueueCommandResponse, String> {
    let response = {
        let mut queue = queue.lock().await;
        queue.clear()
    };
    emit_queue_state_updated(&app, &response.snapshot);
    Ok(response)
}
