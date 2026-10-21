import { expect, test } from "@playwright/test";
import {
  buildHighlightVariants,
  ensureCandidateCoverage,
  rankHighlightMomentsForStyle,
  scoreFrameQuality,
  getHighlightSampleLimit,
  getHighlightSamplingInterval,
} from "../src/video/highlight-finder";

test("short action clips use denser samples to locate brief highlights", () => {
  expect(getHighlightSampleLimit(25)).toBe(60);
  expect(getHighlightSamplingInterval(25, 60)).toBe(1);
  expect(Math.ceil(25 / getHighlightSamplingInterval(25, 60))).toBe(25);
});

test("medium clips retain a bounded mobile sampling interval", () => {
  expect(getHighlightSamplingInterval(30, 18)).toBe(1.5);
  expect(getHighlightSamplingInterval(90, 18)).toBe(1.5);
});

test("long clips distribute the bounded samples over the full source", () => {
  expect(getHighlightSampleLimit(300)).toBe(24);
  expect(getHighlightSamplingInterval(300, 24)).toBe(12.5);
});

test("aggressive and cinematic variants select different moments for different visual goals", () => {
  const candidates = [
    { time: 1, start: 0.5, end: 1.5, score: 0.4, motion: 1, contrast: 0.1 },
    { time: 2, start: 1.5, end: 2.5, score: 0.7, motion: 0, contrast: 0.1 },
    { time: 3.5, start: 3, end: 4, score: 0.3, motion: 0.2, contrast: 0.2 },
  ];
  const variants = buildHighlightVariants(candidates, 5);
  const aggressive = variants.find((variant) => variant.id === "aggressive");
  const cinematic = variants.find((variant) => variant.id === "cinematic");

  expect(aggressive?.moments[0]?.time).toBe(1);
  expect(cinematic?.moments[0]?.time).toBe(2);
});

test("style ranking prioritizes motion for velocity and calmer contrast for cinematic", () => {
  const candidates = [
    { time: 1, start: 0.5, end: 1.5, score: 0.5, motion: 1, contrast: 0.1 },
    { time: 2, start: 1.5, end: 2.5, score: 0.5, motion: 0, contrast: 0.9 },
  ];

  expect(rankHighlightMomentsForStyle(candidates, "velocity")[0]?.time).toBe(1);
  expect(rankHighlightMomentsForStyle(candidates, "cinematic")[0]?.time).toBe(2);
  // Ranking must not mutate the candidate list used by other variants.
  expect(candidates.map((item) => item.time)).toEqual([1, 2]);
});

test("invalid sampling inputs fall back safely", () => {
  expect(getHighlightSamplingInterval(Number.NaN, 18)).toBe(2);
  expect(getHighlightSamplingInterval(25, 1)).toBe(2);
  expect(getHighlightSamplingInterval(0, 18)).toBe(2);
});

test("variant builder rejects malformed runtime candidates without NaN trims", () => {
  const candidates = [
    null,
    undefined,
    17,
    { time: Number.NaN, start: 0, end: 1, score: 0.8, motion: 0.4, contrast: 0.2 },
    { time: 2, start: 3, end: 1, score: 0.8, motion: 0.4, contrast: 0.2 },
    { time: 1, start: -2, end: 2, score: 0.8, motion: 0.4, contrast: 0.2 },
    { time: 4, start: 3, end: 5, score: 0.8, motion: 0.4, contrast: 0.2 },
  ];

  const variants = buildHighlightVariants(candidates as never, 4);

  expect(variants).toHaveLength(3);
  for (const variant of variants) {
    expect(variant.moments.length).toBeGreaterThan(0);
    for (const moment of variant.moments) {
      expect(Number.isFinite(moment.time)).toBe(true);
      expect(Number.isFinite(moment.start)).toBe(true);
      expect(Number.isFinite(moment.end)).toBe(true);
      expect(moment.start).toBeGreaterThanOrEqual(0);
      expect(moment.end).toBeLessThanOrEqual(4);
      expect(moment.end).toBeGreaterThan(moment.start);
    }
  }
});

test("director variants stay inside the source and avoid repeated overlapping footage", () => {
  const candidates = Array.from({ length: 16 }, (_, index) => {
    const time = 1 + index * 1.2;
    return {
      time,
      start: time - 0.35,
      end: time + 0.35,
      score: ((index * 7) % 16) / 15,
      motion: ((index * 5) % 16) / 15,
      contrast: ((index * 11) % 16) / 15,
    };
  });
  const variants = buildHighlightVariants(candidates, 22);

  expect(variants).toHaveLength(3);
  for (const variant of variants) {
    expect(variant.moments.length).toBeGreaterThan(0);
    for (const moment of variant.moments) {
      expect(moment.start).toBeGreaterThanOrEqual(0);
      expect(moment.end).toBeLessThanOrEqual(22);
      expect(moment.end).toBeGreaterThan(moment.start);
    }
    for (let index = 1; index < variant.moments.length; index += 1) {
      expect(variant.moments[index].start).toBeGreaterThanOrEqual(
        variant.moments[index - 1].end,
      );
    }
  }
});

