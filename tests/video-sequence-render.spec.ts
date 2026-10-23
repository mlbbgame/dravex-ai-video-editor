import { expect, test } from "@playwright/test";
import { MAX_CONCURRENT_MEDIA_LOADS, createMediaLoadLimiter, finalizeWebmDuration, getRenderFrameInterval, isPendingAudioDuration, isPendingVideoDuration, getSafeAudioTrackVolume, getSafeImageDuration, getSourceAudioGain, getSourceFrameRect, getTransitionSequenceType, getTrimBoundaryFrameTime, hasUsableAudioDuration, hasUsableImageDimensions, hasUsableVideoDimensions, isUsableFinalRenderDuration, isUsableRenderDuration, resolveVideoTrimRange, shouldContainSource , getCameraMotionProfile } from "../src/video/video-sequence-render";

test("photo durations stay finite and within safe render bounds", () => {
  expect(getSafeImageDuration()).toBe(3);
  expect(getSafeImageDuration(Number.NaN)).toBe(3);
  expect(getSafeImageDuration(Number.POSITIVE_INFINITY)).toBe(3);
  expect(getSafeImageDuration(Number.NEGATIVE_INFINITY)).toBe(3);
  expect(getSafeImageDuration(-10)).toBe(0.25);
  expect(getSafeImageDuration(0)).toBe(0.25);
  expect(getSafeImageDuration(12)).toBe(12);
  expect(getSafeImageDuration(300)).toBe(30);
});


test("contain framing keeps the complete source frame for gameplay and HUD-heavy video", () => {
  expect(getSourceFrameRect(1920, 1080, 1080, 1920, "contain")).toEqual({
    x: 0, y: 0, width: 1920, height: 1080,
  });
});

test("cover framing computes a centered crop for portrait output", () => {
  const crop = getSourceFrameRect(1920, 1080, 1080, 1920, "cover");
  expect(crop.x).toBeCloseTo(656.25, 2);
  expect(crop.y).toBe(0);
  expect(crop.width).toBeCloseTo(607.5, 2);
  expect(crop.height).toBe(1080);
});

test("cover framing crops vertical footage for landscape output", () => {
  const crop = getSourceFrameRect(1080, 1920, 1920, 1080, "cover");
  expect(crop.x).toBe(0);
  expect(crop.width).toBe(1080);
  expect(crop.height).toBeCloseTo(607.5, 2);
  expect(crop.y).toBeCloseTo(656.25, 2);
});

test("invalid framing dimensions fall back safely", () => {
  expect(getSourceFrameRect(0, 1080, 1080, 1920, "cover")).toEqual({
    x: 0, y: 0, width: 1, height: 1080,
  });
});


test("automatic framing preserves the existing safe behavior while explicit fit and fill override it", () => {
  expect(shouldContainSource(16 / 9, 9 / 16)).toBe(true);
  expect(shouldContainSource(16 / 9, 9 / 16, "auto")).toBe(true);
  expect(shouldContainSource(16 / 9, 9 / 16, "fit")).toBe(true);
  expect(shouldContainSource(16 / 9, 9 / 16, "fill")).toBe(false);
  expect(shouldContainSource(1, 1, "auto")).toBe(false);
  expect(shouldContainSource(1, 1, "fit")).toBe(true);
  expect(shouldContainSource(1, 1, "fill")).toBe(false);
});

test("render loop frame pacing matches the recorder frame rate", () => {
  expect(getRenderFrameInterval(24)).toBeCloseTo(1000 / 24, 5);
  expect(getRenderFrameInterval(30)).toBeCloseTo(1000 / 30, 5);
  expect(getRenderFrameInterval(60)).toBeCloseTo(1000 / 60, 5);
  expect(getRenderFrameInterval(120)).toBeCloseTo(1000 / 60, 5);
  expect(getRenderFrameInterval(0)).toBeCloseTo(1000 / 24, 5);
  expect(getRenderFrameInterval(Number.NaN)).toBeCloseTo(1000 / 24, 5);
});


test("automatic source audio ducks under music while keep and mute modes are explicit", () => {
  expect(getSourceAudioGain("auto", 0.8, false)).toBeCloseTo(0.8);
  expect(getSourceAudioGain("auto", 0.8, true)).toBeCloseTo(0.224);
  expect(getSourceAudioGain("keep", 0.8, true)).toBeCloseTo(0.8);
  expect(getSourceAudioGain("mute", 0.8, false)).toBe(0);
});

