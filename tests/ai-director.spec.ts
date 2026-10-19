import { expect, test } from "@playwright/test";
import {
  inferMotionCues,
  inferSceneCategory,
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

test("scene category inference identifies food, vehicles, and wildlife from object labels", () => {
  expect(inferSceneCategory(["pizza", "bottle", "cake"]).category).toBe("food");
  expect(inferSceneCategory(["car", "truck", "person"]).category).toBe("vehicles");
  expect(inferSceneCategory(["bird", "dog"]).category).toBe("animals");
});

test("scene category inference stays unknown when no supported objects are detected", () => {
  expect(inferSceneCategory(["tree", "sky", "mountain"])).toEqual({
    category: "general",
    confidence: 0,
    matchedLabels: [],
  });
});

test("style-aware ranking favors relevant detected subjects instead of any object equally", () => {
  const moment = { score: 0.6, motion: 0.2, contrast: 0.18 };
  const car = [{ label: "car", score: 0.9, box: { xmin: 20, ymin: 20, xmax: 180, ymax: 140 } }];
  const cake = [{ label: "cake", score: 0.9, box: { xmin: 20, ymin: 20, xmax: 180, ymax: 140 } }];
  expect(scoreDirectorMoment(moment, car, "velocity", 0.1, 0.2))
    .toBeGreaterThan(scoreDirectorMoment(moment, cake, "velocity", 0.1, 0.2));
  expect(scoreDirectorMoment(moment, cake, "story", 0.1, 0.2))
    .toBeGreaterThan(scoreDirectorMoment(moment, car, "story", 0.1, 0.2));
});
