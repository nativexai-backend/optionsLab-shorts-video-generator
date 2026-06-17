import React from "react";
import {
  AbsoluteFill,
  Img,
  interpolate,
  Easing,
  useCurrentFrame,
  useVideoConfig,
} from "remotion";
import { ImageSegment, ImageAnimation, VIDEO_WIDTH, VIDEO_HEIGHT } from "./types";
import { AnimatedChart } from "./AnimatedChart";

interface Props {
  images: ImageSegment[];
  kenBurnsIntensity: number;
}

// Pronounced ease-in-out: slow start, smooth middle, slow end
const smoothEase = Easing.bezier(0.42, 0, 0.58, 1);

function getAnimationTransform(
  animation: ImageAnimation,
  rawProgress: number,
  intensity: number,
  index: number
): string {
  // Apply easing to progress for smoother motion
  const progress = smoothEase(rawProgress);

  // Zoom in to create room, then drift across most of the available margin.
  // NOTE: CSS applies transforms right-to-left, so "translateX(...) scale(...)"
  // scales first, then translates in SCREEN pixels — keeping the drift math
  // honest. (The old "scale() translate()" order multiplied the drift by the
  // scale factor, overshooting the margin and exposing the frame edge.)
  const panZoom = 1.3 + intensity * 0.5;
  const driftH = (VIDEO_WIDTH * (panZoom - 1)) / 2 * 0.9;
  const driftV = (VIDEO_HEIGHT * (panZoom - 1)) / 2 * 0.9;

  switch (animation) {
    case "panLeft": {
      const tx = interpolate(progress, [0, 1], [driftH, -driftH]);
      return `translateX(${tx}px) scale(${panZoom})`;
    }
    case "panRight": {
      const tx = interpolate(progress, [0, 1], [-driftH, driftH]);
      return `translateX(${tx}px) scale(${panZoom})`;
    }
    case "panUp": {
      const ty = interpolate(progress, [0, 1], [driftV, -driftV]);
      return `translateY(${ty}px) scale(${panZoom})`;
    }
    case "panDown": {
      const ty = interpolate(progress, [0, 1], [-driftV, driftV]);
      return `translateY(${ty}px) scale(${panZoom})`;
    }
    case "zoomIn": {
      const scale = interpolate(progress, [0, 1], [1, 1 + intensity * 2]);
      return `scale(${scale})`;
    }
    case "zoomOut": {
      const scale = interpolate(progress, [0, 1], [1 + intensity * 2, 1]);
      return `scale(${scale})`;
    }
    case "static":
      return "scale(1)";
    case "kenBurns":
    default: {
      const scaleStart = 1 + intensity * 0.4;
      const scaleEnd = 1 + intensity * 1.4;
      const scale = interpolate(progress, [0, 1], [scaleStart, scaleEnd]);
      const direction = index % 2 === 0 ? 1 : -1;
      const tx = interpolate(progress, [0, 1], [0, direction * 25 * intensity]);
      const ty = interpolate(progress, [0, 1], [0, -direction * 12 * intensity]);
      return `scale(${scale}) translate(${tx}px, ${ty}px)`;
    }
  }
}

export const BackgroundSlideshow: React.FC<Props> = ({
  images,
  kenBurnsIntensity,
}) => {
  const frame = useCurrentFrame();
  const { fps, width, height } = useVideoConfig();
  const currentTimeSec = frame / fps;
  const crossfadeDuration = 0.8; // longer crossfade for smoother transitions

  if (images.length === 0) {
    return (
      <AbsoluteFill style={{ backgroundColor: "#111" }} />
    );
  }

  return (
    <AbsoluteFill>
      {images.map((segment, index) => {
        if (!segment.src && !segment.chart) return null;
        const segDuration = segment.endTime - segment.startTime;
        if (segDuration <= 0) return null;

        const segProgress = Math.max(
          0,
          Math.min(1, (currentTimeSec - segment.startTime) / segDuration)
        );

        // Eased crossfade opacity for silky transitions
        let opacity = 1;
        if (currentTimeSec < segment.startTime - crossfadeDuration) {
          opacity = 0;
        } else if (currentTimeSec < segment.startTime) {
          const raw = interpolate(
            currentTimeSec,
            [segment.startTime - crossfadeDuration, segment.startTime],
            [0, 1]
          );
          opacity = Easing.inOut(Easing.ease)(raw);
        } else if (currentTimeSec > segment.endTime) {
          opacity = 0;
        } else if (currentTimeSec > segment.endTime - crossfadeDuration) {
          const raw = interpolate(
            currentTimeSec,
            [segment.endTime - crossfadeDuration, segment.endTime],
            [1, 0]
          );
          opacity = Easing.inOut(Easing.ease)(raw);
        }

        if (opacity <= 0) return null;

        // Chart segments animate themselves (drawing in) — render the chart and
        // skip the Ken Burns pan/zoom.
        if (segment.chart) {
          return (
            <AbsoluteFill key={index} style={{ opacity }}>
              <AnimatedChart spec={segment.chart} progress={segProgress} width={width} height={height} />
            </AbsoluteFill>
          );
        }

        const animation = segment.animation || "kenBurns";
        const transform = getAnimationTransform(
          animation,
          segProgress,
          kenBurnsIntensity,
          index
        );

        return (
          <AbsoluteFill key={index} style={{ opacity }}>
            <Img
              src={segment.src}
              style={{
                width: "100%",
                height: "100%",
                objectFit: "cover",
                transform,
                willChange: "transform",
              }}
            />
          </AbsoluteFill>
        );
      })}
    </AbsoluteFill>
  );
};
