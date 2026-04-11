use serde_json::json;

use crate::client::YtMusicClient;
use crate::constants::*;
use crate::error::{Error, Result};
use crate::parsers::watch::{parse_lyrics_response, parse_watch_continuation_response, parse_watch_response};
use crate::types::watch::{Lyrics, WatchPlaylist, WatchPlaylistRequest};

/// Minimal percent-encoding for URL query values. Escapes everything that isn't
/// an unreserved ASCII character per RFC 3986 (A-Z, a-z, 0-9, hyphen, underscore,
/// period, tilde). This ensures tokens with special characters don't corrupt
/// the URL query string.
fn percent_encode_query(s: &str) -> String {
    let mut out = String::with_capacity(s.len());
    for b in s.bytes() {
        match b {
            b'A'..=b'Z' | b'a'..=b'z' | b'0'..=b'9' | b'-' | b'_' | b'.' | b'~' => {
                out.push(b as char);
            }
            _ => {
                out.push_str(&format!("%{:02X}", b));
            }
        }
    }
    out
}

impl YtMusicClient {
    /// Get a watch or radio playlist.
    ///
    /// Port of `ytmusicapi.WatchMixin.get_watch_playlist` (Python reference).
    ///
    /// When `radio=true`, iterates continuation tokens until at least `limit`
    /// tracks are collected or the continuation stream ends. Logs progress at
    /// every step.
    pub async fn get_watch_playlist(&self, req: WatchPlaylistRequest<'_>) -> Result<WatchPlaylist> {
        println!(
            "[ytmusic-api] get_watch_playlist video_id={:?} playlist_id={:?} radio={} shuffle={} limit={}",
            req.video_id, req.playlist_id, req.radio, req.shuffle, req.limit
        );

        let body = build_watch_body(&req)?;

        // `is_playlist` tracks whether the effective seed is a playlist/album
        // (PL or OLA prefix). Used to choose the continuation ctype.
        let effective_pid = req
            .playlist_id
            .map(String::from)
            .or_else(|| req.video_id.map(|v| format!("RDAMVM{v}")));
        let is_playlist = effective_pid
            .as_deref()
            .map(|pid| pid.starts_with("PL") || pid.starts_with("OLA"))
            .unwrap_or(false);

        println!("[ytmusic-api] get_watch_playlist request body keys: {:?}",
            body.as_object().map(|o| o.keys().collect::<Vec<_>>()));

        // First page
        let response = self.post_innertube(ENDPOINT_NEXT, body).await?;
        let mut result = parse_watch_response(&response)?;

        println!(
            "[ytmusic-api] get_watch_playlist first page: tracks={} has_continuation={}",
            result.tracks.len(),
            result.continuation.is_some()
        );

        // Continuation loop with safeguards against infinite loops
        const MAX_WATCH_PAGES: usize = 40;
        let mut pages = 1usize;
        while result.tracks.len() < req.limit {
            let Some(token) = result.continuation.clone() else {
                println!(
                    "[ytmusic-api] get_watch_playlist: continuation exhausted at {} tracks",
                    result.tracks.len()
                );
                break;
            };

            // Guard against theoretical infinite loop: hard cap on pages.
            if pages >= MAX_WATCH_PAGES {
                println!(
                    "[ytmusic-api] get_watch_playlist: page cap ({MAX_WATCH_PAGES}) reached — stopping to avoid infinite loop"
                );
                break;
            }

            let cont_result = self
                .get_watch_playlist_continuation(&token, is_playlist)
                .await?;
            pages += 1;

            // Break on empty page regardless of continuation token presence.
            // This prevents spinning when the server returns empty pages with
            // non-null continuation tokens (theoretical edge case).
            if cont_result.tracks.is_empty() {
                println!(
                    "[ytmusic-api] get_watch_playlist: empty continuation page at page {pages} — stopping to avoid spin"
                );
                break;
            }

            let added = cont_result.tracks.len();
            result.tracks.extend(cont_result.tracks);
            result.continuation = cont_result.continuation;

            println!(
                "[ytmusic-api] get_watch_playlist page {pages}: +{added} -> {} total, has_next={}",
                result.tracks.len(),
                result.continuation.is_some()
            );
        }

        println!(
            "[ytmusic-api] get_watch_playlist returned: tracks={} pages={} lyrics={:?} related={:?}",
            result.tracks.len(), pages, result.lyrics_browse_id, result.related_browse_id
        );

        Ok(result)
    }

