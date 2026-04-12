import { invoke } from "@tauri-apps/api/core";
import { listen, type UnlistenFn } from "@tauri-apps/api/event";

import { usePlayerStore } from "../stores/player-store";
import { useQueueStore } from "../stores/queue-store";
import { useTrackCacheStore } from "../stores/track-cache-store";

const LOG_TAG = "[MediaSessionBridge]";

// ── Module-level state (service, not a React component) ──

let initialized = false;
let initPromise: Promise<void> | null = null; // Guards against concurrent/double init (React StrictMode)
let unsubscribePlayer: (() => void) | null = null;
let unlistenMediaEvent: UnlistenFn | null = null;
let positionInterval: ReturnType<typeof setInterval> | null = null;

// ── Event deduplication ──
// The plugin's setup_button_handlers() may register multiple SMTC handlers
// (once from set_event_handler, once from initialize_session), causing
// duplicate Rust emits per single OS media key press. We deduplicate by
// eventType + timestamp — the same physical keypress produces identical timestamps.
let lastEventKey = "";

// ── Helpers ──

/** Wrapper around plugin invoke for set_metadata that includes artworkData field */
async function setMetadataWithDefaults(metadata: {
  title: string;
  artist?: string;
  album?: string;
  duration?: number;
  artworkUrl?: string;
}): Promise<void> {
  await invoke("plugin:media|set_metadata", {
    metadata: {
      title: metadata.title,
      artist: metadata.artist ?? null,
      album: metadata.album ?? null,
      albumArtist: null,
      duration: metadata.duration ?? null,
      artworkUrl: metadata.artworkUrl ?? null,
      artworkData: null, // Required by Rust struct deserialization
    },
  });
}

/** Wrapper for set_playback_info */
async function setPlaybackInfoDirect(info: {
  status: string;
  position: number;
  playbackRate: number;
}): Promise<void> {
  await invoke("plugin:media|set_playback_info", {
    info: {
      status: info.status,
      position: info.position,
      shuffle: false,
      repeatMode: "none",
      playbackRate: info.playbackRate,
    },
  });
}

/** Wrapper for set_playback_status */
async function setPlaybackStatusDirect(status: string): Promise<void> {
  await invoke("plugin:media|set_playback_status", { status });
}

/** Wrapper for clear_metadata */
async function clearNowPlayingDirect(): Promise<void> {
  await invoke("plugin:media|clear_metadata");
}

/** Wrapper for set_position */
async function updatePositionDirect(position: number): Promise<void> {
  await invoke("plugin:media|set_position", { position });
}

function toPlaybackStatus(isPlaying: boolean): string {
  return isPlaying ? "playing" : "paused";
}

async function pushNowPlaying(videoId: string): Promise<void> {
  const track = useTrackCacheStore.getState().getTrack(videoId);

  if (!track) {
    console.warn(LOG_TAG, "pushNowPlaying: track not in cache yet", { videoId });
    return;
  }

  const artistName = track.artists.map((a) => a.name).join(", ");
  const albumName = track.album?.name ?? undefined;

  // Pick the highest-resolution thumbnail available
  const thumbnail =
    track.thumbnails.length > 0
      ? track.thumbnails.reduce((best, t) =>
          t.width * t.height > best.width * best.height ? t : best
        )
      : undefined;

  const { isPlaying, progress } = usePlayerStore.getState();

  console.log(LOG_TAG, "pushNowPlaying", {
    videoId,
    title: track.title,
    artist: artistName,
    isPlaying,
  });

  await setMetadataWithDefaults({
    title: track.title,
    artist: artistName || undefined,
    album: albumName,
    duration: track.durationSeconds > 0 ? track.durationSeconds : undefined,
    artworkUrl: thumbnail?.url,
  });

  await setPlaybackInfoDirect({
    status: toPlaybackStatus(isPlaying),
    position: progress,
    playbackRate: 1,
  });
}

// ── Event handler (OS → app) ──
// Events arrive via Tauri's emit system from Rust (serde camelCase serialization).

interface MediaControlEventPayload {
  eventType: string;
  timestamp: number;
}

function handleMediaControlEvent(event: MediaControlEventPayload): void {
  // ── Deduplicate: same eventType+timestamp = same physical keypress ──
  const key = `${event.eventType}-${event.timestamp}`;
  if (key === lastEventKey) {
    console.log(LOG_TAG, "dedup: skipping duplicate event", { key });
    return;
  }
  lastEventKey = key;

  const eventType = event.eventType;
  console.log(LOG_TAG, "handling OS event", { eventType });

  const playerState = usePlayerStore.getState();
  const queueState = useQueueStore.getState();

  switch (eventType) {
    case "playPause":
    case "play":
    case "pause":
      console.log(LOG_TAG, "togglePlay");
      playerState.togglePlay();
      break;

    case "next":
      console.log(LOG_TAG, "next track");
      queueState.next().then((nextId) => {
        if (nextId) {
          console.log(LOG_TAG, "advancing to next track", { nextId });
          usePlayerStore.getState().play(nextId);
        } else {
          console.log(LOG_TAG, "next: queue exhausted");
        }
      }).catch((err) => {
        console.error(LOG_TAG, "next() failed", err);
      });
      break;

    case "previous": {
      const { progress } = usePlayerStore.getState();
      if (progress > 3) {
        console.log(LOG_TAG, "previous: progress > 3s, seeking to start", { progress });
        playerState.seek(0);
      } else {
        console.log(LOG_TAG, "previous: going to previous track");
        queueState.previous().then((prevId) => {
          if (prevId) {
            console.log(LOG_TAG, "advancing to previous track", { prevId });
            usePlayerStore.getState().play(prevId);
          } else {
            console.log(LOG_TAG, "previous: no previous track");
          }
        }).catch((err) => {
          console.error(LOG_TAG, "previous() failed", err);
        });
      }
      break;
    }

    case "stop":
      console.log(LOG_TAG, "stop");
      playerState.cleanup();
      clearNowPlayingDirect().catch((err) => {
        console.error(LOG_TAG, "clearNowPlaying after stop failed", err);
      });
      break;

    default:
      console.log(LOG_TAG, "unhandled event type", { eventType });
  }
}

