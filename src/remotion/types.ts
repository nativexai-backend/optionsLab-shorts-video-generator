import { z } from "zod";

export const VIDEO_WIDTH = 720;
export const VIDEO_HEIGHT = 1280;
export const VIDEO_FPS = 30;

export const TranscriptWordSchema = z.object({
  word: z.string(),
  start: z.number(),
  end: z.number(),
});

export type TranscriptWord = z.infer<typeof TranscriptWordSchema>;

export type ImageAnimation =
  | "kenBurns"
  | "panLeft"
  | "panRight"
  | "panUp"
  | "panDown"
  | "zoomIn"
  | "zoomOut"
  | "static";

export const IMAGE_ANIMATIONS: { value: ImageAnimation; label: string }[] = [
  { value: "kenBurns", label: "Ken Burns" },
  { value: "panLeft", label: "Pan Left" },
  { value: "panRight", label: "Pan Right" },
  { value: "panUp", label: "Pan Up" },
  { value: "panDown", label: "Pan Down" },
  { value: "zoomIn", label: "Zoom In" },
  { value: "zoomOut", label: "Zoom Out" },
  { value: "static", label: "Static" },
];

// ── Animated stock charts ──

export interface Candle {
  o: number;
  h: number;
  l: number;
  c: number;
}

export type ChartType = "candles" | "line" | "area";
export type ChartTrend = "up" | "down" | "volatile" | "crashRecover";
export type ChartRange = "1D" | "5D" | "1M" | "6M" | "1Y";

export const CHART_TYPES: { value: ChartType; label: string }[] = [
  { value: "candles", label: "Candles" },
  { value: "line", label: "Line" },
  { value: "area", label: "Area" },
];

export const CHART_RANGES: { value: ChartRange; label: string }[] = [
  { value: "1D", label: "1 Day" },
  { value: "5D", label: "5 Days" },
  { value: "1M", label: "1 Month" },
  { value: "6M", label: "6 Months" },
  { value: "1Y", label: "1 Year" },
];

export interface ChartSpec {
  ticker: string; // e.g. "NVDA"
  companyName?: string; // e.g. "NVIDIA Corporation"
  date?: string; // display date, e.g. "Jun 17, 2026"
  xLabels?: string[]; // evenly-spaced x-axis labels (e.g. ["Fri 18", "Mon 21", "Tue 22"])
  logo?: string; // embedded logo as a data URL (renders offline); falls back to a monogram
  candles: Candle[]; // embedded so server-side render needs no network
  chartType: ChartType;
  theme: "dark" | "light";
  upColor: string;
  downColor: string;
  source: "real" | "synthetic";
}

export const DEFAULT_CHART_COLORS = { up: "#22C55E", down: "#EF4444" };

// A clip's box within the frame, normalized 0..1 (so it's resolution-agnostic).
// Full-frame default is { x: 0, y: 0, width: 1, height: 1 }.
export interface ClipTransform {
  x: number; // left edge, fraction of frame width
  y: number; // top edge, fraction of frame height
  width: number; // fraction of frame width
  height: number; // fraction of frame height
}

export const FULL_FRAME: ClipTransform = { x: 0, y: 0, width: 1, height: 1 };

export interface ImageSegment {
  src: string;
  startTime: number;
  endTime: number;
  animation: ImageAnimation;
  // Multi-track overlay support. `track` is the z-order (0 = base layer, higher
  // renders on top); `transform` is the clip's box in the frame. Both are
  // optional and default to a single full-frame base track, so projects created
  // before multi-track render identically.
  track?: number;
  transform?: ClipTransform;
  // When present, this timeline segment renders an animated chart instead of an
  // image. The candle data is embedded so it renders without a network call.
  chart?: ChartSpec;
}

export type AvatarPosition =
  | "bottom-right"
  | "bottom-left"
  | "top-right"
  | "top-left"
  | "bottom-center";

