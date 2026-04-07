use serde_json::Value;

use crate::error::Result;
use crate::nav::*;
use crate::types::common::{ArtistRef, Thumbnail};
use crate::types::browsing::*;

// ---------------------------------------------------------------------------
// Artist
// ---------------------------------------------------------------------------

pub fn parse_artist_response(response: &Value, browse_id: &str) -> Result<ArtistPage> {
    // Header — musicImmersiveHeaderRenderer or musicVisualHeaderRenderer
    let header = response.get("header")
        .and_then(|h| h.get("musicImmersiveHeaderRenderer")
            .or_else(|| h.get("musicVisualHeaderRenderer")));

    let name = header
        .and_then(|h| nav_str(h, &["title", "runs", "0", "text"]))
        .or_else(|| {
            header.and_then(|h| h.get("title"))
                .and_then(|t| get_text(t))
        })
        .unwrap_or_default();

    let subscribers = header
        .and_then(|h| nav_str(h, &[
            "subscriptionButton", "subscribeButtonRenderer",
            "subscriberCountText", "runs", "0", "text",
        ]))
        .or_else(|| {
            header.and_then(|h| h.get("subscriptionButton"))
                .and_then(|s| s.get("subscribeButtonRenderer"))
                .and_then(|s| s.get("subscriberCountText"))
                .and_then(|t| get_text(t))
        });

    let thumbnails = header.map(parse_thumbnails).unwrap_or_default();

    // Sections
    let sections = nav_array(response, &[
        "contents", "singleColumnBrowseResultsRenderer", "tabs", "0",
        "tabRenderer", "content", "sectionListRenderer", "contents",
    ]);

    let mut top_songs = Vec::new();
    let mut albums = Vec::new();
    let mut singles = Vec::new();
    let mut videos = Vec::new();
    let mut similar_artists = Vec::new();
    let mut description = None;

    for section in &sections {
        // Top songs — musicShelfRenderer
        if let Some(shelf) = section.get("musicShelfRenderer") {
            let items = shelf.get("contents")
                .and_then(|v| v.as_array())
                .cloned()
                .unwrap_or_default();
            for item in &items {
                if let Some(renderer) = item.get("musicResponsiveListItemRenderer") {
                    if let Some(song) = parse_artist_song(renderer) {
                        top_songs.push(song);
                    }
                }
            }
        }

        // Carousel sections — albums, singles, videos, similar artists
        if let Some(carousel) = section.get("musicCarouselShelfRenderer") {
            let section_title = carousel.get("header")
                .and_then(|h| h.get("musicCarouselShelfBasicHeaderRenderer"))
                .and_then(|h| nav_str(h, &["title", "runs", "0", "text"]))
                .unwrap_or_default()
                .to_lowercase();

            let items = carousel.get("contents")
                .and_then(|v| v.as_array())
                .cloned()
                .unwrap_or_default();

            if section_title.contains("álbu") || section_title.contains("album") {
                for item in &items {
                    if let Some(r) = item.get("musicTwoRowItemRenderer") {
                        if let Some(a) = parse_artist_album(r) {
                            albums.push(a);
                        }
                    }
                }
            } else if section_title.contains("single") {
                for item in &items {
                    if let Some(r) = item.get("musicTwoRowItemRenderer") {
                        if let Some(a) = parse_artist_album(r) {
                            singles.push(a);
                        }
                    }
                }
            } else if section_title.contains("vídeo") || section_title.contains("video") {
                for item in &items {
                    if let Some(r) = item.get("musicTwoRowItemRenderer") {
                        if let Some(v) = parse_artist_video(r) {
                            videos.push(v);
                        }
                    }
                }
            } else if section_title.contains("semelhante") || section_title.contains("similar")
                || section_title.contains("fãs") || section_title.contains("fans")
                || section_title.contains("também") || section_title.contains("also")
            {
                for item in &items {
                    if let Some(r) = item.get("musicTwoRowItemRenderer") {
                        if let Some(a) = parse_similar_artist(r) {
                            similar_artists.push(a);
                        }
                    }
                }
            }
        }

        // Description
        if let Some(desc_shelf) = section.get("musicDescriptionShelfRenderer") {
            if description.is_none() {
                description = desc_shelf.get("description")
                    .and_then(|d| get_text(d));
            }
        }
    }

    Ok(ArtistPage {
        name,
        browse_id: browse_id.to_string(),
        subscribers,
        description,
        thumbnails,
        top_songs,
        albums,
        singles,
        videos,
        similar_artists,
    })
}

