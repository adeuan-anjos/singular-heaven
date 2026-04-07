use serde_json::Value;

use crate::error::Result;
use crate::nav::*;
use crate::types::common::{ArtistRef, AlbumRef};
use crate::types::search::*;

/// Parse the full search response from InnerTube.
pub fn parse_search_response(response: &Value) -> Result<SearchResponse> {
    let sections = nav_array(response, &[
        "contents", "tabbedSearchResultsRenderer", "tabs"
    ]);

    let tab_content = sections.first()
        .and_then(|tab| nav(tab, &["tabRenderer", "content", "sectionListRenderer", "contents"]))
        .and_then(|v| v.as_array().cloned())
        .unwrap_or_default();

    let mut top_result = None;
    let mut results = Vec::new();

    for section in &tab_content {
        if let Some(card) = section.get("musicCardShelfRenderer") {
            top_result = parse_top_result(card);
        }
        if let Some(shelf) = section.get("musicShelfRenderer") {
            let items = shelf.get("contents")
                .and_then(|v| v.as_array())
                .cloned()
                .unwrap_or_default();
            for item in &items {
                if let Some(renderer) = item.get("musicResponsiveListItemRenderer") {
                    if let Some(result) = parse_search_item(renderer) {
                        results.push(result);
                    }
                }
            }
        }
    }

    Ok(SearchResponse { top_result, results })
}

fn parse_top_result(card: &Value) -> Option<TopResult> {
    let title_runs = card.get("title")?.get("runs")?.as_array()?;
    let title = title_runs.first()?.get("text")?.as_str()?.to_string();

    let browse_id = title_runs.first()
        .and_then(|r| nav_str(r, &["navigationEndpoint", "browseEndpoint", "browseId"]));

    let subtitle_runs = card.get("subtitle")
        .and_then(|v| v.get("runs"))
        .and_then(|v| v.as_array())
        .cloned()
        .unwrap_or_default();

    let result_type = subtitle_runs.first()
        .and_then(|r| r.get("text")?.as_str())
        .and_then(|s| normalize_if_known_type(s))
        .unwrap_or_default();

    let subscribers = subtitle_runs.iter()
        .filter_map(|r| r.get("text")?.as_str())
        .find(|t| t.contains("ouvintes") || t.contains("subscribers") || t.contains("inscritos"))
        .map(|s| s.to_string());

    let thumbnails = parse_thumbnails(card);

    Some(TopResult {
        result_type,
        title,
        browse_id,
        thumbnails,
        artists: Vec::new(),
        subscribers,
    })
}