test("source audio gain clamps invalid and out-of-range volume values", () => {
  expect(getSourceAudioGain("keep", 5, false)).toBe(1);
  expect(getSourceAudioGain("keep", -1, false)).toBe(0);
  expect(getSourceAudioGain("auto", Number.NaN, true)).toBeCloseTo(0.224);
});


test("trim boundary holds the last frame inside the selected source range", () => {
  expect(getTrimBoundaryFrameTime(1, 2)).toBeCloseTo(2 - 1 / 24, 8);
  expect(getTrimBoundaryFrameTime(0, 0.01)).toBeCloseTo(0.005, 8);
  expect(getTrimBoundaryFrameTime(3, 3)).toBe(3);
  expect(getTrimBoundaryFrameTime(4, 2)).toBe(4);
  expect(getTrimBoundaryFrameTime(Number.NaN, 2)).toBe(0);
});

test("video trim ranges remain inside source bounds and last at least 0.1 seconds", () => {
  expect(resolveVideoTrimRange(10, 2, 5)).toEqual({ start: 2, end: 5, duration: 3 });
  expect(resolveVideoTrimRange(10, -4, 3)).toEqual({ start: 0, end: 3, duration: 3 });
  expect(resolveVideoTrimRange(10, 8, 20)).toEqual({ start: 8, end: 10, duration: 2 });
  expect(resolveVideoTrimRange(10, 9.95, 9.96)).toEqual({ start: 9.9, end: 10, duration: 0.1 });
});

test("video trim ranges recover safely from invalid trim values and reject unusable sources", () => {
  expect(resolveVideoTrimRange(5, Number.NaN, Number.NaN)).toEqual({ start: 0, end: 5, duration: 5 });
  expect(resolveVideoTrimRange(5, 3, 2)).toEqual({ start: 3, end: 3.1, duration: 0.1 });
  expect(() => resolveVideoTrimRange(Number.NaN, 0, 1)).toThrow();
  expect(() => resolveVideoTrimRange(0.05, 0, 0.05)).toThrow();
});


test("cinematic and automatic transitions provide varied but repeatable cut sequences", () => {
  const cinematic = Array.from({ length: 6 }, (_, index) => getTransitionSequenceType("cinematic", "cinematic", index + 1));
  const calm = Array.from({ length: 6 }, (_, index) => getTransitionSequenceType("story", "auto", index + 1));
  const action = Array.from({ length: 5 }, (_, index) => getTransitionSequenceType("velocity", "action", index + 1));

  expect(new Set(cinematic).size).toBeGreaterThanOrEqual(3);
  expect(new Set(calm).size).toBeGreaterThanOrEqual(4);
  expect(new Set(action).size).toBe(5);
  expect(getTransitionSequenceType("cinematic", "cinematic", 1)).toBe(8);
  expect(getTransitionSequenceType("story", "auto", 0)).toBe(0);
  expect(getTransitionSequenceType("story", "auto", Number.NaN)).toBe(0);
});


test("media metadata guards reject zero, negative, NaN, and infinite dimensions", () => {
  expect(hasUsableImageDimensions(1920, 1080)).toBe(true);
  expect(hasUsableImageDimensions(1, 1)).toBe(true);
  expect(hasUsableImageDimensions(0, 1080)).toBe(false);
  expect(hasUsableImageDimensions(1920, 0)).toBe(false);
  expect(hasUsableImageDimensions(-1, 1080)).toBe(false);
  expect(hasUsableImageDimensions(Number.NaN, 1080)).toBe(false);
  expect(hasUsableImageDimensions(1920, Number.POSITIVE_INFINITY)).toBe(false);
});

test("render duration guard rejects zero, non-finite, and overflowed timelines", () => {
  expect(isUsableRenderDuration(0.1)).toBe(true);
  expect(isUsableRenderDuration(300)).toBe(true);
  expect(isUsableRenderDuration(0)).toBe(false);
  expect(isUsableRenderDuration(-1)).toBe(false);
  expect(isUsableRenderDuration(Number.NaN)).toBe(false);
  expect(isUsableRenderDuration(Number.POSITIVE_INFINITY)).toBe(false);
  expect(isUsableRenderDuration(Number.NEGATIVE_INFINITY)).toBe(false);
  expect(isUsableRenderDuration(Number.MAX_VALUE + Number.MAX_VALUE)).toBe(false);
});

