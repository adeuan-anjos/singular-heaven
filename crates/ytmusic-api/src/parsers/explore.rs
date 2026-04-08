use serde_json::Value;

use crate::error::Result;
use crate::nav::*;
use crate::types::common::ArtistRef;
use crate::types::explore::*;

// ---------------------------------------------------------------------------
// Explore page
// ---------------------------------------------------------------------------

pub fn parse_explore_response(response: &Value) -> Result<ExplorePage> {
    let sections = nav_array(response, &[
        "contents", "singleColumnBrowseResultsRenderer", "tabs", "0",
        "tabRenderer", "content", "sectionListRenderer", "contents",
    ]);

    let mut new_releases = Vec::new();
    let mut top_songs = Vec::new();
    let mut trending = Vec::new();
    let mut moods_and_genres = Vec::new();
    let mut new_videos = Vec::new();

    for (idx, section) in sections.iter().enumerate() {
        // Section 0: gridRenderer — navigation buttons, skip
        if idx == 0 {
            continue;
        }

        if let Some(carousel) = section.get("musicCarouselShelfRenderer") {
            let title = carousel_title(carousel);
            let title_lower = title.to_lowercase();

            let items = carousel.get("contents")
                .and_then(|v| v.as_array())
                .cloned()
                .unwrap_or_default();

            // Section 1: "Novos álbuns e singles" — musicTwoRowItemRenderer
            if title_lower.contains("álbu") || title_lower.contains("album")
                || title_lower.contains("lançamento") || title_lower.contains("release")
                || title_lower.contains("single")
            {
                if new_releases.is_empty() {
                    for item in &items {
                        if let Some(r) = item.get("musicTwoRowItemRenderer") {
                            if let Some(a) = parse_explore_album(r) {
                                new_releases.push(a);
                            }
                        }
                    }
                }
            }
            // Section 2: "Top músicas" — musicResponsiveListItemRenderer
            else if title_lower.contains("top") {
                for item in &items {
                    if let Some(r) = item.get("musicResponsiveListItemRenderer") {
                        if let Some(s) = parse_explore_song(r) {
                            top_songs.push(s);
                        }
                    }
                }
            }
            // Section 3: "Momentos e gêneros" — musicNavigationButtonRenderer
            else if title_lower.contains("momento") || title_lower.contains("mood")
                || title_lower.contains("gênero") || title_lower.contains("genre")
            {
                for item in &items {
                    if let Some(r) = item.get("musicNavigationButtonRenderer") {
                        if let Some(m) = parse_mood_item(r) {
                            moods_and_genres.push(m);
                        }
                    }
                }
            }
            // Section 4: "Episódios favoritos" — podcast, skip
            else if title_lower.contains("episódio") || title_lower.contains("episode")
                || title_lower.contains("podcast")
            {
                continue;
            }
            // Section 5: "Em alta" — musicResponsiveListItemRenderer
            else if title_lower.contains("em alta") || title_lower.contains("trending") {
                for item in &items {
                    if let Some(r) = item.get("musicResponsiveListItemRenderer") {
                        if let Some(s) = parse_explore_song(r) {
                            trending.push(s);
                        }
                    }
                }
            }
            // Section 6: "Novos vídeos" — musicTwoRowItemRenderer
            else if title_lower.contains("vídeo") || title_lower.contains("video") {
                for item in &items {
                    if let Some(r) = item.get("musicTwoRowItemRenderer") {
                        if let Some(v) = parse_explore_video(r) {
                            new_videos.push(v);
                        }
                    }
                }
            }
        }
    }

    Ok(ExplorePage {
        new_releases,
        top_songs,
        trending,
        moods_and_genres,
        new_videos,
    })
}

// ---------------------------------------------------------------------------
// Mood categories (FEmusic_moods_and_genres)
// ---------------------------------------------------------------------------

