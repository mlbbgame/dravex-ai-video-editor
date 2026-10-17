import { expect, test } from "@playwright/test";
import { stat } from "node:fs/promises";
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
  expect(getMediaKind({ name: "clip.mp4", type: "image/jpeg" })).toBe("image");
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
  for (const sourceDuration of [0.25, 0.5, 2, 5, 9, 15, 16, 30, 60, 300, 1800]) {
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

  const durationSlider = page.getByRole("slider", { name: "Длительность ролика в секундах" });
  await durationSlider.focus();
  await durationSlider.press("Home");

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
  expect(download.suggestedFilename()).toMatch(/^dravex-video-.*\\.webm$/);
  expect(await download.failure()).toBeNull();
  const downloadedFile = await download.path();
  expect(downloadedFile).toBeTruthy();
  expect((await stat(downloadedFile!)).size).toBeGreaterThan(1_000);
});


test("long source-video montage handles 60-second input and exports the requested short edit", async ({ page }) => {
  test.setTimeout(120_000);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/");

  const durationSlider = page.getByRole("slider", { name: "Длительность ролика в секундах" });
  await durationSlider.focus();
  await durationSlider.press("Home");

  // A tiny 60-second VP8/WebM clip exercises the long-video frame-sampling path.
  const sourceVideo = Buffer.from("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eL94EB8YIOwvCCASa7kbOCeRi3i/eBAfGCDsLwggGeu5Gzgn0At4v3gQHxgg7C8IICFruQs4KA6LeK94EB8YIRVvCBBLuQs4KE0LeK94EB8YIRVvCBfLuQs4KIuLeK94EB8YIRVvCB9LuRs4KMoLeL94EB8YIRVvCCAWy7kbOCkIi3i/eBAfGCEVbwggHku5GzgpRwt4v3gQHxghFW8IICXLuQs4KYWLeK94EB8YIT/vCBNruQs4KcQLeK94EB8YIT/vCBrruRs4KgKLeL94EB8YIT/vCCASa7kbOCpBC3i/eBAfGCE/7wggGeu5Gzgqf4t4v3gQHxghP+8IICFruQs4Kr4LeK94EB8YIWkvCBBLuQs4KvyLeK94EB8YIWkvCBfLuQs4KzsLeK94EB8YIWkvCB9LuRs4K3mLeL94EB8YIWkvCCAWy7kbOCu4C3i/eBAfGCFpLwggHku5Gzgr9ot4v3gQHxghaS8IICXLuQs4LDULeK94EB8YIZOvCBNruQs4LHOLeK94EB8YIZOvCBrruRs4LLILeK94EB8YIZOvCCASa7kbOCzwi3i/eBAfGCGTrwggGeu5GzgtLwt4v3gQHxghk68IICGLuQs4LW2LeK94EB8YIb0vCBBLuQs4LawLeK94EB8YIb0vCBfruQs4LeqLeK94EB8YIb0vCB+LuRs4LikLeL94EB8YIb0vCCAXK7kbOC5ni3i/eBAfGCG9LwggHs", "base64");
  await page.locator('input[accept="video/*,image/*"]').setInputFiles({
    name: "dravex-test-long-source.webm",
    mimeType: "video/webm",
    buffer: sourceVideo,
  });

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
});
