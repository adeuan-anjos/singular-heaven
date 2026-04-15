# Lyrics View (UI Phase) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a fullscreen Apple Music–style lyrics view inside the YouTube Music module, fully composed with existing shadcn primitives, wired with Zustand and mocked data. Backend integration (LRCLIB, color extraction, word-level karaoke) is deferred to later plans.

**Architecture:** A `<LyricsSheet />` mounted once at the top level of the YouTube Music module renders a fullscreen `<SheetContent side="bottom">`. Open state is controlled by a tiny Zustand store (`lyrics-store.ts`) and triggered from the existing `<PlayerBar>` (new "Aa" button + click-to-open on the thumbnail and title). A custom `useLyrics` hook reads progress from `usePlayerStore` and selects the active line index from a static mock map; later this hook is the only swap point for real backend data.

**Tech Stack:** React 19, TypeScript, Tailwind CSS 4, shadcn/ui (Base UI under the hood: Sheet, Button, Slider, Toggle, Avatar, ScrollArea), Zustand, Wouter (already in use), lucide-react.

**Test strategy note:** This project does not currently ship a unit-test runner (no Vitest/Jest). Verification per task is done via TypeScript compilation (`npx tsc --noEmit`) plus visual end-to-end checks at the end of the plan via `npm run tauri dev`. Steps that would normally be "run failing test" / "run passing test" are replaced with "run type-check" and (at the verification phase) "run dev and observe behavior X".

---

## File Structure

### New files

| Path | Responsibility |
|------|----------------|
| `src/modules/youtube-music/types/lyrics.ts` | Type definitions (`LyricsLine`, `LyricsWord`, `LyricsData`, `LyricsType`) |
| `src/modules/youtube-music/mocks/lyrics-mock.ts` | Three mock songs: `synced`, `enhanced`, `missing` + fallback colors |
| `src/modules/youtube-music/stores/lyrics-store.ts` | Zustand store: `{ open, openLyrics(), closeLyrics() }` |
| `src/modules/youtube-music/hooks/use-lyrics.ts` | `useLyrics(videoId)` returning `{ data, activeLineIndex }`, derived from `usePlayerStore.progress` |
| `src/modules/youtube-music/components/lyrics/lyrics-background.tsx` | Animated gradient blobs (CSS keyframes) using dominant colors |
| `src/modules/youtube-music/components/lyrics/lyrics-line.tsx` | One line, `React.memo`, takes `state: "active" \| "near" \| "far"` |
| `src/modules/youtube-music/components/lyrics/lyrics-empty.tsx` | Fallback for songs with no lyrics — large artwork + centered title/artist |
| `src/modules/youtube-music/components/lyrics/lyrics-lines.tsx` | `ScrollArea` + map of `<LyricsLine>` + auto-scroll-to-active |
| `src/modules/youtube-music/components/lyrics/lyrics-controls.tsx` | Inline player controls (Toggle Shuffle, prev/play/next, Toggle Repeat) — reuses existing stores |
| `src/modules/youtube-music/components/lyrics/lyrics-artwork-panel.tsx` | Left column composition: Avatar + meta + Slider + `<LyricsControls />` |
| `src/modules/youtube-music/components/lyrics/lyrics-header.tsx` | Top bar with custom `<SheetClose>` button (ChevronDown) |
| `src/modules/youtube-music/components/lyrics/lyrics-sheet.tsx` | Root: reads `lyrics-store`, renders `<Sheet>` + `<SheetContent>` + composition |

### Modified files

| Path | Change |
|------|--------|
| `src/modules/youtube-music/components/layout/player-bar.tsx` | Add `Mic2` button on the right; add `onClick={openLyrics}` on the Avatar wrapper button and on the title `<p>` |
| `src/modules/youtube-music/index.tsx` | Mount `<LyricsSheet />` once inside the authenticated layout (next to `<QueueSheet>`) |

---

## Phase 0 — Pre-flight

### Task 1: Verify clean baseline

**Files:** none

- [ ] **Step 1: Run the existing type-check to capture a baseline**

Run:
```bash
npx tsc --noEmit
```

Expected: zero errors. If errors exist already, stop and report them — they are not introduced by this plan.

- [ ] **Step 2: Confirm `git status` is clean**

Run:
```bash
git status
```

Expected: `nothing to commit, working tree clean`. If not, stash or commit unrelated work before starting.

---

## Phase 1 — Data layer (types, mocks, store, hook)

### Task 2: Lyrics types

**Files:**
- Create: `src/modules/youtube-music/types/lyrics.ts`

- [ ] **Step 1: Create the file**

```ts
// src/modules/youtube-music/types/lyrics.ts

export interface LyricsWord {
  /** Seconds from the start of the track */
  time: number;
  text: string;
}

export interface LyricsLine {
  /** Seconds from the start of the track */
  time: number;
  text: string;
  /** Present only when type === "enhanced" */
  words?: LyricsWord[];
}

export type LyricsType = "synced" | "enhanced" | "missing";

export interface LyricsData {
  type: LyricsType;
  lines: LyricsLine[];
  /** 3 hex colors used by the animated background */
  colors: [string, string, string];
}
```

