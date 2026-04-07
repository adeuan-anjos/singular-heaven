import { useState } from "react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Separator } from "@/components/ui/separator";
import { TrackContextMenu } from "./track-context-menu";
import {
  Ellipsis,
  Play,
  Pause,
  ListPlus,
  ListEnd,
  User,
  Disc3,
  Heart,
} from "lucide-react";
import type { Track } from "../../types/music";

interface TrackTableProps {
  tracks: Track[];
  currentTrackId?: string;
  isPlaying?: boolean;
  showViews?: boolean;
  onPlay?: (track: Track) => void;
  onAddToQueue?: (track: Track) => void;
  onGoToArtist?: (artistId: string) => void;
  onGoToAlbum?: (albumId: string) => void;
}

// Col 1: # (2.5rem) | Col 2: thumb (2.5rem) | Col 3: title+actions (1fr)
// Col 4: artist (1fr) | Col 5: album (1fr) | [Col 6: views (1fr)] | Col 7: duration (3.5rem)
const GRID_COLUMNS_BASE = "2.5rem 2.5rem 1fr 1fr 1fr 3.5rem";
const GRID_COLUMNS_WITH_VIEWS = "2.5rem 2.5rem 1fr 1fr 1fr 1fr 3.5rem";

function TrackTableHeader({ showViews }: { showViews: boolean }) {
  const gridTemplateColumns = showViews ? GRID_COLUMNS_WITH_VIEWS : GRID_COLUMNS_BASE;
  return (
    <>
      <div
        className="items-center gap-x-3 px-2 pb-2"
        style={{ display: "grid", gridTemplateColumns }}
      >
        <span className="text-center text-xs uppercase tracking-wider text-muted-foreground">
          #
        </span>
        {/* thumbnail column — no header */}
        <span />
        <span className="text-xs uppercase tracking-wider text-muted-foreground">
          Título
        </span>
        <span className="text-xs uppercase tracking-wider text-muted-foreground">
          Artista
        </span>
        <span className="text-xs uppercase tracking-wider text-muted-foreground">
          Álbum
        </span>
        {showViews && (
          <span className="text-xs uppercase tracking-wider text-muted-foreground">
            Reproduções
          </span>
        )}
        <span className="text-right text-xs uppercase tracking-wider text-muted-foreground">
          Dur.
        </span>
      </div>
      <Separator />
    </>
  );
}

interface TrackTableRowProps {
  track: Track;
  index: number;
  isCurrent: boolean;
  isPlaying: boolean;
  showViews: boolean;
  onPlay?: (track: Track) => void;
  onAddToQueue?: (track: Track) => void;
  onGoToArtist?: (artistId: string) => void;
  onGoToAlbum?: (albumId: string) => void;
}

