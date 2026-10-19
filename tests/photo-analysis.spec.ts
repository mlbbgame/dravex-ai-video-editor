import { expect, test } from "@playwright/test";
import { photoFingerprintDistance, scorePhotoPixels } from "../src/video/photo-analysis";

function solid(width: number, height: number, value: number): Uint8ClampedArray {
  const pixels = new Uint8ClampedArray(width * height * 4);
  for (let i = 0; i < pixels.length; i += 4) {
    pixels[i] = value;
    pixels[i + 1] = value;
    pixels[i + 2] = value;
    pixels[i + 3] = 255;
  }
  return pixels;
}

test("scores exposure, contrast and detail without producing invalid values", () => {
  const width = 16;
  const height = 16;
  const flat = scorePhotoPixels(solid(width, height, 128), width, height);
  const dark = scorePhotoPixels(solid(width, height, 0), width, height);
  const texturedPixels = solid(width, height, 0);
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const offset = (y * width + x) * 4;
      const value = (x + y) % 2 === 0 ? 48 : 208;
      texturedPixels[offset] = value;
      texturedPixels[offset + 1] = value;
      texturedPixels[offset + 2] = value;
    }
  }
  const textured = scorePhotoPixels(texturedPixels, width, height);

  expect(flat.exposure).toBeGreaterThan(dark.exposure);
  expect(textured.detail).toBeGreaterThan(flat.detail);
  expect(textured.contrast).toBeGreaterThan(flat.contrast);
  for (const score of [flat, dark, textured]) {
    expect(Number.isFinite(score.quality)).toBe(true);
    expect(score.quality).toBeGreaterThanOrEqual(0);
    expect(score.quality).toBeLessThanOrEqual(1);
    expect(score.fingerprint).toHaveLength(64);
  }
});

test("detects matching fingerprints and safely handles unavailable fingerprints", () => {
  expect(photoFingerprintDistance("1010", "1010")).toBe(0);
  expect(photoFingerprintDistance("1111", "0000")).toBe(1);
  expect(photoFingerprintDistance("", "0000")).toBe(1);
});
