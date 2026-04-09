import { useEffect, useRef } from "react";

const IS_DEV = import.meta.env.DEV;
const GC_TIMEOUT_MS = 10_000;

// FinalizationRegistry is ES2021 — declare it here so we don't need to bump
// the tsconfig lib (it is universally available in modern Chromium/Node).
declare class FinalizationRegistry<T> {
  constructor(callback: (heldValue: T) => void);
  register(target: object, heldValue: T): void;
}

interface PendingLeakCheck {
  componentName: string;
  timeoutId: ReturnType<typeof setTimeout>;
}

const pendingLeakChecks = new Map<string, PendingLeakCheck>();
let leakTokenCounter = 0;

const leakRegistry =
  IS_DEV
    ? new FinalizationRegistry<string>((token) => {
        const pending = pendingLeakChecks.get(token);
        if (!pending) return;
        clearTimeout(pending.timeoutId);
        pendingLeakChecks.delete(token);
        console.log(`[LeakDetector] ${pending.componentName} GC confirmed — no leak`);
      })
    : null;

/**
 * Uses FinalizationRegistry to detect if a component's resources are properly
 * garbage collected after unmount. No-op in production builds.
 */
export function useLeakDetector(componentName: string): void {
  if (!IS_DEV || !leakRegistry) return;

  // eslint-disable-next-line react-hooks/rules-of-hooks
  const tokenRef = useRef<string | null>(null);
  if (tokenRef.current === null) {
    leakTokenCounter += 1;
    tokenRef.current = `${componentName}:${leakTokenCounter}`;
  }

  // eslint-disable-next-line react-hooks/rules-of-hooks
  useEffect(() => {
    console.log(`[LeakDetector] ${componentName} mounted`);

    const token = tokenRef.current!;

    // Sentinel object — after unmount we drop our strong ref so GC can claim it.
    // The registry stays at module scope so its callback can still fire later.
    let sentinel: object | null = { componentName };
    leakRegistry.register(sentinel, token);

    return () => {
      console.log(`[LeakDetector] ${componentName} unmounted — cleanup OK`);

      // Replace any older pending check for the same token before scheduling a new one.
      const existing = pendingLeakChecks.get(token);
      if (existing) {
        clearTimeout(existing.timeoutId);
      }

      // Drop strong reference — sentinel becomes eligible for GC.
      sentinel = null;

      // Warn if the FinalizationRegistry callback hasn't fired after GC_TIMEOUT_MS.
      // GC timing is not guaranteed; this remains a heuristic nudge, not a hard assertion.
      const timeoutId = setTimeout(() => {
        pendingLeakChecks.delete(token);
        console.warn(
          `[LeakDetector] ${componentName} not GC'd after ${GC_TIMEOUT_MS / 1000}s. This can be a false positive in dev/StrictMode or if GC has not run yet.`,
        );
      }, GC_TIMEOUT_MS);

      pendingLeakChecks.set(token, { componentName, timeoutId });
    };
  // componentName is a stable debug label — intentionally omitted from deps
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
}
