# Page Shell Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Unify page layout in the YouTube Music module by introducing a single `ScrollRegion` + `PageContainer` shell, eliminate per-page wrapper duplication, and migrate the virtualized `TrackTable` to use the shell's external scroll element while preserving the 333MB memory baseline.

**Architecture:** A single `ScrollRegion` wraps `<Switch>` in `src/modules/youtube-music/index.tsx`. It owns the only scroll container in the module and publishes its viewport element via React context. `PageContainer` sits inside and applies width (`max-w-screen-xl`), padding (`p-6`), and gap (`gap-6`) uniformly. Pages render content directly without declaring their own outer wrapper. `TrackTable` reads the viewport from context, switches its virtualizer to `getScrollElement: () => viewport`, and uses `scrollMargin` to account for headers above the list in the same scroll.

**Tech Stack:** React 19, TypeScript 5.8, Tailwind v4, `@base-ui/react` (scroll-area primitives), `@tanstack/react-virtual` 3, Wouter 3, Vite 7, Tauri 2.

**Spec reference:** `docs/superpowers/specs/2026-04-11-page-shell-design.md`

---

## Verification strategy (read before starting)

**No unit-test framework is installed in this project.** There is no Vitest, Jest, Playwright-standalone, or lint script. "TDD" in this plan means:

1. **Structural correctness** — `npx tsc --noEmit` run after each file change. If tsc fails, fix before moving on. This is the mandatory gate for every code step.
2. **Runtime smoke verification** — `npm run tauri dev` running in the background, navigate to the affected route via the app's UI, check the browser devtools console for:
   - No new errors or warnings
   - Expected debug logs from `console.log("[ScrollRegion]…")`, `console.log("[TrackTable:…]…")`
   - DOM probes using devtools console snippets documented in each task
3. **Memory probe (playlist only)** — open a playlist with 1000+ tracks, read RAM from the debug overlay (`src/lib/debug` — `startMemoryMonitor`). Baseline is 333MB. Hard fail if >380MB.
4. **Visual smoke** — navigate to every one of the 8 routes after Fases 4/5 and confirm layout consistency (all pages share the same lateral padding, track rows no longer touch the borders in playlists).

**Every task that changes code ends with `npx tsc --noEmit` + commit. No exceptions.**

When a task needs to restart the dev server, it says so explicitly. The dev server should stay running in a background terminal throughout the work.

---

## File structure overview

**New files (3):**

| Path | Responsibility |
|---|---|
| `src/modules/youtube-music/components/layout/scroll-viewport-context.tsx` | React context exposing the `ScrollRegion`'s viewport element to descendants |
| `src/modules/youtube-music/components/layout/scroll-region.tsx` | Single scroll container for the module, built on Base UI `ScrollArea` primitives, publishes viewport via context |
| `src/modules/youtube-music/components/layout/page-container.tsx` | Width + padding + gap wrapper applied once around `<Switch>` |

**Modified files (12):**

| Path | What changes |
|---|---|
| `src/components/ui/scroll-area.tsx` | Add optional `viewportRef` prop forwarded to `ScrollAreaPrimitive.Viewport` |
| `src/modules/youtube-music/index.tsx` | Wrap `<Switch>` with `<ScrollRegion><PageContainer>` |
| `src/modules/youtube-music/components/shared/track-table.tsx` | Remove internal scroll container; virtualizer observes external viewport via context + `scrollMargin` |
| `src/modules/youtube-music/components/shared/section-header.tsx` | Remove `px-2` from root to eliminate padding compounding |
| `src/modules/youtube-music/components/home/home-view.tsx` | Remove `<div mx-auto max-w-screen-xl space-y-6 p-4>` wrapper |
| `src/modules/youtube-music/components/explore/explore-view.tsx` | Same |
| `src/modules/youtube-music/components/library/library-view.tsx` | Same |
| `src/modules/youtube-music/components/search/search-results-page.tsx` | Same |
| `src/modules/youtube-music/components/pages/album-page.tsx` | Remove outer `<ScrollArea>` + wrapper |
| `src/modules/youtube-music/components/pages/artist-page.tsx` | Same |
| `src/modules/youtube-music/components/pages/artist-songs-page.tsx` | Same |
| `src/modules/youtube-music/components/pages/playlist-page.tsx` | Remove `<div flex min-h-0 flex-1 flex-col>` wrapper; `TrackTable` becomes direct child of `PageContainer` |

---

## Phase 0: Baseline verification

### Task 0.1: Confirm clean baseline

- [ ] **Step 1: Verify worktree state**

Run:
```bash
git status
git log --oneline -5
```

Expected: working tree clean, HEAD on `refactor/page-shell`, last commit is the casing fix.

- [ ] **Step 2: Baseline type-check**

Run:
```bash
npx tsc --noEmit
echo "Exit: $?"
```

Expected: `Exit: 0` (no output).

- [ ] **Step 3: Start dev server in background terminal**

Run:
```bash
npm run tauri dev
```

Leave running. Expected: Tauri window opens, YouTube Music module loads after login flow.

- [ ] **Step 4: Capture baseline memory for playlist**

In the running app, log into YouTube Music, navigate to a playlist with 1000+ tracks (e.g., "Liked Music" or a large user playlist). Observe the debug overlay memory stat. Write it down as **baseline RAM: N MB** (expected near 333 MB).

---

## Phase 1: Foundation — new layout primitives

This phase introduces `ScrollViewportContext`, `ScrollRegion`, and `PageContainer`, plus the `viewportRef` prop on the shared `ScrollArea`. Nothing is connected yet — existing pages continue to work unchanged.

### Task 1.1: Create `ScrollViewportContext`

**Files:**
- Create: `src/modules/youtube-music/components/layout/scroll-viewport-context.tsx`

- [ ] **Step 1: Create directory if needed**

Run:
```bash
mkdir -p src/modules/youtube-music/components/layout
ls src/modules/youtube-music/components/layout
```

Expected: directory exists. `player-bar.tsx`, `progress-bar.tsx`, `side-panel.tsx`, `top-bar.tsx` already present.

- [ ] **Step 2: Write the context file**

Create `src/modules/youtube-music/components/layout/scroll-viewport-context.tsx` with:

