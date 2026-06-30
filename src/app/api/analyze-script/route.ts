import { NextRequest, NextResponse } from "next/server";
import type { SceneSuggestion, ImageAnimation, SceneCategory } from "@/remotion/types";
import { anthropicKey } from "@/lib/anthropic";
import { recordUsage } from "@/lib/usage-storage";

// ── Shared prompt ──

const SYSTEM_PROMPT = `You are a visual director and image-prompt engineer for short-form vertical finance videos (TikTok/Reels style, 9:16 aspect ratio, 720x1280px) produced for OptionsLab, a trading community.

Given a script about financial topics (stocks, companies, markets, executives), break it into 3-8 visual scenes. Each scene needs a short description and an imagePrompt that works BOTH as a generative-AI prompt (Midjourney, Flux, DALL-E) AND as a stock-photo search query. To serve both: lead with concrete searchable keywords (subject first, then context), then append style modifiers. Comma-separated phrases, no filler sentences.

HOUSE STYLE — apply to EVERY imagePrompt so assets generated weeks apart match one brand:
- Realism above all: PHOTOREALISTIC editorial photography — like a premium business-magazine feature or a modern fintech brand shoot. Real places, real materials, natural light. NEVER 3D renders, CGI emblems, floating objects, glowing icons on walls, posters, or motion-graphics looks. (Exception: charts may be clean screen graphics.)
- Light & palette: BRIGHT, modern, airy — natural daylight, large windows, clean whites and warm neutrals, vibrant true-to-life color. Think contemporary glass offices with city views, sunlit streets, fresh morning light, crisp clear skies. Avoid dark moody low-key scenes, night settings, and heavy shadows — unless the story itself is gloomy (a crash, a shutdown), and even then prefer overcast daylight over darkness.
- Trend accents come from in-scene content: green chart screens for gains, red chart screens for losses — never colored halos, tinted lighting washes, or glows behind subjects.
- Mood: optimistic, premium, confident, editorial. Shallow depth of field (f/1.8–f/2.8, 35mm or 85mm look) for people, products, and places; crisp deep focus only for chart graphics.
- Composition for 9:16: ONE scene, ONE camera viewpoint — never split-screens, collages, side-by-side panels, or montages. Subject in the UPPER TWO-THIRDS of the frame; the LOWER-CENTER third must stay visually CALM and uncluttered (smooth floor, desk surface, sky, water) — word-synced captions are overlaid there. Corners hold no critical detail (a circular avatar sits in one corner). Generous headroom, nothing important touching frame edges.

CRITICAL — TEXT ON IMAGES:
Captions are burned over every image. Images are clean BACKGROUND visuals, never information carriers.
- NO baked-in text: no headlines, price labels, percentage callouts, tickers, banners, signage with messages, watermarks, name labels, taglines.
- Charts: show only the SHAPE and COLOR of the trend (green candles up / red candles down). No axis numbers, no prices.
- Every imagePrompt MUST end with: "no text overlays, vertical 9:16 format".

CRITICAL — NUMBERS AND STATS:
Image generators RENDER any quantity you mention as ugly baked-in text (banners, calendars, counters). Therefore the imagePrompt must NEVER contain digits, dollar amounts, percentages, dates, day counts, or spelled-out quantities — even though the script does. Translate the stat into a purely physical metaphor instead:
- "$3 trillion injected" → "sheets of freshly printed hundred dollar bills rolling through a printing press, bright industrial lighting, shallow depth of field"
- "180 days remaining" → "hourglass with sand running low on a bright desk by a window, soft morning light"
- "75% of tankers stuck" → "oil tankers anchored in a crowded gulf, midday aerial view, clear blue water"
The spoken captions deliver the number; the image delivers the feeling of it.

CRITICAL — STAY ON TOPIC (most important rule):
Every scene's visual must depict EXACTLY what its own script segment is about — the specific company, person, product, event, or metric named in that segment. Pull the subject straight from the words of the segment. NEVER introduce a subject, person, company, place, or concept that isn't in that segment. NO tangential ideas, NO generic filler (random trading floors, skylines, handshakes) when the segment names something concrete, NO creative leaps to a loosely-related theme. If the segment is about Nvidia's earnings, the visual is Nvidia — not a generic data center or an unrelated chart. When you genuinely can't tie a visual to the segment's subject, prefer a clean chart or that entity's logo over an off-topic scene. The description and imagePrompt must both stay on the segment's exact topic.

CRITICAL — EXACT CONTEXT:
Extract the EXACT financial context from the script: which company, which person, direction up or down (green up / red down), which sector. "Tesla stock surged" means a green upward chart and Tesla-specific imagery, never a generic flat chart. Name real entities explicitly — these prompts also tag a reusable asset library ("Elon Musk portrait", "Tesla logo", "green uptrend chart"), so specific, consistent naming matters.

CRITICAL — COMMODITIES (OIL):
When a segment is about oil, crude, petroleum, OPEC, gasoline/diesel, refineries, or energy supply, DO NOT use a chart. Depict PHYSICAL OIL BARRELS in a real industrial scene, and VARY the location, action and style every time: barrels stacked on pallets in a sunlit warehouse, a forklift moving drums across a shipping yard, barrels lined along a dock with tankers behind, drums on a conveyor inside a refinery, a worker rolling or loading a barrel onto a truck, an aerial grid of barrels in a storage yard, a single barrel in sharp focus among many. Use category "b-roll", photorealistic industrial editorial photography, bright natural daylight, shallow depth of field. (Other commodities follow the same idea with their own physical object — gold bars, copper coils, wheat sacks — never a chart.)

CRITICAL — COUNTRIES / GEOPOLITICS:
When a segment names one or more countries, nations, or geopolitical actors (USA, China, Iran, Russia, Israel, Saudi Arabia, Ukraine, the EU, etc.), capture them through their NATIONAL FLAGS in an evocative high-profile setting — never a plain map or a flat flag graphic. Always name the specific country's flag (and show BOTH flags when two nations are in dialogue or conflict). VARY THE SETTING EVERY TIME and be creative: an ornate ceremonial dialogue chamber with the flags flanking a high-backed throne on a grand theater stage with honor guards in dress uniform and dignitaries seated in the foreground; a grand parliamentary debate chamber with rows of delegates and the flag behind the podium; an international summit round-table with flags lined along the wall; a UN-style council chamber with the flag at the speaker's rostrum; or — for tech/innovation/AI stories — a sleek high-tech command room or research lab with the national flag on the wall and glowing screens. Use category "b-roll". These geopolitical/ceremonial scenes MAY be more dramatic and moody than the house bright style — cinematic spotlighting, deep shadows and rich color are welcome here. Keep flags accurate, keep the lower third uncluttered, and still bake in NO text or numbers.

CATEGORY RECIPES (subject-first; one example each):
- person — a specific person (CEO, analyst, public figure). Recipe: full name + title, setting, pose/expression, then house style. Example: "Elon Musk, Tesla CEO, speaking at a daytime press event, confident expression, three-quarter portrait framed in upper two-thirds, bright modern venue with natural light, editorial press photography, shallow depth of field 85mm look, clean uncluttered lower third, no text overlays, vertical 9:16 format"
- logo — the brand shown in the REAL WORLD, photographed — never a floating emblem or a glowing icon on a wall. Recipe: company signage in a real location (headquarters facade, office tower, storefront, campus entrance), camera angle, time of day. Example: "Tesla logo signage on glass headquarters facade on a clear sunny day, low-angle architectural photography, blue sky and cloud reflections in glass, editorial press photo style, clean plaza in lower third, no text overlays, vertical 9:16 format"
- chart — market action shown as a CANDID HUMAN SCENE, real people working at a multi-monitor trading desk (never a sterile chart-on-a-wall graphic). The candlestick trend is visible on the screens; trend color comes from those screens (green up / red down). VARY THE PEOPLE AND SETTING EVERY TIME — change the number, gender, age and wardrobe of the people, the monitor setup, and the office (open-plan loft, fintech startup, glass trading room, home battlestation, co-working space). Recipe: real people + what they're doing + the multi-monitor setup with the candlestick trend on screen + varied bright setting + candid lifestyle camera feel. Example: "two young traders at a six-monitor desk, one standing and pointing at the screens while the other types, stock charts with green candlesticks rising on the monitors, bright modern open-plan trading loft with an industrial ceiling, exposed staircase and potted plants, warm natural daylight from large windows, candid side-angle lifestyle photography, shallow depth of field, uncluttered lower third, no axis numbers, no price labels, no text overlays, vertical 9:16 format"
- product — physical product, app, or service visual. Recipe: product name, hero angle, surface, lighting. Example: "iPhone 16 Pro, hero product shot at a slight angle on a clean white desk by a window, soft natural daylight, subtle true shadows, premium tech editorial photography, shallow depth of field, smooth uncluttered surface in lower third, no labels, no text overlays, vertical 9:16 format"
- b-roll — contextual atmosphere (office, skyline, street, factory). Recipe: specific scene, time of day, camera feel. Example: "Modern financial district street on a clear morning, glass towers and professionals walking, bright natural light, candid editorial photography, shallow depth of field, clean pavement in lower third, no text overlays, vertical 9:16 format"
- text-overlay — use SPARINGLY (captions already carry the words); depict a physical metaphor for the stat or moment instead, with zero glyphs or numbers. Example: "Hourglass with sand running low on a bright desk by a window, soft morning light, blurred modern office in background, macro photography shallow depth of field, clean surface in lower third, no text overlays, vertical 9:16 format"

ANIMATIONS (pick the one that matches the visual's energy):
- kenBurns: slow pan + zoom — portraits, establishing b-roll
- panLeft / panRight: horizontal drift — wide scenes, product lineups, skylines
- panUp / panDown: vertical travel — charts (panUp for uptrends), tall subjects
- zoomIn: dramatic emphasis — charts at the key moment, tension
- zoomOut: reveal/context — openers, scene resets
- static: no movement — logos, clean graphic frames

PRIORITY:
- essential: core visual directly illustrating the script point
- recommended: enhances understanding, script works without it
- optional: visual variety only

Return ONLY valid JSON (no markdown fences) in this exact format:
{
  "scenes": [
    {
      "scriptSegment": "The exact words from the script this covers",
      "description": "Short description, e.g. 'Tesla stock chart showing strong uptrend'",
      "imagePrompt": "Subject-first prompt following the category recipe and house style, ending with 'no text overlays, vertical 9:16 format'",
      "category": "chart",
      "suggestedAnimation": "zoomIn",
      "animationReason": "Zoom draws attention to the upward trend",
      "priority": "essential",
      "wordRange": [0, 15]
    }
  ]
}

wordRange is [startWordIndex, endWordIndex] (0-based, inclusive) covering which words in the script this scene maps to. Scenes must cover the entire script without gaps or overlaps.

FINAL CHECK for every imagePrompt: subject named first and searchable; reads as a PHOTOGRAPH of one real scene (chart scenes show real people at a trading desk; oil scenes show physical barrels; country scenes show national flags in a high-profile chamber/summit/lab — never a bare graphic); BRIGHT natural light stated (except geopolitical/ceremonial scenes, which may be cinematic and moody); contains NO digits, amounts, dates, or quantities; no glow-behind-logo, no split-screen; correct trend color from in-scene screens; upper-two-thirds composition with a calm uncluttered lower third stated; ends with "no text overlays, vertical 9:16 format".`;

