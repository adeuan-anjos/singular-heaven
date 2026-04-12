import React, { useCallback, useEffect, useRef, useState } from "react";
import { useVirtualizer } from "@tanstack/react-virtual";
import { useShallow } from "zustand/react/shallow";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { Loader2, X } from "lucide-react";
import { useQueueStore } from "../../stores/queue-store";
import { usePlayerStore } from "../../stores/player-store";
import { useTrack, useTrackCacheStore } from "../../stores/track-cache-store";
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
  onPlay: (index: number) => void;
  onRemove: (index: number) => void;
}) {
  const track = useTrack(videoId);
  if (!track) {
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
        onClick={() => onPlay(index)}
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

const QueueLoadingRow = React.memo(function QueueLoadingRow() {
  return (
    <div className="flex h-14 items-center gap-3 rounded-md px-2 py-1.5 text-sm text-muted-foreground">
      <Loader2 className="h-4 w-4 animate-spin" />
      <span>Carregando mais faixas...</span>
    </div>
  );
});

const QueueRevealRow = React.memo(function QueueRevealRow({
  revealedCount,
  totalLoaded,
}: {
  revealedCount: number;
  totalLoaded: number;
}) {
  return (
    <div className="flex h-14 items-center gap-3 rounded-md px-2 py-1.5 text-sm text-muted-foreground">
      <span>
        Mostrando {revealedCount} de {totalLoaded} faixas. Role até o fim para revelar mais.
      </span>
    </div>
  );
});

// Inner content — only mounted when sheet is open.
// This prevents store subscriptions from firing when the sheet is closed,
// eliminating dozens of wasted re-renders during background playlist loading.
function QueueSheetContent() {
  const {
    totalLoaded,
    revealedCount,
    pagesVersion,
    currentIndex,
    isComplete,
    isRadio,
    pageSize,
    getItemAt,
    initializeReveal,
    revealMore,
    ensureCurrentIndexRevealed,
    ensureRange,
    removeFromQueue,
    queuePlayIndex,
    loadMoreRadio,
  } = useQueueStore(
    useShallow((s) => ({
      totalLoaded: s.totalLoaded,
      revealedCount: s.revealedCount,
      pagesVersion: s.pagesVersion,
      currentIndex: s.currentIndex,
      isComplete: s.isComplete,
      isRadio: s.isRadio,
      pageSize: s.pageSize,
      getItemAt: s.getItemAt,
      initializeReveal: s.initializeReveal,
      revealMore: s.revealMore,
      ensureCurrentIndexRevealed: s.ensureCurrentIndexRevealed,
      ensureRange: s.ensureRange,
      removeFromQueue: s.removeFromQueue,
      queuePlayIndex: s.playIndex,
      loadMoreRadio: s.loadMoreRadio,
    }))
  );
  const playerPlay = usePlayerStore((s) => s.play);
  const cachedTracks = useTrackCacheStore((s) => s.tracks);
  const hydrateTracks = useTrackCacheStore((s) => s.hydrateTracks);
  const prefetchTracks = useTrackCacheStore((s) => s.prefetchTracks);

  // Delay virtualizer activation until Sheet opening animation completes (~350ms).
  // Without this, the virtualizer detects container resize on every animation frame
  // → recalculates range → onChange → re-render → hundreds of wasted renders.
  const [animationDone, setAnimationDone] = useState(false);
  const [initialVisibleHydrationPending, setInitialVisibleHydrationPending] = useState(false);
  const [initialVisibleHydrationFinished, setInitialVisibleHydrationFinished] = useState(false);
  const scrollElementRef = useRef<HTMLDivElement | null>(null);
  const didInitialScrollRef = useRef(false);
  const terminalRowVisibleRef = useRef<"reveal" | "loading" | null>(null);
  const reachedTerminalRowRef = useRef<"reveal" | "loading" | null>(null);
  const lastRevealRequestRef = useRef(0);
  const scrollRef = useCallback((node: HTMLDivElement | null) => {
    scrollElementRef.current = node;
  }, []);

  const hasHiddenItems = revealedCount < totalLoaded;
  const terminalRowType = hasHiddenItems
    ? "reveal"
    : totalLoaded > 0 && !isComplete
      ? "loading"
      : null;
  const terminalRowIndex = revealedCount;
  const virtualItemCount = revealedCount + (terminalRowType ? 1 : 0);

  useEffect(() => {
    const timer = setTimeout(() => {
      console.log("[QueueSheetContent] animation settled, activating virtualizer");
      setAnimationDone(true);
    }, 400);
    return () => clearTimeout(timer);
  }, []);

  const virtualizerEnabled = animationDone && !!scrollElementRef.current;

  const virtualizer = useVirtualizer({
    count: virtualItemCount,
    getScrollElement: () => scrollElementRef.current,
    getItemKey: (index) =>
      terminalRowType && index === terminalRowIndex
        ? `queue-terminal-row:${terminalRowType}`
        : getItemAt(index)?.itemId ?? `queue-missing:${index}`,
    estimateSize: () => 52,
    overscan: 3,
    enabled: virtualizerEnabled,
    useFlushSync: false,
  });

  useEffect(() => {
    if (!virtualizerEnabled || totalLoaded === 0) return;

    initializeReveal();
    ensureCurrentIndexRevealed();

    const firstIndex = Math.max(0, currentIndex);
    const currentPageStart = Math.floor(firstIndex / pageSize) * pageSize;
    void ensureRange(0, Math.min(pageSize - 1, revealedCount - 1));
    void ensureRange(
      currentPageStart,
      Math.min(currentPageStart + pageSize - 1, revealedCount - 1)
    );
  }, [
    currentIndex,
    ensureCurrentIndexRevealed,
    ensureRange,
    initializeReveal,
    pageSize,
    revealedCount,
    pagesVersion,
    totalLoaded,
    virtualizerEnabled,
  ]);

  // Auto-scroll to current track after virtualizer activates
  useEffect(() => {
    if (!virtualizerEnabled) {
      didInitialScrollRef.current = false;
      return;
    }
    if (didInitialScrollRef.current || currentIndex < 0) return;

    didInitialScrollRef.current = true;
    requestAnimationFrame(() => {
      virtualizer.scrollToIndex(currentIndex, { align: "center" });
    });
  }, [currentIndex, virtualizer, virtualizerEnabled]);

  useEffect(() => {
    if (!terminalRowType) {
      terminalRowVisibleRef.current = null;
      return;
    }

    if (terminalRowVisibleRef.current !== terminalRowType) {
      console.log(
        terminalRowType === "reveal"
          ? "[QueueSheetContent] Queue reveal row visible"
          : "[QueueSheetContent] Queue loading row visible",
        {
          revealedCount,
          totalLoaded,
        }
      );
      terminalRowVisibleRef.current = terminalRowType;
      reachedTerminalRowRef.current = null;
    }
  }, [revealedCount, terminalRowType, totalLoaded]);

  // Radio demand-driven loading: when the loading row becomes visible and
  // we're in radio mode, fetch ONE continuation page. The in-flight guard
  // inside loadMoreRadio prevents duplicate requests.
  useEffect(() => {
    if (terminalRowType === "loading" && isRadio) {
      void loadMoreRadio();
    }
  }, [terminalRowType, isRadio, loadMoreRadio]);

  const virtualItems = virtualizer.getVirtualItems();
  const visibleContentRows = virtualItems.filter(
    (virtualRow) => !(terminalRowType !== null && virtualRow.index === terminalRowIndex)
  );
  const visibleEntries = visibleContentRows
    .map((virtualRow) => getItemAt(virtualRow.index))
    .filter((entry): entry is NonNullable<typeof entry> => !!entry);
  const missingVisibleTrackIds = visibleEntries
    .map((entry) => entry.videoId)
    .filter((videoId) => !cachedTracks[videoId]);
  const hasUnresolvedVisibleRows =
    visibleContentRows.length > 0 &&
    (visibleEntries.length < visibleContentRows.length || missingVisibleTrackIds.length > 0);
  const shouldShowInitialSpinner =
    virtualizerEnabled &&
    revealedCount > 0 &&
    !initialVisibleHydrationFinished &&
    (initialVisibleHydrationPending ||
      (virtualItems.length > 0 && hasUnresolvedVisibleRows));

  const lastVisibleIndex = virtualItems[virtualItems.length - 1]?.index ?? -1;
  const attemptRevealMore = useCallback(() => {
    const scrollElement = scrollElementRef.current;
    if (!scrollElement) return;

    if (terminalRowType !== "reveal") {
      lastRevealRequestRef.current = 0;
      return;
    }

    const distanceToBottom =
      scrollElement.scrollHeight - scrollElement.scrollTop - scrollElement.clientHeight;

    if (distanceToBottom > 96) {
      return;
    }

    if (lastRevealRequestRef.current === revealedCount) {
      return;
    }

    console.log("[QueueSheetContent] Queue reached reveal row", {
      revealedCount,
      totalLoaded,
      distanceToBottom,
    });

    lastRevealRequestRef.current = revealedCount;
    revealMore();
  }, [terminalRowType, revealedCount, totalLoaded, revealMore]);

  const handleScroll = useCallback(() => {
    attemptRevealMore();
  }, [attemptRevealMore]);

  useEffect(() => {
    if (!virtualizerEnabled || terminalRowType !== "reveal") {
      return;
    }

    const frame = requestAnimationFrame(() => {
      attemptRevealMore();
    });

    return () => cancelAnimationFrame(frame);
  }, [attemptRevealMore, terminalRowType, virtualizerEnabled]);

  useEffect(() => {
    if (!terminalRowType) {
      reachedTerminalRowRef.current = null;
      return;
    }

    const reachedTerminalRow = lastVisibleIndex >= terminalRowIndex;
    if (reachedTerminalRow && reachedTerminalRowRef.current !== terminalRowType) {
      console.log(
        terminalRowType === "reveal"
          ? "[QueueSheetContent] Queue reached reveal row"
          : "[QueueSheetContent] Queue reached loading row",
        {
          revealedCount,
          totalLoaded,
        }
      );
      reachedTerminalRowRef.current = terminalRowType;
      return;
    }

    if (!reachedTerminalRow && reachedTerminalRowRef.current === terminalRowType) {
      reachedTerminalRowRef.current = null;
    }
  }, [lastVisibleIndex, revealedCount, terminalRowIndex, terminalRowType, totalLoaded]);

  useEffect(() => {
    if (virtualItems.length === 0 || revealedCount === 0) return;
    const firstVisible = virtualItems[0]?.index ?? 0;
    const lastVisible = Math.min(
      virtualItems[virtualItems.length - 1]?.index ?? 0,
      revealedCount - 1
    );
    void ensureRange(firstVisible, lastVisible);
  }, [ensureRange, revealedCount, virtualItems]);

  useEffect(() => {
    if (missingVisibleTrackIds.length === 0) return;
    console.log("[QueueSheetContent] prefetch visible tracks", {
      missing: missingVisibleTrackIds.length,
      sample: missingVisibleTrackIds.slice(0, 5),
    });
    prefetchTracks(missingVisibleTrackIds);
  }, [missingVisibleTrackIds, prefetchTracks]);

  useEffect(() => {
    if (!virtualizerEnabled || revealedCount === 0 || initialVisibleHydrationFinished) {
      return;
    }

    if (visibleContentRows.length === 0) {
      return;
    }

    if (visibleEntries.length === 0) {
      setInitialVisibleHydrationPending(false);
      return;
    }

    if (missingVisibleTrackIds.length === 0) {
      setInitialVisibleHydrationPending(false);
      setInitialVisibleHydrationFinished(true);
      return;
    }

    let cancelled = false;
    setInitialVisibleHydrationPending(true);

    void hydrateTracks(missingVisibleTrackIds)
      .catch((error) => {
        console.error("[QueueSheetContent] initial visible hydration failed", error);
      })
      .finally(() => {
        if (cancelled) return;
        setInitialVisibleHydrationPending(false);
        setInitialVisibleHydrationFinished(true);
      });

    return () => {
      cancelled = true;
    };
  }, [
    hydrateTracks,
    initialVisibleHydrationFinished,
    missingVisibleTrackIds,
    visibleContentRows.length,
    visibleEntries.length,
    revealedCount,
    virtualizerEnabled,
  ]);

  const handlePlayFromQueue = useCallback(
    (index: number) => {
      void queuePlayIndex(index).then((id) => {
        if (id) playerPlay(id);
      });
    },
    [queuePlayIndex, playerPlay]
  );

  const handleRemove = useCallback(
    (index: number) => {
      void removeFromQueue(index);
    },
    [removeFromQueue]
  );

  return (
    <>
      <SheetHeader className="border-b border-border px-4 py-3">
        <SheetTitle>Fila de reprodução</SheetTitle>
      </SheetHeader>
      <div
        ref={scrollRef}
        onScroll={handleScroll}
        className="styled-scrollbar min-h-0 flex-1 overflow-y-auto p-2"
      >
        {revealedCount === 0 ? (
          <p className="px-2 py-8 text-center text-sm text-muted-foreground">
            A fila está vazia
          </p>
        ) : (
          <div className="relative">
            {shouldShowInitialSpinner ? (
              <div className="flex min-h-[220px] items-center justify-center">
                <div className="flex items-center gap-3 text-sm text-muted-foreground">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  <span>Carregando fila...</span>
                </div>
              </div>
            ) : null}
            <div
              style={{
                height: `${virtualizer.getTotalSize()}px`,
                position: "relative",
                width: "100%",
                visibility: shouldShowInitialSpinner ? "hidden" : "visible",
              }}
            >
              {virtualItems.map((virtualRow) => {
                const isTerminalRow =
                  terminalRowType !== null && virtualRow.index === terminalRowIndex;
                const entry = getItemAt(virtualRow.index);
                const videoId = entry?.videoId;
                if (entry && virtualRow.index >= Math.max(0, currentIndex - 2) && virtualRow.index <= currentIndex + 2) {
                  console.log(
                    `[QueueSheetContent] render row mapping ${JSON.stringify({
                      virtualIndex: virtualRow.index,
                      entryIndex: entry.index,
                      videoId: entry.videoId,
                      isCurrent: virtualRow.index === currentIndex,
                    })}`
                  );
                }

                return (
                  <div
                    key={entry?.itemId ?? virtualRow.key}
                    style={{
                      position: "absolute",
                      top: 0,
                      left: 0,
                      width: "100%",
                      height: `${virtualRow.size}px`,
                      transform: `translateY(${virtualRow.start}px)`,
                    }}
                  >
                    {isTerminalRow && terminalRowType === "loading" ? (
                      <QueueLoadingRow />
                    ) : isTerminalRow && terminalRowType === "reveal" ? (
                      <QueueRevealRow
                        revealedCount={revealedCount}
                        totalLoaded={totalLoaded}
                      />
                    ) : videoId ? (
                      <QueueItem
                        videoId={videoId}
                        index={virtualRow.index}
                        isCurrent={virtualRow.index === currentIndex}
                        onPlay={handlePlayFromQueue}
                        onRemove={handleRemove}
                      />
                    ) : (
                      <div className="flex h-14 items-center px-2 text-xs text-muted-foreground">
                        Carregando faixa...
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>
    </>
  );
}

// Outer shell — always mounted, but store subscriptions live in QueueSheetContent
// which only mounts when open=true. Zero re-renders from background events when closed.
export const QueueSheet = React.memo(function QueueSheet({ open, onOpenChange }: QueueSheetProps) {
  const resetVisualState = useQueueStore((s) => s.resetVisualState);
  const getLoadedVideoIds = useQueueStore((s) => s.getLoadedVideoIds);
  const revealedCount = useQueueStore((s) => s.revealedCount);
  const totalLoaded = useQueueStore((s) => s.totalLoaded);
  const currentTrackId = usePlayerStore((s) => s.currentTrackId);
  const removeTracks = useTrackCacheStore((s) => s.removeTracks);
  const cacheBaselineRef = useRef<Set<string>>(new Set());

  useEffect(() => {
    if (open) {
      cacheBaselineRef.current = new Set(
        Object.keys(useTrackCacheStore.getState().tracks)
      );
      console.log(
        `[QueueSheet] opening ${JSON.stringify({
          revealedCount,
          totalLoaded,
          currentTrackId,
          cacheBaseline: cacheBaselineRef.current.size,
        })}`
      );
    }
  }, [currentTrackId, open, revealedCount, totalLoaded]);

  const handleOpenChange = useCallback(
    (nextOpen: boolean) => {
      if (!nextOpen) {
        const baselineIds = cacheBaselineRef.current;
        const loadedIds = getLoadedVideoIds().filter(
          (videoId) =>
            videoId !== currentTrackId && !baselineIds.has(videoId)
        );
        console.log(
          `[QueueSheet] closing — resetting visual state ${JSON.stringify({
            revealedCount,
            totalLoaded,
            loadedIdsToEvict: loadedIds.length,
            cacheBaseline: baselineIds.size,
            currentTrackId,
          })}`
        );
        if (loadedIds.length > 0) {
          removeTracks(loadedIds);
        }
        resetVisualState();
        cacheBaselineRef.current = new Set();
      }
      onOpenChange(nextOpen);
    },
    [
      currentTrackId,
      getLoadedVideoIds,
      onOpenChange,
      removeTracks,
      resetVisualState,
      revealedCount,
      totalLoaded,
    ]
  );

  return (
    <Sheet open={open} onOpenChange={handleOpenChange}>
      <SheetContent side="right" className="flex w-96 flex-col border-border/50 bg-background/40 backdrop-blur-md p-0">
        {open && <QueueSheetContent />}
      </SheetContent>
    </Sheet>
  );
});