- [ ] **Step 2: Type-check**

Run:
```bash
npx tsc --noEmit
```

Expected: zero errors.

- [ ] **Step 3: Commit**

```bash
git add src/modules/youtube-music/types/lyrics.ts
git commit -m "feat(lyrics): add LyricsData/Line/Word type definitions"
```

---

### Task 3: Lyrics mocks

**Files:**
- Create: `src/modules/youtube-music/mocks/lyrics-mock.ts`

- [ ] **Step 1: Create the file**

```ts
// src/modules/youtube-music/mocks/lyrics-mock.ts
import type { LyricsData } from "../types/lyrics";

export const FALLBACK_COLORS: [string, string, string] = [
  "#1e293b",
  "#334155",
  "#475569",
];

const MOCK_SYNCED: LyricsData = {
  type: "synced",
  colors: ["#7c3aed", "#ec4899", "#f59e0b"],
  lines: [
    { time: 0, text: "When I find myself in times of trouble" },
    { time: 4, text: "Mother Mary comes to me" },
    { time: 8, text: "Speaking words of wisdom" },
    { time: 12, text: "Let it be" },
    { time: 18, text: "And in my hour of darkness" },
    { time: 22, text: "She is standing right in front of me" },
    { time: 26, text: "Speaking words of wisdom" },
    { time: 30, text: "Let it be" },
    { time: 36, text: "Let it be, let it be" },
    { time: 40, text: "Let it be, let it be" },
    { time: 44, text: "Whisper words of wisdom" },
    { time: 48, text: "Let it be" },
    { time: 56, text: "And when the broken-hearted people" },
    { time: 60, text: "Living in the world agree" },
    { time: 64, text: "There will be an answer" },
    { time: 68, text: "Let it be" },
    { time: 74, text: "For though they may be parted" },
    { time: 78, text: "There is still a chance that they will see" },
    { time: 82, text: "There will be an answer" },
    { time: 86, text: "Let it be" },
    { time: 92, text: "Let it be, let it be" },
    { time: 96, text: "Let it be, let it be" },
    { time: 100, text: "Yeah, there will be an answer" },
    { time: 104, text: "Let it be" },
  ],
};

const MOCK_ENHANCED: LyricsData = {
  type: "enhanced",
  colors: ["#0ea5e9", "#22d3ee", "#a78bfa"],
  lines: [
    {
      time: 0,
      text: "Hello darkness my old friend",
      words: [
        { time: 0, text: "Hello" },
        { time: 0.6, text: "darkness" },
        { time: 1.4, text: "my" },
        { time: 1.7, text: "old" },
        { time: 2.1, text: "friend" },
      ],
    },
    {
      time: 4,
      text: "I've come to talk with you again",
      words: [
        { time: 4, text: "I've" },
        { time: 4.3, text: "come" },
        { time: 4.7, text: "to" },
        { time: 4.9, text: "talk" },
        { time: 5.4, text: "with" },
        { time: 5.7, text: "you" },
        { time: 6.0, text: "again" },
      ],
    },
  ],
};

const MOCK_MISSING: LyricsData = {
  type: "missing",
  colors: FALLBACK_COLORS,
  lines: [],
};

export const LYRICS_MOCKS: Record<string, LyricsData> = {
  "mock-synced": MOCK_SYNCED,
  "mock-enhanced": MOCK_ENHANCED,
  "mock-missing": MOCK_MISSING,
};

/**
 * Default mock used when we have no entry for a real videoId.
 * Lets us see the synced view for any track during the UI phase.
 */
export const DEFAULT_MOCK = MOCK_SYNCED;
```

- [ ] **Step 2: Type-check**

Run:
```bash
npx tsc --noEmit
```

Expected: zero errors.

- [ ] **Step 3: Commit**

```bash
git add src/modules/youtube-music/mocks/lyrics-mock.ts
git commit -m "feat(lyrics): add mock data for synced/enhanced/missing states"
```

---

### Task 4: Lyrics store

**Files:**
- Create: `src/modules/youtube-music/stores/lyrics-store.ts`

- [ ] **Step 1: Create the file**

```ts
// src/modules/youtube-music/stores/lyrics-store.ts
import { create } from "zustand";

interface LyricsState {
  open: boolean;
}

interface LyricsActions {
  openLyrics: () => void;
  closeLyrics: () => void;
  setOpen: (open: boolean) => void;
}

export type LyricsStore = LyricsState & LyricsActions;

export const useLyricsStore = create<LyricsStore>()((set) => ({
  open: false,
  openLyrics: () => set({ open: true }),
  closeLyrics: () => set({ open: false }),
  setOpen: (open) => set({ open }),
}));
```

- [ ] **Step 2: Type-check**

Run:
```bash
npx tsc --noEmit
```

Expected: zero errors.

- [ ] **Step 3: Commit**

```bash
git add src/modules/youtube-music/stores/lyrics-store.ts
git commit -m "feat(lyrics): add zustand store for sheet open state"
```

---

### Task 5: useLyrics hook

**Files:**
- Create: `src/modules/youtube-music/hooks/use-lyrics.ts`

