use std::path::PathBuf;

use ytmapi_rs::{
    auth::{noauth::NoAuthToken, oauth::OAuthToken},
    YtMusic,
};

/// YouTube Music client wrapper supporting both unauthenticated and OAuth modes.
/// Stored in Tauri's managed state behind `Arc<Mutex<_>>`.
pub enum YtMusicClient {
    Unauthenticated(YtMusic<NoAuthToken>),
    Authenticated(YtMusic<OAuthToken>),
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

    /// Access the inner client for issuing unauthenticated queries.
    /// Falls back to unauthenticated-style queries even when authenticated,
    /// since `YtMusic<OAuthToken>` also supports search.
    pub fn inner_unauth(&self) -> Option<&YtMusic<NoAuthToken>> {
        match self {
            Self::Unauthenticated(c) => Some(c),
            Self::Authenticated(_) => None,
        }
    }

    /// Access the inner authenticated client for issuing OAuth queries.
    pub fn inner_auth(&self) -> Option<&YtMusic<OAuthToken>> {
        match self {
            Self::Authenticated(c) => Some(c),
            Self::Unauthenticated(_) => None,
        }
    }

    /// Returns true if the client is authenticated via OAuth.
    pub fn is_authenticated(&self) -> bool {
        matches!(self, Self::Authenticated(_))
    }

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
}
