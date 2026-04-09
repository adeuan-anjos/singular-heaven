import { create } from "zustand";
import type { Playlist } from "../types/music";
import {
  ytCreatePlaylist,
  ytDeletePlaylist,
  ytGetLibraryPlaylists,
  ytGetSidebarPlaylists,
  ytRatePlaylist,
} from "../services/yt-api";
import { mapLibraryPlaylists } from "../services/mappers";

type PendingMap = Record<string, true>;

interface PlaylistLibraryState {
  playlists: Playlist[];
  sidebarPlaylists: Playlist[];
  savedPlaylistIds: Record<string, true>;
  hydrated: boolean;
  hydrating: boolean;
  sidebarHydrated: boolean;
  sidebarHydrating: boolean;
  pending: PendingMap;
}

interface PlaylistLibraryActions {
  hydrate: (force?: boolean, reason?: string) => Promise<void>;
  hydrateSidebar: (force?: boolean, reason?: string) => Promise<void>;
  replaceLibraryPlaylists: (playlists: Playlist[]) => void;
  replaceSidebarPlaylists: (playlists: Playlist[]) => void;
  isSaved: (playlistId: string | null | undefined) => boolean;
  toggleSavedPlaylist: (playlist: Playlist) => Promise<void>;
  createPlaylist: (title: string, description?: string | null, videoIds?: string[]) => Promise<string | null>;
  deletePlaylist: (playlistId: string) => Promise<void>;
  clear: () => void;
}

export type PlaylistLibraryStore = PlaylistLibraryState & PlaylistLibraryActions;

let hydrationPromise: Promise<void> | null = null;
let sidebarHydrationPromise: Promise<void> | null = null;
let lastHydratedAt = 0;
let lastSidebarHydratedAt = 0;
const REVALIDATE_INTERVAL_MS = 15_000;

function toSavedIdMap(playlists: Playlist[]): Record<string, true> {
  const next: Record<string, true> = {};
  for (const playlist of playlists) {
    if (!playlist.isSpecial) {
      next[playlist.playlistId] = true;
    }
  }
  return next;
}

