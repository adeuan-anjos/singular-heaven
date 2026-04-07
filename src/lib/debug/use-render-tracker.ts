import { useRef } from "react";

const IS_DEV = import.meta.env.DEV;

/**
 * Tracks component renders and logs when a re-render occurs without prop changes.
 * No-op in production builds (tree-shaken by Vite).
 */
export function useRenderTracker(
  componentName: string,
  props: Record<string, unknown>,
): void {
  if (!IS_DEV) return;

  // eslint-disable-next-line react-hooks/rules-of-hooks
  const renderCountRef = useRef(0);
  // eslint-disable-next-line react-hooks/rules-of-hooks
  const prevPropsRef = useRef<Record<string, unknown> | null>(null);

  renderCountRef.current += 1;
  const renderCount = renderCountRef.current;

  const prevProps = prevPropsRef.current;
  prevPropsRef.current = props;

  if (prevProps === null) {
    console.log(`[RenderTracker] ${componentName} mounted (render #1)`);
    return;
  }

  const changedKeys = Object.keys(props).filter(
    (key) => props[key] !== prevProps[key],
  );

  // Also check for keys that existed before but not now
  const removedKeys = Object.keys(prevProps).filter(
    (key) => !(key in props),
  );

  const allChanged = [...changedKeys, ...removedKeys];

  if (allChanged.length === 0) {
    console.log(
      `[RenderTracker] ${componentName} render #${renderCount} — UNNECESSARY (no prop changes)`,
    );
  } else {
    console.log(
      `[RenderTracker] ${componentName} render #${renderCount} — changed: ${allChanged.join(", ")}`,
    );
  }
}
