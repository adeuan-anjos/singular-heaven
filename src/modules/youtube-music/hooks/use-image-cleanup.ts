import { useRef, useEffect } from "react";

/**
 * Returns a ref to attach to an <img> element.
 * On unmount, clears the src to force Chromium to release the decoded bitmap
 * from its internal decode cache. This is critical for virtual scroll lists
 * where hundreds of images are mounted/unmounted during scrolling.
 */
export function useImageCleanup() {
  const ref = useRef<HTMLImageElement>(null);
  useEffect(() => {
    const img = ref.current;
    return () => {
      if (img) {
        console.debug("[ImageCleanup] Releasing bitmap for", img.src.substring(0, 50));
        img.src = "";
      }
    };
  }, []);
  return ref;
}

/**
 * Returns a ref to attach to a container element.
 * On unmount, finds all child <img> elements and clears their src.
 * Useful when the img is inside a third-party component (like Radix Avatar)
 * that doesn't forward refs.
 */
export function useContainerImageCleanup() {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const container = ref.current;
    return () => {
      if (container) {
        const imgs = container.querySelectorAll("img");
        imgs.forEach((img) => {
          console.debug("[ImageCleanup] Releasing bitmap for", img.src.substring(0, 50));
          img.src = "";
        });
      }
    };
  }, []);
  return ref;
}
