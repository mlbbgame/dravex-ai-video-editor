export type BeatAnalysis = {
  duration: number;
  beats: number[];
  confidence: "strong" | "moderate" | "weak";
};

/**
 * Detects likely musical onsets locally with Web Audio energy-flux analysis.
 * This is a lightweight rhythm estimate, not a trained music-understanding model.
 */
export async function detectMusicBeats(audioUrl: string): Promise<BeatAnalysis> {
  const AudioContextConstructor = window.AudioContext
    ?? (window as Window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!AudioContextConstructor) throw new Error("Этот браузер не поддерживает анализ музыки.");

  const context = new AudioContextConstructor();
  try {
    const response = await fetch(audioUrl);
    if (!response.ok) throw new Error("Не удалось прочитать музыкальный файл.");
    const encoded = await response.arrayBuffer();
    const buffer = await context.decodeAudioData(encoded.slice(0));
    const channelCount = buffer.numberOfChannels;
    const sampleRate = buffer.sampleRate;
    const hopSeconds = 0.05;
    const hopSize = Math.max(1, Math.floor(sampleRate * hopSeconds));
    const frameCount = Math.ceil(buffer.length / hopSize);
    const energy = new Float32Array(frameCount);

    for (let frame = 0; frame < frameCount; frame += 1) {
      const from = frame * hopSize;
      const to = Math.min(buffer.length, from + hopSize);
      let sum = 0;
      let samples = 0;
      for (let channel = 0; channel < channelCount; channel += 1) {
        const data = buffer.getChannelData(channel);
        for (let i = from; i < to; i += 1) {
          sum += data[i] * data[i];
          samples += 1;
        }
      }
      energy[frame] = Math.sqrt(sum / Math.max(1, samples));
    }

    const flux = new Float32Array(frameCount);
    let fluxSum = 0;
    for (let i = 1; i < frameCount; i += 1) {
      flux[i] = Math.max(0, energy[i] - energy[i - 1]);
      fluxSum += flux[i];
    }
    const averageFlux = fluxSum / Math.max(1, frameCount - 1);
    let energySum = 0;
    for (let i = 0; i < energy.length; i += 1) energySum += energy[i];
    const averageEnergy = energySum / Math.max(1, energy.length);
    // Relative threshold adapts to quiet and heavily compressed tracks; keep a tiny floor for silence/noise.
    const threshold = Math.max(averageFlux * 1.2, averageEnergy * 0.035, 0.00012);
    const peakFrames: number[] = [];
    let lastPeakTime = -1;
    for (let i = 2; i < frameCount - 2; i += 1) {
      const value = flux[i];
      const time = i * hopSeconds;
      if (value < threshold || value < flux[i - 1] || value < flux[i + 1]) continue;
      if (time - lastPeakTime < 0.22) {
        const previous = peakFrames[peakFrames.length - 1];
        if (previous !== undefined && value > flux[previous]) peakFrames[peakFrames.length - 1] = i;
        lastPeakTime = time;
        continue;
      }
      peakFrames.push(i);
      lastPeakTime = time;
    }

    const beats = peakFrames.map((frame) => Number((frame * hopSeconds).toFixed(3)));
    const intervals = beats.slice(1).map((beat, index) => beat - beats[index]).filter((interval) => interval >= 0.22 && interval <= 2.5);
    const meanInterval = intervals.reduce((sum, interval) => sum + interval, 0) / Math.max(1, intervals.length);
    const intervalDeviation = intervals.length
      ? intervals.reduce((sum, interval) => sum + Math.abs(interval - meanInterval), 0) / intervals.length
      : Number.POSITIVE_INFINITY;
    const regularity = intervals.length >= 4 && meanInterval > 0 ? Math.max(0, 1 - intervalDeviation / meanInterval) : 0;
    const confidence = beats.length >= 12 && regularity >= 0.28
      ? "strong"
      : beats.length >= 5 && regularity >= 0.12
        ? "moderate"
        : "weak";
    return { duration: buffer.duration, beats, confidence };
  } finally {
    await context.close().catch(() => undefined);
  }
}

/** Pick beat markers near planned cuts while keeping cuts readable and evenly spaced. */
export function snapCutBoundariesToBeats(
  beats: number[],
  targetDuration: number,
  segmentCount: number,
  preferredShotSeconds: number
): number[] {
  if (!Number.isFinite(targetDuration) || targetDuration <= 0) return [];

  const safeSegmentCount = Number.isFinite(segmentCount)
    ? Math.max(1, Math.floor(segmentCount))
    : 1;
  const evenlySpaced = () => Array.from(
    { length: safeSegmentCount + 1 },
    (_, index) => targetDuration * index / safeSegmentCount
  );
  if (safeSegmentCount <= 1 || !Array.isArray(beats)) return evenlySpaced();

  // Ignore malformed and out-of-range beat markers so one bad sample cannot
  // introduce NaN boundaries or pull a cut outside the exported soundtrack.
  const usableBeats = beats
    .filter((beat) => Number.isFinite(beat) && beat >= 0 && beat <= targetDuration)
    .sort((a, b) => a - b);
  if (usableBeats.length < 2) return evenlySpaced();

  const preferredShot = Number.isFinite(preferredShotSeconds) && preferredShotSeconds > 0
    ? preferredShotSeconds
    : targetDuration / safeSegmentCount;
  const boundaries = [0];
  const minimumGap = Math.min(0.48, targetDuration / Math.max(2, safeSegmentCount * 1.25));
  const tolerance = Math.min(0.55, Math.max(0.22, preferredShot * 0.3));

  for (let index = 1; index < safeSegmentCount; index += 1) {
    const ideal = targetDuration * index / safeSegmentCount;
    const remainingCuts = safeSegmentCount - index;
    // Reserve enough time for every remaining shot. Without this upper bound, a late beat
    // can push one boundary past the end and collapse several final shots to zero length.
    const minimum = boundaries[boundaries.length - 1] + minimumGap;
    const maximum = targetDuration - remainingCuts * minimumGap;
    if (minimum >= maximum) {
      boundaries.push(ideal);
      continue;
    }

    const nearby = usableBeats
      .filter((beat) => beat >= minimum && beat <= maximum && Math.abs(beat - ideal) <= tolerance)
      .sort((a, b) => Math.abs(a - ideal) - Math.abs(b - ideal))[0];
    const chosen = nearby ?? Math.max(minimum, Math.min(maximum, ideal));
    boundaries.push(chosen);
  }

  boundaries.push(targetDuration);
  return boundaries;
}
