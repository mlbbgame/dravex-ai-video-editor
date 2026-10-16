export type HighlightSample = {
  time: number;
  score: number;
  motion: number;
  contrast: number;
};

export type HighlightMoment = {
  time: number;
  start: number;
  end: number;
  score: number;
  motion: number;
  contrast: number;
};

export type HighlightVariant = {
  id: "aggressive" | "cinematic" | "slow";
  title: string;
  description: string;
  shotLength: number;
  duration: number;
  moments: HighlightMoment[];
};

export type HighlightProgress = {
  current: number;
  total: number;
  time: number;
};

function waitForMetadata(video: HTMLVideoElement): Promise<void> {
  return new Promise((resolve, reject) => {
    if (video.readyState >= 1 && Number.isFinite(video.duration)) {
      resolve();
      return;
    }
    const loaded = () => { cleanup(); resolve(); };
    const failed = () => { cleanup(); reject(new Error("The browser could not read this video. Try a common MP4 or WebM file.")); };
    const cleanup = () => {
      video.removeEventListener("loadedmetadata", loaded);
      video.removeEventListener("error", failed);
    };
    video.addEventListener("loadedmetadata", loaded, { once: true });
    video.addEventListener("error", failed, { once: true });
    video.load();
  });
}

function seekTo(video: HTMLVideoElement, time: number): Promise<void> {
  return new Promise((resolve, reject) => {
    const finish = () => { cleanup(); resolve(); };
    const fail = () => { cleanup(); reject(new Error("The browser could not inspect a frame. Try another video format.")); };
    const cleanup = () => {
      video.removeEventListener("seeked", finish);
      video.removeEventListener("error", fail);
    };
    video.addEventListener("seeked", finish, { once: true });
    video.addEventListener("error", fail, { once: true });
    video.currentTime = Math.min(Math.max(0, time), Math.max(0, video.duration - 0.05));
  });
}

function frameFeatures(data: Uint8ClampedArray) {
  let sum = 0;
  let saturation = 0;
  const lumas: number[] = [];
  for (let i = 0; i < data.length; i += 4) {
    const r = data[i] / 255;
    const g = data[i + 1] / 255;
    const b = data[i + 2] / 255;
    const max = Math.max(r, g, b);
    const min = Math.min(r, g, b);
    const luma = 0.2126 * r + 0.7152 * g + 0.0722 * b;
    sum += luma;
    saturation += max > 0 ? (max - min) / max : 0;
    lumas.push(luma);
  }
  const mean = sum / lumas.length;
  let variance = 0;
  for (const luma of lumas) variance += Math.abs(luma - mean);
  return { contrast: variance / lumas.length, saturation: saturation / lumas.length };
}

/**
 * A lightweight browser-only visual scan. It detects visual change and contrast;
 * it is deliberately not described as semantic AI or character/emotion recognition.
 */
export async function analyzeVideoForHighlights(
  url: string,
  onProgress?: (progress: HighlightProgress) => void
): Promise<{ duration: number; samples: HighlightSample[]; candidates: HighlightMoment[] }> {
  const video = document.createElement("video");
  video.preload = "metadata";
  video.muted = true;
  video.playsInline = true;
  video.crossOrigin = "anonymous";
  video.src = url;
  try {
    await waitForMetadata(video);
    const duration = video.duration;
    if (!Number.isFinite(duration) || duration < 8) {
      throw new Error("This video is too short for highlight analysis (minimum 8 seconds).");
    }
    const canvas = document.createElement("canvas");
    canvas.width = 80;
    canvas.height = 45;
    const context = canvas.getContext("2d", { willReadFrequently: true });
    if (!context) throw new Error("Frame analysis is not supported by this browser.");

    // Cap work on very long files to keep the Android browser more responsive.
    const interval = Math.max(1.5, duration / 900, duration > 1800 ? 4 : 0);
    const total = Math.max(2, Math.ceil(duration / interval));
    const raw: Array<{ time: number; motion: number; contrast: number; saturation: number }> = [];
    let previous: Uint8ClampedArray | null = null;

    for (let index = 0; index < total; index += 1) {
      const time = Math.min(duration - 0.08, index * interval + Math.min(0.12, interval * 0.08));
      await seekTo(video, time);
      context.drawImage(video, 0, 0, canvas.width, canvas.height);
      const pixels = context.getImageData(0, 0, canvas.width, canvas.height).data;
      const features = frameFeatures(pixels);
      let motion = 0;
      if (previous) {
        for (let i = 0; i < pixels.length; i += 4) {
          motion += (Math.abs(pixels[i] - previous[i]) + Math.abs(pixels[i + 1] - previous[i + 1]) + Math.abs(pixels[i + 2] - previous[i + 2])) / (3 * 255);
        }
        motion /= pixels.length / 4;
      }
      raw.push({ time, motion, contrast: features.contrast, saturation: features.saturation });
      previous = new Uint8ClampedArray(pixels);
      onProgress?.({ current: index + 1, total, time });
      if (index % 8 === 7) await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
    }

    const normalize = (value: number, values: number[]) => {
      const sorted = [...values].sort((a, b) => a - b);
      const low = sorted[Math.floor((sorted.length - 1) * 0.1)] ?? 0;
      const high = sorted[Math.floor((sorted.length - 1) * 0.9)] ?? 1;
      return high - low < 0.0001 ? 0.5 : Math.max(0, Math.min(1, (value - low) / (high - low)));
    };
    const motionValues = raw.map((item) => item.motion);
    const contrastValues = raw.map((item) => item.contrast);
    const samples: HighlightSample[] = raw.map((item) => ({
      time: item.time,
      motion: item.motion,
      contrast: item.contrast,
      score: normalize(item.motion, motionValues) * 0.62
        + normalize(item.contrast, contrastValues) * 0.25
        + item.saturation * 0.13
    }));

    const peaks = samples.filter((sample, index) => {
      const left = samples[index - 1]?.score ?? -1;
      const right = samples[index + 1]?.score ?? -1;
      return sample.score >= left && sample.score >= right && sample.time > 1 && sample.time < duration - 1;
    }).sort((a, b) => b.score - a.score);

    const minimumGap = Math.max(3.5, Math.min(9, duration / 70));
    const bucketCount = Math.min(80, Math.max(12, Math.ceil(duration / 90)));
    const bucketWidth = duration / bucketCount;
    const bucketPeaks: HighlightSample[] = [];
    for (const peak of peaks) {
      const bucket = Math.min(bucketCount - 1, Math.floor(peak.time / bucketWidth));
      if (!bucketPeaks.some((item) => Math.min(bucketCount - 1, Math.floor(item.time / bucketWidth)) === bucket)) bucketPeaks.push(peak);
    }
    const selectedPeaks = [...bucketPeaks];
    for (const peak of peaks) {
      if (selectedPeaks.length >= 100) break;
      if (selectedPeaks.some((item) => Math.abs(item.time - peak.time) < minimumGap)) continue;
      selectedPeaks.push(peak);
    }
    const candidates: HighlightMoment[] = selectedPeaks.map((peak) => {
      const half = Math.max(1.2, Math.min(2.4, interval * 0.8));
      return {
        time: peak.time,
        start: Math.max(0, peak.time - half),
        end: Math.min(duration, peak.time + half),
        score: peak.score,
        motion: peak.motion,
        contrast: peak.contrast
      };
    }).sort((a, b) => a.time - b.time);
    if (!candidates.length) throw new Error("No usable visual moments were found in this file.");
    return { duration, samples, candidates };
  } finally {
    video.pause();
    video.removeAttribute("src");
    video.load();
  }
}

