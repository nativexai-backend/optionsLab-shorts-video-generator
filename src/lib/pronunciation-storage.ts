import path from "path";
import fs from "fs/promises";
import { DEFAULT_PRONUNCIATIONS, type PronunciationEntry } from "./pronunciation";

// The global pronunciation dictionary lives in one file. Seeded with the
// defaults on first read so there's something useful out of the box.
const PRONUNCIATION_PATH =
  process.env.PRONUNCIATION_PATH ?? path.join(process.cwd(), "data", "pronunciation.json");

export async function readPronunciations(): Promise<PronunciationEntry[]> {
  try {
    const raw = await fs.readFile(PRONUNCIATION_PATH, "utf-8");
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : DEFAULT_PRONUNCIATIONS;
  } catch {
    return DEFAULT_PRONUNCIATIONS;
  }
}

export async function writePronunciations(entries: PronunciationEntry[]): Promise<void> {
  const clean = entries
    .filter((e) => e && typeof e.term === "string" && typeof e.say === "string" && e.term.trim() && e.say.trim())
    .map((e) => ({ term: e.term.trim(), say: e.say.trim() }));
  await fs.mkdir(path.dirname(PRONUNCIATION_PATH), { recursive: true });
  await fs.writeFile(PRONUNCIATION_PATH, JSON.stringify(clean, null, 2));
}
