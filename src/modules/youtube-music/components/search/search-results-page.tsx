import { ScrollArea } from "@/components/ui/scroll-area";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { TrackRow } from "../shared/track-row";
import { MediaCard } from "../shared/media-card";
import { MediaGrid } from "../shared/media-grid";
import { CarouselSection } from "../shared/carousel-section";
import { TopResultSection } from "./top-result-section";
import { mockSearchResults } from "../../mock/data";
import { usePlayerStore } from "../../stores/player-store";
import type { Track, StackPage } from "../../types/music";

interface SearchResultsPageProps {
  query: string;
  onNavigate: (page: StackPage) => void;
  onPlayTrack: (track: Track) => void;
  onAddToQueue: (track: Track) => void;
}

type FilterTab = "all" | "songs" | "videos" | "albums" | "artists" | "playlists";

const FILTER_TABS: { value: FilterTab; label: string }[] = [
  { value: "all", label: "Tudo" },
  { value: "songs", label: "Músicas" },
  { value: "videos", label: "Vídeos" },
  { value: "albums", label: "Álbuns" },
  { value: "artists", label: "Artistas" },
  { value: "playlists", label: "Playlists" },
];

export function SearchResultsPage({
  query,
  onNavigate,
  onPlayTrack,
  onAddToQueue,
}: SearchResultsPageProps) {
  const results = mockSearchResults;
  const currentTrackId = usePlayerStore((s) => s.currentTrack?.videoId);

  console.log("[SearchResultsPage] render", { query });

  const handleGoToArtist = (artistId: string) => {
    onNavigate({ type: "artist", artistId });
  };

  const handleGoToAlbum = (albumId: string) => {
    onNavigate({ type: "album", albumId });
  };

  const renderSongsSection = (title?: string) => (
    <div className="space-y-1">
      {title && <h2 className="text-lg font-semibold text-foreground">{title}</h2>}
      {results.songs.map((track, i) => (
        <TrackRow
          key={track.videoId}
          track={track}
          index={i}
          onPlay={onPlayTrack}
          onAddToQueue={onAddToQueue}
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
            onPlay={() => onPlayTrack(results.songs[0])}
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
      : results.songs[0]
        ? { kind: "song" as const, song: results.songs[0] }
        : null;

  const renderAllTab = () => (
    <div className="space-y-6">
      {topResult && results.songs.length > 0 && (
        <TopResultSection
          topResult={topResult}
          topSongs={results.songs}
          currentTrackId={currentTrackId}
          onNavigate={onNavigate}
          onPlayTrack={onPlayTrack}
          onAddToQueue={onAddToQueue}
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
                onPlay={() => onPlayTrack(results.songs[0])}
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
            {/* Videos reuse songs data for now (mock) */}
            {renderSongsSection()}
          </TabsContent>

          <TabsContent value="albums">
            {renderAlbumsSection()}
          </TabsContent>

          <TabsContent value="artists">
            {renderArtistsSection()}
          </TabsContent>

          <TabsContent value="playlists">
            {renderPlaylistsSection()}
          </TabsContent>
        </Tabs>
      </div>
    </ScrollArea>
  );
}
