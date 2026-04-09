# Smart Queue + Track Cache + Queue Sheet Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Complete the intelligent playback queue with proactive continuation loading, normalized track cache, and virtualized queue sheet UI.

**Architecture:** Normalized `TrackCacheStore` (`Record<videoId, Track>`) as single source of truth. Queue and playlist pages store only `videoId[]`. Proactive prefetch triggers when approaching end of loaded queue. Virtual scroll in queue sheet handles large playlists without DOM bloat.

**Tech Stack:** Zustand (subscribeWithSelector) + @tanstack/react-virtual (already installed) + React 19

---

## Status Assessment

The working tree already contains the core refactoring (uncommitted). Here's what exists and what's missing:

| Component | Status | What Exists |
|-----------|--------|-------------|
| `track-cache-store.ts` | **DONE** | Normalized `Record<string, Track>`, LRU eviction at 3000, `useTrack()` hook |
| `queue-store.ts` | **95%** | `trackIds[]`, `continuationToken`, `loadMore()` with dedup — missing proactive prefetch |
| `player-store.ts` | **DONE** | `_onTrackEnd` with repeat modes, reactive `loadMore()` fallback |
| `index.tsx` | **DONE** | `handlePlayAll/Track/AddToQueue` cache tracks and set queue with continuation |
| All page files | **DONE** | Pass continuation tokens to `onPlayAll`, proper index resolution |
| `queue-sheet.tsx` | **70%** | Uses `useTrack(videoId)` per `QueueItem` (memoized) — missing virtual scroll |
| `player-bar.tsx` | **DONE** | Uses `useTrack(currentTrackId)`, next/prev via queue store |
| `progress-bar.tsx` | **DONE** | DOM-direct updates via Zustand subscriptions, zero React re-renders |

**Remaining work: 2 targeted edits + verification.**

---

### Task 1: Verify foundation compiles

All stores, pages, and player bar are already refactored in the working tree. This task verifies the existing changes compile before adding more.

**Files:**
- Verify: `src/modules/youtube-music/stores/track-cache-store.ts` (new, untracked)
- Verify: `src/modules/youtube-music/stores/queue-store.ts` (modified)
- Verify: `src/modules/youtube-music/stores/player-store.ts` (modified)
- Verify: `src/modules/youtube-music/index.tsx` (modified)
- Verify: All modified page files

- [ ] **Step 1: Run type-check**

```bash
npx tsc --noEmit
```

Expected: 0 errors. If there are errors, fix them before proceeding.

- [ ] **Step 2: Commit the foundation**

```bash
git add src/modules/youtube-music/stores/track-cache-store.ts \
       src/modules/youtube-music/stores/queue-store.ts \
       src/modules/youtube-music/stores/player-store.ts \
       src/modules/youtube-music/index.tsx \
       src/modules/youtube-music/components/layout/player-bar.tsx \
       src/modules/youtube-music/components/layout/progress-bar.tsx \
       src/modules/youtube-music/components/pages/album-page.tsx \
       src/modules/youtube-music/components/pages/artist-page.tsx \
       src/modules/youtube-music/components/pages/artist-songs-page.tsx \
       src/modules/youtube-music/components/pages/playlist-page.tsx \
       src/modules/youtube-music/components/search/search-results-page.tsx \
       src/modules/youtube-music/components/queue/queue-sheet.tsx
git commit -m "refactor: normalized TrackCacheStore + queue uses trackIds[] with continuation"
```

---

### Task 2: Proactive continuation loading

Currently, continuation loading is purely reactive — it only triggers when the queue is **completely exhausted** (in `player-store._onTrackEnd`). For seamless playback on large playlists, the queue should prefetch the next page when **approaching** the end of loaded tracks.

**Files:**
- Modify: `src/modules/youtube-music/stores/queue-store.ts` (lines 64-74, `next()` method)

- [ ] **Step 1: Add prefetch logic to `next()`**

In `queue-store.ts`, replace the `next` method (lines 64-74) with:

```typescript
next: () => {
  const { currentIndex, trackIds, continuationToken, isLoadingMore } = get();
  if (currentIndex < trackIds.length - 1) {
    const nextIndex = currentIndex + 1;
    console.log("[QueueStore] next", { from: currentIndex, to: nextIndex });
    set({ currentIndex: nextIndex });

    // Proactive prefetch: load more when within 5 tracks of loaded end
    const remaining = trackIds.length - 1 - nextIndex;
    if (remaining <= 5 && continuationToken && !isLoadingMore) {
      console.log("[QueueStore] Proactive prefetch triggered", { remaining });
      get().loadMore(); // fire-and-forget, does not block next()
    }

    return trackIds[nextIndex];
  }
  console.log("[QueueStore] next — end of queue");
  return null;
},
```

Key points:
- `loadMore()` is fire-and-forget — does not block `next()` return
- Threshold of 5 tracks gives enough runway for the API call to complete (~1-3s) before playback catches up (~20s of music)
- `isLoadingMore` guard prevents duplicate fetches
- `continuationToken` null-check skips prefetch for finite queues (albums, search results)

