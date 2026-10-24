import { expect, test } from "@playwright/test";
import { getOutputQualitySeverity, hasReachedMediaReadyState } from "../src/video/output-quality";

test("export quality is OK when no suspicious frames are detected", () => {
  expect(getOutputQualitySeverity([], [])).toBe("ok");
});

test("export quality warns for black frames or nearly frozen frame pairs", () => {
  expect(getOutputQualitySeverity([1.5], [])).toBe("warning");
  expect(getOutputQualitySeverity([], [4.5])).toBe("warning");
  expect(getOutputQualitySeverity([1.5], [4.5])).toBe("warning");
});


test("media inspection recognizes already-ready media without waiting for another event", () => {
  expect(hasReachedMediaReadyState("loadedmetadata", 1)).toBe(true);
  expect(hasReachedMediaReadyState("loadedmetadata", 0)).toBe(false);
  expect(hasReachedMediaReadyState("loadeddata", 2)).toBe(true);
  expect(hasReachedMediaReadyState("loadeddata", 1)).toBe(false);
  expect(hasReachedMediaReadyState("seeked", 4)).toBe(false);
  expect(hasReachedMediaReadyState("loadeddata", Number.NaN)).toBe(false);
});
