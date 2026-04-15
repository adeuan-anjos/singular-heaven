// src/modules/youtube-music/hooks/use-lyrics.ts
import { useMemo } from "react";
import { usePlayerStore } from "../stores/player-store";
import { useLyricsFetchStore } from "../stores/lyrics-fetch-store";
import type { LyricsData } from "../types/lyrics";

export interface UseLyricsResult {
  data: LyricsData | null;
  activeLineIndex: number;
  isLoading: boolean;
}

/**
 * Reads from the LRCLIB-backed fetch store. The store itself owns
 * the dispatch lifecycle — this hook is purely reactive.
 */
export function useLyrics(videoId: string | null | undefined): UseLyricsResult {
  const progress = usePlayerStore((s) => s.progress);
  const entry = useLyricsFetchStore((s) =>
    videoId ? s.byVideoId[videoId] : undefined,
  );

  const data = entry?.data ?? null;
  const isLoading = !entry || entry.status !== "ready";

  const activeLineIndex = useMemo(() => {
    if (!data || data.type === "missing") return -1;
    let active = -1;
    for (let i = 0; i < data.lines.length; i++) {
      if (data.lines[i].time <= progress) active = i;
      else break;
    }
    return active;
  }, [data, progress]);

  return { data, activeLineIndex, isLoading };
}
