import { useState, useEffect } from "react";
import { useLocation } from "wouter";
import { Loader2 } from "lucide-react";
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
import { useYtActions } from "../../router/actions-context";
import { paths } from "../../router/paths";
import type { ExploreData, ChartTrack } from "../../types/music";

export function ExploreView() {
  const [, navigate] = useLocation();
  const { onPlayTrack } = useYtActions();
  const [data, setData] = useState<ExploreData | null>(null);
  const [chartTracks, setChartTracks] = useState<ChartTrack[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function fetchExplore() {
      setLoading(true);
      setError(null);
      try {
        const apiData = await ytGetExplore();
        if (cancelled) return;
        const mapped = mapExplorePage(apiData);
        const charts = apiData.topSongs.map((s, i) => mapExploreSongToChart(s, i));
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
    <div className="flex flex-col gap-6">
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
              onClick={() => navigate(paths.album(album.browseId))}
              onPlay={() => navigate(paths.album(album.browseId))}
              onGoToArtist={firstArtistId ? () => navigate(paths.artist(firstArtistId)) : undefined}
            />
          );
        })}
      </CarouselSection>

      <div>
        <ChartList
          title="Top músicas"
          tracks={chartTracks}
          onPlayTrack={onPlayTrack}
          onGoToArtist={(artistId) => navigate(paths.artist(artistId))}
          onGoToAlbum={(albumId) => navigate(paths.album(albumId))}
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
              onGoToArtist={firstArtistId ? () => navigate(paths.artist(firstArtistId)) : undefined}
              onGoToAlbum={albumId ? () => navigate(paths.album(albumId)) : undefined}
            />
          );
        })}
      </CarouselSection>

      <div className="space-y-3">
        <SectionHeader title="Momentos e gêneros" />
        <MoodGrid categories={data.moodsAndGenres} />
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
              onGoToArtist={firstArtistId ? () => navigate(paths.artist(firstArtistId)) : undefined}
              onGoToAlbum={albumId ? () => navigate(paths.album(albumId)) : undefined}
            />
          );
        })}
      </CarouselSection>
    </div>
  );
}
