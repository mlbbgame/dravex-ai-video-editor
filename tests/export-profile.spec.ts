import { expect, test } from "@playwright/test";
import { chooseSupportedWebmMimeType, getExportProfile } from "../src/video/export-profile";

test("4K export profiles preserve the requested aspect ratio and exact dimensions", () => {
  const expected = [
    { ratio: "9:16", width: 2160, height: 3840 },
    { ratio: "16:9", width: 3840, height: 2160 },
    { ratio: "1:1", width: 2160, height: 2160 },
    { ratio: "4:5", width: 2160, height: 2700 },
  ];

  for (const item of expected) {
    const profile = getExportProfile(item.ratio, "4K");
    expect(profile.width, item.ratio).toBe(item.width);
    expect(profile.height, item.ratio).toBe(item.height);
    expect(profile.frameRate).toBe(24);
    expect(profile.videoBitsPerSecond).toBe(35_000_000);
  }
});

test("1080p and 720p profiles keep bounded resolution and quality settings", () => {
  const fullHd = getExportProfile("16:9", "1080p");
  expect(fullHd.width).toBe(1920);
  expect(fullHd.height).toBe(1080);
  expect(fullHd.videoBitsPerSecond).toBe(12_000_000);

  const hd = getExportProfile("9:16", "720p");
  expect(hd.width).toBe(720);
  expect(hd.height).toBe(1280);
  expect(hd.videoBitsPerSecond).toBe(6_000_000);
});

test("invalid export options fall back to a safe supported profile", () => {
  const profile = getExportProfile("unsupported-ratio", "8K");
  expect(profile.width).toBe(720);
  expect(profile.height).toBe(1280);
  expect(profile.videoBitsPerSecond).toBe(6_000_000);
  expect(profile.frameRate).toBe(24);
});

test("WebM MIME selection chooses the first supported option", () => {
  const selected = chooseSupportedWebmMimeType((mime) => mime === "video/webm");
  expect(selected).toBe("video/webm");
});

test("WebM MIME selection handles unsupported types and throwing capability checks", () => {
  expect(chooseSupportedWebmMimeType(() => false)).toBeNull();
  expect(chooseSupportedWebmMimeType(() => { throw new Error("unsupported"); })).toBeNull();
});
