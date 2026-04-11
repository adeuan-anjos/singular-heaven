use serde_json::Value;

use crate::error::Result;
use crate::nav::*;
use crate::types::common::{ArtistRef, AlbumRef, Thumbnail};
use crate::types::watch::*;

pub fn parse_watch_response(response: &Value) -> Result<WatchPlaylist> {
    // Navigate to tabs
    let tabs = nav_array(response, &[
        "contents", "singleColumnMusicWatchNextResultsRenderer",
        "tabbedRenderer", "watchNextTabbedResultsRenderer", "tabs",
    ]);

    // Tab 0: queue tracks
    let mut tracks = Vec::new();
    if let Some(tab0) = tabs.first() {
        let contents = nav_array(tab0, &[
            "tabRenderer", "content", "musicQueueRenderer",
            "content", "playlistPanelRenderer", "contents",
        ]);

        for item in &contents {
            // Items can be wrapped in playlistPanelVideoWrapperRenderer
            let renderer = item.get("playlistPanelVideoWrapperRenderer")
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

    // Tab 1: lyrics browseId
    let lyrics_browse_id = tabs.get(1)
        .and_then(|t| nav_str(t, &[
            "tabRenderer", "endpoint", "browseEndpoint", "browseId",
        ]));

    // Tab 2: related browseId
    let related_browse_id = tabs.get(2)
        .and_then(|t| nav_str(t, &[
            "tabRenderer", "endpoint", "browseEndpoint", "browseId",
        ]));

    Ok(WatchPlaylist { tracks, continuation: None, lyrics_browse_id, related_browse_id })
}

fn parse_watch_track(renderer: &Value) -> Option<WatchTrack> {
    let title = nav_str(renderer, &["title", "runs", "0", "text"])?;

    let video_id = renderer.get("videoId")
        .and_then(|v| v.as_str())
        .map(|s| s.to_string())
        .unwrap_or_default();

    let duration = nav_str(renderer, &["lengthText", "runs", "0", "text"]);

    // Artists + album from longBylineText.runs[]
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

    Some(WatchTrack { title, video_id, artists, album, length: duration, like_status: None, video_type: None, views: None, thumbnails })
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
