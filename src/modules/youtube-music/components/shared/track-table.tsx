import React, { useState, useRef, useEffect } from "react";
import { useVirtualizer } from "@tanstack/react-virtual";
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
import { thumbUrl } from "../../utils/thumb-url";

interface TrackTableProps {
  tracks: Track[];
  currentTrackId?: string;
  isPlaying?: boolean;
  showViews?: boolean;
  enableVirtualization?: boolean;
  /** Content rendered inside the scroll container, above the track list (scrolls with it). */
  headerContent?: React.ReactNode;
  onEndReached?: () => void;
  onPlay?: (track: Track) => void;
  onAddToQueue?: (track: Track) => void;
  onGoToArtist?: (artistId: string) => void;
  onGoToAlbum?: (albumId: string) => void;
}

// Col 1: # (2.5rem) | Col 2: thumb (2.5rem) | Col 3: title+actions (1fr)
// Col 4: artist (1fr) | Col 5: album (1fr) | [Col 6: views (1fr)] | Col 7: duration (3.5rem)
const GRID_COLUMNS_BASE = "2.5rem 2.5rem 1fr 1fr 1fr 3.5rem";
const GRID_COLUMNS_WITH_VIEWS = "2.5rem 2.5rem 1fr 1fr 1fr 1fr 3.5rem";
const GRID_COLUMNS_NO_DUR = "2.5rem 2.5rem 1fr 1fr 1fr";
const GRID_COLUMNS_VIEWS_NO_DUR = "2.5rem 2.5rem 1fr 1fr 1fr 1fr";

function TrackTableHeader({ showViews, showDuration = true }: { showViews: boolean; showDuration?: boolean }) {
  const gridTemplateColumns = showViews
    ? (showDuration ? GRID_COLUMNS_WITH_VIEWS : GRID_COLUMNS_VIEWS_NO_DUR)
    : (showDuration ? GRID_COLUMNS_BASE : GRID_COLUMNS_NO_DUR);
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
        {showDuration && (
          <span className="text-right text-xs uppercase tracking-wider text-muted-foreground">
            Dur.
          </span>
        )}
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
  showDuration?: boolean;
  onPlay?: (track: Track) => void;
  onAddToQueue?: (track: Track) => void;
  onGoToArtist?: (artistId: string) => void;
  onGoToAlbum?: (albumId: string) => void;
}

const TrackTableRow = React.memo(function TrackTableRow({
  track,
  index,
  isCurrent,
  isPlaying,
  showViews,
  showDuration = true,
  onPlay,
  onAddToQueue,
  onGoToArtist,
  onGoToAlbum,
}: TrackTableRowProps) {
  const [liked, setLiked] = useState(track.likeStatus === "LIKE");
  // Use the SMALLEST thumbnail (60x60) for track rows — displayed at 40x40px.
  // Using the 544x544 version wastes ~1.18MB per image in Chromium's decode cache.
  const imgUrl = track.thumbnails[0]?.url ?? "";
  const artistName = track.artists.map((a) => a.name).join(", ");

  const gridTemplateColumns = showViews
    ? (showDuration ? GRID_COLUMNS_WITH_VIEWS : GRID_COLUMNS_VIEWS_NO_DUR)
    : (showDuration ? GRID_COLUMNS_BASE : GRID_COLUMNS_NO_DUR);

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
              src={thumbUrl(imgUrl, 80)}
              alt={track.title}
              className="h-full w-full object-cover"
              loading="lazy"
              decoding="async"
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
        {showDuration && (
          <span className="text-right text-xs text-muted-foreground">
            {track.duration}
          </span>
        )}
      </div>
    </TrackContextMenu>
  );
});

/** Estimated row height in px — py-1.5 (12px) + h-10 content (40px) + gap = ~56px */
const ROW_HEIGHT_ESTIMATE = 56;

