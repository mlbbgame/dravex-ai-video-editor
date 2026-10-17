import { expect, test } from "@playwright/test";
import { stat } from "node:fs/promises";
import { getCameraMotionProfile, shouldContainSource } from "../src/video/video-sequence-render";
import { getMediaKind } from "../src/video/media-kind";

test("editor opens and exposes the primary upload action", async ({ page }) => {
  await page.goto("/");
  await expect(page).toHaveTitle(/DRAVEX/i);
  await expect(page.getByRole("navigation", { name: "Разделы DRAVEX" })).toBeVisible();
  await expect(page.getByRole("button", { name: /Добавить видео или фото/i })).toBeVisible();
  await expect(page.getByText("Работает в браузере")).toBeVisible();
});

test("Music Studio lists ready-to-use tracks and working search filters", async ({ page }) => {
  await page.goto("/");
  const tabs = page.getByRole("navigation", { name: "Разделы DRAVEX" });
  await tabs.getByRole("button", { name: "Музыка" }).click();

  await expect(page.getByRole("heading", { name: /Твоя музыка/i })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Музыкальная библиотека" })).toBeVisible();
  await expect(page.locator(".dravex-track-card")).toHaveCount(25);
  await expect(page.locator(".dravex-music-categories").getByRole("button", { name: "Все" })).toBeVisible();
  await expect(page.locator(".dravex-music-categories").getByRole("button", { name: "Gaming" })).toBeVisible();
  await expect(page.locator(".dravex-music-categories").getByRole("button", { name: "Phonk / Drift" })).toBeVisible();
  await expect(page.locator(".dravex-music-categories").getByRole("button", { name: "Anime / Jumpstyle" })).toBeVisible();
  await expect(page.locator(".dravex-music-categories").getByRole("button", { name: "Background Music" })).toBeVisible();

  await page.locator(".dravex-music-categories").getByRole("button", { name: "Phonk / Drift" }).click();
  await expect(page.locator(".dravex-track-card").first()).toBeVisible();
  expect(await page.locator(".dravex-track-card").count()).toBeGreaterThan(0);
  await page.locator(".dravex-music-categories").getByRole("button", { name: "Все" }).click();

  const cards = page.locator(".dravex-track-card");
  for (let index = 0; index < 25; index += 1) {
    const card = cards.nth(index);
    await expect(card.locator("audio")).toHaveAttribute("src", /^https:\/\//);
    await expect(card.getByRole("button", { name: "Использовать" })).toBeVisible();
    await expect(card.getByRole("link", { name: "Автор и лицензия" })).toHaveAttribute("href", /^https:\/\//);
  }

  await page.getByRole("textbox", { name: "Поиск музыки" }).fill("Crash Up");
  await expect(page.locator(".dravex-track-card")).toHaveCount(1);
  await expect(page.locator(".dravex-track-card").first()).toContainText("Crash Up");

  // Search must include category/style tags, not just titles and descriptions.
  await page.getByRole("textbox", { name: "Поиск музыки" }).fill("Gaming");
  await expect(page.locator(".dravex-track-card").first()).toBeVisible();
  expect(await page.locator(".dravex-track-card").count()).toBeGreaterThan(0);

  await page.getByRole("textbox", { name: "Поиск музыки" }).fill("no-such-track-xyz");
  await expect(page.getByText(/Ничего не найдено/i)).toBeVisible();
});

test("mobile layout does not create horizontal page overflow", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/");
  await page.getByRole("navigation", { name: "Разделы DRAVEX" }).getByRole("button", { name: "Музыка" }).click();

  const dimensions = await page.evaluate(() => ({
    viewport: document.documentElement.clientWidth,
    page: document.documentElement.scrollWidth,
  }));
  expect(dimensions.page).toBeLessThanOrEqual(dimensions.viewport + 1);
});

test("source framing fills matching aspect ratios and preserves mismatched sources", () => {
  expect(shouldContainSource(9 / 16, 9 / 16)).toBe(false);
  expect(shouldContainSource(16 / 9, 16 / 9)).toBe(false);
  expect(shouldContainSource(1, 9 / 16)).toBe(true);
  expect(shouldContainSource(4 / 3, 9 / 16)).toBe(true);
  expect(shouldContainSource(0, 9 / 16)).toBe(true);
});

test("media type falls back to filename extension when a picker omits MIME metadata", () => {
  expect(getMediaKind({ name: "clip.mp4", type: "" })).toBe("video");
  expect(getMediaKind({ name: "clip.webm", type: "application/octet-stream" })).toBe("video");
  expect(getMediaKind({ name: "photo.jpg", type: "" })).toBe("image");
  expect(getMediaKind({ name: "photo.svg", type: "" })).toBe("image");
  expect(getMediaKind({ name: "notes.pdf", type: "" })).toBe("unknown");
  expect(getMediaKind({ name: "clip.mp4", type: "image/jpeg" })).toBe("image");
});

test("camera motion profiles provide visible but controlled movement", () => {
  const cinematic = getCameraMotionProfile("cinematic", "balanced");
  const story = getCameraMotionProfile("story", "balanced");
  const strong = getCameraMotionProfile("cinematic", "strong");
  const soft = getCameraMotionProfile("cinematic", "soft");
  expect(cinematic.zoom).toBeGreaterThan(0.1);
  expect(cinematic.pan).toBeGreaterThan(0.04);
  expect(story.zoom).toBeLessThan(cinematic.zoom);
  expect(strong.zoom).toBeGreaterThan(cinematic.zoom);
  expect(soft.zoom).toBeLessThan(cinematic.zoom);
});

test("one-button video auto-montage produces a playable WebM", async ({ page }) => {
  test.setTimeout(90_000);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/");

  // Create a short local WebM in the browser so the test exercises real video
  // metadata, seeking, highlight sampling, canvas rendering, and playback.
  const videoBytes = await page.evaluate(async () => {
    const canvas = document.createElement("canvas");
    canvas.width = 320;
    canvas.height = 568;
    const context = canvas.getContext("2d");
    if (!context || typeof MediaRecorder === "undefined") throw new Error("Browser video recording is unavailable");
    const mimeType = ["video/webm;codecs=vp8", "video/webm"].find((type) => MediaRecorder.isTypeSupported(type));
    if (!mimeType) throw new Error("No supported WebM test codec");
    const stream = canvas.captureStream(12);
    const recorder = new MediaRecorder(stream, { mimeType });
    const chunks: BlobPart[] = [];
    const stopped = new Promise<Blob>((resolve, reject) => {
      recorder.addEventListener("dataavailable", (event) => {
        if (event.data.size) chunks.push(event.data);
      });
      recorder.addEventListener("error", () => reject(new Error("Could not create test video")));
      recorder.addEventListener("stop", () => {
        stream.getTracks().forEach((track) => track.stop());
        resolve(new Blob(chunks, { type: mimeType }));
      }, { once: true });
    });

    recorder.start(200);
    const startedAt = performance.now();
    await new Promise<void>((resolve) => {
      const draw = () => {
        const elapsed = performance.now() - startedAt;
        context.fillStyle = elapsed % 800 < 400 ? "#ff3d6e" : "#171b3d";
        context.fillRect(0, 0, canvas.width, canvas.height);
        context.beginPath();
        context.arc(160 + Math.sin(elapsed / 250) * 70, 240, 75, 0, Math.PI * 2);
        context.fillStyle = "#ffffff";
        context.fill();
        context.fillStyle = "#090b12";
        context.fillRect(0, 440, canvas.width, 128);
        if (elapsed >= 4_500) {
          recorder.stop();
          resolve();
        } else {
          requestAnimationFrame(draw);
        }
      };
      requestAnimationFrame(draw);
    });
    const blob = await stopped;
    return Array.from(new Uint8Array(await blob.arrayBuffer()));
  });

  await page.locator('input[accept="video/*,image/*"]').setInputFiles({
    name: "dravex-test-video.webm",
    mimeType: "video/webm",
    buffer: Buffer.from(videoBytes),
  });

  await expect(page.getByText(/Предварительный просмотр готов:/)).toBeVisible({ timeout: 30_000 });
  await page.getByRole("button", { name: "Автомонтаж" }).click();
  const result = page.locator(".dravex-result");
  await expect(result.getByText("Видео готово!")).toBeVisible({ timeout: 45_000 });

  const outputVideo = result.locator("video.dravex-output");
  await expect(outputVideo).toBeVisible();
  await outputVideo.evaluate((video: HTMLVideoElement) => {
    if (video.readyState >= 1) return Promise.resolve();
    return new Promise<void>((resolve, reject) => {
      const timeout = window.setTimeout(() => reject(new Error("Rendered WebM metadata did not load")), 10_000);
      video.addEventListener("loadedmetadata", () => {
        window.clearTimeout(timeout);
        resolve();
      }, { once: true });
      video.addEventListener("error", () => {
        window.clearTimeout(timeout);
        reject(new Error("Rendered WebM could not be played back"));
      }, { once: true });
    });
  });
  const playback = await outputVideo.evaluate((video: HTMLVideoElement) => ({
    duration: video.duration,
    width: video.videoWidth,
    height: video.videoHeight,
  }));
  expect(playback.duration).toBeGreaterThan(2);
  expect(playback.width).toBeGreaterThan(0);
  expect(playback.height).toBeGreaterThan(0);
});

test("one-button photo auto-montage produces a playable WebM that can be downloaded", async ({ page }) => {
  test.setTimeout(60_000);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/");

  // A tiny generated SVG keeps this test self-contained and avoids external media.
  const svg = Buffer.from(
    '<svg xmlns="http://www.w3.org/2000/svg" width="480" height="800" viewBox="0 0 480 800"><defs><linearGradient id="g" x2="0" y2="1"><stop stop-color="#ff3d6e"/><stop offset="1" stop-color="#171b3d"/></linearGradient></defs><rect width="480" height="800" fill="url(#g)"/><circle cx="240" cy="310" r="120" fill="#fff" fill-opacity=".7"/><path d="M0 650 L180 450 L300 590 L400 500 L480 620 V800 H0Z" fill="#090b12"/></svg>',
    "utf8",
  );
  await page.locator('input[accept="video/*,image/*"]').setInputFiles({
    name: "dravex-test-frame.svg",
    mimeType: "",
    buffer: svg,
  });

  // The app creates a short real preview after import. Wait for that render to
  // finish before triggering the full montage, because the phone pipeline is serialized.
  await expect(page.getByText(/Предварительный просмотр готов:/)).toBeVisible({ timeout: 30_000 });
  await page.getByRole("button", { name: "Автомонтаж" }).click();

  const result = page.locator(".dravex-result");
  await expect(result.getByText("Видео готово!")).toBeVisible({ timeout: 30_000 });
  const outputVideo = result.locator("video.dravex-output");
  await expect(outputVideo).toBeVisible();
  await outputVideo.evaluate((video: HTMLVideoElement) => {
    if (video.readyState >= 1) return Promise.resolve();
    return new Promise<void>((resolve, reject) => {
      const timeout = window.setTimeout(() => reject(new Error("Rendered WebM metadata did not load")), 10_000);
      video.addEventListener("loadedmetadata", () => {
        window.clearTimeout(timeout);
        resolve();
      }, { once: true });
      video.addEventListener("error", () => {
        window.clearTimeout(timeout);
        reject(new Error("Rendered WebM could not be played back"));
      }, { once: true });
    });
  });

  const playback = await outputVideo.evaluate((video: HTMLVideoElement) => ({
    duration: video.duration,
    width: video.videoWidth,
    height: video.videoHeight,
    source: video.currentSrc,
  }));
  expect(playback.source).toMatch(/^blob:/);
  expect(playback.duration).toBeGreaterThan(2);
  expect(playback.width).toBeGreaterThan(0);
  expect(playback.height).toBeGreaterThan(0);

  const downloadPromise = page.waitForEvent("download");
  await result.getByRole("link", { name: "Сохранить видео" }).click();
  const download = await downloadPromise;
  expect(download.suggestedFilename()).toMatch(/^dravex-video-.*\.webm$/);
  expect(await download.failure()).toBeNull();
  const downloadedFile = await download.path();
  expect(downloadedFile).toBeTruthy();
  expect((await stat(downloadedFile!)).size).toBeGreaterThan(10_000);
});
