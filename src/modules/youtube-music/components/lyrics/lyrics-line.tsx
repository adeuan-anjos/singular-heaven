// src/modules/youtube-music/components/lyrics/lyrics-line.tsx
import React, { forwardRef, useCallback } from "react";
import { motion, useReducedMotion } from "motion/react";

/**
 * Kept for external consumers that may still reference it; internally replaced
 * by the continuous `distance` prop.
 */
export type LyricsLineState = "active" | "near" | "far";

interface LyricsLineProps {
  text: string;
  /**
   * Signed integer: `index - activeIndex`.
   * 0 = currently active, negative = lines above, positive = lines below.
   */
  distance: number;
  /** Seconds; passed to onSeek when the line is clicked. */
  time: number;
  /** Stable seek callback (e.g., the Zustand action). */
  onSeek: (time: number) => void;
}

/**
 * Returns visual props for a lyric line based on its distance from the active
 * line, following the spec table in docs/superpowers/specs/2026-04-14-lyrics-clean-room-spec.md §2.
 *
 * Scale:   active → 1.0; all others → 0.97
 * Opacity: active → 0.85; ±1..±3 → 1.0; ≥4 → 1.0 (spec keeps non-active at 1.0 for synced)
 * Blur:    0 when active; 2px at ±1; 3px at ±2; 4px at ±3; capped at 5px beyond
 */
function computeVisualProps(distance: number): {
  scale: number;
  opacity: number;
  blur: number;
} {
  const abs = Math.abs(distance);

  if (abs === 0) {
    return { scale: 1.0, opacity: 0.85, blur: 0 };
  }

  const scale = 0.97;
  const opacity = 1.0;

  // Spec §2: blur = abs + 1, capped at 5
  const blur = Math.min(5, abs + 1);

  return { scale, opacity, blur };
}

export const LyricsLine = React.memo(
  forwardRef<HTMLButtonElement, LyricsLineProps>(function LyricsLine(
    { text, distance, time, onSeek },
    ref,
  ) {
    const prefersReduced = useReducedMotion();
    const handleClick = useCallback(() => onSeek(time), [onSeek, time]);

    const { scale, opacity, blur } = computeVisualProps(distance);

    // When prefers-reduced-motion: skip blur entirely, use fast linear transition
    const filterValue = prefersReduced ? "none" : blur > 0 ? `blur(${blur}px)` : "none";

    const transition = prefersReduced
      ? { duration: 0.15, ease: "linear" as const }
      : {
          type: "spring" as const,
          stiffness: 100,
          damping: 25,
          mass: 2,
        };

    return (
      <motion.button
        ref={ref}
        type="button"
        onClick={handleClick}
        animate={{
          scale,
          opacity,
          filter: filterValue,
        }}
        transition={transition}
        style={{ originX: 0, originY: 0.5 }}
        className="block w-full cursor-pointer text-left text-3xl font-semibold leading-snug will-change-transform"
      >
        {text}
      </motion.button>
    );
  }),
);
