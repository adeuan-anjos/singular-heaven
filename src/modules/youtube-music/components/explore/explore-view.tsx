import { ScrollArea } from "@/components/ui/scroll-area";
import { CarouselSection } from "../shared/carousel-section";
import { MediaCard } from "../shared/media-card";
import { MoodGrid } from "./mood-grid";
import { SectionHeader } from "../shared/section-header";
import { mockExploreData } from "../../mock/data";
import type { Track, StackPage } from "../../types/music";

interface ExploreViewProps {
  onNavigate: (page: StackPage) => void;
  onPlayTrack: (track: Track) => void;
}

export function ExploreView({ onNavigate, onPlayTrack }: ExploreViewProps) {
  const data = mockExploreData;

  return (
    <ScrollArea className="group/page h-full">
      <div className="space-y-6 p-4">
        <CarouselSection title="Novos lançamentos">
          {data.newReleases.map((album) => {
            const firstArtistId = album.artists[0]?.id;
            return (
              <MediaCard
                key={album.browseId}
                title={album.title}
                typeLabel="Álbum"
                artistName={album.artists.map((a) => a.name).join(", ")}
                thumbnails={album.thumbnails}
                onClick={() => onNavigate({ type: "album", albumId: album.browseId })}
                onPlay={() => onNavigate({ type: "album", albumId: album.browseId })}
                onGoToArtist={firstArtistId ? () => onNavigate({ type: "artist", artistId: firstArtistId }) : undefined}
              />
            );
          })}
        </CarouselSection>

        <CarouselSection title="Em alta">
          {data.trending.map((track) => {
            const firstArtistId = track.artists[0]?.id;
            const albumId = track.album?.id;
            return (
              <MediaCard
                key={track.videoId}
                title={track.title}
                typeLabel="Música"
                artistName={track.artists.map((a) => a.name).join(", ")}
                albumName={track.album?.name}
                thumbnails={track.thumbnails}
                onClick={() => onPlayTrack(track)}
                onPlay={() => onPlayTrack(track)}
                onGoToArtist={firstArtistId ? () => onNavigate({ type: "artist", artistId: firstArtistId }) : undefined}
                onGoToAlbum={albumId ? () => onNavigate({ type: "album", albumId }) : undefined}
              />
            );
          })}
        </CarouselSection>

        <CarouselSection title="Novos vídeos">
          {data.newVideos.map((track) => {
            const firstArtistId = track.artists[0]?.id;
            const albumId = track.album?.id;
            return (
              <MediaCard
                key={track.videoId}
                title={track.title}
                typeLabel="Música"
                artistName={track.artists.map((a) => a.name).join(", ")}
                albumName={track.album?.name}
                thumbnails={track.thumbnails}
                onClick={() => onPlayTrack(track)}
                onPlay={() => onPlayTrack(track)}
                onGoToArtist={firstArtistId ? () => onNavigate({ type: "artist", artistId: firstArtistId }) : undefined}
                onGoToAlbum={albumId ? () => onNavigate({ type: "album", albumId }) : undefined}
              />
            );
          })}
        </CarouselSection>

        <div className="space-y-3">
          <SectionHeader title="Moods e gêneros" />
          <MoodGrid categories={data.moodsAndGenres} onSelect={onNavigate} />
        </div>
      </div>
    </ScrollArea>
  );
}
