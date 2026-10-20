export type HighlightSample = {
  time: number;
  score: number;
  motion: number;
  contrast: number;
  sharpness?: number;
  saturation?: number;
  brightness?: number;
  exposure?: number;
};

export type HighlightMoment = {
  time: number;
  start: number;
  end: number;
  score: number;
  motion: number;
  contrast: number;
  sharpness?: number;
  saturation?: number;
  brightness?: number;
  exposure?: number;
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
      contrast: 0,
      sharpness: 0.5,
      brightness: 0.5,
      exposure: 1
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

function seekTo(video: HTMLVideoElement, time: number): Promise<void> {
  const target = Math.min(Math.max(0, time), Math.max(0, video.duration - 0.05));
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
      reject(new Error("Видео слишком долго обрабатывается. Попробуй более короткий файл."));
    }, 12_000);
    try {
      video.currentTime = target;
    } catch {
      fail();
    }
  });
}

type FrameFeatures = {
  contrast: number;
  saturation: number;
  brightness: number;
  sharpness: number;
  exposure: number;
};

/** Low-resolution frame features; deliberately not semantic/object recognition. */
function frameFeatures(data: Uint8ClampedArray, width = 80, height = 45): FrameFeatures {
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
  const brightness = lumas.length ? sum / lumas.length : 0;
  let variance = 0;
  for (const luma of lumas) variance += Math.abs(luma - brightness);
  const contrast = lumas.length ? variance / lumas.length : 0;

  // Approximate edge detail from neighbouring pixels. This is a useful sharpness
  // proxy, not a full blur detector; it helps avoid ranking motion alone too highly.
  let edgeSum = 0;
  let edgeCount = 0;
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const index = y * width + x;
      if (x + 1 < width) {
        edgeSum += Math.abs(lumas[index] - lumas[index + 1]);
        edgeCount += 1;
      }
      if (y + 1 < height) {
        edgeSum += Math.abs(lumas[index] - lumas[index + width]);
        edgeCount += 1;
      }
    }
  }
  const sharpness = edgeCount ? Math.min(1, (edgeSum / edgeCount) * 4) : 0;
  const meanSaturation = lumas.length ? saturation / lumas.length : 0;
  // Penalize severely under- or over-exposed frames without rejecting intentional darkness.
  const exposure = Math.max(0, 1 - Math.max(0, 0.12 - brightness) * 4 - Math.max(0, brightness - 0.9) * 3);
  return { contrast, saturation: meanSaturation, brightness, sharpness, exposure };
}

function normalize(values: number[]): number[] {
  if (!values.length) return [];
  const sorted = [...values].sort((a, b) => a - b);
  const low = sorted[Math.floor((sorted.length - 1) * 0.1)] ?? 0;
  const high = sorted[Math.floor((sorted.length - 1) * 0.9)] ?? 1;
  if (high - low < 0.0001) return values.map(() => 0.5);
  return values.map((value) => Math.max(0, Math.min(1, (value - low) / (high - low))));
}

/**
 * Combine motion with image readability/detail and exposure.
 * This prevents the detector from treating every large visual change as a good moment.
 */
export function scoreVisualSamples(
  samples: Array<Omit<HighlightSample, "score"> & { score?: number }>
): HighlightSample[] {
  const motion = normalize(samples.map((item) => item.motion));
  const contrast = normalize(samples.map((item) => item.contrast));
  const sharpness = normalize(samples.map((item) => item.sharpness ?? 0.5));
  // Keep saturation and exposure absolute: normalizing these across the clip would
  // hide a source where every frame is badly exposed or almost monochrome.
  const saturation = samples.map((item) => Math.max(0, Math.min(1, item.saturation ?? 0.5)));
  const exposure = samples.map((item) => Math.max(0, Math.min(1, item.exposure ?? 1)));
  return samples.map((item, index) => ({
    ...item,
    score: motion[index] * 0.28
      + contrast[index] * 0.18
      + sharpness[index] * 0.30
      + saturation[index] * 0.08
      + exposure[index] * 0.16
  }));
}

/**
 * Select moments using both visual quality peaks and changes in motion.
 * Motion changes are only a visual event proxy, not semantic action recognition.
 * Candidates are spread over the source so one busy section cannot dominate.
 */
