import { expect, test } from "@playwright/test";
import { getRenderFrameInterval, getSafeImageDuration, getSourceFrameRect } from "../src/video/video-sequence-render";

test("photo durations stay finite and within safe render bounds", () => {
  expect(getSafeImageDuration()).toBe(3);
  expect(getSafeImageDuration(Number.NaN)).toBe(3);
  expect(getSafeImageDuration(Number.POSITIVE_INFINITY)).toBe(3);
  expect(getSafeImageDuration(Number.NEGATIVE_INFINITY)).toBe(3);
  expect(getSafeImageDuration(-10)).toBe(0.25);
  expect(getSafeImageDuration(0)).toBe(0.25);
  expect(getSafeImageDuration(12)).toBe(12);
  expect(getSafeImageDuration(300)).toBe(30);
});


test("contain framing keeps the complete source frame for gameplay and HUD-heavy video", () => {
  expect(getSourceFrameRect(1920, 1080, 1080, 1920, "contain")).toEqual({
    x: 0, y: 0, width: 1920, height: 1080,
  });
});

test("cover framing computes a centered crop for portrait output", () => {
  const crop = getSourceFrameRect(1920, 1080, 1080, 1920, "cover");
  expect(crop.x).toBeCloseTo(656.25, 2);
  expect(crop.y).toBe(0);
  expect(crop.width).toBeCloseTo(607.5, 2);
  expect(crop.height).toBe(1080);
});

test("cover framing crops vertical footage for landscape output", () => {
  const crop = getSourceFrameRect(1080, 1920, 1920, 1080, "cover");
  expect(crop.x).toBe(0);
  expect(crop.width).toBe(1080);
  expect(crop.height).toBeCloseTo(607.5, 2);
  expect(crop.y).toBeCloseTo(656.25, 2);
});

test("invalid framing dimensions fall back safely", () => {
  expect(getSourceFrameRect(0, 1080, 1080, 1920, "cover")).toEqual({
    x: 0, y: 0, width: 1, height: 1080,
  });
});

test("render loop frame pacing matches the recorder frame rate", () => {
  expect(getRenderFrameInterval(24)).toBeCloseTo(1000 / 24, 5);
  expect(getRenderFrameInterval(30)).toBeCloseTo(1000 / 30, 5);
  expect(getRenderFrameInterval(60)).toBeCloseTo(1000 / 60, 5);
  expect(getRenderFrameInterval(120)).toBeCloseTo(1000 / 60, 5);
  expect(getRenderFrameInterval(0)).toBeCloseTo(1000 / 24, 5);
  expect(getRenderFrameInterval(Number.NaN)).toBeCloseTo(1000 / 24, 5);
});
