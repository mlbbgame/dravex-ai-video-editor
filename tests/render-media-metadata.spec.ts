import { expect, test } from "@playwright/test";
import { hasUsableAudioDuration, hasUsableImageDimensions } from "../src/video/video-sequence-render";

test("rejects image metadata without positive finite dimensions", () => {
  expect(hasUsableImageDimensions(1920, 1080)).toBe(true);
  expect(hasUsableImageDimensions(1, 1)).toBe(true);
  expect(hasUsableImageDimensions(0, 1080)).toBe(false);
  expect(hasUsableImageDimensions(1920, 0)).toBe(false);
  expect(hasUsableImageDimensions(Number.NaN, 1080)).toBe(false);
  expect(hasUsableImageDimensions(Number.POSITIVE_INFINITY, 1080)).toBe(false);
  expect(hasUsableImageDimensions(-1, 1080)).toBe(false);
});

test("requires finite positive audio duration before adding audio to a render timeline", () => {
  expect(hasUsableAudioDuration(0.01)).toBe(true);
  expect(hasUsableAudioDuration(180)).toBe(true);
  expect(hasUsableAudioDuration(0)).toBe(false);
  expect(hasUsableAudioDuration(-1)).toBe(false);
  expect(hasUsableAudioDuration(Number.NaN)).toBe(false);
  expect(hasUsableAudioDuration(Number.POSITIVE_INFINITY)).toBe(false);
});
