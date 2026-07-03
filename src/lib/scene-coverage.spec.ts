import { describe, it, expect } from "vitest";
import { checkSceneCoverage } from "./scene-coverage";

const SCRIPT = `Oil prices just spiked eight percent overnight, and it all comes down to one narrow stretch of water. The Strait of Hormuz carries a fifth of the world's oil supply, and Iran is now threatening to close it. Tanker traffic is already slowing, insurance rates for shipping are tripling, and traders are scrambling to price in the risk. The last time tensions rose this high, crude jumped past one hundred twenty dollars a barrel in a matter of weeks. Airlines are the first casualty, with jet fuel costs eating directly into their margins. Delta and United both dropped four percent this morning.`;

describe("checkSceneCoverage", () => {
  it("passes a gap-free partition of the script", () => {
    const scenes = [
      { scriptSegment: "Oil prices just spiked eight percent overnight, and it all comes down to one narrow stretch of water." },
      { scriptSegment: "The Strait of Hormuz carries a fifth of the world's oil supply, and Iran is now threatening to close it." },
      { scriptSegment: "Tanker traffic is already slowing, insurance rates for shipping are tripling, and traders are scrambling to price in the risk." },
      { scriptSegment: "The last time tensions rose this high, crude jumped past one hundred twenty dollars a barrel in a matter of weeks." },
      { scriptSegment: "Airlines are the first casualty, with jet fuel costs eating directly into their margins. Delta and United both dropped four percent this morning." },
    ];
    const r = checkSceneCoverage(scenes, SCRIPT);
    expect(r.ok).toBe(true);
    expect(r.coverage).toBeGreaterThan(0.95);
    expect(r.maxGap).toBeLessThanOrEqual(2);
  });

  it("rejects sparse excerpts that leave big gaps (real Groq failure shape)", () => {
    // Mirrors the observed failure: short quotes with ~40-word gaps up front,
    // then a dense cluster at the end.
    const scenes = [
      { scriptSegment: "Oil prices just spiked eight percent overnight" },
      { scriptSegment: "The last time tensions rose this high" },
      { scriptSegment: "Airlines are the first casualty" },
      { scriptSegment: "Delta and United both dropped four percent this morning" },
    ];
    const r = checkSceneCoverage(scenes, SCRIPT);
    expect(r.ok).toBe(false);
    expect(r.coverage).toBeLessThan(0.75);
  });

  it("rejects full-looking coverage that still absorbs a huge gap", () => {
    // Two long quotes but everything between them is skipped
    const words = SCRIPT.split(/\s+/);
    const scenes = [
      { scriptSegment: words.slice(0, 30).join(" ") },
      { scriptSegment: words.slice(75).join(" ") },
    ];
    const r = checkSceneCoverage(scenes, SCRIPT);
    expect(r.maxGap).toBeGreaterThan(25);
    expect(r.ok).toBe(false);
  });

  it("rejects empty inputs", () => {
    expect(checkSceneCoverage([], SCRIPT).ok).toBe(false);
    expect(checkSceneCoverage([{ scriptSegment: "hello" }], "").ok).toBe(false);
  });

  it("tolerates paraphrased-but-anchored segments the timeline can still place", () => {
    // Punctuation/case differences must not count as gaps
    const scenes = [
      { scriptSegment: "oil prices just spiked eight percent overnight and it all comes down to one narrow stretch of water the strait of hormuz carries a fifth of the worlds oil supply and iran is now threatening to close it" },
      { scriptSegment: "Tanker traffic is already slowing insurance rates for shipping are tripling and traders are scrambling to price in the risk the last time tensions rose this high crude jumped past one hundred twenty dollars a barrel in a matter of weeks" },
      { scriptSegment: "Airlines are the first casualty with jet fuel costs eating directly into their margins Delta and United both dropped four percent this morning" },
    ];
    const r = checkSceneCoverage(scenes, SCRIPT);
    expect(r.ok).toBe(true);
  });
});
