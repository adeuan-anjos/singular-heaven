use serde::{Deserialize, Serialize};

/// Thumbnail with URL and dimensions.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Thumbnail {
    pub url: String,
    pub width: u32,
    pub height: u32,
}

/// Reference to an artist (name + optional browse ID).
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ArtistRef {
    pub name: String,
    pub id: Option<String>,
}

/// Reference to an album (name + optional browse ID).
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AlbumRef {
    pub name: String,
    pub id: Option<String>,
}

/// Like status for a song.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "SCREAMING_SNAKE_CASE")]
pub enum LikeStatus {
    Like,
    Dislike,
    Indifferent,
}

/// Video type classification.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub enum VideoType {
    /// Official Music Video
    #[serde(rename = "MUSIC_VIDEO_TYPE_OMV")]
    Omv,
    /// User Generated Content
    #[serde(rename = "MUSIC_VIDEO_TYPE_UGC")]
    Ugc,
    /// Art Track (auto-generated)
    #[serde(rename = "MUSIC_VIDEO_TYPE_ATV")]
    Atv,
    /// Official Source Music
    #[serde(rename = "MUSIC_VIDEO_TYPE_OFFICIAL_SOURCE_MUSIC")]
    OfficialSource,
}

/// YouTube account/channel info for multi-account support.
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AccountInfo {
    pub name: String,
    pub photo_url: Option<String>,
    pub channel_handle: Option<String>,
    pub page_id: Option<String>,
    pub has_channel: bool,
    pub is_active: bool,
}