// ── Parse LLM response into SceneSuggestion[] ──

function parseLLMResponse(
  text: string,
  totalWords: number,
): SceneSuggestion[] {
  // Models sometimes wrap the JSON in markdown fences or add a preamble /
  // trailing note. Strip fences, then slice from the first bracket to the last
  // matching one so surrounding prose can't break JSON.parse.
  let cleaned = text.replace(/```(?:json)?/gi, "").trim();
  const start = cleaned.search(/[[{]/);
  const end = Math.max(cleaned.lastIndexOf("}"), cleaned.lastIndexOf("]"));
  if (start >= 0 && end > start) cleaned = cleaned.slice(start, end + 1);

  const parsed = JSON.parse(cleaned);
  const rawScenes = Array.isArray(parsed) ? parsed : parsed.scenes;
  if (!Array.isArray(rawScenes)) throw new Error("No scenes array in response");

  return rawScenes.map((s: Record<string, unknown>, i: number) => ({
    id: `scene-${i}-${Date.now()}`,
    scriptSegment: String(s.scriptSegment ?? ""),
    description: String(s.description ?? ""),
    imagePrompt: String(s.imagePrompt ?? s.description ?? ""),
    category: validateCategory(s.category),
    suggestedAnimation: validateAnimation(s.suggestedAnimation),
    animationReason: String(s.animationReason ?? ""),
    priority: validatePriority(s.priority),
    wordRange: validateWordRange(s.wordRange, totalWords),
  }));
}

// ── Groq (free) ──

async function analyzeWithGroq(
  scriptText: string,
): Promise<{ scenes: SceneSuggestion[]; method: "groq"; tokens: number }> {
  const apiKey = process.env.GROQ_API_KEY;
  if (!apiKey) throw new Error("No GROQ_API_KEY");

  const words = scriptText.split(/\s+/).filter(Boolean);

  const res = await fetch("https://api.groq.com/openai/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: "llama-3.3-70b-versatile",
      messages: [
        { role: "system", content: SYSTEM_PROMPT },
        {
          role: "user",
          content: `Analyze this script (${words.length} words total) and suggest visual scenes:\n\n${scriptText}`,
        },
      ],
      temperature: 0.3,
      max_tokens: 2048,
    }),
  });

  if (!res.ok) {
    const err = await res.text().catch(() => "Groq API error");
    throw new Error(`Groq ${res.status}: ${err}`);
  }

  const data = await res.json();
  const content = data.choices?.[0]?.message?.content;
  if (!content) throw new Error("No content in Groq response");

  return { scenes: parseLLMResponse(content, words.length), method: "groq", tokens: data.usage?.total_tokens ?? 0 };
}

// ── Claude (paid, optional) ──

async function analyzeWithClaude(
  scriptText: string,
): Promise<{ scenes: SceneSuggestion[]; method: "claude"; tokens: number }> {
  const Anthropic = (await import("@anthropic-ai/sdk")).default;
  const client = new Anthropic({ apiKey: anthropicKey() });

  const words = scriptText.split(/\s+/).filter(Boolean);

  const response = await client.messages.create({
    model: "claude-haiku-4-5",
    max_tokens: 2048,
    system: SYSTEM_PROMPT,
    messages: [
      {
        role: "user",
        content: `Analyze this script (${words.length} words total) and suggest visual scenes:\n\n${scriptText}`,
      },
    ],
  });

  const textBlock = response.content.find((b) => b.type === "text");
  if (!textBlock || textBlock.type !== "text") {
    throw new Error("No text response from Claude");
  }

  return {
    scenes: parseLLMResponse(textBlock.text, words.length),
    method: "claude",
    tokens: (response.usage?.input_tokens ?? 0) + (response.usage?.output_tokens ?? 0),
  };
}

// ── Rule-based fallback ──

interface RuleMatch {
  pattern: RegExp;
  category: SceneCategory;
  animation: ImageAnimation;
  descriptionTemplate: (match: string) => string;
  priority: "essential" | "recommended" | "optional";
}

const RULES: RuleMatch[] = [
  {
    pattern:
      /\b(?:Apple|AAPL|Google|GOOGL|Microsoft|MSFT|Amazon|AMZN|Tesla|TSLA|Meta|META|Netflix|NFLX|Nvidia|NVDA|AMD|Intel|INTC|JPMorgan|Goldman Sachs|Berkshire|Disney|DIS|Boeing|BA|Walmart|WMT|Visa|Mastercard|PayPal|PYPL|Coinbase|COIN|Palantir|PLTR|SoFi|SOFI|Robinhood|HOOD)\b/gi,
    category: "logo",
    animation: "static",
    descriptionTemplate: (m) => `${m} company logo on clean background`,
    priority: "essential",
  },
  {
    pattern:
      /\b(?:CEO|CFO|CTO|founder|chairman|analyst|Tim Cook|Elon Musk|Satya Nadella|Jensen Huang|Mark Zuckerberg|Warren Buffett|Jamie Dimon|Cathie Wood|Jim Cramer)\b/gi,
    category: "person",
    animation: "kenBurns",
    descriptionTemplate: (m) =>
      `${m} professional headshot or speaking at event`,
    priority: "essential",
  },
  {
    pattern:
      /\b(?:oil|crude|petroleum|OPEC|barrel|barrels|WTI|Brent|gasoline|diesel|refinery|refineries)\b/gi,
    category: "b-roll",
    animation: "panLeft",
    descriptionTemplate: (m) => `Oil barrels representing ${m} context`,
    priority: "recommended",
  },
  {
    pattern:
      /\b(?:United States|U\.S\.|USA|America|American|China|Chinese|Russia|Russian|Iran|Iranian|Israel|Israeli|Ukraine|Ukrainian|Saudi Arabia|Saudi|Japan|Japanese|Germany|German|France|French|India|Indian|United Kingdom|U\.K\.|Britain|British|European Union|EU|North Korea|Taiwan|Mexico|Canada|Brazil)\b/g,
    category: "b-roll",
    animation: "kenBurns",
    descriptionTemplate: (m) => `${m} flag in a high-profile geopolitical setting`,
    priority: "recommended",
  },
  {
    pattern:
      /\b(?:\d+%|stock|shares|price|earnings|revenue|profit|loss|market cap|valuation|P\/E|EPS|dividend|IPO|quarterly|annual report|beat expectations|missed estimates|guidance)\b/gi,
    category: "chart",
    animation: "zoomIn",
    descriptionTemplate: (m) =>
      `Stock chart or financial data visualization for ${m} context`,
    priority: "recommended",
  },
  {
    pattern:
      /\b(?:iPhone|iPad|MacBook|Pixel|Galaxy|Surface|AWS|Azure|Cloud|AI model|ChatGPT|Vision Pro|Autopilot|FSD|App Store|Play Store)\b/gi,
    category: "product",
    animation: "panLeft",
    descriptionTemplate: (m) => `${m} product shot or screenshot`,
    priority: "recommended",
  },
];

function pickRandom<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

// Physical oil-barrel scene — varied location/action/style each call (no chart).
function oilBarrelPrompt(): string {
  const scene = pickRandom([
    "rows of steel oil barrels stacked on wooden pallets in a sunlit industrial warehouse",
    "a forklift moving a pallet of oil drums across a bright shipping yard",
    "weathered oil barrels lined along a dock with tankers in the background on a clear day",
    "stacks of blue and rust-red oil drums in a refinery yard under bright daylight",
    "a worker rolling an oil barrel across a clean concrete loading bay in morning light",
    "freshly painted oil barrels on a conveyor inside a modern refinery, bright industrial lighting",
    "oil drums being loaded onto a truck at a fuel depot on a sunny morning",
    "a neat grid of oil barrels in an open storage yard, aerial three-quarter view, clear sky",
    "a single oil barrel in sharp focus among many rows in a vast storage facility",
  ]);
  return `${scene}, photorealistic industrial editorial photography, warm natural daylight, shallow depth of field, uncluttered lower third, no text overlays, vertical 9:16 format (720x1280)`;
}

// National-flag geopolitical scene — varied high-profile setting each call.
function countrySettingPrompt(country: string): string {
  const flag = country ? `the ${country} flag` : "national flags";
  const setting = pickRandom([
    `an ornate ceremonial dialogue chamber, ${flag} flanking a high-backed throne on a grand theater stage, honor guards in dress uniform, dignitaries seated in the foreground, dramatic warm spotlighting`,
    `a grand parliamentary debate chamber, rows of seated delegates, ${flag} displayed behind the podium, cinematic light from high windows`,
    `an international summit round-table in a modern conference hall, ${flag} lined along the wall, delegates seated, rich diplomatic lighting`,
    `a UN-style council chamber, ${flag} at the speaker's rostrum, curved tiers of seats, moody cinematic lighting`,
    `a sleek high-tech command room, ${flag} on the wall, glowing screens and engineers at work, cool dramatic lighting`,
    `a stately government press hall, ${flag} as a backdrop behind an empty podium, polished marble, dramatic light`,
  ]);
  return `${setting}, photorealistic editorial photography, shallow depth of field, uncluttered lower third, no text overlays, vertical 9:16 format (720x1280)`;
}