export function buildSceneAwareCandidates(
  samples: HighlightSample[],
  duration: number,
  sampleInterval = 2
): HighlightMoment[] {
  if (!Number.isFinite(duration) || duration <= 0 || samples.length === 0) return [];
  const valid = samples.filter((sample) =>
    Number.isFinite(sample.time) &&
    sample.time >= 0 &&
    sample.time <= duration &&
    Number.isFinite(sample.score) &&
    Number.isFinite(sample.motion)
  ).sort((a, b) => a.time - b.time);
  if (!valid.length) return [];

  const normalizedMotion = normalize(valid.map((sample) => sample.motion));
  const normalizedQuality = normalize(valid.map((sample) => sample.score));
  const motionChanges = valid.map((sample, index) => {
    if (index === 0) return 0;
    return Math.abs(sample.motion - valid[index - 1].motion);
  });
  const normalizedChanges = normalize(motionChanges);
  const ranked = valid.map((sample, index) => {
    const leftQuality = normalizedQuality[index - 1] ?? -1;
    const rightQuality = normalizedQuality[index + 1] ?? -1;
    const qualityPeak = normalizedQuality[index] >= leftQuality && normalizedQuality[index] >= rightQuality;
    const leftMotion = normalizedMotion[index - 1] ?? -1;
    const rightMotion = normalizedMotion[index + 1] ?? -1;
    const motionPeak = normalizedMotion[index] >= leftMotion && normalizedMotion[index] >= rightMotion;
    const eventSignal = Math.max(
      motionPeak ? normalizedMotion[index] : 0,
      normalizedChanges[index] * 0.9
    );
    const edgePenalty = Math.max(0, 0.35 - (sample.sharpness ?? 0.5)) * 0.3;
    const score = normalizedQuality[index] * 0.68 + eventSignal * 0.32 - edgePenalty;
    return { sample, index, score, eligible: qualityPeak || motionPeak || normalizedChanges[index] > 0.75 };
  }).sort((a, b) => b.score - a.score);

  const bucketCount = Math.min(80, Math.max(1, Math.ceil(duration / Math.max(3, sampleInterval * 2))));
  const bucketWidth = duration / bucketCount;
  const minimumGap = Math.max(1.25, Math.min(5, sampleInterval * 1.4));
  const desiredCount = Math.min(100, Math.max(1, Math.ceil(duration / Math.max(3, sampleInterval * 1.5))));
  const selected: typeof ranked = [];

  // Prefer one high-value candidate from each part of the timeline.
  for (let bucket = 0; bucket < bucketCount && selected.length < desiredCount; bucket += 1) {
    const from = bucket * bucketWidth;
    const to = (bucket + 1) * bucketWidth;
    const best = ranked.find((item) =>
      item.eligible &&
      item.sample.time >= from &&
      (bucket === bucketCount - 1 ? item.sample.time <= to : item.sample.time < to) &&
      selected.every((chosen) => Math.abs(chosen.sample.time - item.sample.time) >= minimumGap)
    );
    if (best) selected.push(best);
  }

  // Add strong local moments if a timeline bucket was quiet.
  for (const item of ranked) {
    if (selected.length >= desiredCount) break;
    if (selected.every((chosen) => Math.abs(chosen.sample.time - item.sample.time) >= minimumGap)) selected.push(item);
  }

  // Very static videos still need useful coverage; evenly spaced samples are safer
  // than repeating a single detected moment or fabricating a semantic label.
  for (let index = 0; selected.length < desiredCount && index < valid.length; index += 1) {
    const targetTime = duration * (index + 0.5) / Math.min(desiredCount, valid.length);
    const nearest = valid.reduce((best, sample) =>
      Math.abs(sample.time - targetTime) < Math.abs(best.time - targetTime) ? sample : best
    );
    if (selected.some((chosen) => Math.abs(chosen.sample.time - nearest.time) < 0.05)) continue;
    selected.push({
      sample: nearest,
      index: valid.indexOf(nearest),
      score: nearest.score * 0.5,
      eligible: false
    });
  }

  const halfWindow = Math.max(0.35, Math.min(2.4, sampleInterval * 0.8));
  return selected
    .sort((a, b) => a.sample.time - b.sample.time)
    .map(({ sample, score }) => ({
      time: sample.time,
      start: Math.max(0, sample.time - halfWindow),
      end: Math.min(duration, Math.max(sample.time + 0.05, sample.time + halfWindow)),
      score: Math.max(0, Math.min(1, score)),
      motion: sample.motion,
      contrast: sample.contrast,
      sharpness: sample.sharpness,
      saturation: sample.saturation,
      brightness: sample.brightness,
      exposure: sample.exposure
    }));
}

