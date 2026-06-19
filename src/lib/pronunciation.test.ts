import { describe, it, expect } from "vitest";
import { applyPronunciation, DEFAULT_PRONUNCIATIONS, type PronunciationEntry } from "./pronunciation";

const d = DEFAULT_PRONUNCIATIONS;

describe("applyPronunciation", () => {
  it("replaces a term with its spoken form", () => {
    expect(applyPronunciation("at the G7 summit today", d)).toBe("at the G seven summit today");
  });

  it("is case-insensitive", () => {
    expect(applyPronunciation("the g7 meeting", d)).toBe("the G seven meeting");
  });

  it("only matches whole words", () => {
    expect(applyPronunciation("model G77 and G7", d)).toBe("model G77 and G seven");
  });

  it("applies longer terms before shorter overlapping ones", () => {
    expect(applyPronunciation("the G20 and G7", d)).toBe("the G twenty and G seven");
  });

  it("handles punctuation around the term", () => {
    expect(applyPronunciation("(G7), really?", d)).toBe("(G seven), really?");
  });

  it("leaves unrelated text untouched", () => {
    expect(applyPronunciation("Tesla stock rose", d)).toBe("Tesla stock rose");
  });

  it("supports custom entries", () => {
    const custom: PronunciationEntry[] = [{ term: "NVDA", say: "N V D A" }];
    expect(applyPronunciation("NVDA earnings", custom)).toBe("N V D A earnings");
  });

  it("ignores blank entries", () => {
    expect(applyPronunciation("hello", [{ term: "", say: "x" }, { term: "y", say: "" }])).toBe("hello");
  });
});
