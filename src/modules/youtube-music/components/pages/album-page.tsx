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
} from "../shared/collection-header";
import { TrackTable } from "../shared/track-table";
import { ytGetAlbum } from "../../services/yt-api";
import { mapAlbumPage } from "../../services/mappers";
import {
  cacheFiniteTrackCollection,
  createTrackCollectionId,
  type TrackCollectionEntry,
} from "../../services/track-collections";
import { usePlayerStore } from "../../stores/player-store";
import { Play, Shuffle, Loader2 } from "lucide-react";
import type { Album, PlayAllOptions, Track, StackPage } from "../../types/music";

interface AlbumPageProps {
  albumId: string;
  onNavigate: (page: StackPage) => void;
  onPlayTrack: (track: Track) => void;
  onAddToQueue: (track: Track) => void;
  onAddToPlaylist: (track: Track) => void;
  onPlayAll: (
    tracks: Track[],
    startIndex?: number,
    playlistId?: string,
    isComplete?: boolean,
    options?: PlayAllOptions
  ) => void;
}

export function AlbumPage({
  albumId,
  onNavigate,
  onPlayTrack,
  onAddToQueue,
  onAddToPlaylist,
  onPlayAll,
}: AlbumPageProps) {
  const [album, setAlbum] = useState<Album | null>(null);
  const [collectionTracks, setCollectionTracks] = useState<TrackCollectionEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const trackIdsRef = useRef<string[]>([]);
  const currentTrackId = usePlayerStore((s) => s.currentTrackId);
  const isPlaying = usePlayerStore((s) => s.isPlaying);
  const [filter, setFilter] = useState("");

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    console.log("[AlbumPage] Fetching album:", albumId);

    ytGetAlbum(albumId)
      .then(async (raw) => {
        if (cancelled) return;
        const mapped = mapAlbumPage(raw);
        const artistName = mapped.artists.map((a) => a.name).join(", ");
        const tracks = mapped.tracks ?? [];
        const collectionId = createTrackCollectionId("album", albumId);
        const collection = await cacheFiniteTrackCollection({
          collectionType: "album",
          collectionId,
          title: mapped.title,
          subtitle: artistName || null,
          thumbnailUrl:
            mapped.thumbnails[mapped.thumbnails.length - 1]?.url ??
            mapped.thumbnails[0]?.url ??
            null,
          isComplete: true,
          tracks,
        });
        if (cancelled) return;
        console.log("[AlbumPage] Album loaded:", mapped.title, "tracks:", mapped.tracks?.length);
        trackIdsRef.current = collection.trackIds;
        setCollectionTracks(collection.entries);
        setAlbum(mapped);
      })
      .catch((err) => {
        if (cancelled) return;
        const msg = err instanceof Error ? err.message : String(err);
        console.error("[AlbumPage] Failed to fetch album:", msg);
        setError(msg);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => { cancelled = true; };
  }, [albumId]);

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

  if (!album) return null;

  const artistName = album.artists.map((a) => a.name).join(", ");
  const tracks = collectionTracks;
  const filteredTracks = filter
    ? tracks.filter((t) => {
        const q = filter.toLowerCase();
        return (
          t.title.toLowerCase().includes(q) ||
          t.artists.some((a) => a.name.toLowerCase().includes(q))
        );
      })
    : tracks;

  return (
    <ScrollArea className="group/page h-full">
      <div className="mx-auto max-w-screen-xl space-y-4 p-4">
        <CollectionHeader
          filterValue={filter}
          onFilterChange={(e) => setFilter(e.target.value)}
          filterPlaceholder="Filtrar por título ou artista"
        >
          <CollectionHeaderInfo>
            <CollectionHeaderThumbnail
              src={album.thumbnails[album.thumbnails.length - 1]?.url ?? album.thumbnails[0]?.url}
              alt={album.title}
              fallback={album.title.charAt(0)}
            />
            <CollectionHeaderContent>
              <h1 className="text-4xl font-bold text-foreground">{album.title}</h1>
              <p className="text-sm text-muted-foreground">
                {album.artists[0]?.id ? (
                  <button
                    type="button"
                    className="hover:underline"
                    onClick={() => onNavigate({ type: "artist", artistId: album.artists[0].id! })}
                  >
                    {artistName}
                  </button>
                ) : (
                  <span>{artistName}</span>
                )}
              </p>
              <p className="text-sm text-muted-foreground">
                {[album.year, `${tracks.length} músicas`].filter(Boolean).join(" • ")}
              </p>
            </CollectionHeaderContent>
          </CollectionHeaderInfo>
          <CollectionHeaderActions>
            <ButtonGroup>
              <Button
                variant="outline"
                onClick={() =>
                  onPlayAll(tracks, 0, undefined, true, {
                    queueTrackIds: trackIdsRef.current,
                  })
                }
              >
                <Play data-icon="inline-start" />
                Reproduzir
              </Button>
              <Button
                variant="outline"
                onClick={() =>
                  onPlayAll(tracks, 0, undefined, true, {
                    queueTrackIds: trackIdsRef.current,
                    shuffle: true,
                  })
                }
              >
                <Shuffle data-icon="inline-start" />
                Aleatório
              </Button>
            </ButtonGroup>
          </CollectionHeaderActions>
        </CollectionHeader>

        <TrackTable
          tracks={filteredTracks}
          currentTrackId={currentTrackId ?? undefined}
          isPlaying={isPlaying}
          getTrackKey={(track) =>
            (track as TrackCollectionEntry).collectionRowKey ?? track.videoId
          }
          onPlay={(track) => {
            const allTracks = collectionTracks;
            const index =
              (track as TrackCollectionEntry).collectionPosition ??
              allTracks.findIndex((t) => t.videoId === track.videoId);
            if (index >= 0) {
              onPlayAll(allTracks, index, undefined, true, {
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

        {filter && filteredTracks.length === 0 && (
          <p className="py-8 text-center text-sm text-muted-foreground">
            Nenhuma música encontrada para "{filter}"
          </p>
        )}
      </div>
    </ScrollArea>
  );
}
