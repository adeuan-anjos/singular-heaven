use serde::Serialize;

use super::common::{ArtistRef, Thumbnail};

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct LibraryPlaylist {
    pub title: String,
    pub browse_id: String,
    pub playlist_id: String,
    pub subtitle: Option<String>,
    pub thumbnails: Vec<Thumbnail>,
    pub is_owned_by_user: bool,
    pub is_editable: bool,
    pub is_special: bool,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct LibrarySong {
    pub title: String,
    pub video_id: String,
    pub artists: Vec<ArtistRef>,
    pub duration: Option<String>,
    pub thumbnails: Vec<Thumbnail>,
}
