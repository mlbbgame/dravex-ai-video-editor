import type { HighlightMoment, HighlightRankingStyle } from "./highlight-finder";
import { rankHighlightMomentsForStyle } from "./highlight-finder";

export type MontageSelectionStyle = HighlightRankingStyle;

/**
 * Select a style-aware set of distinct moments while preserving source chronology.
 * Scores are editing hints from lightweight visual analysis, not semantic truth.
 */
export function selectDiverseHighlightMoments(
  candidates: HighlightMoment[],
  count: number,
  sourceDuration: number,
  style: MontageSelectionStyle,
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
    item.end > item.start
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
  const minimumGap = Math.max(0.35, Math.min(sourceDuration / Math.max(2, target * 1.5), style === "velocity" || style === "glitch" ? 1.1 : 2.0));
  const bucketWidth = sourceDuration / bucketCount;

  for (let bucket = 0; bucket < bucketCount && selected.length < target; bucket += 1) {
    const from = bucket * bucketWidth;
    const to = bucket === bucketCount - 1 ? sourceDuration + Number.EPSILON : (bucket + 1) * bucketWidth;
    const best = ranked.find((item) =>
      item.time >= from && item.time < to &&
      selected.every((existing) => Math.abs(existing.time - item.time) >= minimumGap)
    );
    if (best) selected.push(best);
  }

  // Fill any gaps with the best remaining moments, applying a novelty penalty
  // for near-duplicates rather than repeatedly selecting the same visual beat.
  for (const item of ranked) {
    if (selected.length >= target) break;
    if (selected.some((existing) => Math.abs(existing.time - item.time) < minimumGap)) continue;
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
