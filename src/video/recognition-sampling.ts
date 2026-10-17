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

/** Add denser timestamps around candidate events without leaving source bounds. */
export function buildDenseSampleTimes(
  durationSeconds: number,
  windows: RecognitionWindow[],
  intervalSeconds = 0.25,
  maxSamples = 240,
): number[] {
  if (!Number.isFinite(durationSeconds) || durationSeconds <= 0) return [];
  if (!Number.isFinite(intervalSeconds) || intervalSeconds <= 0) return [];
  if (!Number.isInteger(maxSamples) || maxSamples < 1) return [];

  const times = new Set<number>();
  for (const window of windows) {
    if (!Number.isFinite(window.start) || !Number.isFinite(window.end)) continue;
    const start = Math.max(0, Math.min(durationSeconds, window.start));
    const end = Math.max(0, Math.min(durationSeconds, window.end));
    if (end < start) continue;
    for (let time = start; time <= end + 1e-9; time += intervalSeconds) {
      times.add(Math.min(durationSeconds, Number(time.toFixed(3))));
      if (times.size >= maxSamples) break;
    }
    if (times.size >= maxSamples) break;
  }
  return [...times].sort((a, b) => a - b);
}
