import { ScrollArea } from "@/components/ui/scroll-area";
import { Button } from "@/components/ui/button";
import { CarouselSection } from "../shared/carousel-section";
import { MediaCard } from "../shared/media-card";
import { TrackRow } from "../shared/track-row";
import { getMockArtist } from "../../mock/data";
import type { Track, StackPage } from "../../types/music";

interface ArtistPageProps {
  artistId: string;
  onNavigate: (page: StackPage) => void;
  onPlayTrack: (track: Track) => void;
  onAddToQueue: (track: Track) => void;
}

export function ArtistPage({ artistId, onNavigate, onPlayTrack, onAddToQueue }: ArtistPageProps) {
  const artist = getMockArtist(artistId);
  const imgUrl = artist.thumbnails[0]?.url ?? "";

  return (
    <ScrollArea className="group/page h-full">
      <div className="mx-auto max-w-screen-xl space-y-6 p-4">
        <div className="flex items-center gap-6">
          <div className="flex h-32 w-32 shrink-0 items-center justify-center overflow-hidden rounded-sm bg-muted">
            {imgUrl ? (
              <img src={imgUrl} alt={artist.name} className="h-full w-full object-cover" />
            ) : (
              <span className="text-3xl text-muted-foreground">{artist.name.charAt(0)}</span>
            )}
          </div>
          <div>
            <h1 className="text-3xl font-bold text-foreground">{artist.name}</h1>
            {artist.subscribers && (
              <p className="text-sm text-muted-foreground">{artist.subscribers} inscritos</p>
            )}
            <Button className="mt-3" variant="outline" size="sm">
              Inscrever-se
            </Button>
          </div>
        </div>

        {artist.topSongs && artist.topSongs.length > 0 && (
          <div className="space-y-2">
            <h2 className="px-2 text-lg font-semibold">Top músicas</h2>
            {artist.topSongs.slice(0, 5).map((track, i) => (
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
        )}

        {artist.albums && artist.albums.length > 0 && (
          <CarouselSection title="Álbuns">
            {artist.albums.map((album) => (
              <MediaCard
                key={album.browseId}
                title={album.title}
                typeLabel="Álbum"
                artistName={album.year}
                thumbnails={album.thumbnails}
                onClick={() => onNavigate({ type: "album", albumId: album.browseId })}
                onPlay={() => onNavigate({ type: "album", albumId: album.browseId })}
              />
            ))}
          </CarouselSection>
        )}

        {artist.singles && artist.singles.length > 0 && (
          <CarouselSection title="Singles">
            {artist.singles.map((single) => (
              <MediaCard
                key={single.browseId}
                title={single.title}
                typeLabel="Single"
                artistName={single.year}
                thumbnails={single.thumbnails}
                onClick={() => onNavigate({ type: "album", albumId: single.browseId })}
                onPlay={() => onNavigate({ type: "album", albumId: single.browseId })}
              />
            ))}
          </CarouselSection>
        )}

        {artist.similarArtists && artist.similarArtists.length > 0 && (
          <CarouselSection title="Artistas similares">
            {artist.similarArtists.map((a) => {
              const similarData = getMockArtist(a.browseId);
              const firstTrack = similarData.topSongs?.[0];
              return (
                <MediaCard
                  key={a.browseId}
                  title={a.name}
                  typeLabel="Artista"
                  thumbnails={a.thumbnails}
                  onClick={() => onNavigate({ type: "artist", artistId: a.browseId })}
                  onPlay={firstTrack ? () => onPlayTrack(firstTrack) : undefined}
                />
              );
            })}
          </CarouselSection>
        )}
      </div>
    </ScrollArea>
  );
}
