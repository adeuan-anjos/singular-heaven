use serde_json::Value;

use crate::nav::nav_str;

/// Extract a continuation token from an InnerTube response, if present.
pub fn get_continuation_token(response: &Value) -> Option<String> {
    // Standard location for continuations
    let continuations = response.get("continuationContents")?
        .get("musicShelfContinuation")?
        .get("continuations")?
        .as_array()?;

    continuations.first()
        .and_then(|c| nav_str(c, &["nextContinuationData", "continuation"]))
}

/// Build the continuation body for a follow-up request.
pub fn build_continuation_body(token: &str) -> Value {
    serde_json::json!({
        "continuation": token
    })
}
