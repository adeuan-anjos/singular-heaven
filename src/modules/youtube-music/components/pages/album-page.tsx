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
import { ytGetAlbum } from "../../services/yt-api";
import { mapAlbumPage } from "../../services/mappers";
import {
  cacheFiniteTrackCollection,
  createTrackCollectionId,
  type TrackCollectionEntry,
} from "../../services/track-collections";
import { usePlayerStore } from "../../stores/player-store";
import { useYtActions } from "../../router/actions-context";
import { paths } from "../../router/paths";
import { Play, Shuffle, Radio, Loader2 } from "lucide-react";
import type { Album } from "../../types/music";

export function AlbumPage() {
  const params = useParams<{ id: string }>();
  const albumId = decodeURIComponent(params.id ?? "");
  const [, navigate] = useLocation();
  const { onPlayTrack, onPlayAll, onAddToQueue, onAddToPlaylist, onStartRadio } = useYtActions();
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
    <div className="flex flex-col gap-4">
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
                  onClick={() => navigate(paths.artist(album.artists[0].id!))}
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
            <Button
              variant="outline"
              onClick={() => {
                const firstTrack = tracks[0];
                if (!firstTrack?.videoId) return;
                void onStartRadio({ kind: "video", id: firstTrack.videoId });
              }}
            >
              <Radio data-icon="inline-start" />
              Iniciar rádio
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
        onGoToArtist={(id) => navigate(paths.artist(id))}
        onGoToAlbum={(id) => navigate(paths.album(id))}
        onStartRadio={(track) => onStartRadio({ kind: "video", id: track.videoId })}
      />

      {filter && filteredTracks.length === 0 && (
        <p className="py-8 text-center text-sm text-muted-foreground">
          Nenhuma música encontrada para "{filter}"
        </p>
      )}
    </div>
  );
}