test("final render duration rejects positive but effectively empty timelines", () => {
  expect(isUsableFinalRenderDuration(0.1)).toBe(true);
  expect(isUsableFinalRenderDuration(0.100001)).toBe(true);
  expect(isUsableFinalRenderDuration(300)).toBe(true);
  expect(isUsableFinalRenderDuration(0.099999)).toBe(false);
  expect(isUsableFinalRenderDuration(0)).toBe(false);
  expect(isUsableFinalRenderDuration(-1)).toBe(false);
  expect(isUsableFinalRenderDuration(Number.NaN)).toBe(false);
  expect(isUsableFinalRenderDuration(Number.POSITIVE_INFINITY)).toBe(false);
  expect(isUsableFinalRenderDuration(Number.NEGATIVE_INFINITY)).toBe(false);
});

test("video metadata guard rejects invalid decoded dimensions", () => {
  expect(hasUsableVideoDimensions(1920, 1080)).toBe(true);
  expect(hasUsableVideoDimensions(0, 1080)).toBe(false);
  expect(hasUsableVideoDimensions(1920, 0)).toBe(false);
  expect(hasUsableVideoDimensions(Number.NaN, 1080)).toBe(false);
  expect(hasUsableVideoDimensions(1920, Number.NaN)).toBe(false);
  expect(hasUsableVideoDimensions(Number.POSITIVE_INFINITY, 1080)).toBe(false);
  expect(hasUsableVideoDimensions(1920, Number.POSITIVE_INFINITY)).toBe(false);
});

test("audio duration metadata waits for transient NaN and positive Infinity", () => {
  expect(isPendingAudioDuration(Number.NaN)).toBe(true);
  expect(isPendingAudioDuration(Number.POSITIVE_INFINITY)).toBe(true);
  expect(isPendingAudioDuration(Number.NEGATIVE_INFINITY)).toBe(false);
  expect(isPendingAudioDuration(0)).toBe(false);
  expect(isPendingAudioDuration(9)).toBe(false);
});

test("video duration metadata waits only for a temporary positive Infinity value", () => {
  expect(isPendingVideoDuration(Number.POSITIVE_INFINITY)).toBe(true);
  expect(isPendingVideoDuration(Number.NaN)).toBe(true);
  expect(isPendingVideoDuration(Number.NEGATIVE_INFINITY)).toBe(false);
  expect(isPendingVideoDuration(0)).toBe(false);
  expect(isPendingVideoDuration(9)).toBe(false);
});

test("audio metadata guard rejects unusable durations but accepts finite positive durations", () => {
  expect(hasUsableAudioDuration(0.01)).toBe(true);
  expect(hasUsableAudioDuration(120)).toBe(true);
  expect(hasUsableAudioDuration(0)).toBe(false);
  expect(hasUsableAudioDuration(-1)).toBe(false);
  expect(hasUsableAudioDuration(Number.NaN)).toBe(false);
  expect(hasUsableAudioDuration(Number.POSITIVE_INFINITY)).toBe(false);
  expect(hasUsableAudioDuration(Number.NEGATIVE_INFINITY)).toBe(false);
});

test("video trim normalization never emits non-finite values or extends beyond the source", () => {
  const cases = [
    [0.1, 0, 0.1],
    [1, Number.NaN, Number.POSITIVE_INFINITY],
    [2, -100, 100],
    [8, 7.99, 8],
    [15, Number.POSITIVE_INFINITY, Number.NaN],
  ] as const;

  for (const [sourceDuration, requestedStart, requestedEnd] of cases) {
    const range = resolveVideoTrimRange(sourceDuration, requestedStart, requestedEnd);
    expect(Number.isFinite(range.start)).toBe(true);
    expect(Number.isFinite(range.end)).toBe(true);
    expect(Number.isFinite(range.duration)).toBe(true);
    expect(range.start).toBeGreaterThanOrEqual(0);
    expect(range.end).toBeLessThanOrEqual(sourceDuration);
    expect(range.duration).toBeGreaterThanOrEqual(0.1);
    expect(range.duration).toBeCloseTo(range.end - range.start, 6);
  }
});


