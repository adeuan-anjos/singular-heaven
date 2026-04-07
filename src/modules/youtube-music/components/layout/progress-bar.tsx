import { useRef, useEffect, useCallback } from "react";
import { usePlayerStore } from "../../stores/player-store";

function formatTime(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${s.toString().padStart(2, "0")}`;
}

/**
 * Lightweight progress bar that updates entirely via DOM refs.
 * Zero React re-renders during playback — only mounts/unmounts with PlayerBar.
 */
export function ProgressBar() {
  const trackRef = useRef<HTMLDivElement>(null);
  const fillRef = useRef<HTMLDivElement>(null);
  const thumbRef = useRef<HTMLDivElement>(null);
  const currentTimeRef = useRef<HTMLSpanElement>(null);
  const durationTimeRef = useRef<HTMLSpanElement>(null);
  const draggingRef = useRef(false);

  const updateDOM = useCallback((progress: number, durationSeconds: number) => {
    if (!fillRef.current || !thumbRef.current || !currentTimeRef.current) return;
    const pct = durationSeconds > 0 ? (progress / durationSeconds) * 100 : 0;
    const clampedPct = Math.min(100, Math.max(0, pct));
    fillRef.current.style.width = `${clampedPct}%`;
    thumbRef.current.style.left = `${clampedPct}%`;
    currentTimeRef.current.textContent = formatTime(progress);
  }, []);

  // Subscribe to progress changes outside React render cycle
  useEffect(() => {
    const unsubscribe = usePlayerStore.subscribe(
      (state) => state.progress,
      (progress) => {
        if (draggingRef.current) return;
        const track = usePlayerStore.getState().currentTrack;
        if (!track) return;
        updateDOM(progress, track.durationSeconds);
      },
    );

    // Initialize with current values
    const { progress, currentTrack } = usePlayerStore.getState();
    if (currentTrack) {
      updateDOM(progress, currentTrack.durationSeconds);
      if (durationTimeRef.current) {
        durationTimeRef.current.textContent = currentTrack.duration;
      }
    }

    return unsubscribe;
  }, [updateDOM]);

  // Also re-sync when track changes (new track resets progress display)
  useEffect(() => {
    const unsubscribe = usePlayerStore.subscribe(
      (state) => state.currentTrack,
      () => {
        const { progress, currentTrack } = usePlayerStore.getState();
        if (currentTrack) {
          updateDOM(progress, currentTrack.durationSeconds);
          if (durationTimeRef.current) {
            durationTimeRef.current.textContent = currentTrack.duration;
          }
        }
      },
    );
    return unsubscribe;
  }, [updateDOM]);

  const seekFromEvent = useCallback(
    (clientX: number) => {
      const bar = trackRef.current;
      if (!bar) return;
      const track = usePlayerStore.getState().currentTrack;
      if (!track) return;

      const rect = bar.getBoundingClientRect();
      const ratio = Math.min(1, Math.max(0, (clientX - rect.left) / rect.width));
      const value = Math.floor(ratio * track.durationSeconds);

      // Update DOM immediately for responsiveness
      updateDOM(value, track.durationSeconds);
      usePlayerStore.getState().seek(value);
    },
    [updateDOM],
  );

  const handlePointerDown = useCallback(
    (e: React.PointerEvent) => {
      e.preventDefault();
      draggingRef.current = true;
      (e.target as HTMLElement).setPointerCapture(e.pointerId);
      seekFromEvent(e.clientX);
    },
    [seekFromEvent],
  );

  const handlePointerMove = useCallback(
    (e: React.PointerEvent) => {
      if (!draggingRef.current) return;
      seekFromEvent(e.clientX);
    },
    [seekFromEvent],
  );

  const handlePointerUp = useCallback(() => {
    draggingRef.current = false;
  }, []);

  return (
    <div className="flex w-full max-w-md items-center gap-2">
      <span
        ref={currentTimeRef}
        className="w-10 text-right text-xs tabular-nums text-muted-foreground"
      >
        0:00
      </span>
      <div
        ref={trackRef}
        className="group relative flex-1 cursor-pointer py-1.5"
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
      >
        {/* Track background */}
        <div className="h-1 w-full rounded-full bg-muted" />
        {/* Fill */}
        <div
          ref={fillRef}
          className="absolute left-0 top-1.5 h-1 rounded-full bg-primary"
          style={{ width: "0%" }}
        />
        {/* Thumb */}
        <div
          ref={thumbRef}
          className="absolute top-1/2 h-3 w-3 -translate-x-1/2 -translate-y-1/2 rounded-full bg-primary opacity-0 transition-opacity group-hover:opacity-100"
          style={{ left: "0%" }}
        />
      </div>
      <span ref={durationTimeRef} className="w-10 text-xs tabular-nums text-muted-foreground">
        0:00
      </span>
    </div>
  );
}
