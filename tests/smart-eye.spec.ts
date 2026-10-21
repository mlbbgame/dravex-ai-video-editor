import { expect, test } from "@playwright/test";
import { buildSmartEyeReport } from "../src/video/smart-eye";

const event = (sourceTime: number, kind: "motion-peak" | "scene-change" = "motion-peak") => ({
  kind,
  label: kind === "motion-peak" ? "Пик движения" : "Вероятная смена сцены",
  confidence: 0.8,
  sourceTime,
  start: Math.max(0, sourceTime - 0.2),
  end: sourceTime + 0.2,
  evidence: ["движение", "изменение"],
});

test("Smart Eye preserves timestamped event memory across the source timeline", () => {
  const report = buildSmartEyeReport({
    duration: 60,
    detectedLabels: ["car", "person", "car", "motorcycle"],
    events: [event(3), event(31, "scene-change"), event(58)],
    observations: [
      { time: 2, sceneLabels: ["car"], actionCues: ["Резкое движение"], score: 0.8 },
      { time: 31, sceneLabels: ["motorcycle"], actionCues: ["Объект перемещается"], score: 0.7 },
    ],
    selectedStyle: "velocity",
    sampledFrameCount: 8,
    candidateCount: 30,
  });
  expect(report.memory.filter((entry) => entry.kind !== "detected-object" && entry.kind !== "frame-observation").map((entry) => entry.time))
    .toEqual([3, 31, 58]);
  expect(report.detectedEntities).toEqual(["car", "motorcycle", "person"]);
  expect(report.memory.some((entry) => entry.kind === "detected-object" && entry.time === 2 && entry.label === "car")).toBe(true);
  expect(report.memory.some((entry) => entry.kind === "detected-object" && entry.time === 31 && entry.label === "motorcycle")).toBe(true);
  expect(report.memory.some((entry) => entry.kind === "detected-object" && entry.time === null && entry.label === "person")).toBe(true);
  expect(report.sceneCategory).toBe("vehicles");
  expect(report.coverage.sampledFrameRatio).toBeCloseTo(8 / 30);
  expect(report.coverage.lastEventTime).toBe(58);
});

test("Smart Eye rejects out-of-range events and bounds confidence and coverage", () => {
  const invalid = { ...event(100), confidence: 12 };
  const report = buildSmartEyeReport({
    duration: 10,
    detectedLabels: [" ", "pizza"],
    events: [event(5), invalid, { ...event(Number.NaN), confidence: Number.NaN }],
    selectedStyle: "cinematic",
    sampledFrameCount: 50,
    candidateCount: 20,
  });
  expect(report.memory.filter((entry) => entry.kind !== "detected-object")).toHaveLength(1);
  expect(report.memory.find((entry) => entry.kind === "motion-peak")?.confidence).toBe(0.8);
  expect(report.coverage.sampledFrameCount).toBe(20);
  expect(report.coverage.sampledFrameRatio).toBe(1);
  expect(report.sceneCategory).toBe("food");
});

test("Smart Eye avoids inventing a nature or gameplay category from unsupported labels", () => {
  const report = buildSmartEyeReport({
    duration: 12,
    detectedLabels: ["tree", "sky", "mountain", "game HUD"],
    events: [],
    selectedStyle: "story",
    sampledFrameCount: 2,
    candidateCount: 12,
  });
  expect(report.sceneCategory).toBe("general");
  expect(report.memory.filter((entry) => entry.kind !== "detected-object")).toHaveLength(0);
  expect(report.limitations.length).toBeGreaterThanOrEqual(4);
});

test("Smart Eye safely handles empty input and invalid duration", () => {
  const report = buildSmartEyeReport({
    duration: Number.NaN,
    detectedLabels: [],
    events: [],
    selectedStyle: "cinematic",
    sampledFrameCount: Number.NaN,
    candidateCount: Number.NaN,
  });
  expect(report.duration).toBe(0);
  expect(report.coverage.sampledFrameRatio).toBe(0);
  expect(report.memory).toEqual([]);
});
