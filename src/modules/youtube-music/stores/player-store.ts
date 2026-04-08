import { create } from "zustand";
import { subscribeWithSelector } from "zustand/middleware";
import type { Track, RepeatMode } from "../types/music";
import { useQueueStore } from "./queue-store";

// Audio singleton — lives outside React, zero re-renders
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
  currentTrack: Track | null;
  isPlaying: boolean;
  progress: number;
  duration: number;
  volume: number;
  shuffle: boolean;
  repeat: RepeatMode;
  isLoading: boolean;
}

interface PlayerActions {
  play: (track: Track) => void;
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

      el.addEventListener("waiting", () => {
        console.log("[PlayerStore] audio buffering...");
      });

      el.addEventListener("canplay", () => set({ isLoading: false }));

      el.addEventListener("error", (e) => {
        console.error("[PlayerStore] audio error", e);
        set({ isPlaying: false, isLoading: false });
      });

      console.log("[PlayerStore] Audio events wired");
    }

    return {
      currentTrack: null,
      isPlaying: false,
      progress: 0,
      duration: 0,
      volume: 80,
      shuffle: false,
      repeat: "off",
      isLoading: false,

      play: async (track) => {
        console.log("[PlayerStore] play", { title: track.title, videoId: track.videoId });

        if (!track.videoId) {
          console.error("[PlayerStore] Cannot play track without videoId", { title: track.title });
          return;
        }

        wireAudioEvents();
        const el = getAudio();
        el.pause();
        set({ currentTrack: track, isPlaying: false, progress: 0, duration: 0, isLoading: true });

        try {
          // Windows WebView2: http://stream.localhost/  |  macOS/Linux: stream://localhost/
          const isWindows = navigator.userAgent.includes("Windows");
          const streamUrl = isWindows
            ? `http://stream.localhost/${track.videoId}`
            : `stream://localhost/${track.videoId}`;
          console.log("[PlayerStore] Loading audio via stream protocol", { videoId: track.videoId });

          if (get().currentTrack?.videoId !== track.videoId) {
            console.log("[PlayerStore] Track changed during setup, aborting");
            return;
          }

          el.src = streamUrl;
          el.volume = get().volume / 100;
          await el.play();
          console.log("[PlayerStore] Playback started", { title: track.title });
        } catch (err) {
          console.error("[PlayerStore] Failed to play track", err);
          set({ isPlaying: false, isLoading: false });
        }
      },

      togglePlay: () => {
        const el = getAudio();
        if (!el.src) return;
        if (el.paused) {
          console.log("[PlayerStore] togglePlay → play");
          el.play();
        } else {
          console.log("[PlayerStore] togglePlay → pause");
          el.pause();
        }
      },

      seek: (value) => {
        console.log("[PlayerStore] seek", { value });
        const el = getAudio();
        el.currentTime = value;
        set({ progress: value });
      },

      setVolume: (value) => {
        console.log("[PlayerStore] setVolume", { value });
        const el = getAudio();
        el.volume = value / 100;
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

      _onTrackEnd: () => {
        const { repeat, currentTrack } = get();

        if (repeat === "one" && currentTrack) {
          console.log("[PlayerStore] repeat one — replaying");
          const el = getAudio();
          el.currentTime = 0;
          el.play();
          return;
        }

        const queueState = useQueueStore.getState();
        const nextTrack = queueState.next();

        if (nextTrack) {
          console.log("[PlayerStore] Playing next from queue", { title: nextTrack.title });
          get().play(nextTrack);
        } else if (repeat === "all") {
          const firstTrack = queueState.playIndex(0);
          if (firstTrack) {
            console.log("[PlayerStore] repeat all — looping to start");
            get().play(firstTrack);
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
          currentTrack: null,
          isPlaying: false,
          progress: 0,
          duration: 0,
          isLoading: false,
        });
      },
    };
  })
);
