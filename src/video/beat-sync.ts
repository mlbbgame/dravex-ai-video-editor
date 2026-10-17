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
    const threshold = Math.max(averageFlux * 1.35, 0.0025);
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
    return {
      duration: buffer.duration,
      beats,
      confidence: beats.length >= 12 ? "strong" : beats.length >= 5 ? "moderate" : "weak"
    };
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
  if (segmentCount <= 1 || beats.length < 2 || targetDuration <= 0) {
    return Array.from({ length: segmentCount + 1 }, (_, index) => targetDuration * index / segmentCount);
  }

  const boundaries = [0];
  const minimumGap = Math.min(0.48, targetDuration / Math.max(2, segmentCount * 1.25));
  const tolerance = Math.min(0.55, Math.max(0.22, preferredShotSeconds * 0.3));
  for (let index = 1; index < segmentCount; index += 1) {
    const ideal = targetDuration * index / segmentCount;
    const nearby = beats
      .filter((beat) => beat > boundaries[boundaries.length - 1] + minimumGap && beat < targetDuration - minimumGap && Math.abs(beat - ideal) <= tolerance)
      .sort((a, b) => Math.abs(a - ideal) - Math.abs(b - ideal))[0];
    const chosen = nearby ?? ideal;
    boundaries.push(Math.max(boundaries[boundaries.length - 1] + minimumGap, chosen));
  }
  boundaries.push(targetDuration);
  return boundaries.map((value, index) => index === 0 ? 0 : index === boundaries.length - 1 ? targetDuration : Math.min(targetDuration, value));
}
