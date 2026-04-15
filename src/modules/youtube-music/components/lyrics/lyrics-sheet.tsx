// src/modules/youtube-music/components/lyrics/lyrics-sheet.tsx
import { AnimatePresence, motion } from "motion/react";
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
import { FALLBACK_COLORS } from "../../constants/lyrics";

const SLIDE_SPRING = { type: "spring" as const, stiffness: 200, damping: 30 };

/**
 * Grid template column string for CSS grid-template-columns transition.
 * Chromium 2024+ supports animating grid-template-columns with CSS transitions.
 * We apply it via inline style so Tailwind's purger doesn't strip it.
 */
const GRID_WITH_LYRICS = "minmax(0, 0.45fr) minmax(0, 0.55fr)";
const GRID_NO_LYRICS = "minmax(0, 1fr) 0fr";

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
        className="w-screen max-w-none gap-0 border-0 bg-transparent p-0"
        style={{ height: "100svh" }}
      >
        <SheetTitle className="sr-only">Letra</SheetTitle>
        <SheetDescription className="sr-only">
          Visualização de letra sincronizada com a música atual.
        </SheetDescription>
        <LyricsBackground colors={colors} />

        {!track ? (
          <div className="relative z-10 flex h-full items-center justify-center text-muted-foreground">
            Nenhuma música tocando.
          </div>
        ) : (
          <>
            <LyricsHeader />

            {/*
             * Responsive grid layout:
             *   - No lyrics: single 1fr column — artwork panel centers naturally
             *   - With lyrics: 0.45fr artwork | 0.55fr lyrics
             * max-w-screen-2xl + mx-auto caps the layout at 1536px on ultrawide
             * displays so the content doesn't stretch indefinitely on 21:9 / 4K.
             *
             * The grid-template-columns transition is handled by the motion.div
             * via `animate` so Framer Motion drives the interpolation. Because
             * grid-template-columns animated via Framer Motion on a div works in
             * Chromium (the Tauri WebView runtime), this avoids any absolute-
             * positioning stretch artefacts from the previous implementation.
             */}
            <motion.div
              className="relative z-10 mx-auto flex max-w-screen-2xl min-h-0 flex-1 items-stretch gap-2 overflow-hidden px-8 w-full"
              style={{
                display: "grid",
                // Start with no-lyrics layout and animate to with-lyrics
                gridTemplateColumns: hasLyrics ? GRID_WITH_LYRICS : GRID_NO_LYRICS,
                transition: "grid-template-columns 500ms cubic-bezier(0.4,0,0.2,1)",
              }}
            >
              {/*
               * Artwork column: flex-center so the artwork is always centered
               * within its 0.45fr column regardless of whether lyrics are shown.
               * motion.div keeps the spring slide from the previous position
               * as the grid column width changes.
               */}
              <motion.div
                className="flex items-center justify-center py-8"
                layout
                transition={SLIDE_SPRING}
              >
                <LyricsArtworkPanel track={track} />
              </motion.div>

              {/* Lyrics column: slides in/out via AnimatePresence. */}
              <AnimatePresence>
                {data && data.type !== "missing" && (
                  <motion.div
                    key="lyrics-pane"
                    className="min-w-0 overflow-hidden py-8 pb-10"
                    initial={{ opacity: 0, x: "4%" }}
                    animate={{ opacity: 1, x: "0%" }}
                    exit={{ opacity: 0, x: "4%" }}
                    transition={SLIDE_SPRING}
                  >
                    <LyricsLines data={data} activeLineIndex={activeLineIndex} />
                  </motion.div>
                )}
              </AnimatePresence>
            </motion.div>
          </>
        )}
      </SheetContent>
    </Sheet>
  );
}
