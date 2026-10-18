import { expect, test } from "@playwright/test";
import { chooseSupportedWebmMimeType, getExportProfile } from "../src/video/export-profile";

test("portrait and landscape profiles use exact target dimensions", () => {
  expect(getExportProfile("9:16", "720p")).toMatchObject({ width: 720, height: 1280, frameRate: 24, videoBitsPerSecond: 6_000_000 });
  expect(getExportProfile("16:9", "1080p")).toMatchObject({ width: 1920, height: 1080, frameRate: 24, videoBitsPerSecond: 12_000_000 });
  expect(getExportProfile("1:1", "1080p")).toMatchObject({ width: 1080, height: 1080 });
  expect(getExportProfile("4:5", "1080p")).toMatchObject({ width: 1080, height: 1350 });
});

test("preview dimensions stay small and 4K gets a higher bitrate", () => {
  expect(getExportProfile("9:16", "preview")).toMatchObject({ width: 360, height: 640, videoBitsPerSecond: 1_200_000 });
  expect(getExportProfile("16:9", "4K")).toMatchObject({ width: 3840, height: 2160, videoBitsPerSecond: 35_000_000 });
  expect(getExportProfile("9:16", "4K").videoBitsPerSecond).toBeGreaterThan(getExportProfile("9:16", "1080p").videoBitsPerSecond);
});

test("unknown aspect ratio or quality safely falls back to portrait 720p", () => {
  expect(getExportProfile("unknown", "ultra")).toMatchObject({ width: 720, height: 1280, videoBitsPerSecond: 6_000_000 });
});

test("WebM codec selection prefers mobile-friendly VP8 and falls back safely", () => {
  expect(chooseSupportedWebmMimeType((type) => type === "video/webm;codecs=vp8" || type === "video/webm;codecs=vp9")).toBe("video/webm;codecs=vp8");
  expect(chooseSupportedWebmMimeType((type) => type === "video/webm")).toBe("video/webm");
  expect(chooseSupportedWebmMimeType(() => false)).toBeNull();
  expect(chooseSupportedWebmMimeType(() => { throw new Error("unsupported query"); })).toBeNull();
});