export const usePlaylistLibraryStore = create<PlaylistLibraryStore>()((set, get) => ({
  playlists: [],
  sidebarPlaylists: [],
  savedPlaylistIds: {},
  hydrated: false,
  hydrating: false,
  sidebarHydrated: false,
  sidebarHydrating: false,
  pending: {},

  hydrate: async (force = false, reason = "unknown") => {
    const now = Date.now();
    const recentlyHydrated = now - lastHydratedAt < REVALIDATE_INTERVAL_MS;

    if (get().hydrating) {
      return hydrationPromise ?? Promise.resolve();
    }

    if (hydrationPromise) {
      return hydrationPromise;
    }

    if (!force && get().hydrated && recentlyHydrated) {
      console.log(
        `[PlaylistLibraryStore] hydrate skipped ${JSON.stringify({
          force,
          reason,
          ageMs: now - lastHydratedAt,
        })}`
      );
      return Promise.resolve();
    }

    set({ hydrating: true });
    hydrationPromise = ytGetLibraryPlaylists()
      .then((apiPlaylists) => {
        const playlists = mapLibraryPlaylists(apiPlaylists);
        lastHydratedAt = Date.now();
        console.log(
          `[PlaylistLibraryStore] hydrate ${JSON.stringify({
            force,
            reason,
            playlistCount: playlists.length,
            sample: playlists.slice(0, 5).map((playlist) => ({
              playlistId: playlist.playlistId,
              title: playlist.title,
              isOwnedByUser: playlist.isOwnedByUser ?? false,
              isSpecial: playlist.isSpecial ?? false,
            })),
          })}`
        );
        get().replaceLibraryPlaylists(playlists);
      })
      .finally(() => {
        hydrationPromise = null;
        set({ hydrating: false });
      });

    return hydrationPromise;
  },

  hydrateSidebar: async (force = false, reason = "unknown") => {
    const now = Date.now();
    const recentlyHydrated = now - lastSidebarHydratedAt < REVALIDATE_INTERVAL_MS;

    if (get().sidebarHydrating) {
      return sidebarHydrationPromise ?? Promise.resolve();
    }

    if (sidebarHydrationPromise) {
      return sidebarHydrationPromise;
    }

    if (!force && get().sidebarHydrated && recentlyHydrated) {
      console.log(
        `[PlaylistLibraryStore] hydrateSidebar skipped ${JSON.stringify({
          force,
          reason,
          ageMs: now - lastSidebarHydratedAt,
        })}`
      );
      return Promise.resolve();
    }

    set({ sidebarHydrating: true });
    sidebarHydrationPromise = ytGetSidebarPlaylists()
      .then((apiPlaylists) => {
        const playlists = mapLibraryPlaylists(apiPlaylists);
        lastSidebarHydratedAt = Date.now();
        console.log(
          `[PlaylistLibraryStore] hydrateSidebar ${JSON.stringify({
            force,
            reason,
            playlistCount: playlists.length,
            sample: playlists.slice(0, 5).map((playlist) => ({
              playlistId: playlist.playlistId,
              title: playlist.title,
              isOwnedByUser: playlist.isOwnedByUser ?? false,
              isSpecial: playlist.isSpecial ?? false,
            })),
          })}`
        );
        get().replaceSidebarPlaylists(playlists);
      })
      .finally(() => {
        sidebarHydrationPromise = null;
        set({ sidebarHydrating: false });
      });

    return sidebarHydrationPromise;
  },

  replaceLibraryPlaylists: (playlists) => {
    console.log(
      `[PlaylistLibraryStore] replaceLibraryPlaylists ${JSON.stringify({
        playlistCount: playlists.length,
      })}`
    );
    set({
      playlists,
      savedPlaylistIds: toSavedIdMap(playlists),
      hydrated: true,
    });
  },

  replaceSidebarPlaylists: (playlists) => {
    console.log(
      `[PlaylistLibraryStore] replaceSidebarPlaylists ${JSON.stringify({
        playlistCount: playlists.length,
      })}`
    );
    set({
      sidebarPlaylists: playlists,
      sidebarHydrated: true,
    });
  },

  isSaved: (playlistId) => {
    if (!playlistId) return false;
    return Boolean(get().savedPlaylistIds[playlistId]);
  },

  toggleSavedPlaylist: async (playlist) => {
    if (playlist.isSpecial || playlist.isOwnedByUser) {
      return;
    }

    const playlistId = playlist.playlistId;
    const previous = get().isSaved(playlistId);
    const next = !previous;

    console.log(
      `[PlaylistLibraryStore] optimistic toggle ${JSON.stringify({
        playlistId,
        previous,
        next,
      })}`
    );

    set((state) => {
      const savedPlaylistIds = { ...state.savedPlaylistIds };
      if (next) {
        savedPlaylistIds[playlistId] = true;
      } else {
        delete savedPlaylistIds[playlistId];
      }
      return {
        savedPlaylistIds,
        pending: {
          ...state.pending,
          [playlistId]: true,
        },
      };
    });

    try {
      await ytRatePlaylist(playlistId, next ? "LIKE" : "INDIFFERENT");
      console.log(
        `[PlaylistLibraryStore] toggle confirmed ${JSON.stringify({
          playlistId,
          saved: next,
        })}`
      );
      await Promise.all([
        get().hydrate(true, next ? "playlist-saved" : "playlist-removed"),
        get().hydrateSidebar(true, next ? "playlist-saved" : "playlist-removed"),
      ]);
    } catch (error) {
      set((state) => {
        const savedPlaylistIds = { ...state.savedPlaylistIds };
        if (previous) {
          savedPlaylistIds[playlistId] = true;
        } else {
          delete savedPlaylistIds[playlistId];
        }
        const pending = { ...state.pending };
        delete pending[playlistId];
        return {
          savedPlaylistIds,
          pending,
        };
      });
      console.error(
        `[PlaylistLibraryStore] toggle rollback ${JSON.stringify({
          playlistId,
          previous,
          next,
          error: error instanceof Error ? error.message : String(error),
        })}`
      );
      throw error;
    } finally {
      set((state) => {
        const pending = { ...state.pending };
        delete pending[playlistId];
        return { pending };
      });
    }
  },

  createPlaylist: async (title, description = "", videoIds = []) => {
    console.log(
      `[PlaylistLibraryStore] createPlaylist ${JSON.stringify({
        title,
        videoIds: videoIds.length,
      })}`
    );
    const response = await ytCreatePlaylist({
      title,
      description,
      privacyStatus: "PRIVATE",
      videoIds,
    });
    await Promise.all([
      get().hydrate(true, "create-playlist"),
      get().hydrateSidebar(true, "create-playlist"),
    ]);
    return response.playlistId ?? null;
  },

  deletePlaylist: async (playlistId) => {
    console.log(
      `[PlaylistLibraryStore] deletePlaylist ${JSON.stringify({ playlistId })}`
    );
    set((state) => ({
      pending: {
        ...state.pending,
        [playlistId]: true,
      },
    }));
    try {
      await ytDeletePlaylist(playlistId);
      await Promise.all([
        get().hydrate(true, "delete-playlist"),
        get().hydrateSidebar(true, "delete-playlist"),
      ]);
    } finally {
      set((state) => {
        const pending = { ...state.pending };
        delete pending[playlistId];
        return { pending };
      });
    }
  },

  clear: () => {
    hydrationPromise = null;
    sidebarHydrationPromise = null;
    lastHydratedAt = 0;
    lastSidebarHydratedAt = 0;
    set({
      playlists: [],
      sidebarPlaylists: [],
      savedPlaylistIds: {},
      hydrated: false,
      hydrating: false,
      sidebarHydrated: false,
      sidebarHydrating: false,
      pending: {},
    });
  },
}));
