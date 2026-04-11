use serde_json::Value;

use crate::error::Result;
use crate::nav::*;
use crate::types::common::{AlbumRef, ArtistRef, LikeStatus, Thumbnail, VideoType};
use crate::types::watch::*;

pub fn parse_watch_response(response: &Value) -> Result<WatchPlaylist> {
    let tabs = nav_array(response, &[
        "contents", "singleColumnMusicWatchNextResultsRenderer",
        "tabbedRenderer", "watchNextTabbedResultsRenderer", "tabs",
    ]);

    let mut tracks = Vec::new();
    let mut continuation: Option<String> = None;

    if let Some(tab0) = tabs.first() {
        let panel = tab0
            .get("tabRenderer")
            .and_then(|r| r.get("content"))
            .and_then(|c| c.get("musicQueueRenderer"))
            .and_then(|q| q.get("content"))
            .and_then(|c| c.get("playlistPanelRenderer"));

        if let Some(panel) = panel {
            if let Some(contents) = panel.get("contents").and_then(|c| c.as_array()) {
                for item in contents {
                    let renderer = item
                        .get("playlistPanelVideoWrapperRenderer")
                        .and_then(|w| w.get("primaryRenderer"))
                        .and_then(|p| p.get("playlistPanelVideoRenderer"))
                        .or_else(|| item.get("playlistPanelVideoRenderer"));

                    if let Some(r) = renderer {
                        if let Some(track) = parse_watch_track(r) {
                            tracks.push(track);
                        }
                    }
                }
            }
            continuation = extract_continuation_token(panel);
        }
    }

    let lyrics_browse_id = tabs.get(1)
        .and_then(|t| nav_str(t, &[
            "tabRenderer", "endpoint", "browseEndpoint", "browseId",
        ]));

    let related_browse_id = tabs.get(2)
        .and_then(|t| nav_str(t, &[
            "tabRenderer", "endpoint", "browseEndpoint", "browseId",
        ]));

    Ok(WatchPlaylist { tracks, continuation, lyrics_browse_id, related_browse_id })
}

/// Parser para respostas de continuation do endpoint `next`. O root é
/// `continuationContents.playlistPanelContinuation` em vez do wrapper de tabs.
pub fn parse_watch_continuation_response(response: &Value) -> Result<WatchPlaylist> {
    let panel = response
        .get("continuationContents")
        .and_then(|c| c.get("playlistPanelContinuation"));

    let mut tracks = Vec::new();
    let mut continuation: Option<String> = None;

    if let Some(panel) = panel {
        if let Some(contents) = panel.get("contents").and_then(|c| c.as_array()) {
            for item in contents {
                let renderer = item
                    .get("playlistPanelVideoWrapperRenderer")
                    .and_then(|w| w.get("primaryRenderer"))
                    .and_then(|p| p.get("playlistPanelVideoRenderer"))
                    .or_else(|| item.get("playlistPanelVideoRenderer"));

                if let Some(r) = renderer {
                    if let Some(track) = parse_watch_track(r) {
                        tracks.push(track);
                    }
                }
            }
        }
        continuation = extract_continuation_token(panel);
    }

    Ok(WatchPlaylist {
        tracks,
        continuation,
        lyrics_browse_id: None,
        related_browse_id: None,
    })
}

fn parse_watch_track(renderer: &Value) -> Option<WatchTrack> {
    let title = nav_str(renderer, &["title", "runs", "0", "text"])?;

    let video_id = renderer.get("videoId")
        .and_then(|v| v.as_str())
        .map(|s| s.to_string())
        .unwrap_or_default();

    let length = nav_str(renderer, &["lengthText", "runs", "0", "text"]);

    let byline_runs = renderer.get("longBylineText")
        .and_then(|b| b.get("runs"))
        .and_then(|r| r.as_array())
        .cloned()
        .unwrap_or_default();

    let artists = parse_artists_from_runs(&byline_runs);
    let album = parse_album_from_runs(&byline_runs);

    let thumbnails = renderer.get("thumbnail")
        .and_then(|t| t.get("thumbnails"))
        .and_then(|t| t.as_array())
        .map(|arr| {
            arr.iter().map(|t| Thumbnail {
                url: t.get("url").and_then(|v| v.as_str()).unwrap_or_default().to_string(),
                width: t.get("width").and_then(|v| v.as_u64()).unwrap_or(0) as u32,
                height: t.get("height").and_then(|v| v.as_u64()).unwrap_or(0) as u32,
            }).collect()
        })
        .unwrap_or_default();

    let like_status = parse_like_status_from_menu(renderer);
    let video_type = parse_video_type(renderer);
    let views = parse_views_from_runs(&byline_runs);

    Some(WatchTrack {
        title,
        video_id,
        artists,
        album,
        length,
        like_status,
        video_type,
        views,
        thumbnails,
    })
}

