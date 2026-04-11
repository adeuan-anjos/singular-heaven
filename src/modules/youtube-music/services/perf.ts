// Performance instrumentation for YT Music module.
// Logs timing for every IPC call, auth flow, and view data loading.
// DevTools console: __perfDump() for summary, __perfReset() to clear.

let moduleStart = performance.now();

interface PerfEntry {
  label: string;
  category: string;
  startMs: number;
  durationMs: number;
  endMs: number;
  metadata?: Record<string, unknown>;
}

const timeline: PerfEntry[] = [];
let autoReportTimer: ReturnType<typeof setTimeout> | null = null;
let autoReported = false;
let moduleLoadMark: { end: (m?: Record<string, unknown>) => number } | null =
  null;

export function perfMark(label: string, category: string) {
  const start = performance.now();
  const startMs = Math.round(start - moduleStart);

  return {
    end(metadata?: Record<string, unknown>) {
      const durationMs = Math.round(performance.now() - start);
      const entry: PerfEntry = {
        label,
        category,
        startMs,
        durationMs,
        endMs: startMs + durationMs,
        metadata,
      };
      timeline.push(entry);

      const flag =
        durationMs > 1000 ? "[SLOW]" : durationMs > 500 ? "[WARN]" : "[ OK ]";
      const metaStr =
        metadata && Object.keys(metadata).length > 0
          ? ` ${JSON.stringify(metadata)}`
          : "";
      console.log(
        `[PERF] ${flag} T+${String(startMs).padStart(5)}ms | ${String(durationMs).padStart(5)}ms | ${category.padEnd(8)} | ${label}${metaStr}`
      );

      scheduleAutoReport();
      return durationMs;
    },
  };
}

export function startModuleLoad() {
  moduleStart = performance.now();
  timeline.length = 0;
  autoReported = false;
  if (autoReportTimer) clearTimeout(autoReportTimer);
  moduleLoadMark = perfMark("module-mount->first-data", "TOTAL");
}

export function endModuleLoad() {
  if (moduleLoadMark) {
    moduleLoadMark.end();
    moduleLoadMark = null;
  }
}

function scheduleAutoReport() {
  if (autoReportTimer) clearTimeout(autoReportTimer);
  if (autoReported) return;
  autoReportTimer = setTimeout(() => {
    autoReported = true;
    perfDump();
  }, 3000);
}

function getThumbStats(): {
  count: number;
  avg: number;
  min: number;
  max: number;
  p95: number;
} | null {
  try {
    const entries = performance
      .getEntriesByType("resource")
      .filter(
        (e) =>
          e.name.includes("thumb.localhost") || e.name.startsWith("thumb://")
      );
    if (entries.length === 0) return null;
    const durations = entries.map((e) => e.duration).sort((a, b) => a - b);
    const sum = durations.reduce((a, b) => a + b, 0);
    return {
      count: durations.length,
      avg: Math.round(sum / durations.length),
      min: Math.round(durations[0]),
      max: Math.round(durations[durations.length - 1]),
      p95: Math.round(durations[Math.floor(durations.length * 0.95)]),
    };
  } catch {
    return null;
  }
}

export function perfDump() {
  if (timeline.length === 0) {
    console.log("[PERF] No events recorded");
    return;
  }

  const sorted = [...timeline].sort((a, b) => a.startMs - b.startMs);
  const totalTime = Math.max(...sorted.map((e) => e.endMs));

  console.log(
    "\n[PERF] ================================================================"
  );
  console.log(
    "[PERF]               PERFORMANCE TIMELINE SUMMARY"
  );
  console.log(
    "[PERF] ================================================================\n"
  );

  for (const e of sorted) {
    const flag =
      e.durationMs > 1000
        ? "[SLOW]"
        : e.durationMs > 500
          ? "[WARN]"
          : "[ OK ]";
    const payload = e.metadata?.jsonBytes
      ? ` (${((e.metadata.jsonBytes as number) / 1024).toFixed(1)}KB)`
      : "";
    const err = e.metadata?.error ? " ERROR" : "";
    console.log(
      `[PERF] ${flag} T+${String(e.startMs).padStart(5)}ms -> T+${String(e.endMs).padStart(5)}ms | ${String(e.durationMs).padStart(5)}ms | ${e.category.padEnd(8)} | ${e.label}${payload}${err}`
    );
  }

  // Waterfall visualization
  console.log("\n[PERF] Waterfall:");
  const scale = 50;
  for (const e of sorted) {
    const startPos = Math.round((e.startMs / totalTime) * scale);
    const barLen = Math.max(1, Math.round((e.durationMs / totalTime) * scale));
    const bar = ".".repeat(startPos) + "#".repeat(barLen);
    console.log(
      `[PERF] ${bar.padEnd(scale + 1)} ${e.label} (${e.durationMs}ms)`
    );
  }

  // Thumbnail stats from Resource Timing API
  const thumbs = getThumbStats();
  if (thumbs) {
    console.log(
      `\n[PERF] Thumbnails: ${thumbs.count} loaded | avg=${thumbs.avg}ms | p95=${thumbs.p95}ms | max=${thumbs.max}ms`
    );
  }

  // Detect IPC calls that appear serialized (mutex contention)
  const ipcCalls = sorted.filter((e) => e.category === "IPC");
  if (ipcCalls.length >= 2) {
    const serialized: string[] = [];
    for (let i = 1; i < ipcCalls.length; i++) {
      const prev = ipcCalls[i - 1];
      const curr = ipcCalls[i];
      const gap = curr.startMs - prev.endMs;
      if (gap >= 0 && gap < 50 && curr.startMs >= prev.endMs) {
        serialized.push(
          `  ${prev.label} (ended T+${prev.endMs}ms) -> ${curr.label} (started T+${curr.startMs}ms) gap=${gap}ms`
        );
      }
    }
    if (serialized.length > 0) {
      console.log("\n[PERF] Possible mutex serialization:");
      serialized.forEach((s) => console.log(`[PERF] ${s}`));
    }
  }

  console.log(
    `\n[PERF] Total wall time: ${totalTime}ms | Events: ${timeline.length}`
  );
  console.log(
    "[PERF] ================================================================\n"
  );
}

export function perfReset() {
  timeline.length = 0;
  autoReported = false;
  moduleLoadMark = null;
  if (autoReportTimer) clearTimeout(autoReportTimer);
  console.log("[PERF] Timeline reset");
}

// Expose globally for DevTools console access
declare global {
  interface Window {
    __perfDump: typeof perfDump;
    __perfReset: typeof perfReset;
    __perfTimeline: PerfEntry[];
  }
}
window.__perfDump = perfDump;
window.__perfReset = perfReset;
window.__perfTimeline = timeline;