test("music volume is clamped and invalid values fall back safely", () => {
  expect(getSafeAudioTrackVolume()).toBe(0.65);
  expect(getSafeAudioTrackVolume(Number.NaN)).toBe(0.65);
  expect(getSafeAudioTrackVolume(Number.POSITIVE_INFINITY)).toBe(0.65);
  expect(getSafeAudioTrackVolume(Number.NEGATIVE_INFINITY)).toBe(0.65);
  expect(getSafeAudioTrackVolume(-1)).toBe(0);
  expect(getSafeAudioTrackVolume(0)).toBe(0);
  expect(getSafeAudioTrackVolume(0.4)).toBe(0.4);
  expect(getSafeAudioTrackVolume(2)).toBe(1);
});


test("media load limiter hands off slots without exceeding the concurrency cap", async () => {
  const limitMediaLoad = createMediaLoadLimiter(2);
  let active = 0;
  let maximumActive = 0;
  const started: number[] = [];
  const releases: Array<() => void> = [];
  const tasks = Array.from({ length: 12 }, (_, index) => limitMediaLoad(async () => {
    active += 1;
    maximumActive = Math.max(maximumActive, active);
    started.push(index);
    await new Promise<void>((resolve) => releases.push(resolve));
    active -= 1;
    return index;
  }));

  // Only the two initial slots may start before either task is released.
  await Promise.resolve();
  await Promise.resolve();
  expect(started).toHaveLength(2);
  expect(maximumActive).toBe(2);

  // Release work in pairs to exercise the queued-slot handoff under contention.
  for (let offset = 0; offset < 12; offset += 2) {
    await expect.poll(() => releases.length).toBeGreaterThanOrEqual(offset + 2);
    releases[offset]();
    releases[offset + 1]();
  }

  await expect(Promise.all(tasks)).resolves.toEqual(Array.from({ length: 12 }, (_, index) => index));
  expect(maximumActive).toBeLessThanOrEqual(2);
  expect(active).toBe(0);
  expect(started).toEqual(Array.from({ length: 12 }, (_, index) => index));
});

test("mobile media decoding has a conservative concurrency cap", () => {
  expect(MAX_CONCURRENT_MEDIA_LOADS).toBe(3);
  expect(Number.isInteger(MAX_CONCURRENT_MEDIA_LOADS)).toBe(true);
  expect(MAX_CONCURRENT_MEDIA_LOADS).toBeGreaterThan(0);
  expect(MAX_CONCURRENT_MEDIA_LOADS).toBeLessThanOrEqual(4);
});

test("media load limiter releases its slot after rejection so queued work can continue", async () => {
  const limitMediaLoad = createMediaLoadLimiter(1);
  let secondTaskStarted = false;

  const firstTask = limitMediaLoad(async () => {
    throw new Error("simulated media decode failure");
  });
  const secondTask = limitMediaLoad(async () => {
    secondTaskStarted = true;
    return "recovered";
  });

  await expect(firstTask).rejects.toThrow("simulated media decode failure");
  await expect(secondTask).resolves.toBe("recovered");
  expect(secondTaskStarted).toBe(true);
});


test("media load limiter keeps handing off queued decodes after repeated failures", async () => {
  const limitMediaLoad = createMediaLoadLimiter(1);
  const started: string[] = [];
  const first = limitMediaLoad(async () => {
    started.push("first");
    throw new Error("first decode failed");
  });
  const second = limitMediaLoad(async () => {
    started.push("second");
    throw new Error("second decode failed");
  });
  const third = limitMediaLoad(async () => {
    started.push("third");
    return "recovered";
  });

  await expect(first).rejects.toThrow("first decode failed");
  await expect(second).rejects.toThrow("second decode failed");
  await expect(third).resolves.toBe("recovered");
  expect(started).toEqual(["first", "second", "third"]);
});


