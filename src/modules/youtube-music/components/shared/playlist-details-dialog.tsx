import { useEffect, useId, useRef, useState } from "react";
import Cropper, { type Area } from "react-easy-crop";
import {
  ImagePlus,
  Loader2,
  PencilLine,
  Plus,
  Trash2,
} from "lucide-react";
import { toast } from "sonner";
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
import { Slider } from "@/components/ui/slider";
import { Textarea } from "@/components/ui/textarea";
import { usePlaylistLibraryStore } from "../../stores/playlist-library-store";
import {
  type PlaylistPrivacyStatus,
  ytLoadPlaylist,
} from "../../services/yt-api";
import { PlaylistPrivacySelector } from "./playlist-privacy-selector";

type Mode = "create" | "edit";

interface PlaylistDetailsDialogProps {
  mode: Mode;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  playlistId?: string | null;
  initialTitle?: string | null;
  initialDescription?: string | null;
  initialPrivacyStatus?: PlaylistPrivacyStatus | null;
  initialThumbnailUrl?: string | null;
  initialVideoIds?: string[];
  onCreated?: (playlistId: string | null) => void;
  onSaved?: (playlistId: string) => void;
}

interface SelectedImageState {
  objectUrl: string;
  mimeType: string;
  fileName: string;
}

interface CroppedImageResult {
  bytes: number[];
  previewUrl: string;
  mimeType: string;
}

const CROP_VIEWPORT_SIZE = 320;

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error("Não foi possível carregar a imagem selecionada."));
    image.src = src;
  });
}

async function cropImageToSquare(
  src: string,
  cropPixels: Area,
  mimeType: string
): Promise<CroppedImageResult> {
  const image = await loadImage(src);
  const canvas = document.createElement("canvas");
  const size = Math.max(360, Math.round(Math.min(cropPixels.width, cropPixels.height)));
  canvas.width = size;
  canvas.height = size;
  const context = canvas.getContext("2d");
  if (!context) {
    throw new Error("Não foi possível preparar o canvas de recorte.");
  }

  context.drawImage(
    image,
    cropPixels.x,
    cropPixels.y,
    cropPixels.width,
    cropPixels.height,
    0,
    0,
    size,
    size
  );

  const blob = await new Promise<Blob | null>((resolve) => {
    canvas.toBlob(resolve, mimeType, 0.92);
  });

  if (!blob) {
    throw new Error("Não foi possível gerar a imagem recortada.");
  }

  const bytes = Array.from(new Uint8Array(await blob.arrayBuffer()));
  return {
    bytes,
    previewUrl: URL.createObjectURL(blob),
    mimeType: blob.type || mimeType,
  };
}

