import type { HighlightMoment, HighlightRankingStyle } from "./highlight-finder";
import { rankHighlightMomentsForStyle } from "./highlight-finder";

export type MontageSelectionStyle = HighlightRankingStyle;

function conflictsWithSelection(
  candidate: HighlightMoment,
  selected: HighlightMoment[],
  minimumGap: number,
): boolean {
  return selected.some((existing) => {
    const tooClose = Math.abs(existing.time - candidate.time) < minimumGap;
    // Different sample centres can still point to the same source footage when
    // sampled intervals are wide. Keep a small safety gap between source ranges.
    const intervalsOverlap = candidate.start < existing.end + 0.08 &&
      candidate.end > existing.start - 0.08;
    return tooClose || intervalsOverlap;
  });
}

/**
 * Select a style-aware set of distinct moments while preserving source chronology.
 * Scores are editing hints from lightweight visual analysis, not semantic truth.
 */
export function selectDiverseHighlightMoments(
  candidates: HighlightMoment[],
  count: number,
  sourceDuration: number,
  style: MontageSelectionStyle,
  minimumGapOverride = 0,
): HighlightMoment[] {
  if (!Number.isFinite(count) || count <= 0 || !Number.isFinite(sourceDuration) || sourceDuration <= 0) return [];

  const safe = candidates.filter((item) =>
    Number.isFinite(item.time) &&
    Number.isFinite(item.start) &&
    Number.isFinite(item.end) &&
    Number.isFinite(item.score) &&
    Number.isFinite(item.motion) &&
    Number.isFinite(item.contrast) &&
    item.time >= 0 &&
    item.time <= sourceDuration &&
    item.start >= 0 &&
    item.end > item.start &&
    item.end <= sourceDuration &&
    // A candidate's representative timestamp must belong to the footage range
    // it claims to represent; otherwise it can produce confusing cut boundaries.
    item.time >= item.start &&
    item.time <= item.end
  );
  if (!safe.length) return [];

  const target = Math.min(Math.floor(count), safe.length);
  if (target <= 1) return [rankHighlightMomentsForStyle(safe, style)[0]];

  // Divide the source into temporal regions so a single high-motion burst cannot
  // consume every cut. Cinematic/story edits favour broad coverage; velocity still
  // prioritizes energetic moments but must retain some timeline diversity.
  const bucketCount = Math.min(target, Math.max(3, Math.ceil(target * (style === "story" || style === "cinematic" ? 1.35 : 1.15))));
  const ranked = rankHighlightMomentsForStyle(safe, style);
  const selected: HighlightMoment[] = [];
  const baseMinimumGap = Math.max(0.35, Math.min(sourceDuration / Math.max(2, target * 1.5), style === "velocity" || style === "glitch" ? 1.1 : 2.0));
  // Match source spacing to the planned shot duration so fixed-length cuts do not
  // replay overlapping footage just because their sample centers were distinct.
  const minimumGap = Number.isFinite(minimumGapOverride) && minimumGapOverride > 0
    ? Math.max(baseMinimumGap, minimumGapOverride)
    : baseMinimumGap;
  const bucketWidth = sourceDuration / bucketCount;

  for (let bucket = 0; bucket < bucketCount && selected.length < target; bucket += 1) {
    const from = bucket * bucketWidth;
    const to = bucket === bucketCount - 1 ? sourceDuration + Number.EPSILON : (bucket + 1) * bucketWidth;
    const best = ranked.find((item) =>
      item.time >= from && item.time < to &&
      !conflictsWithSelection(item, selected, minimumGap)
    );
    if (best) selected.push(best);
  }

  // Fill any gaps with the best remaining moments, rejecting overlapping source
  // intervals as well as near-identical timestamps.
  for (const item of ranked) {
    if (selected.length >= target) break;
    if (conflictsWithSelection(item, selected, minimumGap)) continue;
    selected.push(item);
  }

  // Preserve chronology: aggressive pacing is expressed through cut duration and
  // effects elsewhere, not by scrambling events into an incoherent story.
  return selected.sort((a, b) => a.time - b.time);
}

/** Return true when a proposed cut is too close to an already selected moment. */
export function isNearDuplicateMoment(
  candidate: Pick<HighlightMoment, "time">,
  selected: Array<Pick<HighlightMoment, "time">>,
  minimumGap: number,
): boolean {
  if (!Number.isFinite(candidate.time) || !Number.isFinite(minimumGap) || minimumGap < 0) return false;
  return selected.some((item) => Number.isFinite(item.time) && Math.abs(item.time - candidate.time) < minimumGap);
}
