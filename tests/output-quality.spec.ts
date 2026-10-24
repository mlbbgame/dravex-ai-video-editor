import { expect, test } from "@playwright/test";
import { assertNonEmptyRenderedBlob, getInspectionSampleInterval, getOutputInspectionTimes, getOutputQualitySeverity, hasExpectedOutputDimensions, hasReachedMediaReadyState, isRenderedDurationWithinTolerance, shouldCompareFrameSamples, shouldWaitForDecodedFrame } from "../src/video/output-quality";

test("export quality is OK when no suspicious frames are detected", () => {
  expect(getOutputQualitySeverity([], [])).toBe("ok");
});

test("export quality warns for black frames or nearly frozen frame pairs", () => {
  expect(getOutputQualitySeverity([1.5], [])).toBe("warning");
  expect(getOutputQualitySeverity([], [4.5])).toBe("warning");
  expect(getOutputQualitySeverity([1.5], [4.5])).toBe("warning");
});

test("export quality warns when rendered duration materially differs from requested duration", () => {
  expect(isRenderedDurationWithinTolerance(30.5, 30)).toBe(true);
  expect(isRenderedDurationWithinTolerance(31.6, 30)).toBe(false);
  expect(isRenderedDurationWithinTolerance(28.6, 30)).toBe(true);
  expect(isRenderedDurationWithinTolerance(28.4, 30)).toBe(false);
  expect(isRenderedDurationWithinTolerance(Number.NaN, 30)).toBe(false);
  expect(isRenderedDurationWithinTolerance(30, Number.POSITIVE_INFINITY)).toBe(false);
  expect(isRenderedDurationWithinTolerance(30, 30, Number.NaN)).toBe(true);
  expect(isRenderedDurationWithinTolerance(30, 30, Number.POSITIVE_INFINITY)).toBe(true);
  expect(isRenderedDurationWithinTolerance(30, 30, -5)).toBe(true);
  expect(isRenderedDurationWithinTolerance(31, 30, -5)).toBe(true);
  expect(isRenderedDurationWithinTolerance(32, 30, -5)).toBe(false);
  expect(getOutputQualitySeverity([], [], true)).toBe("warning");
  expect(getOutputQualitySeverity([], [], false)).toBe("ok");
  expect(getOutputQualitySeverity([], [], false, true)).toBe("warning");
  expect(getOutputQualitySeverity([], [], false, false)).toBe("ok");
});

test("duration tolerance uses the greater of the explicit tolerance and five percent", () => {
  // Short exports retain a practical minimum tolerance for browser metadata rounding.
  expect(isRenderedDurationWithinTolerance(4.7, 5)).toBe(true);
  expect(isRenderedDurationWithinTolerance(4.2, 5)).toBe(false);
  // Long exports use a proportional tolerance instead of a fixed sub-second window.
  expect(isRenderedDurationWithinTolerance(102, 100)).toBe(true);
  expect(isRenderedDurationWithinTolerance(106, 100)).toBe(false);
});

test("invalid duration tolerances fall back to the conservative default", () => {
  // A 5-second clip uses the 0.75-second default because the 5% floor is only 0.25s.
  expect(isRenderedDurationWithinTolerance(5.7, 5, Number.NaN)).toBe(true);
  expect(isRenderedDurationWithinTolerance(5.76, 5, Number.NaN)).toBe(false);
  expect(isRenderedDurationWithinTolerance(4.3, 5, Number.POSITIVE_INFINITY)).toBe(true);
  expect(isRenderedDurationWithinTolerance(4.24, 5, -1)).toBe(false);
});

test("duration tolerance is inclusive at its exact proportional boundary", () => {
  // For a 30-second clip, the 5% floor (1.5s) is larger than the explicit 0.75s tolerance.
  expect(isRenderedDurationWithinTolerance(31.5, 30, 0.75)).toBe(true);
  expect(isRenderedDurationWithinTolerance(28.5, 30, 0.75)).toBe(true);
  expect(isRenderedDurationWithinTolerance(31.501, 30, 0.75)).toBe(false);
  expect(isRenderedDurationWithinTolerance(28.499, 30, 0.75)).toBe(false);
});


test("empty export blobs fail immediately with an actionable error", () => {
  expect(() => assertNonEmptyRenderedBlob({ size: 0 })).toThrow(/пустой файл/i);
  expect(() => assertNonEmptyRenderedBlob({ size: -1 })).toThrow(/пустой файл/i);
  expect(() => assertNonEmptyRenderedBlob({ size: Number.NaN })).toThrow(/пустой файл/i);
  expect(() => assertNonEmptyRenderedBlob({ size: Number.POSITIVE_INFINITY })).toThrow(/пустой файл/i);
  expect(() => assertNonEmptyRenderedBlob({ size: Number.NEGATIVE_INFINITY })).toThrow(/пустой файл/i);
  expect(() => assertNonEmptyRenderedBlob({ size: 1 })).not.toThrow();
});


test("quality inspection waits when the requested timestamp matches an undecoded frame", () => {
  expect(shouldWaitForDecodedFrame(0, 0.01, 0)).toBe(true);
  expect(shouldWaitForDecodedFrame(1, 1.01, 1)).toBe(true);
  expect(shouldWaitForDecodedFrame(1, 1.01, 2)).toBe(false);
  expect(shouldWaitForDecodedFrame(1, 2, 0)).toBe(false);
  expect(shouldWaitForDecodedFrame(Number.NaN, 1, 2)).toBe(true);
});


