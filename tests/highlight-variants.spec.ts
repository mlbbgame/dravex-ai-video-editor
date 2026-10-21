import { expect, test } from "@playwright/test";
import { buildHighlightVariants, rankHighlightMomentsForStyle, scoreFrameQuality, type HighlightMoment } from "../src/video/highlight-finder";

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

test("malformed candidate collection returns safe empty variants", () => {
  for (const candidates of [null, undefined, 17, {}]) {
    const variants = buildHighlightVariants(candidates as never, 12);
    expect(variants).toHaveLength(3);
    expect(variants.every((variant) => variant.duration === 0 && variant.moments.length === 0)).toBe(true);
  }
});

test("variant rankings prefer different motion profiles instead of applying a constant score multiplier", () => {
  const candidates: HighlightMoment[] = [];
  for (let bucket = 0; bucket < 12; bucket += 1) {
    const base = bucket * 5;
    candidates.push(
      { time: base + 0.4, start: base, end: base + 1, score: 0.78, motion: 0.95, contrast: 0.2 },
      { time: base + 1.6, start: base + 1, end: base + 2, score: 0.9, motion: 0.5, contrast: 0.95 },
      { time: base + 3.1, start: base + 2.5, end: base + 3.8, score: 0.82, motion: 0.1, contrast: 0.4 },
    );
  }

  const variants = buildHighlightVariants(candidates, 60);
  const averageMotion = variants.map((variant) =>
    variant.moments.reduce((sum, moment) => sum + moment.motion, 0) / Math.max(1, variant.moments.length),
  );

  expect(averageMotion[0]).toBeGreaterThan(averageMotion[1]);
  expect(averageMotion[1]).toBeGreaterThan(averageMotion[2]);
});

test("active montage ranking prioritizes motion, cinematic contrast, and calm storytelling differently", () => {
  const moments: HighlightMoment[] = [
    { time: 1, start: 0, end: 2, score: 0.78, motion: 0.95, contrast: 0.2 },
    { time: 5, start: 4, end: 6, score: 0.9, motion: 0.5, contrast: 0.95 },
    { time: 9, start: 8, end: 10, score: 0.82, motion: 0.1, contrast: 0.4 },
  ];

  expect(rankHighlightMomentsForStyle(moments, "velocity")[0].time).toBe(1);
  expect(rankHighlightMomentsForStyle(moments, "cinematic")[0].time).toBe(5);
  expect(rankHighlightMomentsForStyle(moments, "story")[0].time).toBe(9);
});


test("frame quality scoring prefers usable exposure over very dark or blown-out frames", () => {
  const base = { motion: 0.5, contrast: 0.5, saturation: 0.4, detail: 0.5 };
  const balanced = scoreFrameQuality({ ...base, brightness: 0.48 });
  const dark = scoreFrameQuality({ ...base, brightness: 0.02 });
  const overexposed = scoreFrameQuality({ ...base, brightness: 0.99 });

  expect(balanced).toBeGreaterThan(dark);
  expect(balanced).toBeGreaterThan(overexposed);
  expect(balanced).toBeLessThanOrEqual(1);
  expect(balanced).toBeGreaterThanOrEqual(0);
});

test("frame quality scoring rewards detail without allowing invalid measurements to produce NaN", () => {
  const base = { motion: 0.5, contrast: 0.5, saturation: 0.4, brightness: 0.48 };
  const detailed = scoreFrameQuality({ ...base, detail: 0.9 });
  const soft = scoreFrameQuality({ ...base, detail: 0.1 });

  expect(detailed).toBeGreaterThan(soft);
  expect(Number.isFinite(scoreFrameQuality({
    motion: Number.NaN,
    contrast: Number.POSITIVE_INFINITY,
    saturation: -1,
    brightness: Number.NaN,
    detail: Number.NaN,
  }))).toBe(true);
});


test("montage variants never reuse overlapping source windows when sample centers differ", () => {
  const overlapping: HighlightMoment[] = [
    { time: 2, start: 0, end: 5, score: 0.99, motion: 0.9, contrast: 0.6 },
    { time: 4, start: 1, end: 6, score: 0.98, motion: 0.85, contrast: 0.65 },
    { time: 8, start: 7, end: 9, score: 0.8, motion: 0.6, contrast: 0.4 },
    { time: 13, start: 12, end: 14, score: 0.75, motion: 0.4, contrast: 0.5 },
    { time: 18, start: 17, end: 19, score: 0.7, motion: 0.3, contrast: 0.3 },
  ];
  const variants = buildHighlightVariants(overlapping, 20);
  for (const variant of variants) {
    const selectedTimes = variant.moments.map((moment) => moment.time);
    expect(selectedTimes.includes(2) && selectedTimes.includes(4)).toBe(false);
    for (let index = 1; index < variant.moments.length; index += 1) {
      expect(variant.moments[index].start).toBeGreaterThanOrEqual(variant.moments[index - 1].end);
    }
  }
});
