import { expect, test } from "@playwright/test";
import { getHighlightSampleLimit, getHighlightSampleTime, shouldUseQuickVideoCandidates } from "../src/video/highlight-finder";

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

test("spreads long-video samples through the final seconds of the source", () => {
  const first = getHighlightSampleTime(0, 24, 300);
  const last = getHighlightSampleTime(23, 24, 300);
  expect(first).toBeCloseTo(0.12, 2);
  expect(last).toBeCloseTo(299.92, 2);
  expect(last - first).toBeGreaterThan(299);
});

test("keeps sample timestamps finite and within the source duration", () => {
  expect(getHighlightSampleTime(-5, 4, 12)).toBeCloseTo(0.12, 2);
  expect(getHighlightSampleTime(99, 4, 12)).toBeCloseTo(11.92, 2);
  expect(getHighlightSampleTime(0, 0, 12)).toBe(6);
  expect(getHighlightSampleTime(0, 4, Number.NaN)).toBe(0);
});
