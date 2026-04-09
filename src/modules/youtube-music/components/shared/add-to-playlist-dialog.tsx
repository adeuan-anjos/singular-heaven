import { useEffect, useMemo, useState } from "react";
import { Loader2, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import type { Track } from "../../types/music";
import { usePlaylistLibraryStore } from "../../stores/playlist-library-store";
import { ytAddPlaylistItems } from "../../services/yt-api";

interface AddToPlaylistDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  track: Track | null;
}

export function AddToPlaylistDialog({
  open,
  onOpenChange,
  track,
}: AddToPlaylistDialogProps) {
  const playlists = usePlaylistLibraryStore((s) => s.playlists);
  const hydrate = usePlaylistLibraryStore((s) => s.hydrate);
  const createPlaylist = usePlaylistLibraryStore((s) => s.createPlaylist);
  const [query, setQuery] = useState("");
  const [creating, setCreating] = useState(false);
  const [createTitle, setCreateTitle] = useState("");
  const [pendingPlaylistId, setPendingPlaylistId] = useState<string | null>(null);

  useEffect(() => {
    if (!open) {
      setQuery("");
      setCreating(false);
      setCreateTitle("");
      setPendingPlaylistId(null);
      return;
    }
    void hydrate(false, "add-to-playlist-open");
  }, [hydrate, open]);

  const filteredPlaylists = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    return playlists.filter((playlist) => {
      if (playlist.isSpecial || !playlist.isEditable) return false;
      if (!normalized) return true;
      return playlist.title.toLowerCase().includes(normalized);
    });
  }, [playlists, query]);

  const handleAdd = async (playlistId: string) => {
    if (!track) return;
    setPendingPlaylistId(playlistId);
    try {
      await ytAddPlaylistItems(playlistId, [track.videoId]);
      onOpenChange(false);
    } finally {
      setPendingPlaylistId(null);
    }
  };

  const handleCreateAndAdd = async () => {
    if (!track || !createTitle.trim()) return;
    setPendingPlaylistId("__create__");
    try {
      await createPlaylist(createTitle.trim(), "", [track.videoId]);
      onOpenChange(false);
    } finally {
      setPendingPlaylistId(null);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Adicionar à playlist</DialogTitle>
          <DialogDescription>
            {track ? `Escolha uma playlist para “${track.title}”.` : "Escolha uma playlist."}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          <Input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Buscar playlist"
          />

          <div className="max-h-72 space-y-1 overflow-y-auto rounded-md border p-2">
            {filteredPlaylists.length === 0 ? (
              <p className="px-2 py-6 text-sm text-muted-foreground">
                Nenhuma playlist encontrada.
              </p>
            ) : (
              filteredPlaylists.map((playlist) => (
                <button
                  key={playlist.playlistId}
                  type="button"
                  className="flex w-full items-center justify-between rounded-md px-2 py-2 text-left text-sm hover:bg-muted"
                  onClick={() => void handleAdd(playlist.playlistId)}
                  disabled={Boolean(pendingPlaylistId)}
                >
                  <span className="truncate">{playlist.title}</span>
                  {pendingPlaylistId === playlist.playlistId ? (
                    <Loader2 className="ml-2 h-4 w-4 animate-spin" />
                  ) : null}
                </button>
              ))
            )}
          </div>

          <div className="rounded-md border p-3">
            <div className="mb-2 flex items-center justify-between">
              <p className="text-sm font-medium">Nova playlist</p>
              <Button
                variant="ghost"
                size="icon-sm"
                onClick={() => setCreating((value) => !value)}
              >
                <Plus className="h-4 w-4" />
              </Button>
            </div>
            {creating ? (
              <div className="space-y-2">
                <Input
                  value={createTitle}
                  onChange={(event) => setCreateTitle(event.target.value)}
                  placeholder="Nome da playlist"
                />
                <Button
                  variant="outline"
                  onClick={() => void handleCreateAndAdd()}
                  disabled={!createTitle.trim() || pendingPlaylistId === "__create__"}
                >
                  {pendingPlaylistId === "__create__" ? (
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  ) : (
                    <Plus className="mr-2 h-4 w-4" />
                  )}
                  Criar e adicionar
                </Button>
              </div>
            ) : null}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
