// Text normalization applied ONLY to the text sent to the TTS engine —
// the script the user typed is stored and displayed unchanged.
//
// ElevenLabs misreads currency with decimals ("$5.08" → "five dollars
// oh-eight"), so money figures are expanded into unambiguous spoken form.
// Percentages and plain decimals are already read correctly and left alone.

function magnitudeWord(m: string): string {
  switch (m.toLowerCase()) {
    case "k":
    case "thousand":
      return "thousand";
    case "m":
    case "million":
      return "million";
    case "b":
    case "billion":
      return "billion";
    case "t":
    case "trillion":
      return "trillion";
    default:
      return m;
  }
}

export function normalizeMoneyForTTS(text: string): string {
  // 1) Money with a magnitude: "$1.5 billion", "$3B", "$250 million", "$1.2T"
  //    → "1.5 billion dollars" (dollar word moves AFTER the magnitude)
  let out = text.replace(
    /\$([\d,]+(?:\.\d+)?)\s?(thousand|million|billion|trillion|[KMBT])\b/gi,
    (_, num: string, mag: string) => `${num} ${magnitudeWord(mag)} dollars`
  );

  // 2) Dollars and cents: "$5.08" → "5 dollars and 8 cents",
  //    "$0.50" → "50 cents", "$5.00" → "5 dollars".
  //    A single decimal digit is tens of cents ("$5.8" = $5.80 → 80 cents).
  out = out.replace(/\$([\d,]+)\.(\d{1,2})\b/g, (_, dollars: string, dec: string) => {
    const cents = dec.length === 1 ? Number(dec) * 10 : Number(dec);
    const dollarsNum = Number(dollars.replace(/,/g, ""));
    const dollarWord = dollarsNum === 1 ? "dollar" : "dollars";
    const centWord = cents === 1 ? "cent" : "cents";
    if (cents === 0) return `${dollars} ${dollarWord}`;
    if (dollarsNum === 0) return `${cents} ${centWord}`;
    return `${dollars} ${dollarWord} and ${cents} ${centWord}`;
  });

  // 3) Whole-dollar amounts: "$150" → "150 dollars", "$1" → "1 dollar"
  out = out.replace(/\$([\d,]+)\b/g, (_, dollars: string) => {
    const dollarsNum = Number(dollars.replace(/,/g, ""));
    return `${dollars} ${dollarsNum === 1 ? "dollar" : "dollars"}`;
  });

  return out;
}

// ── Integer spelling ──

const ONES = [
  "zero", "one", "two", "three", "four", "five", "six", "seven", "eight", "nine",
  "ten", "eleven", "twelve", "thirteen", "fourteen", "fifteen", "sixteen",
  "seventeen", "eighteen", "nineteen",
];
const TENS = ["", "", "twenty", "thirty", "forty", "fifty", "sixty", "seventy", "eighty", "ninety"];
const SCALES = ["", " thousand", " million", " billion", " trillion"];

function subHundred(n: number): string {
  if (n < 20) return ONES[n];
  return TENS[Math.floor(n / 10)] + (n % 10 ? `-${ONES[n % 10]}` : "");
}

function threeDigits(n: number): string {
  const hundreds = Math.floor(n / 100);
  const rest = n % 100;
  if (!hundreds) return subHundred(rest);
  return `${ONES[hundreds]} hundred${rest ? ` and ${subHundred(rest)}` : ""}`;
}

export function numberToWords(n: number): string {
  if (n === 0) return "zero";
  if (!Number.isInteger(n) || n < 0 || n >= 1e15) return String(n);
  const groups: [number, number][] = [];
  let scale = 0;
  let rest = n;
  while (rest > 0) {
    groups.push([rest % 1000, scale]);
    rest = Math.floor(rest / 1000);
    scale++;
  }
  return groups
    .reverse()
    .filter(([g]) => g > 0)
    .map(([g, s]) => threeDigits(g) + SCALES[s])
    .join(" ");
}

/**
 * Spell out standalone integers ("102" → "one hundred and two") so the voice
 * reads them naturally. Left untouched: decimals ("3.24"), percentages
 * ("8%"), and bare 4-digit years (1900–2099) — TTS already reads those well.
 */
export function spellIntegersForTTS(text: string): string {
  return text.replace(
    /(?<![\d.,])(\d{1,3}(?:,\d{3})+|\d+)(?!\d|,\d|\.\d|%)/g,
    (match: string) => {
      const n = Number(match.replace(/,/g, ""));
      if (!Number.isInteger(n) || n >= 1e15) return match;
      // Bare 4-digit years read naturally as digits ("2026" → "twenty twenty-six")
      if (!match.includes(",") && match.length === 4 && n >= 1900 && n <= 2099) return match;
      return numberToWords(n);
    }
  );
}

/** Ranges like "2-3 days" — TTS reads the hyphen as "minus"; say "to" instead. */
export function expandRangesForTTS(text: string): string {
  return text.replace(/\b(\d{1,3})-(\d{1,3})\b/g, "$1 to $2");
}

/**
 * Large/whole-number percentages ("2,215%", "300%") read badly — the comma and
 * "%" trip the voice up. Spell the number and say "percent". Decimal
 * percentages ("3.24%") are left as digits — those already read fine.
 */
export function spellPercentagesForTTS(text: string): string {
  return text.replace(/(?<![\d.,])(\d{1,3}(?:,\d{3})+|\d+)%/g, (m, num: string) => {
    const n = Number(num.replace(/,/g, ""));
    if (!Number.isInteger(n) || n >= 1e15) return m;
    return `${numberToWords(n)} percent`;
  });
}

/** Full TTS text pipeline: money → ranges → percentages → spelled-out integers. */
export function normalizeForTTS(text: string): string {
  return spellIntegersForTTS(spellPercentagesForTTS(expandRangesForTTS(normalizeMoneyForTTS(text))));
}
