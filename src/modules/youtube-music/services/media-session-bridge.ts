import {
  mediaControls,
  PlaybackStatus,
  type MediaControlEvent,
} from "tauri-plugin-media-api";
import { listen, type UnlistenFn } from "@tauri-apps/api/event";

import { usePlayerStore } from "../stores/player-store";
import { useQueueStore } from "../stores/queue-store";
import { useTrackCacheStore } from "../stores/track-cache-store";

const LOG_TAG = "[MediaSessionBridge]";

// ── Module-level state (service, not a React component) ──

let initialized = false;
let unsubscribePlayer: (() => void) | null = null;
let unlistenMediaEvent: UnlistenFn | null = null;
let positionInterval: ReturnType<typeof setInterval> | null = null;

// ── Helpers ──

function toPlaybackStatus(isPlaying: boolean): PlaybackStatus {
  return isPlaying ? PlaybackStatus.Playing : PlaybackStatus.Paused;
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

  await mediaControls.updateNowPlaying(
    {
      title: track.title,
      artist: artistName || undefined,
      album: albumName,
      duration: track.durationSeconds > 0 ? track.durationSeconds : undefined,
      artworkUrl: thumbnail?.url,
    },
    {
      status: toPlaybackStatus(isPlaying),
      position: progress,
      playbackRate: 1,
    }
  );
}

// ── Event handler (OS → app) ──
// Events arrive via Tauri's emit system from Rust (serde camelCase serialization).
// The eventType field is a camelCase string matching MediaControlEventType variants.

function handleMediaControlEvent(event: MediaControlEvent): void {
  const eventType = event.eventType;
  console.log(LOG_TAG, "OS event received", { eventType });

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
      mediaControls.clearNowPlaying().catch((err) => {
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

    console.log(LOG_TAG, "player store changed", {
      prevTrackId,
      currentTrackId,
      prevIsPlaying,
      isPlaying,
      trackChanged,
      playStateChanged,
    });

    prevTrackId = currentTrackId;
    prevIsPlaying = isPlaying;

    if (trackChanged) {
      if (currentTrackId === null) {
        console.log(LOG_TAG, "track cleared, calling clearNowPlaying");
        mediaControls.clearNowPlaying().catch((err) => {
          console.error(LOG_TAG, "clearNowPlaying failed", err);
        });
      } else {
        pushNowPlaying(currentTrackId).catch((err) => {
          console.error(LOG_TAG, "pushNowPlaying failed", err);
        });
      }
    } else if (playStateChanged && currentTrackId !== null) {
      // Same track, only play/pause state changed
      console.log(LOG_TAG, "updatePlaybackStatus", { isPlaying });
      mediaControls
        .updatePlaybackStatus(toPlaybackStatus(isPlaying))
        .catch((err) => {
          console.error(LOG_TAG, "updatePlaybackStatus failed", err);
        });
    }
  });
}

// ── Public API ──

export async function initMediaSession(): Promise<void> {
  if (initialized) {
    console.warn(LOG_TAG, "initMediaSession called while already initialized — skipping");
    return;
  }

  console.log(LOG_TAG, "initializing media session");

  try {
    await mediaControls.initialize("com.singular.haven", "Haven Sounds");
    console.log(LOG_TAG, "mediaControls.initialize OK");
  } catch (err) {
    console.error(LOG_TAG, "mediaControls.initialize failed", err);
    // Non-fatal on platforms where media session is unavailable
  }

  // Listen for media control events emitted by the Rust side via app.emit()
  // (The JS plugin's setEventHandler is a stub — we bypass it entirely)
  unlistenMediaEvent = await listen<MediaControlEvent>("media-control-event", (e) => {
    handleMediaControlEvent(e.payload);
  });
  console.log(LOG_TAG, "Tauri event listener registered for media-control-event");

  unsubscribePlayer = subscribeToPlayerStore();

  positionInterval = setInterval(() => {
    const { progress, currentTrackId, isPlaying } = usePlayerStore.getState();
    if (currentTrackId === null || !isPlaying) return;
    mediaControls.updatePosition(progress).catch((err) => {
      console.error(LOG_TAG, "updatePosition (interval) failed", err);
    });
  }, 5000);

  console.log(LOG_TAG, "position update interval started (5s)");

  initialized = true;
  console.log(LOG_TAG, "media session initialized");
}

export function destroyMediaSession(): void {
  if (!initialized) {
    console.warn(LOG_TAG, "destroyMediaSession called while not initialized — no-op");
    return;
  }

  console.log(LOG_TAG, "destroying media session");

  if (unsubscribePlayer) {
    unsubscribePlayer();
    unsubscribePlayer = null;
    console.log(LOG_TAG, "player store unsubscribed");
  }

  if (positionInterval !== null) {
    clearInterval(positionInterval);
    positionInterval = null;
    console.log(LOG_TAG, "position update interval cleared");
  }

  if (unlistenMediaEvent) {
    unlistenMediaEvent();
    unlistenMediaEvent = null;
    console.log(LOG_TAG, "Tauri event listener removed");
  }

  mediaControls.clearNowPlaying().catch((err) => {
    console.error(LOG_TAG, "clearNowPlaying on destroy failed", err);
  });

  initialized = false;
  console.log(LOG_TAG, "media session destroyed");
}
