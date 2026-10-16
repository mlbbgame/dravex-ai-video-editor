export type RenderImage = { name: string; url: string };

type RenderOptions = {
  images: RenderImage[];
  title: string;
  aspectRatio: string;
  durationSeconds?: number;
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

const roundedRect = (
  context: CanvasRenderingContext2D,
  x: number,
  y: number,
  width: number,
  height: number,
  radius: number
) => {
  context.beginPath();
  context.roundRect(x, y, width, height, radius);
};

export async function renderImageSlideshow({
  images,
  title,
  aspectRatio,
  durationSeconds = 15,
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
  const stream = canvas.captureStream(24);
  const recorder = new MediaRecorder(stream, {
    mimeType,
    videoBitsPerSecond: 4_000_000
  });
  const chunks: BlobPart[] = [];
  const totalFrames = Math.max(24, Math.min(15, durationSeconds) * 24);
  const frameDuration = 1000 / 24;

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
  let frame = 0;

  await new Promise<void>((resolve) => {
    const drawFrame = () => {
      const elapsed = performance.now() - startedAt;
      frame = Math.min(totalFrames - 1, Math.floor(elapsed / frameDuration));
      const imageIndex = Math.min(
        loadedImages.length - 1,
        Math.floor((frame / totalFrames) * loadedImages.length)
      );
      const localFrame = (frame / totalFrames) * loadedImages.length - imageIndex;
      const image = loadedImages[imageIndex];
      const scale = Math.max(width / image.width, height / image.height) * (1 + localFrame * 0.08);
      const drawWidth = image.width * scale;
      const drawHeight = image.height * scale;
      const driftX = (drawWidth - width) * localFrame * 0.5;
      const driftY = (drawHeight - height) * localFrame * 0.5;

      context.fillStyle = "#090b12";
      context.fillRect(0, 0, width, height);
      context.save();
      context.beginPath();
      context.rect(0, 0, width, height);
      context.clip();
      context.drawImage(
        image,
        (width - drawWidth) / 2 - driftX,
        (height - drawHeight) / 2 - driftY,
        drawWidth,
        drawHeight
      );
      context.restore();

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
      const words = cleanTitle.split(/\s+/);
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
