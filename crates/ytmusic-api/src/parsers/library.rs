use serde_json::Value;

use crate::error::Result;
use crate::nav::*;
use crate::types::common::ArtistRef;
use crate::types::library::*;

// ---------------------------------------------------------------------------
// Library playlists (FEmusic_liked_playlists)
// ---------------------------------------------------------------------------

/// Extract the continuation token from the gridRenderer (if more pages exist).
pub fn get_library_playlists_continuation(response: &Value) -> Option<String> {
    nav_str(response, &[
        "contents", "singleColumnBrowseResultsRenderer", "tabs", "0",
        "tabRenderer", "content", "sectionListRenderer", "contents", "0",
        "gridRenderer", "continuations", "0", "nextContinuationData", "continuation",
    ])
}

/// Parse items from a continuation response (gridContinuation path).
pub fn parse_library_playlists_continuation_response(response: &Value) -> Result<(Vec<LibraryPlaylist>, Option<String>)> {
    let items = nav_array(response, &[
        "continuationContents", "gridContinuation", "items",
    ]);

    let mut playlists = Vec::new();
    for item in &items {
        if let Some(renderer) = item.get("musicTwoRowItemRenderer") {
            if renderer.get("navigationEndpoint")
                .and_then(|n| n.get("createPlaylistEndpoint"))
                .is_some()
            {
                continue;
            }
            if let Some(playlist) = parse_library_playlist(renderer) {
                playlists.push(playlist);
            }
        }
    }

    let next_token = nav_str(response, &[
        "continuationContents", "gridContinuation", "continuations", "0",
        "nextContinuationData", "continuation",
    ]);

    Ok((playlists, next_token))
}

pub fn parse_library_playlists_response(response: &Value) -> Result<Vec<LibraryPlaylist>> {
    let items = nav_array(response, &[
        "contents", "singleColumnBrowseResultsRenderer", "tabs", "0",
        "tabRenderer", "content", "sectionListRenderer", "contents", "0",
        "gridRenderer", "items",
    ]);

    let mut playlists = Vec::new();

    for item in &items {
        if let Some(renderer) = item.get("musicTwoRowItemRenderer") {
            // Skip "Nova playlist" button — has createPlaylistEndpoint instead of browseEndpoint
            if renderer.get("navigationEndpoint")
                .and_then(|n| n.get("createPlaylistEndpoint"))
                .is_some()
            {
                continue;
            }

            if let Some(playlist) = parse_library_playlist(renderer) {
                playlists.push(playlist);
            }
        }
    }

    Ok(playlists)
}

pub fn parse_sidebar_playlists_response(response: &Value) -> Result<Vec<LibraryPlaylist>> {
    let sections = nav_array(response, &["items"]);
    let mut playlists = Vec::new();

    for section in &sections {
        let items = nav_array(section, &["guideSectionRenderer", "items"]);
        for item in &items {
            let Some(renderer) = item.get("guideEntryRenderer") else {
                continue;
            };

            let browse_id = nav_str(renderer, &[
                "navigationEndpoint",
                "browseEndpoint",
                "browseId",
            ]);

            let entry_id = nav_str(renderer, &["entryData", "guideEntryData", "guideEntryId"]);

            let Some(browse_id) = resolve_sidebar_playlist_browse_id(
                browse_id.as_deref(),
                entry_id.as_deref(),
            ) else {
                continue;
            };

            let playlist_id = browse_id
                .strip_prefix("VL")
                .unwrap_or(&browse_id)
                .to_string();

            if playlist_id.is_empty() {
                continue;
            }

            let title = get_text(renderer.get("formattedTitle").unwrap_or(&Value::Null))
                .unwrap_or_default();
            if title.is_empty() {
                continue;
            }

            let subtitle = renderer
                .get("formattedSubtitle")
                .and_then(get_text);

            let thumbnails = parse_guide_entry_thumbnails(renderer);
            let is_special = matches!(playlist_id.as_str(), "LM" | "SE");

            playlists.push(LibraryPlaylist {
                title,
                browse_id,
                playlist_id,
                subtitle,
                thumbnails,
                is_owned_by_user: false,
                is_editable: false,
                is_special,
            });
        }
    }

    Ok(playlists)
}

fn resolve_sidebar_playlist_browse_id(
    browse_id: Option<&str>,
    entry_id: Option<&str>,
) -> Option<String> {
    if let Some(browse_id) = browse_id {
        // Guide contains both global navigation entries and playlists. In practice,
        // playlist-like entries use VL-prefixed browseIds (including VLLM).
        if browse_id.starts_with("VL") {
            return Some(browse_id.to_string());
        }
    }

    match entry_id {
        Some("LM") | Some("SE") => Some(format!("VL{}", entry_id.unwrap_or_default())),
        _ => None,
    }
}

