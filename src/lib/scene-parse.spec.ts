import { describe, it, expect } from "vitest";
import {
  parseSceneResponse,
  validateCategory,
  validateAnimation,
  validatePriority,
  validateWordRange,
} from "./scene-parse";

const SCENE = {
  scriptSegment: "Oil prices just spiked eight percent overnight",
  description: "Oil barrels in a sunlit warehouse",
  imagePrompt: "rows of steel oil barrels, no text overlays, vertical 9:16 format",
  category: "b-roll",
  suggestedAnimation: "panLeft",
  animationReason: "Horizontal drift suits the wide industrial scene",
  priority: "essential",
  wordRange: [0, 6],
};

describe("parseSceneResponse", () => {
  it("parses a plain {scenes} object", () => {
    const scenes = parseSceneResponse(JSON.stringify({ scenes: [SCENE] }), 100);
    expect(scenes).toHaveLength(1);
    expect(scenes[0].scriptSegment).toBe(SCENE.scriptSegment);
    expect(scenes[0].category).toBe("b-roll");
    expect(scenes[0].suggestedAnimation).toBe("panLeft");
    expect(scenes[0].priority).toBe("essential");
    expect(scenes[0].wordRange).toEqual([0, 6]);
  });

  it("parses a top-level array", () => {
    const scenes = parseSceneResponse(JSON.stringify([SCENE, SCENE]), 100);
    expect(scenes).toHaveLength(2);
    expect(scenes[1].description).toBe(SCENE.description);
  });

  it("strips markdown fences around the JSON", () => {
    const text = "```json\n" + JSON.stringify({ scenes: [SCENE] }) + "\n```";
    const scenes = parseSceneResponse(text, 100);
    expect(scenes).toHaveLength(1);
    expect(scenes[0].imagePrompt).toBe(SCENE.imagePrompt);
  });

  it("tolerates a prose preamble and trailing note around the JSON", () => {
    const text =
      "Here are the visual scenes I suggest:\n\n" +
      JSON.stringify({ scenes: [SCENE] }) +
      "\n\nLet me know if you'd like adjustments!";
    const scenes = parseSceneResponse(text, 100);
    expect(scenes).toHaveLength(1);
    expect(scenes[0].scriptSegment).toBe(SCENE.scriptSegment);
  });

  it("falls back to safe defaults for invalid category/animation/priority", () => {
    const bad = {
      ...SCENE,
      category: "meme",
      suggestedAnimation: "spin",
      priority: "urgent",
    };
    const [scene] = parseSceneResponse(JSON.stringify({ scenes: [bad] }), 100);
    expect(scene.category).toBe("b-roll");
    expect(scene.suggestedAnimation).toBe("kenBurns");
    expect(scene.priority).toBe("recommended");
  });

  it("clamps wordRange to the script bounds and defaults when malformed", () => {
    const outOfBounds = { ...SCENE, wordRange: [-5, 999] };
    const [clamped] = parseSceneResponse(JSON.stringify({ scenes: [outOfBounds] }), 50);
    expect(clamped.wordRange).toEqual([0, 49]);

    const malformed = { ...SCENE, wordRange: "0-15" };
    const [defaulted] = parseSceneResponse(JSON.stringify({ scenes: [malformed] }), 50);
    expect(defaulted.wordRange).toEqual([0, 49]);
  });

  it("falls back to description when imagePrompt is missing", () => {
    const noPrompt = { ...SCENE, imagePrompt: undefined };
    const [scene] = parseSceneResponse(JSON.stringify({ scenes: [noPrompt] }), 100);
    expect(scene.imagePrompt).toBe(SCENE.description);
  });

  it("throws when there is no scenes array", () => {
    expect(() => parseSceneResponse(JSON.stringify({ foo: "bar" }), 100)).toThrow(
      "No scenes array in response",
    );
    expect(() => parseSceneResponse("no json here at all", 100)).toThrow();
  });
});

describe("validators", () => {
  it("accepts valid enum values", () => {
    expect(validateCategory("logo")).toBe("logo");
    expect(validateAnimation("zoomOut")).toBe("zoomOut");
    expect(validatePriority("optional")).toBe("optional");
  });

  it("falls back on invalid values", () => {
    expect(validateCategory(42)).toBe("b-roll");
    expect(validateAnimation(null)).toBe("kenBurns");
    expect(validatePriority("")).toBe("recommended");
  });

  it("validates word ranges", () => {
    expect(validateWordRange([2, 10], 20)).toEqual([2, 10]);
    expect(validateWordRange([2, 100], 20)).toEqual([2, 19]);
    expect(validateWordRange([-3, 5], 20)).toEqual([0, 5]);
    expect(validateWordRange(null, 20)).toEqual([0, 19]);
    expect(validateWordRange([1], 20)).toEqual([0, 19]);
  });
});
