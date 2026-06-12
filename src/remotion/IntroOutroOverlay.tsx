import React from "react";
import {
  AbsoluteFill,
  Img,
  interpolate,
  useCurrentFrame,
  useVideoConfig,
} from "remotion";
import { IntroOutroSegment } from "./types";

interface Props {
  segment: IntroOutroSegment | null;
}

export const IntroOutroOverlay: React.FC<Props> = ({ segment }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  if (!segment) return null;

  const currentTimeSec = frame / fps;
  const { startTime, duration, fadeDuration, src } = segment;
  const endTime = startTime + duration;

  // Not visible yet or already done
  if (currentTimeSec < startTime - 0.01 || currentTimeSec > endTime + 0.01) {
    return null;
  }

  // Fade in
  let opacity = 1;
  if (fadeDuration > 0 && currentTimeSec < startTime + fadeDuration) {
    opacity = interpolate(
      currentTimeSec,
      [startTime, startTime + fadeDuration],
      [0, 1],
      { extrapolateLeft: "clamp", extrapolateRight: "clamp" }
    );
  }
  // Fade out
  if (fadeDuration > 0 && currentTimeSec > endTime - fadeDuration) {
    opacity = interpolate(
      currentTimeSec,
      [endTime - fadeDuration, endTime],
      [1, 0],
      { extrapolateLeft: "clamp", extrapolateRight: "clamp" }
    );
  }

  // Subtle scale animation
  const progress = (currentTimeSec - startTime) / duration;
  const scale = interpolate(progress, [0, 1], [1.02, 1.06], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  return (
    <AbsoluteFill style={{ opacity, zIndex: 10 }}>
      <Img
        src={src}
        style={{
          width: "100%",
          height: "100%",
          objectFit: "cover",
          transform: `scale(${scale})`,
        }}
      />
    </AbsoluteFill>
  );
};
