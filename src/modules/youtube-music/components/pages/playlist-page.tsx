import { useState, useEffect, useRef, useCallback } from "react";
import { Input } from "@/components/ui/input";
import { CollectionHeader } from "../shared/collection-header";
import { TrackTable } from "../shared/track-table";
import { ytLoadPlaylist, ytGetPlaylistTrackIds, ytGetPlaylistWindow } from "../../services/yt-api";
import { usePlayerStore } from "../../stores/player-store";
import { Play, Shuffle, Search, Loader2 } from "lucide-react";
import type { PlayAllOptions, Playlist, Track, StackPage } from "../../types/music";
import type { LoadPlaylistResponse, PlaylistWindowItem } from "../../services/yt-api";

const pendingPlaylistLoads = new Map<string, Promise<LoadPlaylistResponse>>();
const PLAYLIST_WINDOW_SIZE = 100;

type PlaylistTrackEntry = Track & {
  playlistPosition: number;
  playlistRowKey: string;
};

function toPlaylistTrackEntry(
  playlistId: string,
  track: Track,
  position: number
): PlaylistTrackEntry {
  return {
    ...track,
    playlistPosition: position,
    playlistRowKey: `${playlistId}:${position}`,
  };
}

function fromWindowItem(
  playlistId: string,
  item: PlaylistWindowItem
): PlaylistTrackEntry {
  return toPlaylistTrackEntry(playlistId, item, item.position);
}

function mergePlaylistTracks(
  current: PlaylistTrackEntry[],
  incoming: PlaylistTrackEntry[]
): PlaylistTrackEntry[] {
  const byPosition = new Map<number, PlaylistTrackEntry>();

  for (const track of current) {
    byPosition.set(track.playlistPosition, track);
  }

  for (const track of incoming) {
    byPosition.set(track.playlistPosition, track);
  }

  return Array.from(byPosition.entries())
    .sort((a, b) => a[0] - b[0])
    .map(([, track]) => track);
}

interface PlaylistPageProps {
  playlistId: string;
  onNavigate: (page: StackPage) => void;
  onPlayTrack: (track: Track) => void;
  onAddToQueue: (track: Track) => void;
  onPlayAll: (
    tracks: Track[],
    startIndex?: number,
    playlistId?: string,
    isComplete?: boolean,
    options?: PlayAllOptions
  ) => void;
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

  const resolvePlaybackSnapshot = useCallback(async () => {
    console.log("[PlaylistPage] resolving playback snapshot", {
      playlistId,
      loadedTracks: playlist?.tracks?.length ?? 0,
      knownTrackIds: trackIdsRef.current.length,
      knownComplete: isCompleteRef.current,
    });

    const snapshot = await ytGetPlaylistTrackIds(playlistId);
    trackIdsRef.current = snapshot.trackIds;
    isCompleteRef.current = snapshot.isComplete;

    console.log("[PlaylistPage] playback snapshot resolved", {
      playlistId,
      loadedTracks: playlist?.tracks?.length ?? 0,
      totalTrackIds: snapshot.trackIds.length,
      isComplete: snapshot.isComplete,
    });
    return snapshot;
  }, [playlist?.tracks?.length, playlistId]);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);

    let request = pendingPlaylistLoads.get(playlistId);
    if (request) {
      console.log("[PlaylistPage] reusing in-flight load", { playlistId });
    } else {
      console.log("[PlaylistPage] starting load", { playlistId });
      request = ytLoadPlaylist(playlistId).finally(() => {
        pendingPlaylistLoads.delete(playlistId);
        console.log("[PlaylistPage] load settled", { playlistId });
      });
      pendingPlaylistLoads.set(playlistId, request);
    }

    request.then((data) => {
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
        tracks: data.tracks.map((track, index) =>
          toPlaylistTrackEntry(data.playlistId, track, index)
        ),
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
      const currentTracks = (playlist.tracks as PlaylistTrackEntry[] | undefined) ?? [];
      const response = await ytGetPlaylistWindow(
        playlistId,
        currentTracks.length,
        PLAYLIST_WINDOW_SIZE
      );

      if (response.items.length === 0) {
        isCompleteRef.current = response.isComplete;
        loadingMoreRef.current = false;
        return;
      }

      const newTracks = response.items.map((item) => fromWindowItem(playlistId, item));
      console.log(
        `[PlaylistPage] loadMore window ${JSON.stringify({
          offset: response.offset,
          received: response.items.length,
          totalLoaded: response.totalLoaded,
          isComplete: response.isComplete,
          first: response.items[0]
            ? {
                position: response.items[0].position,
                videoId: response.items[0].videoId,
              }
            : null,
          last: response.items[response.items.length - 1]
            ? {
                position: response.items[response.items.length - 1].position,
                videoId: response.items[response.items.length - 1].videoId,
              }
            : null,
        })}`
      );

      setPlaylist((prev) =>
        prev
          ? {
              ...prev,
              tracks: mergePlaylistTracks(
                ((prev.tracks as PlaylistTrackEntry[] | undefined) ?? []),
                newTracks
              ),
            }
          : prev
      );
      isCompleteRef.current = response.isComplete;
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

  const tracks = ((playlist.tracks as PlaylistTrackEntry[] | undefined) ?? []);
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
          {
            label: "Reproduzir",
            icon: Play,
            onClick: async () => {
              const playback = await resolvePlaybackSnapshot();
              const currentTracks = playlist.tracks ?? [];
              console.log(
                `[PlaylistPage] play all using playback tracks ${JSON.stringify({
                  playlistId,
                  tracks: currentTracks.length,
                  queueTrackIds: playback.trackIds.length,
                  isComplete: playback.isComplete,
                })}`
              );
              onPlayAll(currentTracks, 0, playlistId, playback.isComplete, {
                queueTrackIds: playback.trackIds,
              });
            },
          },
          {
            label: "Aleatório",
            icon: Shuffle,
            onClick: async () => {
              const playback = await resolvePlaybackSnapshot();
              const currentTracks = playlist.tracks ?? [];
              console.log("[PlaylistPage] shuffle play using playback tracks", {
                playlistId,
                tracks: currentTracks.length,
                queueTrackIds: playback.trackIds.length,
                isComplete: playback.isComplete,
              });
              onPlayAll(currentTracks, 0, playlistId, playback.isComplete, {
                queueTrackIds: playback.trackIds,
                shuffle: true,
              });
            },
          },
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
        getTrackKey={(track) =>
          (track as PlaylistTrackEntry).playlistRowKey ?? track.videoId
        }
        headerContent={headerContent}
        onEndReached={loadMore}
        onPlay={(track) => {
          const currentTracks = ((playlist?.tracks as PlaylistTrackEntry[] | undefined) ?? []);
          const playlistTrack = track as PlaylistTrackEntry;
          const index =
            typeof playlistTrack.playlistPosition === "number"
              ? playlistTrack.playlistPosition
              : currentTracks.findIndex((t) => t.videoId === track.videoId);
          if (index >= 0) {
            resolvePlaybackSnapshot()
              .then((playback) => {
                console.log(
                  `[PlaylistPage] row play using playback tracks ${JSON.stringify({
                    playlistId,
                    requestedIndex: index,
                    resolvedIndex: index,
                    videoId: track.videoId,
                    isComplete: playback.isComplete,
                  })}`
                );
                onPlayAll(currentTracks, index, playlistId, playback.isComplete, {
                  queueTrackIds: playback.trackIds,
                });
              })
              .catch((error) => {
                console.error("[PlaylistPage] row playback resolution failed", error);
                onPlayAll(currentTracks, index, playlistId, isCompleteRef.current);
              });
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
