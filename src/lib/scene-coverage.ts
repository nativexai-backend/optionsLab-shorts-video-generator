// ── Scene coverage validation ──
//
// LLMs (Groq's llama in particular) sometimes return short quoted excerpts as
// scriptSegments instead of a full partition of the script, despite the prompt
// requiring gap-free coverage. The timeline builds scenes contiguously from
// each segment's match position, so every uncovered stretch of narration gets
// absorbed into the preceding scene — the first blocks balloon while the rest
// cram together at the end. This check lets the API reject such a response and
// retry or fall back instead of shipping a lopsided timeline.

interface SegmentLike {
  scriptSegment: string;
}

export interface CoverageReport {
  ok: boolean;
  coverage: number; // fraction of script words quoted by the segments (0..1)
  maxGap: number; // longest run of script words absorbed into the wrong scene
}

// Mirrors the normalization in scene-timing.ts so this predicts exactly what
// the timeline matcher will see.
const normWords = (s: string) =>
  s
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter(Boolean);

// 25 words ≈ 10 seconds of narration shown under a visual meant for a
// different beat — past that the timeline is visibly wrong.
const MAX_GAP_WORDS = 25;
const MIN_COVERAGE = 0.75;

/**
 * Match each segment against the script with the same forward-cursor strategy
 * the timeline uses, then measure how much of the script the segments actually
 * quote and the largest gap between consecutive segments.
 */
export function checkSceneCoverage(
  scenes: SegmentLike[],
  scriptText: string,
): CoverageReport {
  const sw = normWords(scriptText);
  if (sw.length === 0 || scenes.length === 0) {
    return { ok: false, coverage: 0, maxGap: sw.length };
  }

  const findForward = (lead: string[], from: number): number => {
    for (let i = from; i <= sw.length - lead.length; i++) {
      let match = true;
      for (let j = 0; j < lead.length; j++) {
        if (sw[i + j] !== lead[j]) {
          match = false;
          break;
        }
      }
      if (match) return i;
    }
    return -1;
  };

  let cursor = 0;
  let covered = 0;
  let maxGap = 0;
  let prevEnd = 0;

  for (const s of scenes) {
    const seg = normWords(s.scriptSegment);
    let idx = -1;
    for (const leadLen of [3, 2]) {
      if (seg.length < leadLen) continue;
      idx = findForward(seg.slice(0, leadLen), cursor);
      if (idx !== -1) break;
    }
    // Same fallback the timeline matcher applies on a miss
    if (idx === -1) idx = cursor;

    maxGap = Math.max(maxGap, idx - prevEnd);
    covered += seg.length;
    prevEnd = Math.max(prevEnd, idx + seg.length);
    cursor = Math.min(
      idx + Math.max(1, Math.floor(seg.length * 0.7)),
      sw.length - 1,
    );
  }
  // Tail the last scene doesn't reach still displays under that scene's visual
  maxGap = Math.max(maxGap, sw.length - prevEnd);

  const coverage = Math.min(1, covered / sw.length);
  return {
    ok: coverage >= MIN_COVERAGE && maxGap <= MAX_GAP_WORDS,
    coverage,
    maxGap,
  };
}
