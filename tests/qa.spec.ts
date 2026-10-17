import { expect, test } from "@playwright/test";
import { getCameraMotionProfile, shouldContainSource } from "../src/video/video-sequence-render";

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
  await expect(page.locator(".dravex-track-card")).toHaveCount(24);
  await expect(page.locator(".dravex-music-categories").getByRole("button", { name: "Все" })).toBeVisible();
  await expect(page.locator(".dravex-music-categories").getByRole("button", { name: "Gaming" })).toBeVisible();
  await expect(page.locator(".dravex-music-categories").getByRole("button", { name: "Phonk / Drift" })).toBeVisible();
  await expect(page.locator(".dravex-music-categories").getByRole("button", { name: "Anime / Jumpstyle" })).toBeVisible();

  await page.locator(".dravex-music-categories").getByRole("button", { name: "Phonk / Drift" }).click();
  await expect(page.locator(".dravex-track-card").first()).toBeVisible();
  expect(await page.locator(".dravex-track-card").count()).toBeGreaterThan(0);
  await page.locator(".dravex-music-categories").getByRole("button", { name: "Все" }).click();

  const cards = page.locator(".dravex-track-card");
  for (let index = 0; index < 24; index += 1) {
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
