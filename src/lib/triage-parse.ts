// Parser for the "PERSONA SHORTS — PRODUCTION DIGEST" daily format.
//
// The digest is highly regular, so this is fully deterministic (no LLM needed
// to read it): topics are delimited by their "#N — Title (score X/100)" header
// lines; each topic carries an ElevenLabs voice-design config, a social block,
// and the verbatim spoken script. Engagement ranking is already provided by the
// source (the score), so correct parsing alone yields the right order.

import { parseVoiceSpec, sanitizeVoiceSettings, type VoiceSettings } from "./voices";

export interface ParsedTopic {
  id: string;
  rank: number;
  title: string;
  score: number;
  why?: string;
  bestPlatform?: string;
  postTiming?: string;
  // Voice design
  character?: string; // full assigned character name, e.g. "Claire Donovan"
  persona?: string;
  gender?: string;
  voiceId?: string;
  voiceName?: string;
  model?: string; // ElevenLabs tts model id from the digest, e.g. eleven_multilingual_v2
  settings?: VoiceSettings;
  tags?: string[];
  prosody?: string;
  voiceDescription?: string;
  // Social
  description?: string;
  hashtags?: string;
  thumbnail?: string;
  captions: string[];
  twitterKeywords: string[];
  // The verbatim script + the raw block (kept so nothing is lost)
  script: string;
  raw: string;
}

const HEADER_RE = /^[ \t]*(?:🏆[ \t]*)?#(\d+)[ \t]*—[ \t]*(.+?)[ \t]*\(score[ \t]+(\d+)\s*\/\s*100\)[ \t]*$/gim;

function firstMatch(text: string, re: RegExp): string | undefined {
  const m = text.match(re);
  return m ? m[1].trim() : undefined;
}

function slice(block: string, fromNeedle: string, toNeedle?: string): string {
  const from = block.indexOf(fromNeedle);
  if (from === -1) return "";
  const start = from + fromNeedle.length;
  if (!toNeedle) return block.slice(start);
  const to = block.indexOf(toNeedle, start);
  return to === -1 ? block.slice(start) : block.slice(start, to);
}

