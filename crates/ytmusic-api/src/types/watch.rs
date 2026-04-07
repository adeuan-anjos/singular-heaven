use serde::Serialize;
use super::common::{Thumbnail, ArtistRef, AlbumRef};

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct WatchPlaylist {
    pub tracks: Vec<WatchTrack>,
    pub lyrics_browse_id: Option<String>,
    pub related_browse_id: Option<String>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct WatchTrack {
    pub title: String,
    pub video_id: String,
    pub artists: Vec<ArtistRef>,
    pub album: Option<AlbumRef>,
    pub duration: Option<String>,
    pub thumbnails: Vec<Thumbnail>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Lyrics {
    pub text: String,
    pub source: Option<String>,
}
