import { expect, test } from "@playwright/test";
import {
  getHighlightSampleLimit,
  getHighlightSamplingInterval,
  getHighlightSampleTime,
  rankHighlightMomentsForStyle,
  scoreFrameQuality,
  buildHighlightVariants,
  type HighlightMoment,
} from "../src/video/highlight-finder";
import { selectDiverseHighlightMoments } from "../src/video/montage-selection";
import { buildDirectorEventTimeline } from "../src/video/director-event-timeline";
import { buildSmartEyeReport } from "../src/video/smart-eye";

function makeCandidates(duration: number): HighlightMoment[] {
  const result: HighlightMoment[] = [];
  for (let time = 0.8; time < duration; time += 0.8) {
    const motion = (Math.sin(time * 1.7) + 1) / 2;
    const contrast = (Math.cos(time * 0.9) + 1) / 2;
    const score = Math.max(0.05, Math.min(1, 0.45 + motion * 0.3 + contrast * 0.25));
    result.push({
      time,
      start: Math.max(0, time - 0.25),
      end: Math.min(duration, time + 0.25),
      score,
      motion,
      contrast,
    });
  }
  return result;
}

test("long-source sampling stays bounded while reaching both ends of the source", () => {
  const duration = 300;
  const limit = getHighlightSampleLimit(duration);
  expect(limit).toBeLessThanOrEqual(24);
  expect(limit).toBeGreaterThanOrEqual(2);
  expect(getHighlightSamplingInterval(duration, limit)).toBeGreaterThan(0);

  const times = Array.from({ length: limit }, (_, index) =>
    getHighlightSampleTime(index, limit, duration));
  expect(times[0]).toBeGreaterThanOrEqual(0);
  expect(times[0]).toBeLessThan(1);
  expect(times[times.length - 1]).toBeGreaterThan(duration - 1);
  expect(times.every((time, index) => index === 0 || time > times[index - 1])).toBe(true);
});

test("style ranking selects action peaks for velocity and visual quality for cinema", () => {
  const candidates: HighlightMoment[] = [
    { time: 2, start: 1.5, end: 2.5, score: 0.9, motion: 0.05, contrast: 0.9 },
    { time: 8, start: 7.5, end: 8.5, score: 0.5, motion: 0.95, contrast: 0.1 },
  ];
  expect(rankHighlightMomentsForStyle(candidates, "velocity")[0].time).toBe(8);
  expect(rankHighlightMomentsForStyle(candidates, "cinematic")[0].time).toBe(2);
  expect(rankHighlightMomentsForStyle(candidates, "story")[0].time).toBe(2);
});

test("all montage variants remain inside source bounds and avoid replaying the same rendered range", () => {
  const duration = 40;
  const variants = buildHighlightVariants(makeCandidates(duration), duration);
  expect(variants).toHaveLength(3);

  for (const variant of variants) {
    expect(variant.moments.length).toBeGreaterThan(0);
    for (const moment of variant.moments) {
      expect(moment.start).toBeGreaterThanOrEqual(0);
      expect(moment.end).toBeLessThanOrEqual(duration);
      expect(moment.end).toBeGreaterThan(moment.start);
    }
    const ordered = [...variant.moments].sort((a, b) => a.start - b.start);
    for (let index = 1; index < ordered.length; index += 1) {
      expect(ordered[index].start).toBeGreaterThanOrEqual(ordered[index - 1].end - 0.001);
    }
  }

  const signatures = variants.map((variant) => variant.moments.map((moment) => moment.time.toFixed(2)).join(","));
  expect(new Set(signatures).size).toBeGreaterThan(1);
});

