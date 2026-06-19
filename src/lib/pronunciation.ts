// Global pronunciation dictionary — fixes how the TTS voice says specific terms
// (acronyms, names) that rules can't predict. Applied ONLY to the text sent to
// ElevenLabs; the script and captions keep the original spelling.

export interface PronunciationEntry {
  term: string; // as written, e.g. "G7"
  say: string; // how to speak it, e.g. "G seven"
}

// Common finance/news terms TTS tends to mangle. Users can edit/extend this.
export const DEFAULT_PRONUNCIATIONS: PronunciationEntry[] = [
  { term: "G7", say: "G seven" },
  { term: "G20", say: "G twenty" },
  { term: "FISA", say: "Fye-zuh" },
  { term: "FOMC", say: "F O M C" },
  { term: "OPEC", say: "Oh-peck" },
  { term: "NATO", say: "Nay-toe" },
  { term: "ECB", say: "E C B" },
  { term: "GDP", say: "G D P" },
  { term: "CPI", say: "C P I" },
];

const esc = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/**
 * Replace each dictionary term with its spoken form — whole-word and
 * case-insensitive. Longer terms are applied first so "G20" wins over "G2".
 */
export function applyPronunciation(text: string, entries: PronunciationEntry[]): string {
  const sorted = [...entries]
    .filter((e) => e.term.trim() && e.say.trim())
    .sort((a, b) => b.term.trim().length - a.term.trim().length);

  let out = text;
  for (const e of sorted) {
    // (?<!\w) / (?!\w) = whole-word boundaries that also work around digits,
    // so "G7" matches in "the G7 summit" but not inside "G77".
    const re = new RegExp(`(?<!\\w)${esc(e.term.trim())}(?!\\w)`, "gi");
    out = out.replace(re, e.say.trim());
  }
  return out;
}
