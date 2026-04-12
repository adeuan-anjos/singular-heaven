import { createContext, useContext } from "react";

export type ScrollViewportElement = HTMLDivElement | null;

export const ScrollViewportContext = createContext<ScrollViewportElement>(null);

/**
 * Returns the DOM element of the module's primary ScrollRegion viewport.
 * Consumers (e.g. virtualized lists) should treat a null return as "not mounted yet"
 * and re-run once the value becomes non-null.
 */
export function useScrollViewport(): ScrollViewportElement {
  return useContext(ScrollViewportContext);
}
