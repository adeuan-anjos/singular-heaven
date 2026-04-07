import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuTrigger,
} from "@/components/ui/context-menu";
import { Play, ListPlus, User, Disc3 } from "lucide-react";
import type { Track } from "../../types/music";

interface TrackContextMenuProps {
  track: Track;
  children: React.ReactNode;
  onPlay?: (track: Track) => void;
  onAddToQueue?: (track: Track) => void;
  onGoToArtist?: (artistId: string) => void;
  onGoToAlbum?: (albumId: string) => void;
}

export function TrackContextMenu({
  track,
  children,
  onPlay,
  onAddToQueue,
  onGoToArtist,
  onGoToAlbum,
}: TrackContextMenuProps) {
  return (
    <ContextMenu>
      <ContextMenuTrigger>{children}</ContextMenuTrigger>
      <ContextMenuContent>
        <ContextMenuItem onClick={() => onPlay?.(track)}>
          <Play className="mr-2 h-4 w-4" />
          Tocar
        </ContextMenuItem>
        <ContextMenuItem onClick={() => onAddToQueue?.(track)}>
          <ListPlus className="mr-2 h-4 w-4" />
          Tocar em seguida
        </ContextMenuItem>
        <ContextMenuSeparator />
        {track.artists[0]?.id && (
          <ContextMenuItem onClick={() => onGoToArtist?.(track.artists[0].id!)}>
            <User className="mr-2 h-4 w-4" />
            Ir para o artista
          </ContextMenuItem>
        )}
        {track.album && (
          <ContextMenuItem onClick={() => onGoToAlbum?.(track.album!.id)}>
            <Disc3 className="mr-2 h-4 w-4" />
            Ir para o álbum
          </ContextMenuItem>
        )}
      </ContextMenuContent>
    </ContextMenu>
  );
}
