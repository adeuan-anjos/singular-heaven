use std::future::Future;
use std::sync::atomic::{AtomicU64, Ordering};
use std::sync::Arc;
use std::time::{SystemTime, UNIX_EPOCH};

use tauri::{AppHandle, Manager};
use tokio::sync::{Mutex as AsyncMutex, RwLock};
use ytmusic_api::{Error as YtError, YtMusicClient};

use super::client::YtMusicState;

/// How long the session can sit idle before a window-focus event triggers a proactive refresh.
pub const STALE_THRESHOLD_SECS: u64 = 1800;

// ---------------------------------------------------------------------------
// SessionActivity — last successful authenticated call timestamp + refresh lock
// ---------------------------------------------------------------------------

/// Tracks when the last authenticated call succeeded and serializes concurrent
/// refresh attempts so a thundering herd of 401s only triggers one cookie extraction.
pub struct SessionActivity {
    last_success: AtomicU64,
    refresh_lock: AsyncMutex<()>,
}

impl SessionActivity {
    pub fn new() -> Self {
        Self {
            last_success: AtomicU64::new(0),
            refresh_lock: AsyncMutex::new(()),
        }
    }

    /// Record that an authenticated call just succeeded.
    pub fn mark_success(&self) {
        let now = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .map(|d| d.as_secs())
            .unwrap_or(0);
        self.last_success.store(now, Ordering::Relaxed);
    }

    /// Seconds elapsed since the last successful authenticated call.
    /// Returns `None` if no successful call has been recorded yet.
    pub fn seconds_since(&self) -> Option<u64> {
        let last = self.last_success.load(Ordering::Relaxed);
        if last == 0 {
            return None;
        }
        let now = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .map(|d| d.as_secs())
            .ok()?;
        Some(now.saturating_sub(last))
    }

    /// Force the last_success timestamp to a specific number of seconds ago.
    /// Used by debug-only test commands to simulate an idle session.
    #[cfg(debug_assertions)]
    pub fn set_seconds_ago(&self, seconds_ago: u64) {
        let now = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .map(|d| d.as_secs())
            .unwrap_or(0);
        let target = now.saturating_sub(seconds_ago);
        self.last_success.store(target, Ordering::Relaxed);
    }
}

impl Default for SessionActivity {
    fn default() -> Self {
        Self::new()
    }
}

// ---------------------------------------------------------------------------
// Cookie extraction (rookie) — moved here from commands.rs
// ---------------------------------------------------------------------------

/// Extract YouTube cookies from a specific browser using the `rookie` crate.
/// Returns the cookie string in "key1=val1; key2=val2" format, or None if no cookies found.
pub(super) fn extract_cookies_from_browser(browser: &str) -> Result<Option<String>, String> {

    let domains = Some(vec![".youtube.com".to_string()]);

    let cookies = match browser {
        "chrome" => rookie::chrome(domains.clone()),
        "firefox" => rookie::firefox(domains.clone()),
        "edge" => rookie::edge(domains.clone()),
        "brave" => rookie::brave(domains.clone()),
        "chromium" => rookie::chromium(domains.clone()),
        "opera" => rookie::opera(domains.clone()),
        "vivaldi" => rookie::vivaldi(domains.clone()),
        _ => return Err(format!("[extract_cookies] Unknown browser: {browser}")),
    };

    match cookies {
        Ok(cookie_list) => {
            if cookie_list.is_empty() {
                return Ok(None);
            }
            let cookie_string: String = cookie_list
                .iter()
                .map(|c| format!("{}={}", c.name, c.value))
                .collect::<Vec<_>>()
                .join("; ");
            Ok(Some(cookie_string))
        }
        Err(e) => {
            Err(format!(
                "[extract_cookies] Failed to read {browser} cookies: {e}"
            ))
        }
    }
}

/// Try browsers in priority order until one yields YouTube cookies.
pub(super) fn extract_cookies_auto() -> Result<(String, String), String> {
    let browsers = ["edge", "chrome", "firefox", "brave", "chromium", "opera", "vivaldi"];

    for browser in browsers {
        match extract_cookies_from_browser(browser) {
            Ok(Some(cookies)) => {
                return Ok((browser.to_string(), cookies));
            }
            Ok(None) => {
            }
            Err(_e) => {
            }
        }
    }

    Err("[extract_cookies_auto] No browser with YouTube cookies found".to_string())
}