export const AVATAR_POSITIONS: { value: AvatarPosition; label: string }[] = [
  { value: "bottom-right", label: "Bottom Right" },
  { value: "bottom-left", label: "Bottom Left" },
  { value: "top-right", label: "Top Right" },
  { value: "top-left", label: "Top Left" },
  { value: "bottom-center", label: "Bottom Center" },
];

export type BadgePosition = "bottom-left" | "bottom-right" | "top-left" | "top-right";

export const BADGE_POSITIONS: { value: BadgePosition; label: string }[] = [
  { value: "bottom-left", label: "Bottom Left" },
  { value: "bottom-right", label: "Bottom Right" },
  { value: "top-left", label: "Top Left" },
  { value: "top-right", label: "Top Right" },
];

export type VisualizerStyle = "pulse" | "wave" | "bars" | "glow";

export const VISUALIZER_STYLES: { value: VisualizerStyle; label: string }[] = [
  { value: "pulse", label: "Pulse Rings" },
  { value: "wave", label: "Liquid Wave" },
  { value: "bars", label: "Bars" },
  { value: "glow", label: "Minimal Glow" },
];

export const VideoStyleSchema = z.object({
  fontSize: z.number().default(58),
  fontFamily: z.string().default("Inter"),
  textColor: z.string().default("#FFFFFF"),
  highlightColor: z.string().default("#FACC15"),
  shadowColor: z.string().default("#000000"),
  captionYPosition: z.number().default(0.55),
  kenBurnsIntensity: z.number().default(0.07),
  wordsPerCaption: z.number().default(4),
  avatarSize: z.number().default(150),
  avatarPosition: z.enum(["bottom-right", "bottom-left", "top-right", "top-left", "bottom-center"]).default("bottom-right"),
  badgePosition: z.enum(["bottom-left", "bottom-right", "top-left", "top-right"]).default("top-left"),
  visualizerStyle: z.enum(["pulse", "wave", "bars", "glow"]).default("bars"),
});

export type VideoStyle = z.infer<typeof VideoStyleSchema>;

export const DEFAULT_STYLE: VideoStyle = {
  fontSize: 58,
  fontFamily: "Inter",
  textColor: "#FFFFFF",
  highlightColor: "#FACC15",
  shadowColor: "#000000",
  captionYPosition: 0.55,
  kenBurnsIntensity: 0.07,
  wordsPerCaption: 4,
  avatarSize: 150,
  avatarPosition: "bottom-right",
  badgePosition: "top-left",
  visualizerStyle: "bars",
};

// Helper to get avatar CSS positioning from position name
export function getAvatarPositionStyle(
  position: AvatarPosition | string,
  totalSize: number
): { bottom?: number; top?: number; left?: number; right?: number } {
  switch (position) {
    case "bottom-left":
      return { bottom: 40, left: 10 };
    case "top-right":
      return { top: 40, right: 10 };
    case "top-left":
      return { top: 40, left: 10 };
    case "bottom-center":
      return { bottom: 40, left: VIDEO_WIDTH / 2 - totalSize / 2 };
    case "bottom-right":
    default:
      return { bottom: 40, right: 10 };
  }
}

// Helper to get avatar center coordinates from position name
export function getAvatarCenterCoords(
  position: AvatarPosition | string,
  avatarSize: number
): { cx: number; cy: number } {
  const barMaxLength = avatarSize * 0.4;
  const totalSize = avatarSize + barMaxLength * 2 + 16;
  const half = totalSize / 2;

  switch (position) {
    case "bottom-left":
      return { cx: 10 + half, cy: VIDEO_HEIGHT - 40 - half };
    case "top-right":
      return { cx: VIDEO_WIDTH - 10 - half, cy: 40 + half };
    case "top-left":
      return { cx: 10 + half, cy: 40 + half };
    case "bottom-center":
      return { cx: VIDEO_WIDTH / 2, cy: VIDEO_HEIGHT - 40 - half };
    case "bottom-right":
    default:
      return { cx: VIDEO_WIDTH - 10 - half, cy: VIDEO_HEIGHT - 40 - half };
  }
}

