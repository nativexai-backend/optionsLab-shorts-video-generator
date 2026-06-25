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

const MODEL = "claude-sonnet-4-6";

export async function POST(req: NextRequest) {
  let body: { topics?: Candidate[]; recent?: RecentTopic[]; target?: number };
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
  // usable with no API key (and as a safety net if the model call fails).
  const byScore = (): { picks: Pick[]; skipped: Skip[]; method: string } => ({
    method: "score",
    picks: [...topics]
      .sort((a, b) => b.score - a.score)
      .slice(0, target)
      .map((t) => ({ rank: t.rank, reason: `Top engagement score (${t.score}).` })),
    skipped: [],
  });

  const key = anthropicKey();
  if (!key) {
    return NextResponse.json(byScore());
  }

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

  try {
    const Anthropic = (await import("@anthropic-ai/sdk")).default;
    const client = new Anthropic({ apiKey: key });
    const response = await client.messages.create({
      model: MODEL,
      max_tokens: 1500,
      system,
      messages: [{ role: "user", content: user }],
    });

    const text = response.content
      .map((b) => (b.type === "text" ? b.text : ""))
      .join("");

    const json = text.match(/\{[\s\S]*\}/);
    if (!json) throw new Error("No JSON in model response");
    const parsed = JSON.parse(json[0]) as { picks?: Pick[]; skipped?: Skip[] };

    // Validate ranks exist in the candidate set; trim to target.
    const valid = new Set(topics.map((t) => t.rank));
    const picks = (parsed.picks ?? []).filter((p) => valid.has(p.rank)).slice(0, target);
    if (picks.length === 0) throw new Error("Model returned no valid picks");
    const skipped = (parsed.skipped ?? []).filter((s) => valid.has(s.rank));

    return NextResponse.json({ method: "claude", picks, skipped });
  } catch (err) {
    // On any model/parse failure, fall back to score so the UI still works.
    console.error("[triage-select] falling back to score:", err);
    return NextResponse.json(byScore());
  }
}
