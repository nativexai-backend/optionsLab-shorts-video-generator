import type { TranscriptWord } from "../remotion/types";

export interface SceneTiming {
  startTime: number;
  endTime: number;
}

interface SceneLike {
  scriptSegment: string;
  wordRange: [number, number];
}

const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9\s]/g, "").trim();

// ── Transcript matching (shared by timing + pacing) ──

/**
 * For each suggestion, find the transcript word index where it starts, using a
 * forward-only cursor so repeated phrases (e.g. "Strait of Hormuz" said twice)
 * can't snap a later scene to an earlier occurrence.
 */
function matchStartIndices(suggestions: SceneLike[], transcript: TranscriptWord[]): number[] {
  const tn = transcript.map((w) => norm(w.word));

  const findForward = (lead: string[], from: number): number => {
    if (lead.length === 0) return -1;
    for (let i = from; i <= tn.length - lead.length; i++) {
      let match = true;
      for (let j = 0; j < lead.length; j++) {
        if (tn[i + j] !== lead[j]) {
          match = false;
          break;
        }
      }
      if (match) return i;
    }
    return -1;
  };

  let cursor = 0;
  const startIndices: number[] = [];

  for (const s of suggestions) {
    const segWords = norm(s.scriptSegment).split(/\s+/).filter(Boolean);

    // Try progressively shorter leads — TTS transcription can differ
    // slightly from the script (numbers, contractions).
    let idx = -1;
    for (const leadLen of [3, 2]) {
      if (segWords.length < leadLen) continue;
      idx = findForward(segWords.slice(0, leadLen), cursor);
      if (idx !== -1) break;
    }
    // No match — continue right where the previous scene's words ran out
    if (idx === -1) idx = Math.min(cursor, transcript.length - 1);

    startIndices.push(idx);

    // Advance conservatively (70% of the segment's words): undershooting is
    // safe because the next search still scans forward; overshooting could
    // skip past the next scene's opening words.
    cursor = Math.min(
      idx + Math.max(1, Math.floor(segWords.length * 0.7)),
      transcript.length - 1
    );
  }

  return startIndices;
}

/**
 * Compute timeline segments for AI scene suggestions.
 *
 * Scenes are matched against the transcript SEQUENTIALLY, then segments are
 * built contiguously from the matched starts, so overlaps and gaps are
 * structurally impossible.
 */
export function computeSceneTimings(
  suggestions: SceneLike[],
  transcript: TranscriptWord[],
  scriptText: string,
  durationInSeconds: number
): SceneTiming[] {
  if (suggestions.length === 0) return [];

  if (transcript.length > 0) {
    const startIndices = matchStartIndices(suggestions, transcript);

    // Contiguous segments: each scene runs until the next one starts;
    // the last runs to the end of speech.
    const timings: SceneTiming[] = startIndices.map((startIdx, i) => ({
      startTime: transcript[Math.min(startIdx, transcript.length - 1)].start,
      endTime:
        i < startIndices.length - 1
          ? transcript[Math.min(startIndices[i + 1], transcript.length - 1)].start
          : transcript[transcript.length - 1].end,
    }));

    // Safety pass: strict ordering + a minimum visible width
    for (let i = 0; i < timings.length; i++) {
      if (i > 0 && timings[i].startTime < timings[i - 1].endTime) {
        timings[i].startTime = timings[i - 1].endTime;
      }
      if (timings[i].endTime < timings[i].startTime + 0.5) {
        timings[i].endTime = timings[i].startTime + 0.5;
      }
    }
    return timings;
  }

  // No transcript yet: distribute by the LLM's word ranges
  const totalWords = scriptText.split(/\s+/).filter(Boolean).length;
  if (totalWords > 0) {
    const wordDur = durationInSeconds / totalWords;
    return suggestions.map((s) => ({
      startTime: s.wordRange[0] * wordDur,
      endTime: (s.wordRange[1] + 1) * wordDur,
    }));
  }

  const evenDur = durationInSeconds / suggestions.length;
  return suggestions.map((_, i) => ({
    startTime: i * evenDur,
    endTime: (i + 1) * evenDur,
  }));
}

// ── Pace-aware segmentation ──
//
// The LLM decides WHAT each beat is about; this code decides HOW LONG / HOW
// MANY shots, because LLMs are unreliable at duration math. Long beats get
// split into evenly-paced sub-shots at natural word/sentence boundaries.

export interface PaceOptions {
  targetShot: number; // ideal seconds per shot
  maxShot: number; // split any beat longer than this
  minShot: number; // never create a part shorter than this
}

export type PaceName = "chill" | "normal" | "fast";

export const PACE_PRESETS: Record<PaceName, PaceOptions> = {
  chill: { targetShot: 5.5, maxShot: 8, minShot: 2 },
  normal: { targetShot: 4, maxShot: 6, minShot: 1.5 },
  fast: { targetShot: 2.8, maxShot: 4, minShot: 1.2 },
};