test("camera motion profiles stay style-specific and scale predictably with effect strength", () => {
  const cinematicSoft = getCameraMotionProfile("cinematic", "soft");
  const cinematicBalanced = getCameraMotionProfile("cinematic", "balanced");
  const cinematicStrong = getCameraMotionProfile("cinematic", "strong");
  const action = getCameraMotionProfile("velocity", "balanced");
  const story = getCameraMotionProfile("story", "balanced");

  expect(cinematicSoft.zoom).toBeCloseTo(cinematicBalanced.zoom * 0.72, 8);
  expect(cinematicSoft.pan).toBeCloseTo(cinematicBalanced.pan * 0.72, 8);
  expect(cinematicStrong.zoom).toBeCloseTo(cinematicBalanced.zoom * 1.28, 8);
  expect(cinematicStrong.pan).toBeCloseTo(cinematicBalanced.pan * 1.28, 8);
  expect(action.zoom).toBeGreaterThan(cinematicBalanced.zoom);
  expect(action.pan).toBeGreaterThan(cinematicBalanced.pan);
  expect(story.zoom).toBeLessThan(cinematicBalanced.zoom);
  expect(story.pan).toBeLessThan(cinematicBalanced.pan);

  for (const profile of [cinematicSoft, cinematicBalanced, cinematicStrong, action, story]) {
    expect(Number.isFinite(profile.zoom)).toBe(true);
    expect(Number.isFinite(profile.pan)).toBe(true);
    expect(profile.zoom).toBeGreaterThan(0);
    expect(profile.pan).toBeGreaterThan(0);
    expect(profile.zoom).toBeLessThan(0.25);
    expect(profile.pan).toBeLessThan(0.15);
  }
});


test("media load limiter never exceeds its concurrency cap when many decodes queue together", async () => {
  const limitMediaLoad = createMediaLoadLimiter(2);
  let active = 0;
  let peakActive = 0;
  const started: number[] = [];
  const results = await Promise.all(Array.from({ length: 24 }, (_, index) =>
    limitMediaLoad(async () => {
      active += 1;
      peakActive = Math.max(peakActive, active);
      started.push(index);
      // Yield repeatedly so queued tasks contend for newly released slots.
      await Promise.resolve();
      await Promise.resolve();
      active -= 1;
      return index;
    })
  ));

  expect(peakActive).toBeLessThanOrEqual(2);
  expect(peakActive).toBeGreaterThan(0);
  expect(results).toEqual(Array.from({ length: 24 }, (_, index) => index));
  expect(started).toEqual(Array.from({ length: 24 }, (_, index) => index));
});


test("WebM duration finalization preserves unsupported blobs and invalid requested durations", async () => {
  const bytes = new Uint8Array([1, 2, 3, 4]);
  const nonWebm = new Blob([bytes], { type: "video/mp4" });
  for (const duration of [0, -1, Number.NaN, Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY]) {
    const result = await finalizeWebmDuration(nonWebm, duration);
    expect(result).toBe(nonWebm);
  }

  const webmWithoutSegment = new Blob([bytes], { type: "video/webm" });
  const unchanged = await finalizeWebmDuration(webmWithoutSegment, 10);
  expect(unchanged).toBe(webmWithoutSegment);
});

test("WebM duration finalization inserts duration metadata without changing encoded media payload", async () => {
  // Minimal Segment > Info > TimecodeScale WebM structure, with no Duration element.
  const fixture = new Uint8Array([
    0x18, 0x53, 0x80, 0x67, 0x91, // Segment: 17 bytes follow
    0x15, 0x49, 0xa9, 0x66, 0x87, // Info: 7 bytes follow
    0x2a, 0xd7, 0xb1, 0x83, 0x0f, 0x42, 0x40, // TimecodeScale = 1,000,000ns
    0x1f, 0x43, 0xb6, 0x75, 0x80, // Minimal trailing Cluster payload
  ]);
  const originalPayload = fixture.slice(17);
  const finalized = await finalizeWebmDuration(new Blob([fixture], { type: "video/webm" }), 12.5);
  const result = new Uint8Array(await finalized.arrayBuffer());
  expect(finalized.size).toBeGreaterThan(fixture.length);
  // Duration (0x4489) must be present inside the expanded Info element.
  const hex = Array.from(result, (value) => value.toString(16).padStart(2, "0")).join("");
  expect(hex).toContain("448988");
  expect(hex).toContain("0f4240");
  // The trailing encoded media payload is retained after the Info element is rebuilt.
  expect(Array.from(result.slice(-originalPayload.length))).toEqual(Array.from(originalPayload));
});


test("WebM duration finalization preserves the original blob for unsupported or overflowing duration values", async () => {
  const unsupported = new Blob(["not webm"], { type: "video/mp4" });
  await expect(finalizeWebmDuration(unsupported, 12)).resolves.toBe(unsupported);

  const malformedDuration = new Blob(["not webm"], { type: "video/webm" });
  await expect(finalizeWebmDuration(malformedDuration, Number.NaN)).resolves.toBe(malformedDuration);

  // Minimal Segment > Info > TimecodeScale structure. MAX_VALUE is finite, but
  // converting it to nanoseconds overflows; the function must not write Infinity.
  const fixture = new Uint8Array([
    0x18, 0x53, 0x80, 0x67, 0x91,
    0x15, 0x49, 0xa9, 0x66, 0x87,
    0x2a, 0xd7, 0xb1, 0x83, 0x0f, 0x42, 0x40,
    0x1f, 0x43, 0xb6, 0x75, 0x80,
  ]);
  const source = new Blob([fixture], { type: "video/webm" });
  await expect(finalizeWebmDuration(source, Number.MAX_VALUE)).resolves.toBe(source);
});

