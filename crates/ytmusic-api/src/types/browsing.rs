use serde::Serialize;
use super::common::{Thumbnail, ArtistRef};

// ---- Artist ----

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ArtistPage {
    pub name: String,
    pub browse_id: String,
    pub subscribers: Option<String>,
    pub description: Option<String>,
    pub thumbnails: Vec<Thumbnail>,
    pub top_songs: Vec<ArtistSong>,
    pub albums: Vec<ArtistAlbum>,
    pub singles: Vec<ArtistAlbum>,
    pub videos: Vec<ArtistVideo>,
    pub similar_artists: Vec<SimilarArtist>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ArtistSong {
    pub title: String,
    pub video_id: String,
    pub artists: Vec<ArtistRef>,
    pub album: Option<super::common::AlbumRef>,
    pub thumbnails: Vec<Thumbnail>,
    pub plays: Option<String>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ArtistAlbum {
    pub title: String,
    pub browse_id: String,
    pub year: Option<String>,
    pub thumbnails: Vec<Thumbnail>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ArtistVideo {
    pub title: String,
    pub video_id: String,
    pub views: Option<String>,
    pub thumbnails: Vec<Thumbnail>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SimilarArtist {
    pub name: String,
    pub browse_id: String,
    pub subscribers: Option<String>,
    pub thumbnails: Vec<Thumbnail>,
}

// ---- Album ----

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AlbumPage {
    pub title: String,
    pub browse_id: String,
    pub audio_playlist_id: Option<String>,
    pub album_type: Option<String>,
    pub year: Option<String>,
    pub artists: Vec<ArtistRef>,
    pub description: Option<String>,
    pub thumbnails: Vec<Thumbnail>,
    pub tracks: Vec<AlbumTrack>,
    pub track_count: Option<u32>,
    pub duration: Option<String>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AlbumTrack {
    pub title: String,
    pub video_id: String,
    pub track_number: Option<u32>,
    pub duration: Option<String>,
    pub artists: Vec<ArtistRef>,
    pub thumbnails: Vec<Thumbnail>,
}

// ---- Home ----

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct HomeSection {
    pub title: String,
    pub contents: Vec<HomeItem>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(tag = "type", rename_all = "camelCase")]
pub enum HomeItem {
    #[serde(rename = "song")]
    Song {
        title: String,
        video_id: String,
        artists: Vec<ArtistRef>,
        thumbnails: Vec<Thumbnail>,
    },
    #[serde(rename = "album")]
    Album {
        title: String,
        browse_id: String,
        artists: Vec<ArtistRef>,
        year: Option<String>,
        thumbnails: Vec<Thumbnail>,
    },
    #[serde(rename = "artist")]
    Artist {
        name: String,
        browse_id: String,
        subscribers: Option<String>,
        thumbnails: Vec<Thumbnail>,
    },
    #[serde(rename = "playlist")]
    Playlist {
        title: String,
        playlist_id: String,
        author: Option<String>,
        thumbnails: Vec<Thumbnail>,
    },
    #[serde(rename = "video")]
    Video {
        title: String,
        video_id: String,
        artists: Vec<ArtistRef>,
        views: Option<String>,
        thumbnails: Vec<Thumbnail>,
    },
}
