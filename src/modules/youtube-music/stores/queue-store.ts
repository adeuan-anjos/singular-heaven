import { create } from "zustand";
import { subscribeWithSelector } from "zustand/middleware";
import { ytGetPlaylistContinuation } from "../services/yt-api";
import { mapPlaylistTrack } from "../services/mappers";
import { useTrackCacheStore } from "./track-cache-store";

interface QueueState {
  trackIds: string[];
  currentIndex: number;
  continuationToken: string | null;
  isLoadingMore: boolean;
}

interface QueueActions {
  setQueue: (trackIds: string[], startIndex?: number, continuation?: string | null) => void;
  addToQueue: (trackId: string) => void;
  addNext: (trackId: string) => void;
  removeFromQueue: (index: number) => void;
  next: () => string | null;
  previous: () => string | null;
  playIndex: (index: number) => string | null;
  loadMore: () => Promise<void>;
  cleanup: () => void;
}

export type QueueStore = QueueState & QueueActions;

export const useQueueStore = create<QueueStore>()(
  subscribeWithSelector((set, get) => ({
    trackIds: [],
    currentIndex: -1,
    continuationToken: null,
    isLoadingMore: false,

    setQueue: (trackIds, startIndex = 0, continuation = null) => {
      console.log("[QueueStore] setQueue", { count: trackIds.length, startIndex, hasContinuation: !!continuation, firstIds: trackIds.slice(0, 3) });
      set({ trackIds, currentIndex: startIndex, continuationToken: continuation });
    },

    addToQueue: (trackId) => {
      console.log("[QueueStore] addToQueue", { trackId });
      set((state) => ({ trackIds: [...state.trackIds, trackId] }));
    },

    addNext: (trackId) => {
      const { currentIndex, trackIds } = get();
      console.log("[QueueStore] addNext", { trackId, afterIndex: currentIndex });
      const next = [...trackIds];
      next.splice(currentIndex + 1, 0, trackId);
      set({ trackIds: next });
    },

    removeFromQueue: (index) => {
      console.log("[QueueStore] removeFromQueue", { index });
      set((state) => {
        const newIds = state.trackIds.filter((_, i) => i !== index);
        const newIndex = index < state.currentIndex
          ? state.currentIndex - 1
          : state.currentIndex;
        return { trackIds: newIds, currentIndex: newIndex };
      });
    },

    next: () => {
      const { currentIndex, trackIds, continuationToken, isLoadingMore } = get();
      if (currentIndex < trackIds.length - 1) {
        const nextIndex = currentIndex + 1;
        console.log("[QueueStore] next", { from: currentIndex, to: nextIndex });
        set({ currentIndex: nextIndex });

        // Proactive prefetch: load more when within 5 tracks of loaded end
        const remaining = trackIds.length - 1 - nextIndex;
        if (remaining <= 5 && continuationToken && !isLoadingMore) {
          console.log("[QueueStore] Proactive prefetch triggered", { remaining });
          get().loadMore(); // fire-and-forget, does not block next()
        }

        return trackIds[nextIndex];
      }
      console.log("[QueueStore] next — end of queue");
      return null;
    },

    previous: () => {
      const { currentIndex, trackIds } = get();
      if (currentIndex > 0) {
        const prevIndex = currentIndex - 1;
        console.log("[QueueStore] previous", { from: currentIndex, to: prevIndex });
        set({ currentIndex: prevIndex });
        return trackIds[prevIndex];
      }
      console.log("[QueueStore] previous — beginning of queue");
      return null;
    },

    playIndex: (index) => {
      const { trackIds } = get();
      const trackId = trackIds[index];
      if (trackId) {
        console.log("[QueueStore] playIndex", { index });
        set({ currentIndex: index });
        return trackId;
      }
      console.log("[QueueStore] playIndex — invalid index", { index });
      return null;
    },

    loadMore: async () => {
      const { continuationToken, isLoadingMore, trackIds } = get();
      if (!continuationToken || isLoadingMore) return;

      console.log("[QueueStore] loadMore — fetching continuation");
      set({ isLoadingMore: true });

      try {
        const response = await ytGetPlaylistContinuation(continuationToken);
        const newTracks = response.tracks.map(mapPlaylistTrack);

        // Put tracks in cache
        useTrackCacheStore.getState().putTracks(newTracks);

        // Append IDs to queue
        const newIds = newTracks.map(t => t.videoId).filter(Boolean);
        // Deduplicate
        const existingSet = new Set(trackIds);
        const uniqueNewIds = newIds.filter(id => !existingSet.has(id));

        console.log("[QueueStore] loadMore — got", uniqueNewIds.length, "new tracks");
        set((state) => ({
          trackIds: [...state.trackIds, ...uniqueNewIds],
          continuationToken: response.continuation,
          isLoadingMore: false,
        }));
      } catch (err) {
        console.error("[QueueStore] loadMore error", err);
        set({ isLoadingMore: false });
      }
    },

    cleanup: () => {
      console.log("[QueueStore] cleanup");
      set({ trackIds: [], currentIndex: -1, continuationToken: null, isLoadingMore: false });
    },
  }))
);
