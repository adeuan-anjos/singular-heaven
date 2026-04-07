use ytmapi_rs::{auth::noauth::NoAuthToken, YtMusic};

/// Wrapper around the ytmapi-rs client for YouTube Music API access.
/// Stored in Tauri's managed state behind `Arc<Mutex<_>>`.
pub struct YtMusicClient {
    client: YtMusic<NoAuthToken>,
}

impl YtMusicClient {
    /// Create an unauthenticated client (supports search and public queries only).
    pub async fn new_unauthenticated() -> Result<Self, ytmapi_rs::Error> {
        println!("[YtMusicClient] Creating unauthenticated client...");
        let client = YtMusic::new_unauthenticated().await?;
        println!("[YtMusicClient] Unauthenticated client ready.");
        Ok(Self { client })
    }

    /// Access the inner ytmapi-rs client for issuing queries.
    pub fn inner(&self) -> &YtMusic<NoAuthToken> {
        &self.client
    }
}
