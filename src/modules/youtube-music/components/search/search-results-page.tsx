import { useState, useEffect, useRef } from "react";
import { Loader2 } from "lucide-react";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { TrackRow } from "../shared/track-row";
import { MediaCard } from "../shared/media-card";
import { MediaGrid } from "../shared/media-grid";
import { CarouselSection } from "../shared/carousel-section";
import { TopResultSection } from "./top-result-section";
import { ytSearch } from "../../services/yt-api";
import { mapSearchResults } from "../../services/mappers";
import {
  cacheFiniteTrackCollection,
  createTrackCollectionId,
  type TrackCollectionEntry,
} from "../../services/track-collections";
import { usePlayerStore } from "../../stores/player-store";
import type { PlayAllOptions, Track, SearchResults, StackPage } from "../../types/music";

interface SearchResultsPageProps {
  query: string;
  onNavigate: (page: StackPage) => void;
  onPlayTrack: (track: Track) => void;
  onPlayAll: (
    tracks: Track[],
    startIndex?: number,
    playlistId?: string,
    isComplete?: boolean,
    options?: PlayAllOptions
  ) => void;
  onAddToQueue: (track: Track) => void;
  onAddToPlaylist: (track: Track) => void;
}

type FilterTab = "all" | "songs" | "videos" | "albums" | "artists" | "community_playlists" | "featured_playlists";

const FILTER_TABS: { value: FilterTab; label: string }[] = [
  { value: "all", label: "Tudo" },
  { value: "songs", label: "Músicas" },
  { value: "videos", label: "Vídeos" },
  { value: "albums", label: "Álbuns" },
  { value: "artists", label: "Artistas" },
  { value: "community_playlists", label: "Playlists da comunidade" },
  { value: "featured_playlists", label: "Playlists em destaque" },
];

