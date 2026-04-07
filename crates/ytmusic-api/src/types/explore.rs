use serde::Serialize;

use super::common::{ArtistRef, Thumbnail};

#[derive(Debug, Clone, Serialize)]
pub struct ExplorePage {
    pub new_releases: Vec<ExploreAlbum>,
    pub top_songs: Vec<ExploreSong>,
    pub trending: Vec<ExploreSong>,
    pub moods_and_genres: Vec<MoodItem>,
    pub new_videos: Vec<ExploreVideo>,
}

#[derive(Debug, Clone, Serialize)]
pub struct ExploreAlbum {
    pub title: String,
    pub browse_id: String,
    pub artists: Vec<ArtistRef>,
    pub thumbnails: Vec<Thumbnail>,
    pub is_explicit: bool,
}

#[derive(Debug, Clone, Serialize)]
pub struct ExploreSong {
    pub title: String,
    pub video_id: String,
    pub artists: Vec<ArtistRef>,
    pub thumbnails: Vec<Thumbnail>,
    pub rank: Option<String>,
}

#[derive(Debug, Clone, Serialize)]
pub struct ExploreVideo {
    pub title: String,
    pub video_id: Option<String>,
    pub browse_id: Option<String>,
    pub artists: Vec<ArtistRef>,
    pub views: Option<String>,
    pub thumbnails: Vec<Thumbnail>,
}

#[derive(Debug, Clone, Serialize)]
pub struct MoodItem {
    pub title: String,
    pub params: String,
    pub color: Option<u64>,
}

#[derive(Debug, Clone, Serialize)]
pub struct MoodCategory {
    pub title: String,
    pub items: Vec<MoodItem>,
}