- [ ] **Step 2: Run type-check**

```bash
npx tsc --noEmit
```

Expected: 0 errors.

- [ ] **Step 3: Commit**

```bash
git add src/modules/youtube-music/stores/queue-store.ts
git commit -m "feat: proactive continuation prefetch when within 5 tracks of queue end"
```

---

### Task 3: Virtual scroll + auto-scroll in queue sheet

Replace the simple `trackIds.map()` with `@tanstack/react-virtual` virtualizer. Handle Radix portal mount timing with callback ref. Auto-scroll to current track when sheet opens.

**Files:**
- Modify: `src/modules/youtube-music/components/queue/queue-sheet.tsx`

**Design decisions:**
- **Portal timing:** `SheetContent` renders via Radix portal. The scroll container ref may be null on first render. Solution: callback ref → `useState` to trigger virtualizer re-init when element mounts. This `useState` fires exactly once per open — not high-frequency.
- **Row height:** `QueueItem` = `py-1.5` (12px) + `h-10` avatar (40px) = **52px** estimated size.
- **Overscan:** 10 items — enough to cover fast scrolling without excessive DOM nodes.
- **Auto-scroll:** When sheet opens AND scroll element is available, `scrollToIndex(currentIndex, { align: 'center' })` via `requestAnimationFrame` to ensure layout is computed.

- [ ] **Step 1: Rewrite QueueSheet with virtual scroll**

Replace the `QueueSheet` function component (lines 101-159) with:

```tsx
export function QueueSheet({ open, onOpenChange }: QueueSheetProps) {
  const trackIds = useQueueStore((s) => s.trackIds);
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
    count: trackIds.length,
    getScrollElement: () => scrollElement,
    estimateSize: () => 52,
    overscan: 10,
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
  }, [open, scrollElement, virtualizer]);

  console.log("[QueueSheet] render", {
    open,
    queueLength: trackIds.length,
    currentIndex,
    hasScrollElement: !!scrollElement,
  });

  const handlePlayFromQueue = useCallback(
    (videoId: string) => {
      const index = trackIds.indexOf(videoId);
      if (index >= 0) {
        const id = queuePlayIndex(index);
        if (id) playerPlay(id);
      }
    },
    [trackIds, queuePlayIndex, playerPlay]
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
          {trackIds.length === 0 ? (
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
                const videoId = trackIds[virtualRow.index];
                return (
                  <div
                    key={`${videoId}-${virtualRow.index}`}
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
}
```

Add imports at the top of the file:

```typescript
import { useState, useCallback, useEffect } from "react";
import { useVirtualizer } from "@tanstack/react-virtual";
```

(Remove the bare `React` import if `React.memo` is rewritten as a named import — or keep both.)

- [ ] **Step 2: Run type-check**

```bash
npx tsc --noEmit
```

Expected: 0 errors.

- [ ] **Step 3: Commit**

```bash
git add src/modules/youtube-music/components/queue/queue-sheet.tsx
git commit -m "feat: virtual scroll + auto-scroll in queue sheet"
```

---

### Task 4: Final verification

- [ ] **Step 1: Full type-check**

```bash
npx tsc --noEmit
```

Expected: 0 errors.

- [ ] **Step 2: Rust backend check**

```bash
cd src-tauri && cargo check
```

Expected: 0 errors (no Rust changes in this plan, but verify nothing is broken).

- [ ] **Step 3: Dev build smoke test**

```bash
npm run tauri dev
```

Expected: App launches without console errors.

- [ ] **Step 4: Manual test scenarios**

| Scenario | Expected Behavior |
|----------|-------------------|
| Click song in playlist | Queue = all playlist tracks, playback starts at clicked song |
| Click "Reproduzir" in playlist | Queue = all playlist tracks, starts from track 0 |
| Click "Aleatório" in playlist | Queue = shuffled playlist tracks, starts from track 0 |
| Click song from Home feed | Queue = only that single song |
| Play through last 5 tracks of loaded queue | `[QueueStore] Proactive prefetch triggered` appears in console |
| Continue playing past loaded tracks | Seamless — no gap, continuation loaded in background |
| Open queue sheet | Auto-scrolls to current playing track |
| Queue sheet with 200+ tracks | Smooth scrolling, no jank, low DOM node count |
| Click track in queue sheet | Plays that track, updates currentIndex |
| Remove track from queue sheet | Track disappears, indices adjust correctly |
| Repeat "one" mode | Same track replays, queue doesn't advance |
| Repeat "all" mode | Loops back to track 0 after last track |

- [ ] **Step 5: CPU idle check**

Open task manager while app is idle with a track paused. CPU usage should be **0%** (±1% noise). The `timeupdate` listener fires ~4x/s during playback but `set({ progress })` only triggers re-renders in components subscribed to `progress` — and the only subscriber (`ProgressBar`) uses DOM-direct updates, not React re-renders.