// Candid people-at-a-trading-desk scene — varied people/monitors/setting each call.
function tradingDeskPrompt(trendColor: string): string {
  const people = pickRandom([
    "two young male traders, one standing and pointing at the screens while the other sits at the keyboard",
    "a focused young trader leaning toward a wall of monitors",
    "two colleagues in casual t-shirts analyzing the screens together",
    "a young female trader studying the charts with coffee in hand",
    "a small team of analysts gathered around a multi-monitor trading desk",
    "a trader in his thirties reviewing positions, headphones around his neck",
  ]);
  const monitors = pickRandom([
    "a six-screen monitor wall",
    "a curved multi-monitor stack",
    "a triple-monitor desk setup",
    "a row of trading monitors",
  ]);
  const setting = pickRandom([
    "bright modern open-plan trading loft with an industrial ceiling, exposed staircase and potted plants",
    "airy fintech startup office with wood floors, exposed brick and large windows",
    "sleek glass-walled trading room flooded with daylight",
    "stylish co-working space with hanging plants and warm wood desks",
    "minimal home trading battlestation by a sunlit window in a modern loft",
  ]);
  const shot = pickRandom([
    "candid side-angle lifestyle photo, shallow depth of field",
    "over-the-shoulder candid shot, soft background blur",
    "wide candid lifestyle photo from across the room",
    "natural reportage photography, 35mm look, shallow depth of field",
  ]);
  return `${people} at ${monitors} showing stock market charts with ${trendColor}, in a ${setting}, warm natural daylight from large windows, ${shot}, authentic finance lifestyle photography, uncluttered lower third, no price labels, no percentage text, no axis numbers, no text overlays, vertical 9:16 format (720x1280)`;
}

