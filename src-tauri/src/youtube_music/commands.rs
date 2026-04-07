use std::sync::Arc;

use serde::Serialize;
use tauri::{AppHandle, Manager, State};
use tokio::sync::Mutex;
use ytmapi_rs::{
    auth::oauth::{OAuthDeviceCode, OAuthToken, OAuthTokenGenerator},
    parse::SearchResults,
    query::SearchQuery,
};

use super::client::YtMusicClient;

/// Google TV OAuth credentials (same as ytmusicapi Python / youtui / all unofficial clients).
const OAUTH_CLIENT_ID: &str =
    "REDACTED_OAUTH_CLIENT_ID";
const OAUTH_CLIENT_SECRET: &str = "REDACTED_OAUTH_SECRET";

// ---------------------------------------------------------------------------
// Shared state for pending OAuth device code (between start and complete)
// ---------------------------------------------------------------------------
pub struct PendingOAuthCode(pub Mutex<Option<OAuthDeviceCode>>);

// ---------------------------------------------------------------------------
// Auth response DTOs
// ---------------------------------------------------------------------------
#[derive(Serialize)]
pub struct AuthStartResponse {
    pub url: String,
    #[serde(rename = "userCode")]
    pub user_code: String,
}

#[derive(Serialize)]
pub struct AuthCompleteResponse {
    pub success: bool,
}

#[derive(Serialize)]
pub struct AuthStatusResponse {
    pub authenticated: bool,
}

// ---------------------------------------------------------------------------
// Search command
// ---------------------------------------------------------------------------

/// Test command: search YouTube Music matching the given query.
/// Returns a JSON string of search results.
#[tauri::command]
pub async fn yt_search(
    query: String,
    client: State<'_, Arc<Mutex<YtMusicClient>>>,
) -> Result<String, String> {
    println!("[yt_search] query: {query}");
    let client = client.lock().await;

    let results: SearchResults = match &*client {
        YtMusicClient::Unauthenticated(c) => c
            .query(SearchQuery::new(&query))
            .await
            .map_err(|e| format!("[yt_search] error: {e}"))?,
        YtMusicClient::Authenticated(c) => c
            .query(SearchQuery::new(&query))
            .await
            .map_err(|e| format!("[yt_search] error: {e}"))?,
    };

    let json = serde_json::to_string(&results)
        .map_err(|e| format!("[yt_search] serialization error: {e}"))?;
    println!("[yt_search] returned {} bytes", json.len());
    Ok(json)
}

// ---------------------------------------------------------------------------
// Auth commands
// ---------------------------------------------------------------------------

/// Step 1: Generate OAuth device code + verification URL.
/// Returns the URL and user code for the frontend to display.
#[tauri::command]
pub async fn yt_auth_start(
    pending_code: State<'_, PendingOAuthCode>,
) -> Result<AuthStartResponse, String> {
    println!("[yt_auth_start] Generating OAuth device code...");

    let http_client = ytmapi_rs::Client::new()
        .map_err(|e| format!("[yt_auth_start] Failed to create HTTP client: {e}"))?;

    let generator = OAuthTokenGenerator::new(&http_client, OAUTH_CLIENT_ID)
        .await
        .map_err(|e| format!("[yt_auth_start] Failed to generate device code: {e}"))?;

    let url = format!(
        "{}?user_code={}",
        generator.verification_url, generator.user_code
    );
    let user_code = generator.user_code.clone();

    println!("[yt_auth_start] Verification URL: {url}");
    println!("[yt_auth_start] User code: {user_code}");

    // Store the device code for step 2
    let mut pending = pending_code.0.lock().await;
    *pending = Some(generator.device_code);
    println!("[yt_auth_start] Device code stored in state.");

    Ok(AuthStartResponse { url, user_code })
}

/// Step 2: Exchange device code for OAuth token after user completes browser flow.
/// Saves the token to disk and recreates the client with authentication.
#[tauri::command]
pub async fn yt_auth_complete(
    app: AppHandle,
    client: State<'_, Arc<Mutex<YtMusicClient>>>,
    pending_code: State<'_, PendingOAuthCode>,
) -> Result<AuthCompleteResponse, String> {
    println!("[yt_auth_complete] Exchanging device code for token...");

    // Take the pending device code
    let device_code = {
        let mut pending = pending_code.0.lock().await;
        pending
            .take()
            .ok_or_else(|| "[yt_auth_complete] No pending device code. Call yt_auth_start first.".to_string())?
    };
    println!("[yt_auth_complete] Device code retrieved from state.");

    // Exchange for token
    let http_client = ytmapi_rs::Client::new()
        .map_err(|e| format!("[yt_auth_complete] Failed to create HTTP client: {e}"))?;

    let token: OAuthToken = ytmapi_rs::generate_oauth_token(
        &http_client,
        device_code,
        OAUTH_CLIENT_ID,
        OAUTH_CLIENT_SECRET,
    )
    .await
    .map_err(|e| format!("[yt_auth_complete] Failed to exchange device code for token: {e}"))?;

    println!("[yt_auth_complete] Token obtained successfully.");

    // Save token to disk
    let app_data_dir = app
        .path()
        .app_data_dir()
        .map_err(|e| format!("[yt_auth_complete] Failed to resolve app data dir: {e}"))?;
    YtMusicClient::save_token(&app_data_dir, &token)?;

    // Recreate client with OAuth authentication
    println!("[yt_auth_complete] Recreating YtMusicClient with OAuth...");
    let new_client = YtMusicClient::new_authenticated(token);

    let mut client_guard = client.lock().await;
    *client_guard = new_client;
    println!("[yt_auth_complete] Authenticated client is now active.");

    Ok(AuthCompleteResponse { success: true })
}

/// Check whether a saved OAuth token exists (and client is authenticated).
#[tauri::command]
pub async fn yt_auth_status(
    client: State<'_, Arc<Mutex<YtMusicClient>>>,
) -> Result<AuthStatusResponse, String> {
    let client = client.lock().await;
    let authenticated = client.is_authenticated();
    println!("[yt_auth_status] authenticated={authenticated}");
    Ok(AuthStatusResponse { authenticated })
}

/// Delete saved token and revert to unauthenticated client.
#[tauri::command]
pub async fn yt_auth_logout(
    app: AppHandle,
    client: State<'_, Arc<Mutex<YtMusicClient>>>,
) -> Result<AuthStatusResponse, String> {
    println!("[yt_auth_logout] Logging out...");

    // Delete token from disk
    let app_data_dir = app
        .path()
        .app_data_dir()
        .map_err(|e| format!("[yt_auth_logout] Failed to resolve app data dir: {e}"))?;
    YtMusicClient::delete_token(&app_data_dir)?;

    // Recreate unauthenticated client
    println!("[yt_auth_logout] Recreating unauthenticated client...");
    let new_client = YtMusicClient::new_unauthenticated()
        .await
        .map_err(|e| format!("[yt_auth_logout] Failed to create unauthenticated client: {e}"))?;

    let mut client_guard = client.lock().await;
    *client_guard = new_client;
    println!("[yt_auth_logout] Reverted to unauthenticated client.");

    Ok(AuthStatusResponse {
        authenticated: false,
    })
}
