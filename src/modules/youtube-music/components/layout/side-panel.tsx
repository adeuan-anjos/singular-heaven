import { useState, useEffect, useRef } from "react";
import { useVirtualizer } from "@tanstack/react-virtual";
import { Separator } from "@/components/ui/separator";
import { Home, Compass, Library, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { ytGetLibraryPlaylists } from "../../services/yt-api";
import { mapLibraryPlaylists } from "../../services/mappers";
import type { Playlist } from "../../types/music";
import { thumbUrl } from "../../utils/thumb-url";

interface SidePanelProps {
  activeView: string;
  onViewChange: (view: string) => void;
  onSelectPlaylist: (id: string | null) => void;
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
}: SidePanelProps) {
  const [playlists, setPlaylists] = useState<Playlist[]>([]);
  const [loading, setLoading] = useState(true);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let cancelled = false;

    async function fetchSidebarData() {
      console.log("[SidePanel] Fetching sidebar playlists...");
      setLoading(true);
      try {
        const apiPlaylists = await ytGetLibraryPlaylists();
        if (cancelled) return;
        const mappedPlaylists = mapLibraryPlaylists(apiPlaylists);
        console.log("[SidePanel] Loaded playlists:", mappedPlaylists.length);
        setPlaylists(mappedPlaylists);
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        console.error("[SidePanel] Failed to load playlists:", msg);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    fetchSidebarData();
    return () => { cancelled = true; };
  }, []);

  const virtualizer = useVirtualizer({
    count: playlists.length,
    getScrollElement: () => scrollRef.current,
    estimateSize: () => PLAYLIST_ROW_HEIGHT,
    overscan: 8,
  });

  const handleNavClick = (key: string) => {
    onViewChange(key);
  };

  return (
    <div className="flex h-full w-64 shrink-0 flex-col border-r border-border pt-4">
      {/* Navigation items */}
      <div className="flex flex-col gap-0.5 px-2">
        {NAV_ITEMS.map(({ key, label, icon: Icon }) => {
          const isActive = activeView === key;

          return (
            <button
              key={key}
              onClick={() => handleNavClick(key)}
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

      {/* Playlists section */}
      <div className="shrink-0 px-4 pb-1">
        <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          Todas as playlists
        </h3>
      </div>

      {loading ? (
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
              const pl = playlists[vItem.index];
              const rawThumbUrl = pl.thumbnails[0]?.url;
              const initials = pl.title.slice(0, 2).toUpperCase();

              return (
                <div
                  key={pl.playlistId}
                  style={{
                    position: "absolute",
                    top: 0,
                    left: 0,
                    width: "100%",
                    height: vItem.size,
                    transform: `translateY(${vItem.start}px)`,
                  }}
                >
                  <button
                    onClick={() => onSelectPlaylist(pl.playlistId)}
                    className="flex h-full w-full items-center gap-3 rounded-md px-2 text-left transition-colors hover:bg-accent"
                  >
                    <div className="flex size-9 shrink-0 items-center justify-center overflow-hidden rounded-sm bg-muted">
                      {rawThumbUrl ? (
                        <img src={thumbUrl(rawThumbUrl, 72)} alt={pl.title} className="h-full w-full object-cover" loading="lazy" decoding="async" />
                      ) : (
                        <span className="text-xs text-muted-foreground">{initials}</span>
                      )}
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium leading-tight">{pl.title}</p>
                    </div>
                  </button>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
