import { usePlayerStore } from "../stores/player-store";
import { useQueueStore } from "../stores/queue-store";
import { useTrackCacheStore } from "../stores/track-cache-store";

const LOG_TAG = "[MediaSessionBridge]";

// ── Module-level state ──

let initialized = false;
let unsubscribePlayer: (() => void) | null = null;

// ── Feature detection ──

function isMediaSessionAvailable(): boolean {
  return "mediaSession" in navigator;
}

// ── Shared dispatch logic ──
// Used by both MediaSession action handlers (minimized/background)
// and keydown listener (foreground/focused).

function dispatchTogglePlay(): void {
  console.log(LOG_TAG, "dispatch: togglePlay");
  usePlayerStore.getState().togglePlay();
}

function dispatchNext(): void {
  console.log(LOG_TAG, "dispatch: next");
  useQueueStore.getState().next().then((nextId) => {
    if (nextId) {
      console.log(LOG_TAG, "advancing to next track", { nextId });
      usePlayerStore.getState().play(nextId);
    } else {
      console.log(LOG_TAG, "next: queue exhausted");
    }
  }).catch((err) => {
    console.error(LOG_TAG, "next() failed", err);
  });
}

function dispatchPrevious(): void {
  console.log(LOG_TAG, "dispatch: previous");
  const playerState = usePlayerStore.getState();
  if (playerState.progress > 3) {
    console.log(LOG_TAG, "previous: progress > 3s, seeking to start");
    playerState.seek(0);
  } else {
    useQueueStore.getState().previous().then((prevId) => {
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
}

function dispatchStop(): void {
  console.log(LOG_TAG, "dispatch: stop");
  usePlayerStore.getState().cleanup();
}

// ── Metadata sync (app → OS) ──

function syncMetadata(videoId: string): void {
  const track = useTrackCacheStore.getState().getTrack(videoId);
  if (!track) {
    console.warn(LOG_TAG, "syncMetadata: track not in cache", { videoId });
    return;
  }

  const artistName = track.artists.map((a) => a.name).join(", ");

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

// ── MediaSession action handlers (works when app is minimized/background) ──

function registerActionHandlers(): void {
  console.log(LOG_TAG, "registering MediaSession action handlers");

  try {
    navigator.mediaSession.setActionHandler("play", dispatchTogglePlay);
    navigator.mediaSession.setActionHandler("pause", dispatchTogglePlay);
    navigator.mediaSession.setActionHandler("nexttrack", dispatchNext);
    navigator.mediaSession.setActionHandler("previoustrack", dispatchPrevious);
    navigator.mediaSession.setActionHandler("stop", dispatchStop);
    navigator.mediaSession.setActionHandler("seekto", (details) => {
      if (details.seekTime != null) {
        console.log(LOG_TAG, "dispatch: seekto", { seekTime: details.seekTime });
        usePlayerStore.getState().seek(details.seekTime);
      }
    });
  } catch (err) {
    console.error(LOG_TAG, "failed to register some action handlers", err);
  }

  console.log(LOG_TAG, "MediaSession action handlers registered");
}

function unregisterActionHandlers(): void {
  const actions: MediaSessionAction[] = [
    "play", "pause", "nexttrack", "previoustrack", "stop", "seekto",
  ];
  for (const action of actions) {
    try {
      navigator.mediaSession.setActionHandler(action, null);
    } catch {
      // Some actions may not be supported on all platforms
    }
  }
}

// ── Keyboard media key handler (works when app is in foreground/focused) ──
// When the WebView has focus, media keys arrive as keydown events
// instead of being routed through the OS MediaSession layer.

function handleMediaKeyDown(e: KeyboardEvent): void {
  // Only handle media keys — don't interfere with other keyboard events
  switch (e.key) {
    case "MediaPlayPause":
      e.preventDefault();
      dispatchTogglePlay();
      break;
    case "MediaTrackNext":
      e.preventDefault();
      dispatchNext();
      break;
    case "MediaTrackPrevious":
      e.preventDefault();
      dispatchPrevious();
      break;
    case "MediaStop":
      e.preventDefault();
      dispatchStop();
      break;
    // No default — let all other keys pass through
  }
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

export function initMediaSession(): void {
  if (initialized) return;

  if (!isMediaSessionAvailable()) {
    console.warn(LOG_TAG, "MediaSession API not available on this platform");
    return;
  }

  console.log(LOG_TAG, "initializing");

  // MediaSession handlers — OS overlay buttons + media keys when app is background
  registerActionHandlers();

  // Keyboard listener — media keys when app is in foreground
  document.addEventListener("keydown", handleMediaKeyDown);
  console.log(LOG_TAG, "keydown listener registered for foreground media keys");

  // Store subscription — sync metadata + playback state to OS
  unsubscribePlayer = subscribeToPlayerStore();

  initialized = true;
  console.log(LOG_TAG, "initialized");
}

export function destroyMediaSession(): void {
  if (!initialized) return;

  console.log(LOG_TAG, "destroying");

  if (unsubscribePlayer) {
    unsubscribePlayer();
    unsubscribePlayer = null;
  }

  document.removeEventListener("keydown", handleMediaKeyDown);

  if (isMediaSessionAvailable()) {
    unregisterActionHandlers();
    navigator.mediaSession.metadata = null;
    navigator.mediaSession.playbackState = "none";
  }

  initialized = false;
  console.log(LOG_TAG, "destroyed");
}
