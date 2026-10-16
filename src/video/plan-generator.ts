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

type PromptIntent = {
  label: string;
  hook: string;
  build: string;
  payoff: string;
  cues: string[];
  constraints: string[];
  platform: string | null;
  pace: string;
  audioRequest: string | null;
  captionRequest: string | null;
  transitionRequest: string | null;
};

const clean = (value: string) => value.replace(/\s+/g, " ").trim();
const includesAny = (text: string, terms: string[]) => terms.some((term) => text.includes(term));
const normalized = (value: string) => clean(value.toLocaleLowerCase().normalize("NFKC"));

const durationSeconds = (value: string) => {
  const number = Number.parseInt(value, 10);
  if (!Number.isFinite(number) || number <= 0) return 30;
  return value.toLowerCase().includes("minute") || value.toLocaleLowerCase().includes("мин")
    ? number * 60
    : number;
};

const NO_TEXT_TERMS = [
  "no text", "no titles", "no captions", "no subtitles", "without text", "without captions",
  "без текста", "без надпис", "без субтит", "не добавляй текст", "не добавлять текст",
  "без тексту", "без написів", "без титрів"
];

export function shouldSuppressTextOverlay(prompt: string): boolean {
  const text = normalized(prompt);
  return includesAny(text, NO_TEXT_TERMS);
}

