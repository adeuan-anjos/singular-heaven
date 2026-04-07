use serde_json::Value;

use crate::error::Result;
use crate::nav::*;
use crate::types::common::{ArtistRef, AlbumRef};
use crate::types::playlist::*;

pub fn parse_playlist_response(response: &Value, playlist_id: &str) -> Result<PlaylistPage> {
    // Header: twoColumnBrowseResultsRenderer → musicResponsiveHeaderRenderer
    let header = nav(response, &[
        "contents", "twoColumnBrowseResultsRenderer", "tabs", "0",
        "tabRenderer", "content", "sectionListRenderer", "contents", "0",
        "musicResponsiveHeaderRenderer",
    ]);

    let h = header.as_ref();

    let title = h
        .and_then(|h| nav_str(h, &["title", "runs", "0", "text"]))
        .unwrap_or_default();

    // Subtitle runs: ["Playlist", " • ", year_or_info]
    let subtitle_runs = h
        .and_then(|h| h.get("subtitle"))
        .and_then(|s| s.get("runs"))
        .and_then(|r| r.as_array())
        .cloned()
        .unwrap_or_default();

    let year = extract_year_from_runs(&subtitle_runs);

    // Author from straplineTextOne
    let strapline_runs = h
        .and_then(|h| h.get("straplineTextOne"))
        .and_then(|s| s.get("runs"))
        .and_then(|r| r.as_array())
        .cloned()
        .unwrap_or_default();

    let author = if !strapline_runs.is_empty() {
        let name = strapline_runs.first()
            .and_then(|r| r.get("text"))
            .and_then(|v| v.as_str())
            .unwrap_or_default()
            .to_string();

        let id = strapline_runs.first()
            .and_then(|r| nav_str(r, &["navigationEndpoint", "browseEndpoint", "browseId"]));

        if !name.is_empty() {
            Some(ArtistRef { name, id })
        } else {
            None
        }
    } else {
        None
    };

    // Description
    let description = h
        .and_then(|h| h.get("description"))
        .and_then(|d| {
            d.get("musicDescriptionShelfRenderer")
                .and_then(|s| s.get("description"))
                .and_then(|dd| get_text(dd))
                .or_else(|| get_text(d))
        });

    // secondSubtitle: ["X músicas", " • ", "Xh Xmin"]
    let second_subtitle_runs = h
        .and_then(|h| h.get("secondSubtitle"))
        .and_then(|s| s.get("runs"))
        .and_then(|r| r.as_array())
        .cloned()
        .unwrap_or_default();

    let track_count = second_subtitle_runs.first()
        .and_then(|r| r.get("text"))
        .and_then(|v| v.as_str())
        .map(|s| s.to_string());

    let duration = second_subtitle_runs.get(2)
        .and_then(|r| r.get("text"))
        .and_then(|v| v.as_str())
        .map(|s| s.to_string());

    let thumbnails = h.map(parse_thumbnails).unwrap_or_default();

    // Tracks: secondaryContents → musicShelfRenderer
    let tracks_array = nav_array(response, &[
        "contents", "twoColumnBrowseResultsRenderer", "secondaryContents",
        "sectionListRenderer", "contents", "0", "musicShelfRenderer", "contents",
    ]);

    let mut tracks = Vec::new();
    for item in &tracks_array {
        if let Some(renderer) = item.get("musicResponsiveListItemRenderer") {
            if let Some(track) = parse_playlist_track(renderer) {
                tracks.push(track);
            }
        }
    }

    Ok(PlaylistPage {
        title,
        playlist_id: playlist_id.to_string(),
        author,
        description,
        year,
        track_count,
        duration,
        thumbnails,
        tracks,
    })
}

fn parse_playlist_track(renderer: &Value) -> Option<PlaylistTrack> {
    let cols = renderer.get("flexColumns")?.as_array()?;
    let col0_runs = get_flex_column_runs(cols, 0)?;
    let title = col0_runs.first()?.get("text")?.as_str()?.to_string();

    let video_id = renderer.get("playlistItemData")
        .and_then(|p| p.get("videoId"))
        .and_then(|v| v.as_str())
        .map(|s| s.to_string())
        .or_else(|| {
            col0_runs.first()
                .and_then(|r| nav_str(r, &["navigationEndpoint", "watchEndpoint", "videoId"]))
        })
        .unwrap_or_default();

    // Duration from fixedColumns
    let duration = renderer.get("fixedColumns")
        .and_then(|fc| fc.as_array())
        .and_then(|fc| fc.first())
        .and_then(|c| c.get("musicResponsiveListItemFixedColumnRenderer"))
        .and_then(|c| c.get("text"))
        .and_then(|t| get_text(t));

    let col1_runs = get_flex_column_runs(cols, 1).unwrap_or_default();

    // Artists: runs with UC browseId; Album: runs with MPRE browseId
    let artists = parse_artists_from_runs(&col1_runs);
    let album = parse_album_from_runs(&col1_runs);

    let thumbnails = parse_thumbnails(renderer);

    Some(PlaylistTrack { title, video_id, artists, album, duration, thumbnails })
}

// ---------------------------------------------------------------------------
// Shared helpers (local to this module)
// ---------------------------------------------------------------------------

/// Get runs from a flex column by index.
fn get_flex_column_runs(cols: &[Value], index: usize) -> Option<Vec<Value>> {
    cols.get(index)?
        .get("musicResponsiveListItemFlexColumnRenderer")?
        .get("text")?
        .get("runs")?
        .as_array()
        .cloned()
}

/// Extract artist refs from runs (runs with UC browseId).
fn parse_artists_from_runs(runs: &[Value]) -> Vec<ArtistRef> {
    let skip = [" • ", ", ", " e ", " and ", " & "];
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

    // Fallback: first non-separator text
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

/// Extract a 4-digit year from runs (searching from the end).
fn extract_year_from_runs(runs: &[Value]) -> Option<String> {
    for run in runs.iter().rev() {
        if let Some(text) = run.get("text").and_then(|v| v.as_str()) {
            let trimmed = text.trim();
            if trimmed.len() == 4 && trimmed.chars().all(|c| c.is_ascii_digit()) {
                return Some(trimmed.to_string());
            }
        }
    }
    None
}
