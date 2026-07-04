import React from "react";
import { AbsoluteFill } from "remotion";
import type { Candle, ChartSpec } from "./types";

// "Logo spotlight" chart style: the news-photo look — a glowing tablet showing
// the company logo in front of a dark, out-of-focus candlestick wall, with a
// glossy table reflection. Everything derives from the ChartSpec (candles carry
// the trend: up = green-dominant rising field, down = red-dominant falling), so
// one control produces the right scene for any ticker. Deliberately text-free —
// the logo is the only "copy" — to honor the no-baked-text house rule.
//
// Pure render like AnimatedChart: no state, no hooks, frame-deterministic.

interface Props {
  spec: ChartSpec;
  progress: number;
  width: number;
  height: number;
}

const easeOut = (t: number) => 1 - Math.pow(1 - t, 3);
const clamp01 = (t: number) => Math.max(0, Math.min(1, t));
const SANS = "Inter, system-ui, -apple-system, sans-serif";

const smoothPath = (pts: { x: number; y: number }[]): string => {
  if (pts.length < 2) return pts.length ? `M${pts[0].x},${pts[0].y}` : "";
  let d = `M${pts[0].x},${pts[0].y}`;
  for (let i = 0; i < pts.length - 1; i++) {
    const p0 = pts[i - 1] ?? pts[i];
    const p1 = pts[i];
    const p2 = pts[i + 1];
    const p3 = pts[i + 2] ?? p2;
    d += ` C${p1.x + (p2.x - p0.x) / 6},${p1.y + (p2.y - p0.y) / 6} ${p2.x - (p3.x - p1.x) / 6},${p2.y - (p3.y - p1.y) / 6} ${p2.x},${p2.y}`;
  }
  return d;
};

// Simple moving average of closes — the colored "indicator" lines of the wall.
const sma = (candles: Candle[], win: number): number[] => {
  const out: number[] = [];
  for (let i = 0; i < candles.length; i++) {
    const from = Math.max(0, i - win + 1);
    let sum = 0;
    for (let j = from; j <= i; j++) sum += candles[j].c;
    out.push(sum / (i - from + 1));
  }
  return out;
};

// The reference photo has a dense chart wall; short series (custom values,
// 1D range) would look sparse, so tile the series into enough bars, scaling
// each repeat so the overall drift keeps the trend's direction.
const densify = (candles: Candle[], minBars: number): Candle[] => {
  if (candles.length >= minBars) return candles;
  const out: Candle[] = [];
  const drift = candles[candles.length - 1].c - candles[0].o;
  let offset = 0;
  while (out.length < minBars) {
    for (const k of candles) {
      out.push({ o: k.o + offset, h: k.h + offset, l: k.l + offset, c: k.c + offset });
      if (out.length >= minBars) break;
    }
    offset += drift;
  }
  return out;
};

