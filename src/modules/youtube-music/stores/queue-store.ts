import { create } from "zustand";
import type { RepeatMode } from "../types/music";
import {
  type QueueSnapshot,
  type QueueWindowItem,
  ytQueueAddNext,
  ytQueueAddCollectionNext,
  ytQueueAppendCollection,
  ytQueueClear,
  ytQueueCycleRepeat,
  ytQueueGetState,
  ytQueueGetWindow,
  ytQueueHandleTrackEnd,
  ytQueueNext,
  ytQueuePlayIndex,
  ytQueuePrevious,
  ytQueueRemove,
  ytQueueSet,
  ytQueueToggleShuffle,
} from "../services/yt-api";

const PAGE_SIZE = 50;
const INITIAL_REVEAL = 50;
const CURRENT_TRACK_BUFFER = 10;
const inflightWindows = new Set<number>();

interface QueueState {
  pages: Record<number, QueueWindowItem[]>;
  pagesVersion: number;
  totalLoaded: number;
  revealedCount: number;
  currentIndex: number;
  playlistId: string | null;
  isComplete: boolean;
  shuffle: boolean;
  repeat: RepeatMode;
  pageSize: number;
  revealStep: number;
}

interface QueueActions {
  syncSnapshot: (snapshot: QueueSnapshot) => void;
  hydrate: () => Promise<void>;
  setQueue: (
    trackIds: string[],
    startIndex?: number,
    playlistId?: string | null,
    isComplete?: boolean,
    shuffle?: boolean
  ) => Promise<string | null>;
  initializeReveal: () => void;
  revealMore: () => void;
  ensureCurrentIndexRevealed: () => void;
  resetVisualState: () => void;
  ensureRange: (start: number, end: number) => Promise<void>;
  getItemAt: (index: number) => QueueWindowItem | undefined;
  getLoadedVideoIds: () => string[];
  playIndex: (index: number) => Promise<string | null>;
  next: () => Promise<string | null>;
  previous: () => Promise<string | null>;
  handleTrackEnd: () => Promise<string | null>;
  addNext: (trackId: string) => Promise<void>;
  addCollectionNext: (trackIds: string[]) => Promise<string | null>;
  appendCollection: (trackIds: string[]) => Promise<string | null>;
  removeFromQueue: (index: number) => Promise<void>;
  toggleShuffle: () => Promise<void>;
  cycleRepeat: () => Promise<void>;
  cleanup: () => Promise<void>;
}

export type QueueStore = QueueState & QueueActions;

function emptyPages(): Record<number, QueueWindowItem[]> {
  return {};
}

function computeMinimumRevealCount(totalLoaded: number, currentIndex: number): number {
  if (totalLoaded <= 0) return 0;

  const currentTrackRequirement =
    currentIndex >= 0 ? currentIndex + CURRENT_TRACK_BUFFER + 1 : 0;

  return Math.min(totalLoaded, Math.max(INITIAL_REVEAL, currentTrackRequirement));
}

function deriveRevealedCount(
  previousRevealedCount: number,
  snapshot: QueueSnapshot,
  reset: boolean
): number {
  const minimumRevealCount = computeMinimumRevealCount(
    snapshot.totalLoaded,
    snapshot.currentIndex
  );

  if (reset) {
    return minimumRevealCount;
  }

  return Math.min(
    snapshot.totalLoaded,
    Math.max(previousRevealedCount, minimumRevealCount)
  );
}

function applySnapshot(snapshot: QueueSnapshot): Partial<QueueState> {
  return {
    totalLoaded: snapshot.totalLoaded,
    currentIndex: snapshot.currentIndex,
    playlistId: snapshot.playlistId,
    isComplete: snapshot.isComplete,
    shuffle: snapshot.shuffle,
    repeat: snapshot.repeat,
  };
}

