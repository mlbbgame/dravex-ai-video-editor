import { expect, test } from "@playwright/test";
import {
  evaluateTuningCandidate,
  proposeImprovements,
  summarizeExperience,
  validateExperience,
  type MontageExperience,
} from "../src/video/director-learning";

function experience(index: number, overrides: Partial<MontageExperience> = {}): MontageExperience {
  return {
    id: `exp-${index}`,
    createdAt: "2026-10-21T10:00:00.000Z",
    profile: "aggressive-car",
    variant: "hype",
    quality: {
      momentSelection: 0.8,
      pacing: 0.8,
      transitions: 0.8,
      musicSync: 0.8,
      visualConsistency: 0.8,
      technicalReliability: 1,
    },
    ...overrides,
  };
}

test("experience validation rejects invalid scores and dates", () => {
  expect(validateExperience(experience(1, {
    createdAt: "not-a-date",
    quality: { pacing: 1.5 },
  }))).toEqual([
    "createdAt must be a valid date.",
    "Invalid quality score for pacing.",
  ]);
});

test("summaries require a minimum sample count and stay profile-specific", () => {
  const rows = [
    experience(1, { quality: { pacing: 0.4 } }),
    experience(2, { quality: { pacing: 0.6 } }),
    experience(3, { quality: { pacing: 0.8 } }),
    experience(4, { profile: "nature-wildlife", quality: { pacing: 0.1 } }),
  ];
  expect(summarizeExperience(rows, "aggressive-car", 3)).toEqual([{
    dimension: "pacing",
    samples: 3,
    mean: 0.6,
    userEditRate: 0,
    rejectionRate: 0,
  }]);
});

test("repeated edits or low scores produce explicit improvement hypotheses", () => {
  const rows = Array.from({ length: 5 }, (_, index) => experience(index, {
    quality: { transitions: 0.7 },
    editedDimensions: ["transitions"],
  }));
  const hypotheses = proposeImprovements(rows, "aggressive-car");
  expect(hypotheses).toHaveLength(1);
  expect(hypotheses[0].dimension).toBe("transitions");
  expect(hypotheses[0].status).toBe("proposed");
  expect(hypotheses[0].proposedAction).toContain("transition");
});

test("candidate tuning is promoted only after measurable gain and no large regressions", () => {
  const current = { version: 2, values: { transitionDensity: 0.4 } };
  const rejected = evaluateTuningCandidate(current, { transitionDensity: 0.6 }, {
    baselineScore: 0.7,
    candidateScore: 0.75,
    baselineRegressionByDimension: { musicSync: 0.08 },
  });
  expect(rejected.accepted).toBe(false);
  expect(rejected.next).toEqual(current);

  const accepted = evaluateTuningCandidate(current, { transitionDensity: 0.55 }, {
    baselineScore: 0.7,
    candidateScore: 0.74,
    baselineRegressionByDimension: { musicSync: 0.02 },
  });
  expect(accepted.accepted).toBe(true);
  expect(accepted.next.version).toBe(3);
  expect(accepted.next.values.transitionDensity).toBe(0.55);
});
