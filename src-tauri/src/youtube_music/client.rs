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
    pub fn new_from_cookies(cookie_string: String, auth_user: u32) -> Result<Self, String> {
        println!("[YtMusicState] Creating cookie-auth client ({} chars, auth_user={auth_user})...", cookie_string.len());
        let client = YtMusicClient::from_cookies(&cookie_string, auth_user)
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
    // Sensitive file helper (0600 on Unix, default ACL on Windows)
    // -------------------------------------------------------------------------

    fn write_sensitive_file(path: &PathBuf, content: &str) -> Result<(), String> {
        #[cfg(unix)]
        {
            use std::fs::OpenOptions;
            use std::io::Write;
            use std::os::unix::fs::OpenOptionsExt;
            let mut file = OpenOptions::new()
                .write(true)
                .create(true)
                .truncate(true)
                .mode(0o600)
                .open(path)
                .map_err(|e| format!("Failed to create file: {e}"))?;
            file.write_all(content.as_bytes())
                .map_err(|e| format!("Failed to write file: {e}"))?;
        }
        #[cfg(not(unix))]
        {
            std::fs::write(path, content)
                .map_err(|e| format!("Failed to write file: {e}"))?;
        }
        Ok(())
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
        Self::write_sensitive_file(&path, cookie_string)?;
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

    // -------------------------------------------------------------------------
    // Page ID (brand account) persistence
    // -------------------------------------------------------------------------

    pub fn get_page_id_path(app_data_dir: &PathBuf) -> PathBuf {
        app_data_dir.join("yt_page_id.txt")
    }

    pub fn save_page_id(app_data_dir: &PathBuf, page_id: &str) -> Result<(), String> {
        let path = Self::get_page_id_path(app_data_dir);
        println!("[YtMusicState] Saving page_id to {}", path.display());
        std::fs::create_dir_all(app_data_dir)
            .map_err(|e| format!("Failed to create app data dir: {e}"))?;
        Self::write_sensitive_file(&path, page_id)?;
        println!("[YtMusicState] Page ID saved.");
        Ok(())
    }

    pub fn load_page_id(app_data_dir: &PathBuf) -> Option<String> {
        let path = Self::get_page_id_path(app_data_dir);
        println!("[YtMusicState] Checking for saved page_id at {}", path.display());
        match std::fs::read_to_string(&path) {
            Ok(pid) if !pid.trim().is_empty() => {
                let pid = pid.trim().to_string();
                println!("[YtMusicState] Page ID loaded: {pid}");
                Some(pid)
            }
            _ => {
                println!("[YtMusicState] No saved page_id found.");
                None
            }
        }
    }

    pub fn delete_page_id(app_data_dir: &PathBuf) {
        let path = Self::get_page_id_path(app_data_dir);
        if path.exists() {
            let _ = std::fs::remove_file(&path);
            println!("[YtMusicState] Page ID deleted.");
        }
    }

    // -------------------------------------------------------------------------
    // Auth user index persistence
    // -------------------------------------------------------------------------

    pub fn get_auth_user_path(app_data_dir: &PathBuf) -> PathBuf {
        app_data_dir.join("yt_auth_user.txt")
    }

    pub fn save_auth_user(app_data_dir: &PathBuf, auth_user: u32) -> Result<(), String> {
        let path = Self::get_auth_user_path(app_data_dir);
        println!("[YtMusicState] save_auth_user: persisting auth_user={auth_user} to {}", path.display());
        std::fs::create_dir_all(app_data_dir)
            .map_err(|e| format!("Failed to create app data dir: {e}"))?;
        Self::write_sensitive_file(&path, &auth_user.to_string())?;
        println!("[YtMusicState] save_auth_user: auth_user={auth_user} saved successfully");
        Ok(())
    }

    pub fn load_auth_user(app_data_dir: &PathBuf) -> Option<u32> {
        let path = Self::get_auth_user_path(app_data_dir);
        println!("[YtMusicState] load_auth_user: checking {}", path.display());
        match std::fs::read_to_string(&path) {
            Ok(val) if !val.trim().is_empty() => {
                match val.trim().parse::<u32>() {
                    Ok(auth_user) => {
                        println!("[YtMusicState] load_auth_user: loaded auth_user={auth_user}");
                        Some(auth_user)
                    }
                    Err(e) => {
                        println!("[YtMusicState] load_auth_user: failed to parse value '{}': {e}", val.trim());
                        None
                    }
                }
            }
            Ok(_) => {
                println!("[YtMusicState] load_auth_user: file exists but is empty, returning None");
                None
            }
            Err(_) => {
                println!("[YtMusicState] load_auth_user: file not found, returning None (default auth_user=0 will be used)");
                None
            }
        }
    }

    pub fn delete_auth_user(app_data_dir: &PathBuf) {
        let path = Self::get_auth_user_path(app_data_dir);
        if path.exists() {
            let _ = std::fs::remove_file(&path);
            println!("[YtMusicState] delete_auth_user: auth_user file deleted from {}", path.display());
        } else {
            println!("[YtMusicState] delete_auth_user: file did not exist, nothing to delete");
        }
    }
}