pub fn parse_lyrics_response(response: &Value) -> Result<Lyrics> {
    let shelf = nav(response, &[
        "contents", "sectionListRenderer", "contents", "0",
        "musicDescriptionShelfRenderer",
    ]);

    let text = shelf.as_ref()
        .and_then(|s| nav_str(s, &["description", "runs", "0", "text"]))
        .or_else(|| {
            shelf.as_ref()
                .and_then(|s| s.get("description"))
                .and_then(|d| get_text(d))
        })
        .unwrap_or_default();

    let source = shelf.as_ref()
        .and_then(|s| nav_str(s, &["footer", "runs", "0", "text"]))
        .or_else(|| {
            shelf.as_ref()
                .and_then(|s| s.get("footer"))
                .and_then(|f| get_text(f))
        });

    Ok(Lyrics { text, source })
}

// ---------------------------------------------------------------------------
// Shared helpers (local to this module)
// ---------------------------------------------------------------------------

/// Extrai o próximo continuation token de um `playlistPanelRenderer` ou de uma
/// `playlistPanelContinuation`. Retorna `None` se não houver mais páginas.
fn extract_continuation_token(container: &Value) -> Option<String> {
    let continuations = container.get("continuations").and_then(|c| c.as_array())?;
    for cont in continuations {
        if let Some(token) = cont
            .get("nextContinuationData")
            .and_then(|n| n.get("continuation"))
            .and_then(|c| c.as_str())
        {
            return Some(token.to_string());
        }
        if let Some(token) = cont
            .get("nextRadioContinuationData")
            .and_then(|n| n.get("continuation"))
            .and_then(|c| c.as_str())
        {
            return Some(token.to_string());
        }
    }
    None
}

/// Extrai `LikeStatus` do menu do track. Olha para os `toggleMenuServiceItemRenderer`
/// procurando o ícone `FAVORITE`; retorna `None` em qualquer ambiguidade.
fn parse_like_status_from_menu(renderer: &Value) -> Option<LikeStatus> {
    let items = renderer
        .get("menu")
        .and_then(|m| m.get("menuRenderer"))
        .and_then(|m| m.get("items"))
        .and_then(|i| i.as_array())?;

    for item in items {
        let toggle = item.get("toggleMenuServiceItemRenderer")?;
        let icon_type = toggle
            .get("defaultIcon")
            .and_then(|i| i.get("iconType"))
            .and_then(|v| v.as_str());
        if icon_type != Some("FAVORITE") {
            continue;
        }
        let is_toggled = toggle.get("isToggled").and_then(|v| v.as_bool()).unwrap_or(false);
        return Some(if is_toggled { LikeStatus::Like } else { LikeStatus::Indifferent });
    }
    None
}

/// Extrai `VideoType` a partir de `navigationEndpoint.watchEndpoint.watchEndpointMusicSupportedConfigs`.
fn parse_video_type(renderer: &Value) -> Option<VideoType> {
    let raw = renderer
        .get("navigationEndpoint")
        .and_then(|n| n.get("watchEndpoint"))
        .and_then(|w| w.get("watchEndpointMusicSupportedConfigs"))
        .and_then(|c| c.get("watchEndpointMusicConfig"))
        .and_then(|c| c.get("musicVideoType"))
        .and_then(|v| v.as_str())?;

    serde_json::from_value::<VideoType>(Value::String(raw.to_string())).ok()
}