function chooseSpread(candidates: HighlightMoment[], count: number, spacing: number, mode: HighlightVariant["id"], sourceDuration: number) {
  const ranked = [...candidates].sort((a, b) => {
    const scoreA = a.score * (mode === "aggressive" ? 1.2 : mode === "slow" ? 0.78 : 1);
    const scoreB = b.score * (mode === "aggressive" ? 1.2 : mode === "slow" ? 0.78 : 1);
    return scoreB - scoreA;
  });
  const selected: HighlightMoment[] = [];
  // Seed the cut with the strongest moment from evenly spaced time buckets so a long source
  // does not accidentally become an edit from one short action-heavy stretch.
  for (let bucket = 0; bucket < count; bucket += 1) {
    const from = sourceDuration * bucket / count;
    const to = sourceDuration * (bucket + 1) / count;
    const best = ranked.find((item) => item.time >= from && (bucket === count - 1 ? item.time <= to : item.time < to));
    if (best && selected.every((item) => Math.abs(item.time - best.time) >= spacing)) selected.push(best);
  }
  for (const item of ranked) {
    if (selected.length >= count) break;
    if (selected.every((existing) => Math.abs(existing.time - item.time) >= spacing)) selected.push(item);
  }
  // If spacing is too strict for a short source, fill with the best remaining distinct candidates.
  for (const item of ranked) {
    if (selected.length >= count) break;
    if (!selected.some((existing) => existing.time === item.time)) selected.push(item);
  }
  return selected.sort((a, b) => a.time - b.time).slice(0, count);
}

export function buildHighlightVariants(candidates: HighlightMoment[], sourceDuration: number): HighlightVariant[] {
  const configs: Array<{ id: HighlightVariant["id"]; title: string; description: string; shotLength: number; desired: number; spacing: number }> = [
    { id: "aggressive", title: "Агрессивный", description: "Короткие ударные фрагменты и быстрый темп", shotLength: 1.35, desired: 42, spacing: 2.8 },
    { id: "cinematic", title: "Кинематографичный", description: "Более длинные кадры с нарастанием к кульминации", shotLength: 2.5, desired: 22, spacing: 4.2 },
    { id: "slow", title: "Плавный / атмосферный", description: "Длиннее держит выразительные кадры, меньше резких смен", shotLength: 3.5, desired: 16, spacing: 5.5 }
  ];
  return configs.map((config) => {
    const availableCount = Math.max(1, Math.floor(sourceDuration / (config.shotLength + 0.35)));
    const count = Math.min(config.desired, availableCount, candidates.length);
    const moments = chooseSpread(candidates, count, config.spacing, config.id, sourceDuration).map((moment) => {
      const half = config.shotLength / 2;
      const start = Math.max(0, Math.min(sourceDuration - config.shotLength, moment.time - half));
      return {
        ...moment,
        start,
        end: Math.min(sourceDuration, start + config.shotLength)
      };
    });
    const duration = moments.reduce((sum, item) => sum + Math.max(0, item.end - item.start), 0);
    return { id: config.id, title: config.title, description: config.description, shotLength: config.shotLength, duration, moments };
  });
}
