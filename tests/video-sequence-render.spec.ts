import { expect, test } from "@playwright/test";
import { MAX_CONCURRENT_MEDIA_LOADS, getRenderFrameInterval, getSafeAudioTrackVolume, getSafeImageDuration, getSourceAudioGain, getSourceFrameRect, getTransitionSequenceType, getTrimBoundaryFrameTime, hasUsableAudioDuration, hasUsableImageDimensions, hasUsableVideoDimensions, isUsableFinalRenderDuration, isUsableRenderDuration, resolveVideoTrimRange, shouldContainSource } from "../src/video/video-sequence-render";

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


test("contain framing keeps the complete source frame for gameplay and HUD-heavy video", () => {
  expect(getSourceFrameRect(1920, 1080, 1080, 1920, "contain")).toEqual({
    x: 0, y: 0, width: 1920, height: 1080,
  });
});

test("cover framing computes a centered crop for portrait output", () => {
  const crop = getSourceFrameRect(1920, 1080, 1080, 1920, "cover");
  expect(crop.x).toBeCloseTo(656.25, 2);
  expect(crop.y).toBe(0);
  expect(crop.width).toBeCloseTo(607.5, 2);
  expect(crop.height).toBe(1080);
});

test("cover framing crops vertical footage for landscape output", () => {
  const crop = getSourceFrameRect(1080, 1920, 1920, 1080, "cover");
  expect(crop.x).toBe(0);
  expect(crop.width).toBe(1080);
  expect(crop.height).toBeCloseTo(607.5, 2);
  expect(crop.y).toBeCloseTo(656.25, 2);
});

test("invalid framing dimensions fall back safely", () => {
  expect(getSourceFrameRect(0, 1080, 1080, 1920, "cover")).toEqual({
    x: 0, y: 0, width: 1, height: 1080,
  });
});


test("automatic framing preserves the existing safe behavior while explicit fit and fill override it", () => {
  expect(shouldContainSource(16 / 9, 9 / 16)).toBe(true);
  expect(shouldContainSource(16 / 9, 9 / 16, "auto")).toBe(true);
  expect(shouldContainSource(16 / 9, 9 / 16, "fit")).toBe(true);
  expect(shouldContainSource(16 / 9, 9 / 16, "fill")).toBe(false);
  expect(shouldContainSource(1, 1, "auto")).toBe(false);
  expect(shouldContainSource(1, 1, "fit")).toBe(true);
  expect(shouldContainSource(1, 1, "fill")).toBe(false);
});

test("render loop frame pacing matches the recorder frame rate", () => {
  expect(getRenderFrameInterval(24)).toBeCloseTo(1000 / 24, 5);
  expect(getRenderFrameInterval(30)).toBeCloseTo(1000 / 30, 5);
  expect(getRenderFrameInterval(60)).toBeCloseTo(1000 / 60, 5);
  expect(getRenderFrameInterval(120)).toBeCloseTo(1000 / 60, 5);
  expect(getRenderFrameInterval(0)).toBeCloseTo(1000 / 24, 5);
  expect(getRenderFrameInterval(Number.NaN)).toBeCloseTo(1000 / 24, 5);
});


test("automatic source audio ducks under music while keep and mute modes are explicit", () => {
  expect(getSourceAudioGain("auto", 0.8, false)).toBeCloseTo(0.8);
  expect(getSourceAudioGain("auto", 0.8, true)).toBeCloseTo(0.224);
  expect(getSourceAudioGain("keep", 0.8, true)).toBeCloseTo(0.8);
  expect(getSourceAudioGain("mute", 0.8, false)).toBe(0);
});

test("source audio gain clamps invalid and out-of-range volume values", () => {
  expect(getSourceAudioGain("keep", 5, false)).toBe(1);
  expect(getSourceAudioGain("keep", -1, false)).toBe(0);
  expect(getSourceAudioGain("auto", Number.NaN, true)).toBeCloseTo(0.224);
});


