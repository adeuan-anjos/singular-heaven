import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuTrigger,
} from "@/components/ui/context-menu";
import type { Track } from "../../types/music";
import { TrackActionsMenu } from "./track-actions-menu";

interface TrackContextMenuProps {
  track: Track;
  children: React.ReactNode;
  onPlay?: (track: Track) => void;
  onAddToQueue?: (track: Track) => void;
  onAddToPlaylist?: (track: Track) => void;
  onRemoveFromPlaylist?: (track: Track) => void;
  onGoToArtist?: (artistId: string) => void;
  onGoToAlbum?: (albumId: string) => void;
  onStartRadio?: (track: Track) => void;
}

export function TrackContextMenu({
  track,
  children,
  onPlay,
  onAddToQueue,
  onAddToPlaylist,
  onRemoveFromPlaylist,
  onGoToArtist,
  onGoToAlbum,
  onStartRadio,
}: TrackContextMenuProps) {
  return (
    <ContextMenu>
      <ContextMenuTrigger>{children}</ContextMenuTrigger>
      <ContextMenuContent className="w-56">
        <TrackActionsMenu
          kind="context"
          track={track}
          onPlay={onPlay}
          onAddToQueue={onAddToQueue}
          onAddToPlaylist={onAddToPlaylist}
          onRemoveFromPlaylist={onRemoveFromPlaylist}
          onGoToArtist={onGoToArtist}
          onGoToAlbum={onGoToAlbum}
          onStartRadio={onStartRadio}
        />
      </ContextMenuContent>
    </ContextMenu>
  );
}
