import { useState, type ReactNode } from "react";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useSmoothWheel } from "@/hooks/use-smooth-wheel";
import {
  ScrollViewportContext,
  type ScrollViewportElement,
} from "./scroll-viewport-context";

interface ScrollRegionProps {
  children: ReactNode;
}

/**
 * Single scroll container for the YouTube Music module. Owns the only
 * overflow-y:auto in the page and publishes its viewport element via
 * ScrollViewportContext so virtualized descendants can attach without
 * creating a second scroll.
 *
 * Uses useState (not useRef) for the viewport reference so consumers
 * re-render once the element mounts. TanStack Virtual's getScrollElement
 * depends on this to transition from null to the real element.
 */
export function ScrollRegion({ children }: ScrollRegionProps) {
  const [viewport, setViewport] = useState<ScrollViewportElement>(null);

  useSmoothWheel(viewport);

  return (
    <ScrollArea
      className="flex min-h-0 min-w-0 flex-1 flex-col"
      viewportRef={setViewport}
    >
      <ScrollViewportContext.Provider value={viewport}>
        {children}
      </ScrollViewportContext.Provider>
    </ScrollArea>
  );
}