test("trim boundary holds the last frame inside the selected source range", () => {
  expect(getTrimBoundaryFrameTime(1, 2)).toBeCloseTo(2 - 1 / 24, 8);
  expect(getTrimBoundaryFrameTime(0, 0.01)).toBeCloseTo(0.005, 8);
  expect(getTrimBoundaryFrameTime(3, 3)).toBe(3);
  expect(getTrimBoundaryFrameTime(4, 2)).toBe(4);
  expect(getTrimBoundaryFrameTime(Number.NaN, 2)).toBe(0);
});

test("video trim ranges remain inside source bounds and last at least 0.1 seconds", () => {
  expect(resolveVideoTrimRange(10, 2, 5)).toEqual({ start: 2, end: 5, duration: 3 });
  expect(resolveVideoTrimRange(10, -4, 3)).toEqual({ start: 0, end: 3, duration: 3 });
  expect(resolveVideoTrimRange(10, 8, 20)).toEqual({ start: 8, end: 10, duration: 2 });
  expect(resolveVideoTrimRange(10, 9.95, 9.96)).toEqual({ start: 9.9, end: 10, duration: 0.1 });
});

test("video trim ranges recover safely from invalid trim values and reject unusable sources", () => {
  expect(resolveVideoTrimRange(5, Number.NaN, Number.NaN)).toEqual({ start: 0, end: 5, duration: 5 });
  expect(resolveVideoTrimRange(5, 3, 2)).toEqual({ start: 3, end: 3.1, duration: 0.1 });
  expect(() => resolveVideoTrimRange(Number.NaN, 0, 1)).toThrow();
  expect(() => resolveVideoTrimRange(0.05, 0, 0.05)).toThrow();
});


test("cinematic and automatic transitions provide varied but repeatable cut sequences", () => {
  const cinematic = Array.from({ length: 6 }, (_, index) => getTransitionSequenceType("cinematic", "cinematic", index + 1));
  const calm = Array.from({ length: 6 }, (_, index) => getTransitionSequenceType("story", "auto", index + 1));
  const action = Array.from({ length: 5 }, (_, index) => getTransitionSequenceType("velocity", "action", index + 1));

  expect(new Set(cinematic).size).toBeGreaterThanOrEqual(3);
  expect(new Set(calm).size).toBeGreaterThanOrEqual(4);
  expect(new Set(action).size).toBe(5);
  expect(getTransitionSequenceType("cinematic", "cinematic", 1)).toBe(8);
  expect(getTransitionSequenceType("story", "auto", 0)).toBe(0);
  expect(getTransitionSequenceType("story", "auto", Number.NaN)).toBe(0);
});


test("media metadata guards reject zero, negative, NaN, and infinite dimensions", () => {
  expect(hasUsableImageDimensions(1920, 1080)).toBe(true);
  expect(hasUsableImageDimensions(1, 1)).toBe(true);
  expect(hasUsableImageDimensions(0, 1080)).toBe(false);
  expect(hasUsableImageDimensions(1920, 0)).toBe(false);
  expect(hasUsableImageDimensions(-1, 1080)).toBe(false);
  expect(hasUsableImageDimensions(Number.NaN, 1080)).toBe(false);
  expect(hasUsableImageDimensions(1920, Number.POSITIVE_INFINITY)).toBe(false);
});

test("render duration guard rejects zero, non-finite, and overflowed timelines", () => {
  expect(isUsableRenderDuration(0.1)).toBe(true);
  expect(isUsableRenderDuration(300)).toBe(true);
  expect(isUsableRenderDuration(0)).toBe(false);
  expect(isUsableRenderDuration(-1)).toBe(false);
  expect(isUsableRenderDuration(Number.NaN)).toBe(false);
  expect(isUsableRenderDuration(Number.POSITIVE_INFINITY)).toBe(false);
  expect(isUsableRenderDuration(Number.NEGATIVE_INFINITY)).toBe(false);
  expect(isUsableRenderDuration(Number.MAX_VALUE + Number.MAX_VALUE)).toBe(false);
});

