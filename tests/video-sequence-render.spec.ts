import { expect, test } from "@playwright/test";
import { getRenderFrameInterval, getSafeImageDuration } from "../src/video/video-sequence-render";

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


test("render loop frame pacing matches the recorder frame rate", () => {
  expect(getRenderFrameInterval(24)).toBeCloseTo(1000 / 24, 5);
  expect(getRenderFrameInterval(30)).toBeCloseTo(1000 / 30, 5);
  expect(getRenderFrameInterval(60)).toBeCloseTo(1000 / 60, 5);
  expect(getRenderFrameInterval(120)).toBeCloseTo(1000 / 60, 5);
  expect(getRenderFrameInterval(0)).toBeCloseTo(1000 / 24, 5);
  expect(getRenderFrameInterval(Number.NaN)).toBeCloseTo(1000 / 24, 5);
});
