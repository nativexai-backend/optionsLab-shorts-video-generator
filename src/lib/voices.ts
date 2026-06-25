/**
 * Avatar-to-ElevenLabs voice mapping.
 * Replace placeholder voice IDs with real ones from your ElevenLabs dashboard.
 * https://elevenlabs.io/app/voice-library
 */

export const AVATAR_VOICE_MAP: Record<string, string> = {
  // TL voices designed via text-to-voice in ElevenLabs. These three are the
  // characters used by the triage flow (gender → Claire/Nathan/Ethan).
  claire: "kKAaQzEMVeLLLPOrH5EV", // TL Claire
  ethan: "NkNxTZ6iN8l9f3S6I6uU",  // TL Ethan
  nathan: "5K2ColvqEHBgiuNuMseh", // TL Nathan
  // Older custom voices (not part of the TL design set; unused by triage).
  daniel: "7ZR2iJm4VSCFebusrLi8",
  malik: "LP5b3qayq4ueDLxlkIYa",
  lucas: "Mf2qODiujEJgrMxuo4OO",
};

export const TTS_MODEL_ID = "eleven_multilingual_v2";
// Eleven v3 (alpha) — understands inline [audio tags] like [warm], [curious],
// [laughs]. More expressive but non-deterministic and may require account
// access. Used only when a take opts into expressive mode.
export const TTS_MODEL_ID_V3 = "eleven_v3";
// v3 caps text shorter than v2; keep generations under this to avoid API errors.
export const V3_CHAR_LIMIT = 3000;

// The four ElevenLabs voice_settings knobs. These steer *delivery* without
// changing the voice itself:
//   stability       — lower = more emotional range/variation, higher = steadier
//   similarity_boost — how closely to cling to the original voice timbre
//   style           — exaggerates the voice's characterful delivery
//   speed           — 1.0 = natural; <1 slower/measured, >1 faster
export interface VoiceSettings {
  stability: number;
  similarity_boost: number;
  style: number;
  speed: number;
  use_speaker_boost: boolean; // boosts presence/clarity of the original speaker
}

export type DeliveryPreset = "anchor" | "default" | "measured" | "warm" | "energetic" | "custom";

// Named starting points. "custom" is not listed here — it means the user has
// hand-tuned the sliders, so we keep whatever settings they landed on.
// "anchor" matches the brisk, warm, confident financial-news-anchor target.
export const DELIVERY_PRESETS: Record<Exclude<DeliveryPreset, "custom">, VoiceSettings> = {
  anchor: { stability: 0.5, similarity_boost: 0.78, style: 0.25, speed: 1.0, use_speaker_boost: true },
  default: { stability: 0.5, similarity_boost: 0.75, style: 0.3, speed: 1.0, use_speaker_boost: true },
  measured: { stability: 0.65, similarity_boost: 0.75, style: 0.25, speed: 0.95, use_speaker_boost: true },
  warm: { stability: 0.4, similarity_boost: 0.8, style: 0.45, speed: 0.98, use_speaker_boost: true },
  energetic: { stability: 0.3, similarity_boost: 0.75, style: 0.6, speed: 1.05, use_speaker_boost: true },
};

export interface VoiceDelivery {
  preset: DeliveryPreset;
  settings: VoiceSettings; // the resolved settings actually sent to ElevenLabs
  // A pinned ElevenLabs voice id that overrides the avatar→voice map for this
  // project. Set by triage intake so a digest-assigned voice is reproduced
  // exactly (1:1 with the digest's ready-to-send API call), regardless of which
  // avatar face is shown. Empty/undefined falls back to AVATAR_VOICE_MAP.
  voiceId?: string;
  useV3?: boolean; // opt into Eleven v3 expressive mode ([audio tags])
  // Populated by pasting a per-script voice spec (see parseVoiceSpec):
  tags?: string[]; // suggested audio tags — drives the v3 insert palette
  prosody?: string; // reference note (no API field exists for it)
  voiceDescription?: string; // reference note
  specRaw?: string; // the verbatim pasted spec, so it can be re-copied/edited
}

