import { expect, test } from "@playwright/test";
import { snapCutBoundariesToBeats } from "../src/video/beat-sync";

test("beat snapping keeps every cut inside the timeline with a positive gap", () => {
  const boundaries = snapCutBoundariesToBeats(
    [0.5, 1, 1.5, 2, 2.5, 3, 3.5, 4, 4.5, 5, 5.5, 6, 6.5, 7],
    8,
    6,
    1.2
  );

  expect(boundaries).toHaveLength(7);
  expect(boundaries[0]).toBe(0);
  expect(boundaries.at(-1)).toBe(8);
  expect(boundaries.every(Number.isFinite)).toBe(true);
  expect(boundaries.every((time, index) => index === 0 || time > boundaries[index - 1])).toBe(true);
  expect(boundaries.every((time) => time >= 0 && time <= 8)).toBe(true);
});

test("invalid or sparse beat markers fall back to evenly spaced cuts", () => {
  expect(snapCutBoundariesToBeats([Number.NaN, Infinity, -1, 99], 8, 4, 1)).toEqual([0, 2, 4, 6, 8]);
  expect(snapCutBoundariesToBeats([1], 8, 4, 1)).toEqual([0, 2, 4, 6, 8]);
  expect(snapCutBoundariesToBeats([], 8, 4, 1)).toEqual([0, 2, 4, 6, 8]);
});

test("invalid duration returns no boundaries and a single segment stays intact", () => {
  expect(snapCutBoundariesToBeats([1, 2], 0, 4, 1)).toEqual([]);
  expect(snapCutBoundariesToBeats([1, 2], Number.NaN, 4, 1)).toEqual([]);
  expect(snapCutBoundariesToBeats([1, 2], 8, 1, 1)).toEqual([0, 8]);
  expect(snapCutBoundariesToBeats([1, 2], 8, 0, 1)).toEqual([0, 8]);
});

test("extreme segment counts and invalid preferred shot lengths stay finite", () => {
  const boundaries = snapCutBoundariesToBeats([0.5, 1, 2, 3, 4, 5, 6, 7], 8, 30, Number.NaN);

  expect(boundaries).toHaveLength(31);
  expect(boundaries.every(Number.isFinite)).toBe(true);
  expect(boundaries[0]).toBe(0);
  expect(boundaries.at(-1)).toBe(8);
  expect(boundaries.every((time, index) => index === 0 || time > boundaries[index - 1])).toBe(true);
});