- [ ] **Step 1: Create the file**

```ts
// src/modules/youtube-music/hooks/use-lyrics.ts
import { useMemo } from "react";
import { usePlayerStore } from "../stores/player-store";
import { DEFAULT_MOCK, LYRICS_MOCKS } from "../mocks/lyrics-mock";
import type { LyricsData } from "../types/lyrics";

export interface UseLyricsResult {
  data: LyricsData | null;
  activeLineIndex: number;
}

/**
 * UI-phase implementation: reads from a static mock map.
 * When the LRCLIB backend lands, only the source of `data` changes;
 * the return shape stays identical.
 */
export function useLyrics(videoId: string | null | undefined): UseLyricsResult {
  const progress = usePlayerStore((s) => s.progress);

  const data = useMemo<LyricsData | null>(() => {
    if (!videoId) return null;
    return LYRICS_MOCKS[videoId] ?? DEFAULT_MOCK;
  }, [videoId]);

  const activeLineIndex = useMemo(() => {
    if (!data || data.lines.length === 0) return -1;
    let active = -1;
    for (let i = 0; i < data.lines.length; i++) {
      if (data.lines[i].time <= progress) active = i;
      else break;
    }
    return active;
  }, [data, progress]);

  return { data, activeLineIndex };
}
```

- [ ] **Step 2: Type-check**

Run:
```bash
npx tsc --noEmit
```

Expected: zero errors.

- [ ] **Step 3: Commit**

```bash
git add src/modules/youtube-music/hooks/use-lyrics.ts
git commit -m "feat(lyrics): add useLyrics hook deriving active line from progress"
```

---

## Phase 2 — Leaf components

### Task 6: LyricsBackground (animated gradient)

**Files:**
- Create: `src/modules/youtube-music/components/lyrics/lyrics-background.tsx`

- [ ] **Step 1: Create the file**

```tsx
// src/modules/youtube-music/components/lyrics/lyrics-background.tsx
import React from "react";

interface LyricsBackgroundProps {
  colors: readonly [string, string, string];
}

/**
 * Three softly-animated radial blobs behind the lyrics content.
 * Pure CSS — no JS animation loop — to keep GPU/CPU cost minimal.
 */
export const LyricsBackground = React.memo(function LyricsBackground({
  colors,
}: LyricsBackgroundProps) {
  return (
    <div className="pointer-events-none absolute inset-0 -z-10 overflow-hidden bg-background">
      <div
        className="lyrics-blob absolute -top-1/4 -left-1/4 size-[70vw] rounded-full opacity-60 blur-3xl"
        style={{
          background: colors[0],
          animation: "lyrics-blob-a 22s ease-in-out infinite",
        }}
      />
      <div
        className="lyrics-blob absolute top-1/3 -right-1/4 size-[60vw] rounded-full opacity-50 blur-3xl"
        style={{
          background: colors[1],
          animation: "lyrics-blob-b 28s ease-in-out infinite",
        }}
      />
      <div
        className="lyrics-blob absolute -bottom-1/4 left-1/4 size-[65vw] rounded-full opacity-50 blur-3xl"
        style={{
          background: colors[2],
          animation: "lyrics-blob-c 32s ease-in-out infinite",
        }}
      />
      <div className="absolute inset-0 bg-background/40" />
      <style>{`
        @keyframes lyrics-blob-a {
          0%, 100% { transform: translate(0, 0) scale(1); }
          50% { transform: translate(8vw, 6vh) scale(1.15); }
        }
        @keyframes lyrics-blob-b {
          0%, 100% { transform: translate(0, 0) scale(1); }
          50% { transform: translate(-10vw, 4vh) scale(1.1); }
        }
        @keyframes lyrics-blob-c {
          0%, 100% { transform: translate(0, 0) scale(1); }
          50% { transform: translate(6vw, -8vh) scale(1.2); }
        }
      `}</style>
    </div>
  );
});
```

- [ ] **Step 2: Type-check**

Run:
```bash
npx tsc --noEmit
```

Expected: zero errors.

- [ ] **Step 3: Commit**

```bash
git add src/modules/youtube-music/components/lyrics/lyrics-background.tsx
git commit -m "feat(lyrics): add animated gradient background component"
```

---

### Task 7: LyricsLine (single line, memoized)

**Files:**
- Create: `src/modules/youtube-music/components/lyrics/lyrics-line.tsx`

- [ ] **Step 1: Create the file**

```tsx
// src/modules/youtube-music/components/lyrics/lyrics-line.tsx
import React, { forwardRef } from "react";
import { cn } from "@/lib/utils";

export type LyricsLineState = "active" | "near" | "far";

interface LyricsLineProps {
  text: string;
  state: LyricsLineState;
  onClick: () => void;
}

const stateClasses: Record<LyricsLineState, string> = {
  active: "text-foreground opacity-100 scale-100",
  near: "text-foreground/60 scale-95",
  far: "text-foreground/30 scale-90",
};

export const LyricsLine = React.memo(
  forwardRef<HTMLButtonElement, LyricsLineProps>(function LyricsLine(
    { text, state, onClick },
    ref,
  ) {
    return (
      <button
        ref={ref}
        type="button"
        onClick={onClick}
        className={cn(
          "block w-full text-left text-3xl font-semibold leading-snug origin-left transition-all duration-500 ease-out cursor-pointer",
          stateClasses[state],
        )}
      >
        {text}
      </button>
    );
  }),
);
```

