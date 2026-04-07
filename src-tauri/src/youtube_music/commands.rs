use std::sync::Arc;
use tauri::State;
use tokio::sync::Mutex;
use ytmapi_rs::query::SearchQuery;
use ytmapi_rs::parse::SearchResults;

use super::client::YtMusicClient;

/// Test command: search YouTube Music matching the given query.
/// Returns a JSON string of search results.
#[tauri::command]
pub async fn yt_search(
    query: String,
    client: State<'_, Arc<Mutex<YtMusicClient>>>,
) -> Result<String, String> {
    println!("[yt_search] query: {query}");
    let client = client.lock().await;
    let results: SearchResults = client
        .inner()
        .query(SearchQuery::new(&query))
        .await
        .map_err(|e| format!("[yt_search] error: {e}"))?;
    let json = serde_json::to_string(&results)
        .map_err(|e| format!("[yt_search] serialization error: {e}"))?;
    println!("[yt_search] returned {} bytes", json.len());
    Ok(json)
}