```tsx
import { createContext, useContext } from "react";

export type ScrollViewportElement = HTMLDivElement | null;

export const ScrollViewportContext = createContext<ScrollViewportElement>(null);

/**
 * Returns the DOM element of the module's primary ScrollRegion viewport.
 * Consumers (e.g. virtualized lists) should treat a null return as "not mounted yet"
 * and re-run once the value becomes non-null.
 */
export function useScrollViewport(): ScrollViewportElement {
  return useContext(ScrollViewportContext);
}
```

- [ ] **Step 3: Type-check**

Run:
```bash
npx tsc --noEmit
echo "Exit: $?"
```

Expected: `Exit: 0`.

- [ ] **Step 4: Commit**

```bash
git add src/modules/youtube-music/components/layout/scroll-viewport-context.tsx
git commit -m "$(cat <<'EOF'
Add ScrollViewportContext for layout primitives

Introduces a React context exposing the module's scroll viewport element
so descendants (e.g. virtualized lists) can observe scroll events on a
shared container instead of each owning its own.

Co-Authored-By: Claude Opus 4.6 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 1.2: Add `viewportRef` to shared `ScrollArea`

**Files:**
- Modify: `src/components/ui/scroll-area.tsx`

**Authorization:** User explicitly approved editing `src/components/ui/` for this refactor (overrides CLAUDE.md §2 for this change only).

- [ ] **Step 1: Re-read the file**

```bash
cat src/components/ui/scroll-area.tsx
```

Expected: file as seen in the spec (~52 lines, uses `@base-ui/react/scroll-area`, no ref forwarding on Viewport).

- [ ] **Step 2: Apply the edit**

Replace the `ScrollArea` function body to accept and forward `viewportRef`:

```tsx
import { ScrollArea as ScrollAreaPrimitive } from "@base-ui/react/scroll-area"
import type { Ref } from "react"

import { cn } from "@/lib/utils"

interface ScrollAreaProps extends ScrollAreaPrimitive.Root.Props {
  viewportRef?: Ref<HTMLDivElement>
}

function ScrollArea({
  className,
  children,
  viewportRef,
  ...props
}: ScrollAreaProps) {
  return (
    <ScrollAreaPrimitive.Root
      data-slot="scroll-area"
      className={cn("relative", className)}
      {...props}
    >
      <ScrollAreaPrimitive.Viewport
        ref={viewportRef}
        data-slot="scroll-area-viewport"
        className="size-full rounded-[inherit] transition-[color,box-shadow] outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:outline-1"
      >
        {children}
      </ScrollAreaPrimitive.Viewport>
      <ScrollBar />
      <ScrollAreaPrimitive.Corner />
    </ScrollAreaPrimitive.Root>
  )
}
```

(The `ScrollBar` function below stays unchanged.)

- [ ] **Step 3: Re-read to confirm edit applied**

```bash
head -30 src/components/ui/scroll-area.tsx
```

Expected: new `ScrollAreaProps` interface visible, `viewportRef` destructured, passed to `Viewport` via `ref={viewportRef}`.

- [ ] **Step 4: Type-check**

```bash
npx tsc --noEmit
echo "Exit: $?"
```

Expected: `Exit: 0`. If Base UI's `ScrollArea.Viewport` doesn't accept a React `ref` prop directly (some Base UI primitives use `render` props), the error will say so — in that case, fall back to using the `render` prop pattern from Base UI docs.

**Runtime verification deferred** — this file has no consumers passing `viewportRef` yet. The change is backward-compatible (optional prop). Connection happens in Task 1.3.

- [ ] **Step 5: Commit**

```bash
git add src/components/ui/scroll-area.tsx
git commit -m "$(cat <<'EOF'
Forward viewportRef on shared ScrollArea

Exposes an optional viewportRef prop forwarded to the underlying Base UI
Viewport, unblocking consumers that need to observe the viewport element
(virtualized lists, scroll listeners, scroll-position restoration).

Backward-compatible: no existing usage passes viewportRef.

Co-Authored-By: Claude Opus 4.6 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 1.3: Create `ScrollRegion` component

**Files:**
- Create: `src/modules/youtube-music/components/layout/scroll-region.tsx`

- [ ] **Step 1: Write the file**

Create `src/modules/youtube-music/components/layout/scroll-region.tsx` with:

```tsx
import { useState, type ReactNode } from "react";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  ScrollViewportContext,
  type ScrollViewportElement,
} from "./scroll-viewport-context";

interface ScrollRegionProps {
  children: ReactNode;
}

/**
 * Single scroll container for the YouTube Music module. Owns the only
 * overflow-y:auto in the page and publishes its viewport element via
 * ScrollViewportContext so virtualized descendants can attach without
 * creating a second scroll.
 *
 * Uses useState (not useRef) for the viewport reference so consumers
 * re-render once the element mounts. TanStack Virtual's getScrollElement
 * depends on this to transition from null to the real element.
 */
export function ScrollRegion({ children }: ScrollRegionProps) {
  const [viewport, setViewport] = useState<ScrollViewportElement>(null);

  if (import.meta.env.DEV && viewport) {
    console.log("[ScrollRegion] viewport mounted", {
      tag: viewport.tagName,
      clientHeight: viewport.clientHeight,
    });
  }

  return (
    <ScrollArea
      className="flex min-h-0 min-w-0 flex-1 flex-col"
      viewportRef={setViewport}
    >
      <ScrollViewportContext.Provider value={viewport}>
        {children}
      </ScrollViewportContext.Provider>
    </ScrollArea>
  );
}
```

- [ ] **Step 2: Type-check**

```bash
npx tsc --noEmit
echo "Exit: $?"
```

Expected: `Exit: 0`.

- [ ] **Step 3: Commit**

```bash
git add src/modules/youtube-music/components/layout/scroll-region.tsx
git commit -m "$(cat <<'EOF'
Add ScrollRegion layout primitive

Single scroll container for the YouTube Music module. Wraps the shared
ScrollArea, captures the viewport element via callback ref (useState),
and publishes it through ScrollViewportContext so virtualized lists can
observe scroll without owning their own overflow container.

Co-Authored-By: Claude Opus 4.6 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 1.4: Create `PageContainer` component

**Files:**
- Create: `src/modules/youtube-music/components/layout/page-container.tsx`

- [ ] **Step 1: Write the file**

Create `src/modules/youtube-music/components/layout/page-container.tsx` with:

```tsx
import type { ReactNode } from "react";

