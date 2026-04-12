import { usePlayerStore } from "../stores/player-store";
import { useQueueStore } from "../stores/queue-store";
import { useTrackCacheStore } from "../stores/track-cache-store";

const LOG_TAG = "[MediaSessionBridge]";

// ── Module-level state ──

let initialized = false;
let initPromise: Promise<void> | null = null;
let unsubscribePlayer: (() => void) | null = null;

// ── Feature detection ──

function isMediaSessionAvailable(): boolean {
  return "mediaSession" in navigator;
}

// ── Metadata sync (app → OS) ──

function syncMetadata(videoId: string): void {
  const track = useTrackCacheStore.getState().getTrack(videoId);
  if (!track) {
    console.warn(LOG_TAG, "syncMetadata: track not in cache", { videoId });
    return;
  }

  const artistName = track.artists.map((a) => a.name).join(", ");

  // Build artwork array from thumbnails (all resolutions for OS to pick best)
  const artwork = track.thumbnails.map((t) => ({
    src: t.url,
    sizes: `${t.width}x${t.height}`,
    type: "image/jpeg" as const,
  }));

  console.log(LOG_TAG, "syncMetadata", { title: track.title, artist: artistName });

  navigator.mediaSession.metadata = new MediaMetadata({
    title: track.title,
    artist: artistName,
    album: track.album?.name ?? "",
    artwork,
  });
}

// ── Action handlers (OS → app) ──

function registerActionHandlers(): void {
  console.log(LOG_TAG, "registering media session action handlers");

  try {
    navigator.mediaSession.setActionHandler("play", () => {
      console.log(LOG_TAG, "action: play");
      usePlayerStore.getState().togglePlay();
    });

    navigator.mediaSession.setActionHandler("pause", () => {
      console.log(LOG_TAG, "action: pause");
      usePlayerStore.getState().togglePlay();
    });

    navigator.mediaSession.setActionHandler("nexttrack", () => {
      console.log(LOG_TAG, "action: nexttrack");
      const queueState = useQueueStore.getState();
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
    });

    navigator.mediaSession.setActionHandler("previoustrack", () => {
      console.log(LOG_TAG, "action: previoustrack");
      const playerState = usePlayerStore.getState();
      if (playerState.progress > 3) {
        console.log(LOG_TAG, "previous: progress > 3s, seeking to start");
        playerState.seek(0);
      } else {
        const queueState = useQueueStore.getState();
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
    });

    navigator.mediaSession.setActionHandler("stop", () => {
      console.log(LOG_TAG, "action: stop");
      usePlayerStore.getState().cleanup();
    });

    navigator.mediaSession.setActionHandler("seekto", (details) => {
      if (details.seekTime != null) {
        console.log(LOG_TAG, "action: seekto", { seekTime: details.seekTime });
        usePlayerStore.getState().seek(details.seekTime);
      }
    });
  } catch (err) {
    console.error(LOG_TAG, "failed to register some action handlers", err);
  }

  console.log(LOG_TAG, "action handlers registered");
}

function unregisterActionHandlers(): void {
  const actions: MediaSessionAction[] = [
    "play", "pause", "nexttrack", "previoustrack", "stop", "seekto",
  ];
  for (const action of actions) {
    try {
      navigator.mediaSession.setActionHandler(action, null);
    } catch {
      // Some actions may not be supported
    }
  }
  console.log(LOG_TAG, "action handlers unregistered");
}

// ── Store subscription ──

function subscribeToPlayerStore(): () => void {
  let prevTrackId: string | null = null;
  let prevIsPlaying: boolean | null = null;

  console.log(LOG_TAG, "subscribing to player store");

  return usePlayerStore.subscribe((state) => {
    const { currentTrackId, isPlaying, progress, duration } = state;

    const trackChanged = currentTrackId !== prevTrackId;
    const playStateChanged = isPlaying !== prevIsPlaying;

    if (!trackChanged && !playStateChanged) return;

    prevTrackId = currentTrackId;
    prevIsPlaying = isPlaying;

    // Update playback state
    navigator.mediaSession.playbackState = currentTrackId
      ? (isPlaying ? "playing" : "paused")
      : "none";

    if (trackChanged && currentTrackId) {
      syncMetadata(currentTrackId);
    }

    if (trackChanged && !currentTrackId) {
      navigator.mediaSession.metadata = null;
    }

    // Update position state for the OS progress bar
    if (currentTrackId && duration > 0) {
      try {
        navigator.mediaSession.setPositionState({
          duration,
          playbackRate: 1,
          position: Math.min(progress, duration),
        });
      } catch {
        // Can fail if duration/position are invalid
      }
    }
  });
}

// ── Public API ──

export async function initMediaSession(): Promise<void> {
  if (initialized) return;
  if (initPromise) return void (await initPromise);

  initPromise = doInit();
  try {
    await initPromise;
  } finally {
    initPromise = null;
  }
}

async function doInit(): Promise<void> {
  if (!isMediaSessionAvailable()) {
    console.warn(LOG_TAG, "MediaSession API not available on this platform");
    return;
  }

  console.log(LOG_TAG, "initializing (Web MediaSession API)");

  registerActionHandlers();
  unsubscribePlayer = subscribeToPlayerStore();

  initialized = true;
  console.log(LOG_TAG, "initialized");
}

export function destroyMediaSession(): void {
  if (!initialized && !initPromise) return;

  console.log(LOG_TAG, "destroying");

  if (unsubscribePlayer) {
    unsubscribePlayer();
    unsubscribePlayer = null;
  }

  if (isMediaSessionAvailable()) {
    unregisterActionHandlers();
    navigator.mediaSession.metadata = null;
    navigator.mediaSession.playbackState = "none";
  }

  initialized = false;
  console.log(LOG_TAG, "destroyed");
}
