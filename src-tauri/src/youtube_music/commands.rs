use std::collections::HashSet;
use std::sync::Arc;

use serde::{Deserialize, Serialize};
use tauri::{AppHandle, Emitter, Manager, State};
use tokio::sync::RwLock;
use ytmusic_api::types::common::LikeStatus;
use ytmusic_api::types::watch::{WatchPlaylistRequest, WatchTrack};
use ytmusic_api::YtMusicClient;

use super::client::YtMusicState;
use super::session::{
    self, is_session_expired, refresh_cookies_and_rebuild_state, with_session_refresh,
    SessionActivity,
};
use crate::playback_queue::{
    PlaybackQueue, QueueCommandResponse, QueueSnapshot, QueueWindowResponse, RadioSeed,
    RadioSeedKind, RadioState,
};
use crate::playlist_cache::{
    self, CachedAlbum, CachedArtist, CachedCollectionMeta, CachedPlaylistMeta, CachedThumbnail,
    CachedTrack, PlaylistCache,
};

// ---------------------------------------------------------------------------
// IPC input limits (prevent OOM via oversized payloads)
// ---------------------------------------------------------------------------
const MAX_TRACK_IDS: usize = 10_000;
const MAX_COLLECTION_TRACKS: usize = 10_000;
const MAX_PLAYLIST_ITEMS: usize = 5_000;
const MAX_STRING_LEN: usize = 1_000;
const MAX_WINDOW_LIMIT: usize = 500;

fn validate_vec_len<T>(vec: &[T], max: usize, name: &str) -> Result<(), String> {
    if vec.len() > max {
        return Err(format!(
            "{name}: too many items ({}, max {max})",
            vec.len()
        ));
    }
    Ok(())
}

fn validate_string_len(s: &str, max: usize, name: &str) -> Result<(), String> {
    if s.len() > max {
        return Err(format!(
            "{name}: string too long ({}, max {max})",
            s.len()
        ));
    }
    Ok(())
}

// ---------------------------------------------------------------------------
// Auth response DTOs
// ---------------------------------------------------------------------------
#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AuthStatusResponse {
    pub authenticated: bool,
    pub method: String,
    pub has_page_id: bool,
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
// Search
// ---------------------------------------------------------------------------

#[tauri::command]
pub async fn yt_search(
    query: String,
    filter: Option<String>,
    app: AppHandle,
    state: State<'_, Arc<RwLock<YtMusicState>>>,
    activity: State<'_, Arc<SessionActivity>>,
) -> Result<String, String> {
    println!("[yt_search] query={query} filter={filter:?}");
    let result = with_session_refresh(
        &state,
        &app,
        &activity,
        "yt_search",
        |client| {
            let q = query.clone();
            let f = filter.clone();
            async move { client.search(&q, f.as_deref()).await }
        },
    )
    .await
    .map_err(|e| format!("[yt_search] {e}"))?;
    serde_json::to_string(&result)
        .map_err(|e| format!("[yt_search] serialization: {e}"))
}

#[tauri::command]
pub async fn yt_search_suggestions(
    query: String,
    state: State<'_, Arc<RwLock<YtMusicState>>>,
) -> Result<String, String> {
    println!("[yt_search_suggestions] query={query}");
    let state = state.read().await;
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
    app: AppHandle,
    state: State<'_, Arc<RwLock<YtMusicState>>>,
    activity: State<'_, Arc<SessionActivity>>,
) -> Result<String, String> {
    let limit = limit.unwrap_or(6);
    println!("[yt_get_home] limit={limit}");
    let result = with_session_refresh(
        &state,
        &app,
        &activity,
        "yt_get_home",
        |client| async move { client.get_home(limit).await },
    )
    .await
    .map_err(|e| format!("[yt_get_home] {e}"))?;
    serde_json::to_string(&result)
        .map_err(|e| format!("[yt_get_home] serialization: {e}"))
}

#[tauri::command]
pub async fn yt_get_artist(
    browse_id: String,
    app: AppHandle,
    state: State<'_, Arc<RwLock<YtMusicState>>>,
    activity: State<'_, Arc<SessionActivity>>,
) -> Result<String, String> {
    println!("[yt_get_artist] browse_id={browse_id}");
    let result = with_session_refresh(
        &state,
        &app,
        &activity,
        "yt_get_artist",
        |client| {
            let id = browse_id.clone();
            async move { client.get_artist(&id).await }
        },
    )
    .await
    .map_err(|e| format!("[yt_get_artist] {e}"))?;
    serde_json::to_string(&result)
        .map_err(|e| format!("[yt_get_artist] serialization: {e}"))
}

#[tauri::command]
pub async fn yt_get_album(
    browse_id: String,
    app: AppHandle,
    state: State<'_, Arc<RwLock<YtMusicState>>>,
    activity: State<'_, Arc<SessionActivity>>,
) -> Result<String, String> {
    println!("[yt_get_album] browse_id={browse_id}");
    let result = with_session_refresh(
        &state,
        &app,
        &activity,
        "yt_get_album",
        |client| {
            let id = browse_id.clone();
            async move { client.get_album(&id).await }
        },
    )
    .await
    .map_err(|e| format!("[yt_get_album] {e}"))?;
    serde_json::to_string(&result)
        .map_err(|e| format!("[yt_get_album] serialization: {e}"))
}

// ---------------------------------------------------------------------------
// Explore
// ---------------------------------------------------------------------------

#[tauri::command]
pub async fn yt_get_explore(
    app: AppHandle,
    state: State<'_, Arc<RwLock<YtMusicState>>>,
    activity: State<'_, Arc<SessionActivity>>,
) -> Result<String, String> {
    println!("[yt_get_explore]");
    let result = with_session_refresh(
        &state,
        &app,
        &activity,
        "yt_get_explore",
        |client| async move { client.get_explore().await },
    )
    .await
    .map_err(|e| format!("[yt_get_explore] {e}"))?;
    serde_json::to_string(&result)
        .map_err(|e| format!("[yt_get_explore] serialization: {e}"))
}

#[tauri::command]
pub async fn yt_get_mood_categories(
    app: AppHandle,
    state: State<'_, Arc<RwLock<YtMusicState>>>,
    activity: State<'_, Arc<SessionActivity>>,
) -> Result<String, String> {
    println!("[yt_get_mood_categories]");
    let result = with_session_refresh(
        &state,
        &app,
        &activity,
        "yt_get_mood_categories",
        |client| async move { client.get_mood_categories().await },
    )
    .await
    .map_err(|e| format!("[yt_get_mood_categories] {e}"))?;
    serde_json::to_string(&result)
        .map_err(|e| format!("[yt_get_mood_categories] serialization: {e}"))
}

// ---------------------------------------------------------------------------
// Library
// ---------------------------------------------------------------------------

#[tauri::command]
pub async fn yt_get_library_playlists(
    app: AppHandle,
    state: State<'_, Arc<RwLock<YtMusicState>>>,
    activity: State<'_, Arc<SessionActivity>>,
) -> Result<String, String> {
    println!("[yt_get_library_playlists]");
    let result = with_session_refresh(
        &state,
        &app,
        &activity,
        "yt_get_library_playlists",
        |client| async move { client.get_library_playlists().await },
    )
    .await
    .map_err(|e| format!("[yt_get_library_playlists] {e}"))?;
    serde_json::to_string(&result)
        .map_err(|e| format!("[yt_get_library_playlists] serialization: {e}"))
}

#[tauri::command]
pub async fn yt_get_sidebar_playlists(
    app: AppHandle,
    state: State<'_, Arc<RwLock<YtMusicState>>>,
    activity: State<'_, Arc<SessionActivity>>,
) -> Result<String, String> {
    println!("[yt_get_sidebar_playlists]");
    let result = with_session_refresh(
        &state,
        &app,
        &activity,
        "yt_get_sidebar_playlists",
        |client| async move { client.get_sidebar_playlists().await },
    )
    .await
    .map_err(|e| format!("[yt_get_sidebar_playlists] {e}"))?;
    serde_json::to_string(&result)
        .map_err(|e| format!("[yt_get_sidebar_playlists] serialization: {e}"))
}

