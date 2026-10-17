import { expect, test } from "@playwright/test";
import { readFile, stat, unlink } from "node:fs/promises";
import { execFileSync } from "node:child_process";
import { getCameraMotionProfile, shouldContainSource } from "../src/video/video-sequence-render";
import { buildQuickVideoCandidates } from "../src/video/highlight-finder";
import { buildFallbackVideoCuts } from "../src/video/segment-planner";
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
  expect(getMediaKind({ name: "clip.mp4", type: "image/jpeg" })).toBe("video");
  expect(getMediaKind({ name: "photo.jpg", type: "video/mp4" })).toBe("image");
  expect(getMediaKind({ name: "clip-without-extension", type: "video/mp4" })).toBe("video");
  expect(getMediaKind({ name: "photo-without-extension", type: "image/jpeg" })).toBe("image");
});

test("quick video cut points stay valid across the full duration range", () => {
  for (const duration of [0.25, 0.5, 1, 2, 5, 9, 12, 15]) {
    const cuts = buildQuickVideoCandidates(duration);
    expect(cuts.length).toBeGreaterThanOrEqual(2);
    expect(cuts.length).toBeLessThanOrEqual(8);
    expect(cuts[0].start).toBeCloseTo(0, 6);
    expect(cuts[cuts.length - 1]?.end).toBeCloseTo(duration, 6);
    expect(cuts.every((cut) => cut.start >= 0 && cut.end <= duration && cut.end > cut.start)).toBe(true);
    expect(cuts.every((cut, index) => index === 0 || Math.abs(cut.start - cuts[index - 1].end) < 1e-6)).toBe(true);
  }
  expect(buildQuickVideoCandidates(Number.NaN)).toHaveLength(0);
  expect(buildQuickVideoCandidates(0.1)).toHaveLength(0);
});

