#[derive(Debug, thiserror::Error)]
#[non_exhaustive]
pub enum Error {
    #[error("HTTP request failed: {0}")]
    Http(#[from] reqwest::Error),

    #[error("JSON parsing error: {0}")]
    Json(#[from] serde_json::Error),

    #[error("API error: {message}")]
    Api { message: String },

    #[error("Auth error: {message}")]
    Auth { message: String },

    #[error("Parse error: {message}")]
    Parse { message: String },

    #[error("Not authenticated — this endpoint requires cookie auth")]
    NotAuthenticated,
}

pub type Result<T> = std::result::Result<T, Error>;
