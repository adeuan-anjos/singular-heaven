import { useState, useEffect, useRef, useCallback } from "react";
import { createPortal } from "react-dom";
import { useLocation, useRoute } from "wouter";
import { useVirtualizer } from "@tanstack/react-virtual";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuTrigger,
} from "@/components/ui/context-menu";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { toast } from "sonner";
import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupAction,
  SidebarGroupHeader,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
} from "@/components/ui/sidebar";
import {
  Home,
  Compass,
  Library,
  Loader2,
  Plus,
  Ellipsis,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { usePlaylistLibraryStore } from "../../stores/playlist-library-store";
import { thumbUrl } from "../../utils/thumb-url";
import { CreatePlaylistDialog } from "../shared/create-playlist-dialog";
import { PlaylistActionsMenu } from "../shared/playlist-actions-menu";
import { PlaylistDestructiveDialog } from "../shared/playlist-destructive-dialog";
import { ytGetPlaylistTrackIds, ytLoadPlaylist } from "../../services/yt-api";
import { paths } from "../../router/paths";
import type { PlayAllOptions, Playlist, Track } from "../../types/music";

interface SidePanelProps {
  onEditPlaylist?: (playlist: Playlist) => void;
  onPlayAll: (
    tracks: Track[],
    startIndex?: number,
    playlistId?: string,
    isComplete?: boolean,
    options?: PlayAllOptions
  ) => void;
  onSavePlaylist: (playlistId: string, title: string) => void;
  onAddPlaylistNext: (tracks: Track[], queueTrackIds: string[]) => Promise<void>;
  onAppendPlaylistToQueue: (tracks: Track[], queueTrackIds: string[]) => Promise<void>;
  onPlaylistDeleted?: (playlistId: string) => void;
}

const NAV_ITEMS = [
  { key: "home", label: "Início", icon: Home, path: paths.home },
  { key: "explore", label: "Explorar", icon: Compass, path: paths.explore },
  { key: "library", label: "Biblioteca", icon: Library, path: paths.library },
] as const;

const PLAYLIST_ROW_HEIGHT = 48;

type PlaylistHighlightRect = {
  top: number;
  left: number;
  width: number;
  height: number;
};

function PlaylistThumbnail({ playlist }: { playlist: Playlist }) {
  const rawThumbUrl = playlist.thumbnails[0]?.url;
  const initials = playlist.title.slice(0, 2).toUpperCase();

  return (
    <div className="flex size-9 shrink-0 items-center justify-center overflow-hidden rounded-md bg-muted">
      {rawThumbUrl ? (
        <img
          src={thumbUrl(rawThumbUrl, 72)}
          alt={playlist.title}
          className="h-full w-full object-cover"
          loading="lazy"
          decoding="async"
        />
      ) : (
        <span className="text-xs text-muted-foreground">{initials}</span>
      )}
    </div>
  );
}

function buildPlaylistShareUrl(playlistId: string) {
  return `https://music.youtube.com/playlist?list=${playlistId}`;
}

function clearPlaylistHighlight(
  setHighlightedPlaylistId: React.Dispatch<React.SetStateAction<string | null>>,
  setHighlightRect: React.Dispatch<React.SetStateAction<PlaylistHighlightRect | null>>
) {
  setHighlightedPlaylistId(null);
  setHighlightRect(null);
}

function SidebarPlaylistRow({
  playlist,
  isPending,
  onClick,
  active = false,
  highlighted = false,
  trailingAction,
  menuAnchor,
}: {
  playlist: Playlist;
  isPending: boolean;
  onClick?: () => void;
  active?: boolean;
  highlighted?: boolean;
  trailingAction?: React.ReactNode;
  menuAnchor?: React.ReactNode;
}) {
  return (
    <div
      className={cn(
        "group/sidebar-playlist-row relative h-full",
        highlighted &&
          "rounded-lg bg-background/95 shadow-lg ring-1 ring-border/60 backdrop-blur-sm"
      )}
    >
      {menuAnchor}
      <SidebarMenuButton
        onClick={onClick}
        active={active}
        tone="playlist"
        size="playlist"
        className={cn(
          "h-full",
          highlighted && "w-max min-w-full",
          trailingAction ? "pr-10" : highlighted ? "pr-3" : ""
        )}
        disabled={isPending}
      >
        <PlaylistThumbnail playlist={playlist} />
        <div className="min-w-0 flex-1">
          <p
            className={cn(
              "text-sm font-medium leading-tight",
              highlighted ? "whitespace-nowrap" : "truncate"
            )}
          >
            {playlist.title}
          </p>
        </div>
      </SidebarMenuButton>
      {trailingAction ? (
        <div className="absolute top-1/2 right-1 -translate-y-1/2">
          {trailingAction}
        </div>
      ) : null}
    </div>
  );
}

function PlaylistActionMenuContent({
  kind,
  playlist,
  isPending,
  onEdit,
  onShufflePlay,
  onPlayNext,
  onAppendQueue,
  onSavePlaylist,
  onShare,
  onDestructive,
}: {
  kind: "dropdown" | "context";
  playlist: Playlist;
  isPending: boolean;
  onEdit?: () => void;
  onShufflePlay: () => void;
  onPlayNext: () => void;
  onAppendQueue: () => void;
  onSavePlaylist: () => void;
  onShare: () => void;
  onDestructive: () => void;
}) {
  return (
    <PlaylistActionsMenu
      kind={kind}
      showEdit={Boolean(onEdit && playlist.isOwnedByUser && playlist.isEditable)}
      showShuffle
      showPlayNext
      showAppendQueue
      showSavePlaylist
      showShare
      destructiveLabel={
        playlist.isOwnedByUser ? "Excluir playlist" : "Remover playlist"
      }
      disableEdit={isPending}
      disableDestructive={isPending}
      onEdit={onEdit}
      onShufflePlay={onShufflePlay}
      onPlayNext={onPlayNext}
      onAppendQueue={onAppendQueue}
      onSavePlaylist={onSavePlaylist}
      onShare={onShare}
      onDestructive={onDestructive}
    />
  );
}

function SidebarPlaylistOverflowButton({
  playlist,
  disabled,
  open,
  onOpenChange,
  anchor,
  children,
}: {
  playlist: Playlist;
  disabled: boolean;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  anchor: HTMLElement | null;
  children: React.ReactNode;
}) {
  return (
    <DropdownMenu open={open} onOpenChange={onOpenChange}>
      <DropdownMenuTrigger
        render={
          <Button
            variant="ghost"
            size="icon-sm"
            className="opacity-0 group-hover/sidebar-playlist-row:opacity-100 focus-visible:opacity-100 aria-expanded:opacity-100"
            disabled={disabled}
            aria-label={`Ações da playlist ${playlist.title}`}
            aria-expanded={open}
          />
        }
        onClick={(event) => {
          event.preventDefault();
          event.stopPropagation();
          console.log(
            `[SidePanel] overflow button click ${JSON.stringify({
              playlistId: playlist.playlistId,
              title: playlist.title,
              openBefore: open,
            })}`
          );
        }}
      >
        <Ellipsis className="h-4 w-4" />
      </DropdownMenuTrigger>
      <DropdownMenuContent
        anchor={anchor}
        align="start"
        side="bottom"
        sideOffset={8}
        className="w-56"
      >
        {children}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function SidebarPlaylistMenuAnchor({
  playlist,
  isPending,
  active,
  triggerRefCallback,
  onSelect,
  onHighlightOpen,
  onHighlightClose,
  onEdit,
  onShufflePlay,
  onPlayNext,
  onAppendQueue,
  onSavePlaylist,
  onShare,
  onDestructive,
}: {
  playlist: Playlist;
  isPending: boolean;
  active: boolean;
  triggerRefCallback: (node: HTMLDivElement | null) => void;
  onSelect: () => void;
  onHighlightOpen: () => void;
  onHighlightClose: () => void;
  onEdit?: () => void;
  onShufflePlay: () => void;
  onPlayNext: () => void;
  onAppendQueue: () => void;
  onSavePlaylist: () => void;
  onShare: () => void;
  onDestructive: () => void;
}) {
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const rowRef = useRef<HTMLDivElement | null>(null);

  const setRowRef = useCallback(
    (node: HTMLDivElement | null) => {
      rowRef.current = node;
      triggerRefCallback(node);
    },
    [triggerRefCallback]
  );

  const handleDropdownOpenChange = useCallback(
    (open: boolean) => {
      console.log(
        `[SidePanel] dropdown menu open ${JSON.stringify({
          playlistId: playlist.playlistId,
          title: playlist.title,
          open,
        })}`
      );
      setDropdownOpen(open);
      if (open) {
        onHighlightOpen();
      } else {
        onHighlightClose();
      }
    },
    [onHighlightClose, onHighlightOpen, playlist.playlistId, playlist.title]
  );

  const handleContextOpenChange = useCallback(
    (open: boolean) => {
      console.log(
        `[SidePanel] context menu open ${JSON.stringify({
          playlistId: playlist.playlistId,
          title: playlist.title,
          open,
        })}`
      );
      if (open) {
        setDropdownOpen(false);
        onHighlightOpen();
      } else {
        onHighlightClose();
      }
    },
    [onHighlightClose, onHighlightOpen, playlist.playlistId, playlist.title]
  );

  const playlistActions = (
    <PlaylistActionMenuContent
      kind="dropdown"
      playlist={playlist}
      isPending={isPending}
      onEdit={onEdit}
      onShufflePlay={onShufflePlay}
      onPlayNext={onPlayNext}
      onAppendQueue={onAppendQueue}
      onSavePlaylist={onSavePlaylist}
      onShare={onShare}
      onDestructive={onDestructive}
    />
  );

  return (
    <ContextMenu onOpenChange={handleContextOpenChange}>
      <ContextMenuTrigger ref={setRowRef} className="block h-full">
        <SidebarPlaylistRow
          playlist={playlist}
          isPending={isPending}
          active={active}
          onClick={onSelect}
          trailingAction={
            !playlist.isSpecial ? (
              <SidebarPlaylistOverflowButton
                playlist={playlist}
                disabled={isPending}
                open={dropdownOpen}
                onOpenChange={handleDropdownOpenChange}
                anchor={rowRef.current}
              >
                {playlistActions}
              </SidebarPlaylistOverflowButton>
            ) : undefined
          }
        />
      </ContextMenuTrigger>
      {!playlist.isSpecial ? (
        <ContextMenuContent className="w-56">
          <PlaylistActionMenuContent
            kind="context"
            playlist={playlist}
            isPending={isPending}
            onEdit={onEdit}
            onShufflePlay={onShufflePlay}
            onPlayNext={onPlayNext}
            onAppendQueue={onAppendQueue}
            onSavePlaylist={onSavePlaylist}
            onShare={onShare}
            onDestructive={onDestructive}
          />
        </ContextMenuContent>
      ) : null}
    </ContextMenu>
  );
}

export function SidePanel({
  onEditPlaylist,
  onPlayAll,
  onSavePlaylist,
  onAddPlaylistNext,
  onAppendPlaylistToQueue,
  onPlaylistDeleted,
}: SidePanelProps) {
  const [, navigate] = useLocation();
  const [isHomeRoute] = useRoute(paths.home);
  const [isExploreRoute] = useRoute(paths.explore);
  const [isLibraryRoute] = useRoute(paths.library);
  const [isPlaylistRoute, playlistRouteParams] = useRoute<{ id: string }>("/playlist/:id");
  const activePlaylistId = isPlaylistRoute && playlistRouteParams
    ? decodeURIComponent(playlistRouteParams.id)
    : null;
  const routeMatchesByKey: Record<string, boolean> = {
    home: isHomeRoute,
    explore: isExploreRoute,
    library: isLibraryRoute,
  };
  const playlists = usePlaylistLibraryStore((s) => s.sidebarPlaylists);
  const hydrate = usePlaylistLibraryStore((s) => s.hydrateSidebar);
  const hydrated = usePlaylistLibraryStore((s) => s.sidebarHydrated);
  const hydrating = usePlaylistLibraryStore((s) => s.sidebarHydrating);
  const toggleSavedPlaylist = usePlaylistLibraryStore((s) => s.toggleSavedPlaylist);
  const deletePlaylist = usePlaylistLibraryStore((s) => s.deletePlaylist);
  const pending = usePlaylistLibraryStore((s) => s.pending);

  const [createDialogOpen, setCreateDialogOpen] = useState(false);
  const [targetPlaylist, setTargetPlaylist] = useState<Playlist | null>(null);
  const [highlightedPlaylistId, setHighlightedPlaylistId] = useState<string | null>(null);
  const [highlightRect, setHighlightRect] = useState<PlaylistHighlightRect | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const triggerRefs = useRef(new Map<string, HTMLDivElement | null>());
  const lastVisibleRangeRef = useRef<string>("");
  const lastSidebarStateRef = useRef<string>("");

  const resolvePlaylistPlayback = useCallback(async (playlist: Playlist) => {
    console.log(
      `[SidePanel] resolve playlist playback ${JSON.stringify({
        playlistId: playlist.playlistId,
        title: playlist.title,
      })}`
    );
    const [loaded, playback] = await Promise.all([
      ytLoadPlaylist(playlist.playlistId),
      ytGetPlaylistTrackIds(playlist.playlistId),
    ]);
    console.log(
      `[SidePanel] resolve playlist playback done ${JSON.stringify({
        playlistId: playlist.playlistId,
        loadedTracks: loaded.tracks.length,
        queueTrackIds: playback.trackIds.length,
        isComplete: playback.isComplete,
      })}`
    );
    return {
      tracks: loaded.tracks,
      queueTrackIds: playback.trackIds,
      isComplete: playback.isComplete,
    };
  }, []);

  const syncHighlightForPlaylist = useCallback((playlistId: string) => {
    const element = triggerRefs.current.get(playlistId);
    if (!element) {
      clearPlaylistHighlight(setHighlightedPlaylistId, setHighlightRect);
      return;
    }

    const rect = element.getBoundingClientRect();
    setHighlightedPlaylistId(playlistId);
    setHighlightRect({
      top: rect.top,
      left: rect.left,
      width: rect.width,
      height: rect.height,
    });
  }, []);

  useEffect(() => {
    if (!highlightedPlaylistId) return;

    const sync = () => {
      syncHighlightForPlaylist(highlightedPlaylistId);
    };

    sync();
    window.addEventListener("resize", sync);
    const scrollElement = scrollRef.current;
    scrollElement?.addEventListener("scroll", sync, { passive: true });

    return () => {
      window.removeEventListener("resize", sync);
      scrollElement?.removeEventListener("scroll", sync);
    };
  }, [highlightedPlaylistId, syncHighlightForPlaylist]);

  useEffect(() => {
    void hydrate(false, "sidebar-open");
  }, [hydrate]);

  const virtualizer = useVirtualizer({
    count: playlists.length,
    getScrollElement: () => scrollRef.current,
    estimateSize: () => PLAYLIST_ROW_HEIGHT,
    overscan: 8,
    useFlushSync: false,
  });

  const virtualItems = virtualizer.getVirtualItems();
  const visibleStart = virtualItems[0]?.index ?? -1;
  const visibleEnd = virtualItems[virtualItems.length - 1]?.index ?? -1;

  useEffect(() => {
    const snapshot = JSON.stringify({
      hydrated,
      hydrating,
      playlistCount: playlists.length,
    });
    if (lastSidebarStateRef.current === snapshot) return;
    lastSidebarStateRef.current = snapshot;
    console.log(`[SidePanel] state ${snapshot}`);
  }, [hydrated, hydrating, playlists.length]);

  useEffect(() => {
    const snapshot = JSON.stringify({
      visibleStart,
      visibleEnd,
      rendered: virtualItems.length,
      total: playlists.length,
    });
    if (lastVisibleRangeRef.current === snapshot) return;
    lastVisibleRangeRef.current = snapshot;
    console.log(`[SidePanel] virtual range ${snapshot}`);
  }, [playlists.length, visibleEnd, visibleStart, virtualItems.length]);

  const handlePlaylistShufflePlay = useCallback(
    (playlist: Playlist) => {
      console.log(
        `[SidePanel] playlist action ${JSON.stringify({
          playlistId: playlist.playlistId,
          title: playlist.title,
          action: "shuffle-play",
        })}`
      );
      void resolvePlaylistPlayback(playlist)
        .then((playback) => {
          onPlayAll(playback.tracks, 0, playlist.playlistId, playback.isComplete, {
            queueTrackIds: playback.queueTrackIds,
            shuffle: true,
          });
        })
        .catch((error) => {
          console.error("[SidePanel] shuffle play failed", error);
          toast.error("Não foi possível iniciar a playlist no aleatório.");
        });
    },
    [onPlayAll, resolvePlaylistPlayback]
  );

  const handlePlaylistPlayNext = useCallback(
    (playlist: Playlist) => {
      console.log(
        `[SidePanel] playlist action ${JSON.stringify({
          playlistId: playlist.playlistId,
          title: playlist.title,
          action: "play-next",
        })}`
      );
      void resolvePlaylistPlayback(playlist)
        .then((playback) =>
          onAddPlaylistNext(playback.tracks, playback.queueTrackIds)
        )
        .then(() => {
          toast.success("Playlist adicionada para tocar a seguir.");
        })
        .catch((error) => {
          console.error("[SidePanel] add playlist next failed", error);
          toast.error("Não foi possível adicionar a playlist a seguir.");
        });
    },
    [onAddPlaylistNext, resolvePlaylistPlayback]
  );

  const handlePlaylistAppendQueue = useCallback(
    (playlist: Playlist) => {
      console.log(
        `[SidePanel] playlist action ${JSON.stringify({
          playlistId: playlist.playlistId,
          title: playlist.title,
          action: "append-queue",
        })}`
      );
      void resolvePlaylistPlayback(playlist)
        .then((playback) =>
          onAppendPlaylistToQueue(playback.tracks, playback.queueTrackIds)
        )
        .then(() => {
          toast.success("Playlist adicionada ao fim da fila.");
        })
        .catch((error) => {
          console.error("[SidePanel] append playlist to queue failed", error);
          toast.error("Não foi possível adicionar a playlist à fila.");
        });
    },
    [onAppendPlaylistToQueue, resolvePlaylistPlayback]
  );

  const handlePlaylistSave = useCallback(
    (playlist: Playlist) => {
      console.log(
        `[SidePanel] playlist action ${JSON.stringify({
          playlistId: playlist.playlistId,
          title: playlist.title,
          action: "save-playlist",
        })}`
      );
      onSavePlaylist(playlist.playlistId, playlist.title);
    },
    [onSavePlaylist]
  );

  const handlePlaylistShare = useCallback((playlist: Playlist) => {
    const url = buildPlaylistShareUrl(playlist.playlistId);
    console.log(
      `[SidePanel] playlist action ${JSON.stringify({
        playlistId: playlist.playlistId,
        title: playlist.title,
        action: "share",
        url,
      })}`
    );
    void navigator.clipboard
      .writeText(url)
      .then(() => {
        toast.success("Link da playlist copiado.");
      })
      .catch((error) => {
        console.error("[SidePanel] share playlist failed", error);
        toast.error("Não foi possível copiar o link da playlist.");
      });
  }, []);

  const handlePlaylistDestructive = useCallback((playlist: Playlist) => {
    console.log(
      `[SidePanel] playlist action ${JSON.stringify({
        playlistId: playlist.playlistId,
        title: playlist.title,
        action: playlist.isOwnedByUser ? "delete" : "remove",
      })}`
    );
    setTargetPlaylist(playlist);
  }, []);

  const highlightedPlaylist =
    highlightedPlaylistId != null
      ? playlists.find((playlist) => playlist.playlistId === highlightedPlaylistId) ?? null
      : null;
  const highlightedPlaylistPending = highlightedPlaylist
    ? Boolean(pending[highlightedPlaylist.playlistId])
    : false;

  return (
    <>
      <Sidebar>
        <SidebarHeader>
          <SidebarMenu>
            {NAV_ITEMS.map(({ key, label, icon: Icon, path }) => {
              const isActive = routeMatchesByKey[key] ?? false;

              return (
                <SidebarMenuItem key={key}>
                  <SidebarMenuButton
                    onClick={() => {
                      console.log(
                        `[SidePanel] nav click ${JSON.stringify({ key, path })}`
                      );
                      navigate(path);
                    }}
                    active={isActive}
                    tone="nav"
                    size="default"
                  >
                    <Icon className="h-5 w-5 shrink-0" />
                    {label}
                  </SidebarMenuButton>
                </SidebarMenuItem>
              );
            })}
          </SidebarMenu>
        </SidebarHeader>

        <Separator className="my-2" />

        <SidebarContent>
          <SidebarGroup>
            <SidebarGroupHeader>
              <SidebarGroupLabel>Todas as playlists</SidebarGroupLabel>
              <SidebarGroupAction
                onClick={() => {
                  console.log("[SidePanel] create playlist click");
                  setCreateDialogOpen(true);
                }}
                aria-label="Nova playlist"
              >
                <Plus className="h-4 w-4" />
              </SidebarGroupAction>
            </SidebarGroupHeader>

            {!hydrated && hydrating ? (
              <div className="flex flex-1 items-center justify-center px-2 pb-4">
                <Loader2 className="size-4 animate-spin text-muted-foreground" />
              </div>
            ) : (
              <div
                ref={scrollRef}
                className="styled-scrollbar min-h-0 flex-1 overflow-y-auto px-2 pb-4"
              >
                <SidebarMenu
                  style={{ height: virtualizer.getTotalSize(), position: "relative" }}
                >
                  {virtualItems.map((vItem) => {
                    const playlist = playlists[vItem.index];
                    const isPending = Boolean(pending[playlist.playlistId]);

                    return (
                      <SidebarMenuItem
                        key={playlist.playlistId}
                        style={{
                          position: "absolute",
                          top: 0,
                          left: 0,
                          width: "100%",
                          height: vItem.size,
                          transform: `translateY(${vItem.start}px)`,
                        }}
                      >
                        <SidebarPlaylistMenuAnchor
                          playlist={playlist}
                          isPending={isPending}
                          active={activePlaylistId === playlist.playlistId}
                          triggerRefCallback={(node) => {
                            if (node) {
                              triggerRefs.current.set(playlist.playlistId, node);
                            } else {
                              triggerRefs.current.delete(playlist.playlistId);
                            }
                          }}
                          onSelect={() => {
                            console.log(
                              `[SidePanel] playlist click ${JSON.stringify({
                                playlistId: playlist.playlistId,
                                title: playlist.title,
                                index: vItem.index,
                              })}`
                            );
                            navigate(paths.playlist(playlist.playlistId));
                          }}
                          onHighlightOpen={() =>
                            syncHighlightForPlaylist(playlist.playlistId)
                          }
                          onHighlightClose={() =>
                            clearPlaylistHighlight(
                              setHighlightedPlaylistId,
                              setHighlightRect
                            )
                          }
                          onEdit={
                            onEditPlaylist
                              ? () => onEditPlaylist(playlist)
                              : undefined
                          }
                          onShufflePlay={() => handlePlaylistShufflePlay(playlist)}
                          onPlayNext={() => handlePlaylistPlayNext(playlist)}
                          onAppendQueue={() =>
                            handlePlaylistAppendQueue(playlist)
                          }
                          onSavePlaylist={() => handlePlaylistSave(playlist)}
                          onShare={() => handlePlaylistShare(playlist)}
                          onDestructive={() =>
                            handlePlaylistDestructive(playlist)
                          }
                        />
                      </SidebarMenuItem>
                    );
                  })}
                </SidebarMenu>
              </div>
            )}
          </SidebarGroup>
        </SidebarContent>
      </Sidebar>

      <CreatePlaylistDialog
        open={createDialogOpen}
        onOpenChange={setCreateDialogOpen}
        onCreated={(playlistId) => {
          if (playlistId) {
            navigate(paths.playlist(playlistId));
          }
        }}
      />

      <PlaylistDestructiveDialog
        open={targetPlaylist !== null}
        onOpenChange={(open) => {
          if (!open) setTargetPlaylist(null);
        }}
        title={targetPlaylist?.isOwnedByUser ? "Excluir playlist" : "Remover playlist"}
        description={
          targetPlaylist?.isOwnedByUser
            ? "Quer mesmo excluir esta playlist? Essa ação remove a playlist da sua conta."
            : "Quer mesmo remover esta playlist da biblioteca?"
        }
        confirmLabel={targetPlaylist?.isOwnedByUser ? "Excluir playlist" : "Remover playlist"}
        loading={Boolean(targetPlaylist && pending[targetPlaylist.playlistId])}
        onConfirm={async () => {
          if (!targetPlaylist) return;
          if (targetPlaylist.isOwnedByUser) {
            await deletePlaylist(targetPlaylist.playlistId);
            onPlaylistDeleted?.(targetPlaylist.playlistId);
          } else {
            await toggleSavedPlaylist(targetPlaylist);
          }
          setTargetPlaylist(null);
        }}
      />

      {highlightedPlaylist && highlightRect && typeof document !== "undefined"
        ? createPortal(
            <div
              className="pointer-events-none fixed z-[45]"
              style={{
                top: highlightRect.top,
                left: highlightRect.left,
                width: "max-content",
                minWidth: highlightRect.width,
                maxWidth: `calc(100vw - ${Math.round(highlightRect.left) + 16}px)`,
                height: highlightRect.height,
              }}
            >
              <SidebarPlaylistRow
                playlist={highlightedPlaylist}
                isPending={highlightedPlaylistPending}
                highlighted
              />
            </div>,
            document.body
          )
        : null}
    </>
  );
}
