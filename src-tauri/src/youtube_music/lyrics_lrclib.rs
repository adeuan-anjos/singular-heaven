// src-tauri/src/youtube_music/lyrics_lrclib.rs
//
// Backend-first integration with LRCLIB (https://lrclib.net).
// Parses the LRC text format on the server and returns typed line data
// to the frontend so the React side never has to touch regex.

use std::time::Duration;

use regex::Regex;
use serde::{Deserialize, Serialize};

const LRCLIB_BASE: &str = "https://lrclib.net/api/get";
const USER_AGENT: &str = "SingularHaven/1.0 (https://github.com/Krisma/singular-haven)";
const TIMEOUT: Duration = Duration::from_secs(8);

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct LrclibResponse {
    instrumental: Option<bool>,
    plain_lyrics: Option<String>,
    synced_lyrics: Option<String>,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct LyricsLine {
    /// Seconds from the start of the track.
    pub time: f64,
    pub text: String,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct LyricsResponse {
    /// Always "synced" in this version. Reserved for "enhanced" in the future.
    #[serde(rename = "type")]
    pub kind: String,
    pub lines: Vec<LyricsLine>,
}

/// Parses an LRC-formatted string into a sorted, deduplicated list of timed lines.
///
/// Accepts lines like `[01:23.45]Hello` and `[01:23]Hello`. Tolerates extra
/// metadata header lines (e.g. `[ar:Artist]`) by ignoring entries whose
/// minutes/seconds are out of range.
fn parse_synced_lyrics(raw: &str) -> Vec<LyricsLine> {
    // Compile once per call — this command is rare and the regex is tiny.
    let re = Regex::new(r"^\[(\d{1,2}):(\d{2})(?:\.(\d{1,3}))?\](.*)$").unwrap();

    let mut out: Vec<LyricsLine> = Vec::new();
    for raw_line in raw.lines() {
        let trimmed = raw_line.trim_end_matches('\r');
        let Some(caps) = re.captures(trimmed) else {
            continue;
        };
        let minutes: f64 = caps[1].parse().unwrap_or(0.0);
        let seconds: f64 = caps[2].parse().unwrap_or(0.0);
        if seconds >= 60.0 {
            continue;
        }
        let centis: f64 = caps
            .get(3)
            .map(|m| {
                let s = m.as_str();
                let v: f64 = s.parse().unwrap_or(0.0);
                // Normalize to seconds: support .x, .xx, .xxx
                v / 10f64.powi(s.len() as i32)
            })
            .unwrap_or(0.0);
        let time = minutes * 60.0 + seconds + centis;
        let text = caps
            .get(4)
            .map(|m| m.as_str().trim().to_string())
            .unwrap_or_default();
        if text.is_empty() {
            continue;
        }
        out.push(LyricsLine { time, text });
    }

    // LRCLIB usually returns sorted, but be defensive.
    out.sort_by(|a, b| {
        a.time
            .partial_cmp(&b.time)
            .unwrap_or(std::cmp::Ordering::Equal)
    });
    // Drop adjacent duplicates by time (rare but happens with multi-tag LRC).
    out.dedup_by(|a, b| (a.time - b.time).abs() < 0.001 && a.text == b.text);
    out
}

async fn fetch_once(
    client: &reqwest::Client,
    track_name: &str,
    artist_name: &str,
    album_name: Option<&str>,
    duration_seconds: u32,
) -> Result<Option<LrclibResponse>, String> {
    let mut url = format!(
        "{}?track_name={}&artist_name={}&duration={}",
        LRCLIB_BASE,
        urlencoding::encode(track_name),
        urlencoding::encode(artist_name),
        duration_seconds,
    );
    if let Some(album) = album_name {
        url.push_str(&format!("&album_name={}", urlencoding::encode(album)));
    }

    let resp = client
        .get(&url)
        .header(reqwest::header::USER_AGENT, USER_AGENT)
        .send()
        .await
        .map_err(|e| format!("network: {e}"))?;

    let status = resp.status();
    if status == reqwest::StatusCode::NOT_FOUND {
        return Ok(None);
    }
    if !status.is_success() {
        return Err(format!("http {}", status.as_u16()));
    }
    let body: LrclibResponse = resp.json().await.map_err(|e| format!("decode: {e}"))?;
    Ok(Some(body))
}

#[tauri::command]
pub async fn yt_lyrics_lrclib(
    track_name: String,
    artist_name: String,
    album_name: String,
    duration_seconds: u32,
) -> Result<String, String> {
    let client = reqwest::Client::builder()
        .timeout(TIMEOUT)
        .build()
        .map_err(|e| format!("[yt_lyrics_lrclib] client: {e}"))?;

    let primary = fetch_once(
        &client,
        &track_name,
        &artist_name,
        Some(&album_name),
        duration_seconds,
    )
    .await
    .map_err(|e| format!("[yt_lyrics_lrclib] {e}"))?;

    let body = match primary {
        Some(b) => b,
        None => {
            // Retry without album_name
            match fetch_once(&client, &track_name, &artist_name, None, duration_seconds)
                .await
                .map_err(|e| format!("[yt_lyrics_lrclib] {e}"))?
            {
                Some(b) => b,
                None => return Err("[yt_lyrics_lrclib] not_found".to_string()),
            }
        }
    };

    if body.instrumental.unwrap_or(false) {
        return Err("[yt_lyrics_lrclib] no_synced".to_string());
    }
    let synced = body.synced_lyrics.unwrap_or_default();
    if synced.trim().is_empty() {
        return Err("[yt_lyrics_lrclib] no_synced".to_string());
    }
    let lines = parse_synced_lyrics(&synced);
    if lines.is_empty() {
        return Err("[yt_lyrics_lrclib] no_synced".to_string());
    }
    let resp = LyricsResponse {
        kind: "synced".to_string(),
        lines,
    };
    serde_json::to_string(&resp).map_err(|e| format!("[yt_lyrics_lrclib] serialization: {e}"))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parses_simple_lrc() {
        let raw = "[00:01.00]first\n[00:02.50]second\n";
        let parsed = parse_synced_lyrics(raw);
        assert_eq!(parsed.len(), 2);
        assert!((parsed[0].time - 1.0).abs() < 0.001);
        assert_eq!(parsed[0].text, "first");
        assert!((parsed[1].time - 2.5).abs() < 0.001);
        assert_eq!(parsed[1].text, "second");
    }

    #[test]
    fn skips_metadata_and_empty_lines() {
        let raw = "[ar:Someone]\n[ti:Title]\n[00:01.00]   \n[00:02.00]ok\n";
        let parsed = parse_synced_lyrics(raw);
        assert_eq!(parsed.len(), 1);
        assert_eq!(parsed[0].text, "ok");
    }

    #[test]
    fn handles_centiseconds_normalization() {
        let raw = "[00:00.5]half\n[00:00.50]half-explicit\n[00:00.500]half-three\n";
        let parsed = parse_synced_lyrics(raw);
        // All three should round to 0.5s
        for line in &parsed {
            assert!((line.time - 0.5).abs() < 0.001, "got {}", line.time);
        }
    }
}
