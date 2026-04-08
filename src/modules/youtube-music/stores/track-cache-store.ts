import { create } from "zustand";
import { invoke } from "@tauri-apps/api/core";
import { useEffect } from "react";
import type { Track } from "../types/music";

const MAX_CACHE_SIZE = 200;

interface TrackCacheState {
  tracks: Record<string, Track>;
}

interface TrackCacheActions {
  putTracks: (tracks: Track[]) => void;
  putTrack: (track: Track) => void;
  getTrack: (videoId: string) => Track | undefined;
  clear: () => void;
}

export type TrackCacheStore = TrackCacheState & TrackCacheActions;

export const useTrackCacheStore = create<TrackCacheStore>()((set, get) => ({
  tracks: {},

  putTracks: (tracks) => {
    set((state) => {
      const next = { ...state.tracks };
      for (const track of tracks) {
        if (track.videoId) {
          next[track.videoId] = track;
        }
      }
      // LRU eviction
      const keys = Object.keys(next);
      if (keys.length > MAX_CACHE_SIZE) {
        const toRemove = keys.slice(0, keys.length - MAX_CACHE_SIZE);
        for (const key of toRemove) {
          delete next[key];
        }
      }
      return { tracks: next };
    });
    console.log("[TrackCache] putTracks", {
      added: tracks.length,
      total: Object.keys(get().tracks).length,
    });
  },

  putTrack: (track) => {
    if (!track.videoId) return;
    set((state) => {
      const next = { ...state.tracks, [track.videoId]: track };
      const keys = Object.keys(next);
      if (keys.length > MAX_CACHE_SIZE) {
        const toRemove = keys.slice(0, keys.length - MAX_CACHE_SIZE);
        for (const key of toRemove) {
          delete next[key];
        }
      }
      return { tracks: next };
    });
  },

  getTrack: (videoId) => get().tracks[videoId],

  clear: () => {
    console.log("[TrackCache] clear");
    set({ tracks: {} });
  },
}));

// ── Batched L2 (disk) fetch mechanism ──

let pendingIds = new Set<string>();
let batchTimer: number | null = null;

function scheduleBatchFetch() {
  if (batchTimer !== null) return;
  batchTimer = requestAnimationFrame(() => {
    batchTimer = null;
    const ids = Array.from(pendingIds);
    pendingIds.clear();
    if (ids.length === 0) return;

    console.log("[TrackCache] L2 batch fetch", { count: ids.length, ids: ids.slice(0, 5) });
    invoke<string>("yt_get_cached_tracks", { videoIds: ids })
      .then((json) => {
        const tracks: Track[] = JSON.parse(json);
        console.log("[TrackCache] L2 batch resolved", { requested: ids.length, found: tracks.length });
        if (tracks.length > 0) {
          useTrackCacheStore.getState().putTracks(tracks);
        }
      })
      .catch((err) => console.error("[TrackCache] L2 batch fetch error", err));
  });
}

function requestTrackFromDisk(videoId: string) {
  pendingIds.add(videoId);
  scheduleBatchFetch();
}

// ── Hook with L1 + L2 fallback ──

/** Resolve a track: L1 (RAM) first, async L2 (disk) fallback. */
export function useTrack(videoId: string | undefined): Track | undefined {
  const cached = useTrackCacheStore((s) => (videoId ? s.tracks[videoId] : undefined));

  useEffect(() => {
    if (videoId && !cached) {
      requestTrackFromDisk(videoId);
    }
  }, [videoId, cached]);

  return cached;
}
