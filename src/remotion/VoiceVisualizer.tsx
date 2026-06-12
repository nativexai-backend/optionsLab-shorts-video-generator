import React from "react";
import { Img } from "remotion";
import { visualizeAudio, type AudioData } from "@remotion/media-utils";
import type { VisualizerStyle } from "./types";

// Shared audio-reactive avatar used by both the corner overlay and the
// animated intro, so the speaking indicator looks identical throughout.
//
// All motion is derived from the current frame + audio data only —
// Remotion renders frames out of order, so nothing here may keep state.

export const VIZ_BIN_COUNT = 32;

// Soft blue-lavender that sits well on the OptionsLab palette and most b-roll
const ACCENT = "139, 160, 235";

/** Matches the container math in getAvatarPositionStyle / getAvatarCenterCoords. */
export function vizTotalSize(avatarSize: number): number {
  return avatarSize + avatarSize * 0.8 + 16;
}

export interface VoiceLevels {
  bins: number[];
  amplitude: number; // overall loudness 0..1
}

export function getVoiceLevels(
  audioData: AudioData | null,
  frame: number,
  fps: number
): VoiceLevels {
  if (!audioData) {
    return { bins: new Array(VIZ_BIN_COUNT).fill(0), amplitude: 0 };
  }
  const raw = visualizeAudio({
    fps,
    frame,
    audioData,
    numberOfSamples: 64,
    smoothing: true,
  });

  // Voice energy lives in the low bins. Mirror them around the circle so the
  // indicator is symmetric — no "dead side" of silent high-frequency bins.
  const half = VIZ_BIN_COUNT / 2;
  const halfBins = raw
    .slice(1, half + 1)
    .map((v) => Math.min(1, Math.pow(v, 0.6) * 3.5));
  const bins: number[] = [];
  for (let i = 0; i < VIZ_BIN_COUNT; i++) {
    bins.push(halfBins[i < half ? i : VIZ_BIN_COUNT - 1 - i]);
  }

  const low = halfBins.slice(0, 8);
  const amplitude = Math.min(1, (low.reduce((a, b) => a + b, 0) / low.length) * 1.3);

  return { bins, amplitude };
}

// ── Style renderers (SVG layers around the avatar) ──

function PulseRings({ center, ringRadius, amplitude, frame, fps, maxExtent }: {
  center: number;
  ringRadius: number;
  amplitude: number;
  frame: number;
  fps: number;
  maxExtent: number;
}) {
  const period = fps; // one ripple per second per emitter
  const ripples = [0, 0.5].map((offset, i) => {
    const phase = ((frame + offset * period) % period) / period;
    return {
      key: i,
      r: ringRadius + 4 + phase * maxExtent,
      opacity: (1 - phase) * amplitude * 0.65,
    };
  });

  return (
    <>
      {ripples.map((rp) => (
        <circle
          key={rp.key}
          cx={center}
          cy={center}
          r={rp.r}
          fill="none"
          stroke={`rgba(${ACCENT}, ${rp.opacity})`}
          strokeWidth={2}
        />
      ))}
      <circle
        cx={center}
        cy={center}
        r={ringRadius}
        fill="none"
        stroke={`rgba(${ACCENT}, ${0.45 + amplitude * 0.55})`}
        strokeWidth={2 + amplitude * 3.5}
      />
    </>
  );
}

function WaveRing({ center, ringRadius, amplitude, frame, size, gradientId }: {
  center: number;
  ringRadius: number;
  amplitude: number;
  frame: number;
  size: number;
  gradientId: string;
}) {
  const points = 72;
  const maxDeviation = size * 0.09;
  const coords: string[] = [];
  for (let i = 0; i <= points; i++) {
    const theta = (i / points) * Math.PI * 2;
    // Three traveling waves at different speeds — organic, never repeating visibly
    const wobble =
      Math.sin(theta * 3 + frame * 0.1) * 0.45 +
      Math.sin(theta * 5 - frame * 0.07) * 0.35 +
      Math.sin(theta * 8 + frame * 0.13) * 0.2;
    const r = ringRadius + 2 + amplitude * (2 + maxDeviation * (wobble * 0.5 + 0.5));
    const x = center + Math.cos(theta) * r;
    const y = center + Math.sin(theta) * r;
    coords.push(`${i === 0 ? "M" : "L"}${x.toFixed(2)},${y.toFixed(2)}`);
  }
  const d = coords.join(" ") + " Z";

  return (
    <>
      <path
        d={d}
        fill="none"
        stroke={`url(#${gradientId})`}
        strokeWidth={2.5 + amplitude * 1.5}
        strokeLinejoin="round"
        opacity={0.55 + amplitude * 0.45}
      />
      <path
        d={d}
        fill={`rgba(${ACCENT}, ${amplitude * 0.08})`}
        stroke="none"
      />
    </>
  );
}

