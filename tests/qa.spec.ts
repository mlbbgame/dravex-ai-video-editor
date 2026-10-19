import { expect, test } from "@playwright/test";
import { copyFile, mkdir, readFile, stat, unlink } from "node:fs/promises";
import { execFileSync } from "node:child_process";
import { getCameraMotionProfile, shouldContainSource } from "../src/video/video-sequence-render";
import { buildQuickVideoCandidates, ensureCandidateCoverage } from "../src/video/highlight-finder";
import { buildFallbackVideoCuts } from "../src/video/segment-planner";
import { getMediaKind } from "../src/video/media-kind";
import { assessMediaSelection } from "../src/video/media-intake";

test("editor opens and exposes the primary upload action", async ({ page }) => {
  await page.goto("/");
  await expect(page).toHaveTitle(/DRAVEX/i);
  await expect(page.getByRole("navigation", { name: "Разделы DRAVEX" })).toBeVisible();
  await expect(page.getByRole("button", { name: /Добавить видео или фото/i })).toBeVisible();
  await expect(page.getByText("Работает в браузере")).toBeVisible();
});


test("editor and music studio avoid horizontal overflow on narrow Android screens", async ({ page }) => {
  await page.goto("/");
  const tabs = page.getByRole("navigation", { name: "Разделы DRAVEX" });

  for (const width of [320, 360, 390, 430]) {
    await page.setViewportSize({ width, height: 844 });
    const editorWidth = await page.evaluate(() => ({
      viewport: document.documentElement.clientWidth,
      content: document.documentElement.scrollWidth,
    }));
    expect(editorWidth.content, `editor overflows at ${width}px`).toBeLessThanOrEqual(editorWidth.viewport + 1);

    await tabs.getByRole("button", { name: "Музыка" }).click();
    const musicWidth = await page.evaluate(() => ({
      viewport: document.documentElement.clientWidth,
      content: document.documentElement.scrollWidth,
    }));
    expect(musicWidth.content, `music studio overflows at ${width}px`).toBeLessThanOrEqual(musicWidth.viewport + 1);
    await tabs.getByRole("button", { name: "Монтаж" }).click();
  }
});