function parseBlock(rank: number, title: string, score: number, block: string): ParsedTopic {
  const why = firstMatch(block, /^[ \t]*WHY:[ \t]*(.+)$/m);

  let bestPlatform: string | undefined;
  let postTiming: string | undefined;
  const pt = block.match(/BEST PLATFORM:[ \t]*(.+?)[ \t]{2,}POST TIMING:[ \t]*(.+?)[ \t]*$/m);
  if (pt) {
    bestPlatform = pt[1].trim();
    postTiming = pt[2].trim();
  } else {
    bestPlatform = firstMatch(block, /BEST PLATFORM:[ \t]*(.+)$/m);
    postTiming = firstMatch(block, /POST TIMING:[ \t]*(.+)$/m);
  }

  // Voice sub-section. Two digest formats are supported: the legacy
  // "── ELEVENLABS VOICE-DESIGN CONFIG ──" block and the current
  // "── ELEVENLABS VOICE (assigned) ──" block. Both start with "ELEVENLABS
  // VOICE", so slice from there to the social rule.
  const configText = slice(block, "ELEVENLABS VOICE", "── SOCIAL");
  const spec = parseVoiceSpec(configText); // legacy tags/prosody/description

  // The current format's "── ELEVENLABS API CALL ──" block is the authoritative,
  // ready-to-send request: its URL carries the voice_id and its JSON body the
  // model + voice_settings + verbatim text. Prefer it when present.
  const apiText = slice(block, "ELEVENLABS API CALL");
  let apiBody: { model_id?: string; voice_settings?: Partial<VoiceSettings> } | undefined;
  const bodyMatch = apiText.match(/\{[\s\S]*\}/);
  if (bodyMatch) {
    try { apiBody = JSON.parse(bodyMatch[0]); } catch { /* leave undefined */ }
  }
  const apiUrlVoiceId = firstMatch(apiText, /text-to-speech\/([A-Za-z0-9]+)/);

  // Current format: "character: Claire Donovan (female)"; legacy: "persona: Dana".
  const charMatch = configText.match(/character:[ \t]*([^()\n]+?)[ \t]*\(([^)]+)\)/i);
  const character = charMatch ? charMatch[1].trim() : undefined;
  const persona = firstMatch(configText, /^[ \t]*persona:[ \t]*([^\[\|\n]+)/im);
  const gender =
    (charMatch ? charMatch[2].trim() : undefined) ?? firstMatch(configText, /gender:[ \t]*([A-Za-z]+)/i);
  const voiceId = firstMatch(configText, /voice_id:[ \t]*([A-Za-z0-9]+)/i) ?? apiUrlVoiceId;
  const voiceName = firstMatch(configText, /voice_name:[ \t]*(.+)$/im) ?? character;
  const model = apiBody?.model_id ?? firstMatch(configText, /tts_model:[ \t]*([A-Za-z0-9_]+)/i);

  // Settings: prefer the API call body, then a "settings:" / "voice_settings:"
  // JSON object in the config block, then whatever parseVoiceSpec found.
  const settingsJson = (key: string): Partial<VoiceSettings> | undefined => {
    const m = configText.match(new RegExp(`${key}[ \\t]*[:=][ \\t]*(\\{[\\s\\S]*?\\})`, "i"));
    if (!m) return undefined;
    try { return JSON.parse(m[1]); } catch { return undefined; }
  };
  const rawSettings = apiBody?.voice_settings ?? settingsJson("settings");
  const settings = rawSettings ? sanitizeVoiceSettings(rawSettings) : spec.settings;

  // Social sub-section (between ── SOCIAL ── and the spoken script).
  const socialText = slice(block, "── SOCIAL", "SPOKEN SCRIPT");
  const description = firstMatch(socialText, /DESCRIPTION:[ \t]*(.+)$/im);
  const hashtags = firstMatch(socialText, /HASHTAGS:[ \t]*(.+)$/im);
  const thumbnail = firstMatch(socialText, /THUMBNAIL:[ \t]*(.+)$/im);
  const captions = [...socialText.matchAll(/^[ \t]*•[ \t]*(.+)$/gm)].map((m) => m[1].trim());
  const kwLine = firstMatch(socialText, /TWITTER KEYWORDS[^:]*:[ \t]*(.+)$/im);
  const twitterKeywords = kwLine ? kwLine.split(",").map((k) => k.trim()).filter(Boolean) : [];

  // Spoken script: everything after the "SPOKEN SCRIPT … :" line, minus any
  // trailing separator rule or BATCH footer.
  let script = "";
  const sm = block.match(/SPOKEN SCRIPT[^\n]*:[ \t]*\n([\s\S]*)$/i);
  if (sm) {
    script = sm[1]
      // drop the ready-to-send API call block, which now sits between the
      // script and the trailing ═ rule in the current digest format
      .replace(/\n[ \t]*──[ \t]*ELEVENLABS API CALL[\s\S]*$/im, "")
      .replace(/\n[═]{3,}[\s\S]*$/m, "") // drop trailing ═ rule + anything after
      .replace(/\n[ \t]*BATCH:[\s\S]*$/m, "")
      .trim();
  }

  return {
    id: `topic-${rank}`,
    rank,
    title,
    score,
    why,
    bestPlatform,
    postTiming,
    character,
    persona,
    gender,
    voiceId,
    voiceName,
    model,
    settings,
    tags: spec.tags,
    prosody: spec.prosody,
    voiceDescription: spec.voiceDescription,
    description,
    hashtags,
    thumbnail,
    captions,
    twitterKeywords,
    script,
    raw: block.trim(),
  };
}

export function parseDigest(raw: string): ParsedTopic[] {
  HEADER_RE.lastIndex = 0;
  const heads = [...raw.matchAll(HEADER_RE)].map((m) => ({
    rank: parseInt(m[1], 10),
    title: m[2].trim(),
    score: parseInt(m[3], 10),
    at: m.index ?? 0,
    end: (m.index ?? 0) + m[0].length,
  }));

  return heads.map((h, i) => {
    const blockEnd = i + 1 < heads.length ? heads[i + 1].at : raw.length;
    const block = raw.slice(h.end, blockEnd);
    return parseBlock(h.rank, h.title, h.score, block);
  });
}
