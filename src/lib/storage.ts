const DB_NAME = "vid-editor";
const DB_VERSION = 1;
const STORE_NAME = "files";

function openDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      req.result.createObjectStore(STORE_NAME);
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

// ── Old flat-key functions (kept for migration) ──

export async function saveFile(key: string, file: File): Promise<void> {
  const buffer = await file.arrayBuffer();
  const db = await openDB();
  const tx = db.transaction(STORE_NAME, "readwrite");
  tx.objectStore(STORE_NAME).put(
    { name: file.name, type: file.type, data: buffer },
    key
  );
  return new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

export async function loadFile(key: string): Promise<File | null> {
  const db = await openDB();
  const tx = db.transaction(STORE_NAME, "readonly");
  const req = tx.objectStore(STORE_NAME).get(key);
  return new Promise((resolve, reject) => {
    req.onsuccess = () => {
      const val = req.result;
      if (!val) return resolve(null);
      const file = new File([val.data], val.name, { type: val.type });
      resolve(file);
    };
    req.onerror = () => reject(req.error);
  });
}

export async function deleteFile(key: string): Promise<void> {
  const db = await openDB();
  const tx = db.transaction(STORE_NAME, "readwrite");
  tx.objectStore(STORE_NAME).delete(key);
  return new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

export async function clearFiles(): Promise<void> {
  const db = await openDB();
  const tx = db.transaction(STORE_NAME, "readwrite");
  tx.objectStore(STORE_NAME).clear();
  return new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

// ── localStorage helpers for serializable state ──

const OLD_STATE_KEY = "vid-editor-state";

export interface SerializableState {
  audioDelay: number;
  musicVolume?: number;
  durationInSeconds: number;
  transcript: { word: string; start: number; end: number }[];
  imageTiming: { startTime: number; endTime: number; animation?: string }[];
  intro: { startTime: number; duration: number; fadeDuration: number } | null;
  outro: { startTime: number; duration: number; fadeDuration: number } | null;
  introAnimation?: { enabled: boolean; style?: string; holdDuration: number; transitionDuration: number; backgroundColor: string };
  outroCard?: {
    enabled: boolean;
    usePreset: boolean;
    presetBackgroundColor?: string;
    custom: {
      brandName: string;
      tagline: string;
      disclaimer: string;
      backgroundColor: string;
    };
    transitionDuration: number;
    style?: string;
  };
  style: Record<string, unknown>;
  avatarPath?: string | null;
  scriptText?: string;
  thumbnail?: { copy: string; fontSize: number; imageIndex: number };
  audioTakes?: Array<{ id: string; label: string; avatarName: string; scriptUsed: string; transcript: { word: string; start: number; end: number }[]; createdAt: number }>;
  activeVoiceName?: string | null;
  activeTakeId?: string | null;
  sceneSuggestions?: Array<{ id: string; scriptSegment: string; description: string; imagePrompt?: string; category: string; suggestedAnimation: string; animationReason: string; priority: string; wordRange: [number, number] }>;
}

// Old flat-key state (kept for migration)
export function saveState(state: SerializableState): void {
  try {
    localStorage.setItem(OLD_STATE_KEY, JSON.stringify(state));
  } catch {}
}

export function loadState(): SerializableState | null {
  try {
    const raw = localStorage.getItem(OLD_STATE_KEY);
    if (!raw) return null;
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

export function clearState(): void {
  localStorage.removeItem(OLD_STATE_KEY);
}

// ══════════════════════════════════════════════════
// Multi-project storage
// ══════════════════════════════════════════════════

export interface ProjectMeta {
  id: string;
  name: string;
  createdAt: number;
  modifiedAt: number;
  /** Small data-URL preview from the project's first image. Local-only (not synced). */
  thumb?: string;
}

const PROJECTS_INDEX_KEY = "vid-projects-index";
const ACTIVE_PROJECT_KEY = "vid-active-project";
const MIGRATED_KEY = "vid-migrated-v1";

function projectStateKey(id: string): string {
  return `vid-project:${id}:state`;
}

function projectFileKey(projectId: string, fileKey: string): string {
  return `${projectId}:${fileKey}`;
}

function generateId(): string {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
}

// ── Project index (localStorage) ──

export function listProjects(): ProjectMeta[] {
  try {
    const raw = localStorage.getItem(PROJECTS_INDEX_KEY);
    if (!raw) return [];
    return JSON.parse(raw);
  } catch {
    return [];
  }
}

export function saveProjectsIndex(projects: ProjectMeta[]): void {
  try {
    localStorage.setItem(PROJECTS_INDEX_KEY, JSON.stringify(projects));
  } catch {}
}

export function getActiveProjectId(): string | null {
  return localStorage.getItem(ACTIVE_PROJECT_KEY);
}

export function setActiveProjectId(id: string | null): void {
  if (id) localStorage.setItem(ACTIVE_PROJECT_KEY, id);
  else localStorage.removeItem(ACTIVE_PROJECT_KEY);
}

// ── Namespaced state (localStorage) ──

export function saveProjectState(id: string, state: SerializableState): void {
  try {
    localStorage.setItem(projectStateKey(id), JSON.stringify(state));
  } catch {}
}

export function loadProjectState(id: string): SerializableState | null {
  try {
    const raw = localStorage.getItem(projectStateKey(id));
    if (!raw) return null;
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

export function clearProjectState(id: string): void {
  localStorage.removeItem(projectStateKey(id));
}

// ── Namespaced files (IndexedDB) ──

export async function saveProjectFile(projectId: string, key: string, file: File): Promise<void> {
  const buffer = await file.arrayBuffer();
  const db = await openDB();
  const tx = db.transaction(STORE_NAME, "readwrite");
  tx.objectStore(STORE_NAME).put(
    { name: file.name, type: file.type, data: buffer },
    projectFileKey(projectId, key)
  );
  return new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

export async function loadProjectFile(projectId: string, key: string): Promise<File | null> {
  const db = await openDB();
  const tx = db.transaction(STORE_NAME, "readonly");
  const req = tx.objectStore(STORE_NAME).get(projectFileKey(projectId, key));
  return new Promise((resolve, reject) => {
    req.onsuccess = () => {
      const val = req.result;
      if (!val) return resolve(null);
      const file = new File([val.data], val.name, { type: val.type });
      resolve(file);
    };
    req.onerror = () => reject(req.error);
  });
}

export async function deleteProjectFile(projectId: string, key: string): Promise<void> {
  const db = await openDB();
  const tx = db.transaction(STORE_NAME, "readwrite");
  tx.objectStore(STORE_NAME).delete(projectFileKey(projectId, key));
  return new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

export async function clearProjectFiles(projectId: string): Promise<void> {
  const db = await openDB();
  const tx = db.transaction(STORE_NAME, "readwrite");
  const store = tx.objectStore(STORE_NAME);
  const prefix = `${projectId}:`;

  return new Promise((resolve, reject) => {
    const cursorReq = store.openCursor();
    cursorReq.onsuccess = () => {
      const cursor = cursorReq.result;
      if (!cursor) return; // tx.oncomplete will fire
      if (typeof cursor.key === "string" && cursor.key.startsWith(prefix)) {
        cursor.delete();
      }
      cursor.continue();
    };
    cursorReq.onerror = () => reject(cursorReq.error);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

// ── Project CRUD ──

export function createProject(name: string): ProjectMeta {
  const now = Date.now();
  const project: ProjectMeta = {
    id: generateId(),
    name,
    createdAt: now,
    modifiedAt: now,
  };
  const projects = listProjects();
  projects.push(project);
  saveProjectsIndex(projects);
  setActiveProjectId(project.id);
  return project;
}

export function renameProject(id: string, name: string): void {
  const projects = listProjects();
  const p = projects.find((p) => p.id === id);
  if (p) {
    p.name = name;
    p.modifiedAt = Date.now();
    saveProjectsIndex(projects);
  }
}

export async function deleteProject(id: string): Promise<void> {
  const projects = listProjects().filter((p) => p.id !== id);
  saveProjectsIndex(projects);
  clearProjectState(id);
  await clearProjectFiles(id);
  if (getActiveProjectId() === id) {
    setActiveProjectId(projects.length > 0 ? projects[0].id : null);
  }
}

export function setProjectThumb(id: string, thumb: string | null): void {
  const projects = listProjects();
  const p = projects.find((p) => p.id === id);
  if (p) {
    if (thumb) p.thumb = thumb;
    else delete p.thumb;
    saveProjectsIndex(projects);
  }
}

export function touchProject(id: string): void {
  const projects = listProjects();
  const p = projects.find((p) => p.id === id);
  if (p) {
    p.modifiedAt = Date.now();
    saveProjectsIndex(projects);
  }
}

// ══════════════════════════════════════════════════
// Server sync functions (client-side)
// ══════════════════════════════════════════════════

export async function listProjectsFromServer(): Promise<ProjectMeta[]> {
  try {
    const res = await fetch("/api/projects");
    if (!res.ok) return [];
    const data = await res.json();
    return data.projects ?? [];
  } catch {
    return [];
  }
}

export async function createProjectOnServer(project: ProjectMeta): Promise<void> {
  try {
    await fetch("/api/projects", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        id: project.id,
        name: project.name,
        createdAt: project.createdAt,
        modifiedAt: project.modifiedAt,
      }),
    });
  } catch {
    // Server unreachable — non-fatal
  }
}

export async function syncToServer(
  projectId: string,
  state: SerializableState,
  name?: string
): Promise<void> {
  try {
    // Always assert the current name alongside the state so a lost rename
    // self-heals on the next auto-save.
    await fetch(`/api/projects/${projectId}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(name !== undefined ? { state, name } : { state }),
    });
  } catch {
    // Server unreachable — non-fatal
  }
}

export async function syncRenameToServer(
  projectId: string,
  name: string
): Promise<void> {
  try {
    await fetch(`/api/projects/${projectId}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name }),
    });
  } catch {
    // non-fatal
  }
}

export async function loadFromServer(
  projectId: string
): Promise<{ project: ProjectMeta; state: SerializableState | null } | null> {
  try {
    const res = await fetch(`/api/projects/${projectId}`);
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null;
  }
}

export async function deleteProjectOnServer(projectId: string): Promise<void> {
  try {
    await fetch(`/api/projects/${projectId}`, { method: "DELETE" });
  } catch {
    // non-fatal
  }
}

export async function syncFileToServer(
  projectId: string,
  key: string,
  file: File
): Promise<void> {
  try {
    const formData = new FormData();
    formData.append("file", file);
    await fetch(`/api/projects/${projectId}/files/${key}`, {
      method: "PUT",
      body: formData,
    });
  } catch {
    // non-fatal
  }
}

export async function loadFileFromServer(
  projectId: string,
  key: string
): Promise<File | null> {
  try {
    const res = await fetch(`/api/projects/${projectId}/files/${key}`);
    if (!res.ok) return null;
    const disposition = res.headers.get("Content-Disposition") ?? "";
    const filenameMatch = disposition.match(/filename="(.+?)"/);
    const filename = filenameMatch?.[1] ?? key;
    const blob = await res.blob();
    return new File([blob], filename, { type: blob.type });
  } catch {
    return null;
  }
}

export async function deleteFileOnServer(
  projectId: string,
  key: string
): Promise<void> {
  try {
    await fetch(`/api/projects/${projectId}/files/${key}`, {
      method: "DELETE",
    });
  } catch {
    // non-fatal
  }
}

// ── Migration ──

const OLD_FILE_KEYS = ["audio", "avatar", "intro", "outro", "outroCardLogo", "outroCardBadge"];

export async function migrateIfNeeded(): Promise<void> {
  if (localStorage.getItem(MIGRATED_KEY)) return;

  const oldState = loadState();
  const hasOldState = oldState !== null;

  // Check if any old files exist
  let hasOldFiles = false;
  if (!hasOldState) {
    for (const key of OLD_FILE_KEYS) {
      const f = await loadFile(key);
      if (f) { hasOldFiles = true; break; }
    }
  }

  if (!hasOldState && !hasOldFiles) {
    // Nothing to migrate — first-time user
    localStorage.setItem(MIGRATED_KEY, "1");
    return;
  }

  // Create "My Project" and move data
  const project = createProject("My Project");

  // Move state
  if (oldState) {
    saveProjectState(project.id, oldState);
    clearState();
  }

  // Move files
  for (const key of OLD_FILE_KEYS) {
    const f = await loadFile(key);
    if (f) {
      await saveProjectFile(project.id, key, f);
      await deleteFile(key);
    }
  }

  // Move image files (count from state)
  const imgCount = oldState?.imageTiming?.length ?? 0;
  for (let i = 0; i < imgCount; i++) {
    const f = await loadFile(`image_${i}`);
    if (f) {
      await saveProjectFile(project.id, `image_${i}`, f);
      await deleteFile(`image_${i}`);
    }
  }

  localStorage.setItem(MIGRATED_KEY, "1");
}
