import { expect, test } from "@playwright/test";
import { snapCutBoundariesToBeats } from "../src/video/beat-sync";

test("beat snapping returns safe boundaries for zero or invalid segment counts", () => {
  expect(snapCutBoundariesToBeats([0, 1, 2], 5, 0, 1)).toEqual([0]);
  expect(snapCutBoundariesToBeats([0, 1, 2], 5, -3, 1)).toEqual([0]);
  expect(snapCutBoundariesToBeats([0, 1, 2], 5, Number.NaN, 1)).toEqual([0, 5]);
});

test("beat snapping rejects invalid target durations without returning NaN", () => {
  expect(snapCutBoundariesToBeats([0, 1], 0, 3, 1)).toEqual([0]);
  expect(snapCutBoundariesToBeats([0, 1], Number.NaN, 3, 1)).toEqual([0]);
  expect(snapCutBoundariesToBeats([0, 1], Number.POSITIVE_INFINITY, 3, 1)).toEqual([0]);
});

test("beat snapping ignores non-finite and out-of-range beat markers", () => {
  const boundaries = snapCutBoundariesToBeats(
    [Number.NaN, Number.POSITIVE_INFINITY, -4, 0.8, 1.6, 3.2, 99],
    4,
    3,
    Number.NaN
  );

  expect(boundaries[0]).toBe(0);
  expect(boundaries[boundaries.length - 1]).toBe(4);
  expect(boundaries.every(Number.isFinite)).toBe(true);
  expect(boundaries.every((value, index) => index === 0 || value > boundaries[index - 1])).toBe(true);
});

test("beat snapping keeps cuts increasing and inside the target duration", () => {
  const boundaries = snapCutBoundariesToBeats([0.5, 1, 1.5, 2, 2.5, 3], 3.2, 5, 0.6);

  expect(boundaries).toHaveLength(6);
  expect(boundaries[0]).toBe(0);
  expect(boundaries.at(-1)).toBe(3.2);
  expect(boundaries.every(Number.isFinite)).toBe(true);
  expect(boundaries.every((value, index) => index === 0 || value > boundaries[index - 1])).toBe(true);
});
