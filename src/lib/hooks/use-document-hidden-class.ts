import { useEffect } from "react";

/**
 * Keeps a `document-hidden` class on <html> in sync with `document.visibilityState`.
 *
 * Used to pause CSS animations (equalizer, spinners) when the app is minimized
 * or the window is hidden. Chromium does not throttle CSS animations while
 * audio is playing, so without this the animations keep waking the compositor
 * at the display refresh rate (144Hz) even when no one can see them.
 */
export function useDocumentHiddenClass(): void {
  useEffect(() => {
    const root = document.documentElement;
    const CLASS = "document-hidden";

    const sync = () => {
      if (document.visibilityState === "hidden") {
        root.classList.add(CLASS);
      } else {
        root.classList.remove(CLASS);
      }
    };

    sync();
    document.addEventListener("visibilitychange", sync);
    return () => {
      document.removeEventListener("visibilitychange", sync);
      root.classList.remove(CLASS);
    };
  }, []);
}
