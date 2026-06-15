import { describe, it, expect } from "vitest";
import {
  computeSceneTimings,
  splitTextIntoParts,
  paceSuggestions,
  PACE_PRESETS,
} from "./scene-timing";
import type { TranscriptWord } from "../remotion/types";

// Build a word-per-0.4s transcript from text
function makeTranscript(text: string): TranscriptWord[] {
  return text
    .split(/\s+/)
    .filter(Boolean)
    .map((word, i) => ({ word, start: i * 0.4, end: (i + 1) * 0.4 }));
}

describe("computeSceneTimings", () => {
  it("does not anchor a scene to a LATER repeat of its closing phrase (Strait of Hormuz bug)", () => {
    // Phrase "Strait of Hormuz" appears twice — scene 1 ends with it,
    // and it reappears much later in scene 3's text.
    const script =
      "An Apache helicopter was shot down near the Strait of Hormuz today. " +
      "Markets reacted violently with oil swinging four percent in minutes. " +
      "Energy officials say Strait of Hormuz traffic is rising very meaningfully now.";
    const transcript = makeTranscript(script);

    const scenes = [
      { scriptSegment: "An Apache helicopter was shot down near the Strait of Hormuz today.", wordRange: [0, 10] as [number, number] },
      { scriptSegment: "Markets reacted violently with oil swinging four percent in minutes.", wordRange: [11, 20] as [number, number] },
      { scriptSegment: "Energy officials say Strait of Hormuz traffic is rising very meaningfully now.", wordRange: [21, 33] as [number, number] },
    ];

    const timings = computeSceneTimings(scenes, transcript, script, transcript.length * 0.4);

    // Scene 1 must end where scene 2 begins (word 11 → 4.4s), NOT at the
    // later "Strait of Hormuz" occurrence (~10s+)
    expect(timings[0].startTime).toBeCloseTo(0);
    expect(timings[0].endTime).toBeCloseTo(timings[1].startTime);
    expect(timings[0].endTime).toBeLessThan(6);

    // Scene 3 anchors at the later occurrence region
    expect(timings[2].startTime).toBeGreaterThan(timings[1].startTime);
  });

  it("produces strictly ordered, non-overlapping, gap-free segments", () => {
    const script = "one two three four five six seven eight nine ten eleven twelve";
    const transcript = makeTranscript(script);
    const scenes = [
      { scriptSegment: "one two three four", wordRange: [0, 3] as [number, number] },
      { scriptSegment: "five six seven eight", wordRange: [4, 7] as [number, number] },
      { scriptSegment: "nine ten eleven twelve", wordRange: [8, 11] as [number, number] },
    ];

    const timings = computeSceneTimings(scenes, transcript, script, transcript.length * 0.4);

    for (let i = 0; i < timings.length; i++) {
      expect(timings[i].endTime).toBeGreaterThan(timings[i].startTime);
      if (i > 0) {
        // Contiguous: no overlap, no gap
        expect(timings[i].startTime).toBeCloseTo(timings[i - 1].endTime);
      }
    }
    // Full coverage of the speech
    expect(timings[0].startTime).toBeCloseTo(0);
    expect(timings[timings.length - 1].endTime).toBeCloseTo(transcript[transcript.length - 1].end);
  });

  it("recovers when a scene's words don't match the transcript (TTS divergence)", () => {
    const script = "alpha beta gamma delta epsilon zeta eta theta";
    const transcript = makeTranscript(script);
    const scenes = [
      { scriptSegment: "alpha beta gamma delta", wordRange: [0, 3] as [number, number] },
      // LLM paraphrased — none of these words exist in the transcript
      { scriptSegment: "completely different words here", wordRange: [4, 5] as [number, number] },
      { scriptSegment: "eta theta", wordRange: [6, 7] as [number, number] },
    ];

    const timings = computeSceneTimings(scenes, transcript, script, transcript.length * 0.4);

    // Still ordered and non-overlapping despite the failed match
    for (let i = 1; i < timings.length; i++) {
      expect(timings[i].startTime).toBeGreaterThanOrEqual(timings[i - 1].endTime - 0.001);
    }
    // Scene 3 still found its real anchor ("eta theta" = words 6-7)
    expect(timings[2].startTime).toBeCloseTo(6 * 0.4);
  });

  it("falls back to word-range distribution without a transcript", () => {
    const script = "one two three four five six seven eight";
    const timings = computeSceneTimings(
      [
        { scriptSegment: "one two three four", wordRange: [0, 3] },
        { scriptSegment: "five six seven eight", wordRange: [4, 7] },
      ],
      [],
      script,
      8
    );
    expect(timings[0]).toEqual({ startTime: 0, endTime: 4 });
    expect(timings[1]).toEqual({ startTime: 4, endTime: 8 });
  });
});

