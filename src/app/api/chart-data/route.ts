import { NextRequest, NextResponse } from "next/server";
import type { Candle, ChartRange, ChartTrend } from "@/remotion/types";

// Fetch real OHLC candles for a ticker, or synthesize a trend-shaped series
// when no data provider is configured. Data is returned to the client and
// embedded in the chart segment, so the video render never hits the network.

const RANGE_MAP: Record<ChartRange, { interval: string; outputsize: number }> = {
  "1D": { interval: "5min", outputsize: 78 },
  "5D": { interval: "30min", outputsize: 65 },
  "1M": { interval: "1day", outputsize: 22 },
  "6M": { interval: "1day", outputsize: 126 },
  "1Y": { interval: "1week", outputsize: 52 },
};

async function fetchTwelveData(ticker: string, range: ChartRange): Promise<Candle[]> {
  const apiKey = process.env.TWELVE_DATA_API_KEY;
  if (!apiKey) throw new Error("no key");
  const { interval, outputsize } = RANGE_MAP[range];
  const url = `https://api.twelvedata.com/time_series?symbol=${encodeURIComponent(ticker)}&interval=${interval}&outputsize=${outputsize}&apikey=${apiKey}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Twelve Data ${res.status}`);
  const data = await res.json();
  if (data.status === "error" || !Array.isArray(data.values)) {
    throw new Error(data.message || "Twelve Data error");
  }
  // Twelve Data returns newest-first — reverse to chronological
  return data.values
    .map((v: { open: string; high: string; low: string; close: string }) => ({
      o: parseFloat(v.open),
      h: parseFloat(v.high),
      l: parseFloat(v.low),
      c: parseFloat(v.close),
    }))
    .reverse();
}

// Per-step drift, scaled by series length so the TOTAL move stays realistic
// regardless of how many candles the range has.
function driftAt(trend: ChartTrend, i: number, n: number): number {
  switch (trend) {
    case "up": return 0.10 / n; // ≈ +10% over the range
    case "down": return -0.10 / n;
    case "volatile": return 0;
    case "crashRecover":
      // ≈ -20% drop over the first 45%, then ≈ +14% recovery (ends down)
      return i < n * 0.45 ? -0.20 / (n * 0.45) : 0.14 / (n * 0.55);
    default: return 0.06 / n;
  }
}

const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));

function syntheticCandles(trend: ChartTrend, n: number): Candle[] {
  const baseVol = trend === "volatile" ? 0.02 : 0.01;
  const maxWiggle = trend === "volatile" ? 0.07 : 0.035; // close stays within this of the trend line
  let trendMult = 1; // deterministic trend → reliable direction
  let wiggle = 0; // bounded AR(1) oscillation → texture without flipping direction
  let vol = baseVol; // volatility clusters like real markets
  let prevClose = 100;
  const out: Candle[] = [];
  for (let i = 0; i < n; i++) {
    trendMult *= 1 + driftAt(trend, i, n);
    const trendPrice = 100 * trendMult;
    vol = clamp(vol + (Math.random() - 0.5) * baseVol * 0.4, baseVol * 0.4, baseVol * 1.8);
    wiggle = clamp(wiggle * 0.85 + (Math.random() - 0.5) * vol * 2, -maxWiggle, maxWiggle);
    const c = Math.max(1, trendPrice * (1 + wiggle));
    const o = prevClose * (1 + (Math.random() - 0.5) * vol * 0.3); // open near prev close
    const h = Math.max(o, c) * (1 + Math.random() * vol * 0.7);
    const l = Math.min(o, c) * (1 - Math.random() * vol * 0.7);
    out.push({ o, h, l, c });
    prevClose = c;
  }
  return out;
}

export async function GET(req: NextRequest) {
  const ticker = (req.nextUrl.searchParams.get("ticker") || "STOCK").toUpperCase().slice(0, 8);
  const range = (req.nextUrl.searchParams.get("range") as ChartRange) || "1D";
  const trend = (req.nextUrl.searchParams.get("trend") as ChartTrend) || "up";
  const n = RANGE_MAP[range]?.outputsize ?? 78;

  // Try the real provider; fall back to a synthetic trend-shaped series.
  try {
    const candles = await fetchTwelveData(ticker, range);
    if (candles.length > 1) {
      return NextResponse.json({ ticker, candles, source: "real" });
    }
  } catch {
    // fall through to synthetic
  }

  return NextResponse.json({ ticker, candles: syntheticCandles(trend, n), source: "synthetic" });
}
