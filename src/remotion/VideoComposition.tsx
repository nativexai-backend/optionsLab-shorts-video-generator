import React from "react";
import { AbsoluteFill, Audio, Sequence } from "remotion";
import { BackgroundSlideshow } from "./BackgroundSlideshow";
import { CaptionOverlay } from "./CaptionOverlay";
import { AvatarOverlay } from "./AvatarOverlay";
import { AnimatedIntro } from "./AnimatedIntro";
import { AnimatedOutro } from "./AnimatedOutro";
import { BrandingBadge } from "./BrandingBadge";
import { IntroOutroOverlay } from "./IntroOutroOverlay";
import { VideoProps, VIDEO_FPS } from "./types";

export const VideoComposition: React.FC<VideoProps> = ({
  audioSrc,
  audioDelay,
  musicSrc,
  musicVolume,
  transcript,
  images,
  avatarSrc,
  intro,
  outro,
  introAnimation,
  outroCard,
  style,
  durationInSeconds,
}) => {
  const audioDelayFrames = Math.round((audioDelay || 0) * VIDEO_FPS);
  const useAnimatedIntro = introAnimation?.enabled;

  return (
    <AbsoluteFill style={{ backgroundColor: "#000" }}>
      <BackgroundSlideshow
        images={images}
        kenBurnsIntensity={style.kenBurnsIntensity}
      />
      <IntroOutroOverlay segment={intro} />
      {!outroCard?.enabled && <IntroOutroOverlay segment={outro} />}
      <CaptionOverlay transcript={transcript} style={style} audioDelay={audioDelay || 0} />
      {useAnimatedIntro ? (
        <AnimatedIntro
          avatarSrc={avatarSrc}
          audioSrc={audioSrc}
          avatarSize={style.avatarSize}
          avatarPosition={style.avatarPosition}
          visualizerStyle={style.visualizerStyle ?? "bars"}
          config={introAnimation}
        />
      ) : (
        <AvatarOverlay
          avatarSrc={avatarSrc}
          audioSrc={audioSrc}
          avatarSize={style.avatarSize}
          avatarPosition={style.avatarPosition}
          visualizerStyle={style.visualizerStyle ?? "bars"}
        />
      )}
      <BrandingBadge
        badgePosition={style.badgePosition ?? "top-left"}
        introAnimation={introAnimation}
        outroCard={outroCard}
        durationInSeconds={durationInSeconds}
      />
      {outroCard?.enabled && (
        <AnimatedOutro
          config={outroCard}
          durationInSeconds={durationInSeconds}
          avatarSrc={avatarSrc}
        />
      )}
      {audioSrc && (
        <Sequence from={audioDelayFrames}>
          <Audio src={audioSrc} />
        </Sequence>
      )}
      {musicSrc && (
        <Audio
          src={musicSrc}
          loop
          volume={(f) => {
            // Fade the music bed out over the last 1.5s
            const totalFrames = Math.round(durationInSeconds * VIDEO_FPS);
            const fadeFrames = Math.round(1.5 * VIDEO_FPS);
            const remaining = totalFrames - f;
            const fade = remaining < fadeFrames ? remaining / fadeFrames : 1;
            return Math.max(0, Math.min(1, (musicVolume ?? 0.15) * fade));
          }}
        />
      )}
    </AbsoluteFill>
  );
};
