import { expect, test } from "@playwright/test";
import {
  analyzeWithAIDirector,
  inferMotionCues,
  inferTrackedObjectCues,
  scoreDirectorMoment,
  type DetectedObject,
} from "../src/video/ai-director";

const personLeft: DetectedObject = {
  label: "person",
  score: 0.92,
  box: { xmin: 20, ymin: 25, xmax: 80, ymax: 150 },
};
const personRight: DetectedObject = {
  label: "person",
  score: 0.9,
  box: { xmin: 100, ymin: 25, xmax: 160, ymax: 150 },
};
const personNear: DetectedObject = {
  label: "person",
  score: 0.94,
  box: { xmin: 90, ymin: 5, xmax: 190, ymax: 175 },
};

test("motion cues separate stable shots from sharp movement", () => {
  expect(inferMotionCues(0.2, 0.1, [], [], 0.08)).toContain("Резкое движение");
  expect(inferMotionCues(0.01, 0.1, [], [], 0.08)).toContain("Стабильный кадр");
});

test("object tracking detects screen movement and apparent approach", () => {
  expect(inferTrackedObjectCues([personLeft], [personRight])).toContain("Объект перемещается по кадру");
  expect(inferTrackedObjectCues([personLeft], [personNear])).toContain("Объект приближается");
});

test("velocity and story profiles rank motion differently", () => {
  const highMotion = { score: 0.8, motion: 0.8, contrast: 0.2 };
  const objects = [personLeft, { ...personLeft, label: "car" }];
  const velocityScore = scoreDirectorMoment(highMotion, objects, "velocity", 0.1, 0.5);
  const storyScore = scoreDirectorMoment(highMotion, objects, "story", 0.1, 0.5);
  expect(velocityScore).toBeGreaterThan(storyScore);
});

test("detected objects contribute to shot value without bypassing visual score", () => {
  const moment = { score: 0.5, motion: 0.2, contrast: 0.18 };
  const noObjects = scoreDirectorMoment(moment, [], "cinematic", 0.1, 0);
  const withObjects = scoreDirectorMoment(moment, [personLeft, { ...personLeft, label: "car" }], "cinematic", 0.1, 0);
  expect(withObjects).toBeGreaterThan(noObjects);
  expect(Number.isFinite(withObjects)).toBe(true);
});

test("object matching does not confuse two same-class objects when detector order changes", () => {
  const previous = [
    { label: "person", score: 0.9, box: { xmin: 20, ymin: 20, xmax: 80, ymax: 140 } },
    { label: "person", score: 0.9, box: { xmin: 230, ymin: 20, xmax: 290, ymax: 140 } },
  ];
  const current = [
    { label: "person", score: 0.9, box: { xmin: 235, ymin: 20, xmax: 295, ymax: 140 } },
    { label: "person", score: 0.9, box: { xmin: 25, ymin: 20, xmax: 85, ymax: 140 } },
  ];
  expect(inferTrackedObjectCues(previous, current)).not.toContain("Объект перемещается по кадру");
});


test("long videos skip heavyweight local detection and preserve visual candidates", async () => {
  const candidate = {
    time: 12,
    start: 10.8,
    end: 13.2,
    score: 0.82,
    motion: 0.24,
    contrast: 0.21,
  };

  const result = await analyzeWithAIDirector(
    "blob:long-video-fixture",
    300,
    [{ time: candidate.time, score: candidate.score, motion: candidate.motion, contrast: candidate.contrast }],
    [candidate],
    "velocity",
  );

  expect(result.modelLoaded).toBe(false);
  expect(result.candidates).toHaveLength(1);
  expect(result.candidates[0]).toMatchObject({
    time: candidate.time,
    score: candidate.score,
    directorScore: candidate.score,
    actionCues: ["Резкое движение"],
  });
  expect(result.note).toContain("длинного видео");
});
