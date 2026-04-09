use serde_json::json;

use crate::client::YtMusicClient;
use crate::constants::*;
use crate::error::Result;
use crate::parsers::library::{
    get_library_playlists_continuation, parse_library_playlists_continuation_response,
    parse_library_playlists_response, parse_library_songs_response,
};
use crate::types::common::LikeStatus;
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

    /// Get the real liked songs playlist ("LM") as ordered video IDs.
    pub async fn get_liked_track_ids(&self) -> Result<Vec<String>> {
        println!("[ytmusic-api] get_liked_track_ids()");

        let (page, mut continuation) = self.get_playlist("LM").await?;
        let mut ids: Vec<String> = page
            .tracks
            .into_iter()
            .map(|track| track.video_id)
            .collect();

        while let Some(token) = continuation {
            let (tracks, next_token) = self.get_playlist_continuation(&token).await?;
            ids.extend(tracks.into_iter().map(|track| track.video_id));
            continuation = next_token;
        }

        println!(
            "[ytmusic-api] get_liked_track_ids returned {} track ids",
            ids.len()
        );

        Ok(ids)
    }

    /// Rate a song in the user's account.
    pub async fn rate_song(&self, video_id: &str, rating: LikeStatus) -> Result<()> {
        let endpoint = match rating {
            LikeStatus::Like => "like/like",
            LikeStatus::Dislike => "like/dislike",
            LikeStatus::Indifferent => "like/removelike",
        };

        println!(
            "[ytmusic-api] rate_song video_id={} rating={:?} endpoint={}",
            video_id, rating, endpoint
        );

        self.post_innertube(
            endpoint,
            json!({
                "target": {
                    "videoId": video_id,
                }
            }),
        )
        .await?;

        Ok(())
    }
}
