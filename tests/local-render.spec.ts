import { expect, test } from "@playwright/test";
import { getSafeRenderDuration } from "../src/video/local-render";

test("slideshow render duration defaults safely for missing and non-finite values", () => {
  expect(getSafeRenderDuration()).toBe(15);
  expect(getSafeRenderDuration(Number.NaN)).toBe(15);
  expect(getSafeRenderDuration(Number.POSITIVE_INFINITY)).toBe(15);
  expect(getSafeRenderDuration(Number.NEGATIVE_INFINITY)).toBe(15);
});

test("slideshow render duration clamps very short and long values", () => {
  expect(getSafeRenderDuration(0)).toBe(5);
  expect(getSafeRenderDuration(-100)).toBe(5);
  expect(getSafeRenderDuration(12.5)).toBe(12.5);
  expect(getSafeRenderDuration(900)).toBe(600);
});
