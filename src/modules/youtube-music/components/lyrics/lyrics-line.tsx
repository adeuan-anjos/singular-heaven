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
