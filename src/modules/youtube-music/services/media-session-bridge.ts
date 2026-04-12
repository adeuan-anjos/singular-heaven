import { usePlayerStore } from "../stores/player-store";
import { useQueueStore } from "../stores/queue-store";
import { useTrackCacheStore } from "../stores/track-cache-store";

// ── Module-level state ──

let initialized = false;
let unsubscribePlayer: (() => void) | null = null;

// ── Feature detection ──

function isMediaSessionAvailable(): boolean {
  return "mediaSession" in navigator;
}

// ── Shared dispatch logic ──

function dispatchTogglePlay(): void {
  usePlayerStore.getState().togglePlay();
}

function dispatchNext(): void {
  useQueueStore.getState().next().then((nextId) => {
    if (nextId) usePlayerStore.getState().play(nextId);
  }).catch(() => {});
}

function dispatchPrevious(): void {
  const playerState = usePlayerStore.getState();
  if (playerState.progress > 3) {
    playerState.seek(0);
  } else {
    useQueueStore.getState().previous().then((prevId) => {
      if (prevId) usePlayerStore.getState().play(prevId);
    }).catch(() => {});
  }
}

function dispatchStop(): void {
  usePlayerStore.getState().cleanup();
}

// ── Metadata sync (app → OS) ──

function syncMetadata(videoId: string): void {
  const track = useTrackCacheStore.getState().getTrack(videoId);
  if (!track) return;

  navigator.mediaSession.metadata = new MediaMetadata({
    title: track.title,
    artist: track.artists.map((a) => a.name).join(", "),
    album: track.album?.name ?? "",
    artwork: track.thumbnails.map((t) => ({
      src: t.url,
      sizes: `${t.width}x${t.height}`,
      type: "image/jpeg" as const,
    })),
  });
}

// ── MediaSession action handlers (background/minimized) ──

function registerActionHandlers(): void {
  try {
    navigator.mediaSession.setActionHandler("play", dispatchTogglePlay);
    navigator.mediaSession.setActionHandler("pause", dispatchTogglePlay);
    navigator.mediaSession.setActionHandler("nexttrack", dispatchNext);
    navigator.mediaSession.setActionHandler("previoustrack", dispatchPrevious);
    navigator.mediaSession.setActionHandler("stop", dispatchStop);
    navigator.mediaSession.setActionHandler("seekto", (details) => {
      if (details.seekTime != null) usePlayerStore.getState().seek(details.seekTime);
    });
  } catch {
    // Some actions may not be supported on all platforms
  }
}

function unregisterActionHandlers(): void {
  const actions: MediaSessionAction[] = [
    "play", "pause", "nexttrack", "previoustrack", "stop", "seekto",
  ];
  for (const action of actions) {
    try { navigator.mediaSession.setActionHandler(action, null); } catch {}
  }
}

// ── Keyboard media key handler (foreground/focused) ──

function handleMediaKeyDown(e: KeyboardEvent): void {
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
  }
}

// ── Store subscription ──

function subscribeToPlayerStore(): () => void {
  let prevTrackId: string | null = null;
  let prevIsPlaying: boolean | null = null;

  return usePlayerStore.subscribe((state) => {
    const { currentTrackId, isPlaying, progress, duration } = state;

    const trackChanged = currentTrackId !== prevTrackId;
    const playStateChanged = isPlaying !== prevIsPlaying;

    if (!trackChanged && !playStateChanged) return;

    prevTrackId = currentTrackId;
    prevIsPlaying = isPlaying;

    navigator.mediaSession.playbackState = currentTrackId
      ? (isPlaying ? "playing" : "paused")
      : "none";

    if (trackChanged && currentTrackId) syncMetadata(currentTrackId);
    if (trackChanged && !currentTrackId) navigator.mediaSession.metadata = null;

    if (currentTrackId && duration > 0) {
      try {
        navigator.mediaSession.setPositionState({
          duration,
          playbackRate: 1,
          position: Math.min(progress, duration),
        });
      } catch {}
    }
  });
}

// ── Public API ──

export function initMediaSession(): void {
  if (initialized) return;
  if (!isMediaSessionAvailable()) return;

  registerActionHandlers();
  document.addEventListener("keydown", handleMediaKeyDown);
  unsubscribePlayer = subscribeToPlayerStore();

  initialized = true;
}

export function destroyMediaSession(): void {
  if (!initialized) return;

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
}
