use serde_json::json;

use crate::client::YtMusicClient;
use crate::constants::*;
use crate::error::Result;
use crate::parsers::explore::{parse_explore_response, parse_mood_categories_response};
use crate::types::explore::{ExplorePage, MoodCategory};

impl YtMusicClient {
    /// Get the YouTube Music explore page (new releases, top songs, trending, moods, new videos).
    pub async fn get_explore(&self) -> Result<ExplorePage> {
        println!("[ytmusic-api] get_explore()");

        let body = json!({ "browseId": "FEmusic_explore" });
        let response = self.post_innertube(ENDPOINT_BROWSE, body).await?;
        let result = parse_explore_response(&response)?;

        println!(
            "[ytmusic-api] get_explore returned: releases={} top_songs={} trending={} moods={} videos={}",
            result.new_releases.len(), result.top_songs.len(),
            result.trending.len(), result.moods_and_genres.len(), result.new_videos.len()
        );

        Ok(result)
    }

    /// Get mood and genre categories from the YouTube Music "Moods & Genres" page.
    pub async fn get_mood_categories(&self) -> Result<Vec<MoodCategory>> {
        println!("[ytmusic-api] get_mood_categories()");

        let body = json!({ "browseId": "FEmusic_moods_and_genres" });
        let response = self.post_innertube(ENDPOINT_BROWSE, body).await?;
        let result = parse_mood_categories_response(&response)?;

        println!(
            "[ytmusic-api] get_mood_categories returned {} categories",
            result.len()
        );

        Ok(result)
    }
}
