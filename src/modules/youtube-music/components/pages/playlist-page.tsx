import { useState, useEffect, useRef } from "react";
import { Input } from "@/components/ui/input";
import { CollectionHeader } from "../shared/collection-header";
import { TrackTable } from "../shared/track-table";
import { ytGetPlaylist, ytGetPlaylistContinuation } from "../../services/yt-api";
import { mapPlaylistPage, mapPlaylistTrack } from "../../services/mappers";
import { usePlayerStore } from "../../stores/player-store";
import { Play, Shuffle, Search, Loader2 } from "lucide-react";
import type { Playlist, Track, StackPage } from "../../types/music";

interface PlaylistPageProps {
  playlistId: string;
  onNavigate: (page: StackPage) => void;
  onPlayTrack: (track: Track) => void;
  onAddToQueue: (track: Track) => void;
  onPlayAll: (tracks: Track[], startIndex?: number, continuation?: string | null) => void;
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
  const continuationRef = useRef<string | null>(null);
  const loadingMoreRef = useRef(false);
  const currentTrackId = usePlayerStore((s) => s.currentTrackId);
  const isPlaying = usePlayerStore((s) => s.isPlaying);
  const [filter, setFilter] = useState("");

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    continuationRef.current = null;
    loadingMoreRef.current = false;
    console.log("[PlaylistPage] Fetching playlist:", playlistId);

    ytGetPlaylist(playlistId)
      .then((response) => {
        if (cancelled) return;
        const mapped = mapPlaylistPage(response.playlist);
        console.log("[PlaylistPage] Playlist loaded:", mapped.title, "tracks:", mapped.tracks?.length, "hasMore:", !!response.continuation);
        setPlaylist(mapped);
        continuationRef.current = response.continuation;
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

  const loadMore = () => {
    const token = continuationRef.current;
    if (!token || loadingMoreRef.current) {
      console.log("[PlaylistPage] loadMore skipped — token:", !!token, "loading:", loadingMoreRef.current);
      return;
    }

    loadingMoreRef.current = true;
    console.log("[PlaylistPage] Loading more tracks...");

    ytGetPlaylistContinuation(token)
      .then((response) => {
        const moreTracks = response.tracks.map(mapPlaylistTrack);
        console.log("[PlaylistPage] Loaded", moreTracks.length, "more tracks, hasMore:", !!response.continuation);
        continuationRef.current = response.continuation;
        setPlaylist((prev) => {
          if (!prev) return prev;
          const existingIds = new Set((prev.tracks ?? []).map(t => t.videoId));
          const uniqueNew = moreTracks.filter(t => !existingIds.has(t.videoId));
          return {
            ...prev,
            tracks: [...(prev.tracks ?? []), ...uniqueNew],
          };
        });
      })
      .catch((err) => {
        console.error("[PlaylistPage] Failed to load more:", err);
      })
      .finally(() => {
        loadingMoreRef.current = false;
      });
  };

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

  const headerContent = (
    <div className="space-y-6 p-4">
      <CollectionHeader
        title={playlist.title}
        subtitle={playlist.author.name}
        infoLines={[
          [
            playlist.trackCount !== undefined ? `${playlist.trackCount} músicas` : "",
          ]
            .filter(Boolean)
            .join(" • "),
        ]}
        thumbnailUrl={playlist.thumbnails[playlist.thumbnails.length - 1]?.url ?? playlist.thumbnails[0]?.url}
        actions={[
          { label: "Reproduzir", icon: Play, onClick: () => onPlayAll(tracks, 0, continuationRef.current) },
          { label: "Aleatório", icon: Shuffle, onClick: () => onPlayAll([...tracks].sort(() => Math.random() - 0.5), 0, continuationRef.current) },
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
    </div>
  );

  return (
    // flex-1 min-h-0 is correct for a flex child that must fill available height.
    // h-full works in most cases but can misresolve when the parent height comes from flex.
    <div className="flex min-h-0 flex-1 flex-col">
      <TrackTable
        tracks={filteredTracks}
        currentTrackId={currentTrackId ?? undefined}
        isPlaying={isPlaying}
        enableVirtualization
        headerContent={headerContent}
        onEndReached={loadMore}
        onPlay={(track) => {
          const tracks = playlist?.tracks ?? [];
          const index = tracks.findIndex(t => t.videoId === track.videoId);
          if (index >= 0) {
            onPlayAll(tracks, index, continuationRef.current);
          } else {
            onPlayTrack(track);
          }
        }}
        onAddToQueue={onAddToQueue}
        onGoToArtist={(id) => onNavigate({ type: "artist", artistId: id })}
        onGoToAlbum={(id) => onNavigate({ type: "album", albumId: id })}
      />

    </div>
  );
}