interface PageContainerProps {
  children: ReactNode;
}

/**
 * Owns horizontal width, padding, and vertical gap for every page in the
 * YouTube Music module. Sits inside ScrollRegion and wraps <Switch>, so
 * routes render their content directly without declaring their own outer
 * wrapper.
 *
 * - max-w-screen-xl + mx-auto: centered content up to ~1280px.
 * - p-6: shadcn v4 dashboard default (24px on all sides).
 * - gap-6: vertical rhythm between sibling sections (replaces space-y-*).
 * - @container/main: enables container queries for descendants.
 */
export function PageContainer({ children }: PageContainerProps) {
  return (
    <div className="@container/main mx-auto flex w-full max-w-screen-xl flex-col gap-6 p-6">
      {children}
    </div>
  );
}
```

- [ ] **Step 2: Type-check**

```bash
npx tsc --noEmit
echo "Exit: $?"
```

Expected: `Exit: 0`.

- [ ] **Step 3: Commit**

```bash
git add src/modules/youtube-music/components/layout/page-container.tsx
git commit -m "$(cat <<'EOF'
Add PageContainer layout primitive

Single source of truth for page width, padding, and vertical gap in the
YouTube Music module. Applied once around <Switch> so no page declares
its own outer wrapper. Uses mx-auto + max-w-screen-xl + p-6 + gap-6 and
enables container queries via @container/main.

Co-Authored-By: Claude Opus 4.6 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 1.5: Phase 1 verification

- [ ] **Step 1: Full type-check**

```bash
npx tsc --noEmit
echo "Exit: $?"
```

Expected: `Exit: 0`.

- [ ] **Step 2: Confirm dev server still builds**

In the terminal running `npm run tauri dev`, check the Vite output. No new errors or HMR failures should appear.

- [ ] **Step 3: Probe new files exist and are wired**

```bash
ls src/modules/youtube-music/components/layout/
```

Expected: `page-container.tsx`, `player-bar.tsx`, `progress-bar.tsx`, `scroll-region.tsx`, `scroll-viewport-context.tsx`, `side-panel.tsx`, `top-bar.tsx`.

- [ ] **Step 4: Git log check**

```bash
git log --oneline -6
```

Expected: 4 new commits on top of the baseline fix and spec.

---

## Phase 2: Integration — connect shell to router

One-file change. Wraps `<Switch>` with the new primitives. After this phase the shell is active but pages still have their duplicated wrappers; visual result: nested max-width boxes (one from `PageContainer`, one from each page). Expected and temporary — resolved in Phase 4–5.

### Task 2.1: Wire `ScrollRegion` + `PageContainer` into the module root

**Files:**
- Modify: `src/modules/youtube-music/index.tsx`

- [ ] **Step 1: Re-read the relevant section**

```bash
sed -n '620,655p' src/modules/youtube-music/index.tsx
```

Confirm current shape — lines 626 through 652 contain the outer shell, `<Switch>`, and `</div></div>` closers.

- [ ] **Step 2: Add imports**

At the top of the file, next to existing layout imports:

```tsx
import { SidePanel } from "./components/layout/side-panel";
import { TopBar } from "./components/layout/top-bar";
import { PlayerBar } from "./components/layout/player-bar";
import { ScrollRegion } from "./components/layout/scroll-region";
import { PageContainer } from "./components/layout/page-container";
```

- [ ] **Step 3: Replace the `<div><Switch>…</Switch></div>` wrapper**

Find the block:
```tsx
<div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
  <Switch>
    <Route path={paths.home} component={HomeView} />
    <Route path={paths.explore} component={ExploreView} />
    <Route path={paths.library} component={LibraryView} />
    <Route path="/artist/:id/songs" component={ArtistSongsPage} />
    <Route path="/artist/:id" component={ArtistPage} />
    <Route path="/album/:id" component={AlbumPage} />
    <Route path="/playlist/:id" component={PlaylistPage} />
    <Route path="/search" component={SearchResultsPage} />
    <Route path="/mood" component={ExploreView} />
    <Route component={HomeView} />
  </Switch>
</div>
```

Replace with:
```tsx
<ScrollRegion>
  <PageContainer>
    <Switch>
      <Route path={paths.home} component={HomeView} />
      <Route path={paths.explore} component={ExploreView} />
      <Route path={paths.library} component={LibraryView} />
      <Route path="/artist/:id/songs" component={ArtistSongsPage} />
      <Route path="/artist/:id" component={ArtistPage} />
      <Route path="/album/:id" component={AlbumPage} />
      <Route path="/playlist/:id" component={PlaylistPage} />
      <Route path="/search" component={SearchResultsPage} />
      <Route path="/mood" component={ExploreView} />
      <Route component={HomeView} />
    </Switch>
  </PageContainer>
</ScrollRegion>
```

- [ ] **Step 4: Type-check**

```bash
npx tsc --noEmit
echo "Exit: $?"
```

Expected: `Exit: 0`.

- [ ] **Step 5: Runtime smoke — navigate all 8 routes**

In the running Tauri app:

1. Home (`/`) — loads without errors
2. Explore (`/explore`) — loads
3. Library (`/library`) — loads
4. Open an album → `/album/:id` — loads
5. Open an artist → `/artist/:id` — loads
6. Open artist songs → `/artist/:id/songs` — loads
7. Search for anything → `/search?q=…` — loads
8. Open a playlist → `/playlist/:id` — loads

For each: check the browser devtools console (Ctrl+Shift+I in the Tauri window):
- No new red errors
- Look for `[ScrollRegion] viewport mounted` log on first mount
- No React warnings about nested scroll areas

Expected visual state: all pages scroll but have **doubled** max-width wrappers — the page's own `mx-auto max-w-screen-xl` inside `PageContainer`'s `mx-auto max-w-screen-xl`. This is ugly but temporary. **Track rows in playlist may or may not render correctly** — the playlist still uses internal virtualization which will fight with the new shell scroll. That gets fixed in Phase 3.

If playlist completely fails to render, that's expected and not a blocker — Phase 3 fixes it immediately.

