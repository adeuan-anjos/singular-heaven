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
  ytRadioLoadMore,
  ytRadioReroll,
} from "../services/yt-api";

const PAGE_SIZE = 50;
const INITIAL_REVEAL = 50;
const CURRENT_TRACK_BUFFER = 10;
const inflightWindows = new Set<number>();
let loadMoreInflight = false;

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
  isRadio: boolean;
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
  loadMoreRadio: () => Promise<void>;
  applyRadioExtended: (snapshot: QueueSnapshot) => void;
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
    isRadio: snapshot.isRadio,
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
  isRadio: false,
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
    set({
      ...applySnapshot(snapshot),
      revealedCount: deriveRevealedCount(0, snapshot, true),
    });
  },

  setQueue: async (trackIds, startIndex = 0, playlistId = null, isComplete = true, shuffle = false) => {
    const response = await ytQueueSet(trackIds, startIndex, playlistId, isComplete, shuffle);
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
    set((state) => ({
      ...applySnapshot(response.snapshot),
      revealedCount: deriveRevealedCount(state.revealedCount, response.snapshot, false),
      pages: emptyPages(),
      pagesVersion: state.pagesVersion + 1,
    }));
  },

  addCollectionNext: async (trackIds) => {
    const response = await ytQueueAddCollectionNext(trackIds);
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
    if (get().isRadio) {
      try {
        const response = await ytRadioReroll();
        set((state) => ({
          ...applySnapshot(response.snapshot),
          revealedCount: deriveRevealedCount(state.revealedCount, response.snapshot, true),
          pages: emptyPages(),
          pagesVersion: state.pagesVersion + 1,
        }));
      } catch (err) {
        console.error("[QueueStore] radio re-roll failed", err);
        throw err;
      }
      return;
    }
    const response = await ytQueueToggleShuffle();
    set((state) => ({
      ...applySnapshot(response.snapshot),
      revealedCount: deriveRevealedCount(state.revealedCount, response.snapshot, false),
      pages: emptyPages(),
      pagesVersion: state.pagesVersion + 1,
    }));
  },

  cycleRepeat: async () => {
    const response = await ytQueueCycleRepeat();
    set((state) => ({
      ...applySnapshot(response.snapshot),
      revealedCount: deriveRevealedCount(state.revealedCount, response.snapshot, false),
    }));
  },

  loadMoreRadio: async () => {
    const { isRadio, isComplete } = get();
    if (!isRadio || isComplete) return;

    // Local in-flight guard (matches backend's rs.fetching)
    if (loadMoreInflight) return;
    loadMoreInflight = true;

    try {
      const r = await ytRadioLoadMore();
      set(applySnapshot(r.snapshot));
    } catch (err) {
      console.error("[queue-store] loadMoreRadio failed", err);
    } finally {
      loadMoreInflight = false;
    }
  },

  applyRadioExtended: (snapshot: QueueSnapshot) => {
    set(() => ({
      ...applySnapshot(snapshot),
      // DO NOT touch `pages` — existing cached windows are still valid.
    }));
  },

  cleanup: async () => {
    const response = await ytQueueClear();
    inflightWindows.clear();
    set({
      ...applySnapshot(response.snapshot),
      revealedCount: 0,
      pages: emptyPages(),
      pagesVersion: 0,
    });
  },
}));
