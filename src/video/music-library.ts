export type MusicPreset = {
  id: string;
  title: string;
  mood: string;
  description: string;
  bpm: number;
  baseHz: number;
  style: "action" | "phonk" | "anime" | "cinematic" | "slow" | "chill";
};

export const musicPresets: MusicPreset[] = [
  { id: "neon-chase", title: "Neon Chase", mood: "Action", description: "Плотный бит для динамичных экшен-эдитов", bpm: 140, baseHz: 55, style: "action" },
  { id: "night-phonk", title: "Night Phonk", mood: "Phonk", description: "Тёмный бас и резкие акценты", bpm: 132, baseHz: 49, style: "phonk" },
  { id: "anime-overdrive", title: "Anime Overdrive", mood: "Anime", description: "Быстрый ритм для AMV и velocity", bpm: 160, baseHz: 65, style: "anime" },
  { id: "epic-horizon", title: "Epic Horizon", mood: "Cinematic", description: "Широкие аккорды и масштабное настроение", bpm: 96, baseHz: 43.65, style: "cinematic" },
  { id: "slow-motion", title: "Slow Motion", mood: "Slow", description: "Редкий ударный рисунок для slow edits", bpm: 72, baseHz: 41.2, style: "slow" },
  { id: "chill-afterglow", title: "Chill Afterglow", mood: "Chill", description: "Мягкий электронный грув без резких акцентов", bpm: 92, baseHz: 55, style: "chill" },
];

function addTone(context: OfflineAudioContext, frequency: number, start: number, duration: number, volume: number, type: OscillatorType, endFrequency?: number) {
  const oscillator = context.createOscillator();
  const gain = context.createGain();
  oscillator.type = type;
  oscillator.frequency.setValueAtTime(frequency, start);
  if (endFrequency) oscillator.frequency.exponentialRampToValueAtTime(Math.max(1, endFrequency), start + Math.min(0.16, duration));
  gain.gain.setValueAtTime(0.0001, start);
  gain.gain.exponentialRampToValueAtTime(Math.max(0.0002, volume), start + 0.008);
  gain.gain.exponentialRampToValueAtTime(0.0001, start + duration);
  oscillator.connect(gain);
  gain.connect(context.destination);
  oscillator.start(start);
  oscillator.stop(start + duration + 0.02);
}

function addNoiseHit(context: OfflineAudioContext, start: number, duration: number, volume: number, highpassHz: number) {
  const length = Math.max(1, Math.floor(context.sampleRate * duration));
  const buffer = context.createBuffer(1, length, context.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < length; i += 1) data[i] = (Math.random() * 2 - 1) * (1 - i / length);
  const source = context.createBufferSource();
  const filter = context.createBiquadFilter();
  const gain = context.createGain();
  source.buffer = buffer;
  filter.type = "highpass";
  filter.frequency.value = highpassHz;
  gain.gain.setValueAtTime(volume, start);
  gain.gain.exponentialRampToValueAtTime(0.0001, start + duration);
  source.connect(filter);
  filter.connect(gain);
  gain.connect(context.destination);
  source.start(start);
}

function encodeWav(buffer: AudioBuffer): Blob {
  const channels = buffer.numberOfChannels;
  const sampleRate = buffer.sampleRate;
  const frameCount = buffer.length;
  const bytesPerSample = 2;
  const output = new ArrayBuffer(44 + frameCount * channels * bytesPerSample);
  const view = new DataView(output);
  const writeText = (offset: number, value: string) => { for (let i = 0; i < value.length; i += 1) view.setUint8(offset + i, value.charCodeAt(i)); };
  writeText(0, "RIFF");
  view.setUint32(4, 36 + frameCount * channels * bytesPerSample, true);
  writeText(8, "WAVE");
  writeText(12, "fmt ");
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, channels, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * channels * bytesPerSample, true);
  view.setUint16(32, channels * bytesPerSample, true);
  view.setUint16(34, 16, true);
  writeText(36, "data");
  view.setUint32(40, frameCount * channels * bytesPerSample, true);
  const channelData = Array.from({ length: channels }, (_, channel) => buffer.getChannelData(channel));
  let offset = 44;
  for (let frame = 0; frame < frameCount; frame += 1) {
    for (let channel = 0; channel < channels; channel += 1) {
      const sample = Math.max(-1, Math.min(1, channelData[channel][frame]));
      view.setInt16(offset, sample < 0 ? sample * 0x8000 : sample * 0x7fff, true);
      offset += bytesPerSample;
    }
  }
  return new Blob([output], { type: "audio/wav" });
}

/** Generate an original, synthesised 30-second loop locally; no third-party song is bundled. */
export async function generateMusicTrack(preset: MusicPreset): Promise<File> {
  const sampleRate = 22050;
  const duration = 30;
  const OfflineContext = window.OfflineAudioContext
    ?? (window as Window & { webkitOfflineAudioContext?: typeof OfflineAudioContext }).webkitOfflineAudioContext;
  if (!OfflineContext) throw new Error("Этот браузер не поддерживает создание музыки. Можно загрузить свой аудиофайл.");
  const context = new OfflineContext(2, sampleRate * duration, sampleRate);
  const beat = 60 / preset.bpm;
  const beatCount = Math.ceil(duration / beat);
  const isSoft = preset.style === "cinematic" || preset.style === "slow" || preset.style === "chill";
  for (let step = 0; step < beatCount; step += 1) {
    const time = step * beat;
    if (preset.style === "slow" || preset.style === "cinematic") {
      if (step % 4 === 0) addTone(context, 100, time, 0.32, 0.62, "sine", 38);
      if (step % 4 === 2 && preset.style === "slow") addNoiseHit(context, time, 0.18, 0.09, 5000);
      if (step % 8 === 0) {
        const chord = preset.baseHz * (step % 16 === 0 ? 1 : 1.25);
        addTone(context, chord, time, beat * 3.5, 0.035, "sine");
        addTone(context, chord * 1.5, time, beat * 3.5, 0.025, "sine");
        addTone(context, chord * 2, time, beat * 3.5, 0.018, "sine");
      }
    } else {
      const kickStep = preset.style === "chill" ? step % 4 === 0 || step % 4 === 2 : step % 2 === 0 || (preset.style === "phonk" && step % 4 === 3);
      if (kickStep) addTone(context, 120, time, 0.24, preset.style === "phonk" ? 0.9 : 0.72, "sine", 38);
      if (step % 4 === 2) addNoiseHit(context, time, 0.16, preset.style === "anime" ? 0.24 : 0.19, 1400);
      if (step % 2 === 0) addNoiseHit(context, time + beat * 0.5, 0.045, isSoft ? 0.035 : 0.075, 7500);
      if (step % 4 === 0 || (preset.style === "phonk" && step % 4 === 3)) {
        const note = preset.baseHz * [1, 1, 1.5, 1.25][step % 4];
        addTone(context, note, time, beat * 0.72, preset.style === "phonk" ? 0.26 : 0.16, preset.style === "phonk" ? "sawtooth" : "triangle");
      }
      if (preset.style === "phonk" && step % 4 === 2) addTone(context, 660 + (step % 8) * 30, time, 0.09, 0.055, "square", 390);
      if (preset.style === "anime" && step % 8 === 7) addTone(context, 880, time, 0.08, 0.07, "triangle", 440);
    }
  }
  const rendered = await context.startRendering();
  return new File([encodeWav(rendered)], `dravex-${preset.id}.wav`, { type: "audio/wav" });
}
