import { expect, test } from "@playwright/test";
import {
  buildHighlightVariants,
  getHighlightSampleLimit,
  getHighlightSamplingInterval,
} from "../src/video/highlight-finder";

test("short action clips use denser samples to locate brief highlights", () => {
  expect(getHighlightSampleLimit(25)).toBe(60);
  expect(getHighlightSamplingInterval(25, 60)).toBe(1);
  expect(Math.ceil(25 / getHighlightSamplingInterval(25, 60))).toBe(25);
});

test("medium clips retain a bounded mobile sampling interval", () => {
  expect(getHighlightSamplingInterval(30, 18)).toBe(1.5);
  expect(getHighlightSamplingInterval(90, 18)).toBe(1.5);
});

test("long clips distribute the bounded samples over the full source", () => {
  expect(getHighlightSampleLimit(300)).toBe(24);
  expect(getHighlightSamplingInterval(300, 24)).toBe(12.5);
});

test("invalid sampling inputs fall back safely", () => {
  expect(getHighlightSamplingInterval(Number.NaN, 18)).toBe(2);
  expect(getHighlightSamplingInterval(25, 1)).toBe(2);
  expect(getHighlightSamplingInterval(0, 18)).toBe(2);
});

test("director variants stay inside the source and avoid repeated overlapping footage", () => {
  const candidates = Array.from({ length: 16 }, (_, index) => {
    const time = 1 + index * 1.2;
    return {
      time,
      start: time - 0.35,
      end: time + 0.35,
      score: ((index * 7) % 16) / 15,
      motion: ((index * 5) % 16) / 15,
      contrast: ((index * 11) % 16) / 15,
    };
  });
  const variants = buildHighlightVariants(candidates, 22);

  expect(variants).toHaveLength(3);
  for (const variant of variants) {
    expect(variant.moments.length).toBeGreaterThan(0);
    for (const moment of variant.moments) {
      expect(moment.start).toBeGreaterThanOrEqual(0);
      expect(moment.end).toBeLessThanOrEqual(22);
      expect(moment.end).toBeGreaterThan(moment.start);
    }
    for (let index = 1; index < variant.moments.length; index += 1) {
      expect(variant.moments[index].start).toBeGreaterThanOrEqual(
        variant.moments[index - 1].end,
      );
    }
  }
});

test("director variants use distinct pacing targets", () => {
  const candidates = Array.from({ length: 20 }, (_, index) => {
    const time = 0.8 + index * 1.05;
    return {
      time,
      start: Math.max(0, time - 0.3),
      end: Math.min(24, time + 0.3),
      score: ((index * 7) % 20) / 19,
      motion: ((index * 3) % 20) / 19,
      contrast: ((index * 11) % 20) / 19,
    };
  });
  const variants = buildHighlightVariants(candidates, 24);
  const shotLengths = new Set(variants.map((variant) => variant.shotLength));
  const momentCounts = new Set(variants.map((variant) => variant.moments.length));

  expect(shotLengths.size).toBeGreaterThan(1);
  expect(momentCounts.size).toBeGreaterThan(1);
});