export const PACE_OPTIONS: { value: PaceName; label: string }[] = [
  { value: "chill", label: "Chill" },
  { value: "normal", label: "Normal" },
  { value: "fast", label: "Fast" },
];

/** Estimate each beat's on-screen duration (real, from the transcript if present). */
function estimateDurations(
  suggestions: SceneLike[],
  transcript: TranscriptWord[],
  durationInSeconds: number
): number[] {
  if (transcript.length > 0) {
    const starts = matchStartIndices(suggestions, transcript);
    return starts.map((startIdx, i) => {
      const s = transcript[Math.min(startIdx, transcript.length - 1)].start;
      const e =
        i < starts.length - 1
          ? transcript[Math.min(starts[i + 1], transcript.length - 1)].start
          : transcript[transcript.length - 1].end;
      return Math.max(0, e - s);
    });
  }
  // No transcript: estimate proportionally by word count
  const counts = suggestions.map(
    (s) => norm(s.scriptSegment).split(/\s+/).filter(Boolean).length
  );
  const total = counts.reduce((a, b) => a + b, 0) || 1;
  return counts.map((c) => (c / total) * durationInSeconds);
}

/**
 * Split a chunk of text into `n` parts at word boundaries, snapping each cut to
 * the nearest sentence/clause punctuation so visuals change on natural beats.
 */
export function splitTextIntoParts(text: string, n: number): string[] {
  const words = text.trim().split(/\s+/).filter(Boolean);
  if (n <= 1 || words.length <= 1) return [text.trim()];
  const parts = Math.min(n, words.length);
  const target = words.length / parts;

  const result: string[] = [];
  let start = 0;
  for (let p = 0; p < parts; p++) {
    if (p === parts - 1) {
      result.push(words.slice(start).join(" "));
      break;
    }
    const ideal = Math.round((p + 1) * target);
    // Keep room for the remaining parts (at least one word each)
    const minCut = start + 1;
    const maxCut = words.length - (parts - 1 - p);
    let cut = Math.max(minCut, Math.min(ideal, maxCut));

    // Snap to a nearby boundary: sentence-ending first, then clause
    const window = 2;
    const snap = (re: RegExp): number | null => {
      for (let d = 0; d <= window; d++) {
        for (const c of [cut + d, cut - d]) {
          if (c >= minCut && c <= maxCut && re.test(words[c - 1])) return c;
        }
      }
      return null;
    };
    cut = snap(/[.!?]$/) ?? snap(/[,;:]$/) ?? cut;

    result.push(words.slice(start, cut).join(" "));
    start = cut;
  }
  return result.filter(Boolean);
}

export interface PacedPart<T> {
  source: T;
  scriptSegment: string;
  wordRange: [number, number];
  part: number; // 1-based index within the parent beat
  partCount: number; // total parts the parent beat was split into
}

/**
 * Expand a shot list to hit the target pace: each beat that runs longer than
 * `maxShot` is split into evenly-sized sub-shots, each carrying a real slice of
 * the script text so it still timestamp-matches accurately at apply time.
 * Beats short enough already pass through untouched (partCount === 1).
 */
export function paceSuggestions<T extends SceneLike>(
  suggestions: T[],
  transcript: TranscriptWord[],
  durationInSeconds: number,
  opts: PaceOptions
): PacedPart<T>[] {
  const durations = estimateDurations(suggestions, transcript, durationInSeconds);
  const out: PacedPart<T>[] = [];

  suggestions.forEach((s, i) => {
    const dur = durations[i];
    const wordCount = norm(s.scriptSegment).split(/\s+/).filter(Boolean).length;

    let k = 1;
    if (dur > opts.maxShot && wordCount > 1) {
      k = Math.max(2, Math.round(dur / opts.targetShot));
      const maxByMin = Math.max(1, Math.floor(dur / opts.minShot));
      k = Math.min(k, maxByMin, wordCount);
    }

    if (k <= 1) {
      out.push({ source: s, scriptSegment: s.scriptSegment, wordRange: s.wordRange, part: 1, partCount: 1 });
      return;
    }

    const textParts = splitTextIntoParts(s.scriptSegment, k);
    const [w0, w1] = s.wordRange;
    const span = Math.max(1, w1 - w0 + 1);
    const count = textParts.length;
    textParts.forEach((tp, p) => {
      const r0 = w0 + Math.floor((p * span) / count);
      const r1 = w0 + Math.floor(((p + 1) * span) / count) - 1;
      out.push({
        source: s,
        scriptSegment: tp,
        wordRange: [r0, Math.max(r0, r1)],
        part: p + 1,
        partCount: count,
      });
    });
  });

  return out;
}