pub fn parse_mood_categories_response(response: &Value) -> Result<Vec<MoodCategory>> {
    let sections = nav_array(response, &[
        "contents", "singleColumnBrowseResultsRenderer", "tabs", "0",
        "tabRenderer", "content", "sectionListRenderer", "contents",
    ]);

    let mut categories = Vec::new();

    for section in &sections {
        if let Some(grid) = section.get("gridRenderer") {
            let title = grid.get("header")
                .and_then(|h| h.get("gridHeaderRenderer"))
                .and_then(|h| nav_str(h, &["title", "runs", "0", "text"]))
                .unwrap_or_default();

            let items_array = grid.get("items")
                .and_then(|v| v.as_array())
                .cloned()
                .unwrap_or_default();

            let mut items = Vec::new();
            for item in &items_array {
                if let Some(r) = item.get("musicNavigationButtonRenderer") {
                    if let Some(m) = parse_mood_item(r) {
                        items.push(m);
                    }
                }
            }

            if !items.is_empty() {
                categories.push(MoodCategory { title, items });
            }
        }
    }

    Ok(categories)
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

fn carousel_title(carousel: &Value) -> String {
    carousel.get("header")
        .and_then(|h| h.get("musicCarouselShelfBasicHeaderRenderer"))
        .and_then(|h| nav_str(h, &["title", "runs", "0", "text"]))
        .unwrap_or_default()
}

fn parse_explore_album(renderer: &Value) -> Option<ExploreAlbum> {
    let title = nav_str(renderer, &["title", "runs", "0", "text"])?;

    let browse_id = nav_str(renderer, &[
        "navigationEndpoint", "browseEndpoint", "browseId",
    ]).unwrap_or_default();

    let subtitle_runs = renderer.get("subtitle")
        .and_then(|s| s.get("runs"))
        .and_then(|r| r.as_array())
        .cloned()
        .unwrap_or_default();

    let artists = parse_artists_from_subtitle(&subtitle_runs);

    let thumbnails = parse_two_row_thumbnails(renderer);

    // Check for explicit badge
    let is_explicit = renderer.get("subtitleBadges")
        .and_then(|b| b.as_array())
        .map(|badges| badges.iter().any(|b| {
            b.get("musicInlineBadgeRenderer")
                .and_then(|r| r.get("icon"))
                .and_then(|i| i.get("iconType"))
                .and_then(|t| t.as_str())
                .map(|s| s == "MUSIC_EXPLICIT_BADGE")
                .unwrap_or(false)
        }))
        .unwrap_or(false);

    Some(ExploreAlbum { title, browse_id, artists, thumbnails, is_explicit })
}

fn parse_explore_song(renderer: &Value) -> Option<ExploreSong> {
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

    let col1_runs = get_flex_column_runs(cols, 1).unwrap_or_default();
    let artists = parse_artists_from_subtitle(&col1_runs);

    // Rank from index column (if present)
    let rank = renderer.get("index")
        .and_then(|idx| idx.get("runs"))
        .and_then(|r| r.as_array())
        .and_then(|r| r.first())
        .and_then(|r| r.get("text"))
        .and_then(|t| t.as_str())
        .map(|s| s.trim().to_string())
        .filter(|s| !s.is_empty());

    let thumbnails = parse_thumbnails(renderer);

    Some(ExploreSong { title, video_id, artists, thumbnails, rank })
}

fn parse_explore_video(renderer: &Value) -> Option<ExploreVideo> {
    let title = nav_str(renderer, &["title", "runs", "0", "text"])?;

    let video_id = nav_str(renderer, &[
        "navigationEndpoint", "watchEndpoint", "videoId",
    ]);

    let browse_id = nav_str(renderer, &[
        "navigationEndpoint", "browseEndpoint", "browseId",
    ]);

    let subtitle_runs = renderer.get("subtitle")
        .and_then(|s| s.get("runs"))
        .and_then(|r| r.as_array())
        .cloned()
        .unwrap_or_default();

    let artists = parse_artists_from_subtitle(&subtitle_runs);

    let views = subtitle_runs.iter()
        .filter_map(|r| r.get("text")?.as_str())
        .find(|t| t.contains("visualiza") || t.contains("view") || t.contains("exibições"))
        .map(|s| s.to_string());

    let thumbnails = parse_two_row_thumbnails(renderer);

    Some(ExploreVideo { title, video_id, browse_id, artists, views, thumbnails })
}

fn parse_mood_item(renderer: &Value) -> Option<MoodItem> {
    let title = nav_str(renderer, &["buttonText", "runs", "0", "text"])?;

    let params = nav_str(renderer, &[
        "clickCommand", "browseEndpoint", "params",
    ])?;

    let color = renderer.get("solid")
        .and_then(|s| s.get("leftStripeColor"))
        .and_then(|v| v.as_u64());

    Some(MoodItem { title, params, color })
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
    // Fallback: musicThumbnailRenderer path
    parse_thumbnails(renderer)
}

/// Get runs from a flex column by index.
fn get_flex_column_runs(cols: &[Value], index: usize) -> Option<Vec<Value>> {
    cols.get(index)?
        .get("musicResponsiveListItemFlexColumnRenderer")?
        .get("text")?
        .get("runs")?
        .as_array()
        .cloned()
}

/// Extract artist refs from subtitle runs.
fn parse_artists_from_subtitle(runs: &[Value]) -> Vec<ArtistRef> {
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
                artists.push(ArtistRef { name: text.to_string(), id: None });
                break;
            }
        }
    }

    artists
}
