import React from "react";
import { Composition } from "remotion";
import { VideoComposition } from "./VideoComposition";
import { VIDEO_FPS, VIDEO_HEIGHT, VIDEO_WIDTH, DEFAULT_STYLE, DEFAULT_INTRO_ANIMATION, DEFAULT_OUTRO_CARD } from "./types";

export const RemotionRoot: React.FC = () => {
  return (
    <Composition
      id="ShortVideo"
      component={VideoComposition}
      durationInFrames={VIDEO_FPS * 30}
      fps={VIDEO_FPS}
      width={VIDEO_WIDTH}
      height={VIDEO_HEIGHT}
      defaultProps={{
        audioSrc: null,
        audioDelay: 0,
        musicSrc: null,
        musicVolume: 0.15,
        transcript: [],
        images: [],
        avatarSrc: null,
        intro: null,
        outro: null,
        introAnimation: DEFAULT_INTRO_ANIMATION,
        outroCard: DEFAULT_OUTRO_CARD,
        style: DEFAULT_STYLE,
        durationInSeconds: 30,
      }}
    />
  );
};
