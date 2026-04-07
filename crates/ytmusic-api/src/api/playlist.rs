use serde_json::json;

use crate::client::YtMusicClient;
use crate::constants::*;
use crate::error::Result;
use crate::parsers::playlist::parse_playlist_response;
use crate::types::playlist::PlaylistPage;

impl YtMusicClient {
    /// Get a playlist page by playlist ID (e.g. "PLxxxxxxx" or "LM" for Liked Music).
    ///
    /// The playlist ID is automatically prefixed with "VL" for the browse endpoint.
    pub async fn get_playlist(&self, playlist_id: &str) -> Result<PlaylistPage> {
        println!("[ytmusic-api] get_playlist(playlist_id=\"{playlist_id}\")");

        let browse_id = if playlist_id.starts_with("VL") {
            playlist_id.to_string()
        } else {
            format!("VL{playlist_id}")
        };

        let body = json!({ "browseId": browse_id });
        let response = self.post_innertube(ENDPOINT_BROWSE, body).await?;
        let result = parse_playlist_response(&response, playlist_id)?;

        println!(
            "[ytmusic-api] get_playlist returned: title=\"{}\" tracks={} author={:?}",
            result.title, result.tracks.len(),
            result.author.as_ref().map(|a| &a.name)
        );

        Ok(result)
    }
}