fn parse_artist_song(renderer: &Value) -> Option<ArtistSong> {
    let cols = renderer.get("flexColumns")?.as_array()?;
    let col0_runs = get_flex_column_runs(cols, 0)?;
    let title = col0_runs.first()?.get("text")?.as_str()?.to_string();

    let video_id = renderer.get("playlistItemData")
        .and_then(|p| p.get("videoId"))
        .and_then(|v| v.as_str())
        .map(|s| s.to_string())
        .unwrap_or_default();

    let col1_runs = get_flex_column_runs(cols, 1).unwrap_or_default();
    let artists = parse_artists_from_runs(&col1_runs);

    // Plays can be in col2 or col1
    let plays = get_flex_column_runs(cols, 2)
        .and_then(|runs| runs.first()?.get("text")?.as_str().map(|s| s.to_string()))
        .or_else(|| {
            col1_runs.iter()
                .filter_map(|r| r.get("text")?.as_str())
                .find(|t| t.contains("reproduç") || t.contains("play") || t.contains("exibições"))
                .map(|s| s.to_string())
        });

    let thumbnails = parse_thumbnails(renderer);

    Some(ArtistSong { title, video_id, artists, thumbnails, plays })
}

fn parse_artist_album(renderer: &Value) -> Option<ArtistAlbum> {
    let title = nav_str(renderer, &["title", "runs", "0", "text"])?;

    let browse_id = nav_str(renderer, &[
        "navigationEndpoint", "browseEndpoint", "browseId",
    ]).unwrap_or_default();

    let subtitle_runs = renderer.get("subtitle")
        .and_then(|s| s.get("runs"))
        .and_then(|r| r.as_array())
        .cloned()
        .unwrap_or_default();

    let year = extract_year_from_runs(&subtitle_runs);

    let thumbnails = parse_two_row_thumbnails(renderer);

    Some(ArtistAlbum { title, browse_id, year, thumbnails })
}

fn parse_artist_video(renderer: &Value) -> Option<ArtistVideo> {
    let title = nav_str(renderer, &["title", "runs", "0", "text"])?;

    let video_id = nav_str(renderer, &[
        "navigationEndpoint", "watchEndpoint", "videoId",
    ]).unwrap_or_default();

    let subtitle_runs = renderer.get("subtitle")
        .and_then(|s| s.get("runs"))
        .and_then(|r| r.as_array())
        .cloned()
        .unwrap_or_default();

    let views = subtitle_runs.iter()
        .filter_map(|r| r.get("text")?.as_str())
        .find(|t| t.contains("visualiza") || t.contains("view") || t.contains("exibições"))
        .map(|s| s.to_string());

    let thumbnails = parse_two_row_thumbnails(renderer);

    Some(ArtistVideo { title, video_id, views, thumbnails })
}

fn parse_similar_artist(renderer: &Value) -> Option<SimilarArtist> {
    let name = nav_str(renderer, &["title", "runs", "0", "text"])?;

    let browse_id = nav_str(renderer, &[
        "navigationEndpoint", "browseEndpoint", "browseId",
    ]).unwrap_or_default();

    let subtitle_runs = renderer.get("subtitle")
        .and_then(|s| s.get("runs"))
        .and_then(|r| r.as_array())
        .cloned()
        .unwrap_or_default();

    let subscribers = subtitle_runs.iter()
        .filter_map(|r| r.get("text")?.as_str())
        .find(|t| t.contains("ouvintes") || t.contains("subscribers") || t.contains("inscritos"))
        .map(|s| s.to_string());

    let thumbnails = parse_two_row_thumbnails(renderer);

    Some(SimilarArtist { name, browse_id, subscribers, thumbnails })
}

// ---------------------------------------------------------------------------
// Album
// ---------------------------------------------------------------------------

