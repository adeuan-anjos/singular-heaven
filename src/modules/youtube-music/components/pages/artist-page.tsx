import { useState } from "react";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Button } from "@/components/ui/button";
import { CarouselSection } from "../shared/carousel-section";
import { MediaCard } from "../shared/media-card";
import { TrackTable } from "../shared/track-table";
import { getMockArtist } from "../../mock/data";
import type { Track, StackPage } from "../../types/music";
import {
  Shuffle,
  Radio,
  Heart,
  Ellipsis,
  ChevronDown,
  ChevronUp,
} from "lucide-react";

interface ArtistPageProps {
  artistId: string;
  onNavigate: (page: StackPage) => void;
  onPlayTrack: (track: Track) => void;
  onAddToQueue: (track: Track) => void;
}

export function ArtistPage({ artistId, onNavigate, onPlayTrack, onAddToQueue }: ArtistPageProps) {
  const artist = getMockArtist(artistId);
  const imgUrl = artist.thumbnails[0]?.url ?? "";
  const [subscribed, setSubscribed] = useState(artist.subscribed ?? false);
  const [liked, setLiked] = useState(false);
  const [bioExpanded, setBioExpanded] = useState(false);

  return (
    <ScrollArea className="group/page h-full">
      <div className="mx-auto max-w-screen-xl space-y-6 p-4">
        {/* Header */}
        <div className="flex items-center gap-6">
          <div className="flex h-48 w-48 shrink-0 items-center justify-center overflow-hidden rounded-sm bg-muted">
            {imgUrl ? (
              <img src={imgUrl} alt={artist.name} className="h-full w-full object-cover" />
            ) : (
              <span className="text-4xl text-muted-foreground">{artist.name.charAt(0)}</span>
            )}
          </div>
          <div className="space-y-1">
            <h1 className="text-4xl font-bold text-foreground">{artist.name}</h1>
            {artist.monthlyListeners && (
              <p className="text-sm text-muted-foreground">{artist.monthlyListeners}</p>
            )}
            {artist.subscribers && (
              <p className="text-sm text-muted-foreground">{artist.subscribers} inscritos</p>
            )}
          </div>
        </div>

        {/* Action buttons */}
        <div className="flex items-center gap-2">
          {artist.shuffleId && (
            <Button variant="outline" size="sm">
              <Shuffle className="mr-2 h-4 w-4" />
              Aleatório
            </Button>
          )}
          {artist.radioId && (
            <Button variant="outline" size="sm">
              <Radio className="mr-2 h-4 w-4" />
              Rádio
            </Button>
          )}
          <Button
            variant={subscribed ? "default" : "outline"}
            size="sm"
            onClick={() => setSubscribed(!subscribed)}
          >
            {subscribed ? "Inscrito" : "Inscrever-se"}
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8"
            onClick={() => setLiked(!liked)}
            aria-label="Curtir"
          >
            <Heart className={`h-4 w-4 ${liked ? "fill-red-500 text-red-500" : ""}`} />
          </Button>
          <Button variant="ghost" size="icon" className="h-8 w-8" aria-label="Mais opções">
            <Ellipsis className="h-4 w-4" />
          </Button>
        </div>

        {/* Top songs */}
        {artist.topSongs && artist.topSongs.length > 0 && (
          <div className="space-y-2">
            <h2 className="text-lg font-semibold text-foreground">Músicas</h2>
            <TrackTable
              tracks={artist.topSongs.slice(0, 5)}
              onPlay={onPlayTrack}
              onAddToQueue={onAddToQueue}
              onGoToArtist={(id) => onNavigate({ type: "artist", artistId: id })}
              onGoToAlbum={(id) => onNavigate({ type: "album", albumId: id })}
            />
          </div>
        )}

        {/* Albums */}
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

        {/* Singles */}
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

        {/* Videos */}
        {artist.videos && artist.videos.length > 0 && (
          <CarouselSection title="Vídeos">
            {artist.videos.map((video) => (
              <MediaCard
                key={video.videoId}
                title={video.title}
                typeLabel="Vídeo"
                artistName={video.artists.map((a) => a.name).join(", ")}
                thumbnails={video.thumbnails}
                onClick={() => onPlayTrack(video)}
                onPlay={() => onPlayTrack(video)}
              />
            ))}
          </CarouselSection>
        )}

        {/* About the artist */}
        {artist.description && (
          <div className="space-y-2">
            <h2 className="text-lg font-semibold text-foreground">Sobre o artista</h2>
            <div className="max-w-prose">
              <p
                className={`text-sm leading-relaxed text-muted-foreground ${bioExpanded ? "" : "line-clamp-3"}`}
              >
                {artist.description}
              </p>
              <Button
                variant="ghost"
                size="sm"
                className="mt-1 px-0 text-xs text-muted-foreground hover:text-foreground"
                onClick={() => setBioExpanded(!bioExpanded)}
              >
                {bioExpanded ? (
                  <>
                    <ChevronUp className="mr-1 h-3 w-3" />
                    Ver menos
                  </>
                ) : (
                  <>
                    <ChevronDown className="mr-1 h-3 w-3" />
                    Ver mais
                  </>
                )}
              </Button>
              {artist.views && (
                <p className="mt-2 text-xs text-muted-foreground">{artist.views}</p>
              )}
            </div>
          </div>
        )}

        {/* Similar artists */}
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
