use serde_json::json;

use crate::client::YtMusicClient;
use crate::constants::*;
use crate::error::{Error, Result};
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

    /// Create a playlist in the user's account.
    pub async fn create_playlist(
        &self,
        title: &str,
        description: &str,
        privacy_status: &str,
        video_ids: &[String],
    ) -> Result<serde_json::Value> {
        println!(
            "[ytmusic-api] create_playlist title=\"{}\" privacy_status={} video_ids={}",
            title,
            privacy_status,
            video_ids.len()
        );

        self.post_innertube(
            ENDPOINT_PLAYLIST_CREATE,
            json!({
                "title": title,
                "description": description,
                "privacyStatus": privacy_status,
                "videoIds": video_ids,
            }),
        )
        .await
    }

    /// Delete a playlist owned by the user.
    pub async fn delete_playlist(&self, playlist_id: &str) -> Result<serde_json::Value> {
        println!("[ytmusic-api] delete_playlist playlist_id={}", playlist_id);
        self.post_innertube(
            ENDPOINT_PLAYLIST_DELETE,
            json!({
                "playlistId": playlist_id,
            }),
        )
        .await
    }

    /// Edit playlist metadata for a playlist owned by the user.
    pub async fn edit_playlist(
        &self,
        playlist_id: &str,
        title: Option<&str>,
        description: Option<&str>,
        privacy_status: Option<&str>,
    ) -> Result<serde_json::Value> {
        let mut actions: Vec<serde_json::Value> = Vec::new();

        if let Some(title) = title {
            actions.push(json!({
                "action": "ACTION_SET_PLAYLIST_NAME",
                "playlistName": title,
            }));
        }

        if let Some(description) = description {
            actions.push(json!({
                "action": "ACTION_SET_PLAYLIST_DESCRIPTION",
                "playlistDescription": description,
            }));
        }

        if let Some(privacy_status) = privacy_status {
            actions.push(json!({
                "action": "ACTION_SET_PLAYLIST_PRIVACY",
                "playlistPrivacy": privacy_status,
            }));
        }

        println!(
            "[ytmusic-api] edit_playlist playlist_id={} title={} description={} privacy_status={:?}",
            playlist_id,
            title.is_some(),
            description.is_some(),
            privacy_status
        );

        self.post_innertube(
            ENDPOINT_PLAYLIST_EDIT,
            json!({
                "playlistId": playlist_id,
                "actions": actions,
            }),
        )
        .await
    }

    /// Add tracks or another playlist into a playlist owned by the user.
    pub async fn add_playlist_items(
        &self,
        playlist_id: &str,
        video_ids: &[String],
        source_playlist_id: Option<&str>,
    ) -> Result<serde_json::Value> {
        let mut actions: Vec<serde_json::Value> = video_ids
            .iter()
            .map(|video_id| {
                json!({
                    "action": "ACTION_ADD_VIDEO",
                    "addedVideoId": video_id,
                })
            })
            .collect();

        if let Some(source_playlist_id) = source_playlist_id {
            actions.push(json!({
                "action": "ACTION_ADD_PLAYLIST",
                "addedFullListId": source_playlist_id,
            }));
        }

        println!(
            "[ytmusic-api] add_playlist_items playlist_id={} video_ids={} source_playlist_id={:?}",
            playlist_id,
            video_ids.len(),
            source_playlist_id
        );

        self.post_innertube(
            ENDPOINT_PLAYLIST_EDIT,
            json!({
                "playlistId": playlist_id,
                "actions": actions,
            }),
        )
        .await
    }

    /// Remove specific playlist entries from a playlist owned by the user.
    pub async fn remove_playlist_items(
        &self,
        playlist_id: &str,
        items: &[(String, String)],
    ) -> Result<serde_json::Value> {
        let actions: Vec<serde_json::Value> = items
            .iter()
            .map(|(video_id, set_video_id)| {
                json!({
                    "action": "ACTION_REMOVE_VIDEO",
                    "setVideoId": set_video_id,
                    "removedVideoId": video_id,
                })
            })
            .collect();

        println!(
            "[ytmusic-api] remove_playlist_items playlist_id={} items={}",
            playlist_id,
            items.len()
        );

        self.post_innertube(
            ENDPOINT_PLAYLIST_EDIT,
            json!({
                "playlistId": playlist_id,
                "actions": actions,
            }),
        )
        .await
    }

    /// Upload and apply a custom thumbnail for a playlist owned by the user.
    pub async fn set_playlist_thumbnail(
        &self,
        playlist_id: &str,
        image_bytes: &[u8],
        mime_type: &str,
    ) -> Result<serde_json::Value> {
        println!(
            "[ytmusic-api] set_playlist_thumbnail playlist_id={} bytes={} mime={}",
            playlist_id,
            image_bytes.len(),
            mime_type
        );

        let upload_json = self
            .post_binary_json(PLAYLIST_THUMBNAIL_UPLOAD_URL, image_bytes.to_vec(), mime_type)
            .await?;
        let encrypted_blob_id = upload_json
            .get("encryptedBlobId")
            .and_then(|value| value.as_str())
            .ok_or_else(|| Error::Parse {
                message: "encryptedBlobId missing from thumbnail upload response".to_string(),
            })?;

        self.post_innertube(
            ENDPOINT_PLAYLIST_EDIT,
            json!({
                "playlistId": playlist_id,
                "actions": [
                    {
                        "action": "ACTION_SET_CUSTOM_THUMBNAIL",
                        "addedCustomThumbnail": {
                            "imageKey": {
                                "type": "PLAYLIST_IMAGE_TYPE_CUSTOM_THUMBNAIL",
                                "name": "studio_square_thumbnail",
                            },
                            "playlistScottyEncryptedBlobId": encrypted_blob_id,
                        }
                    }
                ]
            }),
        )
        .await
    }
}