- [ ] **Step 2: Type-check**

Run:
```bash
npx tsc --noEmit
```

Expected: zero errors.

- [ ] **Step 3: Commit**

```bash
git add src/modules/youtube-music/components/lyrics/lyrics-line.tsx
git commit -m "feat(lyrics): add memoized LyricsLine with active/near/far states"
```

---

### Task 8: LyricsEmpty (fallback for missing lyrics)

**Files:**
- Create: `src/modules/youtube-music/components/lyrics/lyrics-empty.tsx`

- [ ] **Step 1: Create the file**

```tsx
// src/modules/youtube-music/components/lyrics/lyrics-empty.tsx
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { thumbUrl } from "../../utils/thumb-url";
import type { Track } from "../../types/music";

interface LyricsEmptyProps {
  track: Track;
}

/**
 * Rendered when LRCLIB returns no lyrics for the current track.
 * Mirrors a minimal "Now Playing" card centered in the right column.
 */
export function LyricsEmpty({ track }: LyricsEmptyProps) {
  const imgUrl = track.thumbnails[0]?.url ?? "";
  const artistName = track.artists.map((a) => a.name).join(", ");

  return (
    <div className="flex h-full flex-col items-center justify-center gap-4 text-center">
      <Avatar className="size-48 rounded-2xl">
        <AvatarImage
          src={thumbUrl(imgUrl, 400)}
          alt={track.title}
          className="rounded-2xl object-cover"
        />
        <AvatarFallback className="rounded-2xl text-3xl">
          {track.title.charAt(0)}
        </AvatarFallback>
      </Avatar>
      <div className="font-heading">
        <h2 className="text-2xl font-semibold text-foreground">{track.title}</h2>
        <p className="text-base text-muted-foreground">{artistName}</p>
      </div>
      <p className="mt-4 text-sm text-muted-foreground">
        Letra não disponível para esta música.
      </p>
    </div>
  );
}
```

- [ ] **Step 2: Type-check**

Run:
```bash
npx tsc --noEmit
```

Expected: zero errors.

- [ ] **Step 3: Commit**

```bash
git add src/modules/youtube-music/components/lyrics/lyrics-empty.tsx
git commit -m "feat(lyrics): add empty state for tracks without lyrics"
```

---

## Phase 3 — Composed components

### Task 9: LyricsLines (scrollable list with auto-scroll)

**Files:**
- Create: `src/modules/youtube-music/components/lyrics/lyrics-lines.tsx`

- [ ] **Step 1: Create the file**

```tsx
// src/modules/youtube-music/components/lyrics/lyrics-lines.tsx
import { useEffect, useMemo, useRef } from "react";
import { ScrollArea } from "@/components/ui/scroll-area";
import { LyricsLine, type LyricsLineState } from "./lyrics-line";
import { usePlayerStore } from "../../stores/player-store";
import type { LyricsData } from "../../types/lyrics";

interface LyricsLinesProps {
  data: LyricsData;
  activeLineIndex: number;
}

function classify(index: number, active: number): LyricsLineState {
  if (index === active) return "active";
  if (Math.abs(index - active) <= 2) return "near";
  return "far";
}

export function LyricsLines({ data, activeLineIndex }: LyricsLinesProps) {
  const seek = usePlayerStore((s) => s.seek);
  const viewportRef = useRef<HTMLDivElement>(null);
  const lineRefs = useRef<(HTMLButtonElement | null)[]>([]);

  // Keep the refs array sized to the number of lines
  const lineCount = data.lines.length;
  useMemo(() => {
    lineRefs.current = new Array(lineCount).fill(null);
  }, [lineCount]);

  useEffect(() => {
    if (activeLineIndex < 0) return;
    const node = lineRefs.current[activeLineIndex];
    if (!node) return;
    node.scrollIntoView({ block: "center", behavior: "smooth" });
  }, [activeLineIndex]);

  return (
    <ScrollArea viewportRef={viewportRef} className="h-full">
      <div className="mx-auto flex max-w-2xl flex-col gap-4 px-4 py-[40vh]">
        {data.lines.map((line, i) => (
          <LyricsLine
            key={`${line.time}-${i}`}
            ref={(el) => {
              lineRefs.current[i] = el;
            }}
            text={line.text}
            state={classify(i, activeLineIndex)}
            onClick={() => seek(line.time)}
          />
        ))}
      </div>
    </ScrollArea>
  );
}
```

- [ ] **Step 2: Type-check**

Run:
```bash
npx tsc --noEmit
```

Expected: zero errors.

- [ ] **Step 3: Commit**

```bash
git add src/modules/youtube-music/components/lyrics/lyrics-lines.tsx
git commit -m "feat(lyrics): add scrollable lines list with auto-scroll-to-active"
```

---

