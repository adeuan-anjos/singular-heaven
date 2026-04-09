import { useEffect, useState } from "react";
import { Loader2, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { usePlaylistLibraryStore } from "../../stores/playlist-library-store";

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
  const createPlaylist = usePlaylistLibraryStore((s) => s.createPlaylist);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!open) {
      setTitle("");
      setDescription("");
      setSubmitting(false);
    }
  }, [open]);

  const handleCreate = async () => {
    if (!title.trim()) return;
    setSubmitting(true);
    try {
      const playlistId = await createPlaylist(
        title.trim(),
        description.trim(),
        initialVideoIds
      );
      onCreated?.(playlistId);
      onOpenChange(false);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Nova playlist</DialogTitle>
          <DialogDescription>
            Crie uma playlist privada na sua biblioteca.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          <Input
            autoFocus
            value={title}
            onChange={(event) => setTitle(event.target.value)}
            placeholder="Nome da playlist"
          />
          <Input
            value={description}
            onChange={(event) => setDescription(event.target.value)}
            placeholder="Descrição (opcional)"
          />
        </div>

        <DialogFooter>
          <Button
            variant="default"
            onClick={handleCreate}
            disabled={!title.trim() || submitting}
          >
            {submitting ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <Plus className="mr-2 h-4 w-4" />
            )}
            Criar playlist
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
