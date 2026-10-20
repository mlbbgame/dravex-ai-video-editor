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

test("aggressive and music previews use clearly different source moments", () => {
  const aggressive = planVariantPreviewCuts(60, 3.8, "velocity");
  const music = planVariantPreviewCuts(60, 3.8, "pulse");
  expect(aggressive.cuts.map((cut) => cut.trimStart)).not.toEqual(
    music.cuts.map((cut) => cut.trimStart),
  );
  expect(aggressive.cuts[1].trimStart).toBeLessThan(music.cuts[1].trimStart);
  expect(music.cuts[3].trimStart).toBeGreaterThan(aggressive.cuts[3].trimStart);
});

test("cinematic preview uses fewer, longer shots", () => {
  const cinematic = planVariantPreviewCuts(30, 3.8, "cinema");
  expect(cinematic.cuts).toHaveLength(2);
  expect(cinematic.cuts[0].trimEnd - cinematic.cuts[0].trimStart).toBeCloseTo(1.9);
});

test("atmospheric story preview uses four varied cuts and samples all photos", () => {
  const story = planVariantPreviewCuts(45, 3.8, "story");
  expect(story.cuts).toHaveLength(4);
  expect(story.cuts[0].trimStart).toBeLessThan(story.cuts[3].trimStart);
  expect(selectVariantPreviewIndices(8, "story")).toEqual([0, 2, 5, 7]);
});

test("short sources never produce trims outside their duration", () => {
  const plan = planVariantPreviewCuts(1.2, 3.8, "velocity");
  expect(plan.duration).toBeCloseTo(1.2);
  for (const cut of plan.cuts) {
    expect(cut.trimStart).toBeGreaterThanOrEqual(0);
    expect(cut.trimEnd).toBeLessThanOrEqual(1.2 + 1e-9);
  }
});

test("short clips are partitioned without repeating the same opening frames", () => {
  const plan = planVariantPreviewCuts(1.2, 3.8, "velocity");
  expect(plan.cuts).toHaveLength(2);
  expect(plan.cuts[0].trimStart).toBeCloseTo(0);
  expect(plan.cuts[0].trimEnd).toBeCloseTo(plan.cuts[1].trimStart);
  expect(plan.cuts[1].trimEnd).toBeCloseTo(1.2);
});

test("invalid source lengths produce an empty plan", () => {
  expect(planVariantPreviewCuts(0, 3.8, "pulse")).toEqual({ duration: 0, cuts: [] });
  expect(planVariantPreviewCuts(Number.NaN, 3.8, "story")).toEqual({ duration: 0, cuts: [] });
  expect(planVariantPreviewCuts(60, Number.NaN, "cinema")).toEqual({ duration: 0, cuts: [] });
});

test("photo previews sample across the full collection", () => {
  expect(selectVariantPreviewIndices(10, "velocity")).toEqual([0, 3, 6, 9]);
  expect(selectVariantPreviewIndices(0, "cinema")).toEqual([]);
  expect(selectVariantPreviewIndices(1, "cinema")).toEqual([0]);
});
