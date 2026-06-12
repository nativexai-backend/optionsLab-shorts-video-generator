import React from "react";
import {
  AbsoluteFill,
  Img,
  interpolate,
  spring,
  useCurrentFrame,
  useVideoConfig,
} from "remotion";
import { useAudioData } from "@remotion/media-utils";
import {
  IntroAnimationConfig,
  AvatarPosition,
  VisualizerStyle,
  VIDEO_WIDTH,
  VIDEO_HEIGHT,
  getAvatarCenterCoords,
} from "./types";
import { AvatarViz, getVoiceLevels, vizTotalSize, VoiceLevels } from "./VoiceVisualizer";

interface Props {
  avatarSrc: string | null;
  audioSrc: string | null;
  avatarSize: number;
  avatarPosition?: AvatarPosition | string;
  visualizerStyle?: VisualizerStyle;
  config: IntroAnimationConfig;
}

const SCREEN_DIAG = Math.sqrt(VIDEO_WIDTH ** 2 + VIDEO_HEIGHT ** 2);
const CENTER_Y_RATIO = 0.38;
const RING_PAD = 12;

// ─── Avatar with the shared voice visualizer ──────────────

const IntroAvatarViz: React.FC<{
  avatarSrc: string;
  size: number;
  cx: number;
  cy: number;
  levels: VoiceLevels;
  frame: number;
  fps: number;
  vizStyle?: VisualizerStyle;
  vizOpacity: number;
}> = ({ avatarSrc, size, cx, cy, levels, frame, fps, vizStyle, vizOpacity }) => {
  if (size <= 1) return null;
  const totalSize = vizTotalSize(size);
  return (
    <div
      style={{
        position: "absolute",
        left: cx - totalSize / 2,
        top: cy - totalSize / 2,
        width: totalSize,
        height: totalSize,
        zIndex: 6,
        pointerEvents: "none",
      }}
    >
      <AvatarViz
        avatarSrc={avatarSrc}
        size={size}
        vizStyle={vizStyle}
        levels={levels}
        frame={frame}
        fps={fps}
        vizOpacity={vizOpacity}
      />
    </div>
  );
};

const AvatarStatic: React.FC<{
  avatarSrc: string;
  size: number;
  cx: number;
  cy: number;
}> = ({ avatarSrc, size, cx, cy }) => {
  if (size <= 1) return null;
  return (
    <div
      style={{
        position: "absolute",
        left: cx - size / 2,
        top: cy - size / 2,
        width: size,
        height: size,
        borderRadius: "50%",
        overflow: "hidden",
        border: "2.5px solid rgba(255,255,255,0.85)",
        boxShadow: "0 4px 20px rgba(0,0,0,0.3)",
        zIndex: 6,
      }}
    >
      <Img src={avatarSrc} style={{ width: "100%", height: "100%", objectFit: "cover" }} />
    </div>
  );
};

// ─── Circle Reveal animation (4-spring cascading system) ──

