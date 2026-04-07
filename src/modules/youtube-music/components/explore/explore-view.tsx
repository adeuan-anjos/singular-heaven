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
    <ScrollArea className="h-full">
      <div className="space-y-6 p-4">
        <CarouselSection title="Novos lançamentos">
          {data.newReleases.map((album) => (
            <MediaCard
              key={album.browseId}
              title={album.title}
              subtitle={album.artists.map((a) => a.name).join(", ")}
              thumbnails={album.thumbnails}
              onClick={() => onNavigate({ type: "album", albumId: album.browseId })}
            />
          ))}
        </CarouselSection>

        <CarouselSection title="Em alta">
          {data.trending.map((track) => (
            <MediaCard
              key={track.videoId}
              title={track.title}
              subtitle={track.artists.map((a) => a.name).join(", ")}
              thumbnails={track.thumbnails}
              onClick={() => onPlayTrack(track)}
            />
          ))}
        </CarouselSection>

        <CarouselSection title="Novos vídeos">
          {data.newVideos.map((track) => (
            <MediaCard
              key={track.videoId}
              title={track.title}
              subtitle={track.artists.map((a) => a.name).join(", ")}
              thumbnails={track.thumbnails}
              onClick={() => onPlayTrack(track)}
            />
          ))}
        </CarouselSection>

        <div className="space-y-3">
          <SectionHeader title="Moods e gêneros" />
          <MoodGrid categories={data.moodsAndGenres} onSelect={onNavigate} />
        </div>
      </div>
    </ScrollArea>
  );
}
