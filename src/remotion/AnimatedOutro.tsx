import React from "react";
import {
  AbsoluteFill,
  Img,
  interpolate,
  spring,
  useCurrentFrame,
  useVideoConfig,
} from "remotion";
import {
  OutroCardConfig,
  OutroCardContent,
  OPTIONSLAB_PRESET,
  VIDEO_WIDTH,
  VIDEO_HEIGHT,
} from "./types";

interface Props {
  config: OutroCardConfig;
  durationInSeconds: number;
  avatarSrc?: string | null;
}

const SCREEN_DIAG = Math.sqrt(VIDEO_WIDTH ** 2 + VIDEO_HEIGHT ** 2);

const OptionsLabLogoInline: React.FC<{ size: number }> = ({ size }) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 26 26"
    fill="none"
    xmlns="http://www.w3.org/2000/svg"
  >
    <path
      d="M9.64608 24.4116C8.62952 25.3863 7.31928 25.9119 5.98795 25.9899H5.31024C3.97741 25.9133 2.66867 25.3863 1.65211 24.4116C0.593374 23.3965 0.0436747 22.0811 0 20.7526V20.4061C0.0436747 19.0776 0.593375 17.7622 1.6506 16.7485L1.65361 16.7456C3.85994 14.6302 7.43976 14.6317 9.64608 16.7471C11.8539 18.8639 11.8524 22.2962 9.64608 24.4116ZM26 25.9899L19.3057 15.1515H9.78012C10.0708 15.3536 10.3464 15.5803 10.6054 15.8287C12.244 17.3997 12.9006 19.5628 12.5723 21.6074C12.3554 22.972 11.6988 24.2831 10.6054 25.3329C10.3539 25.574 10.0858 25.7949 9.80271 25.9913H26V25.9899ZM9.64608 16.7485C7.43976 14.6331 3.85994 14.6317 1.65361 16.7471L1.6506 16.75C0.593375 17.7636 0.0436747 19.0791 0 20.4075V20.7541C0.0436747 22.0825 0.593374 23.3979 1.65211 24.4131C2.66867 25.3877 3.97741 25.9148 5.31024 25.9913C5.53614 26.0014 5.76054 26.0043 5.98795 25.9913C7.31928 25.9133 8.62952 25.3877 9.64608 24.4131C11.8524 22.2977 11.8539 18.8654 9.64608 16.7485ZM19.1205 0L4.57982 13.9386C4.93223 13.8866 5.28765 13.8606 5.6491 13.8606C7.15512 13.8606 8.58885 14.3125 9.78012 15.1515C10.0708 15.3536 10.3464 15.5803 10.6054 15.8287C12.244 17.3997 12.9006 19.5628 12.5723 21.6074L19.1205 0ZM9.64608 16.7485C7.43976 14.6331 3.85994 14.6317 1.65361 16.7471L1.6506 16.75C0.593375 17.7636 0.0436747 19.0791 0 20.4075V20.7541C0.0436747 22.0825 0.593374 23.3979 1.65211 24.4131C2.66867 25.3877 3.97741 25.9148 5.31024 25.9913C5.53614 26.0014 5.76054 26.0043 5.98795 25.9913C7.31928 25.9133 8.62952 25.3877 9.64608 24.4131C11.8524 22.2977 11.8539 18.8654 9.64608 16.7485ZM9.64608 16.7485C7.43976 14.6331 3.85994 14.6317 1.65361 16.7471L1.6506 16.75C0.593375 17.7636 0.0436747 19.0791 0 20.4075V20.7541C0.0436747 22.0825 0.593374 23.3979 1.65211 24.4131C2.66867 25.3877 3.97741 25.9148 5.31024 25.9913C5.53614 26.0014 5.76054 26.0043 5.98795 25.9913C7.31928 25.9133 8.62952 25.3877 9.64608 24.4131C11.8524 22.2977 11.8539 18.8654 9.64608 16.7485Z"
      fill="black"
    />
  </svg>
);

const LOGO_SIZE = 110;
const BADGE_CIRCLE_SIZE = 160;
const TEXT_COLOR = "#3D3D3D";

