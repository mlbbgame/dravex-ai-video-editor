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