    /// Fetch a single continuation page. `is_playlist` controls the ctoken type
    /// that the Python lib calls "" vs "Radio" — playlists use no suffix,
    /// radios suffix with "Radio".
    pub async fn get_watch_playlist_continuation(
        &self,
        continuation: &str,
        is_playlist: bool,
    ) -> Result<WatchPlaylist> {
        println!(
            "[ytmusic-api] watch_continuation is_playlist={is_playlist} token={}...",
            &continuation[..continuation.len().min(12)]
        );

        let ctype = if is_playlist { "" } else { "Radio" };
        // Percent-encode the continuation token to handle special characters in the URL.
        let encoded_continuation = percent_encode_query(continuation);
        let endpoint = format!(
            "{ENDPOINT_NEXT}?ctoken={encoded_continuation}&continuation={encoded_continuation}&type=next{ctype}"
        );

        let body = json!({
            "enablePersistentPlaylistPanel": true,
            "isAudioOnly": true,
            "tunerSettingValue": "AUTOMIX_SETTING_NORMAL",
        });

        let response = self.post_innertube(&endpoint, body).await?;
        let result = parse_watch_continuation_response(&response)?;
        println!(
            "[ytmusic-api] watch_continuation: +{} tracks, has_next={}",
            result.tracks.len(),
            result.continuation.is_some()
        );
        Ok(result)
    }

    /// Get lyrics for a song by its lyrics browse ID (e.g. "MPLYt_...").
    pub async fn get_lyrics(&self, browse_id: &str) -> Result<Lyrics> {
        println!("[ytmusic-api] get_lyrics(browse_id=\"{browse_id}\")");

        let body = json!({ "browseId": browse_id });
        let response = self.post_innertube(ENDPOINT_BROWSE, body).await?;
        let result = parse_lyrics_response(&response)?;

        println!(
            "[ytmusic-api] get_lyrics returned: text_len={} source={:?}",
            result.text.len(), result.source
        );

        Ok(result)
    }
}

/// Pure helper: builds the innertube body for `get_watch_playlist`.
/// Returns `Err` if the request is invalid. Testable without I/O.
pub(crate) fn build_watch_body(req: &WatchPlaylistRequest<'_>) -> Result<serde_json::Value> {
    use serde_json::json;

    if req.video_id.is_none() && req.playlist_id.is_none() {
        return Err(Error::Api {
            message: "get_watch_playlist: provide video_id, playlist_id, or both".into(),
        });
    }
    if req.radio && req.shuffle {
        return Err(Error::Api {
            message: "get_watch_playlist: radio=true is incompatible with shuffle=true".into(),
        });
    }

    let mut body = json!({
        "enablePersistentPlaylistPanel": true,
        "isAudioOnly": true,
        "tunerSettingValue": "AUTOMIX_SETTING_NORMAL",
    });

    let effective_playlist_id: Option<String> = match (req.video_id, req.playlist_id) {
        (Some(vid), None) => {
            body["videoId"] = json!(vid);
            Some(format!("RDAMVM{vid}"))
        }
        (Some(vid), Some(pid)) => {
            body["videoId"] = json!(vid);
            Some(pid.to_string())
        }
        (None, Some(pid)) => Some(pid.to_string()),
        (None, None) => unreachable!(),
    };

    if req.video_id.is_some() && !req.radio && !req.shuffle {
        body["watchEndpointMusicSupportedConfigs"] = json!({
            "watchEndpointMusicConfig": {
                "hasPersistentPlaylistPanel": true,
                "musicVideoType": "MUSIC_VIDEO_TYPE_ATV",
            }
        });
    }

    if let Some(ref pid) = effective_playlist_id {
        body["playlistId"] = json!(pid);
    }

    if req.shuffle && effective_playlist_id.is_some() {
        body["params"] = json!("wAEB8gECKAE%3D");
    }
    if req.radio {
        body["params"] = json!("wAEB");
    }

    Ok(body)
}
