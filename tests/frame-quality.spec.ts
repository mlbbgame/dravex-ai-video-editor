import { expect, test } from "@playwright/test";
import { scoreFrameQuality } from "../src/video/highlight-finder";

test("keeps frame quality scores finite and bounded for malformed measurements", () => {
  const score = scoreFrameQuality({
    motion: Number.NaN,
    contrast: Number.POSITIVE_INFINITY,
    saturation: -1,
    brightness: Number.NaN,
    detail: Number.POSITIVE_INFINITY,
  });
  expect(Number.isFinite(score)).toBe(true);
  expect(score).toBeGreaterThanOrEqual(0);
  expect(score).toBeLessThanOrEqual(1);
});

test("prefers normally exposed frames over severely underexposed or overexposed frames", () => {
  const base = { motion: 0.4, contrast: 0.5, saturation: 0.5, detail: 0.5 };
  const balanced = scoreFrameQuality({ ...base, brightness: 0.48 });
  const dark = scoreFrameQuality({ ...base, brightness: 0.02 });
  const blownOut = scoreFrameQuality({ ...base, brightness: 0.98 });
  expect(balanced).toBeGreaterThan(dark);
  expect(balanced).toBeGreaterThan(blownOut);
});

test("does not reward impossible feature values beyond the normalized range", () => {
  const high = scoreFrameQuality({
    motion: 2, contrast: 2, saturation: 2, brightness: 0.48, detail: 2,
  });
  const normalized = scoreFrameQuality({
    motion: 1, contrast: 1, saturation: 1, brightness: 0.48, detail: 1,
  });
  expect(high).toBeCloseTo(normalized, 8);
});