pub fn parse_album_response(response: &Value, browse_id: &str) -> Result<AlbumPage> {
    // New layout: musicResponsiveHeaderRenderer
    let header = nav(response, &[
        "contents", "twoColumnBrowseResultsRenderer", "tabs", "0",
        "tabRenderer", "content", "sectionListRenderer", "contents", "0",
        "musicResponsiveHeaderRenderer",
    ]);

    // Fallback: old singleColumnBrowseResultsRenderer layout
    let header_old = if header.is_none() {
        nav(response, &[
            "header", "musicImmersiveHeaderRenderer",
        ]).or_else(|| nav(response, &[
            "header", "musicDetailHeaderRenderer",
        ]))
    } else {
        None
    };

    let h = header.as_ref().or(header_old.as_ref());

    let title = h
        .and_then(|h| nav_str(h, &["title", "runs", "0", "text"]))
        .or_else(|| h.and_then(|h| h.get("title")).and_then(|t| get_text(t)))
        .unwrap_or_default();

    // Subtitle runs: ["Album", " • ", "2016"]
    let subtitle_runs = h
        .and_then(|h| h.get("subtitle"))
        .and_then(|s| s.get("runs"))
        .and_then(|r| r.as_array())
        .cloned()
        .unwrap_or_default();

    let album_type = subtitle_runs.first()
        .and_then(|r| r.get("text")?.as_str())
        .map(|s| s.to_string());

    let year = extract_year_from_runs(&subtitle_runs);

    // Artists from straplineTextOne
    let strapline_runs = h
        .and_then(|h| h.get("straplineTextOne"))
        .and_then(|s| s.get("runs"))
        .and_then(|r| r.as_array())
        .cloned()
        .unwrap_or_default();

    let artists = if !strapline_runs.is_empty() {
        parse_artists_from_runs(&strapline_runs)
    } else {
        // Fallback: subtitle artists
        parse_artists_from_runs(&subtitle_runs)
    };

    // Description
    let description = h
        .and_then(|h| h.get("description"))
        .and_then(|d| {
            // New layout wraps in musicDescriptionShelfRenderer
            d.get("musicDescriptionShelfRenderer")
                .and_then(|s| s.get("description"))
                .and_then(|dd| get_text(dd))
                .or_else(|| get_text(d))
        });

    let thumbnails = h.map(|h| parse_thumbnails(h)).unwrap_or_default();

    // Tracks — new layout: secondaryContents
    let tracks_array = nav_array(response, &[
        "contents", "twoColumnBrowseResultsRenderer", "secondaryContents",
        "sectionListRenderer", "contents", "0", "musicShelfRenderer", "contents",
    ]);

    // Fallback: old layout
    let tracks_array = if tracks_array.is_empty() {
        nav_array(response, &[
            "contents", "singleColumnBrowseResultsRenderer", "tabs", "0",
            "tabRenderer", "content", "sectionListRenderer", "contents", "0",
            "musicShelfRenderer", "contents",
        ])
    } else {
        tracks_array
    };

    let mut tracks = Vec::new();
    for item in &tracks_array {
        if let Some(renderer) = item.get("musicResponsiveListItemRenderer") {
            if let Some(track) = parse_album_track(renderer) {
                tracks.push(track);
            }
        }
    }

    let track_count = if !tracks.is_empty() {
        Some(tracks.len() as u32)
    } else {
        None
    };

    // Duration from menu or subtitle
    let duration = subtitle_runs.iter()
        .filter_map(|r| r.get("text")?.as_str())
        .find(|t| t.contains("min") || t.contains("hour") || t.contains("hora"))
        .map(|s| s.to_string());

    Ok(AlbumPage {
        title,
        browse_id: browse_id.to_string(),
        album_type,
        year,
        artists,
        description,
        thumbnails,
        tracks,
        track_count,
        duration,
    })
}

fn parse_album_track(renderer: &Value) -> Option<AlbumTrack> {
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

    // Track number from index
    let track_number = renderer.get("index")
        .and_then(|idx| idx.get("runs"))
        .and_then(|r| r.as_array())
        .and_then(|r| r.first())
        .and_then(|r| r.get("text"))
        .and_then(|t| t.as_str())
        .and_then(|s| s.trim().parse::<u32>().ok());

    let col1_runs = get_flex_column_runs(cols, 1).unwrap_or_default();
    let artists = parse_artists_from_runs(&col1_runs);

    let thumbnails = parse_thumbnails(renderer);

    Some(AlbumTrack { title, video_id, track_number, duration, artists, thumbnails })
}

// ---------------------------------------------------------------------------
// Home
// ---------------------------------------------------------------------------

pub fn parse_home_response(response: &Value, limit: usize) -> Result<Vec<HomeSection>> {
    let sections = nav_array(response, &[
        "contents", "singleColumnBrowseResultsRenderer", "tabs", "0",
        "tabRenderer", "content", "sectionListRenderer", "contents",
    ]);

    let mut result = Vec::new();

    for section in &sections {
        if result.len() >= limit {
            break;
        }

        if let Some(carousel) = section.get("musicCarouselShelfRenderer") {
            let title = carousel.get("header")
                .and_then(|h| h.get("musicCarouselShelfBasicHeaderRenderer"))
                .and_then(|h| nav_str(h, &["title", "runs", "0", "text"]))
                .unwrap_or_default();

            if title.is_empty() {
                continue;
            }

            let items = carousel.get("contents")
                .and_then(|v| v.as_array())
                .cloned()
                .unwrap_or_default();

            let mut contents = Vec::new();
            for item in &items {
                if let Some(r) = item.get("musicTwoRowItemRenderer") {
                    if let Some(home_item) = parse_home_two_row(r) {
                        contents.push(home_item);
                    }
                } else if let Some(r) = item.get("musicResponsiveListItemRenderer") {
                    if let Some(home_item) = parse_home_list_item(r) {
                        contents.push(home_item);
                    }
                }
            }

            if !contents.is_empty() {
                result.push(HomeSection { title, contents });
            }
        }
    }

    Ok(result)
}

