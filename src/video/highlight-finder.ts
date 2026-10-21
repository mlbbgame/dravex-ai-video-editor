import { classifySemanticFrames, type SemanticAnalysis, type SemanticFrameInput } from "./semantic-classifier";

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

export type HighlightRankingStyle = "velocity" | "cinematic" | "story" | "anime" | "glitch";

/** Rank moments with style-specific motion/contrast weights, including when AI object detection is unavailable. */
export function rankHighlightMomentsForStyle(
  candidates: HighlightMoment[],
  style: HighlightRankingStyle,
): HighlightMoment[] {
  const motions = candidates.map((item) => item.motion);
  const contrasts = candidates.map((item) => item.contrast);
  const feature = (value: number, values: number[]) => {
    if (!values.length) return 0.5;
    const low = Math.min(...values);
    const high = Math.max(...values);
    return high - low < 0.0001 ? 0.5 : Math.max(0, Math.min(1, (value - low) / (high - low)));
  };
  const score = (item: HighlightMoment) => {
    const motion = feature(item.motion, motions);
    const contrast = feature(item.contrast, contrasts);
    const visual = Math.max(0, Math.min(1, item.score));
    switch (style) {
      case "velocity": return visual * 0.55 + motion * 0.45;
      case "anime": return visual * 0.42 + motion * 0.38 + contrast * 0.2;
      case "glitch": return visual * 0.38 + motion * 0.38 + contrast * 0.24;
      case "cinematic": return visual * 0.7 + contrast * 0.2 + (1 - motion) * 0.1;
      case "story": return visual * 0.4 + contrast * 0.1 + (1 - motion) * 0.5;
    }
  };
  return [...candidates].sort((a, b) => score(b) - score(a));
}

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
  phase?: "semantic";
};

/**
 * Very short clips use deterministic cuts to avoid expensive/flaky seeks on mobile.
 * Longer short-form clips should sample real frames so montage selection can respond
 * to motion and contrast instead of assigning synthetic, nearly identical scores.
 */
/** Choose a bounded sample count that gives long sources better temporal coverage without unbounded mobile work. */
export function getHighlightSampleLimit(duration: number): number {
  if (!Number.isFinite(duration) || duration <= 0) return 12;
  if (duration >= 120) return 24;
  if (duration >= 30) return 18;
  return 60;
}

/**
 * Choose a useful temporal sampling interval for highlight analysis.
 * Clips under 30 seconds need denser samples to locate brief action peaks;
 * longer clips keep their existing bounded sample budget for mobile devices.
 */
export function getHighlightSamplingInterval(duration: number, sampleLimit: number): number {
  if (!Number.isFinite(duration) || duration <= 0 || !Number.isFinite(sampleLimit) || sampleLimit < 2) return 2;
  if (duration < 30) return 1;
  if (duration < 120) return 1.5;
  return duration / Math.max(2, Math.floor(sampleLimit));
}

/** Keep each frame seek inside the overall analysis deadline on slow mobile decoders. */
export function getBoundedSeekTimeoutMs(
  elapsedMs: number,
  analysisBudgetMs: number,
  maxSeekTimeoutMs: number,
): number {
  if (![elapsedMs, analysisBudgetMs, maxSeekTimeoutMs].every(Number.isFinite)
    || analysisBudgetMs <= 0 || maxSeekTimeoutMs <= 0) return 0;
  return Math.max(0, Math.min(maxSeekTimeoutMs, analysisBudgetMs - Math.max(0, elapsedMs)));
}

/** Return only the time left for optional analysis stages inside the original deadline. */
export function getRemainingAnalysisBudgetMs(elapsedMs: number, analysisBudgetMs: number): number {
  if (!Number.isFinite(elapsedMs) || !Number.isFinite(analysisBudgetMs) || analysisBudgetMs <= 0) return 0;
  return Math.max(0, analysisBudgetMs - Math.max(0, elapsedMs));
}

/** Place samples across the full timeline, including the final moments of long sources. */
export function getHighlightSampleTime(index: number, total: number, duration: number): number {
  if (!Number.isFinite(duration) || duration <= 0) return 0;
  if (!Number.isFinite(total) || total <= 1) return Math.max(0, Math.min(duration, duration / 2));
  const count = Math.max(2, Math.floor(total));
  const safeIndex = Number.isFinite(index) ? Math.max(0, Math.min(count - 1, Math.floor(index))) : 0;
  const start = Math.min(0.12, duration / 2);
  const end = Math.max(start, duration - 0.08);
  return start + (end - start) * safeIndex / (count - 1);
}

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

