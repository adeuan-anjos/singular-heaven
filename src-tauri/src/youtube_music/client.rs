use std::path::PathBuf;

use ytmapi_rs::{
    auth::{browser::BrowserToken, noauth::NoAuthToken, oauth::OAuthToken},
    YtMusic,
};

/// YouTube Music client wrapper supporting unauthenticated, OAuth, and cookie-based auth.
/// Stored in Tauri's managed state behind `Arc<Mutex<_>>`.
pub enum YtMusicClient {
    Unauthenticated(YtMusic<NoAuthToken>),
    Authenticated(YtMusic<OAuthToken>),
    CookieAuth(YtMusic<BrowserToken>),
}

/// Describes the active authentication method.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum AuthMethod {
    None,
    OAuth,
    Cookie,
}

impl AuthMethod {
    pub fn as_str(&self) -> &'static str {
        match self {
            Self::None => "none",
            Self::OAuth => "oauth",
            Self::Cookie => "cookie",
        }
    }
}

impl YtMusicClient {
    /// Create an unauthenticated client (supports search and public queries only).
    pub async fn new_unauthenticated() -> Result<Self, ytmapi_rs::Error> {
        println!("[YtMusicClient] Creating unauthenticated client...");
        let client = YtMusic::new_unauthenticated().await?;
        println!("[YtMusicClient] Unauthenticated client ready.");
        Ok(Self::Unauthenticated(client))
    }

    /// Create an authenticated client from a saved OAuth token.
    pub fn new_authenticated(token: OAuthToken) -> Self {
        println!("[YtMusicClient] Creating authenticated client from OAuth token...");
        let client = YtMusic::from_auth_token(token);
        println!("[YtMusicClient] Authenticated client ready.");
        Self::Authenticated(client)
    }

    /// Create an authenticated client from a browser cookie string.
    /// The cookie string format: "key1=val1; key2=val2; ..."
    pub async fn new_from_cookies(cookie_string: &str) -> Result<Self, String> {
        println!("[YtMusicClient] Creating cookie-auth client...");
        println!(
            "[YtMusicClient] Cookie string length: {} chars",
            cookie_string.len()
        );
        let client = YtMusic::from_cookie(cookie_string)
            .await
            .map_err(|e| format!("[YtMusicClient] Failed to create cookie client: {e}"))?;
        println!("[YtMusicClient] Cookie-auth client ready.");
        Ok(Self::CookieAuth(client))
    }

    /// Access the inner client for issuing unauthenticated queries.
    pub fn inner_unauth(&self) -> Option<&YtMusic<NoAuthToken>> {
        match self {
            Self::Unauthenticated(c) => Some(c),
            _ => None,
        }
    }

    /// Access the inner authenticated client for issuing OAuth queries.
    pub fn inner_auth(&self) -> Option<&YtMusic<OAuthToken>> {
        match self {
            Self::Authenticated(c) => Some(c),
            _ => None,
        }
    }

    /// Access the inner cookie-auth client.
    pub fn inner_cookie(&self) -> Option<&YtMusic<BrowserToken>> {
        match self {
            Self::CookieAuth(c) => Some(c),
            _ => None,
        }
    }

    /// Returns true if the client is authenticated (OAuth or Cookie).
    pub fn is_authenticated(&self) -> bool {
        matches!(self, Self::Authenticated(_) | Self::CookieAuth(_))
    }

    /// Returns the current authentication method.
    pub fn auth_method(&self) -> AuthMethod {
        match self {
            Self::Unauthenticated(_) => AuthMethod::None,
            Self::Authenticated(_) => AuthMethod::OAuth,
            Self::CookieAuth(_) => AuthMethod::Cookie,
        }
    }

    // -------------------------------------------------------------------------
    // OAuth token persistence
    // -------------------------------------------------------------------------

    /// Get the path to the saved OAuth token file in the app data directory.
    pub fn get_token_path(app_data_dir: &PathBuf) -> PathBuf {
        app_data_dir.join("oauth_token.json")
    }

