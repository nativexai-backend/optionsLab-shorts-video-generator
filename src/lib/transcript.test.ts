import { describe, it, expect } from "vitest";
import { postProcessTranscript, realignWords } from "./transcript";
import type { TranscriptWord } from "../remotion/types";

function w(word: string, start: number, end: number): TranscriptWord {
  return { word, start, end };
}

describe("postProcessTranscript", () => {
  it("merges $ + number into one token", () => {
    const result = postProcessTranscript([w("$", 0, 0.1), w("4.32", 0.1, 0.5)]);
    expect(result).toEqual([w("$4.32", 0, 0.5)]);
  });

  it("merges number + % into one token", () => {
    const result = postProcessTranscript([w("6", 0, 0.2), w("%", 0.2, 0.3)]);
    expect(result).toEqual([w("6%", 0, 0.3)]);
  });

  it("attaches decimal fragments to the previous number", () => {
    const result = postProcessTranscript([w("4", 0, 0.2), w(".72", 0.2, 0.4)]);
    expect(result).toEqual([w("4.72", 0, 0.4)]);
  });

  it("handles number + decimal fragment + % chains", () => {
    const result = postProcessTranscript([w("4", 0, 0.2), w(".72", 0.2, 0.4), w("%", 0.4, 0.5)]);
    expect(result).toEqual([w("4.72%", 0, 0.5)]);
  });

  it("merges a lonely separator between numbers", () => {
    const result = postProcessTranscript([w("1", 0, 0.1), w(",", 0.1, 0.2), w("000", 0.2, 0.4)]);
    expect(result).toEqual([w("1,000", 0, 0.4)]);
  });

  it("joins hyphen fragments to the previous word", () => {
    const result = postProcessTranscript([w("pre", 0, 0.2), w("-market", 0.2, 0.6)]);
    expect(result).toEqual([w("pre-market", 0, 0.6)]);
  });

  it("joins a trailing-hyphen word with the next word", () => {
    const result = postProcessTranscript([w("pre-", 0, 0.2), w("market", 0.2, 0.6)]);
    expect(result).toEqual([w("pre-market", 0, 0.6)]);
  });

  it("leaves normal words untouched and trims whitespace", () => {
    const result = postProcessTranscript([w(" Tesla ", 0, 0.4), w("stock", 0.4, 0.8)]);
    expect(result).toEqual([w("Tesla", 0, 0.4), w("stock", 0.4, 0.8)]);
  });
});

describe("realignWords", () => {
  const original = [w("Tesla", 0, 0.4), w("stock", 0.4, 0.8), w("surged", 0.8, 1.3), w("today", 1.3, 1.8)];

  it("returns [] for empty text", () => {
    expect(realignWords("   ", original)).toEqual([]);
  });

  it("keeps exact timing on 1:1 word replacement", () => {
    const result = realignWords("TSLA shares jumped yesterday", original);
    expect(result).toEqual([
      w("TSLA", 0, 0.4),
      w("shares", 0.4, 0.8),
      w("jumped", 0.8, 1.3),
      w("yesterday", 1.3, 1.8),
    ]);
  });

  it("spans timings when words are merged in the edit", () => {
    const old = [w("$", 0, 0.1), w("4.32", 0.1, 0.5), w("up", 0.5, 0.8)];
    const result = realignWords("$4.32 up", old);
    expect(result).toEqual([w("$4.32", 0, 0.5), w("up", 0.5, 0.8)]);
  });

  it("gives extra trailing words the last timestamp", () => {
    const old = [w("hello", 0, 0.5)];
    const result = realignWords("hello there friend", old);
    expect(result[0]).toEqual(w("hello", 0, 0.5));
    expect(result[1].start).toBe(0);
    expect(result[1].end).toBe(0.5);
    expect(result).toHaveLength(3);
  });

  it("keeps timings within the spoken range when shrinking word count", () => {
    const result = realignWords("Tesla surged", original);
    expect(result).toHaveLength(2);
    expect(result[0]).toEqual(w("Tesla", 0, 0.4));
    // "surged" spans the consumed originals ("stock" + "surged") — ends when "surged" is spoken
    expect(result[1].end).toBe(1.3);
  });
});
