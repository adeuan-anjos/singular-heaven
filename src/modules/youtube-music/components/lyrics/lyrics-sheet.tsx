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

/** Fixed width for the left artwork column when lyrics are shown. */
const ARTWORK_COL_WIDTH = "24rem";

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
            <div className="relative z-10 min-h-0 flex-1 overflow-hidden">
              {/* Artwork panel: slides between centered (no lyrics) and left (with lyrics). */}
              <motion.div
                className="absolute top-1/2 -translate-y-1/2"
                animate={{
                  left: hasLyrics ? "3rem" : "50%",
                  x: hasLyrics ? "0%" : "-50%",
                }}
                transition={SLIDE_SPRING}
              >
                <LyricsArtworkPanel track={track} />
              </motion.div>

              {/* Lyrics pane: slides in from the right when available. */}
              <AnimatePresence>
                {data && data.type !== "missing" && (
                  <motion.div
                    key="lyrics-pane"
                    className="absolute bottom-8 right-12 top-0"
                    style={{ left: `calc(${ARTWORK_COL_WIDTH} + 6rem)` }}
                    initial={{ x: "8%", opacity: 0 }}
                    animate={{ x: "0%", opacity: 1 }}
                    exit={{ x: "8%", opacity: 0 }}
                    transition={SLIDE_SPRING}
                  >
                    <LyricsLines data={data} activeLineIndex={activeLineIndex} />
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          </>
        )}
      </SheetContent>
    </Sheet>
  );
}