### Task 10: LyricsControls (inline player controls)

**Files:**
- Create: `src/modules/youtube-music/components/lyrics/lyrics-controls.tsx`

- [ ] **Step 1: Create the file**

```tsx
// src/modules/youtube-music/components/lyrics/lyrics-controls.tsx
import { Button } from "@/components/ui/button";
import { Toggle } from "@/components/ui/toggle";
import {
  Pause,
  Play as PlayIcon,
  Repeat,
  Repeat1,
  Shuffle,
  SkipBack,
  SkipForward,
} from "lucide-react";
import { usePlayerStore } from "../../stores/player-store";
import { useQueueStore } from "../../stores/queue-store";

export function LyricsControls() {
  const isPlaying = usePlayerStore((s) => s.isPlaying);
  const togglePlay = usePlayerStore((s) => s.togglePlay);
  const seek = usePlayerStore((s) => s.seek);
  const play = usePlayerStore((s) => s.play);

  const shuffleOn = useQueueStore((s) => s.shuffle);
  const repeat = useQueueStore((s) => s.repeat);
  const queueNext = useQueueStore((s) => s.next);
  const queuePrevious = useQueueStore((s) => s.previous);
  const toggleShuffle = useQueueStore((s) => s.toggleShuffle);
  const cycleRepeat = useQueueStore((s) => s.cycleRepeat);

  const handleNext = () => {
    void queueNext().then((nextId) => {
      if (nextId) play(nextId);
    });
  };

  const handlePrevious = () => {
    if (usePlayerStore.getState().progress > 3) {
      seek(0);
      return;
    }
    void queuePrevious().then((prevId) => {
      if (prevId) play(prevId);
    });
  };

  return (
    <div className="flex items-center gap-2">
      <Toggle
        size="sm"
        pressed={shuffleOn}
        onPressedChange={() => void toggleShuffle()}
        aria-label="Shuffle"
      >
        <Shuffle />
      </Toggle>
      <Button
        variant="ghost"
        size="icon"
        onClick={handlePrevious}
        aria-label="Anterior"
      >
        <SkipBack />
      </Button>
      <Button size="icon-lg" onClick={togglePlay} aria-label="Reproduzir">
        {isPlaying ? <Pause /> : <PlayIcon />}
      </Button>
      <Button
        variant="ghost"
        size="icon"
        onClick={handleNext}
        aria-label="Próxima"
      >
        <SkipForward />
      </Button>
      <Toggle
        size="sm"
        pressed={repeat !== "off"}
        onPressedChange={() => void cycleRepeat()}
        aria-label="Repetir"
      >
        {repeat === "one" ? <Repeat1 /> : <Repeat />}
      </Toggle>
    </div>
  );
}
```

- [ ] **Step 2: Type-check**

Run:
```bash
npx tsc --noEmit
```

Expected: zero errors.

- [ ] **Step 3: Commit**

```bash
git add src/modules/youtube-music/components/lyrics/lyrics-controls.tsx
git commit -m "feat(lyrics): add inline player controls for fullscreen view"
```

---

### Task 11: LyricsArtworkPanel (left column)

**Files:**
- Create: `src/modules/youtube-music/components/lyrics/lyrics-artwork-panel.tsx`

- [ ] **Step 1: Create the file**

```tsx
// src/modules/youtube-music/components/lyrics/lyrics-artwork-panel.tsx
import { useEffect, useRef } from "react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Slider } from "@/components/ui/slider";
import { LyricsControls } from "./lyrics-controls";
import { thumbUrl } from "../../utils/thumb-url";
import { usePlayerStore } from "../../stores/player-store";
import type { Track } from "../../types/music";

interface LyricsArtworkPanelProps {
  track: Track;
}

function formatTime(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${s.toString().padStart(2, "0")}`;
}

/**
 * Left column of the lyrics view: artwork, title/artist, scrubbable
 * Slider, and inline controls. Subscribes to progress via
 * usePlayerStore.subscribe so only this panel re-renders on tick,
 * not the entire LyricsSheet tree.
 */