function detectIntent(prompt: string, ru: boolean, hasVideo: boolean): PromptIntent {
  const text = normalized(prompt);
  const has = (...terms: string[]) => includesAny(text, terms);
  const cues: string[] = [];
  const constraints: string[] = [];

  const gaming = has(
    "mobile legends", "mlbb", "moba", "clint", "fanny", "karrie", "brody", "gusion", "sun gameplay",
    "gameplay", "gaming", "ranked", "rank match", "pentakill", "maniac", "savage", "kill montage",
    "мобайл легенд", "мобайл легенс", "млбб", "геймплей", "геймпле", "катка", "ранг", "рангов",
    "клинт", "фанни", "кэрри", "сэвидж", "сейвидж", "маниак", "пентакил", "килл", "фраг"
  );
  const car = has("car edit", "car montage", "supercar", "nissan gtr", "gtr r35", "audi rs6", "drift", "racing", "машин", "авто", "дрифт", "гонк", "суперкар");
  const anime = has("anime", "amv", "manga", "jujutsu", "jujutsu kaisen", "toji", "аниме", "манга", "дзюдзюцу", "тодзи");
  const action = has("action", "fight", "combat", "battle", "explosion", "chase", "экшен", "драк", "бой", "сражен", "погон", "взрыв");
  const travel = has("travel", "trip", "journey", "vacation", "nature", "landscape", "путешеств", "поездк", "отпуск", "природ", "пейзаж", "море", "город");
  const tutorial = has("tutorial", "how to", "guide", "tips", "explainer", "обуч", "гайд", "инструкц", "совет", "объясни", "покажи как");
  const promo = has("product", "business", "brand", "advert", "promo", "store", "товар", "продукт", "реклам", "магазин", "бренд", "промо");
  const story = has("story", "storytelling", "character", "cinematic story", "plot", "истори", "сюжет", "персонаж", "герой", "драматич");
  const musicVideo = has("music video", "music edit", "music montage", "song edit", "клип под музыку", "музыкальный клип", "эдит под музыку", "под трек");
  const verticalPlatform = has("tiktok", "tik tok", "reels", "youtube shorts", "shorts", "тик ток", "тикток", "рилс", "шортс");
  const horizontalPlatform = has("youtube video", "long-form", "long form", "cinematic film", "ютуб видео", "длинное видео");
  const fast = has("fast cuts", "quick cuts", "velocity", "high energy", "aggressive", "rapid", "быстрый монтаж", "быстрые склейки", "динамичный", "агрессивный", "скоростной", "velocity");
  const slow = has("slow", "slow motion", "slowed", "dreamy", "calm", "atmospheric", "медленный", "замедлен", "спокойный", "атмосфер", "плавный", "слоумо");
  const cinematic = has("cinematic", "film look", "movie-like", "film grain", "киношн", "кинематограф", "как в кино");
  const glitch = has("glitch", "cyberpunk", "rgb split", "digital distortion", "глитч", "киберпанк", "неон");
  const energetic = has("impact", "shake", "flash", "whoosh", "удар", "тряск", "вспыш", "свуш");
  const requestBeatSync = has("sync to the beat", "beat sync", "on beat", "sync with music", "music beats", "cut to the beat", "в такт музыке", "под бит", "синхронно с музыкой", "по биту", "под ритм");
  const requestSlowMotion = has("slow motion", "slow-mo", "slowmo", "slowed", "замедлен", "слоумо", "медленные кадры");
  const requestTransitions = has("transition", "transitions", "smooth transition", "whip pan", "match cut", "переход", "переходы", "плавные склейки", "вайп");
  const requestCaptions = has("subtitles", "captions", "on-screen text", "text overlay", "titles", "надписи", "субтитры", "текст на экране", "титры");
  const noText = shouldSuppressTextOverlay(prompt);
  const noEffects = has("no effects", "without effects", "clean edit", "без эффектов", "без лишних эффектов");
  const noFlash = has("no flashes", "without flashes", "без вспышек", "без флешей");
  const noShake = has("no shake", "without shake", "без тряски", "без шейка");
  const noMusic = has("no music", "without music", "no soundtrack", "без музыки", "без фоновой музыки", "без саундтрека");
  const useOriginalAudio = has("original audio", "keep original sound", "keep game sound", "preserve audio", "оригинальный звук", "оставь звук игры", "сохрани звук");
  const requestedDuration = text.match(/(?:under|less than|до|не более|максимум)\s*(\d+)\s*(seconds?|secs?|s|секунд|сек|минут|мин)/i);
  if (verticalPlatform) cues.push(ru ? "Вертикальная короткая площадка: TikTok / Reels / Shorts." : "Vertical short-form platform: TikTok / Reels / Shorts.");
  if (horizontalPlatform) cues.push(ru ? "Запрошен горизонтальный или более длинный формат YouTube." : "A horizontal or longer YouTube format was mentioned.");
  if (fast) cues.push(ru ? "Запрошен быстрый, энергичный темп." : "Fast, high-energy pacing requested.");
  if (slow) cues.push(ru ? "Запрошен медленный или атмосферный темп." : "Slow or atmospheric pacing requested.");
  if (cinematic) cues.push(ru ? "Есть кинематографические визуальные ориентиры." : "Cinematic visual cues detected.");
  if (glitch) cues.push(ru ? "Есть глитч / киберпанк / неоновые ориентиры." : "Glitch / cyberpunk / neon cues detected.");
  if (energetic) cues.push(ru ? "Запрошены акценты движения или ударные эффекты." : "Motion accents or impact effects requested.");
  if (requestSlowMotion) cues.push(ru ? "Запрошено замедление; оно станет рекомендацией, а не изменением скорости клипа." : "Slow motion requested; this planner can recommend it but does not change clip speed.");
  if (requestBeatSync) cues.push(ru ? "Запрошена синхронизация с битом; анализ музыки пока не подключён." : "Beat sync requested; audio-beat analysis is not connected yet.");
  if (requestTransitions) cues.push(ru ? "Запрошены переходы; реальные переходы между клипами пока не реализованы." : "Transitions requested; true between-clip transitions are not implemented yet.");
  if (requestCaptions) cues.push(ru ? "Запрошены экранный текст или субтитры." : "On-screen text or captions requested.");
  if (noText) constraints.push(ru ? "Не добавлять текст, титры или субтитры." : "Do not add text, titles, or subtitles.");
  if (noEffects) constraints.push(ru ? "Избегать декоративных эффектов." : "Avoid decorative effects.");
  if (noFlash) constraints.push(ru ? "Не использовать вспышки." : "Do not use flashes.");
  if (noShake) constraints.push(ru ? "Не использовать тряску камеры." : "Do not use camera shake.");
  if (noMusic) constraints.push(ru ? "Не добавлять музыку." : "Do not add music.");
  if (useOriginalAudio) constraints.push(ru ? "Сохранить исходный звук, где это поддерживается." : "Preserve source audio where supported.");
  if (requestedDuration) constraints.push(ru ? `Ограничение по длительности из запроса: до ${requestedDuration[1]} ${requestedDuration[2]}.` : `Duration limit mentioned in prompt: under ${requestedDuration[1]} ${requestedDuration[2]}.`);

  let label: string;
  let hook: string;
  let build: string;
  let payoff: string;
  if (gaming) {
    label = ru ? "игровой хайлайт" : "gaming highlight";
    hook = ru ? "Открой самым сильным доступным игровым моментом; не выдумывай киллы или победу, которых нет в записи." : "Open with the strongest available gameplay moment; never invent kills or a win that is not in the footage.";
    build = ru ? "Сохрани понятный контекст боя, затем усиливай темп к ключевому моменту. Не обрезай важные действия так, чтобы бой стал непонятным." : "Keep enough fight context, then build toward the key moment. Do not trim actions so aggressively that the fight becomes confusing.";
    payoff = ru ? "Заверши результатом боя, ярким действием или естественным окончанием записи." : "Finish on the fight result, a strong action, or the natural end of the recording.";
  } else if (car) {
    label = ru ? "автомобильный эдит" : "car edit";
    hook = ru ? "Открой лучшим кадром автомобиля, светом или движением, доступным в исходниках." : "Open with the strongest available car, lighting, or motion shot.";
    build = ru ? "Чередуй общие планы, детали и движение; подстраивай склейки под действие, а не добавляй случайные эффекты." : "Alternate wide shots, details, and motion; cut around action rather than adding random effects.";
    payoff = ru ? "Заверши самым запоминающимся кадром или движением, которое реально есть в видео." : "Finish with the most memorable available shot or movement.";
  } else if (anime) {
    label = ru ? "аниме / AMV-эдит" : "anime / AMV edit";
    hook = ru ? "Начни с выразительного кадра персонажа или короткого визуального удара." : "Open with a striking character shot or a short visual impact.";
    build = ru ? "Чередуй крупные планы и экшен; оставляй ключевые движения читаемыми и не перегружай каждый кадр эффектами." : "Alternate close-ups and action; keep key movements readable and avoid overloading every shot with effects.";
    payoff = ru ? "Подведи монтаж к сильному моменту персонажа и заверши чистым кадром." : "Build toward a signature character moment and finish on a clean frame.";
  } else if (travel) {
    label = ru ? "история путешествия" : "travel story";
    hook = ru ? "Открой самым выразительным доступным видом или движением камеры." : "Open with the strongest available view or camera movement.";
    build = ru ? "Переходи от общего плана к деталям и движению, избегая повторения похожих кадров." : "Move from establishing views to details and motion, avoiding repetitive shots.";
    payoff = ru ? "Заверши запоминающимся видом или естественным спокойным финалом." : "Finish on a memorable view or a natural, calm ending.";
  } else if (tutorial) {
    label = ru ? "обучающий ролик" : "tutorial";
    hook = ru ? "Сразу покажи результат или проблему, которую объясняет ролик." : "Show the result or problem the video will explain right away.";
    build = ru ? "Разбей материал на понятные шаги; удерживай важные детали достаточно долго для чтения." : "Break the material into clear steps and hold important details long enough to read.";
    payoff = ru ? "Покажи результат и кратко закрепи главный вывод." : "Show the outcome and reinforce the main takeaway.";
  } else if (promo) {
    label = ru ? "промо-ролик" : "promotional video";
    hook = ru ? "Покажи продукт или главное преимущество в первые секунды." : "Show the product or clearest benefit in the opening seconds.";
    build = ru ? "Последовательно раскрой преимущества, используя только доступные исходники и факты из запроса." : "Reveal benefits in sequence, using only available footage and facts supplied in the brief.";
    payoff = ru ? "Заверши предложением или призывом к действию, только если он задан пользователем." : "End with an offer or call to action only if the user supplied one.";
  } else if (story || musicVideo || action) {
    label = ru ? (musicVideo ? "музыкальный эдит" : action ? "экшен-монтаж" : "сюжетный ролик") : (musicVideo ? "music edit" : action ? "action montage" : "story-driven video");
    hook = ru ? "Открой интригующим или самым динамичным доступным кадром." : "Open with an intriguing or high-energy available shot.";
    build = ru ? "Постепенно усиливай напряжение, чередуя основные моменты и короткий контекст." : "Build momentum gradually, alternating key moments with brief context.";
    payoff = ru ? "Сохрани главный визуальный акцент для кульминации и заверши осмысленно." : "Save the strongest visual beat for the climax and end with intent.";
  } else {
    label = ru ? "короткий монтаж" : "short-form montage";
    hook = ru ? "Выбери выразительный доступный кадр для первых 1–2 секунд." : "Use a strong available shot for the first 1–2 seconds.";
    build = ru ? "Каждый фрагмент должен добавлять новую информацию; убирай повторения и пустые паузы." : "Each segment should add new information; remove repetition and dead time.";
    payoff = ru ? "Заверши главным визуальным акцентом, не добавляя сцен, которых нет в исходниках." : "Finish on the strongest visual payoff without inventing scenes absent from the footage.";
  }

  if (!hasVideo) {
    constraints.push(ru ? "Видео не импортировано: план не может выбрать реальные кадры." : "No video imported: the plan cannot select actual shots.");
  }
  if (requestBeatSync && !constraints.some((item) => item.toLowerCase().includes("beat"))) {
    constraints.push(ru ? "Синхронизация с битом пока только рекомендация: автоматический анализ аудио не подключён." : "Beat sync remains a recommendation: automatic audio analysis is not connected.");
  }
  if (requestTransitions && !constraints.some((item) => item.toLowerCase().includes("transition") || item.toLowerCase().includes("переход"))) {
    constraints.push(ru ? "Переходы описаны как идея: настоящий движок переходов ещё не реализован." : "Transitions are described as a concept: the true transition engine is not implemented yet.");
  }

  const platform = verticalPlatform ? (ru ? "вертикальные короткие видео" : "vertical short-form") : horizontalPlatform ? (ru ? "горизонтальный YouTube" : "horizontal YouTube") : null;
  const pace = fast ? (ru ? "быстрый" : "fast") : slow ? (ru ? "медленный / атмосферный" : "slow / atmospheric") : (ru ? "сбалансированный" : "balanced");
  const audioRequest = noMusic ? (ru ? "музыка не нужна" : "no music requested") : requestBeatSync ? (ru ? "запрошен бит-синк, но автоматический анализ не доступен" : "beat sync requested, but automatic analysis is unavailable") : useOriginalAudio ? (ru ? "сохранить исходный звук" : "preserve source audio") : null;
  const captionRequest = noText ? (ru ? "без текста" : "no text") : requestCaptions ? (ru ? "текст / субтитры запрошены" : "text / captions requested") : null;
  const transitionRequest = noEffects ? (ru ? "без декоративных эффектов" : "no decorative effects") : requestTransitions ? (ru ? "переходы запрошены, но не поддерживаются как реальные эффекты" : "transitions requested but not supported as real effects") : null;

  return { label, hook, build, payoff, cues, constraints, platform, pace, audioRequest, captionRequest, transitionRequest };
}

