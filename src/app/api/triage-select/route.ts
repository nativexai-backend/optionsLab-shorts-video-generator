import { NextRequest, NextResponse } from "next/server";
import { anthropicKey } from "@/lib/anthropic";
import { callGroq, callClaude, errorSummary, extractJson } from "@/lib/llm";
import { recordUsage } from "@/lib/usage-storage";

// Candidate topic as sent from the client (a trimmed ParsedTopic).
interface Candidate {
  rank: number; // globally unique across digests (the client's row uid)
  title: string;
  why?: string;
  score: number;
  bestPlatform?: string;
  thumbnail?: string;
  keywords?: string[];
  source?: string; // which digest the topic came from, when several are loaded
}
interface RecentTopic {
  date: string;
  title: string;
  keywords?: string[];
}

interface Pick {
  rank: number;
  reason: string;
  noveltyNote?: string;
}
interface Skip {
  rank: number;
  similarTo: string;
  why: string;
}

const CLAUDE_MODEL = "claude-sonnet-4-6";

function buildPrompts(target: number, topics: Candidate[], recent: RecentTopic[]) {
  const sources = new Set(topics.map((t) => t.source).filter(Boolean));
  const multiSourceRule =
    sources.size > 1
      ? `\n3. Source balance — candidates come from ${sources.size} separate digests (the "source" field). Ranks and scores are only comparable WITHIN a source. Build the slate by drawing from every source, not just one, unless a source's candidates are clearly weaker.`
      : "";
  const system = `You are an editorial producer for a short-form finance video channel (TikTok / Reels / Shorts).
From today's ranked candidates, choose the ${target} MOST worth posting today, balancing these goals:
1. Engagement / virality — strong hook, stakes, relatable, payoff, timeliness. The provided "score" is a prior, not gospel.
2. Novelty — AVOID topics that substantially overlap (same subject, story, or key tickers/entities) with anything posted in the last 7 days. Also avoid picking near-duplicates of EACH OTHER within today's set; prefer a varied slate.${multiSourceRule}
Return ONLY valid minified JSON, no prose, in exactly this shape:
{"picks":[{"rank":<number>,"reason":"<short>","noveltyNote":"<short or empty>"}],"skipped":[{"rank":<number>,"similarTo":"<title or entity>","why":"<short>"}]}
"picks" must have exactly ${target} items, ordered best-first. "skipped" lists notable candidates you dropped for similarity (may be empty).`;

  const user = JSON.stringify({
    target,
    todayCandidates: topics.map((t) => ({
      rank: t.rank,
      title: t.title,
      why: t.why,
      score: t.score,
      platform: t.bestPlatform,
      keywords: t.keywords?.slice(0, 12),
      ...(t.source ? { source: t.source } : {}),
    })),
    postedLast7Days: recent.map((r) => ({ date: r.date, title: r.title, keywords: r.keywords?.slice(0, 12) })),
  });

  return { system, user };
}

// Pull picks/skips out of a model's raw text and validate against the candidate set.
function parseSelection(text: string, topics: Candidate[], target: number): { picks: Pick[]; skipped: Skip[] } {
  const parsed = JSON.parse(extractJson(text)) as { picks?: Pick[]; skipped?: Skip[] };

  const valid = new Set(topics.map((t) => t.rank));
  const picks = (parsed.picks ?? []).filter((p) => valid.has(p.rank)).slice(0, target);
  if (picks.length === 0) throw new Error("Model returned no valid picks");
  const skipped = (parsed.skipped ?? []).filter((s) => valid.has(s.rank));
  return { picks, skipped };
}

async function selectWithGroq(
  system: string,
  user: string,
  topics: Candidate[],
  target: number,
): Promise<{ picks: Pick[]; skipped: Skip[]; tokens: number }> {
  const { text, tokens } = await callGroq({
    system,
    messages: [{ role: "user", content: user }],
    temperature: 0.4,
    maxTokens: 1500,
    jsonMode: true,
  });
  return { ...parseSelection(text, topics, target), tokens };
}

async function selectWithClaude(
  system: string,
  user: string,
  topics: Candidate[],
  target: number,
): Promise<{ picks: Pick[]; skipped: Skip[]; tokens: number }> {
  const { text, tokens } = await callClaude({
    system,
    model: CLAUDE_MODEL,
    maxTokens: 1500,
    messages: [{ role: "user", content: user }],
  });
  return { ...parseSelection(text, topics, target), tokens };
}

export async function POST(req: NextRequest) {
  let body: { topics?: Candidate[]; recent?: RecentTopic[]; target?: number; provider?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const topics = body.topics ?? [];
  const recent = body.recent ?? [];
  const target = Math.max(1, Math.min(10, body.target ?? 5));

  if (topics.length === 0) {
    return NextResponse.json({ error: "No topics provided" }, { status: 400 });
  }

  // Deterministic fallback: highest engagement score wins. Keeps the feature
  // usable with no API key (and as a safety net if every model call fails).
  // With several digests loaded, scores are only comparable within a digest,
  // so round-robin across sources (best-first within each) instead.
  const byScore = (): { picks: Pick[]; skipped: Skip[]; method: string } => {
    const sourceKeys = [...new Set(topics.map((t) => t.source ?? ""))];
    let ordered: Candidate[];
    if (sourceKeys.length > 1) {
      const lists = sourceKeys.map((s) =>
        topics.filter((t) => (t.source ?? "") === s).sort((a, b) => b.score - a.score)
      );
      ordered = [];
      const maxLen = Math.max(...lists.map((l) => l.length));
      for (let i = 0; i < maxLen; i++) for (const l of lists) if (l[i]) ordered.push(l[i]);
    } else {
      ordered = [...topics].sort((a, b) => b.score - a.score);
    }
    return {
      method: "score",
      picks: ordered.slice(0, target).map((t) => ({ rank: t.rank, reason: `Top engagement score (${t.score}).` })),
      skipped: [],
    };
  };

  const { system, user } = buildPrompts(target, topics, recent);
  const hasGroq = !!process.env.GROQ_API_KEY;
  const key = anthropicKey();
  const provider = body.provider === "groq" || body.provider === "claude" ? body.provider : "auto";

  // Order the providers to try. Auto prefers Claude (quality) then Groq.
  const attempts: Array<"groq" | "claude"> = [];
  if (provider === "groq") {
    if (hasGroq) attempts.push("groq");
  } else if (provider === "claude") {
    if (key) attempts.push("claude");
  } else {
    if (key) attempts.push("claude");
    if (hasGroq) attempts.push("groq");
  }

  // Triage isn't tied to a project — usage lands in the unassigned bucket.
  const track = (method: "groq" | "claude", tokens: number) =>
    recordUsage(undefined, method, { tokens }).catch(() => {});

  const failures: string[] = [];
  for (const method of attempts) {
    try {
      const { picks, skipped, tokens } =
        method === "groq"
          ? await selectWithGroq(system, user, topics, target)
          : await selectWithClaude(system, user, topics, target);
      track(method, tokens);
      return NextResponse.json({
        method,
        picks,
        skipped,
        ...(failures.length ? { note: failures.join(" · ") } : {}),
      });
    } catch (err) {
      // Try the next provider; if all fail we fall through to score.
      console.error(`[triage-select] ${method} failed:`, err);
      failures.push(`${method === "claude" ? "Claude" : "Groq"} failed (${errorSummary(err)})`);
    }
  }

  return NextResponse.json({
    ...byScore(),
    ...(failures.length ? { note: failures.join(" · ") } : {}),
  });
}
