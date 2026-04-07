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
    pub method: String,
}

#[derive(Serialize)]
pub struct BrowserInfo {
    pub name: String,
    #[serde(rename = "hasCookies")]
    pub has_cookies: bool,
    #[serde(rename = "cookieCount")]
    pub cookie_count: usize,
}

// ---------------------------------------------------------------------------
// Cookie extraction helpers
// ---------------------------------------------------------------------------

/// Extract YouTube cookies from a specific browser using the `rookie` crate.
/// Returns the cookie string in "key1=val1; key2=val2" format, or None if no cookies found.
fn extract_cookies_from_browser(browser: &str) -> Result<Option<String>, String> {
    println!("[extract_cookies] Trying browser: {browser}");

    let domains = Some(vec![".youtube.com".to_string()]);

    let cookies = match browser {
        "chrome" => rookie::chrome(domains.clone()),
        "firefox" => rookie::firefox(domains.clone()),
        "edge" => rookie::edge(domains.clone()),
        "brave" => rookie::brave(domains.clone()),
        "chromium" => rookie::chromium(domains.clone()),
        "opera" => rookie::opera(domains.clone()),
        "vivaldi" => rookie::vivaldi(domains.clone()),
        _ => return Err(format!("[extract_cookies] Unknown browser: {browser}")),
    };

    match cookies {
        Ok(cookie_list) => {
            println!(
                "[extract_cookies] {browser}: found {} cookies",
                cookie_list.len()
            );
            if cookie_list.is_empty() {
                return Ok(None);
            }
            // Format as "key1=val1; key2=val2; ..."
            let cookie_string: String = cookie_list
                .iter()
                .map(|c| format!("{}={}", c.name, c.value))
                .collect::<Vec<_>>()
                .join("; ");
            println!(
                "[extract_cookies] {browser}: cookie string length = {} chars",
                cookie_string.len()
            );
            Ok(Some(cookie_string))
        }
        Err(e) => {
            println!("[extract_cookies] {browser}: error reading cookies: {e}");
            Err(format!(
                "[extract_cookies] Failed to read {browser} cookies: {e}"
            ))
        }
    }
}

