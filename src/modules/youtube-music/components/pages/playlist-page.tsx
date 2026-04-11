import { useState, useEffect, useRef, useCallback } from "react";
import { useLocation, useParams } from "wouter";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import {
  CollectionHeader,
  CollectionHeaderInfo,
  CollectionHeaderThumbnail,
  CollectionHeaderContent,
  CollectionHeaderActions,
  CollectionHeaderMenu,
} from "../shared/collection-header";
import { ButtonGroup } from "@/components/ui/button-group";
import { PlaylistDestructiveDialog } from "../shared/playlist-destructive-dialog";
import { PlaylistActionsMenu } from "../shared/playlist-actions-menu";
import { TrackTable } from "../shared/track-table";
import {
  ytLoadPlaylist,
  ytGetPlaylistTrackIds,
  ytGetPlaylistWindow,
  ytRemovePlaylistItems,
} from "../../services/yt-api";
import { usePlayerStore } from "../../stores/player-store";
import { useTrackLikeStore } from "../../stores/track-like-store";
import { usePlaylistLibraryStore } from "../../stores/playlist-library-store";
import { usePlaylistRefreshStore } from "../../stores/playlist-refresh-store";
import { useYtActions } from "../../router/actions-context";
import { paths } from "../../router/paths";
import {
  Play,
  Shuffle,
  Loader2,
  Bookmark,
} from "lucide-react";
import type { Playlist, Track } from "../../types/music";
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

