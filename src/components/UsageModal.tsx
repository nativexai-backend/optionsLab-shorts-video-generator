"use client";

import React, { useEffect, useState } from "react";
import type { ApiUsage, UsageApi } from "../lib/usage-storage";

interface Props {
  open: boolean;
  onClose: () => void;
}

interface UsageRow {
  projectId: string;
  name: string;
  usage: Record<UsageApi, ApiUsage>;
}
interface UsageResponse {
  projects: UsageRow[];
  totals: Record<UsageApi, ApiUsage>;
}

const fmt = (n: number | undefined) => (n ?? 0).toLocaleString();

function fmtSeconds(s: number | undefined): string {
  const sec = Math.round(s ?? 0);
  if (sec < 60) return `${sec}s`;
  return `${Math.floor(sec / 60)}m ${sec % 60}s`;
}

export const UsageModal: React.FC<Props> = ({ open, onClose }) => {
  const [data, setData] = useState<UsageResponse | null>(null);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    fetch("/api/usage")
      .then((r) => r.json())
      .then((d) => { if (!cancelled) setData(d); })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const h = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, [open, onClose]);

  if (!open) return null;

  const t = data?.totals;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60" onClick={onClose}>
      <div
        className="bg-zinc-900 border border-zinc-700 rounded-xl shadow-2xl flex flex-col w-[720px] max-w-[92vw] max-h-[82vh]"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between p-4 border-b border-zinc-800">
          <h3 className="text-sm font-medium text-zinc-200">API Usage</h3>
          <button onClick={onClose} className="text-zinc-500 hover:text-zinc-200 px-2 text-lg leading-none">×</button>
        </div>

        {/* Overall totals */}
        <div className="grid grid-cols-4 gap-2 p-4">
          <TotalCard label="ElevenLabs" sub="characters ≈ credits" value={fmt(t?.elevenlabs.characters)} calls={t?.elevenlabs.calls} accent="text-amber-400" />
          <TotalCard label="Groq" sub="tokens" value={fmt(t?.groq.tokens)} calls={t?.groq.calls} accent="text-emerald-400" />
          <TotalCard label="Claude" sub="tokens" value={fmt(t?.claude.tokens)} calls={t?.claude.calls} accent="text-violet-400" />
          <TotalCard label="Whisper" sub="audio transcribed" value={fmtSeconds(t?.whisper.seconds)} calls={t?.whisper.calls} accent="text-sky-400" />
        </div>

        {/* Per-project breakdown */}
        <div className="px-4 pb-4 overflow-y-auto">
          <table className="w-full text-[11px]">
            <thead className="text-zinc-500 sticky top-0 bg-zinc-900">
              <tr className="text-left">
                <th className="font-medium py-1.5">Project</th>
                <th className="font-medium py-1.5 text-right">ElevenLabs</th>
                <th className="font-medium py-1.5 text-right">Groq</th>
                <th className="font-medium py-1.5 text-right">Claude</th>
                <th className="font-medium py-1.5 text-right">Whisper</th>
              </tr>
            </thead>
            <tbody>
              {data === null ? (
                <tr><td colSpan={5} className="py-6 text-center text-zinc-500">Loading…</td></tr>
              ) : data.projects.length === 0 ? (
                <tr><td colSpan={5} className="py-6 text-center text-zinc-500">No usage recorded yet.</td></tr>
              ) : (
                data.projects.map((row) => (
                  <tr key={row.projectId} className="border-t border-zinc-800/60">
                    <td className="py-1.5 text-zinc-300 truncate max-w-[220px]" title={row.name}>{row.name}</td>
                    <td className="py-1.5 text-right text-zinc-400 tabular-nums">{fmt(row.usage.elevenlabs.characters)}</td>
                    <td className="py-1.5 text-right text-zinc-400 tabular-nums">{fmt(row.usage.groq.tokens)}</td>
                    <td className="py-1.5 text-right text-zinc-400 tabular-nums">{fmt(row.usage.claude.tokens)}</td>
                    <td className="py-1.5 text-right text-zinc-400 tabular-nums">{fmtSeconds(row.usage.whisper.seconds)}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
          <p className="text-[10px] text-zinc-600 mt-3">
            ElevenLabs characters ≈ credits (current model bills ~1 credit/char). Tracking starts from now — usage before this feature isn&apos;t counted.
          </p>
        </div>
      </div>
    </div>
  );
};

function TotalCard({ label, sub, value, calls, accent }: { label: string; sub: string; value: string; calls?: number; accent: string }) {
  return (
    <div className="bg-zinc-800/50 border border-zinc-800 rounded-lg p-2.5">
      <p className={`text-[10px] font-medium ${accent}`}>{label}</p>
      <p className="text-lg font-semibold text-zinc-100 tabular-nums leading-tight mt-0.5">{value}</p>
      <p className="text-[9px] text-zinc-500">{sub} · {fmt(calls)} call{calls === 1 ? "" : "s"}</p>
    </div>
  );
}