function BarTicks({ center, ringRadius, bins, size }: {
  center: number;
  ringRadius: number;
  bins: number[];
  size: number;
}) {
  const maxLength = size * 0.22;
  return (
    <>
      <circle
        cx={center}
        cy={center}
        r={ringRadius}
        fill="none"
        stroke="rgba(255,255,255,0.22)"
        strokeWidth={1}
      />
      {bins.map((amp, i) => {
        const angle = (i / bins.length) * Math.PI * 2 - Math.PI / 2;
        const start = ringRadius + 3;
        const length = 2.5 + amp * maxLength;
        const x1 = center + Math.cos(angle) * start;
        const y1 = center + Math.sin(angle) * start;
        const x2 = center + Math.cos(angle) * (start + length);
        const y2 = center + Math.sin(angle) * (start + length);
        return (
          <line
            key={i}
            x1={x1}
            y1={y1}
            x2={x2}
            y2={y2}
            stroke={`rgba(${ACCENT}, ${0.4 + amp * 0.6})`}
            strokeWidth={3}
            strokeLinecap="round"
          />
        );
      })}
    </>
  );
}

// ── Main component ──

export const AvatarViz: React.FC<{
  avatarSrc: string;
  size: number;
  vizStyle: VisualizerStyle | undefined;
  levels: VoiceLevels;
  frame: number;
  fps: number;
  /** Fades the indicator only (the avatar itself stays opaque) — used by the intro. */
  vizOpacity?: number;
}> = ({ avatarSrc, size, vizStyle = "bars", levels, frame, fps, vizOpacity = 1 }) => {
  if (size <= 1) return null;

  const totalSize = vizTotalSize(size);
  const center = totalSize / 2;
  const { bins, amplitude } = levels;
  const ringRadius = size / 2 + 7;
  const maxExtent = size * 0.32;
  const gradientId = `viz-grad-${Math.round(size)}`;

  const breathes = vizStyle === "pulse" || vizStyle === "glow";
  const avatarRenderSize = size * (breathes ? 1 + amplitude * 0.025 : 1);

  const halo =
    vizStyle === "glow"
      ? `0 0 ${6 + amplitude * 34}px ${1 + amplitude * 12}px rgba(255, 255, 255, ${0.06 + amplitude * 0.45})`
      : vizStyle === "pulse"
      ? `0 0 ${8 + amplitude * 26}px ${2 + amplitude * 8}px rgba(${ACCENT}, ${0.08 + amplitude * 0.35})`
      : "none";

  const borderAlpha = vizStyle === "glow" ? 0.55 + amplitude * 0.45 : 0.9;

  return (
    <div style={{ position: "relative", width: totalSize, height: totalSize }}>
      {vizStyle !== "glow" && (
        <svg
          width={totalSize}
          height={totalSize}
          style={{ position: "absolute", top: 0, left: 0, opacity: vizOpacity }}
        >
          <defs>
            <linearGradient id={gradientId} x1="0%" y1="0%" x2="100%" y2="100%">
              <stop offset="0%" stopColor={`rgb(${ACCENT})`} />
              <stop offset="100%" stopColor="rgb(196, 181, 253)" />
            </linearGradient>
          </defs>
          {vizStyle === "pulse" && (
            <PulseRings center={center} ringRadius={ringRadius} amplitude={amplitude} frame={frame} fps={fps} maxExtent={maxExtent} />
          )}
          {vizStyle === "wave" && (
            <WaveRing center={center} ringRadius={ringRadius} amplitude={amplitude} frame={frame} size={size} gradientId={gradientId} />
          )}
          {vizStyle === "bars" && (
            <BarTicks center={center} ringRadius={ringRadius} bins={bins} size={size} />
          )}
        </svg>
      )}

      {/* Halo (pulse + glow styles) */}
      {halo !== "none" && (
        <div
          style={{
            position: "absolute",
            top: center - size / 2 - 4,
            left: center - size / 2 - 4,
            width: size + 8,
            height: size + 8,
            borderRadius: "50%",
            boxShadow: halo,
            opacity: vizOpacity,
          }}
        />
      )}

      {/* Avatar */}
      <div
        style={{
          position: "absolute",
          top: center - avatarRenderSize / 2,
          left: center - avatarRenderSize / 2,
          width: avatarRenderSize,
          height: avatarRenderSize,
          borderRadius: "50%",
          overflow: "hidden",
          border: `3px solid rgba(255,255,255,${borderAlpha})`,
          boxShadow: "0 4px 20px rgba(0,0,0,0.35)",
        }}
      >
        <Img
          src={avatarSrc}
          style={{ width: "100%", height: "100%", objectFit: "cover" }}
        />
      </div>
    </div>
  );
};
