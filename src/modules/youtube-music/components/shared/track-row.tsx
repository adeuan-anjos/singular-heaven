import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Ellipsis, Play, ListPlus, User, Disc3 } from "lucide-react";
import type { Track } from "../../types/music";

interface TrackRowProps {
  track: Track;
  index?: number;
  onPlay?: (track: Track) => void;
  onAddToQueue?: (track: Track) => void;
  onGoToArtist?: (artistId: string) => void;
  onGoToAlbum?: (albumId: string) => void;
}

export function TrackRow({ track, index, onPlay, onAddToQueue, onGoToArtist, onGoToAlbum }: TrackRowProps) {
  const imgUrl = track.thumbnails[0]?.url ?? "";
  const artistName = track.artists.map((a) => a.name).join(", ");

  return (
    <div
      className="group flex items-center gap-3 rounded-md px-2 py-1.5 hover:bg-accent"
      onDoubleClick={() => onPlay?.(track)}
    >
      {index !== undefined && (
        <span className="w-6 text-center text-sm text-muted-foreground">{index + 1}</span>
      )}
      <Avatar className="h-10 w-10 rounded-sm">
        <AvatarImage src={imgUrl} alt={track.title} className="object-cover" />
        <AvatarFallback className="rounded-sm">{track.title.charAt(0)}</AvatarFallback>
      </Avatar>
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium text-foreground">{track.title}</p>
        <p className="truncate text-xs text-muted-foreground">
          <button
            type="button"
            className="hover:underline"
            onClick={(e) => { e.stopPropagation(); track.artists[0]?.id && onGoToArtist?.(track.artists[0].id!); }}
          >
            {artistName}
          </button>
          {track.album && (
            <>
              {" • "}
              <button
                type="button"
                className="hover:underline"
                onClick={(e) => { e.stopPropagation(); onGoToAlbum?.(track.album!.id); }}
              >
                {track.album.name}
              </button>
            </>
          )}
        </p>
      </div>
      <span className="text-xs text-muted-foreground">{track.duration}</span>
      <DropdownMenu>
        <DropdownMenuTrigger
          render={<Button variant="ghost" size="icon" className="h-8 w-8 opacity-0 group-hover:opacity-100" />}
        >
          <Ellipsis className="h-4 w-4" />
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuItem onClick={() => onPlay?.(track)}>
            <Play className="mr-2 h-4 w-4" />
            Tocar
          </DropdownMenuItem>
          <DropdownMenuItem onClick={() => onAddToQueue?.(track)}>
            <ListPlus className="mr-2 h-4 w-4" />
            Tocar em seguida
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          {track.artists[0]?.id && (
            <DropdownMenuItem onClick={() => onGoToArtist?.(track.artists[0].id!)}>
              <User className="mr-2 h-4 w-4" />
              Ir para o artista
            </DropdownMenuItem>
          )}
          {track.album && (
            <DropdownMenuItem onClick={() => onGoToAlbum?.(track.album!.id)}>
              <Disc3 className="mr-2 h-4 w-4" />
              Ir para o álbum
            </DropdownMenuItem>
          )}
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}
