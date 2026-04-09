import { useState, useEffect, useRef } from "react";
import { useVirtualizer } from "@tanstack/react-virtual";
import { Separator } from "@/components/ui/separator";
import { Button } from "@/components/ui/button";
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuTrigger,
} from "@/components/ui/context-menu";
import { Home, Compass, Library, Loader2, Plus, Trash2 } from "lucide-react";
import { cn } from "@/lib/utils";
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

  return (
    <>
      <div className="flex h-full w-64 shrink-0 flex-col border-r border-border pt-4">
        <div className="flex flex-col gap-0.5 px-2">
          {NAV_ITEMS.map(({ key, label, icon: Icon }) => {
            const isActive = activeView === key;

            return (
              <button
                key={key}
                onClick={() => onViewChange(key)}
                className={cn(
                  "flex w-full items-center gap-3 rounded-md px-3 py-2 text-left text-sm font-medium transition-colors hover:bg-accent",
                  isActive && "bg-accent text-foreground",
                  !isActive && "text-muted-foreground"
                )}
              >
                <Icon className="h-5 w-5 shrink-0" />
                {label}
              </button>
            );
          })}
        </div>

        <Separator className="my-2" />

        <div className="flex shrink-0 items-center justify-between px-4 pb-1">
          <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            Todas as playlists
          </h3>
          <Button
            variant="ghost"
            size="icon-sm"
            onClick={() => setCreateDialogOpen(true)}
            aria-label="Nova playlist"
          >
            <Plus className="h-4 w-4" />
          </Button>
        </div>

        {!hydrated && hydrating ? (
          <div className="flex flex-1 items-center justify-center">
            <Loader2 className="size-4 animate-spin text-muted-foreground" />
          </div>
        ) : (
          <div
            ref={scrollRef}
            className="styled-scrollbar min-h-0 flex-1 overflow-y-auto px-2 pb-4"
          >
            <div style={{ height: virtualizer.getTotalSize(), position: "relative" }}>
              {virtualizer.getVirtualItems().map((vItem) => {
                const playlist = playlists[vItem.index];
                const rawThumbUrl = playlist.thumbnails[0]?.url;
                const initials = playlist.title.slice(0, 2).toUpperCase();
                const isPending = Boolean(pending[playlist.playlistId]);

                return (
                  <div
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
                      <ContextMenuTrigger>
                        <button
                          onClick={() => onSelectPlaylist(playlist.playlistId)}
                          className="flex h-full w-full items-center gap-3 rounded-md px-2 text-left transition-colors hover:bg-accent disabled:opacity-50"
                          disabled={isPending}
                        >
                          <div className="flex size-9 shrink-0 items-center justify-center overflow-hidden rounded-sm bg-muted">
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
                          <div className="min-w-0 flex-1">
                            <p className="truncate text-sm font-medium leading-tight">{playlist.title}</p>
                          </div>
                        </button>
                      </ContextMenuTrigger>
                      {!playlist.isSpecial ? (
                        <ContextMenuContent>
                          <ContextMenuItem
                            onClick={() => setTargetPlaylist(playlist)}
                            className="text-destructive focus:text-destructive"
                          >
                            <Trash2 className="mr-2 h-4 w-4" />
                            {playlist.isOwnedByUser ? "Excluir playlist" : "Remover playlist"}
                          </ContextMenuItem>
                        </ContextMenuContent>
                      ) : null}
                    </ContextMenu>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>

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
