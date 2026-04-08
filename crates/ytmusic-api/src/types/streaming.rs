use serde::{Deserialize, Serialize};

/// Internal struct for deserializing adaptiveFormats entries
#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct StreamingFormat {
    pub url: Option<String>,
    pub signature_cipher: Option<String>,
    pub mime_type: String,
    pub bitrate: u64,
    pub audio_quality: Option<String>,
    pub approx_duration_ms: Option<String>,
    pub audio_sample_rate: Option<String>,
    pub audio_channels: Option<u32>,
    pub content_length: Option<String>,
}

/// Resolved stream data for the best audio format
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct StreamingData {
    pub url: String,
    pub mime_type: String,
    pub bitrate: u64,
    pub audio_quality: Option<String>,
    pub approx_duration_ms: Option<String>,
    pub audio_sample_rate: Option<String>,
    pub audio_channels: Option<u32>,
    pub content_length: Option<String>,
}
