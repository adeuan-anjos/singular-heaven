import { create } from "zustand";
import { invoke } from "@tauri-apps/api/core";
import { useEffect, startTransition } from "react";
import type { Track } from "../types/music";

const MAX_CACHE_SIZE = 2000;

interface TrackCacheState {
  tracks: Record<string, Track>;
}

interface TrackCacheActions {
  putTracks: (tracks: Track[]) => void;
  putTrack: (track: Track) => void;
  updateLikeStatus: (videoId: string, likeStatus: Track["likeStatus"]) => void;
  getTrack: (videoId: string) => Track | undefined;
  hydrateTracks: (videoIds: string[]) => Promise<void>;
  removeTracks: (videoIds: string[]) => void;
  prefetchTracks: (videoIds: string[]) => void;
  clear: () => void;
}

export type TrackCacheStore = TrackCacheState & TrackCacheActions;

export const useTrackCacheStore = create<TrackCacheStore>()((set, get) => ({
  tracks: {},

  putTracks: (tracks) => {
    set((state) => {
      const next = { ...state.tracks };
      let added = 0;
      for (const track of tracks) {
        if (track.videoId && !next[track.videoId]) {
          next[track.videoId] = track;
          added++;
        }
      }
      if (added === 0) return state; // no change, prevent re-render
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
      offered: tracks.length,
      total: Object.keys(get().tracks).length,
    });
  },

  putTrack: (track) => {
    if (!track.videoId) return;
    set((state) => {
      if (state.tracks[track.videoId]) return state; // already cached, prevent re-render
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

  updateLikeStatus: (videoId, likeStatus) => {
    if (!videoId) return;
    set((state) => {
      const current = state.tracks[videoId];
      if (!current || current.likeStatus === likeStatus) return state;
      return {
        tracks: {
          ...state.tracks,
          [videoId]: {
            ...current,
            likeStatus,
          },
        },
      };
    });
  },

  getTrack: (videoId) => get().tracks[videoId],

  hydrateTracks: async (videoIds) => {
    const ids = Array.from(new Set(videoIds.filter(Boolean))).filter(
      (videoId) => !get().tracks[videoId]
    );
    if (ids.length === 0) return;
    console.log("[TrackCache] hydrateTracks", {
      requested: ids.length,
      sample: ids.slice(0, 5),
    });
    const json = await invoke<string>("yt_get_cached_tracks", { videoIds: ids });
    const tracks: Track[] = JSON.parse(json);
    console.log("[TrackCache] hydrateTracks resolved", {
      requested: ids.length,
      found: tracks.length,
    });
    if (tracks.length > 0) {
      get().putTracks(tracks);
    }
  },

  removeTracks: (videoIds) => {
    if (videoIds.length === 0) return;
    const uniqueIds = Array.from(new Set(videoIds.filter(Boolean)));
    set((state) => {
      let changed = false;
      const next = { ...state.tracks };
      for (const videoId of uniqueIds) {
        if (next[videoId]) {
          delete next[videoId];
          changed = true;
        }
      }
      if (!changed) return state;
      return { tracks: next };
    });
    console.log("[TrackCache] removeTracks", {
      removed: uniqueIds.length,
      total: Object.keys(get().tracks).length,
    });
  },

  prefetchTracks: (videoIds) => {
    const ids = Array.from(new Set(videoIds.filter(Boolean))).filter(
      (videoId) => !get().tracks[videoId]
    );
    if (ids.length === 0) return;
    console.log("[TrackCache] prefetchTracks", {
      requested: ids.length,
      sample: ids.slice(0, 5),
    });
    for (const videoId of ids) {
      requestTrackFromDisk(videoId);
    }
  },

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
          // startTransition prevents virtualizer's flushSync from creating
          // a synchronous render cascade when cache updates trigger re-renders
          startTransition(() => {
            useTrackCacheStore.getState().putTracks(tracks);
          });
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