export function LyricsArtworkPanel({ track }: LyricsArtworkPanelProps) {
  const seek = usePlayerStore((s) => s.seek);
  const duration = usePlayerStore((s) => s.duration);

  const sliderRef = useRef<HTMLDivElement>(null);
  const currentTimeRef = useRef<HTMLSpanElement>(null);
  const draggingRef = useRef(false);
  const localValueRef = useRef<number>(0);

  // Push progress updates into the slider DOM without React re-renders
  useEffect(() => {
    const update = (progress: number) => {
      if (draggingRef.current) return;
      localValueRef.current = progress;
      if (currentTimeRef.current) {
        currentTimeRef.current.textContent = formatTime(progress);
      }
      const root = sliderRef.current;
      if (!root) return;
      const dur = usePlayerStore.getState().duration;
      const pct = dur > 0 ? (progress / dur) * 100 : 0;
      const indicator = root.querySelector<HTMLElement>(
        '[data-slot="slider-range"]',
      );
      const thumb = root.querySelector<HTMLElement>(
        '[data-slot="slider-thumb"]',
      );
      if (indicator) indicator.style.width = `${Math.min(100, Math.max(0, pct))}%`;
      if (thumb)
        thumb.style.left = `${Math.min(100, Math.max(0, pct))}%`;
    };

    update(usePlayerStore.getState().progress);
    const unsubscribe = usePlayerStore.subscribe(
      (state) => state.progress,
      (progress) => update(progress),
    );
    return unsubscribe;
  }, []);

  const imgUrl = track.thumbnails[0]?.url ?? "";
  const artistName = track.artists.map((a) => a.name).join(", ");

  return (
    <div className="flex h-full flex-col items-start justify-center gap-6">
      <Avatar className="size-80 rounded-2xl shadow-2xl">
        <AvatarImage
          src={thumbUrl(imgUrl, 400)}
          alt={track.title}
          className="rounded-2xl object-cover"
        />
        <AvatarFallback className="rounded-2xl text-5xl">
          {track.title.charAt(0)}
        </AvatarFallback>
      </Avatar>

      <div className="font-heading">
        <h2 className="text-3xl font-semibold text-foreground">
          {track.title}
        </h2>
        <p className="text-lg text-muted-foreground">{artistName}</p>
      </div>

      <div className="flex w-full max-w-md flex-col gap-1">
        <div ref={sliderRef}>
          <Slider
            defaultValue={[0]}
            max={Math.max(duration, 1)}
            step={1}
            aria-label="Progresso"
            onValueChange={(v) => {
              const value = Array.isArray(v) ? v[0] : v;
              draggingRef.current = true;
              localValueRef.current = value;
              if (currentTimeRef.current) {
                currentTimeRef.current.textContent = formatTime(value);
              }
            }}
            onValueCommitted={(v) => {
              const value = Array.isArray(v) ? v[0] : v;
              draggingRef.current = false;
              seek(value);
            }}
          />
        </div>
        <div className="flex justify-between text-xs tabular-nums text-muted-foreground">
          <span ref={currentTimeRef}>0:00</span>
          <span>{formatTime(duration)}</span>
        </div>
      </div>

      <LyricsControls />
    </div>
  );
}
```

- [ ] **Step 2: Type-check**

Run:
```bash
npx tsc --noEmit
```

Expected: zero errors. If `Slider` does not accept `onValueCommitted`, replace that handler with calling `seek(value)` inside `onValueChange` after a small `setTimeout(0)` and remove the dragging guard. Re-run type-check.

- [ ] **Step 3: Commit**

```bash
git add src/modules/youtube-music/components/lyrics/lyrics-artwork-panel.tsx
git commit -m "feat(lyrics): add left artwork panel with scrubbable slider"
```

---

### Task 12: LyricsHeader (close button)

**Files:**
- Create: `src/modules/youtube-music/components/lyrics/lyrics-header.tsx`

- [ ] **Step 1: Create the file**

```tsx
// src/modules/youtube-music/components/lyrics/lyrics-header.tsx
import { Button } from "@/components/ui/button";
import { SheetClose } from "@/components/ui/sheet";
import { ChevronDown } from "lucide-react";

export function LyricsHeader() {
  return (
    <div className="flex h-14 items-center px-4">
      <SheetClose
        render={
          <Button variant="ghost" size="icon" aria-label="Fechar letra" />
        }
      >
        <ChevronDown />
      </SheetClose>
    </div>
  );
}
```

- [ ] **Step 2: Type-check**

Run:
```bash
npx tsc --noEmit
```

Expected: zero errors.

- [ ] **Step 3: Commit**

```bash
git add src/modules/youtube-music/components/lyrics/lyrics-header.tsx
git commit -m "feat(lyrics): add header with chevron-down close button"
```

---

## Phase 4 — Sheet wrapper

### Task 13: LyricsSheet (root)

**Files:**
- Create: `src/modules/youtube-music/components/lyrics/lyrics-sheet.tsx`

- [ ] **Step 1: Create the file**

```tsx
// src/modules/youtube-music/components/lyrics/lyrics-sheet.tsx
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetTitle,
} from "@/components/ui/sheet";
import { usePlayerStore } from "../../stores/player-store";
import { useTrack } from "../../stores/track-cache-store";
import { useLyricsStore } from "../../stores/lyrics-store";
import { useLyrics } from "../../hooks/use-lyrics";
import { LyricsBackground } from "./lyrics-background";
import { LyricsHeader } from "./lyrics-header";
import { LyricsArtworkPanel } from "./lyrics-artwork-panel";
import { LyricsLines } from "./lyrics-lines";
import { LyricsEmpty } from "./lyrics-empty";
import { FALLBACK_COLORS } from "../../mocks/lyrics-mock";

