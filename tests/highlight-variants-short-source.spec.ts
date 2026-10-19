import { expect, test } from "@playwright/test";
import { buildHighlightVariants, type HighlightMoment } from "../src/video/highlight-finder";

test("very short source clips remain valid and never exceed the original duration", () => {
  const duration = 1.2;
  const candidates: HighlightMoment[] = [{
    time: 0.6,
    start: 0,
    end: duration,
    score: 0.7,
    motion: 0.4,
    contrast: 0.6,
  }];
  const variants = buildHighlightVariants(candidates, duration);

  expect(variants).toHaveLength(3);
  for (const variant of variants) {
    expect(variant.moments).toHaveLength(1);
    expect(variant.moments[0].start).toBe(0);
    expect(variant.moments[0].end).toBeCloseTo(duration);
    expect(variant.duration).toBeCloseTo(duration);
  }
});
