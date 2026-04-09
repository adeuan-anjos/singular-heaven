# Rust-First Playlist Cache Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Move playlist data ownership from WebView to Rust with SQLite cache — frontend queries on demand, background fetch fills the cache, zero bulk data transfer through IPC.

**Architecture:** Rust fetches InnerTube, parses, stores in SQLite. Frontend receives only track IDs + compact metadata for the initial batch. Background `tokio::task` fetches all continuations to SQLite. Frontend resolves tracks on-demand from SQLite via batched IPC calls. L1 RAM cache (LRU 200) + L2 disk cache (SQLite) = minimal memory footprint.

**Tech Stack:** rusqlite (bundled SQLite), tokio::spawn, Tauri events, Zustand, @tanstack/react-virtual

---

## File Map

| Action | File | Responsibility |
|--------|------|---------------|
| Create | `src-tauri/src/playlist_cache.rs` | SQLite cache: schema, save, read, track resolution |
| Modify | `src-tauri/Cargo.toml` | Add `rusqlite` dependency |
| Modify | `src-tauri/src/lib.rs` | Register cache state, new commands, module |
| Modify | `src-tauri/src/youtube_music/commands.rs` | New commands: load_playlist, get_cached_tracks, get_track_ids |
| Modify | `src/modules/youtube-music/stores/track-cache-store.ts` | L1 LRU 200 + batched async L2 fallback |
| Modify | `src/modules/youtube-music/stores/queue-store.ts` | Event-driven queue growth, remove API-based loadMore |
| Modify | `src/modules/youtube-music/stores/player-store.ts` | Simplify _onTrackEnd (no continuation logic) |
| Modify | `src/modules/youtube-music/components/pages/playlist-page.tsx` | Call yt_load_playlist, pass trackIds to queue |
| Modify | `src/modules/youtube-music/index.tsx` | Updated handlePlayAll with playlistId |
| Modify | `src/modules/youtube-music/services/yt-api.ts` | Add new invoke wrappers |

---

### Task 1: SQLite Cache Infrastructure

**Files:**
- Create: `src-tauri/src/playlist_cache.rs`
- Modify: `src-tauri/Cargo.toml`

- [ ] **Step 1: Add rusqlite dependency**

In `src-tauri/Cargo.toml`, add to `[dependencies]`:

```toml
rusqlite = { version = "0.32", features = ["bundled"] }
```

The `bundled` feature compiles SQLite from source — no system dependency needed. Critical for cross-platform (Windows/macOS/Linux).

- [ ] **Step 2: Create playlist_cache.rs**

Create `src-tauri/src/playlist_cache.rs` with the complete SQLite cache module:

