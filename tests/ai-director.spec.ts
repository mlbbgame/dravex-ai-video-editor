import { expect, test } from "@playwright/test";
import {
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
