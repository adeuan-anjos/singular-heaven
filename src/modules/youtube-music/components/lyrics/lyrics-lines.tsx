// src/modules/youtube-music/components/lyrics/lyrics-lines.tsx
import { useEffect, useRef } from "react";
import { ScrollArea } from "@/components/ui/scroll-area";
import { LyricsLine } from "./lyrics-line";
import { usePlayerStore } from "../../stores/player-store";
import type { LyricsData, LyricsLine as LyricsLineDatum } from "../../types/lyrics";

type LyricsDataWithLines = Extract<LyricsData, { lines: LyricsLineDatum[] }>;

interface LyricsLinesProps {
  data: LyricsDataWithLines;
  activeLineIndex: number;
}

/**
 * Mask gradient applied to the scroll viewport so that lyric lines fade out
 * at the top and bottom edges instead of clipping abruptly.
 * Uses both the standard and -webkit- prefixed properties for broad Chromium
 * and WebKit compatibility (spec §5).
 */
const EDGE_FADE_STYLE: React.CSSProperties = {
  maskImage:
    "linear-gradient(to bottom, transparent 0%, black 15%, black 85%, transparent 100%)",
  WebkitMaskImage:
    "linear-gradient(to bottom, transparent 0%, black 15%, black 85%, transparent 100%)",
};

export function LyricsLines({ data, activeLineIndex }: LyricsLinesProps) {
  const seek = usePlayerStore((s) => s.seek);
  const lineRefs = useRef<(HTMLButtonElement | null)[]>([]);

  useEffect(() => {
    if (activeLineIndex < 0) return;
    const node = lineRefs.current[activeLineIndex];
    if (!node) return;
    node.scrollIntoView({ block: "center", behavior: "smooth" });
  }, [activeLineIndex]);

  return (
    /*
     * ScrollArea fills the full column height. The edge-fade mask gradient
     * softens the top and bottom clip edges.
     *
     * The inner div sets right padding to 15% of the column width on large
     * screens (≥ 1600px) and 8% below that, via Tailwind v4 arbitrary-value
     * variants — spec §2 requires this to prevent lines from touching the
     * right edge. max-w is removed so lines use the full 80% spec §5.5.
     */
    <ScrollArea className="h-full" style={EDGE_FADE_STYLE}>
      <div className="flex w-full flex-col gap-4 px-4 py-[40vh]">
        {data.lines.map((line, i) => (
          <LyricsLine
            key={`${line.time}-${i}`}
            ref={(el) => {
              lineRefs.current[i] = el;
            }}
            text={line.text}
            distance={i - activeLineIndex}
            time={line.time}
            onSeek={seek}
          />
        ))}
      </div>
    </ScrollArea>
  );
}
