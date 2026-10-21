/**
 * DRAVEX Director Knowledge Pack.
 *
 * Curated, explainable editing heuristics. This is a decision aid for the
 * planner, not a vision model: domain inference uses prompt text only and
 * must never be presented as verified understanding of source footage.
 */

export type DirectorKnowledgeDomain =
  | "gaming"
  | "automotive"
  | "nature-travel"
  | "food"
  | "sports"
  | "people"
  | "product-diy"
  | "anime"
  | "general";

export type DirectorKnowledge = {
  domain: DirectorKnowledgeDomain;
  confidence: number;
  matchedTerms: string[];
  principles: string[];
  avoid: string[];
  evaluationQuestions: string[];
};

type DomainRules = {
  terms: string[];
  principles: string[];
  avoid: string[];
  evaluationQuestions: string[];
};

const RULES: Record<Exclude<DirectorKnowledgeDomain, "general">, DomainRules> = {
  gaming: {
    terms: ["mlbb", "mobile legends", "pubg", "pubg mobile", "free fire", "gameplay", "gaming", "геймплей", "игровой эдит", "игровой монтаж", "пабг", "млбб", "мобильные легенды", "фраг", "килл", "kill montage", "esports", "киберспорт"],
    principles: [
      "Prioritize verified gameplay peaks: decisive fights, skill combos, clutch moments, eliminations, and clear outcomes.",
      "Build toward the payoff; use speed ramps and beat accents only when they reinforce the action.",
      "Keep the HUD and essential action readable; avoid cutting away before the result is visible."
    ],
    avoid: ["Do not invent kills, abilities, or events not present in the source.", "Avoid constant flashes, shake, and effects that hide gameplay."],
    evaluationQuestions: ["Is the key action understandable?", "Does the payoff land before the cut?", "Are effects synchronized without obscuring the HUD?"]
  },
  automotive: {
    terms: ["car", "cars", "drift", "drifting", "automotive", "supercar", "racing", "motorcycle", "авто", "машин", "дрифт", "гонк", "автомобил", "мотоцикл"],
    principles: [
      "Favor visible acceleration, drift initiation, cornering, wheel detail, smoke, and angle changes when present.",
      "Place speed ramps around real motion peaks; match adjacent shots by direction and energy.",
      "Alternate wide context with close details so the sequence feels intentional rather than repetitive."
    ],
    avoid: ["Do not add aggressive speed changes to already shaky or unclear footage.", "Do not imply a maneuver that the footage does not show."],
    evaluationQuestions: ["Is the vehicle/action clear?", "Do cuts follow motion direction?", "Are speed changes smooth and motivated?"]
  },
  "nature-travel": {
    terms: ["nature", "wildlife", "landscape", "travel", "trip", "mountain", "ocean", "forest", "sunset", "природ", "путешеств", "поездк", "горы", "океан", "лес", "закат", "животн", "пейзаж"],
    principles: [
      "Preserve atmosphere and geographic context; let exceptional scenery breathe.",
      "Use shot-size variation and gentle movement rather than applying the same transition everywhere.",
      "Build an emotional arc from establishing views to distinctive details and a memorable closing image."
    ],
    avoid: ["Avoid excessive shake, flash transitions, and over-saturated grading.", "Do not infer a location or animal behavior from filenames alone."],
    evaluationQuestions: ["Does the edit preserve the mood?", "Are wide and detail shots balanced?", "Does grading remain consistent across scenes?"]
  },
  food: {
    terms: ["food", "cooking", "recipe", "baking", "kitchen", "dish", "meal", "еда", "готовк", "рецепт", "выпечк", "кухн", "блюдо"],
    principles: [
      "Show ingredients or setup, meaningful preparation steps, then the finished result.",
      "Cut on hand movement and visible state changes; keep important steps long enough to understand.",
      "Use close-ups for texture and the finished dish when available."
    ],
    avoid: ["Do not reorder steps in a way that changes the apparent recipe.", "Do not cover critical actions with captions or decorative effects."],
    evaluationQuestions: ["Is the process easy to follow?", "Are important steps retained?", "Is the final result clearly shown?"]
  },
  sports: {
    terms: ["sport", "football", "soccer", "basketball", "tennis", "skateboard", "surf", "match", "спорт", "футбол", "баскетбол", "теннис", "скейт", "матч"],
    principles: [
      "Preserve the setup, action peak, and outcome where available.",
      "Use motion-aware cuts and replay-like emphasis only when the source supports it.",
      "Keep the ball, athlete, or decisive movement visible across transitions."
    ],
    avoid: ["Do not cut away before the outcome of a decisive play.", "Avoid effects that obscure the athlete or trajectory."],
    evaluationQuestions: ["Is the action trajectory readable?", "Is the peak selected?", "Is the outcome preserved?"]
  },
  people: {
    terms: ["people", "family", "friends", "portrait", "interview", "vlog", "person", "люди", "семья", "друзья", "портрет", "интервью", "влог", "человек"],
    principles: [
      "Prioritize clear expressions, meaningful gestures, and continuity between moments.",
      "Keep dialogue or emotional reactions long enough to read; use cutaways only when they add context.",
      "Use restrained stabilization and color matching across shots."
    ],
    avoid: ["Do not infer private traits or emotions that are not evident.", "Avoid fast cuts that break dialogue or hide the key reaction."],
    evaluationQuestions: ["Are expressions and gestures visible?", "Does dialogue remain coherent?", "Does the sequence feel respectful and natural?"]
  },
  "product-diy": {
    terms: ["product", "review", "unboxing", "diy", "tutorial", "repair", "craft", "tool", "обзор", "распаковк", "сделай сам", "инструкц", "ремонт", "поделк", "инструмент", "товар"],
    principles: [
      "Establish the object, show meaningful steps or features, and finish with the result.",
      "Prefer clear detail shots and stable framing over decorative movement.",
      "Use captions only when requested and keep them away from the key object."
    ],
    avoid: ["Do not invent product specifications or unseen steps.", "Do not sacrifice clarity for transitions."],
    evaluationQuestions: ["Is the object identifiable?", "Are steps/features shown in logical order?", "Is the result easy to inspect?"]
  },
  anime: {
    terms: ["anime", "amv", "manga", "аниме", "амв", "манга"],
    principles: [
      "Build around character entrances, action peaks, expressions, and visual changes present in the source.",
      "Use rhythm accents and impact frames selectively; vary intensity between peaks.",
      "Maintain readable faces and silhouettes through effects."
    ],
    avoid: ["Avoid placing a flash or glitch on every cut.", "Do not fabricate character actions or source scenes."],
    evaluationQuestions: ["Does the strongest moment align with the musical accent?", "Are faces and silhouettes readable?", "Is intensity varied rather than constant?"]
  }
};

