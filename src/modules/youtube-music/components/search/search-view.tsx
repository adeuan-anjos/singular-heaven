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
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
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
    <div className="flex h-full flex-col">
      <Command className="flex flex-1 flex-col border-b border-border" shouldFilter={false}>
        <CommandInput
          placeholder="Buscar músicas, artistas, álbuns..."
          value={query}
          onValueChange={setQuery}
        />
        {results && (
          <CommandList className="max-h-none">
            <ScrollArea className="flex-1 overflow-auto">
              {results.songs.length > 0 && (
                <CommandGroup heading="Músicas">
                  {results.songs.map((track) => (
                    <CommandItem key={track.videoId} onSelect={() => onPlayTrack(track)}>
                      <Avatar className="mr-3 h-8 w-8 rounded-sm">
                        <AvatarImage src={track.thumbnails[0]?.url} className="object-cover" />
                        <AvatarFallback className="rounded-sm">{track.title.charAt(0)}</AvatarFallback>
                      </Avatar>
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
                      <Avatar className="mr-3 h-8 w-8 rounded-full">
                        <AvatarImage src={artist.thumbnails[0]?.url} className="object-cover" />
                        <AvatarFallback>{artist.name.charAt(0)}</AvatarFallback>
                      </Avatar>
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
                      <Avatar className="mr-3 h-8 w-8 rounded-sm">
                        <AvatarImage src={album.thumbnails[0]?.url} className="object-cover" />
                        <AvatarFallback className="rounded-sm">{album.title.charAt(0)}</AvatarFallback>
                      </Avatar>
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
                      <Avatar className="mr-3 h-8 w-8 rounded-sm">
                        <AvatarImage src={pl.thumbnails[0]?.url} className="object-cover" />
                        <AvatarFallback className="rounded-sm">{pl.title.charAt(0)}</AvatarFallback>
                      </Avatar>
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm">{pl.title}</p>
                        <p className="truncate text-xs text-muted-foreground">{pl.author.name}</p>
                      </div>
                    </CommandItem>
                  ))}
                </CommandGroup>
              )}

              <CommandEmpty>Nenhum resultado encontrado</CommandEmpty>
            </ScrollArea>
          </CommandList>
        )}
      </Command>
    </div>
  );
}
