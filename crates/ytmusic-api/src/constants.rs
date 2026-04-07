/// InnerTube API base URL
pub const BASE_URL: &str = "https://music.youtube.com/youtubei/v1/";

/// InnerTube API key (public, used by all unofficial clients)
pub const API_KEY: &str = "AIzaSyC9XL3ZjWddXya6X74dJoCTL-WEYFDNX30";

/// YouTube Music origin
pub const ORIGIN: &str = "https://music.youtube.com";

/// User agent matching a modern browser
pub const USER_AGENT: &str = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36";

/// InnerTube client name for WEB_REMIX (YouTube Music web)
pub const CLIENT_NAME: &str = "WEB_REMIX";

/// InnerTube client version — update periodically
pub const CLIENT_VERSION: &str = "1.20241118.01.00";

// ---------------------------------------------------------------------------
// Endpoint paths (appended to BASE_URL)
// ---------------------------------------------------------------------------
pub const ENDPOINT_SEARCH: &str = "search";
pub const ENDPOINT_BROWSE: &str = "browse";
pub const ENDPOINT_NEXT: &str = "next";
pub const ENDPOINT_PLAYER: &str = "player";
pub const ENDPOINT_SEARCH_SUGGESTIONS: &str = "music/get_search_suggestions";
pub const ENDPOINT_GET_QUEUE: &str = "music/get_queue";
