use serde::Serialize;
use super::common::{Thumbnail, ArtistRef, AlbumRef};

#[derive(Debug, Clone, Serialize)]
pub struct PlaylistPage {
    pub title: String,
    pub playlist_id: String,
    pub author: Option<ArtistRef>,
    pub description: Option<String>,
    pub year: Option<String>,
    pub track_count: Option<String>,
    pub duration: Option<String>,
    pub thumbnails: Vec<Thumbnail>,
    pub tracks: Vec<PlaylistTrack>,
}

#[derive(Debug, Clone, Serialize)]
pub struct PlaylistTrack {
    pub title: String,
    pub video_id: String,
    pub artists: Vec<ArtistRef>,
    pub album: Option<AlbumRef>,
    pub duration: Option<String>,
    pub thumbnails: Vec<Thumbnail>,
}
