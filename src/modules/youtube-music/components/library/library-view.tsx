import { useRef, useCallback } from "react";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  ResizablePanelGroup,
  ResizablePanel,
  ResizableHandle,
} from "@/components/ui/resizable";
import {
  Avatar,
  AvatarImage,
  AvatarFallback,
} from "@/components/ui/avatar";
import { SectionHeader } from "../shared/section-header";
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
    <ResizablePanelGroup orientation="horizontal" className="h-full">
      {/* Left column: Playlists */}
      <ResizablePanel defaultSize={30} minSize={30} maxSize={30}>
        <div className="flex h-full flex-col">
          <div className="shrink-0 px-4 pt-4 pb-2">
            <SectionHeader title="Playlists" />
          </div>
          <ScrollArea className="flex-1 overflow-hidden">
            <div className="flex flex-col px-2 pb-4">
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
      </ResizablePanel>

      <ResizableHandle />

      {/* Right column: Curtidas */}
      <ResizablePanel defaultSize={70} minSize={70}>
        <div className="flex h-full flex-col">
          <div className="shrink-0 px-4 pt-4 pb-2">
            <SectionHeader title="Curtidas" />
          </div>
          <ScrollArea
            ref={curtidasAreaRef}
            className="flex-1 overflow-hidden"
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
      </ResizablePanel>
    </ResizablePanelGroup>
  );
}
