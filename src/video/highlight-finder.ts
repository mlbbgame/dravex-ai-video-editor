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

/**
 * Very short clips use deterministic cuts to avoid expensive/flaky seeks on mobile.
 * Longer short-form clips should sample real frames so montage selection can respond
 * to motion and contrast instead of assigning synthetic, nearly identical scores.
 */
export function shouldUseQuickVideoCandidates(duration: number): boolean {
  return Number.isFinite(duration) && duration >= 0.25 && duration <= 3;
}

/** Build deterministic cut points for short clips without seeking through every frame. */
export function buildQuickVideoCandidates(duration: number): HighlightMoment[] {
  if (!Number.isFinite(duration) || duration < 0.25) return [];
  const count = Math.max(2, Math.min(8, Math.ceil(duration / 1.5)));
  const segmentDuration = duration / count;
  return Array.from({ length: count }, (_, index) => {
    const start = index * segmentDuration;
    const end = Math.min(duration, (index + 1) * segmentDuration);
    return {
      time: (start + end) / 2,
      start,
      end,
      score: 1 - index / (count * 10),
      motion: 0,
      contrast: 0
    };
  });
}

function waitForMetadata(video: HTMLVideoElement): Promise<void> {
  if (video.readyState >= 1 && Number.isFinite(video.duration) && video.duration > 0) {
    return Promise.resolve();
  }

  return new Promise((resolve, reject) => {
    let timeoutId = 0;
    const cleanup = () => {
      window.clearTimeout(timeoutId);
      video.removeEventListener("loadedmetadata", checkReady);
      video.removeEventListener("durationchange", checkReady);
      video.removeEventListener("error", failed);
    };
    const checkReady = () => {
      if (video.readyState >= 1 && Number.isFinite(video.duration) && video.duration > 0) {
        cleanup();
        resolve();
      }
    };
    const failed = () => {
      cleanup();
      reject(new Error("Браузер не смог прочитать видео. Попробуй MP4 (H.264) или WebM с известной длительностью."));
    };

    video.addEventListener("loadedmetadata", checkReady);
    video.addEventListener("durationchange", checkReady);
    video.addEventListener("error", failed, { once: true });
    timeoutId = window.setTimeout(() => {
      cleanup();
      reject(new Error("Браузер не смог определить длительность видео за 20 секунд. Попробуй MP4 (H.264) или более короткий файл."));
    }, 20_000);
    // Metadata may already have loaded before listeners were attached.
    checkReady();
    if (video.readyState < 1) video.load();
  });
}

/** Read duration without sampling frames, used as a safe fallback for auto-montage. */
export async function getVideoDuration(url: string): Promise<number> {
  const video = document.createElement("video");
  video.preload = "metadata";
  video.muted = true;
  video.playsInline = true;
  video.src = url;
  try {
    await waitForMetadata(video);
    return video.duration;
  } finally {
    video.pause();
    video.removeAttribute("src");
    video.load();
  }
}

