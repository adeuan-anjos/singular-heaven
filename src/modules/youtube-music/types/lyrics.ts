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
  /** Present only when type === "enhanced" */
  words?: LyricsWord[];
}

export type LyricsType = "synced" | "enhanced" | "missing";

export interface LyricsData {
  type: LyricsType;
  lines: LyricsLine[];
  /** 3 hex colors used by the animated background */
  colors: [string, string, string];
}
