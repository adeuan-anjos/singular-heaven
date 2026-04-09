use serde_json::Value;

use crate::error::Result;
use crate::nav::*;
use crate::types::common::{ArtistRef, AlbumRef};
use crate::types::playlist::*;

/// Extract the initial continuation token from the first page of a playlist browse response.
pub fn extract_initial_continuation_token(response: &Value) -> Option<String> {
    // Try twoColumnBrowseResultsRenderer path (musicPlaylistShelfRenderer)
    let contents = response.pointer("/contents/twoColumnBrowseResultsRenderer/secondaryContents/sectionListRenderer/contents/0/musicPlaylistShelfRenderer/contents")
        .or_else(|| response.pointer("/contents/twoColumnBrowseResultsRenderer/secondaryContents/sectionListRenderer/contents/0/musicShelfRenderer/contents"))
        .and_then(|v| v.as_array());

    contents.and_then(|items| extract_continuation_token(items))
}

pub fn parse_playlist_response(response: &Value, playlist_id: &str) -> Result<PlaylistPage> {
    // Liked songs ("VLLM") uses singleColumnBrowseResultsRenderer; all other
    // playlists use twoColumnBrowseResultsRenderer. Try both.
    let is_single_col = response
        .pointer("/contents/singleColumnBrowseResultsRenderer")
        .is_some();

    let header = if is_single_col {
        nav(response, &[
            "contents", "singleColumnBrowseResultsRenderer", "tabs", "0",
            "tabRenderer", "content", "sectionListRenderer", "contents", "0",
            "musicImmersiveHeaderRenderer",
        ])
        .or_else(|| nav(response, &[
            "contents", "singleColumnBrowseResultsRenderer", "tabs", "0",
            "tabRenderer", "content", "sectionListRenderer", "contents", "0",
            "musicResponsiveHeaderRenderer",
        ]))
    } else {
        // Try direct musicResponsiveHeaderRenderer first
        nav(response, &[
            "contents", "twoColumnBrowseResultsRenderer", "tabs", "0",
            "tabRenderer", "content", "sectionListRenderer", "contents", "0",
            "musicResponsiveHeaderRenderer",
        ])
        // Editable playlists wrap the header inside musicEditablePlaylistDetailHeaderRenderer
        .or_else(|| nav(response, &[
            "contents", "twoColumnBrowseResultsRenderer", "tabs", "0",
            "tabRenderer", "content", "sectionListRenderer", "contents", "0",
            "musicEditablePlaylistDetailHeaderRenderer", "header",
            "musicResponsiveHeaderRenderer",
        ]))
    };

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
    let is_special = matches!(playlist_id, "LM" | "SE");
    let menu_items = if is_single_col {
        nav_array(response, &[
            "contents", "singleColumnBrowseResultsRenderer", "tabs", "0",
            "tabRenderer", "content", "sectionListRenderer", "contents", "0",
            "musicShelfRenderer", "menu", "menuRenderer", "items",
        ])
    } else {
        let direct = nav_array(response, &[
            "contents", "twoColumnBrowseResultsRenderer", "tabs", "0",
            "tabRenderer", "content", "sectionListRenderer", "contents", "0",
            "musicEditablePlaylistDetailHeaderRenderer", "editHeader", "musicPlaylistEditHeaderRenderer",
            "menu", "menuRenderer", "items",
        ]);
        if !direct.is_empty() {
            direct
        } else {
            nav_array(response, &[
                "header", "musicDetailHeaderRenderer", "menu", "menuRenderer", "items",
            ])
        }
    };
    let is_owned_by_user = menu_items.iter().any(|item| {
        let text = item
            .get("menuNavigationItemRenderer")
            .and_then(|r| r.get("text"))
            .and_then(get_text)
            .unwrap_or_default()
            .to_lowercase();
        text.contains("editar playlist") || text.contains("excluir playlist")
    });
    let is_editable = is_owned_by_user && !is_special;

    // Tracks: two-column layout uses secondaryContents; single-column (liked songs)
    // puts the shelf inside the primary tab content instead.
    let tracks_array = if is_single_col {
        nav_array(response, &[
            "contents", "singleColumnBrowseResultsRenderer", "tabs", "0",
            "tabRenderer", "content", "sectionListRenderer", "contents", "0",
            "musicShelfRenderer", "contents",
        ])
        .into_iter()
        // The first item is typically a "shuffle" button with no videoId — skip it
        .filter(|item| {
            item.get("musicResponsiveListItemRenderer")
                .and_then(|r| r.get("playlistItemData"))
                .and_then(|p| p.get("videoId"))
                .is_some()
        })
        .collect()
    } else {
        // Try musicShelfRenderer first, then musicPlaylistShelfRenderer
        let arr = nav_array(response, &[
            "contents", "twoColumnBrowseResultsRenderer", "secondaryContents",
            "sectionListRenderer", "contents", "0", "musicShelfRenderer", "contents",
        ]);
        if !arr.is_empty() {
            arr
        } else {
            nav_array(response, &[
                "contents", "twoColumnBrowseResultsRenderer", "secondaryContents",
                "sectionListRenderer", "contents", "0", "musicPlaylistShelfRenderer", "contents",
            ])
        }
    };

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
        is_owned_by_user,
        is_editable,
        is_special,
        tracks,
    })
}

