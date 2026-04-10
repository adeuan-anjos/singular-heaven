import { PlaylistDetailsDialog } from "./playlist-details-dialog";

interface CreatePlaylistDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  initialVideoIds?: string[];
  onCreated?: (playlistId: string | null) => void;
}

export function CreatePlaylistDialog({
  open,
  onOpenChange,
  initialVideoIds = [],
  onCreated,
}: CreatePlaylistDialogProps) {
  return (
    <PlaylistDetailsDialog
      mode="create"
      open={open}
      onOpenChange={onOpenChange}
      initialVideoIds={initialVideoIds}
      onCreated={onCreated}
    />
  );
}