fn parse_library_playlist(renderer: &Value) -> Option<LibraryPlaylist> {
    let title = nav_str(renderer, &["title", "runs", "0", "text"])?;

    let browse_id = nav_str(renderer, &[
        "navigationEndpoint", "browseEndpoint", "browseId",
    ])?;

    // Strip "VL" prefix to get playlistId
    let playlist_id = browse_id.strip_prefix("VL")
        .unwrap_or(&browse_id)
        .to_string();

    let subtitle = renderer.get("subtitle")
        .and_then(|s| get_text(s));

    let thumbnails = parse_two_row_thumbnails(renderer);
    let is_special = matches!(playlist_id.as_str(), "LM" | "SE" | "VLLM" | "VLSE");
    let menu_items = renderer
        .get("menu")
        .and_then(|m| m.get("menuRenderer"))
        .and_then(|m| m.get("items"))
        .and_then(|m| m.as_array())
        .cloned()
        .unwrap_or_default();
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

    Some(LibraryPlaylist {
        title,
        browse_id,
        playlist_id,
        subtitle,
        thumbnails,
        is_owned_by_user,
        is_editable,
        is_special,
    })
}

// ---------------------------------------------------------------------------
// Library songs (FEmusic_liked_videos)
// ---------------------------------------------------------------------------

pub fn parse_library_songs_response(response: &Value) -> Result<Vec<LibrarySong>> {
    let items = nav_array(response, &[
        "contents", "singleColumnBrowseResultsRenderer", "tabs", "0",
        "tabRenderer", "content", "sectionListRenderer", "contents", "0",
        "musicShelfRenderer", "contents",
    ]);

    let mut songs = Vec::new();

    for item in &items {
        if let Some(renderer) = item.get("musicResponsiveListItemRenderer") {
            // Skip items without videoId (e.g. shuffle button)
            let video_id = renderer.get("playlistItemData")
                .and_then(|p| p.get("videoId"))
                .and_then(|v| v.as_str());

            if video_id.is_none() {
                continue;
            }

            if let Some(song) = parse_library_song(renderer) {
                songs.push(song);
            }
        }
    }

    Ok(songs)
}

fn parse_library_song(renderer: &Value) -> Option<LibrarySong> {
    let cols = renderer.get("flexColumns")?.as_array()?;
    let col0_runs = get_flex_column_runs(cols, 0)?;
    let title = col0_runs.first()?.get("text")?.as_str()?.to_string();

    let video_id = renderer.get("playlistItemData")
        .and_then(|p| p.get("videoId"))
        .and_then(|v| v.as_str())
        .map(|s| s.to_string())?;

    let col1_runs = get_flex_column_runs(cols, 1).unwrap_or_default();
    let artists = parse_artists_from_runs(&col1_runs);

    // Duration from fixedColumns
    let duration = renderer.get("fixedColumns")
        .and_then(|fc| fc.as_array())
        .and_then(|fc| fc.first())
        .and_then(|c| c.get("musicResponsiveListItemFixedColumnRenderer"))
        .and_then(|c| c.get("text"))
        .and_then(|t| get_text(t));

    let thumbnails = parse_thumbnails(renderer);

    Some(LibrarySong { title, video_id, artists, duration, thumbnails })
}

// ---------------------------------------------------------------------------
// Helpers (local)
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

    if artists.is_empty() {
        for run in runs {
            let text = run.get("text").and_then(|v| v.as_str()).unwrap_or("");
            if !text.is_empty() && !skip.contains(&text) {
                artists.push(ArtistRef { name: text.to_string(), id: None });
                break;
            }
        }
    }

    artists
}

/// Parse thumbnails from musicTwoRowItemRenderer.
fn parse_two_row_thumbnails(renderer: &Value) -> Vec<crate::types::common::Thumbnail> {
    let thumbs = nav_array(renderer, &[
        "thumbnailRenderer", "musicThumbnailRenderer", "thumbnail", "thumbnails",
    ]);
    if !thumbs.is_empty() {
        return thumbs.into_iter()
            .map(|t| crate::types::common::Thumbnail {
                url: t.get("url").and_then(|v| v.as_str()).unwrap_or_default().to_string(),
                width: t.get("width").and_then(|v| v.as_u64()).unwrap_or(0) as u32,
                height: t.get("height").and_then(|v| v.as_u64()).unwrap_or(0) as u32,
            })
            .collect();
    }
    parse_thumbnails(renderer)
}

fn parse_guide_entry_thumbnails(renderer: &Value) -> Vec<crate::types::common::Thumbnail> {
    let thumbs = nav_array(renderer, &["thumbnail", "thumbnails"]);
    if !thumbs.is_empty() {
        return thumbs
            .into_iter()
            .map(|t| crate::types::common::Thumbnail {
                url: t
                    .get("url")
                    .and_then(|v| v.as_str())
                    .unwrap_or_default()
                    .to_string(),
                width: t.get("width").and_then(|v| v.as_u64()).unwrap_or(0) as u32,
                height: t.get("height").and_then(|v| v.as_u64()).unwrap_or(0) as u32,
            })
            .collect();
    }

    parse_thumbnails(renderer)
}