function generateRuleImagePrompt(category: SceneCategory, matchText: string, chunk: string): string {
  // Topic overrides only enrich generic chart/b-roll scenes — a specific
  // person/logo/product match keeps its own subject.
  if (category === "chart" || category === "b-roll") {
    // Oil / commodity context → physical barrels, never a chart.
    if (/\b(?:oil|crude|petroleum|OPEC|barrel|barrels|WTI|Brent|gasoline|diesel|refinery|refineries)\b/i.test(`${chunk} ${matchText}`)) {
      return oilBarrelPrompt();
    }
    // Country / geopolitics context → national flag in a high-profile setting.
    const countryMatch = `${matchText} ${chunk}`.match(
      /\b(?:United States|U\.S\.|USA|America|China|Russia|Iran|Israel|Ukraine|Saudi Arabia|Japan|Germany|France|India|United Kingdom|U\.K\.|Britain|European Union|North Korea|Taiwan|Mexico|Canada|Brazil)\b/,
    );
    if (countryMatch) {
      return countrySettingPrompt(countryMatch[0]);
    }
  }

  // Detect trend direction from context for chart prompts
  const isUptrend = /\b(?:surge|soar|rally|gain|up|rose|climb|jump|beat|exceed)\b/i.test(chunk);
  const isDowntrend = /\b(?:drop|fall|crash|decline|loss|down|plunge|miss|tank|slip)\b/i.test(chunk);
  const trendColor = isDowntrend ? "red candlesticks trending downward" : isUptrend ? "green candlesticks trending upward" : "mixed green and red candlesticks";

  switch (category) {
    case "person":
      return `${matchText}, professional editorial portrait, confident expression, framed in upper two-thirds of frame, bright modern office background with natural daylight from large windows, candid business photography, shallow depth of field 85mm look, clean uncluttered lower third, no name labels, no text overlays, vertical 9:16 format (720x1280)`;
    case "logo":
      return `${matchText} logo signage on glass headquarters facade on a clear sunny day, low-angle architectural photography, blue sky and cloud reflections in glass, editorial press photo style, clean plaza in lower third, no text overlays, vertical 9:16 format (720x1280)`;
    case "chart":
      return tradingDeskPrompt(trendColor);
    case "product":
      return `${matchText}, hero product shot at slight angle on a clean white desk by a window, soft natural daylight, subtle true shadows, premium tech editorial photography, shallow depth of field, smooth uncluttered surface in lower third, no labels, no text overlays, vertical 9:16 format (720x1280)`;
    default:
      return `Modern financial district street on a clear morning, glass towers and professionals walking, bright natural light, candid editorial photography, shallow depth of field, clean pavement in lower third, no text overlays, vertical 9:16 format (720x1280)`;
  }
}

