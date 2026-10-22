import { expect, test } from "@playwright/test";
import { assertNonEmptyRenderedBlob, getOutputQualitySeverity, isRenderedDurationWithinTolerance, shouldCompareFrameSamples, shouldWaitForDecodedFrame } from "../src/video/output-quality";

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

test("duration tolerance is inclusive at its exact boundary", () => {
  expect(isRenderedDurationWithinTolerance(30.75, 30, 0.75)).toBe(true);
  expect(isRenderedDurationWithinTolerance(29.25, 30, 0.75)).toBe(true);
  expect(isRenderedDurationWithinTolerance(30.751, 30, 0.75)).toBe(false);
  expect(isRenderedDurationWithinTolerance(29.249, 30, 0.75)).toBe(false);
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


test("quality inspection only compares frames far enough apart to avoid short-clip false positives", () => {
  expect(shouldCompareFrameSamples(0)).toBe(false);
  expect(shouldCompareFrameSamples(0.49)).toBe(false);
  expect(shouldCompareFrameSamples(0.5)).toBe(true);
  expect(shouldCompareFrameSamples(1)).toBe(true);
  expect(shouldCompareFrameSamples(Number.NaN)).toBe(false);
  expect(shouldCompareFrameSamples(Number.POSITIVE_INFINITY)).toBe(false);
  expect(shouldCompareFrameSamples(-1)).toBe(false);
});
