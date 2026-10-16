export type PlanStyle = "velocity" | "anime" | "cinematic" | "glitch" | "story";
export type PlanInput = {
  prompt: string;
  style: PlanStyle;
  duration: string;
  aspectRatio: string;
  quality: string;
  language: "en" | "ru";
  videoNames: string[];
  imageNames: string[];
  hasAudio: boolean;
};

const durationSeconds = (value: string) => {
  const number = Number.parseInt(value, 10);
  if (!Number.isFinite(number) || number <= 0) return 30;
  return value.toLowerCase().includes("minute") || value.includes("мин")
    ? number * 60
    : number;
};

const clean = (value: string) => value.replace(/\s+/g, " ").trim();

function detectIntent(prompt: string, ru: boolean) {
  const text = prompt.toLocaleLowerCase();
  const has = (...terms: string[]) => terms.some((term) => text.includes(term));
  if (has("mobile legends", "mlbb", "clint", "fanny", "karrie", "манг", "мобайл легенд", "клинт", "фанни", "кэрри", "геймплей", "gameplay", "rank", "ранг", "kill", "килл", "пента")) {
    return {
      label: ru ? "игровой хайлайт" : "gaming highlight",
      hook: ru ? "Начни с самого зрелищного фрага или опасного момента, если он есть в исходниках." : "Open with the strongest available elimination or high-pressure moment.",
      build: ru ? "Покажи короткий контекст, затем ключевой бой; не вставляй кадры, которые не помогают понять действие." : "Show brief context, then the key fight; avoid shots that do not clarify the action.",
      payoff: ru ? "Оставь лучший момент на кульминацию и закончи результатом боя или реакцией." : "Save the best available moment for the climax and end on the result or reaction."
    };
  }
  if (has("product", "business", "brand", "товар", "продукт", "реклама", "магазин", "sale", "скид")) {
    return {
      label: ru ? "промо-ролик" : "promotional video",
      hook: ru ? "Покажи продукт или главное преимущество в первые секунды." : "Show the product or its clearest benefit immediately.",
      build: ru ? "Последовательно покажи 2–3 преимущества, используя только доступные исходники." : "Show two or three benefits using only the available footage.",
      payoff: ru ? "Заверши понятным предложением или призывом к действию, если он задан в запросе." : "End with the offer or call to action if the brief provides one."
    };
  }
  if (has("travel", "trip", "journey", "путешеств", "поездк", "отпуск", "город", "nature", "природ", "sea", "море")) {
    return {
      label: ru ? "история путешествия" : "travel story",
      hook: ru ? "Открой ролик самым красивым доступным видом." : "Open with the strongest available establishing view.",
      build: ru ? "Проведи зрителя от места к деталям и движению; избегай случайного повторения похожих кадров." : "Move from the location to details and motion; avoid repeating similar shots.",
      payoff: ru ? "Заверши самым спокойным или запоминающимся видом." : "Finish on the most memorable or calming available view."
    };
  }
  if (has("tutorial", "how to", "guide", "обуч", "гайд", "инструкц", "совет", "tips")) {
    return {
      label: ru ? "обучающий ролик" : "tutorial",
      hook: ru ? "Сразу покажи результат или проблему, которую решает ролик." : "Show the result or problem before explaining the steps.",
      build: ru ? "Разбей объяснение на короткие шаги в логическом порядке; оставь важные детали на экране достаточно долго." : "Break the explanation into short ordered steps and hold important details long enough to read.",
      payoff: ru ? "Покажи итог и кратко повтори главный вывод." : "Show the outcome and restate the key takeaway."
    };
  }
  if (has("story", "storytelling", "истори", "сюжет", "персонаж", "герой", "character", "cinematic")) {
    return {
      label: ru ? "сюжетный ролик" : "story-driven video",
      hook: ru ? "Начни с интригующего кадра, который задаёт вопрос зрителю." : "Open with an intriguing shot that creates a question.",
      build: ru ? "Постепенно раскрывай героя или ситуацию; чередуй общие и крупные планы, если они есть." : "Reveal the subject gradually and alternate wide and close shots when available.",
      payoff: ru ? "Разреши главный момент и оставь сильный финальный кадр." : "Resolve the main beat and leave a strong final frame."
    };
  }
  return {
    label: ru ? "короткий монтаж" : "short-form montage",
    hook: ru ? "Выбери самый выразительный доступный кадр для первых 1–2 секунд." : "Use the strongest available shot as the first 1–2 second hook.",
    build: ru ? "Чередуй общий план и детали; каждый кадр должен добавлять новую информацию." : "Alternate establishing shots and details; each shot should add new information.",
    payoff: ru ? "Заверши главным визуальным акцентом, не добавляя случайных сцен." : "End on the strongest visual payoff without inventing extra scenes."
  };
}