function analyzeWithRules(scriptText: string): {
  scenes: SceneSuggestion[];
  method: "rules";
} {
  const words = scriptText.split(/\s+/).filter(Boolean);
  if (words.length === 0) return { scenes: [], method: "rules" };

  let chunks: string[];
  const hasPunctuation = /[.!?]/.test(scriptText);
  if (hasPunctuation) {
    chunks = scriptText.split(/(?<=[.!?])\s+/).filter((s) => s.trim());
  } else {
    chunks = [];
    const chunkSize = Math.max(10, Math.min(25, Math.ceil(words.length / 5)));
    for (let i = 0; i < words.length; i += chunkSize) {
      chunks.push(words.slice(i, i + chunkSize).join(" "));
    }
  }

  const scenes: SceneSuggestion[] = [];
  let searchFrom = 0;

  for (const chunk of chunks) {
    const chunkWords = chunk.split(/\s+/).filter(Boolean);
    if (chunkWords.length === 0) continue;

    const wordStart = Math.min(searchFrom, words.length - 1);
    const wordEnd = Math.min(wordStart + chunkWords.length - 1, words.length - 1);
    searchFrom = wordEnd + 1;

    let bestMatch: { rule: RuleMatch; matchText: string } | null = null;
    for (const rule of RULES) {
      const match = chunk.match(rule.pattern);
      if (match) {
        bestMatch = { rule, matchText: match[0] };
        break;
      }
    }

    if (bestMatch) {
      const description = bestMatch.rule.descriptionTemplate(bestMatch.matchText);
      scenes.push({
        id: `scene-${scenes.length}-${Date.now()}`,
        scriptSegment: chunk.trim(),
        description,
        imagePrompt: generateRuleImagePrompt(bestMatch.rule.category, bestMatch.matchText, chunk.trim()),
        category: bestMatch.rule.category,
        suggestedAnimation: bestMatch.rule.animation,
        animationReason: `Auto-detected ${bestMatch.rule.category} reference: "${bestMatch.matchText}"`,
        priority: bestMatch.rule.priority,
        wordRange: [wordStart, wordEnd],
      });
    } else {
      scenes.push({
        id: `scene-${scenes.length}-${Date.now()}`,
        scriptSegment: chunk.trim(),
        description:
          "General financial background — trading floor, city skyline, or abstract market imagery",
        imagePrompt: `Modern financial district street on a clear morning, glass towers and professionals walking, bright natural light, candid editorial photography, shallow depth of field, clean pavement in lower third, no text overlays, vertical 9:16 format (720x1280)`,
        category: "b-roll",
        suggestedAnimation: "kenBurns",
        animationReason: "No specific visual cue detected — using general b-roll",
        priority: "optional",
        wordRange: [wordStart, wordEnd],
      });
    }
  }

  if (scenes.length > 8) {
    const merged: SceneSuggestion[] = [];
    for (const scene of scenes) {
      const last = merged[merged.length - 1];
      if (last && last.category === scene.category && last.priority === scene.priority) {
        last.scriptSegment += " " + scene.scriptSegment;
        last.wordRange = [last.wordRange[0], scene.wordRange[1]];
      } else {
        merged.push({ ...scene });
      }
    }
    return { scenes: merged.slice(0, 8), method: "rules" };
  }

  return { scenes, method: "rules" };
}