function useCircleRevealAnimation(
  fps: number,
  frame: number,
  avatarSize: number,
  avatarPosition: string,
  config: IntroAnimationConfig,
) {
  const { holdDuration, transitionDuration, backgroundColor } = config;
  const holdFrames = Math.round(holdDuration * fps);
  const staggerFrames = Math.round(transitionDuration * 0.33 * fps);
  const reposDelayFrames = Math.round(transitionDuration * 0.5 * fps);

  // Spring 1: Avatar scales up with bouncy overshoot
  // Low damping = more bounce, lower mass = snappier
  const appearSpring = spring({
    frame,
    fps,
    config: { damping: 7, stiffness: 120, mass: 0.6 },
  });

  // Spring 2: Blue circle closes (starts after hold)
  const blueFrame = Math.max(0, frame - holdFrames);
  const blueClose = frame < holdFrames
    ? 0
    : spring({ frame: blueFrame, fps, config: { damping: 22, stiffness: 80, mass: 0.8 } });

  // Spring 3: White circle closes (starts after hold + stagger)
  const whiteStartFrame = holdFrames + staggerFrames;
  const whiteFrame = Math.max(0, frame - whiteStartFrame);
  const whiteClose = frame < whiteStartFrame
    ? 0
    : spring({ frame: whiteFrame, fps, config: { damping: 22, stiffness: 80, mass: 0.8 } });

  // Spring 4: Avatar repositions to corner (starts after hold + repos delay)
  const reposStartFrame = holdFrames + reposDelayFrames;
  const reposFrame = Math.max(0, frame - reposStartFrame);
  const repos = frame < reposStartFrame
    ? 0
    : spring({ frame: reposFrame, fps, config: { damping: 28, stiffness: 80, mass: 0.8 } });

  // Avatar size: scales up with overshoot, then shrinks to final
  const centeredSize = VIDEO_WIDTH * 0.45;
  const shrinkFactor = 1 - repos * (1 - avatarSize / centeredSize);
  const currentSize = Math.max(0, centeredSize * appearSpring * shrinkFactor);

  // Position: centered during hold, moves to corner
  const { cx: endCX, cy: endCY } = getAvatarCenterCoords(avatarPosition, avatarSize);
  const cx = interpolate(repos, [0, 1], [VIDEO_WIDTH / 2, endCX]);
  const cy = interpolate(repos, [0, 1], [VIDEO_HEIGHT * CENTER_Y_RATIO, endCY]);

  // Blue circle: full screen → ring around avatar
  const blueRadius = interpolate(blueClose, [0, 1], [SCREEN_DIAG, Math.max(currentSize / 2 + RING_PAD, 1)]);

  // White circle: full screen → disappears
  const whiteRadius = interpolate(whiteClose, [0, 1], [SCREEN_DIAG, 0]);

  // Visualizer fades in as blue closes
  const vizOpacity = interpolate(blueClose, [0.2, 0.6], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  // Fade out the blue ring as avatar moves to its final position
  const blueOpacity = 1 - repos;

  return { currentSize, cx, cy, blueRadius, whiteRadius, vizOpacity, blueOpacity, backgroundColor };
}

// ─── Circle Reveal — with audio ───────────────────────────

const CircleRevealWithAudio: React.FC<{
  avatarSrc: string;
  audioSrc: string;
  avatarSize: number;
  avatarPosition: string;
  visualizerStyle?: VisualizerStyle;
  config: IntroAnimationConfig;
}> = ({ avatarSrc, audioSrc, avatarSize, avatarPosition, visualizerStyle, config }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const anim = useCircleRevealAnimation(fps, frame, avatarSize, avatarPosition, config);
  const audioData = useAudioData(audioSrc);
  const levels = getVoiceLevels(audioData, frame, fps);

  return (
    <AbsoluteFill>
      {/* Layer 1: White circle (revealed behind blue, hides bg images) */}
      <div
        style={{
          position: "absolute", inset: 0,
          backgroundColor: "#FFFFFF",
          clipPath: `circle(${anim.whiteRadius}px at ${anim.cx}px ${anim.cy}px)`,
          willChange: "clip-path",
          zIndex: 4,
        }}
      />
      {/* Layer 2: Blue circle (on top, becomes ring, fades during reposition) */}
      <div
        style={{
          position: "absolute", inset: 0,
          backgroundColor: anim.backgroundColor,
          clipPath: `circle(${anim.blueRadius}px at ${anim.cx}px ${anim.cy}px)`,
          opacity: anim.blueOpacity,
          willChange: "clip-path, opacity",
          zIndex: 5,
        }}
      />
      {/* Layer 3: Avatar + visualizer */}
      <IntroAvatarViz
        avatarSrc={avatarSrc}
        size={anim.currentSize}
        cx={anim.cx}
        cy={anim.cy}
        levels={levels}
        frame={frame}
        fps={fps}
        vizStyle={visualizerStyle}
        vizOpacity={anim.vizOpacity}
      />
    </AbsoluteFill>
  );
};

// ─── Circle Reveal — static (no audio) ───────────────────

const CircleRevealStatic: React.FC<{
  avatarSrc: string;
  avatarSize: number;
  avatarPosition: string;
  config: IntroAnimationConfig;
}> = ({ avatarSrc, avatarSize, avatarPosition, config }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const anim = useCircleRevealAnimation(fps, frame, avatarSize, avatarPosition, config);

  return (
    <AbsoluteFill>
      <div
        style={{
          position: "absolute", inset: 0,
          backgroundColor: "#FFFFFF",
          clipPath: `circle(${anim.whiteRadius}px at ${anim.cx}px ${anim.cy}px)`,
          willChange: "clip-path",
          zIndex: 4,
        }}
      />
      <div
        style={{
          position: "absolute", inset: 0,
          backgroundColor: anim.backgroundColor,
          clipPath: `circle(${anim.blueRadius}px at ${anim.cx}px ${anim.cy}px)`,
          opacity: anim.blueOpacity,
          willChange: "clip-path, opacity",
          zIndex: 5,
        }}
      />
      <AvatarStatic
        avatarSrc={avatarSrc}
        size={anim.currentSize}
        cx={anim.cx}
        cy={anim.cy}
      />
    </AbsoluteFill>
  );
};

// ─── Slide Down animation ─────────────────────────────────

function useSlideDownAnimation(
  fps: number,
  frame: number,
  avatarSize: number,
  avatarPosition: string,
  config: IntroAnimationConfig,
) {
  const { holdDuration, transitionDuration, backgroundColor } = config;
  const holdFrames = Math.round(holdDuration * fps);
  const reposDelayFrames = Math.round(transitionDuration * 0.4 * fps);

  const appearSpring = spring({
    frame,
    fps,
    config: { damping: 7, stiffness: 120, mass: 0.6 },
  });

  const slideFrame = Math.max(0, frame - holdFrames);
  const slideProgress = frame < holdFrames
    ? 0
    : spring({ frame: slideFrame, fps, config: { damping: 22, stiffness: 70, mass: 0.9 } });

  const reposStartFrame = holdFrames + reposDelayFrames;
  const reposFrame = Math.max(0, frame - reposStartFrame);
  const repos = frame < reposStartFrame
    ? 0
    : spring({ frame: reposFrame, fps, config: { damping: 28, stiffness: 80, mass: 0.8 } });

  const centeredSize = VIDEO_WIDTH * 0.45;
  const shrinkFactor = 1 - repos * (1 - avatarSize / centeredSize);
  const currentSize = Math.max(0, centeredSize * appearSpring * shrinkFactor);

  const { cx: endCX, cy: endCY } = getAvatarCenterCoords(avatarPosition, avatarSize);
  const cx = interpolate(repos, [0, 1], [VIDEO_WIDTH / 2, endCX]);
  const cy = interpolate(repos, [0, 1], [VIDEO_HEIGHT * CENTER_Y_RATIO, endCY]);

  const slideY = interpolate(slideProgress, [0, 1], [0, VIDEO_HEIGHT]);

  const vizOpacity = interpolate(slideProgress, [0.2, 0.6], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  return { currentSize, cx, cy, slideY, vizOpacity, backgroundColor };
}

// ─── Slide Down — with audio ──────────────────────────────

const SlideDownWithAudio: React.FC<{
  avatarSrc: string;
  audioSrc: string;
  avatarSize: number;
  avatarPosition: string;
  visualizerStyle?: VisualizerStyle;
  config: IntroAnimationConfig;
}> = ({ avatarSrc, audioSrc, avatarSize, avatarPosition, visualizerStyle, config }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const anim = useSlideDownAnimation(fps, frame, avatarSize, avatarPosition, config);
  const audioData = useAudioData(audioSrc);
  const levels = getVoiceLevels(audioData, frame, fps);

  return (
    <AbsoluteFill>
      <div
        style={{
          position: "absolute", inset: 0,
          backgroundColor: anim.backgroundColor,
          transform: `translateY(${anim.slideY}px)`,
          willChange: "transform",
          zIndex: 5,
        }}
      />
      <IntroAvatarViz
        avatarSrc={avatarSrc}
        size={anim.currentSize}
        cx={anim.cx}
        cy={anim.cy}
        levels={levels}
        frame={frame}
        fps={fps}
        vizStyle={visualizerStyle}
        vizOpacity={anim.vizOpacity}
      />
    </AbsoluteFill>
  );
};

// ─── Slide Down — static ─────────────────────────────────

const SlideDownStatic: React.FC<{
  avatarSrc: string;
  avatarSize: number;
  avatarPosition: string;
  config: IntroAnimationConfig;
}> = ({ avatarSrc, avatarSize, avatarPosition, config }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const anim = useSlideDownAnimation(fps, frame, avatarSize, avatarPosition, config);

  return (
    <AbsoluteFill>
      <div
        style={{
          position: "absolute", inset: 0,
          backgroundColor: anim.backgroundColor,
          transform: `translateY(${anim.slideY}px)`,
          willChange: "transform",
          zIndex: 5,
        }}
      />
      <AvatarStatic
        avatarSrc={avatarSrc}
        size={anim.currentSize}
        cx={anim.cx}
        cy={anim.cy}
      />
    </AbsoluteFill>
  );
};

// ─── Main export ──────────────────────────────────────────

export const AnimatedIntro: React.FC<Props> = ({
  avatarSrc, audioSrc, avatarSize, avatarPosition, visualizerStyle, config,
}) => {
  if (!avatarSrc || !config.enabled) return null;
  const position = avatarPosition || "bottom-right";
  const style = config.style || "circleReveal";
  const hasAudio = !!audioSrc;

  if (style === "slideDown") {
    return hasAudio ? (
      <SlideDownWithAudio avatarSrc={avatarSrc} audioSrc={audioSrc!} avatarSize={avatarSize} avatarPosition={position} visualizerStyle={visualizerStyle} config={config} />
    ) : (
      <SlideDownStatic avatarSrc={avatarSrc} avatarSize={avatarSize} avatarPosition={position} config={config} />
    );
  }

  return hasAudio ? (
    <CircleRevealWithAudio avatarSrc={avatarSrc} audioSrc={audioSrc!} avatarSize={avatarSize} avatarPosition={position} visualizerStyle={visualizerStyle} config={config} />
  ) : (
    <CircleRevealStatic avatarSrc={avatarSrc} avatarSize={avatarSize} avatarPosition={position} config={config} />
  );
};
