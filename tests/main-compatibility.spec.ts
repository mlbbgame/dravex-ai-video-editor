import { expect, test } from "@playwright/test";
import { execFileSync } from "node:child_process";
import { readFile, stat, unlink } from "node:fs/promises";
import { getMediaKind } from "../src/video/media-kind";

async function makeVideoFixture(name: string): Promise<Buffer> {
  const path = `/tmp/${name}-${process.pid}.webm`;
  execFileSync("ffmpeg", [
    "-hide_banner", "-loglevel", "error",
    "-f", "lavfi", "-i", "color=c=blue:s=96x160:r=12",
    "-t", "2", "-an", "-c:v", "libvpx", "-deadline", "realtime",
    "-cpu-used", "8", "-b:v", "80k", "-g", "12", "-pix_fmt", "yuv420p",
    "-f", "webm", path, "-y"
  ], { stdio: "pipe" });
  const data = await readFile(path);
  await unlink(path);
  return data;
}

function photoFixture(): Buffer {
  return Buffer.from(
    '<svg xmlns="http://www.w3.org/2000/svg" width="480" height="800"><rect width="480" height="800" fill="#b8f45b"/><circle cx="240" cy="400" r="150" fill="#111827"/></svg>',
    "utf8",
  );
}

async function importMixedMedia(page: import("@playwright/test").Page) {
  const sourceVideo = await makeVideoFixture("dravex-main-compat-video");
  await page.locator('input[accept="video/*,audio/*,image/*"]').setInputFiles([
    { name: "compat-video.webm", mimeType: "video/webm", buffer: sourceVideo },
    { name: "compat-photo.svg", mimeType: "image/svg+xml", buffer: photoFixture() },
  ]);
}

test("media type detection tolerates empty or incorrect Android MIME metadata", () => {
  expect(getMediaKind({ name: "clip.mp4", type: "" })).toBe("video");
  expect(getMediaKind({ name: "clip.webm", type: "application/octet-stream" })).toBe("video");
  expect(getMediaKind({ name: "photo.jpg", type: "" })).toBe("image");
  expect(getMediaKind({ name: "song.mp3", type: "" })).toBe("audio");
  expect(getMediaKind({ name: "notes.pdf", type: "" })).toBe("unknown");
  expect(getMediaKind({ name: "clip.mp4", type: "image/jpeg" })).toBe("video");
});

test("main app opens and mixed media can be imported, reordered and removed", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/");
  await expect(page).toHaveTitle(/DRAVEX/i);
  await expect(page.getByRole("button", { name: "AI Creator", exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "Manual Studio", exact: true })).toBeVisible();

  await importMixedMedia(page);
  const rows = page.locator(".clip-row");
  await expect(rows).toHaveCount(2);
  await expect(rows.nth(0)).toContainText("compat-video.webm");
  await expect(rows.nth(1)).toContainText("compat-photo.svg");

  await rows.nth(0).getByRole("button", { name: "Move clip down" }).click();
  await expect(rows.nth(0)).toContainText("compat-photo.svg");
  await expect(rows.nth(1)).toContainText("compat-video.webm");

  await rows.nth(0).getByRole("button", { name: "Remove clip" }).click();
  await expect(rows).toHaveCount(1);
  await expect(rows.first()).toContainText("compat-video.webm");
});

test("main renderer exports a playable WebM from a video plus a still image", async ({ page }) => {
  test.setTimeout(90_000);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/");
  await page.getByLabel("Output quality").selectOption("720p");
  await page.getByLabel("Target length").selectOption("15 seconds");
  await importMixedMedia(page);
  await expect(page.locator(".clip-row")).toHaveCount(2);

  const downloadPromise = page.waitForEvent("download");
  await page.getByRole("button", { name: "Create automatic montage" }).click();
  const download = await downloadPromise;
  expect(await download.failure()).toBeNull();
  const outputPath = await download.path();
  expect(outputPath).toBeTruthy();
  const fileStats = await stat(outputPath!);
  expect(fileStats.size).toBeGreaterThan(1_000);

  const probe = JSON.parse(execFileSync("ffprobe", [
    "-v", "error", "-show_entries", "format=duration",
    "-show_entries", "stream=codec_type,codec_name,width,height",
    "-of", "json", outputPath!
  ], { encoding: "utf8" }));
  expect(probe.streams.some((stream: { codec_type: string }) => stream.codec_type === "video")).toBe(true);
  expect(Number(probe.format.duration)).toBeGreaterThan(3);
  expect(Number(probe.format.duration)).toBeLessThan(8);
  expect(probe.streams.find((stream: { codec_type: string }) => stream.codec_type === "video")?.width).toBeGreaterThan(0);
});

test("main app does not overflow horizontally on a phone-sized viewport", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/");
  const dimensions = await page.evaluate(() => ({
    viewport: document.documentElement.clientWidth,
    page: document.documentElement.scrollWidth,
  }));
  expect(dimensions.page).toBeLessThanOrEqual(dimensions.viewport + 1);
});
