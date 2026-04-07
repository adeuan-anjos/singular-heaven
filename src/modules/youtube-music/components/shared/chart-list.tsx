import { useRef, useState, useCallback, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { ScrollArea, ScrollBar } from "@/components/ui/scroll-area";
import { ChevronLeft, ChevronRight, TrendingUp, TrendingDown, Minus } from "lucide-react";
import type { ChartTrack, Track } from "../../types/music";

interface ChartListProps {
  title: string;
  tracks: ChartTrack[];
  onPlayTrack?: (track: Track) => void;
  onGoToArtist?: (artistId: string) => void;
  onGoToAlbum?: (albumId: string) => void;
  onSeeAll?: () => void;
  columnSize?: number;
}

const SCROLL_AMOUNT = 400;

function TrendIcon({ trend }: { trend: ChartTrack["trend"] }) {
  switch (trend) {
    case "up":
      return <TrendingUp className="h-3.5 w-3.5 text-green-500" />;
    case "down":
      return <TrendingDown className="h-3.5 w-3.5 text-red-500" />;
    case "neutral":
      return <Minus className="h-3.5 w-3.5 text-muted-foreground" />;
  }
}

function ChartRow({
  track,
  onPlayTrack,
  onGoToArtist,
  onGoToAlbum,
}: {
  track: ChartTrack;
  onPlayTrack?: (track: Track) => void;
  onGoToArtist?: (artistId: string) => void;
  onGoToAlbum?: (albumId: string) => void;
}) {
  const imgUrl = track.thumbnails[0]?.url ?? "";
  const artistName = track.artists.map((a) => a.name).join(", ");

  return (
    <div
      className="group flex items-center gap-3 rounded-md px-2 py-1.5 hover:bg-accent"
      onDoubleClick={() => onPlayTrack?.(track)}
    >
      <div className="flex h-10 w-10 shrink-0 items-center justify-center overflow-hidden rounded-sm bg-muted">
        {imgUrl ? (
          <img src={imgUrl} alt={track.title} className="h-full w-full object-cover" />
        ) : (
          <span className="text-sm text-muted-foreground">{track.title.charAt(0)}</span>
        )}
      </div>
      <div className="flex shrink-0 items-center gap-1.5">
        <TrendIcon trend={track.trend} />
        <span className="w-5 text-right text-sm font-semibold text-foreground">
          {track.rank}
        </span>
      </div>
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium text-foreground">{track.title}</p>
        <p className="truncate text-xs text-muted-foreground">
          {track.artists[0]?.id ? (
            <button
              type="button"
              className="hover:underline"
              onClick={(e) => {
                e.stopPropagation();
                onGoToArtist?.(track.artists[0].id!);
              }}
            >
              {artistName}
            </button>
          ) : (
            artistName
          )}
          {track.album && (
            <>
              {" \u2022 "}
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
            </>
          )}
        </p>
      </div>
    </div>
  );
}

export function ChartList({
  title,
  tracks,
  onPlayTrack,
  onGoToArtist,
  onGoToAlbum,
  onSeeAll,
  columnSize = 4,
}: ChartListProps) {
  const viewportRef = useRef<HTMLElement | null>(null);
  const [canScrollLeft, setCanScrollLeft] = useState(false);
  const [canScrollRight, setCanScrollRight] = useState(false);

  const checkScroll = useCallback(() => {
    const el = viewportRef.current;
    if (!el) return;
    setCanScrollLeft(el.scrollLeft > 0);
    setCanScrollRight(el.scrollLeft + el.clientWidth < el.scrollWidth - 1);
  }, []);

  const scrollAreaRef = useCallback(
    (node: HTMLDivElement | null) => {
      if (node) {
        const viewport = node.querySelector('[data-slot="scroll-area-viewport"]');
        if (viewport) {
          viewportRef.current = viewport as HTMLElement;
          viewport.addEventListener("scroll", checkScroll);
          checkScroll();
        }
      }
    },
    [checkScroll],
  );

  useEffect(() => {
    checkScroll();
    const el = viewportRef.current;
    if (!el) return;

    const handleMouseDown = (e: MouseEvent) => {
      isDragging.current = true;
      dragStartX.current = e.pageX;
      dragScrollLeft.current = el.scrollLeft;
      el.style.cursor = "grabbing";
      el.style.userSelect = "none";
    };

    const handleMouseMove = (e: MouseEvent) => {
      if (!isDragging.current) return;
      const dx = e.pageX - dragStartX.current;
      el.scrollLeft = dragScrollLeft.current - dx;
    };

    const handleMouseUp = () => {
      if (!isDragging.current) return;
      isDragging.current = false;
      el.style.cursor = "";
      el.style.userSelect = "";
    };

    el.addEventListener("mousedown", handleMouseDown);
    window.addEventListener("mousemove", handleMouseMove);
    window.addEventListener("mouseup", handleMouseUp);

    return () => {
      el.removeEventListener("scroll", checkScroll);
      el.removeEventListener("mousedown", handleMouseDown);
      window.removeEventListener("mousemove", handleMouseMove);
      window.removeEventListener("mouseup", handleMouseUp);
    };
  }, [checkScroll]);

  const isDragging = useRef(false);
  const dragStartX = useRef(0);
  const dragScrollLeft = useRef(0);

  const scrollLeftFn = () => {
    viewportRef.current?.scrollBy({ left: -SCROLL_AMOUNT, behavior: "smooth" });
  };

  const scrollRightFn = () => {
    viewportRef.current?.scrollBy({ left: SCROLL_AMOUNT, behavior: "smooth" });
  };

  // Split tracks into columns of `columnSize`
  const columns: ChartTrack[][] = [];
  for (let i = 0; i < tracks.length; i += columnSize) {
    columns.push(tracks.slice(i, i + columnSize));
  }

  return (
    <div className="group/carousel space-y-3">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold text-foreground">{title}</h2>
        <div className="flex items-center gap-1">
          {onSeeAll && (
            <Button variant="outline" size="sm" onClick={onSeeAll}>
              Mais
            </Button>
          )}
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8 rounded-full opacity-0 transition-opacity group-hover/carousel:opacity-100 disabled:opacity-0"
            disabled={!canScrollLeft}
            onClick={scrollLeftFn}
          >
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8 rounded-full opacity-0 transition-opacity group-hover/carousel:opacity-100 disabled:opacity-0"
            disabled={!canScrollRight}
            onClick={scrollRightFn}
          >
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>
      </div>
      <ScrollArea ref={scrollAreaRef} className="w-full cursor-grab">
        <div className="inline-flex gap-4 pb-4">
          {columns.map((column, colIdx) => (
            <div key={colIdx} className="w-80 shrink-0 space-y-0.5">
              {column.map((track) => (
                <ChartRow
                  key={track.videoId}
                  track={track}
                  onPlayTrack={onPlayTrack}
                  onGoToArtist={onGoToArtist}
                  onGoToAlbum={onGoToAlbum}
                />
              ))}
            </div>
          ))}
        </div>
        <ScrollBar
          orientation="horizontal"
          className="opacity-0 transition-opacity group-hover/carousel:opacity-100"
        />
      </ScrollArea>
    </div>
  );
}
