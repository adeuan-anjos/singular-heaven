import { useEffect, useState, useCallback } from "react";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { Minus, Square, X, Copy } from "lucide-react";

const appWindow = getCurrentWindow();

export function Titlebar() {
  const [maximized, setMaximized] = useState(false);

  useEffect(() => {
    appWindow.isMaximized().then(setMaximized);

    const unlisten = appWindow.onResized(async () => {
      setMaximized(await appWindow.isMaximized());
    });

    return () => {
      unlisten.then((fn) => fn());
    };
  }, []);

  const handleMinimize = useCallback(() => appWindow.minimize(), []);
  const handleToggleMaximize = useCallback(() => appWindow.toggleMaximize(), []);
  const handleClose = useCallback(() => appWindow.hide(), []);

  return (
    <div
      className="flex h-8 w-full shrink-0 items-center border-b border-border bg-background/80 backdrop-blur-xs select-none"
      data-tauri-drag-region
    >
      <div className="flex-1" data-tauri-drag-region />

      <span
        className="titlebar-glow text-xs font-semibold tracking-widest uppercase text-foreground/90"
        data-tauri-drag-region
      >
        Singular Haven
      </span>

      <div className="flex flex-1 items-center justify-end" data-tauri-drag-region>
        <button
          onClick={handleMinimize}
          className="inline-flex h-8 w-11 items-center justify-center text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
          aria-label="Minimizar"
        >
          <Minus className="h-3.5 w-3.5" />
        </button>
        <button
          onClick={handleToggleMaximize}
          className="inline-flex h-8 w-11 items-center justify-center text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
          aria-label="Maximizar"
        >
          {maximized ? (
            <Copy className="h-3 w-3" />
          ) : (
            <Square className="h-3 w-3" />
          )}
        </button>
        <button
          onClick={handleClose}
          className="inline-flex h-8 w-11 items-center justify-center text-muted-foreground transition-colors hover:bg-red-600 hover:text-white"
          aria-label="Fechar"
        >
          <X className="h-3.5 w-3.5" />
        </button>
      </div>
    </div>
  );
}
