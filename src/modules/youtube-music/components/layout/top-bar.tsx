import { useState, useRef, useCallback, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import {
  Command,
  CommandList,
  CommandEmpty,
  CommandGroup,
  CommandItem,
} from "@/components/ui/command";
import { ChevronLeft, ChevronRight, Search, X, Loader2 } from "lucide-react";
import { ytSearchSuggestions, ytSearch } from "../../services/yt-api";
import { mapSearchResults } from "../../services/mappers";
import type { Track, SearchResults, StackPage } from "../../types/music";

interface TopBarProps {
  onBack: () => void;
  onForward: () => void;
  canGoBack: boolean;
  canGoForward: boolean;
  onNavigate: (page: StackPage) => void;
  onPlayTrack: (track: Track) => void;
  onSearchSubmit: (query: string) => void;
}

export function TopBar({
  onBack,
  onForward,
  canGoBack,
  canGoForward,
  onNavigate,
  onPlayTrack,
  onSearchSubmit,
}: TopBarProps) {
  const [query, setQuery] = useState("");
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const [results, setResults] = useState<SearchResults | null>(null);
  const [suggestions, setSuggestions] = useState<string[]>([]);
  const [searchLoading, setSearchLoading] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Debounced search as user types
  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);

    if (query.length === 0) {
      setResults(null);
      setSuggestions([]);
      setSearchLoading(false);
      return;
    }

    setSearchLoading(true);
    debounceRef.current = setTimeout(async () => {
      try {
        console.log("[TopBar] Fetching suggestions/results for:", query);
        const [suggestionsData, searchData] = await Promise.all([
          ytSearchSuggestions(query).catch(() => []),
          ytSearch(query).catch(() => null),
        ]);
        setSuggestions(suggestionsData.map((s) => s.text));
        if (searchData) {
          const mapped = mapSearchResults(searchData);
          console.log("[TopBar] Inline search results:", {
            songs: mapped.songs.length,
            artists: mapped.artists.length,
            albums: mapped.albums.length,
            playlists: mapped.playlists.length,
            suggestions: suggestionsData.length,
          });
          setResults(mapped);
        }
      } catch (err) {
        console.error("[TopBar] Search suggestions failed:", err);
      } finally {
        setSearchLoading(false);
      }
    }, 350);

    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [query]);

  const handleInputChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const value = e.target.value;
      setQuery(value);
      setDropdownOpen(value.length > 0);
    },
    [],
  );

  const handleClear = useCallback(() => {
    setQuery("");
    setDropdownOpen(false);
    setResults(null);
    setSuggestions([]);
    inputRef.current?.focus();
  }, []);

  const handleSelect = useCallback(
    (action: () => void) => {
      action();
      setQuery("");
      setDropdownOpen(false);
      setResults(null);
      setSuggestions([]);
    },
    [],
  );

  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === "Escape") {
      setQuery("");
      setDropdownOpen(false);
      inputRef.current?.blur();
    } else if (e.key === "Enter" && query.trim().length > 0) {
      setDropdownOpen(false);
      onSearchSubmit(query.trim());
    }
  }, [query, onSearchSubmit]);

  // Close dropdown when clicking outside
  useEffect(() => {
    if (!dropdownOpen) return;

    const handleClickOutside = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setDropdownOpen(false);
      }
    };

    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [dropdownOpen]);

  const hasResults = results && (
    results.songs.length > 0 ||
    results.artists.length > 0 ||
    results.albums.length > 0 ||
    results.playlists.length > 0
  );

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
        <div ref={containerRef} className="relative mx-auto w-full max-w-xl">
          <div className="relative flex items-center">
            <Search className="pointer-events-none absolute left-2.5 h-4 w-4 text-muted-foreground" />
            <Input
              ref={inputRef}
              value={query}
              onChange={handleInputChange}
              onKeyDown={handleKeyDown}
              onFocus={() => { if (query.length > 0) setDropdownOpen(true); }}
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

          {/* Dropdown results */}
          {dropdownOpen && query.length > 0 && (
            <div className="absolute left-0 top-full z-50 mt-1 w-full rounded-lg bg-popover shadow-md ring-1 ring-foreground/10">
              <Command className="rounded-lg" shouldFilter={false}>
                <CommandList className="max-h-80">
                  {searchLoading && !hasResults && (
                    <div className="flex items-center justify-center py-6">
                      <Loader2 className="size-4 animate-spin text-muted-foreground" />
                    </div>
                  )}

                  {suggestions.length > 0 && (
                    <CommandGroup heading="Sugestões">
                      {suggestions.slice(0, 5).map((text, i) => (
                        <CommandItem
                          key={`suggestion-${i}`}
                          onSelect={() => handleSelect(() => onSearchSubmit(text))}
                        >
                          <Search className="mr-2 h-3.5 w-3.5 text-muted-foreground" />
                          <span className="text-sm">{text}</span>
                        </CommandItem>
                      ))}
                    </CommandGroup>
                  )}

                  {results?.songs && results.songs.length > 0 && (
                    <CommandGroup heading="Músicas">
                      {results.songs.slice(0, 4).map((track) => (
                        <CommandItem
                          key={track.videoId}
                          onSelect={() => handleSelect(() => onPlayTrack(track))}
                        >
                          <div className="mr-3 flex h-8 w-8 shrink-0 items-center justify-center overflow-hidden rounded-sm bg-muted">
                            {track.thumbnails[0]?.url ? (
                              <img referrerPolicy="no-referrer" src={track.thumbnails[0].url} alt={track.title} className="h-full w-full object-cover" />
                            ) : (
                              <span className="text-xs text-muted-foreground">{track.title.charAt(0)}</span>
                            )}
                          </div>
                          <div className="min-w-0 flex-1">
                            <p className="truncate text-sm">{track.title}</p>
                            <p className="truncate text-xs text-muted-foreground">{track.artists.map((a) => a.name).join(", ")}</p>
                          </div>
                          <span className="text-xs text-muted-foreground">{track.duration}</span>
                        </CommandItem>
                      ))}
                    </CommandGroup>
                  )}

                  {results?.artists && results.artists.length > 0 && (
                    <CommandGroup heading="Artistas">
                      {results.artists.slice(0, 3).map((artist) => (
                        <CommandItem
                          key={artist.browseId}
                          onSelect={() => handleSelect(() => onNavigate({ type: "artist", artistId: artist.browseId }))}
                        >
                          <div className="mr-3 flex h-8 w-8 shrink-0 items-center justify-center overflow-hidden rounded-sm bg-muted">
                            {artist.thumbnails[0]?.url ? (
                              <img referrerPolicy="no-referrer" src={artist.thumbnails[0].url} alt={artist.name} className="h-full w-full object-cover" />
                            ) : (
                              <span className="text-xs text-muted-foreground">{artist.name.charAt(0)}</span>
                            )}
                          </div>
                          <p className="text-sm">{artist.name}</p>
                        </CommandItem>
                      ))}
                    </CommandGroup>
                  )}

                  {results?.albums && results.albums.length > 0 && (
                    <CommandGroup heading="Álbuns">
                      {results.albums.slice(0, 3).map((album) => (
                        <CommandItem
                          key={album.browseId}
                          onSelect={() => handleSelect(() => onNavigate({ type: "album", albumId: album.browseId }))}
                        >
                          <div className="mr-3 flex h-8 w-8 shrink-0 items-center justify-center overflow-hidden rounded-sm bg-muted">
                            {album.thumbnails[0]?.url ? (
                              <img referrerPolicy="no-referrer" src={album.thumbnails[0].url} alt={album.title} className="h-full w-full object-cover" />
                            ) : (
                              <span className="text-xs text-muted-foreground">{album.title.charAt(0)}</span>
                            )}
                          </div>
                          <div className="min-w-0 flex-1">
                            <p className="truncate text-sm">{album.title}</p>
                            <p className="truncate text-xs text-muted-foreground">{album.artists.map((a) => a.name).join(", ")} {album.year && `\u2022 ${album.year}`}</p>
                          </div>
                        </CommandItem>
                      ))}
                    </CommandGroup>
                  )}

                  {results?.playlists && results.playlists.length > 0 && (
                    <CommandGroup heading="Playlists">
                      {results.playlists.slice(0, 3).map((pl) => (
                        <CommandItem
                          key={pl.playlistId}
                          onSelect={() => handleSelect(() => onNavigate({ type: "playlist", playlistId: pl.playlistId }))}
                        >
                          <div className="mr-3 flex h-8 w-8 shrink-0 items-center justify-center overflow-hidden rounded-sm bg-muted">
                            {pl.thumbnails[0]?.url ? (
                              <img referrerPolicy="no-referrer" src={pl.thumbnails[0].url} alt={pl.title} className="h-full w-full object-cover" />
                            ) : (
                              <span className="text-xs text-muted-foreground">{pl.title.charAt(0)}</span>
                            )}
                          </div>
                          <div className="min-w-0 flex-1">
                            <p className="truncate text-sm">{pl.title}</p>
                            <p className="truncate text-xs text-muted-foreground">{pl.author.name}</p>
                          </div>
                        </CommandItem>
                      ))}
                    </CommandGroup>
                  )}

                  {!searchLoading && !hasResults && suggestions.length === 0 && (
                    <CommandEmpty>Nenhum resultado encontrado</CommandEmpty>
                  )}
                </CommandList>
              </Command>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
