import path from "path";
import fs from "fs/promises";

// Shared server-side file-safety helpers: path-segment validation, safe
// extension derivation, atomic JSON reads/writes, and an in-process lock.

// ── Path segments ──

// Route params (project id, file key, library id) become path segments on
// disk, and Next decodes %2F / %2E before they reach us — so anything that
// touches path.join must pass this first.
export const SAFE_SEGMENT = /^[a-zA-Z0-9_-]+$/;

export function isSafeSegment(seg: string): boolean {
  return SAFE_SEGMENT.test(seg);
}

/** Throws on unsafe segments — defense-in-depth behind the routes' 400s. */
export function assertSafeSegment(seg: string): void {
  if (!isSafeSegment(seg)) {
    throw new Error(`Unsafe path segment: ${JSON.stringify(seg)}`);
  }
}

// ── File extensions ──

// Allowlisted upload types → canonical extension. Extensions are derived from
// the (trusted) MIME type rather than the user-supplied filename.
const EXT_BY_MIME: Record<string, string> = {
  "image/png": ".png",
  "image/jpeg": ".jpg",
  "image/webp": ".webp",
  "image/gif": ".gif",
  "image/svg+xml": ".svg",
  "audio/mpeg": ".mp3",
  "audio/mp3": ".mp3",
  "audio/wav": ".wav",
  "audio/x-wav": ".wav",
  "audio/mp4": ".m4a",
  "audio/x-m4a": ".m4a",
  "audio/ogg": ".ogg",
  "video/mp4": ".mp4",
  "video/webm": ".webm",
  "application/json": ".json",
};

// A filename-derived extension is only trusted when it's short and plain.
const SAFE_EXT = /^\.[a-z0-9]{1,5}$/i;

/**
 * Extension for a stored file: the MIME allowlist wins; otherwise fall back to
 * the filename's extension if it looks sane, else `fallback` (default "").
 */
export function safeExtension(
  mimeType: string | undefined,
  filename: string,
  fallback = ""
): string {
  const type = (mimeType ?? "").split(";")[0].trim().toLowerCase();
  if (EXT_BY_MIME[type]) return EXT_BY_MIME[type];
  const ext = path.extname(filename).toLowerCase();
  return SAFE_EXT.test(ext) ? ext : fallback;
}

// ── Atomic JSON files ──

export async function readJsonFile<T>(filePath: string, fallback: T): Promise<T> {
  try {
    return JSON.parse(await fs.readFile(filePath, "utf-8"));
  } catch {
    return fallback;
  }
}

/**
 * Write JSON via a temp file + rename so readers never see a half-written
 * file (a crash mid-write used to be able to corrupt the index).
 */
export async function writeJsonFileAtomic(
  filePath: string,
  data: unknown
): Promise<void> {
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  const tmpPath = `${filePath}.tmp-${process.pid}`;
  await fs.writeFile(tmpPath, JSON.stringify(data, null, 2));
  await fs.rename(tmpPath, filePath);
}

// ── In-process lock ──

/**
 * Promise-chain lock: `runExclusive` calls execute one at a time, in order.
 * Serializes read-modify-write cycles so concurrent requests don't lose
 * each other's updates.
 */
export function createLock(): <T>(fn: () => T | Promise<T>) => Promise<T> {
  let chain: Promise<unknown> = Promise.resolve();
  return (fn) => {
    const run = chain.then(fn);
    chain = run.catch(() => {});
    return run;
  };
}