const OutroCardAnimation: React.FC<Props> = ({ config, durationInSeconds }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const currentTime = frame / fps;

  const { transitionDuration } = config;
  const outroStart = durationInSeconds - transitionDuration;

  if (currentTime < outroStart) return null;

  const content: OutroCardContent = config.usePreset
    ? OPTIONSLAB_PRESET
    : config.custom;
  const backgroundColor = config.usePreset
    ? (config.presetBackgroundColor || content.backgroundColor)
    : content.backgroundColor;

  const f = Math.max(0, frame - Math.round(outroStart * fps));

  const cx = VIDEO_WIDTH / 2;
  const cy = VIDEO_HEIGHT / 2;

  // ── Phase 1: Circle wipe (frames 0-13) ──
  const circleT = spring({
    frame: f,
    fps,
    config: { damping: 20, stiffness: 100, mass: 1 },
  });
  const circleRadius = interpolate(circleT, [0, 1], [0, SCREEN_DIAG]);
  const clipPath = `circle(${circleRadius}px at ${cx}px ${cy}px)`;

  // ── Phase 2: Logo bounce (frames 14-27) ──
  const logoBadgeDelay = 14;
  const logoBadgeFrame = Math.max(0, f - logoBadgeDelay);
  const logoBounce = spring({
    frame: logoBadgeFrame,
    fps,
    config: { damping: 13, stiffness: 140, mass: 1 },
  });
  const logoScale = interpolate(logoBounce, [0, 1], [0, 1]);
  const logoOpacity = interpolate(logoBounce, [0, 0.3], [0, 1], {
    extrapolateRight: "clamp",
  });

  // ── Phase 3: Badge dissolve (frames 28-39) ──
  const badgeDissolveDelay = 28;
  const badgeDissolveFrame = Math.max(0, f - badgeDissolveDelay);
  const badgeDissolveT = spring({
    frame: badgeDissolveFrame,
    fps,
    config: { damping: 22, stiffness: 100, mass: 1 },
  });
  const badgeScale = interpolate(badgeDissolveT, [0, 1], [1, 2.5]);
  const badgeOpacity = interpolate(badgeDissolveT, [0, 1], [1, 0]);

  // ── Phase 4: Text reveal (frames 40-87) ──
  const textPhaseDelay = 40;
  const textFrame = Math.max(0, f - textPhaseDelay);

  // In phase 4, logo stays centered (no slide) — brand name appears next to it
  const logoSlideT = spring({
    frame: textFrame,
    fps,
    config: { damping: 18, stiffness: 80, mass: 1 },
  });

  // Final positions for the logo+brand row, centered as a group
  // Approx row width: logo(110) + gap(12) + brand text(~450) ≈ 572
  const rowWidth = 572;
  const logoFinalX = cx - rowWidth / 2 + LOGO_SIZE / 2;
  const logoRowY = VIDEO_HEIGHT * 0.38;

  // Brand name fade in (6 frame delay)
  const brandFrame = Math.max(0, textFrame - 6);
  const brandT = spring({
    frame: brandFrame,
    fps,
    config: { damping: 20, stiffness: 80, mass: 1 },
  });

  // Tagline fade in (14 frame delay)
  const taglineFrame = Math.max(0, textFrame - 14);
  const taglineT = spring({
    frame: taglineFrame,
    fps,
    config: { damping: 20, stiffness: 80, mass: 1 },
  });

  // Footer fade in (20 frame delay)
  const footerFrame = Math.max(0, textFrame - 20);
  const footerT = spring({
    frame: footerFrame,
    fps,
    config: { damping: 20, stiffness: 80, mass: 1 },
  });

  const showBadge = f >= logoBadgeDelay && badgeOpacity > 0.01;
  const inTextPhase = f >= textPhaseDelay;

  // Logo slides from dead center to its row position
  const currentLogoX = inTextPhase
    ? interpolate(logoSlideT, [0, 1], [cx, logoFinalX])
    : cx;

  return (
    <AbsoluteFill style={{ zIndex: 8 }}>
      {/* Phase 1: Expanding circle fill */}
      <div
        style={{
          position: "absolute",
          inset: 0,
          backgroundColor,
          clipPath,
          willChange: "clip-path",
        }}
      />

      {/* Content layer (clipped by circle) */}
      <div
        style={{
          position: "absolute",
          inset: 0,
          clipPath,
          overflow: "hidden",
        }}
      >
        {/* Phase 2+3: White badge behind logo (dissolves in phase 3) */}
        {showBadge && (
          <div
            style={{
              position: "absolute",
              left: currentLogoX - BADGE_CIRCLE_SIZE / 2,
              top: (inTextPhase ? logoRowY : cy) - BADGE_CIRCLE_SIZE / 2,
              width: BADGE_CIRCLE_SIZE,
              height: BADGE_CIRCLE_SIZE,
              borderRadius: "50%",
              backgroundColor: "white",
              boxShadow: "0 4px 30px rgba(0,0,0,0.12)",
              transform: `scale(${badgeScale})`,
              opacity: badgeOpacity,
              willChange: "transform, opacity",
            }}
          />
        )}

        {/* Logo — always centered horizontally */}
        {f >= logoBadgeDelay && (
          <div
            style={{
              position: "absolute",
              left: currentLogoX - LOGO_SIZE / 2,
              top: (inTextPhase ? logoRowY : cy) - LOGO_SIZE / 2,
              width: LOGO_SIZE,
              height: LOGO_SIZE,
              transform: `scale(${logoScale})`,
              opacity: logoOpacity,
              willChange: "transform, opacity",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            {config.usePreset ? (
              <OptionsLabLogoInline size={LOGO_SIZE} />
            ) : content.logoSrc ? (
              <Img
                src={content.logoSrc}
                style={{
                  width: LOGO_SIZE,
                  height: LOGO_SIZE,
                  objectFit: "contain",
                }}
              />
            ) : null}
          </div>
        )}

        {/* Phase 4: Text elements — centered layout */}
        {inTextPhase && (
          <>
            {/* Brand name — to the right of logo, same row */}
            <div
              style={{
                position: "absolute",
                left: logoFinalX + LOGO_SIZE / 2 + 12,
                top: logoRowY - 45,
                opacity: brandT,
                transform: `translateY(${interpolate(brandT, [0, 1], [24, 0])}px)`,
                willChange: "opacity, transform",
              }}
            >
              <span
                style={{
                  fontSize: 90,
                  fontWeight: 700,
                  color: TEXT_COLOR,
                  fontFamily: "Inter, system-ui, sans-serif",
                  letterSpacing: "-0.03em",
                }}
              >
                {content.brandName}
              </span>
            </div>

            {/* Tagline — centered, below logo+brand row */}
            <div
              style={{
                position: "absolute",
                left: 0,
                right: 0,
                top: logoRowY + LOGO_SIZE / 2 + 30,
                display: "flex",
                justifyContent: "center",
                opacity: taglineT,
                transform: `translateY(${interpolate(taglineT, [0, 1], [24, 0])}px)`,
                willChange: "opacity, transform",
              }}
            >
              <span
                style={{
                  fontSize: 56,
                  fontWeight: 500,
                  color: TEXT_COLOR,
                  fontFamily: "Inter, system-ui, sans-serif",
                }}
              >
                {content.tagline}
              </span>
            </div>

            {/* Footer: App Store badge + disclaimer */}
            <div
              style={{
                position: "absolute",
                left: 10,
                bottom: 80,
                right: 10,
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                gap: 20,
                opacity: footerT,
                transform: `translateY(${interpolate(footerT, [0, 1], [24, 0])}px)`,
                willChange: "opacity, transform",
              }}
            >
              {content.badgeSrc && (
                <Img
                  src={content.badgeSrc}
                  style={{
                    height: 54,
                    width: "auto",
                  }}
                />
              )}
              {content.disclaimer && (
                <span
                  style={{
                    fontSize: 18,
                    fontWeight: 500,
                    color: TEXT_COLOR,
                    fontFamily: "Inter, system-ui, sans-serif",
                    lineHeight: 1.5,
                    textAlign: "center",
                    maxWidth: 700,
                  }}
                >
                  {content.disclaimer}
                </span>
              )}
            </div>
          </>
        )}
      </div>
    </AbsoluteFill>
  );
};


const ModernOutroCard: React.FC<Props> = ({ config, durationInSeconds, avatarSrc }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const currentTime = frame / fps;

  const { transitionDuration } = config;
  const outroStart = durationInSeconds - transitionDuration;

  if (currentTime < outroStart) return null;

  const content: OutroCardContent = config.usePreset
    ? OPTIONSLAB_PRESET
    : config.custom;
  const baseColor = config.usePreset
    ? (config.presetBackgroundColor || content.backgroundColor)
    : content.backgroundColor;

  const f = Math.max(0, frame - Math.round(outroStart * fps));

  const cx = VIDEO_WIDTH / 2;
  const cy = VIDEO_HEIGHT / 2;

  // Circle wipe (same as classic)
  const circleT = spring({
    frame: f,
    fps,
    config: { damping: 20, stiffness: 100, mass: 1 },
  });
  const circleRadius = interpolate(circleT, [0, 1], [0, SCREEN_DIAG]);
  const clipPath = `circle(${circleRadius}px at ${cx}px ${cy}px)`;

  // Staggered element reveals with narrative rhythm
  const makeReveal = (delay: number, springConfig?: { damping: number; stiffness: number }) => {
    const revFrame = Math.max(0, f - delay);
    const cfg = springConfig ?? { damping: 18, stiffness: 80 };
    const t = spring({ frame: revFrame, fps, config: { ...cfg, mass: 1 } });
    return {
      opacity: t,
      transform: `translateY(${interpolate(t, [0, 1], [20, 0])}px)`,
      willChange: "opacity, transform" as const,
    };
  };

  const avatarReveal = makeReveal(10);
  const logoReveal = makeReveal(16);
  const taglineReveal = makeReveal(24);
  const ctaReveal = makeReveal(38, { damping: 22, stiffness: 180 });
  const footerReveal = makeReveal(46, { damping: 26, stiffness: 120 });

  // Darken base color for gradient edge
  const darkerColor = darkenHex(baseColor, 0.3);

  return (
    <AbsoluteFill style={{ zIndex: 8 }}>
      {/* Circle wipe background */}
      <div
        style={{
          position: "absolute",
          inset: 0,
          background: `radial-gradient(circle at 50% 40%, ${baseColor} 0%, ${darkerColor} 100%)`,
          clipPath,
          willChange: "clip-path",
        }}
      />

      {/* Content layer */}
      <div
        style={{
          position: "absolute",
          inset: 0,
          clipPath,
          overflow: "hidden",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          gap: 24,
        }}
      >
        {/* Avatar */}
        {avatarSrc && (
          <div style={avatarReveal}>
            <div
              style={{
                width: 140,
                height: 140,
                borderRadius: "50%",
                overflow: "hidden",
                border: "4px solid rgba(255,255,255,0.85)",
                boxShadow: "0 0 0 6px rgba(255,255,255,0.2), 0 4px 20px rgba(0,0,0,0.15)",
              }}
            >
              <Img
                src={avatarSrc}
                style={{ width: "100%", height: "100%", objectFit: "cover" }}
              />
            </div>
          </div>
        )}

        {/* Logo + Brand Name */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 12,
            ...logoReveal,
          }}
        >
          {config.usePreset ? (
            <OptionsLabLogoInline size={60} />
          ) : content.logoSrc ? (
            <Img src={content.logoSrc} style={{ width: 60, height: 60, objectFit: "contain" }} />
          ) : null}
          <span
            style={{
              fontSize: 64,
              fontWeight: 700,
              color: TEXT_COLOR,
              fontFamily: "Inter, system-ui, sans-serif",
              letterSpacing: "-0.03em",
            }}
          >
            {content.brandName}
          </span>
        </div>

        {/* Tagline */}
        <div style={taglineReveal}>
          <span
            style={{
              fontSize: 40,
              fontWeight: 600,
              color: TEXT_COLOR,
              fontFamily: "Inter, system-ui, sans-serif",
            }}
          >
            {content.tagline}
          </span>
        </div>

        {/* App Store badge CTA */}
        {content.badgeSrc && (
          <div style={ctaReveal}>
            <Img
              src={content.badgeSrc}
              style={{ height: 60, width: "auto" }}
            />
          </div>
        )}

        {/* Footer: disclaimer */}
        <div
          style={{
            position: "absolute",
            left: 10,
            bottom: 70,
            right: 10,
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            gap: 16,
            ...footerReveal,
          }}
        >
          {content.disclaimer && (
            <span
              style={{
                fontSize: 13,
                fontWeight: 500,
                color: TEXT_COLOR,
                fontFamily: "Inter, system-ui, sans-serif",
                lineHeight: 1.5,
                textAlign: "center",
                whiteSpace: "pre-line",
                opacity: 0.85,
              }}
            >
              {content.disclaimer}
            </span>
          )}
        </div>
      </div>
    </AbsoluteFill>
  );
};

// Darken a hex color by a fraction (0-1)
function darkenHex(hex: string, amount: number): string {
  const h = hex.replace("#", "");
  const r = Math.max(0, Math.round(parseInt(h.slice(0, 2), 16) * (1 - amount)));
  const g = Math.max(0, Math.round(parseInt(h.slice(2, 4), 16) * (1 - amount)));
  const b = Math.max(0, Math.round(parseInt(h.slice(4, 6), 16) * (1 - amount)));
  return `#${r.toString(16).padStart(2, "0")}${g.toString(16).padStart(2, "0")}${b.toString(16).padStart(2, "0")}`;
}

export const AnimatedOutro: React.FC<Props> = (props) => {
  if (!props.config.enabled) return null;
  if (props.config.style === "modern") return <ModernOutroCard {...props} />;
  return <OutroCardAnimation {...props} />;
};
