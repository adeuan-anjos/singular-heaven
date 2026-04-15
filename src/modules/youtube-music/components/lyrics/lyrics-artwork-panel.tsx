// src/modules/youtube-music/components/lyrics/lyrics-artwork-panel.tsx
import { useEffect, useRef } from "react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Slider } from "@/components/ui/slider";
import { LyricsControls } from "./lyrics-controls";
import { thumbUrl } from "../../utils/thumb-url";
import { usePlayerStore } from "../../stores/player-store";
import type { Track } from "../../types/music";

interface LyricsArtworkPanelProps {
  track: Track;
}

function formatTime(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${s.toString().padStart(2, "0")}`;
}

/**
 * Left column of the lyrics view: artwork, title/artist, scrubbable
 * Slider, and inline controls. Subscribes to progress via
 * usePlayerStore.subscribe so only this panel re-renders on tick,
 * not the entire LyricsSheet tree.
 */
export function LyricsArtworkPanel({ track }: LyricsArtworkPanelProps) {
  const seek = usePlayerStore((s) => s.seek);
  const duration = usePlayerStore((s) => s.duration);

  const sliderRef = useRef<HTMLDivElement>(null);
  const currentTimeRef = useRef<HTMLSpanElement>(null);
  const draggingRef = useRef(false);
  const localValueRef = useRef<number>(0);

  // Push progress updates into the slider DOM without React re-renders
  useEffect(() => {
    const update = (progress: number) => {
      if (draggingRef.current) return;
      localValueRef.current = progress;
      if (currentTimeRef.current) {
        currentTimeRef.current.textContent = formatTime(progress);
      }
      const root = sliderRef.current;
      if (!root) return;
      const dur = usePlayerStore.getState().duration;
      const pct = dur > 0 ? (progress / dur) * 100 : 0;
      const indicator = root.querySelector<HTMLElement>(
        '[data-slot="slider-range"]',
      );
      const thumb = root.querySelector<HTMLElement>(
        '[data-slot="slider-thumb"]',
      );
      if (indicator) indicator.style.width = `${Math.min(100, Math.max(0, pct))}%`;
      if (thumb)
        thumb.style.left = `${Math.min(100, Math.max(0, pct))}%`;
    };

    update(usePlayerStore.getState().progress);
    const unsubscribe = usePlayerStore.subscribe(
      (state) => state.progress,
      (progress) => update(progress),
    );
    return unsubscribe;
  }, []);

  const imgUrl = track.thumbnails[0]?.url ?? "";
  const artistName = track.artists.map((a) => a.name).join(", ");

  return (
    <div className="flex flex-col items-start gap-6">
      <Avatar className="size-80 rounded-2xl shadow-2xl">
        <AvatarImage
          src={thumbUrl(imgUrl, 400)}
          alt={track.title}
          className="rounded-2xl object-cover"
        />
        <AvatarFallback className="rounded-2xl text-5xl">
          {track.title.charAt(0)}
        </AvatarFallback>
      </Avatar>

      <div className="font-heading">
        <h2 className="text-3xl font-semibold text-foreground">
          {track.title}
        </h2>
        <p className="text-lg text-muted-foreground">{artistName}</p>
      </div>

      <div className="flex w-full max-w-md flex-col gap-1">
        <div ref={sliderRef}>
          <Slider
            defaultValue={[0]}
            max={Math.max(duration, 1)}
            step={1}
            aria-label="Progresso"
            onValueChange={(v) => {
              const value = Array.isArray(v) ? v[0] : v;
              draggingRef.current = true;
              localValueRef.current = value;
              if (currentTimeRef.current) {
                currentTimeRef.current.textContent = formatTime(value);
              }
            }}
            onValueCommitted={(v) => {
              const value = Array.isArray(v) ? v[0] : v;
              draggingRef.current = false;
              seek(value);
            }}
          />
        </div>
        <div className="flex justify-between text-xs tabular-nums text-muted-foreground">
          <span ref={currentTimeRef}>0:00</span>
          <span>{formatTime(duration)}</span>
        </div>
      </div>

      <LyricsControls />
    </div>
  );
}
