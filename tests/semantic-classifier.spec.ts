import { expect, test } from "@playwright/test";
import { inferSemanticProfile } from "../src/video/semantic-classifier";

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
