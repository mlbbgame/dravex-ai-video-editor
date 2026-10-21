import { expect, test } from "@playwright/test";
import { aggregateSemanticProfiles, inferSemanticProfile } from "../src/video/semantic-classifier";

test("semantic classifier ignores invalid scores instead of letting them bias a scene profile", () => {
  expect(inferSemanticProfile([
    { label: "PUBG Mobile", score: Number.NaN },
    { label: "sports car", score: Number.POSITIVE_INFINITY },
    { label: "pizza", score: -0.4 },
    { label: "waterfall", score: 0 },
  ])).toEqual({ profile: "unknown", confidence: 0 });
});

test("semantic classifier does not invent a profile from unsupported or blank labels", () => {
  expect(inferSemanticProfile([
    { label: "", score: 0.99 },
    { label: "unmapped action event", score: 0.97 },
    { label: "unknown visual", score: 0.85 },
  ])).toEqual({ profile: "unknown", confidence: 0 });
});

test("single-frame evidence cannot overrule the multi-frame conservative fallback", () => {
  expect(aggregateSemanticProfiles([
    { profile: "gaming", confidence: 0.99 },
    { profile: "unknown", confidence: 0 },
    { profile: "unknown", confidence: 0 },
  ])).toEqual({ profile: "unknown", confidence: 0 });
});

test("aggregation ignores non-finite and zero-confidence frame results", () => {
  expect(aggregateSemanticProfiles([
    { profile: "gaming", confidence: Number.NaN },
    { profile: "gaming", confidence: Number.POSITIVE_INFINITY },
    { profile: "gaming", confidence: 0 },
    { profile: "unknown", confidence: 0 },
  ])).toEqual({ profile: "unknown", confidence: 0 });
});

test("mixed gaming and outdoor footage does not get a confident whole-video profile from a split vote", () => {
  expect(aggregateSemanticProfiles([
    { profile: "gaming", confidence: 0.9 },
    { profile: "gaming", confidence: 0.8 },
    { profile: "sports", confidence: 0.9 },
    { profile: "sports", confidence: 0.8 },
  ])).toEqual({ profile: "unknown", confidence: 0 });
});
