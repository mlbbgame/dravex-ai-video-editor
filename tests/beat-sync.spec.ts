import { expect, test } from "@playwright/test";
import { createBeatAnalysisContext, getOrCreateCachedAnalysis, snapCutBoundariesToBeats } from "../src/video/beat-sync";

test("beat snapping returns safe boundaries for zero or invalid segment counts", () => {
  expect(snapCutBoundariesToBeats([0, 1, 2], 5, 0, 1)).toEqual([0]);
  expect(snapCutBoundariesToBeats([0, 1, 2], 5, -3, 1)).toEqual([0]);
  expect(snapCutBoundariesToBeats([0, 1, 2], 5, Number.NaN, 1)).toEqual([0, 5]);
});

test("beat snapping rejects invalid target durations without returning NaN", () => {
  expect(snapCutBoundariesToBeats([0, 1], 0, 3, 1)).toEqual([0]);
  expect(snapCutBoundariesToBeats([0, 1], Number.NaN, 3, 1)).toEqual([0]);
  expect(snapCutBoundariesToBeats([0, 1], Number.POSITIVE_INFINITY, 3, 1)).toEqual([0]);
});

test("beat snapping ignores non-finite and out-of-range beat markers", () => {
  const boundaries = snapCutBoundariesToBeats(
    [Number.NaN, Number.POSITIVE_INFINITY, -4, 0.8, 1.6, 3.2, 99],
    4,
    3,
    Number.NaN
  );

  expect(boundaries[0]).toBe(0);
  expect(boundaries[boundaries.length - 1]).toBe(4);
  expect(boundaries.every(Number.isFinite)).toBe(true);
  expect(boundaries.every((value, index) => index === 0 || value > boundaries[index - 1])).toBe(true);
});

test("beat snapping keeps cuts increasing and inside the target duration", () => {
  const boundaries = snapCutBoundariesToBeats([0.5, 1, 1.5, 2, 2.5, 3], 3.2, 5, 0.6);

  expect(boundaries).toHaveLength(6);
  expect(boundaries[0]).toBe(0);
  expect(boundaries.at(-1)).toBe(3.2);
  expect(boundaries.every(Number.isFinite)).toBe(true);
  expect(boundaries.every((value, index) => index === 0 || value > boundaries[index - 1])).toBe(true);
});


test("audio analysis falls back to the device default when a low sample rate is rejected", () => {
  const optionsSeen: unknown[] = [];
  class FakeAudioContext {
    constructor(options?: AudioContextOptions) {
      optionsSeen.push(options);
      if (options?.sampleRate) throw new Error("Requested sample rate is unsupported");
    }
  }

  const context = createBeatAnalysisContext(FakeAudioContext as unknown as typeof AudioContext);

  expect(context).toBeInstanceOf(FakeAudioContext);
  expect(optionsSeen).toEqual([{ sampleRate: 11_025 }, undefined]);
});


test("beat analysis cache shares concurrent work and refreshes recently used entries", async () => {
  const cache = new Map<string, Promise<number>>();
  let calls = 0;
  const create = () => {
    calls += 1;
    return Promise.resolve(calls);
  };

  const first = getOrCreateCachedAnalysis(cache, "track-a", create, 2);
  const sameWork = getOrCreateCachedAnalysis(cache, "track-a", create, 2);
  expect(first).toBe(sameWork);
  expect(await first).toBe(1);
  await getOrCreateCachedAnalysis(cache, "track-b", create, 2);
  await getOrCreateCachedAnalysis(cache, "track-a", create, 2); // Refresh A before adding C.
  await getOrCreateCachedAnalysis(cache, "track-c", create, 2);

  expect(cache.has("track-a")).toBe(true);
  expect(cache.has("track-b")).toBe(false);
  expect(cache.has("track-c")).toBe(true);
  expect(calls).toBe(3);
});

test("beat analysis cache evicts rejected work so the user can retry", async () => {
  const cache = new Map<string, Promise<string>>();
  await expect(getOrCreateCachedAnalysis(cache, "bad-track", () => Promise.reject(new Error("decode failed"))))
    .rejects.toThrow("decode failed");
  await Promise.resolve();
  expect(cache.has("bad-track")).toBe(false);

  const retry = getOrCreateCachedAnalysis(cache, "bad-track", () => Promise.resolve("recovered"));
  await expect(retry).resolves.toBe("recovered");
});
