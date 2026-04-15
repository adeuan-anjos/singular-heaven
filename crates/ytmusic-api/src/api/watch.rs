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

        // First page
        let response = self.post_innertube(ENDPOINT_NEXT, body).await?;
        let mut result = parse_watch_response(&response)?;

        // Continuation loop with safeguards against infinite loops
        const MAX_WATCH_PAGES: usize = 40;
        let mut pages = 1usize;
        while result.tracks.len() < req.limit {
            let Some(token) = result.continuation.clone() else {
                break;
            };

            // Guard against theoretical infinite loop: hard cap on pages.
            if pages >= MAX_WATCH_PAGES {
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
                break;
            }

            result.tracks.extend(cont_result.tracks);
            result.continuation = cont_result.continuation;
        }

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
        Ok(result)
    }

    /// Get lyrics for a song by its lyrics browse ID (e.g. "MPLYt_...").
    pub async fn get_lyrics(&self, browse_id: &str) -> Result<Lyrics> {

        let body = json!({ "browseId": browse_id });
        let response = self.post_innertube(ENDPOINT_BROWSE, body).await?;
        let result = parse_lyrics_response(&response)?;

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

#[cfg(test)]
mod tests {
    use super::*;
    use crate::types::watch::WatchPlaylistRequest;

    #[test]
    fn rejects_both_missing() {
        let req = WatchPlaylistRequest {
            video_id: None,
            playlist_id: None,
            radio: false,
            shuffle: false,
            limit: 25,
        };
        assert!(build_watch_body(&req).is_err());
    }

    #[test]
    fn rejects_radio_plus_shuffle() {
        let req = WatchPlaylistRequest {
            video_id: Some("abc"),
            playlist_id: None,
            radio: true,
            shuffle: true,
            limit: 25,
        };
        assert!(build_watch_body(&req).is_err());
    }

    #[test]
    fn video_only_falls_back_to_rdamvm() {
        let req = WatchPlaylistRequest::for_video_radio("abc123", 100);
        let body = build_watch_body(&req).unwrap();
        assert_eq!(body["videoId"], "abc123");
        assert_eq!(body["playlistId"], "RDAMVMabc123");
        assert_eq!(body["params"], "wAEB");
        assert!(body.get("watchEndpointMusicSupportedConfigs").is_none());
    }

    #[test]
    fn playlist_radio_uses_raw_id() {
        let req = WatchPlaylistRequest::for_playlist_radio("PLabcdef", 50);
        let body = build_watch_body(&req).unwrap();
        assert_eq!(body["playlistId"], "PLabcdef");
        assert_eq!(body["params"], "wAEB");
        assert!(body.get("videoId").is_none());
    }

    #[test]
    fn normal_watch_adds_music_supported_configs() {
        let req = WatchPlaylistRequest {
            video_id: Some("xyz"),
            playlist_id: None,
            radio: false,
            shuffle: false,
            limit: 25,
        };
        let body = build_watch_body(&req).unwrap();
        assert!(body.get("watchEndpointMusicSupportedConfigs").is_some());
        assert!(body.get("params").is_none());
    }

    #[test]
    fn shuffle_playlist_uses_shuffle_params() {
        let req = WatchPlaylistRequest {
            video_id: None,
            playlist_id: Some("PLabcdef"),
            radio: false,
            shuffle: true,
            limit: 50,
        };
        let body = build_watch_body(&req).unwrap();
        assert_eq!(body["params"], "wAEB8gECKAE%3D");
    }
}
