// src/modules/youtube-music/hooks/use-mouse-idle.ts
import { useEffect, useState } from "react";

export function useMouseIdle(hideAfterMs: number): boolean {
  const [idle, setIdle] = useState(false);

  useEffect(() => {
    let timeoutId: number | null = null;
    const wake = () => {
      setIdle(false);
      if (timeoutId !== null) window.clearTimeout(timeoutId);
      timeoutId = window.setTimeout(() => setIdle(true), hideAfterMs);
    };
    wake();
    window.addEventListener("mousemove", wake);
    window.addEventListener("mousedown", wake);
    return () => {
      window.removeEventListener("mousemove", wake);
      window.removeEventListener("mousedown", wake);
      if (timeoutId !== null) window.clearTimeout(timeoutId);
    };
  }, [hideAfterMs]);

  return idle;
}