export function SearchResultsPage({
  query,
  onNavigate,
  onPlayTrack,
  onPlayAll,
  onAddToQueue,
  onAddToPlaylist,
}: SearchResultsPageProps) {
  const [results, setResults] = useState<SearchResults | null>(null);
  const [songEntries, setSongEntries] = useState<TrackCollectionEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const trackIdsRef = useRef<string[]>([]);
  const currentTrackId = usePlayerStore((s) => s.currentTrackId);

  useEffect(() => {
    let cancelled = false;

    async function fetchResults() {
      if (!query.trim()) {
        setResults(null);
        setSongEntries([]);
        trackIdsRef.current = [];
        setLoading(false);
        return;
      }

      console.log("[SearchResultsPage] Searching for:", query);
      setLoading(true);
      setError(null);
      try {
        const apiResponse = await ytSearch(query);
        if (cancelled) return;
        const mapped = mapSearchResults(apiResponse);
        const collection = await cacheFiniteTrackCollection({
          collectionType: "search-songs",
          collectionId: createTrackCollectionId("search-songs", query.toLowerCase()),
          title: `Resultados para ${query}`,
          subtitle: "Músicas",
          thumbnailUrl: mapped.songs[0]?.thumbnails?.[0]?.url ?? null,
          isComplete: true,
          tracks: mapped.songs,
        });
        if (cancelled) return;
        console.log("[SearchResultsPage] Search results:", {
          songs: mapped.songs.length,
          artists: mapped.artists.length,
          albums: mapped.albums.length,
          playlists: mapped.playlists.length,
        });
        trackIdsRef.current = collection.trackIds;
        setSongEntries(collection.entries);
        setResults(mapped);
      } catch (err) {
        if (cancelled) return;
        const msg = err instanceof Error ? err.message : String(err);
        console.error("[SearchResultsPage] Search failed:", msg);
        setSongEntries([]);
        trackIdsRef.current = [];
        setError(msg);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    fetchResults();
    return () => { cancelled = true; };
  }, [query]);

  console.log("[SearchResultsPage] render", { query });

  const handleGoToArtist = (artistId: string) => {
    onNavigate({ type: "artist", artistId });
  };

  const handleGoToAlbum = (albumId: string) => {
    onNavigate({ type: "album", albumId });
  };

  const handlePlaySearchTrack = (track: Track) => {
    const index =
      (track as TrackCollectionEntry).collectionPosition ??
      songEntries.findIndex((entry) => entry.videoId === track.videoId);
    if (index >= 0) {
      onPlayAll(songEntries, index, undefined, true, {
        queueTrackIds: trackIdsRef.current,
      });
      return;
    }
    onPlayTrack(track);
  };

  if (loading) {
    return (
      <div className="flex h-full items-center justify-center">
        <Loader2 className="size-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-2 text-muted-foreground">
        <p className="text-sm">Erro ao buscar resultados</p>
        <p className="text-xs">{error}</p>
      </div>
    );
  }

  if (!results) {
    return (
      <div className="flex h-full items-center justify-center text-muted-foreground">
        <p className="text-sm">Nenhum resultado encontrado</p>
      </div>
    );
  }

  const renderSongsSection = (title?: string) => (
    <div className="space-y-1">
      {title && <h2 className="text-lg font-semibold text-foreground">{title}</h2>}
      {songEntries.map((track, i) => (
        <TrackRow
          key={track.collectionRowKey}
          track={track}
          index={i}
          isPlaying={track.videoId === currentTrackId}
          onPlay={handlePlaySearchTrack}
          onAddToQueue={onAddToQueue}
          onAddToPlaylist={onAddToPlaylist}
          onGoToArtist={handleGoToArtist}
          onGoToAlbum={handleGoToAlbum}
        />
      ))}
    </div>
  );

  const renderAlbumsSection = (title?: string) => (
    <MediaGrid title={title}>
      {results.albums.map((album) => {
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
            onGoToArtist={firstArtistId ? () => handleGoToArtist(firstArtistId) : undefined}
          />
        );
      })}
    </MediaGrid>
  );

  const renderArtistsSection = (title?: string) => (
    <MediaGrid title={title}>
      {results.artists.map((artist) => (
        <MediaCard
          key={artist.browseId}
          title={artist.name}
          typeLabel="Artista"
          artistName={artist.subscribers ? `${artist.subscribers} inscritos` : undefined}
          thumbnails={artist.thumbnails}
          onClick={() => onNavigate({ type: "artist", artistId: artist.browseId })}
        />
      ))}
    </MediaGrid>
  );

  const renderPlaylistsSection = (title?: string) => (
    <MediaGrid title={title}>
      {results.playlists.map((pl) => (
        <MediaCard
          key={pl.playlistId}
          title={pl.title}
          typeLabel="Playlist"
          artistName={pl.author.name}
          thumbnails={pl.thumbnails}
          onClick={() => onNavigate({ type: "playlist", playlistId: pl.playlistId })}
        />
      ))}
    </MediaGrid>
  );

  const topResult = results.artists[0]
    ? { kind: "artist" as const, artist: results.artists[0] }
    : results.albums[0]
      ? { kind: "album" as const, album: results.albums[0] }
      : songEntries[0]
        ? { kind: "song" as const, song: songEntries[0] }
        : null;

  const renderAllTab = () => (
    <div className="space-y-6">
      {topResult && songEntries.length > 0 && (
        <TopResultSection
          topResult={topResult}
          topSongs={songEntries}
          currentTrackId={currentTrackId ?? undefined}
          onNavigate={onNavigate}
          onPlayTrack={handlePlaySearchTrack}
          onAddToQueue={onAddToQueue}
          onAddToPlaylist={onAddToPlaylist}
          onGoToArtist={handleGoToArtist}
          onGoToAlbum={handleGoToAlbum}
        />
      )}
      {results.albums.length > 0 && (
        <CarouselSection title="Álbuns">
          {results.albums.map((album) => {
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
                onGoToArtist={firstArtistId ? () => handleGoToArtist(firstArtistId) : undefined}
              />
            );
          })}
        </CarouselSection>
      )}
      {results.artists.length > 0 && (
        <CarouselSection title="Artistas">
          {results.artists.map((artist) => (
            <MediaCard
              key={artist.browseId}
              title={artist.name}
              typeLabel="Artista"
              artistName={artist.subscribers ? `${artist.subscribers} inscritos` : undefined}
              thumbnails={artist.thumbnails}
              onClick={() => onNavigate({ type: "artist", artistId: artist.browseId })}
            />
          ))}
        </CarouselSection>
      )}
      {results.playlists.length > 0 && (
        <CarouselSection title="Playlists">
          {results.playlists.map((pl) => (
            <MediaCard
              key={pl.playlistId}
              title={pl.title}
              typeLabel="Playlist"
              artistName={pl.author.name}
              thumbnails={pl.thumbnails}
              onClick={() => onNavigate({ type: "playlist", playlistId: pl.playlistId })}
            />
          ))}
        </CarouselSection>
      )}
    </div>
  );

  return (
    <ScrollArea className="group/page h-full">
      <div className="mx-auto max-w-screen-xl space-y-6 p-4">
        <h1 className="text-2xl font-bold text-foreground">
          Resultados para &apos;{query}&apos;
        </h1>

        <Tabs defaultValue="all" className="space-y-6">
          <TabsList variant="line">
            {FILTER_TABS.map((tab) => (
              <TabsTrigger key={tab.value} value={tab.value}>
                {tab.label}
              </TabsTrigger>
            ))}
          </TabsList>

          <TabsContent value="all">
            {renderAllTab()}
          </TabsContent>

          <TabsContent value="songs">
            {renderSongsSection()}
          </TabsContent>

          <TabsContent value="videos">
            {renderSongsSection()}
          </TabsContent>

          <TabsContent value="albums">
            {renderAlbumsSection()}
          </TabsContent>

          <TabsContent value="artists">
            {renderArtistsSection()}
          </TabsContent>

          <TabsContent value="community_playlists">
            {renderPlaylistsSection()}
          </TabsContent>

          <TabsContent value="featured_playlists">
            {renderPlaylistsSection()}
          </TabsContent>
        </Tabs>
      </div>
    </ScrollArea>
  );
}
