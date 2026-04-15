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
