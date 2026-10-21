import { expect, test } from "@playwright/test";
import { getHighlightSampleLimit, getHighlightSamplingInterval } from "../src/video/highlight-finder";

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
