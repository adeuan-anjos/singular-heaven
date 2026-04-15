// src/modules/youtube-music/components/lyrics/lyrics-line.tsx
import React, { forwardRef, useCallback } from "react";
import { cn } from "@/lib/utils";

export type LyricsLineState = "active" | "near" | "far";

interface LyricsLineProps {
  text: string;
  state: LyricsLineState;
  /** Seconds; passed to onSeek when the line is clicked. */
  time: number;
  /** Stable seek callback (e.g., the Zustand action). */
  onSeek: (time: number) => void;
}

const stateClasses: Record<LyricsLineState, string> = {
  active: "text-foreground opacity-100 scale-100",
  near: "text-foreground/60 scale-95",
  far: "text-foreground/30 scale-90",
};

export const LyricsLine = React.memo(
  forwardRef<HTMLButtonElement, LyricsLineProps>(function LyricsLine(
    { text, state, time, onSeek },
    ref,
  ) {
    const handleClick = useCallback(() => onSeek(time), [onSeek, time]);
    return (
      <button
        ref={ref}
        type="button"
        onClick={handleClick}
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
