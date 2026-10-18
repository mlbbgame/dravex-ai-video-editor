import { expect, test } from "@playwright/test";
import { planVariantPreviewCuts, selectVariantPreviewIndices } from "../src/video/variant-preview";

test("aggressive and music previews use short cuts from across the source", () => {
  const aggressive = planVariantPreviewCuts(60, 3.8, "velocity");
  const music = planVariantPreviewCuts(60, 3.8, "pulse");
  expect(aggressive.cuts).toHaveLength(4);
  expect(music.cuts).toHaveLength(4);
  expect(aggressive.duration).toBeCloseTo(3.8);
  expect(aggressive.cuts[0].trimStart).toBeLessThan(aggressive.cuts[3].trimStart);
  expect(music.cuts[0].trimStart).not.toBe(aggressive.cuts[0].trimStart);
});

test("cinematic preview uses fewer, longer shots", () => {
  const cinematic = planVariantPreviewCuts(30, 3.8, "cinema");
  expect(cinematic.cuts).toHaveLength(2);
  expect(cinematic.cuts[0].trimEnd - cinematic.cuts[0].trimStart).toBeCloseTo(1.9);
});

test("short sources never produce trims outside their duration", () => {
  const plan = planVariantPreviewCuts(1.2, 3.8, "velocity");
  expect(plan.duration).toBeCloseTo(1.2);
  for (const cut of plan.cuts) {
    expect(cut.trimStart).toBeGreaterThanOrEqual(0);
    expect(cut.trimEnd).toBeLessThanOrEqual(1.2 + 1e-9);
  }
});

test("photo previews sample across the full collection", () => {
  expect(selectVariantPreviewIndices(10, "velocity")).toEqual([0, 3, 6, 9]);
  expect(selectVariantPreviewIndices(0, "cinema")).toEqual([]);
  expect(selectVariantPreviewIndices(1, "cinema")).toEqual([0]);
});