export function PlaylistPage() {
  const params = useParams<{ id: string }>();
  const playlistId = decodeURIComponent(params.id ?? "");
  const [, navigate] = useLocation();
  const {
    onPlayTrack,
    onAddToQueue,
    onAddToPlaylist,
    onEditPlaylist,
    onSavePlaylist,
    onAddPlaylistNext,
    onAppendPlaylistToQueue,
    onPlaylistDeleted,
    onPlayAll,
    onStartRadio,
  } = useYtActions();
  const refreshVersion = usePlaylistRefreshStore((s) => s.versions[playlistId] ?? 0);
  const [playlist, setPlaylist] = useState<Playlist | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState("");
  const [destructiveAction, setDestructiveAction] = useState<"delete" | "remove" | null>(null);
  const [destructiveLoading, setDestructiveLoading] = useState(false);
  const trackIdsRef = useRef<string[]>([]);
  const isCompleteRef = useRef(false);
  const loadingMoreRef = useRef(false);

  const currentTrackId = usePlayerStore((s) => s.currentTrackId);
  const isPlaying = usePlayerStore((s) => s.isPlaying);
  const hydrateLikes = useTrackLikeStore((s) => s.hydrate);
  const likesHydrated = useTrackLikeStore((s) => s.hydrated);
  const likeStatuses = useTrackLikeStore((s) => s.likeStatuses);
  const hydrateLibraryPlaylists = usePlaylistLibraryStore((s) => s.hydrate);
  const isSavedPlaylist = usePlaylistLibraryStore((s) => s.isSaved);
  const toggleSavedPlaylist = usePlaylistLibraryStore((s) => s.toggleSavedPlaylist);
  const deletePlaylist = usePlaylistLibraryStore((s) => s.deletePlaylist);
  const playlistPendingMap = usePlaylistLibraryStore((s) => s.pending);

  useEffect(() => {
    if (playlistId !== "liked") return;
    void hydrateLikes(false, "liked-playlist-open");
  }, [hydrateLikes, playlistId]);

  useEffect(() => {
    void hydrateLibraryPlaylists(false, "playlist-page-open");
  }, [hydrateLibraryPlaylists]);

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

  const handleSharePlaylist = useCallback(async () => {
    const url = `https://music.youtube.com/playlist?list=${playlistId}`;
    console.log(
      `[PlaylistPage] share playlist click ${JSON.stringify({
        playlistId,
        url,
      })}`
    );
    try {
      await navigator.clipboard.writeText(url);
      toast.success("Link da playlist copiado.");
    } catch (error) {
      console.error("[PlaylistPage] share playlist failed", error);
      toast.error("Não foi possível copiar o link da playlist.");
    }
  }, [playlistId]);

  const handleAddPlaylistNextAction = useCallback(async () => {
    console.log(
      `[PlaylistPage] add playlist next click ${JSON.stringify({
        playlistId,
        loadedTracks: playlist?.tracks?.length ?? 0,
        knownTrackIds: trackIdsRef.current.length,
      })}`
    );
    try {
      const playback = await resolvePlaybackSnapshot();
      console.log(
        `[PlaylistPage] add playlist next resolved ${JSON.stringify({
          playlistId,
          queueTrackIds: playback.trackIds.length,
          isComplete: playback.isComplete,
        })}`
      );
      await onAddPlaylistNext(playlist?.tracks ?? [], playback.trackIds);
      toast.success("Playlist adicionada para tocar a seguir.");
    } catch (error) {
      console.error("[PlaylistPage] add playlist next failed", error);
      toast.error("Não foi possível adicionar a playlist a seguir.");
    }
  }, [onAddPlaylistNext, playlist?.tracks, resolvePlaybackSnapshot]);

  const handleShufflePlayAction = useCallback(async () => {
    console.log(
      `[PlaylistPage] shuffle play click ${JSON.stringify({
        playlistId,
        loadedTracks: playlist?.tracks?.length ?? 0,
        knownTrackIds: trackIdsRef.current.length,
      })}`
    );
    try {
      const playback = await resolvePlaybackSnapshot();
      onPlayAll(playlist?.tracks ?? [], 0, playlistId, playback.isComplete, {
        queueTrackIds: playback.trackIds,
        shuffle: true,
      });
    } catch (error) {
      console.error("[PlaylistPage] shuffle play failed", error);
      toast.error("Não foi possível iniciar a playlist no aleatório.");
    }
  }, [onPlayAll, playlist?.tracks, playlistId, resolvePlaybackSnapshot]);

  const handleAppendPlaylistToQueueAction = useCallback(async () => {
    console.log(
      `[PlaylistPage] append playlist click ${JSON.stringify({
        playlistId,
        loadedTracks: playlist?.tracks?.length ?? 0,
        knownTrackIds: trackIdsRef.current.length,
      })}`
    );
    try {
      const playback = await resolvePlaybackSnapshot();
      console.log(
        `[PlaylistPage] append playlist resolved ${JSON.stringify({
          playlistId,
          queueTrackIds: playback.trackIds.length,
          isComplete: playback.isComplete,
        })}`
      );
      await onAppendPlaylistToQueue(playlist?.tracks ?? [], playback.trackIds);
      toast.success("Playlist adicionada ao fim da fila.");
    } catch (error) {
      console.error("[PlaylistPage] append playlist to queue failed", error);
      toast.error("Não foi possível adicionar a playlist à fila.");
    }
  }, [onAppendPlaylistToQueue, playlist?.tracks, resolvePlaybackSnapshot]);

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

    request
      .then((data) => {
        if (cancelled) return;
        console.log("[PlaylistPage] loaded from cache", {
          title: data.title,
          tracks: data.tracks.length,
          totalIds: data.trackIds.length,
          isComplete: data.isComplete,
          isOwnedByUser: data.isOwnedByUser,
          isEditable: data.isEditable,
          isSpecial: data.isSpecial,
        });
        setPlaylist({
          playlistId: data.playlistId,
          title: data.title,
          author: data.author ?? { id: null, name: "" },
          description: data.description,
          privacyStatus: data.privacyStatus,
          trackCount: data.trackCount ? parseInt(data.trackCount, 10) : undefined,
          thumbnails: data.thumbnails,
          isOwnedByUser: data.isOwnedByUser,
          isEditable: data.isEditable,
          isSpecial: data.isSpecial,
          tracks: data.tracks.map((track, index) =>
            toPlaylistTrackEntry(data.playlistId, track, index)
          ),
        });
        trackIdsRef.current = data.trackIds;
        isCompleteRef.current = data.isComplete;
        setLoading(false);
      })
      .catch((err) => {
        if (cancelled) return;
        console.error("[PlaylistPage] load error", err);
        setError(String(err));
        setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [playlistId, refreshVersion]);

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
        return;
      }

      const newTracks = response.items.map((item) => fromWindowItem(playlistId, item));
      console.log(
        `[PlaylistPage] loadMore window ${JSON.stringify({
          offset: response.offset,
          received: response.items.length,
          totalLoaded: response.totalLoaded,
          isComplete: response.isComplete,
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
  const tracksInView =
    playlistId === "liked" && likesHydrated
      ? tracks.filter(
          (track) =>
            (likeStatuses[track.videoId] ?? track.likeStatus ?? "INDIFFERENT") === "LIKE"
        )
      : tracks;
  if (playlistId === "liked") {
    console.log(
      `[PlaylistPage] liked filter applied ${JSON.stringify({
        likesHydrated,
        totalTracks: tracks.length,
        visibleTracks: tracksInView.length,
      })}`
    );
  }

  const filteredTracks = filter
    ? tracksInView.filter((t) => {
        const q = filter.toLowerCase();
        return (
          t.title.toLowerCase().includes(q) ||
          t.artists.some((a) => a.name.toLowerCase().includes(q)) ||
          (t.album?.name.toLowerCase().includes(q) ?? false)
        );
      })
    : tracksInView;

  const saved = isSavedPlaylist(playlistId);
  const playlistPending = Boolean(playlistPendingMap[playlistId]);
  const hasTracksAvailable = trackIdsRef.current.length > 0 || tracks.length > 0;
  const destructiveLabel = playlist.isOwnedByUser
    ? "Excluir playlist"
    : saved
      ? "Remover playlist"
      : null;

  const playlistMenuContent = playlist.isSpecial ? undefined : (
    <PlaylistActionsMenu
      kind="dropdown"
      showEdit={Boolean(playlist.isOwnedByUser && playlist.isEditable)}
      showShuffle={hasTracksAvailable}
      showPlayNext
      showAppendQueue
      showStartRadio={hasTracksAvailable}
      showSavePlaylist
      showShare
      destructiveLabel={destructiveLabel}
      disableEdit={playlistPending}
      disableShuffle={!hasTracksAvailable}
      disablePlayNext={!hasTracksAvailable}
      disableAppendQueue={!hasTracksAvailable}
      disableStartRadio={!hasTracksAvailable}
      disableDestructive={playlistPending}
      onEdit={
        onEditPlaylist ? () => onEditPlaylist(playlist) : undefined
      }
      onShufflePlay={() => void handleShufflePlayAction()}
      onPlayNext={() => void handleAddPlaylistNextAction()}
      onAppendQueue={() => void handleAppendPlaylistToQueueAction()}
      onStartRadio={() => void onStartRadio({ kind: "playlist", id: playlist.playlistId })}
      onSavePlaylist={() => onSavePlaylist(playlistId, playlist.title)}
      onShare={() => void handleSharePlaylist()}
      onDestructive={() =>
        setDestructiveAction(playlist.isOwnedByUser ? "delete" : "remove")
      }
    />
  );

  const headerContent = (
    <div className="space-y-4 p-4">
      <CollectionHeader
        filterValue={filter}
        onFilterChange={(e) => setFilter(e.target.value)}
        filterPlaceholder="Filtrar a playlist por título, artista ou álbum"
      >
        <CollectionHeaderInfo>
          <CollectionHeaderThumbnail
            src={
              playlist.thumbnails[playlist.thumbnails.length - 1]?.url ??
              playlist.thumbnails[0]?.url
            }
            alt={playlist.title}
            fallback={playlist.title.charAt(0)}
          />
          <CollectionHeaderContent>
            <h1 className="text-4xl font-bold text-foreground">{playlist.title}</h1>
            {playlist.author.name && (
              <p className="text-sm text-muted-foreground">
                {playlist.author.id ? (
                  <button
                    type="button"
                    className="hover:underline"
                    onClick={() => navigate(paths.artist(playlist.author.id!))}
                  >
                    {playlist.author.name}
                  </button>
                ) : (
                  <span>{playlist.author.name}</span>
                )}
              </p>
            )}
            {playlist.trackCount !== undefined && (
              <p className="text-sm text-muted-foreground">{playlist.trackCount} músicas</p>
            )}
            {playlist.description && (
              <p className="line-clamp-2 text-sm text-muted-foreground/70">{playlist.description}</p>
            )}
          </CollectionHeaderContent>
        </CollectionHeaderInfo>
        <CollectionHeaderActions>
          <ButtonGroup>
            <Button
              variant="outline"
              onClick={async () => {
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
              }}
            >
              <Play data-icon="inline-start" />
              Reproduzir
            </Button>
            <Button
              variant="outline"
              onClick={async () => {
                const playback = await resolvePlaybackSnapshot();
                const currentTracks = playlist.tracks ?? [];
                console.log(
                  `[PlaylistPage] shuffle play using playback tracks ${JSON.stringify({
                    playlistId,
                    tracks: currentTracks.length,
                    queueTrackIds: playback.trackIds.length,
                    isComplete: playback.isComplete,
                  })}`
                );
                onPlayAll(currentTracks, 0, playlistId, playback.isComplete, {
                  queueTrackIds: playback.trackIds,
                  shuffle: true,
                });
              }}
            >
              <Shuffle data-icon="inline-start" />
              Aleatório
            </Button>
          </ButtonGroup>
          <ButtonGroup>
            {!playlist.isSpecial && !playlist.isOwnedByUser && (
              <Button
                variant="outline"
                size="icon"
                onClick={() => void toggleSavedPlaylist(playlist)}
                disabled={playlistPending}
              >
                <Bookmark className={saved ? "fill-current" : ""} />
              </Button>
            )}
            {playlistMenuContent && (
              <CollectionHeaderMenu contentClassName="w-56">
                {playlistMenuContent}
              </CollectionHeaderMenu>
            )}
          </ButtonGroup>
        </CollectionHeaderActions>
      </CollectionHeader>
    </div>
  );

  const destructiveTitle =
    destructiveAction === "delete" ? "Excluir playlist" : "Remover playlist";
  const destructiveDescription =
    destructiveAction === "delete"
      ? "Quer mesmo excluir esta playlist? Essa ação remove a playlist da sua conta."
      : "Quer mesmo remover esta playlist da biblioteca?";
  const emptyMessage = filter
    ? `Nenhuma música encontrada para "${filter}".`
    : "Esta playlist ainda não tem músicas.";

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      {filteredTracks.length > 0 ? (
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
            const currentTracks = ((playlist.tracks as PlaylistTrackEntry[] | undefined) ?? []);
            const playlistTrack = track as PlaylistTrackEntry;
            const index =
              typeof playlistTrack.playlistPosition === "number"
                ? playlistTrack.playlistPosition
                : currentTracks.findIndex((candidate) => candidate.videoId === track.videoId);
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
          onAddToPlaylist={onAddToPlaylist}
          onRemoveFromPlaylist={
            playlist.isEditable
              ? async (track) => {
                  if (!track.setVideoId) return;
                  console.log(
                    `[PlaylistPage] remove from playlist ${JSON.stringify({
                      playlistId,
                      videoId: track.videoId,
                      setVideoId: track.setVideoId,
                    })}`
                  );
                  await ytRemovePlaylistItems(playlistId, [
                    {
                      videoId: track.videoId,
                      setVideoId: track.setVideoId,
                    },
                  ]);

                  const targetPosition = (track as PlaylistTrackEntry).playlistPosition;
                  setPlaylist((prev) => {
                    if (!prev?.tracks) return prev;
                    const nextTracks = (prev.tracks as PlaylistTrackEntry[])
                      .filter((candidate) => candidate.playlistPosition !== targetPosition)
                      .map((candidate, position) => ({
                        ...candidate,
                        playlistPosition: position,
                        playlistRowKey: `${playlistId}:${position}`,
                      }));
                    return {
                      ...prev,
                      trackCount: nextTracks.length,
                      tracks: nextTracks,
                    };
                  });
                  trackIdsRef.current = trackIdsRef.current.filter(
                    (_candidateId, index) => index !== targetPosition
                  );
                }
              : undefined
          }
          onGoToArtist={(id) => navigate(paths.artist(id))}
          onGoToAlbum={(id) => navigate(paths.album(id))}
        />
      ) : (
        <div className="flex min-h-0 flex-1 flex-col overflow-y-auto">
          {headerContent}
          <div className="flex flex-1 items-center justify-center px-4 py-12">
            <p className="text-sm text-muted-foreground">{emptyMessage}</p>
          </div>
        </div>
      )}

      <PlaylistDestructiveDialog
        open={destructiveAction !== null}
        onOpenChange={(open) => {
          if (!open) setDestructiveAction(null);
        }}
        title={destructiveTitle}
        description={destructiveDescription}
        confirmLabel={
          destructiveAction === "delete" ? "Excluir playlist" : "Remover playlist"
        }
        loading={destructiveLoading}
        onConfirm={async () => {
          if (!destructiveAction) return;
          setDestructiveLoading(true);
          try {
            if (destructiveAction === "delete") {
              await deletePlaylist(playlistId);
              onPlaylistDeleted?.(playlistId);
            } else {
              await toggleSavedPlaylist(playlist);
            }
            setDestructiveAction(null);
          } finally {
            setDestructiveLoading(false);
          }
        }}
      />
    </div>
  );
}
