import { create } from "zustand";
import { subscribeWithSelector } from "zustand/middleware";
import type { RepeatMode } from "../types/music";
import { useQueueStore } from "./queue-store";
import { useTrackCacheStore } from "./track-cache-store";

let audio: HTMLAudioElement | null = null;

function getAudio(): HTMLAudioElement {
  if (!audio) {
    audio = new Audio();
    audio.preload = "auto";
    console.log("[PlayerStore] Audio singleton created");
  }
  return audio;
}

interface PlayerState {
  currentTrackId: string | null;
  isPlaying: boolean;
  progress: number;
  duration: number;
  volume: number;
  shuffle: boolean;
  repeat: RepeatMode;
  isLoading: boolean;
}

interface PlayerActions {
  play: (videoId: string) => void;
  togglePlay: () => void;
  seek: (value: number) => void;
  setVolume: (value: number) => void;
  toggleShuffle: () => void;
  cycleRepeat: () => void;
  cleanup: () => void;
  _onTrackEnd: () => void;
}

export type PlayerStore = PlayerState & PlayerActions;

export const usePlayerStore = create<PlayerStore>()(
  subscribeWithSelector((set, get) => {
    let eventsWired = false;

    function wireAudioEvents() {
      if (eventsWired) return;
      eventsWired = true;
      const el = getAudio();

      el.addEventListener("timeupdate", () => {
        set({ progress: el.currentTime });
      });

      el.addEventListener("loadedmetadata", () => {
        console.log("[PlayerStore] loadedmetadata", { duration: el.duration });
        set({ duration: el.duration });
      });

      el.addEventListener("ended", () => {
        console.log("[PlayerStore] track ended (audio event)");
        get()._onTrackEnd();
      });

      el.addEventListener("play", () => set({ isPlaying: true }));
      el.addEventListener("pause", () => set({ isPlaying: false }));
      el.addEventListener("waiting", () => console.log("[PlayerStore] audio buffering..."));
      el.addEventListener("canplay", () => set({ isLoading: false }));
      el.addEventListener("error", (e) => {
        console.error("[PlayerStore] audio error", e);
        set({ isPlaying: false, isLoading: false });
      });

      console.log("[PlayerStore] Audio events wired");
    }

    return {
      currentTrackId: null,
      isPlaying: false,
      progress: 0,
      duration: 0,
      volume: 80,
      shuffle: false,
      repeat: "off",
      isLoading: false,

      play: async (videoId) => {
        const track = useTrackCacheStore.getState().getTrack(videoId);
        console.log("[PlayerStore] play", { videoId, title: track?.title ?? "unknown" });

        if (!videoId) {
          console.error("[PlayerStore] Cannot play without videoId");
          return;
        }

        wireAudioEvents();
        const el = getAudio();
        el.pause();
        set({ currentTrackId: videoId, isPlaying: false, progress: 0, duration: 0, isLoading: true });

        try {
          const isWindows = navigator.userAgent.includes("Windows");
          const streamUrl = isWindows
            ? `http://stream.localhost/${videoId}`
            : `stream://localhost/${videoId}`;
          console.log("[PlayerStore] Loading audio", { videoId });

          if (get().currentTrackId !== videoId) {
            console.log("[PlayerStore] Track changed during setup, aborting");
            return;
          }

          el.src = streamUrl;
          el.volume = get().volume / 100;
          await el.play();
          console.log("[PlayerStore] Playback started", { videoId });
        } catch (err) {
          console.error("[PlayerStore] Failed to play track", err);
          set({ isPlaying: false, isLoading: false });
        }
      },

      togglePlay: () => {
        const el = getAudio();
        if (!el.src) return;
        if (el.paused) {
          el.play();
        } else {
          el.pause();
        }
      },

      seek: (value) => {
        const el = getAudio();
        el.currentTime = value;
        set({ progress: value });
      },

      setVolume: (value) => {
        const el = getAudio();
        el.volume = value / 100;
        set({ volume: value });
      },

      toggleShuffle: () => {
        const next = !get().shuffle;
        set({ shuffle: next });
      },

      cycleRepeat: () => {
        const current = get().repeat;
        const next: RepeatMode = current === "off" ? "all" : current === "all" ? "one" : "off";
        set({ repeat: next });
      },

      _onTrackEnd: async () => {
        const { repeat, currentTrackId } = get();

        if (repeat === "one" && currentTrackId) {
          console.log("[PlayerStore] repeat one — replaying");
          const el = getAudio();
          el.currentTime = 0;
          el.play();
          return;
        }

        const queueState = useQueueStore.getState();
        let nextId = queueState.next();

        // If no next track but has continuation, try loading more
        if (!nextId && queueState.continuationToken && !useQueueStore.getState().isLoadingMore) {
          console.log("[PlayerStore] End of loaded queue, fetching more...");
          await queueState.loadMore();
          nextId = useQueueStore.getState().next();
        }

        if (nextId) {
          console.log("[PlayerStore] Playing next from queue", { videoId: nextId });
          get().play(nextId);
        } else if (repeat === "all") {
          const firstId = queueState.playIndex(0);
          if (firstId) {
            console.log("[PlayerStore] repeat all — looping to start");
            get().play(firstId);
          }
        } else {
          console.log("[PlayerStore] Queue ended");
          set({ isPlaying: false });
        }
      },

      cleanup: () => {
        console.log("[PlayerStore] cleanup");
        if (audio) {
          audio.pause();
          audio.src = "";
          audio.removeAttribute("src");
        }
        set({
          currentTrackId: null,
          isPlaying: false,
          progress: 0,
          duration: 0,
          isLoading: false,
        });
      },
    };
  })
);
