/**
 * Standard thumbnail sizes — fewer unique sizes = more cache hits.
 * Each image is only downloaded once per size tier.
 */
const SIZE_TIERS = [96, 226, 400] as const;

/** Snap a requested size to the nearest tier (always rounds up) */
function snapToTier(size: number): number {
  for (const tier of SIZE_TIERS) {
    if (size <= tier) return tier;
  }
  return SIZE_TIERS[SIZE_TIERS.length - 1];
}

/**
 * Build a URL for the Tauri thumbnail cache protocol.
 * Sizes are snapped to standard tiers so the same image isn't downloaded
 * multiple times at slightly different resolutions.
 *
 * Windows WebView2: http://thumb.localhost/?url=...&s=...
 * macOS/Linux: thumb://localhost/?url=...&s=...
 */
export function thumbUrl(originalUrl: string, size: number): string {
  if (!originalUrl) return "";
  const tier = snapToTier(size);
  const encoded = encodeURIComponent(originalUrl);
  const isWindows = navigator.userAgent.includes("Windows");
  const base = isWindows ? "http://thumb.localhost" : "thumb://localhost";
  return `${base}/?url=${encoded}&s=${tier}`;
}