/// Heurística simples para capturar view count das runs do `longBylineText`.
/// Retorna `None` se nada parecer uma contagem de visualizações.
fn parse_views_from_runs(runs: &[Value]) -> Option<String> {
    for run in runs.iter().rev() {
        let text = run.get("text").and_then(|v| v.as_str()).unwrap_or("");
        if text.is_empty() {
            continue;
        }
        let lower = text.to_ascii_lowercase();
        if lower.contains("view") || lower.contains("visualiza") {
            return Some(text.to_string());
        }
    }
    None
}

/// Extract artist refs from runs (runs with UC browseId).
fn parse_artists_from_runs(runs: &[Value]) -> Vec<ArtistRef> {
    let skip = [" • ", ", ", " e ", " and ", " & ", " · "];
    let mut artists = Vec::new();

    for run in runs {
        let text = run.get("text").and_then(|v| v.as_str()).unwrap_or("");
        if text.is_empty() || skip.contains(&text) { continue; }

        let browse_id = run.get("navigationEndpoint")
            .and_then(|n| n.get("browseEndpoint"))
            .and_then(|b| b.get("browseId"))
            .and_then(|v| v.as_str());

        if let Some(id) = browse_id {
            if id.starts_with("UC") {
                artists.push(ArtistRef { name: text.to_string(), id: Some(id.to_string()) });
            }
        }
    }

    // Fallback: first non-separator, non-album text
    if artists.is_empty() {
        for run in runs {
            let text = run.get("text").and_then(|v| v.as_str()).unwrap_or("");
            if !text.is_empty() && !skip.contains(&text) {
                let has_mpre = run.get("navigationEndpoint")
                    .and_then(|n| n.get("browseEndpoint"))
                    .and_then(|b| b.get("browseId"))
                    .and_then(|v| v.as_str())
                    .is_some_and(|id| id.starts_with("MPRE"));
                if !has_mpre {
                    artists.push(ArtistRef { name: text.to_string(), id: None });
                    break;
                }
            }
        }
    }

    artists
}

/// Extract album ref from runs (run with MPRE browseId).
fn parse_album_from_runs(runs: &[Value]) -> Option<AlbumRef> {
    for run in runs {
        let text = run.get("text").and_then(|v| v.as_str()).unwrap_or("");
        if text.is_empty() { continue; }

        let browse_id = run.get("navigationEndpoint")
            .and_then(|n| n.get("browseEndpoint"))
            .and_then(|b| b.get("browseId"))
            .and_then(|v| v.as_str());

        if let Some(id) = browse_id {
            if id.starts_with("MPRE") {
                return Some(AlbumRef { name: text.to_string(), id: Some(id.to_string()) });
            }
        }
    }
    None
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    #[ignore] // Requires tmp/radio_results/ fixture from exploration phase
    fn parses_real_radio_response() {
        let path = std::path::Path::new(env!("CARGO_MANIFEST_DIR"))
            .parent().unwrap() // crates/ytmusic-api → crates
            .parent().unwrap() // crates → project root
            .join("tmp/radio_results/01_video_radio.json");
        if !path.exists() {
            eprintln!("fixture missing at {}, skipping", path.display());
            return;
        }
        let raw = std::fs::read_to_string(&path).unwrap();
        let value: Value = serde_json::from_str(&raw).unwrap();

        // The Python exploration script saved already-parsed output (keys:
        // tracks, playlistId, lyrics, related), not the raw InnerTube envelope
        // (which would start with `contents.singleColumnMusicWatchNextResultsRenderer`).
        // Detect that and skip gracefully — the parser still needs a raw
        // response envelope to do meaningful work.
        if value.get("contents").is_none() {
            eprintln!(
                "fixture at {} is pre-parsed Python output (top keys = {:?}); \
                 skipping raw-envelope assertions",
                path.display(),
                value.as_object().map(|o| o.keys().collect::<Vec<_>>()),
            );
            return;
        }

        let result = parse_watch_response(&value).unwrap();
        assert!(!result.tracks.is_empty(), "should parse at least one track");
        println!("parsed {} tracks from fixture", result.tracks.len());
        println!("continuation present: {}", result.continuation.is_some());
        let first = &result.tracks[0];
        assert!(!first.title.is_empty());
        assert!(!first.video_id.is_empty());
        println!(
            "first track: title={:?} video_type={:?} views={:?} like_status={:?}",
            first.title, first.video_type, first.views, first.like_status
        );
    }
}
