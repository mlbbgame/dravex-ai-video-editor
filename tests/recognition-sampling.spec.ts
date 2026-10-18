import { expect, test } from "@playwright/test";
import { buildCoarseSampleTimes, buildDenseSampleTimes } from "../src/video/recognition-sampling";

test("coarse recognition samples span the complete source timeline", () => {
  for (const duration of [0.25, 9, 60, 1800, 7200, 18000]) {
    const times = buildCoarseSampleTimes(duration);
    expect(times.length).toBeGreaterThanOrEqual(2);
    expect(times.length).toBeLessThanOrEqual(60);
    expect(times[0]).toBe(0);
    expect(times[times.length - 1]).toBe(duration);
    expect(times.every((time, index) => time >= 0 && time <= duration && (index === 0 || time > times[index - 1]))).toBe(true);
  }
});

test("coarse recognition handles invalid input and tiny sample limits", () => {
  expect(buildCoarseSampleTimes(Number.NaN)).toEqual([]);
  expect(buildCoarseSampleTimes(-1)).toEqual([]);
  expect(buildCoarseSampleTimes(12, 1)).toEqual([0]);
});

test("dense recognition samples stay in bounds and focus around candidate events", () => {
  const times = buildDenseSampleTimes(20, [{ start: 10, end: 11 }], 0.25);
  expect(times[0]).toBe(10);
  expect(times[times.length - 1]).toBe(11);
  expect(times).toContain(10.5);
  expect(times.every((time, index) => time >= 0 && time <= 20 && (index === 0 || time > times[index - 1]))).toBe(true);
});

test("dense recognition clamps windows and caps work", () => {
  const times = buildDenseSampleTimes(10, [{ start: -5, end: 20 }], 0.1, 5);
  expect(times).toHaveLength(5);
  expect(times.every((time) => time >= 0 && time <= 10)).toBe(true);
  expect(buildDenseSampleTimes(10, [{ start: 8, end: 2 }])).toEqual([]);
});
