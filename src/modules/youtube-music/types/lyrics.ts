// src/modules/youtube-music/types/lyrics.ts

export interface LyricsWord {
  /** Seconds from the start of the track */
  time: number;
  text: string;
}

export interface LyricsLine {
  /** Seconds from the start of the track */
  time: number;
  text: string;
  /** Present only when the parent LyricsData has type === "enhanced" */
  words?: LyricsWord[];
}

export type LyricsType = "synced" | "enhanced" | "missing";

/**
 * Discriminated union: when `type === "missing"`, there are no `lines`.
 * Background colors are always present so the gradient can render in any state.
 */
export type LyricsData =
  | {
      type: "synced" | "enhanced";
      lines: LyricsLine[];
      colors: [string, string, string];
    }
  | {
      type: "missing";
      colors: [string, string, string];
    };
