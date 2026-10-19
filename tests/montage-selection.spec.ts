import { expect, test } from "@playwright/test";
import { selectDiverseHighlightMoments } from "../src/video/montage-selection";
import type { HighlightMoment } from "../src/video/highlight-finder";

function candidates(): HighlightMoment[] {
  return Array.from({ length: 20 }, (_, index) => ({
    time: index * 2,
    start: Math.max(0, index * 2 - 0.4),
    end: index * 2 + 0.4,
    score: index % 5 === 0 ? 0.95 : 0.35 + (index % 4) * 0.1,
    motion: index % 5 === 0 ? 0.95 : (index % 3) * 0.12,
    contrast: (index % 4) * 0.18,
  }));
}

test("selects temporally distinct moments and preserves source order", () => {
  const selected = selectDiverseHighlightMoments(candidates(), 6, 40, "velocity");
  expect(selected).toHaveLength(6);
  expect(selected.map((item) => item.time)).toEqual([...selected.map((item) => item.time)].sort((a, b) => a - b));
  for (let index = 1; index < selected.length; index += 1) {
    expect(selected[index].time - selected[index - 1].time).toBeGreaterThanOrEqual(0.35);
  }
});

test("style ranking can select different moments for aggressive and atmospheric edits", () => {
  const source = candidates();
  const aggressive = selectDiverseHighlightMoments(source, 5, 40, "velocity").map((item) => item.time);
  const atmospheric = selectDiverseHighlightMoments(source, 5, 40, "story").map((item) => item.time);
  expect(aggressive).not.toEqual(atmospheric);
});

test("ignores invalid candidates and returns an empty list for invalid requests", () => {
  const source = candidates();
  source.push({
    time: Number.NaN, start: 0, end: 1, score: 1, motion: 1, contrast: 1,
  });
  expect(selectDiverseHighlightMoments(source, 4, 40, "cinematic").every((item) => Number.isFinite(item.time))).toBe(true);
  expect(selectDiverseHighlightMoments(source, 0, 40, "cinematic")).toEqual([]);
  expect(selectDiverseHighlightMoments(source, 4, Number.NaN, "cinematic")).toEqual([]);
});
