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

/**
 * Compute timeline segments for AI scene suggestions.
 *
 * Scenes are matched against the transcript SEQUENTIALLY with a forward-moving
 * cursor: scene N+1 can only anchor at or after scene N. This prevents repeated
 * phrases (e.g. "Strait of Hormuz" said twice) from snapping a scene to the
 * wrong occurrence. Segments are then built contiguously from the matched
 * starts, so overlaps and gaps are structurally impossible.
 */
export function computeSceneTimings(
  suggestions: SceneLike[],
  transcript: TranscriptWord[],
  scriptText: string,
  durationInSeconds: number
): SceneTiming[] {
  if (suggestions.length === 0) return [];

  if (transcript.length > 0) {
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
      if (timings[i].endTime < timings[i].startTime + 0.3) {
        timings[i].endTime = timings[i].startTime + 0.3;
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
