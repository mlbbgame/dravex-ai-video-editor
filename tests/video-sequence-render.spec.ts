import { expect, test } from "@playwright/test";
import {
  getCameraMotionProfile,
  getOutputDimensions,
  getSpeedRampRate,
  shouldContainSource
} from "../src/video/video-sequence-render";

test("export dimensions preserve requested aspect ratio at each supported quality", () => {
  const expected = [
    ["9:16", "720p", 720, 1280],
    ["16:9", "720p", 1280, 720],
    ["1:1", "720p", 720, 720],
    ["4:5", "720p", 720, 900],
    ["9:16", "1080p", 1080, 1920],
    ["16:9", "1080p", 1920, 1080],
    ["9:16", "4K", 2160, 3840],
    ["16:9", "4K", 3840, 2160]
  ] as const;

  for (const [ratio, quality, width, height] of expected) {
    const dimensions = getOutputDimensions(ratio, quality);
    expect(dimensions).toEqual({ width, height });
    expect(dimensions.width / dimensions.height).toBeCloseTo(
      ratio === "16:9" ? 16 / 9 : ratio === "1:1" ? 1 : ratio === "4:5" ? 4 / 5 : 9 / 16,
      2
    );
  }
});

test("preview export dimensions stay small enough for mobile preview", () => {
  expect(getOutputDimensions("9:16", "preview")).toEqual({ width: 360, height: 640 });
  expect(getOutputDimensions("16:9", "preview")).toEqual({ width: 480, height: 270 });
  expect(getOutputDimensions("1:1", "preview")).toEqual({ width: 360, height: 360 });
  expect(getOutputDimensions("4:5", "preview")).toEqual({ width: 360, height: 450 });
});

test("speed ramp rates remain finite and bounded for every progress input", () => {
  for (const progress of [-10, 0, 0.1, 0.2, 0.42, 0.62, 0.82, 1, 10, Number.NaN]) {
    const rate = getSpeedRampRate("velocity", progress);
    expect(Number.isFinite(rate)).toBe(true);
    expect(rate).toBeGreaterThan(0);
    expect(rate).toBeLessThan(2.5);
    expect(getSpeedRampRate("cinematic", progress)).toBe(1);
    expect(getSpeedRampRate("travel", progress)).toBe(1);
  }
});

test("source framing contains mismatched aspect ratios and fills matching ratios", () => {
  expect(shouldContainSource(9 / 16, 16 / 9)).toBe(true);
  expect(shouldContainSource(16 / 9, 9 / 16)).toBe(true);
  expect(shouldContainSource(1, 1)).toBe(false);
  expect(shouldContainSource(16 / 9, 16 / 9)).toBe(false);
  expect(shouldContainSource(0, 1)).toBe(true);
  expect(shouldContainSource(Number.NaN, 1)).toBe(true);
});

test("camera motion profiles are finite and disabled when strength is none", () => {
  for (const style of ["velocity", "anime", "cinematic", "glitch", "story", "travel"] as const) {
    const none = getCameraMotionProfile(style, "none");
    const balanced = getCameraMotionProfile(style, "balanced");
    expect(none).toEqual({ zoom: 0, pan: 0 });
    expect(Number.isFinite(balanced.zoom)).toBe(true);
    expect(Number.isFinite(balanced.pan)).toBe(true);
    expect(balanced.zoom).toBeGreaterThan(0);
    expect(balanced.pan).toBeGreaterThan(0);
  }
});
