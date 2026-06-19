import { NextResponse } from "next/server";
import { readUsageStore, dayKey, type ApiUsage, type UsageApi, type UsageData } from "@/lib/usage-storage";
import { readProjectsIndex } from "@/lib/server-storage";

const APIS: UsageApi[] = ["elevenlabs", "groq", "claude", "whisper"];

function emptyUsage(): Record<UsageApi, ApiUsage> {
  return {
    elevenlabs: { calls: 0, characters: 0 },
    groq: { calls: 0, tokens: 0 },
    claude: { calls: 0, tokens: 0 },
    whisper: { calls: 0, seconds: 0 },
  };
}

function add(into: ApiUsage, from?: ApiUsage) {
  if (!from) return;
  into.calls += from.calls ?? 0;
  if (from.characters) into.characters = (into.characters ?? 0) + from.characters;
  if (from.tokens) into.tokens = (into.tokens ?? 0) + from.tokens;
  if (from.seconds) into.seconds = (into.seconds ?? 0) + from.seconds;
}

// Build project rows + totals for one slice of usage (all-time, or a single day).
function buildRows(usage: UsageData, names: Map<string, string>) {
  const totals = emptyUsage();
  const projects = Object.entries(usage).map(([projectId, perApi]) => {
    const row = emptyUsage();
    for (const api of APIS) {
      add(row[api], perApi[api]);
      add(totals[api], perApi[api]);
    }
    return {
      projectId,
      name: projectId === "_unassigned" ? "Unassigned (previews, etc.)" : names.get(projectId) ?? "(deleted project)",
      usage: row,
    };
  });
  // Most-used projects first (by ElevenLabs credits, the cost driver)
  projects.sort((a, b) => (b.usage.elevenlabs.characters ?? 0) - (a.usage.elevenlabs.characters ?? 0));
  return { projects, totals };
}

// GET /api/usage → all-time overview + a per-day breakdown (today first).
export async function GET() {
  const [store, projects] = await Promise.all([readUsageStore(), readProjectsIndex()]);
  const names = new Map(projects.map((p) => [p.id, p.name]));

  const allTime = buildRows(store.byProject, names);

  // Always surface today first, even with no usage yet, so "today" is explicit.
  const today = dayKey();
  const dates = new Set(Object.keys(store.byDay));
  dates.add(today);
  const days = [...dates]
    .sort((a, b) => (a < b ? 1 : -1)) // newest first
    .map((date) => ({ date, ...buildRows(store.byDay[date] ?? {}, names) }));

  return NextResponse.json({
    projects: allTime.projects, // all-time per-project detail
    totals: allTime.totals, // all-time overview cards (unchanged)
    today,
    days, // [{ date, projects, totals }], today first
  });
}
