use serde_json::json;

use crate::client::YtMusicClient;
use crate::constants::*;
use crate::error::Result;
use crate::parsers::playlist::{
    extract_initial_continuation_token, parse_playlist_continuation, parse_playlist_response,
};
use crate::types::playlist::{PlaylistPage, PlaylistTrack};

impl YtMusicClient {
    /// Get a playlist page by playlist ID (e.g. "PLxxxxxxx" or "LM" for Liked Music).
    ///
    /// Returns the first ~100 tracks and an optional continuation token.
    /// Use `get_playlist_continuation` to load more tracks on demand.
    pub async fn get_playlist(&self, playlist_id: &str) -> Result<(PlaylistPage, Option<String>)> {
        println!("[ytmusic-api] get_playlist(playlist_id=\"{playlist_id}\")");

        let browse_id = if playlist_id.starts_with("VL") {
            playlist_id.to_string()
        } else {
            format!("VL{playlist_id}")
        };

        let body = json!({ "browseId": browse_id });
        let response = self.post_innertube(ENDPOINT_BROWSE, body).await?;
        let result = parse_playlist_response(&response, playlist_id)?;
        let continuation = extract_initial_continuation_token(&response);

        println!(
            "[ytmusic-api] get_playlist returned: title=\"{}\" tracks={} has_more={}",
            result.title, result.tracks.len(), continuation.is_some()
        );

        Ok((result, continuation))
    }

    /// Load the next page of playlist tracks using a continuation token.
    ///
    /// Returns the tracks and an optional next continuation token.
    pub async fn get_playlist_continuation(
        &self,
        continuation_token: &str,
    ) -> Result<(Vec<PlaylistTrack>, Option<String>)> {
        println!("[ytmusic-api] get_playlist_continuation()");

        let body = json!({ "continuation": continuation_token });
        let response = self.post_innertube(ENDPOINT_BROWSE, body).await?;
        let (tracks, next_token) = parse_playlist_continuation(&response);

        println!(
            "[ytmusic-api] get_playlist_continuation returned: {} tracks, has_more={}",
            tracks.len(), next_token.is_some()
        );

        Ok((tracks, next_token))
    }
}
