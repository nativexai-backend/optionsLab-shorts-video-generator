"use client";

import React, { useRef } from "react";
import type { ImageSegment, ImageAnimation, ClipTransform, SceneSuggestion } from "../remotion/types";
import { IMAGE_ANIMATIONS, FULL_FRAME } from "../remotion/types";

interface Props {
  index: number;
  image: ImageSegment;
  scene?: SceneSuggestion;
  durationInSeconds: number;
  onClose: () => void;
  onTimingChange: (index: number, startTime: number, endTime: number) => void;
  onAnimationChange: (index: number, animation: ImageAnimation) => void;
  onTrackChange: (index: number, track: number) => void;
  onTransformChange: (index: number, transform: ClipTransform) => void;
  onReplace: (index: number, file: File) => void;
  onDelete: (index: number) => void;
}

const numClass =
  "w-16 bg-zinc-800 border border-zinc-700 rounded px-1.5 py-1 text-mini text-zinc-200 tabular-nums focus:outline-none focus:border-zinc-500";

function fieldLabel(text: string) {
  return <span className="text-micro text-zinc-500 uppercase tracking-wide">{text}</span>;
}

export const ClipInspector: React.FC<Props> = ({
  index,
  image,
  scene,
  durationInSeconds,
  onClose,
  onTimingChange,
  onAnimationChange,
  onTrackChange,
  onTransformChange,
  onReplace,
  onDelete,
}) => {
  const fileRef = useRef<HTMLInputElement>(null);

  const isChart = !!image.chart;
  const hasImage = !!image.src;
  const track = image.track ?? 0;
  const isOverlay = track > 0;
  const tf = image.transform ?? FULL_FRAME;
  const duration = image.endTime - image.startTime;

  const sceneText = scene?.description || scene?.scriptSegment || (isChart ? `Chart · ${image.chart?.ticker}` : "");

  const setStart = (v: number) => {
    const start = Math.max(0, Math.min(v, image.endTime - 0.1));
    onTimingChange(index, start, image.endTime);
  };
  const setEnd = (v: number) => {
    const end = Math.min(durationInSeconds, Math.max(v, image.startTime + 0.1));
    onTimingChange(index, image.startTime, end);
  };
  const setTf = (patch: Partial<ClipTransform>) => {
    onTransformChange(index, { ...tf, ...patch });
  };

  return (
    <div className="border-t border-zinc-800 bg-zinc-900/80 flex items-stretch gap-3 px-3 py-2 min-w-0">
      {/* Thumbnail */}
      <div className="flex-shrink-0 w-16 h-16 rounded-md overflow-hidden border border-zinc-700 bg-zinc-950 flex items-center justify-center relative">
        {isChart ? (
          <div className="flex flex-col items-center text-emerald-400">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 3v18h18" /><path d="M7 14l3-3 3 3 4-5" /></svg>
            <span className="text-micro font-bold mt-0.5 truncate max-w-[56px]">{image.chart?.ticker}</span>
          </div>
        ) : hasImage ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={image.src} alt="" className="w-full h-full object-cover" />
        ) : (
          <span className="text-micro text-zinc-600 text-center px-1">No image</span>
        )}
      </div>

      {/* Identity + controls */}
      <div className="flex-1 min-w-0 flex flex-col gap-1.5">
        <div className="flex items-center gap-2 min-w-0">
          <span className="text-mini font-semibold text-zinc-200">Clip {index + 1}</span>
          {isOverlay && <span className="text-micro px-1.5 py-0.5 rounded bg-violet-500/20 text-violet-300">Overlay · L{track}</span>}
          {sceneText && <span className="text-mini text-zinc-500 truncate">{sceneText}</span>}
          <button
            onClick={onClose}
            aria-label="Close inspector"
            className="ml-auto flex-shrink-0 text-zinc-500 hover:text-zinc-300"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></svg>
          </button>
        </div>

        <div className="flex items-end gap-3 flex-wrap">
          {/* Timing */}
          <label className="flex flex-col gap-0.5">
            {fieldLabel("Start")}
            <input
              type="number" step="0.1" min={0} max={durationInSeconds}
              value={Number(image.startTime.toFixed(2))}
              onChange={(e) => setStart(parseFloat(e.target.value) || 0)}
              className={numClass}
            />
          </label>
          <label className="flex flex-col gap-0.5">
            {fieldLabel("End")}
            <input
              type="number" step="0.1" min={0} max={durationInSeconds}
              value={Number(image.endTime.toFixed(2))}
              onChange={(e) => setEnd(parseFloat(e.target.value) || 0)}
              className={numClass}
            />
          </label>
          <div className="flex flex-col gap-0.5">
            {fieldLabel("Dur")}
            <span className="text-mini text-zinc-400 tabular-nums py-1">{duration.toFixed(1)}s</span>
          </div>

          {/* Animation (images only) */}
          {!isChart && (
            <label className="flex flex-col gap-0.5">
              {fieldLabel("Animation")}
              <select
                value={image.animation}
                onChange={(e) => onAnimationChange(index, e.target.value as ImageAnimation)}
                className="bg-zinc-800 border border-zinc-700 rounded px-1.5 py-1 text-mini text-zinc-200 focus:outline-none focus:border-zinc-500"
              >
                {IMAGE_ANIMATIONS.map((a) => (
                  <option key={a.value} value={a.value}>{a.label}</option>
                ))}
              </select>
            </label>
          )}

          {/* Layer */}
          <label className="flex flex-col gap-0.5">
            {fieldLabel("Layer")}
            <select
              value={track}
              onChange={(e) => onTrackChange(index, Number(e.target.value))}
              className="bg-zinc-800 border border-zinc-700 rounded px-1.5 py-1 text-mini text-zinc-200 focus:outline-none focus:border-zinc-500"
            >
              <option value={0}>Base (full frame)</option>
              <option value={Math.max(1, track)}>Overlay L{Math.max(1, track)}</option>
            </select>
          </label>

          {/* Transform (overlay only) */}
          {isOverlay && (
            <div className="flex items-end gap-1.5">
              {(["x", "y", "width", "height"] as const).map((k) => (
                <label key={k} className="flex flex-col gap-0.5">
                  {fieldLabel(k === "width" ? "W" : k === "height" ? "H" : k.toUpperCase())}
                  <input
                    type="number" step="0.05" min={0} max={1}
                    value={Number((tf[k]).toFixed(2))}
                    onChange={(e) => setTf({ [k]: Math.max(0, Math.min(1, parseFloat(e.target.value) || 0)) })}
                    className="w-12 bg-zinc-800 border border-zinc-700 rounded px-1.5 py-1 text-mini text-zinc-200 tabular-nums focus:outline-none focus:border-zinc-500"
                  />
                </label>
              ))}
            </div>
          )}

          {/* Actions */}
          <div className="flex items-center gap-1.5 ml-auto">
            {!isChart && (
              <>
                <input
                  ref={fileRef}
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={(e) => {
                    const f = e.target.files?.[0];
                    if (f) onReplace(index, f);
                    e.target.value = "";
                  }}
                />
                <button
                  onClick={() => fileRef.current?.click()}
                  className="px-2 py-1 text-mini text-zinc-300 hover:text-white border border-zinc-700 hover:bg-zinc-800 rounded transition-colors"
                >
                  Replace
                </button>
              </>
            )}
            <button
              onClick={() => onDelete(index)}
              className="px-2 py-1 text-mini text-rose-400 hover:text-white border border-zinc-700 hover:bg-rose-600 rounded transition-colors"
            >
              Delete
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
