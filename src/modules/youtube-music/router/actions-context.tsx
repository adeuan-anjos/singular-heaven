import { createContext, useContext, type ReactNode } from "react";
import type { PlayAllOptions, Playlist, Track } from "../types/music";

export interface YtActions {
  onPlayTrack: (track: Track) => void | Promise<void>;
  onPlayAll: (
    tracks: Track[],
    startIndex?: number,
    playlistId?: string,
    isComplete?: boolean,
    options?: PlayAllOptions,
  ) => void | Promise<void>;
  onAddToQueue: (track: Track) => void | Promise<void>;
  onAddToPlaylist: (track: Track) => void;
  onEditPlaylist: (playlist: Playlist) => void;
  onSavePlaylist: (playlistId: string, title: string) => void;
  onAddPlaylistNext: (tracks: Track[], queueTrackIds: string[]) => void | Promise<void>;
  onAppendPlaylistToQueue: (tracks: Track[], queueTrackIds: string[]) => void | Promise<void>;
  onPlaylistDeleted: (playlistId: string) => void;
}

const YtActionsContext = createContext<YtActions | null>(null);

export function YtActionsProvider({
  value,
  children,
}: {
  value: YtActions;
  children: ReactNode;
}) {
  return <YtActionsContext.Provider value={value}>{children}</YtActionsContext.Provider>;
}

export function useYtActions(): YtActions {
  const ctx = useContext(YtActionsContext);
  if (!ctx) {
    throw new Error("useYtActions must be used within <YtActionsProvider>");
  }
  return ctx;
}
