import { expect, test } from "@playwright/test";
import { buildHighlightVariants, type HighlightMoment } from "../src/video/highlight-finder";

function makeCandidates(): HighlightMoment[] {
  return Array.from({ length: 40 }, (_, index) => {
    const time = 0.5 + index * 1.2;
    const motion = index % 4 === 0 ? 0.95 : index % 4 === 1 ? 0.65 : index % 4 === 2 ? 0.2 : 0.05;
    const contrast = index % 4 === 0 ? 0.25 : index % 4 === 1 ? 0.45 : index % 4 === 2 ? 0.95 : 0.75;
    return {
      time,
      start: time - 0.5,
      end: time + 0.5,
      score: motion * 0.62 + contrast * 0.38,
      motion,
      contrast,
    };
  });
}

test("montage profiles rank motion and contrast differently instead of scaling every score equally", () => {
  const variants = buildHighlightVariants(makeCandidates(), 50);
  const aggressive = variants.find((variant) => variant.id === "aggressive");
  const cinematic = variants.find((variant) => variant.id === "cinematic");
  const atmospheric = variants.find((variant) => variant.id === "slow");

  expect(aggressive).toBeTruthy();
  expect(cinematic).toBeTruthy();
  expect(atmospheric).toBeTruthy();

  const selectedTimes = (variant: typeof aggressive) => new Set(variant!.moments.map((moment) => moment.time));
  const aggressiveTimes = selectedTimes(aggressive);
  const cinematicTimes = selectedTimes(cinematic);
  const atmosphericTimes = selectedTimes(atmospheric);

  expect([...aggressiveTimes].some((time) => !cinematicTimes.has(time))).toBe(true);
  expect([...cinematicTimes].some((time) => !atmosphericTimes.has(time))).toBe(true);
});

test("every montage variant returns valid source-bounded moments in chronological order", () => {
  const variants = buildHighlightVariants(makeCandidates(), 60);

  for (const variant of variants) {
    expect(variant.moments.length).toBeGreaterThan(0);
    expect(variant.moments.map((moment) => moment.time)).toEqual(
      [...variant.moments.map((moment) => moment.time)].sort((a, b) => a - b),
    );
    for (const moment of variant.moments) {
      expect(moment.start).toBeGreaterThanOrEqual(0);
      expect(moment.end).toBeLessThanOrEqual(50);
      expect(moment.end).toBeGreaterThan(moment.start);
    }
  }
});