function TrackTableRow({
  track,
  index,
  isCurrent,
  isPlaying,
  showViews,
  onPlay,
  onAddToQueue,
  onGoToArtist,
  onGoToAlbum,
}: TrackTableRowProps) {
  const [liked, setLiked] = useState(track.likeStatus === "LIKE");
  const imgUrl = track.thumbnails[0]?.url ?? "";
  const artistName = track.artists.map((a) => a.name).join(", ");

  const gridTemplateColumns = showViews ? GRID_COLUMNS_WITH_VIEWS : GRID_COLUMNS_BASE;

  return (
    <TrackContextMenu
      track={track}
      onPlay={onPlay}
      onAddToQueue={onAddToQueue}
      onGoToArtist={onGoToArtist}
      onGoToAlbum={onGoToAlbum}
    >
      <div
        className={`group items-center gap-x-3 rounded-md px-2 py-1.5 hover:bg-accent/50 ${isCurrent ? "bg-accent/50" : ""}`}
        style={{ display: "grid", gridTemplateColumns }}
        onDoubleClick={() => onPlay?.(track)}
      >
        {/* Col 1: # / equalizer / play-pause */}
        <div className="flex items-center justify-center">
          <div className="group-hover:hidden">
            {isCurrent && isPlaying ? (
              <div className="equalizer">
                <span />
                <span />
                <span />
              </div>
            ) : (
              <span className="text-sm text-muted-foreground">{index + 1}</span>
            )}
          </div>
          <button
            type="button"
            className="hidden items-center justify-center group-hover:flex"
            onClick={() => onPlay?.(track)}
          >
            {isCurrent && isPlaying ? (
              <Pause className="h-4 w-4 text-foreground" />
            ) : (
              <Play className="h-4 w-4 text-foreground" />
            )}
          </button>
        </div>

        {/* Col 2: Thumbnail — 40px square */}
        <div className="flex h-10 w-10 shrink-0 items-center justify-center overflow-hidden rounded-sm bg-muted">
          {imgUrl ? (
            <img
              src={imgUrl}
              alt={track.title}
              className="h-full w-full object-cover"
            />
          ) : (
            <span className="text-sm text-muted-foreground">
              {track.title.charAt(0)}
            </span>
          )}
        </div>

        {/* Col 3: Title + ♥ + ⋯ — all inline, actions always visible (dimmed, full opacity on row hover) */}
        <div className="flex min-w-0 items-center gap-1">
          <span
            className={`flex-1 truncate text-sm font-medium ${isCurrent ? "text-primary" : "text-foreground"}`}
          >
            {track.title}
          </span>
          <Button
            variant="ghost"
            size="icon"
            className="h-7 w-7 shrink-0 opacity-50 group-hover:opacity-100"
            onClick={(e) => {
              e.stopPropagation();
              setLiked(!liked);
            }}
            aria-label="Curtir"
          >
            <Heart
              className={`h-4 w-4 ${liked ? "fill-red-500 text-red-500" : ""}`}
            />
          </Button>
          <DropdownMenu>
            <DropdownMenuTrigger
              render={
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-7 w-7 shrink-0 opacity-50 group-hover:opacity-100"
                  onClick={(e) => e.stopPropagation()}
                />
              }
            >
              <Ellipsis className="h-4 w-4" />
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onClick={() => onPlay?.(track)}>
                <Play className="mr-2 h-4 w-4" />
                Tocar
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => onAddToQueue?.(track)}>
                <ListEnd className="mr-2 h-4 w-4" />
                Tocar em seguida
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => onAddToQueue?.(track)}>
                <ListPlus className="mr-2 h-4 w-4" />
                Adicionar à fila
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              {track.artists[0]?.id && (
                <DropdownMenuItem
                  onClick={() => onGoToArtist?.(track.artists[0].id!)}
                >
                  <User className="mr-2 h-4 w-4" />
                  Ir para o artista
                </DropdownMenuItem>
              )}
              {track.album && (
                <DropdownMenuItem
                  onClick={() => onGoToAlbum?.(track.album!.id)}
                >
                  <Disc3 className="mr-2 h-4 w-4" />
                  Ir para o álbum
                </DropdownMenuItem>
              )}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>

        {/* Col 4: Artist */}
        <p className="truncate text-sm text-muted-foreground">
          <button
            type="button"
            className="hover:underline"
            onClick={(e) => {
              e.stopPropagation();
              track.artists[0]?.id && onGoToArtist?.(track.artists[0].id);
            }}
          >
            {artistName}
          </button>
        </p>

        {/* Col 5: Album */}
        <p className="truncate text-sm text-muted-foreground">
          {track.album ? (
            <button
              type="button"
              className="hover:underline"
              onClick={(e) => {
                e.stopPropagation();
                onGoToAlbum?.(track.album!.id);
              }}
            >
              {track.album.name}
            </button>
          ) : (
            <span>&mdash;</span>
          )}
        </p>

        {/* Col 6 (optional): Views */}
        {showViews && (
          <span className="truncate text-sm text-muted-foreground">
            {track.views ?? "—"}
          </span>
        )}

        {/* Col 6/7: Duration */}
        <span className="text-right text-xs text-muted-foreground">
          {track.duration}
        </span>
      </div>
    </TrackContextMenu>
  );
}

export function TrackTable({
  tracks,
  currentTrackId,
  isPlaying = false,
  showViews = false,
  onPlay,
  onAddToQueue,
  onGoToArtist,
  onGoToAlbum,
}: TrackTableProps) {
  if (tracks.length === 0) return null;

  return (
    <div>
      <TrackTableHeader showViews={showViews} />
      <div className="mt-1 space-y-0.5">
        {tracks.map((track, i) => (
          <TrackTableRow
            key={track.videoId}
            track={track}
            index={i}
            isCurrent={currentTrackId === track.videoId}
            isPlaying={currentTrackId === track.videoId && isPlaying}
            showViews={showViews}
            onPlay={onPlay}
            onAddToQueue={onAddToQueue}
            onGoToArtist={onGoToArtist}
            onGoToAlbum={onGoToAlbum}
          />
        ))}
      </div>
    </div>
  );
}
