use serde_json::json;

use crate::client::YtMusicClient;
use crate::constants::*;
use crate::error::Result;
use crate::parsers::watch::{parse_watch_response, parse_lyrics_response};
use crate::types::watch::{WatchPlaylist, Lyrics};

impl YtMusicClient {
    /// Get the watch/queue playlist for a video (radio mode).
    ///
    /// Returns the queue tracks, lyrics browse ID, and related browse ID.
    pub async fn get_watch_playlist(&self, video_id: &str) -> Result<WatchPlaylist> {
        println!("[ytmusic-api] get_watch_playlist(video_id=\"{video_id}\")");

        let playlist_id = format!("RDAMVM{video_id}");
        let body = json!({
            "videoId": video_id,
            "playlistId": playlist_id,
            "isAudioOnly": true,
        });
        let response = self.post_innertube(ENDPOINT_NEXT, body).await?;
        let result = parse_watch_response(&response)?;

        println!(
            "[ytmusic-api] get_watch_playlist returned: tracks={} lyrics={:?} related={:?}",
            result.tracks.len(), result.lyrics_browse_id, result.related_browse_id
        );

        Ok(result)
    }

    /// Get lyrics for a song by its lyrics browse ID (e.g. "MPLYt_...").
    ///
    /// The browse ID is obtained from `get_watch_playlist().lyrics_browse_id`.
    pub async fn get_lyrics(&self, browse_id: &str) -> Result<Lyrics> {
        println!("[ytmusic-api] get_lyrics(browse_id=\"{browse_id}\")");

        let body = json!({ "browseId": browse_id });
        let response = self.post_innertube(ENDPOINT_BROWSE, body).await?;
        let result = parse_lyrics_response(&response)?;

        println!(
            "[ytmusic-api] get_lyrics returned: text_len={} source={:?}",
            result.text.len(), result.source
        );

        Ok(result)
    }
}
