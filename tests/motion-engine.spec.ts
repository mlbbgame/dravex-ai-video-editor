import { expect, test } from "@playwright/test";
import { getColorGradeFilter, getSpeedRampRate } from "../src/video/motion-engine";

test("speed-ramp profiles stay within safe browser playback limits", () => {
  const styles = ["velocity", "anime", "cinematic", "glitch", "story"] as const;
  for (const style of styles) {
    for (let step = 0; step <= 100; step += 1) {
      const rate = getSpeedRampRate(style, step / 100, 0);
      expect(rate).toBeGreaterThanOrEqual(0.45);
      expect(rate).toBeLessThanOrEqual(1.85);
      expect(Number.isFinite(rate)).toBe(true);
    }
  }
});

test("velocity and anime profiles include both slow and fast phases", () => {
  for (const style of ["velocity", "anime", "glitch"] as const) {
    const rates = Array.from({ length: 101 }, (_, step) => getSpeedRampRate(style, step / 100));
    expect(Math.min(...rates)).toBeLessThan(0.8);
    expect(Math.max(...rates)).toBeGreaterThan(1.2);
  }
});

test("alternating cuts reverse the ramp direction without invalid rates", () => {
  expect(getSpeedRampRate("velocity", 0, 0)).toBeCloseTo(getSpeedRampRate("velocity", 1, 1), 5);
  expect(getSpeedRampRate("velocity", 1, 0)).toBeCloseTo(getSpeedRampRate("velocity", 0, 1), 5);
});

test("color grade returns stable canvas filter values for each style and strength", () => {
  for (const style of ["velocity", "anime", "cinematic", "glitch", "story"] as const) {
    for (const strength of ["soft", "balanced", "strong"] as const) {
      const filter = getColorGradeFilter(style, strength);
      expect(filter).toContain("contrast(");
      expect(filter).toContain("saturate(");
      expect(filter).toContain("brightness(");
      expect(filter).toContain("NaN").toBe(false);
    }
  }
});
