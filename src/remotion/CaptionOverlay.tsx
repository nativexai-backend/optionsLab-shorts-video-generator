import React, { useMemo } from "react";
import {
  AbsoluteFill,
  interpolate,
  spring,
  useCurrentFrame,
  useVideoConfig,
} from "remotion";
import { TranscriptWord, VideoStyle } from "./types";

// Linear-blend two hex colors → "rgb(...)". Frame-driven so it renders to MP4
// (a CSS `transition` would silently no-op during server-side rendering).
function parseHex(hex: string): [number, number, number] {
  const s = hex.replace("#", "");
  return [
    parseInt(s.slice(0, 2), 16),
    parseInt(s.slice(2, 4), 16),
    parseInt(s.slice(4, 6), 16),
  ];
}
function hexLerp(a: string, b: string, t: number): string {
  const [r1, g1, b1] = parseHex(a);
  const [r2, g2, b2] = parseHex(b);
  const r = Math.round(r1 + (r2 - r1) * t);
  const g = Math.round(g1 + (g2 - g1) * t);
  const bl = Math.round(b1 + (b2 - b1) * t);
  return `rgb(${r}, ${g}, ${bl})`;
}

interface Props {
  transcript: TranscriptWord[];
  style: VideoStyle;
  audioDelay: number;
}

interface WordGroup {
  words: TranscriptWord[];
  start: number;
  end: number;
}

// Pause threshold (seconds) — if gap between words exceeds this, break the group
const PAUSE_THRESHOLD = 0.35;

function groupWords(
  transcript: TranscriptWord[],
  wordsPerCaption: number
): WordGroup[] {
  const groups: WordGroup[] = [];
  let current: TranscriptWord[] = [];

  for (let i = 0; i < transcript.length; i++) {
    const word = transcript[i];
    const prev = current[current.length - 1];

    // Start a new group when:
    // 1. Current group hit the max word count
    // 2. There's a natural pause (gap) between this word and the previous
    // 3. Previous word ends with sentence punctuation
    const hitMax = current.length >= wordsPerCaption;
    const hasPause = prev && (word.start - prev.end) > PAUSE_THRESHOLD;
    const sentenceEnd = prev && /[.!?]$/.test(prev.word);

    if (current.length > 0 && (hitMax || hasPause || sentenceEnd)) {
      groups.push({
        words: current,
        start: current[0].start,
        end: current[current.length - 1].end,
      });
      current = [];
    }

    current.push(word);
  }

  // Flush remaining
  if (current.length > 0) {
    groups.push({
      words: current,
      start: current[0].start,
      end: current[current.length - 1].end,
    });
  }

  return groups;
}

export const CaptionOverlay: React.FC<Props> = ({ transcript, style, audioDelay }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const currentTimeSec = frame / fps - audioDelay;

  const groups = useMemo(() => groupWords(transcript, style.wordsPerCaption), [transcript, style.wordsPerCaption]);

  if (transcript.length === 0) return null;
  const activeGroup = groups.find(
    (g) => currentTimeSec >= g.start && currentTimeSec <= g.end
  );

  if (!activeGroup) return null;

  const groupStartFrame = Math.round((activeGroup.start + audioDelay) * fps);
  const frameSinceStart = frame - groupStartFrame;
  const isDynamic = style.captionAnimation === "dynamic";

  // Group container fade-in. In "dynamic" the per-word springs carry the
  // entrance, so the container stays fully visible and only the words animate.
  const opacity = isDynamic
    ? 1
    : interpolate(frameSinceStart, [0, 4], [0, 1], { extrapolateRight: "clamp" });

  const STAGGER = 1.5; // frames between consecutive word pop-ins

  return (
    <AbsoluteFill
      style={{
        justifyContent: "center",
        alignItems: "center",
        top: `${style.captionYPosition * 100}%`,
        bottom: "auto",
        height: "auto",
        padding: "0 40px",
      }}
    >
      <div
        style={{
          opacity,
          fontSize: style.fontSize,
          fontFamily: style.fontFamily,
          fontWeight: 800,
          textAlign: "center",
          lineHeight: 1.2,
          display: "flex",
          flexWrap: "wrap",
          justifyContent: "center",
          gap: "0 0.25em",
        }}
      >
        {activeGroup.words.map((word, i) => {
          // Smooth dim → full as the word is reached (~3 frames), then a
          // highlight sweep that rises at word.start and falls after word.end.
          // All frame-driven, so it renders identically in preview and export.
          const reachT = interpolate(
            currentTimeSec,
            [word.start - 0.05, word.start + 0.08],
            [0, 1],
            { extrapolateLeft: "clamp", extrapolateRight: "clamp" }
          );
          // Highlight sweep: rise just before word.start, hold while spoken,
          // fall after word.end. Build strictly-increasing breakpoints so short
          // (or zero-length) words can't collide two stops — interpolate()
          // requires a strictly monotonic input range.
          const rise = Math.min(0.08, Math.max(0.01, (word.end - word.start) * 0.5));
          const hStart = word.start - 0.02;
          const hPeak = word.start + rise;
          const hHold = Math.max(hPeak + 0.001, word.end);
          const hEnd = hHold + 0.14;
          const highlightT = interpolate(
            currentTimeSec,
            [hStart, hPeak, hHold, hEnd],
            [0, 1, 1, 0],
            { extrapolateLeft: "clamp", extrapolateRight: "clamp" }
          );
          // Dimming for unspoken words is carried by opacity below; color only
          // needs the spoken-word highlight sweep.
          const color = hexLerp(style.textColor, style.highlightColor, highlightT);

          // "dynamic": staggered spring pop-in + a gentle lift while spoken.
          let transform: string | undefined;
          let wordOpacity = 1;
          if (isDynamic) {
            const ent = spring({
              frame: frameSinceStart - i * STAGGER,
              fps,
              config: { damping: 13, stiffness: 200, mass: 0.5 },
            });
            const entScale = interpolate(ent, [0, 1], [0.6, 1]);
            const entY = interpolate(ent, [0, 1], [14, 0]);
            const lift = 1 + 0.08 * highlightT;
            transform = `translateY(${entY}px) scale(${entScale * lift})`;
            wordOpacity = ent;
          } else {
            // "clean": carry the dim→full appearance as opacity so unspoken
            // words read softer, matching the prior look without a hard pop.
            wordOpacity = interpolate(reachT, [0, 1], [0.53, 1]);
          }

          return (
            <span
              key={i}
              style={{
                color,
                opacity: wordOpacity,
                transform,
                willChange: isDynamic ? "transform, opacity" : undefined,
                display: isDynamic ? "inline-block" : undefined,
                textShadow: `0 2px 8px ${style.shadowColor}, 0 4px 20px ${style.shadowColor}cc, 0 0 40px ${style.shadowColor}88`,
                WebkitTextStroke: `1.5px ${style.shadowColor}44`,
              }}
            >
              {word.word}
            </span>
          );
        })}
      </div>
    </AbsoluteFill>
  );
};
