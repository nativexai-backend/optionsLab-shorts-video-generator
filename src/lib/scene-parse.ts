// ── Scene-suggestion response parsing ──
//
// Turns an LLM's raw text (Groq or Claude) into validated SceneSuggestion[].
// Pure functions, extracted from the analyze-script route so they can be
// unit-tested without the route's provider plumbing.

import type { SceneSuggestion, ImageAnimation, SceneCategory } from "../remotion/types";
import { extractJson } from "./llm";

/**
 * Parse an LLM response into SceneSuggestion[]. Tolerates markdown fences and
 * surrounding prose (via extractJson), a top-level array or a {scenes} object,
 * and invalid enum values (validators fall back to safe defaults).
 */
export function parseSceneResponse(
  text: string,
  totalWords: number,
): SceneSuggestion[] {
  const parsed = JSON.parse(extractJson(text));
  const rawScenes = Array.isArray(parsed) ? parsed : parsed.scenes;
  if (!Array.isArray(rawScenes)) throw new Error("No scenes array in response");

  return rawScenes.map((s: Record<string, unknown>, i: number) => ({
    id: `scene-${i}-${Date.now()}`,
    scriptSegment: String(s.scriptSegment ?? ""),
    description: String(s.description ?? ""),
    imagePrompt: String(s.imagePrompt ?? s.description ?? ""),
    category: validateCategory(s.category),
    suggestedAnimation: validateAnimation(s.suggestedAnimation),
    animationReason: String(s.animationReason ?? ""),
    priority: validatePriority(s.priority),
    wordRange: validateWordRange(s.wordRange, totalWords),
  }));
}

// ── Validators ──

export function validateCategory(v: unknown): SceneCategory {
  const valid: SceneCategory[] = ["person", "logo", "chart", "product", "b-roll", "text-overlay"];
  return valid.includes(v as SceneCategory) ? (v as SceneCategory) : "b-roll";
}

export function validateAnimation(v: unknown): ImageAnimation {
  const valid: ImageAnimation[] = ["kenBurns", "panLeft", "panRight", "panUp", "panDown", "zoomIn", "zoomOut", "static"];
  return valid.includes(v as ImageAnimation) ? (v as ImageAnimation) : "kenBurns";
}

export function validatePriority(v: unknown): "essential" | "recommended" | "optional" {
  const valid = ["essential", "recommended", "optional"];
  return valid.includes(v as string) ? (v as "essential" | "recommended" | "optional") : "recommended";
}

export function validateWordRange(v: unknown, totalWords: number): [number, number] {
  if (Array.isArray(v) && v.length === 2 && typeof v[0] === "number" && typeof v[1] === "number") {
    return [
      Math.max(0, Math.min(v[0], totalWords - 1)),
      Math.max(0, Math.min(v[1], totalWords - 1)),
    ];
  }
  return [0, totalWords - 1];
}
