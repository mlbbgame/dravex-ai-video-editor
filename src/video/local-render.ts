export type RenderImage = { name: string; url: string };

export type RenderStyle = "velocity" | "anime" | "cinematic" | "glitch" | "story";

type RenderOptions = {
  images: RenderImage[];
  title: string;
  aspectRatio: string;
  durationSeconds?: number;
  style?: RenderStyle;
  onProgress?: (progress: number) => void;
};

const dimensionsFor = (aspectRatio: string) => {
  if (aspectRatio === "16:9") return { width: 1280, height: 720 };
  if (aspectRatio === "1:1") return { width: 720, height: 720 };
  if (aspectRatio === "4:5") return { width: 720, height: 900 };
  return { width: 720, height: 1280 };
};

const loadImage = (url: string) =>
  new Promise<HTMLImageElement>((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error("One of the selected images could not be loaded."));
    image.src = url;
  });

function visualScore(image: HTMLImageElement): number {
  const sample = document.createElement("canvas");
  sample.width = 32;
  sample.height = 32;
  const ctx = sample.getContext("2d", { willReadFrequently: true });
  if (!ctx) return image.width * image.height;
  ctx.drawImage(image, 0, 0, sample.width, sample.height);
  const pixels = ctx.getImageData(0, 0, sample.width, sample.height).data;
  let brightness = 0;
  let saturation = 0;
  let contrast = 0;
  const luminance: number[] = [];
  for (let i = 0; i < pixels.length; i += 4) {
    const r = pixels[i] / 255;
    const g = pixels[i + 1] / 255;
    const b = pixels[i + 2] / 255;
    const max = Math.max(r, g, b);
    const min = Math.min(r, g, b);
    const luma = 0.2126 * r + 0.7152 * g + 0.0722 * b;
    brightness += luma;
    saturation += max === 0 ? 0 : (max - min) / max;
    luminance.push(luma);
  }
  brightness /= luminance.length;
  saturation /= luminance.length;
  for (const value of luminance) contrast += Math.abs(value - brightness);
  contrast /= luminance.length;
  // A heuristic for visual impact, not an AI model: reward readable contrast and vivid subjects.
  return contrast * 0.55 + saturation * 0.3 + (1 - Math.abs(brightness - 0.52)) * 0.15;
}