test("Smart Eye carries timeline evidence through the cross-stage quality contract", () => {
  const duration = 30;
  const candidates = makeCandidates(duration);
  const events = buildDirectorEventTimeline(candidates.map((item) => ({
    ...item,
    actionCues: item.motion > 0.85 ? ["Пик движения"] : [],
  })), duration);

  const report = buildSmartEyeReport({
    duration,
    detectedLabels: ["car"],
    events,
    selectedStyle: "velocity",
    sampledFrameCount: 12,
    candidateCount: candidates.length,
    sampledFrameTimes: Array.from({ length: 12 }, (_, index) =>
      getHighlightSampleTime(index, 12, duration)),
  });

  expect(report.memory.some((entry) => entry.kind === "motion-peak")).toBe(true);
  expect(report.coverage.firstEventTime).not.toBeNull();
  expect(report.coverage.lastEventTime).not.toBeNull();
  expect(report.coverage.largestSampleGapSeconds).toBeLessThanOrEqual(duration / 2);
  expect(report.limitations.some((item) => item.includes("постоянное обучение"))).toBe(true);
});

test("five-minute sources produce bounded, distinct montage variants without overlapping source ranges", () => {
  const duration = 300;
  const variants = buildHighlightVariants(makeCandidates(duration), duration);
  expect(variants).toHaveLength(3);

  for (const variant of variants) {
    expect(variant.moments.length).toBeGreaterThan(0);
    for (const moment of variant.moments) {
      expect(Number.isFinite(moment.start)).toBe(true);
      expect(Number.isFinite(moment.end)).toBe(true);
      expect(moment.start).toBeGreaterThanOrEqual(0);
      expect(moment.end).toBeLessThanOrEqual(duration);
      expect(moment.end).toBeGreaterThan(moment.start);
    }
    const ordered = [...variant.moments].sort((a, b) => a.start - b.start);
    for (let index = 1; index < ordered.length; index += 1) {
      expect(ordered[index].start).toBeGreaterThanOrEqual(ordered[index - 1].end - 0.001);
    }
  }

  const signatures = variants.map((variant) => variant.moments.map((moment) => moment.time.toFixed(2)).join(","));
  expect(new Set(signatures).size).toBe(variants.length);
});

test("malformed highlight candidates cannot poison otherwise valid montage variants", () => {
  const valid: HighlightMoment = {
    time: 4,
    start: 3.5,
    end: 4.5,
    score: 0.8,
    motion: 0.6,
    contrast: 0.7,
  };
  const malformed = [
    { ...valid, time: Number.NaN },
    { ...valid, start: Number.POSITIVE_INFINITY },
    { ...valid, end: Number.NaN },
    { ...valid, score: Number.NaN },
    { ...valid, motion: Number.POSITIVE_INFINITY },
    { ...valid, contrast: Number.NaN },
    { ...valid, start: 5, end: 4 },
  ] as HighlightMoment[];

  const variants = buildHighlightVariants([...malformed, valid], 12);
  expect(variants).toHaveLength(3);
  for (const variant of variants) {
    expect(variant.moments.length).toBeGreaterThan(0);
    for (const moment of variant.moments) {
      expect(Number.isFinite(moment.time)).toBe(true);
      expect(Number.isFinite(moment.start)).toBe(true);
      expect(Number.isFinite(moment.end)).toBe(true);
      expect(Number.isFinite(moment.score)).toBe(true);
      expect(moment.start).toBeGreaterThanOrEqual(0);
      expect(moment.end).toBeLessThanOrEqual(12);
      expect(moment.end).toBeGreaterThan(moment.start);
    }
  }
});

import { selectDiverseHighlightMoments } from "../src/video/montage-selection";

test("diverse selector keeps valid source ranges chronological and non-overlapping", () => {
  const duration = 24;
  const candidates: HighlightMoment[] = [];
  for (let time = 0.5; time < duration; time += 0.5) {
    const motion = time > 10 && time < 15 ? 0.98 : 0.25;
    candidates.push({
      time,
      start: Math.max(0, time - 0.2),
      end: Math.min(duration, time + 0.2),
      score: motion,
      motion,
      contrast: 0.5,
    });
  }
  // Bad timestamps/ranges should be ignored instead of contaminating the output.
  candidates.push(
    { time: Number.NaN, start: 1, end: 2, score: 1, motion: 1, contrast: 1 },
    { time: 23, start: 22, end: 25, score: 1, motion: 1, contrast: 1 },
  );

  const selected = selectDiverseHighlightMoments(candidates, 8, duration, "velocity", 1.2);
  expect(selected.length).toBeGreaterThan(0);
  expect(selected.length).toBeLessThanOrEqual(8);
  expect(selected.every((item) =>
    Number.isFinite(item.time) &&
    item.start >= 0 &&
    item.end <= duration &&
    item.start <= item.time &&
    item.time <= item.end
  )).toBe(true);

  for (let index = 1; index < selected.length; index += 1) {
    expect(selected[index].time).toBeGreaterThan(selected[index - 1].time);
    expect(selected[index].start).toBeGreaterThanOrEqual(selected[index - 1].end + 0.079);
    expect(Math.abs(selected[index].time - selected[index - 1].time)).toBeGreaterThanOrEqual(1.2);
  }
});

