import { expect, test } from "@playwright/test";
import { getOutputQualitySeverity, isRenderedDurationWithinTolerance } from "../src/video/output-quality";

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
  expect(isRenderedDurationWithinTolerance(28.4, 30)).toBe(true);
  expect(isRenderedDurationWithinTolerance(27.9, 30)).toBe(false);
  expect(isRenderedDurationWithinTolerance(Number.NaN, 30)).toBe(false);
  expect(isRenderedDurationWithinTolerance(30, Number.POSITIVE_INFINITY)).toBe(false);
  expect(getOutputQualitySeverity([], [], true)).toBe("warning");
  expect(getOutputQualitySeverity([], [], false)).toBe("ok");
});
