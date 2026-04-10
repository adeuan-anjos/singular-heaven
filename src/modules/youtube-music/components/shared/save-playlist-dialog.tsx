import { useEffect, useMemo, useState } from "react";
import { Loader2, Plus } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { usePlaylistLibraryStore } from "../../stores/playlist-library-store";
import { ytAddPlaylistItems, ytGetPlaylistTrackIdsComplete } from "../../services/yt-api";
import { CreatePlaylistDialog } from "./create-playlist-dialog";

type DuplicatePolicy = "allow" | "avoid";

interface SavePlaylistDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  sourcePlaylistId: string | null;
  sourcePlaylistTitle: string | null;
}

export function SavePlaylistDialog({
  open,
  onOpenChange,
  sourcePlaylistId,
  sourcePlaylistTitle,
}: SavePlaylistDialogProps) {
  const playlists = usePlaylistLibraryStore((s) => s.playlists);
  const hydrate = usePlaylistLibraryStore((s) => s.hydrate);
  const [query, setQuery] = useState("");
  const [pendingPlaylistId, setPendingPlaylistId] = useState<string | null>(null);
  const [duplicatePolicy, setDuplicatePolicy] = useState<DuplicatePolicy>("allow");
  const [createDialogOpen, setCreateDialogOpen] = useState(false);

  useEffect(() => {
    if (!open) {
      setQuery("");
      setPendingPlaylistId(null);
      setDuplicatePolicy("allow");
      setCreateDialogOpen(false);
      return;
    }
    console.log(
      `[SavePlaylistDialog] opened ${JSON.stringify({
        sourcePlaylistId,
        sourcePlaylistTitle,
      })}`
    );
    void hydrate(false, "save-playlist-open");
  }, [hydrate, open, sourcePlaylistId, sourcePlaylistTitle]);

  const filteredPlaylists = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    return playlists.filter((playlist) => {
      if (playlist.isSpecial || !playlist.isEditable) return false;
      if (playlist.playlistId === sourcePlaylistId) return false;
      if (!normalized) return true;
      return playlist.title.toLowerCase().includes(normalized);
    });
  }, [playlists, query, sourcePlaylistId]);

  const copyPlaylist = async (targetPlaylistId: string): Promise<"copied" | "noop"> => {
    if (!sourcePlaylistId) return "noop";

    if (duplicatePolicy === "allow") {
      console.log(
        `[SavePlaylistDialog] copy allow duplicates ${JSON.stringify({
          sourcePlaylistId,
          targetPlaylistId,
        })}`
      );
      await ytAddPlaylistItems(targetPlaylistId, [], sourcePlaylistId);
      return "copied";
    }

    const [source, target] = await Promise.all([
      ytGetPlaylistTrackIdsComplete(sourcePlaylistId),
      ytGetPlaylistTrackIdsComplete(targetPlaylistId),
    ]);

    const targetIds = new Set(target.trackIds);
    const missing = source.trackIds.filter((videoId) => !targetIds.has(videoId));

    console.log(
      `[SavePlaylistDialog] copy avoid duplicates ${JSON.stringify({
        sourcePlaylistId,
        targetPlaylistId,
        sourceTrackIds: source.trackIds.length,
        targetTrackIds: target.trackIds.length,
        filteredTrackIds: missing.length,
      })}`
    );

    if (missing.length === 0) {
      toast.info("A playlist destino já contém todas as músicas.");
      return "noop";
    }

    await ytAddPlaylistItems(targetPlaylistId, missing);
    return "copied";
  };

  const handleSave = async (targetPlaylistId: string) => {
    if (!sourcePlaylistId) return;
    console.log(
      `[SavePlaylistDialog] save click ${JSON.stringify({
        sourcePlaylistId,
        targetPlaylistId,
        duplicatePolicy,
      })}`
    );
    setPendingPlaylistId(targetPlaylistId);
    try {
      const result = await copyPlaylist(targetPlaylistId);
      if (result === "noop") {
        return;
      }
      toast.success("Playlist salva com sucesso.");
      onOpenChange(false);
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Não foi possível salvar a playlist."
      );
    } finally {
      setPendingPlaylistId(null);
    }
  };

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>Salvar na playlist</DialogTitle>
          <DialogDescription>
            {sourcePlaylistTitle
              ? `Escolha uma playlist para copiar “${sourcePlaylistTitle}”.`
              : "Escolha uma playlist destino."}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-2">
            <p className="text-sm font-medium">Duplicatas</p>
            <div className="flex gap-2">
              <Button
                type="button"
                  variant={duplicatePolicy === "allow" ? "default" : "outline"}
                onClick={() => {
                  console.log("[SavePlaylistDialog] duplicate policy allow");
                  setDuplicatePolicy("allow");
                }}
                className="flex-1"
              >
                Permitir duplicatas
              </Button>
              <Button
                type="button"
                  variant={duplicatePolicy === "avoid" ? "default" : "outline"}
                onClick={() => {
                  console.log("[SavePlaylistDialog] duplicate policy avoid");
                  setDuplicatePolicy("avoid");
                }}
                className="flex-1"
              >
                Evitar novas duplicatas
              </Button>
            </div>
          </div>

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
                  onClick={() => void handleSave(playlist.playlistId)}
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
            <div className="space-y-2">
              <p className="text-sm font-medium">Nova playlist</p>
              <p className="text-sm text-muted-foreground">
                Abra o card completo de criação para definir nome, descrição, privacidade e capa antes de copiar esta playlist.
              </p>
              <Button
                variant="outline"
                onClick={() => setCreateDialogOpen(true)}
                disabled={Boolean(pendingPlaylistId)}
              >
                <Plus className="mr-2 h-4 w-4" />
                Criar nova playlist
              </Button>
            </div>
          </div>
        </div>
        </DialogContent>
      </Dialog>

      <CreatePlaylistDialog
        open={createDialogOpen}
        onOpenChange={setCreateDialogOpen}
        onCreated={(playlistId) => {
          if (!playlistId || !sourcePlaylistId) return;
          setPendingPlaylistId("__create__");
          console.log(
            `[SavePlaylistDialog] create and save ${JSON.stringify({
              sourcePlaylistId,
              targetPlaylistId: playlistId,
              duplicatePolicy,
            })}`
          );
          void ytAddPlaylistItems(playlistId, [], sourcePlaylistId)
            .then(() => {
              toast.success("Playlist criada e preenchida com sucesso.");
              setCreateDialogOpen(false);
              onOpenChange(false);
            })
            .catch((error) => {
              toast.error(
                error instanceof Error
                  ? error.message
                  : "Não foi possível preencher a nova playlist."
              );
            })
            .finally(() => {
              setPendingPlaylistId(null);
            });
        }}
      />
    </>
  );
}