#[tauri::command]
pub async fn yt_get_sidebar_playlists_cached(
    app: AppHandle,
    state: State<'_, Arc<RwLock<YtMusicState>>>,
    activity: State<'_, Arc<SessionActivity>>,
    cache: State<'_, Arc<tokio::sync::Mutex<PlaylistCache>>>,
) -> Result<String, String> {
    println!("[yt_get_sidebar_playlists_cached] start");

    // 1. Try reading cached library playlists
    let cached_json = {
        let db = cache.lock().await;
        db.get_swr_json("library_playlists")
            .map_err(|e| format!("[yt_get_sidebar_playlists_cached] cache read: {e}"))?
    };

    let result = if let Some((json_data, _cached_at)) = cached_json {
        // Cache hit — deserialize and use the fast path (guide-only)
        let cached_library: Vec<ytmusic_api::types::library::LibraryPlaylist> =
            serde_json::from_str(&json_data)
                .map_err(|e| format!("[yt_get_sidebar_playlists_cached] deserialize cache: {e}"))?;
        println!(
            "[yt_get_sidebar_playlists_cached] cache hit, {} library playlists, using fast path",
            cached_library.len()
        );
        with_session_refresh(
            &state,
            &app,
            &activity,
            "yt_get_sidebar_playlists_cached:fast",
            |client| {
                let lib = cached_library.clone();
                async move { client.get_sidebar_playlists_with_library(lib).await }
            },
        )
        .await
        .map_err(|e| format!("[yt_get_sidebar_playlists_cached] {e}"))?
    } else {
        // No cache — fall back to full fetch
        println!("[yt_get_sidebar_playlists_cached] no cache, falling back to full fetch");
        with_session_refresh(
            &state,
            &app,
            &activity,
            "yt_get_sidebar_playlists_cached:full",
            |client| async move { client.get_sidebar_playlists().await },
        )
        .await
        .map_err(|e| format!("[yt_get_sidebar_playlists_cached] {e}"))?
    };

    serde_json::to_string(&result)
        .map_err(|e| format!("[yt_get_sidebar_playlists_cached] serialization: {e}"))
}

#[tauri::command]
pub async fn yt_get_library_songs(
    app: AppHandle,
    state: State<'_, Arc<RwLock<YtMusicState>>>,
    activity: State<'_, Arc<SessionActivity>>,
) -> Result<String, String> {
    println!("[yt_get_library_songs]");
    let result = with_session_refresh(
        &state,
        &app,
        &activity,
        "yt_get_library_songs",
        |client| async move { client.get_library_songs().await },
    )
    .await
    .map_err(|e| format!("[yt_get_library_songs] {e}"))?;
    serde_json::to_string(&result)
        .map_err(|e| format!("[yt_get_library_songs] serialization: {e}"))
}

#[tauri::command]
pub async fn yt_get_liked_track_ids(
    app: AppHandle,
    state: State<'_, Arc<RwLock<YtMusicState>>>,
    activity: State<'_, Arc<SessionActivity>>,
) -> Result<Vec<String>, String> {
    println!("[yt_get_liked_track_ids]");
    with_session_refresh(
        &state,
        &app,
        &activity,
        "yt_get_liked_track_ids",
        |client| async move { client.get_liked_track_ids().await },
    )
    .await
    .map_err(|e| format!("[yt_get_liked_track_ids] {e}"))
}

// ---------------------------------------------------------------------------
// SWR-cached library endpoints
// ---------------------------------------------------------------------------

const SWR_FRESH_SECS: i64 = 300; // 5 minutes

static LIKED_IDS_REFRESHING: std::sync::atomic::AtomicBool =
    std::sync::atomic::AtomicBool::new(false);
static LIBRARY_PLAYLISTS_REFRESHING: std::sync::atomic::AtomicBool =
    std::sync::atomic::AtomicBool::new(false);

