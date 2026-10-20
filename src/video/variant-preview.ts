export type VariantPreviewCut = { trimStart: number; trimEnd: number };

const CUT_COUNTS: Record<string, number> = {
  auto: 3,
  velocity: 4,
  cinema: 2,
  pulse: 4,
  story: 4,
};

// Each style samples a different visual rhythm across a photo collection.
// Endpoints remain represented, while the middle samples differ by style.
const PHOTO_SAMPLE_RATIOS: Record<string, number[]> = {
  auto: [0, 0.5, 1],
  velocity: [0, 0.28, 0.62, 1],
  cinema: [0, 1],
  pulse: [0, 0.18, 0.82, 1],
  story: [0, 0.28, 0.72, 1],
};

// Keep preview rhythms intentionally distinct: velocity front-loads punchy
// moments, pulse samples the track's later payoff, cinema holds wider beats,
// and story follows a calmer beginning-to-end progression.
const CUT_CENTERS: Record<string, number[]> = {
  auto: [0.16, 0.5, 0.84],
  velocity: [0.06, 0.24, 0.49, 0.74],
  cinema: [0.3, 0.72],
  pulse: [0.12, 0.4, 0.68, 0.94],
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
  let previousEnd = 0;
  const cuts = Array.from({ length: count }, (_, index) => {
    // A source shorter than the requested preview is partitioned chronologically
    // so short clips never repeat their opening frames.
    if (sourceDuration <= requestedDuration) {
      const trimStart = index * shotDuration;
      return { trimStart, trimEnd: index === count - 1 ? sourceDuration : trimStart + shotDuration };
    }

    const centerRatio = centers[Math.min(index, centers.length - 1)] ?? (index + 0.5) / count;
    const desiredStart = Math.max(0, Math.min(sourceDuration - shotDuration, sourceDuration * centerRatio - shotDuration / 2));
    // Keep cuts ordered and non-overlapping even when a short source forces
    // style-specific target centers to collapse near the same point.
    const trimStart = Math.min(sourceDuration - shotDuration, Math.max(previousEnd, desiredStart));
    const trimEnd = trimStart + shotDuration;
    previousEnd = trimEnd;
    return { trimStart, trimEnd };
  });

  return { duration, cuts };
}

/**
 * Pick style-specific representative photos. A nearest-unused fallback prevents
 * rounded ratios from selecting the same photo twice in small collections.
 */
export function selectVariantPreviewIndices(totalCount: number, variantId: string): number[] {
  if (!Number.isFinite(totalCount) || totalCount <= 0) return [];
  const total = Math.floor(totalCount);
  const count = Math.min(total, CUT_COUNTS[variantId] ?? CUT_COUNTS.auto);
  if (count <= 1) return [0];
  const ratios = PHOTO_SAMPLE_RATIOS[variantId] ?? PHOTO_SAMPLE_RATIOS.auto;
  const selected: number[] = [];
  for (let index = 0; index < count; index += 1) {
    const ratio = ratios[Math.min(index, ratios.length - 1)] ?? index / (count - 1);
    const target = Math.round(ratio * (total - 1));
    let candidate = target;
    if (selected.includes(candidate)) {
      let distance = 1;
      while (distance < total) {
        const left = target - distance;
        const right = target + distance;
        if (left >= 0 && !selected.includes(left)) {
          candidate = left;
          break;
        }
        if (right < total && !selected.includes(right)) {
          candidate = right;
          break;
        }
        distance += 1;
      }
    }
    if (!selected.includes(candidate) && candidate >= 0 && candidate < total) selected.push(candidate);
  }
  return selected.sort((a, b) => a - b);
}
