import { ScrollArea } from "@/components/ui/scroll-area";
import { CarouselSection } from "../shared/carousel-section";
import { MediaCard } from "../shared/media-card";
import { SectionHeader } from "../shared/section-header";
import { TrackRow } from "../shared/track-row";
import { mockTracks, mockPlaylists, mockArtists, mockAlbums } from "../../mock/data";
import type { Track, StackPage } from "../../types/music";

interface LibraryViewProps {
  onNavigate: (page: StackPage) => void;
  onPlayTrack: (track: Track) => void;
  onAddToQueue: (track: Track) => void;
}

export function LibraryView({ onNavigate, onPlayTrack, onAddToQueue }: LibraryViewProps) {
  return (
    <ScrollArea className="h-full">
      <div className="space-y-6 p-4">
        <div className="space-y-2">
          <SectionHeader title="Curtidas" />
          {mockTracks.slice(0, 5).map((track, i) => (
            <TrackRow
              key={track.videoId}
              track={track}
              index={i}
              onPlay={onPlayTrack}
              onAddToQueue={onAddToQueue}
              onGoToArtist={(id) => onNavigate({ type: "artist", artistId: id })}
              onGoToAlbum={(id) => onNavigate({ type: "album", albumId: id })}
            />
          ))}
        </div>

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
      </div>
    </ScrollArea>
  );
}