export const useQueueStore = create<QueueStore>()((set, get) => ({
  pages: emptyPages(),
  pagesVersion: 0,
  totalLoaded: 0,
  revealedCount: 0,
  currentIndex: -1,
  playlistId: null,
  isComplete: true,
  shuffle: false,
  repeat: "off",
  pageSize: PAGE_SIZE,
  revealStep: PAGE_SIZE,

  syncSnapshot: (snapshot) => {
    set((state) => ({
      ...applySnapshot(snapshot),
      revealedCount: deriveRevealedCount(state.revealedCount, snapshot, false),
    }));
  },

  hydrate: async () => {
    const snapshot = await ytQueueGetState();
    console.log("[QueueStore] hydrate", snapshot);
    set({
      ...applySnapshot(snapshot),
      revealedCount: deriveRevealedCount(0, snapshot, true),
    });
  },

  setQueue: async (trackIds, startIndex = 0, playlistId = null, isComplete = true, shuffle = false) => {
    const response = await ytQueueSet(trackIds, startIndex, playlistId, isComplete, shuffle);
    console.log("[QueueStore] setQueue", {
      count: trackIds.length,
      startIndex,
      playlistId,
      isComplete,
      shuffle,
      totalLoaded: response.snapshot.totalLoaded,
    });
    set({
      ...applySnapshot(response.snapshot),
      revealedCount: deriveRevealedCount(0, response.snapshot, true),
      pages: emptyPages(),
      pagesVersion: 0,
    });
    return response.trackId;
  },

  initializeReveal: () => {
    set((state) => {
      const minimumRevealCount = computeMinimumRevealCount(
        state.totalLoaded,
        state.currentIndex
      );
      const nextRevealedCount = Math.min(
        state.totalLoaded,
        Math.max(state.revealedCount, minimumRevealCount)
      );

      if (nextRevealedCount === state.revealedCount) {
        return state;
      }

      console.log("[QueueStore] initializeReveal", {
        previous: state.revealedCount,
        next: nextRevealedCount,
        totalLoaded: state.totalLoaded,
      });

      return {
        revealedCount: nextRevealedCount,
      };
    });
  },

  revealMore: () => {
    set((state) => {
      if (state.revealedCount >= state.totalLoaded) {
        return state;
      }

      const nextRevealedCount = Math.min(
        state.totalLoaded,
        Math.max(
          state.revealedCount + state.revealStep,
          computeMinimumRevealCount(state.totalLoaded, state.currentIndex)
        )
      );

      console.log("[QueueStore] revealMore", {
        previous: state.revealedCount,
        next: nextRevealedCount,
        totalLoaded: state.totalLoaded,
      });

      return {
        revealedCount: nextRevealedCount,
      };
    });
  },

  ensureCurrentIndexRevealed: () => {
    set((state) => {
      const nextRevealedCount = Math.min(
        state.totalLoaded,
        Math.max(
          state.revealedCount,
          computeMinimumRevealCount(state.totalLoaded, state.currentIndex)
        )
      );

      if (nextRevealedCount === state.revealedCount) {
        return state;
      }

      console.log("[QueueStore] ensureCurrentIndexRevealed", {
        currentIndex: state.currentIndex,
        previous: state.revealedCount,
        next: nextRevealedCount,
      });

      return {
        revealedCount: nextRevealedCount,
      };
    });
  },

  resetVisualState: () => {
    set((state) => {
      if (state.revealedCount === 0 && Object.keys(state.pages).length === 0) {
        return state;
      }

      console.log("[QueueStore] resetVisualState", {
        revealedCount: state.revealedCount,
        loadedPages: Object.keys(state.pages).length,
      });

      return {
        revealedCount: 0,
        pages: emptyPages(),
        pagesVersion: state.pagesVersion + 1,
      };
    });
  },

  ensureRange: async (start, end) => {
    const { revealedCount, pageSize } = get();
    if (revealedCount === 0) return;

    const safeStart = Math.max(0, start);
    const safeEnd = Math.min(end, revealedCount - 1);
    if (safeEnd < safeStart) return;

    const promises: Promise<void>[] = [];

    for (
      let pageOffset = Math.floor(safeStart / pageSize) * pageSize;
      pageOffset <= safeEnd;
      pageOffset += pageSize
    ) {
      const page = get().pages[pageOffset];
      if (page || inflightWindows.has(pageOffset)) continue;

      inflightWindows.add(pageOffset);
      promises.push(
        ytQueueGetWindow(pageOffset, pageSize)
          .then((response) => {
            console.log(
              `[QueueStore] loadWindow ${JSON.stringify({
                offset: pageOffset,
                received: response.items.length,
                totalLoaded: response.snapshot.totalLoaded,
                first: response.items[0]
                  ? {
                      index: response.items[0].index,
                      videoId: response.items[0].videoId,
                    }
                  : null,
                last: response.items[response.items.length - 1]
                  ? {
                      index: response.items[response.items.length - 1].index,
                      videoId: response.items[response.items.length - 1].videoId,
                    }
                  : null,
              })}`
            );
            set((state) => ({
              ...applySnapshot(response.snapshot),
              pagesVersion: state.pagesVersion + 1,
              pages: {
                ...state.pages,
                [pageOffset]: response.items,
              },
            }));
          })
          .finally(() => {
            inflightWindows.delete(pageOffset);
          })
      );
    }

    if (promises.length > 0) {
      await Promise.all(promises);
    }
  },

  getItemAt: (index) => {
    const { pageSize, pages } = get();
    const pageOffset = Math.floor(index / pageSize) * pageSize;
    const page = pages[pageOffset];
    return page?.[index - pageOffset];
  },

  getLoadedVideoIds: () => {
    const pages = Object.values(get().pages);
    const ids = new Set<string>();
    for (const page of pages) {
      for (const item of page) {
        ids.add(item.videoId);
      }
    }
    return Array.from(ids);
  },

  playIndex: async (index) => {
    const response = await ytQueuePlayIndex(index);
    set((state) => ({
      ...applySnapshot(response.snapshot),
      revealedCount: deriveRevealedCount(state.revealedCount, response.snapshot, false),
    }));
    return response.trackId;
  },

  next: async () => {
    const response = await ytQueueNext();
    set((state) => ({
      ...applySnapshot(response.snapshot),
      revealedCount: deriveRevealedCount(state.revealedCount, response.snapshot, false),
    }));
    return response.trackId;
  },

  previous: async () => {
    const response = await ytQueuePrevious();
    set((state) => ({
      ...applySnapshot(response.snapshot),
      revealedCount: deriveRevealedCount(state.revealedCount, response.snapshot, false),
    }));
    return response.trackId;
  },

  handleTrackEnd: async () => {
    const response = await ytQueueHandleTrackEnd();
    set((state) => ({
      ...applySnapshot(response.snapshot),
      revealedCount: deriveRevealedCount(state.revealedCount, response.snapshot, false),
    }));
    return response.trackId;
  },

  addNext: async (trackId) => {
    const response = await ytQueueAddNext(trackId);
    console.log("[QueueStore] addNext", { trackId });
    set((state) => ({
      ...applySnapshot(response.snapshot),
      revealedCount: deriveRevealedCount(state.revealedCount, response.snapshot, false),
      pages: emptyPages(),
      pagesVersion: state.pagesVersion + 1,
    }));
  },

  addCollectionNext: async (trackIds) => {
    const response = await ytQueueAddCollectionNext(trackIds);
    console.log(
      `[QueueStore] addCollectionNext ${JSON.stringify({
        count: trackIds.length,
        firstTrackId: trackIds[0] ?? null,
        lastTrackId: trackIds[trackIds.length - 1] ?? null,
        totalLoaded: response.snapshot.totalLoaded,
        shuffle: response.snapshot.shuffle,
      })}`
    );
    set((state) => ({
      ...applySnapshot(response.snapshot),
      revealedCount: deriveRevealedCount(state.revealedCount, response.snapshot, false),
      pages: emptyPages(),
      pagesVersion: state.pagesVersion + 1,
    }));
    return response.trackId;
  },

  appendCollection: async (trackIds) => {
    const response = await ytQueueAppendCollection(trackIds);
    console.log(
      `[QueueStore] appendCollection ${JSON.stringify({
        count: trackIds.length,
        firstTrackId: trackIds[0] ?? null,
        lastTrackId: trackIds[trackIds.length - 1] ?? null,
        totalLoaded: response.snapshot.totalLoaded,
        shuffle: response.snapshot.shuffle,
      })}`
    );
    set((state) => ({
      ...applySnapshot(response.snapshot),
      revealedCount: deriveRevealedCount(state.revealedCount, response.snapshot, false),
      pages: emptyPages(),
      pagesVersion: state.pagesVersion + 1,
    }));
    return response.trackId;
  },

  removeFromQueue: async (index) => {
    const response = await ytQueueRemove(index);
    console.log("[QueueStore] removeFromQueue", { index });
    set((state) => ({
      ...applySnapshot(response.snapshot),
      revealedCount: Math.min(
        deriveRevealedCount(state.revealedCount, response.snapshot, false),
        response.snapshot.totalLoaded
      ),
      pages: emptyPages(),
      pagesVersion: state.pagesVersion + 1,
    }));
  },

  toggleShuffle: async () => {
    const response = await ytQueueToggleShuffle();
    console.log("[QueueStore] toggleShuffle", { shuffle: response.snapshot.shuffle });
    set((state) => ({
      ...applySnapshot(response.snapshot),
      revealedCount: deriveRevealedCount(state.revealedCount, response.snapshot, false),
      pages: emptyPages(),
      pagesVersion: state.pagesVersion + 1,
    }));
  },

  cycleRepeat: async () => {
    const response = await ytQueueCycleRepeat();
    console.log("[QueueStore] cycleRepeat", { repeat: response.snapshot.repeat });
    set((state) => ({
      ...applySnapshot(response.snapshot),
      revealedCount: deriveRevealedCount(state.revealedCount, response.snapshot, false),
    }));
  },

  cleanup: async () => {
    const response = await ytQueueClear();
    console.log("[QueueStore] cleanup");
    inflightWindows.clear();
    set({
      ...applySnapshot(response.snapshot),
      revealedCount: 0,
      pages: emptyPages(),
      pagesVersion: 0,
    });
  },
}));
