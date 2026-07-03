import path from "path";
import fs from "fs/promises";
import type { ProjectMeta, SerializableState } from "./storage";
import {
  assertSafeSegment,
  createLock,
  readJsonFile,
  safeExtension,
  writeJsonFileAtomic,
} from "./json-file";

export const DATA_DIR =
  process.env.DATA_DIR ?? path.join(process.cwd(), "data/projects");

async function ensureDir(dir: string): Promise<void> {
  await fs.mkdir(dir, { recursive: true });
}

function indexPath(): string {
  return path.join(DATA_DIR, "index.json");
}

function projectDir(id: string): string {
  return path.join(DATA_DIR, id);
}

function statePath(id: string): string {
  return path.join(DATA_DIR, id, "state.json");
}

function filesDir(id: string): string {
  return path.join(DATA_DIR, id, "files");
}

// ── Projects index ──

export async function readProjectsIndex(): Promise<ProjectMeta[]> {
  return readJsonFile<ProjectMeta[]>(indexPath(), []);
}

export async function writeProjectsIndex(
  projects: ProjectMeta[]
): Promise<void> {
  await writeJsonFileAtomic(indexPath(), projects);
}

// Concurrent PUTs (rename + state auto-save) used to read-modify-write the
// index simultaneously and lose updates — project names reverted to
// "Untitled". All index mutations now run through this queue.
const withIndexLock = createLock();

export async function updateProjectsIndex<T>(
  mutator: (projects: ProjectMeta[]) => T | Promise<T>
): Promise<T> {
  return withIndexLock(async () => {
    const projects = await readProjectsIndex();
    const result = await mutator(projects);
    await writeProjectsIndex(projects);
    return result;
  });
}

// ── Project state ──

export async function readProjectState(
  id: string
): Promise<SerializableState | null> {
  assertSafeSegment(id);
  return readJsonFile<SerializableState | null>(statePath(id), null);
}

export async function writeProjectState(
  id: string,
  state: SerializableState
): Promise<void> {
  assertSafeSegment(id);
  await writeJsonFileAtomic(statePath(id), state);
}

// ── Binary files ──

export async function saveServerFile(
  id: string,
  key: string,
  buffer: Buffer,
  filename: string,
  mimeType?: string
): Promise<void> {
  assertSafeSegment(id);
  assertSafeSegment(key);
  const dir = filesDir(id);
  await ensureDir(dir);
  // Extension comes from the MIME allowlist (or a sanitized filename ext) —
  // never raw from the uploaded name.
  const ext = safeExtension(mimeType, filename);
  const filePath = path.join(dir, `${key}${ext}`);
  await fs.writeFile(filePath, buffer);
  // Also store a small metadata sidecar so we can recover filename + type
  await fs.writeFile(
    filePath + ".meta",
    JSON.stringify({ filename, key })
  );
}

export async function loadServerFile(
  id: string,
  key: string
): Promise<{ buffer: Buffer; filename: string } | null> {
  assertSafeSegment(id);
  assertSafeSegment(key);
  const dir = filesDir(id);
  try {
    const entries = await fs.readdir(dir);
    // Find the file that starts with the key (e.g. "audio.mp3")
    const match = entries.find(
      (e) => !e.endsWith(".meta") && (e === key || e.startsWith(key + "."))
    );
    if (!match) return null;

    const filePath = path.join(dir, match);
    const buffer = await fs.readFile(filePath);

    // Try to read metadata sidecar
    let filename = match;
    try {
      const metaRaw = await fs.readFile(filePath + ".meta", "utf-8");
      const meta = JSON.parse(metaRaw);
      if (meta.filename) filename = meta.filename;
    } catch {
      // No sidecar — use the filename on disk
    }

    return { buffer, filename };
  } catch {
    return null;
  }
}

export async function deleteServerFile(
  id: string,
  key: string
): Promise<void> {
  assertSafeSegment(id);
  assertSafeSegment(key);
  const dir = filesDir(id);
  try {
    const entries = await fs.readdir(dir);
    const matches = entries.filter(
      (e) => e === key || e.startsWith(key + ".")
    );
    for (const match of matches) {
      await fs.unlink(path.join(dir, match));
    }
  } catch {
    // Directory may not exist
  }
}

// ── Delete entire project directory ──

export async function deleteServerProjectDir(id: string): Promise<void> {
  assertSafeSegment(id);
  try {
    await fs.rm(projectDir(id), { recursive: true, force: true });
  } catch {
    // Already gone
  }
}
