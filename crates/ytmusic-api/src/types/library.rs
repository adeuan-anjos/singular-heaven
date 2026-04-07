use serde::Serialize;

use super::common::{ArtistRef, Thumbnail};

#[derive(Debug, Clone, Serialize)]
pub struct LibraryPlaylist {
    pub title: String,
    pub browse_id: String,
    pub playlist_id: String,
    pub subtitle: Option<String>,
    pub thumbnails: Vec<Thumbnail>,
}

#[derive(Debug, Clone, Serialize)]
pub struct LibrarySong {
    pub title: String,
    pub video_id: String,
    pub artists: Vec<ArtistRef>,
    pub duration: Option<String>,
    pub thumbnails: Vec<Thumbnail>,
}
