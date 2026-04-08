use reqwest::header::{HeaderMap, HeaderName, HeaderValue};
use serde_json::Value;

use crate::auth::build_auth_headers;
use crate::constants::*;
use crate::error::{Error, Result};
use crate::types::streaming::{StreamingData, StreamingFormat};

/// YouTube Music API client.
pub struct YtMusicClient {
    http: reqwest::Client,
    cookies: Option<String>,
    language: String,
    country: String,
    /// Brand account / channel ID for multi-account support.
    /// When set, all requests include `user.onBehalfOfUser` in the context.
    on_behalf_of_user: Option<String>,
}

impl YtMusicClient {
    /// Create a new unauthenticated client (public endpoints only).
    pub fn new() -> Result<Self> {
        let http = reqwest::Client::builder()
            .user_agent(USER_AGENT)
            .build()?;

        Ok(Self {
            http,
            cookies: None,
            language: "pt-BR".to_string(),
            country: "BR".to_string(),
            on_behalf_of_user: None,
        })
    }

    /// Create a new authenticated client from a cookie string.
    pub fn from_cookies(cookies: impl Into<String>) -> Result<Self> {
        let cookies = cookies.into();
        let http = reqwest::Client::builder()
            .user_agent(USER_AGENT)
            .build()?;

        Ok(Self {
            http,
            cookies: Some(cookies),
            language: "pt-BR".to_string(),
            country: "BR".to_string(),
            on_behalf_of_user: None,
        })
    }

    /// Set the brand account / channel ID for multi-account support.
    pub fn set_on_behalf_of_user(&mut self, user_id: Option<String>) {
        println!("[YtMusicClient] set_on_behalf_of_user: {:?}", user_id);
        self.on_behalf_of_user = user_id;
    }

    /// Get the current on_behalf_of_user value.
    pub fn on_behalf_of_user(&self) -> Option<&str> {
        self.on_behalf_of_user.as_deref()
    }

    /// Check if the client has cookie authentication.
    pub fn is_authenticated(&self) -> bool {
        self.cookies.is_some()
    }

    /// Build the InnerTube context object included in every request body.
    fn build_context(&self) -> Value {
        let mut user = serde_json::json!({
            "enableSafetyMode": false
        });

        if let Some(ref obu) = self.on_behalf_of_user {
            user["onBehalfOfUser"] = Value::String(obu.clone());
        }

        serde_json::json!({
            "client": {
                "clientName": CLIENT_NAME,
                "clientVersion": CLIENT_VERSION,
                "hl": self.language,
                "gl": self.country,
            },
            "user": user
        })
    }

    /// Send a POST request to an InnerTube endpoint.
    /// `endpoint` is the path after the base URL (e.g., "search").
    /// `body` is merged with the context object.
    pub async fn post_innertube(&self, endpoint: &str, body: Value) -> Result<Value> {
        let url = format!("{BASE_URL}{endpoint}?key={API_KEY}&prettyPrint=false");

        let mut payload = body;
        payload["context"] = self.build_context();

        let mut request = self.http.post(&url).json(&payload);

        // Add auth headers if authenticated
        if let Some(ref cookies) = self.cookies {
            let auth_headers = build_auth_headers(cookies);
            let mut header_map = HeaderMap::new();
            for (key, value) in auth_headers {
                if let (Ok(name), Ok(val)) = (
                    HeaderName::from_bytes(key.as_bytes()),
                    HeaderValue::from_str(&value),
                ) {
                    header_map.insert(name, val);
                }
            }
            request = request.headers(header_map);
        }

        let response = request.send().await?;
        let status = response.status();

        if !status.is_success() {
            let body_text = response.text().await.unwrap_or_default();
            return Err(Error::Api {
                message: format!("HTTP {status}: {}", &body_text[..body_text.len().min(500)]),
            });
        }

        let json: Value = response.json().await?;
        Ok(json)
    }

    // -----------------------------------------------------------------------
    // Streaming — Android VR client
    // -----------------------------------------------------------------------

