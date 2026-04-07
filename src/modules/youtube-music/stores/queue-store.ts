import { create } from "zustand";
import { subscribeWithSelector } from "zustand/middleware";
import type { Track } from "../types/music";

interface QueueState {
  queue: Track[];
  currentIndex: number;
}

interface QueueActions {
  setTracks: (tracks: Track[], startIndex?: number) => void;
  addToQueue: (track: Track) => void;
  addNext: (track: Track) => void;
  removeFromQueue: (index: number) => void;
  next: () => Track | null;
  previous: () => Track | null;
  playIndex: (index: number) => Track | null;
  cleanup: () => void;
}

export type QueueStore = QueueState & QueueActions;

export const useQueueStore = create<QueueStore>()(
  subscribeWithSelector((set, get) => ({
    // --- State ---
    queue: [],
    currentIndex: -1,

    // --- Actions ---
    setTracks: (tracks, startIndex = 0) => {
      console.log("[QueueStore] setTracks", { count: tracks.length, startIndex });
      set({ queue: tracks, currentIndex: startIndex });
    },

    addToQueue: (track) => {
      console.log("[QueueStore] addToQueue", { title: track.title });
      set((state) => ({ queue: [...state.queue, track] }));
    },

    addNext: (track) => {
      const { currentIndex, queue } = get();
      console.log("[QueueStore] addNext", { title: track.title, afterIndex: currentIndex });
      const next = [...queue];
      next.splice(currentIndex + 1, 0, track);
      set({ queue: next });
    },

    removeFromQueue: (index) => {
      console.log("[QueueStore] removeFromQueue", { index });
      set((state) => {
        const newQueue = state.queue.filter((_, i) => i !== index);
        const newIndex = index < state.currentIndex
          ? state.currentIndex - 1
          : state.currentIndex;
        return { queue: newQueue, currentIndex: newIndex };
      });
    },

    next: () => {
      const { currentIndex, queue } = get();
      if (currentIndex < queue.length - 1) {
        const nextIndex = currentIndex + 1;
        console.log("[QueueStore] next", { from: currentIndex, to: nextIndex });
        set({ currentIndex: nextIndex });
        return queue[nextIndex];
      }
      console.log("[QueueStore] next — end of queue");
      return null;
    },

    previous: () => {
      const { currentIndex, queue } = get();
      if (currentIndex > 0) {
        const prevIndex = currentIndex - 1;
        console.log("[QueueStore] previous", { from: currentIndex, to: prevIndex });
        set({ currentIndex: prevIndex });
        return queue[prevIndex];
      }
      console.log("[QueueStore] previous — beginning of queue");
      return null;
    },

    playIndex: (index) => {
      const { queue } = get();
      const track = queue[index];
      if (track) {
        console.log("[QueueStore] playIndex", { index, title: track.title });
        set({ currentIndex: index });
        return track;
      }
      console.log("[QueueStore] playIndex — invalid index", { index });
      return null;
    },

    cleanup: () => {
      console.log("[QueueStore] cleanup — resetting queue");
      set({ queue: [], currentIndex: -1 });
    },
  }))
);
