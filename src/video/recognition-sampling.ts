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

  const validWindows = windows.flatMap((window) => {
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

  const sorted = [...collected].sort((a, b) => a - b);
  if (sorted.length <= maxSamples) return sorted;
  if (maxSamples === 1) return [sorted[0]];

  // Evenly select across all event windows so late events remain represented.
  const selected = new Set<number>();
  for (let index = 0; index < maxSamples; index += 1) {
    selected.add(sorted[Math.round(index * (sorted.length - 1) / (maxSamples - 1))]);
  }
  return [...selected].sort((a, b) => a - b).slice(0, maxSamples);
}
