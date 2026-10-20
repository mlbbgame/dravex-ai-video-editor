export type SemanticProfile =
  | "automotive"
  | "nature"
  | "food"
  | "people"
  | "wildlife"
  | "product-diy"
  | "unknown";

export type SemanticFrameInput = {
  time: number;
  imageDataUrl: string;
};

export type SemanticLabel = {
  time: number;
  label: string;
  score: number;
};

export type SemanticAnalysis = {
  profile: SemanticProfile;
  confidence: number;
  labels: SemanticLabel[];
};

type Classification = { label: string; score: number };
type ImageClassifier = (image: string, options?: { top_k?: number }) => Promise<Classification[]>;

const MODEL_ID = "onnx-community/mobilenetv4_conv_small.e2400_r224_in1k";
let classifierPromise: Promise<ImageClassifier> | null = null;

const profileKeywords: Record<Exclude<SemanticProfile, "unknown">, RegExp[]> = {
  automotive: [
    /\b(car|sports car|race car|racing car|racer|convertible|limousine|truck|motorcycle|wheel|rally car|jeep)\b/i
  ],
  nature: [
    /\b(mountain|valley|forest|waterfall|lakeside|seashore|volcano|cloud|beach|tree|flower|reef|river|desert|coast|sunset|alp|cliff|sky|canyon|meadow)\b/i
  ],
  food: [
    /\b(pizza|dish|plate|food|meat|broccoli|fruit|ice cream|burrito|espresso|coffee|sandwich|soup|cucumber|baking|restaurant|pot|cake|chocolate|spaghetti|hotdog|cheeseburger)\b/i
  ],
  people: [
    /\b(person|groom|bride|face|swimmer|scuba diver|athlete|baby|child|boy|girl|woman|man|jersey|ballplayer|dancer|suit|ski mask)\b/i
  ],
  wildlife: [
    /\b(dog|cat|bird|tiger|lion|bear|horse|deer|fox|wolf|elephant|monkey|snake|turtle|fish|penguin|rabbit|squirrel|owl|eagle|butterfly|lizard|retriever|terrier|spaniel|shepherd|poodle|bulldog|beagle|collie|chihuahua)\b/i
  ],
  "product-diy": [
    /\b(tool|hammer|screwdriver|power drill|computer|laptop|phone|camera|device|chain saw|washer|remote control|screw|wrench|keyboard|monitor|vacuum|toaster|gadget)\b/i
  ]
};

/** Convert image-classification labels into a cautious, broad content profile. */
export function inferSemanticProfile(labels: readonly Classification[]): {
  profile: SemanticProfile;
  confidence: number;
} {
  const totals: Record<Exclude<SemanticProfile, "unknown">, number> = {
    automotive: 0,
    nature: 0,
    food: 0,
    people: 0,
    wildlife: 0,
    "product-diy": 0
  };

  for (const item of labels) {
    if (!Number.isFinite(item.score) || item.score <= 0 || typeof item.label !== "string") continue;
    for (const [profile, patterns] of Object.entries(profileKeywords) as Array<[Exclude<SemanticProfile, "unknown">, RegExp[]]>) {
      if (patterns.some((pattern) => pattern.test(item.label))) {
        totals[profile] += Math.max(0, Math.min(1, item.score));
      }
    }
  }

  const ranked = (Object.entries(totals) as Array<[Exclude<SemanticProfile, "unknown">, number]>)
    .sort((a, b) => b[1] - a[1]);
  const best = ranked[0];
  const second = ranked[1];
  if (!best || best[1] < 0.35) return { profile: "unknown", confidence: 0 };
  const margin = best[1] - (second?.[1] ?? 0);
  // Ambiguous scenes should not force an inappropriate edit profile.
  if (margin < 0.12 && best[1] < 0.8) return { profile: "unknown", confidence: 0 };
  return { profile: best[0], confidence: Math.min(1, best[1] / Math.max(1, Math.ceil(labels.length / 5))) };
}

async function loadClassifier(): Promise<ImageClassifier> {
  if (!classifierPromise) {
    classifierPromise = (async () => {
      const { pipeline } = await import("@huggingface/transformers");
      let instance: unknown;
      if (typeof navigator !== "undefined" && "gpu" in navigator) {
        try {
          instance = await pipeline("image-classification", MODEL_ID, { device: "webgpu", dtype: "q8" });
        } catch {
          // WebGPU is optional and varies by browser/device; fall back to WASM/CPU.
          instance = await pipeline("image-classification", MODEL_ID, { dtype: "q8" });
        }
      } else {
        instance = await pipeline("image-classification", MODEL_ID, { dtype: "q8" });
      }
      return instance as unknown as ImageClassifier;
    })().catch((error) => {
      classifierPromise = null;
      throw error;
    });
  }
  return classifierPromise;
}

/**
 * Classify a few representative frames locally in the browser.
 * The source video itself is never uploaded. Model weights are downloaded from
 * the public model host on first use; failure or timeout returns null so visual
 * montage analysis can continue without semantic labels.
 */
export async function classifySemanticFrames(
  frames: readonly SemanticFrameInput[],
  timeoutMs = 30_000
): Promise<SemanticAnalysis | null> {
  const validFrames = frames.filter((frame) =>
    Number.isFinite(frame.time) &&
    frame.time >= 0 &&
    typeof frame.imageDataUrl === "string" &&
    frame.imageDataUrl.startsWith("data:image/")
  ).slice(0, 5);
  if (!validFrames.length) return null;

  let timeoutId = 0;
  const timeout = new Promise<never>((_, reject) => {
    timeoutId = window.setTimeout(() => reject(new Error("Semantic model load timed out")), timeoutMs);
  });

  try {
    const classifier = await Promise.race([loadClassifier(), timeout]);
    const labels: SemanticLabel[] = [];
    for (const frame of validFrames) {
      const predictions = await Promise.race([classifier(frame.imageDataUrl, { top_k: 5 }), timeout]);
      for (const prediction of predictions) {
        labels.push({
          time: frame.time,
          label: prediction.label,
          score: Math.max(0, Math.min(1, prediction.score))
        });
      }
    }
    const inferred = inferSemanticProfile(labels);
    return { ...inferred, labels };
  } catch {
    return null;
  } finally {
    window.clearTimeout(timeoutId);
  }
}