test("final render duration rejects positive but effectively empty timelines", () => {
  expect(isUsableFinalRenderDuration(0.1)).toBe(true);
  expect(isUsableFinalRenderDuration(0.100001)).toBe(true);
  expect(isUsableFinalRenderDuration(300)).toBe(true);
  expect(isUsableFinalRenderDuration(0.099999)).toBe(false);
  expect(isUsableFinalRenderDuration(0)).toBe(false);
  expect(isUsableFinalRenderDuration(-1)).toBe(false);
  expect(isUsableFinalRenderDuration(Number.NaN)).toBe(false);
  expect(isUsableFinalRenderDuration(Number.POSITIVE_INFINITY)).toBe(false);
  expect(isUsableFinalRenderDuration(Number.NEGATIVE_INFINITY)).toBe(false);
});

test("video metadata guard rejects invalid decoded dimensions", () => {
  expect(hasUsableVideoDimensions(1920, 1080)).toBe(true);
  expect(hasUsableVideoDimensions(0, 1080)).toBe(false);
  expect(hasUsableVideoDimensions(1920, 0)).toBe(false);
  expect(hasUsableVideoDimensions(Number.NaN, 1080)).toBe(false);
  expect(hasUsableVideoDimensions(1920, Number.NaN)).toBe(false);
  expect(hasUsableVideoDimensions(Number.POSITIVE_INFINITY, 1080)).toBe(false);
  expect(hasUsableVideoDimensions(1920, Number.POSITIVE_INFINITY)).toBe(false);
});

test("audio metadata guard rejects unusable durations but accepts finite positive durations", () => {
  expect(hasUsableAudioDuration(0.01)).toBe(true);
  expect(hasUsableAudioDuration(120)).toBe(true);
  expect(hasUsableAudioDuration(0)).toBe(false);
  expect(hasUsableAudioDuration(-1)).toBe(false);
  expect(hasUsableAudioDuration(Number.NaN)).toBe(false);
  expect(hasUsableAudioDuration(Number.POSITIVE_INFINITY)).toBe(false);
  expect(hasUsableAudioDuration(Number.NEGATIVE_INFINITY)).toBe(false);
});

test("video trim normalization never emits non-finite values or extends beyond the source", () => {
  const cases = [
    [0.1, 0, 0.1],
    [1, Number.NaN, Number.POSITIVE_INFINITY],
    [2, -100, 100],
    [8, 7.99, 8],
    [15, Number.POSITIVE_INFINITY, Number.NaN],
  ] as const;

  for (const [sourceDuration, requestedStart, requestedEnd] of cases) {
    const range = resolveVideoTrimRange(sourceDuration, requestedStart, requestedEnd);
    expect(Number.isFinite(range.start)).toBe(true);
    expect(Number.isFinite(range.end)).toBe(true);
    expect(Number.isFinite(range.duration)).toBe(true);
    expect(range.start).toBeGreaterThanOrEqual(0);
    expect(range.end).toBeLessThanOrEqual(sourceDuration);
    expect(range.duration).toBeGreaterThanOrEqual(0.1);
    expect(range.duration).toBeCloseTo(range.end - range.start, 6);
  }
});


test("music volume is clamped and invalid values fall back safely", () => {
  expect(getSafeAudioTrackVolume()).toBe(0.65);
  expect(getSafeAudioTrackVolume(Number.NaN)).toBe(0.65);
  expect(getSafeAudioTrackVolume(Number.POSITIVE_INFINITY)).toBe(0.65);
  expect(getSafeAudioTrackVolume(Number.NEGATIVE_INFINITY)).toBe(0.65);
  expect(getSafeAudioTrackVolume(-1)).toBe(0);
  expect(getSafeAudioTrackVolume(0)).toBe(0);
  expect(getSafeAudioTrackVolume(0.4)).toBe(0.4);
  expect(getSafeAudioTrackVolume(2)).toBe(1);
});


test("mobile media decoding has a conservative concurrency cap", () => {
  expect(MAX_CONCURRENT_MEDIA_LOADS).toBe(3);
  expect(Number.isInteger(MAX_CONCURRENT_MEDIA_LOADS)).toBe(true);
  expect(MAX_CONCURRENT_MEDIA_LOADS).toBeGreaterThan(0);
  expect(MAX_CONCURRENT_MEDIA_LOADS).toBeLessThanOrEqual(4);
});
