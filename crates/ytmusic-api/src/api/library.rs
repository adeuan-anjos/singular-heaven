use serde_json::json;

use crate::client::YtMusicClient;
use crate::constants::*;
use crate::error::Result;
use crate::parsers::library::{
    get_library_playlists_continuation, parse_library_playlists_continuation_response,
    parse_library_playlists_response, parse_library_songs_response,
};
use crate::types::library::{LibraryPlaylist, LibrarySong};

impl YtMusicClient {
    /// Get the user's library playlists, following continuation tokens to load all pages.
    pub async fn get_library_playlists(&self) -> Result<Vec<LibraryPlaylist>> {
        println!("[ytmusic-api] get_library_playlists()");

        let body = json!({ "browseId": "FEmusic_liked_playlists" });
        let response = self.post_innertube(ENDPOINT_BROWSE, body).await?;

        let mut playlists = parse_library_playlists_response(&response)?;
        let mut continuation = get_library_playlists_continuation(&response);

        println!(
            "[ytmusic-api] get_library_playlists first page: {} playlists, continuation: {}",
            playlists.len(),
            continuation.is_some()
        );

        // Follow continuation tokens until all playlists are loaded
        while let Some(token) = continuation {
            let cont_body = json!({ "continuation": token });
            let cont_response = self.post_innertube(ENDPOINT_BROWSE, cont_body).await?;
            let (more, next_token) = parse_library_playlists_continuation_response(&cont_response)?;
            println!(
                "[ytmusic-api] get_library_playlists continuation page: {} more playlists",
                more.len()
            );
            playlists.extend(more);
            continuation = next_token;
        }

        println!(
            "[ytmusic-api] get_library_playlists returned {} playlists total",
            playlists.len()
        );

        Ok(playlists)
    }

    /// Get the user's liked songs.
    pub async fn get_library_songs(&self) -> Result<Vec<LibrarySong>> {
        println!("[ytmusic-api] get_library_songs()");

        let body = json!({ "browseId": "FEmusic_liked_videos" });
        let response = self.post_innertube(ENDPOINT_BROWSE, body).await?;
        let result = parse_library_songs_response(&response)?;

        println!(
            "[ytmusic-api] get_library_songs returned {} songs",
            result.len()
        );

        Ok(result)
    }
}
