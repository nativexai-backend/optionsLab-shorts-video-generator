import React, { useMemo } from "react";
import {
  AbsoluteFill,
  interpolate,
  useCurrentFrame,
  useVideoConfig,
} from "remotion";
import { TranscriptWord, VideoStyle } from "./types";

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

  // Quick fade-in over ~4 frames, no bounce/scale
  const opacity = interpolate(frameSinceStart, [0, 4], [0, 1], {
    extrapolateRight: "clamp",
  });

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
          // A word is "reached" once current time passes its start.
          // Highlight the word currently being spoken (between start and end),
          // and keep already-spoken words highlighted too for smooth reading.
          const isReached = currentTimeSec >= word.start;
          const isCurrent = currentTimeSec >= word.start && currentTimeSec <= word.end;
          const color = isCurrent
            ? style.highlightColor
            : isReached
              ? style.textColor
              : `${style.textColor}88`;

          return (
            <span
              key={i}
              style={{
                color,
                textShadow: `0 2px 8px ${style.shadowColor}, 0 4px 20px ${style.shadowColor}cc, 0 0 40px ${style.shadowColor}88`,
                WebkitTextStroke: `1.5px ${style.shadowColor}44`,
                transition: "color 0.08s ease",
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
