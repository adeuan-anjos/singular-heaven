use serde_json::json;

use crate::client::YtMusicClient;
use crate::constants::*;
use crate::error::Result;
use crate::parsers::library::{parse_library_playlists_response, parse_library_songs_response};
use crate::types::library::{LibraryPlaylist, LibrarySong};

impl YtMusicClient {
    /// Get the user's library playlists.
    pub async fn get_library_playlists(&self) -> Result<Vec<LibraryPlaylist>> {
        println!("[ytmusic-api] get_library_playlists()");

        let body = json!({ "browseId": "FEmusic_liked_playlists" });
        let response = self.post_innertube(ENDPOINT_BROWSE, body).await?;
        let result = parse_library_playlists_response(&response)?;

        println!(
            "[ytmusic-api] get_library_playlists returned {} playlists",
            result.len()
        );

        Ok(result)
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