    /// Save an OAuth token to disk as JSON.
    pub fn save_token(app_data_dir: &PathBuf, token: &OAuthToken) -> Result<(), String> {
        let path = Self::get_token_path(app_data_dir);
        println!("[YtMusicClient] Saving OAuth token to {}", path.display());
        std::fs::create_dir_all(app_data_dir)
            .map_err(|e| format!("[YtMusicClient] Failed to create app data dir: {e}"))?;
        let json = serde_json::to_string_pretty(token)
            .map_err(|e| format!("[YtMusicClient] Failed to serialize token: {e}"))?;
        std::fs::write(&path, json)
            .map_err(|e| format!("[YtMusicClient] Failed to write token file: {e}"))?;
        println!("[YtMusicClient] Token saved successfully.");
        Ok(())
    }

    /// Load an OAuth token from disk, if it exists.
    pub fn load_token(app_data_dir: &PathBuf) -> Result<Option<OAuthToken>, String> {
        let path = Self::get_token_path(app_data_dir);
        println!("[YtMusicClient] Checking for token at {}", path.display());
        if !path.exists() {
            println!("[YtMusicClient] No token file found.");
            return Ok(None);
        }
        println!("[YtMusicClient] Token file found, loading...");
        let json = std::fs::read_to_string(&path)
            .map_err(|e| format!("[YtMusicClient] Failed to read token file: {e}"))?;
        let token: OAuthToken = serde_json::from_str(&json)
            .map_err(|e| format!("[YtMusicClient] Failed to deserialize token: {e}"))?;
        println!("[YtMusicClient] Token loaded successfully.");
        Ok(Some(token))
    }

    /// Delete the saved token file from disk.
    pub fn delete_token(app_data_dir: &PathBuf) -> Result<(), String> {
        let path = Self::get_token_path(app_data_dir);
        println!("[YtMusicClient] Deleting token at {}", path.display());
        if path.exists() {
            std::fs::remove_file(&path)
                .map_err(|e| format!("[YtMusicClient] Failed to delete token file: {e}"))?;
            println!("[YtMusicClient] Token deleted.");
        } else {
            println!("[YtMusicClient] No token file to delete.");
        }
        Ok(())
    }

    // -------------------------------------------------------------------------
    // Cookie persistence
    // -------------------------------------------------------------------------

    /// Get the path to the saved cookie file.
    pub fn get_cookie_path(app_data_dir: &PathBuf) -> PathBuf {
        app_data_dir.join("yt_cookies.txt")
    }

    /// Save the cookie string to disk for persistence.
    pub fn save_cookies(app_data_dir: &PathBuf, cookie_string: &str) -> Result<(), String> {
        let path = Self::get_cookie_path(app_data_dir);
        println!("[YtMusicClient] Saving cookies to {}", path.display());
        std::fs::create_dir_all(app_data_dir)
            .map_err(|e| format!("[YtMusicClient] Failed to create app data dir: {e}"))?;
        std::fs::write(&path, cookie_string)
            .map_err(|e| format!("[YtMusicClient] Failed to write cookie file: {e}"))?;
        println!("[YtMusicClient] Cookies saved successfully.");
        Ok(())
    }

    /// Load saved cookies from disk, if they exist.
    pub fn load_cookies(app_data_dir: &PathBuf) -> Result<Option<String>, String> {
        let path = Self::get_cookie_path(app_data_dir);
        println!(
            "[YtMusicClient] Checking for cookies at {}",
            path.display()
        );
        if !path.exists() {
            println!("[YtMusicClient] No cookie file found.");
            return Ok(None);
        }
        println!("[YtMusicClient] Cookie file found, loading...");
        let cookies = std::fs::read_to_string(&path)
            .map_err(|e| format!("[YtMusicClient] Failed to read cookie file: {e}"))?;
        if cookies.trim().is_empty() {
            println!("[YtMusicClient] Cookie file is empty.");
            return Ok(None);
        }
        println!(
            "[YtMusicClient] Cookies loaded ({} chars).",
            cookies.len()
        );
        Ok(Some(cookies))
    }

    /// Delete the saved cookie file from disk.
    pub fn delete_cookies(app_data_dir: &PathBuf) -> Result<(), String> {
        let path = Self::get_cookie_path(app_data_dir);
        println!("[YtMusicClient] Deleting cookies at {}", path.display());
        if path.exists() {
            std::fs::remove_file(&path)
                .map_err(|e| format!("[YtMusicClient] Failed to delete cookie file: {e}"))?;
            println!("[YtMusicClient] Cookies deleted.");
        } else {
            println!("[YtMusicClient] No cookie file to delete.");
        }
        Ok(())
    }
}
