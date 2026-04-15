// src/modules/youtube-music/components/lyrics/lyrics-lines.tsx
import { useEffect, useRef } from "react";
import { ScrollArea } from "@/components/ui/scroll-area";
import { LyricsLine, type LyricsLineState } from "./lyrics-line";
import { usePlayerStore } from "../../stores/player-store";
import type { LyricsData, LyricsLine as LyricsLineDatum } from "../../types/lyrics";

type LyricsDataWithLines = Extract<LyricsData, { lines: LyricsLineDatum[] }>;

interface LyricsLinesProps {
  data: LyricsDataWithLines;
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
