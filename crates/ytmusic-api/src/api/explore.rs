use serde_json::json;

use crate::client::YtMusicClient;
use crate::constants::*;
use crate::error::Result;
use crate::parsers::explore::{parse_explore_response, parse_mood_categories_response};
use crate::types::explore::{ExplorePage, MoodCategory};

impl YtMusicClient {
    /// Get the YouTube Music explore page (new releases, top songs, trending, moods, new videos).
    pub async fn get_explore(&self) -> Result<ExplorePage> {

        let body = json!({ "browseId": "FEmusic_explore" });
        let response = self.post_innertube(ENDPOINT_BROWSE, body).await?;
        let result = parse_explore_response(&response)?;

        Ok(result)
    }

    /// Get mood and genre categories from the YouTube Music "Moods & Genres" page.
    pub async fn get_mood_categories(&self) -> Result<Vec<MoodCategory>> {

        let body = json!({ "browseId": "FEmusic_moods_and_genres" });
        let response = self.post_innertube(ENDPOINT_BROWSE, body).await?;
        let result = parse_mood_categories_response(&response)?;

        Ok(result)
    }
}
