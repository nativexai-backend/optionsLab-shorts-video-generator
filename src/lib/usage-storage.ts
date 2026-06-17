import path from "path";
import fs from "fs/promises";

// Per-project, per-API usage tracking. Metrics differ by API:
//   elevenlabs → characters (≈ credits)   groq/claude → tokens   whisper → seconds
export type UsageApi = "elevenlabs" | "groq" | "claude" | "whisper";

export interface ApiUsage {
  calls: number;
  characters?: number;
  tokens?: number;
  seconds?: number;
}

export type ProjectUsage = Partial<Record<UsageApi, ApiUsage>>;
export type UsageData = Record<string, ProjectUsage>; // keyed by projectId

const USAGE_PATH =
  process.env.USAGE_PATH ?? path.join(process.cwd(), "data", "usage.json");

const UNASSIGNED = "_unassigned"; // calls not tied to a project (e.g. voice previews)

export async function readUsage(): Promise<UsageData> {
  try {
    return JSON.parse(await fs.readFile(USAGE_PATH, "utf-8"));
  } catch {
    return {};
  }
}

// Serialize writes so concurrent calls don't clobber each other.
let lock: Promise<unknown> = Promise.resolve();

export async function recordUsage(
  projectId: string | null | undefined,
  api: UsageApi,
  amount: { characters?: number; tokens?: number; seconds?: number }
): Promise<void> {
  const run = lock.then(async () => {
    const data = await readUsage();
    const pid = projectId || UNASSIGNED;
    const proj = (data[pid] ??= {});
    const entry = (proj[api] ??= { calls: 0 });
    entry.calls += 1;
    if (amount.characters) entry.characters = (entry.characters ?? 0) + amount.characters;
    if (amount.tokens) entry.tokens = (entry.tokens ?? 0) + amount.tokens;
    if (amount.seconds) entry.seconds = (entry.seconds ?? 0) + amount.seconds;
    await fs.mkdir(path.dirname(USAGE_PATH), { recursive: true });
    await fs.writeFile(USAGE_PATH, JSON.stringify(data, null, 2));
  });
  lock = run.catch(() => {});
  return run;
}
