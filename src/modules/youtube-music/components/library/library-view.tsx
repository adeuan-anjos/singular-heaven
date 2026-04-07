import { useRef, useCallback } from "react";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  ResizablePanelGroup,
  ResizablePanel,
  ResizableHandle,
} from "@/components/ui/resizable";
import { CarouselSection } from "../shared/carousel-section";
import { MediaCard } from "../shared/media-card";
import { SectionHeader } from "../shared/section-header";
import { VirtualTrackList } from "../shared/virtual-track-list";
import {
  mockTracks,
  mockPlaylists,
  mockArtists,
  mockAlbums,
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
      {/* Left column: Curtidas (top) + Artistas & Álbuns (bottom) */}
      <ResizablePanel defaultSize={70} minSize={40}>
        <ResizablePanelGroup orientation="vertical" className="h-full">
          {/* Top-left: Curtidas */}
          <ResizablePanel defaultSize={60} minSize={25}>
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

          <ResizableHandle />

          {/* Bottom-left: Artistas + Álbuns */}
          <ResizablePanel defaultSize={40} minSize={20}>
            <ScrollArea className="h-full">
              <div className="space-y-4 p-4">
                <CarouselSection title="Artistas que você segue">
                  {mockArtists.map((artist) => (
                    <MediaCard
                      key={artist.browseId}
                      title={artist.name}
                      subtitle={artist.subscribers}
                      thumbnails={artist.thumbnails}
                      rounded="full"
                      onClick={() =>
                        onNavigate({
                          type: "artist",
                          artistId: artist.browseId,
                        })
                      }
                    />
                  ))}
                </CarouselSection>

                <CarouselSection title="Álbuns salvos">
                  {mockAlbums.slice(0, 5).map((album) => (
                    <MediaCard
                      key={album.browseId}
                      title={album.title}
                      subtitle={album.artists
                        .map((a) => a.name)
                        .join(", ")}
                      thumbnails={album.thumbnails}
                      onClick={() =>
                        onNavigate({
                          type: "album",
                          albumId: album.browseId,
                        })
                      }
                    />
                  ))}
                </CarouselSection>
              </div>
            </ScrollArea>
          </ResizablePanel>
        </ResizablePanelGroup>
      </ResizablePanel>

      <ResizableHandle />

      {/* Right column: Playlists */}
      <ResizablePanel defaultSize={30} minSize={20}>
        <div className="flex h-full flex-col">
          <div className="shrink-0 px-4 pt-4 pb-2">
            <SectionHeader title="Playlists" />
          </div>
          <ScrollArea className="flex-1 overflow-hidden">
            <div className="flex flex-col gap-2 px-4 pb-4">
              {mockPlaylists.map((pl) => (
                <MediaCard
                  key={pl.playlistId}
                  title={pl.title}
                  subtitle={`${pl.trackCount} músicas`}
                  thumbnails={pl.thumbnails}
                  onClick={() =>
                    onNavigate({
                      type: "playlist",
                      playlistId: pl.playlistId,
                    })
                  }
                />
              ))}
            </div>
          </ScrollArea>
        </div>
      </ResizablePanel>
    </ResizablePanelGroup>
  );
}
