import { useState } from "react";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Command,
  CommandInput,
  CommandList,
  CommandEmpty,
  CommandGroup,
  CommandItem,
} from "@/components/ui/command";
import { mockSearchResults } from "../../mock/data";
import type { Track, StackPage } from "../../types/music";

interface SearchViewProps {
  onNavigate: (page: StackPage) => void;
  onPlayTrack: (track: Track) => void;
}

export function SearchView({ onNavigate, onPlayTrack }: SearchViewProps) {
  const [query, setQuery] = useState("");
  const results = query.length > 0 ? mockSearchResults : null;

  return (
    <ScrollArea className="group/page h-full">
      <div className="mx-auto max-w-screen-xl space-y-6 p-4">
        <Command className="flex w-full flex-col" shouldFilter={false}>
          <CommandInput
            placeholder="Buscar músicas, artistas, álbuns..."
            value={query}
            onValueChange={setQuery}
          />
          {results && (
            <CommandList className="max-h-none">
              {results.songs.length > 0 && (
                <CommandGroup heading="Músicas">
                  {results.songs.map((track) => (
                    <CommandItem key={track.videoId} onSelect={() => onPlayTrack(track)}>
                      <div className="mr-3 flex h-8 w-8 shrink-0 items-center justify-center overflow-hidden rounded-sm bg-muted">
                        {track.thumbnails[0]?.url ? (
                          <img src={track.thumbnails[0].url} alt={track.title} className="h-full w-full object-cover" />
                        ) : (
                          <span className="text-xs text-muted-foreground">{track.title.charAt(0)}</span>
                        )}
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm">{track.title}</p>
                        <p className="truncate text-xs text-muted-foreground">
                          {track.artists.map((a) => a.name).join(", ")}
                        </p>
                      </div>
                      <span className="text-xs text-muted-foreground">{track.duration}</span>
                    </CommandItem>
                  ))}
                </CommandGroup>
              )}

              {results.artists.length > 0 && (
                <CommandGroup heading="Artistas">
                  {results.artists.map((artist) => (
                    <CommandItem
                      key={artist.browseId}
                      onSelect={() => onNavigate({ type: "artist", artistId: artist.browseId })}
                    >
                      <div className="mr-3 flex h-8 w-8 shrink-0 items-center justify-center overflow-hidden rounded-sm bg-muted">
                        {artist.thumbnails[0]?.url ? (
                          <img src={artist.thumbnails[0].url} alt={artist.name} className="h-full w-full object-cover" />
                        ) : (
                          <span className="text-xs text-muted-foreground">{artist.name.charAt(0)}</span>
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
                      onSelect={() => onNavigate({ type: "album", albumId: album.browseId })}
                    >
                      <div className="mr-3 flex h-8 w-8 shrink-0 items-center justify-center overflow-hidden rounded-sm bg-muted">
                        {album.thumbnails[0]?.url ? (
                          <img src={album.thumbnails[0].url} alt={album.title} className="h-full w-full object-cover" />
                        ) : (
                          <span className="text-xs text-muted-foreground">{album.title.charAt(0)}</span>
                        )}
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm">{album.title}</p>
                        <p className="truncate text-xs text-muted-foreground">
                          {album.artists.map((a) => a.name).join(", ")} {album.year && `\u2022 ${album.year}`}
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
                      onSelect={() => onNavigate({ type: "playlist", playlistId: pl.playlistId })}
                    >
                      <div className="mr-3 flex h-8 w-8 shrink-0 items-center justify-center overflow-hidden rounded-sm bg-muted">
                        {pl.thumbnails[0]?.url ? (
                          <img src={pl.thumbnails[0].url} alt={pl.title} className="h-full w-full object-cover" />
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

              <CommandEmpty>Nenhum resultado encontrado</CommandEmpty>
            </CommandList>
          )}
        </Command>
      </div>
    </ScrollArea>
  );
}
