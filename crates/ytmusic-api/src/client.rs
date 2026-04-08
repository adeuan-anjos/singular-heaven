use reqwest::header::{HeaderMap, HeaderName, HeaderValue};
use serde_json::Value;

use crate::auth::build_auth_headers;
use crate::constants::*;
use crate::error::{Error, Result};

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
}
