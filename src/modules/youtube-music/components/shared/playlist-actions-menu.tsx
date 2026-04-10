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
import {
  CopyPlus,
  ListEnd,
  ListPlus,
  Share2,
  Shuffle,
  Trash2,
} from "lucide-react";

type MenuKind = "dropdown" | "context";

interface PlaylistActionsMenuProps {
  kind: MenuKind;
  showShuffle?: boolean;
  showPlayNext?: boolean;
  showAppendQueue?: boolean;
  showSavePlaylist?: boolean;
  showShare?: boolean;
  destructiveLabel?: string | null;
  disableShuffle?: boolean;
  disablePlayNext?: boolean;
  disableAppendQueue?: boolean;
  disableSavePlaylist?: boolean;
  disableShare?: boolean;
  disableDestructive?: boolean;
  onShufflePlay?: () => void;
  onPlayNext?: () => void;
  onAppendQueue?: () => void;
  onSavePlaylist?: () => void;
  onShare?: () => void;
  onDestructive?: () => void;
}

export function PlaylistActionsMenu({
  kind,
  showShuffle = false,
  showPlayNext = true,
  showAppendQueue = true,
  showSavePlaylist = true,
  showShare = true,
  destructiveLabel = null,
  disableShuffle = false,
  disablePlayNext = false,
  disableAppendQueue = false,
  disableSavePlaylist = false,
  disableShare = false,
  disableDestructive = false,
  onShufflePlay,
  onPlayNext,
  onAppendQueue,
  onSavePlaylist,
  onShare,
  onDestructive,
}: PlaylistActionsMenuProps) {
  const Group = kind === "dropdown" ? DropdownMenuGroup : ContextMenuGroup;
  const Item = kind === "dropdown" ? DropdownMenuItem : ContextMenuItem;
  const Separator = kind === "dropdown" ? DropdownMenuSeparator : ContextMenuSeparator;

  const hasPlaybackActions = showShuffle || showPlayNext || showAppendQueue;
  const hasPlaylistActions = showSavePlaylist || showShare;

  return (
    <>
      {hasPlaybackActions ? (
        <Group>
          {showShuffle ? (
            <Item onClick={onShufflePlay} disabled={disableShuffle}>
              <Shuffle />
              Aleatório
            </Item>
          ) : null}
          {showPlayNext ? (
            <Item onClick={onPlayNext} disabled={disablePlayNext}>
              <ListEnd />
              Tocar a seguir
            </Item>
          ) : null}
          {showAppendQueue ? (
            <Item onClick={onAppendQueue} disabled={disableAppendQueue}>
              <ListPlus />
              Adicionar à fila
            </Item>
          ) : null}
        </Group>
      ) : null}

      {hasPlaybackActions && (hasPlaylistActions || destructiveLabel) ? <Separator /> : null}

      {hasPlaylistActions ? (
        <Group>
          {showSavePlaylist ? (
            <Item onClick={onSavePlaylist} disabled={disableSavePlaylist}>
              <CopyPlus />
              Salvar na playlist
            </Item>
          ) : null}
          {showShare ? (
            <Item onClick={onShare} disabled={disableShare}>
              <Share2 />
              Compartilhar
            </Item>
          ) : null}
        </Group>
      ) : null}

      {hasPlaylistActions && destructiveLabel ? <Separator /> : null}

      {destructiveLabel ? (
        <Group>
          <Item
            onClick={onDestructive}
            disabled={disableDestructive}
            variant="destructive"
          >
            <Trash2 />
            {destructiveLabel}
          </Item>
        </Group>
      ) : null}
    </>
  );
}