function seekTo(video: HTMLVideoElement, time: number, timeoutMs = 12000): Promise<void> {
  const target = Math.min(Math.max(0, time), Math.max(0, video.duration - 0.05));
  // Some browsers do not fire "seeked" when asked to seek to the current frame.
  if (video.readyState >= 2 && Math.abs(video.currentTime - target) < 0.02) return Promise.resolve();

  return new Promise((resolve, reject) => {
    let timeoutId = 0;
    const cleanup = () => {
      window.clearTimeout(timeoutId);
      video.removeEventListener("seeked", finish);
      video.removeEventListener("error", fail);
    };
    const finish = () => { cleanup(); resolve(); };
    const fail = () => {
      cleanup();
      reject(new Error("Не удалось прочитать кадр видео. Попробуй MP4 или WebM."));
    };
    video.addEventListener("seeked", finish, { once: true });
    video.addEventListener("error", fail, { once: true });
    timeoutId = window.setTimeout(() => {
      cleanup();
      reject(new Error("Видео слишком долго обрабатывается. Используем быстрый резервный монтаж."));
    }, timeoutMs);
    try {
      video.currentTime = target;
    } catch {
      fail();
    }
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
 * Prevent sparse peak detection from producing a one-shot montage when a clip
 * contains usable frames but no clean local maxima (common with short/mobile video).
 * Preserve strong peaks, then fill missing coverage with spaced high-scoring samples.
 */
export function ensureCandidateCoverage(
  samples: HighlightSample[],
  candidates: HighlightMoment[],
  duration: number
): HighlightMoment[] {
  if (!Number.isFinite(duration) || duration < 0.25 || !samples.length) return candidates;
  const result = [...candidates];
  const targetCount = Math.min(4, samples.length);
  const spacing = Math.max(0.6, Math.min(2.2, duration / 8));
  const ranked = [...samples].sort((a, b) => b.score - a.score);
  for (const sample of ranked) {
    if (result.length >= targetCount) break;
    if (result.some((item) => Math.abs(item.time - sample.time) < spacing)) continue;
    const half = Math.max(0.12, Math.min(0.8, duration / 6));
    result.push({
      time: sample.time,
      start: Math.max(0, sample.time - half),
      end: Math.min(duration, sample.time + half),
      score: sample.score,
      motion: sample.motion,
      contrast: sample.contrast
    });
  }
  return result.sort((a, b) => a.time - b.time);
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
    if (!Number.isFinite(duration) || duration < 0.25) {
      throw new Error("Не удалось определить длительность видео. Попробуй другой файл.");
    }
    // Short clips do not need expensive frame-by-frame seeking. On Android this
    // avoids flaky seek events while still producing a clean, evenly spaced edit.
    if (shouldUseQuickVideoCandidates(duration)) {
      const candidates = buildQuickVideoCandidates(duration);
      const samples: HighlightSample[] = candidates.map(({ time, score, motion, contrast }) => ({
        time, score, motion, contrast
      }));
      onProgress?.({ current: candidates.length, total: candidates.length, time: duration });
      return { duration, samples, candidates };
    }
    const canvas = document.createElement("canvas");
    canvas.width = 80;
    canvas.height = 45;
    const context = canvas.getContext("2d", { willReadFrequently: true });
    if (!context) throw new Error("Frame analysis is not supported by this browser.");

    // Long sources are sampled across the entire timeline with a strict mobile budget.
    // A dozen representative frames are preferable to leaving the editor blocked for minutes.
    const isLongSource = duration >= 30;
    const sampleLimit = isLongSource ? 12 : 60;
    const interval = Math.max(2, duration / sampleLimit);
    const total = Math.max(2, Math.min(sampleLimit, Math.ceil(duration / interval)));
    const raw: Array<{ time: number; motion: number; contrast: number; saturation: number }> = [];
    let previous: Uint8ClampedArray | null = null;
    const analysisStartedAt = performance.now();
    // Never let frame scanning monopolize a phone for several minutes. The caller
    // can fall back to evenly spaced cuts while still exporting a usable video.
    const analysisBudgetMs = isLongSource ? 18_000 : 45_000;

    for (let index = 0; index < total; index += 1) {
      if (performance.now() - analysisStartedAt > analysisBudgetMs) {
        throw new Error("Анализ длинного видео занял слишком много времени — используем равномерный монтаж.");
      }
      const time = Math.min(duration - 0.08, index * interval + Math.min(0.12, interval * 0.08));
      await seekTo(video, time, isLongSource ? 2200 : 12000);
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
    }    const selectedPeaks = [...bucketPeaks];
    for (const peak of peaks) {
      if (selectedPeaks.length >= 100) break;
      if (selectedPeaks.some((item) => Math.abs(item.time - peak.time) < minimumGap)) continue;
      selectedPeaks.push(peak);
    }
    let candidates: HighlightMoment[] = selectedPeaks.map((peak) => {
      const half = Math.max(0.25, Math.min(2.4, interval * 0.8));
      return {
        time: peak.time,
        start: Math.max(0, peak.time - half),
        end: Math.min(duration, peak.time + half),
        score: peak.score,
        motion: peak.motion,
        contrast: peak.contrast
      };
    }).sort((a, b) => a.time - b.time);

    // Very short clips may not contain a local peak away from the edges.
    // Keep them usable by ranking the sampled frames instead of rejecting the file.
    candidates = ensureCandidateCoverage(samples, candidates, duration);
    if (!candidates.length) throw new Error("Не удалось найти подходящие кадры в этом видео.");
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