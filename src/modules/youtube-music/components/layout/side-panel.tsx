import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { ArrowLeft, ArrowRight, Search, Home, Compass, Library, Heart } from "lucide-react";
import { cn } from "@/lib/utils";
import { mockTracks, mockPlaylists } from "../../mock/data";

interface SidePanelProps {
  activeView: string;
  onViewChange: (view: string) => void;
  onSelectPlaylist: (id: string | null) => void;
  onBack: () => void;
  onForward: () => void;
  canGoBack: boolean;
  canGoForward: boolean;
  onSearch: () => void;
}

const NAV_ITEMS = [
  { key: "home", label: "Início", icon: Home },
  { key: "explore", label: "Explorar", icon: Compass },
  { key: "library", label: "Biblioteca", icon: Library },
] as const;

export function SidePanel({
  activeView,
  onViewChange,
  onSelectPlaylist,
  onBack,
  onForward,
  canGoBack,
  canGoForward,
  onSearch,
}: SidePanelProps) {
  const handleNavClick = (key: string) => {
    onViewChange(key);
  };

  return (
    <div className="flex h-full w-64 shrink-0 flex-col border-r border-border">
      {/* Top: Navigation buttons */}
      <div className="flex items-center gap-1 px-3 py-2">
        <Tooltip>
          <TooltipTrigger
            render={
              <Button
                variant="ghost"
                size="icon"
                onClick={onBack}
                disabled={!canGoBack}
              />
            }
          >
            <ArrowLeft className="h-4 w-4" />
          </TooltipTrigger>
          <TooltipContent>Voltar</TooltipContent>
        </Tooltip>
        <Tooltip>
          <TooltipTrigger
            render={
              <Button
                variant="ghost"
                size="icon"
                onClick={onForward}
                disabled={!canGoForward}
              />
            }
          >
            <ArrowRight className="h-4 w-4" />
          </TooltipTrigger>
          <TooltipContent>Avançar</TooltipContent>
        </Tooltip>
        <Tooltip>
          <TooltipTrigger
            render={<Button variant="ghost" size="icon" onClick={onSearch} />}
          >
            <Search className="h-4 w-4" />
          </TooltipTrigger>
          <TooltipContent>Buscar</TooltipContent>
        </Tooltip>
      </div>

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
      <ScrollArea className="flex-1">
        <div className="flex flex-col gap-0.5 px-2 pb-4">
          {/* Curtidas */}
          <button
            onClick={() => onSelectPlaylist(null)}
            className="flex w-full items-center gap-3 rounded-md px-2 py-1.5 text-left transition-colors hover:bg-accent"
          >
            <div className="flex size-9 shrink-0 items-center justify-center rounded-sm bg-primary/10">
              <Heart className="size-4 text-primary" />
            </div>
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium leading-tight">
                Curtidas
              </p>
              <p className="mt-0.5 truncate text-xs leading-tight text-muted-foreground">
                {mockTracks.length} músicas
              </p>
            </div>
          </button>

          {/* User playlists */}
          {mockPlaylists.map((pl) => {
            const thumbUrl = pl.thumbnails?.[0]?.url;
            const initials = pl.title.slice(0, 2).toUpperCase();
            return (
              <button
                key={pl.playlistId}
                onClick={() => onSelectPlaylist(pl.playlistId)}
                className="flex w-full items-center gap-3 rounded-md px-2 py-1.5 text-left transition-colors hover:bg-accent"
              >
                <div className="flex size-9 shrink-0 items-center justify-center overflow-hidden rounded-sm bg-muted">
                  {thumbUrl ? (
                    <img
                      src={thumbUrl}
                      alt={pl.title}
                      className="h-full w-full object-cover"
                    />
                  ) : (
                    <span className="text-xs text-muted-foreground">
                      {initials}
                    </span>
                  )}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium leading-tight">
                    {pl.title}
                  </p>
                  <p className="mt-0.5 truncate text-xs leading-tight text-muted-foreground">
                    {pl.author?.name} • {pl.trackCount} músicas
                  </p>
                </div>
              </button>
            );
          })}
        </div>
      </ScrollArea>
    </div>
  );
}
