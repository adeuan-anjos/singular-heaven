use serde_json::json;

use crate::client::YtMusicClient;
use crate::constants::*;
use crate::error::Result;
use crate::parsers::search::{parse_search_response, parse_search_suggestions};
use crate::types::search::{SearchResponse, SearchSuggestion};

impl YtMusicClient {
    /// Search YouTube Music.
    ///
    /// `query` — the search text.
    /// `filter` — optional filter: "songs", "videos", "albums", "artists",
    ///            "playlists", "community_playlists", "featured_playlists".
    pub async fn search(&self, query: &str, filter: Option<&str>) -> Result<SearchResponse> {
        println!("[ytmusic-api] search(query=\"{query}\", filter={filter:?})");

        let params = filter.map(|f| get_search_params(f));

        let mut body = json!({
            "query": query,
        });
        if let Some(p) = params {
            body["params"] = json!(p);
        }

        let response = self.post_innertube(ENDPOINT_SEARCH, body).await?;
        let result = parse_search_response(&response)?;

        println!("[ytmusic-api] search returned {} results (top_result: {})",
            result.results.len(), result.top_result.is_some());

        Ok(result)
    }

    /// Get search suggestions for a partial query.
    pub async fn get_search_suggestions(&self, query: &str) -> Result<Vec<SearchSuggestion>> {
        println!("[ytmusic-api] get_search_suggestions(query=\"{query}\")");

        let body = json!({
            "input": query,
        });

        let response = self.post_innertube(ENDPOINT_SEARCH_SUGGESTIONS, body).await?;
        let suggestions = parse_search_suggestions(&response);

        println!("[ytmusic-api] got {} suggestions", suggestions.len());

        Ok(suggestions)
    }
}

/// Get the search params string for a filter.
/// These are base64-encoded protobuf params used by InnerTube.
fn get_search_params(filter: &str) -> &'static str {
    match filter {
        "songs" => "EgWKAQIIAWoKEAkQBRAKEAMQBA%3D%3D",
        "videos" => "EgWKAQIQAWoKEAkQChAFEAMQBA%3D%3D",
        "albums" => "EgWKAQIYAWoKEAkQChAFEAMQBA%3D%3D",
        "artists" => "EgWKAQIgAWoKEAkQChAFEAMQBA%3D%3D",
        "playlists" => "EgeKAQQoAEABagoQAxAEEAoQCRAF",
        "community_playlists" => "EgeKAQQoADgBagoQAxAEEAoQCRAF",
        "featured_playlists" => "EgeKAQQoAEABagoQAxAEEAoQCRAF",
        _ => "",
    }
}