export function TrackTable({
  tracks,
  currentTrackId,
  isPlaying = false,
  showViews = false,
  enableVirtualization = false,
  headerContent,
  onEndReached,
  onPlay,
  onAddToQueue,
  onGoToArtist,
  onGoToAlbum,
}: TrackTableProps) {
  if (tracks.length === 0) return null;

  // Auto-detect if any track has duration data
  const showDuration = tracks.some((t) => t.duration && t.duration !== "" && t.duration !== "0:00");

  if (!enableVirtualization) {
    return (
      <div>
        <TrackTableHeader showViews={showViews} showDuration={showDuration} />
        <div className="mt-1 space-y-0.5">
          {tracks.map((track, i) => (
            <TrackTableRow
              key={track.videoId}
              track={track}
              index={i}
              isCurrent={currentTrackId === track.videoId}
              isPlaying={currentTrackId === track.videoId && isPlaying}
              showViews={showViews}
              showDuration={showDuration}
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

  // --- Virtualized mode ---
  return (
    <VirtualizedTrackTable
      tracks={tracks}
      currentTrackId={currentTrackId}
      isPlaying={isPlaying}
      showViews={showViews}
      showDuration={showDuration}
      headerContent={headerContent}
      onEndReached={onEndReached}
      onPlay={onPlay}
      onAddToQueue={onAddToQueue}
      onGoToArtist={onGoToArtist}
      onGoToAlbum={onGoToAlbum}
    />
  );
}

/** Extracted component so hooks are always called (no conditional hooks in TrackTable). */
function VirtualizedTrackTable({
  tracks,
  currentTrackId,
  isPlaying = false,
  showViews = false,
  showDuration = true,
  headerContent,
  onEndReached,
  onPlay,
  onAddToQueue,
  onGoToArtist,
  onGoToAlbum,
}: {
  tracks: Track[];
  currentTrackId?: string;
  isPlaying?: boolean;
  showViews?: boolean;
  showDuration?: boolean;
  headerContent?: React.ReactNode;
  onEndReached?: () => void;
  onPlay?: (track: Track) => void;
  onAddToQueue?: (track: Track) => void;
  onGoToArtist?: (artistId: string) => void;
  onGoToAlbum?: (albumId: string) => void;
}) {
  // containerRef wraps the scroll element — ResizeObserver measures its height so
  // the scroll container always gets an explicit pixel height regardless of the flex chain.
  const containerRef = useRef<HTMLDivElement>(null);
  const [containerHeight, setContainerHeight] = useState(0);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const observer = new ResizeObserver((entries) => {
      const height = entries[0].contentRect.height;
      console.log("[TrackTable:Virtual] ResizeObserver — containerHeight:", Math.round(height));
      setContainerHeight(height);
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  const scrollRef = useRef<HTMLDivElement>(null);
  const onEndReachedRef = useRef(onEndReached);
  onEndReachedRef.current = onEndReached;

  // After each loadMore, we record the tracks.length that triggered it.
  // The next loadMore is blocked until tracks.length grows (new data arrived)
  // AND the user has scrolled further down from where the last load was triggered.
  const lastLoadedAtLengthRef = useRef(0);
  const lastLoadScrollTopRef = useRef(0);

  const virtualizer = useVirtualizer({
    count: tracks.length,
    getScrollElement: () => scrollRef.current,
    estimateSize: () => ROW_HEIGHT_ESTIMATE,
    overscan: 5,
    useFlushSync: false,
  });

  const virtualItems = virtualizer.getVirtualItems();
  const lastItem = virtualItems[virtualItems.length - 1];

  // TanStack Virtual infinite scroll — monitor last visible item
  useEffect(() => {
    if (!lastItem || !onEndReachedRef.current) return;

    const isNearEnd = lastItem.index >= tracks.length - 5;
    if (!isNearEnd) return;

    // Block if we already triggered loadMore for this tracks.length
    if (lastLoadedAtLengthRef.current >= tracks.length) return;

    // Block if user hasn't scrolled past the point where last load was triggered
    const scrollEl = scrollRef.current;
    if (scrollEl && lastLoadedAtLengthRef.current > 0) {
      if (scrollEl.scrollTop <= lastLoadScrollTopRef.current + ROW_HEIGHT_ESTIMATE) {
        return; // User hasn't scrolled down since last load
      }
    }

    console.log("[TrackTable:Virtual] onEndReached — lastItem.index:", lastItem.index, "tracks.length:", tracks.length);
    lastLoadedAtLengthRef.current = tracks.length;
    lastLoadScrollTopRef.current = scrollEl?.scrollTop ?? 0;
    onEndReachedRef.current();
  }, [lastItem?.index, tracks.length]);

  return (
    // containerRef fills the available space given by the flex parent.
    // ResizeObserver reads its pixel height so we can set it explicitly on scrollRef.
    <div ref={containerRef} className="flex min-h-0 flex-1 flex-col">
      <div
        ref={scrollRef}
        className="styled-scrollbar overflow-y-auto"
        // Explicit pixel height — guaranteed by ResizeObserver, not by the flex chain.
        // This is what makes overflow-y-auto actually constrain scroll without relying on CSS.
        style={{ height: containerHeight || undefined }}
      >
        {headerContent}
        <div className="sticky top-0 z-10 bg-background">
          <TrackTableHeader showViews={showViews} showDuration={showDuration} />
        </div>
        <div
          style={{
            height: virtualizer.getTotalSize(),
            position: "relative",
            width: "100%",
          }}
        >
          {virtualItems.map((virtualRow) => {
            const track = tracks[virtualRow.index];
            return (
              <div
                key={`${track.videoId}-${virtualRow.index}`}
                data-index={virtualRow.index}
                ref={virtualizer.measureElement}
                style={{
                  position: "absolute",
                  top: 0,
                  left: 0,
                  width: "100%",
                  transform: `translateY(${virtualRow.start}px)`,
                }}
              >
                <TrackTableRow
                  track={track}
                  index={virtualRow.index}
                  isCurrent={currentTrackId === track.videoId}
                  isPlaying={currentTrackId === track.videoId && isPlaying}
                  showViews={showViews}
                  showDuration={showDuration}
                  onPlay={onPlay}
                  onAddToQueue={onAddToQueue}
                  onGoToArtist={onGoToArtist}
                  onGoToAlbum={onGoToAlbum}
                />
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
