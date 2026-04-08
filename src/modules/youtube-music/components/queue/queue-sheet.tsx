import React, { useCallback, useEffect, useState } from "react";
import { useVirtualizer } from "@tanstack/react-virtual";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { X } from "lucide-react";
import { useQueueStore } from "../../stores/queue-store";
import { usePlayerStore } from "../../stores/player-store";
import { useTrack } from "../../stores/track-cache-store";
import { thumbUrl } from "../../utils/thumb-url";


interface QueueSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

const QueueItem = React.memo(function QueueItem({
  videoId,
  index,
  isCurrent,
  onPlay,
  onRemove,
}: {
  videoId: string;
  index: number;
  isCurrent: boolean;
  onPlay: (videoId: string) => void;
  onRemove: (index: number) => void;
}) {
  const track = useTrack(videoId);
  if (!track) {
    console.warn("[QueueItem] Cache miss for videoId:", videoId);
    return (
      <div className="flex h-14 items-center px-2 text-xs text-muted-foreground">
        Carregando...
      </div>
    );
  }

  const imgUrl = track.thumbnails[0]?.url ?? "";
  const artistName = track.artists.map((a) => a.name).join(", ");

  return (
    <div
      className={cn(
        "group flex items-center gap-3 rounded-md px-2 py-1.5",
        isCurrent ? "bg-accent" : "hover:bg-accent/50"
      )}
    >
      <button
        type="button"
        className="flex flex-1 items-center gap-3 min-w-0"
        onClick={() => onPlay(videoId)}
      >
        <Avatar className="h-10 w-10 shrink-0 rounded-sm">
            <AvatarImage
              src={thumbUrl(imgUrl, 80)}
              alt={track.title}
              className="object-cover"
            />
            <AvatarFallback className="rounded-sm">
              {track.title.charAt(0)}
            </AvatarFallback>
          </Avatar>
        <div className="min-w-0 flex-1 text-left">
          <p
            className={cn(
              "truncate text-sm",
              isCurrent
                ? "font-semibold text-foreground"
                : "text-foreground"
            )}
          >
            {track.title}
          </p>
          <p className="truncate text-xs text-muted-foreground">
            {artistName}
          </p>
        </div>
      </button>
      <span className="shrink-0 text-xs text-muted-foreground">
        {track.duration}
      </span>
      <Button
        variant="ghost"
        size="icon"
        className="h-7 w-7 shrink-0 opacity-0 group-hover:opacity-100"
        onClick={() => onRemove(index)}
      >
        <X className="h-3.5 w-3.5" />
      </Button>
    </div>
  );
});

export const QueueSheet = React.memo(function QueueSheet({ open, onOpenChange }: QueueSheetProps) {
  // Subscribe to LENGTH (number) instead of the array — prevents re-render on every appendTrackIds
  const queueLength = useQueueStore((s) => s.trackIds.length);
  const currentIndex = useQueueStore((s) => s.currentIndex);
  const removeFromQueue = useQueueStore((s) => s.removeFromQueue);
  const queuePlayIndex = useQueueStore((s) => s.playIndex);
  const playerPlay = usePlayerStore((s) => s.play);

  // Callback ref handles Radix portal mount timing
  const [scrollElement, setScrollElement] = useState<HTMLDivElement | null>(null);
  const scrollRef = useCallback((node: HTMLDivElement | null) => {
    setScrollElement(node);
  }, []);

  const virtualizer = useVirtualizer({
    count: queueLength,
    getScrollElement: () => scrollElement,
    estimateSize: () => 52,
    overscan: 3,
    enabled: !!scrollElement,
  });

  // Auto-scroll to current track when sheet opens
  useEffect(() => {
    if (!open || !scrollElement) return;
    const idx = useQueueStore.getState().currentIndex;
    if (idx >= 0) {
      requestAnimationFrame(() => {
        virtualizer.scrollToIndex(idx, { align: "center" });
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, scrollElement]);

  console.log("[QueueSheet] render", {
    open,
    queueLength,
    currentIndex,
    hasScrollElement: !!scrollElement,
  });

  const handlePlayFromQueue = useCallback(
    (videoId: string) => {
      const ids = useQueueStore.getState().trackIds;
      const index = ids.indexOf(videoId);
      if (index >= 0) {
        const id = queuePlayIndex(index);
        if (id) playerPlay(id);
      }
    },
    [queuePlayIndex, playerPlay]
  );

  const handleRemove = useCallback(
    (index: number) => {
      removeFromQueue(index);
    },
    [removeFromQueue]
  );

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="flex w-96 flex-col p-0">
        <SheetHeader className="border-b border-border px-4 py-3">
          <SheetTitle>Fila de reprodução</SheetTitle>
        </SheetHeader>
        <div
          ref={scrollRef}
          className="styled-scrollbar min-h-0 flex-1 overflow-y-auto p-2"
        >
          {queueLength === 0 ? (
            <p className="px-2 py-8 text-center text-sm text-muted-foreground">
              A fila está vazia
            </p>
          ) : (
            <div
              style={{
                height: `${virtualizer.getTotalSize()}px`,
                position: "relative",
                width: "100%",
              }}
            >
              {virtualizer.getVirtualItems().map((virtualRow) => {
                const videoId = useQueueStore.getState().trackIds[virtualRow.index];
                return (
                  <div
                    key={virtualRow.key}
                    style={{
                      position: "absolute",
                      top: 0,
                      left: 0,
                      width: "100%",
                      height: `${virtualRow.size}px`,
                      transform: `translateY(${virtualRow.start}px)`,
                    }}
                  >
                    <QueueItem
                      videoId={videoId}
                      index={virtualRow.index}
                      isCurrent={virtualRow.index === currentIndex}
                      onPlay={handlePlayFromQueue}
                      onRemove={handleRemove}
                    />
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}); // closes React.memo
