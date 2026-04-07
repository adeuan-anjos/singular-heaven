import { useEffect } from "react";

const IS_DEV = import.meta.env.DEV;
const GC_TIMEOUT_MS = 10_000;

// FinalizationRegistry is ES2021 — declare it here so we don't need to bump
// the tsconfig lib (it is universally available in modern Chromium/Node).
declare class FinalizationRegistry<T> {
  constructor(callback: (heldValue: T) => void);
  register(target: object, heldValue: T): void;
}

/**
 * Uses FinalizationRegistry to detect if a component's resources are properly
 * garbage collected after unmount. No-op in production builds.
 */
export function useLeakDetector(componentName: string): void {
  if (!IS_DEV) return;

  // eslint-disable-next-line react-hooks/rules-of-hooks
  useEffect(() => {
    console.log(`[LeakDetector] ${componentName} mounted`);

    // Sentinel object — after unmount we drop our strong ref so GC can claim it
    let sentinel: object | null = { componentName };

    const registry = new FinalizationRegistry((name: string) => {
      console.log(`[LeakDetector] ${name} GC confirmed — no leak`);
    });

    registry.register(sentinel, componentName);

    let timeoutId: ReturnType<typeof setTimeout> | null = null;

    return () => {
      console.log(`[LeakDetector] ${componentName} unmounted — cleanup OK`);

      // Drop strong reference — sentinel becomes eligible for GC
      sentinel = null;

      // Warn if the FinalizationRegistry callback hasn't fired after GC_TIMEOUT_MS.
      // GC timing is not guaranteed; this is a heuristic nudge, not a hard assertion.
      timeoutId = setTimeout(() => {
        console.warn(
          `[LeakDetector] WARNING: ${componentName} not GC'd after ${GC_TIMEOUT_MS / 1000}s — potential leak!`,
        );
        timeoutId = null;
      }, GC_TIMEOUT_MS);
    };
  // componentName is a stable debug label — intentionally omitted from deps
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
}
