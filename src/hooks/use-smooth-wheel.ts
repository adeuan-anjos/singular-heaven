import { useEffect, useRef } from "react";

/**
 * Intercepts wheel events on a specific scrollable element and applies
 * smooth ease-out animation instead of the browser's discrete scroll
 * jumps. Scrollbar drag, keyboard, and touch scroll remain fully native.
 */
export function useSmoothWheel(
  element: HTMLElement | null,
  options?: { speed?: number; friction?: number }
) {
  const speed = options?.speed ?? 1;
  const friction = options?.friction ?? 0.95;

  const state = useRef({
    targetY: 0,
    currentY: 0,
    animating: false,
  });

  useEffect(() => {
    if (!element) return;

    const s = state.current;

    const animate = () => {
      const diff = s.targetY - s.currentY;

      if (Math.abs(diff) < 0.5) {
        s.currentY = s.targetY;
        s.animating = false;
        return;
      }

      s.currentY += diff * (1 - friction);
      element.scrollTop = Math.round(s.currentY);
      requestAnimationFrame(animate);
    };

    const onWheel = (e: WheelEvent) => {
      e.preventDefault();

      if (!s.animating) {
        s.currentY = element.scrollTop;
        s.targetY = element.scrollTop;
      }

      s.targetY = Math.max(
        0,
        Math.min(
          s.targetY + e.deltaY * speed,
          element.scrollHeight - element.clientHeight
        )
      );

      if (!s.animating) {
        s.animating = true;
        requestAnimationFrame(animate);
      }
    };

    s.targetY = element.scrollTop;
    s.currentY = element.scrollTop;

    element.addEventListener("wheel", onWheel, { passive: false });
    return () => element.removeEventListener("wheel", onWheel);
  }, [element, speed, friction]);
}