test("fallback video planner covers short, medium, and long sources without invalid trims", () => {
  for (const sourceDuration of [0.25, 0.5, 2, 5, 9, 15, 16, 30, 60, 300, 1800, 7200, 18000]) {
    for (const targetDuration of [5, 15, 30, 60]) {
      for (const shotLength of [1.05, 1.35, 2.2, 3.2]) {
        const cuts = buildFallbackVideoCuts(sourceDuration, targetDuration, shotLength);
        const expectedDuration = Math.min(sourceDuration, targetDuration);
        expect(cuts.length).toBeGreaterThan(0);
        expect(cuts.length).toBeLessThanOrEqual(Math.ceil(expectedDuration / shotLength));
        expect(cuts.every((cut) => cut.trimStart >= 0 && cut.trimEnd <= sourceDuration + 1e-6 && cut.trimEnd > cut.trimStart)).toBe(true);
        expect(cuts.reduce((sum, cut) => sum + cut.trimEnd - cut.trimStart, 0)).toBeCloseTo(expectedDuration, 5);
        expect(cuts.every((cut, index) => index === 0 || cut.trimStart >= cuts[index - 1].trimStart)).toBe(true);
      }
    }
  }
  expect(buildFallbackVideoCuts(Number.NaN, 5)).toHaveLength(0);
  expect(buildFallbackVideoCuts(5, 0)).toHaveLength(0);
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


test("one-button source-video montage renders and downloads a playable WebM", async ({ page }) => {
  test.setTimeout(90_000);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/");
  await page.locator("details.dravex-more > summary").click();

  const durationSlider = page.getByRole("slider", { name: "Длительность ролика в секундах" });
  await expect(durationSlider).toBeVisible();
  await durationSlider.focus();
  await durationSlider.press("Home");
  await expect(durationSlider).toHaveValue("5");

  // Tiny, self-contained 2-second VP8/WebM clip; no external media or network access.
  const sourceVideo = Buffer.from("GkXfo59ChoEBQveBAULygQRC84EIQoKEd2VibUKHgQJChYECGFOAZwEAAAAAAALEEU2bdLpNu4tTq4QVSalmU6yBoU27i1OrhBZUrmtTrIHWTbuMU6uEElTDZ1OsggEjTbuMU6uEHFO7a1OsggKc7AEAAAAAAABZAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAVSalmsCrXsYMPQkBNgIxMYXZmNjEuNy4xMDNXQYxMYXZmNjEuNy4xMDNEiYhAn0AAAAAAABZUrmvIrgEAAAAAAAA/14EBc8WIVK4ALmPToFCcgQAitZyDdW5kiIEAhoVWX1ZQOIOBASPjg4QdzWUA4JCwgUC6gUCagQJVsIRVuYEBElTDZ/tzc59jwIBnyJlFo4dFTkNPREVSRIeMTGF2ZjYxLjcuMTAzc3PWY8CLY8WIVK4ALmPToFBnyKFFo4dFTkNPREVSRIeUTGF2YzYxLjE5LjEwMSBsaWJ2cHhnyKFFo4hEVVJBVElPTkSHkzAwOjAwOjAyLjAwMDAwMDAwMAAfQ7Z1QPPngQCjxIEAAIDQAwCdASpAAEAAAEcIhYWImYSIAgICdaoD+AP6AgcaT8gtSEwBVjAA/v1u8//kb+PnRv/I4//8Sp7jieP//EaAo7CBAfQAMQIAARAQABgAGdf0DAAQoYArVAD+/W7z/+Rv4+dG/8jj//xKnuOJ4//8RoCjxIED6IDQAwCdASpAAEAAAEcIhYWImYSIAgICdaoD+AP6AgcaT8gtSEwBVjAA/v1u8//kb+PnRv/I4//8Sp7jieP//EaAo7CBBdwAMQIAARAQABgAGdf0DAAQoYArVAD+/W7z/+Rv4+dG/8jj//xKnuOJ4//8RoAcU7tro7uPs4EAt4r3gQHxggGj8IEDu5CzggPot4r3gQHxggGj8IF7", "base64");
  await page.locator('input[accept="video/*,image/*"]').setInputFiles({
    name: "dravex-test-source.webm",
    mimeType: "video/webm",
    buffer: sourceVideo,
  });

  await expect(page.locator("video.dravex-preview")).toBeVisible();
  await expect(page.getByText(/Предварительный просмотр готов:/)).toBeVisible({ timeout: 30_000 });
  await page.getByRole("button", { name: "Автомонтаж" }).click();

  const result = page.locator(".dravex-result");
  await expect(result.getByText("Видео готово!")).toBeVisible({ timeout: 30_000 });
  const outputVideo = result.locator("video.dravex-output");
  await expect(outputVideo).toBeVisible();
  await outputVideo.evaluate((video: HTMLVideoElement) => {
    if (video.readyState >= 1) return Promise.resolve();
    return new Promise<void>((resolve, reject) => {
      const timeout = window.setTimeout(() => reject(new Error("Rendered video metadata did not load")), 10_000);
      video.addEventListener("loadedmetadata", () => {
        window.clearTimeout(timeout);
        resolve();
      }, { once: true });
      video.addEventListener("error", () => {
        window.clearTimeout(timeout);
        reject(new Error("Rendered source-video montage could not be played back"));
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
  expect(playback.duration).toBeGreaterThan(1);
  expect(playback.duration).toBeLessThanOrEqual(2.5);
  expect(playback.width).toBeGreaterThan(0);
  expect(playback.height).toBeGreaterThan(0);

  const downloadPromise = page.waitForEvent("download");
  await result.getByRole("link", { name: "Сохранить видео" }).click();
  const download = await downloadPromise;
  expect(download.suggestedFilename()).toMatch(/^dravex-video-.*\.webm$/);
  expect(await download.failure()).toBeNull();
  const downloadedFile = await download.path();
  expect(downloadedFile).toBeTruthy();
  expect((await stat(downloadedFile!)).size).toBeGreaterThan(1_000);
});


test("long source-video montage handles 60-second input and exports the requested short edit", async ({ page }) => {
  test.setTimeout(120_000);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/");
  await page.locator("details.dravex-more > summary").click();

  const durationSlider = page.getByRole("slider", { name: "Длительность ролика в секундах" });
  await expect(durationSlider).toBeVisible();
  await durationSlider.focus();
  await durationSlider.press("Home");
  await expect(durationSlider).toHaveValue("5");

  // A tiny 60-second VP8/WebM clip exercises the long-video frame-sampling path.
  const fixturePath = `/tmp/dravex-test-long-source-${process.pid}.webm`;
  execFileSync("ffmpeg", [
    "-hide_banner", "-loglevel", "error",
    "-f", "lavfi", "-i", "color=c=red:s=64x64:r=2",
    "-f", "lavfi", "-i", "sine=frequency=440:sample_rate=48000",
    "-t", "60", "-c:v", "libvpx", "-deadline", "realtime",
    "-cpu-used", "8", "-b:v", "20k", "-g", "2", "-pix_fmt", "yuv420p",
    "-c:a", "libopus", "-b:a", "32k", "-shortest", "-f", "webm", fixturePath, "-y"
  ], { stdio: "pipe" });
  const sourceVideo = await readFile(fixturePath);
  await page.locator('input[accept="video/*,image/*"]').setInputFiles({
    name: "dravex-test-long-source.webm",
    mimeType: "video/webm",
    buffer: sourceVideo,
  });

  await unlink(fixturePath);
  await expect(page.locator("video.dravex-preview")).toBeVisible();
  await expect(page.getByText(/Предварительный просмотр готов:/)).toBeVisible({ timeout: 30_000 });
  await page.getByRole("button", { name: "Автомонтаж" }).click();

  const result = page.locator(".dravex-result");
  await expect(result.getByText("Видео готово!")).toBeVisible({ timeout: 60_000 });
  const outputVideo = result.locator("video.dravex-output");
  await expect(outputVideo).toBeVisible();
  await outputVideo.evaluate((video: HTMLVideoElement) => {
    if (video.readyState >= 1) return Promise.resolve();
    return new Promise<void>((resolve, reject) => {
      const timeout = window.setTimeout(() => reject(new Error("Long-source output metadata did not load")), 10_000);
      video.addEventListener("loadedmetadata", () => {
        window.clearTimeout(timeout);
        resolve();
      }, { once: true });
      video.addEventListener("error", () => {
        window.clearTimeout(timeout);
        reject(new Error("Long-source output could not be played back"));
      }, { once: true });
    });
  });
  const playback = await outputVideo.evaluate((video: HTMLVideoElement) => ({
    duration: video.duration,
    width: video.videoWidth,
    height: video.videoHeight,
  }));
  expect(playback.duration).toBeGreaterThan(3.5);
  expect(playback.duration).toBeLessThanOrEqual(5.5);
  expect(playback.width).toBeGreaterThan(0);
  expect(playback.height).toBeGreaterThan(0);

  const downloadPromise = page.waitForEvent("download");
  await result.getByRole("link", { name: "Сохранить видео" }).click();
  const download = await downloadPromise;
  expect(await download.failure()).toBeNull();
  const downloadedFile = await download.path();
  expect(downloadedFile).toBeTruthy();
  const audioCodec = execFileSync("ffprobe", [
    "-v", "error", "-select_streams", "a:0",
    "-show_entries", "stream=codec_name", "-of", "default=noprint_wrappers=1:nokey=1",
    downloadedFile!
  ], { encoding: "utf8" }).trim();
  expect(audioCodec).not.toBe("");
});
