/**
 * Lightweight, on-device image-sequence inspection for DRAVEX.
 * This is visual similarity analysis, not semantic AI: it does not identify objects.
 * Original photo order is preserved; only near-duplicate adjacent images receive
 * slightly less screen time so a repeated shot does not dominate the montage.
 */

export type ImageSequenceAnalysis = {
  durationWeights: number[];
  similarAdjacentPairs: number[];
  analyzedCount: number;
};

export function calculateVisualSimilarity(first: number[], second: number[]): number {
  if (!first.length || first.length !== second.length) return 0;
  let difference = 0;
  for (let index = 0; index < first.length; index += 1) {
    difference += Math.abs(first[index] - second[index]) / 255;
  }
  return Math.max(0, Math.min(1, 1 - difference / first.length));
}

async function readImageSignature(url: string): Promise<number[]> {
  const image = new Image();
  image.decoding = "async";
  image.src = url;
  await new Promise<void>((resolve, reject) => {
    if (image.complete && image.naturalWidth > 0) {
      resolve();
      return;
    }
    const timeout = window.setTimeout(() => reject(new Error("Image inspection timed out.")), 10000);
    image.onload = () => {
      window.clearTimeout(timeout);
      resolve();
    };
    image.onerror = () => {
      window.clearTimeout(timeout);
      reject(new Error("Image could not be decoded for inspection."));
    };
  });

  const canvas = document.createElement("canvas");
  canvas.width = 24;
  canvas.height = 24;
  const context = canvas.getContext("2d", { willReadFrequently: true });
  if (!context) throw new Error("Canvas is unavailable.");
  context.drawImage(image, 0, 0, canvas.width, canvas.height);
  const pixels = context.getImageData(0, 0, canvas.width, canvas.height).data;
  const signature: number[] = [];
  // Keep RGB samples (not just average color) so similarly coloured but different
  // landscapes are less likely to be mistaken for duplicates.
  for (let offset = 0; offset < pixels.length; offset += 4) {
    signature.push(pixels[offset], pixels[offset + 1], pixels[offset + 2]);
  }
  return signature;
}

export async function analyzeImageSequence(urls: string[]): Promise<ImageSequenceAnalysis> {
  const signatures: Array<number[] | null> = await Promise.all(urls.map(async (url) => {
    try {
      return await readImageSignature(url);
    } catch {
      // Analysis must never block a usable montage; renderer will report decode errors.
      return null;
    }
  }));

  const durationWeights = urls.map(() => 1);
  const similarAdjacentPairs: number[] = [];
  for (let index = 1; index < signatures.length; index += 1) {
    const previous = signatures[index - 1];
    const current = signatures[index];
    if (!previous || !current) continue;
    const similarity = calculateVisualSimilarity(previous, current);
    if (similarity >= 0.975) {
      similarAdjacentPairs.push(index);
      durationWeights[index] = 0.72;
    }
  }
  return {
    durationWeights,
    similarAdjacentPairs,
    analyzedCount: signatures.filter((signature) => signature !== null).length,
  };
}