test("director variants use distinct pacing targets", () => {
  const candidates = Array.from({ length: 20 }, (_, index) => {
    const time = 0.8 + index * 1.05;
    return {
      time,
      start: Math.max(0, time - 0.3),
      end: Math.min(24, time + 0.3),
      score: ((index * 7) % 20) / 19,
      motion: ((index * 3) % 20) / 19,
      contrast: ((index * 11) % 20) / 19,
    };
  });
  const variants = buildHighlightVariants(candidates, 24);
  const shotLengths = new Set(variants.map((variant) => variant.shotLength));
  const momentCounts = new Set(variants.map((variant) => variant.moments.length));
  const sourceIntervalFingerprints = new Set(variants.map((variant) =>
    variant.moments.map((moment) => Math.round(moment.time * 10)).join(","),
  ));

  expect(shotLengths.size).toBeGreaterThan(1);
  expect(momentCounts.size).toBeGreaterThan(1);
  // Variants must make different source-selection decisions, not merely use
  // different output shot lengths or effects over the same footage.
  expect(sourceIntervalFingerprints.size).toBe(variants.length);
});


test("genre knowledge sets distinct editorial goals and preserves gameplay framing", async () => {
  const { getDirectorKnowledge, getDirectorShotLength } = await import("../src/video/ai-director");
  expect(getDirectorKnowledge("gaming").preserveFullFrame).toBe(true);
  expect(getDirectorKnowledge("gaming").editingGoal).toContain("HUD");
  expect(getDirectorKnowledge("automotive").preferredStyle).toBe("velocity");
  expect(getDirectorKnowledge("nature").baseShotSeconds).toBeGreaterThan(getDirectorKnowledge("automotive").baseShotSeconds);
  expect(getDirectorKnowledge("food").editingGoal).toContain("finished dish");
  expect(getDirectorShotLength("nature", "cinematic")).toBe(2.8);
  expect(getDirectorShotLength("gaming", "velocity")).toBe(1.1);
  expect(getDirectorShotLength("people", "story")).toBe(3);
  expect(getDirectorShotLength("unknown", "glitch")).toBe(1.35);
});

test("short aggressive edits relax stylistic spacing before dropping usable non-overlapping cuts", () => {
  const candidates = Array.from({ length: 7 }, (_, index) => {
    const time = 0.8 + index * 1.6;
    return {
      time,
      start: time - 0.1,
      end: time + 0.1,
      score: 1 - index / 10,
      motion: index / 7,
      contrast: (index % 2) / 2,
    };
  });
  const aggressive = buildHighlightVariants(candidates, 12).find((variant) => variant.id === "aggressive");

  expect(aggressive?.moments.length).toBe(7);
  for (let index = 1; index < (aggressive?.moments.length ?? 0); index += 1) {
    expect(aggressive!.moments[index].start).toBeGreaterThanOrEqual(aggressive!.moments[index - 1].end);
  }
});

test("style ranking rejects malformed highlight moments without losing valid candidates", () => {
  const valid = {
    time: 2,
    start: 1.5,
    end: 2.5,
    score: 0.8,
    motion: 0.7,
    contrast: 0.6,
  };
  const ranked = rankHighlightMomentsForStyle([
    { ...valid, time: Number.NaN },
    { ...valid, start: 3, end: 2 },
    { ...valid, score: Number.POSITIVE_INFINITY },
    valid,
  ], "velocity");

  expect(ranked).toEqual([valid]);
});


test("style ranking and variant building ignore null runtime candidates", () => {
  const valid = {
    time: 2,
    start: 1.5,
    end: 2.5,
    score: 0.8,
    motion: 0.7,
    contrast: 0.6,
  };
  const malformed = [null, undefined, 17, { ...valid, time: Number.NaN }];
  expect(rankHighlightMomentsForStyle([...malformed, valid] as never, "velocity")).toEqual([valid]);

  const variants = buildHighlightVariants([...malformed, valid] as never, 5);
  expect(variants).toHaveLength(3);
  expect(variants.every((variant) => variant.moments.every((moment) =>
    Number.isFinite(moment.start) &&
    Number.isFinite(moment.end) &&
    moment.start >= 0 &&
    moment.end <= 5 &&
    moment.end > moment.start
  ))).toBe(true);
});


test("coverage fallback ignores malformed sample and candidate records", () => {
  const samples = [
    null,
    undefined,
    { time: 1, score: 0.9, motion: 0.7, contrast: 0.5 },
    { time: Number.NaN, score: 1, motion: 1, contrast: 1 },
  ];
  const candidates = [
    null,
    undefined,
    { time: 2, start: 1.5, end: 2.5, score: 0.8, motion: 0.6, contrast: 0.4 },
    { time: 3, start: 4, end: 2, score: 1, motion: 1, contrast: 1 },
  ];
  const result = ensureCandidateCoverage(samples as never, candidates as never, 5);
  expect(result.length).toBeGreaterThan(0);
  expect(result.every((moment) =>
    Number.isFinite(moment.time) &&
    Number.isFinite(moment.start) &&
    Number.isFinite(moment.end) &&
    moment.start >= 0 &&
    moment.end <= 5 &&
    moment.end > moment.start
  )).toBe(true);
});


test("frame quality scoring safely rejects missing runtime feature payloads", () => {
  expect(scoreFrameQuality(null as never)).toBe(0);
  expect(scoreFrameQuality(undefined as never)).toBe(0);
  expect(scoreFrameQuality({
    motion: Number.NaN,
    contrast: Number.POSITIVE_INFINITY,
    saturation: -1,
    brightness: Number.NaN,
    detail: 2,
  })).toBeCloseTo(0.14);
});
