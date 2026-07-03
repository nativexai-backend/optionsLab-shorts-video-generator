import path from "path";
import fs from "fs/promises";
import crypto from "crypto";
import type { LibraryImage, LibraryQuery } from "./library-types";
import { rankLibrary } from "./library-types";
import {
  assertSafeSegment,
  createLock,
  readJsonFile,
  safeExtension,
  writeJsonFileAtomic,
} from "./json-file";

export const LIBRARY_DIR =
  process.env.LIBRARY_DIR ?? path.join(process.cwd(), "data/library");

const FILES_DIR = path.join(LIBRARY_DIR, "files");
const INDEX_PATH = path.join(LIBRARY_DIR, "index.json");

async function ensureDir(dir: string) {
  await fs.mkdir(dir, { recursive: true });
}

export async function readLibraryIndex(): Promise<LibraryImage[]> {
  return readJsonFile<LibraryImage[]>(INDEX_PATH, []);
}

async function writeLibraryIndex(images: LibraryImage[]): Promise<void> {
  await writeJsonFileAtomic(INDEX_PATH, images);
}

// Serialize index mutations so concurrent drops don't lose each other.
const withIndexLock = createLock();
async function updateIndex<T>(
  mutator: (images: LibraryImage[]) => T | Promise<T>
): Promise<T> {
  return withIndexLock(async () => {
    const images = await readLibraryIndex();
    const result = await mutator(images);
    await writeLibraryIndex(images);
    return result;
  });
}

function hashBuffer(buffer: Buffer): string {
  return crypto.createHash("sha256").update(buffer).digest("hex").slice(0, 16);
}

export interface NewImageMeta {
  filename: string;
  mimeType?: string; // preferred source for the stored extension
  tags?: string[];
  description?: string;
  category?: string;
  projectId?: string;
  width?: number;
  height?: number;
}

/**
 * Add an image to the library. Identical bytes dedupe to one record (the hash
 * is the id); a repeat drop just merges new tags and records the project use.
 */
export async function saveLibraryImage(
  buffer: Buffer,
  meta: NewImageMeta
): Promise<LibraryImage> {
  const id = hashBuffer(buffer);
  // Extension from the MIME allowlist (or a sanitized filename ext) — never
  // raw from the uploaded name.
  const ext = safeExtension(meta.mimeType, meta.filename, ".png");

  await ensureDir(FILES_DIR);
  const filePath = path.join(FILES_DIR, `${id}${ext}`);
  // Only write the bytes once (dedup); harmless to overwrite identical content.
  await fs.writeFile(filePath, buffer);

  return updateIndex((images) => {
    const existing = images.find((im) => im.id === id);
    if (existing) {
      existing.tags = Array.from(new Set([...existing.tags, ...(meta.tags ?? [])]));
      if (meta.description && !existing.description) existing.description = meta.description;
      if (meta.category && existing.category === "other") existing.category = meta.category;
      if (meta.projectId && !existing.usedInProjects.includes(meta.projectId)) {
        existing.usedInProjects.push(meta.projectId);
      }
      return existing;
    }
    const record: LibraryImage = {
      id,
      filename: meta.filename,
      ext,
      tags: Array.from(new Set(meta.tags ?? [])),
      description: meta.description ?? "",
      category: meta.category ?? "other",
      visionLabels: [],
      addedOn: Date.now(),
      usedInProjects: meta.projectId ? [meta.projectId] : [],
      width: meta.width,
      height: meta.height,
    };
    images.push(record);
    return record;
  });
}

export async function patchLibraryImage(
  id: string,
  patch: Partial<Pick<LibraryImage, "tags" | "description" | "category">>
): Promise<LibraryImage | null> {
  return updateIndex((images) => {
    const img = images.find((im) => im.id === id);
    if (!img) return null;
    if (patch.tags) img.tags = Array.from(new Set(patch.tags.map((t) => t.trim()).filter(Boolean)));
    if (patch.description !== undefined) img.description = patch.description;
    if (patch.category) img.category = patch.category;
    return img;
  });
}

export async function deleteLibraryImage(id: string): Promise<void> {
  await updateIndex(async (images) => {
    const idx = images.findIndex((im) => im.id === id);
    if (idx === -1) return;
    const [removed] = images.splice(idx, 1);
    try {
      await fs.unlink(path.join(FILES_DIR, `${removed.id}${removed.ext}`));
    } catch {
      // file already gone
    }
  });
}

export async function loadLibraryFile(
  id: string
): Promise<{ buffer: Buffer; ext: string } | null> {
  assertSafeSegment(id);
  try {
    const entries = await fs.readdir(FILES_DIR);
    const match = entries.find((e) => e.startsWith(id + "."));
    if (!match) return null;
    const buffer = await fs.readFile(path.join(FILES_DIR, match));
    return { buffer, ext: path.extname(match) };
  } catch {
    return null;
  }
}

export async function searchLibrary(query: LibraryQuery): Promise<LibraryImage[]> {
  const images = await readLibraryIndex();
  if (!query.text && !query.category) {
    // No query → most recent first (browser view)
    return [...images].sort((a, b) => b.addedOn - a.addedOn);
  }
  return rankLibrary(images, query);
}
