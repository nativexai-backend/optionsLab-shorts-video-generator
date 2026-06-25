"use client";

import React, { useEffect, useRef, useState } from "react";
import { Player, type PlayerRef } from "@remotion/player";
import { Chip } from "./IconButton";
import { VideoComposition } from "../remotion/VideoComposition";
import { VideoProps, VIDEO_FPS, VIDEO_WIDTH, VIDEO_HEIGHT } from "../remotion/types";

interface Props {
  videoProps: VideoProps;
  audioFile: File | null;
  imageFiles: File[];
  showToast: (message: string, type: "error" | "success") => void;
  hasContent: boolean;
  playerRef?: React.RefObject<PlayerRef | null>;
  onOpenSection: (id: string) => void;
  onLoadExample: () => void;
}

const MAX_PLAYER_WIDTH = 360;
const MAX_PLAYER_HEIGHT = 640;

/** Fit a 9:16 player into the available space, capped at 360x640. */
function usePlayerSize() {
  const containerRef = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState({ width: MAX_PLAYER_WIDTH, height: MAX_PLAYER_HEIGHT });

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const ro = new ResizeObserver(([entry]) => {
      const availW = entry.contentRect.width - 24;
      const availH = entry.contentRect.height - 56; // room for the shortcut hint
      const height = Math.max(240, Math.min(MAX_PLAYER_HEIGHT, availH, (availW * 16) / 9));
      const width = (height * 9) / 16;
      setSize({ width: Math.round(width), height: Math.round(height) });
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  return { containerRef, size };
}

const PlayerPanelInner: React.FC<Props> = ({
  videoProps,
  audioFile,
  imageFiles,
  playerRef,
  onOpenSection,
  onLoadExample,
}) => {
  const { containerRef, size } = usePlayerSize();
  const [showSafeZones, setShowSafeZones] = useState(false);

  const durationInFrames = Math.max(
    1,
    Math.round(videoProps.durationInSeconds * VIDEO_FPS)
  );

  const hasAudio = !!audioFile;
  const hasImages = imageFiles.length > 0;
  const hasTranscript = videoProps.transcript.length > 0;
  const showEmptyState = !hasAudio && !hasImages;

  if (showEmptyState) {
    return (
      <div ref={containerRef} className="w-full h-full flex items-center justify-center">
        <div
          className="rounded-xl overflow-hidden border border-zinc-800 flex items-center justify-center bg-zinc-900/50"
          style={{ width: size.width, height: size.height }}
        >
          <div className="text-center px-8 space-y-5">
            <div className="w-14 h-14 mx-auto rounded-full bg-zinc-800 flex items-center justify-center">
              <svg xmlns="http://www.w3.org/2000/svg" width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="text-zinc-500">
                <polygon points="6 3 20 12 6 21 6 3" />
              </svg>
            </div>
            <div>
              <p className="text-sm font-medium text-zinc-200">Create your first video</p>
              <p className="text-xs text-zinc-500 mt-1">Follow the steps in the left panel</p>
            </div>
            <div className="text-left space-y-1 pt-1">
              <StepItem
                num={1}
                checked={hasAudio}
                label="Pick a presenter & write a script"
                onClick={() => onOpenSection("script")}
              />
              <StepItem
                num={2}
                checked={hasImages}
                label="Add visuals"
                onClick={() => onOpenSection("visuals")}
              />
              <StepItem
                num={3}
                checked={hasTranscript}
                label="Review captions"
                onClick={() => onOpenSection("captions")}
              />
              <StepItem
                num={4}
                checked={false}
                label="Brand it & export"
                onClick={() => onOpenSection("branding")}
              />
            </div>
            <button
              onClick={onLoadExample}
              className="text-xs text-blue-400 hover:text-blue-300 underline underline-offset-2 transition-colors"
            >
              or load an example to see how it works
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div ref={containerRef} className="w-full h-full flex flex-col items-center justify-center gap-3">
      <div
        className="relative rounded-xl overflow-hidden shadow-2xl border border-zinc-800"
        style={{ width: size.width, height: size.height }}
      >
        <Player
          ref={playerRef}
          component={VideoComposition}
          inputProps={videoProps}
          durationInFrames={durationInFrames}
          compositionWidth={VIDEO_WIDTH}
          compositionHeight={VIDEO_HEIGHT}
          fps={VIDEO_FPS}
          style={{ width: size.width, height: size.height }}
          controls
          loop
        />
        {showSafeZones && <SafeZoneOverlay />}
      </div>
      <div className="flex items-center gap-3">
        <p className="text-micro text-zinc-600 select-none">
          <kbd className="px-1 py-0.5 bg-zinc-800 rounded text-zinc-500">Space</kbd> play/pause
          <span className="mx-2 text-zinc-800">·</span>
          <kbd className="px-1 py-0.5 bg-zinc-800 rounded text-zinc-500">⌘S</kbd> save
        </p>
        <Chip
          onClick={() => setShowSafeZones((v) => !v)}
          title="Show where TikTok/Reels UI covers the video"
          className={`text-micro px-2 py-0.5 rounded border ${
            showSafeZones
              ? "border-amber-500/50 bg-amber-500/10 text-amber-400"
              : "border-zinc-800 text-zinc-600 hover:text-zinc-400 hover:border-zinc-600"
          }`}
        >
          Safe zones
        </Chip>
      </div>
    </div>
  );
};

/** Approximate areas covered by TikTok/Reels UI — keep captions and key visuals out. */
function SafeZoneOverlay() {
  const zone = "absolute bg-red-500/10 border-dashed border-red-400/50";
  const label = "absolute text-micro font-medium text-red-300/80 px-1";
  return (
    <div className="absolute inset-0 pointer-events-none z-10 select-none">
      {/* Top — username / following tabs */}
      <div className={`${zone} top-0 inset-x-0 border-b`} style={{ height: "9%" }}>
        <span className={`${label} bottom-0 left-1`}>top UI</span>
      </div>
      {/* Right rail — like / comment / share */}
      <div className={`${zone} right-0 border-l`} style={{ top: "38%", bottom: "16%", width: "14%" }}>
        <span className={`${label} top-1 left-0.5`}>buttons</span>
      </div>
      {/* Bottom — caption / music marquee */}
      <div className={`${zone} bottom-0 inset-x-0 border-t`} style={{ height: "16%" }}>
        <span className={`${label} top-0 left-1`}>caption zone</span>
      </div>
    </div>
  );
}

export const PlayerPanel = React.memo(PlayerPanelInner);
PlayerPanel.displayName = "PlayerPanel";

function StepItem({ num, checked, label, onClick }: { num: number; checked: boolean; label: string; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className="w-full flex items-center gap-2.5 px-2 py-1.5 rounded-lg hover:bg-zinc-800/70 transition-colors text-left group"
    >
      <div className={`w-5 h-5 rounded-full flex items-center justify-center flex-shrink-0 text-micro font-semibold ${
        checked ? "bg-green-500/20 text-green-400" : "bg-zinc-800 text-zinc-500 group-hover:text-zinc-300"
      }`}>
        {checked ? (
          <svg xmlns="http://www.w3.org/2000/svg" width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="20 6 9 17 4 12" />
          </svg>
        ) : (
          num
        )}
      </div>
      <span className={`text-xs ${checked ? "text-zinc-300" : "text-zinc-400 group-hover:text-zinc-200"} transition-colors`}>
        {label}
      </span>
    </button>
  );
}