// ── Store subscription (app → OS) ──

function subscribeToPlayerStore(): () => void {
  let prevTrackId: string | null = null;
  let prevIsPlaying: boolean | null = null;

  console.log(LOG_TAG, "subscribing to player store");

  return usePlayerStore.subscribe((state) => {
    const { currentTrackId, isPlaying } = state;

    const trackChanged = currentTrackId !== prevTrackId;
    const playStateChanged = isPlaying !== prevIsPlaying;

    if (!trackChanged && !playStateChanged) return;

    prevTrackId = currentTrackId;
    prevIsPlaying = isPlaying;

    if (trackChanged) {
      if (currentTrackId === null) {
        console.log(LOG_TAG, "track cleared, calling clearNowPlaying");
        clearNowPlayingDirect().catch((err) => {
          console.error(LOG_TAG, "clearNowPlaying failed", err);
        });
      } else {
        pushNowPlaying(currentTrackId).catch((err) => {
          console.error(LOG_TAG, "pushNowPlaying failed", err);
        });
      }
    } else if (playStateChanged && currentTrackId !== null) {
      console.log(LOG_TAG, "updatePlaybackStatus", { isPlaying });
      setPlaybackStatusDirect(toPlaybackStatus(isPlaying)).catch((err) => {
        console.error(LOG_TAG, "updatePlaybackStatus failed", err);
      });
    }
  });
}

// ── Public API ──

export async function initMediaSession(): Promise<void> {
  // Guard against concurrent init (React StrictMode double-mount)
  if (initialized) {
    console.warn(LOG_TAG, "already initialized — skipping");
    return;
  }
  if (initPromise) {
    console.warn(LOG_TAG, "init already in progress — waiting");
    return void (await initPromise);
  }

  initPromise = doInit();
  try {
    await initPromise;
  } finally {
    initPromise = null;
  }
}

async function doInit(): Promise<void> {
  console.log(LOG_TAG, "initializing media session");

  try {
    // Step 1: Initialize the plugin media session (creates SMTC controls on Windows)
    // At this point, event_handler is None so setup_button_handlers registers nothing.
    await invoke("plugin:media|initialize_session", {
      request: { appId: "com.singular.haven", appName: "Haven Sounds" },
    });
    console.log(LOG_TAG, "initialize_session OK");

    // Step 2: Register our event handler — this calls set_event_handler which internally
    // calls setup_button_handlers ONCE, registering exactly 1 SMTC handler.
    await invoke("register_media_event_handler");
    console.log(LOG_TAG, "register_media_event_handler OK");
  } catch (err) {
    console.error(LOG_TAG, "media session init failed", err);
  }

  // Listen for media control events emitted by the Rust side via app.emit()
  unlistenMediaEvent = await listen<MediaControlEventPayload>("media-control-event", (e) => {
    handleMediaControlEvent(e.payload);
  });
  console.log(LOG_TAG, "Tauri event listener registered for 'media-control-event'");

  unsubscribePlayer = subscribeToPlayerStore();

  positionInterval = setInterval(() => {
    const { progress, currentTrackId, isPlaying } = usePlayerStore.getState();
    if (currentTrackId === null || !isPlaying) return;
    updatePositionDirect(progress).catch((err) => {
      console.error(LOG_TAG, "updatePosition (interval) failed", err);
    });
  }, 5000);

  console.log(LOG_TAG, "position update interval started (5s)");

  initialized = true;
  console.log(LOG_TAG, "media session initialized");
}

export function destroyMediaSession(): void {
  if (!initialized && !initPromise) {
    console.warn(LOG_TAG, "destroyMediaSession: not initialized — no-op");
    return;
  }

  console.log(LOG_TAG, "destroying media session");

  if (unsubscribePlayer) {
    unsubscribePlayer();
    unsubscribePlayer = null;
  }

  if (positionInterval !== null) {
    clearInterval(positionInterval);
    positionInterval = null;
  }

  if (unlistenMediaEvent) {
    unlistenMediaEvent();
    unlistenMediaEvent = null;
  }

  clearNowPlayingDirect().catch((err) => {
    console.error(LOG_TAG, "clearNowPlaying on destroy failed", err);
  });

  initialized = false;
  console.log(LOG_TAG, "media session destroyed");
}
