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
import { getDirectorClipTreatment, inferTrackedObjectCues, type DetectedObject, type DirectedMoment } from "../src/video/ai-director";

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

test("tracked object cues require nearby, ordered observations from the actual analyzed samples", () => {
  const previous: DetectedObject[] = [{
    label: "car",
    score: 0.9,
    box: { xmin: 80, ymin: 50, xmax: 140, ymax: 100 },
  }];
  const current: DetectedObject[] = [{
    label: "car",
    score: 0.92,
    box: { xmin: 110, ymin: 50, xmax: 180, ymax: 110 },
  }];

  // Nearby analyzed frames can support motion/approach cues.
  expect(inferTrackedObjectCues(previous, current, 4, 5)).not.toHaveLength(0);
  // A timestamp accidentally taken from a different, much earlier candidate
  // must not make detections appear temporally adjacent.
  expect(inferTrackedObjectCues(previous, current, 1, 5)).toEqual([]);
  expect(inferTrackedObjectCues(previous, current, 5, 4)).toEqual([]);
  expect(inferTrackedObjectCues(previous, current, Number.NaN, 5)).toEqual([]);
});


test("AI Director adapts transition timing and effects to evidence instead of repeating one preset", () => {
  const base: DirectedMoment = {
    time: 2,
    start: 1.5,
    end: 2.5,
    score: 0.5,
    motion: 0.03,
    contrast: 0.2,
    sceneLabels: ["car"],
    actionCues: ["Стабильный кадр"],
    directorScore: 0.5,
  };
  const action: DirectedMoment = {
    ...base,
    time: 5,
    start: 4.5,
    end: 5.5,
    score: 0.9,
    motion: 0.2,
    actionCues: ["Пик движения", "Объект перемещается по кадру"],
    directorScore: 0.9,
  };
  const stableTreatment = getDirectorClipTreatment(base, "velocity");
  const actionTreatment = getDirectorClipTreatment(action, "velocity");
  expect(actionTreatment.transitionOutSeconds).toBeLessThan(stableTreatment.transitionOutSeconds);
  expect(actionTreatment.effects).toContain("flash");
  expect(actionTreatment.effects).toContain("speed-lines");
  expect(stableTreatment.effects).not.toContain("flash");

  const cinemaStable = getDirectorClipTreatment(base, "cinematic");
  const cinemaAction = getDirectorClipTreatment(action, "cinematic");
  expect(cinemaStable.transitionOutSeconds).toBeGreaterThan(cinemaAction.transitionOutSeconds);
  expect(cinemaStable.effects).toContain("letterbox");
  expect(cinemaStable.effects).not.toContain("flash");
});

test("AI Director treatment safely handles missing or malformed cue data", () => {
  const malformed = {
    score: Number.NaN,
    motion: Number.POSITIVE_INFINITY,
    actionCues: null,
  } as unknown as Pick<DirectedMoment, "score" | "motion" | "actionCues">;
  const treatment = getDirectorClipTreatment(malformed, "glitch");
  expect(Number.isFinite(treatment.transitionOutSeconds)).toBe(true);
  expect(treatment.transitionOutSeconds).toBeGreaterThan(0);
  expect(treatment.effects).toEqual(["chromatic-shift", "vignette"]);
});
