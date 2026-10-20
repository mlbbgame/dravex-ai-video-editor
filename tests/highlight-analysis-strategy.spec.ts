import { expect, test } from "@playwright/test";
import { getHighlightSampleLimit, shouldUseQuickVideoCandidates } from "../src/video/highlight-finder";

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

test("increases long-video sampling while keeping mobile work bounded", () => {
  expect(getHighlightSampleLimit(15)).toBe(60);
  expect(getHighlightSampleLimit(30)).toBe(18);
  expect(getHighlightSampleLimit(90)).toBe(18);
  expect(getHighlightSampleLimit(120)).toBe(24);
  expect(getHighlightSampleLimit(300)).toBe(24);
});

test("uses a safe fallback sample limit for invalid durations", () => {
  expect(getHighlightSampleLimit(Number.NaN)).toBe(12);
  expect(getHighlightSampleLimit(Number.POSITIVE_INFINITY)).toBe(12);
  expect(getHighlightSampleLimit(0)).toBe(12);
});