- [ ] **Step 6: Commit**

```bash
git add src/modules/youtube-music/index.tsx
git commit -m "$(cat <<'EOF'
Wire ScrollRegion + PageContainer into module shell

Replaces the inline <div flex min-h-0 flex-col overflow-hidden> wrapper
with ScrollRegion (single scroll) + PageContainer (max-width + padding).
Pages still have their own duplicated wrappers — Phases 4 and 5 remove
those. Playlist virtualization will be migrated next in Phase 3.

Co-Authored-By: Claude Opus 4.6 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Phase 3: TrackTable → external scroll

Critical phase. `TrackTable` migrates from owning its own scroll container (`scrollRef` + `ResizeObserver` + explicit pixel height) to observing the shell's viewport via `ScrollViewportContext`, with `scrollMargin` computed dynamically.

**Preservation goal:** memory must stay ≤ 380MB for a 1000+ track playlist. Failure criteria and rollback step documented.

### Task 3.1: Migrate `TrackTable` virtualization to external scroll

**Files:**
- Modify: `src/modules/youtube-music/components/shared/track-table.tsx` (only the `VirtualizedTrackTable` function — the non-virtualized branch is unchanged)

- [ ] **Step 1: Re-read the `VirtualizedTrackTable` function**

```bash
sed -n '368,545p' src/modules/youtube-music/components/shared/track-table.tsx
```

Confirm the shape described in the spec: `containerRef`, `scrollRef`, `containerHeight`, ResizeObserver, `<div ref={containerRef}>` outer wrapper, `<div ref={scrollRef}>` inner scroll, sticky header wrapper.

- [ ] **Step 2: Update imports at the top of the file**

Change:
```tsx
import React, { useState, useRef, useEffect } from "react";
import { useVirtualizer } from "@tanstack/react-virtual";
```

To:
```tsx
import React, { useState, useRef, useEffect, useLayoutEffect } from "react";
import { useVirtualizer } from "@tanstack/react-virtual";
import { useScrollViewport } from "../layout/scroll-viewport-context";
```

- [ ] **Step 3: Rewrite the `VirtualizedTrackTable` body**

Replace the entire `VirtualizedTrackTable` function (from `function VirtualizedTrackTable(...)` through the matching `}` around the return statement's closing) with the version below.

Key changes from the current shape:
- Remove `containerRef`, `scrollRef`, `containerHeight`, and their `ResizeObserver`.
- Add `const viewport = useScrollViewport()`.
- Add `listRef` anchor + `scrollMargin` state + a `ResizeObserver` that tracks both the `listRef` and the viewport, recomputing `scrollMargin` via `getBoundingClientRect`.
- `useVirtualizer({ getScrollElement: () => viewport, scrollMargin, overscan: 5 })`.
- Row `transform: translateY(${virtualRow.start - scrollMargin}px)`.
- Infinite-scroll block reads `viewport.scrollTop` instead of `scrollRef.current.scrollTop`.
- Outer `<div>` wrapper becomes a plain `<div>` anchoring `listRef`; no `flex min-h-0 flex-1`, no `overflow-y-auto`, no pixel-height style.
- Sticky header wrapper still uses `sticky top-0` but now sticks to the external scroll container.

```tsx
function VirtualizedTrackTable({
  tracks,
  currentTrackId,
  isPlaying = false,
  showViews = false,
  getTrackKey,
  showDuration = true,
  headerContent,
  onEndReached,
  onPlay,
  onAddToQueue,
  onAddToPlaylist,
  onRemoveFromPlaylist,
  onGoToArtist,
  onGoToAlbum,
}: {
  tracks: Track[];
  currentTrackId?: string;
  isPlaying?: boolean;
  showViews?: boolean;
  getTrackKey?: (track: Track, index: number) => string;
  showDuration?: boolean;
  headerContent?: React.ReactNode;
  onEndReached?: () => void;
  onPlay?: (track: Track) => void;
  onAddToQueue?: (track: Track) => void;
  onAddToPlaylist?: (track: Track) => void;
  onRemoveFromPlaylist?: (track: Track) => void;
  onGoToArtist?: (artistId: string) => void;
  onGoToAlbum?: (albumId: string) => void;
}) {
  const viewport = useScrollViewport();
  const listRef = useRef<HTMLDivElement>(null);
  const [scrollMargin, setScrollMargin] = useState(0);

  // Recompute scrollMargin whenever the list anchor or the viewport resizes.
  // scrollMargin is the distance from the viewport's scroll origin to the
  // top of the virtualized list, accounting for headerContent above it.
  useLayoutEffect(() => {
    const list = listRef.current;
    if (!list || !viewport) return;

    const recompute = () => {
      const listRect = list.getBoundingClientRect();
      const viewportRect = viewport.getBoundingClientRect();
      const next = Math.max(
        0,
        listRect.top - viewportRect.top + viewport.scrollTop
      );
      setScrollMargin((prev) => {
        if (Math.abs(prev - next) < 1) return prev;
        console.log("[TrackTable:Virtual] scrollMargin update", {
          previous: prev,
          current: next,
        });
        return next;
      });
    };

    recompute();

    const ro = new ResizeObserver(recompute);
    ro.observe(list);
    ro.observe(viewport);

    return () => ro.disconnect();
  }, [viewport]);

  const onEndReachedRef = useRef(onEndReached);
  onEndReachedRef.current = onEndReached;

  const lastLoadedAtLengthRef = useRef(0);
  const lastLoadScrollTopRef = useRef(0);

  const virtualizer = useVirtualizer({
    count: tracks.length,
    getScrollElement: () => viewport,
    estimateSize: () => ROW_HEIGHT_ESTIMATE,
    overscan: 5,
    scrollMargin,
    useFlushSync: false,
  });

  const virtualItems = virtualizer.getVirtualItems();
  const lastItem = virtualItems[virtualItems.length - 1];

  useEffect(() => {
    if (!lastItem || !onEndReachedRef.current || !viewport) return;

    const isNearEnd = lastItem.index >= tracks.length - 5;
    if (!isNearEnd) return;

    if (lastLoadedAtLengthRef.current >= tracks.length) return;

    if (lastLoadedAtLengthRef.current > 0) {
      if (viewport.scrollTop <= lastLoadScrollTopRef.current + ROW_HEIGHT_ESTIMATE) {
        return;
      }
    }

    console.log(
      "[TrackTable:Virtual] onEndReached — lastItem.index:",
      lastItem.index,
      "tracks.length:",
      tracks.length
    );
    lastLoadedAtLengthRef.current = tracks.length;
    lastLoadScrollTopRef.current = viewport.scrollTop;
    onEndReachedRef.current();
  }, [lastItem?.index, tracks.length, viewport]);

  return (
    <div ref={listRef} className="flex min-w-0 flex-col">
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
              key={
                getTrackKey?.(track, virtualRow.index) ??
                `${track.videoId}-${virtualRow.index}`
              }
              data-index={virtualRow.index}
              ref={virtualizer.measureElement}
              style={{
                position: "absolute",
                top: 0,
                left: 0,
                width: "100%",
                transform: `translateY(${virtualRow.start - scrollMargin}px)`,
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
                onAddToPlaylist={onAddToPlaylist}
                onRemoveFromPlaylist={onRemoveFromPlaylist}
                onGoToArtist={onGoToArtist}
                onGoToAlbum={onGoToAlbum}
              />
            </div>
          );
        })}
      </div>
    </div>
  );
}
```

- [ ] **Step 4: Re-read the full `VirtualizedTrackTable` after edit**

```bash
sed -n '368,545p' src/modules/youtube-music/components/shared/track-table.tsx
```

Confirm no leftover references to `containerRef`, `scrollRef`, `containerHeight`, or the inner `<div ref={scrollRef}>`.

- [ ] **Step 5: Type-check**

```bash
npx tsc --noEmit
echo "Exit: $?"
```

Expected: `Exit: 0`. Common errors to watch for:
- `useLayoutEffect` not imported — add to the React import at top.
- `useScrollViewport` import path wrong — must be `../layout/scroll-viewport-context`.
- Stale references to `scrollRef` or `containerRef` in closures — grep the file to confirm none remain.

- [ ] **Step 6: Runtime verification — playlist memory probe (critical)**

1. Save + HMR should pick the change up. If not, the Tauri dev window will need a reload (Ctrl+R).
2. Navigate to a playlist with 1000+ tracks.
3. Open the debug overlay / memory monitor.
4. Record peak RAM.
5. Scroll the playlist top-to-bottom at a normal pace (not flinging).
6. Record peak RAM during scroll.
7. In devtools console, run:
   ```js
   document.querySelectorAll('[data-index]').length
   ```
   Expected: a small number (roughly `visible rows + overscan*2`, typically 15–25). **If this returns a number close to `tracks.length`, virtualization is broken — stop and investigate.**

**Pass criteria:**
- Peak RAM ≤ 380 MB (14% margin over 333 MB baseline).
- `data-index` element count stays bounded.
- No new console errors.
- Scroll is smooth (no jank; FPS ≥ 55 in devtools perf panel).

**Fail criteria → rollback this task:**
```bash
git reset --hard HEAD
```
Then investigate. Do NOT commit a failing migration.

- [ ] **Step 7: Runtime verification — playlist visual**

- Track rows should now respect lateral padding (16px on each side from `p-6` minus `px-2` internal = visible gap).
- Hover highlight should NOT touch the PageContainer's borders — this is the original bug being fixed.
- Header row of the track table should stick to the top while scrolling.
- `headerContent` (collection header, tabs, actions) should scroll with the page normally.

- [ ] **Step 8: Runtime verification — other pages using `TrackTable`**

`album-page`, `artist-page`, `artist-songs-page` use `TrackTable` **without** `enableVirtualization`. That path is the non-virtualized branch (lines 131–344 of track-table.tsx) which is untouched. Still, sanity check: open an album and an artist songs page, confirm the track list renders. No changes expected.

- [ ] **Step 9: Commit**

```bash
git add src/modules/youtube-music/components/shared/track-table.tsx
git commit -m "$(cat <<'EOF'
Migrate TrackTable virtualization to external scroll element

