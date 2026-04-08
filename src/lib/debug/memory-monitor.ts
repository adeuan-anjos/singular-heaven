let intervalId: ReturnType<typeof setInterval> | null = null;

/** Start periodic JS heap monitoring (logs to console without DevTools overhead). */
export function startMemoryMonitor(intervalMs = 5000) {
  if (intervalId) return;

  const mem = (performance as unknown as { memory?: { usedJSHeapSize: number; totalJSHeapSize: number } }).memory;
  if (!mem) {
    console.warn("[memory-monitor] performance.memory not available");
    return;
  }

  console.log("[memory-monitor] Started polling every", intervalMs, "ms");

  intervalId = setInterval(() => {
    const m = (performance as unknown as { memory: { usedJSHeapSize: number; totalJSHeapSize: number; jsHeapSizeLimit: number } }).memory;
    console.log(
      `[memory-monitor] JS heap: ${(m.usedJSHeapSize / 1048576).toFixed(1)}MB / ${(m.totalJSHeapSize / 1048576).toFixed(1)}MB (limit: ${(m.jsHeapSizeLimit / 1048576).toFixed(0)}MB)`
    );
  }, intervalMs);
}

export function stopMemoryMonitor() {
  if (intervalId) {
    clearInterval(intervalId);
    intervalId = null;
    console.log("[memory-monitor] Stopped");
  }
}