export function generateLocalPlan(input: PlanInput): string[] {
  const ru = input.language === "ru";
  const prompt = clean(input.prompt);
  const seconds = durationSeconds(input.duration);
  const shot = input.style === "velocity" || input.style === "anime"
    ? (seconds <= 20 ? "0.5–1.5 s" : "0.7–2 s")
    : input.style === "cinematic" ? "2–4 s" : "1–3 s";
  const ruShot = shot.replace(/\./g, ",");
  const intent = detectIntent(prompt, ru);
  const mediaCount = input.videoNames.length + input.imageNames.length;
  const mediaLine = mediaCount
    ? (ru
      ? `ИСХОДНИКИ — ${input.videoNames.length} видео, ${input.imageNames.length} изображений. Используй только эти файлы; локальный анализ пока не распознаёт содержание каждого кадра.`
      : `SOURCE MEDIA — ${input.videoNames.length} video clip(s), ${input.imageNames.length} image(s). Use these files only; local analysis does not yet understand each shot semantically.`)
    : (ru
      ? "ИСХОДНИКИ — медиа не добавлены. План описывает монтаж, но готовый ролик без видео или изображений не получится."
      : "SOURCE MEDIA — no media imported. This is an edit brief only; a finished video requires source footage or images.");
  const soundLine = input.hasAudio
    ? (ru ? "ЗВУК — импортированное аудио будет добавлено на доступном уровне громкости; проверь, не перекрывает ли оно речь." : "SOUND — imported audio will be mixed at the selected level; check that it does not overpower speech.")
    : (ru ? "ЗВУК — отдельная музыка не добавлена. Экспорт не создаёт музыкальную дорожку автоматически." : "SOUND — no separate music was imported. Export does not generate a soundtrack.");
  const scenes = seconds <= 20
    ? [{ at: "00–10%", name: ru ? "ЗАЦЕПКА" : "HOOK", desc: intent.hook },
       { at: "10–75%", name: ru ? "РАЗВИТИЕ" : "BUILD", desc: intent.build },
       { at: "75–100%", name: ru ? "ФИНАЛ" : "PAYOFF", desc: intent.payoff }]
    : [{ at: "00–08%", name: ru ? "ЗАЦЕПКА" : "HOOK", desc: intent.hook },
       { at: "08–30%", name: ru ? "КОНТЕКСТ" : "CONTEXT", desc: ru ? "Быстро объясни, что происходит, используя только подходящие исходные кадры." : "Establish what is happening with relevant source shots only." },
       { at: "30–75%", name: ru ? "РАЗВИТИЕ" : "BUILD", desc: intent.build },
       { at: "75–92%", name: ru ? "КУЛЬМИНАЦИЯ" : "CLIMAX", desc: ru ? "Поставь самый сильный доступный момент сюда; не имитируй эффект, которого нет в исходнике." : "Place the strongest available moment here; do not fake an effect that is absent from the source." },
       { at: "92–100%", name: ru ? "ФИНАЛ" : "OUTRO", desc: intent.payoff }];
  const styleLine: Record<PlanStyle, string> = {
    velocity: ru ? "МОНТАЖ — энергичные склейки и ускорение только на движении; не заявляем beat-sync без анализа аудио." : "EDITING — energetic cuts and speed changes only where motion supports them; no beat-sync is claimed without audio analysis.",
    anime: ru ? "МОНТАЖ — акцент на герое, короткие ударные кадры и умеренные вспышки; не добавляй эффект на каждый кадр." : "EDITING — emphasize the subject with short impact shots and restrained flashes; do not apply an effect to every shot.",
    cinematic: ru ? "МОНТАЖ — плавный темп, читаемые планы и минимум резких эффектов." : "EDITING — measured pacing, readable shots, and minimal abrupt effects.",
    glitch: ru ? "МОНТАЖ — редкие глитч-акценты только в ключевых местах, основная картинка остаётся читаемой." : "EDITING — reserve glitch accents for key moments and keep the main image readable.",
    story: ru ? "МОНТАЖ — логическая последовательность, короткие подписи и ясная история даже без звука." : "EDITING — clear sequence, short captions, and a story that remains understandable without sound."
  };
  const title = prompt
    ? prompt.split(/[.!?\n]/)[0].replace(/^(make|create|edit|generate|сделай|создай|смонтируй|сгенерируй)\s+(a|an|the|мне|мне\s+видео)?\s*/i, "").slice(0, 72)
    : (ru ? "Монтаж по исходным материалам" : "Source-media montage");
  const output = ru
    ? `ФОРМАТ — ${input.aspectRatio}, ${input.quality}, ${seconds} с; тип задачи: ${intent.label}.`
    : `OUTPUT — ${input.aspectRatio}, ${input.quality}, ${seconds}s; task type: ${intent.label}.`;
  return [
    `${ru ? "ИДЕЯ" : "BRIEF"} — ${title || intent.label}`,
    output,
    ...scenes.map((scene, index) => `${String(index + 1).padStart(2, "0")} · ${scene.name} [${scene.at}] — ${scene.desc}`),
    styleLine[input.style],
    mediaLine,
    soundLine,
    ru ? `ТЕМП — ориентир длительности кадра ${ruShot}; длительность не означает автоматическую нарезку.` : `PACING — target shot length ${shot}; this guideline does not automatically cut clips.`,
    ru ? "ЧЕСТНОЕ ОГРАНИЧЕНИЕ — это локальный план по ключевым словам, настройкам и списку файлов, а не подключённая языковая модель. Перед экспортом проверь последовательность вручную." : "LIMITATION — this local plan uses keywords, settings, and filenames, not a connected language model. Review the sequence manually before export."
  ];
}

export function makeOverlayTitle(prompt: string, fallback: string): string {
  const firstLine = clean(prompt).split(/[.!?\n]/)[0];
  const withoutCommand = firstLine.replace(/^(please\s+)?(make|create|edit|generate|montage|сделай|создай|смонтируй|сгенерируй|монтаж)\s+(me\s+)?(a\s+|an\s+|the\s+)?(video\s+)?/i, "");
  const title = clean(withoutCommand).slice(0, 48);
  return title || clean(fallback).slice(0, 48) || "DRAVEX";
}