```rust
use rusqlite::{params, Connection, Result as SqlResult};
use serde::{Deserialize, Serialize};
use std::path::Path;
use std::time::{SystemTime, UNIX_EPOCH};

// ── Types returned to frontend (match TS Track shape exactly) ──

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CachedTrack {
    pub video_id: String,
    pub title: String,
    pub artists: Vec<CachedArtist>,
    pub album: Option<CachedAlbum>,
    pub duration: String,
    pub duration_seconds: f64,
    pub thumbnails: Vec<CachedThumbnail>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CachedArtist {
    pub name: String,
    pub id: Option<String>,
}

#[derive(Debug, Clone, Serialize)]
pub struct CachedAlbum {
    pub id: String,
    pub name: String,
}

#[derive(Debug, Clone, Serialize)]
pub struct CachedThumbnail {
    pub url: String,
    pub width: u32,
    pub height: u32,
}

// ── Cache implementation ──

pub struct PlaylistCache {
    conn: Connection,
}

impl PlaylistCache {
    pub fn open(app_data_dir: &Path) -> SqlResult<Self> {
        let db_path = app_data_dir.join("yt_cache.db");
        std::fs::create_dir_all(app_data_dir).ok();
        let conn = Connection::open(&db_path)?;

        println!("[PlaylistCache] Opened database at {}", db_path.display());

        conn.execute_batch(
            "PRAGMA journal_mode = WAL;
             PRAGMA synchronous = NORMAL;

             CREATE TABLE IF NOT EXISTS playlist_meta (
                 playlist_id TEXT PRIMARY KEY,
                 title TEXT NOT NULL,
                 author_name TEXT,
                 author_id TEXT,
                 track_count TEXT,
                 thumbnail_url TEXT,
                 is_complete INTEGER DEFAULT 0,
                 cached_at INTEGER NOT NULL
             );

             CREATE TABLE IF NOT EXISTS playlist_tracks (
                 playlist_id TEXT NOT NULL,
                 position INTEGER NOT NULL,
                 video_id TEXT NOT NULL,
                 title TEXT NOT NULL,
                 artists_json TEXT NOT NULL DEFAULT '[]',
                 album_name TEXT,
                 album_id TEXT,
                 duration TEXT,
                 duration_secs REAL DEFAULT 0,
                 thumbnail_url TEXT,
                 PRIMARY KEY (playlist_id, position)
             );

             CREATE INDEX IF NOT EXISTS idx_tracks_video_id
                 ON playlist_tracks(video_id);",
        )?;

        println!("[PlaylistCache] Schema initialized");
        Ok(Self { conn })
    }

    /// Save playlist header metadata.
    pub fn save_meta(
        &self,
        playlist_id: &str,
        title: &str,
        author_name: Option<&str>,
        author_id: Option<&str>,
        track_count: Option<&str>,
        thumbnail_url: Option<&str>,
    ) -> SqlResult<()> {
        println!(
            "[PlaylistCache] save_meta playlist_id={} title={}",
            playlist_id, title
        );
        self.conn.execute(
            "INSERT OR REPLACE INTO playlist_meta
             (playlist_id, title, author_name, author_id, track_count, thumbnail_url, is_complete, cached_at)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, 0, ?7)",
            params![
                playlist_id,
                title,
                author_name,
                author_id,
                track_count,
                thumbnail_url,
                now_timestamp(),
            ],
        )?;
        Ok(())
    }

    /// Save a batch of tracks at given starting position. Uses a transaction for performance.
    pub fn save_tracks(
        &self,
        playlist_id: &str,
        start_pos: usize,
        tracks: &[(String, String, String, Option<String>, Option<String>, Option<String>, f64, Option<String>)],
        // Fields: (video_id, title, artists_json, album_name, album_id, duration, duration_secs, thumbnail_url)
    ) -> SqlResult<usize> {
        let tx = self.conn.unchecked_transaction()?;
        let mut count = 0;
        {
            let mut stmt = tx.prepare_cached(
                "INSERT OR REPLACE INTO playlist_tracks
                 (playlist_id, position, video_id, title, artists_json, album_name, album_id, duration, duration_secs, thumbnail_url)
                 VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10)",
            )?;
            for (i, t) in tracks.iter().enumerate() {
                stmt.execute(params![
                    playlist_id,
                    start_pos + i,
                    t.0, // video_id
                    t.1, // title
                    t.2, // artists_json
                    t.3, // album_name
                    t.4, // album_id
                    t.5, // duration
                    t.6, // duration_secs
                    t.7, // thumbnail_url
                ])?;
                count += 1;
            }
        }
        tx.commit()?;
        println!(
            "[PlaylistCache] save_tracks playlist_id={} start={} count={}",
            playlist_id, start_pos, count
        );
        Ok(count)
    }

    /// Mark playlist as fully fetched.
    pub fn mark_complete(&self, playlist_id: &str) -> SqlResult<()> {
        println!("[PlaylistCache] mark_complete playlist_id={}", playlist_id);
        self.conn.execute(
            "UPDATE playlist_meta SET is_complete = 1 WHERE playlist_id = ?1",
            params![playlist_id],
        )?;
        Ok(())
    }

    /// Check if playlist is fully cached.
    pub fn is_complete(&self, playlist_id: &str) -> SqlResult<bool> {
        let result: i32 = self
            .conn
            .query_row(
                "SELECT is_complete FROM playlist_meta WHERE playlist_id = ?1",
                params![playlist_id],
                |row| row.get(0),
            )
            .unwrap_or(0);
        Ok(result == 1)
    }

    /// Get total cached track count for a playlist.
    pub fn track_count(&self, playlist_id: &str) -> SqlResult<usize> {
        let count: usize = self
            .conn
            .query_row(
                "SELECT COUNT(*) FROM playlist_tracks WHERE playlist_id = ?1",
                params![playlist_id],
                |row| row.get(0),
            )
            .unwrap_or(0);
        Ok(count)
    }

    /// Get all video IDs for a playlist, ordered by position.
    pub fn get_track_ids(&self, playlist_id: &str) -> SqlResult<Vec<String>> {
        let mut stmt = self.conn.prepare(
            "SELECT video_id FROM playlist_tracks WHERE playlist_id = ?1 ORDER BY position",
        )?;
        let ids: Vec<String> = stmt
            .query_map(params![playlist_id], |row| row.get(0))?
            .filter_map(|r| r.ok())
            .collect();
        println!(
            "[PlaylistCache] get_track_ids playlist_id={} count={}",
            playlist_id,
            ids.len()
        );
        Ok(ids)
    }

    /// Resolve tracks by video IDs. Returns CachedTrack objects matching the frontend Track shape.
    pub fn get_tracks_by_ids(&self, video_ids: &[String]) -> SqlResult<Vec<CachedTrack>> {
        if video_ids.is_empty() {
            return Ok(vec![]);
        }
        let placeholders: String = video_ids.iter().map(|_| "?").collect::<Vec<_>>().join(",");
        let sql = format!(
            "SELECT video_id, title, artists_json, album_name, album_id, duration, duration_secs, thumbnail_url
             FROM playlist_tracks WHERE video_id IN ({}) GROUP BY video_id",
            placeholders
        );
        let mut stmt = self.conn.prepare(&sql)?;
        let params_vec: Vec<Box<dyn rusqlite::types::ToSql>> =
            video_ids.iter().map(|s| Box::new(s.clone()) as Box<dyn rusqlite::types::ToSql>).collect();
        let param_refs: Vec<&dyn rusqlite::types::ToSql> = params_vec.iter().map(|b| b.as_ref()).collect();

        let tracks: Vec<CachedTrack> = stmt
            .query_map(param_refs.as_slice(), |row| {
                let artists_json: String = row.get(2)?;
                let artists: Vec<CachedArtist> =
                    serde_json::from_str(&artists_json).unwrap_or_default();
                let album_name: Option<String> = row.get(3)?;
                let album_id: Option<String> = row.get(4)?;
                let thumb_url: Option<String> = row.get(7)?;

                Ok(CachedTrack {
                    video_id: row.get(0)?,
                    title: row.get(1)?,
                    artists,
                    album: album_name.map(|name| CachedAlbum {
                        id: album_id.unwrap_or_default(),
                        name,
                    }),
                    duration: row.get::<_, Option<String>>(5)?.unwrap_or_default(),
                    duration_seconds: row.get(6)?,
                    thumbnails: thumb_url
                        .map(|url| vec![CachedThumbnail { url, width: 226, height: 226 }])
                        .unwrap_or_default(),
                })
            })?
            .filter_map(|r| r.ok())
            .collect();

        println!(
            "[PlaylistCache] get_tracks_by_ids requested={} found={}",
            video_ids.len(),
            tracks.len()
        );
        Ok(tracks)
    }
}

// ── Helpers ──

fn now_timestamp() -> i64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_secs() as i64
}

/// Parse "3:49" or "1:23:45" to seconds.
pub fn parse_duration(dur: Option<&str>) -> f64 {
    match dur {
        None => 0.0,
        Some(s) => {
            let parts: Vec<f64> = s.split(':').filter_map(|p| p.parse().ok()).collect();
            match parts.len() {
                3 => parts[0] * 3600.0 + parts[1] * 60.0 + parts[2],
                2 => parts[0] * 60.0 + parts[1],
                1 => parts[0],
                _ => 0.0,
            }
        }
    }
}

/// Convert a Vec<PlaylistTrack> (from ytmusic-api crate) into the tuple format for save_tracks.
pub fn playlist_tracks_to_rows(
    tracks: &[ytmusic_api::types::playlist::PlaylistTrack],
) -> Vec<(String, String, String, Option<String>, Option<String>, Option<String>, f64, Option<String>)> {
    tracks
        .iter()
        .map(|t| {
            let artists_json = serde_json::to_string(&t.artists).unwrap_or_else(|_| "[]".into());
            let (album_name, album_id) = match &t.album {
                Some(a) => (Some(a.name.clone()), a.id.clone()),
                None => (None, None),
            };
            let thumb_url = t.thumbnails.first().map(|th| th.url.clone());
            let dur_secs = parse_duration(t.duration.as_deref());
            (
                t.video_id.clone(),
                t.title.clone(),
                artists_json,
                album_name,
                album_id,
                t.duration.clone(),
                dur_secs,
                thumb_url,
            )
        })
        .collect()
}

/// Convert a Vec<PlaylistTrack> to Vec<CachedTrack> (for returning to frontend).
pub fn playlist_tracks_to_cached(
    tracks: &[ytmusic_api::types::playlist::PlaylistTrack],
) -> Vec<CachedTrack> {
    tracks
        .iter()
        .map(|t| {
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
            CachedTrack {
                video_id: t.video_id.clone(),
                title: t.title.clone(),
                artists,
                album,
                duration: t.duration.clone().unwrap_or_default(),
                duration_seconds: parse_duration(t.duration.as_deref()),
                thumbnails,
            }
        })
        .collect()
}
```

