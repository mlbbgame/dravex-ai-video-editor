import { expect, test } from "@playwright/test";
import { assessMediaSelection } from "../src/video/media-intake";

function media(name: string, size: number, type = "") {
  return { name, size, type };
}

test("allows a normal set of photos without warnings", () => {
  const result = assessMediaSelection([
    media("one.jpg", 2 * 1024 * 1024, "image/jpeg"),
    media("two.webp", 3 * 1024 * 1024, "image/webp"),
  ]);
  expect(result.valid).toBe(true);
  expect(result.errors).toEqual([]);
  expect(result.warnings).toEqual([]);
  expect(result.totalBytes).toBe(5 * 1024 * 1024);
});

test("warns about a large video but does not block it", () => {
  const result = assessMediaSelection([media("phone.mp4", 300 * 1024 * 1024, "video/mp4")]);
  expect(result.valid).toBe(true);
  expect(result.errors).toEqual([]);
  expect(result.warnings.join(" ")).toContain("Большое видео");
});

test("warns when a batch of photos is memory intensive", () => {
  const result = assessMediaSelection([
    media("one.jpg", 70 * 1024 * 1024, "image/jpeg"),
    media("two.jpg", 60 * 1024 * 1024, "image/jpeg"),
  ]);
  expect(result.valid).toBe(true);
  expect(result.warnings.join(" ")).toContain("Общий размер фотографий большой");
});

test("rejects an excessively large photo batch with a clear explanation", () => {
  const files = Array.from({ length: 81 }, (_, index) => media(`photo-${index}.jpg`, 1024, "image/jpeg"));
  const result = assessMediaSelection(files);
  expect(result.valid).toBe(false);
  expect(result.errors[0]).toContain("не более 80 фотографий");
});

test("does not emit size warnings for a small file with an unknown extension", () => {
  const result = assessMediaSelection([media("archive.bin", 1024, "application/octet-stream")]);
  expect(result.valid).toBe(true);
  expect(result.warnings).toEqual([]);
});


test("rejects empty media files before browser decoding", () => {
  const result = assessMediaSelection([
    media("empty-clip.mp4", 0, "video/mp4"),
  ]);

  expect(result.valid).toBe(false);
  expect(result.totalBytes).toBe(0);
  expect(result.errors.join(" ")).toContain("empty-clip.mp4");
  expect(result.errors.join(" ")).toContain("пустой");
});

test("invalid file sizes never poison the total size calculation", () => {
  const result = assessMediaSelection([
    media("unknown-size.mp4", Number.NaN, "video/mp4"),
    media("negative-size.jpg", -10, "image/jpeg"),
    media("valid.jpg", 1024, "image/jpeg"),
  ]);

  expect(result.valid).toBe(false);
  expect(result.totalBytes).toBe(1024);
  expect(Number.isFinite(result.totalBytes)).toBe(true);
  expect(result.errors.join(" ")).toContain("2 файлов");
});


test("warns when multiple large videos are selected together", () => {
  const result = assessMediaSelection([
    media("first.mp4", 150 * 1024 * 1024, "video/mp4"),
    media("second.mp4", 180 * 1024 * 1024, "video/mp4"),
  ]);

  expect(result.valid).toBe(true);
  expect(result.errors).toEqual([]);
  expect(result.warnings.join(" ")).toContain("несколько больших видео");
  expect(result.warnings.join(" ")).toContain("монтировать по одному видео");
  expect(result.warnings).toHaveLength(1);
});


test("warns about combined memory pressure for a large video plus photos", () => {
  const result = assessMediaSelection([
    media("phone.mp4", 300 * 1024 * 1024, "video/mp4"),
    media("one.jpg", 70 * 1024 * 1024, "image/jpeg"),
    media("two.jpg", 60 * 1024 * 1024, "image/jpeg"),
  ]);

  expect(result.valid).toBe(true);
  expect(result.totalBytes).toBe(430 * 1024 * 1024);
  expect(result.warnings.join(" ")).toContain("Большое видео");
  expect(result.warnings.join(" ")).toContain("Общий объём выбранных файлов");
  expect(result.warnings.join(" ")).toContain("обработать видео отдельно");
});

test("keeps a single large-video warning when no extra media increases memory pressure", () => {
  const result = assessMediaSelection([media("phone.mp4", 500 * 1024 * 1024, "video/mp4")]);

  expect(result.valid).toBe(true);
  expect(result.warnings).toHaveLength(1);
  expect(result.warnings[0]).toContain("Большое видео");
});