fn parse_search_item(renderer: &Value) -> Option<SearchResult> {
    let cols = renderer.get("flexColumns")?.as_array()?;
    if cols.is_empty() { return None; }

    // Title from col0
    let col0_runs = get_flex_column_runs(cols, 0)?;
    let title = col0_runs.first()?.get("text")?.as_str()?.to_string();

    // Col1 runs for type/artist/metadata
    let col1_runs = get_flex_column_runs(cols, 1).unwrap_or_default();
    let col1_first_text = col1_runs.first()
        .and_then(|r| r.get("text")?.as_str())
        .unwrap_or("");

    // Check if col1 first run is a known type label.
    // When a search filter is applied, there's no type prefix — col1 starts with artist directly.
    let known_type = normalize_if_known_type(col1_first_text);
    let has_type_prefix = known_type.is_some();

    // Thumbnails
    let thumbnails = parse_thumbnails(renderer);

    // Data-pattern detection
    let browse_id = nav_str(renderer, &["navigationEndpoint", "browseEndpoint", "browseId"]);
    let video_id = renderer.get("playlistItemData")
        .and_then(|p| p.get("videoId"))
        .and_then(|v| v.as_str())
        .map(|s| s.to_string())
        .or_else(|| {
            col0_runs.first()
                .and_then(|r| nav_str(r, &["navigationEndpoint", "watchEndpoint", "videoId"]))
        });

    // Determine result type: prefer col1 label, fall back to data patterns
    let result_type = if let Some(ref t) = known_type {
        t.clone()
    } else if let Some(ref id) = browse_id {
        if id.starts_with("MPRE") {
            "album".to_string()
        } else if id.starts_with("UC") {
            "artist".to_string()
        } else if id.starts_with("VL") || id.starts_with("PL") {
            "playlist".to_string()
        } else {
            "song".to_string()
        }
    } else if video_id.is_some() {
        // Has videoId — could be song or video; check col1 for "visualiza" hint
        let has_views = col1_runs.iter()
            .any(|r| r.get("text").and_then(|v| v.as_str())
                .map(|t| t.contains("visualiza")).unwrap_or(false));
        if has_views { "video".to_string() } else { "song".to_string() }
    } else {
        "song".to_string()
    };

    // Runs to pass for artist/metadata extraction (skip type prefix if present)
    let metadata_runs: &[Value] = if has_type_prefix && col1_runs.len() > 1 {
        &col1_runs[1..]
    } else {
        &col1_runs
    };

    match result_type.as_str() {
        "album" => {
            let artists = parse_artists_from_runs(metadata_runs);
            let year = extract_year_from_runs(&col1_runs);
            let album_type = if has_type_prefix { Some(col1_first_text.to_string()) } else { None };
            Some(SearchResult::Album(SearchAlbum {
                title,
                browse_id: browse_id.unwrap_or_default(),
                artists,
                album_type,
                year,
                thumbnails,
            }))
        }
        "artist" => {
            let subscribers = col1_runs.iter()
                .filter_map(|r| r.get("text")?.as_str())
                .find(|t| t.contains("ouvintes") || t.contains("subscribers") || t.contains("inscritos"))
                .map(|s| s.to_string());
            Some(SearchResult::Artist(SearchArtist {
                name: title,
                browse_id: browse_id.unwrap_or_default(),
                subscribers,
                thumbnails,
            }))
        }
        "playlist" => {
            let author = parse_artists_from_runs(metadata_runs).first().map(|a| a.name.clone());
            let item_count = col1_runs.iter()
                .filter_map(|r| r.get("text")?.as_str())
                .find(|t| t.contains("música") || t.contains("music") || t.contains("item"))
                .map(|s| s.to_string());
            let playlist_id = browse_id
                .map(|id| {
                    let stripped = id.strip_prefix("VL").unwrap_or(&id);
                    stripped.to_string()
                })
                .unwrap_or_default();
            Some(SearchResult::Playlist(SearchPlaylist {
                title,
                playlist_id,
                author,
                item_count,
                thumbnails,
            }))
        }
        "episode" => {
            let date = col1_runs.iter()
                .filter_map(|r| r.get("text")?.as_str())
                .find(|t| t.contains("de 20") || t.contains("de 19"))
                .map(|s| s.to_string());
            let podcast_name = col1_runs.last()
                .and_then(|r| r.get("text")?.as_str())
                .map(|s| s.to_string());
            Some(SearchResult::Episode(SearchEpisode {
                title,
                video_id: video_id.unwrap_or_default(),
                date,
                podcast_name,
                thumbnails,
            }))
        }
        "video" => {
            let artists = parse_artists_from_runs(metadata_runs);
            let views = col1_runs.iter()
                .filter_map(|r| r.get("text")?.as_str())
                .find(|t| t.contains("visualiza"))
                .map(|s| s.to_string());
            let duration = extract_duration_from_runs(&col1_runs);
            Some(SearchResult::Video(SearchVideo {
                title,
                video_id: video_id.unwrap_or_default(),
                artists,
                views,
                duration,
                thumbnails,
            }))
        }
        _ => {
            // Default: treat as song
            let artists = parse_artists_from_runs(metadata_runs);
            let album = extract_album_from_runs(&col1_runs);
            let duration = extract_duration_from_runs(&col1_runs);
            Some(SearchResult::Song(SearchSong {
                title,
                video_id: video_id.unwrap_or_default(),
                artists,
                album,
                duration,
                thumbnails,
            }))
        }
    }
}

/// Get the runs array from a flex column by index.
fn get_flex_column_runs(cols: &[Value], index: usize) -> Option<Vec<Value>> {
    cols.get(index)?
        .get("musicResponsiveListItemFlexColumnRenderer")?
        .get("text")?
        .get("runs")?
        .as_array()
        .cloned()
}

