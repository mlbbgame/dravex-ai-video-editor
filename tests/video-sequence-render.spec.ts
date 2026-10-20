import { expect, test } from "@playwright/test";
import { getSafeImageDuration } from "../src/video/video-sequence-render";

test("photo durations stay finite and within safe render bounds", () => {
  expect(getSafeImageDuration()).toBe(3);
  expect(getSafeImageDuration(Number.NaN)).toBe(3);
  expect(getSafeImageDuration(Number.POSITIVE_INFINITY)).toBe(3);
  expect(getSafeImageDuration(Number.NEGATIVE_INFINITY)).toBe(3);
  expect(getSafeImageDuration(-10)).toBe(0.25);
  expect(getSafeImageDuration(0)).toBe(0.25);
  expect(getSafeImageDuration(12)).toBe(12);
  expect(getSafeImageDuration(300)).toBe(30);
});