// ── Validators ──

function validateCategory(v: unknown): SceneCategory {
  const valid: SceneCategory[] = ["person", "logo", "chart", "product", "b-roll", "text-overlay"];
  return valid.includes(v as SceneCategory) ? (v as SceneCategory) : "b-roll";
}

function validateAnimation(v: unknown): ImageAnimation {
  const valid: ImageAnimation[] = ["kenBurns", "panLeft", "panRight", "panUp", "panDown", "zoomIn", "zoomOut", "static"];
  return valid.includes(v as ImageAnimation) ? (v as ImageAnimation) : "kenBurns";
}

function validatePriority(v: unknown): "essential" | "recommended" | "optional" {
  const valid = ["essential", "recommended", "optional"];
  return valid.includes(v as string) ? (v as "essential" | "recommended" | "optional") : "recommended";
}

function validateWordRange(v: unknown, totalWords: number): [number, number] {
  if (Array.isArray(v) && v.length === 2 && typeof v[0] === "number" && typeof v[1] === "number") {
    return [
      Math.max(0, Math.min(v[0], totalWords - 1)),
      Math.max(0, Math.min(v[1], totalWords - 1)),
    ];
  }
  return [0, totalWords - 1];
}

export type AnalysisProvider = "groq" | "claude" | "rules" | "auto";