/**
 * A lightweight browser-only visual scan. It estimates motion, contrast, colour,
 * edge detail, and exposure. It does not identify objects or understand actions.
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
    const canvas = document.createElement("canvas");
    const width = 80;
    const height = 45;
    canvas.width = width;
    canvas.height = height;
    const context = canvas.getContext("2d", { willReadFrequently: true });
    if (!context) throw new Error("Frame analysis is not supported by this browser.");

    const interval = Math.max(2, duration / 60, duration > 1800 ? 4 : 0);
    const total = Math.max(2, Math.ceil(duration / interval));
    const raw: Array<{ time: number; motion: number; contrast: number; saturation: number; sharpness: number; brightness: number; exposure: number }> = [];
    let previous: Uint8ClampedArray | null = null;
    const analysisStartedAt = performance.now();
    const analysisBudgetMs = duration > 1800 ? 60_000 : 90_000;

    for (let index = 0; index < total; index += 1) {
      if (performance.now() - analysisStartedAt > analysisBudgetMs) {
        throw new Error("Анализ длинного видео занял слишком много времени — используем равномерный монтаж.");
      }
      const time = Math.min(duration - 0.08, index * interval + Math.min(0.12, interval * 0.08));
      await seekTo(video, time);
      context.drawImage(video, 0, 0, width, height);
      const pixels = context.getImageData(0, 0, width, height).data;
      const features = frameFeatures(pixels, width, height);
      let motion = 0;
      if (previous) {
        for (let i = 0; i < pixels.length; i += 4) {
          motion += (Math.abs(pixels[i] - previous[i]) + Math.abs(pixels[i + 1] - previous[i + 1]) + Math.abs(pixels[i + 2] - previous[i + 2])) / (3 * 255);
        }
        motion /= pixels.length / 4;
      }
      raw.push({ time, motion, ...features });
      previous = new Uint8ClampedArray(pixels);
      onProgress?.({ current: index + 1, total, time });
      if (index % 8 === 7) await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
    }

    const scored = scoreVisualSamples(raw);
    const samples: HighlightSample[] = scored.map((sample) => ({ ...sample }));

    const candidates = buildSceneAwareCandidates(samples, duration, interval);

    if (!candidates.length) throw new Error("Не удалось найти подходящие кадры в этом видео.");
    return { duration, samples, candidates };
  } finally {
    video.pause();
    video.removeAttribute("src");
    video.load();
  }
}

function chooseSpread(candidates: HighlightMoment[], count: number, spacing: number, mode: HighlightVariant["id"], sourceDuration: number) {
  const normalizeCandidates = (value: number, values: number[]) => {
    const finite = values.filter(Number.isFinite);
    if (!finite.length) return 0.5;
    const minimum = Math.min(...finite);
    const maximum = Math.max(...finite);
    if (maximum - minimum < 1e-6) return 0.5;
    return Math.max(0, Math.min(1, (value - minimum) / (maximum - minimum)));
  };
  const motions = candidates.map((item) => item.motion);
  const contrasts = candidates.map((item) => item.contrast);
  const sharpness = candidates.map((item) => item.sharpness ?? 0.5);
  const ranked = [...candidates].sort((a, b) => {
    const scoreFor = (item: HighlightMoment) => {
      const movement = normalizeCandidates(item.motion, motions);
      const contrast = normalizeCandidates(item.contrast, contrasts);
      const detail = normalizeCandidates(item.sharpness ?? 0.5, sharpness);
      if (mode === "aggressive") return item.score * 0.45 + movement * 0.4 + detail * 0.15;
      if (mode === "slow") return item.score * 0.45 + contrast * 0.25 + detail * 0.2 + (1 - movement) * 0.1;
      return item.score * 0.5 + contrast * 0.2 + detail * 0.2 + (1 - movement) * 0.1;
    };
    return scoreFor(b) - scoreFor(a);
  });
  const selected: HighlightMoment[] = [];
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
  if (!Number.isFinite(sourceDuration) || sourceDuration <= 0) return [];
  return configs.map((config) => {
    const availableCount = Math.max(1, Math.floor(sourceDuration / (config.shotLength + 0.35)));
    const count = Math.min(config.desired, availableCount, candidates.length);
    const moments = chooseSpread(candidates, count, config.spacing, config.id, sourceDuration).map((moment) => {
      const shotLength = Math.min(config.shotLength, sourceDuration);
      const start = Math.max(0, Math.min(sourceDuration - shotLength, moment.time - shotLength / 2));
      return {
        ...moment,
        start,
        end: Math.min(sourceDuration, start + shotLength)
      };
    });
    const duration = moments.reduce((sum, item) => sum + Math.max(0, item.end - item.start), 0);
    return { id: config.id, title: config.title, description: config.description, shotLength: config.shotLength, duration, moments };
  });
}