export function LyricsSheet() {
  const open = useLyricsStore((s) => s.open);
  const setOpen = useLyricsStore((s) => s.setOpen);
  const currentTrackId = usePlayerStore((s) => s.currentTrackId);
  const track = useTrack(currentTrackId ?? undefined);
  const { data, activeLineIndex } = useLyrics(currentTrackId);

  const colors = data?.colors ?? FALLBACK_COLORS;
  const hasLyrics = data !== null && data.type !== "missing";

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetContent
        side="bottom"
        showCloseButton={false}
        className="h-svh w-screen max-w-none gap-0 border-0 bg-transparent p-0"
      >
        <SheetTitle className="sr-only">Letra</SheetTitle>
        <SheetDescription className="sr-only">
          Visualização de letra sincronizada com a música atual.
        </SheetDescription>
        <LyricsBackground colors={colors} />

        {!track ? (
          <div className="flex h-full items-center justify-center text-muted-foreground">
            Nenhuma música tocando.
          </div>
        ) : (
          <>
            <LyricsHeader />
            <div className="grid min-h-0 flex-1 grid-cols-2 gap-12 overflow-hidden px-12 pb-8">
              <LyricsArtworkPanel track={track} />
              {hasLyrics && data ? (
                <LyricsLines data={data} activeLineIndex={activeLineIndex} />
              ) : (
                <LyricsEmpty track={track} />
              )}
            </div>
          </>
        )}
      </SheetContent>
    </Sheet>
  );
}
```

- [ ] **Step 2: Type-check**

Run:
```bash
npx tsc --noEmit
```

Expected: zero errors.

- [ ] **Step 3: Commit**

```bash
git add src/modules/youtube-music/components/lyrics/lyrics-sheet.tsx
git commit -m "feat(lyrics): add root LyricsSheet wiring all subcomponents"
```

---

## Phase 5 — Wire-up

### Task 14: Add Mic2 button + click handlers in PlayerBar

**Files:**
- Modify: `src/modules/youtube-music/components/layout/player-bar.tsx`

- [ ] **Step 1: Add `Mic2` to the icon imports**

Find the `lucide-react` import block (lines 8–21) and replace with:

```tsx
import {
  SkipBack,
  SkipForward,
  Play as PlayIcon,
  Pause,
  Shuffle,
  Repeat,
  Repeat1,
  Volume2,
  VolumeX,
  List,
  Heart,
  Radio,
  Mic2,
} from "lucide-react";
```

- [ ] **Step 2: Add the lyrics-store import**

After the line `import { useTrackLikeStore } from "../../stores/track-like-store";`, add:

```tsx
import { useLyricsStore } from "../../stores/lyrics-store";
```

- [ ] **Step 3: Read `openLyrics` from the store**

Inside the component body, after the line:

```tsx
const cycleRepeat = useQueueStore((s) => s.cycleRepeat);
```

add:

```tsx
const openLyrics = useLyricsStore((s) => s.openLyrics);
```

- [ ] **Step 4: Wire the avatar button to open lyrics**

Replace the avatar `<button>` block (currently `onClick={() => track.album && navigate(paths.album(track.album.id))}`) with:

```tsx
        <button
          type="button"
          className="shrink-0"
          onClick={openLyrics}
          aria-label="Abrir letra"
        >
          <Avatar className="h-12 w-12 rounded-md">
            <AvatarImage src={thumbUrl(imgUrl, 96)} alt={track.title} className="object-cover" />
            <AvatarFallback className="rounded-md">{track.title.charAt(0)}</AvatarFallback>
          </Avatar>
        </button>
```

- [ ] **Step 5: Make the title clickable (also opens lyrics)**

Replace the title `<p>` (currently `<p className="truncate text-sm font-medium text-foreground">{track.title}</p>`) with:

```tsx
            <button
              type="button"
              onClick={openLyrics}
              className="truncate text-left text-sm font-medium text-foreground hover:underline"
            >
              {track.title}
            </button>
```

- [ ] **Step 6: Add the Mic2 button before the queue button**

Replace the right-column block (`<Popover>...<Button ... onClick={onOpenQueue}>...</Button>`) so the order is **Volume → Lyrics (Mic2) → Queue**:

```tsx
      {/* Right: Volume + lyrics + queue */}
      <div className="flex items-center justify-end gap-1">
        <Popover>
          <PopoverTrigger
            className="inline-flex h-8 w-8 items-center justify-center rounded-md text-sm font-medium ring-offset-background transition-colors hover:bg-accent hover:text-accent-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50"
            aria-label="Volume"
          >
            {volume === 0 ? <VolumeX className="h-4 w-4" /> : <Volume2 className="h-4 w-4" />}
          </PopoverTrigger>
          <PopoverContent side="top" align="center" className="w-10 px-2 py-4">
            <Slider
              value={[volume]}
              max={100}
              step={1}
              orientation="vertical"
              onValueChange={(v) => setVolume(Array.isArray(v) ? v[0] : v)}
              className="h-24"
              aria-label="Volume"
            />
          </PopoverContent>
        </Popover>
        <Button
          variant="ghost"
          size="icon"
          className="h-8 w-8"
          onClick={openLyrics}
          aria-label="Abrir letra"
        >
          <Mic2 className="h-4 w-4" />
        </Button>
        <Button variant="ghost" size="icon" className="h-8 w-8" onClick={onOpenQueue} aria-label="Abrir fila">
          <List className="h-4 w-4" />
        </Button>
      </div>
