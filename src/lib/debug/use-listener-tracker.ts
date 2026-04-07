import { useEffect, useRef, useCallback } from "react";

const IS_DEV = import.meta.env.DEV;

interface ListenerTrackerResult {
  trackListener: (name: string) => void;
  trackCleanup: (name: string) => void;
}

const NO_OP_RESULT: ListenerTrackerResult = {
  trackListener: () => undefined,
  trackCleanup: () => undefined,
};

/**
 * Tracks event listener registration/removal and warns about orphan listeners
 * left behind at component unmount. No-op in production builds.
 */
export function useListenerTracker(componentName: string): ListenerTrackerResult {
  if (!IS_DEV) return NO_OP_RESULT;

  // eslint-disable-next-line react-hooks/rules-of-hooks
  const activeListenersRef = useRef<Set<string>>(new Set());

  // eslint-disable-next-line react-hooks/rules-of-hooks
  useEffect(() => {
    return () => {
      const orphans = activeListenersRef.current;
      if (orphans.size > 0) {
        const list = [...orphans].map((n) => `'${n}'`).join(", ");
        console.warn(
          `[ListenerTracker] WARNING: ${componentName} unmounted with ${orphans.size} orphan listener${orphans.size > 1 ? "s" : ""}: ${list}`,
        );
      }
    };
  // componentName is a stable debug label — intentionally omitted from deps
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // eslint-disable-next-line react-hooks/rules-of-hooks
  const trackListener = useCallback(
    (name: string) => {
      activeListenersRef.current.add(name);
      console.log(`[ListenerTracker] ${componentName}: registered '${name}'`);
    },
    [componentName],
  );

  // eslint-disable-next-line react-hooks/rules-of-hooks
  const trackCleanup = useCallback(
    (name: string) => {
      activeListenersRef.current.delete(name);
      console.log(`[ListenerTracker] ${componentName}: cleaned up '${name}'`);
    },
    [componentName],
  );

  return { trackListener, trackCleanup };
}
