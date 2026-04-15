# LRCLIB Integration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the static lyrics mock with real synced lyrics fetched from LRCLIB on every track change, fully backend-first (Rust does HTTP + LRC parsing; frontend only consumes typed JSON).

**Architecture:** A new `yt_lyrics_lrclib` Tauri command performs an HTTP GET to LRCLIB, parses the LRC `[mm:ss.xx]` timestamps server-side, and returns either a typed list of `{ time, text }` lines or a typed error string. A small Zustand store on the frontend subscribes to `currentTrackId` changes, dispatches the command, schedules silent retries on network failure, and exposes the result to the existing `useLyrics` hook with no API change. The mocks are removed.

**Tech Stack:** Rust with `reqwest` 0.12 (rustls), `serde`, `serde_json`, `urlencoding`, `regex` (all already in `Cargo.toml`); Tauri 2; React 19; Zustand 5; TypeScript strict.

**Test strategy:** No JS/TS test runner exists in this project. Verification per task: `cargo check -p singular-haven` for Rust, `npx tsc --noEmit` for TS. Final verification via `npm run build` and a manual checklist with `npm run tauri dev`. The Rust LRC parser is small enough to validate with one inline `#[cfg(test)]` unit test (no framework needed beyond `cargo test`).

---

## File Structure

### New files

| Path | Responsibility |
|------|----------------|
| `src-tauri/src/youtube_music/lyrics_lrclib.rs` | LRCLIB types (`LrclibResponse`), LRC text parser (`parse_synced_lyrics`), and `yt_lyrics_lrclib` command |
| `src/modules/youtube-music/stores/lyrics-fetch-store.ts` | Zustand store: `byVideoId` map, `bootstrap`, `cleanup`, retry scheduler, response-staleness guard |
| `src/modules/youtube-music/constants/lyrics.ts` | `FALLBACK_COLORS` constant (moved out of the deleted mocks file) |

### Modified files

| Path | Change |
|------|--------|
| `src-tauri/src/youtube_music/mod.rs` | Add `pub mod lyrics_lrclib;` |
| `src-tauri/src/lib.rs` | Register `yt_lyrics_lrclib` in `tauri::generate_handler!` |
| `src/modules/youtube-music/hooks/use-lyrics.ts` | Reads from `lyrics-fetch-store` instead of mocks; returns `{ data, activeLineIndex, isLoading }` |
| `src/modules/youtube-music/components/lyrics/lyrics-empty.tsx` | Add `showMessage?: boolean` prop (default `true`) |
| `src/modules/youtube-music/components/lyrics/lyrics-sheet.tsx` | Pass `showMessage={!isLoading}` to `LyricsEmpty`; route loading state to the empty visual |
| `src/modules/youtube-music/index.tsx` | Call `useLyricsFetchStore.getState().bootstrap()` once on mount; `cleanup()` on unmount |

### Deleted files

| Path | Reason |
|------|--------|
| `src/modules/youtube-music/mocks/lyrics-mock.ts` | Mocks no longer needed; `FALLBACK_COLORS` moved to `constants/lyrics.ts` |

---

## Phase 0 — Pre-flight

### Task 1: Verify clean baseline

**Files:** none

- [ ] **Step 1: Confirm working tree is clean**

Run:
```bash
git status
```

Expected: `nothing to commit, working tree clean`. If not, stash or commit unrelated work first.

- [ ] **Step 2: Type-check baseline**

Run:
```bash
npx tsc --noEmit
```

Expected: zero errors.

- [ ] **Step 3: Cargo check baseline**

Run:
```bash
cargo check --manifest-path src-tauri/Cargo.toml
```

Expected: builds with zero errors (warnings ok). Will take a while on first run.

---

## Phase 1 — Rust backend

### Task 2: LRCLIB types, LRC parser, and Tauri command

**Files:**
- Create: `src-tauri/src/youtube_music/lyrics_lrclib.rs`

- [ ] **Step 1: Create the file**

```rust
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
        let text = caps.get(4).map(|m| m.as_str().trim().to_string()).unwrap_or_default();
        if text.is_empty() {
            continue;
        }
        out.push(LyricsLine { time, text });
    }

    // LRCLIB usually returns sorted, but be defensive.
    out.sort_by(|a, b| a.time.partial_cmp(&b.time).unwrap_or(std::cmp::Ordering::Equal));
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
    let body: LrclibResponse = resp
        .json()
        .await
        .map_err(|e| format!("decode: {e}"))?;
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
    let resp = LyricsResponse { kind: "synced".to_string(), lines };
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
```

