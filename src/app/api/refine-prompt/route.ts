import { NextRequest, NextResponse } from "next/server";
import { anthropicKey } from "@/lib/anthropic";

// One-shot prompt refinement: takes a scene's existing image prompt and
// rewrites it with a prompt-engineer persona. Each call should produce a
// noticeably different, improved variation (that's the point of re-prompting).

const REFINE_SYSTEM_PROMPT = `You are an expert image-prompt engineer for OptionsLab's short-form vertical finance videos (9:16, 720x1280). You will receive a scene's context and its current image prompt. Rewrite the prompt to be better — and produce a NOTICEABLY DIFFERENT variation than the current one (vary the setting, lighting angle, lens feel, or composition details) while keeping the same subject, company, and trend direction.

Rules the rewritten prompt MUST follow:
- Subject-first, comma-separated searchable keywords (works for Midjourney/Flux/DALL-E AND as a stock-photo search query). No filler sentences.
- PHOTOREALISTIC editorial photography — like a premium business-magazine feature or modern fintech brand shoot. One real scene, one camera viewpoint. NEVER: 3D renders, CGI emblems, floating logos, glowing icons on walls, colored halos behind subjects, split-screens, collages. (Exception: chart scenes may be clean screen graphics.)
- Logos must appear in the real world: signage on a headquarters facade, office tower, storefront — photographed, never rendered.
- House style: BRIGHT, modern, airy — natural daylight, large windows, clean whites and warm neutrals, vibrant true-to-life color. Avoid dark moody low-key scenes and night settings unless the story itself is gloomy. Trend accents come from in-scene screens: green charts for gains, red charts for losses.
- NEVER include digits, dollar amounts, percentages, dates, or any quantity in the prompt — image generators bake them in as ugly text. Translate stats into physical metaphors (printing press for money supply, hourglass for deadlines, anchored tankers for blocked shipping).
- Composition: subject in the UPPER TWO-THIRDS of frame; calm dark negative space in the lower third (captions overlay there); nothing critical in corners (avatar sits there).
- NO baked-in text of any kind: no headlines, price labels, percentages, tickers, banners, name labels, taglines.
- Must END with exactly: "no text overlays, vertical 9:16 format"

Return ONLY the rewritten prompt text. No quotes, no markdown, no explanations.`;

function buildUserMessage(body: {
  imagePrompt: string;
  scriptSegment?: string;
  description?: string;
  category?: string;
  guidance?: string;
}): string {
  const lines = [
    `Scene category: ${body.category ?? "unknown"}`,
    `Scene description: ${body.description ?? "—"}`,
    `Script line this covers: "${body.scriptSegment ?? "—"}"`,
    ``,
    `Current image prompt:`,
    body.imagePrompt,
  ];
  if (body.guidance?.trim()) {
    lines.push(
      ``,
      `USER DIRECTION — incorporate this above all else (while keeping the house style and text rules):`,
      body.guidance.trim()
    );
  }
  lines.push(``, `Rewrite it now.`);
  return lines.join("\n");
}

async function refineWithGroq(userMessage: string): Promise<string> {
  const apiKey = process.env.GROQ_API_KEY;
  if (!apiKey) throw new Error("No GROQ_API_KEY");

  const res = await fetch("https://api.groq.com/openai/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: "llama-3.3-70b-versatile",
      messages: [
        { role: "system", content: REFINE_SYSTEM_PROMPT },
        { role: "user", content: userMessage },
      ],
      temperature: 0.85,
      max_tokens: 300,
    }),
  });

  if (!res.ok) {
    const err = await res.text().catch(() => "Groq API error");
    throw new Error(`Groq ${res.status}: ${err}`);
  }

  const data = await res.json();
  const content = data.choices?.[0]?.message?.content?.trim();
  if (!content) throw new Error("No content in Groq response");
  return content;
}

async function refineWithClaude(userMessage: string): Promise<string> {
  const Anthropic = (await import("@anthropic-ai/sdk")).default;
  const client = new Anthropic({ apiKey: anthropicKey() });

  const response = await client.messages.create({
    model: "claude-haiku-4-5",
    max_tokens: 300,
    temperature: 0.85,
    system: REFINE_SYSTEM_PROMPT,
    messages: [{ role: "user", content: userMessage }],
  });

  const textBlock = response.content.find((b) => b.type === "text");
  if (!textBlock || textBlock.type !== "text") {
    throw new Error("No text response from Claude");
  }
  return textBlock.text.trim();
}

export async function POST(req: NextRequest) {
  let body: { imagePrompt?: string; scriptSegment?: string; description?: string; category?: string; guidance?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  if (!body.imagePrompt || typeof body.imagePrompt !== "string") {
    return NextResponse.json({ error: "'imagePrompt' is required" }, { status: 400 });
  }
  if (body.guidance && body.guidance.length > 500) {
    return NextResponse.json({ error: "Direction must be 500 characters or fewer" }, { status: 400 });
  }

  const userMessage = buildUserMessage(body as { imagePrompt: string; scriptSegment?: string; description?: string; category?: string; guidance?: string });

  if (process.env.GROQ_API_KEY) {
    try {
      const imagePrompt = await refineWithGroq(userMessage);
      return NextResponse.json({ imagePrompt, method: "groq" });
    } catch (err) {
      console.error("Groq refine failed:", err);
    }
  }

  if (anthropicKey()) {
    try {
      const imagePrompt = await refineWithClaude(userMessage);
      return NextResponse.json({ imagePrompt, method: "claude" });
    } catch (err) {
      console.error("Claude refine failed:", err);
    }
  }

  return NextResponse.json(
    { error: "Prompt refinement needs a GROQ_API_KEY or ANTHROPIC_API_KEY" },
    { status: 503 }
  );
}
