import React from "react";
import { AbsoluteFill } from "remotion";
import type { ChartSpec } from "./types";

// A minimal branded stock-chart card that draws in as `progress` (0..1) goes
// 0 → 1. Pure render — no state, no Remotion hooks — so it's frame-deterministic
// and also renders standalone in the modal preview.
//
// Layout:
//   [logo]  TICKER            DATE
//           Company name
//   $price   +change (%)
//   ── faint grid + line chart ──

interface Props {
  spec: ChartSpec;
  progress: number;
  width: number;
  height: number;
}

const easeOut = (t: number) => 1 - Math.pow(1 - t, 2);
const SANS = "Inter, system-ui, -apple-system, sans-serif";

export const AnimatedChart: React.FC<Props> = ({ spec, progress, width, height }) => {
  const { candles, chartType, theme, upColor, downColor, ticker, companyName, date } = spec;
  const n = candles.length;
  const dark = theme !== "light";
  const bg = dark ? "#0d1117" : "#ffffff";
  const textColor = dark ? "#f4f6fb" : "#0d1117";
  const faint = dark ? "rgba(255,255,255,0.4)" : "rgba(0,0,0,0.4)";
  const grid = dark ? "rgba(255,255,255,0.06)" : "rgba(0,0,0,0.06)";

  if (n < 2) return <AbsoluteFill style={{ backgroundColor: bg }} />;

  const first = candles[0].o;
  const last = candles[n - 1].c;
  const up = last >= first;
  const lineColor = up ? upColor : downColor;
  const change = last - first;
  const pct = (change / first) * 100;

  // ── Geometry (proportional to the frame) ──
  const padX = width * 0.06;
  const topPad = height * 0.05;
  const logoD = height * 0.05;
  const logoR = logoD / 2;
  const u = height; // scale unit

  const tickerSize = u * 0.03;
  const companySize = u * 0.019;
  const dateSize = u * 0.02;
  const priceSize = u * 0.044;
  const changeSize = u * 0.026;

  const headerY = topPad + logoR; // logo vertical center
  const textX = padX + logoD + width * 0.025;
  const priceY = topPad + logoD + u * 0.06;

  // Plot occupies the mid band; lower third stays calm for captions.
  const plotTop = priceY + u * 0.03;
  const plotBottom = height * 0.60;
  const plotW = width - padX * 2;
  const plotH = plotBottom - plotTop;

  // Scale to the full series so the axis doesn't jump while drawing.
  let lo = Infinity, hi = -Infinity;
  if (chartType === "candles") {
    for (const k of candles) { lo = Math.min(lo, k.l); hi = Math.max(hi, k.h); }
  } else {
    for (const k of candles) { lo = Math.min(lo, k.c); hi = Math.max(hi, k.c); }
  }
  const span = (hi - lo) || 1;
  lo -= span * 0.12; hi += span * 0.12;
  const yOf = (price: number) => plotBottom - ((price - lo) / (hi - lo)) * plotH;
  const xOf = (i: number) => padX + (i / (n - 1)) * plotW;

  const shown = easeOut(Math.max(0, Math.min(1, progress)));
  const revealX = padX + shown * plotW;
  const visCount = Math.max(2, Math.ceil(shown * n));
  const lastVis = Math.min(n - 1, visCount - 1);

  const initials = ticker.replace(/[^A-Z0-9]/gi, "").slice(0, 2).toUpperCase() || "•";
  const fmtPrice = `$${last.toFixed(2)}`;
  const fmtChange = `${change >= 0 ? "+" : ""}${change.toFixed(2)} (${pct >= 0 ? "+" : ""}${pct.toFixed(2)}%)`;

  const linePts = candles.map((k, i) => `${xOf(i)},${yOf(k.c)}`);
  const linePath = `M${linePts.join(" L")}`;
  const areaPath = `${linePath} L${xOf(n - 1)},${plotBottom} L${xOf(0)},${plotBottom} Z`;

  return (
    <AbsoluteFill>
      <svg width={width} height={height} style={{ position: "absolute", inset: 0 }}>
        <defs>
          <linearGradient id="cArea" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={lineColor} stopOpacity={0.22} />
            <stop offset="100%" stopColor={lineColor} stopOpacity={0} />
          </linearGradient>
          <filter id="cGlow" x="-60%" y="-60%" width="220%" height="220%">
            <feGaussianBlur stdDeviation="5" result="b" />
            <feMerge><feMergeNode in="b" /><feMergeNode in="SourceGraphic" /></feMerge>
          </filter>
          <clipPath id="cReveal"><rect x={0} y={0} width={revealX} height={height} /></clipPath>
        </defs>

        <rect x={0} y={0} width={width} height={height} fill={bg} />

        {/* ── Header: logo + ticker/company, date right ── */}
        <circle cx={padX + logoR} cy={headerY} r={logoR} fill={lineColor} />
        <text x={padX + logoR} y={headerY + logoR * 0.34} textAnchor="middle" fill="#fff" fontFamily={SANS} fontWeight={800} fontSize={logoR * 0.9}>
          {initials}
        </text>

        <text x={textX} y={topPad + tickerSize * 0.92} fill={textColor} fontFamily={SANS} fontWeight={800} fontSize={tickerSize} letterSpacing="0.01em">
          {ticker}
        </text>
        {companyName ? (
          <text x={textX} y={topPad + logoD * 0.96} fill={faint} fontFamily={SANS} fontWeight={500} fontSize={companySize}>
            {companyName}
          </text>
        ) : null}

        {date ? (
          <text x={width - padX} y={topPad + dateSize * 0.92} textAnchor="end" fill={faint} fontFamily={SANS} fontWeight={600} fontSize={dateSize} letterSpacing="0.02em">
            {date}
          </text>
        ) : null}

        {/* ── Price row ── */}
        <text x={padX} y={priceY} fill={textColor} fontFamily={SANS} fontWeight={800} fontSize={priceSize}>
          {fmtPrice}
        </text>
        <text x={padX + width * 0.30} y={priceY} fill={lineColor} fontFamily={SANS} fontWeight={700} fontSize={changeSize}>
          {fmtChange}
        </text>

        {/* ── Faint grid ── */}
        {[0, 0.25, 0.5, 0.75, 1].map((f) => (
          <line key={f} x1={padX} y1={plotTop + f * plotH} x2={width - padX} y2={plotTop + f * plotH} stroke={grid} strokeWidth={1} />
        ))}

        {/* ── Plot ── */}
        {chartType === "candles" ? (
          <g clipPath="url(#cReveal)">
            {candles.slice(0, visCount).map((k, i) => {
              const x = xOf(i);
              const bw = Math.max(2, (plotW / n) * 0.6);
              const kUp = k.c >= k.o;
              const col = kUp ? upColor : downColor;
              const bodyTop = Math.min(yOf(k.o), yOf(k.c));
              const bodyH = Math.max(1.5, Math.abs(yOf(k.c) - yOf(k.o)));
              return (
                <g key={i}>
                  <line x1={x} y1={yOf(k.h)} x2={x} y2={yOf(k.l)} stroke={col} strokeWidth={1.25} />
                  <rect x={x - bw / 2} y={bodyTop} width={bw} height={bodyH} fill={col} rx={1} />
                </g>
              );
            })}
          </g>
        ) : (
          <g clipPath="url(#cReveal)">
            {chartType === "area" && <path d={areaPath} fill="url(#cArea)" />}
            <path d={linePath} fill="none" stroke={lineColor} strokeWidth={3} strokeLinejoin="round" strokeLinecap="round" />
            <circle cx={xOf(lastVis)} cy={yOf(candles[lastVis].c)} r={6} fill={lineColor} filter="url(#cGlow)" />
          </g>
        )}
      </svg>
    </AbsoluteFill>
  );
};