// ---------------------------------------------------------------------------
// 401 detection
// ---------------------------------------------------------------------------

/// Returns true if the error indicates the session has expired and a cookie
/// refresh might recover it.
pub fn is_session_expired(err: &YtError) -> bool {
    if matches!(err, YtError::NotAuthenticated) {
        return true;
    }
    let s = err.to_string();
    s.contains("401") || s.contains("Unauthorized")
}

// ---------------------------------------------------------------------------
// Refresh helper — extracted from yt_ensure_session
// ---------------------------------------------------------------------------

/// Re-extract YouTube cookies from the user's browser, rebuild the `YtMusicState`,
/// persist the new cookies to disk, and atomically swap the managed state.
///
/// Concurrent callers are serialized via `SessionActivity::refresh_lock` and the
/// second-and-later callers do a quick double-check (a `get_accounts` call) before
/// re-running the expensive `rookie` extraction — if the first caller already
/// produced a working state, they bail early.
///
/// **Never holds an `await` across a lock acquisition.** Read locks are scoped to
/// `client.clone()` calls; the write lock only wraps the final state swap.
pub async fn refresh_cookies_and_rebuild_state(
    app: &AppHandle,
    state: &Arc<RwLock<YtMusicState>>,
    activity: &SessionActivity,
) -> Result<(), String> {
    let _guard = activity.refresh_lock.lock().await;

    // Double-check: another task may have already refreshed while we waited.
    let probe_client = { state.read().await.client.clone() };
    if probe_client.get_accounts().await.is_ok() {
        activity.mark_success();
        return Ok(());
    }

    // Snapshot identity (auth_user + brand account) before mutation.
    let (auth_user, obu) = {
        let s = state.read().await;
        (
            s.client.auth_user(),
            s.client.on_behalf_of_user().map(String::from),
        )
    };

    // Re-extract cookies from a browser on disk.
    let (_browser, fresh_cookies) = extract_cookies_auto()?;

    // Build the new state with the same identity.
    let mut new_state = YtMusicState::new_from_cookies(fresh_cookies.clone(), auth_user)?;
    if let Some(ref pid) = obu {
        new_state.client.set_on_behalf_of_user(Some(pid.clone()));
    }

    // Persist the fresh cookies to disk.
    let app_data_dir = app
        .path()
        .app_data_dir()
        .map_err(|e| format!("[refresh_cookies_and_rebuild_state] {e}"))?;
    YtMusicState::save_cookies(&app_data_dir, &fresh_cookies)?;

    // Atomically replace the managed state.
    {
        let mut guard = state.write().await;
        *guard = new_state;
    }

    activity.mark_success();
    Ok(())
}

// ---------------------------------------------------------------------------
// with_session_refresh — generic retry wrapper for authenticated commands
// ---------------------------------------------------------------------------

/// Run an authenticated `YtMusicClient` operation. If it fails with a session-
/// expired error (401), refresh the cookies via `refresh_cookies_and_rebuild_state`
/// and retry the operation **exactly once**. On success (first attempt or retry),
/// `SessionActivity::mark_success` is called.
///
/// The closure receives a *cloned* `YtMusicClient` so that no lock is held during
/// the network round trip.
pub async fn with_session_refresh<T, F, Fut>(
    state: &Arc<RwLock<YtMusicState>>,
    app: &AppHandle,
    activity: &SessionActivity,
    _op_name: &'static str,
    mut op: F,
) -> Result<T, YtError>
where
    F: FnMut(YtMusicClient) -> Fut,
    Fut: Future<Output = Result<T, YtError>>,
{
    // First attempt — clone the client under a read lock and drop the lock
    // before doing any network I/O.
    let client = { state.read().await.client.clone() };
    match op(client).await {
        Ok(value) => {
            activity.mark_success();
            Ok(value)
        }
        Err(err) if is_session_expired(&err) => {
            if let Err(_refresh_err) = refresh_cookies_and_rebuild_state(app, state, activity).await {
                return Err(err);
            }
            let client_retry = { state.read().await.client.clone() };
            match op(client_retry).await {
                Ok(value) => {
                    activity.mark_success();
                    Ok(value)
                }
                Err(retry_err) => {
                    Err(retry_err)
                }
            }
        }
        Err(err) => Err(err),
    }
}
