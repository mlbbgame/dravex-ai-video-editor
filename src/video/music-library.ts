export type MusicPreset = {
  id: string;
  title: string;
  mood: string;
  description: string;
  audioUrl: string;
  sourceUrl: string;
  artist: string;
  license: "CC0";
  style: "action" | "phonk" | "anime" | "cinematic" | "slow" | "chill";
  tags: string[];
};

const media = (cid: string) => `https://ipfs.transientusercontent.xyz/ipfs/${cid}/media`;
const source = (slug: string) => `https://www.transient.xyz/mint/${slug}`;

/**
 * Ready-to-use tracks from MOTE-MEDIA / TONCHU's Based Music collection.
 * The upstream collection marks these recordings CC0 1.0. Audio is streamed
 * from the publisher's media host; users do not need to manually download files.
 */
export const musicPresets: MusicPreset[] = [
  { id: "crash-up", title: "Crash Up", mood: "Action", description: "Агрессивный электронный бит для экшен-эдитов", audioUrl: media("QmepzjaainbRKXCdiEtQCtKSiDL2PkjvqRSi4tzvQpA5zb"), sourceUrl: source("crash-up"), artist: "TONCHU", license: "CC0", style: "action", tags: ["Phonk / Drift","TikTok / Shorts","Gaming"] },
  { id: "wildfire", title: "Wildfire", mood: "Action", description: "Интенсивная электроника с hip-hop настроением", audioUrl: media("QmT6DzUH34MDcFYqr1erPkdixQPYy3t3HsVBZtj621XLac"), sourceUrl: source("wildfire"), artist: "TONCHU", license: "CC0", style: "action", tags: ["Phonk / Drift","TikTok / Shorts","Electronic"] },
  { id: "immortal-combat", title: "Immortal Combat", mood: "Epic", description: "Эпичный синтезаторный трек для боевых сцен", audioUrl: media("QmUKh82NhX5hoCRLqDa9qpMJhmmMgo7tqpa61mbhcmoAcq"), sourceUrl: source("immortal-combat"), artist: "TONCHU", license: "CC0", style: "cinematic", tags: ["Cinematic","Gaming","TikTok / Shorts"] },
  { id: "turbulence", title: "Turbulence", mood: "Electronic", description: "Клубная электроника с глубоким басом", audioUrl: media("QmUMoG8D44XKi8Qg6vYhLqahJV6mwACwz2Na3wQyRoiu8E"), sourceUrl: source("turbulence"), artist: "TONCHU", license: "CC0", style: "action", tags: ["Phonk / Drift","Electronic","TikTok / Shorts"] },
  { id: "through-it-all", title: "Through It All", mood: "Drum & Bass", description: "Быстрый клубный ритм для динамичных склеек", audioUrl: media("QmRDqTM3ZfZ8Hbo2o3hUxCB3VnSCJ6gpvdPYA8fPJ2q48C"), sourceUrl: source("through-it-all"), artist: "TONCHU", license: "CC0", style: "action", tags: ["Anime / Jumpstyle","Electronic","TikTok / Shorts"] },
  { id: "gold-leaf", title: "Gold Leaf", mood: "Action", description: "Интенсивный футуристический синтезаторный бит", audioUrl: media("Qmc4R2hdK69XDvNRVrMBVHsiWKW7gZNGUcv89bQ6B2ChUv"), sourceUrl: source("gold-leaf"), artist: "TONCHU", license: "CC0", style: "action", tags: ["Anime / Jumpstyle","Gaming","TikTok / Shorts"] },
  { id: "shadowhawk", title: "Shadowhawk", mood: "Dark", description: "Тёмный, напряжённый trip-hop для мрачных эдитов", audioUrl: media("QmQefoY1CKK5LmkPrm2N1n2VtVH5B9Fr9w4SWBFtABEzzm"), sourceUrl: source("shadowhawk"), artist: "TONCHU", license: "CC0", style: "phonk", tags: ["Slowed / Dark","Phonk / Drift","Cinematic"] },
  { id: "levitation", title: "Levitation", mood: "Dark", description: "Глубокий бас и космическое напряжение", audioUrl: media("QmU4QATXm6QjGE6VQpLwHux7zPuEPkoifZLuvTMcMVQftW"), sourceUrl: source("levitation"), artist: "TONCHU", license: "CC0", style: "phonk", tags: ["Slowed / Dark","Phonk / Drift","Cinematic"] },
  { id: "obelisk", title: "Obelisk", mood: "Electronic", description: "Глубокий бас и атмосферная электроника", audioUrl: media("QmV96xND71yhP5mbujPc2ZoSPWRrhurcvTdvfpuKDMCa2u"), sourceUrl: source("obelisk"), artist: "TONCHU", license: "CC0", style: "cinematic", tags: ["Slowed / Dark","Cinematic","Electronic"] },
  { id: "heading-home", title: "Heading Home", mood: "Epic", description: "Синтезаторы и скрипичные акценты", audioUrl: media("QmW9qmLkMuHneH192trWeEgxRzzgpmSjJqAaXnBvobnr3z"), sourceUrl: source("heading-home"), artist: "TONCHU", license: "CC0", style: "cinematic", tags: ["Cinematic","Gaming"] },
  { id: "arcade-daze", title: "Arcade Daze", mood: "Gaming", description: "Ретро-футуристическое звучание для игровых эдитов", audioUrl: media("QmVqtqwznj8VgVvquxgzBTXELqqxSrPMST6a5X3kg5KLCN"), sourceUrl: source("arcade-daze"), artist: "TONCHU", license: "CC0", style: "anime", tags: ["Anime / Jumpstyle","Gaming","TikTok / Shorts"] },
  { id: "wavy", title: "Wavy", mood: "Electronic", description: "Клубный электронный грув", audioUrl: media("QmR6Wd6if8gC5RaJsmX623wrEggKXLRxPp9MaMAAsKwFrG"), sourceUrl: source("wavy-song"), artist: "TONCHU", license: "CC0", style: "action", tags: ["Phonk / Drift","Electronic","TikTok / Shorts"] },
  { id: "into-the-now", title: "Into the Now", mood: "Upbeat", description: "Энергичный трек с яркими музыкальными акцентами", audioUrl: media("QmWtDgB4P9mBDrMTpFMpgT55roJEPCj3DM92vCLTASTn36"), sourceUrl: source("into-the-now"), artist: "TONCHU", license: "CC0", style: "anime", tags: ["Anime / Jumpstyle","Gaming","TikTok / Shorts"] },
  { id: "cloud-city", title: "Cloud City", mood: "Chill", description: "Мягкий future-hip-hop для спокойных кадров", audioUrl: media("QmWxgdb2ki2TCG2NxrzZ2DwDkFV6GMdh1SK8yR8P8rWd6a"), sourceUrl: source("cloud-city-song"), artist: "TONCHU", license: "CC0", style: "chill", tags: ["Slowed / Dark","Chill"] },
  { id: "rainy-out-there", title: "It's Rainy Out There", mood: "Chill", description: "Атмосферная музыка с мягкими синтезаторами", audioUrl: media("QmQ8gxDEtQ9m1eTGTHhaLtwkafZBDyF3eXeEEQ4XNkBWfR"), sourceUrl: source("its-rainy-out-there"), artist: "TONCHU", license: "CC0", style: "chill", tags: ["Slowed / Dark","Chill","Cinematic"] },
  { id: "noise", title: "Noise", mood: "Electronic", description: "Космические синтезаторы и электронная атмосфера", audioUrl: media("QmYj875w5Ji9oLjccbbX8GYJVGyJXuMGM8oG4jFoTcuPda"), sourceUrl: source("noise-song"), artist: "TONCHU", license: "CC0", style: "cinematic", tags: ["Slowed / Dark","Cinematic","Electronic"] },
  { id: "breathing-techniques", title: "Breathing Techniques", mood: "Chill", description: "Глубокий мягкий бас и спокойный грув", audioUrl: media("QmajVSeyZS67TgchEWiNFD52x6LixCVACezurBp3mh9sfB"), sourceUrl: source("breathing-techniques"), artist: "TONCHU", license: "CC0", style: "chill", tags: ["Slowed / Dark","Chill"] },
  { id: "innerversal", title: "Innerversal", mood: "Chill", description: "Мечтательная космическая электроника", audioUrl: media("QmThw6JPE7i17kxTvQcrkLb982MpDHQFn4vZqKsyjsPZA2"), sourceUrl: source("innerversal"), artist: "TONCHU", license: "CC0", style: "chill", tags: ["Slowed / Dark","Chill","Cinematic"] },
  { id: "is-it-based", title: "Is It Based", mood: "Dark", description: "Интенсивный тёмный электронный бит", audioUrl: media("QmdbzMdDBYuBBdu9dZrQDhG4mJtbT6BJ33og3q89e9UeZv"), sourceUrl: source("is-it-based"), artist: "TONCHU", license: "CC0", style: "phonk", tags: ["Phonk / Drift","Slowed / Dark","TikTok / Shorts"] },
  { id: "darkened-castle", title: "Darkened Castle", mood: "Cinematic", description: "Тёмная фэнтези-атмосфера с синтезаторами", audioUrl: media("QmcuFkaMQ77eTpLU4Qf9Ryxsk19pHxUbe7AmqUCCteWvwd"), sourceUrl: "https://www.transient.xyz/nfts/base/0xd4ba7c01269e8148e32d21032cecbd046fab72ad/3", artist: "TONCHU", license: "CC0", style: "cinematic", tags: ["Slowed / Dark","Cinematic","Gaming"] },
  { id: "ambient-drift", title: "Ambient Drift", mood: "Chill", description: "Мягкий атмосферный фон для спокойных кадров и фоновых сцен", audioUrl: "https://archive.org/download/tonchu-ambient-drift/tonchu-ambient-drift.mp3", sourceUrl: "https://archive.org/details/tonchu-ambient-drift", artist: "TONCHU", license: "CC0", style: "chill", tags: ["Background Music","Ambient","Chill","Cinematic"] },
  { id: "eleventh-wave", title: "The Eleventh Wave", mood: "Phonk", description: "Напористый электронный бит для динамичных игровых эдитов", audioUrl: media("QmWYGG5X5e58gHCuDc3W8REBudrkuBXUhU5N6oN5975aUC"), sourceUrl: "https://www.transient.xyz/mint/the-eleventh-wave", artist: "TONCHU", license: "CC0", style: "phonk", tags: ["Phonk / Drift","Gaming","Action","TikTok / Shorts"] },
  { id: "bounce-protocol", title: "Bounce Protocol Ω", mood: "Phonk", description: "Тяжёлый басовый бит для резких переходов и экшен-сцен", audioUrl: media("QmVixmoa8EcWd3394pd6D9Q5CZ62o33HUEcFaEvuHQ817a"), sourceUrl: "https://www.transient.xyz/nfts/base/0xd4ba7c01269e8148e32d21032cecbd046fab72ad/2", artist: "TONCHU", license: "CC0", style: "phonk", tags: ["Phonk / Drift","Action","Gaming","TikTok / Shorts"] },
  { id: "dragons-clear-our-path", title: "Dragons Clear Our Path", mood: "Epic", description: "Эпичный гитарный драйв для боевых и кинематографичных кадров", audioUrl: media("QmRMoe61cSHWNvDsyeDkTyPCY8wdsiS6DTFZKmfqCZdPt5"), sourceUrl: "https://www.transient.xyz/mint/dragons-clear-our-path", artist: "TONCHU", license: "CC0", style: "cinematic", tags: ["Cinematic","Gaming","Action","Epic"] },
  { id: "happy-beltane", title: "Happy Beltane", mood: "Electronic", description: "Мелодичная атмосферная электроника для фоновых и сюжетных сцен", audioUrl: media("QmbJQ8p3GPNghJBgR96KfsbqFaZCeEh2RoETbG8hqiYi61"), sourceUrl: "https://www.transient.xyz/mint/happy-beltane", artist: "TONCHU", license: "CC0", style: "cinematic", tags: ["Background Music","Cinematic","Electronic","Chill"] },
];

