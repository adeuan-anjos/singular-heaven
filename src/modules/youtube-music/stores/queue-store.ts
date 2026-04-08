import { create } from "zustand";
import { subscribeWithSelector } from "zustand/middleware";

interface QueueState {
  trackIds: string[];
  currentIndex: number;
  playlistId: string | null;
  isComplete: boolean;
}

interface QueueActions {
  setQueue: (trackIds: string[], startIndex?: number, playlistId?: string | null, isComplete?: boolean) => void;
  appendTrackIds: (newIds: string[]) => void;
  markComplete: () => void;
  addToQueue: (trackId: string) => void;
  addNext: (trackId: string) => void;
  removeFromQueue: (index: number) => void;
  next: () => string | null;
  previous: () => string | null;
  playIndex: (index: number) => string | null;
  cleanup: () => void;
}

export type QueueStore = QueueState & QueueActions;

export const useQueueStore = create<QueueStore>()(
  subscribeWithSelector((set, get) => ({
    trackIds: [],
    currentIndex: -1,
    playlistId: null,
    isComplete: true,

    setQueue: (trackIds, startIndex = 0, playlistId = null, isComplete = true) => {
      console.log("[QueueStore] setQueue", {
        count: trackIds.length,
        startIndex,
        playlistId,
        isComplete,
      });
      set({ trackIds, currentIndex: startIndex, playlistId, isComplete });
    },

    appendTrackIds: (newIds) => {
      const { trackIds, playlistId } = get();
      const existingSet = new Set(trackIds);
      const unique = newIds.filter((id) => !existingSet.has(id));
      if (unique.length === 0) return;
      console.log("[QueueStore] appendTrackIds", {
        new: unique.length,
        total: trackIds.length + unique.length,
        playlistId,
      });
      set({ trackIds: [...trackIds, ...unique] });
    },

    markComplete: () => {
      console.log("[QueueStore] markComplete");
      set({ isComplete: true });
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
        const newIndex =
          index < state.currentIndex ? state.currentIndex - 1 : state.currentIndex;
        return { trackIds: newIds, currentIndex: newIndex };
      });
    },

    next: () => {
      const { currentIndex, trackIds } = get();
      if (currentIndex < trackIds.length - 1) {
        const nextIndex = currentIndex + 1;
        console.log("[QueueStore] next", { from: currentIndex, to: nextIndex });
        set({ currentIndex: nextIndex });
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

    cleanup: () => {
      console.log("[QueueStore] cleanup");
      set({ trackIds: [], currentIndex: -1, playlistId: null, isComplete: true });
    },
  }))
);