/// Try browsers in priority order until one yields YouTube cookies.
fn extract_cookies_auto() -> Result<(String, String), String> {
    let browsers = ["edge", "chrome", "firefox", "brave", "chromium", "opera", "vivaldi"];

    println!("[extract_cookies_auto] Trying browsers in order: {browsers:?}");

    for browser in browsers {
        match extract_cookies_from_browser(browser) {
            Ok(Some(cookies)) => {
                println!("[extract_cookies_auto] Success with {browser}");
                return Ok((browser.to_string(), cookies));
            }
            Ok(None) => {
                println!("[extract_cookies_auto] {browser}: no YouTube cookies");
            }
            Err(e) => {
                println!("[extract_cookies_auto] {browser}: skipped ({e})");
            }
        }
    }

    Err("[extract_cookies_auto] No browser with YouTube cookies found".to_string())
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
        YtMusicClient::CookieAuth(c) => c
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
// Browser cookie auth commands
// ---------------------------------------------------------------------------

/// Detect which installed browsers have YouTube cookies.
/// Returns a list of browser info objects.
#[tauri::command]
pub async fn yt_detect_browsers() -> Result<Vec<BrowserInfo>, String> {
    println!("[yt_detect_browsers] Scanning installed browsers for YouTube cookies...");

    let browsers = ["edge", "chrome", "firefox", "brave", "chromium", "opera", "vivaldi"];
    let mut results = Vec::new();

    for browser in browsers {
        let (has_cookies, cookie_count) = match extract_cookies_from_browser(browser) {
            Ok(Some(cookie_str)) => {
                let count = cookie_str.matches(';').count() + 1;
                (true, count)
            }
            Ok(None) => (false, 0),
            Err(_) => (false, 0),
        };

        // Only include browsers that could be accessed (even if no cookies)
        // We detect availability by whether the call didn't error with "not found"
        let display_name = match browser {
            "edge" => "Microsoft Edge",
            "chrome" => "Google Chrome",
            "firefox" => "Mozilla Firefox",
            "brave" => "Brave",
            "chromium" => "Chromium",
            "opera" => "Opera",
            "vivaldi" => "Vivaldi",
            _ => browser,
        };

        if has_cookies {
            println!(
                "[yt_detect_browsers] {display_name}: {} cookies found",
                cookie_count
            );
            results.push(BrowserInfo {
                name: browser.to_string(),
                has_cookies,
                cookie_count,
            });
        } else {
            println!("[yt_detect_browsers] {display_name}: no cookies or not installed");
        }
    }

    println!(
        "[yt_detect_browsers] Found {} browsers with YouTube cookies",
        results.len()
    );
    Ok(results)
}

/// Authenticate YouTube Music using cookies extracted from a browser.
/// `browser` can be "chrome", "firefox", "edge", "brave", or "auto" to try all.
#[tauri::command]
pub async fn yt_auth_from_browser(
    browser: String,
    app: AppHandle,
    client: State<'_, Arc<Mutex<YtMusicClient>>>,
) -> Result<AuthStatusResponse, String> {
    println!("[yt_auth_from_browser] browser={browser}");

    // 1. Extract cookies
    let (used_browser, cookie_string) = if browser == "auto" {
        extract_cookies_auto()?
    } else {
        let cookies = extract_cookies_from_browser(&browser)?
            .ok_or_else(|| format!("[yt_auth_from_browser] No YouTube cookies found in {browser}"))?;
        (browser.clone(), cookies)
    };

    println!(
        "[yt_auth_from_browser] Using cookies from {used_browser} ({} chars)",
        cookie_string.len()
    );

    // 2. Create YtMusic client with cookies
    let new_client = YtMusicClient::new_from_cookies(&cookie_string).await?;

    // 3. Save cookies to disk for persistence
    let app_data_dir = app
        .path()
        .app_data_dir()
        .map_err(|e| format!("[yt_auth_from_browser] Failed to resolve app data dir: {e}"))?;
    YtMusicClient::save_cookies(&app_data_dir, &cookie_string)?;

    // 4. Replace client in state
    let mut client_guard = client.lock().await;
    *client_guard = new_client;
    println!("[yt_auth_from_browser] Cookie-auth client is now active (from {used_browser}).");

    Ok(AuthStatusResponse {
        authenticated: true,
        method: "cookie".to_string(),
    })
}

// ---------------------------------------------------------------------------
// OAuth auth commands
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

/// Check whether the client is authenticated and which method is active.
#[tauri::command]
pub async fn yt_auth_status(
    client: State<'_, Arc<Mutex<YtMusicClient>>>,
) -> Result<AuthStatusResponse, String> {
    let client = client.lock().await;
    let authenticated = client.is_authenticated();
    let method = client.auth_method().as_str().to_string();
    println!("[yt_auth_status] authenticated={authenticated}, method={method}");
    Ok(AuthStatusResponse {
        authenticated,
        method,
    })
}

/// Delete saved token/cookies and revert to unauthenticated client.
#[tauri::command]
pub async fn yt_auth_logout(
    app: AppHandle,
    client: State<'_, Arc<Mutex<YtMusicClient>>>,
) -> Result<AuthStatusResponse, String> {
    println!("[yt_auth_logout] Logging out...");

    let app_data_dir = app
        .path()
        .app_data_dir()
        .map_err(|e| format!("[yt_auth_logout] Failed to resolve app data dir: {e}"))?;

    // Delete both token and cookie files
    YtMusicClient::delete_token(&app_data_dir)?;
    YtMusicClient::delete_cookies(&app_data_dir)?;

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
        method: "none".to_string(),
    })
}
