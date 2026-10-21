import { expect, test } from "@playwright/test";
import { buildDirectorEventTimeline } from "../src/video/director-event-timeline";

test("timeline creates timestamped events from explicit visual cues", () => {
  const timeline = buildDirectorEventTimeline([
    {
      time: 4.2, start: 3.8, end: 4.6, score: 0.9, motion: 0.3, contrast: 0.2,
      actionCues: ["Пик движения", "Объект приближается"],
    },
    {
      time: 8.1, start: 7.7, end: 8.5, score: 0.6, motion: 0.1, contrast: 0.1,
      actionCues: ["Вероятная смена сцены"],
    },
  ], 12);

  expect(timeline.map((event) => event.kind)).toEqual([
    "visual-highlight", "motion-peak", "subject-approaching", "scene-change",
  ]);
  expect(timeline[1].sourceTime).toBe(4.2);
  expect(timeline.every((event) => event.start >= 0 && event.end <= 12)).toBe(true);
  expect(timeline.every((event) => event.confidence >= 0 && event.confidence <= 1)).toBe(true);
});

test("timeline deduplicates nearby same-kind events while preserving evidence range", () => {
  const timeline = buildDirectorEventTimeline([
    { time: 2, start: 1.8, end: 2.2, score: 0.7, motion: 0.2, contrast: 0.1, actionCues: ["Пик движения"] },
    { time: 2.4, start: 2.2, end: 2.6, score: 0.9, motion: 0.3, contrast: 0.2, actionCues: ["Пик движения"] },
  ], 5, 0.5);

  expect(timeline).toHaveLength(1);
  expect(timeline[0].start).toBe(1.8);
  expect(timeline[0].end).toBe(2.6);
  expect(timeline[0].confidence).toBeGreaterThan(0);
});

test("timeline clamps intervals to source duration and ignores invalid timestamps", () => {
  const timeline = buildDirectorEventTimeline([
    { time: 10, start: 9, end: 12, score: 0.8, motion: 0.1, contrast: 0.1, actionCues: ["Пик движения"] },
    { time: Number.NaN, start: 1, end: 2, score: 1, motion: 1, contrast: 1, actionCues: ["Пик движения"] },
  ], 10);

  expect(timeline).toHaveLength(2);
  expect(timeline.every((event) => event.start >= 0 && event.end <= 10)).toBe(true);
  expect(timeline.some((event) => event.sourceTime === 10 && event.end === 10)).toBe(true);
});

test("timeline returns empty output for invalid duration and does not invent semantic actions", () => {
  expect(buildDirectorEventTimeline([], 10)).toEqual([]);
  expect(buildDirectorEventTimeline([{ time: 1, start: 0, end: 2, score: 0.4, motion: 0.8, contrast: 0.2 }], 0)).toEqual([]);
  const timeline = buildDirectorEventTimeline([
    { time: 1, start: 0.5, end: 1.5, score: 0.9, motion: 0.9, contrast: 0.3, actionCues: ["Резкое движение"] },
  ], 3);
  expect(timeline.map((event) => event.kind)).toEqual(["visual-highlight"]);
});
