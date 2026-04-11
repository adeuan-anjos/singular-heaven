import { useState, useEffect, useRef } from "react";
import { useLocation, useParams } from "wouter";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Button } from "@/components/ui/button";
import { ButtonGroup } from "@/components/ui/button-group";
import {
  CollectionHeader,
  CollectionHeaderInfo,
  CollectionHeaderThumbnail,
  CollectionHeaderContent,
  CollectionHeaderActions,
} from "../shared/collection-header";
import { CarouselSection } from "../shared/carousel-section";
import { MediaCard } from "../shared/media-card";
import { TrackTable } from "../shared/track-table";
import { ytGetArtist } from "../../services/yt-api";
import { mapArtistPage } from "../../services/mappers";
import {
  cacheFiniteTrackCollection,
  createTrackCollectionId,
  type TrackCollectionEntry,
} from "../../services/track-collections";
import { useYtActions } from "../../router/actions-context";
import { paths } from "../../router/paths";
import type { Artist } from "../../types/music";
import {
  Shuffle,
  Radio,
  ChevronDown,
  ChevronUp,
  Loader2,
} from "lucide-react";
import { usePlayerStore } from "../../stores/player-store";

export function ArtistPage() {
  const params = useParams<{ id: string }>();
  const artistId = decodeURIComponent(params.id ?? "");
  const [, navigate] = useLocation();
  const { onPlayTrack, onPlayAll, onAddToQueue, onAddToPlaylist } = useYtActions();
  const [artist, setArtist] = useState<Artist | null>(null);
  const [collectionTracks, setCollectionTracks] = useState<TrackCollectionEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const trackIdsRef = useRef<string[]>([]);
  const currentTrackId = usePlayerStore((s) => s.currentTrackId);
  const isPlaying = usePlayerStore((s) => s.isPlaying);
  const [subscribed, setSubscribed] = useState(false);
  const [bioExpanded, setBioExpanded] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    console.log("[ArtistPage] Fetching artist:", artistId);

    ytGetArtist(artistId)
      .then(async (raw) => {
        if (cancelled) return;
        const mapped = mapArtistPage(raw);
        const allSongs = mapped.topSongs ?? [];
        const collectionId = createTrackCollectionId("artist-songs", artistId);
        const collection = await cacheFiniteTrackCollection({
          collectionType: "artist-songs",
          collectionId,
          title: mapped.name,
          subtitle: "Músicas",
          thumbnailUrl:
            mapped.thumbnails[mapped.thumbnails.length - 1]?.url ??
            mapped.thumbnails[0]?.url ??
            null,
          isComplete: true,
          tracks: allSongs,
        });
        if (cancelled) return;
        console.log("[ArtistPage] Artist loaded:", mapped.name);
        trackIdsRef.current = collection.trackIds;
        setCollectionTracks(collection.entries);
        setArtist(mapped);
        setSubscribed(mapped.subscribed ?? false);
      })
      .catch((err) => {
        if (cancelled) return;
        const msg = err instanceof Error ? err.message : String(err);
        console.error("[ArtistPage] Failed to fetch artist:", msg);
        setError(msg);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => { cancelled = true; };
  }, [artistId]);

  if (loading) {
    return (
      <div className="flex h-full items-center justify-center">
        <Loader2 className="size-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex h-full items-center justify-center">
        <p className="text-sm text-destructive">{error}</p>
      </div>
    );
  }

  if (!artist) return null;

  // Use the largest available thumbnail (last in array = highest resolution)
  const imgUrl = artist.thumbnails[artist.thumbnails.length - 1]?.url ?? "";

  return (
    <ScrollArea className="group/page h-full">
      <div className="mx-auto max-w-screen-xl space-y-4 p-4">
        <CollectionHeader>
          <CollectionHeaderInfo>
            <CollectionHeaderThumbnail
              src={imgUrl || undefined}
              alt={artist.name}
              fallback={artist.name.charAt(0)}
            />
            <CollectionHeaderContent>
              <h1 className="text-4xl font-bold text-foreground">{artist.name}</h1>
              {artist.monthlyListeners && (
                <p className="text-sm text-muted-foreground">{artist.monthlyListeners}</p>
              )}
              {artist.subscribers && (
                <p className="text-sm text-muted-foreground">{artist.subscribers} inscritos</p>
              )}
            </CollectionHeaderContent>
          </CollectionHeaderInfo>
          <CollectionHeaderActions>
            <ButtonGroup>
              {artist.shuffleId && (
                <Button variant="outline" onClick={() => {}}>
                  <Shuffle data-icon="inline-start" />
                  Aleatório
                </Button>
              )}
              {artist.radioId && (
                <Button variant="outline" onClick={() => {}}>
                  <Radio data-icon="inline-start" />
                  Rádio
                </Button>
              )}
            </ButtonGroup>
            <ButtonGroup>
              <Button
                variant={subscribed ? "default" : "outline"}
                onClick={() => setSubscribed(!subscribed)}
              >
                {subscribed ? "Inscrito" : "Inscrever-se"}
              </Button>
            </ButtonGroup>
          </CollectionHeaderActions>
        </CollectionHeader>

        {/* Top songs */}
        {artist.topSongs && artist.topSongs.length > 0 && (
          <div className="space-y-2">
            <h2 className="text-lg font-semibold text-foreground">Músicas</h2>
            <TrackTable
              tracks={collectionTracks.slice(0, 5)}
              showViews
              currentTrackId={currentTrackId ?? undefined}
              isPlaying={isPlaying}
              getTrackKey={(track) =>
                (track as TrackCollectionEntry).collectionRowKey ?? track.videoId
              }
              onPlay={(track) => {
                const topSongs = collectionTracks;
                const index =
                  (track as TrackCollectionEntry).collectionPosition ??
                  topSongs.findIndex((t) => t.videoId === track.videoId);
                if (index >= 0) {
                  onPlayAll(topSongs, index, undefined, true, {
                    queueTrackIds: trackIdsRef.current,
                  });
                } else {
                  onPlayTrack(track);
                }
              }}
              onAddToQueue={onAddToQueue}
              onAddToPlaylist={onAddToPlaylist}
              onGoToArtist={(id) => navigate(paths.artist(id))}
              onGoToAlbum={(id) => navigate(paths.album(id))}
            />
            <Button
              variant="outline"
              size="sm"
              onClick={() => navigate(paths.artistSongs(artistId))}
            >
              Mostrar tudo
            </Button>
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
                onClick={() => navigate(paths.album(album.browseId))}
                onPlay={() => navigate(paths.album(album.browseId))}
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
                onClick={() => navigate(paths.album(single.browseId))}
                onPlay={() => navigate(paths.album(single.browseId))}
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
            {artist.similarArtists.map((a) => (
              <MediaCard
                key={a.browseId}
                title={a.name}
                typeLabel="Artista"
                thumbnails={a.thumbnails}
                onClick={() => navigate(paths.artist(a.browseId))}
              />
            ))}
          </CarouselSection>
        )}
      </div>
    </ScrollArea>
  );
}
