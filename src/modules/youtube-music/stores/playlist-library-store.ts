import { create } from "zustand";
import type { Playlist } from "../types/music";
import {
  ytCreatePlaylist,
  ytDeletePlaylist,
  ytEditPlaylist,
  ytGetLibraryPlaylistsCached,
  ytGetSidebarPlaylistsCached,
  type PlaylistPrivacyStatus,
  ytRatePlaylist,
  ytSetPlaylistThumbnail,
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
  createPlaylist: (
    title: string,
    description?: string | null,
    videoIds?: string[],
    privacyStatus?: PlaylistPrivacyStatus
  ) => Promise<string | null>;
  editPlaylist: (
    playlistId: string,
    input: {
      title?: string | null;
      description?: string | null;
      privacyStatus?: PlaylistPrivacyStatus | null;
    }
  ) => Promise<void>;
  setPlaylistThumbnail: (
    playlistId: string,
    imageBytes: number[],
    mimeType: string
  ) => Promise<void>;
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

  hydrate: async (force = false, _reason = "unknown") => {
    const now = Date.now();
    const recentlyHydrated = now - lastHydratedAt < REVALIDATE_INTERVAL_MS;

    if (get().hydrating) {
      return hydrationPromise ?? Promise.resolve();
    }

    if (hydrationPromise) {
      return hydrationPromise;
    }

    if (!force && get().hydrated && recentlyHydrated) {
      return Promise.resolve();
    }

    set({ hydrating: true });
    hydrationPromise = ytGetLibraryPlaylistsCached()
      .then((apiPlaylists) => {
        const playlists = mapLibraryPlaylists(apiPlaylists);
        lastHydratedAt = Date.now();
        get().replaceLibraryPlaylists(playlists);
      })
      .finally(() => {
        hydrationPromise = null;
        set({ hydrating: false });
      });

    return hydrationPromise;
  },

  hydrateSidebar: async (force = false, _reason = "unknown") => {
    const now = Date.now();
    const recentlyHydrated = now - lastSidebarHydratedAt < REVALIDATE_INTERVAL_MS;

    if (get().sidebarHydrating) {
      return sidebarHydrationPromise ?? Promise.resolve();
    }

    if (sidebarHydrationPromise) {
      return sidebarHydrationPromise;
    }

    if (!force && get().sidebarHydrated && recentlyHydrated) {
      return Promise.resolve();
    }

    set({ sidebarHydrating: true });
    sidebarHydrationPromise = ytGetSidebarPlaylistsCached()
      .then((apiPlaylists) => {
        const playlists = mapLibraryPlaylists(apiPlaylists);
        lastSidebarHydratedAt = Date.now();
        get().replaceSidebarPlaylists(playlists);
      })
      .finally(() => {
        sidebarHydrationPromise = null;
        set({ sidebarHydrating: false });
      });

    return sidebarHydrationPromise;
  },

  replaceLibraryPlaylists: (playlists) => {
    set({
      playlists,
      savedPlaylistIds: toSavedIdMap(playlists),
      hydrated: true,
    });
  },

  replaceSidebarPlaylists: (playlists) => {
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

  createPlaylist: async (
    title,
    description = "",
    videoIds = [],
    privacyStatus = "PRIVATE"
  ) => {
    const response = await ytCreatePlaylist({
      title,
      description,
      privacyStatus,
      videoIds,
    });
    await Promise.all([
      get().hydrate(true, "create-playlist"),
      get().hydrateSidebar(true, "create-playlist"),
    ]);
    return response.playlistId ?? null;
  },

  editPlaylist: async (playlistId, input) => {
    set((state) => ({
      pending: {
        ...state.pending,
        [playlistId]: true,
      },
    }));
    try {
      await ytEditPlaylist({
        playlistId,
        title: input.title ?? null,
        description: input.description ?? null,
        privacyStatus: input.privacyStatus ?? null,
      });
      await Promise.all([
        get().hydrate(true, "edit-playlist"),
        get().hydrateSidebar(true, "edit-playlist"),
      ]);
    } finally {
      set((state) => {
        const pending = { ...state.pending };
        delete pending[playlistId];
        return { pending };
      });
    }
  },

  setPlaylistThumbnail: async (playlistId, imageBytes, mimeType) => {
    set((state) => ({
      pending: {
        ...state.pending,
        [playlistId]: true,
      },
    }));
    try {
      await ytSetPlaylistThumbnail({
        playlistId,
        imageBytes,
        mimeType,
      });
      await Promise.all([
        get().hydrate(true, "set-playlist-thumbnail"),
        get().hydrateSidebar(true, "set-playlist-thumbnail"),
      ]);
    } finally {
      set((state) => {
        const pending = { ...state.pending };
        delete pending[playlistId];
        return { pending };
      });
    }
  },

  deletePlaylist: async (playlistId) => {
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
