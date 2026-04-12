import { useState, useEffect, useRef } from "react";
import { useLocation, useParams } from "wouter";
import { Button } from "@/components/ui/button";
import { ButtonGroup } from "@/components/ui/button-group";
import {
  CollectionHeader,
  CollectionHeaderInfo,
  CollectionHeaderThumbnail,
  CollectionHeaderContent,
  CollectionHeaderActions,
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
import { useYtActions } from "../../router/actions-context";
import { paths } from "../../router/paths";
import {
  Shuffle,
  Radio,
  Loader2,
} from "lucide-react";
import type { Artist } from "../../types/music";

export function ArtistSongsPage() {
  const params = useParams<{ id: string }>();
  const artistId = decodeURIComponent(params.id ?? "");
  const [, navigate] = useLocation();
  const { onPlayTrack, onPlayAll, onAddToQueue, onAddToPlaylist, onStartRadio } = useYtActions();
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
    <div className="flex flex-col gap-4">
      <CollectionHeader
        filterValue={filter}
        onFilterChange={(e) => setFilter(e.target.value)}
        filterPlaceholder="Filtrar por título, artista ou álbum"
      >
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
        onGoToArtist={(id) => navigate(paths.artist(id))}
        onGoToAlbum={(id) => navigate(paths.album(id))}
        onStartRadio={(track) => onStartRadio({ kind: "video", id: track.videoId })}
      />

      {filter && filteredSongs.length === 0 && (
        <p className="py-8 text-center text-sm text-muted-foreground">
          Nenhuma música encontrada para "{filter}"
        </p>
      )}
    </div>
  );
}
