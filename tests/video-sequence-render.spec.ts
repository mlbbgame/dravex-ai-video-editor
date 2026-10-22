import { expect, test } from "@playwright/test";
import { getRenderFrameInterval, getSafeImageDuration, getSourceAudioGain, getSourceFrameRect, getTrimBoundaryFrameTime, resolveVideoTrimRange, shouldContainSource } from "../src/video/video-sequence-render";

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
