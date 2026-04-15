use serde_json::json;
use std::collections::HashMap;

use crate::client::YtMusicClient;
use crate::constants::*;
use crate::error::Result;
use crate::parsers::library::{
    get_library_playlists_continuation, parse_library_playlists_continuation_response,
    parse_library_playlists_response, parse_library_songs_response,
    parse_sidebar_playlists_response,
};
use crate::types::common::LikeStatus;
use crate::types::library::{LibraryPlaylist, LibrarySong};

impl YtMusicClient {
    /// Get sidebar playlists using pre-fetched library data for metadata merge.
    /// Avoids the slow paginated `get_library_playlists()` call by accepting
    /// cached library data directly.
    pub async fn get_sidebar_playlists_with_library(
        &self,
        cached_library: Vec<LibraryPlaylist>,
    ) -> Result<Vec<LibraryPlaylist>> {

        let response = self.post_innertube("guide", json!({})).await?;
        let mut playlists = parse_sidebar_playlists_response(&response)?;
        let library_by_id: HashMap<String, LibraryPlaylist> = cached_library
            .into_iter()
            .map(|playlist| (playlist.playlist_id.clone(), playlist))
            .collect();

        for playlist in &mut playlists {
            if let Some(meta) = library_by_id.get(&playlist.playlist_id) {
                playlist.is_owned_by_user = meta.is_owned_by_user;
                playlist.is_editable = meta.is_editable;
                playlist.is_special = meta.is_special;
                if playlist.subtitle.is_none() {
                    playlist.subtitle = meta.subtitle.clone();
                }
                if playlist.thumbnails.is_empty() {
                    playlist.thumbnails = meta.thumbnails.clone();
                }
            }
        }

        Ok(playlists)
    }

    /// Get playlists in the same order shown in the YouTube Music guide/sidebar.
    pub async fn get_sidebar_playlists(&self) -> Result<Vec<LibraryPlaylist>> {

        let response = self.post_innertube("guide", json!({})).await?;
        let mut playlists = parse_sidebar_playlists_response(&response)?;
        let library_meta = self.get_library_playlists().await?;
        let library_by_id: HashMap<String, LibraryPlaylist> = library_meta
            .into_iter()
            .map(|playlist| (playlist.playlist_id.clone(), playlist))
            .collect();

        for playlist in &mut playlists {
            if let Some(meta) = library_by_id.get(&playlist.playlist_id) {
                playlist.is_owned_by_user = meta.is_owned_by_user;
                playlist.is_editable = meta.is_editable;
                playlist.is_special = meta.is_special;
                if playlist.subtitle.is_none() {
                    playlist.subtitle = meta.subtitle.clone();
                }
                if playlist.thumbnails.is_empty() {
                    playlist.thumbnails = meta.thumbnails.clone();
                }
            }
        }

        Ok(playlists)
    }

    /// Get the user's library playlists, following continuation tokens to load all pages.
    pub async fn get_library_playlists(&self) -> Result<Vec<LibraryPlaylist>> {

        let body = json!({ "browseId": "FEmusic_liked_playlists" });
        let response = self.post_innertube(ENDPOINT_BROWSE, body).await?;

        let mut playlists = parse_library_playlists_response(&response)?;
        let mut continuation = get_library_playlists_continuation(&response);

        // Follow continuation tokens until all playlists are loaded
        while let Some(token) = continuation {
            let cont_body = json!({ "continuation": token });
            let cont_response = self.post_innertube(ENDPOINT_BROWSE, cont_body).await?;
            let (more, next_token) = parse_library_playlists_continuation_response(&cont_response)?;
            playlists.extend(more);
            continuation = next_token;
        }

        Ok(playlists)
    }

    /// Get the user's liked songs.
    pub async fn get_library_songs(&self) -> Result<Vec<LibrarySong>> {

        let body = json!({ "browseId": "FEmusic_liked_videos" });
        let response = self.post_innertube(ENDPOINT_BROWSE, body).await?;
        let result = parse_library_songs_response(&response)?;

        Ok(result)
    }

    /// Get the real liked songs playlist ("LM") as ordered video IDs.
    pub async fn get_liked_track_ids(&self) -> Result<Vec<String>> {

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

        Ok(ids)
    }

    /// Rate a song in the user's account.
    pub async fn rate_song(&self, video_id: &str, rating: LikeStatus) -> Result<()> {
        let endpoint = match rating {
            LikeStatus::Like => "like/like",
            LikeStatus::Dislike => "like/dislike",
            LikeStatus::Indifferent => "like/removelike",
        };

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

    /// Save or remove a playlist from the user's library.
    pub async fn rate_playlist(&self, playlist_id: &str, rating: LikeStatus) -> Result<serde_json::Value> {
        let endpoint = match rating {
            LikeStatus::Like => "like/like",
            LikeStatus::Dislike => "like/dislike",
            LikeStatus::Indifferent => "like/removelike",
        };

        self.post_innertube(
            endpoint,
            json!({
                "target": {
                    "playlistId": playlist_id,
                }
            }),
        )
        .await
    }
}
