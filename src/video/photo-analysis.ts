export type PhotoVisualScore = {
  quality: number;
  exposure: number;
  contrast: number;
  detail: number;
  fingerprint: string;
};

export type PhotoPacing = {
  weights: number[];
  scores: PhotoVisualScore[];
};

/** Score image quality using a small, bounded canvas sample; this is a visual proxy, not semantic understanding. */
export function scorePhotoPixels(pixels: Uint8ClampedArray, width: number, height: number): PhotoVisualScore {
  if (width <= 0 || height <= 0 || pixels.length < width * height * 4) {
    return { quality: 0.5, exposure: 0.5, contrast: 0.5, detail: 0.5, fingerprint: "" };
  }

  const luminance = new Float32Array(width * height);
  let total = 0;
  for (let i = 0, p = 0; i < luminance.length; i += 1, p += 4) {
    const value = 0.2126 * pixels[p] + 0.7152 * pixels[p + 1] + 0.0722 * pixels[p + 2];
    luminance[i] = value;
    total += value;
  }
  const mean = total / luminance.length;
  let variance = 0;
  let edges = 0;
  let edgeCount = 0;
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const value = luminance[y * width + x];
      variance += (value - mean) ** 2;
      if (x + 1 < width) {
        edges += Math.abs(value - luminance[y * width + x + 1]);
        edgeCount += 1;
      }
      if (y + 1 < height) {
        edges += Math.abs(value - luminance[(y + 1) * width + x]);
        edgeCount += 1;
      }
    }
  }
  const deviation = Math.sqrt(variance / luminance.length);
  const exposure = Math.max(0, 1 - Math.abs(mean - 128) / 128);
  const contrast = Math.min(1, deviation / 72);
  const detail = Math.min(1, edgeCount ? (edges / edgeCount) / 42 : 0);

  // Compact average-luminance hash for catching near-identical adjacent photos.
  const grid = 8;
  let fingerprint = "";
  for (let gy = 0; gy < grid; gy += 1) {
    for (let gx = 0; gx < grid; gx += 1) {
      const x = Math.min(width - 1, Math.floor((gx + 0.5) * width / grid));
      const y = Math.min(height - 1, Math.floor((gy + 0.5) * height / grid));
      fingerprint += luminance[y * width + x] >= mean ? "1" : "0";
    }
  }
  const quality = Math.max(0, Math.min(1, exposure * 0.45 + contrast * 0.3 + detail * 0.25));
  return { quality, exposure, contrast, detail, fingerprint };
}

export function photoFingerprintDistance(a: string, b: string): number {
  if (!a || a.length !== b.length) return 1;
  let different = 0;
  for (let i = 0; i < a.length; i += 1) if (a[i] !== b[i]) different += 1;
  return different / a.length;
}

/** Load one image at a time and downsample it to bound memory use on mobile. */
export async function analyzePhotoSet(urls: readonly string[]): Promise<PhotoPacing> {
  const scores: PhotoVisualScore[] = [];
  for (const url of urls) {
    try {
      const image = new Image();
      image.decoding = "async";
      image.src = url;
      await new Promise<void>((resolve, reject) => {
        image.onload = () => resolve();
        image.onerror = () => reject(new Error("Image decode failed"));
      });
      const scale = Math.min(1, 64 / Math.max(image.naturalWidth, image.naturalHeight));
      const width = Math.max(1, Math.round(image.naturalWidth * scale));
      const height = Math.max(1, Math.round(image.naturalHeight * scale));
      const canvas = document.createElement("canvas");
      canvas.width = width;
      canvas.height = height;
      const context = canvas.getContext("2d", { willReadFrequently: true });
      if (!context) throw new Error("Canvas unavailable");
      context.drawImage(image, 0, 0, width, height);
      scores.push(scorePhotoPixels(context.getImageData(0, 0, width, height).data, width, height));
      canvas.width = 1;
      canvas.height = 1;
      image.src = "";
    } catch {
      // A decode/canvas failure should not prevent export; neutral scoring preserves the image.
      scores.push({ quality: 0.5, exposure: 0.5, contrast: 0.5, detail: 0.5, fingerprint: "" });
    }
  }

  const weights = scores.map((score, index) => {
    const previous = index > 0 ? scores[index - 1] : undefined;
    const nearDuplicate = previous && score.fingerprint && previous.fingerprint
      ? photoFingerprintDistance(score.fingerprint, previous.fingerprint) < 0.12
      : false;
    // Quality affects pacing modestly; duplicate shots remain in the chosen order but receive less screen time.
    return Math.max(0.68, Math.min(1.28, 0.88 + score.quality * 0.32 - (nearDuplicate ? 0.2 : 0)));
  });
  return { weights, scores };
}
