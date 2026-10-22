import { expect, test } from "@playwright/test";
import {
  getHighlightSampleLimit,
  getHighlightSamplingInterval,
  getHighlightSampleTime,
  rankHighlightMomentsForStyle,
  buildHighlightVariants,
  type HighlightMoment,
} from "../src/video/highlight-finder";
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


test("Smart Eye coverage uses only valid sampled timestamps and includes source boundaries", () => {
  const report = buildSmartEyeReport({
    duration: 20,
    detectedLabels: ["car"],
    events: [],
    selectedStyle: "velocity",
    sampledFrameCount: 4,
    candidateCount: 8,
    sampledFrameTimes: [-1, 0, 2, 2, 8, 19, 20, 21, Number.NaN] as number[],
  });

  expect(report.coverage.sampledFrameCount).toBe(4);
  expect(report.coverage.candidateCount).toBe(8);
  expect(report.coverage.sampledFrameRatio).toBe(0.5);
  // Invalid/out-of-range values are ignored, duplicate timestamps are deduplicated,
  // and the report exposes the unobserved tail/head as gaps instead of implying full coverage.
  expect(report.coverage.largestSampleGapSeconds).toBe(12);
  expect(report.coverage.firstEventTime).toBeNull();
  expect(report.coverage.lastEventTime).toBeNull();
});

test("Smart Eye sanitizes frame observations and bounds cue evidence", () => {
  const report = buildSmartEyeReport({
    duration: 10,
    detectedLabels: [" CAR ", "car", 17, "" as unknown as string],
    events: [{
      kind: "motion-peak",
      evidenceLevel: "visual-heuristic",
      label: "peak",
      confidence: 4,
      sourceTime: 5,
      start: 4,
      end: 6,
      evidence: [" cue ", " cue ", 17 as unknown as string, ...Array.from({ length: 20 }, (_, i) => "e" + i)],
    }],
    observations: [
      { time: 4, sceneLabels: ["Car", " CAR ", 17 as unknown as string], actionCues: Array.from({ length: 20 }, (_, i) => "cue" + i), score: 0.8 },
      { time: 11, sceneLabels: ["dog"], actionCues: ["out of bounds"], score: 1 },
      { time: Number.NaN, sceneLabels: ["cat"], actionCues: ["bad timestamp"], score: 1 },
    ],
    selectedStyle: "velocity",
    sampledFrameCount: 2,
    candidateCount: 2,
    sampledFrameTimes: [4, 11, Number.NaN],
  });

  expect(report.detectedEntities).toEqual(["car"]);
  expect(report.sceneCategory).toBe("vehicles");
  expect(report.memory.some((entry) => entry.time === 11 || entry.time === null && entry.label === "dog")).toBe(false);
  const frameEntry = report.memory.find((entry) => entry.kind === "frame-observation");
  expect(frameEntry?.evidence).toHaveLength(12);
  expect(new Set(frameEntry?.evidence).size).toBe(12);
  const eventEntry = report.memory.find((entry) => entry.kind === "motion-peak");
  expect(eventEntry?.confidence).toBe(1);
  expect(eventEntry?.evidence.length).toBeLessThanOrEqual(12);
  expect(eventEntry?.evidence.every((item) => typeof item === "string")).toBe(true);
});
