use serde::Serialize;
use super::common::{Thumbnail, ArtistRef, AlbumRef, LikeStatus};

/// Tipo do seed a partir do qual o rádio é gerado.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum WatchSeedKind {
    Video,
    Playlist,
}

/// Requisição para `get_watch_playlist`. Reflete os parâmetros de
/// `ytmusicapi.WatchMixin.get_watch_playlist` em Python.
#[derive(Debug, Clone)]
pub struct WatchPlaylistRequest<'a> {
    pub video_id: Option<&'a str>,
    pub playlist_id: Option<&'a str>,
    pub radio: bool,
    pub shuffle: bool,
    /// Número mínimo de faixas a retornar; o loop de continuation pára quando atinge.
    pub limit: usize,
}

impl<'a> WatchPlaylistRequest<'a> {
    pub fn for_video_radio(video_id: &'a str, limit: usize) -> Self {
        Self {
            video_id: Some(video_id),
            playlist_id: None,
            radio: true,
            shuffle: false,
            limit,
        }
    }

    pub fn for_playlist_radio(playlist_id: &'a str, limit: usize) -> Self {
        Self {
            video_id: None,
            playlist_id: Some(playlist_id),
            radio: true,
            shuffle: false,
            limit,
        }
    }
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct WatchPlaylist {
    pub tracks: Vec<WatchTrack>,
    /// Token de continuation opaco para próxima página. `None` quando o pool esgotou.
    pub continuation: Option<String>,
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
    /// Duração como string no formato "M:SS" — a API chama isso de `lengthText`.
    pub length: Option<String>,
    pub thumbnails: Vec<Thumbnail>,
    pub like_status: Option<LikeStatus>,
    pub video_type: Option<String>,
    pub views: Option<String>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Lyrics {
    pub text: String,
    pub source: Option<String>,
}
