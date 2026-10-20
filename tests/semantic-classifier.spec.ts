import { expect, test } from "@playwright/test";
import { aggregateSemanticProfiles, inferSemanticProfile } from "../src/video/semantic-classifier";

test("semantic profile inference recognizes broad content categories from model labels", () => {
  expect(inferSemanticProfile([
    { label: "sports car", score: 0.8 },
    { label: "racer", score: 0.5 }
  ]).profile).toBe("automotive");

  expect(inferSemanticProfile([
    { label: "waterfall", score: 0.72 },
    { label: "mountain", score: 0.48 }
  ]).profile).toBe("nature");

  expect(inferSemanticProfile([
    { label: "pizza", score: 0.8 },
    { label: "plate", score: 0.45 }
  ]).profile).toBe("food");

  expect(inferSemanticProfile([
    { label: "golden retriever", score: 0.75 },
    { label: "Labrador retriever", score: 0.55 }
  ]).profile).toBe("wildlife");
});

test("recognizes common classifier synonyms for landscapes and prepared food", () => {
  expect(inferSemanticProfile([{ label: "seashore", score: 0.84 }]).profile).toBe("nature");
  expect(inferSemanticProfile([{ label: "coral reef", score: 0.81 }]).profile).toBe("nature");
  expect(inferSemanticProfile([{ label: "carbonara", score: 0.82 }]).profile).toBe("food");
  expect(inferSemanticProfile([{ label: "ice lolly", score: 0.79 }]).profile).toBe("food");
  expect(inferSemanticProfile([{ label: "dolphin", score: 0.88 }]).profile).toBe("wildlife");
});

test("semantic profile inference stays unknown for weak or ambiguous predictions", () => {
  expect(inferSemanticProfile([
    { label: "sports car", score: 0.12 },
    { label: "pizza", score: 0.1 }
  ]).profile).toBe("unknown");

  expect(inferSemanticProfile([
    { label: "sports car", score: 0.5 },
    { label: "pizza", score: 0.48 }
  ]).profile).toBe("unknown");

  expect(inferSemanticProfile([
    { label: "unrecognized class", score: 0.99 }
  ]).profile).toBe("unknown");
});


test("automatic edit profile requires agreement across representative frames", () => {
  expect(aggregateSemanticProfiles([
    { profile: "automotive", confidence: 0.82 },
    { profile: "automotive", confidence: 0.74 },
    { profile: "unknown", confidence: 0 },
    { profile: "nature", confidence: 0.68 }
  ])).toEqual({ profile: "automotive", confidence: 0.78 });

  // One misclassified frame should not switch the whole montage to a new style.
  expect(aggregateSemanticProfiles([
    { profile: "automotive", confidence: 0.98 },
    { profile: "unknown", confidence: 0 },
    { profile: "unknown", confidence: 0 },
    { profile: "nature", confidence: 0.7 }
  ])).toEqual({ profile: "unknown", confidence: 0 });

  // A split vote is ambiguous and should preserve the conservative fallback.
  expect(aggregateSemanticProfiles([
    { profile: "automotive", confidence: 0.9 },
    { profile: "automotive", confidence: 0.8 },
    { profile: "nature", confidence: 0.9 },
    { profile: "nature", confidence: 0.8 }
  ])).toEqual({ profile: "unknown", confidence: 0 });
});


test("recognizes anime and gaming labels as distinct broad content profiles", () => {
  expect(inferSemanticProfile([
    { label: "comic book", score: 0.92 },
    { label: "animated cartoon", score: 0.81 },
  ]).profile).toBe("anime");

  expect(inferSemanticProfile([
    { label: "video game", score: 0.91 },
    { label: "game controller", score: 0.78 },
  ]).profile).toBe("gaming");
});