    /// Fetch visitor_data from YouTube webpage.
    /// This token is required for android_vr API calls.
    async fn fetch_visitor_data(&self, video_id: &str) -> Result<String> {
        println!("[YtMusicClient] fetch_visitor_data: downloading webpage for {video_id}");

        let url = format!("{YOUTUBE_WATCH_URL}?v={video_id}&bpctr=9999999999&has_verified=1");

        let response = self
            .http
            .get(&url)
            .header("User-Agent", SAFARI_USER_AGENT)
            .header("Accept-Language", "en-us,en;q=0.5")
            .send()
            .await?;

        let html = response.text().await?;
        println!(
            "[YtMusicClient] fetch_visitor_data: webpage size={} chars",
            html.len()
        );

        // Extract VISITOR_DATA from ytcfg
        let visitor_data = regex::Regex::new(r#""VISITOR_DATA"\s*:\s*"([^"]+)""#)
            .unwrap()
            .captures(&html)
            .and_then(|c| c.get(1))
            .map(|m| m.as_str().to_string())
            .ok_or_else(|| Error::Parse {
                message: "VISITOR_DATA not found in webpage".to_string(),
            })?;

        println!(
            "[YtMusicClient] fetch_visitor_data: found visitor_data ({}...)",
            &visitor_data[..20.min(visitor_data.len())]
        );
        Ok(visitor_data)
    }

    /// Get the best audio stream URL for a video using android_vr client.
    pub async fn get_stream_url(&self, video_id: &str) -> Result<StreamingData> {
        println!("[YtMusicClient] get_stream_url: starting for videoId={video_id}");

        // Step 1: Get visitor_data from webpage
        let visitor_data = self.fetch_visitor_data(video_id).await?;

        // Step 2: Build android_vr player request
        let payload = serde_json::json!({
            "videoId": video_id,
            "context": {
                "client": {
                    "clientName": ANDROID_VR_CLIENT_NAME,
                    "clientVersion": ANDROID_VR_CLIENT_VERSION,
                    "deviceMake": ANDROID_VR_DEVICE_MAKE,
                    "deviceModel": ANDROID_VR_DEVICE_MODEL,
                    "androidSdkVersion": ANDROID_VR_SDK_VERSION,
                    "userAgent": ANDROID_VR_USER_AGENT,
                    "osName": ANDROID_VR_OS_NAME,
                    "osVersion": ANDROID_VR_OS_VERSION,
                    "hl": self.language,
                    "gl": self.country,
                }
            },
            "playbackContext": {
                "contentPlaybackContext": {
                    "html5Preference": "HTML5_PREF_WANTS"
                }
            },
            "contentCheckOk": true,
            "racyCheckOk": true,
        });

        let url = format!("{YOUTUBE_BASE_URL}{ENDPOINT_PLAYER}?prettyPrint=false");
        println!("[YtMusicClient] get_stream_url: POST {url}");

        let response = self
            .http
            .post(&url)
            .header("Content-Type", "application/json")
            .header("X-YouTube-Client-Name", ANDROID_VR_CLIENT_NAME_ID)
            .header("X-YouTube-Client-Version", ANDROID_VR_CLIENT_VERSION)
            .header("Origin", YOUTUBE_ORIGIN)
            .header("X-Goog-Visitor-Id", &visitor_data)
            .header("User-Agent", ANDROID_VR_USER_AGENT)
            .json(&payload)
            .send()
            .await?;

        let status = response.status();
        println!("[YtMusicClient] get_stream_url: response status={status}");

        if !status.is_success() {
            let body_text = response.text().await.unwrap_or_default();
            return Err(Error::Api {
                message: format!(
                    "Player HTTP {status}: {}",
                    &body_text[..body_text.len().min(500)]
                ),
            });
        }

        let json: serde_json::Value = response.json().await?;

        // Check playability
        let playability_status = json
            .get("playabilityStatus")
            .and_then(|ps| ps.get("status"))
            .and_then(|s| s.as_str())
            .unwrap_or("UNKNOWN");

        println!("[YtMusicClient] get_stream_url: playabilityStatus={playability_status}");

        if playability_status != "OK" {
            let reason = json
                .get("playabilityStatus")
                .and_then(|ps| ps.get("reason"))
                .and_then(|r| r.as_str())
                .unwrap_or("Unknown error");
            return Err(Error::Api {
                message: format!("Video not playable: {reason}"),
            });
        }

        // Parse adaptive formats
        let adaptive_formats = json
            .get("streamingData")
            .and_then(|sd| sd.get("adaptiveFormats"))
            .and_then(|af| af.as_array())
            .ok_or_else(|| Error::Parse {
                message: "No streamingData.adaptiveFormats in response".to_string(),
            })?;

        println!(
            "[YtMusicClient] get_stream_url: {} adaptiveFormats",
            adaptive_formats.len()
        );

        // Filter audio formats and pick best
        let mut audio_formats: Vec<StreamingFormat> = adaptive_formats
            .iter()
            .filter_map(|fmt| serde_json::from_value::<StreamingFormat>(fmt.clone()).ok())
            .filter(|fmt| fmt.mime_type.starts_with("audio/"))
            .collect();

        println!(
            "[YtMusicClient] get_stream_url: {} audio formats",
            audio_formats.len()
        );

        if audio_formats.is_empty() {
            return Err(Error::Parse {
                message: "No audio formats found".to_string(),
            });
        }

        audio_formats.sort_by(|a, b| b.bitrate.cmp(&a.bitrate));
        let best = &audio_formats[0];

        println!(
            "[YtMusicClient] get_stream_url: best — bitrate={}, mime={}, quality={:?}",
            best.bitrate, best.mime_type, best.audio_quality
        );

        let stream_url = best.url.as_ref().ok_or_else(|| Error::Api {
            message: "Best audio format has no direct URL".to_string(),
        })?;

        Ok(StreamingData {
            url: stream_url.clone(),
            mime_type: best.mime_type.clone(),
            bitrate: best.bitrate,
            audio_quality: best.audio_quality.clone(),
            approx_duration_ms: best.approx_duration_ms.clone(),
            audio_sample_rate: best.audio_sample_rate.clone(),
            audio_channels: best.audio_channels,
            content_length: best.content_length.clone(),
        })
    }

    /// Download complete audio bytes for a video.
    /// Uses android_vr to get the stream URL, then downloads with Chrome UA.
    pub async fn fetch_audio_bytes(&self, video_id: &str) -> Result<(Vec<u8>, String)> {
        println!("[YtMusicClient] fetch_audio_bytes: starting for videoId={video_id}");

        let stream_data = self.get_stream_url(video_id).await?;
        let mime_type = stream_data.mime_type.clone();

        let content_length: u64 = stream_data
            .content_length
            .as_deref()
            .and_then(|s| s.parse().ok())
            .unwrap_or(0);

        println!(
            "[YtMusicClient] fetch_audio_bytes: downloading {} bytes, mime={}",
            content_length, mime_type
        );

        // Use a fresh client for the download — the crate's self.http has WEB_REMIX
        // defaults that may interfere. yt-dlp also uses generic Chrome headers for downloads.
        let dl_client = reqwest::Client::builder()
            .user_agent(CHROME_USER_AGENT)
            .build()
            .map_err(|e| Error::Http(e))?;

        // Range header is CRITICAL — without it YouTube throttles to ~30KB/s.
        // With it, downloads complete in <1s. This is the same as yt-dlp's http_chunk_size.
        let range_header = if content_length > 0 {
            format!("bytes=0-{}", content_length - 1)
        } else {
            "bytes=0-".to_string()
        };

        println!("[YtMusicClient] fetch_audio_bytes: downloading with Range: {range_header}");

        let response = dl_client
            .get(&stream_data.url)
            .header("Accept-Encoding", "identity")
            .header("Range", &range_header)
            .send()
            .await?;

        let status = response.status();
        let resp_content_length = response.content_length();
        println!("[YtMusicClient] fetch_audio_bytes: download status={status}, content-length={:?}", resp_content_length);

        if !status.is_success() {
            return Err(Error::Api {
                message: format!("Audio download failed: HTTP {status}"),
            });
        }

        let bytes = response.bytes().await?;
        println!(
            "[YtMusicClient] fetch_audio_bytes: downloaded {} bytes",
            bytes.len()
        );

        Ok((bytes.to_vec(), mime_type))
    }
}
