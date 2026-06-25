// Parser for the "PERSONA SHORTS — PRODUCTION DIGEST" daily format.
//
// The digest is highly regular, so this is fully deterministic (no LLM needed
// to read it): topics are delimited by their "#N — Title (score X/100)" header
// lines; each topic carries an ElevenLabs voice-design config, a social block,
// and the verbatim spoken script. Engagement ranking is already provided by the
// source (the score), so correct parsing alone yields the right order.

import { parseVoiceSpec, type VoiceSettings } from "./voices";

export interface ParsedTopic {
  id: string;
  rank: number;
  title: string;
  score: number;
  why?: string;
  bestPlatform?: string;
  postTiming?: string;
  // Voice design
  persona?: string;
  gender?: string;
  voiceId?: string;
  voiceName?: string;
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

  // Voice-design config sub-section (bounded so voice_description doesn't run
  // on into the social block / script).
  const configText = slice(block, "VOICE-DESIGN CONFIG", "── SOCIAL");
  const spec = parseVoiceSpec(configText);
  const persona = firstMatch(configText, /persona:[ \t]*([^\[\|\n]+)/i);
  const gender = firstMatch(configText, /gender:[ \t]*([A-Za-z]+)/i);
  const voiceId = firstMatch(configText, /voice_id:[ \t]*(.+)$/im);
  const voiceName = firstMatch(configText, /voice_name:[ \t]*(.+)$/im);

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
    persona,
    gender,
    voiceId,
    voiceName,
    settings: spec.settings,
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
