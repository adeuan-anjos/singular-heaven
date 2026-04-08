import { useState, useEffect, useRef, useCallback } from "react";
import { Input } from "@/components/ui/input";
import { CollectionHeader } from "../shared/collection-header";
import { TrackTable } from "../shared/track-table";
import { ytLoadPlaylist, ytGetPlaylistTrackIds, ytGetCachedTracks } from "../../services/yt-api";
import { usePlayerStore } from "../../stores/player-store";
import { Play, Shuffle, Search, Loader2 } from "lucide-react";
import type { Playlist, Track, StackPage } from "../../types/music";

interface PlaylistPageProps {
  playlistId: string;
  onNavigate: (page: StackPage) => void;
  onPlayTrack: (track: Track) => void;
  onAddToQueue: (track: Track) => void;
  onPlayAll: (tracks: Track[], startIndex?: number, playlistId?: string, isComplete?: boolean) => void;
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
  const trackIdsRef = useRef<string[]>([]);
  const isCompleteRef = useRef(false);
  const loadingMoreRef = useRef(false);
  const currentTrackId = usePlayerStore((s) => s.currentTrackId);
  const isPlaying = usePlayerStore((s) => s.isPlaying);
  const [filter, setFilter] = useState("");

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);

    ytLoadPlaylist(playlistId).then((data) => {
      if (cancelled) return;
      console.log("[PlaylistPage] loaded from cache", {
        title: data.title,
        tracks: data.tracks.length,
        totalIds: data.trackIds.length,
        isComplete: data.isComplete,
      });
      setPlaylist({
        playlistId: data.playlistId,
        title: data.title,
        author: data.author ?? { id: null, name: "" },
        trackCount: data.trackCount ? parseInt(data.trackCount) : undefined,
        thumbnails: data.thumbnails,
        tracks: data.tracks,
      });
      trackIdsRef.current = data.trackIds;
      isCompleteRef.current = data.isComplete;
      setLoading(false);
    }).catch((err) => {
      if (cancelled) return;
      console.error("[PlaylistPage] load error", err);
      setError(String(err));
      setLoading(false);
    });

    return () => { cancelled = true; };
  }, [playlistId]);

  const loadMore = useCallback(async () => {
    if (loadingMoreRef.current || !playlist) return;
    loadingMoreRef.current = true;
    try {
      const { trackIds: allIds } = await ytGetPlaylistTrackIds(playlistId);
      const existingIds = new Set((playlist.tracks ?? []).map((t) => t.videoId));
      const newIds = allIds.filter((id) => !existingIds.has(id)).slice(0, 100);
      if (newIds.length === 0) {
        loadingMoreRef.current = false;
        return;
      }
      const newTracks = await ytGetCachedTracks(newIds);
      console.log("[PlaylistPage] loadMore from cache", { new: newTracks.length });
      setPlaylist((prev) =>
        prev ? { ...prev, tracks: [...(prev.tracks ?? []), ...newTracks] } : prev
      );
      trackIdsRef.current = allIds;
    } catch (err) {
      console.error("[PlaylistPage] loadMore error", err);
    } finally {
      loadingMoreRef.current = false;
    }
  }, [playlist, playlistId]);

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
          { label: "Reproduzir", icon: Play, onClick: () => onPlayAll(tracks, 0, playlistId, isCompleteRef.current) },
          { label: "Aleatório", icon: Shuffle, onClick: () => {
            const shuffled = [...tracks].sort(() => Math.random() - 0.5);
            onPlayAll(shuffled, 0, playlistId, isCompleteRef.current);
          }},
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
          const index = tracks.findIndex((t) => t.videoId === track.videoId);
          if (index >= 0) {
            onPlayAll(tracks, index, playlistId, isCompleteRef.current);
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
