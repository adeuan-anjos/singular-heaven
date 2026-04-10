use sha1::{Digest, Sha1};
use std::time::{SystemTime, UNIX_EPOCH};

use crate::constants::{ORIGIN, USER_AGENT};

/// Compute SAPISIDHASH for YouTube authentication.
/// Format: timestamp_sha1(timestamp origin SAPISID)
pub fn compute_sapisidhash(sapisid: &str) -> String {
    let timestamp = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap()
        .as_secs();

    let input = format!("{timestamp} {sapisid} {ORIGIN}");
    let hash = Sha1::digest(input.as_bytes());
    format!("{timestamp}_{}", hex::encode(hash))
}

/// Extract the SAPISID value from a cookie string.
/// Looks for both SAPISID and __Secure-3PAPISID.
pub fn extract_sapisid(cookies: &str) -> Option<String> {
    // Try __Secure-3PAPISID first (more reliable)
    for part in cookies.split(';') {
        let part = part.trim();
        if let Some(val) = part.strip_prefix("__Secure-3PAPISID=") {
            return Some(val.to_string());
        }
    }
    // Fallback to SAPISID
    for part in cookies.split(';') {
        let part = part.trim();
        if let Some(val) = part.strip_prefix("SAPISID=") {
            return Some(val.to_string());
        }
    }
    None
}

/// Build the full set of headers needed for an authenticated InnerTube request.
pub fn build_auth_headers(cookies: &str, page_id: Option<&str>, auth_user: u32) -> Vec<(String, String)> {
    let mut headers = vec![
        ("User-Agent".to_string(), USER_AGENT.to_string()),
        ("Accept".to_string(), "*/*".to_string()),
        ("Accept-Language".to_string(), "en-US,en;q=0.5".to_string()),
        ("Content-Type".to_string(), "application/json".to_string()),
        ("X-Goog-AuthUser".to_string(), auth_user.to_string()),
        ("Origin".to_string(), ORIGIN.to_string()),
        ("Cookie".to_string(), cookies.to_string()),
    ];

    if let Some(sapisid) = extract_sapisid(cookies) {
        let hash = compute_sapisidhash(&sapisid);
        headers.push((
            "Authorization".to_string(),
            format!("SAPISIDHASH {hash}"),
        ));
    }

    if let Some(page_id) = page_id {
        headers.push((
            "X-Goog-PageId".to_string(),
            page_id.to_string(),
        ));
    }

    headers
}
