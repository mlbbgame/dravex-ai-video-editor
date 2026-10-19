export type VariantPreviewCut = { trimStart: number; trimEnd: number };

const CUT_COUNTS: Record<string, number> = {
  auto: 3,
  velocity: 4,
  cinema: 2,
  pulse: 4,
};

const CUT_CENTERS: Record<string, number[]> = {
  auto: [0.16, 0.5, 0.84],
  velocity: [0.1, 0.34, 0.62, 0.88],
  cinema: [0.3, 0.72],
  pulse: [0.07, 0.3, 0.56, 0.82],
  story: [0.18, 0.43, 0.68, 0.88],
};

/** Plan a short preview from different parts of the source, not only its opening. */
export function planVariantPreviewCuts(
  sourceDuration: number,
  requestedDuration: number,
  variantId: string,
): { duration: number; cuts: VariantPreviewCut[] } {
  if (!Number.isFinite(sourceDuration) || sourceDuration <= 0
    || !Number.isFinite(requestedDuration) || requestedDuration <= 0) {
    return { duration: 0, cuts: [] };
  }

  const duration = Math.min(sourceDuration, requestedDuration);
  const desiredCount = CUT_COUNTS[variantId] ?? CUT_COUNTS.auto;
  const count = Math.max(1, Math.min(desiredCount, Math.floor(duration / 0.45)));
  const centers = CUT_CENTERS[variantId] ?? CUT_CENTERS.auto;
  const shotDuration = duration / count;
  const cuts = Array.from({ length: count }, (_, index) => {
    const centerRatio = centers[Math.min(index, centers.length - 1)] ?? (index + 0.5) / count;
    const trimStart = Math.max(0, Math.min(sourceDuration - shotDuration, sourceDuration * centerRatio - shotDuration / 2));
    return { trimStart, trimEnd: trimStart + shotDuration };
  });

  return { duration, cuts };
}

/** Spread preview images through the whole photo set so later images are represented too. */
export function selectVariantPreviewIndices(totalCount: number, variantId: string): number[] {
  if (!Number.isFinite(totalCount) || totalCount <= 0) return [];
  const count = Math.min(Math.floor(totalCount), CUT_COUNTS[variantId] ?? CUT_COUNTS.auto);
  if (count <= 1) return [0];
  return Array.from({ length: count }, (_, index) =>
    Math.round(index * (Math.floor(totalCount) - 1) / (count - 1)),
  );
}
