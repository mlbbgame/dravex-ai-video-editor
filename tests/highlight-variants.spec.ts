import { expect, test } from "@playwright/test";
import { buildHighlightVariants, type HighlightMoment } from "../src/video/highlight-finder";

const candidate = (time: number): HighlightMoment => ({
  time,
  start: Math.max(0, time - 0.5),
  end: time + 0.5,
  score: 0.7,
  motion: 0.2,
  contrast: 0.15,
});

test("invalid source durations return empty variants instead of NaN trims", () => {
  for (const duration of [Number.NaN, Number.POSITIVE_INFINITY, 0, -1, 0.1]) {
    const variants = buildHighlightVariants([candidate(1)], duration);
    expect(variants).toHaveLength(3);
    expect(variants.every((variant) => variant.duration === 0 && variant.moments.length === 0)).toBe(true);
  }
});

test("invalid candidate measurements are ignored without breaking valid variants", () => {
  const invalid: HighlightMoment = {
    time: Number.NaN,
    start: 0,
    end: 2,
    score: 0.9,
    motion: 0.2,
    contrast: 0.1,
  };
  const variants = buildHighlightVariants([candidate(1), candidate(4), invalid, candidate(30)], 10);

  expect(variants).toHaveLength(3);
  for (const variant of variants) {
    expect(variant.duration).toBeGreaterThan(0);
    expect(Number.isFinite(variant.duration)).toBe(true);
    expect(variant.moments.length).toBeGreaterThan(0);
    expect(variant.moments.every((moment) =>
      Number.isFinite(moment.time)
      && Number.isFinite(moment.start)
      && Number.isFinite(moment.end)
      && moment.start >= 0
      && moment.end <= 10
      && moment.end > moment.start
    )).toBe(true);
  }
});

test("variants from a very short valid source never exceed source duration", () => {
  const variants = buildHighlightVariants([candidate(0.2)], 0.4);

  for (const variant of variants) {
    expect(Number.isFinite(variant.duration)).toBe(true);
    expect(variant.duration).toBeLessThanOrEqual(0.4);
    expect(variant.moments.every((moment) => moment.start >= 0 && moment.end <= 0.4)).toBe(true);
  }
});

test("empty candidate input produces valid empty variant descriptions", () => {
  const variants = buildHighlightVariants([], 12);
  expect(variants.map((variant) => variant.id)).toEqual(["aggressive", "cinematic", "slow"]);
  expect(variants.every((variant) => variant.duration === 0 && variant.moments.length === 0)).toBe(true);
});