```

- [ ] **Step 7: Type-check**

Run:
```bash
npx tsc --noEmit
```

Expected: zero errors.

- [ ] **Step 8: Commit**

```bash
git add src/modules/youtube-music/components/layout/player-bar.tsx
git commit -m "feat(player-bar): add Mic2 button and lyrics open triggers"
```

---

### Task 15: Mount LyricsSheet in module index

**Files:**
- Modify: `src/modules/youtube-music/index.tsx`

- [ ] **Step 1: Add the import**

After the line `import { QueueSheet } from "./components/queue/queue-sheet";` add:

```tsx
import { LyricsSheet } from "./components/lyrics/lyrics-sheet";
```

- [ ] **Step 2: Mount the component**

Find the line `<QueueSheet open={queueOpen} onOpenChange={setQueueOpen} />` and add immediately after it:

```tsx
            <LyricsSheet />
```

- [ ] **Step 3: Type-check**

Run:
```bash
npx tsc --noEmit
```

Expected: zero errors.

- [ ] **Step 4: Commit**

```bash
git add src/modules/youtube-music/index.tsx
git commit -m "feat(youtube-music): mount LyricsSheet in module root"
```

---

## Phase 6 — Verification

### Task 16: Visual end-to-end verification

**Files:** none

- [ ] **Step 1: Build for production to confirm no type errors anywhere**

Run:
```bash
npm run build
```

Expected: build succeeds with no errors.

- [ ] **Step 2: Start dev server**

Run (in a separate terminal so you can keep using bash):
```bash
npm run tauri dev
```

Wait until the Tauri window opens with the YouTube Music module loaded and a track playing.

- [ ] **Step 3: Manual checklist (record results)**

Verify each of the following and mark them off:

- [ ] Click the new **Mic2** icon on the right of the player bar → lyrics sheet slides up from bottom.
- [ ] Click the **album thumbnail** in the player bar → lyrics sheet opens.
- [ ] Click the **track title** in the player bar → lyrics sheet opens.
- [ ] Animated gradient background renders (three blobs slowly moving), not a static color.
- [ ] Left column shows the artwork at large size (~320px), title, artist, slider with current/duration time, and the inline controls (shuffle, prev, play/pause, next, repeat).
- [ ] Right column shows the lyrics list with the active line centered, larger and at full opacity, neighboring lines smaller and faded.
- [ ] As playback progresses, the active line moves and the list smoothly scrolls.
- [ ] Click any visible line → playback jumps to that timestamp and that line becomes active.
- [ ] Click the play/pause / skip / shuffle / repeat controls → behavior matches the regular player bar.
- [ ] Press `Esc` → sheet closes.
- [ ] Click outside the sheet (on the overlay) → sheet closes.
- [ ] Click the `ChevronDown` button in the header → sheet closes.
- [ ] Open the sheet with no track playing (after fresh launch, before clicking play) → "Nenhuma música tocando" placeholder appears, no crash.
- [ ] Open the sheet, then change the track from the queue → lyrics view updates to the new track.

- [ ] **Step 4: Inspect React DevTools (optional but recommended)**

Open the React DevTools Profiler. Record a 5-second session with the lyrics sheet open while music is playing. Confirm:

- Each progress tick re-renders only `LyricsLines` (and its currently-active and previously-active `LyricsLine` instances), not the whole `LyricsSheet`.
- `LyricsArtworkPanel` does NOT re-render on each tick (only on track or duration change).

If `LyricsArtworkPanel` re-renders on every tick, that means the DOM-direct slider sync from Task 11 is bypassed — investigate before claiming success.

- [ ] **Step 5: Stop dev server**

In the dev terminal: `Ctrl+C`.

- [ ] **Step 6: Final commit (only if any tweaks were needed)**

If you needed to adjust anything during verification, commit those tweaks:

```bash
git add -A
git commit -m "fix(lyrics): adjust UI based on visual verification"
```

If nothing needed adjusting, this step is a no-op.

---

## Done

The lyrics view is now usable end-to-end with mocked data. Backend integration (LRCLIB fetch via Tauri sidecar, real color extraction, word-level karaoke rendering) is the subject of subsequent specs and plans.

---

## Self-Review Notes (for the planner)

- **Spec coverage:** every numbered section of `2026-04-14-lyrics-view-design.md` maps to at least one task here. Sections 4 (file structure), 5 (layout), 6 (data), 7 (behavior) are covered by Tasks 2–13. Section 9 (verification) is Task 16. Section 10 (out of scope) is intentionally excluded.
- **Test framework caveat:** the spec's verification step lists `npm run lint`; this project has no lint script. We use `tsc --noEmit` and `npm run build` instead. Acceptable substitution called out in the plan header.
- **Slider API risk:** Task 11 uses `onValueCommitted`. Base UI's Slider supports it; if a future Slider version drops it, the inline fallback in Task 11, Step 2 covers the rewrite.
- **Performance:** progress updates flow into `LyricsLines` (re-renders the list, but each `LyricsLine` is `React.memo` so only the active and previously-active items re-render) and into `LyricsArtworkPanel` via direct DOM mutation (zero re-renders during playback). Both align with `CLAUDE.md` §4.1.
