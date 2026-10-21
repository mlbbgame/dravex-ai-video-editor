import { expect, test } from "@playwright/test";
import {
  analyzeWithAIDirector,
  chooseAdaptiveDirectorSampleIndices,
  findNearestDetectedObjects,
  getDirectorFrameBudget,
  inferMotionCues,
  inferTemporalEventCues,
  inferSceneCategory,
  inferTrackedObjectCues,
  scoreDirectorMoment,
  suggestDirectorStyle,
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

test("motion cues normalize labels so casing and whitespace do not invent scene changes", () => {
  expect(inferMotionCues(0.08, 0.1, [" Car "], ["car"], 0.08))
    .not.toContain("Объект входит в сцену");
  expect(inferMotionCues(0.08, 0.1, ["Car"], [" CAR "], 0.08))
    .not.toContain("Смена объектов в сцене");
  expect(inferMotionCues(0.08, 0.1, [" ", ""], ["  "], 0.08))
    .not.toContain("Объект входит в сцену");
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

test("automatic style adapts to detected subjects while unknown scenes keep the fallback", () => {
  expect(suggestDirectorStyle("vehicles", "cinematic")).toBe("velocity");
  expect(suggestDirectorStyle("sports", "story")).toBe("velocity");
  expect(suggestDirectorStyle("food", "velocity")).toBe("cinematic");
  expect(suggestDirectorStyle("people", "velocity")).toBe("story");
  expect(suggestDirectorStyle("general", "cinematic")).toBe("cinematic");
});

test("sampled subject detections inform nearby moments without leaking across distant scenes", () => {
  expect(findNearestDetectedObjects(4.8, [2, 5, 10], [[personLeft], [personRight], [personNear]], 2))
    .toEqual([personRight]);
  expect(findNearestDetectedObjects(7.5, [2, 5, 10], [[personLeft], [personRight], [personNear]], 2))
    .toEqual([]);
});


test("director frame budget rejects zero, negative, and non-finite durations", () => {
  const emptyBudget = { maxFrames: 0, inferenceBudgetMs: 0, includeEdges: false };
  expect(getDirectorFrameBudget(0)).toEqual(emptyBudget);
  expect(getDirectorFrameBudget(-1)).toEqual(emptyBudget);
  expect(getDirectorFrameBudget(Number.NaN)).toEqual(emptyBudget);
  expect(getDirectorFrameBudget(Number.POSITIVE_INFINITY)).toEqual(emptyBudget);
});

test("long-video director samples more interior scenes while keeping a bounded mobile budget", () => {
  expect(getDirectorFrameBudget(30)).toEqual({
    maxFrames: 5,
    inferenceBudgetMs: 9000,
    includeEdges: false,
  });
  expect(getDirectorFrameBudget(300).maxFrames).toBe(5);
  expect(getDirectorFrameBudget(29.99).maxFrames).toBe(4);
});

test("AI Director safely falls back for unknown or too-short source duration", async () => {
  const sample = [{ time: 0.2, score: 0.7, motion: 0.1, contrast: 0.2 }];
  const candidate = [{ time: 0.2, start: 0, end: 0.4, score: 0.7, motion: 0.1, contrast: 0.2 }];

  for (const duration of [Number.NaN, Number.POSITIVE_INFINITY, 0.1]) {
    const result = await analyzeWithAIDirector(
      "blob:test-video",
      duration,
      sample,
      candidate,
      "cinematic"
    );

    expect(result.modelLoaded).toBe(false);
    expect(result.candidates).toHaveLength(1);
    expect(result.note).toContain("корректную длительность");
  }
});

test("AI Director reports missing samples separately from invalid duration", async () => {
  const candidate = [{ time: 0.2, start: 0, end: 0.4, score: 0.7, motion: 0.1, contrast: 0.2 }];
  const result = await analyzeWithAIDirector(
    "blob:test-video",
    2,
    [],
    candidate,
    "cinematic"
  );

  expect(result.modelLoaded).toBe(false);
  expect(result.note).toContain("Недостаточно кадров");
});


test("temporal event cues distinguish motion build-up, peaks, and settling", () => {
  expect(inferTemporalEventCues(0.03, 0.18, 0.04, [], [], [], 0.08)).toContain("Пик движения");
  expect(inferTemporalEventCues(0.03, 0.07, 0.09, [], [], [], 0.08)).toContain("Нарастание движения");
  expect(inferTemporalEventCues(0.18, 0.1, 0.09, [], [], [], 0.08)).toContain("Затухание движения");
});

test("temporal event cues flag likely scene changes without inventing an action", () => {
  expect(inferTemporalEventCues(
    0.04,
    0.05,
    0.04,
    ["car", "person"],
    ["dog", "tree"],
    ["dog", "tree"],
    0.08
  )).toContain("Вероятная смена сцены");
  expect(inferTemporalEventCues(0.04, 0.05, 0.04, [], [], [], 0.08)).toEqual([]);
});

test("temporal event cues ignore invalid motion values", () => {
  expect(inferTemporalEventCues(Number.NaN, 0.2, 0.1)).toEqual([]);
});

test("temporal cues do not invent peaks for steady motion or scene changes for matching labels", () => {
  expect(inferTemporalEventCues(0.08, 0.08, 0.08, [" Car "], ["car"], ["CAR"], 0.08))
    .not.toContain("Пик движения");
  expect(inferTemporalEventCues(0.08, 0.08, 0.08, [" Car "], ["car"], ["CAR"], 0.08))
    .not.toContain("Вероятная смена сцены");
});

test("temporal cues safely reject negative motion and normalize empty labels", () => {
  expect(inferTemporalEventCues(-0.1, 0.2, 0.1, ["car"], ["dog"], ["dog"])).toEqual([]);
  expect(inferTemporalEventCues(0.04, 0.05, 0.04, [" "], [""], [" "])).toEqual([]);
});

test("director ranking stays finite and bounded across all edit styles", () => {
  const moment = { score: 0.7, motion: 0.18, contrast: 0.22 };
  const objects = [
    { label: "car", score: 0.91, box: { xmin: 15, ymin: 20, xmax: 175, ymax: 145 } },
    { label: "person", score: 0.87, box: { xmin: 185, ymin: 25, xmax: 245, ymax: 150 } },
  ];

  for (const style of ["velocity", "anime", "cinematic", "glitch", "story"] as const) {
    const score = scoreDirectorMoment(moment, objects, style, 0.08, 0.4);
    expect(Number.isFinite(score), style).toBe(true);
    expect(score, style).toBeGreaterThanOrEqual(0);
    expect(score, style).toBeLessThanOrEqual(1);
  }
});


test("adaptive director sampling prioritizes a sharp temporal peak without losing source coverage", () => {
  const candidates = Array.from({ length: 20 }, (_, index) => ({
    score: index === 11 ? 0.98 : 0.3 + (index % 3) * 0.05,
    motion: index === 11 ? 0.95 : 0.08,
    contrast: index === 11 ? 0.3 : 0.1,
  }));
  const selected = chooseAdaptiveDirectorSampleIndices(candidates, 5, false);

  expect(selected).toHaveLength(5);
  expect(selected).toEqual([...selected].sort((a, b) => a - b));
  expect(selected).toContain(11);
  expect(selected[0]).toBeGreaterThan(0);
  expect(selected[selected.length - 1]).toBeLessThan(candidates.length - 1);
});

test("adaptive director sampling handles invalid budgets and small sources safely", () => {
  const candidates = [{ score: 0.4, motion: 0.1, contrast: 0.1 }, { score: 0.5, motion: 0.2, contrast: 0.2 }];
  expect(chooseAdaptiveDirectorSampleIndices(candidates, 0)).toEqual([]);
  expect(chooseAdaptiveDirectorSampleIndices(candidates, Number.NaN)).toEqual([]);
  expect(chooseAdaptiveDirectorSampleIndices(candidates, 5)).toEqual([0, 1]);
});