const clean = (value: string) => value.normalize("NFKC").toLocaleLowerCase().replace(/\s+/g, " ").trim();

/** Prompt-only inference. It intentionally does not claim to inspect media content. */
export function inferDirectorKnowledgeDomain(prompt: string): {
  domain: DirectorKnowledgeDomain;
  confidence: number;
  matchedTerms: string[];
} {
  const text = clean(prompt);
  const ranked = (Object.entries(RULES) as Array<[Exclude<DirectorKnowledgeDomain, "general">, DomainRules]>)
    .map(([domain, rules]) => {
      const tokens = text.split(/[^\\p{L}\\p{N}]+/u).filter(Boolean);
      const matchedTerms = rules.terms.filter((term) => {
        const normalizedTerm = clean(term);
        return normalizedTerm.length <= 4
          ? tokens.includes(normalizedTerm)
          : text.includes(normalizedTerm);
      });
      return { domain, matchedTerms };
    })
    .filter((item) => item.matchedTerms.length > 0)
    .sort((a, b) => b.matchedTerms.length - a.matchedTerms.length);
  const best = ranked[0];
  if (!best || (ranked[1] && ranked[1].matchedTerms.length === best.matchedTerms.length)) {
    return { domain: "general", confidence: 0, matchedTerms: [] };
  }
  return {
    domain: best.domain,
    confidence: Math.min(0.9, 0.55 + (best.matchedTerms.length - 1) * 0.12),
    matchedTerms: best.matchedTerms
  };
}

export function getDirectorKnowledge(
  prompt: string,
  language: "en" | "ru" = "en"
): DirectorKnowledge {
  const inference = inferDirectorKnowledgeDomain(prompt);
  const ru = language === "ru";
  if (inference.domain === "general") {
    return {
      ...inference,
      principles: [ru
        ? "Сначала найди понятную историю и самые сильные реальные моменты; подбирай эффекты под движение и смысл."
        : "First establish a clear story and strongest real moments; choose effects to support motion and meaning."],
      avoid: [ru
        ? "Не выдумывай события и не используй эффект, если он ухудшает читаемость."
        : "Do not invent events or use effects that reduce readability."],
      evaluationQuestions: [ru ? "Понятна ли история?" : "Is the story clear?", ru ? "Оправдан ли каждый эффект?" : "Is each effect motivated?"]
    };
  }
  const rules = RULES[inference.domain];
  return {
    ...inference,
    principles: rules.principles,
    avoid: rules.avoid,
    evaluationQuestions: rules.evaluationQuestions
  };
}

/** Compact, user-facing explanation that can be included in a generated edit brief. */
export function formatDirectorKnowledge(knowledge: DirectorKnowledge, language: "en" | "ru" = "en"): string[] {
  const ru = language === "ru";
  const domainLabels: Record<DirectorKnowledgeDomain, string> = {
    gaming: ru ? "игровой контент" : "gaming",
    automotive: ru ? "автомобили и дрифт" : "automotive",
    "nature-travel": ru ? "природа и путешествия" : "nature and travel",
    food: ru ? "еда и готовка" : "food and cooking",
    sports: ru ? "спорт" : "sports",
    people: ru ? "люди и повседневные истории" : "people and everyday stories",
    "product-diy": ru ? "товары и инструкции" : "products and tutorials",
    anime: ru ? "аниме / AMV" : "anime / AMV",
    general: ru ? "универсальный монтаж" : "general editing"
  };
  return [
    `${ru ? "ЗНАНИЯ AI DIRECTOR" : "AI DIRECTOR KNOWLEDGE"} — ${domainLabels[knowledge.domain]}${knowledge.confidence ? ` (${ru ? "уверенность по тексту запроса" : "prompt-text confidence"}: ${Math.round(knowledge.confidence * 100)}%)` : ""}. ${ru ? "Это вывод по запросу, а не подтверждённое распознавание исходных кадров." : "This is inferred from the brief, not verified recognition of source frames."}`,
    `${ru ? "ПРИНЦИПЫ МОНТАЖА" : "EDITING PRINCIPLES"} — ${knowledge.principles.join(" ")}`,
    `${ru ? "ЧЕГО ИЗБЕГАТЬ" : "AVOID"} — ${knowledge.avoid.join(" ")}`,
    `${ru ? "ВОПРОСЫ КАЧЕСТВА" : "QUALITY CHECK"} — ${knowledge.evaluationQuestions.join(" ")}`
  ];
}
