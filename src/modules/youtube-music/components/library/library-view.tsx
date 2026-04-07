import React, { useState } from "react";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Heart } from "lucide-react";
import { VirtualTrackList } from "../shared/virtual-track-list";
import {
  mockTracks,
  mockPlaylists,
  getMockPlaylist,
} from "../../mock/data";
import type { Track, StackPage } from "../../types/music";
import { cn } from "@/lib/utils";
import { useRenderTracker } from "@/lib/debug";
import { usePlayerStore } from "../../stores/player-store";

interface LibraryViewProps {
  onNavigate: (page: StackPage) => void;
  onPlayTrack: (track: Track) => void;
  onAddToQueue: (track: Track) => void;
}

export const LibraryView = React.memo(function LibraryView({
  onNavigate,
  onPlayTrack,
  onAddToQueue,
}: LibraryViewProps) {
  useRenderTracker("LibraryView", { onNavigate, onPlayTrack, onAddToQueue });
  const currentTrack = usePlayerStore((s) => s.currentTrack);
  const [selectedPlaylistId, setSelectedPlaylistId] = useState<string | null>(null);

  const activeTracks =
    selectedPlaylistId === null
      ? mockTracks
      : getMockPlaylist(selectedPlaylistId).tracks ?? mockTracks;

  const activeTitle =
    selectedPlaylistId === null
      ? "Curtidas"
      : (mockPlaylists.find((p) => p.playlistId === selectedPlaylistId)?.title ?? "Playlist");

  console.log("[LibraryView] render", {
    selectedPlaylistId,
    activeTitle,
    trackCount: activeTracks.length,
  });

  return (
    <div className="flex h-full">
      {/* Left: Playlists */}
      <div className="flex h-full w-72 shrink-0 flex-col border-r border-border">
        <div className="shrink-0 px-4 pt-4 pb-2">
          <h2 className="text-lg font-semibold text-foreground">Playlists</h2>
        </div>
        <ScrollArea className="flex-1">
          <div className="flex flex-col gap-0.5 px-2 pb-4">
            {/* Permanent "Curtidas" entry */}
            <button
              onClick={() => setSelectedPlaylistId(null)}
              className={cn(
                "flex w-full items-center gap-3 rounded-md px-2 py-1.5 text-left transition-colors hover:bg-accent",
                selectedPlaylistId === null && "bg-accent"
              )}
            >
              <div className="flex size-9 shrink-0 items-center justify-center rounded-sm bg-primary/10">
                <Heart className="size-4 text-primary" />
              </div>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium leading-tight">
                  Curtidas
                </p>
                <p className="truncate text-xs text-muted-foreground leading-tight mt-0.5">
                  {mockTracks.length} músicas
                </p>
              </div>
            </button>

            {/* User playlists */}
            {mockPlaylists.map((pl) => {
              const thumbUrl = pl.thumbnails?.[0]?.url;
              const initials = pl.title.slice(0, 2).toUpperCase();
              const isActive = selectedPlaylistId === pl.playlistId;
              return (
                <button
                  key={pl.playlistId}
                  onClick={() => setSelectedPlaylistId(pl.playlistId)}
                  className={cn(
                    "flex w-full items-center gap-3 rounded-md px-2 py-1.5 text-left transition-colors hover:bg-accent",
                    isActive && "bg-accent"
                  )}
                >
                  <div className="flex size-9 shrink-0 items-center justify-center overflow-hidden rounded-sm bg-muted">
                    {thumbUrl ? (
                      <img src={thumbUrl} alt={pl.title} className="h-full w-full object-cover" />
                    ) : (
                      <span className="text-xs text-muted-foreground">{initials}</span>
                    )}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium leading-tight">
                      {pl.title}
                    </p>
                    <p className="truncate text-xs text-muted-foreground leading-tight mt-0.5">
                      {pl.author?.name} • {pl.trackCount} músicas
                    </p>
                  </div>
                </button>
              );
            })}
          </div>
        </ScrollArea>
      </div>

      {/* Right: Selected playlist or Curtidas */}
      <div className="flex flex-1 flex-col min-w-0">
        <div className="shrink-0 px-4 pt-4 pb-2">
          <h2 className="text-lg font-semibold text-foreground">{activeTitle}</h2>
        </div>
        <div className="flex-1 min-h-0 overflow-hidden">
          <VirtualTrackList
            tracks={activeTracks}
            className="h-full"
            currentTrackId={currentTrack?.videoId}
            onPlay={onPlayTrack}
            onAddToQueue={onAddToQueue}
            onGoToArtist={(id) =>
              onNavigate({ type: "artist", artistId: id })
            }
            onGoToAlbum={(id) =>
              onNavigate({ type: "album", albumId: id })
            }
          />
        </div>
      </div>
    </div>
  );
});