fn parse_home_two_row(renderer: &Value) -> Option<HomeItem> {
    let title = nav_str(renderer, &["title", "runs", "0", "text"])?;

    let thumbnails = parse_two_row_thumbnails(renderer);

    let subtitle_runs = renderer.get("subtitle")
        .and_then(|s| s.get("runs"))
        .and_then(|r| r.as_array())
        .cloned()
        .unwrap_or_default();

    // Determine type from navigationEndpoint
    let nav_endpoint = renderer.get("navigationEndpoint");

    let browse_id = nav_endpoint
        .and_then(|n| nav_str(n, &["browseEndpoint", "browseId"]));
    let video_id = nav_endpoint
        .and_then(|n| nav_str(n, &["watchEndpoint", "videoId"]));

    let page_type = nav_endpoint
        .and_then(|n| nav_str(n, &[
            "browseEndpoint", "browseEndpointContextSupportedConfigs",
            "browseEndpointContextMusicConfig", "pageType",
        ]));

    if let Some(ref id) = browse_id {
        let pt = page_type.as_deref().unwrap_or("");

        if id.starts_with("MPRE") || pt.contains("ALBUM") {
            let artists = parse_artists_from_runs(&subtitle_runs);
            let year = extract_year_from_runs(&subtitle_runs);
            return Some(HomeItem::Album {
                title, browse_id: id.clone(), artists, year, thumbnails,
            });
        }
        if id.starts_with("UC") || pt.contains("ARTIST") {
            let subscribers = subtitle_runs.iter()
                .filter_map(|r| r.get("text")?.as_str())
                .find(|t| t.contains("ouvintes") || t.contains("subscribers") || t.contains("inscritos"))
                .map(|s| s.to_string());
            return Some(HomeItem::Artist {
                name: title, browse_id: id.clone(), subscribers, thumbnails,
            });
        }
        if id.starts_with("VL") || id.starts_with("PL") || id.starts_with("RDCL")
            || id.starts_with("RDEM") || pt.contains("PLAYLIST")
        {
            let playlist_id = id.strip_prefix("VL").unwrap_or(id).to_string();
            let author = subtitle_runs.iter()
                .filter_map(|r| r.get("text")?.as_str())
                .find(|t| !t.contains("•") && !t.trim().is_empty() && t.trim() != ",")
                .map(|s| s.to_string());
            return Some(HomeItem::Playlist {
                title, playlist_id, author, thumbnails,
            });
        }
    }

    if let Some(vid) = video_id {
        let artists = parse_artists_from_runs(&subtitle_runs);
        let views = subtitle_runs.iter()
            .filter_map(|r| r.get("text")?.as_str())
            .find(|t| t.contains("visualiza") || t.contains("view") || t.contains("exibições"))
            .map(|s| s.to_string());
        return Some(HomeItem::Video {
            title, video_id: vid, artists, views, thumbnails,
        });
    }

    // Fallback: treat as playlist if we have a browse_id
    if let Some(id) = browse_id {
        return Some(HomeItem::Playlist {
            title, playlist_id: id, author: None, thumbnails,
        });
    }

    None
}

fn parse_home_list_item(renderer: &Value) -> Option<HomeItem> {
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
    let artists = parse_artists_from_runs(&col1_runs);
    let thumbnails = parse_thumbnails(renderer);

    Some(HomeItem::Song { title, video_id, artists, thumbnails })
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
                artists.push(ArtistRef { name: text.to_string(), id: None });
                break;
            }
        }
    }

    artists
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

/// Parse thumbnails from musicTwoRowItemRenderer — different path than standard.
fn parse_two_row_thumbnails(renderer: &Value) -> Vec<Thumbnail> {
    // Try the square thumbnail path first (musicTwoRowItemRenderer)
    let thumbs = nav_array(renderer, &[
        "thumbnailRenderer", "musicThumbnailSquareRenderer", "thumbnail", "thumbnails",
    ]);
    if !thumbs.is_empty() {
        return thumbs.into_iter()
            .map(|t| Thumbnail {
                url: t.get("url").and_then(|v| v.as_str()).unwrap_or_default().to_string(),
                width: t.get("width").and_then(|v| v.as_u64()).unwrap_or(0) as u32,
                height: t.get("height").and_then(|v| v.as_u64()).unwrap_or(0) as u32,
            })
            .collect();
    }
    // Fallback to standard path
    parse_thumbnails(renderer)
}
