import { expect, test } from "@playwright/test";
import {
  canTransitionJob,
  isTerminalJobStatus,
  validateRecognitionJobSnapshot,
  type RecognitionJobSnapshot,
} from "../src/video/recognition-job-contract";

const base: RecognitionJobSnapshot = {
  jobId: "job-01",
  mediaId: "media-01",
  status: "recognizing",
  progress: 62,
  stage: "recognition",
  createdAt: "2026-10-18T12:00:00.000Z",
  updatedAt: "2026-10-18T12:00:15.000Z",
};

test("job lifecycle permits only forward transitions or cancellation/failure", () => {
  expect(canTransitionJob("created", "uploading")).toBe(true);
  expect(canTransitionJob("recognizing", "planning")).toBe(true);
  expect(canTransitionJob("rendering-preview", "ready")).toBe(true);
  expect(canTransitionJob("recognizing", "uploading")).toBe(false);
  expect(canTransitionJob("ready", "recognizing")).toBe(false);
});

test("terminal job states cannot transition again", () => {
  expect(isTerminalJobStatus("ready")).toBe(true);
  expect(isTerminalJobStatus("failed")).toBe(true);
  expect(isTerminalJobStatus("cancelled")).toBe(true);
  expect(isTerminalJobStatus("recognizing")).toBe(false);
  expect(canTransitionJob("failed", "recognizing")).toBe(false);
});

test("valid in-progress snapshot passes validation", () => {
  expect(validateRecognitionJobSnapshot(base).valid).toBe(true);
});

test("ready snapshot must be complete at 100 percent", () => {
  const result = validateRecognitionJobSnapshot({
    ...base,
    status: "ready",
    stage: "complete",
    progress: 100,
  });
  expect(result.valid).toBe(true);
});

test("failed job requires a stable code and safe message", () => {
  const result = validateRecognitionJobSnapshot({
    ...base,
    status: "failed",
    errorCode: "",
    errorMessage: "",
  });
  expect(result.valid).toBe(false);
  expect(result.errors).toContain("A failed job must include a stable error code.");
  expect(result.errors).toContain("A failed job must include a user-safe error message.");
});

test("invalid progress and malformed snapshots are rejected", () => {
  expect(validateRecognitionJobSnapshot({ ...base, progress: 101 }).valid).toBe(false);
  expect(validateRecognitionJobSnapshot(null).valid).toBe(false);
});