export const LogoSpotlight: React.FC<Props> = ({ spec, progress, width, height }) => {
  const { upColor, downColor, ticker, logo } = spec;
  const w = width;
  const h = height;
  const p = clamp01(progress);

  const candles = densify(spec.candles, 36);
  const n = candles.length;
  if (n < 2) return <AbsoluteFill style={{ backgroundColor: "#04060a" }} />;

  // ── Chart-wall geometry: candles live in the upper ~55% of frame ──
  const plotTop = h * 0.04;
  const plotBottom = h * 0.56;
  const plotH = plotBottom - plotTop;
  let lo = Infinity, hi = -Infinity;
  for (const k of candles) { lo = Math.min(lo, k.l); hi = Math.max(hi, k.h); }
  const span = (hi - lo) || 1;
  const yOf = (price: number) => plotBottom - ((price - lo) / span) * plotH;
  const xOf = (i: number) => (i / (n - 1)) * w;
  const bw = Math.max(2, (w / n) * 0.68);

  // Candle wall draws in over the first half of the segment.
  const visCount = Math.max(2, Math.ceil(easeOut(clamp01(p / 0.5)) * n));

  // Indicator lines: staggered SMAs, offset downward so they fan across the
  // frame like a real multi-indicator terminal instead of hugging the price.
  const maSpecs = [
    { win: Math.max(2, Math.round(n * 0.08)), color: "#e4574f", dy: 0.02 },
    { win: Math.max(3, Math.round(n * 0.16)), color: "#e08a3c", dy: 0.09 },
    { win: Math.max(4, Math.round(n * 0.26)), color: "#3ec6c0", dy: 0.20 },
    { win: Math.max(5, Math.round(n * 0.40)), color: "#3b6fe0", dy: 0.30 },
  ];
  const maPaths = maSpecs.map((m) => ({
    ...m,
    d: smoothPath(sma(candles, m.win).slice(0, visCount).map((v, i) => ({ x: xOf(i), y: yOf(v) + h * m.dy }))),
  }));

  // Volume strip under the candles (heights from each bar's range — real data,
  // deterministic, and it reads exactly like the reference's volume pane).
  const volTop = h * 0.60;
  const volH = h * 0.10;
  const maxRange = Math.max(...candles.map((k) => k.h - k.l)) || 1;

  // ── Device geometry ──
  const devW = w * 0.76;
  const devH = devW * 0.68;
  const devX = (w - devW) / 2;
  const devYCenter = h * 0.565;
  const devY = devYCenter - devH / 2;
  const bezel = devW * 0.045;
  const devIn = easeOut(clamp01((p - 0.18) / 0.3)); // device entrance
  const glow = 0.75 + 0.25 * Math.sin(p * Math.PI); // gentle swell, no flicker

  const initials = ticker.replace(/[^A-Z0-9]/gi, "").slice(0, 2).toUpperCase() || "•";

  const deviceFace = (
    <div
      style={{
        width: devW,
        height: devH,
        borderRadius: devW * 0.055,
        background: "linear-gradient(160deg, #16181d 0%, #060709 60%)",
        border: "1px solid rgba(255,255,255,0.09)",
        padding: bezel,
        boxSizing: "border-box",
      }}
    >
      <div
        style={{
          width: "100%",
          height: "100%",
          borderRadius: devW * 0.028,
          background: "linear-gradient(135deg, #ffffff 0%, #eefafb 45%, #d4eff4 100%)",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          overflow: "hidden",
        }}
      >
        {logo ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={logo} alt="" style={{ width: "68%", height: "56%", objectFit: "contain" }} />
        ) : (
          <span style={{ fontFamily: SANS, fontWeight: 800, fontSize: devH * 0.3, color: "#101418", letterSpacing: "0.02em" }}>
            {initials}
          </span>
        )}
      </div>
    </div>
  );

  return (
    <AbsoluteFill style={{ backgroundColor: "#04060a" }}>
      {/* ── Chart wall (blurred + dimmed = photographed-screen depth) ── */}
      <svg width={w} height={h} style={{ position: "absolute", inset: 0, filter: `blur(${h * 0.004}px) brightness(0.9)` }}>
        {/* faint terminal grid */}
        {[0.12, 0.28, 0.44, 0.6].map((f) => (
          <line key={f} x1={0} y1={h * f} x2={w} y2={h * f} stroke="rgba(255,255,255,0.05)" strokeWidth={1} />
        ))}
        {[0.2, 0.4, 0.6, 0.8].map((f) => (
          <line key={f} x1={w * f} y1={0} x2={w * f} y2={h * 0.72} stroke="rgba(255,255,255,0.04)" strokeWidth={1} />
        ))}

        {/* candles */}
        {candles.slice(0, visCount).map((k, i) => {
          const x = xOf(i);
          const kUp = k.c >= k.o;
          const col = kUp ? upColor : downColor;
          const bodyTop = Math.min(yOf(k.o), yOf(k.c));
          const bodyH = Math.max(2, Math.abs(yOf(k.c) - yOf(k.o)));
          return (
            <g key={i} opacity={0.95}>
              <line x1={x} y1={yOf(k.h)} x2={x} y2={yOf(k.l)} stroke={col} strokeWidth={Math.max(1, bw * 0.18)} />
              <rect x={x - bw / 2} y={bodyTop} width={bw} height={bodyH} fill={col} rx={bw * 0.14} />
            </g>
          );
        })}

        {/* indicator lines */}
        {maPaths.map((m) => (
          <path key={m.color} d={m.d} fill="none" stroke={m.color} strokeWidth={h * 0.0035} opacity={0.85} strokeLinecap="round" />
        ))}

        {/* thick horizontal level + descending trendline, like a marked-up terminal */}
        <line x1={0} y1={h * 0.24} x2={w} y2={h * 0.24} stroke="#2f6bff" strokeWidth={h * 0.006} opacity={0.9} />
        <line x1={w * 0.62} y1={-h * 0.04} x2={w * 1.04} y2={h * 0.3} stroke="#4f7dff" strokeWidth={h * 0.005} opacity={0.8} />

        {/* volume strip */}
        {candles.slice(0, visCount).map((k, i) => {
          const x = xOf(i);
          const vh = Math.max(2, ((k.h - k.l) / maxRange) * volH);
          return (
            <rect
              key={i}
              x={x - bw / 2}
              y={volTop + volH - vh}
              width={bw}
              height={vh}
              fill={k.c >= k.o ? upColor : downColor}
              opacity={0.45}
            />
          );
        })}
      </svg>

      {/* vignette + calm dark lower third (captions land there) */}
      <AbsoluteFill
        style={{
          background:
            "radial-gradient(ellipse 90% 70% at 50% 38%, rgba(0,0,0,0) 45%, rgba(0,0,0,0.52) 100%)," +
            "linear-gradient(to bottom, rgba(0,0,0,0.12) 0%, rgba(0,0,0,0) 30%, rgba(0,0,0,0) 52%, rgba(2,3,6,0.9) 78%, #010204 100%)",
        }}
      />

      {/* light pool the screen throws onto the scene */}
      <div
        style={{
          position: "absolute",
          left: devX - devW * 0.18,
          top: devY - devH * 0.22,
          width: devW * 1.36,
          height: devH * 1.5,
          background: "radial-gradient(ellipse at 50% 45%, rgba(190,235,245,0.17) 0%, rgba(190,235,245,0) 62%)",
          opacity: devIn * glow,
        }}
      />

      {/* ── Device (slight 3D tilt sells the photo) ── */}
      <div
        style={{
          position: "absolute",
          left: devX,
          top: devY,
          opacity: devIn,
          transform: `perspective(${w * 2.2}px) rotateX(3.5deg) rotate(-1.6deg) scale(${0.94 + 0.06 * devIn})`,
          transformOrigin: "50% 60%",
          boxShadow: `0 0 ${devW * 0.22}px rgba(170,225,240,${0.22 * glow}), 0 ${devH * 0.06}px ${devW * 0.12}px rgba(0,0,0,0.55)`,
          borderRadius: devW * 0.055,
        }}
      >
        {deviceFace}
      </div>

      {/* glossy table reflection */}
      <div
        style={{
          position: "absolute",
          left: devX,
          top: devY + devH + h * 0.006,
          opacity: 0.38 * devIn,
          transform: `perspective(${w * 2.2}px) rotateX(-3.5deg) rotate(1.6deg) scaleY(-1)`,
          transformOrigin: "50% 0%",
          filter: "blur(5px)",
          WebkitMaskImage: "linear-gradient(to bottom, rgba(0,0,0,0.7) 0%, rgba(0,0,0,0) 55%)",
          maskImage: "linear-gradient(to bottom, rgba(0,0,0,0.7) 0%, rgba(0,0,0,0) 55%)",
        }}
      >
        {deviceFace}
      </div>

      {/* film grain — the last 5% of "photo" (deterministic SVG noise) */}
      <svg width={w} height={h} style={{ position: "absolute", inset: 0, opacity: 0.05, mixBlendMode: "overlay" }}>
        <filter id="spotGrain">
          <feTurbulence type="fractalNoise" baseFrequency="0.9" numOctaves="2" seed="7" stitchTiles="stitch" />
        </filter>
        <rect width={w} height={h} filter="url(#spotGrain)" />
      </svg>
    </AbsoluteFill>
  );
};
