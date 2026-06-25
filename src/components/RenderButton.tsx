"use client";

import React, { useState, useRef, useEffect, useCallback } from "react";
import { Chip } from "./IconButton";
import { VideoProps } from "../remotion/types";

interface Props {
  videoProps: VideoProps;
  audioFile: File | null;
  musicFile: File | null;
  imageFiles: File[];
  introFile: File | null;
  outroFile: File | null;
  outroLogoFile: File | null;
  outroBadgeFile: File | null;
  showToast: (message: string, type: "error" | "success") => void;
  projectName: string;
}

const ACTIVE_JOB_KEY = "vid-render-job";

interface StoredJob {
  id: string;
  name: string;
  startedAt: number;
}

function loadStoredJob(): StoredJob | null {
  try {
    const raw = localStorage.getItem(ACTIVE_JOB_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

// A soft two-note "ding-dong" chime when an export finishes — generated with
// the Web Audio API so there's no asset to ship. Non-fatal if audio is blocked.
function playExportChime() {
  try {
    const Ctx = window.AudioContext || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctx) return;
    const ctx = new Ctx();
    void ctx.resume();
    const now = ctx.currentTime;
    for (const { f, t } of [{ f: 1046.5, t: 0 }, { f: 1396.9, t: 0.16 }]) { // C6 → F6
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = "sine";
      osc.frequency.value = f;
      gain.gain.setValueAtTime(0.0001, now + t);
      gain.gain.exponentialRampToValueAtTime(0.22, now + t + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + t + 0.4);
      osc.connect(gain).connect(ctx.destination);
      osc.start(now + t);
      osc.stop(now + t + 0.45);
    }
    setTimeout(() => ctx.close().catch(() => {}), 900);
  } catch {
    // audio unavailable — ignore
  }
}

const RenderButtonInner: React.FC<Props> = ({
  videoProps,
  audioFile,
  musicFile,
  imageFiles,
  introFile,
  outroFile,
  outroLogoFile,
  outroBadgeFile,
  showToast,
  projectName,
}) => {
  const [job, setJob] = useState<StoredJob | null>(null);
  const [jobStatus, setJobStatus] = useState<"bundling" | "rendering">("bundling");
  const [progress, setProgress] = useState(0);
  const [elapsed, setElapsed] = useState(0);
  const [showNameModal, setShowNameModal] = useState(false);
  const [exportName, setExportName] = useState("");
  const [resolution, setResolution] = useState<"1" | "1.5">("1.5");
  const inputRef = useRef<HTMLInputElement>(null);
  const downloadingRef = useRef(false);

  const rendering = job !== null;
  const ready = !!audioFile;

  const clearJob = useCallback(() => {
    setJob(null);
    setProgress(0);
    localStorage.removeItem(ACTIVE_JOB_KEY);
    downloadingRef.current = false;
  }, []);

  const downloadResult = useCallback(async (j: StoredJob) => {
    if (downloadingRef.current) return;
    downloadingRef.current = true;
    try {
      const res = await fetch(`/api/render?job=${j.id}&download=1`);
      if (!res.ok) throw new Error("Download failed");
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `${j.name}.mp4`;
      a.click();
      URL.revokeObjectURL(url);
      playExportChime();
      showToast("Video exported successfully!", "success");
    } catch (err) {
      showToast(`Export download failed: ${err instanceof Error ? err.message : err}`, "error");
    } finally {
      clearJob();
    }
  }, [showToast, clearJob]);

  // Resume an in-flight render after a reload
  useEffect(() => {
    const stored = loadStoredJob();
    if (stored) queueMicrotask(() => setJob(stored));
  }, []);

  // Poll the active job
  useEffect(() => {
    if (!job) return;
    let cancelled = false;

    const poll = async () => {
      try {
        const res = await fetch(`/api/render?job=${job.id}`);
        if (cancelled) return;
        if (res.status === 404) {
          // Server restarted or job expired
          clearJob();
          return;
        }
        if (!res.ok) return;
        const data = await res.json();
        if (data.status === "done") {
          await downloadResult(job);
        } else if (data.status === "error") {
          showToast(`Export failed: ${data.error ?? "Render failed"}`, "error");
          clearJob();
        } else {
          setJobStatus(data.status === "rendering" ? "rendering" : "bundling");
          setProgress(data.progress ?? 0);
        }
      } catch {
        // Network blip — keep polling
      }
    };

    poll();
    const interval = setInterval(poll, 1000);
    return () => { cancelled = true; clearInterval(interval); };
  }, [job, clearJob, downloadResult, showToast]);

  // Elapsed timer
  useEffect(() => {
    if (!job) { setElapsed(0); return; }
    const update = () => setElapsed(Math.floor((Date.now() - job.startedAt) / 1000));
    update();
    const interval = setInterval(update, 1000);
    return () => clearInterval(interval);
  }, [job]);

  useEffect(() => {
    if (showNameModal) {
      setExportName(projectName || "Untitled");
      setTimeout(() => inputRef.current?.select(), 50);
    }
  }, [showNameModal, projectName]);

  const handleExportClick = () => {
    if (!audioFile) {
      showToast("Generate a voiceover first — pick a presenter and write a script.", "error");
      return;
    }
    setShowNameModal(true);
  };

  const handleExport = async () => {
    setShowNameModal(false);
    const safeName = (exportName || "video").replace(/[^a-zA-Z0-9_\- ]/g, "").trim() || "video";

    try {
      const formData = new FormData();
      formData.append("audio", audioFile!);
      formData.append("scale", resolution);
      if (musicFile) formData.append("music", musicFile);
      if (introFile) formData.append("intro", introFile);
      if (outroFile) formData.append("outro", outroFile);
      if (outroLogoFile) formData.append("outroCardLogo", outroLogoFile);
      if (outroBadgeFile) formData.append("outroCardBadge", outroBadgeFile);
      imageFiles.forEach((f, i) => formData.append(`image_${i}`, f));

      const outroCardServer = videoProps.outroCard ? { ...videoProps.outroCard } : undefined;
      if (outroCardServer && !outroCardServer.usePreset) {
        outroCardServer.custom = { ...outroCardServer.custom };
        if (outroLogoFile) outroCardServer.custom.logoSrc = "__outroCardLogo__";
        if (outroBadgeFile) outroCardServer.custom.badgeSrc = "__outroCardBadge__";
      }

      const serverProps = {
        ...videoProps,
        audioSrc: "__audio__",
        musicSrc: musicFile ? "__music__" : null,
        avatarSrc: videoProps.avatarSrc,
        intro: videoProps.intro
          ? { ...videoProps.intro, src: "__intro__" }
          : null,
        outro: videoProps.outro
          ? { ...videoProps.outro, src: "__outro__" }
          : null,
        outroCard: outroCardServer,
        images: videoProps.images.map((img, i) => ({
          ...img,
          src: `__image_${i}__`,
        })),
      };
      formData.append("videoProps", JSON.stringify(serverProps));

      const res = await fetch("/api/render", { method: "POST", body: formData });
      if (!res.ok) {
        const text = await res.text();
        let errorMsg = "Failed to start render";
        try {
          errorMsg = JSON.parse(text).error || errorMsg;
        } catch {
          errorMsg = text || errorMsg;
        }
        throw new Error(errorMsg);
      }

      const { jobId } = await res.json();
      const stored: StoredJob = { id: jobId, name: safeName, startedAt: Date.now() };
      localStorage.setItem(ACTIVE_JOB_KEY, JSON.stringify(stored));
      setJobStatus("bundling");
      setProgress(0);
      setJob(stored);
    } catch (err) {
      showToast(`Export failed: ${err instanceof Error ? err.message : err}`, "error");
    }
  };

  const pct = Math.round(progress * 100);
  const stageLabel = jobStatus === "bundling" ? "Preparing composition…" : `Rendering frames… ${pct}%`;

  return (
    <>
      <button
        onClick={handleExportClick}
        disabled={rendering}
        title={
          rendering ? "Export in progress..." :
          !ready ? "Generate a voiceover first" : undefined
        }
        className={`px-4 py-1.5 text-sm font-medium rounded-lg transition-all inline-flex items-center gap-1.5 focus-visible:ring-2 focus-visible:ring-blue-500 ${
          rendering
            ? "bg-zinc-800 text-zinc-400 cursor-wait"
            : ready
            ? "text-white shadow-lg shadow-blue-900/30 hover:opacity-90"
            : "bg-zinc-800 text-zinc-500 border border-zinc-700"
        }`}
        style={ready && !rendering ? { background: "var(--gradient-brand)" } : undefined}
      >
        {rendering ? (
          <>
            <svg className="animate-spin h-3.5 w-3.5" viewBox="0 0 24 24" fill="none"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" /><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" /></svg>
            {jobStatus === "rendering" ? `Exporting… ${pct}%` : `Exporting… ${elapsed}s`}
          </>
        ) : (
          <>
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
              <polyline points="7 10 12 15 17 10" />
              <line x1="12" y1="15" x2="12" y2="3" />
            </svg>
            Export MP4
          </>
        )}
      </button>

      {/* Render progress card */}
      {rendering && (
        <div className="fixed bottom-6 right-6 z-50 bg-zinc-900 border border-zinc-700 rounded-xl p-4 w-72 shadow-2xl">
          <div className="flex items-center gap-3">
            <svg className="animate-spin h-5 w-5 text-blue-400 flex-shrink-0" viewBox="0 0 24 24" fill="none"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" /><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" /></svg>
            <div className="flex-1 min-w-0">
              <p className="text-sm text-zinc-200 font-medium">{stageLabel}</p>
              <p className="text-mini text-zinc-500 tabular-nums">{elapsed}s elapsed</p>
            </div>
          </div>
          <div className="mt-3 h-1.5 bg-zinc-800 rounded-full overflow-hidden">
            <div
              className="h-full bg-gradient-to-r from-blue-500 to-violet-500 transition-all duration-500"
              style={{ width: jobStatus === "rendering" ? `${Math.max(2, pct)}%` : "2%" }}
            />
          </div>
          <p className="text-mini text-zinc-500 mt-2.5 leading-snug">
            The render keeps going on the server — your download starts automatically when it&apos;s done, even if you reload this page.
          </p>
        </div>
      )}

      {showNameModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60" onClick={() => setShowNameModal(false)}>
          <div className="bg-zinc-900 border border-zinc-700 rounded-xl p-5 w-80 shadow-2xl" onClick={(e) => e.stopPropagation()}>
            <h3 className="text-sm font-medium text-zinc-200 mb-3">Export Video</h3>
            <label className="text-mini text-zinc-500 mb-1 block">File name</label>
            <input
              ref={inputRef}
              type="text"
              value={exportName}
              onChange={(e) => setExportName(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") handleExport(); if (e.key === "Escape") setShowNameModal(false); }}
              className="w-full px-3 py-2 bg-zinc-800 border border-zinc-600 rounded-lg text-sm text-zinc-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 mb-3"
              placeholder="my-video"
            />
            <label className="text-mini text-zinc-500 mb-1.5 block">Resolution</label>
            <div className="flex gap-2 mb-3">
              <Chip
                onClick={() => setResolution("1.5")}
                className={`flex-1 px-2 py-2 rounded-lg border text-xs ${
                  resolution === "1.5"
                    ? "border-blue-500 bg-blue-500/10 text-blue-300"
                    : "border-zinc-700 bg-zinc-800 text-zinc-400 hover:border-zinc-500"
                }`}
              >
                <span className="block font-medium">1080 × 1920</span>
                <span className="block text-micro opacity-70">Best quality (recommended)</span>
              </Chip>
              <Chip
                onClick={() => setResolution("1")}
                className={`flex-1 px-2 py-2 rounded-lg border text-xs ${
                  resolution === "1"
                    ? "border-blue-500 bg-blue-500/10 text-blue-300"
                    : "border-zinc-700 bg-zinc-800 text-zinc-400 hover:border-zinc-500"
                }`}
              >
                <span className="block font-medium">720 × 1280</span>
                <span className="block text-micro opacity-70">Faster export</span>
              </Chip>
            </div>
            <p className="text-mini text-zinc-500 mb-4">
              ≈ {Math.round(videoProps.durationInSeconds)}s video · typical export takes 1–3 minutes
            </p>
            <div className="flex gap-2 justify-end">
              <button
                onClick={() => setShowNameModal(false)}
                className="px-3 py-1.5 text-xs text-zinc-400 hover:text-zinc-200 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleExport}
                className="px-4 py-1.5 text-xs font-medium rounded-md text-white transition-colors"
                style={{ background: "var(--gradient-brand)" }}
              >
                Export MP4
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
};

export const RenderButton = React.memo(RenderButtonInner);
RenderButton.displayName = "RenderButton";
