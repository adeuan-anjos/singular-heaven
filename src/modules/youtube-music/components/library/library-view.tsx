import { useRef, useState, useEffect, useCallback } from "react";
import { ScrollArea } from "@/components/ui/scroll-area";
import { CarouselSection } from "../shared/carousel-section";
import { MediaCard } from "../shared/media-card";
import { SectionHeader } from "../shared/section-header";
import { VirtualTrackList } from "../shared/virtual-track-list";
import { mockTracks, mockPlaylists, mockArtists, mockAlbums } from "../../mock/data";
import type { Track, StackPage } from "../../types/music";

interface LibraryViewProps {
  onNavigate: (page: StackPage) => void;
  onPlayTrack: (track: Track) => void;
  onAddToQueue: (track: Track) => void;
}

export function LibraryView({ onNavigate, onPlayTrack, onAddToQueue }: LibraryViewProps) {
  const scrollRef = useRef<HTMLElement | null>(null);
  const trackListRef = useRef<HTMLDivElement>(null);
  const [scrollMargin, setScrollMargin] = useState(0);

  const scrollAreaRef = useCallback((node: HTMLDivElement | null) => {
    if (node) {
      const viewport = node.querySelector('[data-slot="scroll-area-viewport"]');
      scrollRef.current = viewport as HTMLElement | null;
    }
  }, []);

  useEffect(() => {
    if (trackListRef.current) {
      setScrollMargin(trackListRef.current.offsetTop);
    }
  }, []);

  return (
    <ScrollArea ref={scrollAreaRef} className="h-full">
      <div className="space-y-6 p-4">
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

        <div className="space-y-2">
          <SectionHeader title="Curtidas" />
          <div ref={trackListRef}>
            <VirtualTrackList
              tracks={mockTracks}
              scrollElementRef={scrollRef}
              scrollMargin={scrollMargin}
              onPlay={onPlayTrack}
              onAddToQueue={onAddToQueue}
              onGoToArtist={(id) => onNavigate({ type: "artist", artistId: id })}
              onGoToAlbum={(id) => onNavigate({ type: "album", albumId: id })}
            />
          </div>
        </div>
      </div>
    </ScrollArea>
  );
}
