import { useState } from "react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Ellipsis, Play, Pause, ListPlus, User, Disc3, AudioLines, Heart } from "lucide-react";
import type { Track } from "../../types/music";

interface TrackRowProps {
  track: Track;
  index?: number;
  isPlaying?: boolean;
  onPlay?: (track: Track) => void;
  onAddToQueue?: (track: Track) => void;
  onGoToArtist?: (artistId: string) => void;
  onGoToAlbum?: (albumId: string) => void;
}

export function TrackRow({ track, index, isPlaying, onPlay, onAddToQueue, onGoToArtist, onGoToAlbum }: TrackRowProps) {
  const [liked, setLiked] = useState(false);
  const imgUrl = track.thumbnails[0]?.url ?? "";
  const artistName = track.artists.map((a) => a.name).join(", ");

  return (
    <div
      className="group flex items-center gap-3 rounded-md px-2 py-1.5 hover:bg-accent"
      onDoubleClick={() => onPlay?.(track)}
    >
      {index !== undefined && (
        <div className="flex w-6 items-center justify-center">
          {/* Default: number (not hovered, not playing) */}
          <span className={`text-center text-sm text-muted-foreground group-hover:hidden ${isPlaying ? "hidden" : ""}`}>
            {index + 1}
          </span>
          {/* Not hovered, playing: audio wave icon */}
          {isPlaying && (
            <AudioLines className="h-4 w-4 text-primary group-hover:hidden" />
          )}
          {/* Hovered, not playing: play button */}
          {!isPlaying && (
            <button
              type="button"
              className="hidden group-hover:flex items-center justify-center"
              onClick={() => onPlay?.(track)}
            >
              <Play className="h-4 w-4 text-foreground" />
            </button>
          )}
          {/* Hovered, playing: pause button */}
          {isPlaying && (
            <button
              type="button"
              className="hidden group-hover:flex items-center justify-center"
              onClick={() => onPlay?.(track)}
            >
              <Pause className="h-4 w-4 text-foreground" />
            </button>
          )}
        </div>
      )}
      <Avatar className="h-10 w-10 rounded-sm">
        <AvatarImage src={imgUrl} alt={track.title} className="object-cover" />
        <AvatarFallback className="rounded-sm">{track.title.charAt(0)}</AvatarFallback>
      </Avatar>
      <div className="min-w-0 flex-1">
        <p className={`truncate text-sm font-medium ${isPlaying ? "text-primary" : "text-foreground"}`}>{track.title}</p>
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
      <Button
        variant="ghost"
        size="icon"
        className="h-8 w-8 opacity-0 group-hover:opacity-100"
        onClick={() => setLiked(!liked)}
        aria-label="Curtir"
      >
        <Heart className={`h-4 w-4 ${liked ? "fill-red-500 text-red-500" : ""}`} />
      </Button>
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
