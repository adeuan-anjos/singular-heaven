import { useRef, useCallback, useState } from "react";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { CarouselSection } from "../shared/carousel-section";
import { MediaCard } from "../shared/media-card";
import { VirtualTrackList } from "../shared/virtual-track-list";
import { mockTracks, mockPlaylists, mockArtists, mockAlbums } from "../../mock/data";
import type { Track, StackPage } from "../../types/music";

interface LibraryViewProps {
  onNavigate: (page: StackPage) => void;
  onPlayTrack: (track: Track) => void;
  onAddToQueue: (track: Track) => void;
}

export function LibraryView({ onNavigate, onPlayTrack, onAddToQueue }: LibraryViewProps) {
  const [activeTab, setActiveTab] = useState("curtidas");

  // Scroll ref for the Curtidas tab — scoped to its own scroll container
  const curtidisScrollRef = useRef<HTMLElement | null>(null);
  const curtidisScrollAreaRef = useCallback((node: HTMLDivElement | null) => {
    if (node) {
      const viewport = node.querySelector('[data-slot="scroll-area-viewport"]');
      curtidisScrollRef.current = viewport as HTMLElement | null;
    }
  }, []);

  return (
    <Tabs
      value={activeTab}
      onValueChange={(value) => setActiveTab(value as string)}
      className="flex h-full flex-col"
    >
      <div className="shrink-0 border-b border-border px-4 py-2">
        <TabsList>
          <TabsTrigger value="curtidas">Curtidas</TabsTrigger>
          <TabsTrigger value="playlists">Playlists</TabsTrigger>
          <TabsTrigger value="artistas">Artistas</TabsTrigger>
          <TabsTrigger value="albuns">Álbuns</TabsTrigger>
        </TabsList>
      </div>

      {/* Curtidas — virtualised list in its own scroll container */}
      <TabsContent value="curtidas" className="min-h-0 flex-1 overflow-hidden">
        <ScrollArea ref={curtidisScrollAreaRef} className="h-full">
          <VirtualTrackList
            tracks={mockTracks}
            scrollElementRef={curtidisScrollRef}
            scrollMargin={0}
            onPlay={onPlayTrack}
            onAddToQueue={onAddToQueue}
            onGoToArtist={(id) => onNavigate({ type: "artist", artistId: id })}
            onGoToAlbum={(id) => onNavigate({ type: "album", albumId: id })}
          />
        </ScrollArea>
      </TabsContent>

      {/* Playlists */}
      <TabsContent value="playlists" className="min-h-0 flex-1 overflow-hidden">
        <ScrollArea className="h-full">
          <div className="p-4">
            <CarouselSection title="Suas playlists">
              {mockPlaylists.map((pl) => (
                <MediaCard
                  key={pl.playlistId}
                  title={pl.title}
                  subtitle={`${pl.trackCount} músicas`}
                  thumbnails={pl.thumbnails}
                  onClick={() => onNavigate({ type: "playlist", playlistId: pl.playlistId })}
                />
              ))}
            </CarouselSection>
          </div>
        </ScrollArea>
      </TabsContent>

      {/* Artistas */}
      <TabsContent value="artistas" className="min-h-0 flex-1 overflow-hidden">
        <ScrollArea className="h-full">
          <div className="p-4">
            <CarouselSection title="Artistas que você segue">
              {mockArtists.map((artist) => (
                <MediaCard
                  key={artist.browseId}
                  title={artist.name}
                  subtitle={artist.subscribers}
                  thumbnails={artist.thumbnails}
                  rounded="full"
                  onClick={() => onNavigate({ type: "artist", artistId: artist.browseId })}
                />
              ))}
            </CarouselSection>
          </div>
        </ScrollArea>
      </TabsContent>

      {/* Álbuns */}
      <TabsContent value="albuns" className="min-h-0 flex-1 overflow-hidden">
        <ScrollArea className="h-full">
          <div className="p-4">
            <CarouselSection title="Álbuns salvos">
              {mockAlbums.slice(0, 5).map((album) => (
                <MediaCard
                  key={album.browseId}
                  title={album.title}
                  subtitle={album.artists.map((a) => a.name).join(", ")}
                  thumbnails={album.thumbnails}
                  onClick={() => onNavigate({ type: "album", albumId: album.browseId })}
                />
              ))}
            </CarouselSection>
          </div>
        </ScrollArea>
      </TabsContent>
    </Tabs>
  );
}
