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

const LAYOUT_SPRING = { type: "spring" as const, stiffness: 200, damping: 30 };

export function LyricsSheet() {
  const open = useLyricsStore((s) => s.open);
  const setOpen = useLyricsStore((s) => s.setOpen);
  const currentTrackId = usePlayerStore((s) => s.currentTrackId);
  const track = useTrack(currentTrackId ?? undefined);
  const { data, activeLineIndex } = useLyrics(currentTrackId);

  const colors = data?.colors ?? FALLBACK_COLORS;

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
            <div className="relative z-10 flex min-h-0 flex-1 items-center justify-center gap-12 overflow-hidden px-12 pb-8">
              <motion.div layout="position" transition={LAYOUT_SPRING} className="shrink-0">
                <LyricsArtworkPanel track={track} />
              </motion.div>
              <AnimatePresence>
                {data && data.type !== "missing" && (
                  <motion.div
                    key="lyrics-pane"
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    transition={{ duration: 0.4 }}
                    className="min-w-0 max-w-2xl flex-1 self-stretch"
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
