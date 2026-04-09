use serde::Serialize;
use super::common::{Thumbnail, ArtistRef, AlbumRef};

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PlaylistPage {
    pub title: String,
    pub playlist_id: String,
    pub author: Option<ArtistRef>,
    pub description: Option<String>,
    pub year: Option<String>,
    pub track_count: Option<String>,
    pub duration: Option<String>,
    pub thumbnails: Vec<Thumbnail>,
    pub is_owned_by_user: bool,
    pub is_editable: bool,
    pub is_special: bool,
    pub tracks: Vec<PlaylistTrack>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PlaylistTrack {
    pub title: String,
    pub video_id: String,
    pub set_video_id: Option<String>,
    pub artists: Vec<ArtistRef>,
    pub album: Option<AlbumRef>,
    pub duration: Option<String>,
    pub thumbnails: Vec<Thumbnail>,
}
