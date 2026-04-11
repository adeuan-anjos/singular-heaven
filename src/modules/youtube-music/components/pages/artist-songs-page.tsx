import { useState, useEffect, useRef } from "react";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Button } from "@/components/ui/button";
import { ButtonGroup } from "@/components/ui/button-group";
import {
  CollectionHeader,
  CollectionHeaderInfo,
  CollectionHeaderThumbnail,
  CollectionHeaderContent,
  CollectionHeaderActions,
  CollectionHeaderFilter,
} from "../shared/collection-header";
import { TrackTable } from "../shared/track-table";
import { ytGetArtist } from "../../services/yt-api";
import { mapArtistPage } from "../../services/mappers";
import {
  cacheFiniteTrackCollection,
  createTrackCollectionId,
  type TrackCollectionEntry,
} from "../../services/track-collections";
import { usePlayerStore } from "../../stores/player-store";
import {
  Shuffle,
  Radio,
  Loader2,
} from "lucide-react";
import type { Artist, PlayAllOptions, Track, StackPage } from "../../types/music";

interface ArtistSongsPageProps {
  artistId: string;
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

export function ArtistSongsPage({
  artistId,
  onNavigate,
  onPlayTrack,
  onPlayAll,
  onAddToQueue,
  onAddToPlaylist,
}: ArtistSongsPageProps) {
  const [artist, setArtist] = useState<Artist | null>(null);
  const [collectionTracks, setCollectionTracks] = useState<TrackCollectionEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const trackIdsRef = useRef<string[]>([]);
  const currentTrackId = usePlayerStore((s) => s.currentTrackId);
  const isPlaying = usePlayerStore((s) => s.isPlaying);
  const [subscribed, setSubscribed] = useState(false);
  const [filter, setFilter] = useState("");

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    console.log("[ArtistSongsPage] Fetching artist:", artistId);

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
        console.log("[ArtistSongsPage] Artist loaded:", mapped.name, "songs:", mapped.topSongs?.length);
        trackIdsRef.current = collection.trackIds;
        setCollectionTracks(collection.entries);
        setArtist(mapped);
        setSubscribed(mapped.subscribed ?? false);
      })
      .catch((err) => {
        if (cancelled) return;
        const msg = err instanceof Error ? err.message : String(err);
        console.error("[ArtistSongsPage] Failed to fetch artist:", msg);
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

  const allSongs = collectionTracks;
  const filteredSongs = filter
    ? allSongs.filter((t) => {
        const q = filter.toLowerCase();
        return (
          t.title.toLowerCase().includes(q) ||
          t.artists.some((a) => a.name.toLowerCase().includes(q)) ||
          (t.album?.name.toLowerCase().includes(q) ?? false)
        );
      })
    : allSongs;

  const handlePlayAll = () => {
    if (allSongs.length > 0) {
      onPlayAll(allSongs, 0, undefined, true, {
        queueTrackIds: trackIdsRef.current,
      });
    }
  };

  const handleShuffle = () => {
    if (allSongs.length > 0) {
      onPlayAll(allSongs, 0, undefined, true, {
        queueTrackIds: trackIdsRef.current,
        shuffle: true,
      });
    }
  };

  return (
    <ScrollArea className="group/page h-full">
      <div className="mx-auto max-w-screen-xl space-y-6 p-4">
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
              <Button variant="outline" onClick={handleShuffle}>
                <Shuffle data-icon="inline-start" />
                Aleatório
              </Button>
              <Button variant="outline" onClick={handlePlayAll}>
                <Radio data-icon="inline-start" />
                Rádio
              </Button>
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

        <CollectionHeaderFilter
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
          placeholder="Filtrar por título, artista ou álbum"
        />

        {/* Músicas heading */}
        <h2 className="text-lg font-semibold text-foreground">Músicas</h2>

        {/* Full track list */}
        <TrackTable
          tracks={filteredSongs}
          showViews
          currentTrackId={currentTrackId ?? undefined}
          isPlaying={isPlaying}
          getTrackKey={(track) =>
            (track as TrackCollectionEntry).collectionRowKey ?? track.videoId
          }
          onPlay={(track) => {
            const index =
              (track as TrackCollectionEntry).collectionPosition ??
              allSongs.findIndex((t) => t.videoId === track.videoId);
            if (index >= 0) {
              onPlayAll(allSongs, index, undefined, true, {
                queueTrackIds: trackIdsRef.current,
              });
            } else {
              onPlayTrack(track);
            }
          }}
          onAddToQueue={onAddToQueue}
          onAddToPlaylist={onAddToPlaylist}
          onGoToArtist={(id) => onNavigate({ type: "artist", artistId: id })}
          onGoToAlbum={(id) => onNavigate({ type: "album", albumId: id })}
        />

        {filter && filteredSongs.length === 0 && (
          <p className="py-8 text-center text-sm text-muted-foreground">
            Nenhuma música encontrada para "{filter}"
          </p>
        )}
      </div>
    </ScrollArea>
  );
}
