import { useState, useEffect, useRef } from "react";
import { useVirtualizer } from "@tanstack/react-virtual";
import { Separator } from "@/components/ui/separator";
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuTrigger,
} from "@/components/ui/context-menu";
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
import { Home, Compass, Library, Loader2, Plus, Trash2 } from "lucide-react";
import { usePlaylistLibraryStore } from "../../stores/playlist-library-store";
import { thumbUrl } from "../../utils/thumb-url";
import { CreatePlaylistDialog } from "../shared/create-playlist-dialog";
import { PlaylistDestructiveDialog } from "../shared/playlist-destructive-dialog";
import type { Playlist } from "../../types/music";

interface SidePanelProps {
  activeView: string;
  onViewChange: (view: string) => void;
  onSelectPlaylist: (id: string | null) => void;
  onPlaylistDeleted?: (playlistId: string) => void;
}

const NAV_ITEMS = [
  { key: "home", label: "Início", icon: Home },
  { key: "explore", label: "Explorar", icon: Compass },
  { key: "library", label: "Biblioteca", icon: Library },
] as const;

const PLAYLIST_ROW_HEIGHT = 48;

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

export function SidePanel({
  activeView,
  onViewChange,
  onSelectPlaylist,
  onPlaylistDeleted,
}: SidePanelProps) {
  const playlists = usePlaylistLibraryStore((s) => s.sidebarPlaylists);
  const hydrate = usePlaylistLibraryStore((s) => s.hydrateSidebar);
  const hydrated = usePlaylistLibraryStore((s) => s.sidebarHydrated);
  const hydrating = usePlaylistLibraryStore((s) => s.sidebarHydrating);
  const toggleSavedPlaylist = usePlaylistLibraryStore((s) => s.toggleSavedPlaylist);
  const deletePlaylist = usePlaylistLibraryStore((s) => s.deletePlaylist);
  const pending = usePlaylistLibraryStore((s) => s.pending);

  const [createDialogOpen, setCreateDialogOpen] = useState(false);
  const [targetPlaylist, setTargetPlaylist] = useState<Playlist | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const lastVisibleRangeRef = useRef<string>("");
  const lastSidebarStateRef = useRef<string>("");

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

  return (
    <>
      <Sidebar>
        <SidebarHeader>
          <SidebarMenu>
            {NAV_ITEMS.map(({ key, label, icon: Icon }) => {
              const isActive = activeView === key;

              return (
                <SidebarMenuItem key={key}>
                  <SidebarMenuButton
                    onClick={() => {
                      console.log(
                        `[SidePanel] nav click ${JSON.stringify({ key })}`
                      );
                      onViewChange(key);
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
                  {virtualizer.getVirtualItems().map((vItem) => {
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
                        <ContextMenu>
                          <ContextMenuTrigger className="block h-full">
                            <SidebarMenuButton
                              onClick={() => {
                                console.log(
                                  `[SidePanel] playlist click ${JSON.stringify({
                                    playlistId: playlist.playlistId,
                                    title: playlist.title,
                                    index: vItem.index,
                                  })}`
                                );
                                onSelectPlaylist(playlist.playlistId);
                              }}
                              tone="playlist"
                              size="playlist"
                              className="h-full"
                              disabled={isPending}
                            >
                              <PlaylistThumbnail playlist={playlist} />
                              <div className="min-w-0 flex-1">
                                <p className="truncate text-sm font-medium leading-tight">
                                  {playlist.title}
                                </p>
                              </div>
                            </SidebarMenuButton>
                          </ContextMenuTrigger>
                          {!playlist.isSpecial ? (
                            <ContextMenuContent>
                              <ContextMenuItem
                                onClick={() => {
                                  console.log(
                                    `[SidePanel] context action ${JSON.stringify({
                                      playlistId: playlist.playlistId,
                                      title: playlist.title,
                                      action: playlist.isOwnedByUser
                                        ? "delete"
                                        : "remove",
                                    })}`
                                  );
                                  setTargetPlaylist(playlist);
                                }}
                                variant="destructive"
                              >
                                <Trash2 className="mr-2 h-4 w-4" />
                                {playlist.isOwnedByUser ? "Excluir playlist" : "Remover playlist"}
                              </ContextMenuItem>
                            </ContextMenuContent>
                          ) : null}
                        </ContextMenu>
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
            onSelectPlaylist(playlistId);
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
    </>
  );
}