export const musicCategories = ["Все", "Phonk / Drift", "Anime / Jumpstyle", "Slowed / Dark", "TikTok / Shorts", "Gaming", "Cinematic", "Electronic", "Background Music", "Ambient", "Chill"] as const;

/** Fetch a licensed track in the background so it becomes a normal local audio file for preview and export. */
export async function loadMusicTrack(preset: MusicPreset): Promise<File> {
  const controller = new AbortController();
  const timeoutId = window.setTimeout(() => controller.abort(), 20_000);
  let response: Response;
  let blob: Blob;
  try {
    response = await fetch(preset.audioUrl, {
      mode: "cors",
      credentials: "omit",
      signal: controller.signal
    });
    if (!response.ok) {
      throw new Error(`Не удалось загрузить «${preset.title}». Попробуй другой трек.`);
    }
    // Keep the timeout active while the response body downloads too.
    blob = await response.blob();
  } catch (error) {
    if (controller.signal.aborted) {
      throw new Error(`Загрузка «${preset.title}» заняла слишком много времени. Проверь интернет или выбери другой трек.`);
    }
    if (error instanceof Error && error.message.startsWith("Не удалось загрузить")) throw error;
    throw new Error(`Не удалось подключиться к музыкальному источнику для «${preset.title}». Проверь интернет и попробуй снова.`);
  } finally {
    window.clearTimeout(timeoutId);
  }

  if (!blob.size) throw new Error(`Трек «${preset.title}» оказался пустым. Попробуй другой.`);

  // Some media hosts return application/octet-stream even for playable audio.
  // Keep a valid audio MIME type so browsers and local project storage recognize it.
  const responseType = (blob.type || response.headers.get("content-type") || "").split(";")[0].trim().toLowerCase();
  const audioType = responseType.startsWith("audio/") ? responseType : "audio/mpeg";
  const extension = audioType.includes("wav") ? "wav"
    : audioType.includes("ogg") ? "ogg"
      : audioType.includes("mp4") || audioType.includes("aac") ? "m4a"
        : "mp3";
  return new File([blob], `${preset.title}.${extension}`, { type: audioType });
}
