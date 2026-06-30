import { NextRequest, NextResponse } from "next/server";
import { anthropicKey } from "@/lib/anthropic";

// Candidate topic as sent from the client (a trimmed ParsedTopic).
interface Candidate {
  rank: number;
  title: string;
  why?: string;
  score: number;
  bestPlatform?: string;
  thumbnail?: string;
  keywords?: string[];
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
const GROQ_MODEL = "llama-3.3-70b-versatile";

function buildPrompts(target: number, topics: Candidate[], recent: RecentTopic[]) {
  const system = `You are an editorial producer for a short-form finance video channel (TikTok / Reels / Shorts).
From today's ranked candidates, choose the ${target} MOST worth posting today, balancing two goals:
1. Engagement / virality — strong hook, stakes, relatable, payoff, timeliness. The provided "score" is a prior, not gospel.
2. Novelty — AVOID topics that substantially overlap (same subject, story, or key tickers/entities) with anything posted in the last 3 days. Also avoid picking near-duplicates of EACH OTHER within today's set; prefer a varied slate.
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
    })),
    postedLast3Days: recent.map((r) => ({ date: r.date, title: r.title, keywords: r.keywords?.slice(0, 12) })),
  });

  return { system, user };
}

// Pull picks/skips out of a model's raw text and validate against the candidate set.
function parseSelection(text: string, topics: Candidate[], target: number): { picks: Pick[]; skipped: Skip[] } {
  const json = text.match(/\{[\s\S]*\}/);
  if (!json) throw new Error("No JSON in model response");
  const parsed = JSON.parse(json[0]) as { picks?: Pick[]; skipped?: Skip[] };

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
): Promise<{ picks: Pick[]; skipped: Skip[] }> {
  const apiKey = process.env.GROQ_API_KEY;
  if (!apiKey) throw new Error("No GROQ_API_KEY");

  const res = await fetch("https://api.groq.com/openai/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: GROQ_MODEL,
      messages: [
        { role: "system", content: system },
        { role: "user", content: user },
      ],
      temperature: 0.4,
      max_tokens: 1500,
      response_format: { type: "json_object" },
    }),
  });

  if (!res.ok) {
    const err = await res.text().catch(() => "Groq API error");
    throw new Error(`Groq ${res.status}: ${err}`);
  }

  const data = await res.json();
  const content = data.choices?.[0]?.message?.content;
  if (!content) throw new Error("No content in Groq response");
  return parseSelection(content, topics, target);
}

async function selectWithClaude(
  system: string,
  user: string,
  topics: Candidate[],
  target: number,
  key: string,
): Promise<{ picks: Pick[]; skipped: Skip[] }> {
  const Anthropic = (await import("@anthropic-ai/sdk")).default;
  const client = new Anthropic({ apiKey: key });
  const response = await client.messages.create({
    model: CLAUDE_MODEL,
    max_tokens: 1500,
    system,
    messages: [{ role: "user", content: user }],
  });

  const text = response.content.map((b) => (b.type === "text" ? b.text : "")).join("");
  return parseSelection(text, topics, target);
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
  const byScore = (): { picks: Pick[]; skipped: Skip[]; method: string } => ({
    method: "score",
    picks: [...topics]
      .sort((a, b) => b.score - a.score)
      .slice(0, target)
      .map((t) => ({ rank: t.rank, reason: `Top engagement score (${t.score}).` })),
    skipped: [],
  });

  const { system, user } = buildPrompts(target, topics, recent);
  const hasGroq = !!process.env.GROQ_API_KEY;
  const key = anthropicKey();
  const provider = body.provider === "groq" || body.provider === "claude" ? body.provider : "auto";

  // Order the providers to try. Auto prefers Groq (free) then Claude.
  const attempts: Array<"groq" | "claude"> = [];
  if (provider === "groq") {
    if (hasGroq) attempts.push("groq");
  } else if (provider === "claude") {
    if (key) attempts.push("claude");
  } else {
    if (hasGroq) attempts.push("groq");
    if (key) attempts.push("claude");
  }

  for (const method of attempts) {
    try {
      const { picks, skipped } =
        method === "groq"
          ? await selectWithGroq(system, user, topics, target)
          : await selectWithClaude(system, user, topics, target, key as string);
      return NextResponse.json({ method, picks, skipped });
    } catch (err) {
      // Try the next provider; if all fail we fall through to score.
      console.error(`[triage-select] ${method} failed:`, err);
    }
  }

  return NextResponse.json(byScore());
}
