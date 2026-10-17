export type FallbackVideoCut = {
  trimStart: number;
  trimEnd: number;
};

/**
 * Create an even, bounded edit when frame-by-frame analysis fails.
 * Cuts are spread across the whole source and sum to the requested output duration.
 */
export function buildFallbackVideoCuts(
  sourceDuration: number,
  targetDuration: number,
  shotLength = 2.2
): FallbackVideoCut[] {
  if (
    !Number.isFinite(sourceDuration) ||
    !Number.isFinite(targetDuration) ||
    !Number.isFinite(shotLength) ||
    sourceDuration < 0.25 ||
    targetDuration <= 0 ||
    shotLength <= 0
  ) return [];

  const usableDuration = Math.min(sourceDuration, targetDuration);
  const count = Math.max(1, Math.ceil(usableDuration / shotLength));
  const cutDuration = usableDuration / count;
  const maxStart = Math.max(0, sourceDuration - cutDuration);

  return Array.from({ length: count }, (_, index) => {
    const trimStart = count === 1 ? 0 : maxStart * index / (count - 1);
    return { trimStart, trimEnd: trimStart + cutDuration };
  });
}
