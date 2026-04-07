import { useState, useEffect } from "react";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Input } from "@/components/ui/input";
import { CollectionHeader } from "../shared/collection-header";
import { TrackTable } from "../shared/track-table";
import { ytGetPlaylist } from "../../services/yt-api";
import { mapPlaylistPage } from "../../services/mappers";
import { usePlayerStore } from "../../stores/player-store";
import { Play, Shuffle, Search, Loader2 } from "lucide-react";
import type { Playlist, Track, StackPage } from "../../types/music";

interface PlaylistPageProps {
  playlistId: string;
  onNavigate: (page: StackPage) => void;
  onPlayTrack: (track: Track) => void;
  onAddToQueue: (track: Track) => void;
  onPlayAll: (tracks: Track[]) => void;
}

export function PlaylistPage({
  playlistId,
  onNavigate,
  onPlayTrack,
  onAddToQueue,
  onPlayAll,
}: PlaylistPageProps) {
  const [playlist, setPlaylist] = useState<Playlist | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const currentTrack = usePlayerStore((s) => s.currentTrack);
  const isPlaying = usePlayerStore((s) => s.isPlaying);
  const [filter, setFilter] = useState("");

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    console.log("[PlaylistPage] Fetching playlist:", playlistId);

    ytGetPlaylist(playlistId)
      .then((raw) => {
        if (cancelled) return;
        const mapped = mapPlaylistPage(raw);
        console.log("[PlaylistPage] Playlist loaded:", mapped.title, "tracks:", mapped.tracks?.length);
        setPlaylist(mapped);
      })
      .catch((err) => {
        if (cancelled) return;
        const msg = err instanceof Error ? err.message : String(err);
        console.error("[PlaylistPage] Failed to fetch playlist:", msg);
        setError(msg);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => { cancelled = true; };
  }, [playlistId]);

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

  if (!playlist) return null;

  const tracks = playlist.tracks ?? [];
  const filteredTracks = filter
    ? tracks.filter((t) => {
        const q = filter.toLowerCase();
        return (
          t.title.toLowerCase().includes(q) ||
          t.artists.some((a) => a.name.toLowerCase().includes(q)) ||
          (t.album?.name.toLowerCase().includes(q) ?? false)
        );
      })
    : tracks;

  return (
    <ScrollArea className="group/page h-full">
      <div className="mx-auto max-w-screen-xl space-y-6 p-4">
        <CollectionHeader
          title={playlist.title}
          subtitle={playlist.author.name}
          description="As músicas que você marcou com 'Gostei' em todos os apps do YouTube aparecerão aqui."
          infoLines={[
            [
              playlist.trackCount !== undefined ? `${playlist.trackCount} músicas` : "",
              "Mais de 1 hora",
              "Playlist automática",
              "2026",
            ]
              .filter(Boolean)
              .join(" • "),
          ]}
          thumbnailUrl={playlist.thumbnails[0]?.url}
          actions={[
            { label: "Reproduzir", icon: Play, onClick: () => onPlayAll(tracks) },
            { label: "Aleatório", icon: Shuffle, onClick: () => onPlayAll([...tracks].sort(() => Math.random() - 0.5)) },
          ]}
          onGoToAuthor={playlist.author.id ? () => onNavigate({ type: "artist", artistId: playlist.author.id! }) : undefined}
        />

        <div className="relative">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            placeholder="Filtrar a playlist por título, artista ou álbum"
            className="pl-8"
          />
        </div>

        <TrackTable
          tracks={filteredTracks}
          currentTrackId={currentTrack?.videoId}
          isPlaying={isPlaying}
          onPlay={onPlayTrack}
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
