use serde_json::json;

use crate::client::YtMusicClient;
use crate::constants::*;
use crate::error::Result;
use crate::parsers::browsing::{parse_artist_response, parse_album_response, parse_home_response};
use crate::types::browsing::{ArtistPage, AlbumPage, HomeSection};

impl YtMusicClient {
    /// Get an artist page by channel/browse ID (e.g. "UClYV6hHlupm_S_ObS1W-DYw").
    pub async fn get_artist(&self, browse_id: &str) -> Result<ArtistPage> {

        let body = json!({ "browseId": browse_id });
        let response = self.post_innertube(ENDPOINT_BROWSE, body).await?;
        let result = parse_artist_response(&response, browse_id)?;

        Ok(result)
    }

    /// Get an album page by browse ID (e.g. "MPREb_FWIMEPTHFsY").
    pub async fn get_album(&self, browse_id: &str) -> Result<AlbumPage> {

        let body = json!({ "browseId": browse_id });
        let response = self.post_innertube(ENDPOINT_BROWSE, body).await?;
        let result = parse_album_response(&response, browse_id)?;

        Ok(result)
    }

    /// Get the YouTube Music home page sections.
    ///
    /// `limit` controls the maximum number of sections to return.
    pub async fn get_home(&self, limit: usize) -> Result<Vec<HomeSection>> {

        let body = json!({ "browseId": "FEmusic_home" });
        let response = self.post_innertube(ENDPOINT_BROWSE, body).await?;
        let result = parse_home_response(&response, limit)?;

        Ok(result)
    }
}