export async function renderImageSlideshow({
  images,
  title,
  aspectRatio,
  durationSeconds = 15,
  style = "cinematic",
  onProgress
}: RenderOptions): Promise<Blob> {
  if (!images.length) throw new Error("Import at least one image before rendering.");
  if (typeof MediaRecorder === "undefined") {
    throw new Error("This browser does not support video recording. Try a recent version of Chrome.");
  }

  const mimeType = ["video/webm;codecs=vp9", "video/webm;codecs=vp8", "video/webm"]
    .find((type) => MediaRecorder.isTypeSupported(type));
  if (!mimeType) throw new Error("This browser does not support WebM video export.");

  const { width, height } = dimensionsFor(aspectRatio);
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext("2d");
  if (!context) throw new Error("Could not initialize the video renderer.");

  const loadedImages = await Promise.all(images.map((image) => loadImage(image.url)));
  const ranked = loadedImages.map((image, originalIndex) => ({ image, originalIndex, score: visualScore(image) }));
  // Keep the user's chosen order for the body, but promote the strongest visual to the opening hook.
  const strongest = [...ranked].sort((a, b) => b.score - a.score)[0];
  const sequence = strongest
    ? [strongest, ...ranked.filter((item) => item.originalIndex !== strongest.originalIndex)]
    : ranked;
  const stream = canvas.captureStream(24);
  const recorder = new MediaRecorder(stream, {
    mimeType,
    videoBitsPerSecond: 4_000_000
  });
  const chunks: BlobPart[] = [];
  const safeDuration = Math.max(5, Math.min(30, durationSeconds));
  const totalFrames = Math.max(24, Math.round(safeDuration * 24));
  const frameDuration = 1000 / 24;
  const sceneFrames = totalFrames / sequence.length;

  const result = new Promise<Blob>((resolve, reject) => {
    recorder.ondataavailable = (event) => {
      if (event.data.size) chunks.push(event.data);
    };
    recorder.onerror = () => reject(new Error("The browser stopped recording unexpectedly."));
    recorder.onstop = () => {
      stream.getTracks().forEach((track) => track.stop());
      const blob = new Blob(chunks, { type: mimeType });
      if (!blob.size) reject(new Error("The rendered video was empty. Please try again."));
      else resolve(blob);
    };
  });

  recorder.start(250);
  const startedAt = performance.now();

  await new Promise<void>((resolve) => {
    const drawFrame = () => {
      const elapsed = performance.now() - startedAt;
      const frame = Math.min(totalFrames - 1, Math.floor(elapsed / frameDuration));
      const timelinePosition = (frame / totalFrames) * sequence.length;
      const imageIndex = Math.min(sequence.length - 1, Math.floor(timelinePosition));
      const localFrame = timelinePosition - imageIndex;
      const current = sequence[imageIndex].image;
      const next = sequence[Math.min(imageIndex + 1, sequence.length - 1)].image;
      const progress = Math.max(0, Math.min(1, localFrame));
      const motion = style === "velocity" ? 0.13 : style === "anime" ? 0.1 : style === "glitch" ? 0.09 : style === "story" ? 0.045 : 0.07;
      const zoom = 1 + localFrame * motion;
      const scale = Math.max(width / current.width, height / current.height) * zoom;
      const drawWidth = current.width * scale;
      const drawHeight = current.height * scale;
      const driftX = (drawWidth - width) * (style === "anime" ? 0.22 : 0.5) * localFrame;
      const driftY = (drawHeight - height) * 0.5 * localFrame;

      context.fillStyle = "#090b12";
      context.fillRect(0, 0, width, height);
      context.save();
      context.beginPath();
      context.rect(0, 0, width, height);
      context.clip();
      context.drawImage(current, (width - drawWidth) / 2 - driftX, (height - drawHeight) / 2 - driftY, drawWidth, drawHeight);
      // A short crossfade makes the scene changes feel intentional instead of abrupt.
      const transition = 0.12;
      if (imageIndex < sequence.length - 1 && progress > 1 - transition) {
        const alpha = (progress - (1 - transition)) / transition;
        const nextScale = Math.max(width / next.width, height / next.height) * (1 + alpha * motion * 0.45);
        const nextW = next.width * nextScale;
        const nextH = next.height * nextScale;
        context.globalAlpha = alpha;
        context.drawImage(next, (width - nextW) / 2, (height - nextH) / 2, nextW, nextH);
        context.globalAlpha = 1;
      }
      context.restore();

      if (style === "glitch" && Math.floor(elapsed / 500) % 7 === 0 && localFrame < 0.06) {
        context.fillStyle = "rgba(40, 220, 255, 0.12)";
        context.fillRect(0, 0, width, height);
        context.fillStyle = "rgba(255, 35, 100, 0.1)";
        context.fillRect(Math.round(width * 0.015), 0, width, height);
      }
      const shade = context.createLinearGradient(0, height * 0.45, 0, height);
      shade.addColorStop(0, "rgba(5, 7, 12, 0)");
      shade.addColorStop(1, "rgba(5, 7, 12, 0.88)");
      context.fillStyle = shade;
      context.fillRect(0, 0, width, height);

      const cleanTitle = title.trim().slice(0, 120) || "A story in motion";
      const fontSize = Math.max(26, Math.round(width * 0.055));
      context.font = `700 ${fontSize}px system-ui, sans-serif`;
      context.textAlign = "center";
      context.textBaseline = "bottom";
      context.shadowColor = "rgba(0,0,0,0.6)";
      context.shadowBlur = 12;
      const words = cleanTitle.split(/\\s+/);
      const lines: string[] = [];
      let line = "";
      for (const word of words) {
        const candidate = line ? `${line} ${word}` : word;
        if (context.measureText(candidate).width > width * 0.82 && line) {
          lines.push(line);
          line = word;
        } else line = candidate;
      }
      if (line) lines.push(line);
      const visibleLines = lines.slice(-3);
      const lineHeight = fontSize * 1.18;
      visibleLines.forEach((text, index) => {
        context.fillStyle = "#ffffff";
        context.fillText(text, width / 2, height * 0.82 + (index - visibleLines.length + 1) * lineHeight, width * 0.86);
      });
      context.shadowBlur = 0;
      context.font = `600 ${Math.max(14, Math.round(width * 0.022))}px system-ui, sans-serif`;
      context.fillStyle = "rgba(255,255,255,0.8)";
      context.fillText("MADE WITH DRAVEX", width / 2, height * 0.94);

      onProgress?.(Math.min(100, Math.round(((frame + 1) / totalFrames) * 100)));
      if (frame >= totalFrames - 1) {
        recorder.stop();
        resolve();
      } else {
        window.setTimeout(() => requestAnimationFrame(drawFrame), Math.max(0, frameDuration - (performance.now() - startedAt - frame * frameDuration)));
      }
    };
    requestAnimationFrame(drawFrame);
  });

  await result;
  return new Blob(chunks, { type: mimeType });
}
