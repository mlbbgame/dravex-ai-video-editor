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

test("cuts do not overlap when the source is only slightly longer than preview", () => {
  const plan = planVariantPreviewCuts(4, 3.8, "velocity");
  expect(plan.cuts).toHaveLength(4);
  for (let index = 1; index < plan.cuts.length; index += 1) {
    expect(plan.cuts[index].trimStart).toBeGreaterThanOrEqual(plan.cuts[index - 1].trimEnd - 1e-9);
  }
  expect(plan.cuts[plan.cuts.length - 1].trimEnd).toBeLessThanOrEqual(4 + 1e-9);
});

test("short clips are partitioned without repeating the same opening frames", () => {
  const plan = planVariantPreviewCuts(1.2, 3.8, "velocity");
  expect(plan.cuts).toHaveLength(2);
  expect(plan.cuts[0].trimStart).toBeCloseTo(0);
  expect(plan.cuts[0].trimEnd).toBeCloseTo(plan.cuts[1].trimStart);
  expect(plan.cuts[1].trimEnd).toBeCloseTo(1.2);
});

test("variant preview plans stay bounded and non-overlapping across duration edge cases", () => {
  const variants = ["auto", "velocity", "cinema", "pulse", "story"];
  const sourceDurations = [0.45, 0.9, 1.2, 3.79, 3.8, 3.81, 4, 4.01, 7.6, 15, 60, 60.01];

  for (const sourceDuration of sourceDurations) {
    for (const variant of variants) {
      const plan = planVariantPreviewCuts(sourceDuration, 3.8, variant);
      expect(Number.isFinite(plan.duration), `${variant}: duration=${sourceDuration}`).toBe(true);
      expect(plan.duration).toBeGreaterThan(0);
      expect(plan.duration).toBeLessThanOrEqual(sourceDuration + 1e-9);
      expect(plan.cuts.length).toBeGreaterThan(0);

      for (let index = 0; index < plan.cuts.length; index += 1) {
        const cut = plan.cuts[index];
        expect(Number.isFinite(cut.trimStart)).toBe(true);
        expect(Number.isFinite(cut.trimEnd)).toBe(true);
        expect(cut.trimStart).toBeGreaterThanOrEqual(-1e-9);
        expect(cut.trimEnd).toBeLessThanOrEqual(sourceDuration + 1e-9);
        expect(cut.trimEnd).toBeGreaterThan(cut.trimStart);
        if (index > 0) {
          expect(cut.trimStart).toBeGreaterThanOrEqual(plan.cuts[index - 1].trimEnd - 1e-9);
        }
      }
    }
  }
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
