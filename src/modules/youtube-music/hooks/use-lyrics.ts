// src/modules/youtube-music/hooks/use-lyrics.ts
import { useMemo } from "react";
import { usePlayerStore } from "../stores/player-store";
import { DEFAULT_MOCK, LYRICS_MOCKS } from "../mocks/lyrics-mock";
import type { LyricsData } from "../types/lyrics";

export interface UseLyricsResult {
  data: LyricsData | null;
  activeLineIndex: number;
}

/**
 * UI-phase implementation: reads from a static mock map.
 * When the LRCLIB backend lands, only the source of `data` changes;
 * the return shape stays identical.
 */
export function useLyrics(videoId: string | null | undefined): UseLyricsResult {
  const progress = usePlayerStore((s) => s.progress);

  const data = useMemo<LyricsData | null>(() => {
    if (!videoId) return null;
    return LYRICS_MOCKS[videoId] ?? DEFAULT_MOCK;
  }, [videoId]);

  const activeLineIndex = useMemo(() => {
    if (!data || data.type === "missing") return -1;
    let active = -1;
    for (let i = 0; i < data.lines.length; i++) {
      if (data.lines[i].time <= progress) active = i;
      else break;
    }
    return active;
  }, [data, progress]);

  return { data, activeLineIndex };
}
