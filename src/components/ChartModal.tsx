"use client";

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Candle, ChartSpec, ChartType, ChartRange, ChartTrend,
  CHART_TYPES, CHART_RANGES, DEFAULT_CHART_COLORS,
} from "../remotion/types";
import { AnimatedChart } from "../remotion/AnimatedChart";

interface Props {
  open: boolean;
  onClose: () => void;
  onAddChart: (spec: ChartSpec) => void;
  showToast: (message: string, type: "error" | "success") => void;
}

const TRENDS: { value: ChartTrend; label: string }[] = [
  { value: "up", label: "Up" },
  { value: "down", label: "Down" },
  { value: "volatile", label: "Volatile" },
  { value: "crashRecover", label: "Crash → recover" },
];

const PREVIEW_W = 248;
const PREVIEW_H = 441;

export const ChartModal: React.FC<Props> = ({ open, onClose, onAddChart, showToast }) => {
  const [ticker, setTicker] = useState("");
  const [companyName, setCompanyName] = useState("");
  const [range, setRange] = useState<ChartRange>("1D");
  const [trend, setTrend] = useState<ChartTrend>("up");
  const [chartType, setChartType] = useState<ChartType>("line");
  const [theme, setTheme] = useState<"dark" | "light">("dark");
  const today = useMemo(() => new Date().toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }), []);
  const [candles, setCandles] = useState<Candle[] | null>(null);
  const [source, setSource] = useState<"real" | "synthetic" | null>(null);
  const [loading, setLoading] = useState(false);

  // rAF-driven preview progress (0→1, looping) so the preview animates like the video
  const [progress, setProgress] = useState(1);
  const rafRef = useRef<number | null>(null);
  useEffect(() => {
    if (!candles) return;
    let start: number | null = null;
    const dur = 2600;
    const tick = (t: number) => {
      if (start === null) start = t;
      const p = ((t - start) % (dur + 900)) / dur; // brief hold at full before looping
      setProgress(Math.min(1, p));
      rafRef.current = requestAnimationFrame(tick);
    };
    rafRef.current = requestAnimationFrame(tick);
    return () => { if (rafRef.current) cancelAnimationFrame(rafRef.current); };
  }, [candles]);

  useEffect(() => {
    if (!open) return;
    const h = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, [open, onClose]);

  const spec: ChartSpec | null = candles
    ? {
        ticker: ticker.toUpperCase() || "STOCK",
        companyName: companyName.trim() || undefined,
        date: today,
        candles,
        chartType,
        theme,
        upColor: DEFAULT_CHART_COLORS.up,
        downColor: DEFAULT_CHART_COLORS.down,
        source: source ?? "synthetic",
      }
    : null;

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ ticker: ticker || "STOCK", range, trend });
      const res = await fetch(`/api/chart-data?${params.toString()}`);
      const data = await res.json();
      if (!data.candles?.length) throw new Error("No data");
      setCandles(data.candles);
      setSource(data.source);
    } catch {
      showToast("Couldn't load chart data", "error");
    } finally {
      setLoading(false);
    }
  }, [ticker, range, trend, showToast]);

  const handleAdd = useCallback(() => {
    if (!spec) return;
    onAddChart(spec);
    showToast("Chart added to timeline", "success");
    onClose();
  }, [spec, onAddChart, showToast, onClose]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60" onClick={onClose}>
      <div className="bg-zinc-900 border border-zinc-700 rounded-xl p-5 shadow-2xl flex gap-5 max-h-[90vh]" onClick={(e) => e.stopPropagation()}>
        {/* Live preview */}
        <div className="flex-shrink-0">
          <div className="relative rounded-lg overflow-hidden border border-zinc-800 bg-zinc-950" style={{ width: PREVIEW_W, height: PREVIEW_H }}>
            {spec ? (
              <AnimatedChart spec={spec} progress={progress} width={PREVIEW_W} height={PREVIEW_H} />
            ) : (
              <div className="w-full h-full flex items-center justify-center text-center px-6">
                <p className="text-xs text-zinc-500">Enter a ticker and load data to preview the animated chart.</p>
              </div>
            )}
          </div>
          {source && (
            <p className="text-[10px] text-zinc-500 mt-1.5 text-center">
              {source === "real" ? "Real market data" : "Synthetic (no data key — shape from trend)"}
            </p>
          )}
        </div>

        {/* Controls */}
        <div className="w-64 flex flex-col gap-3">
          <div>
            <h3 className="text-sm font-medium text-zinc-200">Stock Chart</h3>
            <p className="text-[11px] text-zinc-500 mt-0.5">Branded chart that draws in as the video plays.</p>
          </div>

          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="text-xs text-zinc-400 mb-1 block">Ticker</label>
              <input
                value={ticker}
                onChange={(e) => setTicker(e.target.value.toUpperCase())}
                placeholder="NVDA"
                className="w-full bg-zinc-800 border border-zinc-700 rounded px-2 py-1.5 text-sm text-zinc-200 placeholder:text-zinc-600 uppercase focus-visible:ring-2 focus-visible:ring-blue-500"
              />
            </div>
            <div>
              <label className="text-xs text-zinc-400 mb-1 block">Company</label>
              <input
                value={companyName}
                onChange={(e) => setCompanyName(e.target.value)}
                placeholder="NVIDIA Corp"
                className="w-full bg-zinc-800 border border-zinc-700 rounded px-2 py-1.5 text-sm text-zinc-200 placeholder:text-zinc-600 focus-visible:ring-2 focus-visible:ring-blue-500"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="text-xs text-zinc-400 mb-1 block">Range</label>
              <select value={range} onChange={(e) => setRange(e.target.value as ChartRange)} className="w-full bg-zinc-800 border border-zinc-700 rounded px-2 py-1.5 text-xs text-zinc-300">
                {CHART_RANGES.map((r) => <option key={r.value} value={r.value}>{r.label}</option>)}
              </select>
            </div>
            <div>
              <label className="text-xs text-zinc-400 mb-1 block">Trend*</label>
              <select value={trend} onChange={(e) => setTrend(e.target.value as ChartTrend)} className="w-full bg-zinc-800 border border-zinc-700 rounded px-2 py-1.5 text-xs text-zinc-300">
                {TRENDS.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
              </select>
            </div>
          </div>
          <p className="text-[9px] text-zinc-600 -mt-1.5">*Trend shapes the chart only when there&apos;s no market-data key.</p>

          <button
            onClick={fetchData}
            disabled={loading}
            className="w-full px-3 py-1.5 bg-blue-600 hover:bg-blue-700 disabled:bg-zinc-700 rounded-lg text-xs font-medium text-white transition-colors"
          >
            {loading ? "Loading…" : candles ? "Reload data" : "Load data"}
          </button>

          {candles && (
            <>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="text-xs text-zinc-400 mb-1 block">Style</label>
                  <select value={chartType} onChange={(e) => setChartType(e.target.value as ChartType)} className="w-full bg-zinc-800 border border-zinc-700 rounded px-2 py-1.5 text-xs text-zinc-300">
                    {CHART_TYPES.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
                  </select>
                </div>
                <div>
                  <label className="text-xs text-zinc-400 mb-1 block">Theme</label>
                  <select value={theme} onChange={(e) => setTheme(e.target.value as "dark" | "light")} className="w-full bg-zinc-800 border border-zinc-700 rounded px-2 py-1.5 text-xs text-zinc-300">
                    <option value="dark">Dark</option>
                    <option value="light">Light</option>
                  </select>
                </div>
              </div>
            </>
          )}

          <div className="mt-auto flex gap-2 justify-end pt-2">
            <button onClick={onClose} className="px-3 py-1.5 text-xs text-zinc-400 hover:text-zinc-200 transition-colors">Cancel</button>
            <button
              onClick={handleAdd}
              disabled={!spec}
              className="px-4 py-1.5 text-xs font-medium rounded-md text-white transition-colors disabled:opacity-50"
              style={{ background: "linear-gradient(135deg, #2563eb, #7c3aed)" }}
            >
              Add to timeline
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
