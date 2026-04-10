import {
  ContextMenuGroup,
  ContextMenuItem,
  ContextMenuSeparator,
} from "@/components/ui/context-menu";
import {
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";
import { Disc3, ListEnd, Play, PlusSquare, Trash2, User } from "lucide-react";
import type { Track } from "../../types/music";

type MenuKind = "dropdown" | "context";

interface TrackActionsMenuProps {
  kind: MenuKind;
  track: Track;
  onPlay?: (track: Track) => void;
  onAddToQueue?: (track: Track) => void;
  onAddToPlaylist?: (track: Track) => void;
  onRemoveFromPlaylist?: (track: Track) => void;
  onGoToArtist?: (artistId: string) => void;
  onGoToAlbum?: (albumId: string) => void;
}

export function TrackActionsMenu({
  kind,
  track,
  onPlay,
  onAddToQueue,
  onAddToPlaylist,
  onRemoveFromPlaylist,
  onGoToArtist,
  onGoToAlbum,
}: TrackActionsMenuProps) {
  const Group = kind === "dropdown" ? DropdownMenuGroup : ContextMenuGroup;
  const Item = kind === "dropdown" ? DropdownMenuItem : ContextMenuItem;
  const Separator = kind === "dropdown" ? DropdownMenuSeparator : ContextMenuSeparator;

  const hasPlaylistActions = Boolean(onAddToPlaylist || (onRemoveFromPlaylist && track.setVideoId));
  const hasNavigationActions = Boolean(track.artists[0]?.id || track.album);

  return (
    <>
      <Group>
        <Item onClick={() => onPlay?.(track)}>
          <Play />
          Tocar
        </Item>
        <Item onClick={() => onAddToQueue?.(track)}>
          <ListEnd />
          Tocar a seguir
        </Item>
      </Group>

      {hasPlaylistActions ? <Separator /> : null}

      {hasPlaylistActions ? (
        <Group>
          {onAddToPlaylist ? (
            <Item onClick={() => onAddToPlaylist(track)}>
              <PlusSquare />
              Adicionar à playlist
            </Item>
          ) : null}
          {onRemoveFromPlaylist && track.setVideoId ? (
            <Item onClick={() => onRemoveFromPlaylist(track)} variant="destructive">
              <Trash2 />
              Remover da playlist
            </Item>
          ) : null}
        </Group>
      ) : null}

      {hasPlaylistActions && hasNavigationActions ? <Separator /> : null}

      {hasNavigationActions ? (
        <Group>
          {track.artists[0]?.id ? (
            <Item onClick={() => onGoToArtist?.(track.artists[0].id!)}>
              <User />
              Ir para o artista
            </Item>
          ) : null}
          {track.album ? (
            <Item onClick={() => onGoToAlbum?.(track.album!.id)}>
              <Disc3 />
              Ir para o álbum
            </Item>
          ) : null}
        </Group>
      ) : null}
    </>
  );
}