VirtualizedTrackTable no longer owns a scroll container. It reads the
shell's scroll viewport from ScrollViewportContext, configures the
virtualizer with getScrollElement pointing at that viewport, and
computes scrollMargin dynamically via ResizeObserver on a list anchor
so rows stay aligned below headerContent that scrolls with the page.

Infinite-scroll tracking now reads viewport.scrollTop. Non-virtualized
branch unchanged.

Verified: 1000+ track playlist stays at <=380MB, data-index count
stays bounded, scroll smooth.

Co-Authored-By: Claude Opus 4.6 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Phase 4: Clean up static pages + section-header

Five-file phase respecting CLAUDE.md §13. Removes the duplicated `mx-auto max-w-screen-xl space-y-* p-4` wrappers from home/explore/library/search and fixes the `section-header` horizontal padding compounding.

### Task 4.1: Remove `px-2` from `section-header`

**Files:**
- Modify: `src/modules/youtube-music/components/shared/section-header.tsx`

- [ ] **Step 1: Re-read**

```bash
cat src/modules/youtube-music/components/shared/section-header.tsx
```

- [ ] **Step 2: Remove `px-2` from the root className**

Edit line 10 from:
```tsx
<div className="flex items-center justify-between px-2">
```

To:
```tsx
<div className="flex items-center justify-between">
```

- [ ] **Step 3: Type-check**

```bash
npx tsc --noEmit
echo "Exit: $?"
```

Expected: `Exit: 0`.

- [ ] **Step 4: Runtime verification**

Navigate to `/explore` (the page that uses `SectionHeader` most). Confirm section titles ("Momentos e gêneros", etc.) now align flush with the left edge of the grids below them — no 8px indent anymore.

---

### Task 4.2: Remove wrapper from `home-view`

**Files:**
- Modify: `src/modules/youtube-music/components/home/home-view.tsx`

- [ ] **Step 1: Re-read lines 175–210**

```bash
sed -n '175,210p' src/modules/youtube-music/components/home/home-view.tsx
```

Find the `return (` block with `<ScrollArea h-full>` and `<div className="mx-auto max-w-screen-xl space-y-6 p-4">`.

- [ ] **Step 2: Remove the outer wrapper**