export interface IntroOutroSegment {
  src: string;
  startTime: number;
  duration: number;
  fadeDuration: number;
}

export type IntroAnimationStyle = "circleReveal" | "slideDown";

export const INTRO_ANIMATION_STYLES: { value: IntroAnimationStyle; label: string }[] = [
  { value: "circleReveal", label: "Circle Reveal" },
  { value: "slideDown", label: "Slide Down" },
];

export interface IntroAnimationConfig {
  enabled: boolean;
  style: IntroAnimationStyle;
  holdDuration: number; // seconds to hold the centered avatar
  transitionDuration: number; // seconds for the zoom-out transition
  backgroundColor: string; // solid circle color
}

export const DEFAULT_INTRO_ANIMATION: IntroAnimationConfig = {
  enabled: true,
  style: "circleReveal",
  holdDuration: 0.5,
  transitionDuration: 1.0,
  backgroundColor: "#6B7FD7",
};

export interface OutroCardContent {
  logoSrc: string;
  brandName: string;
  tagline: string;
  badgeSrc: string | null;
  disclaimer: string;
  backgroundColor: string;
}

export type OutroStyle = "classic" | "modern";

export const OUTRO_STYLES: { value: OutroStyle; label: string }[] = [
  { value: "classic", label: "Classic" },
  { value: "modern", label: "Modern" },
];

export interface OutroCardConfig {
  enabled: boolean;
  usePreset: boolean; // true = OptionsLab, false = custom
  presetBackgroundColor: string; // override preset background color
  custom: OutroCardContent; // used when usePreset is false
  transitionDuration: number;
  style: OutroStyle;
}

export const OPTIONSLAB_PRESET: OutroCardContent = {
  logoSrc: "/optionslab-logo.svg",
  brandName: "OptionsLab",
  tagline: "Trading Community",
  badgeSrc: "/appstore-badge.png",
  disclaimer: "Educational platform only. Not financial advice. Past performance does not guarantee future results. Read Characteristics and Risks of Standardized Options.",
  backgroundColor: "#D6D0EA",
};

export const DEFAULT_OUTRO_CARD: OutroCardConfig = {
  enabled: true,
  usePreset: true,
  presetBackgroundColor: "#D6D0EA",
  custom: {
    logoSrc: "",
    brandName: "",
    tagline: "",
    badgeSrc: null,
    disclaimer: "",
    backgroundColor: "#D6D0EA",
  },
  transitionDuration: 3.0,
  style: "modern",
};

export type SceneCategory = "person" | "logo" | "chart" | "product" | "b-roll" | "text-overlay";

export const SCENE_CATEGORIES: { value: SceneCategory; label: string }[] = [
  { value: "person", label: "Person" },
  { value: "logo", label: "Logo" },
  { value: "chart", label: "Chart" },
  { value: "product", label: "Product" },
  { value: "b-roll", label: "B-Roll" },
  { value: "text-overlay", label: "Text Overlay" },
];

export interface SceneSuggestion {
  id: string;
  scriptSegment: string;
  description: string;
  imagePrompt: string;
  category: SceneCategory;
  suggestedAnimation: ImageAnimation;
  animationReason: string;
  priority: "essential" | "recommended" | "optional";
  wordRange: [number, number];
  // When a long beat is auto-split for pacing, sub-shots share the parent's
  // content but carry their position (1-based) within the beat.
  part?: number;
  partCount?: number;
}

export const DEFAULT_MUSIC_VOLUME = 0.15;

export interface VideoProps extends Record<string, unknown> {
  audioSrc: string | null;
  audioDelay: number; // seconds into the video timeline when audio begins
  musicSrc: string | null; // background music bed, looped under the voiceover
  musicVolume: number; // 0..1
  transcript: TranscriptWord[];
  images: ImageSegment[];
  avatarSrc: string | null;
  intro: IntroOutroSegment | null;
  outro: IntroOutroSegment | null;
  introAnimation: IntroAnimationConfig;
  outroCard: OutroCardConfig;
  style: VideoStyle;
  durationInSeconds: number;
}
