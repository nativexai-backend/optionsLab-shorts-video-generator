import { describe, it, expect, beforeAll, afterAll } from "vitest";
import path from "path";
import os from "os";
import fs from "fs/promises";
import {
  isSafeSegment,
  assertSafeSegment,
  safeExtension,
  readJsonFile,
  writeJsonFileAtomic,
  createLock,
} from "./json-file";

describe("isSafeSegment / assertSafeSegment", () => {
  it("accepts plain ids, keys and hashes", () => {
    expect(isSafeSegment("m4x2kq1abc123")).toBe(true);
    expect(isSafeSegment("audio_take-2")).toBe(true);
    expect(isSafeSegment("9f86d081884c7d65")).toBe(true);
  });

  it("rejects traversal and path-like segments (Next decodes %2F/%2E)", () => {
    expect(isSafeSegment("..")).toBe(false);
    expect(isSafeSegment("../../etc/passwd")).toBe(false);
    expect(isSafeSegment("a/b")).toBe(false);
    expect(isSafeSegment("a\\b")).toBe(false);
    expect(isSafeSegment("state.json")).toBe(false); // dots are path-ish too
    expect(isSafeSegment("")).toBe(false);
    expect(isSafeSegment("a\0b")).toBe(false);
    expect(isSafeSegment("a b")).toBe(false);
  });

  it("assertSafeSegment throws only on unsafe input", () => {
    expect(() => assertSafeSegment("ok-segment_1")).not.toThrow();
    expect(() => assertSafeSegment("../evil")).toThrow(/Unsafe path segment/);
  });
});

describe("safeExtension", () => {
  it("prefers the MIME allowlist over the filename", () => {
    expect(safeExtension("image/png", "evil.exe")).toBe(".png");
    expect(safeExtension("audio/mpeg", "take 1.wav")).toBe(".mp3");
    expect(safeExtension("application/json", "transcript")).toBe(".json");
  });

  it("ignores MIME parameters like charset", () => {
    expect(safeExtension("image/svg+xml; charset=utf-8", "logo.txt")).toBe(".svg");
  });

  it("falls back to a sane filename extension for unknown MIME types", () => {
    expect(safeExtension("application/octet-stream", "clip.mov")).toBe(".mov");
    expect(safeExtension(undefined, "photo.JPG")).toBe(".jpg");
  });

  it("drops filename extensions that aren't short and plain", () => {
    expect(safeExtension(undefined, 'x.png"onload')).toBe("");
    expect(safeExtension(undefined, "archive.tarball")).toBe("");
    expect(safeExtension(undefined, "noext")).toBe("");
    expect(safeExtension(undefined, "noext", ".png")).toBe(".png"); // custom fallback
  });
});

describe("readJsonFile / writeJsonFileAtomic", () => {
  let dir: string;

  beforeAll(async () => {
    dir = await fs.mkdtemp(path.join(os.tmpdir(), "json-file-spec-"));
  });

  afterAll(async () => {
    await fs.rm(dir, { recursive: true, force: true });
  });

  it("returns the fallback when the file is missing or corrupt", async () => {
    expect(await readJsonFile(path.join(dir, "missing.json"), [])).toEqual([]);
    const corrupt = path.join(dir, "corrupt.json");
    await fs.writeFile(corrupt, "{ not json");
    expect(await readJsonFile(corrupt, { ok: true })).toEqual({ ok: true });
  });

  it("round-trips data and creates parent directories", async () => {
    const file = path.join(dir, "nested", "deeper", "index.json");
    const data = [{ id: "a", name: "Project A" }];
    await writeJsonFileAtomic(file, data);
    expect(await readJsonFile(file, [])).toEqual(data);
  });

  it("leaves no temp file behind after a write", async () => {
    const file = path.join(dir, "clean.json");
    await writeJsonFileAtomic(file, { n: 1 });
    await writeJsonFileAtomic(file, { n: 2 }); // overwrite path too
    const entries = await fs.readdir(dir);
    expect(entries.filter((e) => e.includes(".tmp-"))).toEqual([]);
    expect(await readJsonFile(file, null)).toEqual({ n: 2 });
  });
});

describe("createLock", () => {
  it("runs queued jobs one at a time, in order", async () => {
    const lock = createLock();
    const order: string[] = [];
    const slow = lock(async () => {
      await new Promise((r) => setTimeout(r, 20));
      order.push("slow");
      return "slow";
    });
    const fast = lock(async () => {
      order.push("fast");
      return "fast";
    });
    expect(await Promise.all([slow, fast])).toEqual(["slow", "fast"]);
    expect(order).toEqual(["slow", "fast"]);
  });

  it("keeps the queue alive after a job rejects", async () => {
    const lock = createLock();
    await expect(lock(() => Promise.reject(new Error("boom")))).rejects.toThrow("boom");
    expect(await lock(() => 42)).toBe(42);
  });
});
