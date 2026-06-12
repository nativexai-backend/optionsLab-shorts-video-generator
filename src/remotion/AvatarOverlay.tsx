import React from "react";
import {
  AbsoluteFill,
  Img,
  useCurrentFrame,
  useVideoConfig,
} from "remotion";
import { useAudioData } from "@remotion/media-utils";
import { AvatarPosition, VisualizerStyle, getAvatarPositionStyle } from "./types";
import { AvatarViz, getVoiceLevels, vizTotalSize } from "./VoiceVisualizer";

interface Props {
  avatarSrc: string | null;
  audioSrc: string | null;
  avatarSize: number;
  avatarPosition?: AvatarPosition | string;
  visualizerStyle?: VisualizerStyle;
}

const AvatarWithVisualizer: React.FC<{
  avatarSrc: string;
  audioSrc: string;
  avatarSize: number;
  avatarPosition: AvatarPosition | string;
  visualizerStyle?: VisualizerStyle;
}> = ({ avatarSrc, audioSrc, avatarSize, avatarPosition, visualizerStyle }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  // useAudioData handles delayRender/continueRender internally,
  // ensuring the renderer waits for audio data before capturing frames
  const audioData = useAudioData(audioSrc);
  const levels = getVoiceLevels(audioData, frame, fps);

  const totalSize = vizTotalSize(avatarSize);
  const posStyle = getAvatarPositionStyle(avatarPosition, totalSize);

  return (
    <AbsoluteFill>
      <div
        style={{
          position: "absolute",
          ...posStyle,
          width: totalSize,
          height: totalSize,
        }}
      >
        <AvatarViz
          avatarSrc={avatarSrc}
          size={avatarSize}
          vizStyle={visualizerStyle}
          levels={levels}
          frame={frame}
          fps={fps}
        />
      </div>
    </AbsoluteFill>
  );
};

export const AvatarOverlay: React.FC<Props> = (props) => {
  const position = props.avatarPosition || "bottom-right";
  if (!props.avatarSrc) return null;
  if (!props.audioSrc) {
    const posStyle = getAvatarPositionStyle(position, props.avatarSize);
    return (
      <AbsoluteFill>
        <div
          style={{
            position: "absolute",
            ...posStyle,
            width: props.avatarSize,
            height: props.avatarSize,
            borderRadius: "50%",
            overflow: "hidden",
            border: "3px solid rgba(255,255,255,0.9)",
            boxShadow: "0 4px 20px rgba(0,0,0,0.4)",
          }}
        >
          <Img
            src={props.avatarSrc}
            style={{ width: "100%", height: "100%", objectFit: "cover" }}
          />
        </div>
      </AbsoluteFill>
    );
  }
  return (
    <AvatarWithVisualizer
      avatarSrc={props.avatarSrc}
      audioSrc={props.audioSrc}
      avatarSize={props.avatarSize}
      avatarPosition={position}
      visualizerStyle={props.visualizerStyle}
    />
  );
};
