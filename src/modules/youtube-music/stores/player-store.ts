import { create } from "zustand";
import { subscribeWithSelector } from "zustand/middleware";
import { useQueueStore } from "./queue-store";

let audio: HTMLAudioElement | null = null;

function getAudio(): HTMLAudioElement {
  if (!audio) {
    audio = new Audio();
    audio.preload = "auto";
  }
  return audio;
}

interface PlayerState {
  currentTrackId: string | null;
  isPlaying: boolean;
  progress: number;
  duration: number;
  volume: number;
  isLoading: boolean;
}

interface PlayerActions {
  play: (videoId: string) => void;
  togglePlay: () => void;
  seek: (value: number) => void;
  setVolume: (value: number) => void;
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
        set({ duration: el.duration });
      });

      el.addEventListener("ended", () => {
        get()._onTrackEnd();
      });

      el.addEventListener("play", () => set({ isPlaying: true }));
      el.addEventListener("pause", () => set({ isPlaying: false }));
      el.addEventListener("canplay", () => set({ isLoading: false }));
      el.addEventListener("error", (e) => {
        console.error("[PlayerStore] audio error", e);
        set({ isPlaying: false, isLoading: false });
      });
    }

    return {
      currentTrackId: null,
      isPlaying: false,
      progress: 0,
      duration: 0,
      volume: 80,
      isLoading: false,

      play: async (videoId) => {
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

          if (get().currentTrackId !== videoId) {
            return;
          }

          el.src = streamUrl;
          el.volume = get().volume / 100;
          await el.play();
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

      _onTrackEnd: () => {
        void useQueueStore.getState()
          .handleTrackEnd()
          .then((nextId) => {
            const currentTrackId = get().currentTrackId;

            if (nextId && currentTrackId && nextId === currentTrackId) {
              const el = getAudio();
              el.currentTime = 0;
              set({ progress: 0, isLoading: false });
              void el.play().catch((error) => {
                console.error("[PlayerStore] failed to replay current track", error);
                set({ isPlaying: false });
              });
              return;
            }

            if (nextId) {
              get().play(nextId);
            } else {
              set({ isPlaying: false });
            }
          })
          .catch((error) => {
            console.error("[PlayerStore] failed to advance queue on track end", error);
            set({ isPlaying: false });
          });
      },

      cleanup: () => {
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
