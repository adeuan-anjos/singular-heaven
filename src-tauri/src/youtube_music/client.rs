use std::path::PathBuf;
use ytmusic_api::YtMusicClient;

/// YouTube Music client state.
/// Stored in Tauri's managed state behind `Arc<Mutex<_>>`.
pub struct YtMusicState {
    pub client: YtMusicClient,
    pub cookies: Option<String>,
}

impl YtMusicState {
    /// Create unauthenticated state.
    pub fn new_unauthenticated() -> Result<Self, String> {
        println!("[YtMusicState] Creating unauthenticated client...");
        let client = YtMusicClient::new()
            .map_err(|e| format!("[YtMusicState] Failed: {e}"))?;
        println!("[YtMusicState] Unauthenticated client ready.");
        Ok(Self { client, cookies: None })
    }

    /// Create authenticated state from cookies.
    pub fn new_from_cookies(cookie_string: String) -> Result<Self, String> {
        println!("[YtMusicState] Creating cookie-auth client ({} chars)...", cookie_string.len());
        let client = YtMusicClient::from_cookies(&cookie_string)
            .map_err(|e| format!("[YtMusicState] Failed: {e}"))?;
        println!("[YtMusicState] Cookie-auth client ready.");
        Ok(Self { client, cookies: Some(cookie_string) })
    }

    pub fn is_authenticated(&self) -> bool {
        self.client.is_authenticated()
    }

    pub fn auth_method(&self) -> &'static str {
        if self.client.is_authenticated() { "cookie" } else { "none" }
    }

    // -------------------------------------------------------------------------
    // Cookie persistence
    // -------------------------------------------------------------------------

    pub fn get_cookie_path(app_data_dir: &PathBuf) -> PathBuf {
        app_data_dir.join("yt_cookies.txt")
    }

    pub fn save_cookies(app_data_dir: &PathBuf, cookie_string: &str) -> Result<(), String> {
        let path = Self::get_cookie_path(app_data_dir);
        println!("[YtMusicState] Saving cookies to {}", path.display());
        std::fs::create_dir_all(app_data_dir)
            .map_err(|e| format!("Failed to create app data dir: {e}"))?;
        std::fs::write(&path, cookie_string)
            .map_err(|e| format!("Failed to write cookie file: {e}"))?;
        println!("[YtMusicState] Cookies saved.");
        Ok(())
    }

    pub fn load_cookies(app_data_dir: &PathBuf) -> Result<Option<String>, String> {
        let path = Self::get_cookie_path(app_data_dir);
        println!("[YtMusicState] Checking for cookies at {}", path.display());
        if !path.exists() {
            println!("[YtMusicState] No cookie file found.");
            return Ok(None);
        }
        let cookies = std::fs::read_to_string(&path)
            .map_err(|e| format!("Failed to read cookie file: {e}"))?;
        if cookies.trim().is_empty() {
            return Ok(None);
        }
        println!("[YtMusicState] Cookies loaded ({} chars).", cookies.len());
        Ok(Some(cookies))
    }

    pub fn delete_cookies(app_data_dir: &PathBuf) -> Result<(), String> {
        let path = Self::get_cookie_path(app_data_dir);
        if path.exists() {
            std::fs::remove_file(&path)
                .map_err(|e| format!("Failed to delete cookie file: {e}"))?;
            println!("[YtMusicState] Cookies deleted.");
        }
        Ok(())
    }
}
