/**
 * Timestamp planner for cloud semantic video analysis.
 * Sampling spans the entire source; it never assumes the first few seconds
 * represent a long clip. Actual frame decoding and model inference are separate.
 */

export function buildCoarseSampleTimes(durationSeconds: number, maxSamples = 60): number[] {
  if (!Number.isFinite(durationSeconds) || durationSeconds <= 0) return [];
  if (!Number.isInteger(maxSamples) || maxSamples < 2) return [0];

  const count = Math.min(maxSamples, Math.max(2, Math.ceil(durationSeconds)));
  if (count === 2) return [0, durationSeconds];

  const times = Array.from({ length: count }, (_, index) => (durationSeconds * index) / (count - 1));
  times[0] = 0;
  times[times.length - 1] = durationSeconds;
  return times;
}

export type RecognitionWindow = { start: number; end: number };

/**
 * Add denser timestamps around candidate events without leaving source bounds.
 * Reserve samples for every valid event window before distributing any remaining
 * budget. This prevents an early/long window from starving later events.
 */
export function buildDenseSampleTimes(
  durationSeconds: number,
  windows: RecognitionWindow[],
  intervalSeconds = 0.25,
  maxSamples = 240,
): number[] {
  if (!Number.isFinite(durationSeconds) || durationSeconds <= 0) return [];
  if (!Number.isFinite(intervalSeconds) || intervalSeconds <= 0) return [];
  if (!Number.isInteger(maxSamples) || maxSamples < 1) return [];

  const validWindows = (Array.isArray(windows) ? windows : []).flatMap((window) => {
    if (!window || typeof window !== "object") return [];
    if (!Number.isFinite(window.start) || !Number.isFinite(window.end)) return [];
    const start = Math.max(0, Math.min(durationSeconds, window.start));
    const end = Math.max(0, Math.min(durationSeconds, window.end));
    return end < start ? [] : [{ start, end }];
  });
  if (!validWindows.length) return [];

  // Cap work per window, then downsample the combined sorted timeline if needed.
  // At least two points per window (where budget allows) retain both event edges.
  const perWindowCap = Math.max(2, Math.ceil(maxSamples / validWindows.length) * 2);
  const collected = new Set<number>();
  for (const window of validWindows) {
    const span = window.end - window.start;
    const requestedCount = Math.max(1, Math.ceil(span / intervalSeconds) + 1);
    const count = Math.min(perWindowCap, requestedCount);
    if (count === 1 || span === 0) {
      collected.add(Number(window.start.toFixed(3)));
      continue;
    }
    // If a window is longer than its share, spread samples across it instead
    // of sampling only its beginning.
    const step = requestedCount <= perWindowCap ? intervalSeconds : span / (count - 1);
    for (let index = 0; index < count; index += 1) {
      const time = index === count - 1 ? window.end : window.start + step * index;
      collected.add(Number(Math.max(0, Math.min(durationSeconds, time)).toFixed(3)));
    }
  }

  const windowCenters = [...new Set(validWindows.map((window) =>
    Number(((window.start + window.end) / 2).toFixed(3)),
  ))].sort((a, b) => a - b);
  const sorted = [...new Set([...collected, ...windowCenters])].sort((a, b) => a - b);
  if (sorted.length <= maxSamples) return sorted;

  // Reserve a representative from each window before using the remaining budget
  // for detail samples. If there are more windows than slots, distribute the
  // available slots across the window centers instead of favoring long windows.
  const selected = new Set<number>();
  const reservedCount = Math.min(maxSamples, windowCenters.length);
  for (let index = 0; index < reservedCount; index += 1) {
    const centerIndex = reservedCount === 1
      ? Math.floor((windowCenters.length - 1) / 2)
      : Math.round(index * (windowCenters.length - 1) / (reservedCount - 1));
    selected.add(windowCenters[centerIndex]);
  }

  if (selected.size < maxSamples) {
    for (let index = 0; index < maxSamples && selected.size < maxSamples; index += 1) {
      selected.add(sorted[Math.round(index * (sorted.length - 1) / Math.max(1, maxSamples - 1))]);
    }
  }
  // Fill any slots skipped because a detail sample duplicated a reserved center.
  for (const time of sorted) {
    if (selected.size >= maxSamples) break;
    selected.add(time);
  }
  return [...selected].sort((a, b) => a - b).slice(0, maxSamples);
}
