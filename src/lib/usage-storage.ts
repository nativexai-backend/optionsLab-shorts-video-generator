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

// On-disk shape: all-time per-project totals (the overview) plus a per-day
// breakdown (so the UI can show "today" and page back through history).
export interface UsageStore {
  byProject: UsageData; // all-time, keyed by projectId
  byDay: Record<string, UsageData>; // dateKey (YYYY-MM-DD, server-local) → projectId → usage
}

const USAGE_PATH =
  process.env.USAGE_PATH ?? path.join(process.cwd(), "data", "usage.json");

const UNASSIGNED = "_unassigned"; // calls not tied to a project (e.g. voice previews)

/** Server-local date key, e.g. "2026-06-19". */
export function dayKey(d: Date = new Date()): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

// Tolerate the old flat format (Record<projectId, ProjectUsage>) — wrap it as
// all-time totals with no day breakdown (it predates per-day tracking).
function normalize(parsed: unknown): UsageStore {
  if (parsed && typeof parsed === "object" && ("byProject" in parsed || "byDay" in parsed)) {
    const s = parsed as Partial<UsageStore>;
    return { byProject: s.byProject ?? {}, byDay: s.byDay ?? {} };
  }
  return { byProject: (parsed as UsageData) ?? {}, byDay: {} };
}

export async function readUsageStore(): Promise<UsageStore> {
  try {
    return normalize(JSON.parse(await fs.readFile(USAGE_PATH, "utf-8")));
  } catch {
    return { byProject: {}, byDay: {} };
  }
}

/** All-time per-project totals (back-compat helper). */
export async function readUsage(): Promise<UsageData> {
  return (await readUsageStore()).byProject;
}

function bump(
  proj: ProjectUsage,
  api: UsageApi,
  amount: { characters?: number; tokens?: number; seconds?: number }
) {
  const entry = (proj[api] ??= { calls: 0 });
  entry.calls += 1;
  if (amount.characters) entry.characters = (entry.characters ?? 0) + amount.characters;
  if (amount.tokens) entry.tokens = (entry.tokens ?? 0) + amount.tokens;
  if (amount.seconds) entry.seconds = (entry.seconds ?? 0) + amount.seconds;
}

// Serialize writes so concurrent calls don't clobber each other.
let lock: Promise<unknown> = Promise.resolve();

export async function recordUsage(
  projectId: string | null | undefined,
  api: UsageApi,
  amount: { characters?: number; tokens?: number; seconds?: number }
): Promise<void> {
  const run = lock.then(async () => {
    const store = await readUsageStore();
    const pid = projectId || UNASSIGNED;
    const today = dayKey();
    bump((store.byProject[pid] ??= {}), api, amount); // all-time
    const day = (store.byDay[today] ??= {});
    bump((day[pid] ??= {}), api, amount); // today
    await fs.mkdir(path.dirname(USAGE_PATH), { recursive: true });
    await fs.writeFile(USAGE_PATH, JSON.stringify(store, null, 2));
  });
  lock = run.catch(() => {});
  return run;
}
