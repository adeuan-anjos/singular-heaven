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

// ---------------------------------------------------------------------------
// Android VR client — for streaming URLs (no PO token required)
// ---------------------------------------------------------------------------
pub const ANDROID_VR_CLIENT_NAME: &str = "ANDROID_VR";
pub const ANDROID_VR_CLIENT_VERSION: &str = "1.65.10";
pub const ANDROID_VR_USER_AGENT: &str = "com.google.android.apps.youtube.vr.oculus/1.65.10 (Linux; U; Android 12L; eureka-user Build/SQ3A.220605.009.A1) gzip";
pub const ANDROID_VR_DEVICE_MAKE: &str = "Oculus";
pub const ANDROID_VR_DEVICE_MODEL: &str = "Quest 3";
pub const ANDROID_VR_SDK_VERSION: u32 = 32;
pub const ANDROID_VR_OS_NAME: &str = "Android";
pub const ANDROID_VR_OS_VERSION: &str = "12L";
pub const ANDROID_VR_CLIENT_NAME_ID: &str = "28";

// YouTube base URL (not music.youtube.com — for android_vr)
pub const YOUTUBE_BASE_URL: &str = "https://www.youtube.com/youtubei/v1/";
pub const YOUTUBE_WATCH_URL: &str = "https://www.youtube.com/watch";
pub const YOUTUBE_ORIGIN: &str = "https://www.youtube.com";

// Safari UA for webpage download
pub const SAFARI_USER_AGENT: &str = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/15.5 Safari/605.1.15";

// Chrome UA for audio download from googlevideo.com
pub const CHROME_USER_AGENT: &str = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Safari/537.36";
