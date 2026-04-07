import { useState, useCallback, useRef, useEffect } from "react";
import type { Track, RepeatMode } from "../types/music";

export function usePlayer() {
  const [currentTrack, setCurrentTrack] = useState<Track | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [progress, setProgress] = useState(0);
  const [volume, setVolume] = useState(80);
  const [shuffle, setShuffle] = useState(false);
  const [repeat, setRepeat] = useState<RepeatMode>("off");
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const play = useCallback((track: Track) => {
    setCurrentTrack(track);
    setIsPlaying(true);
    setProgress(0);
  }, []);

  const togglePlay = useCallback(() => {
    setIsPlaying((prev) => !prev);
  }, []);

  const seek = useCallback((value: number) => {
    setProgress(value);
  }, []);

  const toggleShuffle = useCallback(() => {
    setShuffle((prev) => !prev);
  }, []);

  const cycleRepeat = useCallback(() => {
    setRepeat((prev) => {
      if (prev === "off") return "all";
      if (prev === "all") return "one";
      return "off";
    });
  }, []);

  useEffect(() => {
    if (isPlaying && currentTrack) {
      intervalRef.current = setInterval(() => {
        setProgress((prev) => {
          if (prev >= currentTrack.durationSeconds) {
            setIsPlaying(false);
            return currentTrack.durationSeconds;
          }
          return prev + 1;
        });
      }, 1000);
    }
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [isPlaying, currentTrack]);

  return {
    currentTrack,
    isPlaying,
    progress,
    volume,
    shuffle,
    repeat,
    play,
    togglePlay,
    seek,
    setVolume,
    toggleShuffle,
    cycleRepeat,
  } as const;
}
