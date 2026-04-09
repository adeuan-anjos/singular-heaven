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

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CachedPlaylistMeta {
    pub playlist_id: String,
    pub title: String,
    pub author_name: Option<String>,
    pub author_id: Option<String>,
    pub track_count: Option<String>,
    pub thumbnail_url: Option<String>,
    pub is_complete: bool,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CachedPlaylistWindowItem {
    pub position: usize,
    #[serde(flatten)]
    pub track: CachedTrack,
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

    /// Clear cached rows for a playlist before a fresh fetch.
    pub fn clear_playlist_tracks(&self, playlist_id: &str) -> SqlResult<()> {
        println!(
            "[PlaylistCache] clear_playlist_tracks playlist_id={}",
            playlist_id
        );
        self.conn.execute(
            "DELETE FROM playlist_tracks WHERE playlist_id = ?1",
            params![playlist_id],
        )?;
        Ok(())
    }

    /// Save a batch of tracks at given starting position. Uses a transaction for performance.
    pub fn save_tracks(
        &self,
        playlist_id: &str,
        start_pos: usize,
        tracks: &[(
            String,
            String,
            String,
            Option<String>,
            Option<String>,
            Option<String>,
            f64,
            Option<String>,
        )],
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

    /// Get cached playlist metadata if present.
    pub fn get_meta(&self, playlist_id: &str) -> SqlResult<Option<CachedPlaylistMeta>> {
        let mut stmt = self.conn.prepare(
            "SELECT playlist_id, title, author_name, author_id, track_count, thumbnail_url, is_complete
             FROM playlist_meta
             WHERE playlist_id = ?1",
        )?;

        let mut rows = stmt.query(params![playlist_id])?;
        let Some(row) = rows.next()? else {
            println!("[PlaylistCache] get_meta playlist_id={} miss", playlist_id);
            return Ok(None);
        };

        let meta = CachedPlaylistMeta {
            playlist_id: row.get(0)?,
            title: row.get(1)?,
            author_name: row.get(2)?,
            author_id: row.get(3)?,
            track_count: row.get(4)?,
            thumbnail_url: row.get(5)?,
            is_complete: row.get::<_, i32>(6)? == 1,
        };

        println!(
            "[PlaylistCache] get_meta playlist_id={} hit complete={}",
            playlist_id, meta.is_complete
        );

        Ok(Some(meta))
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
            .filter_map(|r| match r {
                Ok(v) => Some(v),
                Err(e) => {
                    eprintln!("[PlaylistCache] row parse error: {e}");
                    None
                }
            })
            .collect();
        println!(
            "[PlaylistCache] get_track_ids playlist_id={} count={}",
            playlist_id,
            ids.len()
        );
        Ok(ids)
    }

    /// Get all cached tracks for a playlist, ordered by position.
    pub fn get_tracks_for_playlist(&self, playlist_id: &str) -> SqlResult<Vec<CachedTrack>> {
        let mut stmt = self.conn.prepare(
            "SELECT video_id, title, artists_json, album_name, album_id, duration, duration_secs, thumbnail_url
             FROM playlist_tracks
             WHERE playlist_id = ?1
             ORDER BY position",
        )?;

        let tracks: Vec<CachedTrack> = stmt
            .query_map(params![playlist_id], |row| {
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
            .filter_map(|r| match r {
                Ok(v) => Some(v),
                Err(e) => {
                    eprintln!("[PlaylistCache] row parse error: {e}");
                    None
                }
            })
            .collect();

        println!(
            "[PlaylistCache] get_tracks_for_playlist playlist_id={} count={}",
            playlist_id,
            tracks.len()
        );

        Ok(tracks)
    }

    /// Get a window of cached playlist tracks, ordered by position.
    pub fn get_playlist_window(
        &self,
        playlist_id: &str,
        offset: usize,
        limit: usize,
    ) -> SqlResult<Vec<CachedPlaylistWindowItem>> {
        let mut stmt = self.conn.prepare(
            "SELECT position, video_id, title, artists_json, album_name, album_id, duration, duration_secs, thumbnail_url
             FROM playlist_tracks
             WHERE playlist_id = ?1
             ORDER BY position
             LIMIT ?2 OFFSET ?3",
        )?;

        let items: Vec<CachedPlaylistWindowItem> = stmt
            .query_map(params![playlist_id, limit, offset], |row| {
                let artists_json: String = row.get(3)?;
                let artists: Vec<CachedArtist> =
                    serde_json::from_str(&artists_json).unwrap_or_default();
                let album_name: Option<String> = row.get(4)?;
                let album_id: Option<String> = row.get(5)?;
                let thumb_url: Option<String> = row.get(8)?;

                Ok(CachedPlaylistWindowItem {
                    position: row.get(0)?,
                    track: CachedTrack {
                        video_id: row.get(1)?,
                        title: row.get(2)?,
                        artists,
                        album: album_name.map(|name| CachedAlbum {
                            id: album_id.unwrap_or_default(),
                            name,
                        }),
                        duration: row.get::<_, Option<String>>(6)?.unwrap_or_default(),
                        duration_seconds: row.get(7)?,
                        thumbnails: thumb_url
                            .map(|url| vec![CachedThumbnail { url, width: 226, height: 226 }])
                            .unwrap_or_default(),
                    },
                })
            })?
            .filter_map(|r| match r {
                Ok(v) => Some(v),
                Err(e) => {
                    eprintln!("[PlaylistCache] row parse error: {e}");
                    None
                }
            })
            .collect();

        println!(
            "[PlaylistCache] get_playlist_window playlist_id={} offset={} limit={} count={}",
            playlist_id,
            offset,
            limit,
            items.len()
        );

        Ok(items)
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
        let params_vec: Vec<Box<dyn rusqlite::types::ToSql>> = video_ids
            .iter()
            .map(|s| Box::new(s.clone()) as Box<dyn rusqlite::types::ToSql>)
            .collect();
        let param_refs: Vec<&dyn rusqlite::types::ToSql> =
            params_vec.iter().map(|b| b.as_ref()).collect();

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
            .filter_map(|r| match r {
                Ok(v) => Some(v),
                Err(e) => {
                    eprintln!("[PlaylistCache] row parse error: {e}");
                    None
                }
            })
            .collect();

        let mut tracks_by_id = std::collections::HashMap::new();
        for track in tracks {
            tracks_by_id.insert(track.video_id.clone(), track);
        }

        let ordered_tracks: Vec<CachedTrack> = video_ids
            .iter()
            .filter_map(|video_id| tracks_by_id.get(video_id).cloned())
            .collect();

        println!(
            "[PlaylistCache] get_tracks_by_ids requested={} found={}",
            video_ids.len(),
            ordered_tracks.len()
        );
        Ok(ordered_tracks)
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
) -> Vec<(
    String,
    String,
    String,
    Option<String>,
    Option<String>,
    Option<String>,
    f64,
    Option<String>,
)> {
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
