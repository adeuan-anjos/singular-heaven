import { useState, useEffect } from "react";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Input } from "@/components/ui/input";
import { CollectionHeader } from "../shared/collection-header";
import { TrackTable } from "../shared/track-table";
import { ytGetAlbum } from "../../services/yt-api";
import { mapAlbumPage } from "../../services/mappers";
import { usePlayerStore } from "../../stores/player-store";
import { Play, Shuffle, Search, Loader2 } from "lucide-react";
import type { Album, Track, StackPage } from "../../types/music";

interface AlbumPageProps {
  albumId: string;
  onNavigate: (page: StackPage) => void;
  onPlayTrack: (track: Track) => void;
  onAddToQueue: (track: Track) => void;
  onPlayAll: (tracks: Track[], startIndex?: number, continuation?: string | null) => void;
}

export function AlbumPage({
  albumId,
  onNavigate,
  onPlayTrack,
  onAddToQueue,
  onPlayAll,
}: AlbumPageProps) {
  const [album, setAlbum] = useState<Album | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const currentTrackId = usePlayerStore((s) => s.currentTrackId);
  const isPlaying = usePlayerStore((s) => s.isPlaying);
  const [filter, setFilter] = useState("");

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    console.log("[AlbumPage] Fetching album:", albumId);

    ytGetAlbum(albumId)
      .then((raw) => {
        if (cancelled) return;
        const mapped = mapAlbumPage(raw);
        console.log("[AlbumPage] Album loaded:", mapped.title, "tracks:", mapped.tracks?.length);
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
  const tracks = album.tracks ?? [];
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
      <div className="mx-auto max-w-screen-xl space-y-6 p-4">
        <CollectionHeader
          title={album.title}
          subtitle={artistName}
          infoLines={[
            [album.year, `${tracks.length} músicas`].filter(Boolean).join(" • "),
          ]}
          thumbnailUrl={album.thumbnails[album.thumbnails.length - 1]?.url ?? album.thumbnails[0]?.url}
          actions={[
            { label: "Reproduzir", icon: Play, onClick: () => onPlayAll(tracks) },
            { label: "Aleatório", icon: Shuffle, onClick: () => onPlayAll([...tracks].sort(() => Math.random() - 0.5)) },
          ]}
          onGoToAuthor={album.artists[0]?.id ? () => onNavigate({ type: "artist", artistId: album.artists[0].id! }) : undefined}
        />

        <div className="relative">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            placeholder="Filtrar por título ou artista"
            className="pl-8"
          />
        </div>

        <TrackTable
          tracks={filteredTracks}
          currentTrackId={currentTrackId ?? undefined}
          isPlaying={isPlaying}
          onPlay={(track) => {
            const allTracks = album?.tracks ?? [];
            const index = allTracks.findIndex(t => t.videoId === track.videoId);
            if (index >= 0) {
              onPlayAll(allTracks, index);
            } else {
              onPlayTrack(track);
            }
          }}
          onAddToQueue={onAddToQueue}
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
