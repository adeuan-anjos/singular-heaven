import { create } from "zustand";

interface PlaylistRefreshState {
  versions: Record<string, number>;
}

interface PlaylistRefreshActions {
  bump: (playlistId: string) => void;
}

export const usePlaylistRefreshStore = create<PlaylistRefreshState & PlaylistRefreshActions>(
  (set) => ({
    versions: {},
    bump: (playlistId) => {
      set((state) => ({
        versions: {
          ...state.versions,
          [playlistId]: (state.versions[playlistId] ?? 0) + 1,
        },
      }));
    },
  }),
);
