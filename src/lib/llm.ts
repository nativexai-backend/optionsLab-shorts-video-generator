// ── Shared LLM provider helpers ──
//
// The analyze-script / refine-prompt / triage-select routes all talk to the
// same two providers: Groq (free, llama) first, Claude (paid) as fallback.
// These helpers own the request/response plumbing — each route keeps its own
// prompts, parsing, and fallback ladder.

import { anthropicKey } from "./anthropic";

export const GROQ_MODEL = "llama-3.3-70b-versatile";
export const DEFAULT_CLAUDE_MODEL = "claude-haiku-4-5";

export interface LLMMessage {
  role: string;
  content: string;
}

export interface LLMResult {
  text: string;
  tokens: number;
}

/** Groq chat-completions call. Throws on missing key, HTTP error, or empty content. */
export async function callGroq(opts: {
  system: string;
  messages: LLMMessage[];
  temperature?: number;
  maxTokens?: number;
  jsonMode?: boolean;
}): Promise<LLMResult> {
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
      messages: [{ role: "system", content: opts.system }, ...opts.messages],
      temperature: opts.temperature ?? 0.3,
      max_tokens: opts.maxTokens ?? 1024,
      ...(opts.jsonMode ? { response_format: { type: "json_object" } } : {}),
    }),
  });

  if (!res.ok) {
    const err = await res.text().catch(() => "Groq API error");
    throw new Error(`Groq ${res.status}: ${err}`);
  }

  const data = await res.json();
  const content = data.choices?.[0]?.message?.content;
  if (!content) throw new Error("No content in Groq response");
  return { text: content, tokens: data.usage?.total_tokens ?? 0 };
}

/** Anthropic Messages call (SDK imported lazily). Throws on missing text response. */
export async function callClaude(opts: {
  system: string;
  messages: LLMMessage[];
  maxTokens?: number;
  model?: string;
  temperature?: number;
}): Promise<LLMResult> {
  const Anthropic = (await import("@anthropic-ai/sdk")).default;
  const client = new Anthropic({ apiKey: anthropicKey() });

  const response = await client.messages.create({
    model: opts.model ?? DEFAULT_CLAUDE_MODEL,
    max_tokens: opts.maxTokens ?? 1024,
    ...(opts.temperature !== undefined ? { temperature: opts.temperature } : {}),
    system: opts.system,
    messages: opts.messages as { role: "user" | "assistant"; content: string }[],
  });

  const text = response.content
    .map((b) => (b.type === "text" ? b.text : ""))
    .join("");
  if (!text) throw new Error("No text response from Claude");

  return {
    text,
    tokens: (response.usage?.input_tokens ?? 0) + (response.usage?.output_tokens ?? 0),
  };
}

/**
 * Pull a JSON payload out of prose. Models sometimes wrap the JSON in markdown
 * fences or add a preamble / trailing note — strip fences, then slice from the
 * first bracket to the last matching one so surrounding text can't break
 * JSON.parse. Returns the (possibly still invalid) JSON candidate string.
 */
export function extractJson(text: string): string {
  let cleaned = text.replace(/```(?:json)?/gi, "").trim();
  const start = cleaned.search(/[[{]/);
  const end = Math.max(cleaned.lastIndexOf("}"), cleaned.lastIndexOf("]"));
  if (start >= 0 && end > start) cleaned = cleaned.slice(start, end + 1);
  return cleaned;
}
