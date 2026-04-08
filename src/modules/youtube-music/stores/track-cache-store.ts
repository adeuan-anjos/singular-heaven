import { create } from "zustand";
import type { Track } from "../types/music";

const MAX_CACHE_SIZE = 3000;

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
      // Evict oldest if over limit
      const keys = Object.keys(next);
      if (keys.length > MAX_CACHE_SIZE) {
        const toRemove = keys.slice(0, keys.length - MAX_CACHE_SIZE);
        for (const key of toRemove) {
          delete next[key];
        }
      }
      return { tracks: next };
    });
    console.log("[TrackCache] putTracks", { added: tracks.length, total: Object.keys(get().tracks).length });
  },

  putTrack: (track) => {
    if (!track.videoId) return;
    set((state) => ({
      tracks: { ...state.tracks, [track.videoId]: track },
    }));
  },

  getTrack: (videoId) => get().tracks[videoId],

  clear: () => {
    console.log("[TrackCache] clear");
    set({ tracks: {} });
  },
}));

/** Convenience hook for single-track lookup (stable reference per videoId) */
export function useTrack(videoId: string | undefined): Track | undefined {
  return useTrackCacheStore((s) => (videoId ? s.tracks[videoId] : undefined));
}
