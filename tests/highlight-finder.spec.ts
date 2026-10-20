import { expect, test } from "@playwright/test";
import { buildHighlightVariants, scoreVisualSamples, type HighlightMoment } from "../src/video/highlight-finder";

test("visual scoring balances motion with sharpness, exposure, and readable detail", () => {
  const scored = scoreVisualSamples([
    { time: 1, motion: 0.9, contrast: 0.1, sharpness: 0.05, saturation: 0.1, brightness: 0.02, exposure: 0 },
    { time: 2, motion: 0.5, contrast: 0.5, sharpness: 0.5, saturation: 0.5, brightness: 0.5, exposure: 0.7 },
    { time: 3, motion: 0.9, contrast: 0.8, sharpness: 0.95, saturation: 0.7, brightness: 0.55, exposure: 1 }
  ]);

  expect(scored).toHaveLength(3);
  expect(scored.every((sample) => Number.isFinite(sample.score) && sample.score >= 0 && sample.score <= 1)).toBe(true);
  expect(scored[2].score).toBeGreaterThan(scored[0].score);
  expect(scored[0].sharpness).toBe(0.05);
  expect(scored[2].exposure).toBe(1);
});

test("highlight variants keep trims inside source bounds and avoid duplicate moments", () => {
  const candidates: HighlightMoment[] = Array.from({ length: 50 }, (_, index) => {
    const time = index * 2 + 1;
    return {
      time,
      start: Math.max(0, time - 0.5),
      end: Math.min(100, time + 0.5),
      score: 0.3 + (index % 5) * 0.12,
      motion: index % 2 ? 0.9 : 0.2,
      contrast: index % 3 ? 0.4 : 0.8,
      sharpness: index % 4 ? 0.7 : 0.2,
      saturation: 0.5,
      brightness: 0.5,
      exposure: 1
    };
  });

  const variants = buildHighlightVariants(candidates, 100);
  expect(variants.map((variant) => variant.id)).toEqual(["aggressive", "cinematic", "slow"]);
  for (const variant of variants) {
    expect(variant.moments.length).toBeGreaterThan(0);
    expect(variant.moments.every((moment) => moment.start >= 0 && moment.end <= 100 && moment.end > moment.start)).toBe(true);
    expect(new Set(variant.moments.map((moment) => moment.time)).size).toBe(variant.moments.length);
    expect(variant.duration).toBeGreaterThan(0);
  }
  expect(buildHighlightVariants(candidates, Number.NaN)).toHaveLength(0);
  expect(buildHighlightVariants(candidates, 0)).toHaveLength(0);
});
