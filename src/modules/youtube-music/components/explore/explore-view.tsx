import { useState, useEffect } from "react";
import { Loader2 } from "lucide-react";
import { ScrollArea } from "@/components/ui/scroll-area";
import { CarouselSection } from "../shared/carousel-section";
import { MediaCard } from "../shared/media-card";
import { MoodGrid } from "./mood-grid";
import { SectionHeader } from "../shared/section-header";
import { ChartList } from "../shared/chart-list";
import { ytGetExplore } from "../../services/yt-api";
import { mapExplorePage, mapExploreSongToChart } from "../../services/mappers";
import {
  cacheFiniteTrackCollection,
  createTrackCollectionId,
} from "../../services/track-collections";
import type { Track, ExploreData, ChartTrack, StackPage } from "../../types/music";
import { perfMark, endModuleLoad } from "../../services/perf";

interface ExploreViewProps {
  onNavigate: (page: StackPage) => void;
  onPlayTrack: (track: Track) => void;
}

export function ExploreView({ onNavigate, onPlayTrack }: ExploreViewProps) {
  const [data, setData] = useState<ExploreData | null>(null);
  const [chartTracks, setChartTracks] = useState<ChartTrack[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function fetchExplore() {
      const viewMark = perfMark("ExploreView fetch", "VIEW");
      console.log("[ExploreView] Fetching explore data...");
      setLoading(true);
      setError(null);
      try {
        const apiData = await ytGetExplore();
        if (cancelled) return;
        const mapped = mapExplorePage(apiData);
        const charts = apiData.topSongs.map((s, i) => mapExploreSongToChart(s, i));
        viewMark.end({ newReleases: mapped.newReleases.length, trending: mapped.trending.length, charts: charts.length });
        endModuleLoad();
        console.log("[ExploreView] Loaded explore data:", {
          newReleases: mapped.newReleases.length,
          trending: mapped.trending.length,
          chartTracks: charts.length,
          moods: mapped.moodsAndGenres.length,
          newVideos: mapped.newVideos.length,
        });
        void cacheFiniteTrackCollection({
          collectionType: "explore-section",
          collectionId: createTrackCollectionId("explore", "top-songs"),
          title: "Top músicas",
          subtitle: "Explore",
          thumbnailUrl: charts[0]?.thumbnails?.[0]?.url ?? null,
          isComplete: true,
          tracks: charts,
        }).catch((error) => {
          console.error("[ExploreView] failed to cache top songs collection", error);
        });
        void cacheFiniteTrackCollection({
          collectionType: "explore-section",
          collectionId: createTrackCollectionId("explore", "trending"),
          title: "Em alta",
          subtitle: "Explore",
          thumbnailUrl: mapped.trending[0]?.thumbnails?.[0]?.url ?? null,
          isComplete: true,
          tracks: mapped.trending,
        }).catch((error) => {
          console.error("[ExploreView] failed to cache trending collection", error);
        });
        void cacheFiniteTrackCollection({
          collectionType: "explore-section",
          collectionId: createTrackCollectionId("explore", "new-videos"),
          title: "Novos vídeos",
          subtitle: "Explore",
          thumbnailUrl: mapped.newVideos[0]?.thumbnails?.[0]?.url ?? null,
          isComplete: true,
          tracks: mapped.newVideos,
        }).catch((error) => {
          console.error("[ExploreView] failed to cache new videos collection", error);
        });
        setData(mapped);
        setChartTracks(charts);
      } catch (err) {
        if (cancelled) return;
        const msg = err instanceof Error ? err.message : String(err);
        console.error("[ExploreView] Failed to load explore:", msg);
        setError(msg);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    fetchExplore();
    return () => { cancelled = true; };
  }, []);

  if (loading) {
    return (
      <div className="flex h-full items-center justify-center">
        <Loader2 className="size-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-2 text-muted-foreground">
        <p className="text-sm">Erro ao carregar a página de exploração</p>
        {error && <p className="text-xs">{error}</p>}
      </div>
    );
  }

  return (
    <ScrollArea className="group/page h-full">
      <div className="mx-auto max-w-screen-xl space-y-6 p-4">
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

        <div>
          <ChartList
            title="Top músicas"
            tracks={chartTracks}
            onPlayTrack={onPlayTrack}
            onGoToArtist={(artistId) => onNavigate({ type: "artist", artistId })}
            onGoToAlbum={(albumId) => onNavigate({ type: "album", albumId })}
          />
        </div>

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

        <div className="space-y-3">
          <SectionHeader title="Momentos e gêneros" />
          <MoodGrid categories={data.moodsAndGenres} onSelect={onNavigate} />
        </div>

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
      </div>
    </ScrollArea>
  );
}