function frameFeatures(data: Uint8ClampedArray, width: number, height: number) {
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
  const mean = sum / Math.max(1, lumas.length);
  let variance = 0;
  for (const luma of lumas) variance += Math.abs(luma - mean);

  // Estimate fine detail from neighboring luminance changes. This is a cheap
  // blur/detail proxy, not a claim of semantic or professional sharpness detection.
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
  return {
    brightness: mean,
    contrast: variance / Math.max(1, lumas.length),
    saturation: saturation / Math.max(1, lumas.length),
    detail: edgeSum / Math.max(1, edgeCount),
  };
}

/** Combine inexpensive frame measurements into a bounded quality-aware highlight score. */
export function scoreFrameQuality(features: {
  motion: number;
  contrast: number;
  saturation: number;
  brightness: number;
  detail: number;
}): number {
  const clamp = (value: number) => Number.isFinite(value) ? Math.max(0, Math.min(1, value)) : 0;
  const exposure = clamp(1 - Math.abs(features.brightness - 0.48) / 0.48);
  return clamp(features.motion) * 0.45
    + clamp(features.contrast) * 0.18
    + exposure * 0.15
    + clamp(features.detail) * 0.14
    + clamp(features.saturation) * 0.08;
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
  if (!Number.isFinite(duration) || duration < 0.25) return [];

  // Sanitize both sources before ranking: one broken seek/sample must not leak
  // NaN timestamps or out-of-range trims into variant planning and export.
  const safeCandidates = candidates.flatMap((candidate) => {
    if (
      !Number.isFinite(candidate.time) ||
      !Number.isFinite(candidate.start) ||
      !Number.isFinite(candidate.end) ||
      !Number.isFinite(candidate.score) ||
      !Number.isFinite(candidate.motion) ||
      !Number.isFinite(candidate.contrast) ||
      candidate.end <= candidate.start ||
      candidate.time < 0 ||
      candidate.time > duration
    ) return [];

    const start = Math.max(0, Math.min(duration, candidate.start));
    const end = Math.max(0, Math.min(duration, candidate.end));
    if (end <= start) return [];
    return [{ ...candidate, time: Math.max(start, Math.min(end, candidate.time)), start, end }];
  }).sort((a, b) => a.time - b.time);

  const safeSamples = samples.filter((sample) =>
    Number.isFinite(sample.time) &&
    Number.isFinite(sample.score) &&
    Number.isFinite(sample.motion) &&
    Number.isFinite(sample.contrast) &&
    sample.time >= 0 &&
    sample.time <= duration
  );
  if (!safeSamples.length) return safeCandidates;

  const result = [...safeCandidates];
  const targetCount = Math.min(4, safeSamples.length);
  const spacing = Math.max(0.6, Math.min(2.2, duration / 8));
  const ranked = [...safeSamples].sort((a, b) => b.score - a.score);
  for (const sample of ranked) {
    if (result.length >= targetCount) break;
    if (result.some((item) => Math.abs(item.time - sample.time) < spacing)) continue;
    const half = Math.max(0.12, Math.min(0.8, duration / 6));
    const start = Math.max(0, Math.min(duration, sample.time - half));
    const end = Math.max(0, Math.min(duration, sample.time + half));
    if (end <= start) continue;
    result.push({
      time: sample.time,
      start,
      end,
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
): Promise<{ duration: number; samples: HighlightSample[]; candidates: HighlightMoment[]; semantic?: SemanticAnalysis | null }> {
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
    const sampleLimit = getHighlightSampleLimit(duration);
    const interval = getHighlightSamplingInterval(duration, sampleLimit);
    const total = Math.max(2, Math.min(sampleLimit, Math.ceil(duration / interval)));
    const raw: Array<{ time: number; motion: number; contrast: number; saturation: number; brightness: number; detail: number }> = [];
    const semanticCanvas = document.createElement("canvas");
    semanticCanvas.width = 224;
    semanticCanvas.height = 126;
    const semanticContext = semanticCanvas.getContext("2d");
    const semanticFrameIndices = new Set([0, Math.floor((total - 1) / 3), Math.floor(2 * (total - 1) / 3), total - 1]);
    const semanticFrames: SemanticFrameInput[] = [];
    let previous: Uint8ClampedArray | null = null;
    const analysisStartedAt = performance.now();
    // Never let frame scanning monopolize a phone for several minutes. The caller
    // can fall back to evenly spaced cuts while still exporting a usable video.
    const analysisBudgetMs = isLongSource ? 18_000 : 45_000;

    for (let index = 0; index < total; index += 1) {
      if (performance.now() - analysisStartedAt > analysisBudgetMs) {
        throw new Error("Анализ длинного видео занял слишком много времени — используем равномерный монтаж.");
      }
      const time = getHighlightSampleTime(index, total, duration);
      const elapsedMs = performance.now() - analysisStartedAt;
      const seekTimeoutMs = getBoundedSeekTimeoutMs(
        elapsedMs,
        analysisBudgetMs,
        isLongSource ? 2200 : 12000,
      );
      if (seekTimeoutMs <= 0) {
        throw new Error("Анализ достиг лимита времени — используем быстрый резервный монтаж.");
      }
      await seekTo(video, time, seekTimeoutMs);
      context.drawImage(video, 0, 0, canvas.width, canvas.height);
      const pixels = context.getImageData(0, 0, canvas.width, canvas.height).data;
      const features = frameFeatures(pixels, canvas.width, canvas.height);
      if (semanticFrameIndices.has(index) && semanticContext) {
        try {
          semanticContext.drawImage(video, 0, 0, semanticCanvas.width, semanticCanvas.height);
          semanticFrames.push({ time, imageDataUrl: semanticCanvas.toDataURL("image/jpeg", 0.78) });
        } catch {
          // Semantic recognition is optional; keep the visual montage usable if frame extraction fails.
        }
      }
      let motion = 0;
      if (previous) {
        for (let i = 0; i < pixels.length; i += 4) {
          motion += (Math.abs(pixels[i] - previous[i]) + Math.abs(pixels[i + 1] - previous[i + 1]) + Math.abs(pixels[i + 2] - previous[i + 2])) / (3 * 255);
        }
        motion /= pixels.length / 4;
      }
      raw.push({
        time,
        motion,
        contrast: features.contrast,
        saturation: features.saturation,
        brightness: features.brightness,
        detail: features.detail,
      });
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
    const detailValues = raw.map((item) => item.detail);
    const samples: HighlightSample[] = raw.map((item) => ({
      time: item.time,
      motion: item.motion,
      contrast: item.contrast,
      score: scoreFrameQuality({
        motion: normalize(item.motion, motionValues),
        contrast: normalize(item.contrast, contrastValues),
        saturation: item.saturation,
        brightness: item.brightness,
        detail: normalize(item.detail, detailValues),
      })
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
    onProgress?.({ current: total, total, time: duration, phase: "semantic" });
    // Semantic classification shares the same end-to-end deadline as frame scanning.
    // On slower phones, skip it rather than extending the user's wait after visual analysis.
    const semanticBudgetMs = getRemainingAnalysisBudgetMs(performance.now() - analysisStartedAt, analysisBudgetMs);
    const semantic = semanticBudgetMs > 0
      ? await classifySemanticFrames(semanticFrames, Math.min(8_000, semanticBudgetMs))
      : null;
    return { duration, samples, candidates, semantic };
  } finally {
    video.pause();
    video.removeAttribute("src");
    video.load();
  }
}

function chooseSpread(candidates: HighlightMoment[], count: number, spacing: number, mode: HighlightVariant["id"], sourceDuration: number, shotLength: number) {
  // Keep variant previews and the reusable style-ranker on one scoring path so
  // tests exercise the same logic that actually selects moments for the editor.
  const rankingStyle: HighlightRankingStyle = mode === "aggressive"
    ? "velocity"
    : mode === "cinematic" ? "cinematic" : "story";
  const ranked = rankHighlightMomentsForStyle(candidates, rankingStyle);
  const selected: HighlightMoment[] = [];
  // Distinct timestamps can still refer to the same source footage when candidate
  // windows are wide. Reject both near-duplicate centres and overlapping source ranges.
  // The renderer normalizes each selected moment to shotLength around its center.
  // Candidate windows may not overlap while those final rendered trims still do,
  // so enforce spacing against the actual output duration as well.
  const renderGap = shotLength + 0.08;
  const conflicts = (candidate: HighlightMoment, existing: HighlightMoment, minimumGap: number) =>
    Math.abs(existing.time - candidate.time) < minimumGap
    || (candidate.start < existing.end + 0.08 && candidate.end > existing.start - 0.08);
  const canAdd = (candidate: HighlightMoment, minimumGap = Math.max(spacing, renderGap)) =>
    selected.every((item) => !conflicts(candidate, item, minimumGap));
  // Seed the cut with the strongest style-matched moment from evenly spaced time buckets.
  // This prevents long sources from collapsing into one action-heavy stretch.
  for (let bucket = 0; bucket < count; bucket += 1) {
    const from = sourceDuration * bucket / count;
    const to = sourceDuration * (bucket + 1) / count;
    const best = ranked.find((item) => item.time >= from
      && (bucket === count - 1 ? item.time <= to : item.time < to)
      && canAdd(item));
    if (best) selected.push(best);
  }
  for (const item of ranked) {
    if (selected.length >= count) break;
    if (canAdd(item)) selected.push(item);
  }
  // If stylistic spacing leaves gaps, relax it only down to the rendered shot
  // length. This adds useful cuts without replaying any source interval.
  for (const item of ranked) {
    if (selected.length >= count) break;
    if (canAdd(item, renderGap)) selected.push(item);
  }
  return selected.sort((a, b) => a.time - b.time).slice(0, count);
}

export function buildHighlightVariants(candidates: HighlightMoment[], sourceDuration: number): HighlightVariant[] {
  const configs: Array<{ id: HighlightVariant["id"]; title: string; description: string; shotLength: number; desired: number; spacing: number }> = [
    { id: "aggressive", title: "Агрессивный", description: "Короткие ударные фрагменты и быстрый темп", shotLength: 1.35, desired: 42, spacing: 2.8 },
    { id: "cinematic", title: "Кинематографичный", description: "Более длинные кадры с нарастанием к кульминации", shotLength: 2.5, desired: 22, spacing: 4.2 },
    { id: "slow", title: "Плавный / атмосферный", description: "Длиннее держит выразительные кадры, меньше резких смен", shotLength: 3.5, desired: 16, spacing: 5.5 }
  ];

  // A corrupt/unknown duration must never leak NaN trim values into the renderer.
  if (!Number.isFinite(sourceDuration) || sourceDuration < 0.25) {
    return configs.map((config) => ({
      id: config.id,
      title: config.title,
      description: config.description,
      shotLength: config.shotLength,
      duration: 0,
      moments: []
    }));
  }

  // Keep only usable candidates, then clamp their trims to the real source bounds.
  // A single malformed sample should not poison every variant or the final export.
  const safeCandidates = candidates.flatMap((candidate) => {
    if (
      !Number.isFinite(candidate.time) ||
      !Number.isFinite(candidate.start) ||
      !Number.isFinite(candidate.end) ||
      !Number.isFinite(candidate.score) ||
      !Number.isFinite(candidate.motion) ||
      !Number.isFinite(candidate.contrast) ||
      candidate.time < 0 ||
      candidate.time > sourceDuration ||
      candidate.end <= candidate.start
    ) return [];

    const start = Math.max(0, Math.min(sourceDuration, candidate.start));
    const end = Math.max(0, Math.min(sourceDuration, candidate.end));
    if (end <= start) return [];
    return [{ ...candidate, time: Math.max(start, Math.min(end, candidate.time)), start, end }];
  });

  return configs.map((config) => {
    if (!safeCandidates.length) {
      return { id: config.id, title: config.title, description: config.description, shotLength: config.shotLength, duration: 0, moments: [] };
    }
    const availableCount = Math.max(1, Math.floor(sourceDuration / (config.shotLength + 0.35)));
    const count = Math.max(1, Math.min(config.desired, availableCount, safeCandidates.length));
    const moments = chooseSpread(safeCandidates, count, config.spacing, config.id, sourceDuration, config.shotLength).map((moment) => {
      const shotLength = Math.min(config.shotLength, sourceDuration);
      const start = Math.max(0, Math.min(sourceDuration - shotLength, moment.time - shotLength / 2));
      return {
        ...moment,
        start,
        end: Math.min(sourceDuration, start + shotLength)
      };
    }).filter((moment) => Number.isFinite(moment.start) && Number.isFinite(moment.end) && moment.end > moment.start);
    const duration = moments.reduce((sum, item) => sum + (item.end - item.start), 0);
    return { id: config.id, title: config.title, description: config.description, shotLength: config.shotLength, duration, moments };
  });
}
