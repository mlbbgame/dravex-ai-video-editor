export type SavedDravexProject = {
  files: File[];
  musicFile: File | null;
  style: string;
  duration: number;
  aspectRatio?: "9:16" | "16:9" | "1:1" | "4:5";
  quality: "720p" | "1080p" | "4K";
  beatSync: boolean;
  effectStrength?: "none" | "soft" | "balanced" | "strong";
  musicVolume?: number;
  transitionMode?: "auto" | "cinematic" | "action";
  savedAt: string;
};

const DATABASE_NAME = "dravex-projects";
const DATABASE_VERSION = 1;
const PROJECT_KEY = "last-project";

function openDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === "undefined") {
      reject(new Error("Локальное хранилище проектов недоступно в этом браузере."));
      return;
    }
    const request = indexedDB.open(DATABASE_NAME, DATABASE_VERSION);
    request.onupgradeneeded = () => {
      if (!request.result.objectStoreNames.contains("projects")) {
        request.result.createObjectStore("projects");
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error("Не удалось открыть хранилище проектов."));
  });
}

export async function saveLocalProject(project: Omit<SavedDravexProject, "savedAt">): Promise<string> {
  const database = await openDatabase();
  try {
    await new Promise<void>((resolve, reject) => {
      const transaction = database.transaction("projects", "readwrite");
      transaction.objectStore("projects").put({ ...project, savedAt: new Date().toISOString() }, PROJECT_KEY);
      transaction.oncomplete = () => resolve();
      transaction.onerror = () => reject(transaction.error ?? new Error("Не удалось сохранить проект."));
      transaction.onabort = () => reject(transaction.error ?? new Error("Сохранение проекта отменено."));
    });
    return new Date().toISOString();
  } finally {
    database.close();
  }
}

export async function loadLocalProject(): Promise<SavedDravexProject | null> {
  const database = await openDatabase();
  try {
    return await new Promise((resolve, reject) => {
      const transaction = database.transaction("projects", "readonly");
      const request = transaction.objectStore("projects").get(PROJECT_KEY);
      request.onsuccess = () => resolve((request.result as SavedDravexProject | undefined) ?? null);
      request.onerror = () => reject(request.error ?? new Error("Не удалось загрузить сохранённый проект."));
    });
  } finally {
    database.close();
  }
}