export const DEFAULT_DELIVERY: VoiceDelivery = {
  preset: "anchor",
  settings: { ...DELIVERY_PRESETS.anchor },
  useV3: false,
};

// v3 only accepts discrete stability values (Creative/Natural/Robust). Snap any
// fine-tuned value to the nearest so the API doesn't reject it.
export function snapV3Stability(v: number): number {
  const allowed = [0, 0.5, 1];
  return allowed.reduce((best, x) => (Math.abs(x - v) < Math.abs(best - v) ? x : best), 0.5);
}

// Common delivery tags for the v3 expressive palette (fallback when a pasted
// spec doesn't supply its own suggested_audio_tags).
export const V3_AUDIO_TAGS = [
  "warm", "measured", "curious", "excited", "thoughtful", "serious", "laughs", "sighs",
] as const;

export interface ParsedVoiceSpec {
  settings?: VoiceSettings;
  tags?: string[];
  prosody?: string;
  voiceDescription?: string;
}

// Parse the per-script voice spec the team pastes in, e.g.:
//   voice_settings: {"stability": 0.5, "similarity_boost": 0.78, ...}
//   suggested_audio_tags: conversational, brisk, warm, confident
//   prosody: emotion=... | emphasis=... | pacing=...
//   voice_description: A male American financial-news anchor voice...
// Tolerant of quoting style, extra whitespace, and wrapped multi-line values.
export function parseVoiceSpec(raw: string): ParsedVoiceSpec {
  const KEYS = ["voice_settings", "suggested_audio_tags", "prosody", "voice_description"];
  const sectionOf = (key: string): string | undefined => {
    const re = new RegExp(`${key}\\s*[:=]\\s*([\\s\\S]*?)(?=\\n\\s*(?:${KEYS.join("|")})\\s*[:=]|$)`, "i");
    const m = raw.match(re);
    return m ? m[1].trim() : undefined;
  };

  const out: ParsedVoiceSpec = {};

  const vsRaw = sectionOf("voice_settings");
  if (vsRaw) {
    const obj = vsRaw.match(/\{[\s\S]*?\}/);
    if (obj) {
      try {
        const parsed = JSON.parse(obj[0]) as Partial<VoiceSettings>;
        out.settings = sanitizeVoiceSettings(parsed);
      } catch {
        // leave settings undefined if the JSON is malformed
      }
    }
  }

  const tagsRaw = sectionOf("suggested_audio_tags");
  if (tagsRaw) {
    const tags = tagsRaw
      .replace(/[[\]]/g, "")
      .split(/[,\n]/)
      .map((t) => t.trim().toLowerCase())
      .filter(Boolean);
    if (tags.length) out.tags = Array.from(new Set(tags));
  }

  const prosody = sectionOf("prosody");
  if (prosody) out.prosody = prosody;

  const desc = sectionOf("voice_description");
  if (desc) out.voiceDescription = desc;

  return out;
}

// Back-compat default used by the per-avatar voice preview sample.
export const TTS_VOICE_SETTINGS: VoiceSettings = DELIVERY_PRESETS.default;

// Clamp incoming settings to ElevenLabs' valid ranges so a bad client payload
// can't produce an API error or a broken read.
export function sanitizeVoiceSettings(s: Partial<VoiceSettings> | undefined): VoiceSettings {
  const base = DELIVERY_PRESETS.default;
  const clamp = (v: unknown, lo: number, hi: number, fallback: number) =>
    typeof v === "number" && Number.isFinite(v) ? Math.min(hi, Math.max(lo, v)) : fallback;
  return {
    stability: clamp(s?.stability, 0, 1, base.stability),
    similarity_boost: clamp(s?.similarity_boost, 0, 1, base.similarity_boost),
    style: clamp(s?.style, 0, 1, base.style),
    speed: clamp(s?.speed, 0.7, 1.2, base.speed),
    use_speaker_boost:
      typeof s?.use_speaker_boost === "boolean" ? s.use_speaker_boost : base.use_speaker_boost,
  };
}
