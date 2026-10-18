import { expect, test } from "@playwright/test";
import { calculateVisualSimilarity } from "../src/video/image-analysis";

test("photo similarity recognizes an identical visual signature", () => {
  const signature = [12, 80, 140, 220, 210, 200, 40, 30, 20];
  expect(calculateVisualSimilarity(signature, [...signature])).toBe(1);
});

test("photo similarity distinguishes materially different images", () => {
  const first = [0, 0, 0, 10, 10, 10, 20, 20, 20];
  const second = [255, 255, 255, 220, 220, 220, 180, 180, 180];
  expect(calculateVisualSimilarity(first, second)).toBeLessThan(0.25);
});

test("invalid or differently sized signatures never claim a duplicate", () => {
  expect(calculateVisualSimilarity([], [])).toBe(0);
  expect(calculateVisualSimilarity([1, 2], [1])).toBe(0);
});
