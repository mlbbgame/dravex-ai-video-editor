import { expect, test } from "@playwright/test";
import { formatDirectorKnowledge, getDirectorKnowledge, inferDirectorKnowledgeDomain } from "../src/video/director-knowledge";
import { generateLocalPlan } from "../src/video/plan-generator";

test("recognizes gaming prompts without confusing them with general editing", () => {
  expect(inferDirectorKnowledgeDomain("Сделай динамичный эдит по MLBB с фрагами").domain).toBe("gaming");
  expect(getDirectorKnowledge("PUBG Mobile gameplay highlights", "en").principles.join(" ")).toContain("gameplay peaks");
});

test("recognizes automotive, travel, food, sport, people, DIY, and anime domains", () => {
  expect(inferDirectorKnowledgeDomain("дрифт машины и дым").domain).toBe("automotive");
  expect(inferDirectorKnowledgeDomain("путешествие в горы и закат").domain).toBe("nature-travel");
  expect(inferDirectorKnowledgeDomain("рецепт и готовка еды").domain).toBe("food");
  expect(inferDirectorKnowledgeDomain("футбольный матч").domain).toBe("sports");
  expect(inferDirectorKnowledgeDomain("семья и друзья в поездке").domain).toBe("people");
  expect(inferDirectorKnowledgeDomain("DIY ремонт инструмента").domain).toBe("product-diy");
  expect(inferDirectorKnowledgeDomain("anime AMV").domain).toBe("anime");
});

test("ambiguous or empty prompts fall back to general guidance", () => {
  expect(inferDirectorKnowledgeDomain("").domain).toBe("general");
  expect(inferDirectorKnowledgeDomain("сделай красивое видео").domain).toBe("general");
  expect(getDirectorKnowledge("", "ru").principles[0]).toContain("сильные реальные моменты");
});

test("knowledge output includes transparent inference limits and quality checks", () => {
  const lines = formatDirectorKnowledge(getDirectorKnowledge("car drift edit", "en"), "en");
  expect(lines.some((line) => line.includes("not verified recognition"))).toBe(true);
  expect(lines.some((line) => line.includes("QUALITY CHECK"))).toBe(true);
  expect(lines.some((line) => line.includes("Do not imply a maneuver"))).toBe(true);
});

test("generated montage plans include relevant knowledge and honest limitations", () => {
  const plan = generateLocalPlan({
    prompt: "Create an aggressive MLBB gameplay edit",
    style: "velocity",
    duration: "30 seconds",
    aspectRatio: "9:16",
    quality: "1080p",
    language: "en",
    videoNames: ["match.mp4"],
    imageNames: [],
    hasAudio: false
  });
  expect(plan.some((line) => line.includes("AI DIRECTOR KNOWLEDGE — gaming"))).toBe(true);
  expect(plan.some((line) => line.includes("Keep the HUD"))).toBe(true);
  expect(plan.some((line) => line.includes("not a connected language model"))).toBe(true);
});
