import { create } from "zustand";
import type { Track } from "../types/music";
import {
  ytGetLikedTrackIdsCached,
  ytRateSong,
  type TrackLikeStatus,
} from "../services/yt-api";
import { useTrackCacheStore } from "./track-cache-store";

type PendingMap = Record<string, true>;
type LikeStatusMap = Record<string, TrackLikeStatus>;

interface TrackLikeState {
  likeStatuses: LikeStatusMap;
  likedEntryCount: number;
  likedUniqueCount: number;
  hydrated: boolean;
  hydrating: boolean;
  pending: PendingMap;
}

interface TrackLikeActions {
  hydrate: (force?: boolean, reason?: string) => Promise<void>;
  replaceLikedTrackIds: (videoIds: string[]) => void;
  getResolvedLikeStatus: (
    videoId: string | null | undefined,
    fallback?: Track["likeStatus"]
  ) => TrackLikeStatus;
  toggleTrackLike: (
    videoId: string,
    fallback?: Track["likeStatus"]
  ) => Promise<TrackLikeStatus>;
  clear: () => void;
}

export type TrackLikeStore = TrackLikeState & TrackLikeActions;

let hydrationPromise: Promise<void> | null = null;
let lastHydratedAt = 0;
const REVALIDATE_INTERVAL_MS = 15_000;

function normalizeLikeStatus(
  likeStatus?: TrackLikeStatus | Track["likeStatus"] | null
): TrackLikeStatus {
  return likeStatus === "LIKE" ? "LIKE" : "INDIFFERENT";
}

function syncTrackCacheLikeStatus(
  videoId: string,
  likeStatus: TrackLikeStatus
): void {
  useTrackCacheStore.getState().updateLikeStatus(videoId, likeStatus);
}

export const useTrackLikeStore = create<TrackLikeStore>()((set, get) => ({
  likeStatuses: {},
  likedEntryCount: 0,
  likedUniqueCount: 0,
  hydrated: false,
  hydrating: false,
  pending: {},

  hydrate: async (force = false, reason = "unknown") => {
    const now = Date.now();
    const recentlyHydrated = now - lastHydratedAt < REVALIDATE_INTERVAL_MS;

    if (get().hydrating) {
      return hydrationPromise ?? Promise.resolve();
    }

    if (hydrationPromise) {
      return hydrationPromise;
    }

    if (!force && get().hydrated && recentlyHydrated) {
      console.log(
        `[TrackLikeStore] hydrate skipped ${JSON.stringify({
          force,
          reason,
          hydrated: get().hydrated,
          ageMs: now - lastHydratedAt,
        })}`
      );
      return Promise.resolve();
    }

    set({ hydrating: true });
    hydrationPromise = ytGetLikedTrackIdsCached()
      .then((videoIds) => {
        lastHydratedAt = Date.now();
        console.log(
          `[TrackLikeStore] hydrate ${JSON.stringify({
            force,
            reason,
            playlistEntryCount: videoIds.length,
            uniqueVideoIdCount: new Set(videoIds).size,
            sample: videoIds.slice(0, 5),
          })}`
        );
        get().replaceLikedTrackIds(videoIds);
      })
      .finally(() => {
        hydrationPromise = null;
        set({ hydrating: false });
      });

    return hydrationPromise;
  },

  replaceLikedTrackIds: (videoIds) => {
    const likedSet = new Set(videoIds.filter(Boolean));
    console.log(
      `[TrackLikeStore] replaceLikedTrackIds ${JSON.stringify({
        playlistEntryCount: videoIds.length,
        uniqueVideoIdCount: likedSet.size,
        sample: Array.from(likedSet).slice(0, 5),
      })}`
    );
    set((state) => {
      const next: LikeStatusMap = { ...state.likeStatuses };

      for (const [videoId, likeStatus] of Object.entries(next)) {
        if (state.pending[videoId]) continue;
        if (likeStatus === "LIKE" && !likedSet.has(videoId)) {
          next[videoId] = "INDIFFERENT";
          syncTrackCacheLikeStatus(videoId, "INDIFFERENT");
        }
      }

      for (const videoId of likedSet) {
        if (state.pending[videoId]) continue;
        next[videoId] = "LIKE";
        syncTrackCacheLikeStatus(videoId, "LIKE");
      }

      return {
        likeStatuses: next,
        likedEntryCount: videoIds.length,
        likedUniqueCount: likedSet.size,
        hydrated: true,
      };
    });
  },

  getResolvedLikeStatus: (videoId, fallback) => {
    if (!videoId) return normalizeLikeStatus(fallback);
    return normalizeLikeStatus(get().likeStatuses[videoId] ?? fallback);
  },

  toggleTrackLike: async (videoId, fallback) => {
    const previous = get().getResolvedLikeStatus(videoId, fallback);
    const next = previous === "LIKE" ? "INDIFFERENT" : "LIKE";

    console.log(
      `[TrackLikeStore] optimistic update ${JSON.stringify({
        videoId,
        previous,
        next,
      })}`
    );

    set((state) => ({
      likeStatuses: {
        ...state.likeStatuses,
        [videoId]: next,
      },
      pending: {
        ...state.pending,
        [videoId]: true,
      },
    }));
    syncTrackCacheLikeStatus(videoId, next);

    try {
      const response = await ytRateSong(videoId, next);
      const confirmed = normalizeLikeStatus(response.likeStatus);
      set((state) => {
        const pending = { ...state.pending };
        delete pending[videoId];
        return {
          likeStatuses: {
            ...state.likeStatuses,
            [videoId]: confirmed,
          },
          pending,
        };
      });
      syncTrackCacheLikeStatus(videoId, confirmed);
      console.log(
        `[TrackLikeStore] toggleTrackLike confirmed ${JSON.stringify({
          videoId,
          likeStatus: confirmed,
        })}`
      );
      return confirmed;
    } catch (error) {
      set((state) => {
        const pending = { ...state.pending };
        delete pending[videoId];
        return {
          likeStatuses: {
            ...state.likeStatuses,
            [videoId]: previous,
          },
          pending,
        };
      });
      syncTrackCacheLikeStatus(videoId, previous);
      console.error(
        `[TrackLikeStore] toggleTrackLike rollback ${JSON.stringify({
          videoId,
          previous,
          next,
          error: error instanceof Error ? error.message : String(error),
        })}`
      );
      throw error;
    }
  },

  clear: () => {
    hydrationPromise = null;
    lastHydratedAt = 0;
    set({
      likeStatuses: {},
      likedEntryCount: 0,
      likedUniqueCount: 0,
      hydrated: false,
      hydrating: false,
      pending: {},
    });
  },
}));
