import { expect, test } from "@playwright/test";
import {
  ensureCandidateCoverage,
  rankHighlightMomentsForStyle,
  type HighlightMoment,
  type HighlightSample,
} from "../src/video/highlight-finder";

const moments: HighlightMoment[] = [
  { time: 1, start: 0.5, end: 1.5, score: 0.8, motion: 0.1, contrast: 0.2 },
  { time: 3, start: 2.5, end: 3.5, score: 0.7, motion: 0.95, contrast: 0.9 },
  { time: 5, start: 4.5, end: 5.5, score: 0.75, motion: 0.55, contrast: 0.5 },
];

test("highlight ranking filters malformed moments and stays deterministic", () => {
  const input = [
    ...moments,
    { ...moments[0], time: Number.NaN },
    { ...moments[1], start: -1 },
    { ...moments[2], end: moments[2].start },
  ] as HighlightMoment[];

  for (const style of ["velocity", "cinematic", "story", "anime", "glitch"] as const) {
    const ranked = rankHighlightMomentsForStyle(input, style);
    expect(ranked).toHaveLength(3);
    expect(ranked.every((item) => Number.isFinite(item.time) && item.end > item.start)).toBe(true);
    expect(rankHighlightMomentsForStyle(input, style).map((item) => item.time))
      .toEqual(ranked.map((item) => item.time));
  }
});

test("candidate coverage ignores malformed samples and keeps all trims within duration", () => {
  const samples: HighlightSample[] = [
    { time: 0.1, score: 0.9, motion: 0.8, contrast: 0.7 },
    { time: 4.9, score: 0.95, motion: 0.7, contrast: 0.8 },
    { time: Number.NaN, score: 1, motion: 1, contrast: 1 },
    { time: 9, score: 0.8, motion: 0.5, contrast: 0.5 },
  ];
  const result = ensureCandidateCoverage(samples, [], 5);

  expect(result.length).toBeGreaterThan(0);
  expect(result.every((item) =>
    Number.isFinite(item.time) &&
    Number.isFinite(item.start) &&
    Number.isFinite(item.end) &&
    item.start >= 0 &&
    item.end <= 5 &&
    item.end > item.start &&
    item.time >= item.start &&
    item.time <= item.end
  )).toBe(true);
});

test("candidate coverage safely handles malformed runtime collections", () => {
  expect(ensureCandidateCoverage(null as unknown as HighlightSample[], null as unknown as HighlightMoment[], 5))
    .toEqual([]);
  expect(ensureCandidateCoverage([], [], Number.NaN)).toEqual([]);
});