- [ ] **Step 3: Verify compilation**

```bash
cd src-tauri && cargo check
```

Expected: Compiles (playlist_cache.rs is not yet referenced from lib.rs, so it won't be compiled. Add `mod playlist_cache;` in lib.rs temporarily or skip — Task 2 will wire it up).

- [ ] **Step 4: Commit**

```bash
git add src-tauri/Cargo.toml src-tauri/src/playlist_cache.rs
git commit -m "feat: add playlist_cache.rs with SQLite schema and CRUD operations"
```

---

### Task 2: New Tauri Commands + Background Fetch

**Files:**
- Modify: `src-tauri/src/youtube_music/commands.rs`
- Modify: `src-tauri/src/lib.rs`

- [ ] **Step 1: Add new commands to commands.rs**

Add these 3 commands at the end of `src-tauri/src/youtube_music/commands.rs`:

```rust
use crate::playlist_cache::{self, PlaylistCache};

/// Load a playlist: fetch from API, cache in SQLite, return compact data.
/// Spawns a background task to fetch all remaining tracks.
#[tauri::command]
pub async fn yt_load_playlist(
    playlist_id: String,
    state: State<'_, Arc<Mutex<YtMusicState>>>,
    cache: State<'_, Arc<tokio::sync::Mutex<PlaylistCache>>>,
    app: tauri::AppHandle,
) -> Result<String, String> {
    println!("[yt_load_playlist] playlist_id={}", playlist_id);

    // 1. Fetch first batch from InnerTube
    let (page, continuation) = {
        let s = state.lock().await;
        s.client
            .get_playlist(&playlist_id)
            .await
            .map_err(|e| format!("[yt_load_playlist] API error: {e}"))?
    };

    println!(
        "[yt_load_playlist] got {} tracks, has_continuation={}",
        page.tracks.len(),
        continuation.is_some()
    );

    // 2. Save to SQLite
    let track_ids: Vec<String>;
    let cached_tracks: Vec<playlist_cache::CachedTrack>;
    {
        let c = cache.lock().await;
        let thumb_url = page.thumbnails.first().map(|t| t.url.as_str());
        let author_name = page.author.as_ref().map(|a| a.name.as_str());
        let author_id = page.author.as_ref().and_then(|a| a.id.as_deref());
        c.save_meta(
            &playlist_id,
            &page.title,
            author_name,
            author_id,
            page.track_count.as_deref(),
            thumb_url,
        )
        .map_err(|e| format!("[yt_load_playlist] DB meta error: {e}"))?;

        let rows = playlist_cache::playlist_tracks_to_rows(&page.tracks);
        c.save_tracks(&playlist_id, 0, &rows)
            .map_err(|e| format!("[yt_load_playlist] DB tracks error: {e}"))?;

        track_ids = page.tracks.iter().map(|t| t.video_id.clone()).collect();
        cached_tracks = playlist_cache::playlist_tracks_to_cached(&page.tracks);

        if continuation.is_none() {
            c.mark_complete(&playlist_id)
                .map_err(|e| format!("[yt_load_playlist] DB complete error: {e}"))?;
        }
    }

    let is_complete = continuation.is_none();

    // 3. Spawn background fetch for remaining tracks
    if let Some(token) = continuation {
        let client_state = state.inner().clone();
        let cache_state = cache.inner().clone();
        let app_handle = app.clone();
        let pid = playlist_id.clone();
        let initial_count = page.tracks.len();

        tokio::spawn(async move {
            println!("[background_fetch] Starting for playlist_id={}", pid);
            let mut current_token = Some(token);
            let mut offset = initial_count;

            while let Some(tok) = current_token.take() {
                // Throttle: 300ms between requests
                tokio::time::sleep(std::time::Duration::from_millis(300)).await;

                // Fetch next batch
                let fetch_result = {
                    let s = client_state.lock().await;
                    s.client.get_playlist_continuation(&tok).await
                };

                match fetch_result {
                    Ok((tracks, next_token)) => {
                        let new_ids: Vec<String> =
                            tracks.iter().map(|t| t.video_id.clone()).collect();
                        let batch_count = tracks.len();

                        // Save to SQLite
                        {
                            let c = cache_state.lock().await;
                            let rows = playlist_cache::playlist_tracks_to_rows(&tracks);
                            if let Err(e) = c.save_tracks(&pid, offset, &rows) {
                                eprintln!("[background_fetch] DB error: {e}");
                                break;
                            }

                            let is_done = next_token.is_none();
                            if is_done {
                                c.mark_complete(&pid).ok();
                            }

                            let total = c.track_count(&pid).unwrap_or(offset + batch_count);

                            // Emit event to frontend
                            let _ = app_handle.emit(
                                "playlist-tracks-updated",
                                serde_json::json!({
                                    "playlistId": pid,
                                    "newTrackIds": new_ids,
                                    "totalTracks": total,
                                    "isComplete": is_done,
                                }),
                            );

                            println!(
                                "[background_fetch] playlist_id={} saved {} tracks (offset={}), total={}, complete={}",
                                pid, batch_count, offset, total, is_done
                            );
                        }

                        offset += batch_count;
                        current_token = next_token;
                    }
                    Err(e) => {
                        eprintln!("[background_fetch] API error for {}: {e}", pid);
                        break;
                    }
                }
            }
            println!("[background_fetch] Finished for playlist_id={}", pid);
        });
    }

    // 4. Return compact response (tracks as CachedTrack = matches TS Track shape)
    let response = serde_json::json!({
        "playlistId": page.playlist_id,
        "title": page.title,
        "author": page.author,
        "trackCount": page.track_count,
        "thumbnails": page.thumbnails,
        "tracks": cached_tracks,
        "trackIds": track_ids,
        "isComplete": is_complete,
    });

    serde_json::to_string(&response)
        .map_err(|e| format!("[yt_load_playlist] serialization: {e}"))
}

/// Resolve tracks by video IDs from SQLite cache.
#[tauri::command]
pub async fn yt_get_cached_tracks(
    video_ids: Vec<String>,
    cache: State<'_, Arc<tokio::sync::Mutex<PlaylistCache>>>,
) -> Result<String, String> {
    println!("[yt_get_cached_tracks] requested {} ids", video_ids.len());
    let c = cache.lock().await;
    let tracks = c
        .get_tracks_by_ids(&video_ids)
        .map_err(|e| format!("[yt_get_cached_tracks] DB error: {e}"))?;
    println!("[yt_get_cached_tracks] found {} tracks", tracks.len());
    serde_json::to_string(&tracks)
        .map_err(|e| format!("[yt_get_cached_tracks] serialization: {e}"))
}

/// Get all cached video IDs for a playlist, ordered by position.
#[tauri::command]
pub async fn yt_get_playlist_track_ids(
    playlist_id: String,
    cache: State<'_, Arc<tokio::sync::Mutex<PlaylistCache>>>,
) -> Result<String, String> {
    println!("[yt_get_playlist_track_ids] playlist_id={}", playlist_id);
    let c = cache.lock().await;
    let ids = c
        .get_track_ids(&playlist_id)
        .map_err(|e| format!("[yt_get_playlist_track_ids] DB error: {e}"))?;
    let is_complete = c.is_complete(&playlist_id).unwrap_or(false);
    let response = serde_json::json!({
        "trackIds": ids,
        "isComplete": is_complete,
    });
    serde_json::to_string(&response)
        .map_err(|e| format!("[yt_get_playlist_track_ids] serialization: {e}"))
}
```

Add these imports at the top of commands.rs (alongside existing imports):

```rust
use crate::playlist_cache::{self, PlaylistCache};
```

- [ ] **Step 2: Wire up in lib.rs**

In `src-tauri/src/lib.rs`:

1. Add module declaration near the top (alongside `mod thumb_cache;`):
```rust
mod playlist_cache;
```

2. In the `setup` hook, after creating `YtMusicState`, initialize the cache and add to managed state:
```rust
// After: app.manage(Arc::new(Mutex::new(state)));
// Add:
let cache = playlist_cache::PlaylistCache::open(&app_data_dir)
    .map_err(|e| format!("Failed to open playlist cache: {e}"))?;
app.manage(Arc::new(tokio::sync::Mutex::new(cache)));
```

3. In `invoke_handler`, add the 3 new commands:
```rust
yt_load_playlist,
yt_get_cached_tracks,
yt_get_playlist_track_ids,
```

- [ ] **Step 3: Verify compilation**

```bash
cd src-tauri && cargo check
```

Expected: 0 errors.

- [ ] **Step 4: Commit**

```bash
git add src-tauri/src/playlist_cache.rs src-tauri/src/youtube_music/commands.rs src-tauri/src/lib.rs src-tauri/Cargo.toml
git commit -m "feat: yt_load_playlist + background fetch + SQLite cache commands"
```

---

### Task 3: Frontend Stores Migration

**Files:**
- Modify: `src/modules/youtube-music/stores/track-cache-store.ts`
- Modify: `src/modules/youtube-music/stores/queue-store.ts`
- Modify: `src/modules/youtube-music/stores/player-store.ts`

- [ ] **Step 1: Rewrite track-cache-store.ts**

The store becomes a thin L1 cache (LRU 200) with batched async L2 fallback to Rust/SQLite.

Key changes:
- `MAX_CACHE_SIZE` reduced from 3000 to 200
- New batch fetch mechanism using `requestAnimationFrame` to coalesce L1 misses
- `useTrack` hook triggers async batch fetch on miss
- `fetchFromDisk(videoIds)` — batch invoke to Rust

```typescript
import { create } from "zustand";
import { invoke } from "@tauri-apps/api/core";
import type { Track } from "../types/music";

const MAX_CACHE_SIZE = 200;

interface TrackCacheState {
  tracks: Record<string, Track>;
}

interface TrackCacheActions {
  putTracks: (tracks: Track[]) => void;
  putTrack: (track: Track) => void;
  getTrack: (videoId: string) => Track | undefined;
  clear: () => void;
}

export type TrackCacheStore = TrackCacheState & TrackCacheActions;

export const useTrackCacheStore = create<TrackCacheStore>()((set, get) => ({
  tracks: {},

  putTracks: (tracks) => {
    set((state) => {
      const next = { ...state.tracks };
      for (const track of tracks) {
        if (track.videoId) {
          next[track.videoId] = track;
        }
      }
      // LRU eviction
      const keys = Object.keys(next);
      if (keys.length > MAX_CACHE_SIZE) {
        const toRemove = keys.slice(0, keys.length - MAX_CACHE_SIZE);
        for (const key of toRemove) {
          delete next[key];
        }
      }
      return { tracks: next };
    });
    console.log("[TrackCache] putTracks", {
      added: tracks.length,
      total: Object.keys(get().tracks).length,
    });
  },

  putTrack: (track) => {
    if (!track.videoId) return;
    set((state) => ({
      tracks: { ...state.tracks, [track.videoId]: track },
    }));
  },

  getTrack: (videoId) => get().tracks[videoId],

  clear: () => {
    console.log("[TrackCache] clear");
    set({ tracks: {} });
  },
}));

// ── Batched L2 (disk) fetch mechanism ──

let pendingIds = new Set<string>();
let batchTimer: number | null = null;

function scheduleBatchFetch() {
  if (batchTimer !== null) return;
  batchTimer = requestAnimationFrame(() => {
    batchTimer = null;
    const ids = Array.from(pendingIds);
    pendingIds.clear();
    if (ids.length === 0) return;

    console.log("[TrackCache] L2 batch fetch", { count: ids.length, ids: ids.slice(0, 5) });
    invoke<string>("yt_get_cached_tracks", { videoIds: ids })
      .then((json) => {
        const tracks: Track[] = JSON.parse(json);
        console.log("[TrackCache] L2 batch resolved", { requested: ids.length, found: tracks.length });
        if (tracks.length > 0) {
          useTrackCacheStore.getState().putTracks(tracks);
        }
      })
      .catch((err) => console.error("[TrackCache] L2 batch fetch error", err));
  });
}

function requestTrackFromDisk(videoId: string) {
  pendingIds.add(videoId);
  scheduleBatchFetch();
}

// ── Hook with L1 + L2 fallback ──

import { useEffect } from "react";

/** Resolve a track: L1 (RAM) first, async L2 (disk) fallback. */
export function useTrack(videoId: string | undefined): Track | undefined {
  const cached = useTrackCacheStore((s) => (videoId ? s.tracks[videoId] : undefined));

  useEffect(() => {
    if (videoId && !cached) {
      requestTrackFromDisk(videoId);
    }
  }, [videoId, cached]);

  return cached;
}
```

- [ ] **Step 2: Rewrite queue-store.ts**

Major changes:
- Remove `continuationToken`, `isLoadingMore`, `loadMore()` — no more API-based continuation
- Add `playlistId: string | null` and `isComplete: boolean`
- Add `appendTrackIds(ids)` for background event handler
- The event listener is set up in index.tsx (not inside the store)
- Keep proactive prefetch concept but now it's a no-op (queue grows via events)

```typescript
import { create } from "zustand";
import { subscribeWithSelector } from "zustand/middleware";

interface QueueState {
  trackIds: string[];
  currentIndex: number;
  playlistId: string | null;
  isComplete: boolean;
}

interface QueueActions {
  setQueue: (trackIds: string[], startIndex?: number, playlistId?: string | null, isComplete?: boolean) => void;
  appendTrackIds: (newIds: string[]) => void;
  markComplete: () => void;
  addToQueue: (trackId: string) => void;
  addNext: (trackId: string) => void;
  removeFromQueue: (index: number) => void;
  next: () => string | null;
  previous: () => string | null;
  playIndex: (index: number) => string | null;
  cleanup: () => void;
}

export type QueueStore = QueueState & QueueActions;

export const useQueueStore = create<QueueStore>()(
  subscribeWithSelector((set, get) => ({
    trackIds: [],
    currentIndex: -1,
    playlistId: null,
    isComplete: true,

    setQueue: (trackIds, startIndex = 0, playlistId = null, isComplete = true) => {
      console.log("[QueueStore] setQueue", {
        count: trackIds.length,
        startIndex,
        playlistId,
        isComplete,
      });
      set({ trackIds, currentIndex: startIndex, playlistId, isComplete });
    },

    appendTrackIds: (newIds) => {
      const { trackIds, playlistId } = get();
      const existingSet = new Set(trackIds);
      const unique = newIds.filter((id) => !existingSet.has(id));
      if (unique.length === 0) return;
      console.log("[QueueStore] appendTrackIds", {
        new: unique.length,
        total: trackIds.length + unique.length,
        playlistId,
      });
      set({ trackIds: [...trackIds, ...unique] });
    },

    markComplete: () => {
      console.log("[QueueStore] markComplete");
      set({ isComplete: true });
    },

    addToQueue: (trackId) => {
      console.log("[QueueStore] addToQueue", { trackId });
      set((state) => ({ trackIds: [...state.trackIds, trackId] }));
    },

    addNext: (trackId) => {
      const { currentIndex, trackIds } = get();
      console.log("[QueueStore] addNext", { trackId, afterIndex: currentIndex });
      const next = [...trackIds];
      next.splice(currentIndex + 1, 0, trackId);
      set({ trackIds: next });
    },

    removeFromQueue: (index) => {
      console.log("[QueueStore] removeFromQueue", { index });
      set((state) => {
        const newIds = state.trackIds.filter((_, i) => i !== index);
        const newIndex =
          index < state.currentIndex ? state.currentIndex - 1 : state.currentIndex;
        return { trackIds: newIds, currentIndex: newIndex };
      });
    },

    next: () => {
      const { currentIndex, trackIds } = get();
      if (currentIndex < trackIds.length - 1) {
        const nextIndex = currentIndex + 1;
        console.log("[QueueStore] next", { from: currentIndex, to: nextIndex });
        set({ currentIndex: nextIndex });
        return trackIds[nextIndex];
      }
      console.log("[QueueStore] next — end of queue");
      return null;
    },

    previous: () => {
      const { currentIndex, trackIds } = get();
      if (currentIndex > 0) {
        const prevIndex = currentIndex - 1;
        console.log("[QueueStore] previous", { from: currentIndex, to: prevIndex });
        set({ currentIndex: prevIndex });
        return trackIds[prevIndex];
      }
      console.log("[QueueStore] previous — beginning of queue");
      return null;
    },

    playIndex: (index) => {
      const { trackIds } = get();
      const trackId = trackIds[index];
      if (trackId) {
        console.log("[QueueStore] playIndex", { index });
        set({ currentIndex: index });
        return trackId;
      }
      console.log("[QueueStore] playIndex — invalid index", { index });
      return null;
    },

    cleanup: () => {
      console.log("[QueueStore] cleanup");
      set({ trackIds: [], currentIndex: -1, playlistId: null, isComplete: true });
    },
  }))
);
```

- [ ] **Step 3: Simplify player-store.ts _onTrackEnd**

In `player-store.ts`, replace the `_onTrackEnd` method. Remove the continuation-based loadMore logic. Now it simply checks the queue and handles repeat modes.

Replace the `_onTrackEnd` method with:

```typescript
_onTrackEnd: () => {
  const { repeat, currentTrackId } = get();

  if (repeat === "one" && currentTrackId) {
    console.log("[PlayerStore] repeat one — replaying");
    const el = getAudio();
    el.currentTime = 0;
    el.play();
    return;
  }

  const queueState = useQueueStore.getState();
  const nextId = queueState.next();

  if (nextId) {
    console.log("[PlayerStore] Playing next from queue", { videoId: nextId });
    get().play(nextId);
  } else if (repeat === "all") {
    const firstId = queueState.playIndex(0);
    if (firstId) {
      console.log("[PlayerStore] repeat all — looping to start");
      get().play(firstId);
    }
  } else {
    console.log("[PlayerStore] Queue ended, isComplete=", queueState.isComplete);
    set({ isPlaying: false });
  }
},
```

Also remove the `import { useTrackCacheStore }` if it was only used for logging in `play()`. Check: if `play()` uses `useTrackCacheStore.getState().getTrack(videoId)` for logging, keep the import. Only remove the continuation/loadMore imports.

- [ ] **Step 4: Verify compilation**

```bash
npx tsc --noEmit
```

Expected: 0 errors.

- [ ] **Step 5: Commit**

```bash
git add src/modules/youtube-music/stores/track-cache-store.ts src/modules/youtube-music/stores/queue-store.ts src/modules/youtube-music/stores/player-store.ts
git commit -m "refactor: stores use L1+L2 cache, event-driven queue, no frontend continuations"
```

---

### Task 4: Frontend Pages + Event Wiring

**Files:**
- Modify: `src/modules/youtube-music/services/yt-api.ts`
- Modify: `src/modules/youtube-music/components/pages/playlist-page.tsx`
- Modify: `src/modules/youtube-music/index.tsx`

- [ ] **Step 1: Add new API wrappers to yt-api.ts**

Add at the end of yt-api.ts:

```typescript
// ── Cached playlist commands ──

export interface LoadPlaylistResponse {
  playlistId: string;
  title: string;
  author: { name: string; id: string | null } | null;
  trackCount: string | null;
  thumbnails: { url: string; width: number; height: number }[];
  tracks: Track[];
  trackIds: string[];
  isComplete: boolean;
}

export async function ytLoadPlaylist(playlistId: string): Promise<LoadPlaylistResponse> {
  const json = await invoke<string>("yt_load_playlist", { playlistId });
  return parseJson(json);
}

export interface PlaylistTrackIdsResponse {
  trackIds: string[];
  isComplete: boolean;
}

export async function ytGetPlaylistTrackIds(playlistId: string): Promise<PlaylistTrackIdsResponse> {
  const json = await invoke<string>("yt_get_playlist_track_ids", { playlistId });
  return parseJson(json);
}

export async function ytGetCachedTracks(videoIds: string[]): Promise<Track[]> {
  const json = await invoke<string>("yt_get_cached_tracks", { videoIds });
  return parseJson(json);
}
```

Add the `Track` import at the top if not present:
```typescript
import type { Track } from "../types/music";
```

- [ ] **Step 2: Update playlist-page.tsx**

Key changes:
- Call `ytLoadPlaylist` instead of `ytGetPlaylist` + `mapPlaylistPage`
- Remove `continuationRef` — no more continuation tokens in frontend
- `onPlayAll` now receives `trackIds` and `playlistId` alongside tracks
- `loadMore` reads from SQLite cache instead of calling API

The playlist page now:
1. Calls `ytLoadPlaylist(playlistId)` → gets `{ tracks, trackIds, isComplete, ... }`
2. Sets local state with tracks (for display) and metadata
3. On "Play All" → passes `tracks` (for L1 cache) + `trackIds` + `playlistId` + `isComplete` to parent
4. `loadMore` → calls `ytGetPlaylistTrackIds` to get all IDs, then `ytGetCachedTracks` for the new ones

Update the `onPlayAll` prop type to:
```typescript
onPlayAll: (tracks: Track[], startIndex?: number, playlistId?: string, isComplete?: boolean) => void;
```

Replace the data fetching `useEffect` to use `ytLoadPlaylist`:
```typescript
useEffect(() => {
  let cancelled = false;
  setLoading(true);
  setError(null);

  ytLoadPlaylist(playlistId).then((data) => {
    if (cancelled) return;
    console.log("[PlaylistPage] loaded", { title: data.title, tracks: data.tracks.length, isComplete: data.isComplete });
    setPlaylist({
      playlistId: data.playlistId,
      title: data.title,
      author: data.author ?? { id: null, name: "Unknown" },
      trackCount: data.trackCount ? parseInt(data.trackCount) : undefined,
      thumbnails: data.thumbnails,
      tracks: data.tracks,
    });
    trackIdsRef.current = data.trackIds;
    isCompleteRef.current = data.isComplete;
    setLoading(false);
  }).catch((err) => {
    if (cancelled) return;
    console.error("[PlaylistPage] load error", err);
    setError(String(err));
    setLoading(false);
  });

  return () => { cancelled = true; };
}, [playlistId]);
```

Add refs for tracking queue-related data (not in React state — avoids re-renders):
```typescript
const trackIdsRef = useRef<string[]>([]);
const isCompleteRef = useRef(false);
```

Update the `onPlay` callback to pass queue context:
```typescript
onPlay: (track) => {
  const tracks = playlist?.tracks ?? [];
  const index = tracks.findIndex((t) => t.videoId === track.videoId);
  if (index >= 0) {
    onPlayAll(tracks, index, playlistId, isCompleteRef.current);
  } else {
    onPlayTrack(track);
  }
},
```

Update the "Reproduzir" and "Aleatório" buttons:
```typescript
{ label: "Reproduzir", icon: Play, onClick: () => onPlayAll(tracks, 0, playlistId, isCompleteRef.current) },
{ label: "Aleatório", icon: Shuffle, onClick: () => {
  const shuffled = [...tracks].sort(() => Math.random() - 0.5);
  onPlayAll(shuffled, 0, playlistId, isCompleteRef.current);
}},
```

Replace the `loadMore` function (if it exists) with one that reads from SQLite:
```typescript
const loadMore = useCallback(async () => {
  if (loadingMoreRef.current || !playlist) return;
  loadingMoreRef.current = true;
  try {
    const { trackIds: allIds } = await ytGetPlaylistTrackIds(playlistId);
    const existingIds = new Set(playlist.tracks.map((t) => t.videoId));
    const newIds = allIds.filter((id) => !existingIds.has(id)).slice(0, 100);
    if (newIds.length === 0) {
      loadingMoreRef.current = false;
      return;
    }
    const newTracks = await ytGetCachedTracks(newIds);
    console.log("[PlaylistPage] loadMore from cache", { new: newTracks.length });
    setPlaylist((prev) =>
      prev ? { ...prev, tracks: [...prev.tracks, ...newTracks] } : prev
    );
    trackIdsRef.current = allIds;
  } catch (err) {
    console.error("[PlaylistPage] loadMore error", err);
  } finally {
    loadingMoreRef.current = false;
  }
}, [playlist, playlistId]);
```

- [ ] **Step 3: Update index.tsx**

Key changes:
- `handlePlayAll` signature adds `playlistId` and `isComplete`
- Cache tracks in L1, set queue with IDs + playlistId
- Set up Tauri event listener for `playlist-tracks-updated`
- Clean up listener on unmount

Update handlePlayAll:
```typescript
const handlePlayAll = useCallback(
  (tracks: Track[], startIndex?: number, playlistId?: string, isComplete?: boolean) => {
    if (tracks.length === 0) return;
    const idx = startIndex ?? 0;
    console.log("[YouTubeMusicModule] handlePlayAll", {
      count: tracks.length,
      startIndex: idx,
      playlistId,
      isComplete,
    });
    trackCachePut(tracks);
    const ids = tracks.map((t) => t.videoId).filter(Boolean);
    playerPlay(ids[idx]);
    queueSetQueue(ids, idx, playlistId ?? null, isComplete ?? true);
  },
  [playerPlay, queueSetQueue, trackCachePut]
);
```

Add event listener setup in the auth-complete useEffect or a new useEffect:
```typescript
import { listen, type UnlistenFn } from "@tauri-apps/api/event";

// Inside the component, after auth check:
useEffect(() => {
  let unlisten: UnlistenFn | null = null;

  listen<{ playlistId: string; newTrackIds: string[]; totalTracks: number; isComplete: boolean }>(
    "playlist-tracks-updated",
    (event) => {
      const { playlistId, newTrackIds, totalTracks, isComplete } = event.payload;
      const queueState = useQueueStore.getState();
      if (queueState.playlistId === playlistId) {
        console.log("[YouTubeMusicModule] playlist-tracks-updated", {
          playlistId,
          newTracks: newTrackIds.length,
          totalTracks,
          isComplete,
        });
        queueState.appendTrackIds(newTrackIds);
        if (isComplete) {
          queueState.markComplete();
        }
      }
    }
  ).then((fn) => {
    unlisten = fn;
  });

  return () => {
    unlisten?.();
  };
}, []);
```

Update the `queueSetQueue` selector to include the new signature:
```typescript
const queueSetQueue = useQueueStore((s) => s.setQueue);
```

(This already works because the store's `setQueue` accepts the new optional params.)

- [ ] **Step 4: Verify compilation**

```bash
npx tsc --noEmit
```

Expected: 0 errors.

- [ ] **Step 5: Commit**

```bash
git add src/modules/youtube-music/services/yt-api.ts src/modules/youtube-music/components/pages/playlist-page.tsx src/modules/youtube-music/index.tsx
git commit -m "feat: playlist page uses Rust SQLite cache, event-driven queue growth"
```

---

### Task 5: Full Verification

- [ ] **Step 1: TypeScript check**

```bash
npx tsc --noEmit
```

- [ ] **Step 2: Rust check**

```bash
cd src-tauri && cargo check
```

- [ ] **Step 3: Dev build**

```bash
npm run tauri dev
```

- [ ] **Step 4: Manual test scenarios**

| Scenario | Expected | Debug log to verify |
|----------|----------|-------------------|
| Open playlist with 900+ tracks | Page loads ~100 tracks, no 140MB RAM spike | `[yt_load_playlist]` shows track count, `[PlaylistCache] save_tracks` |
| Background fetch runs | Console shows batches being saved | `[background_fetch]` logs with offset/total |
| Event reaches frontend | Queue grows as batches arrive | `[QueueStore] appendTrackIds` with increasing totals |
| Click "Play All" | Playback starts, queue has IDs | `[QueueStore] setQueue` with playlistId |
| Play through tracks | Next track loads, no gap | `[PlayerStore] Playing next from queue` |
| Queue grows past 100 | New IDs appended via events | `[QueueStore] appendTrackIds` |
| Open queue sheet | Shows tracks, virtual scroll, auto-scrolls to current | `[QueueSheet] render`, `[TrackCache] L2 batch fetch` |
| Scroll queue sheet to position 500 | Tracks load from SQLite on demand | `[TrackCache] L2 batch fetch` with new IDs |
| Repeat All after all tracks played | Loops to track 0 | `[PlayerStore] repeat all — looping to start` |
| RAM usage on playlist | Should be <100MB (not 240MB) | Task Manager |
| CPU idle with paused track | 0% CPU | Task Manager |

- [ ] **Step 5: Commit plan file**

```bash
git add docs/superpowers/plans/2026-04-08-rust-first-playlist-cache.md
git commit -m "docs: add Rust-first playlist cache implementation plan"
```
