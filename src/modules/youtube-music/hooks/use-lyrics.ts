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
 * How many seconds before a line's timestamp we should already
 * mark it as active. Compensates for the spring-physics settle time
 * on scale/opacity/blur, so the line finishes animating into place
 * exactly when the singer reaches it.
 */
const ANTICIPATION_SECONDS = 0.25;

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
    const cursor = progress + ANTICIPATION_SECONDS;
    let active = -1;
    for (let i = 0; i < data.lines.length; i++) {
      if (data.lines[i].time <= cursor) active = i;
      else break;
    }
    return active;
  }, [data, progress]);

  return { data, activeLineIndex, isLoading };
}
