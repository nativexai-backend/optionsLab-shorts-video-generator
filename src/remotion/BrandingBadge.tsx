import React from "react";
import {
  AbsoluteFill,
  interpolate,
  spring,
  useCurrentFrame,
  useVideoConfig,
} from "remotion";
import type {
  BadgePosition,
  IntroAnimationConfig,
  OutroCardConfig,
} from "./types";

interface Props {
  badgePosition: BadgePosition | string;
  introAnimation: IntroAnimationConfig;
  outroCard: OutroCardConfig;
  durationInSeconds: number;
}

const OptionsLabLogoSmall: React.FC = () => (
  <svg
    width={24}
    height={24}
    viewBox="0 0 26 26"
    fill="none"
    xmlns="http://www.w3.org/2000/svg"
  >
    <path
      d="M9.64608 24.4116C8.62952 25.3863 7.31928 25.9119 5.98795 25.9899H5.31024C3.97741 25.9133 2.66867 25.3863 1.65211 24.4116C0.593374 23.3965 0.0436747 22.0811 0 20.7526V20.4061C0.0436747 19.0776 0.593375 17.7622 1.6506 16.7485L1.65361 16.7456C3.85994 14.6302 7.43976 14.6317 9.64608 16.7471C11.8539 18.8639 11.8524 22.2962 9.64608 24.4116ZM26 25.9899L19.3057 15.1515H9.78012C10.0708 15.3536 10.3464 15.5803 10.6054 15.8287C12.244 17.3997 12.9006 19.5628 12.5723 21.6074C12.3554 22.972 11.6988 24.2831 10.6054 25.3329C10.3539 25.574 10.0858 25.7949 9.80271 25.9913H26V25.9899ZM9.64608 16.7485C7.43976 14.6331 3.85994 14.6317 1.65361 16.7471L1.6506 16.75C0.593375 17.7636 0.0436747 19.0791 0 20.4075V20.7541C0.0436747 22.0825 0.593374 23.3979 1.65211 24.4131C2.66867 25.3877 3.97741 25.9148 5.31024 25.9913C5.53614 26.0014 5.76054 26.0043 5.98795 25.9913C7.31928 25.9133 8.62952 25.3877 9.64608 24.4131C11.8524 22.2977 11.8539 18.8654 9.64608 16.7485ZM19.1205 0L4.57982 13.9386C4.93223 13.8866 5.28765 13.8606 5.6491 13.8606C7.15512 13.8606 8.58885 14.3125 9.78012 15.1515C10.0708 15.3536 10.3464 15.5803 10.6054 15.8287C12.244 17.3997 12.9006 19.5628 12.5723 21.6074L19.1205 0ZM9.64608 16.7485C7.43976 14.6331 3.85994 14.6317 1.65361 16.7471L1.6506 16.75C0.593375 17.7636 0.0436747 19.0791 0 20.4075V20.7541C0.0436747 22.0825 0.593374 23.3979 1.65211 24.4131C2.66867 25.3877 3.97741 25.9148 5.31024 25.9913C5.53614 26.0014 5.76054 26.0043 5.98795 25.9913C7.31928 25.9133 8.62952 25.3877 9.64608 24.4131C11.8524 22.2977 11.8539 18.8654 9.64608 16.7485ZM9.64608 16.7485C7.43976 14.6331 3.85994 14.6317 1.65361 16.7471L1.6506 16.75C0.593375 17.7636 0.0436747 19.0791 0 20.4075V20.7541C0.0436747 22.0825 0.593374 23.3979 1.65211 24.4131C2.66867 25.3877 3.97741 25.9148 5.31024 25.9913C5.53614 26.0014 5.76054 26.0043 5.98795 25.9913C7.31928 25.9133 8.62952 25.3877 9.64608 24.4131C11.8524 22.2977 11.8539 18.8654 9.64608 16.7485Z"
      fill="white"
    />
  </svg>
);

function getBadgePositionStyle(position: BadgePosition | string): React.CSSProperties {
  // Top inset matches the side inset so the corner spacing reads even
  switch (position) {
    case "bottom-left":
      return { bottom: 50, left: 16 };
    case "bottom-right":
      return { bottom: 50, right: 16 };
    case "top-left":
      return { top: 16, left: 16 };
    case "top-right":
      return { top: 16, right: 16 };
    default:
      return { bottom: 50, left: 16 };
  }
}

export const BrandingBadge: React.FC<Props> = ({
  badgePosition,
  introAnimation,
  outroCard,
  durationInSeconds,
}) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const currentTime = frame / fps;

  // Calculate intro phase end time
  const introEnabled = introAnimation?.enabled;
  const introEnd = introEnabled
    ? (introAnimation.holdDuration ?? 0.5) + (introAnimation.transitionDuration ?? 1.0)
    : 0;

  // Calculate outro start time
  const outroEnabled = outroCard?.enabled;
  const outroStart = outroEnabled
    ? durationInSeconds - (outroCard.transitionDuration ?? 4.0)
    : durationInSeconds;

  // Hidden during intro and outro phases
  if (currentTime < introEnd || currentTime >= outroStart) return null;

  // Fade in with spring after intro completes
  const fadeInFrame = Math.max(0, frame - Math.round(introEnd * fps));
  const fadeT = spring({
    frame: fadeInFrame,
    fps,
    config: { damping: 20, stiffness: 80, mass: 1 },
  });
  const opacity = interpolate(fadeT, [0, 1], [0, 1]);
  const translateY = interpolate(fadeT, [0, 1], [8, 0]);

  const positionStyle = getBadgePositionStyle(badgePosition);

  return (
    <AbsoluteFill style={{ zIndex: 5, pointerEvents: "none" }}>
      <div
        style={{
          position: "absolute",
          ...positionStyle,
          display: "flex",
          alignItems: "center",
          gap: 8,
          padding: "8px 12px",
          borderRadius: 50,
          background: "rgba(0, 0, 0, 0.45)",
          backdropFilter: "blur(12px)",
          WebkitBackdropFilter: "blur(12px)",
          border: "1px solid rgba(255, 255, 255, 0.12)",
          opacity,
          transform: `translateY(${translateY}px)`,
          willChange: "opacity, transform",
        }}
      >
        <OptionsLabLogoSmall />
        <span
          style={{
            fontSize: 17,
            fontWeight: 600,
            color: "white",
            fontFamily: "Inter, system-ui, sans-serif",
            letterSpacing: "-0.01em",
            lineHeight: 1,
          }}
        >
          OptionsLab App
        </span>
        <span
          style={{
            fontSize: 11,
            fontWeight: 600,
            color: "rgba(0, 0, 0, 0.85)",
            fontFamily: "Inter, system-ui, sans-serif",
            background: "rgba(255, 255, 255, 0.9)",
            padding: "4px 9px",
            borderRadius: 50,
            lineHeight: 1,
            letterSpacing: "0.01em",
          }}
        >
          Download free
        </span>
      </div>
    </AbsoluteFill>
  );
};
