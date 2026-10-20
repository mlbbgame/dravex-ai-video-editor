import { expect, test } from "@playwright/test";
import { buildHighlightVariants, buildSceneAwareCandidates, getAnalysisSampleInterval, scoreVisualSamples, type HighlightMoment } from "../src/video/highlight-finder";

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


test("scene-aware candidates include motion changes and preserve timeline coverage", () => {
  const samples = Array.from({ length: 24 }, (_, index) => {
    const motion = index >= 10 && index <= 12 ? 0.95 : index < 10 ? 0.08 : 0.12;
    const score = index >= 10 && index <= 12 ? 0.9 : 0.45 + (index % 4) * 0.04;
    return {
      time: index * 2,
      score,
      motion,
      contrast: 0.4 + (index % 3) * 0.1,
      sharpness: index === 11 ? 0.85 : 0.6,
      saturation: 0.5,
      brightness: 0.5,
      exposure: 1
    };
  });

  const candidates = buildSceneAwareCandidates(samples, 48, 2);
  expect(candidates.length).toBeGreaterThan(3);
  expect(candidates.every((item) => item.start >= 0 && item.end <= 48 && item.end > item.start)).toBe(true);
  expect(new Set(candidates.map((item) => item.time)).size).toBe(candidates.length);
  expect(candidates.some((item) => item.time >= 18 && item.time <= 24)).toBe(true);
  expect(candidates[0].time).toBeLessThan(candidates[candidates.length - 1].time);
});

test("scene-aware candidates handle static footage without inventing event labels", () => {
  const samples = Array.from({ length: 8 }, (_, index) => ({
    time: index * 2,
    score: 0.5,
    motion: 0,
    contrast: 0.1,
    sharpness: 0.4,
    saturation: 0,
    brightness: 0.08,
    exposure: 0.5
  }));
  const candidates = buildSceneAwareCandidates(samples, 16, 2);
  expect(candidates.length).toBeGreaterThan(0);
  expect(candidates.every((item) => item.score >= 0 && item.score <= 1)).toBe(true);
  expect(Math.max(...candidates.map((item) => item.score))).toBeLessThan(0.5);
  expect(new Set(candidates.map((item) => item.time)).size).toBe(candidates.length);
  expect(buildSceneAwareCandidates([], 16)).toEqual([]);
  expect(buildSceneAwareCandidates(samples, Number.NaN)).toEqual([]);
});


test("style variants preserve late-source coverage and produce different moment sequences", () => {
  const candidates: HighlightMoment[] = Array.from({ length: 36 }, (_, index) => {
    const time = index * 2 + 1;
    return {
      time,
      start: Math.max(0, time - 0.5),
      end: Math.min(72, time + 0.5),
      score: 0.25 + ((index * 7) % 11) / 20,
      motion: ((index * 5) % 13) / 12,
      contrast: ((index * 3) % 9) / 8,
      sharpness: ((index * 11) % 10) / 9,
      saturation: 0.5,
      brightness: 0.5,
      exposure: 1
    };
  });
  const variants = buildHighlightVariants(candidates, 72);
  const aggressive = variants.find((variant) => variant.id === "aggressive")!;
  const cinematic = variants.find((variant) => variant.id === "cinematic")!;
  const slow = variants.find((variant) => variant.id === "slow")!;

  for (const variant of variants) {
    expect(variant.moments.some((moment) => moment.time >= 60)).toBe(true);
  }
  expect(aggressive.moments.map((moment) => moment.time)).not.toEqual(cinematic.moments.map((moment) => moment.time));
  expect(cinematic.moments.map((moment) => moment.time)).not.toEqual(slow.moments.map((moment) => moment.time));
});


test("analysis sampling adapts to clip duration without exploding on long videos", () => {
  expect(getAnalysisSampleInterval(60)).toBe(1.25);
  expect(getAnalysisSampleInterval(300)).toBe(2.5);
  expect(getAnalysisSampleInterval(900)).toBe(7.5);
  expect(getAnalysisSampleInterval(3600)).toBe(30);
  expect(getAnalysisSampleInterval(0)).toBe(2);
  expect(getAnalysisSampleInterval(Number.NaN)).toBe(2);

  for (const duration of [10, 60, 300, 900, 3600]) {
    const interval = getAnalysisSampleInterval(duration);
    expect(Math.ceil(duration / interval)).toBeLessThanOrEqual(120);
  }
});


test("scene-aware candidates detect visual scene cuts even when motion stays low", () => {
  const samples = Array.from({ length: 20 }, (_, index) => ({
    time: index * 2,
    score: 0.55,
    motion: 0.005,
    contrast: index < 10 ? 0.08 : 0.78,
    sharpness: index === 10 ? 0.9 : 0.55,
    saturation: index < 10 ? 0.2 : 0.85,
    brightness: index < 10 ? 0.18 : 0.82,
    exposure: 0.95
  }));
  const candidates = buildSceneAwareCandidates(samples, 40, 2);
  expect(candidates.length).toBeGreaterThan(2);
  expect(candidates.some((candidate) => candidate.time >= 18 && candidate.time <= 22)).toBe(true);
  expect(candidates.every((candidate) => candidate.start >= 0 && candidate.end <= 40)).toBe(true);
});


test("variant selection keeps timeline coverage when top bucket picks violate spacing", () => {
  const candidates: HighlightMoment[] = Array.from({ length: 72 }, (_, index) => {
    const time = index + 0.5;
    // Peaks near bucket boundaries can be too close to a previous selection.
    // Keep lower-scored alternatives available throughout every source region.
    const boundaryPeak = index % 8 === 0;
    return {
      time,
      start: Math.max(0, time - 0.5),
      end: Math.min(72, time + 0.5),
      score: boundaryPeak ? 1 : 0.55 + ((index * 7) % 10) / 100,
      motion: boundaryPeak ? 1 : ((index * 3) % 10) / 10,
      contrast: ((index * 5) % 10) / 10,
      sharpness: 0.4 + ((index * 11) % 6) / 10,
      saturation: 0.5,
      brightness: 0.5,
      exposure: 1
    };
  });

  const variants = buildHighlightVariants(candidates, 72);
  for (const variant of variants) {
    expect(variant.moments.length).toBeGreaterThan(3);
    const times = variant.moments.map((moment) => moment.time);
    expect(times.some((time) => time < 24)).toBe(true);
    expect(times.some((time) => time >= 24 && time < 48)).toBe(true);
    expect(times.some((time) => time >= 48)).toBe(true);
    expect(new Set(times).size).toBe(times.length);
  }
});
