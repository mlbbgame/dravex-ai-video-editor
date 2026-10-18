import { expect, test } from "@playwright/test";
import {
  directorProfiles,
  suggestDirectorProfile,
  validateDirectorPlan,
  type DirectorEditPlan,
} from "../src/video/director-contract";

const validPlan: DirectorEditPlan = {
  schemaVersion: 1,
  sourceId: "source-test-001",
  profile: "aggressive-car",
  variant: "hype",
  targetDuration: 12,
  aspectRatio: "9:16",
  resolution: "720p",
  frameRate: 30,
  segments: [
    {
      sourceStart: 2.5,
      sourceEnd: 4.2,
      eventLabels: ["drift", "tire-smoke"],
      transitionIn: "short-impact",
      effects: ["motion-blur"],
      confidence: 0.91,
    },
    {
      sourceStart: 8,
      sourceEnd: 10,
      eventLabels: ["wheel-detail"],
      transitionIn: "match-motion",
      effects: ["flash"],
      confidence: 0.84,
    },
  ],
  music: {
    source: "licensed-library",
    trackId: "phonk-track-01",
    sourceStart: 4,
    sourceEnd: 16,
    gain: 0.72,
    fadeInSeconds: 0.2,
    fadeOutSeconds: 0.8,
    beatConfidence: 0.88,
  },
};

test("director profiles express distinct goals and effect preferences", () => {
  expect(directorProfiles["aggressive-car"].pacing).toBe("aggressive");
  expect(directorProfiles["aggressive-car"].preferredMusic).toContain("phonk");
  expect(directorProfiles["aggressive-car"].eventPriorities).toContain("drift");

  expect(directorProfiles["cinematic-travel"].pacing).toBe("measured");
  expect(directorProfiles["cinematic-travel"].preferredTransitions).toContain("smooth");
  expect(directorProfiles["cinematic-travel"].eventPriorities).toContain("landscape");

  expect(directorProfiles["nature-wildlife"].eventPriorities).toContain("waterfall-flow");
  expect(directorProfiles["nature-wildlife"].eventPriorities).toContain("macro-detail");
  expect(directorProfiles["nature-wildlife"].preferredEffects).toContain("color-grade");

  expect(directorProfiles["food-cooking"].eventPriorities).toContain("chopping");
  expect(directorProfiles["food-cooking"].eventPriorities).toContain("finished-dish");

  expect(directorProfiles["people-everyday"].eventPriorities).toContain("face-visible");
  expect(directorProfiles["people-everyday"].eventPriorities).toContain("pet-behavior");
  expect(directorProfiles["people-everyday"].preferredEffects).not.toContain("flash");

  expect(directorProfiles["product-diy"].eventPriorities).toContain("tools-materials");
  expect(directorProfiles["product-diy"].eventPriorities).toContain("final-result");
});

test("scene labels suggest the matching content profile", () => {
  expect(suggestDirectorProfile(["waterfall-flow", "macro-detail"])).toBe("nature-wildlife");
  expect(suggestDirectorProfile(["chopping", "finished-dish"])).toBe("food-cooking");
  expect(suggestDirectorProfile(["face-visible", "pet-behavior"])).toBe("people-everyday");
  expect(suggestDirectorProfile(["tools-materials", "final-result"])).toBe("product-diy");
  expect(suggestDirectorProfile(["drift", "tire-smoke"])).toBe("aggressive-car");
});

test("unknown or ambiguous scene labels use a restrained cinematic fallback", () => {
  expect(suggestDirectorProfile([])).toBe("cinematic-travel");
  expect(suggestDirectorProfile(["unrecognized-event"])).toBe("cinematic-travel");
  expect(suggestDirectorProfile(["waterfall-flow", "chopping"])).toBe("cinematic-travel");
});

test("valid director plan passes source-bound validation", () => {
  expect(validateDirectorPlan(validPlan, 30)).toEqual({ valid: true, errors: [] });
});

test("director plan rejects timestamps outside the source", () => {
  const invalidPlan = {
    ...validPlan,
    segments: [
      {
        ...validPlan.segments[0],
        sourceStart: 28,
        sourceEnd: 31,
      },
    ],
  };

  const result = validateDirectorPlan(invalidPlan, 30);
  expect(result.valid).toBe(false);
  expect(result.errors).toContain("Segment 1 has invalid source timestamps.");
});

test("director plan rejects unsupported effects and invalid confidence", () => {
  const invalidPlan = {
    ...validPlan,
    segments: [
      {
        ...validPlan.segments[0],
        effects: ["explosion-generator"],
        confidence: 1.5,
      },
    ],
  };

  const result = validateDirectorPlan(invalidPlan, 30);
  expect(result.valid).toBe(false);
  expect(result.errors).toContain("Segment 1 contains an unsupported effect.");
  expect(result.errors).toContain("Segment 1 confidence must be between 0 and 1.");
});

test("director plan rejects untrusted model output that is not an object", () => {
  expect(validateDirectorPlan("run this prompt", 30)).toEqual({
    valid: false,
    errors: ["Plan must be an object."],
  });
});

test("director plan rejects target duration longer than the source in schema v1", () => {
  const invalidPlan = { ...validPlan, targetDuration: 45 };
  const result = validateDirectorPlan(invalidPlan, 30);
  expect(result.valid).toBe(false);
  expect(result.errors).toContain("Target duration cannot exceed source duration in this initial contract.");
});
