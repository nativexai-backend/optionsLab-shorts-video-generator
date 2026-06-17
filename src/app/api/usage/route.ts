import { NextResponse } from "next/server";
import { readUsage, type ApiUsage, type UsageApi } from "@/lib/usage-storage";
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

// GET /api/usage → per-project usage joined with names, plus overall totals
export async function GET() {
  const [usage, projects] = await Promise.all([readUsage(), readProjectsIndex()]);
  const names = new Map(projects.map((p) => [p.id, p.name]));

  const totals = emptyUsage();
  const rows = Object.entries(usage).map(([projectId, perApi]) => {
    const row: Record<UsageApi, ApiUsage> = emptyUsage();
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
  rows.sort((a, b) => (b.usage.elevenlabs.characters ?? 0) - (a.usage.elevenlabs.characters ?? 0));

  return NextResponse.json({ projects: rows, totals });
}