fn parse_playlist_track(renderer: &Value) -> Option<PlaylistTrack> {
    let cols = renderer.get("flexColumns")?.as_array()?;
    let col0_runs = get_flex_column_runs(cols, 0)?;
    let title = col0_runs.first()?.get("text")?.as_str()?.to_string();

    let playlist_item_data = renderer.get("playlistItemData");
    let video_id = playlist_item_data
        .and_then(|p| p.get("videoId"))
        .and_then(|v| v.as_str())
        .map(|s| s.to_string())
        .or_else(|| {
            col0_runs.first()
                .and_then(|r| nav_str(r, &["navigationEndpoint", "watchEndpoint", "videoId"]))
        })
        .unwrap_or_default();
    let set_video_id = playlist_item_data
        .and_then(|p| p.get("setVideoId"))
        .and_then(|v| v.as_str())
        .map(|s| s.to_string());

    // Duration from fixedColumns
    let duration = renderer.get("fixedColumns")
        .and_then(|fc| fc.as_array())
        .and_then(|fc| fc.first())
        .and_then(|c| c.get("musicResponsiveListItemFixedColumnRenderer"))
        .and_then(|c| c.get("text"))
        .and_then(|t| get_text(t));

    let col1_runs = get_flex_column_runs(cols, 1).unwrap_or_default();
    let col2_runs = get_flex_column_runs(cols, 2).unwrap_or_default();

    // Artists from col1; Album from col2 (playlist layout) or col1 fallback
    let artists = parse_artists_from_runs(&col1_runs);
    let album = parse_album_from_runs(&col2_runs)
        .or_else(|| parse_album_from_runs(&col1_runs));

    let thumbnails = parse_thumbnails(renderer);

    Some(PlaylistTrack { title, video_id, set_video_id, artists, album, duration, thumbnails })
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

/// Extract the 2025-style continuation token from the last item in a contents array.
/// The last item is a `continuationItemRenderer` with the token inside.
pub fn extract_continuation_token(contents: &[Value]) -> Option<String> {
    contents.last()
        .and_then(|item| item.get("continuationItemRenderer"))
        .and_then(|r| r.get("continuationEndpoint"))
        .and_then(|e| e.get("continuationCommand"))
        .and_then(|c| c.get("token"))
        .and_then(|t| t.as_str())
        .map(|s| s.to_string())
}

/// Parse a continuation response for playlist tracks.
/// Continuation responses use `onResponseReceivedActions[0].appendContinuationItemsAction.continuationItems`.
pub fn parse_playlist_continuation(response: &Value) -> (Vec<PlaylistTrack>, Option<String>) {
    let items = nav_array(response, &[
        "onResponseReceivedActions", "0", "appendContinuationItemsAction", "continuationItems",
    ]);

    let mut tracks = Vec::new();
    for item in &items {
        if let Some(renderer) = item.get("musicResponsiveListItemRenderer") {
            if let Some(track) = parse_playlist_track(renderer) {
                tracks.push(track);
            }
        }
    }

    let next_token = extract_continuation_token(&items);
    (tracks, next_token)
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
