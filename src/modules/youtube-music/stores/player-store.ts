import { create } from "zustand";
import { subscribeWithSelector } from "zustand/middleware";
import type { Track, RepeatMode } from "../types/music";

interface PlayerState {
  currentTrack: Track | null;
  isPlaying: boolean;
  progress: number;
  volume: number;
  shuffle: boolean;
  repeat: RepeatMode;
  _intervalId: ReturnType<typeof setInterval> | null;
}

interface PlayerActions {
  play: (track: Track) => void;
  togglePlay: () => void;
  seek: (value: number) => void;
  setVolume: (value: number) => void;
  toggleShuffle: () => void;
  cycleRepeat: () => void;
  _startProgressTimer: () => void;
  _stopProgressTimer: () => void;
  cleanup: () => void;
}

export type PlayerStore = PlayerState & PlayerActions;

export const usePlayerStore = create<PlayerStore>()(
  subscribeWithSelector((set, get) => ({
    // --- State ---
    currentTrack: null,
    isPlaying: false,
    progress: 0,
    volume: 80,
    shuffle: false,
    repeat: "off",
    _intervalId: null,

    // --- Actions ---
    play: (track) => {
      console.log("[PlayerStore] play", { title: track.title, videoId: track.videoId });
      get()._stopProgressTimer();
      set({ currentTrack: track, isPlaying: true, progress: 0 });
      get()._startProgressTimer();
    },

    togglePlay: () => {
      const { isPlaying } = get();
      const next = !isPlaying;
      console.log("[PlayerStore] togglePlay", { isPlaying: next });
      set({ isPlaying: next });
      if (next) {
        get()._startProgressTimer();
      } else {
        get()._stopProgressTimer();
      }
    },

    seek: (value) => {
      console.log("[PlayerStore] seek", { value });
      set({ progress: value });
    },

    setVolume: (value) => {
      console.log("[PlayerStore] setVolume", { value });
      set({ volume: value });
    },

    toggleShuffle: () => {
      const next = !get().shuffle;
      console.log("[PlayerStore] toggleShuffle", { shuffle: next });
      set({ shuffle: next });
    },

    cycleRepeat: () => {
      const current = get().repeat;
      const next: RepeatMode =
        current === "off" ? "all" : current === "all" ? "one" : "off";
      console.log("[PlayerStore] cycleRepeat", { from: current, to: next });
      set({ repeat: next });
    },

    _startProgressTimer: () => {
      const { _intervalId } = get();
      if (_intervalId) clearInterval(_intervalId);

      const id = setInterval(() => {
        const { currentTrack, progress, isPlaying } = get();
        if (!isPlaying || !currentTrack) return;

        if (progress >= currentTrack.durationSeconds) {
          console.log("[PlayerStore] track ended", { title: currentTrack.title });
          get()._stopProgressTimer();
          set({ isPlaying: false, progress: currentTrack.durationSeconds });
          return;
        }

        set({ progress: progress + 1 });
      }, 1000);

      set({ _intervalId: id });
    },

    _stopProgressTimer: () => {
      const { _intervalId } = get();
      if (_intervalId) {
        clearInterval(_intervalId);
        set({ _intervalId: null });
      }
    },

    cleanup: () => {
      console.log("[PlayerStore] cleanup — stopping timer and resetting state");
      get()._stopProgressTimer();
      set({
        currentTrack: null,
        isPlaying: false,
        progress: 0,
        _intervalId: null,
      });
    },
  }))
);
