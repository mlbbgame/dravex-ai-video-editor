export type DetectedObject = { class: string; score: number; bbox: [number, number, number, number] };
type CocoModel = { detect: (input: HTMLVideoElement | HTMLCanvasElement, maxNumBoxes?: number, minScore?: number) => Promise<DetectedObject[]> };
type CocoApi = { load: (config?: { base?: string }) => Promise<CocoModel> };
type BrowserVisionGlobals = { tf?: unknown; cocoSsd?: CocoApi };
const globals = () => window as unknown as BrowserVisionGlobals;
let modelPromise: Promise<CocoModel | null> | null = null;

function loadScript(id: string, src: string): Promise<void> {
  const existing = document.getElementById(id) as HTMLScriptElement | null;
  if (existing?.dataset.loaded === "true") return Promise.resolve();
  return new Promise((resolve, reject) => {
    const script = existing ?? document.createElement("script");
    let timer = 0;
    const cleanup = () => {
      window.clearTimeout(timer);
      script.removeEventListener("load", loaded);
      script.removeEventListener("error", failed);
    };
    const loaded = () => {
      cleanup();
      script.dataset.loaded = "true";
      resolve();
    };
    const failed = () => {
      cleanup();
      reject(new Error("Object detection library could not be loaded."));
    };
    script.addEventListener("load", loaded, { once: true });
    script.addEventListener("error", failed, { once: true });
    timer = window.setTimeout(() => {
      cleanup();
      reject(new Error("Object detection library timed out."));
    }, 12_000);
    if (!existing) {
      script.id = id;
      script.src = src;
      script.async = true;
      document.head.appendChild(script);
    } else if (globals().tf && id === "dravex-tfjs") {
      cleanup();
      resolve();
    } else if (globals().cocoSsd && id === "dravex-coco-ssd") {
      cleanup();
      resolve();
    }
  });
}

/**
 * Loads a free, pretrained COCO-SSD model on demand in the browser.
 * If network access or model loading fails, callers continue with visual-only analysis.
 */
export function loadSemanticObjectModel(): Promise<CocoModel | null> {
  if (modelPromise) return modelPromise;
  modelPromise = (async () => {
    try {
      if (!navigator.onLine) return null;
      if (!globals().tf) {
        await loadScript("dravex-tfjs", "https://cdn.jsdelivr.net/npm/@tensorflow/tfjs@4.22.0/dist/tf.min.js");
      }
      if (!globals().cocoSsd) {
        await loadScript("dravex-coco-ssd", "https://cdn.jsdelivr.net/npm/@tensorflow-models/coco-ssd@2.2.3/dist/coco-ssd.min.js");
      }
      const api = globals().cocoSsd;
      if (!api) return null;
      return await Promise.race([
        api.load({ base: "lite_mobilenet_v2" }),
        new Promise<null>((resolve) => window.setTimeout(() => resolve(null), 18_000))
      ]);
    } catch {
      return null;
    }
  })();
  return modelPromise;
}

export async function detectFrameObjects(model: CocoModel, video: HTMLVideoElement | HTMLCanvasElement): Promise<DetectedObject[]> {
  try {
    const predictions = await model.detect(video, 8, 0.38);
    return predictions
      .filter((item) => Number.isFinite(item.score) && item.score >= 0.38)
      .map((item) => ({
        class: item.class,
        score: Math.max(0, Math.min(1, item.score)),
        bbox: item.bbox
      }));
  } catch {
    return [];
  }
}

/** Object presence + measured frame-to-frame change gives a cautious action cue, not full action recognition. */
export function inferActionCue(objects: DetectedObject[], normalizedMotion: number): string | undefined {
  if (normalizedMotion < 0.58) return undefined;
  const labels = new Set(objects.map((item) => item.class));
  if (labels.has("person") && (labels.has("sports ball") || labels.has("baseball bat") || labels.has("skateboard") || labels.has("surfboard"))) return "person-sport-motion";
  if (labels.has("car") || labels.has("motorcycle") || labels.has("bus") || labels.has("truck") || labels.has("bicycle")) return "vehicle-motion";
  if (labels.has("person")) return "active-person-motion";
  if (labels.has("dog") || labels.has("cat") || labels.has("horse")) return "animal-motion";
  return "high-visual-motion";
}
