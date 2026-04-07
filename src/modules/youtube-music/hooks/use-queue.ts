import { useState, useCallback } from "react";
import type { Track } from "../types/music";

export function useQueue() {
  const [queue, setQueue] = useState<Track[]>([]);
  const [currentIndex, setCurrentIndex] = useState(-1);

  const setTracks = useCallback((tracks: Track[], startIndex = 0) => {
    setQueue(tracks);
    setCurrentIndex(startIndex);
  }, []);

  const addToQueue = useCallback((track: Track) => {
    setQueue((prev) => [...prev, track]);
  }, []);

  const addNext = useCallback((track: Track) => {
    setQueue((prev) => {
      const next = [...prev];
      next.splice(currentIndex + 1, 0, track);
      return next;
    });
  }, [currentIndex]);

  const removeFromQueue = useCallback((index: number) => {
    setQueue((prev) => prev.filter((_, i) => i !== index));
    setCurrentIndex((prev) => {
      if (index < prev) return prev - 1;
      return prev;
    });
  }, []);

  const next = useCallback((): Track | null => {
    if (currentIndex < queue.length - 1) {
      const nextIndex = currentIndex + 1;
      setCurrentIndex(nextIndex);
      return queue[nextIndex];
    }
    return null;
  }, [currentIndex, queue]);

  const previous = useCallback((): Track | null => {
    if (currentIndex > 0) {
      const prevIndex = currentIndex - 1;
      setCurrentIndex(prevIndex);
      return queue[prevIndex];
    }
    return null;
  }, [currentIndex, queue]);

  const currentTrack = currentIndex >= 0 && currentIndex < queue.length ? queue[currentIndex] : null;

  return {
    queue,
    currentIndex,
    currentTrack,
    setTracks,
    addToQueue,
    addNext,
    removeFromQueue,
    next,
    previous,
  } as const;
}
