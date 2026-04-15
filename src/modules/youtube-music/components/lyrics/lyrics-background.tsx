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