Locate the pattern (approximately):
```tsx
return (
  <ScrollArea className="group/page h-full">
    <div className="mx-auto max-w-screen-xl space-y-6 p-4">
      {/* actual content */}
    </div>
  </ScrollArea>
);
```

(Or variations — `home-view.tsx` may have `<div className="mx-auto max-w-screen-xl space-y-6 p-4">` without `ScrollArea`. Inspect line 181 exactly.)

Replace with:
```tsx
return (
  <div className="flex flex-col gap-6">
    {/* actual content — unchanged */}
  </div>
);
```

**Rationale:**
- `mx-auto`, `max-w-screen-xl`, `p-4`: deleted — owned by `PageContainer`.
- `<ScrollArea h-full>`: deleted — owned by `ScrollRegion`.
- `space-y-6` → `flex flex-col gap-6`: same visual effect, shadcn v4 convention. Keep it at page level for local section spacing (PageContainer's own `gap-6` already handles top-level sibling gap but home-view has internal sections that benefit).

- [ ] **Step 3: Verify no leftover imports**

If the edit removed the last use of `ScrollArea` in `home-view.tsx`, delete its import:
```bash
grep -n "ScrollArea" src/modules/youtube-music/components/home/home-view.tsx
```

If no matches remain, remove the import line at top.

- [ ] **Step 4: Type-check**

```bash
npx tsc --noEmit
echo "Exit: $?"
```

Expected: `Exit: 0`.

- [ ] **Step 5: Runtime verification**

Navigate to `/` in the app. Home loads, scrolls correctly, lateral padding comes from `PageContainer` (24px from `p-6`), no double max-width.

---

### Task 4.3: Remove wrapper from `explore-view`

**Files:**
- Modify: `src/modules/youtube-music/components/explore/explore-view.tsx`

- [ ] **Step 1: Re-read lines 115–130**

```bash
sed -n '115,130p' src/modules/youtube-music/components/explore/explore-view.tsx
```

Locate the `<div className="mx-auto max-w-screen-xl space-y-6 p-4">` wrapper (line 119).

- [ ] **Step 2: Remove the wrapper**

Replace:
```tsx
<div className="mx-auto max-w-screen-xl space-y-6 p-4">
  {/* content */}
</div>
```

With:
```tsx
<div className="flex flex-col gap-6">
  {/* content */}
</div>
```

- [ ] **Step 3: Check for `<ScrollArea>` wrapper**

```bash
grep -n "ScrollArea" src/modules/youtube-music/components/explore/explore-view.tsx
```

If `<ScrollArea>` is wrapping the return, remove it — same rationale as Task 4.2.

- [ ] **Step 4: Type-check**

```bash
npx tsc --noEmit
echo "Exit: $?"
```

Expected: `Exit: 0`.

- [ ] **Step 5: Runtime verification**

Navigate to `/explore`. Page loads, section headers align flush, grids have consistent padding.

---

### Task 4.4: Remove wrapper from `library-view`

**Files:**
- Modify: `src/modules/youtube-music/components/library/library-view.tsx`

- [ ] **Step 1: Re-read lines 100–115**

```bash
sed -n '100,115p' src/modules/youtube-music/components/library/library-view.tsx
```

- [ ] **Step 2: Remove the wrapper (same pattern as 4.2/4.3)**

Replace the `<div className="mx-auto max-w-screen-xl space-y-6 p-4">` with `<div className="flex flex-col gap-6">`.

- [ ] **Step 3: Type-check**

```bash
npx tsc --noEmit
```

Expected: exit 0.

- [ ] **Step 4: Runtime verification**

Navigate to `/library`. MediaGrid renders correctly, lateral padding uniform with home/explore.

---

### Task 4.5: Remove wrapper from `search-results-page` + commit Phase 4

**Files:**
- Modify: `src/modules/youtube-music/components/search/search-results-page.tsx`

- [ ] **Step 1: Re-read around line 292**

```bash
sed -n '285,305p' src/modules/youtube-music/components/search/search-results-page.tsx
```

- [ ] **Step 2: Remove the wrapper (same pattern)**

Replace the `<div className="mx-auto max-w-screen-xl space-y-6 p-4">` with `<div className="flex flex-col gap-6">`.

- [ ] **Step 3: Type-check**

```bash
npx tsc --noEmit
```

Expected: exit 0.

- [ ] **Step 4: Runtime verification — all 4 static pages + section headers**

Navigate in order:
1. `/` — home
2. `/explore` — explore (check SectionHeader alignment)
3. `/library` — library
4. Search for something — results page

Verify on each:
- Lateral padding identical (24px on each side from `p-6`).
- No double max-width boxes.
- No ScrollArea nesting warnings in console.
- SectionHeader titles align with grid/carousel content below them.

- [ ] **Step 5: Commit Phase 4**

```bash
git add src/modules/youtube-music/components/shared/section-header.tsx src/modules/youtube-music/components/home/home-view.tsx src/modules/youtube-music/components/explore/explore-view.tsx src/modules/youtube-music/components/library/library-view.tsx src/modules/youtube-music/components/search/search-results-page.tsx
git commit -m "$(cat <<'EOF'
Remove duplicated layout wrappers from static pages

Drops the per-page mx-auto max-w-screen-xl space-y-6 p-4 wrappers from
home, explore, library, and search. PageContainer now owns width,
padding, and top-level gap. Also removes px-2 from section-header root
to eliminate 8px compounding with the container padding.

Co-Authored-By: Claude Opus 4.6 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Phase 5: Clean up collection pages

Four files: the remaining pages that show album/artist/playlist data, all of which currently wrap content in `<ScrollArea>` + `mx-auto max-w-screen-xl space-y-4 p-4`.

### Task 5.1: Clean up `album-page`

**Files:**
- Modify: `src/modules/youtube-music/components/pages/album-page.tsx`

- [ ] **Step 1: Re-read around lines 113–130**

```bash
sed -n '113,130p' src/modules/youtube-music/components/pages/album-page.tsx
```

Current structure:
```tsx
return (
  <ScrollArea className="group/page h-full">
    <div className="mx-auto max-w-screen-xl space-y-4 p-4">
      <CollectionHeader ... />
      ...
      <TrackTable ... />
    </div>
  </ScrollArea>
);
```

- [ ] **Step 2: Remove outer ScrollArea + wrapper**

Replace with:
```tsx
return (
  <div className="flex flex-col gap-4">
    <CollectionHeader ... />
    ...
    <TrackTable ... />
  </div>
);
```

- [ ] **Step 3: Clean up unused `ScrollArea` import**

```bash
grep -n "ScrollArea" src/modules/youtube-music/components/pages/album-page.tsx
```

If zero matches, remove the import line.

- [ ] **Step 4: Type-check**

```bash
npx tsc --noEmit
```

Expected: exit 0.

- [ ] **Step 5: Runtime verification**

Navigate to an album. Track list renders (non-virtualized branch of TrackTable), hover is a pill inside the container, no double max-width.

---

### Task 5.2: Clean up `artist-page`

**Files:**
- Modify: `src/modules/youtube-music/components/pages/artist-page.tsx`

- [ ] **Step 1: Re-read around lines 113–130**

```bash
sed -n '113,130p' src/modules/youtube-music/components/pages/artist-page.tsx
```

- [ ] **Step 2: Same edit as 5.1**

Remove `<ScrollArea>` + `<div mx-auto max-w-screen-xl space-y-4 p-4>` wrappers. Keep inner content with `<div className="flex flex-col gap-4">`.

- [ ] **Step 3: Clean up unused import if applicable**

- [ ] **Step 4: Type-check**

```bash
npx tsc --noEmit
```

- [ ] **Step 5: Runtime verification**

Navigate to an artist. Hero, carousels, top-tracks all render with uniform padding.

---

### Task 5.3: Clean up `artist-songs-page`

**Files:**
- Modify: `src/modules/youtube-music/components/pages/artist-songs-page.tsx`

- [ ] **Step 1: Re-read around lines 140–160**

```bash
sed -n '140,160p' src/modules/youtube-music/components/pages/artist-songs-page.tsx
```

- [ ] **Step 2: Same edit as 5.1**

Remove outer wrappers, use `<div className="flex flex-col gap-4">`.

- [ ] **Step 3: Clean up unused import if applicable**

- [ ] **Step 4: Type-check**

```bash
npx tsc --noEmit
```

- [ ] **Step 5: Runtime verification**

Navigate to an artist then "Ver todas as músicas". Track table (non-virtualized) renders correctly.

---

### Task 5.4: Clean up `playlist-page` + commit Phase 5 + memory retest

**Files:**
- Modify: `src/modules/youtube-music/components/pages/playlist-page.tsx`

- [ ] **Step 1: Re-read lines 545–560**

```bash
sed -n '545,560p' src/modules/youtube-music/components/pages/playlist-page.tsx
```

Current:
```tsx
return (
  <div className="flex min-h-0 flex-1 flex-col">
    {filteredTracks.length > 0 ? (
      <TrackTable ... />
    ) : (
      ...empty state...
    )}
  </div>
);
```

- [ ] **Step 2: Remove the flex wrapper**

The `flex min-h-0 flex-1 flex-col` wrapper exists to constrain the TrackTable's old internal ResizeObserver. That's no longer needed — TrackTable now reads the external viewport. Replace with a plain `<div className="flex flex-col gap-4">` so it matches the other collection pages:

```tsx
return (
  <div className="flex flex-col gap-4">
    {filteredTracks.length > 0 ? (
      <TrackTable ... />
    ) : (
      ...empty state...
    )}
  </div>
);
```

- [ ] **Step 3: Verify the empty state branch**

Line 637 currently has:
```tsx
<div className="flex min-h-0 flex-1 flex-col overflow-y-auto">
  {headerContent}
  <div className="flex flex-1 items-center justify-center px-4 py-12">
```

Remove the outer `overflow-y-auto` (we're inside ScrollRegion now) and the `min-h-0 flex-1` constraints:

```tsx
<div className="flex flex-col">
  {headerContent}
  <div className="flex items-center justify-center px-4 py-12">
```

- [ ] **Step 4: Type-check**

```bash
npx tsc --noEmit
```

Expected: exit 0.

- [ ] **Step 5: Critical memory retest**

1. Hard reload the Tauri window (Ctrl+R).
2. Navigate to a playlist with 1000+ tracks.
3. Record peak RAM from debug overlay.
4. Scroll top-to-bottom.
5. Record peak RAM during scroll.
6. Run in devtools console:
   ```js
   document.querySelectorAll('[data-index]').length
   ```
   Expected: 15–25.

**Pass:** peak ≤ 380 MB, bounded row count.
**Fail:** revert this task with `git reset --hard HEAD`, investigate, re-plan.

- [ ] **Step 6: Runtime verification — all collection pages**

Navigate:
1. Album
2. Artist
3. Artist songs
4. Playlist (small and 1000+)

Confirm for each:
- Lateral padding matches `PageContainer` (24px on each side).
- Track-row hover is a pill inside the container bounds — **the original bug is fixed**.
- No console errors.
- Sticky table header still sticks during scroll.

- [ ] **Step 7: Commit Phase 5**

```bash
git add src/modules/youtube-music/components/pages/album-page.tsx src/modules/youtube-music/components/pages/artist-page.tsx src/modules/youtube-music/components/pages/artist-songs-page.tsx src/modules/youtube-music/components/pages/playlist-page.tsx
git commit -m "$(cat <<'EOF'
Remove duplicated layout wrappers from collection pages

Drops per-page ScrollArea + mx-auto max-w-screen-xl space-y-4 p-4
wrappers from album, artist, artist-songs, and playlist. Playlist
also drops its flex min-h-0 constraint — no longer needed now that
TrackTable uses the shell's external scroll viewport.

The playlist track-row hover bug (highlight touching container
borders) is now fixed — track rows sit inside PageContainer padding
like every other page.

Verified: 1000+ track playlist peak RAM <= 380MB.

Co-Authored-By: Claude Opus 4.6 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Phase 6: Final audit

Cross-cutting verification. No new code; only checks and documentation.

### Task 6.1: Full 8-route visual audit

- [ ] **Step 1: Tauri hard reload**

Ctrl+R in the Tauri window to ensure fresh module mount.

- [ ] **Step 2: Visit every route in sequence**

Record for each:
- Route name
- Lateral padding (should be 24px = `p-6` on both sides, measured via devtools inspecting PageContainer)
- Max width (should be ~1280px = `max-w-screen-xl`, centered on wide windows)
- No console errors
- No visual misalignment of section headers or content blocks

| Route | Padding OK | Width OK | Console clean |
|---|---|---|---|
| `/` (home) | [ ] | [ ] | [ ] |
| `/explore` | [ ] | [ ] | [ ] |
| `/library` | [ ] | [ ] | [ ] |
| `/search?q=…` | [ ] | [ ] | [ ] |
| `/album/:id` | [ ] | [ ] | [ ] |
| `/artist/:id` | [ ] | [ ] | [ ] |
| `/artist/:id/songs` | [ ] | [ ] | [ ] |
| `/playlist/:id` | [ ] | [ ] | [ ] |

If any row fails, stop and investigate before continuing.

### Task 6.2: Virtualization + memory audit

- [ ] **Step 1: Open a 1000+ track playlist**

- [ ] **Step 2: Peak RAM**

Record. Must be ≤ 380 MB.

- [ ] **Step 3: Virtualized row count in DOM**

Devtools console:
```js
document.querySelectorAll('[data-index]').length
```
Expected: ≤ 30.

- [ ] **Step 4: Scroll performance**

Open the Performance tab in devtools, record a 5-second scroll from top. Check FPS stays ≥ 55.

- [ ] **Step 5: Infinite scroll**

If the playlist lazy-loads pages, scroll to the bottom and confirm `onEndReached` fires — look for the log `[TrackTable:Virtual] onEndReached`.

### Task 6.3: Build verification

- [ ] **Step 1: Stop the dev server**

Ctrl+C in the background terminal running `npm run tauri dev`.

- [ ] **Step 2: Production type-check + bundle**

```bash
npm run build
echo "Exit: $?"
```

Expected: `Exit: 0`. Vite produces the `dist/` bundle without errors. This runs `tsc && vite build` per the `package.json` script.

If `tsc` fails, fix the error and re-run. Do not proceed with known type errors.

### Task 6.4: Dead-code check

- [ ] **Step 1: Grep for orphaned references**

```bash
grep -rn "containerRef\|scrollRef\|containerHeight" src/modules/youtube-music/components/shared/track-table.tsx
```
Expected: no matches (confirms Phase 3 cleanup was complete).

```bash
grep -rn "max-w-screen-xl" src/modules/youtube-music/components/ | grep -v "/layout/"
```
Expected: no matches outside `layout/page-container.tsx`.

```bash
grep -rn 'className=".*\bp-4\b.*space-y' src/modules/youtube-music/components/
```
Expected: no matches (confirms all duplicated wrappers are gone).

- [ ] **Step 2: Confirm ScrollArea uses are intentional**

```bash
grep -rn "<ScrollArea" src/modules/youtube-music/components/
```
Acceptable remaining uses: inside `carousel-section.tsx` and `chart-list.tsx` (horizontal scrollers), and any intentional local scroll areas. There should be no `<ScrollArea className="group/page h-full">` left in pages.

### Task 6.5: Git log review

- [ ] **Step 1: List all commits on the branch**

```bash
git log --oneline master..HEAD
```

Expected sequence (approximate):
1. Fix file casing (baseline cleanup)
2. Add ScrollViewportContext
3. Forward viewportRef on shared ScrollArea
4. Add ScrollRegion layout primitive
5. Add PageContainer layout primitive
6. Wire ScrollRegion + PageContainer into module shell
7. Migrate TrackTable virtualization to external scroll element
8. Remove duplicated layout wrappers from static pages
9. Remove duplicated layout wrappers from collection pages

- [ ] **Step 2: Confirm clean working tree**

```bash
git status
```

Expected: nothing to commit, working tree clean.

### Task 6.6: Hand off for user review

- [ ] **Step 1: Summarize to the user**

Report:
- All 6 phases complete
- 15 code files touched (3 new, 12 modified)
- 8 routes visually consistent (all same padding, max-width, gap)
- Playlist hover bug resolved
- Playlist peak RAM: **[actual measured number]** MB (baseline 333 MB, limit 380 MB)
- Production build passes
- Ready for manual QA or merge decision

- [ ] **Step 2: Ask for next step**

Options to present:
1. Merge the worktree branch back to master
2. Hold for further iteration
3. Cherry-pick specific commits
4. Discard and revert

---

## Self-review checklist

This is an inline check performed by the plan author, not a separate step.

**Spec coverage:**
- [x] `ScrollViewportContext` — Task 1.1
- [x] `ScrollRegion` — Task 1.3
- [x] `PageContainer` — Task 1.4
- [x] `ScrollArea.viewportRef` — Task 1.2
- [x] `index.tsx` integration — Task 2.1
- [x] `TrackTable` external scroll + scrollMargin — Task 3.1
- [x] `section-header` px-2 removal — Task 4.1
- [x] `home-view`, `explore-view`, `library-view`, `search-results-page` — Tasks 4.2–4.5
- [x] `album-page`, `artist-page`, `artist-songs-page`, `playlist-page` — Tasks 5.1–5.4
- [x] Memory preservation criteria — Tasks 3.1 + 5.4
- [x] Type-check + build verification — Task 6.3
- [x] Dead-code audit — Task 6.4

**Placeholder scan:** No TODO, TBD, "similar to task N", or "implement details later" markers. Every code step shows actual code.

**Type consistency:** `ScrollViewportElement`, `useScrollViewport`, `viewport`, `scrollMargin` are named consistently across tasks 1.1, 1.3, 3.1.

**Scope:** This plan covers a single architectural concern (page layout shell). Memory retest is the only cross-cutting check. No decomposition needed.

---

## Rollback strategy

If any phase fails its verification step:

1. **Single-task failure:** `git reset --hard HEAD` to drop the uncommitted change.
2. **Post-commit failure:** `git revert <commit-sha>` to create an inverse commit (keeps history clean).
3. **Phase-level catastrophic failure:** `git reset --hard <phase-start-sha>` to rewind the branch to before the phase began, then re-plan.
4. **Full abort:** `git worktree remove .worktrees/page-shell --force` from the main repo to discard the entire isolated workspace. The master branch is untouched.

The worktree is isolated — nothing on master changes until a merge decision is made at Task 6.6.