- [ ] **Step 2: Run rustfmt to keep formatting consistent**

Run:
```bash
cd src-tauri && cargo fmt -- src/youtube_music/lyrics_lrclib.rs && cd ..
```

Expected: no output (success).

- [ ] **Step 3: Run cargo check**

Run:
```bash
cargo check --manifest-path src-tauri/Cargo.toml
```

Expected: builds with zero errors. May report warnings about unused fields (`plain_lyrics`); ignore those — they document what the API returns even though we don't use them.

- [ ] **Step 4: Run the parser unit tests**

Run:
```bash
cargo test --manifest-path src-tauri/Cargo.toml --lib lyrics_lrclib
```

Expected: 3 tests pass (`parses_simple_lrc`, `skips_metadata_and_empty_lines`, `handles_centiseconds_normalization`).

- [ ] **Step 5: Commit**

```bash
git add src-tauri/src/youtube_music/lyrics_lrclib.rs
git commit -m "$(cat <<'EOF'
feat(rust): add yt_lyrics_lrclib command with LRC parser

Backend-first LRCLIB integration. Parses the [mm:ss.xx] format
server-side so the React layer only ever sees typed { time, text }
records. Falls back to a request without album_name when the first
attempt 404s. Returns "not_found" for genuine misses, "no_synced"
when LRCLIB only has plain lyrics or marks the track as instrumental.

Co-Authored-By: Claude Opus 4.6 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 3: Wire the new module + register the command

**Files:**
- Modify: `src-tauri/src/youtube_music/mod.rs`
- Modify: `src-tauri/src/lib.rs`

- [ ] **Step 1: Add the module declaration**

Open `src-tauri/src/youtube_music/mod.rs`. Find the existing `pub mod` declarations and add `pub mod lyrics_lrclib;` to the list. Place it alphabetically (after `commands` if it sorts there in the existing file).

If the file currently looks like:
```rust
pub mod client;
pub mod commands;
pub mod session;
```

It should become:
```rust
pub mod client;
pub mod commands;
pub mod lyrics_lrclib;
pub mod session;
```

- [ ] **Step 2: Register the command in `lib.rs`**

Open `src-tauri/src/lib.rs`. Find the `tauri::generate_handler![` block (around line 535). Find the line with `youtube_music::commands::yt_get_lyrics,` and add directly after it:

```rust
            youtube_music::lyrics_lrclib::yt_lyrics_lrclib,
```

- [ ] **Step 3: cargo check**

Run:
```bash
cargo check --manifest-path src-tauri/Cargo.toml
```

Expected: zero errors.

- [ ] **Step 4: Commit**

```bash
git add src-tauri/src/youtube_music/mod.rs src-tauri/src/lib.rs
git commit -m "$(cat <<'EOF'
feat(rust): register yt_lyrics_lrclib in tauri handler

Co-Authored-By: Claude Opus 4.6 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Phase 2 — Frontend data layer

### Task 4: Move `FALLBACK_COLORS` to `constants/lyrics.ts`

**Files:**
- Create: `src/modules/youtube-music/constants/lyrics.ts`

- [ ] **Step 1: Create the constants file**

```ts
// src/modules/youtube-music/constants/lyrics.ts

/**
 * Three soft hex colors used by the animated background when
 * dominant-color extraction is unavailable. Replaced by real
 * extraction in a future plan.
 */
export const FALLBACK_COLORS: [string, string, string] = [
  "#1e293b",
  "#334155",
  "#475569",
];
```

- [ ] **Step 2: Type-check**

Run:
```bash
npx tsc --noEmit
```

Expected: zero errors.

- [ ] **Step 3: Commit**

```bash
git add src/modules/youtube-music/constants/lyrics.ts
git commit -m "$(cat <<'EOF'
refactor(lyrics): extract FALLBACK_COLORS into constants

Co-Authored-By: Claude Opus 4.6 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 5: `lyrics-fetch-store` — Zustand store + bootstrap subscriber

**Files:**
- Create: `src/modules/youtube-music/stores/lyrics-fetch-store.ts`

- [ ] **Step 1: Create the store**

```ts
// src/modules/youtube-music/stores/lyrics-fetch-store.ts
import { create } from "zustand";
import { invoke } from "@tauri-apps/api/core";
import type { LyricsData, LyricsLine } from "../types/lyrics";
import { FALLBACK_COLORS } from "../constants/lyrics";
import { usePlayerStore } from "./player-store";
import { useTrackCacheStore } from "./track-cache-store";

type FetchStatus = "loading" | "ready" | "error";

interface FetchEntry {
  status: FetchStatus;
  data?: LyricsData;
  error?: string;
  attempt: number;
  retryTimer?: ReturnType<typeof setTimeout>;
}

interface BackendLyricsResponse {
  type: "synced";
  lines: LyricsLine[];
}

const RETRY_DELAYS_MS = [5_000, 15_000];

const MISSING_DATA: LyricsData = {
  type: "missing",
  colors: FALLBACK_COLORS,
};

interface LyricsFetchState {
  byVideoId: Record<string, FetchEntry>;
  _unsubscribe: (() => void) | null;
  bootstrap: () => void;
  cleanup: () => void;
}

function isCurrentTrack(videoId: string): boolean {
  return usePlayerStore.getState().currentTrackId === videoId;
}

function clearTimer(entry: FetchEntry | undefined): void {
  if (entry?.retryTimer) clearTimeout(entry.retryTimer);
}

export const useLyricsFetchStore = create<LyricsFetchState>()((set, get) => {
  function recordReady(videoId: string, data: LyricsData): void {
    if (!isCurrentTrack(videoId)) return;
    set((state) => {
      clearTimer(state.byVideoId[videoId]);
      return {
        byVideoId: {
          ...state.byVideoId,
          [videoId]: { status: "ready", data, attempt: state.byVideoId[videoId]?.attempt ?? 1 },
        },
      };
    });
  }

  function recordError(videoId: string, error: string, attempt: number): void {
    if (!isCurrentTrack(videoId)) return;
    if (attempt >= RETRY_DELAYS_MS.length + 1) {
      // Out of retries — degrade to missing.
      recordReady(videoId, MISSING_DATA);
      return;
    }
    const delay = RETRY_DELAYS_MS[attempt - 1];
    const timer = setTimeout(() => {
      runFetch(videoId, attempt + 1);
    }, delay);
    set((state) => ({
      byVideoId: {
        ...state.byVideoId,
        [videoId]: { status: "error", error, attempt, retryTimer: timer },
      },
    }));
  }

  async function runFetch(videoId: string, attempt: number): Promise<void> {
    const track = useTrackCacheStore.getState().getTrack(videoId);
    if (!track) {
      recordReady(videoId, MISSING_DATA);
      return;
    }
    if (!track.durationSeconds || track.durationSeconds <= 0) {
      recordReady(videoId, MISSING_DATA);
      return;
    }
    set((state) => ({
      byVideoId: {
        ...state.byVideoId,
        [videoId]: { status: "loading", attempt },
      },
    }));

    const trackName = track.title;
    const artistName = track.artists.map((a) => a.name).join(", ");
    const albumName = track.album?.name ?? "";

    try {
      const json = await invoke<string>("yt_lyrics_lrclib", {
        trackName,
        artistName,
        albumName,
        durationSeconds: Math.round(track.durationSeconds),
      });
      const parsed = JSON.parse(json) as BackendLyricsResponse;
      const data: LyricsData = {
        type: "synced",
        lines: parsed.lines,
        colors: FALLBACK_COLORS,
      };
      recordReady(videoId, data);
    } catch (e) {
      const message = String(e);
      if (message.includes("not_found") || message.includes("no_synced")) {
        recordReady(videoId, MISSING_DATA);
        return;
      }
      recordError(videoId, message, attempt);
    }
  }

  function onTrackChange(videoId: string | null): void {
    if (!videoId) return;
    const existing = get().byVideoId[videoId];
    if (existing && existing.status === "ready") return;
    if (existing && existing.status === "loading") return;
    runFetch(videoId, 1);
  }

  return {
    byVideoId: {},
    _unsubscribe: null,

    bootstrap: () => {
      if (get()._unsubscribe) return;
      // Trigger immediately for whatever is playing right now.
      onTrackChange(usePlayerStore.getState().currentTrackId);
      const unsubscribe = usePlayerStore.subscribe(
        (state) => state.currentTrackId,
        (id) => onTrackChange(id),
      );
      set({ _unsubscribe: unsubscribe });
    },

    cleanup: () => {
      const unsub = get()._unsubscribe;
      if (unsub) unsub();
      const entries = get().byVideoId;
      for (const id of Object.keys(entries)) {
        clearTimer(entries[id]);
      }
      set({ byVideoId: {}, _unsubscribe: null });
    },
  };
});
```

- [ ] **Step 2: Type-check**

Run:
```bash
npx tsc --noEmit
```

Expected: zero errors.

- [ ] **Step 3: Commit**

```bash
git add src/modules/youtube-music/stores/lyrics-fetch-store.ts
git commit -m "$(cat <<'EOF'
feat(lyrics): add zustand store that fetches from yt_lyrics_lrclib

Subscribes to currentTrackId. Per video: dispatches the Tauri
command, schedules silent retries at 5s and 15s on transient
network errors, distinguishes 'not_found' / 'no_synced' (treated
as missing) from real errors, and discards stale responses when
the user has already moved on to another track.

Co-Authored-By: Claude Opus 4.6 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 6: Rewrite `use-lyrics.ts` to read from the fetch store

**Files:**
- Modify: `src/modules/youtube-music/hooks/use-lyrics.ts`

- [ ] **Step 1: Replace the file with the new implementation**

```ts
// src/modules/youtube-music/hooks/use-lyrics.ts
import { useMemo } from "react";
import { usePlayerStore } from "../stores/player-store";
import { useLyricsFetchStore } from "../stores/lyrics-fetch-store";
import type { LyricsData } from "../types/lyrics";

export interface UseLyricsResult {
  data: LyricsData | null;
  activeLineIndex: number;
  isLoading: boolean;
}

/**
 * Reads from the LRCLIB-backed fetch store. The store itself owns
 * the dispatch lifecycle — this hook is purely reactive.
 */
export function useLyrics(videoId: string | null | undefined): UseLyricsResult {
  const progress = usePlayerStore((s) => s.progress);
  const entry = useLyricsFetchStore((s) =>
    videoId ? s.byVideoId[videoId] : undefined,
  );

  const data = entry?.data ?? null;
  const isLoading = !entry || entry.status !== "ready";

  const activeLineIndex = useMemo(() => {
    if (!data || data.type === "missing") return -1;
    let active = -1;
    for (let i = 0; i < data.lines.length; i++) {
      if (data.lines[i].time <= progress) active = i;
      else break;
    }
    return active;
  }, [data, progress]);

  return { data, activeLineIndex, isLoading };
}
```

- [ ] **Step 2: Type-check**

Run:
```bash
npx tsc --noEmit
```

Expected: zero errors. (`LyricsSheet` will still type-check because the new return type has a strict superset of the old fields; `isLoading` will simply be unused there until Task 8 wires it.)

- [ ] **Step 3: Commit**

```bash
git add src/modules/youtube-music/hooks/use-lyrics.ts
git commit -m "$(cat <<'EOF'
refactor(lyrics): use-lyrics now reads from lyrics-fetch-store

Removes the mock import. Returns isLoading alongside data and
activeLineIndex so the sheet can route to the empty visual
without a mistakenly-shown 'no lyrics' message.

Co-Authored-By: Claude Opus 4.6 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Phase 3 — UI tweaks

### Task 7: `LyricsEmpty` — `showMessage` prop

**Files:**
- Modify: `src/modules/youtube-music/components/lyrics/lyrics-empty.tsx`

- [ ] **Step 1: Replace the file**

```tsx
// src/modules/youtube-music/components/lyrics/lyrics-empty.tsx
import React from "react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { thumbUrl } from "../../utils/thumb-url";
import type { Track } from "../../types/music";

interface LyricsEmptyProps {
  track: Track;
  /** When false, hides the "Letra não disponível" line — used while a fetch is in flight. */
  showMessage?: boolean;
}

/**
 * Shown both as the loading placeholder (showMessage=false) and as
 * the genuine "no synced lyrics" fallback (showMessage=true). Same
 * visual in both cases so the transition into actual lyrics is smooth.
 */
export const LyricsEmpty = React.memo(function LyricsEmpty({
  track,
  showMessage = true,
}: LyricsEmptyProps) {
  const imgUrl = track.thumbnails[0]?.url ?? "";
  const artistName = track.artists.map((a) => a.name).join(", ");

  return (
    <div className="flex h-full flex-col items-center justify-center gap-4 text-center">
      <Avatar className="size-48 rounded-2xl">
        <AvatarImage
          src={thumbUrl(imgUrl, 400)}
          alt={track.title}
          className="rounded-2xl object-cover"
        />
        <AvatarFallback className="rounded-2xl text-3xl">
          {track.title.charAt(0)}
        </AvatarFallback>
      </Avatar>
      <div className="font-heading">
        <h2 className="text-2xl font-semibold text-foreground">{track.title}</h2>
        <p className="text-base text-muted-foreground">{artistName}</p>
      </div>
      {showMessage && (
        <p className="mt-4 text-sm text-muted-foreground">
          Letra não disponível para esta música.
        </p>
      )}
    </div>
  );
});
```

- [ ] **Step 2: Type-check**

Run:
```bash
npx tsc --noEmit
```

Expected: zero errors. (Existing `<LyricsEmpty track={...} />` calls keep working — `showMessage` defaults to `true`.)

- [ ] **Step 3: Commit**

```bash
git add src/modules/youtube-music/components/lyrics/lyrics-empty.tsx
git commit -m "$(cat <<'EOF'
feat(lyrics): LyricsEmpty learns showMessage prop for loading reuse

Co-Authored-By: Claude Opus 4.6 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 8: `LyricsSheet` — route loading state to the empty visual

**Files:**
- Modify: `src/modules/youtube-music/components/lyrics/lyrics-sheet.tsx`

- [ ] **Step 1: Replace the FALLBACK_COLORS import path and the JSX condition**

Open `src/modules/youtube-music/components/lyrics/lyrics-sheet.tsx`.

Find the line:
```tsx
import { FALLBACK_COLORS } from "../../mocks/lyrics-mock";
```
Replace with:
```tsx
import { FALLBACK_COLORS } from "../../constants/lyrics";
```

Find the destructure:
```tsx
const { data, activeLineIndex } = useLyrics(currentTrackId);
```
Replace with:
```tsx
const { data, activeLineIndex, isLoading } = useLyrics(currentTrackId);
```

Find the JSX block that renders either `<LyricsLines>` or `<LyricsEmpty>`:
```tsx
              {data && data.type !== "missing" ? (
                <LyricsLines data={data} activeLineIndex={activeLineIndex} />
              ) : (
                <LyricsEmpty track={track} />
              )}
```
Replace with:
```tsx
              {data && data.type !== "missing" ? (
                <LyricsLines data={data} activeLineIndex={activeLineIndex} />
              ) : (
                <LyricsEmpty track={track} showMessage={!isLoading} />
              )}
```

- [ ] **Step 2: Type-check**

Run:
```bash
npx tsc --noEmit
```

Expected: zero errors.

- [ ] **Step 3: Commit**

```bash
git add src/modules/youtube-music/components/lyrics/lyrics-sheet.tsx
git commit -m "$(cat <<'EOF'
feat(lyrics): suppress 'unavailable' message while fetch is in-flight

Co-Authored-By: Claude Opus 4.6 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 9: Bootstrap the fetch store from the module

**Files:**
- Modify: `src/modules/youtube-music/index.tsx`

- [ ] **Step 1: Add the import**

Open `src/modules/youtube-music/index.tsx`. After the existing imports, add:

```tsx
import { useLyricsFetchStore } from "./stores/lyrics-fetch-store";
```

- [ ] **Step 2: Bootstrap on module mount**

Find a `useEffect` near the top of the component that runs once on mount (the one that calls `initMediaSession` is a good neighbor). Right after the existing useEffect, add a new one:

```tsx
  useEffect(() => {
    const store = useLyricsFetchStore.getState();
    store.bootstrap();
    return () => store.cleanup();
  }, []);
```

If you cannot find an existing single-mount `useEffect` to anchor near, add the new useEffect immediately after the line that destructures `useDocumentHiddenClass()` (the very first hook call in the component body).

- [ ] **Step 3: Type-check**

Run:
```bash
npx tsc --noEmit
```

Expected: zero errors.

- [ ] **Step 4: Commit**

```bash
git add src/modules/youtube-music/index.tsx
git commit -m "$(cat <<'EOF'
feat(lyrics): bootstrap lyrics fetch store with module lifecycle

Co-Authored-By: Claude Opus 4.6 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 10: Delete the mocks file

**Files:**
- Delete: `src/modules/youtube-music/mocks/lyrics-mock.ts`

- [ ] **Step 1: Confirm no remaining imports**

Run:
```bash
grep -rn "mocks/lyrics-mock\|LYRICS_MOCKS\|DEFAULT_MOCK" src/
```

Expected: zero matches. If anything matches, fix the import to use `constants/lyrics` and rerun.

- [ ] **Step 2: Delete the file**

Run:
```bash
rm src/modules/youtube-music/mocks/lyrics-mock.ts
```

If `src/modules/youtube-music/mocks/` is now empty:
```bash
rmdir src/modules/youtube-music/mocks
```

- [ ] **Step 3: Type-check**

Run:
```bash
npx tsc --noEmit
```

Expected: zero errors.

- [ ] **Step 4: Commit**

```bash
git add -A
git commit -m "$(cat <<'EOF'
chore(lyrics): remove mocks/lyrics-mock now that LRCLIB is wired

Co-Authored-By: Claude Opus 4.6 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Phase 4 — Verification

### Task 11: End-to-end check

**Files:** none

- [ ] **Step 1: Production build to catch any wiring drift**

Run:
```bash
npm run build
```

Expected: build succeeds.

- [ ] **Step 2: Cargo build / cargo test once more**

Run:
```bash
cargo test --manifest-path src-tauri/Cargo.toml --lib lyrics_lrclib
```

Expected: 3 tests pass.

- [ ] **Step 3: Run dev**

Run (in a separate terminal):
```bash
npm run tauri dev
```

Wait for the Tauri window to open and a track to start playing.

- [ ] **Step 4: Manual checklist**

- [ ] Open DevTools → Network. Filter for `lrclib.net`. Confirm a `GET` to `lrclib.net/api/get?...` fires when the current track changes (not when the lyrics sheet opens).
- [ ] Open the lyrics sheet on a popular track (e.g., something widely known). The capa + título + artista appear centered for a moment, then transition to scrolling synced lyrics.
- [ ] The active line is centered, with the surrounding lines fading per the previous spring/blur work.
- [ ] Skip to a different track in the queue. Confirm a new `GET` to `lrclib.net/api/get?...` fires and the lyrics update.
- [ ] Find a niche track unlikely to be in LRCLIB. Confirm: the "Letra não disponível para esta música." message appears (only after the fetch completes).
- [ ] Disable Wi-Fi, skip to another track. Confirm: capa centralizada (no message). After ~20 seconds (5s + 15s of retries), the message appears.
- [ ] Re-enable Wi-Fi. Skip to another popular track. Confirm: lyrics fetch and display normally.
- [ ] Inspect a request URL in DevTools. Confirm the params include `track_name`, `artist_name`, `album_name`, and `duration` — and that on a 404, a second request goes out **without** `album_name`.

- [ ] **Step 5: Stop dev**

In the dev terminal: `Ctrl+C`.

- [ ] **Step 6: Final commit (only if you needed to tweak anything during verification)**

If everything worked, this step is a no-op. If you adjusted something:

```bash
git add -A
git commit -m "fix(lyrics): adjust LRCLIB integration based on visual verification"
```

---

## Done

Lyrics are now real, fetched from LRCLIB on every track change, with silent retries on transient failures and the same UI shape as the mock version. Color extraction, plain-lyrics fallback, and word-level karaoke are tracked in subsequent specs.

---

## Self-Review Notes (for the planner)

- **Spec coverage:** every section of `2026-04-15-lyrics-lrclib-integration-design.md` maps to at least one task. §2 (backend) → Tasks 2–3. §3 (frontend) → Tasks 4–6, 9. §4 (UI) → Tasks 7–8. §5 edge cases — track without duration, instrumental, response staleness, retry — all encoded in Task 5's store. §6 verification → Task 11. §7 mutations checklist → covered by file deletes/creates in Tasks 2–10. §8 (out of scope) intentionally omitted.
- **No placeholders:** every step has either a concrete code block, a concrete shell command with expected output, or a precise edit instruction (e.g., "after the line that says X, add Y").
- **Type consistency:** `LyricsLine` (Rust) serializes to `{ time: f64, text: String }` which the TS `LyricsLine` interface in `types/lyrics.ts` already expects (`time: number; text: string;`). The Rust `LyricsResponse.kind` field is renamed to `type` via `#[serde(rename = "type")]` so the TS `BackendLyricsResponse` discriminator matches. `FetchEntry` defines `data?: LyricsData`, exactly what `useLyrics` reads.
- **YAGNI check:** no caching layer, no abort controller, no plain-lyrics fallback. All deferred per spec.