export function PlaylistDetailsDialog({
  mode,
  open,
  onOpenChange,
  playlistId,
  initialTitle,
  initialDescription,
  initialPrivacyStatus,
  initialThumbnailUrl,
  initialVideoIds = [],
  onCreated,
  onSaved,
}: PlaylistDetailsDialogProps) {
  const createPlaylist = usePlaylistLibraryStore((s) => s.createPlaylist);
  const editPlaylist = usePlaylistLibraryStore((s) => s.editPlaylist);
  const setPlaylistThumbnail = usePlaylistLibraryStore((s) => s.setPlaylistThumbnail);
  const inputId = useId();
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [privacyStatus, setPrivacyStatus] =
    useState<PlaylistPrivacyStatus>("PRIVATE");
  const [loadingDetails, setLoadingDetails] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [currentThumbnailUrl, setCurrentThumbnailUrl] = useState<string | null>(null);
  const [selectedImage, setSelectedImage] = useState<SelectedImageState | null>(null);
  const [croppedPreviewUrl, setCroppedPreviewUrl] = useState<string | null>(null);
  const [crop, setCrop] = useState({ x: 0, y: 0 });
  const [zoom, setZoom] = useState(1);
  const [minZoom, setMinZoom] = useState(1);
  const [croppedAreaPixels, setCroppedAreaPixels] = useState<Area | null>(null);

  useEffect(() => {
    if (open) return;
    setTitle("");
    setDescription("");
    setPrivacyStatus("PRIVATE");
    setLoadingDetails(false);
    setSubmitting(false);
    setCurrentThumbnailUrl(null);
    setSelectedImage((previous) => {
      if (previous) URL.revokeObjectURL(previous.objectUrl);
      return null;
    });
    setCroppedPreviewUrl((previous) => {
      if (previous) URL.revokeObjectURL(previous);
      return null;
    });
    setCrop({ x: 0, y: 0 });
    setZoom(1);
    setMinZoom(1);
    setCroppedAreaPixels(null);
  }, [open]);

  useEffect(() => {
    if (!open) return;

    if (mode === "create") {
      setTitle(initialTitle ?? "");
      setDescription(initialDescription ?? "");
      setPrivacyStatus(initialPrivacyStatus ?? "PRIVATE");
      setCurrentThumbnailUrl(initialThumbnailUrl ?? null);
      return;
    }

    if (!playlistId) return;

    let cancelled = false;
    setTitle(initialTitle ?? "");
    setDescription(initialDescription ?? "");
    setPrivacyStatus(initialPrivacyStatus ?? "PRIVATE");
    setCurrentThumbnailUrl(initialThumbnailUrl ?? null);
    setLoadingDetails(true);

    void ytLoadPlaylist(playlistId)
      .then((playlist) => {
        if (cancelled) return;
        setTitle(playlist.title);
        setDescription(playlist.description ?? "");
        setPrivacyStatus(playlist.privacyStatus ?? "PRIVATE");
        setCurrentThumbnailUrl(
          playlist.thumbnails[playlist.thumbnails.length - 1]?.url ??
            playlist.thumbnails[0]?.url ??
            null
        );
      })
      .catch((error) => {
        console.error("[PlaylistDetailsDialog] load failed", error);
      })
      .finally(() => {
        if (!cancelled) setLoadingDetails(false);
      });

    return () => {
      cancelled = true;
    };
  }, [
    initialDescription,
    initialPrivacyStatus,
    initialThumbnailUrl,
    initialTitle,
    mode,
    open,
    playlistId,
  ]);

  const handleSelectImage = async (
    event: React.ChangeEvent<HTMLInputElement>
  ) => {
    const file = event.target.files?.[0];
    if (!file) return;

    if (!/^image\/(png|jpeg|jpg|webp)$/i.test(file.type)) {
      toast.error("Escolha uma imagem PNG, JPG ou WEBP.");
      event.target.value = "";
      return;
    }

    if (file.size > 15 * 1024 * 1024) {
      toast.error("A imagem deve ter no máximo 15 MB.");
      event.target.value = "";
      return;
    }

    const objectUrl = URL.createObjectURL(file);
    try {
      const image = await loadImage(objectUrl);
      if (image.naturalWidth < 360 || image.naturalHeight < 360) {
        toast.error("A imagem precisa ter pelo menos 360 x 360 pixels.");
        URL.revokeObjectURL(objectUrl);
        event.target.value = "";
        return;
      }

      setSelectedImage((previous) => {
        if (previous) URL.revokeObjectURL(previous.objectUrl);
        return {
          objectUrl,
          mimeType: file.type || "image/png",
          fileName: file.name,
        };
      });
      setCroppedPreviewUrl((previous) => {
        if (previous) URL.revokeObjectURL(previous);
        return null;
      });
      setCrop({ x: 0, y: 0 });
      setZoom(1);
      setCroppedAreaPixels(null);
      console.log(
        `[PlaylistDetailsDialog] image selected ${JSON.stringify({
          mode,
          fileName: file.name,
          size: file.size,
          mimeType: file.type,
        })}`
      );
    } catch (error) {
      URL.revokeObjectURL(objectUrl);
      toast.error(
        error instanceof Error ? error.message : "Não foi possível abrir a imagem."
      );
    } finally {
      event.target.value = "";
    }
  };

  const handleSave = async () => {
    if (!title.trim()) return;

    setSubmitting(true);
    let nextPlaylistId = playlistId ?? null;
    let croppedImage: CroppedImageResult | null = null;

    try {
      if (selectedImage && croppedAreaPixels) {
        croppedImage = await cropImageToSquare(
          selectedImage.objectUrl,
          croppedAreaPixels,
          selectedImage.mimeType
        );
        setCroppedPreviewUrl((previous) => {
          if (previous) URL.revokeObjectURL(previous);
          return croppedImage?.previewUrl ?? null;
        });
      }

      if (mode === "create") {
        console.log(
          `[PlaylistDetailsDialog] create submit ${JSON.stringify({
            title: title.trim(),
            privacyStatus,
            initialVideoIds: initialVideoIds.length,
            hasThumbnail: Boolean(croppedImage),
          })}`
        );
        nextPlaylistId = await createPlaylist(
          title.trim(),
          description.trim(),
          initialVideoIds,
          privacyStatus
        );
      } else {
        if (!nextPlaylistId) {
          throw new Error("Playlist inválida para edição.");
        }
        console.log(
          `[PlaylistDetailsDialog] edit submit ${JSON.stringify({
            playlistId: nextPlaylistId,
            privacyStatus,
            hasThumbnail: Boolean(croppedImage),
          })}`
        );
        await editPlaylist(nextPlaylistId, {
          title: title.trim(),
          description: description.trim() || null,
          privacyStatus,
        });
      }

      if (nextPlaylistId && croppedImage) {
        console.log(
          `[PlaylistDetailsDialog] thumbnail submit ${JSON.stringify({
            playlistId: nextPlaylistId,
            bytes: croppedImage.bytes.length,
            mimeType: croppedImage.mimeType,
            mode,
          })}`
        );
        await setPlaylistThumbnail(
          nextPlaylistId,
          croppedImage.bytes,
          croppedImage.mimeType
        );
      }

      if (!nextPlaylistId) {
        throw new Error("Não foi possível resolver a playlist salva.");
      }

      if (mode === "create") {
        onCreated?.(nextPlaylistId);
      }
      toast.success(
        mode === "create"
          ? "Playlist criada com sucesso."
          : "Playlist atualizada com sucesso."
      );
      onSaved?.(nextPlaylistId);
      onOpenChange(false);
    } catch (error) {
      toast.error(
        error instanceof Error
          ? error.message
          : mode === "create"
            ? "Não foi possível criar a playlist."
            : "Não foi possível editar a playlist."
      );
    } finally {
      if (croppedImage) {
        URL.revokeObjectURL(croppedImage.previewUrl);
      }
      setSubmitting(false);
    }
  };

  const displayThumbnailUrl =
    croppedPreviewUrl ??
    selectedImage?.objectUrl ??
    currentThumbnailUrl ??
    null;

  const handleClearSelectedImage = () => {
    setSelectedImage((previous) => {
      if (previous) URL.revokeObjectURL(previous.objectUrl);
      return null;
    });
    setCroppedPreviewUrl((previous) => {
      if (previous) URL.revokeObjectURL(previous);
      return null;
    });
    setCrop({ x: 0, y: 0 });
    setZoom(1);
    setMinZoom(1);
    setCroppedAreaPixels(null);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:w-fit sm:max-w-fit">
        <DialogHeader className="border-b pb-3">
          <DialogTitle>
            {mode === "create" ? "Nova playlist" : "Editar playlist"}
          </DialogTitle>
          <DialogDescription>
            {mode === "create"
              ? "Defina os detalhes e a capa da nova playlist."
              : "Edite os detalhes e a capa da playlist."}
          </DialogDescription>
        </DialogHeader>

        {loadingDetails ? (
          <div className="flex items-center justify-center py-16">
            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
          </div>
        ) : (
          <div className="grid gap-4 lg:grid-cols-[18rem_auto]">
            <div className="flex flex-col border-b pb-5 lg:border-r lg:border-b-0 lg:pb-0 lg:pr-5">
                <div className="space-y-2">
                  <p className="text-sm font-medium">Título</p>
                  <Input
                    autoFocus
                    value={title}
                    onChange={(event) => setTitle(event.target.value)}
                    placeholder="Nome da playlist"
                    disabled={submitting}
                  />
                </div>

                <div className="mt-4 flex flex-1 flex-col space-y-2">
                  <p className="text-sm font-medium">Descrição</p>
                  <Textarea
                    value={description}
                    onChange={(event) => setDescription(event.target.value)}
                    placeholder="Descrição (opcional)"
                    disabled={submitting}
                    className="min-h-24 flex-1"
                  />
                </div>

                <div className="mt-4">
                  <PlaylistPrivacySelector
                    value={privacyStatus}
                    onValueChange={setPrivacyStatus}
                    disabled={submitting}
                  />
                </div>
            </div>

            <div className="space-y-4 lg:w-fit">
              <div className="space-y-2">
                <p className="text-sm font-medium">Capa</p>
                <input
                  id={inputId}
                  ref={fileInputRef}
                  type="file"
                  accept="image/png,image/jpeg,image/jpg,image/webp"
                  className="sr-only"
                  onChange={handleSelectImage}
                />

                <div className="w-80 max-w-full">
                  <div
                    className={`group relative w-full overflow-hidden ${
                      selectedImage
                        ? "aspect-square rounded-md border bg-muted"
                        : "aspect-square rounded-md border bg-muted"
                    }`}
                  >
                    {selectedImage ? (
                      <div className="relative h-full w-full">
                        <Cropper
                          image={selectedImage.objectUrl}
                          crop={crop}
                          zoom={zoom}
                          minZoom={minZoom}
                          aspect={1}
                          cropSize={{ width: CROP_VIEWPORT_SIZE, height: CROP_VIEWPORT_SIZE }}
                          showGrid={false}
                          onCropChange={setCrop}
                          onZoomChange={setZoom}
                          onMediaLoaded={(mediaSize) => {
                            const coverZoom = CROP_VIEWPORT_SIZE / Math.min(mediaSize.width, mediaSize.height);
                            const newMin = Math.max(1, coverZoom);
                            setMinZoom(newMin);
                            setZoom(newMin);
                          }}
                          onCropComplete={(_, croppedPixels) =>
                            setCroppedAreaPixels(croppedPixels)
                          }
                        />
                      </div>
                    ) : (
                      <button
                        type="button"
                        className="block h-full w-full"
                        onClick={() => fileInputRef.current?.click()}
                        disabled={submitting}
                      >
                        {displayThumbnailUrl ? (
                        <img
                          referrerPolicy="no-referrer"
                          src={displayThumbnailUrl}
                          alt={title || "Capa da playlist"}
                          className="h-full w-full object-cover"
                        />
                        ) : (
                        <div className="flex h-full w-full flex-col items-center justify-center gap-3 text-muted-foreground">
                          <ImagePlus className="h-10 w-10" />
                          <div className="space-y-1 text-center">
                            <p className="text-sm font-medium text-foreground">
                              Escolher imagem
                            </p>
                            <p className="text-xs text-muted-foreground">
                              PNG, JPG ou WEBP, mínimo 360 x 360.
                            </p>
                          </div>
                        </div>
                        )}
                      </button>
                    )}

                    <div
                      className={`pointer-events-none absolute inset-0 transition ${
                        selectedImage ? "bg-black/0" : "bg-black/0 group-hover:bg-black/10"
                      }`}
                    />

                    {selectedImage && (
                      <div className="absolute right-0 bottom-0 left-0 z-10 px-4 pb-14 pt-8 bg-gradient-to-t from-black/60 to-transparent">
                        <Slider
                          min={minZoom}
                          max={minZoom + 2}
                          step={0.01}
                          value={[zoom]}
                          onValueChange={(value) =>
                            setZoom(
                              Array.isArray(value)
                                ? (value[0] ?? 1)
                                : value
                            )
                          }
                        />
                      </div>
                    )}

                    <Button
                      type="button"
                      size="icon"
                      variant="outline"
                      className="absolute right-3 top-3 z-20 h-12 w-12 rounded-full bg-background/95 shadow-sm"
                      onClick={() =>
                        selectedImage
                          ? handleClearSelectedImage()
                          : fileInputRef.current?.click()
                      }
                      disabled={submitting}
                    >
                      {selectedImage ? (
                        <Trash2 className="h-5 w-5" />
                      ) : (
                        <PencilLine className="h-5 w-5" />
                      )}
                    </Button>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={submitting}>
            Cancelar
          </Button>
          <Button
            variant="default"
            onClick={handleSave}
            disabled={loadingDetails || submitting || !title.trim()}
          >
            {submitting ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : mode === "create" ? (
              <Plus className="mr-2 h-4 w-4" />
            ) : (
              <PencilLine className="mr-2 h-4 w-4" />
            )}
            {mode === "create" ? "Criar playlist" : "Salvar alterações"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
