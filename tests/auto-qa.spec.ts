import { expect, test } from "@playwright/test";
import { mkdir, stat, writeFile } from "node:fs/promises";
import path from "node:path";

/**
 * A small, self-contained end-to-end QA run. It creates a synthetic photo,
 * asks DRAVEX to render it, verifies the actual WebM, and stores visual evidence
 * plus machine-readable measurements for review without uploading user media.
 */
test("DRAVEX Auto QA captures a real rendered output and a compact evidence report", async ({ page }) => {
  test.setTimeout(60_000);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/");
  await expect(page).toHaveTitle(/DRAVEX/i);

  const svg = Buffer.from(
    '<svg xmlns="http://www.w3.org/2000/svg" width="480" height="800"><defs><linearGradient id="g" x2="0" y2="1"><stop stop-color="#ff315b"/><stop offset="1" stop-color="#111a38"/></linearGradient></defs><rect width="480" height="800" fill="url(#g)"/><circle cx="240" cy="300" r="120" fill="#f7f7ff"/><path d="M0 640L150 440L270 590L390 470L480 600V800H0Z" fill="#080b13"/></svg>',
    "utf8",
  );
  await page.locator('input[accept="video/*,image/*"]').setInputFiles({
    name: "dravex-auto-qa-fixture.svg",
    mimeType: "image/svg+xml",
    buffer: svg,
  });

  await expect(page.getByText(/Предварительный просмотр готов:/)).toBeVisible({ timeout: 30_000 });
  await page.getByRole("button", { name: "Автомонтаж" }).click();

  const result = page.locator(".dravex-result");
  await expect(result.getByText("Видео готово!")).toBeVisible({ timeout: 30_000 });
  const output = result.locator("video.dravex-output");
  await expect(output).toBeVisible();

  await output.evaluate(async (element: HTMLVideoElement) => {
    if (element.readyState < 1) {
      await new Promise<void>((resolve, reject) => {
        const timer = window.setTimeout(() => reject(new Error("Output metadata timed out")), 10_000);
        element.addEventListener("loadedmetadata", () => { window.clearTimeout(timer); resolve(); }, { once: true });
        element.addEventListener("error", () => { window.clearTimeout(timer); reject(new Error("Output video failed to load")); }, { once: true });
      });
    }
    if (!Number.isFinite(element.duration) || element.duration <= 0 || element.videoWidth <= 0 || element.videoHeight <= 0) {
      throw new Error("Rendered output has invalid duration or dimensions");
    }
    element.currentTime = Math.min(1, element.duration / 2);
    await new Promise<void>((resolve) => {
      const timer = window.setTimeout(resolve, 800);
      element.addEventListener("seeked", () => { window.clearTimeout(timer); resolve(); }, { once: true });
    });
  });

  const outputMetrics = await output.evaluate((video: HTMLVideoElement) => ({
    durationSeconds: video.duration,
    width: video.videoWidth,
    height: video.videoHeight,
    sourceType: video.currentSrc.startsWith("blob:") ? "browser-blob" : "other",
    readyState: video.readyState,
  }));
  expect(outputMetrics.sourceType).toBe("browser-blob");
  expect(outputMetrics.durationSeconds).toBeGreaterThan(2);
  expect(outputMetrics.width).toBeGreaterThan(0);
  expect(outputMetrics.height).toBeGreaterThan(0);

  const evidenceDir = path.join(process.cwd(), "test-results", "visual");
  await mkdir(evidenceDir, { recursive: true });
  await output.screenshot({ path: path.join(evidenceDir, "auto-qa-rendered-frame.png") });
  await result.screenshot({ path: path.join(evidenceDir, "auto-qa-render-result.png") });

  const downloadPromise = page.waitForEvent("download");
  await result.getByRole("link", { name: "Сохранить видео" }).click();
  const download = await downloadPromise;
  expect(download.suggestedFilename()).toMatch(/\.webm$/);
  expect(await download.failure()).toBeNull();
  const filePath = await download.path();
  expect(filePath).toBeTruthy();
  const fileInfo = await stat(filePath!);
  expect(fileInfo.size).toBeGreaterThan(10_000);

  await writeFile(
    path.join(process.cwd(), "test-results", "dravex-visual-checks.json"),
    JSON.stringify({
      generatedAt: new Date().toISOString(),
      test: "photo auto-montage export",
      status: "passed",
      output: outputMetrics,
      export: { filename: download.suggestedFilename(), bytes: fileInfo.size, nonEmpty: fileInfo.size > 10_000 },
      evidence: ["visual/auto-qa-rendered-frame.png", "visual/auto-qa-render-result.png"],
      limitations: [
        "This verifies browser rendering and basic export integrity, not subjective edit quality.",
        "Synthetic SVG fixture is used; no user media is uploaded.",
        "Real Android-device testing remains separate."
      ],
    }, null, 2),
    "utf8",
  );
});
