// src/modules/youtube-music/components/lyrics/lyrics-header.tsx
import React, { useCallback, useEffect, useState } from "react";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { Button } from "@/components/ui/button";
import { SheetClose } from "@/components/ui/sheet";
import {
  ChevronDown,
  Copy,
  Maximize,
  Minimize,
  Minus,
  Square,
  X,
} from "lucide-react";

const appWindow = getCurrentWindow();

interface LyricsHeaderProps {
  visible: boolean;
}

export const LyricsHeader = React.memo(function LyricsHeader({
  visible,
}: LyricsHeaderProps) {
  const [maximized, setMaximized] = useState(false);
  const [fullscreen, setFullscreen] = useState(false);

  useEffect(() => {
    appWindow.isMaximized().then(setMaximized);
    appWindow.isFullscreen().then(setFullscreen);
    const unlistenPromise = appWindow.onResized(async () => {
      setMaximized(await appWindow.isMaximized());
      setFullscreen(await appWindow.isFullscreen());
    });
    return () => {
      unlistenPromise.then((fn) => fn());
    };
  }, []);

  const handleMinimize = useCallback(() => appWindow.minimize(), []);
  const handleToggleMaximize = useCallback(
    () => appWindow.toggleMaximize(),
    [],
  );
  const handleToggleFullscreen = useCallback(async () => {
    const next = !(await appWindow.isFullscreen());
    await appWindow.setFullscreen(next);
    setFullscreen(next);
  }, []);
  const handleClose = useCallback(() => appWindow.hide(), []);

  return (
    <div
      className={`relative z-10 flex h-14 items-center px-4 select-none transition-opacity duration-150 ${
        visible ? "opacity-100" : "pointer-events-none opacity-0"
      }`}
      data-tauri-drag-region
    >
      <SheetClose
        render={
          <Button variant="ghost" size="icon" aria-label="Fechar letra" />
        }
      >
        <ChevronDown />
      </SheetClose>

      <div className="flex-1" data-tauri-drag-region />

      <div className="flex items-center gap-1">
        <button
          type="button"
          onClick={handleMinimize}
          aria-label="Minimizar"
          className="inline-flex h-8 w-8 items-center justify-center rounded-md text-foreground/70 transition-colors hover:bg-white/10 hover:text-foreground"
        >
          <Minus className="h-3.5 w-3.5" />
        </button>
        <button
          type="button"
          onClick={handleToggleMaximize}
          aria-label={maximized ? "Restaurar" : "Maximizar"}
          className="inline-flex h-8 w-8 items-center justify-center rounded-md text-foreground/70 transition-colors hover:bg-white/10 hover:text-foreground"
        >
          {maximized ? (
            <Copy className="h-3 w-3" />
          ) : (
            <Square className="h-3 w-3" />
          )}
        </button>
        <button
          type="button"
          onClick={handleToggleFullscreen}
          aria-label={fullscreen ? "Sair da tela cheia" : "Tela cheia"}
          className="inline-flex h-8 w-8 items-center justify-center rounded-md text-foreground/70 transition-colors hover:bg-white/10 hover:text-foreground"
        >
          {fullscreen ? (
            <Minimize className="h-3.5 w-3.5" />
          ) : (
            <Maximize className="h-3.5 w-3.5" />
          )}
        </button>
        <button
          type="button"
          onClick={handleClose}
          aria-label="Fechar"
          className="inline-flex h-8 w-8 items-center justify-center rounded-md text-foreground/70 transition-colors hover:bg-red-600 hover:text-white"
        >
          <X className="h-3.5 w-3.5" />
        </button>
      </div>
    </div>
  );
});
