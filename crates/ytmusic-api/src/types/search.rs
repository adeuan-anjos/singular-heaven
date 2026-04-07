use serde::{Deserialize, Serialize};
use super::common::{Thumbnail, ArtistRef, AlbumRef};

/// Top-level search response.
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SearchResponse {
    pub top_result: Option<TopResult>,
    pub results: Vec<SearchResult>,
}

/// The featured "top result" card.
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct TopResult {
    pub result_type: String,
    pub title: String,
    pub browse_id: Option<String>,
    pub thumbnails: Vec<Thumbnail>,
    pub artists: Vec<ArtistRef>,
    pub subscribers: Option<String>,
}

/// A single search result.
#[derive(Debug, Clone, Serialize)]
#[serde(tag = "resultType", rename_all = "camelCase")]
pub enum SearchResult {
    #[serde(rename = "song")]
    Song(SearchSong),
    #[serde(rename = "video")]
    Video(SearchVideo),
    #[serde(rename = "album")]
    Album(SearchAlbum),
    #[serde(rename = "artist")]
    Artist(SearchArtist),
    #[serde(rename = "playlist")]
    Playlist(SearchPlaylist),
    #[serde(rename = "episode")]
    Episode(SearchEpisode),
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SearchSong {
    pub title: String,
    pub video_id: String,
    pub artists: Vec<ArtistRef>,
    pub album: Option<AlbumRef>,
    pub duration: Option<String>,
    pub thumbnails: Vec<Thumbnail>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SearchVideo {
    pub title: String,
    pub video_id: String,
    pub artists: Vec<ArtistRef>,
    pub views: Option<String>,
    pub duration: Option<String>,
    pub thumbnails: Vec<Thumbnail>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SearchAlbum {
    pub title: String,
    pub browse_id: String,
    pub artists: Vec<ArtistRef>,
    pub album_type: Option<String>,
    pub year: Option<String>,
    pub thumbnails: Vec<Thumbnail>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SearchArtist {
    pub name: String,
    pub browse_id: String,
    pub subscribers: Option<String>,
    pub thumbnails: Vec<Thumbnail>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SearchPlaylist {
    pub title: String,
    pub playlist_id: String,
    pub author: Option<String>,
    pub item_count: Option<String>,
    pub thumbnails: Vec<Thumbnail>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SearchEpisode {
    pub title: String,
    pub video_id: String,
    pub date: Option<String>,
    pub podcast_name: Option<String>,
    pub thumbnails: Vec<Thumbnail>,
}

/// Search suggestion entry.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SearchSuggestion {
    pub text: String,
}