test("diverse selector returns no cuts for invalid duration or an unusable candidate set", () => {
  const candidate: HighlightMoment = {
    time: 1, start: 0.5, end: 1.5, score: 0.8, motion: 0.4, contrast: 0.6,
  };
  expect(selectDiverseHighlightMoments([candidate], 4, 0, "cinematic")).toEqual([]);
  expect(selectDiverseHighlightMoments([], 4, 10, "cinematic")).toEqual([]);
  expect(selectDiverseHighlightMoments([
    { ...candidate, time: 8, start: 0.5, end: 1.5 },
  ], 4, 10, "cinematic")).toEqual([]);
});


test("style ranking favours motion for velocity and calmer moments for story", () => {
  const candidates: HighlightMoment[] = [
    { time: 2, start: 1.5, end: 2.5, score: 0.5, motion: 0.95, contrast: 0.5 },
    { time: 7, start: 6.5, end: 7.5, score: 0.5, motion: 0.1, contrast: 0.5 },
  ];

  const velocity = rankHighlightMomentsForStyle(candidates, "velocity");
  const story = rankHighlightMomentsForStyle(candidates, "story");

  expect(velocity[0].time).toBe(2);
  expect(story[0].time).toBe(7);
  // Ranking must not mutate the original candidate order.
  expect(candidates.map((item) => item.time)).toEqual([2, 7]);
});


test("frame quality scoring stays bounded and ignores malformed feature values", () => {
  const best = scoreFrameQuality({
    motion: 1, contrast: 1, saturation: 1, brightness: 0.48, detail: 1,
  });
  const worst = scoreFrameQuality({
    motion: 0, contrast: 0, saturation: 0, brightness: 0, detail: 0,
  });
  const malformed = scoreFrameQuality({
    motion: Number.NaN, contrast: Number.POSITIVE_INFINITY,
    saturation: -10, brightness: Number.NaN, detail: 10,
  });

  expect(best).toBeGreaterThan(worst);
  expect(best).toBeLessThanOrEqual(1);
  expect(best).toBeGreaterThanOrEqual(0);
  expect(worst).toBeGreaterThanOrEqual(0);
  expect(worst).toBeLessThanOrEqual(1);
  expect(Number.isFinite(malformed)).toBe(true);
  expect(malformed).toBeGreaterThanOrEqual(0);
  expect(malformed).toBeLessThanOrEqual(1);
});


test("diverse selection preserves broad timeline coverage when early moments score highest", () => {
  const candidates: HighlightMoment[] = Array.from({ length: 20 }, (_, index) => {
    const time = 0.5 + index;
    return {
      time,
      start: time - 0.2,
      end: time + 0.2,
      score: index < 6 ? 1 : 0.55,
      motion: index < 6 ? 1 : 0.4,
      contrast: 0.5,
    };
  });

  const selected = selectDiverseHighlightMoments(candidates, 6, 21, "velocity");
  expect(selected.length).toBe(6);
  expect(selected.map((item) => item.time)).toEqual(
    [...selected].map((item) => item.time).sort((a, b) => a - b),
  );
  expect(selected[0].time).toBeLessThan(4);
  expect(selected[selected.length - 1].time).toBeGreaterThan(15);
  expect(new Set(selected.map((item) => Math.floor(item.time / 5))).size).toBeGreaterThanOrEqual(4);
});