test("same-tab reload restores a project but a fresh tab session starts clean", async ({ page }) => {
  await page.goto("/");
  await expect.poll(() => page.evaluate(() => window.sessionStorage.getItem("dravex-active-editor-session-v1"))).toBe("active");
  await expect(page.getByRole("button", { name: /Добавить видео или фото/i })).toBeVisible();
  await page.evaluate(async () => {
    const request = indexedDB.open("dravex-projects", 1);
    const database = await new Promise<IDBDatabase>((resolve, reject) => {
      request.onupgradeneeded = () => {
        if (!request.result.objectStoreNames.contains("projects")) {
          request.result.createObjectStore("projects");
        }
      };
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    const savedFile = new File(["fake-image-data"], "remembered-photo.jpg", { type: "image/jpeg" });
    await new Promise<void>((resolve, reject) => {
      const transaction = database.transaction("projects", "readwrite");
      transaction.objectStore("projects").put({
        files: [savedFile],
        musicFile: null,
        style: "auto",
        duration: 30,
        aspectRatio: "9:16",
        quality: "720p",
        beatSync: true,
        effectStrength: "balanced",
        musicVolume: 0.72,
        transitionMode: "auto",
        savedAt: new Date().toISOString()
      }, "last-project");
      transaction.oncomplete = () => resolve();
      transaction.onerror = () => reject(transaction.error);
      transaction.onabort = () => reject(transaction.error);
    });
    database.close();
  });

  // Reloading the same tab is part of the current session, so its project must return.
  await page.reload();
  await expect(page.locator(".dravex-image-grid")).toHaveCount(1);
  await expect(page.getByText(/1 фотографий добавлено/)).toBeVisible();

  // Clearing sessionStorage simulates opening the site in a genuinely fresh tab.
  await page.evaluate(() => window.sessionStorage.clear());
  await page.reload();
  await expect(page.getByRole("button", { name: /Добавить видео или фото/i })).toBeVisible();
  await expect(page.locator(".dravex-image-grid")).toHaveCount(0);
  const storedFileCount = await page.evaluate(async () => {
    const request = indexedDB.open("dravex-projects", 1);
    const database = await new Promise<IDBDatabase>((resolve, reject) => {
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    const project = await new Promise<{ files?: File[] } | undefined>((resolve, reject) => {
      const transaction = database.transaction("projects", "readonly");
      const getRequest = transaction.objectStore("projects").get("last-project");
      getRequest.onsuccess = () => resolve(getRequest.result);
      getRequest.onerror = () => reject(getRequest.error);
    });
    database.close();
    return project?.files?.length ?? 0;
  });
  expect(storedFileCount).toBe(0);
});

test("browser Back from Music returns to the current editor without losing media", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/");
  const svg = Buffer.from(
    '<svg xmlns="http://www.w3.org/2000/svg" width="320" height="480"><rect width="320" height="480" fill="#243b53"/><circle cx="160" cy="180" r="90" fill="#d9f99d"/></svg>',
    "utf8",
  );
  await page.locator('input[accept="video/*,image/*"]').setInputFiles({
    name: "back-navigation-test.svg",
    mimeType: "image/svg+xml",
    buffer: svg,
  });
  await expect(page.locator(".dravex-photo-preview")).toBeVisible();

  const tabs = page.getByRole("navigation", { name: "Разделы DRAVEX" });
  await tabs.getByRole("button", { name: "Музыка" }).click();
  await expect(page.getByRole("heading", { name: /Твоя музыка/i })).toBeVisible();
  await page.goBack();

  await expect(tabs.getByRole("button", { name: "Монтаж" })).toHaveAttribute("aria-pressed", "true");
  await expect(page.locator(".dravex-photo-preview")).toBeVisible();
  await expect(page.locator(".dravex-image-grid .dravex-image-thumb")).toHaveCount(1);
});

test("choosing a montage style highlights exactly one matching variant", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/");

  const variants = page.locator(".dravex-variant");
  const selected = page.locator(".dravex-variant[aria-pressed='true']");
  await expect(variants).toHaveCount(3);
  // Auto mode stays neutral until the user chooses one of the three edit directions.
  await expect(selected).toHaveCount(0);

  await variants.filter({ hasText: "Агрессивный" }).click();
  await expect(selected).toHaveCount(1);
  await expect(variants.filter({ hasText: "Агрессивный" })).toHaveAttribute("aria-pressed", "true");
  await expect(variants.filter({ hasText: "Динамичный под музыку" })).toHaveAttribute("aria-pressed", "false");

  await variants.filter({ hasText: "Динамичный под музыку" }).click();
  await expect(selected).toHaveCount(1);
  await expect(variants.filter({ hasText: "Динамичный под музыку" })).toHaveAttribute("aria-pressed", "true");
  await expect(variants.filter({ hasText: "Агрессивный" })).toHaveAttribute("aria-pressed", "false");

  const dimensions = await page.evaluate(() => ({
    viewport: document.documentElement.clientWidth,
    page: document.documentElement.scrollWidth,
  }));
  expect(dimensions.page).toBeLessThanOrEqual(dimensions.viewport + 1);
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

test("highlight selection fills sparse peak results with spaced usable frames", () => {
  const samples = Array.from({ length: 5 }, (_, index) => ({
    time: 0.5 + index * 1.7,
    score: index === 2 ? 1 : 0.2 + index * 0.05,
    motion: index * 0.1,
    contrast: 0.3,
  }));
  const sparsePeak = [{
    time: samples[2].time,
    start: samples[2].time - 0.4,
    end: samples[2].time + 0.4,
    score: samples[2].score,
    motion: samples[2].motion,
    contrast: samples[2].contrast,
  }];

  const candidates = ensureCandidateCoverage(samples, sparsePeak, 9);

  expect(candidates.length).toBeGreaterThanOrEqual(4);
  expect(candidates.length).toBeLessThanOrEqual(5);
  expect(candidates.map((item) => item.time)).toEqual(
    [...candidates].map((item) => item.time).sort((a, b) => a - b)
  );
  for (const candidate of candidates) {
    expect(candidate.start).toBeGreaterThanOrEqual(0);
    expect(candidate.end).toBeLessThanOrEqual(9);
    expect(candidate.end).toBeGreaterThan(candidate.start);
  }
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

  // Four distinct, generated SVG scenes make the exported sample useful for checking cuts and camera motion.
  const photoFixtures = [
    { name: "dravex-test-frame-1.svg", mimeType: "image/svg+xml", buffer: Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="480" height="800"><defs><linearGradient id="g" x2="0" y2="1"><stop stop-color="#ff3d6e"/><stop offset="1" stop-color="#171b3d"/></linearGradient></defs><rect width="480" height="800" fill="url(#g)"/><circle cx="240" cy="310" r="120" fill="#fff" fill-opacity=".7"/><path d="M0 650 L180 450 L300 590 L400 500 L480 620 V800 H0Z" fill="#090b12"/></svg>', "utf8") },
    { name: "dravex-test-frame-2.svg", mimeType: "image/svg+xml", buffer: Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="480" height="800"><rect width="480" height="800" fill="#103c70"/><circle cx="300" cy="260" r="150" fill="#54d8ff"/><path d="M0 520 L150 360 L270 600 L380 400 L480 520 V800 H0Z" fill="#07111f"/><path d="M0 700 L240 500 L480 690 V800 H0Z" fill="#f4b942"/></svg>', "utf8") },
    { name: "dravex-test-frame-3.svg", mimeType: "image/svg+xml", buffer: Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="480" height="800"><rect width="480" height="800" fill="#17251c"/><path d="M0 0 H480 V800 H0Z" fill="#d85d27"/><path d="M0 160 L480 0 L480 220 L0 390Z" fill="#f7c35b"/><path d="M0 620 L150 420 L280 620 L380 450 L480 560 V800 H0Z" fill="#101714"/><circle cx="110" cy="220" r="55" fill="#fff0bf"/></svg>', "utf8") },
    { name: "dravex-test-frame-4.svg", mimeType: "image/svg+xml", buffer: Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="480" height="800"><rect width="480" height="800" fill="#24133e"/><path d="M0 0 L480 180 L480 300 L0 120Z" fill="#ec4899"/><path d="M0 400 L480 250 L480 360 L0 510Z" fill="#67e8f9"/><circle cx="260" cy="500" r="135" fill="#f8fafc"/><path d="M0 680 L120 560 L220 680 L360 540 L480 660 V800 H0Z" fill="#090b12"/></svg>', "utf8") }
  ];
  await page.locator('input[accept="video/*,image/*"]').setInputFiles(photoFixtures);

  // The app creates a short real preview after import. Wait for that render to
  // finish before triggering the full montage, because the phone pipeline is serialized.
  await expect(page.locator(".dravex-photo-preview")).toBeVisible();
  await expect(page.locator(".dravex-variant video")).toHaveCount(3, { timeout: 45_000 });
  // Regression guard: preview cards must not compete with the main player for Android decoders.
  const previewCards = page.locator(".dravex-variant video");
  await expect.poll(() => previewCards.evaluateAll((videos) => videos.every((video) =>
    !video.autoplay && !video.loop && video.preload === "none"
  ))).toBe(true);
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
  // Keep a real exported sample so the team can inspect rendered frames, not just green test results.
  await mkdir("test-results", { recursive: true });
  await copyFile(downloadedFile!, "test-results/dravex-photo-montage.webm");
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

  // A moving test pattern plus audio makes the exported sample useful for visual and audio inspection.
  const sourceFixturePath = `/tmp/dravex-test-source-${process.pid}.webm`;
  execFileSync("ffmpeg", [
    "-hide_banner", "-loglevel", "error",
    "-f", "lavfi", "-i", "testsrc2=size=320x240:rate=12",
    "-f", "lavfi", "-i", "sine=frequency=440:sample_rate=48000",
    "-t", "2", "-c:v", "libvpx", "-deadline", "realtime", "-cpu-used", "8",
    "-b:v", "180k", "-g", "12", "-pix_fmt", "yuv420p",
    "-c:a", "libopus", "-b:a", "32k", "-shortest", "-f", "webm", sourceFixturePath, "-y"
  ], { stdio: "pipe" });
  const sourceVideo = await readFile(sourceFixturePath);
  await page.locator('input[accept="video/*,image/*"]').setInputFiles({
    name: "dravex-test-source.webm",
    mimeType: "video/webm",
    buffer: sourceVideo,
  });
  await unlink(sourceFixturePath);

  await expect(page.locator("video.dravex-preview")).toBeVisible();
  await expect(page.locator(".dravex-variant video")).toHaveCount(3, { timeout: 45_000 });
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
  // Preserve a short source-video export for visual review of the real renderer output.
  await mkdir("test-results", { recursive: true });
  await copyFile(downloadedFile!, "test-results/dravex-source-video-montage.webm");
});


for (const sourceDuration of [60, 300]) {
  test(`long source-video montage handles ${sourceDuration}-second input and exports the requested short edit`, async ({ page }) => {
  test.setTimeout(120_000);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/");
  await page.locator("details.dravex-more > summary").click();

  const durationSlider = page.getByRole("slider", { name: "Длительность ролика в секундах" });
  await expect(durationSlider).toBeVisible();
  await durationSlider.focus();
  await durationSlider.press("Home");
  await expect(durationSlider).toHaveValue("5");

  // Tiny 1-minute and 5-minute VP8/WebM clips exercise sampling across the full source timeline.
  const fixturePath = `/tmp/dravex-test-long-source-${process.pid}.webm`;
  execFileSync("ffmpeg", [
    "-hide_banner", "-loglevel", "error",
    "-f", "lavfi", "-i", "color=c=red:s=64x64:r=2",
    "-f", "lavfi", "-i", "sine=frequency=440:sample_rate=48000",
    "-t", String(sourceDuration), "-c:v", "libvpx", "-deadline", "realtime",
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
  await expect(page.locator(".dravex-variant video")).toHaveCount(3, { timeout: 45_000 });
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
  expect(download.suggestedFilename()).toMatch(/\.webm$/);
  const probeOutput = execFileSync("ffprobe", [
    "-v", "error",
    "-show_entries", "format=duration,format_name:stream=codec_type,codec_name,width,height",
    "-of", "json",
    downloadedFile!
  ], { encoding: "utf8" });
  const probe = JSON.parse(probeOutput) as {
    format?: { duration?: string; format_name?: string };
    streams?: Array<{ codec_type?: string; codec_name?: string; width?: number; height?: number }>;
  };
  const videoStream = probe.streams?.find((stream) => stream.codec_type === "video");
  const audioStream = probe.streams?.find((stream) => stream.codec_type === "audio");
  expect(probe.format?.format_name).toContain("webm");
  expect(Number(probe.format?.duration)).toBeGreaterThan(3.5);
  expect(Number(probe.format?.duration)).toBeLessThanOrEqual(5.5);
  expect(videoStream?.codec_name).toMatch(/^(vp8|vp9|av1)$/);
  // The default editor export is 720p vertical; verify the encoded file, not just the preview.
  expect(videoStream?.width).toBe(720);
  expect(videoStream?.height).toBe(1280);
  expect(audioStream?.codec_name).toBe("opus");
  // Preserve each long-source export for frame-by-frame visual review, not only metadata assertions.
  await mkdir("test-results", { recursive: true });
  await copyFile(downloadedFile!, `test-results/dravex-${sourceDuration}-second-source-montage.webm`);
  });
}


test("mobile editor exposes clear material, montage, and result steps", async ({ page }) => {
  await page.setViewportSize({ width: 360, height: 800 });
  await page.goto("/");
  const steps = page.getByRole("group", { name: "Этапы создания видео" });
  await expect(steps).toBeVisible();
  await expect(steps.getByText("Материал")).toBeVisible();
  await expect(steps.getByText("Монтаж")).toBeVisible();
  await expect(steps.getByText("Результат")).toBeVisible();
  await expect(page.getByRole("button", { name: /Добавить видео или фото/i })).toBeVisible();
  await expect(page.getByRole("navigation", { name: "Разделы DRAVEX" })).toBeVisible();
});


test("media intake limits photo count without rejecting a video plus a full photo batch", () => {
  const photos = Array.from({ length: 80 }, (_, index) => ({
    name: `photo-${index}.jpg`,
    type: "image/jpeg",
    size: 1024,
  }));
  const video = { name: "source.mp4", type: "video/mp4", size: 1024 };

  const mixed = assessMediaSelection([video, ...photos]);
  expect(mixed.valid).toBe(true);
  expect(mixed.errors).toEqual([]);

  const tooManyPhotos = assessMediaSelection([
    ...photos,
    { name: "extra.jpg", type: "image/jpeg", size: 1024 },
  ]);
  expect(tooManyPhotos.valid).toBe(false);
  expect(tooManyPhotos.errors[0]).toContain("80 фотографий");
});


test("mobile viewport never creates page-level horizontal overflow in editor or music", async ({ page }) => {
  for (const width of [360, 390]) {
    await page.setViewportSize({ width, height: 800 });
    await page.goto("/");
    const editorDimensions = await page.evaluate(() => ({
      viewport: document.documentElement.clientWidth,
      page: document.documentElement.scrollWidth,
    }));
    expect(editorDimensions.page, `editor overflow at ${width}px`).toBeLessThanOrEqual(editorDimensions.viewport + 1);

    await page.getByRole("navigation", { name: "Разделы DRAVEX" }).getByRole("button", { name: "Музыка" }).click();
    const musicDimensions = await page.evaluate(() => ({
      viewport: document.documentElement.clientWidth,
      page: document.documentElement.scrollWidth,
    }));
    expect(musicDimensions.page, `music overflow at ${width}px`).toBeLessThanOrEqual(musicDimensions.viewport + 1);
  }
});