export function generateLocalPlan(input: PlanInput): string[] {
  const ru = input.language === "ru";
  const prompt = clean(input.prompt);
  const seconds = durationSeconds(input.duration);
  const shot = input.style === "velocity" || input.style === "anime"
    ? (seconds <= 20 ? "0.5–1.5 s" : "0.7–2 s")
    : input.style === "cinematic" ? "2–4 s" : "1–3 s";
  const ruShot = shot.replace(/\./g, ",");
  const mediaCount = input.videoNames.length + input.imageNames.length;
  const intent = detectIntent(prompt, ru, input.videoNames.length > 0);
  const mediaLine = mediaCount
    ? (ru
      ? `ИСХОДНИКИ — ${input.videoNames.length} видео, ${input.imageNames.length} изображений. Используй только эти файлы; локальный планировщик пока не распознаёт содержание каждого кадра.`
      : `SOURCE MEDIA — ${input.videoNames.length} video clip(s), ${input.imageNames.length} image(s). Use these files only; the local planner does not yet understand each shot semantically.`)
    : (ru
      ? "ИСХОДНИКИ — медиа не добавлены. План описывает монтаж, но готовый ролик без видео или изображений не получится."
      : "SOURCE MEDIA — no media imported. This is an edit brief only; a finished video requires source footage or images.");
  const soundLine = input.hasAudio
    ? (ru ? "ЗВУК — импортированное аудио доступно для локального экспорта; проверь баланс с исходным звуком видео." : "SOUND — imported audio is available for local export; review its balance against source-video audio.")
    : (ru ? "ЗВУК — отдельное аудио не добавлено. Экспорт не создаёт музыкальную дорожку автоматически." : "SOUND — no separate audio was imported. Export does not generate a soundtrack automatically.");
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
    velocity: ru ? "МОНТАЖ — энергичные склейки и ускорение только на движении; синхронизация с битом не подтверждается без анализа аудио." : "EDITING — energetic cuts and speed changes only where motion supports them; beat sync is not confirmed without audio analysis.",
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
  const understanding = ru
    ? `КАК DRAVEX ПОНЯЛ ЗАПРОС — задача: ${intent.label}; темп: ${intent.pace}${intent.platform ? `; площадка: ${intent.platform}` : ""}.`
    : `DRAVEX UNDERSTANDING — task: ${intent.label}; pacing: ${intent.pace}${intent.platform ? `; platform: ${intent.platform}` : ""}.`;
  const cueLine = intent.cues.length
    ? `${ru ? "НАЙДЕННЫЕ УКАЗАНИЯ" : "DETECTED CUES"} — ${intent.cues.join(" ")}`
    : (ru ? "НАЙДЕННЫЕ УКАЗАНИЯ — специфические приёмы не распознаны; используй выбранный стиль и общий план." : "DETECTED CUES — no specific editing techniques were recognized; use the selected style and general outline.");
  const constraintLine = intent.constraints.length
    ? `${ru ? "ОГРАНИЧЕНИЯ ЗАПРОСА" : "REQUEST CONSTRAINTS"} — ${intent.constraints.join(" ")}`
    : (ru ? "ОГРАНИЧЕНИЯ ЗАПРОСА — явных запретов или дополнительных ограничений не распознано." : "REQUEST CONSTRAINTS — no explicit prohibitions or extra constraints were recognized.");
  const styleText = styleLine[input.style];
  const tailoredStyle = intent.cues.some((cue) => cue.toLowerCase().includes(ru ? "медлен" : "slow"))
    ? (ru ? `${styleText} УЧЁТ ЗАПРОСА — сохраняй более длинные планы, несмотря на выбранный стиль.` : `${styleText} PROMPT ADAPTATION — keep longer shots despite the selected style.`)
    : intent.cues.some((cue) => cue.toLowerCase().includes(ru ? "быстр" : "fast"))
      ? (ru ? `${styleText} УЧЁТ ЗАПРОСА — отдавай приоритет коротким планам и динамике.` : `${styleText} PROMPT ADAPTATION — prioritize shorter shots and momentum.`)
      : styleText;

  return [
    `${ru ? "ИДЕЯ" : "BRIEF"} — ${title || intent.label}`,
    understanding,
    output,
    ...scenes.map((scene, index) => `${String(index + 1).padStart(2, "0")} · ${scene.name} [${scene.at}] — ${scene.desc}`),
    cueLine,
    constraintLine,
    tailoredStyle,
    mediaLine,
    soundLine,
    ru ? `ТЕМП — ориентир длительности кадра ${ruShot}; это рекомендация, а не автоматическая нарезка.` : `PACING — target shot length ${shot}; this is guidance, not automatic trimming.`,
    ru ? "ЧЕСТНОЕ ОГРАНИЧЕНИЕ — это локальный анализ ключевых слов, настроек и списка файлов, а не подключённая языковая модель. План не распознаёт реальные сцены и не применяет все описанные эффекты автоматически." : "LIMITATION — this is local keyword analysis of your prompt, settings, and file list, not a connected language model. The plan does not recognize actual scenes or automatically apply every described effect."
  ];
}

export function makeOverlayTitle(prompt: string, fallback: string): string {
  if (shouldSuppressTextOverlay(prompt)) return "";
  const firstLine = clean(prompt).split(/[.!?\n]/)[0];
  const withoutCommand = firstLine.replace(/^(please\s+)?(make|create|edit|generate|montage|сделай|создай|смонтируй|сгенерируй|монтаж)\s+(me\s+)?(a\s+|an\s+|the\s+)?(video\s+)?/i, "");
  const title = clean(withoutCommand).slice(0, 48);
  return title || clean(fallback).slice(0, 48) || "DRAVEX";
}