describe("splitTextIntoParts", () => {
  it("returns the whole text when not splitting", () => {
    expect(splitTextIntoParts("hello there world", 1)).toEqual(["hello there world"]);
  });

  it("splits into n non-empty parts covering all words in order", () => {
    const parts = splitTextIntoParts("one two three four five six", 3);
    expect(parts).toHaveLength(3);
    expect(parts.join(" ")).toBe("one two three four five six");
  });

  it("snaps cuts to sentence boundaries", () => {
    // Ideal even cut would land mid-sentence; the period should pull it.
    const parts = splitTextIntoParts("the market fell hard. then it bounced back fast", 2);
    expect(parts[0]).toBe("the market fell hard.");
    expect(parts[1]).toBe("then it bounced back fast");
  });

  it("never creates more parts than words", () => {
    expect(splitTextIntoParts("just two", 5)).toEqual(["just", "two"]);
  });
});

describe("paceSuggestions", () => {
  // 30 words at 0.4s each = 12s of speech in one beat
  const longScript = Array.from({ length: 30 }, (_, i) => `w${i}`).join(" ");
  const longTranscript = makeTranscript(longScript);

  it("leaves a short beat untouched", () => {
    const short = makeTranscript("one two three four"); // 1.6s
    const result = paceSuggestions(
      [{ scriptSegment: "one two three four", wordRange: [0, 3] as [number, number] }],
      short,
      1.6,
      PACE_PRESETS.normal
    );
    expect(result).toHaveLength(1);
    expect(result[0].partCount).toBe(1);
  });

  it("splits a long beat into evenly-paced sub-shots", () => {
    const result = paceSuggestions(
      [{ scriptSegment: longScript, wordRange: [0, 29] as [number, number] }],
      longTranscript,
      12,
      PACE_PRESETS.normal // target 4s → ~3 shots for 12s
    );
    expect(result.length).toBeGreaterThanOrEqual(2);
    // All sub-shots reference the same source beat and are numbered
    expect(result.every((r) => r.partCount === result.length)).toBe(true);
    expect(result.map((r) => r.part)).toEqual(result.map((_, i) => i + 1));
    // Word ranges stay within the parent and in order
    expect(result[0].wordRange[0]).toBe(0);
    expect(result[result.length - 1].wordRange[1]).toBe(29);
  });

  it("splits more aggressively on a faster pace", () => {
    const normal = paceSuggestions(
      [{ scriptSegment: longScript, wordRange: [0, 29] as [number, number] }],
      longTranscript,
      12,
      PACE_PRESETS.normal
    );
    const fast = paceSuggestions(
      [{ scriptSegment: longScript, wordRange: [0, 29] as [number, number] }],
      longTranscript,
      12,
      PACE_PRESETS.fast
    );
    expect(fast.length).toBeGreaterThan(normal.length);
  });

  it("keeps each sub-shot at or above the minimum shot length", () => {
    const result = paceSuggestions(
      [{ scriptSegment: longScript, wordRange: [0, 29] as [number, number] }],
      longTranscript,
      12,
      PACE_PRESETS.normal
    );
    // 12s / minShot(1.5) = 8 max parts; we should be well under that
    expect(result.length).toBeLessThanOrEqual(8);
  });
});
