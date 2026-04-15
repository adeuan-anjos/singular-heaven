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

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetContent
        side="bottom"
        showCloseButton={false}
        className="!h-svh w-screen max-w-none gap-0 border-0 bg-transparent p-0"
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
            <div className="relative z-10 grid min-h-0 flex-1 grid-cols-2 gap-12 overflow-hidden px-12 pb-8">
              <LyricsArtworkPanel track={track} />
              {data && data.type !== "missing" ? (
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
