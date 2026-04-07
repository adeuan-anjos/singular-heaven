import { useState, useRef, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  Command,
  CommandList,
  CommandEmpty,
  CommandGroup,
  CommandItem,
} from "@/components/ui/command";
import { ChevronLeft, ChevronRight, Search, X } from "lucide-react";
import { mockSearchResults } from "../../mock/data";
import type { Track, StackPage } from "../../types/music";

interface TopBarProps {
  onBack: () => void;
  onForward: () => void;
  canGoBack: boolean;
  canGoForward: boolean;
  onNavigate: (page: StackPage) => void;
  onPlayTrack: (track: Track) => void;
}

export function TopBar({
  onBack,
  onForward,
  canGoBack,
  canGoForward,
  onNavigate,
  onPlayTrack,
}: TopBarProps) {
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const results = query.length > 0 ? mockSearchResults : null;

  const handleInputChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const value = e.target.value;
      setQuery(value);
      setOpen(value.length > 0);
    },
    [],
  );

  const handleClear = useCallback(() => {
    setQuery("");
    setOpen(false);
    inputRef.current?.focus();
  }, []);

  const handleSelectTrack = useCallback(
    (track: Track) => {
      console.log("[TopBar] search result selected: track", { title: track.title });
      onPlayTrack(track);
      setQuery("");
      setOpen(false);
    },
    [onPlayTrack],
  );

  const handleSelectPage = useCallback(
    (page: StackPage) => {
      console.log("[TopBar] search result selected: page", { type: page.type });
      onNavigate(page);
      setQuery("");
      setOpen(false);
    },
    [onNavigate],
  );

  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === "Escape") {
      setQuery("");
      setOpen(false);
    }
  }, []);

  return (
    <div className="flex shrink-0 border-b border-border">
      {/* Spacer matching side panel width */}
      <div className="w-64 shrink-0 border-r border-border" />

      {/* Navigation controls + search */}
      <div className="flex flex-1 items-center gap-2 px-4 py-2">
        {/* Back / Forward buttons */}
        <div className="flex items-center gap-1">
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
              <ChevronLeft className="h-4 w-4" />
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
              <ChevronRight className="h-4 w-4" />
            </TooltipTrigger>
            <TooltipContent>Avançar</TooltipContent>
          </Tooltip>
        </div>

        {/* Search input with dropdown */}
        <Popover open={open} onOpenChange={setOpen}>
          <PopoverTrigger
            render={
              <div className="relative mx-auto flex w-full max-w-xl items-center">
                <Search className="pointer-events-none absolute left-2.5 h-4 w-4 text-muted-foreground" />
                <Input
                  ref={inputRef}
                  value={query}
                  onChange={handleInputChange}
                  onKeyDown={handleKeyDown}
                  onFocus={() => {
                    if (query.length > 0) setOpen(true);
                  }}
                  placeholder="Buscar músicas, artistas, álbuns..."
                  className="pl-8"
                />
                {query.length > 0 && (
                  <Button
                    variant="ghost"
                    size="icon"
                    className="absolute right-0 h-8 w-8"
                    onClick={handleClear}
                  >
                    <X className="h-3.5 w-3.5" />
                  </Button>
                )}
              </div>
            }
          />
          <PopoverContent
            align="center"
            sideOffset={4}
            className="w-[var(--anchor-width)] p-0"
          >
            {results && (
              <Command className="rounded-lg" shouldFilter={false}>
                <CommandList className="max-h-80">
                  {results.songs.length > 0 && (
                    <CommandGroup heading="Músicas">
                      {results.songs.map((track) => (
                        <CommandItem
                          key={track.videoId}
                          onSelect={() => handleSelectTrack(track)}
                        >
                          <div className="mr-3 flex h-8 w-8 shrink-0 items-center justify-center overflow-hidden rounded-sm bg-muted">
                            {track.thumbnails[0]?.url ? (
                              <img
                                src={track.thumbnails[0].url}
                                alt={track.title}
                                className="h-full w-full object-cover"
                              />
                            ) : (
                              <span className="text-xs text-muted-foreground">
                                {track.title.charAt(0)}
                              </span>
                            )}
                          </div>
                          <div className="min-w-0 flex-1">
                            <p className="truncate text-sm">{track.title}</p>
                            <p className="truncate text-xs text-muted-foreground">
                              {track.artists.map((a) => a.name).join(", ")}
                            </p>
                          </div>
                          <span className="text-xs text-muted-foreground">
                            {track.duration}
                          </span>
                        </CommandItem>
                      ))}
                    </CommandGroup>
                  )}

                  {results.artists.length > 0 && (
                    <CommandGroup heading="Artistas">
                      {results.artists.map((artist) => (
                        <CommandItem
                          key={artist.browseId}
                          onSelect={() =>
                            handleSelectPage({
                              type: "artist",
                              artistId: artist.browseId,
                            })
                          }
                        >
                          <div className="mr-3 flex h-8 w-8 shrink-0 items-center justify-center overflow-hidden rounded-sm bg-muted">
                            {artist.thumbnails[0]?.url ? (
                              <img
                                src={artist.thumbnails[0].url}
                                alt={artist.name}
                                className="h-full w-full object-cover"
                              />
                            ) : (
                              <span className="text-xs text-muted-foreground">
                                {artist.name.charAt(0)}
                              </span>
                            )}
                          </div>
                          <p className="text-sm">{artist.name}</p>
                        </CommandItem>
                      ))}
                    </CommandGroup>
                  )}

                  {results.albums.length > 0 && (
                    <CommandGroup heading="Álbuns">
                      {results.albums.map((album) => (
                        <CommandItem
                          key={album.browseId}
                          onSelect={() =>
                            handleSelectPage({
                              type: "album",
                              albumId: album.browseId,
                            })
                          }
                        >
                          <div className="mr-3 flex h-8 w-8 shrink-0 items-center justify-center overflow-hidden rounded-sm bg-muted">
                            {album.thumbnails[0]?.url ? (
                              <img
                                src={album.thumbnails[0].url}
                                alt={album.title}
                                className="h-full w-full object-cover"
                              />
                            ) : (
                              <span className="text-xs text-muted-foreground">
                                {album.title.charAt(0)}
                              </span>
                            )}
                          </div>
                          <div className="min-w-0 flex-1">
                            <p className="truncate text-sm">{album.title}</p>
                            <p className="truncate text-xs text-muted-foreground">
                              {album.artists.map((a) => a.name).join(", ")}{" "}
                              {album.year && `\u2022 ${album.year}`}
                            </p>
                          </div>
                        </CommandItem>
                      ))}
                    </CommandGroup>
                  )}

                  {results.playlists.length > 0 && (
                    <CommandGroup heading="Playlists">
                      {results.playlists.map((pl) => (
                        <CommandItem
                          key={pl.playlistId}
                          onSelect={() =>
                            handleSelectPage({
                              type: "playlist",
                              playlistId: pl.playlistId,
                            })
                          }
                        >
                          <div className="mr-3 flex h-8 w-8 shrink-0 items-center justify-center overflow-hidden rounded-sm bg-muted">
                            {pl.thumbnails[0]?.url ? (
                              <img
                                src={pl.thumbnails[0].url}
                                alt={pl.title}
                                className="h-full w-full object-cover"
                              />
                            ) : (
                              <span className="text-xs text-muted-foreground">
                                {pl.title.charAt(0)}
                              </span>
                            )}
                          </div>
                          <div className="min-w-0 flex-1">
                            <p className="truncate text-sm">{pl.title}</p>
                            <p className="truncate text-xs text-muted-foreground">
                              {pl.author.name}
                            </p>
                          </div>
                        </CommandItem>
                      ))}
                    </CommandGroup>
                  )}

                  <CommandEmpty>Nenhum resultado encontrado</CommandEmpty>
                </CommandList>
              </Command>
            )}
          </PopoverContent>
        </Popover>
      </div>
    </div>
  );
}
