import { expect, test } from "@playwright/test";
import { buildDirectorDiagnosticExport, createDirectorDiagnostic } from "../src/video/director-diagnostics";

test("diagnostics retain useful montage milestones without accepting private media fields", () => {
  const event = createDirectorDiagnostic("analysis-completed", {
    mediaKind: "video",
    mediaCount: 1,
    durationSeconds: 42,
    sampledFrames: 12,
    candidateCount: 38,
    style: "velocity",
    fileName: "private-video.mp4",
    sourceUrl: "blob:private",
  } as never, "2026-10-21T10:00:00.000Z");

  expect(event.details).toEqual({
    mediaKind: "video",
    mediaCount: 1,
    durationSeconds: 42,
    sampledFrames: 12,
    candidateCount: 38,
    style: "velocity",
  });
  expect(JSON.stringify(event)).not.toContain("private-video.mp4");
  expect(JSON.stringify(event)).not.toContain("blob:private");
});

test("diagnostic export is bounded and clearly describes its privacy scope", () => {
  const events = Array.from({ length: 250 }, (_, index) =>
    createDirectorDiagnostic("render-started", { segmentCount: index }, "2026-10-21T10:00:00.000Z")
  );
  const report = buildDirectorDiagnosticExport(events);
  expect(report.eventCount).toBe(250);
  expect(report.events).toHaveLength(200);
  expect(report.privacy).toContain("no media");
  expect(report.events[0].details.segmentCount).toBe(50);
});

test("diagnostic events discard invalid numeric values and oversized strings", () => {
  const event = createDirectorDiagnostic("montage-failed", {
    durationSeconds: Number.NaN,
    style: "x".repeat(100),
    reasonCode: "render-error",
  });
  expect(event.details).toEqual({ reasonCode: "render-error" });
});

test("diagnostics only retain known style and quality labels and bounded non-negative counts", () => {
  const event = createDirectorDiagnostic("analysis-completed", {
    style: "private-user-filename.mp4",
    quality: "4K",
    mediaCount: -1,
    sampledFrames: 2.5,
    durationSeconds: 999999,
  } as never);
  expect(event.details).toEqual({ quality: "4K" });
});


test("diagnostics validate every runtime field and normalize invalid timestamps", () => {
  const event = createDirectorDiagnostic("analysis-completed", {
    mediaKind: "private-filename.mp4",
    severity: "secret text",
    reasonCode: "https://private.example/path",
    fallbackUsed: "yes",
    style: "cinematic",
    quality: "1080p",
    mediaCount: "one",
  } as never, "not-a-date");

  expect(event.details).toEqual({ style: "cinematic", quality: "1080p" });
  expect(Number.isFinite(Date.parse(event.timestamp))).toBe(true);
});

test("diagnostics tolerate malformed detail and export inputs", () => {
  const event = createDirectorDiagnostic("render-started", null as never, "2026-10-21T10:00:00.000Z");
  expect(event.details).toEqual({});
  expect(buildDirectorDiagnosticExport(null as never).events).toEqual([]);
});

test("diagnostics preserve mixed video and photo media kind", () => {
  const event = createDirectorDiagnostic("montage-failed", {
    mediaKind: "mixed",
    mediaCount: 3,
    reasonCode: "analysis-unavailable",
    phase: "analysis",
  }, "2026-10-24T11:00:00.000Z");

  expect(event.details).toEqual({
    mediaKind: "mixed",
    mediaCount: 3,
    reasonCode: "analysis-unavailable",
    phase: "analysis",
  });
});
