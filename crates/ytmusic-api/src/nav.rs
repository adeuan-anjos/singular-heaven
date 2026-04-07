use serde_json::Value;

use crate::types::common::Thumbnail;

/// Safely navigate a nested JSON value by a sequence of keys.
/// Returns None if any key in the path doesn't exist.
/// Supports numeric indices for arrays (e.g., "0", "1").
pub fn nav(value: &Value, path: &[&str]) -> Option<Value> {
    let mut current = value;
    for key in path {
        // Try numeric index first for arrays
        if let Ok(idx) = key.parse::<usize>() {
            current = current.get(idx)?;
        } else {
            current = current.get(*key)?;
        }
    }
    Some(current.clone())
}

/// Navigate and return as string, or None.
pub fn nav_str(value: &Value, path: &[&str]) -> Option<String> {
    nav(value, path).and_then(|v| v.as_str().map(|s| s.to_string()))
}

/// Navigate and return as u64, or None.
pub fn nav_u64(value: &Value, path: &[&str]) -> Option<u64> {
    nav(value, path).and_then(|v| v.as_u64())
}

/// Navigate and return as array, or empty vec.
pub fn nav_array(value: &Value, path: &[&str]) -> Vec<Value> {
    nav(value, path)
        .and_then(|v| v.as_array().cloned())
        .unwrap_or_default()
}

/// Extract text from a "runs" array: [{"text": "foo"}, {"text": "bar"}] → "foobar"
pub fn get_text_from_runs(value: &Value) -> Option<String> {
    let runs = value.get("runs")?.as_array()?;
    let text: String = runs
        .iter()
        .filter_map(|r| r.get("text")?.as_str())
        .collect();
    if text.is_empty() { None } else { Some(text) }
}

/// Get text from either a "runs" format or a plain "simpleText" format.
pub fn get_text(value: &Value) -> Option<String> {
    // Try runs first
    if let Some(text) = get_text_from_runs(value) {
        return Some(text);
    }
    // Fall back to simpleText
    value.get("simpleText")?.as_str().map(|s| s.to_string())
}

/// Parse thumbnails array from InnerTube format.
pub fn parse_thumbnails(value: &Value) -> Vec<Thumbnail> {
    nav_array(value, &["thumbnail", "musicThumbnailRenderer", "thumbnail", "thumbnails"])
        .into_iter()
        .map(|t| Thumbnail {
            url: t.get("url").and_then(|v| v.as_str()).unwrap_or_default().to_string(),
            width: t.get("width").and_then(|v| v.as_u64()).unwrap_or(0) as u32,
            height: t.get("height").and_then(|v| v.as_u64()).unwrap_or(0) as u32,
        })
        .collect()
}
