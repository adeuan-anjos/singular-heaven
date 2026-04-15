// src/modules/youtube-music/stores/lyrics-store.ts
import { create } from "zustand";

interface LyricsState {
  open: boolean;
}

interface LyricsActions {
  openLyrics: () => void;
  setOpen: (open: boolean) => void;
}

export type LyricsStore = LyricsState & LyricsActions;

export const useLyricsStore = create<LyricsStore>()((set) => ({
  open: false,
  openLyrics: () => set({ open: true }),
  setOpen: (open) => set({ open }),
}));