function getAvailableProviders(): AnalysisProvider[] {
  const providers: AnalysisProvider[] = ["auto"];
  if (process.env.GROQ_API_KEY) providers.push("groq");
  if (anthropicKey()) providers.push("claude");
  providers.push("rules");
  return providers;
}

// ── Route handler ──

export async function POST(req: NextRequest) {
  let body: { scriptText?: string; provider?: AnalysisProvider; projectId?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const { scriptText, provider = "auto", projectId } = body;
  if (!scriptText || typeof scriptText !== "string" || !scriptText.trim()) {
    return NextResponse.json({ error: "'scriptText' is required" }, { status: 400 });
  }

  const available = getAvailableProviders();
  const track = (method: "groq" | "claude", tokens: number) =>
    recordUsage(projectId, method, { tokens }).catch(() => {});

  // Direct provider request
  if (provider === "groq" && process.env.GROQ_API_KEY) {
    try {
      const result = await analyzeWithGroq(scriptText);
      track("groq", result.tokens);
      return NextResponse.json({ ...result, available });
    } catch (err) {
      console.error("Groq analysis failed:", err);
      // Resolve to Claude (then rules) instead of failing the request.
      if (anthropicKey()) {
        try {
          const result = await analyzeWithClaude(scriptText);
          track("claude", result.tokens);
          return NextResponse.json({ ...result, available });
        } catch (claudeErr) {
          console.error("Claude fallback after Groq failed:", claudeErr);
        }
      }
      const result = analyzeWithRules(scriptText);
      return NextResponse.json({ ...result, available });
    }
  }

  if (provider === "claude" && anthropicKey()) {
    try {
      const result = await analyzeWithClaude(scriptText);
      track("claude", result.tokens);
      return NextResponse.json({ ...result, available });
    } catch (err) {
      console.error("Claude analysis failed:", err);
      // Resolve to Groq (then rules) instead of failing the request.
      if (process.env.GROQ_API_KEY) {
        try {
          const result = await analyzeWithGroq(scriptText);
          track("groq", result.tokens);
          return NextResponse.json({ ...result, available });
        } catch (groqErr) {
          console.error("Groq fallback after Claude failed:", groqErr);
        }
      }
      const result = analyzeWithRules(scriptText);
      return NextResponse.json({ ...result, available });
    }
  }

  if (provider === "rules") {
    const result = analyzeWithRules(scriptText);
    return NextResponse.json({ ...result, available });
  }

  // Auto: Groq → Claude → Rules
  if (process.env.GROQ_API_KEY) {
    try {
      const result = await analyzeWithGroq(scriptText);
      track("groq", result.tokens);
      return NextResponse.json({ ...result, available });
    } catch (err) {
      console.error("Groq analysis failed:", err);
    }
  }

  if (anthropicKey()) {
    try {
      const result = await analyzeWithClaude(scriptText);
      track("claude", result.tokens);
      return NextResponse.json({ ...result, available });
    } catch (err) {
      console.error("Claude analysis failed:", err);
    }
  }

  const result = analyzeWithRules(scriptText);
  return NextResponse.json({ ...result, available });
}