test("inspection freeze checks use actual sample spacing, including boundary durations", () => {
  expect(getInspectionSampleInterval(1.49, 3)).toBeCloseTo(0.745, 6);
  expect(shouldCompareFrameSamples(getInspectionSampleInterval(1.49, 3))).toBe(true);
  expect(getInspectionSampleInterval(30, 9)).toBeCloseTo(3.75, 6);
  expect(getInspectionSampleInterval(30, 1)).toBe(0);
  expect(getInspectionSampleInterval(Number.NaN, 9)).toBe(0);
  expect(getInspectionSampleInterval(30, 0)).toBe(0);
});

test("quality inspection only compares frames far enough apart to avoid short-clip false positives", () => {
  expect(shouldCompareFrameSamples(0)).toBe(false);
  expect(shouldCompareFrameSamples(0.49)).toBe(false);
  expect(shouldCompareFrameSamples(0.5)).toBe(true);
  expect(shouldCompareFrameSamples(1)).toBe(true);
  expect(shouldCompareFrameSamples(Number.NaN)).toBe(false);
  expect(shouldCompareFrameSamples(Number.POSITIVE_INFINITY)).toBe(false);
  expect(shouldCompareFrameSamples(-1)).toBe(false);
});


test("media readiness checks handle metadata and decoded-frame states without missed-event waits", () => {
  expect(hasReachedMediaReadyState("loadedmetadata", 0)).toBe(false);
  expect(hasReachedMediaReadyState("loadedmetadata", 1)).toBe(true);
  expect(hasReachedMediaReadyState("loadedmetadata", 4)).toBe(true);
  expect(hasReachedMediaReadyState("loadeddata", 1)).toBe(false);
  expect(hasReachedMediaReadyState("loadeddata", 2)).toBe(true);
  expect(hasReachedMediaReadyState("loadeddata", 4)).toBe(true);
  expect(hasReachedMediaReadyState("canplay", 4)).toBe(false);
  expect(hasReachedMediaReadyState("loadeddata", Number.NaN)).toBe(false);
  expect(hasReachedMediaReadyState("loadeddata", Number.POSITIVE_INFINITY)).toBe(false);
});

test("inspection samples include clip boundaries", () => { const times = getOutputInspectionTimes(30, 5); expect(times[0]).toBeCloseTo(0.04); expect(times[times.length - 1]).toBeCloseTo(29.92); });

test("inspection sample points stay finite, ordered, inside the clip, and bounded on short and long exports", () => {
  for (const duration of [0.1, 0.25, 1, 9, 60, 300]) {
    const times = getOutputInspectionTimes(duration, 9);
    expect(times.length).toBe(9);
    expect(times.every((time) => Number.isFinite(time) && time >= 0 && time < duration)).toBe(true);
    expect(times.every((time, index) => index === 0 || time >= times[index - 1])).toBe(true);
  }

  // The inspector must cap work even if a caller requests an unreasonable sample count.
  expect(getOutputInspectionTimes(120, 1000)).toHaveLength(9);
  expect(getOutputInspectionTimes(120, 0)).toEqual([]);
  expect(getOutputInspectionTimes(Number.NaN, 5)).toEqual([]);
  expect(getOutputInspectionTimes(Number.POSITIVE_INFINITY, 5)).toEqual([]);
});

test("one-point inspection remains safe for the shortest accepted export", () => {
  const times = getOutputInspectionTimes(0.1, 1);
  expect(times).toHaveLength(1);
  expect(Number.isFinite(times[0])).toBe(true);
  expect(times[0]).toBeGreaterThanOrEqual(0);
  expect(times[0]).toBeLessThan(0.1);
});

test("export quality reports dimension mismatches without blocking otherwise valid clips", () => {
  expect(getOutputQualitySeverity([], [], false, true)).toBe("warning");
  expect(getOutputQualitySeverity([], [], false, false)).toBe("ok");
});

test("inspection sample count remains bounded and increases with long exports", () => {
  const short = getOutputInspectionTimes(2, 3);
  const medium = getOutputInspectionTimes(30, 9);
  const long = getOutputInspectionTimes(300, 9);
  expect(short).toHaveLength(3);
  expect(medium).toHaveLength(9);
  expect(long).toHaveLength(9);
  expect(short[0]).toBeGreaterThanOrEqual(0);
  expect(short[short.length - 1]).toBeLessThan(2);
  expect(medium[medium.length - 1]).toBeLessThan(30);
  expect(long[long.length - 1]).toBeLessThan(300);
});

test("duration checks reject invalid expected and actual values instead of silently passing", () => {
  for (const actual of [0, -1, Number.NaN, Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY]) {
    expect(isRenderedDurationWithinTolerance(actual, 10)).toBe(false);
  }
  for (const expected of [0, -1, Number.NaN, Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY]) {
    expect(isRenderedDurationWithinTolerance(10, expected)).toBe(false);
  }
});

test("output dimension validation ignores invalid expectations but detects real profile mismatches", () => {
  expect(hasExpectedOutputDimensions(1080, 1920, { width: 1080, height: 1920 })).toBe(true);
  expect(hasExpectedOutputDimensions(720, 1280, { width: 1080, height: 1920 })).toBe(false);
  expect(hasExpectedOutputDimensions(0, 1280, { width: 1080, height: 1920 })).toBe(true);
  expect(hasExpectedOutputDimensions(1080, Number.POSITIVE_INFINITY, { width: 1080, height: 1920 })).toBe(true);
  expect(hasExpectedOutputDimensions(1080, 1920, { width: Number.NaN, height: 1920 })).toBe(true);
  expect(hasExpectedOutputDimensions(1080, 1920, { width: 1080, height: 0 })).toBe(true);
  expect(hasExpectedOutputDimensions(1080, 1920)).toBe(true);
});
