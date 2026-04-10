import type { PlaylistPrivacyStatus } from "../../services/yt-api";
import { PlaylistDetailsDialog } from "./playlist-details-dialog";

interface EditPlaylistDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  playlistId: string | null;
  initialTitle?: string | null;
  initialDescription?: string | null;
  initialPrivacyStatus?: PlaylistPrivacyStatus | null;
  initialThumbnailUrl?: string | null;
  onSaved?: (playlistId: string) => void;
}

export function EditPlaylistDialog({
  open,
  onOpenChange,
  playlistId,
  initialTitle,
  initialDescription,
  initialPrivacyStatus,
  initialThumbnailUrl,
  onSaved,
}: EditPlaylistDialogProps) {
  return (
    <PlaylistDetailsDialog
      mode="edit"
      open={open}
      onOpenChange={onOpenChange}
      playlistId={playlistId}
      initialTitle={initialTitle}
      initialDescription={initialDescription}
      initialPrivacyStatus={initialPrivacyStatus}
      initialThumbnailUrl={initialThumbnailUrl}
      onSaved={onSaved}
    />
  );
}