/// Check if text is a known type label. Returns Some(normalized) if recognized, None otherwise.
/// This distinguishes between "Música" (type label) and "The Weeknd" (artist name).
fn normalize_if_known_type(text: &str) -> Option<String> {
    let normalized = match text.to_lowercase().trim() {
        "música" | "music" | "song" => "song",
        "vídeo" | "video" => "video",
        "álbum" | "album" | "ep" | "single" => "album",
        "artista" | "artist" => "artist",
        "playlist" => "playlist",
        "episódio" | "episode" => "episode",
        "perfil" | "profile" => "artist",
        _ => return None,
    };
    Some(normalized.to_string())
}

/// Extract artist references from metadata runs (type prefix already stripped by caller).
/// Artists are runs that have a browseEndpoint with browseId starting with "UC".
fn parse_artists_from_runs(runs: &[Value]) -> Vec<ArtistRef> {
    let mut artists = Vec::new();
    let skip_texts = [" • ", ", ", " e ", " and ", " & "];

    for run in runs {
        let text = run.get("text").and_then(|v| v.as_str()).unwrap_or("");

        // Skip separators and empty
        if text.is_empty() || skip_texts.contains(&text) {
            continue;
        }

        // Check if it's a navigable artist
        let browse_id = run.get("navigationEndpoint")
            .and_then(|n| n.get("browseEndpoint"))
            .and_then(|b| b.get("browseId"))
            .and_then(|v| v.as_str());

        if let Some(id) = browse_id {
            if id.starts_with("UC") {
                artists.push(ArtistRef {
                    name: text.to_string(),
                    id: Some(id.to_string()),
                });
            }
        }
    }

    // Fallback: if no navigable artists found, take the first non-separator text as artist name
    if artists.is_empty() {
        for run in runs {
            let text = run.get("text").and_then(|v| v.as_str()).unwrap_or("");
            if !text.is_empty() && !skip_texts.contains(&text) {
                artists.push(ArtistRef {
                    name: text.to_string(),
                    id: None,
                });
                break;
            }
        }
    }

    artists
}

/// Extract album reference from col1 runs.
/// For songs, album might be after artist separated by " • ".
fn extract_album_from_runs(runs: &[Value]) -> Option<AlbumRef> {
    // Look for a run with browseEndpoint whose browseId starts with "MPREb_"
    for run in runs {
        let browse_id = run.get("navigationEndpoint")
            .and_then(|n| n.get("browseEndpoint"))
            .and_then(|b| b.get("browseId"))
            .and_then(|v| v.as_str());

        if let Some(id) = browse_id {
            if id.starts_with("MPRE") {
                let name = run.get("text").and_then(|v| v.as_str()).unwrap_or("").to_string();
                return Some(AlbumRef { name, id: Some(id.to_string()) });
            }
        }
    }
    None
}

/// Extract duration from runs (matches pattern like "3:49", "1:23:45").
fn extract_duration_from_runs(runs: &[Value]) -> Option<String> {
    for run in runs.iter().rev() {
        if let Some(text) = run.get("text").and_then(|v| v.as_str()) {
            // Match time pattern: digits:digits or digits:digits:digits
            let trimmed = text.trim();
            if trimmed.len() >= 3 && trimmed.len() <= 8
                && trimmed.contains(':')
                && trimmed.chars().all(|c| c.is_ascii_digit() || c == ':')
            {
                return Some(trimmed.to_string());
            }
        }
    }
    None
}

/// Extract year from runs (4-digit number).
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

/// Parse search suggestions response.
pub fn parse_search_suggestions(response: &Value) -> Vec<SearchSuggestion> {
    let contents = nav_array(response, &["contents"]);
    let mut suggestions = Vec::new();

    for section in &contents {
        let items = section.get("searchSuggestionsSectionRenderer")
            .and_then(|s| s.get("contents"))
            .and_then(|c| c.as_array())
            .cloned()
            .unwrap_or_default();

        for item in &items {
            if let Some(renderer) = item.get("searchSuggestionRenderer") {
                if let Some(suggestion) = renderer.get("suggestion") {
                    if let Some(text) = get_text_from_runs(suggestion) {
                        suggestions.push(SearchSuggestion { text });
                    }
                }
            }
        }
    }

    suggestions
}
