"use client";

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Candle, ChartSpec, ChartType, ChartRange, ChartTrend,
  CHART_TYPES, CHART_RANGES, DEFAULT_CHART_COLORS,
} from "../remotion/types";
import { AnimatedChart } from "../remotion/AnimatedChart";
import { Chip } from "./IconButton";
import { searchTickers, findTicker, type TickerInfo } from "../lib/tickers";

interface Props {
  open: boolean;
  onClose: () => void;
  onAddChart: (spec: ChartSpec, targetIndex: number | null) => void;
  slotCount: number; // existing timeline image slots, for the "Add to" picker
  selectedIndex: number | null; // currently-selected slot (pre-selects the target)
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

// Build a candle series from a plain list of values (each value is a close;
// open = previous close), so users can plot their own numbers without a feed.
function candlesFromValues(vals: number[]): Candle[] {
  return vals.map((c, i) => {
    const o = i === 0 ? vals[0] : vals[i - 1];
    return { o, h: Math.max(o, c), l: Math.min(o, c), c };
  });
}

// Approximate, evenly-spaced x-axis labels for the chosen range. Synthetic data
// has no real timestamps, so these are illustrative (real dates arrive with a
// market-data key) — they give the chart the familiar time-axis feel.
function axisLabels(range: ChartRange, end: Date): string[] {
  const back = (days: number) => { const x = new Date(end); x.setDate(x.getDate() - days); return x; };
  const dayLbl = (x: Date) => x.toLocaleDateString("en-US", { weekday: "short", day: "numeric" });
  const monDay = (x: Date) => x.toLocaleDateString("en-US", { month: "short", day: "numeric" });
  const mon = (x: Date) => x.toLocaleDateString("en-US", { month: "short" });
  switch (range) {
    case "1D": return ["9:30", "11:30", "1:00", "4:00"];
    case "5D": return [back(4), back(2), back(0)].map(dayLbl);
    case "1M": return [back(28), back(14), back(0)].map(monDay);
    case "6M": return [back(150), back(75), back(0)].map(mon);
    case "1Y": return [back(360), back(180), back(0)].map(mon);
    default: return [];
  }
}

// Searchable ticker picker — type a symbol or company name, then select.
// On pick the parent auto-fills the company name and loads a chart.
const TickerCombobox: React.FC<{
  value: string;
  onChange: (symbol: string) => void;
  onPick: (info: TickerInfo) => void;
}> = ({ value, onChange, onPick }) => {
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const wrapRef = useRef<HTMLDivElement>(null);
  const results = useMemo(() => searchTickers(value, 7), [value]);

  useEffect(() => {
    const onDoc = (e: MouseEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, []);

  const choose = (info: TickerInfo) => { onPick(info); setActive(0); setOpen(false); };

  return (
    <div ref={wrapRef} className="relative">
      <input
        value={value}
        onChange={(e) => { onChange(e.target.value); setActive(0); setOpen(true); }}
        onFocus={() => setOpen(true)}
        onKeyDown={(e) => {
          if (e.key === "ArrowDown") { e.preventDefault(); setOpen(true); setActive((a) => Math.min(a + 1, results.length - 1)); }
          else if (e.key === "ArrowUp") { e.preventDefault(); setActive((a) => Math.max(a - 1, 0)); }
          else if (e.key === "Enter" && open && results[active]) { e.preventDefault(); choose(results[active]); }
          else if (e.key === "Escape" && open) { e.stopPropagation(); setOpen(false); }
        }}
        placeholder="Search ticker or company…"
        className="w-full bg-zinc-800 border border-zinc-700 rounded px-2 py-1.5 text-sm text-zinc-200 placeholder:text-zinc-600 focus-visible:ring-2 focus-visible:ring-blue-500"
      />
      {open && results.length > 0 ? (
        <ul className="absolute z-20 mt-1 w-full max-h-56 overflow-auto bg-zinc-800 border border-zinc-700 rounded-md shadow-xl py-1">
          {results.map((t, i) => (
            <li
              key={t.symbol}
              onMouseDown={(e) => { e.preventDefault(); choose(t); }}
              onMouseEnter={() => setActive(i)}
              className={`flex items-center justify-between gap-2 px-2.5 py-1.5 cursor-pointer ${i === active ? "bg-blue-600/30" : "hover:bg-zinc-700/50"}`}
            >
              <span className="text-sm font-semibold text-zinc-100">{t.symbol}</span>
              <span className="text-mini text-zinc-400 truncate">{t.name}</span>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
};

export const ChartModal: React.FC<Props> = ({ open, onClose, onAddChart, slotCount, selectedIndex, showToast }) => {
  // Which slot the chart replaces — null means a new segment at the end.
  const [targetIndex, setTargetIndex] = useState<number | null>(selectedIndex);
  useEffect(() => { if (open) setTargetIndex(selectedIndex); }, [open, selectedIndex]);
  const [ticker, setTicker] = useState("");
  const [companyName, setCompanyName] = useState("");
  const [range, setRange] = useState<ChartRange>("1D");
  const [trend, setTrend] = useState<ChartTrend>("up");
  const [chartType, setChartType] = useState<ChartType>("line");
  const [theme, setTheme] = useState<"dark" | "light">("dark");
  const [dataMode, setDataMode] = useState<"trend" | "custom">("trend");
  const [customValues, setCustomValues] = useState("");
  const endDate = useMemo(() => new Date(), []);
  const today = useMemo(() => endDate.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }), [endDate]);
  const xLabels = useMemo(() => axisLabels(range, endDate), [range, endDate]);
  const [candles, setCandles] = useState<Candle[] | null>(null);
  const [source, setSource] = useState<"real" | "synthetic" | null>(null);
  const [logo, setLogo] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  // Fetch the ticker's theme-appropriate logo (server proxies the key) and keep
  // it as a self-contained data URL so the chart renders it offline.
  const fetchLogo = useCallback(async (sym: string, th: "dark" | "light") => {
    if (!sym) { setLogo(null); return; }
    try {
      const res = await fetch(`/api/ticker-logo?symbol=${encodeURIComponent(sym)}&theme=${th}`);
      if (!res.ok) { setLogo(null); return; }
      const svg = await res.text();
      setLogo(`data:image/svg+xml,${encodeURIComponent(svg)}`);
    } catch {
      setLogo(null);
    }
  }, []);

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
        xLabels,
        candles,
        chartType,
        theme,
        logo: logo ?? undefined,
        upColor: DEFAULT_CHART_COLORS.up,
        downColor: DEFAULT_CHART_COLORS.down,
        source: source ?? "synthetic",
      }
    : null;

  // Re-fetch the logo when the theme flips (dark/light logos differ).
  useEffect(() => {
    if (candles && ticker) queueMicrotask(() => fetchLogo(ticker.toUpperCase(), theme));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [theme]);

  const fetchData = useCallback(async (sym?: string) => {
    const symbol = (sym ?? ticker).trim().toUpperCase() || "STOCK";

    // Custom mode: plot the user's own numbers — no feed, no synthetic shaping.
    if (dataMode === "custom") {
      const vals = customValues.split(/[\s,]+/).map(Number).filter((n) => Number.isFinite(n));
      if (vals.length < 2) { showToast("Enter at least 2 numbers", "error"); return; }
      setCandles(candlesFromValues(vals));
      setSource("synthetic");
      if (symbol && symbol !== "STOCK") fetchLogo(symbol, theme);
      return;
    }

    setLoading(true);
    try {
      const info = findTicker(symbol);
      const params = new URLSearchParams({ ticker: symbol, range, trend });
      if (info) params.set("base", String(info.price)); // realistic price level for synthetic data
      const res = await fetch(`/api/chart-data?${params.toString()}`);
      const data = await res.json();
      if (!data.candles?.length) throw new Error("No data");
      setCandles(data.candles);
      setSource(data.source);
      fetchLogo(symbol, theme);
    } catch {
      showToast("Couldn't load chart data", "error");
    } finally {
      setLoading(false);
    }
  }, [ticker, range, trend, theme, dataMode, customValues, fetchLogo, showToast]);

  // Selecting a ticker auto-fills the company name and immediately loads its chart.
  const handlePick = useCallback((info: TickerInfo) => {
    setTicker(info.symbol);
    setCompanyName(info.name);
    fetchData(info.symbol);
  }, [fetchData]);

  const handleAdd = useCallback(() => {
    if (!spec) return;
    onAddChart(spec, targetIndex);
    showToast(targetIndex == null ? "Chart added as a new slot" : `Chart added to slot ${targetIndex + 1}`, "success");
    onClose();
  }, [spec, targetIndex, onAddChart, showToast, onClose]);

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
            <p className="text-micro text-zinc-500 mt-1.5 text-center">
              {source === "real" ? "Real market data" : dataMode === "custom" ? "Your custom values" : "Synthetic (shape from trend)"}
            </p>
          )}
        </div>

        {/* Controls */}
        <div className="w-64 flex flex-col gap-3">
          <div>
            <h3 className="text-sm font-medium text-zinc-200">Stock Chart</h3>
            <p className="text-mini text-zinc-500 mt-0.5">Branded chart that draws in as the video plays.</p>
          </div>

          <div>
            <label className="text-xs text-zinc-400 mb-1 block">Ticker</label>
            <TickerCombobox value={ticker} onChange={setTicker} onPick={handlePick} />
          </div>
          <div>
            <label className="text-xs text-zinc-400 mb-1 block">
              Company <span className="text-zinc-600">· auto</span>
            </label>
            <input
              value={companyName}
              onChange={(e) => setCompanyName(e.target.value)}
              placeholder="Auto-filled from ticker"
              className="w-full bg-zinc-800 border border-zinc-700 rounded px-2 py-1.5 text-sm text-zinc-200 placeholder:text-zinc-600 focus-visible:ring-2 focus-visible:ring-blue-500"
            />
          </div>

          {/* Data source: shape from a trend, or plot your own numbers */}
          <div>
            <label className="text-xs text-zinc-400 mb-1 block">Data</label>
            <div className="flex items-center gap-0.5 bg-zinc-800 rounded-md p-0.5">
              {([["trend", "Trend"], ["custom", "Custom numbers"]] as const).map(([val, label]) => (
                <Chip
                  key={val}
                  onClick={() => setDataMode(val)}
                  className={`flex-1 px-2 py-1 text-xs rounded ${dataMode === val ? "bg-zinc-700 text-zinc-100" : "text-zinc-400 hover:text-zinc-200"}`}
                >
                  {label}
                </Chip>
              ))}
            </div>
          </div>

          {dataMode === "custom" ? (
            <div>
              <label className="text-xs text-zinc-400 mb-1 block">Values</label>
              <textarea
                value={customValues}
                onChange={(e) => setCustomValues(e.target.value)}
                placeholder="e.g. 100, 102, 99, 108, 121, 118, 130"
                rows={3}
                className="w-full bg-zinc-800 border border-zinc-700 rounded px-2 py-1.5 text-xs text-zinc-200 placeholder:text-zinc-600 focus-visible:ring-2 focus-visible:ring-blue-500 resize-none"
              />
              <p className="text-micro text-zinc-600 mt-1">Comma, space, or line separated. Each value is a point; the price &amp; change come from your numbers.</p>
            </div>
          ) : (
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="text-xs text-zinc-400 mb-1 block">Range</label>
                <select value={range} onChange={(e) => setRange(e.target.value as ChartRange)} className="w-full bg-zinc-800 border border-zinc-700 rounded px-2 py-1.5 text-xs text-zinc-300">
                  {CHART_RANGES.map((r) => <option key={r.value} value={r.value}>{r.label}</option>)}
                </select>
              </div>
              <div>
                <label className="text-xs text-zinc-400 mb-1 block">Trend</label>
                <select value={trend} onChange={(e) => setTrend(e.target.value as ChartTrend)} className="w-full bg-zinc-800 border border-zinc-700 rounded px-2 py-1.5 text-xs text-zinc-300">
                  {TRENDS.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
                </select>
              </div>
            </div>
          )}

          <button
            onClick={() => fetchData()}
            disabled={loading}
            className="w-full px-3 py-1.5 bg-blue-600 hover:bg-blue-700 disabled:bg-zinc-700 rounded-lg text-xs font-medium text-white transition-colors"
          >
            {loading ? "Loading…" : dataMode === "custom" ? "Plot values" : candles ? "Reload data" : "Load data"}
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

          <div className="mt-auto">
            <label className="text-xs text-zinc-400 mb-1 block">Add to</label>
            <select
              value={targetIndex == null ? "" : String(targetIndex)}
              onChange={(e) => setTargetIndex(e.target.value === "" ? null : Number(e.target.value))}
              className="w-full bg-zinc-800 border border-zinc-700 rounded px-2 py-1.5 text-xs text-zinc-300"
            >
              <option value="">New slot (append)</option>
              {Array.from({ length: slotCount }, (_, i) => (
                <option key={i} value={i}>Replace slot {i + 1}</option>
              ))}
            </select>
          </div>

          <div className="flex gap-2 justify-end pt-1">
            <button onClick={onClose} className="px-3 py-1.5 text-xs text-zinc-400 hover:text-zinc-200 transition-colors">Cancel</button>
            <button
              onClick={handleAdd}
              disabled={!spec}
              className="px-4 py-1.5 text-xs font-medium rounded-md text-white transition-colors disabled:opacity-50"
              style={{ background: "var(--gradient-brand)" }}
            >
              Add to timeline
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