/// RAII guard that resets an AtomicBool to false on drop.
struct AtomicBoolGuard(&'static std::sync::atomic::AtomicBool);
impl Drop for AtomicBoolGuard {
    fn drop(&mut self) {
        self.0.store(false, std::sync::atomic::Ordering::SeqCst);
    }
}

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct LikedTrackIdsUpdated {
    video_ids: Vec<String>,
}

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct LibraryPlaylistsUpdated {
    playlists_json: String,
}

#[tauri::command]
pub async fn yt_get_liked_track_ids_cached(
    state: State<'_, Arc<RwLock<YtMusicState>>>,
    activity: State<'_, Arc<SessionActivity>>,
    cache: State<'_, Arc<tokio::sync::Mutex<PlaylistCache>>>,
    app: AppHandle,
) -> Result<Vec<String>, String> {
    println!("[yt_get_liked_track_ids_cached] start");

    let now = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .unwrap_or_default()
        .as_secs() as i64;

    // 1. Check cache
    let cached = {
        let db = cache.lock().await;
        db.get_swr_json("liked_track_ids")
            .map_err(|e| format!("[yt_get_liked_track_ids_cached] cache read: {e}"))?
    };

    if let Some((json_data, cached_at)) = cached {
        let age = now - cached_at;
        println!(
            "[yt_get_liked_track_ids_cached] cache hit, age={}s fresh_threshold={}s",
            age, SWR_FRESH_SECS
        );

        let ids: Vec<String> = serde_json::from_str(&json_data)
            .map_err(|e| format!("[yt_get_liked_track_ids_cached] deserialize: {e}"))?;

        if age >= SWR_FRESH_SECS {
            // Stale — return cached but trigger background refresh
            let can_refresh = LIKED_IDS_REFRESHING.compare_exchange(
                false,
                true,
                std::sync::atomic::Ordering::SeqCst,
                std::sync::atomic::Ordering::SeqCst,
            );
            if can_refresh.is_ok() {
                println!("[yt_get_liked_track_ids_cached] spawning background refresh");
                let state_arc = Arc::clone(&*state);
                let activity_arc = Arc::clone(&*activity);
                let cache_arc = Arc::clone(&*cache);
                let app_clone = app.clone();
                tokio::spawn(async move {
                    let _guard = AtomicBoolGuard(&LIKED_IDS_REFRESHING);

                    let fresh_ids = with_session_refresh(
                        &state_arc,
                        &app_clone,
                        &activity_arc,
                        "yt_get_liked_track_ids_cached:bg",
                        |client| async move { client.get_liked_track_ids().await },
                    )
                    .await;
                    match fresh_ids {
                        Ok(ids) => {
                            let json = match serde_json::to_string(&ids) {
                                Ok(j) => j,
                                Err(e) => {
                                    eprintln!("[yt_get_liked_track_ids_cached:bg] serialize: {e}");
                                    return;
                                }
                            };
                            let db = cache_arc.lock().await;
                            if let Err(e) = db.save_swr_json("liked_track_ids", &json) {
                                eprintln!("[yt_get_liked_track_ids_cached:bg] save: {e}");
                                return;
                            }
                            println!(
                                "[yt_get_liked_track_ids_cached:bg] refreshed {} ids",
                                ids.len()
                            );
                            if let Err(e) = app_clone.emit(
                                "liked-track-ids-updated",
                                LikedTrackIdsUpdated { video_ids: ids },
                            ) {
                                eprintln!("[yt_get_liked_track_ids_cached:bg] emit: {e}");
                            }
                        }
                        Err(e) => {
                            eprintln!("[yt_get_liked_track_ids_cached:bg] fetch: {e}");
                        }
                    }
                });
            } else {
                println!("[yt_get_liked_track_ids_cached] refresh already in-flight, skipping");
            }
        }

        return Ok(ids);
    }

    // 2. Cold start — fetch synchronously
    println!("[yt_get_liked_track_ids_cached] cold start, fetching from API");
    let ids = with_session_refresh(
        &state,
        &app,
        &activity,
        "yt_get_liked_track_ids_cached:cold",
        |client| async move { client.get_liked_track_ids().await },
    )
    .await
    .map_err(|e| format!("[yt_get_liked_track_ids_cached] fetch: {e}"))?;

    // Save to cache
    let json = serde_json::to_string(&ids)
        .map_err(|e| format!("[yt_get_liked_track_ids_cached] serialize: {e}"))?;
    {
        let db = cache.lock().await;
        db.save_swr_json("liked_track_ids", &json)
            .map_err(|e| format!("[yt_get_liked_track_ids_cached] save: {e}"))?;
    }
    println!(
        "[yt_get_liked_track_ids_cached] cold start complete, cached {} ids",
        ids.len()
    );

    Ok(ids)
}

#[tauri::command]
pub async fn yt_get_library_playlists_cached(
    state: State<'_, Arc<RwLock<YtMusicState>>>,
    activity: State<'_, Arc<SessionActivity>>,
    cache: State<'_, Arc<tokio::sync::Mutex<PlaylistCache>>>,
    app: AppHandle,
) -> Result<String, String> {
    println!("[yt_get_library_playlists_cached] start");

    let now = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .unwrap_or_default()
        .as_secs() as i64;

    // 1. Check cache
    let cached = {
        let db = cache.lock().await;
        db.get_swr_json("library_playlists")
            .map_err(|e| format!("[yt_get_library_playlists_cached] cache read: {e}"))?
    };

    if let Some((json_data, cached_at)) = cached {
        let age = now - cached_at;
        println!(
            "[yt_get_library_playlists_cached] cache hit, age={}s fresh_threshold={}s",
            age, SWR_FRESH_SECS
        );

        if age >= SWR_FRESH_SECS {
            // Stale — return cached but trigger background refresh
            let can_refresh = LIBRARY_PLAYLISTS_REFRESHING.compare_exchange(
                false,
                true,
                std::sync::atomic::Ordering::SeqCst,
                std::sync::atomic::Ordering::SeqCst,
            );
            if can_refresh.is_ok() {
                println!("[yt_get_library_playlists_cached] spawning background refresh");
                let state_arc = Arc::clone(&*state);
                let activity_arc = Arc::clone(&*activity);
                let cache_arc = Arc::clone(&*cache);
                let app_clone = app.clone();
                tokio::spawn(async move {
                    let _guard = AtomicBoolGuard(&LIBRARY_PLAYLISTS_REFRESHING);

                    let fresh = with_session_refresh(
                        &state_arc,
                        &app_clone,
                        &activity_arc,
                        "yt_get_library_playlists_cached:bg",
                        |client| async move { client.get_library_playlists().await },
                    )
                    .await;
                    match fresh {
                        Ok(playlists) => {
                            let json = match serde_json::to_string(&playlists) {
                                Ok(j) => j,
                                Err(e) => {
                                    eprintln!(
                                        "[yt_get_library_playlists_cached:bg] serialize: {e}"
                                    );
                                    return;
                                }
                            };
                            let db = cache_arc.lock().await;
                            if let Err(e) = db.save_swr_json("library_playlists", &json) {
                                eprintln!("[yt_get_library_playlists_cached:bg] save: {e}");
                                return;
                            }
                            println!(
                                "[yt_get_library_playlists_cached:bg] refreshed {} playlists",
                                playlists.len()
                            );
                            if let Err(e) = app_clone.emit(
                                "library-playlists-updated",
                                LibraryPlaylistsUpdated {
                                    playlists_json: json,
                                },
                            ) {
                                eprintln!("[yt_get_library_playlists_cached:bg] emit: {e}");
                            }
                        }
                        Err(e) => {
                            eprintln!("[yt_get_library_playlists_cached:bg] fetch: {e}");
                        }
                    }
                });
            } else {
                println!(
                    "[yt_get_library_playlists_cached] refresh already in-flight, skipping"
                );
            }
        }

        return Ok(json_data);
    }

    // 2. Cold start — fetch synchronously
    println!("[yt_get_library_playlists_cached] cold start, fetching from API");
    let playlists = with_session_refresh(
        &state,
        &app,
        &activity,
        "yt_get_library_playlists_cached:cold",
        |client| async move { client.get_library_playlists().await },
    )
    .await
    .map_err(|e| format!("[yt_get_library_playlists_cached] fetch: {e}"))?;

    let json = serde_json::to_string(&playlists)
        .map_err(|e| format!("[yt_get_library_playlists_cached] serialize: {e}"))?;

    // Save to cache
    {
        let db = cache.lock().await;
        db.save_swr_json("library_playlists", &json)
            .map_err(|e| format!("[yt_get_library_playlists_cached] save: {e}"))?;
    }
    println!(
        "[yt_get_library_playlists_cached] cold start complete, cached {} playlists",
        playlists.len()
    );

    Ok(json)
}

#[tauri::command]
pub async fn yt_rate_song(
    video_id: String,
    rating: TrackLikeStatusInput,
    app: AppHandle,
    state: State<'_, Arc<RwLock<YtMusicState>>>,
    activity: State<'_, Arc<SessionActivity>>,
) -> Result<TrackLikeStatusResponse, String> {
    let like_status: LikeStatus = rating.into();
    println!(
        "[yt_rate_song] video_id={} like_status={:?}",
        video_id, like_status
    );
    with_session_refresh(
        &state,
        &app,
        &activity,
        "yt_rate_song",
        |client| {
            let id = video_id.clone();
            let status = like_status.clone();
            async move { client.rate_song(&id, status).await }
        },
    )
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
    app: AppHandle,
    state: State<'_, Arc<RwLock<YtMusicState>>>,
    activity: State<'_, Arc<SessionActivity>>,
) -> Result<PlaylistLikeStatusResponse, String> {
    let like_status: LikeStatus = rating.into();
    println!(
        "[yt_rate_playlist] playlist_id={} like_status={:?}",
        playlist_id, like_status
    );
    with_session_refresh(
        &state,
        &app,
        &activity,
        "yt_rate_playlist",
        |client| {
            let id = playlist_id.clone();
            let status = like_status.clone();
            async move { client.rate_playlist(&id, status).await }
        },
    )
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
    app: AppHandle,
    state: State<'_, Arc<RwLock<YtMusicState>>>,
    activity: State<'_, Arc<SessionActivity>>,
) -> Result<String, String> {
    let remote_playlist_id = resolve_remote_playlist_id(&playlist_id).to_string();
    println!(
        "[yt_get_playlist] playlist_id={} remote_playlist_id={}",
        playlist_id, remote_playlist_id
    );
    let (playlist, continuation) = with_session_refresh(
        &state,
        &app,
        &activity,
        "yt_get_playlist",
        |client| {
            let id = remote_playlist_id.clone();
            async move { client.get_playlist(&id).await }
        },
    )
    .await
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
    app: AppHandle,
    state: State<'_, Arc<RwLock<YtMusicState>>>,
    activity: State<'_, Arc<SessionActivity>>,
) -> Result<String, String> {
    println!("[yt_get_playlist_continuation]");
    let (tracks, next_token) = with_session_refresh(
        &state,
        &app,
        &activity,
        "yt_get_playlist_continuation",
        |client| {
            let token = continuation_token.clone();
            async move { client.get_playlist_continuation(&token).await }
        },
    )
    .await
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
    app: AppHandle,
    state: State<'_, Arc<RwLock<YtMusicState>>>,
    activity: State<'_, Arc<SessionActivity>>,
) -> Result<String, String> {
    println!("[yt_get_watch_playlist] video_id={video_id}");
    let result = with_session_refresh(
        &state,
        &app,
        &activity,
        "yt_get_watch_playlist",
        |client| {
            let id = video_id.clone();
            async move {
                client
                    .get_watch_playlist(WatchPlaylistRequest::for_video_radio(&id, 25))
                    .await
            }
        },
    )
    .await
    .map_err(|e| format!("[yt_get_watch_playlist] {e}"))?;
    serde_json::to_string(&result)
        .map_err(|e| format!("[yt_get_watch_playlist] serialization: {e}"))
}

#[tauri::command]
pub async fn yt_get_lyrics(
    browse_id: String,
    app: AppHandle,
    state: State<'_, Arc<RwLock<YtMusicState>>>,
    activity: State<'_, Arc<SessionActivity>>,
) -> Result<String, String> {
    println!("[yt_get_lyrics] browse_id={browse_id}");
    let result = with_session_refresh(
        &state,
        &app,
        &activity,
        "yt_get_lyrics",
        |client| {
            let id = browse_id.clone();
            async move { client.get_lyrics(&id).await }
        },
    )
    .await
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
    app: AppHandle,
    state: State<'_, Arc<RwLock<YtMusicState>>>,
    activity: State<'_, Arc<SessionActivity>>,
) -> Result<String, String> {
    println!("[yt_get_stream_url] Fetching stream URL for {video_id}");
    let stream_data = with_session_refresh(
        &state,
        &app,
        &activity,
        "yt_get_stream_url",
        |client| {
            let id = video_id.clone();
            async move { client.get_stream_url(&id).await }
        },
    )
    .await
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
    app: AppHandle,
    state: State<'_, Arc<RwLock<YtMusicState>>>,
    activity: State<'_, Arc<SessionActivity>>,
) -> Result<String, String> {
    println!("[yt_get_accounts]");
    let result = with_session_refresh(
        &state,
        &app,
        &activity,
        "yt_get_accounts",
        |client| async move { client.get_accounts().await },
    )
    .await
    .map_err(|e| format!("[yt_get_accounts] {e}"))?;
    serde_json::to_string(&result)
        .map_err(|e| format!("[yt_get_accounts] serialization: {e}"))
}

#[tauri::command]
pub async fn yt_switch_account(
    page_id: Option<String>,
    app: AppHandle,
    state: State<'_, Arc<RwLock<YtMusicState>>>,
    activity: State<'_, Arc<SessionActivity>>,
) -> Result<String, String> {
    println!(
        "[yt_switch_account] has_page_id={}",
        page_id.as_ref().is_some()
    );

    // Write lock: mutation + persist to disk
    {
        let mut st = state.write().await;
        st.client.set_on_behalf_of_user(page_id.clone());
    }

    // Persist pageId to disk (outside lock — pure I/O)
    if let Ok(dir) = app.path().app_data_dir() {
        if let Some(ref pid) = page_id {
            let _ = YtMusicState::save_page_id(&dir, pid);
        } else {
            YtMusicState::delete_page_id(&dir);
        }
    }

    // Read lock: fetch updated account info via the retry wrapper.
    let result = with_session_refresh(
        &state,
        &app,
        &activity,
        "yt_switch_account",
        |client| async move { client.get_accounts().await },
    )
    .await
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
        let (has_cookies, cookie_count) = match session::extract_cookies_from_browser(browser) {
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
/// `auth_user` selects which Google account index to use (X-Goog-AuthUser header); defaults to 0.
#[tauri::command]
pub async fn yt_auth_from_browser(
    browser: String,
    auth_user: Option<u32>,
    app: AppHandle,
    state: State<'_, Arc<RwLock<YtMusicState>>>,
) -> Result<AuthStatusResponse, String> {
    let auth_user = auth_user.unwrap_or(0).min(9);
    println!("[yt_auth_from_browser] browser={browser}, auth_user={auth_user}");

    // 1. Extract cookies
    let (used_browser, cookie_string) = if browser == "auto" {
        session::extract_cookies_auto()?
    } else {
        let cookies = session::extract_cookies_from_browser(&browser)?
            .ok_or_else(|| format!("[yt_auth_from_browser] No YouTube cookies found in {browser}"))?;
        (browser.clone(), cookies)
    };

    println!(
        "[yt_auth_from_browser] Using cookies from {used_browser} ({} chars)",
        cookie_string.len()
    );

    // 2. Create YtMusicState with cookies (sync — no .await)
    let new_state = YtMusicState::new_from_cookies(cookie_string.clone(), auth_user)?;

    // 3. Persist cookies and auth_user to disk
    let app_data_dir = app
        .path()
        .app_data_dir()
        .map_err(|e| format!("[yt_auth_from_browser] Failed to resolve app data dir: {e}"))?;
    YtMusicState::save_cookies(&app_data_dir, &cookie_string)?;
    YtMusicState::save_auth_user(&app_data_dir, auth_user)?;

    // 4. Replace state
    let mut state_guard = state.write().await;
    *state_guard = new_state;
    println!("[yt_auth_from_browser] Cookie-auth client is now active (from {used_browser}).");

    Ok(AuthStatusResponse {
        authenticated: true,
        method: "cookie".to_string(),
        has_page_id: false,
    })
}

/// Check whether the client is authenticated and which method is active.
#[tauri::command]
pub async fn yt_auth_status(
    state: State<'_, Arc<RwLock<YtMusicState>>>,
) -> Result<AuthStatusResponse, String> {
    let state = state.read().await;
    let authenticated = state.is_authenticated();
    let method = state.auth_method().to_string();
    let has_page_id = state.client.on_behalf_of_user().is_some();
    println!("[yt_auth_status] authenticated={authenticated}, method={method}, has_page_id={has_page_id}");
    Ok(AuthStatusResponse {
        authenticated,
        method,
        has_page_id,
    })
}

/// Validate current session and silently refresh cookies if expired.
/// Called on startup — if cookies are stale (401 from YouTube), re-extracts
/// from the browser and updates state transparently.
#[tauri::command]
pub async fn yt_ensure_session(
    app: AppHandle,
    state: State<'_, Arc<RwLock<YtMusicState>>>,
    activity: State<'_, Arc<SessionActivity>>,
) -> Result<AuthStatusResponse, String> {
    // 1. Check if authenticated at all
    let (is_auth, has_page_id) = {
        let s = state.read().await;
        (s.is_authenticated(), s.client.on_behalf_of_user().is_some())
    };

    println!("[yt_ensure_session] authenticated={is_auth}, has_page_id={has_page_id}");

    if !is_auth {
        println!("[yt_ensure_session] branch: not authenticated — skipping validation, returning unauthenticated");
        return Ok(AuthStatusResponse {
            authenticated: false,
            method: "none".to_string(),
            has_page_id: false,
        });
    }

    // 2. Test session with a lightweight API call. Clone the client so we don't
    //    hold the read lock during the network round trip.
    println!("[yt_ensure_session] testing session validity via get_accounts...");
    let test_client = { state.read().await.client.clone() };
    let test_result = test_client.get_accounts().await;

    let needs_refresh = match &test_result {
        Err(e) => {
            let expired = is_session_expired(e);
            println!("[yt_ensure_session] test result: error=\"{e}\" expired={expired}");
            expired
        }
        Ok(accounts) => {
            println!("[yt_ensure_session] test result: valid=true account_count={}", accounts.len());
            activity.mark_success();
            false
        }
    };

    if !needs_refresh {
        println!("[yt_ensure_session] branch: session valid — returning authenticated (has_page_id={has_page_id})");
        return Ok(AuthStatusResponse {
            authenticated: true,
            method: "cookie".to_string(),
            has_page_id,
        });
    }

    // 3. Session expired — delegate to the shared refresh helper.
    println!("[yt_ensure_session] branch: session expired — attempting silent cookie refresh...");

    match refresh_cookies_and_rebuild_state(&app, &state, &activity).await {
        Ok(()) => {
            // Re-read has_page_id in case the refresh restored it.
            let has_page_id = state.read().await.client.on_behalf_of_user().is_some();
            println!("[yt_ensure_session] branch: silent refresh complete (has_page_id={has_page_id})");
            Ok(AuthStatusResponse {
                authenticated: true,
                method: "cookie".to_string(),
                has_page_id,
            })
        }
        Err(e) => {
            println!("[yt_ensure_session] branch: refresh failed — {e}");
            println!("[yt_ensure_session] deleting stale credentials and reverting to unauthenticated");
            let app_data_dir = app
                .path()
                .app_data_dir()
                .map_err(|e| format!("[yt_ensure_session] {e}"))?;
            YtMusicState::delete_cookies(&app_data_dir)?;
            YtMusicState::delete_page_id(&app_data_dir);
            YtMusicState::delete_auth_user(&app_data_dir);
            let new_state = YtMusicState::new_unauthenticated()?;
            {
                let mut guard = state.write().await;
                *guard = new_state;
            }
            println!("[yt_ensure_session] reverted to unauthenticated — returning unauthenticated");
            Ok(AuthStatusResponse {
                authenticated: false,
                method: "none".to_string(),
                has_page_id: false,
            })
        }
    }
}

/// Delete saved cookies and revert to unauthenticated client.
#[tauri::command]
pub async fn yt_auth_logout(
    app: AppHandle,
    state: State<'_, Arc<RwLock<YtMusicState>>>,
) -> Result<AuthStatusResponse, String> {
    println!("[yt_auth_logout] Logging out...");

    let app_data_dir = app
        .path()
        .app_data_dir()
        .map_err(|e| format!("[yt_auth_logout] Failed to resolve app data dir: {e}"))?;

    // Delete saved cookie file, page_id, and auth_user
    println!("[yt_auth_logout] deleting credentials: cookies, page_id, auth_user...");
    let cookies_path = YtMusicState::get_cookie_path(&app_data_dir);
    let page_id_path = YtMusicState::get_page_id_path(&app_data_dir);
    let auth_user_path = YtMusicState::get_auth_user_path(&app_data_dir);
    println!("[yt_auth_logout] cookies file exists={}, page_id file exists={}, auth_user file exists={}",
        cookies_path.exists(), page_id_path.exists(), auth_user_path.exists());
    YtMusicState::delete_cookies(&app_data_dir)?;
    YtMusicState::delete_page_id(&app_data_dir);
    YtMusicState::delete_auth_user(&app_data_dir);
    println!("[yt_auth_logout] all credential files deleted");

    // Recreate unauthenticated state (sync — no .await)
    println!("[yt_auth_logout] recreating unauthenticated client...");
    let new_state = YtMusicState::new_unauthenticated()?;

    let mut state_guard = state.write().await;
    *state_guard = new_state;
    println!("[yt_auth_logout] reverted to unauthenticated client — logout complete");

    Ok(AuthStatusResponse {
        authenticated: false,
        method: "none".to_string(),
        has_page_id: false,
    })
}

// ---------------------------------------------------------------------------
// Debug-only commands for testing the session refresh wrapper without
// waiting for cookies to expire naturally. Compiled out in release builds.
// ---------------------------------------------------------------------------

#[cfg(debug_assertions)]
#[tauri::command]
pub async fn yt_dev_corrupt_cookies(
    state: State<'_, Arc<RwLock<YtMusicState>>>,
) -> Result<String, String> {
    println!("[yt_dev_corrupt_cookies] replacing in-memory cookies with garbage so the next authenticated call returns 401");
    let obu = {
        let s = state.read().await;
        s.client.on_behalf_of_user().map(String::from)
    };
    let auth_user = { state.read().await.client.auth_user() };
    let mut new_state = YtMusicState::new_from_cookies(
        "SAPISID=invalid_for_testing_dev_only; SID=fake_dev_only".to_string(),
        auth_user,
    )?;
    if let Some(pid) = obu {
        new_state.client.set_on_behalf_of_user(Some(pid));
    }
    {
        let mut g = state.write().await;
        *g = new_state;
    }
    println!("[yt_dev_corrupt_cookies] done — next authenticated call should hit 401 → refresh → retry");
    Ok("ok".to_string())
}

#[cfg(debug_assertions)]
#[tauri::command]
pub async fn yt_dev_backdate_activity(
    seconds_ago: Option<u64>,
    activity: State<'_, Arc<SessionActivity>>,
) -> Result<String, String> {
    let secs = seconds_ago.unwrap_or(2400); // default: 40 minutes ago (> 30min threshold)
    println!("[yt_dev_backdate_activity] backdating last_success to {secs}s ago");
    activity.set_seconds_ago(secs);
    Ok(format!("backdated to {secs}s ago"))
}

#[cfg(debug_assertions)]
#[tauri::command]
pub async fn yt_dev_session_stats(
    state: State<'_, Arc<RwLock<YtMusicState>>>,
    activity: State<'_, Arc<SessionActivity>>,
) -> Result<String, String> {
    let (authenticated, has_page_id, auth_user) = {
        let s = state.read().await;
        (
            s.is_authenticated(),
            s.client.on_behalf_of_user().is_some(),
            s.client.auth_user(),
        )
    };
    let secs = activity.seconds_since();
    let stale = secs
        .map(|s| s > super::session::STALE_THRESHOLD_SECS)
        .unwrap_or(false);
    let report = format!(
        "authenticated={authenticated} auth_user={auth_user} has_page_id={has_page_id} seconds_since={secs:?} stale={stale} (threshold={}s)",
        super::session::STALE_THRESHOLD_SECS
    );
    println!("[yt_dev_session_stats] {report}");
    Ok(report)
}

// ---------------------------------------------------------------------------
// Multi-Google-account detection
// ---------------------------------------------------------------------------

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct GoogleAccountInfo {
    pub auth_user: u32,
    pub name: String,
    pub email: Option<String>,
    pub photo_url: Option<String>,
    pub channel_handle: Option<String>,
}

/// Probe X-Goog-AuthUser indices 0..N and return all distinct Google accounts
/// available in the current cookie jar.
///
/// Stops when a request fails, returns an empty account list, or a
/// (name, channel_handle) pair that was already seen. Capped at 10 probes.
#[tauri::command]
pub async fn yt_detect_google_accounts(
    state: State<'_, Arc<RwLock<YtMusicState>>>,
) -> Result<Vec<GoogleAccountInfo>, String> {
    println!("[yt_detect_google_accounts] Starting account detection...");

    // Clone cookies and drop the lock before any network I/O.
    let cookies = {
        let guard = state.read().await;
        guard.cookies.clone()
    };

    let cookies = cookies.ok_or_else(|| "[yt_detect_google_accounts] Not authenticated".to_string())?;

    const MAX_AUTH_USER: u32 = 10;

    // Build all 10 clients up-front, then fire get_accounts() in parallel.
    // Previously this loop was sequential, causing 5-10s of startup latency.
    let probes = (0..MAX_AUTH_USER).filter_map(|auth_user| {
        match YtMusicClient::from_cookies(&cookies, auth_user) {
            Ok(client) => Some((auth_user, client)),
            Err(e) => {
                println!("[yt_detect_google_accounts] Failed to build client for auth_user={auth_user}: {e}");
                None
            }
        }
    });

    let futures = probes.map(|(auth_user, client)| async move {
        let result = client.get_accounts().await;
        (auth_user, result)
    });

    let results = futures::future::join_all(futures).await;

    let mut accounts: Vec<GoogleAccountInfo> = Vec::new();
    let mut seen_keys: HashSet<(String, Option<String>)> = HashSet::new();

    // Iterate in auth_user order to keep dedup deterministic (first wins).
    for (auth_user, result) in results {
        let account_list = match result {
            Ok(list) => list,
            Err(e) => {
                println!("[yt_detect_google_accounts] get_accounts error for auth_user={auth_user}: {e}. Skipping.");
                continue;
            }
        };

        if account_list.is_empty() {
            println!("[yt_detect_google_accounts] Empty account list at auth_user={auth_user}. Skipping.");
            continue;
        }

        let identity = account_list.iter().find(|a| a.is_active)
            .or_else(|| account_list.first());

        let Some(identity) = identity else {
            println!("[yt_detect_google_accounts] No identity found for auth_user={auth_user}. Skipping.");
            continue;
        };

        let key = (identity.name.clone(), identity.channel_handle.clone());
        if seen_keys.contains(&key) {
            println!(
                "[yt_detect_google_accounts] Duplicate identity at auth_user={auth_user}. Skipping."
            );
            continue;
        }

        println!(
            "[yt_detect_google_accounts] Found account: auth_user={auth_user}, has_email={}, has_handle={}",
            identity.email.is_some(),
            identity.channel_handle.is_some()
        );
        seen_keys.insert(key);
        accounts.push(GoogleAccountInfo {
            auth_user,
            name: identity.name.clone(),
            email: identity.email.clone(),
            photo_url: identity.photo_url.clone(),
            channel_handle: identity.channel_handle.clone(),
        });
    }

    println!("[yt_detect_google_accounts] Detection complete. Found {} account(s).", accounts.len());
    Ok(accounts)
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
    state: &Arc<RwLock<YtMusicState>>,
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
        let st = state.read().await;
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
            let st = state.read().await;
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
    state: State<'_, Arc<RwLock<YtMusicState>>>,
    activity: State<'_, Arc<SessionActivity>>,
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
    let (page, continuation) = with_session_refresh(
        &state,
        &app,
        &activity,
        "yt_load_playlist",
        |client| {
            let id = remote_playlist_id.clone();
            async move { client.get_playlist(&id).await }
        },
    )
    .await
    .map_err(|e| format!("[yt_load_playlist] API error: {e}"))?;

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
        let activity_arc = activity.inner().clone();
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
            const MAX_CONTINUATION_PAGES: usize = 200;
            let mut page_count: usize = 0;

            loop {
                page_count += 1;
                if page_count > MAX_CONTINUATION_PAGES {
                    eprintln!(
                        "[yt_load_playlist:bg] Hit MAX_CONTINUATION_PAGES ({MAX_CONTINUATION_PAGES}) for {pid}, stopping"
                    );
                    break;
                }

                // Throttle between API calls
                tokio::time::sleep(std::time::Duration::from_millis(300)).await;

                println!("[yt_load_playlist:bg] Fetching continuation for {pid} offset={offset}");
                let fetch_result = with_session_refresh(
                    &state_arc,
                    &app_handle,
                    &activity_arc,
                    "yt_load_playlist:bg",
                    |client| {
                        let t = token.clone();
                        async move { client.get_playlist_continuation(&t).await }
                    },
                )
                .await;

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
    validate_vec_len(&video_ids, MAX_TRACK_IDS, "yt_get_cached_tracks")?;
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
    state: State<'_, Arc<RwLock<YtMusicState>>>,
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
    let limit = limit.min(MAX_WINDOW_LIMIT);
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
    validate_vec_len(&snapshot.tracks, MAX_COLLECTION_TRACKS, "yt_cache_collection_snapshot")?;
    validate_string_len(&snapshot.collection_id, MAX_STRING_LEN, "collection_id")?;
    validate_string_len(&snapshot.title, MAX_STRING_LEN, "title")?;
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
    app: AppHandle,
    state: State<'_, Arc<RwLock<YtMusicState>>>,
    activity: State<'_, Arc<SessionActivity>>,
) -> Result<String, String> {
    println!(
        "[yt_create_playlist] title=\"{}\" privacy={:?} video_ids={}",
        input.title,
        input.privacy_status,
        input.video_ids.as_ref().map(|ids| ids.len()).unwrap_or(0)
    );
    let title = input.title.clone();
    let description = input.description.clone().unwrap_or_default();
    let privacy = input.privacy_status.clone().unwrap_or_else(|| "PRIVATE".to_string());
    let video_ids = input.video_ids.clone().unwrap_or_default();
    let response = with_session_refresh(
        &state,
        &app,
        &activity,
        "yt_create_playlist",
        |client| {
            let title = title.clone();
            let description = description.clone();
            let privacy = privacy.clone();
            let video_ids = video_ids.clone();
            async move {
                client
                    .create_playlist(&title, &description, &privacy, &video_ids)
                    .await
            }
        },
    )
    .await
    .map_err(|e| format!("[yt_create_playlist] {e}"))?;
    serde_json::to_string(&response)
        .map_err(|e| format!("[yt_create_playlist] serialization: {e}"))
}

#[tauri::command]
pub async fn yt_delete_playlist(
    playlist_id: String,
    app: AppHandle,
    state: State<'_, Arc<RwLock<YtMusicState>>>,
    activity: State<'_, Arc<SessionActivity>>,
) -> Result<String, String> {
    println!("[yt_delete_playlist] playlist_id={}", playlist_id);
    let response = with_session_refresh(
        &state,
        &app,
        &activity,
        "yt_delete_playlist",
        |client| {
            let id = playlist_id.clone();
            async move { client.delete_playlist(&id).await }
        },
    )
    .await
    .map_err(|e| format!("[yt_delete_playlist] {e}"))?;
    serde_json::to_string(&response)
        .map_err(|e| format!("[yt_delete_playlist] serialization: {e}"))
}

#[tauri::command]
pub async fn yt_edit_playlist(
    input: EditPlaylistInput,
    app: AppHandle,
    state: State<'_, Arc<RwLock<YtMusicState>>>,
    activity: State<'_, Arc<SessionActivity>>,
    cache: State<'_, Arc<tokio::sync::Mutex<PlaylistCache>>>,
) -> Result<String, String> {
    println!(
        "[yt_edit_playlist] playlist_id={} title={} description={} privacy={:?}",
        input.playlist_id,
        input.title.is_some(),
        input.description.is_some(),
        input.privacy_status
    );

    let pid = input.playlist_id.clone();
    let title = input.title.clone();
    let description = input.description.clone();
    let privacy = input.privacy_status.clone();

    with_session_refresh(
        &state,
        &app,
        &activity,
        "yt_edit_playlist:edit",
        |client| {
            let pid = pid.clone();
            let title = title.clone();
            let description = description.clone();
            let privacy = privacy.clone();
            async move {
                client
                    .edit_playlist(
                        &pid,
                        title.as_deref(),
                        description.as_deref(),
                        privacy.as_deref(),
                    )
                    .await
            }
        },
    )
    .await
    .map_err(|e| format!("[yt_edit_playlist] edit: {e}"))?;

    let updated_page = with_session_refresh(
        &state,
        &app,
        &activity,
        "yt_edit_playlist:refresh",
        |client| {
            let pid = pid.clone();
            async move { client.get_playlist(&pid).await }
        },
    )
    .await
    .map_err(|e| format!("[yt_edit_playlist] refresh: {e}"))?
    .0;

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
    app: AppHandle,
    state: State<'_, Arc<RwLock<YtMusicState>>>,
    activity: State<'_, Arc<SessionActivity>>,
    cache: State<'_, Arc<tokio::sync::Mutex<PlaylistCache>>>,
) -> Result<String, String> {
    println!(
        "[yt_set_playlist_thumbnail] playlist_id={} bytes={} mime={}",
        input.playlist_id,
        input.image_bytes.len(),
        input.mime_type
    );

    // SECURITY: Cap image size at 10 MB
    const MAX_IMAGE_BYTES: usize = 10 * 1024 * 1024;
    if input.image_bytes.len() > MAX_IMAGE_BYTES {
        return Err(format!(
            "[yt_set_playlist_thumbnail] Image too large: {} bytes (max {})",
            input.image_bytes.len(),
            MAX_IMAGE_BYTES
        ));
    }

    // SECURITY: Only allow known image MIME types
    const ALLOWED_MIMES: &[&str] = &["image/jpeg", "image/png", "image/webp"];
    if !ALLOWED_MIMES.contains(&input.mime_type.as_str()) {
        return Err(format!(
            "[yt_set_playlist_thumbnail] Invalid mime_type: '{}' (allowed: {:?})",
            input.mime_type, ALLOWED_MIMES
        ));
    }

    let pid = input.playlist_id.clone();
    let image_bytes = input.image_bytes.clone();
    let mime_type = input.mime_type.clone();

    with_session_refresh(
        &state,
        &app,
        &activity,
        "yt_set_playlist_thumbnail:apply",
        |client| {
            let pid = pid.clone();
            let bytes = image_bytes.clone();
            let mime = mime_type.clone();
            async move { client.set_playlist_thumbnail(&pid, &bytes, &mime).await }
        },
    )
    .await
    .map_err(|e| format!("[yt_set_playlist_thumbnail] apply: {e}"))?;

    let updated_page = with_session_refresh(
        &state,
        &app,
        &activity,
        "yt_set_playlist_thumbnail:refresh",
        |client| {
            let pid = pid.clone();
            async move { client.get_playlist(&pid).await }
        },
    )
    .await
    .map_err(|e| format!("[yt_set_playlist_thumbnail] refresh: {e}"))?
    .0;

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
    app: AppHandle,
    state: State<'_, Arc<RwLock<YtMusicState>>>,
    activity: State<'_, Arc<SessionActivity>>,
) -> Result<String, String> {
    validate_vec_len(&video_ids, MAX_PLAYLIST_ITEMS, "yt_add_playlist_items")?;
    println!(
        "[yt_add_playlist_items] playlist_id={} video_ids={} source_playlist_id={:?}",
        playlist_id,
        video_ids.len(),
        source_playlist_id
    );
    let response = with_session_refresh(
        &state,
        &app,
        &activity,
        "yt_add_playlist_items",
        |client| {
            let pid = playlist_id.clone();
            let vids = video_ids.clone();
            let src = source_playlist_id.clone();
            async move {
                client
                    .add_playlist_items(&pid, &vids, src.as_deref())
                    .await
            }
        },
    )
    .await
    .map_err(|e| format!("[yt_add_playlist_items] {e}"))?;
    serde_json::to_string(&response)
        .map_err(|e| format!("[yt_add_playlist_items] serialization: {e}"))
}

#[tauri::command]
pub async fn yt_remove_playlist_items(
    playlist_id: String,
    items: Vec<PlaylistItemRemoveInput>,
    app: AppHandle,
    state: State<'_, Arc<RwLock<YtMusicState>>>,
    activity: State<'_, Arc<SessionActivity>>,
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
    let response = with_session_refresh(
        &state,
        &app,
        &activity,
        "yt_remove_playlist_items",
        |client| {
            let pid = playlist_id.clone();
            let items = items.clone();
            async move { client.remove_playlist_items(&pid, &items).await }
        },
    )
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
    let limit = limit.min(MAX_WINDOW_LIMIT);
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
    validate_vec_len(&track_ids, MAX_TRACK_IDS, "yt_queue_set")?;
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
    let limit = limit.min(MAX_WINDOW_LIMIT);
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

    // Radio mode — lazy continuation trigger. When the user is playing the
    // final couple of tracks in the current radio pool, fetch one more page
    // so playback continues smoothly. This is the "natural end of playback"
    // path; the other path is the scroll-triggered `yt_radio_load_more`.
    // Kept deliberately lazy (<= 2) so idle radios don't burn API calls.
    {
        let q = queue.lock().await;
        if let Some(rs) = q.radio_state() {
            let remaining = q.remaining_after_current();
            let should_continue = remaining <= 2
                && !rs.pool_exhausted
                && rs.continuation.is_some()
                && !rs.fetching;
            drop(q);
            if should_continue {
                println!(
                    "[yt_queue_handle_track_end] radio low ({remaining} remaining) — spawning continuation"
                );
                let app_clone = app.clone();
                tokio::spawn(async move {
                    continue_radio_background(app_clone).await;
                });
            }
        }
    }

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
    validate_vec_len(&track_ids, MAX_TRACK_IDS, "yt_queue_add_collection_next")?;
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
    validate_vec_len(&track_ids, MAX_TRACK_IDS, "yt_queue_append_collection")?;
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

// ---------------------------------------------------------------------------
// Radio helpers (Task 7)
// ---------------------------------------------------------------------------

/// Converts a `WatchTrack` (watch/next endpoint shape) into a `CachedTrack`
/// (SQLite cache shape). Drops `like_status`, `video_type`, and `views` because
/// the cache schema doesn't store them.
fn cached_from_watch(t: &WatchTrack) -> CachedTrack {
    let artists: Vec<CachedArtist> = t
        .artists
        .iter()
        .map(|a| CachedArtist {
            name: a.name.clone(),
            id: a.id.clone(),
        })
        .collect();

    let album = t.album.as_ref().map(|a| CachedAlbum {
        id: a.id.clone().unwrap_or_default(),
        name: a.name.clone(),
    });

    let thumbnails = t
        .thumbnails
        .first()
        .map(|th| {
            vec![CachedThumbnail {
                url: th.url.clone(),
                width: th.width,
                height: th.height,
            }]
        })
        .unwrap_or_default();

    let duration = t.length.clone().unwrap_or_default();
    let duration_seconds = playlist_cache::parse_duration(t.length.as_deref());

    CachedTrack {
        video_id: t.video_id.clone(),
        set_video_id: None,
        title: t.title.clone(),
        artists,
        album,
        duration,
        duration_seconds,
        thumbnails,
    }
}

/// Build a `WatchPlaylistRequest` from a `RadioSeed`. Video and Artist seeds use
/// the video-radio endpoint; Playlist and Album seeds use the playlist-radio
/// endpoint (their IDs share the `PL`/`OLA` prefix the parser needs).
fn radio_request<'a>(seed: &'a RadioSeed, limit: usize) -> WatchPlaylistRequest<'a> {
    match seed.kind {
        RadioSeedKind::Video | RadioSeedKind::Artist => {
            WatchPlaylistRequest::for_video_radio(&seed.id, limit)
        }
        RadioSeedKind::Playlist | RadioSeedKind::Album => {
            WatchPlaylistRequest::for_playlist_radio(&seed.id, limit)
        }
    }
}

/// Extend the queue with the next page of radio tracks using the stored
/// continuation token. Spawned from `yt_queue_handle_track_end` (Task 9) when
/// the queue runs low. Caches the new tracks into `collection_tracks` under
/// `collection_type = "radio"` so the frontend can resolve them via
/// `get_tracks_by_ids`. Emits `radio-extended` on success so the frontend can
/// invalidate any cached pages.
pub async fn continue_radio_background(app: AppHandle) {
    println!("[continue_radio] start");

    let state = app.state::<Arc<RwLock<YtMusicState>>>();
    let activity = app.state::<Arc<SessionActivity>>();
    let queue = app.state::<Arc<tokio::sync::Mutex<PlaybackQueue>>>();

    // 1. Snapshot radio_state without holding the queue lock across I/O.
    //    Also claim the `fetching` in-flight guard so the scroll-triggered
    //    `yt_radio_load_more` can't race against us.
    let (token, is_playlist_seed, collection_id) = {
        let mut q = queue.lock().await;
        let Some(rs) = q.radio_state_mut() else {
            println!("[continue_radio] queue no longer in radio mode — aborting");
            return;
        };
        if rs.pool_exhausted {
            println!("[continue_radio] pool already exhausted — aborting");
            return;
        }
        if rs.fetching {
            println!("[continue_radio] another fetch in flight — aborting");
            return;
        }
        let Some(tok) = rs.continuation.clone() else {
            println!("[continue_radio] no continuation token — aborting");
            return;
        };
        rs.fetching = true;
        let is_playlist =
            matches!(rs.seed.kind, RadioSeedKind::Playlist | RadioSeedKind::Album);
        let coll_id = format!("{}:{}", rs.seed.kind.as_str(), rs.seed.id);
        (tok, is_playlist, coll_id)
    };

    // 2. Fetch the next page via with_session_refresh so 401s recover.
    let result = session::with_session_refresh(
        &state,
        &app,
        &activity,
        "continue_radio",
        |client| {
            let tok = token.clone();
            async move {
                client
                    .get_watch_playlist_continuation(&tok, is_playlist_seed)
                    .await
            }
        },
    )
    .await;

    let page = match result {
        Ok(p) => p,
        Err(e) => {
            println!("[continue_radio] error: {e} — aborting");
            // Release the in-flight guard so future triggers can retry.
            let mut q = queue.lock().await;
            if let Some(rs) = q.radio_state_mut() {
                rs.fetching = false;
            }
            return;
        }
    };

    let track_ids: Vec<String> = page.tracks.iter().map(|t| t.video_id.clone()).collect();
    let cached: Vec<CachedTrack> = page.tracks.iter().map(cached_from_watch).collect();

    // 3. Cache tracks so get_tracks_by_ids can resolve them. Radio tracks live
    //    in collection_tracks with collection_type = "radio". We use the current
    //    row count as start_pos to append rather than overwrite prior pages.
    //    Cache write is best-effort: queue append proceeds even if cache fails.
    if !cached.is_empty() {
        let cache_state = app.state::<Arc<tokio::sync::Mutex<PlaylistCache>>>();
        let cache_guard = cache_state.lock().await;
        match cache_guard.collection_track_count("radio", &collection_id) {
            Ok(start_pos) => {
                let rows = playlist_cache::cached_tracks_to_rows(&cached);
                if let Err(e) = cache_guard.save_collection_tracks("radio", &collection_id, start_pos, &rows) {
                    println!("[continue_radio] save_collection_tracks error: {e}");
                }
            }
            Err(e) => {
                println!("[continue_radio] collection_track_count error: {e} — skipping cache write");
            }
        }
    }

    // 4. Append to queue and update RadioState.
    let added = {
        let mut q = queue.lock().await;
        let added = q.append_radio_batch(&track_ids);
        let exhausted = track_ids.is_empty() || page.continuation.is_none();
        if let Some(rs) = q.radio_state_mut() {
            rs.continuation = page.continuation.clone();
            rs.loaded_count += added;
            rs.fetching = false;
            if exhausted {
                rs.pool_exhausted = true;
                println!("[continue_radio] pool_exhausted=true");
            }
        }
        if exhausted {
            q.set_is_complete(true);
        }
        added
    };

    // 5. Notify frontend with the current snapshot so it can sync
    //    totalLoaded/isComplete without invalidating cached pages.
    let snapshot_payload = {
        let q = queue.lock().await;
        q.snapshot()
    };
    let _ = app.emit("radio-extended", &snapshot_payload);
    println!("[continue_radio] done — added {added} tracks");
}

// ---------------------------------------------------------------------------
// Radio commands (Task 8)
// ---------------------------------------------------------------------------

/// Starts a radio from any seed (video/playlist/album/artist): fetches the
/// first page, writes the radio cache, resets the queue, and installs
/// `RadioState` so continuation and re-roll know the seed. Returns the queue
/// command response as a JSON string.
#[tauri::command]
pub async fn yt_radio_start(
    seed_kind: String,
    seed_id: String,
    app: AppHandle,
    state: State<'_, Arc<RwLock<YtMusicState>>>,
    activity: State<'_, Arc<SessionActivity>>,
    queue: State<'_, Arc<tokio::sync::Mutex<PlaybackQueue>>>,
) -> Result<String, String> {
    println!("[yt_radio_start] seed_kind={seed_kind} seed_id={seed_id}");

    validate_string_len(&seed_kind, MAX_STRING_LEN, "yt_radio_start seed_kind")?;
    validate_string_len(&seed_id, MAX_STRING_LEN, "yt_radio_start seed_id")?;
    if seed_id.is_empty() {
        return Err("[yt_radio_start] seed_id is empty".into());
    }

    let kind = RadioSeedKind::parse(&seed_kind)
        .ok_or_else(|| format!("[yt_radio_start] invalid seed_kind={seed_kind}"))?;
    let seed = RadioSeed {
        kind,
        id: seed_id.clone(),
    };

    // First page — request 50 tracks for low-latency start.
    let page = session::with_session_refresh(
        &state,
        &app,
        &activity,
        "yt_radio_start",
        |client| {
            let r = radio_request(&seed, 50);
            async move { client.get_watch_playlist(r).await }
        },
    )
    .await
    .map_err(|e| format!("[yt_radio_start] {e}"))?;

    let track_ids: Vec<String> = page.tracks.iter().map(|t| t.video_id.clone()).collect();
    if track_ids.is_empty() {
        return Err("[yt_radio_start] radio returned no tracks".into());
    }

    let cached: Vec<CachedTrack> = page.tracks.iter().map(cached_from_watch).collect();
    let collection_id = format!("{}:{}", kind.as_str(), seed_id);

    // Best-effort cache write — failure to cache is logged but not fatal.
    {
        let cache_state = app.state::<Arc<tokio::sync::Mutex<PlaylistCache>>>();
        let cache_guard = cache_state.lock().await;
        let rows = playlist_cache::cached_tracks_to_rows(&cached);
        // Fresh start — overwrite any previous radio rows for this seed from
        // position 0.
        if let Err(e) = cache_guard.save_collection_tracks("radio", &collection_id, 0, &rows) {
            println!("[yt_radio_start] save_collection_tracks error: {e}");
        }
    }

    let loaded_count = track_ids.len();
    let continuation = page.continuation.clone();
    let has_more = continuation.is_some();
    let response = {
        let mut q = queue.lock().await;
        // `set_queue` clears radio_state automatically (Task 5 behavior), so we
        // install the fresh RadioState immediately after.
        let resp = q.set_queue(
            track_ids,
            0,
            None,
            /* is_complete */ !has_more,
            /* shuffle */ false,
        );
        q.set_radio_state(RadioState {
            seed,
            continuation,
            pool_exhausted: !has_more,
            loaded_count,
            fetching: false,
        });
        // Rebuild the response so `snapshot.is_radio` reflects the installed
        // RadioState.
        QueueCommandResponse {
            track_id: resp.track_id,
            snapshot: q.snapshot(),
        }
    };

    emit_queue_state_updated(&app, &response.snapshot);

    // Demand-driven model: NO background loop. The queue sheet triggers
    // `yt_radio_load_more` on scroll, and `yt_queue_handle_track_end` spawns
    // a single `continue_radio_background` when the queue runs low.
    let _ = has_more;

    println!(
        "[yt_radio_start] loaded {} tracks, is_radio={}",
        loaded_count, response.snapshot.is_radio
    );

    serde_json::to_string(&response)
        .map_err(|e| format!("[yt_radio_start] serialization: {e}"))
}

/// Re-rolls the current radio: fetches a fresh page from the same seed,
/// truncates the queue after the current track, and appends the new tracks.
/// The current track is preserved and filtered from the new batch to avoid
/// duplicating it. Updates `RadioState` with the new continuation token.
#[tauri::command]
pub async fn yt_radio_reroll(
    app: AppHandle,
    state: State<'_, Arc<RwLock<YtMusicState>>>,
    activity: State<'_, Arc<SessionActivity>>,
    queue: State<'_, Arc<tokio::sync::Mutex<PlaybackQueue>>>,
) -> Result<String, String> {
    println!("[yt_radio_reroll] entering");

    // 1. Clone the seed WITHOUT holding lock during network I/O.
    let seed = {
        let q = queue.lock().await;
        let Some(rs) = q.radio_state() else {
            return Err("[yt_radio_reroll] not in radio mode".into());
        };
        rs.seed.clone()
    };

    // 2. Fetch a fresh page of the same radio.
    let page = session::with_session_refresh(
        &state,
        &app,
        &activity,
        "yt_radio_reroll",
        |client| {
            let r = radio_request(&seed, 50);
            async move { client.get_watch_playlist(r).await }
        },
    )
    .await
    .map_err(|e| format!("[yt_radio_reroll] {e}"))?;

    let track_ids: Vec<String> = page.tracks.iter().map(|t| t.video_id.clone()).collect();
    if track_ids.is_empty() {
        return Err("[yt_radio_reroll] radio returned no tracks".into());
    }

    // 3. Best-effort cache write (fresh seed start — overwrite at position 0).
    let cached: Vec<CachedTrack> = page.tracks.iter().map(cached_from_watch).collect();
    let collection_id = format!("{}:{}", seed.kind.as_str(), seed.id);
    {
        let cache_state = app.state::<Arc<tokio::sync::Mutex<PlaylistCache>>>();
        let cache_guard = cache_state.lock().await;
        let rows = playlist_cache::cached_tracks_to_rows(&cached);
        if let Err(e) = cache_guard.save_collection_tracks("radio", &collection_id, 0, &rows) {
            println!("[yt_radio_reroll] save_collection_tracks error: {e}");
        }
    }

    // 4. Truncate queue after current track, then append new tracks
    //    (filter out any that match the current track to avoid duplicating it).
    let has_more = page.continuation.is_some();
    let response = {
        let mut q = queue.lock().await;
        let current = q.current_track_id();
        let removed = q.truncate_after_current();
        let track_ids_to_append: Vec<String> = track_ids
            .iter()
            .filter(|id| Some(id.as_str()) != current.as_deref())
            .cloned()
            .collect();
        let added = q.append_radio_batch(&track_ids_to_append);
        if let Some(rs) = q.radio_state_mut() {
            rs.continuation = page.continuation.clone();
            rs.loaded_count = added;
            rs.pool_exhausted = !has_more;
            rs.fetching = false;
        }
        // Sync is_complete: if reroll fetched a page with continuation,
        // recover a previously stale is_complete=true.
        q.set_is_complete(!has_more);
        println!(
            "[yt_radio_reroll] removed={} added={} pool_exhausted={}",
            removed,
            added,
            q.radio_state()
                .map(|rs| rs.pool_exhausted)
                .unwrap_or(false)
        );
        QueueCommandResponse {
            track_id: q.current_track_id(),
            snapshot: q.snapshot(),
        }
    };

    // 5. Sync frontend.
    emit_queue_state_updated(&app, &response.snapshot);

    // Demand-driven: no background loop. Continuation is fetched lazily by
    // `yt_radio_load_more` (scroll) or `continue_radio_background` (track end).

    serde_json::to_string(&response)
        .map_err(|e| format!("[yt_radio_reroll] serialization: {e}"))
}

/// Fetches ONE continuation page of radio tracks on demand (scroll-triggered).
/// Returns the updated `QueueCommandResponse` inline so the frontend can apply
/// the snapshot immediately. Does NOT emit `radio-extended` — the caller already
/// has the snapshot.
#[tauri::command]
pub async fn yt_radio_load_more(
    app: AppHandle,
    state: State<'_, Arc<RwLock<YtMusicState>>>,
    activity: State<'_, Arc<SessionActivity>>,
    queue: State<'_, Arc<tokio::sync::Mutex<PlaybackQueue>>>,
) -> Result<String, String> {
    println!("[yt_radio_load_more] entering");

    // In-flight guard: check if another load is running.
    let (token, is_playlist_seed, collection_id) = {
        let mut q = queue.lock().await;
        let Some(rs) = q.radio_state_mut() else {
            return Err("[yt_radio_load_more] not in radio mode".into());
        };
        if rs.pool_exhausted {
            // Nothing more to load — return current snapshot.
            let snapshot = q.snapshot();
            let track_id = q.current_track_id();
            let response = QueueCommandResponse { track_id, snapshot };
            return serde_json::to_string(&response)
                .map_err(|e| format!("[yt_radio_load_more] serialization: {e}"));
        }
        if rs.fetching {
            println!("[yt_radio_load_more] another fetch in flight — returning current snapshot");
            let snapshot = q.snapshot();
            let track_id = q.current_track_id();
            let response = QueueCommandResponse { track_id, snapshot };
            return serde_json::to_string(&response)
                .map_err(|e| format!("[yt_radio_load_more] serialization: {e}"));
        }
        let Some(tok) = rs.continuation.clone() else {
            return Err("[yt_radio_load_more] no continuation token".into());
        };
        rs.fetching = true;

        let is_playlist = matches!(rs.seed.kind, RadioSeedKind::Playlist | RadioSeedKind::Album);
        let coll_id = format!("{}:{}", rs.seed.kind.as_str(), rs.seed.id);
        (tok, is_playlist, coll_id)
    };

    // Fetch one continuation page.
    let result = session::with_session_refresh(
        &state,
        &app,
        &activity,
        "yt_radio_load_more",
        |client| {
            let tok = token.clone();
            async move { client.get_watch_playlist_continuation(&tok, is_playlist_seed).await }
        },
    )
    .await;

    // Release the fetching flag regardless of outcome.
    let page = match result {
        Ok(p) => p,
        Err(e) => {
            let mut q = queue.lock().await;
            if let Some(rs) = q.radio_state_mut() {
                rs.fetching = false;
            }
            return Err(format!("[yt_radio_load_more] {e}"));
        }
    };

    let track_ids: Vec<String> = page.tracks.iter().map(|t| t.video_id.clone()).collect();
    let cached: Vec<CachedTrack> = page.tracks.iter().map(cached_from_watch).collect();

    // Best-effort cache write.
    if !cached.is_empty() {
        let cache_state = app.state::<Arc<tokio::sync::Mutex<PlaylistCache>>>();
        let cache_guard = cache_state.lock().await;
        match cache_guard.collection_track_count("radio", &collection_id) {
            Ok(start_pos) => {
                let rows = playlist_cache::cached_tracks_to_rows(&cached);
                if let Err(e) =
                    cache_guard.save_collection_tracks("radio", &collection_id, start_pos, &rows)
                {
                    println!("[yt_radio_load_more] save_collection_tracks error: {e}");
                }
            }
            Err(e) => {
                println!(
                    "[yt_radio_load_more] collection_track_count error: {e} — skipping cache write"
                );
            }
        }
    }

    // Append to queue and update radio state.
    let response = {
        let mut q = queue.lock().await;
        let added = q.append_radio_batch(&track_ids);
        if let Some(rs) = q.radio_state_mut() {
            rs.continuation = page.continuation.clone();
            rs.loaded_count += added;
            rs.fetching = false;
            if track_ids.is_empty() || page.continuation.is_none() {
                rs.pool_exhausted = true;
                println!("[yt_radio_load_more] pool_exhausted=true");
            }
        }
        q.set_is_complete(page.continuation.is_none());
        println!(
            "[yt_radio_load_more] added {} tracks, total={}",
            added,
            q.snapshot().total_loaded
        );
        QueueCommandResponse {
            track_id: q.current_track_id(),
            snapshot: q.snapshot(),
        }
    };

    serde_json::to_string(&response)
        .map_err(|e| format!("[yt_radio_load_more] serialization: {e}"))
}
