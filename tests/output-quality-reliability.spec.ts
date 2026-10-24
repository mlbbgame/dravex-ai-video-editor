import { expect, test } from "@playwright/test";
import {
  getInspectionSampleInterval,
  getOutputInspectionTimes,
  getOutputQualitySeverity,
  hasExpectedOutputDimensions,
  hasReachedMediaReadyState,
  isRenderedDurationWithinTolerance,
  shouldCompareFrameSamples,
  shouldWaitForDecodedFrame,
} from "../src/video/output-quality";

test("export inspection samples remain finite, ordered, and inside the video duration", () => {
  for (const duration of [0.01, 0.1, 1, 9, 300]) {
    const times = getOutputInspectionTimes(duration, 9);
    expect(times.length).toBeGreaterThan(0);
    expect(times.length).toBeLessThanOrEqual(9);
    expect(times.every((time) => Number.isFinite(time) && time >= 0 && time < duration)).toBe(true);
    expect(times).toEqual([...times].sort((a, b) => a - b));
  }
  expect(getOutputInspectionTimes(10, 0)).toEqual([]);
  expect(getOutputInspectionTimes(Number.NaN, 5)).toEqual([]);
});

test("export inspection sample count and spacing handle invalid inputs", () => {
  expect(getInspectionSampleInterval(10, 5)).toBe(2.5);
  expect(getInspectionSampleInterval(10, 1)).toBe(0);
  expect(getInspectionSampleInterval(0, 5)).toBe(0);
  expect(getInspectionSampleInterval(Number.POSITIVE_INFINITY, 5)).toBe(0);
  expect(getInspectionSampleInterval(10, Number.NaN)).toBe(0);
  expect(shouldCompareFrameSamples(0.5)).toBe(true);
  expect(shouldCompareFrameSamples(0.499)).toBe(false);
  expect(shouldCompareFrameSamples(Number.NaN)).toBe(false);
});

test("rendered duration validation tolerates normal encoder rounding but rejects invalid values", () => {
  expect(isRenderedDurationWithinTolerance(10.2, 10)).toBe(true);
  expect(isRenderedDurationWithinTolerance(10.8, 10)).toBe(false);
  expect(isRenderedDurationWithinTolerance(300, 300)).toBe(true);
  expect(isRenderedDurationWithinTolerance(Number.NaN, 10)).toBe(false);
  expect(isRenderedDurationWithinTolerance(10, Number.POSITIVE_INFINITY)).toBe(false);
  // Invalid tolerances must not silently disable the validation.
  expect(isRenderedDurationWithinTolerance(10.8, 10, Number.NaN)).toBe(false);
  expect(isRenderedDurationWithinTolerance(10.8, 10, -1)).toBe(false);
});

test("decoded-frame readiness avoids sampling before current pixel data exists", () => {
  expect(hasReachedMediaReadyState("loadedmetadata", 1)).toBe(true);
  expect(hasReachedMediaReadyState("loadeddata", 2)).toBe(true);
  expect(hasReachedMediaReadyState("loadeddata", 1)).toBe(false);
  expect(hasReachedMediaReadyState("loadedmetadata", Number.NaN)).toBe(false);
  expect(shouldWaitForDecodedFrame(1, 1, 1)).toBe(true);
  expect(shouldWaitForDecodedFrame(1, 1, 2)).toBe(false);
  expect(shouldWaitForDecodedFrame(0, 1, 4)).toBe(false);
  expect(shouldWaitForDecodedFrame(Number.NaN, 1, 4)).toBe(true);
});

test("export dimensions and severity report actual technical mismatches", () => {
  expect(hasExpectedOutputDimensions(1080, 1920, { width: 1080, height: 1920 })).toBe(true);
  expect(hasExpectedOutputDimensions(1920, 1080, { width: 1080, height: 1920 })).toBe(false);
  expect(hasExpectedOutputDimensions(0, 1080, { width: 1080, height: 1920 })).toBe(true);
  expect(hasExpectedOutputDimensions(1080, 1920, { width: 0, height: 1920 })).toBe(true);
  expect(getOutputQualitySeverity([], [])).toBe("ok");
  expect(getOutputQualitySeverity([1.2], [])).toBe("warning");
  expect(getOutputQualitySeverity([], [3.5])).toBe("warning");
  expect(getOutputQualitySeverity([], [], true, false)).toBe("warning");
  expect(getOutputQualitySeverity([], [], false, true)).toBe("warning");
});
