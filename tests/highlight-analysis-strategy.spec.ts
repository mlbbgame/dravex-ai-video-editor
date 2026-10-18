import { expect, test } from "@playwright/test";
import { shouldUseQuickVideoCandidates } from "../src/video/highlight-finder";

test("uses deterministic cuts only for very short clips", () => {
  expect(shouldUseQuickVideoCandidates(0.25)).toBe(true);
  expect(shouldUseQuickVideoCandidates(1.5)).toBe(true);
  expect(shouldUseQuickVideoCandidates(3)).toBe(true);
});

test("samples real frames for short-form clips longer than three seconds", () => {
  expect(shouldUseQuickVideoCandidates(3.01)).toBe(false);
  expect(shouldUseQuickVideoCandidates(8)).toBe(false);
  expect(shouldUseQuickVideoCandidates(15)).toBe(false);
});

test("does not classify invalid durations as quick-cut candidates", () => {
  expect(shouldUseQuickVideoCandidates(Number.NaN)).toBe(false);
  expect(shouldUseQuickVideoCandidates(Number.POSITIVE_INFINITY)).toBe(false);
  expect(shouldUseQuickVideoCandidates(0.1)).toBe(false);
  expect(shouldUseQuickVideoCandidates(-1)).toBe(false);
});
