import type { TranscriptWord } from "../remotion/types";

// Merge Whisper tokens that should be one word: "$" + "4" + "." + "32" → "$4.32", "6" + "%" → "6%"
export function postProcessTranscript(words: TranscriptWord[]): TranscriptWord[] {
  const result: TranscriptWord[] = [];
  let i = 0;
  while (i < words.length) {
    const w = words[i];
    const next = words[i + 1];
    const prev = result[result.length - 1];
    const trimmed = w.word.trim();

    // "$" followed by a number → merge into "$X"
    if (next && /^\$$/i.test(trimmed)) {
      result.push({ word: `$${next.word.trim()}`, start: w.start, end: next.end });
      i += 2;
      continue;
    }

    // Decimal/comma fragment: ".85" or ",000" → attach to previous number
    // (must run before "%" lookahead so "4" + ".72" + "%" → "4.72" first, then "%" attaches)
    if (prev && /^[.,]\d+/.test(trimmed) && /\d$/.test(prev.word)) {
      prev.word = `${prev.word}${trimmed}`;
      prev.end = w.end;
      i++;
      continue;
    }

    // Lonely "." or "," between numbers: number + "." + number → merge all three
    if ((trimmed === "." || trimmed === ",") && prev && /\d$/.test(prev.word) && next && /^\d/.test(next.word.trim())) {
      prev.word = `${prev.word}${trimmed}${next.word.trim()}`;
      prev.end = next.end;
      i += 2;
      continue;
    }

    // Number ending with "." or "," followed by more digits → merge
    if (prev && /\d[.,]$/.test(prev.word) && /^\d/.test(trimmed)) {
      prev.word = `${prev.word}${trimmed}`;
      prev.end = w.end;
      i++;
      continue;
    }

    // number followed by "%" → merge into "X%"
    if (next && next.word.trim() === "%") {
      result.push({ word: `${trimmed}%`, start: w.start, end: next.end });
      i += 2;
      continue;
    }

    // Lonely "%" that should attach to previous number
    if (prev && trimmed === "%" && /\d$/.test(prev.word)) {
      prev.word = `${prev.word}%`;
      prev.end = w.end;
      i++;
      continue;
    }

    // Lonely "$" that should attach to next number
    if (prev && prev.word.trim() === "$" && /^\d/.test(trimmed)) {
      prev.word = `$${trimmed}`;
      prev.end = w.end;
      i++;
      continue;
    }

    // Number that should attach to previous "$" token
    if (prev && prev.word === "$" && /^\d/.test(trimmed)) {
      prev.word = `$${trimmed}`;
      prev.end = w.end;
      i++;
      continue;
    }

    // Hyphen fragment: "-market", "-end", "-term" → attach to previous word ("pre" + "-market" → "pre-market")
    if (prev && /^-/.test(trimmed)) {
      prev.word = `${prev.word}${trimmed}`;
      prev.end = w.end;
      i++;
      continue;
    }

    // Trailing hyphen: "pre-" followed by next word → merge ("pre-" + "market" → "pre-market")
    if (prev && /-$/.test(prev.word) && /^[a-zA-Z]/.test(trimmed)) {
      prev.word = `${prev.word}${trimmed}`;
      prev.end = w.end;
      i++;
      continue;
    }

    result.push({ ...w, word: trimmed });
    i++;
  }
  return result;
}

/**
 * Re-align edited caption text against the original timed words.
 * 1:1 word counts keep original timing exactly; otherwise a greedy
 * text-match consumes original words per new word (handles merges like
 * "$" + "4.32" → "$4.32"), falling back to proportional distribution.
 * Returns [] when the edited text is empty.
 */
export function realignWords(editText: string, oldWords: TranscriptWord[]): TranscriptWord[] {
  const newWords = editText.split(/\s+/).filter(Boolean);

  if (newWords.length === 0) return [];

  const result: TranscriptWord[] = [];

  if (newWords.length === oldWords.length) {
    // 1:1 — just replace the text, keep all original timing
    for (let i = 0; i < newWords.length; i++) {
      result.push({ word: newWords[i], start: oldWords[i].start, end: oldWords[i].end });
    }
    return result;
  }

  // Greedy alignment: walk both arrays, consume original words
  // to match each new word. This handles merges (e.g. "$"+"4.32" → "$4.32")
  // and splits properly by preserving original start/end boundaries.
  let oi = 0; // original index

  for (let ni = 0; ni < newWords.length; ni++) {
    if (oi >= oldWords.length) {
      // More new words than original — give remaining words the last timestamp
      const last = oldWords[oldWords.length - 1];
      result.push({ word: newWords[ni], start: last.start, end: last.end });
      continue;
    }

    const newWord = newWords[ni];

    // Try greedy text matching: consume original words whose
    // concatenated text builds toward the new word (handles merges)
    let consumed = oldWords[oi].word;
    let endIdx = oi;

    // Strip punctuation/spaces for comparison
    const normalize = (s: string) => s.replace(/[^a-zA-Z0-9.$%]/g, "").toLowerCase();

    while (
      endIdx + 1 < oldWords.length &&
      normalize(consumed) !== normalize(newWord) &&
      normalize(consumed).length < normalize(newWord).length
    ) {
      endIdx++;
      consumed += oldWords[endIdx].word;
    }

    // If greedy match consumed multiple originals, use their time span
    if (normalize(consumed) === normalize(newWord) || endIdx > oi) {
      result.push({
        word: newWord,
        start: oldWords[oi].start,
        end: oldWords[endIdx].end,
      });
      oi = endIdx + 1;
    } else {
      // No merge detected — proportional fallback for this word
      // Estimate how many original words this new word maps to
      const remainingNew = newWords.length - ni;
      const remainingOld = oldWords.length - oi;
      const take = Math.max(1, Math.round(remainingOld / remainingNew));
      const sliceEnd = Math.min(oi + take, oldWords.length) - 1;

      result.push({
        word: newWord,
        start: oldWords[oi].start,
        end: oldWords[sliceEnd].end,
      });
      oi = sliceEnd + 1;
    }
  }

  return result;
}
