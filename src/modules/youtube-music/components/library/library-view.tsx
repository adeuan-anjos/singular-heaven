import { useRef, useCallback } from "react";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Avatar,
  AvatarImage,
  AvatarFallback,
} from "@/components/ui/avatar";
import { VirtualTrackList } from "../shared/virtual-track-list";
import {
  mockTracks,
  mockPlaylists,
} from "../../mock/data";
import type { Track, StackPage } from "../../types/music";

interface LibraryViewProps {
  onNavigate: (page: StackPage) => void;
  onPlayTrack: (track: Track) => void;
  onAddToQueue: (track: Track) => void;
}

export function LibraryView({
  onNavigate,
  onPlayTrack,
  onAddToQueue,
}: LibraryViewProps) {
  const curtidasScrollRef = useRef<HTMLElement | null>(null);

  const curtidasAreaRef = useCallback((node: HTMLDivElement | null) => {
    if (node) {
      const viewport = node.querySelector(
        '[data-slot="scroll-area-viewport"]'
      );
      curtidasScrollRef.current = viewport as HTMLElement | null;
    }
  }, []);

  return (
    <div className="flex h-full">
      {/* Left: Playlists */}
      <div className="flex h-full w-72 shrink-0 flex-col border-r border-border">
        <div className="shrink-0 px-4 pt-4 pb-2">
          <h2 className="text-lg font-semibold text-foreground">Playlists</h2>
        </div>
        <ScrollArea className="flex-1">
          <div className="flex flex-col gap-0.5 px-2 pb-4">
            {mockPlaylists.map((pl) => {
              const thumbUrl = pl.thumbnails?.[0]?.url;
              const initials = pl.title.slice(0, 2).toUpperCase();
              return (
                <button
                  key={pl.playlistId}
                  onClick={() =>
                    onNavigate({
                      type: "playlist",
                      playlistId: pl.playlistId,
                    })
                  }
                  className="flex w-full items-center gap-3 rounded-md px-2 py-1.5 text-left transition-colors hover:bg-accent"
                >
                  <Avatar className="size-9 shrink-0 rounded-sm">
                    <AvatarImage src={thumbUrl} alt={pl.title} className="rounded-sm object-cover" />
                    <AvatarFallback className="rounded-sm text-xs">
                      {initials}
                    </AvatarFallback>
                  </Avatar>
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

      {/* Right: Curtidas */}
      <div className="flex flex-1 flex-col min-w-0">
        <div className="shrink-0 px-4 pt-4 pb-2">
          <h2 className="text-lg font-semibold text-foreground">Curtidas</h2>
        </div>
        <ScrollArea
          ref={curtidasAreaRef}
          className="flex-1"
        >
          <div className="px-4 pb-4">
            <VirtualTrackList
              tracks={mockTracks}
              scrollElementRef={curtidasScrollRef}
              scrollMargin={0}
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
        </ScrollArea>
      </div>
    </div>
  );
}