test("media load limiter releases its slot after a rejected decode and continues queued work", async () => {
  const limitMediaLoad = createMediaLoadLimiter(1);
  const started: string[] = [];
  const first = limitMediaLoad(async () => {
    started.push("failed-decode");
    throw new Error("synthetic decoder failure");
  });
  const second = limitMediaLoad(async () => {
    started.push("recovery-decode");
    return "recovered";
  });

  await expect(first).rejects.toThrow("synthetic decoder failure");
  await expect(second).resolves.toBe("recovered");
  expect(started).toEqual(["failed-decode", "recovery-decode"]);
});

test("media load limiter normalizes invalid and fractional concurrency limits safely", async () => {
  for (const invalidLimit of [0, -3, Number.NaN, Number.POSITIVE_INFINITY]) {
    const runLimited = createMediaLoadLimiter(invalidLimit);
    await expect(runLimited(async () => "completed")).resolves.toBe("completed");
  }

  const runFractionalLimit = createMediaLoadLimiter(2.9);
  let active = 0;
  let peakActive = 0;
  const results = await Promise.all(Array.from({ length: 15 }, (_, index) =>
    runFractionalLimit(async () => {
      active += 1;
      peakActive = Math.max(peakActive, active);
      await Promise.resolve();
      await Promise.resolve();
      active -= 1;
      return index;
    })
  ));

  expect(peakActive).toBeLessThanOrEqual(2);
  expect(results).toEqual(Array.from({ length: 15 }, (_, index) => index));
});

test("WebM duration finalization supports unknown-length Segments without losing trailing media", async () => {
  // MediaRecorder commonly emits an unknown-length Segment. The finalizer must
  // insert Duration metadata while preserving all bytes after the Info element.
  const fixture = new Uint8Array([
    0x18, 0x53, 0x80, 0x67, 0xff, // Segment with unknown size
    0x15, 0x49, 0xa9, 0x66, 0x87, // Info
    0x2a, 0xd7, 0xb1, 0x83, 0x0f, 0x42, 0x40, // TimecodeScale = 1,000,000ns
    0x1f, 0x43, 0xb6, 0x75, 0x84, 0xde, 0xad, 0xbe, 0xef, // trailing Cluster bytes
  ]);
  const originalTrailingPayload = Array.from(fixture.slice(17));
  const finalized = await finalizeWebmDuration(new Blob([fixture], { type: "video/webm" }), 9.25);
  const result = new Uint8Array(await finalized.arrayBuffer());
  const hex = Array.from(result, (value) => value.toString(16).padStart(2, "0")).join("");

  expect(hex).toContain("448988");
  expect(result.length).toBeGreaterThan(fixture.length);
  expect(Array.from(result.slice(-originalTrailingPayload.length))).toEqual(originalTrailingPayload);
});



test("WebM duration finalization preserves 32-bit Duration metadata when a finite value would overflow Float32", async () => {
  // Segment > Info > TimecodeScale + a 32-bit float Duration + Cluster.
  // 1e36 seconds is finite in JavaScript, but converting it to WebM ticks
  // exceeds the finite Float32 range used by this existing Duration element.
  const fixture = new Uint8Array([
    0x18, 0x53, 0x80, 0x67, 0x98, // Segment: 24 bytes follow
    0x15, 0x49, 0xa9, 0x66, 0x8e, // Info: 14 bytes follow
    0x2a, 0xd7, 0xb1, 0x83, 0x0f, 0x42, 0x40, // TimecodeScale = 1,000,000ns
    0x44, 0x89, 0x84, 0x3f, 0x80, 0x00, 0x00, // Duration = 1.0 (Float32)
    0x1f, 0x43, 0xb6, 0x75, 0x80, // Cluster
  ]);
  const source = new Blob([fixture], { type: "video/webm" });
  await expect(finalizeWebmDuration(source, 1e36)).resolves.toBe(source);
});
