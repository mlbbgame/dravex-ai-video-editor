export type SavedDravexProject = {
  files: File[];
  musicFile: File | null;
  style: string;
  duration: number;
  aspectRatio?: "9:16" | "16:9" | "1:1" | "4:5";
  quality: "720p" | "1080p" | "4K";
  beatSync: boolean;
  effectStrength?: "soft" | "balanced" | "strong";
  musicVolume?: number;
  transitionMode?: "auto" | "cinematic" | "action";
  savedAt: string;
};

const DATABASE_NAME = "dravex-projects";
const DATABASE_VERSION = 1;
const SESSION_PROJECT_KEY = "session-project";
const SAVED_PROJECT_KEY = "saved-project";

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

async function saveProjectAtKey(
  project: Omit<SavedDravexProject, "savedAt">,
  key: string
): Promise<string> {
  const database = await openDatabase();
  try {
    await new Promise<void>((resolve, reject) => {
      const transaction = database.transaction("projects", "readwrite");
      transaction.objectStore("projects").put({ ...project, savedAt: new Date().toISOString() }, key);
      transaction.oncomplete = () => resolve();
      transaction.onerror = () => reject(transaction.error ?? new Error("Не удалось сохранить проект."));
      transaction.onabort = () => reject(transaction.error ?? new Error("Сохранение проекта отменено."));
    });
    return new Date().toISOString();
  } finally {
    database.close();
  }
}

async function loadProjectAtKey(key: string): Promise<SavedDravexProject | null> {
  const database = await openDatabase();
  try {
    return await new Promise((resolve, reject) => {
      const transaction = database.transaction("projects", "readonly");
      const request = transaction.objectStore("projects").get(key);
      request.onsuccess = () => resolve((request.result as SavedDravexProject | undefined) ?? null);
      request.onerror = () => reject(request.error ?? new Error("Не удалось загрузить сохранённый проект."));
    });
  } finally {
    database.close();
  }
}

async function clearProjectAtKey(key: string): Promise<void> {
  const database = await openDatabase();
  try {
    await new Promise<void>((resolve, reject) => {
      const transaction = database.transaction("projects", "readwrite");
      transaction.objectStore("projects").delete(key);
      transaction.oncomplete = () => resolve();
      transaction.onerror = () => reject(transaction.error ?? new Error("Не удалось очистить сохранённый проект."));
      transaction.onabort = () => reject(transaction.error ?? new Error("Очистка проекта отменена."));
    });
  } finally {
    database.close();
  }
}

/** Manual save survives a fresh tab/browser session until the user replaces it. */
export function saveLocalProject(project: Omit<SavedDravexProject, "savedAt">): Promise<string> {
  return saveProjectAtKey(project, SAVED_PROJECT_KEY);
}

export function loadLocalProject(): Promise<SavedDravexProject | null> {
  return loadProjectAtKey(SAVED_PROJECT_KEY);
}

/** Session autosave is restored on reloads in the same tab and cleared in a new session. */
export function saveSessionProject(project: Omit<SavedDravexProject, "savedAt">): Promise<string> {
  return saveProjectAtKey(project, SESSION_PROJECT_KEY);
}

export function loadSessionProject(): Promise<SavedDravexProject | null> {
  return loadProjectAtKey(SESSION_PROJECT_KEY);
}

/** Remove only the session draft; never delete the user's explicit manual save. */
export function clearSessionProject(): Promise<void> {
  return clearProjectAtKey(SESSION_PROJECT_KEY);
}
