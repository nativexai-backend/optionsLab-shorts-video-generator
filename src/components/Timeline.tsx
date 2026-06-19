"use client";

import React, { useState, useRef, useEffect, useCallback } from "react";
import type { PlayerRef } from "@remotion/player";
import type { ImageSegment, IntroOutroSegment } from "../remotion/types";
import { VIDEO_FPS } from "../remotion/types";
import { useAudioPeaks } from "../hooks/useAudioPeaks";
import { TimelineRuler } from "./TimelineRuler";
import { TimelineWaveform } from "./TimelineWaveform";
import { TimelineImageTrack } from "./TimelineImageTrack";
import { TimelinePlayhead } from "./TimelinePlayhead";

interface Props {
  playerRef: React.RefObject<PlayerRef | null>;
  audioFile: File | null;
  images: ImageSegment[];
  durationInSeconds: number;
  selectedImageIndex: number | null;
  onSelectImage: (index: number) => void;
  onImageTimingChange: (index: number, startTime: number, endTime: number) => void;
  intro: IntroOutroSegment | null;
  outro: IntroOutroSegment | null;
  expanded: boolean;
  onToggleExpanded: () => void;
}

const MAX_PX_PER_SEC = 300;
const GUTTER_WIDTH = 56;
const TRACK_HEIGHT = 40;
const WAVEFORM_HEIGHT = 32;

function formatTime(s: number): string {
  const m = Math.floor(s / 60);
  const sec = Math.floor(s % 60);
  return `${m}:${String(sec).padStart(2, "0")}`;
}

export const Timeline: React.FC<Props> = ({
  playerRef,
  audioFile,
  images,
  durationInSeconds,
  selectedImageIndex,
  onSelectImage,
  onImageTimingChange,
  intro,
  outro,
  expanded,
  onToggleExpanded,
}) => {
  const scrollRef = useRef<HTMLDivElement>(null);
  const [containerWidth, setContainerWidth] = useState(0);
  const [zoomLevel, setZoomLevel] = useState(0); // 0 = fit-to-view, 100 = max zoom

  // Measure available width
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const ro = new ResizeObserver(([entry]) => {
      setContainerWidth(entry.contentRect.width);
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, [expanded]);

  const minPxPerSec = containerWidth > 0 && durationInSeconds > 0
    ? containerWidth / durationInSeconds
    : 80;
  // Zoom 0 = fit-to-view, zoom 100 = MAX_PX_PER_SEC (or minPxPerSec if already larger)
  const maxPxPerSec = Math.max(minPxPerSec, MAX_PX_PER_SEC);
  const pxPerSecond = minPxPerSec + (zoomLevel / 100) * (maxPxPerSec - minPxPerSec);

  const totalWidth = durationInSeconds * pxPerSecond;

  const handleZoomChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    setZoomLevel(Number(e.target.value));
  }, []);
  const bucketCount = Math.max(1, Math.floor(totalWidth / 3));
  const peaks = useAudioPeaks(audioFile, bucketCount);

  // Current time display (updated via interval for simplicity in toolbar)
  const [currentTime, setCurrentTime] = useState(0);
  React.useEffect(() => {
    const player = playerRef.current;
    if (!player) return;
    const update = () => {
      setCurrentTime(player.getCurrentFrame() / VIDEO_FPS);
    };
    const interval = setInterval(update, 250);
    return () => clearInterval(interval);
  }, [playerRef, expanded]);

  const totalHeight = 26 + WAVEFORM_HEIGHT + TRACK_HEIGHT + 8; // ruler + waveform + image track + padding

  if (!expanded) {
    return (
      <div className="border-t border-zinc-800 bg-zinc-950 flex-shrink-0">
        <button
          onClick={onToggleExpanded}
          className="w-full h-9 flex items-center justify-center gap-2 text-xs text-zinc-500 hover:text-zinc-300 transition-colors"
        >
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="18 15 12 9 6 15" />
          </svg>
          Show Timeline
        </button>
      </div>
    );
  }

  return (
    <div className="border-t border-zinc-800 bg-zinc-950 flex-shrink-0 min-w-0 overflow-hidden">
      {/* Toolbar */}
      <div className="h-9 flex items-center gap-3 px-3 border-b border-zinc-800">
        <button
          onClick={onToggleExpanded}
          className="text-xs text-zinc-500 hover:text-zinc-300 transition-colors flex items-center gap-1"
        >
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="6 9 12 15 18 9" />
          </svg>
          Hide
        </button>

        <div className="flex items-center gap-2 ml-auto">
          <span className="text-[10px] text-zinc-400">Zoom</span>
          <input
            type="range"
            min={0}
            max={100}
            value={zoomLevel}
            onChange={handleZoomChange}
            className="w-20 h-1 accent-zinc-500"
          />
          <span className="text-[10px] text-zinc-500 tabular-nums w-16 text-right">
            {formatTime(currentTime)} / {formatTime(durationInSeconds)}
          </span>
        </div>
      </div>

      {/* Track area */}
      <div className="flex min-w-0" style={{ height: totalHeight }}>
        {/* Gutter labels */}
        <div className="flex-shrink-0 border-r border-zinc-800" style={{ width: GUTTER_WIDTH }}>
          <div style={{ height: 26 }} /> {/* ruler offset */}
          <div className="flex items-center justify-end pr-2" style={{ height: WAVEFORM_HEIGHT }}>
            <span className="text-[10px] text-zinc-400">Audio</span>
          </div>
          <div className="flex items-center justify-end pr-2" style={{ height: TRACK_HEIGHT }}>
            <span className="text-[10px] text-zinc-400">Images</span>
          </div>
        </div>

        {/* Scrollable tracks */}
        <div
          ref={scrollRef}
          className="flex-1 overflow-x-auto overflow-y-hidden relative"
        >
          <div style={{ width: totalWidth, minWidth: "100%", position: "relative" }}>
            {/* Ruler */}
            <TimelineRuler
              durationInSeconds={durationInSeconds}
              pxPerSecond={pxPerSecond}
              playerRef={playerRef}
            />

            {/* Waveform */}
            <div style={{ height: WAVEFORM_HEIGHT }}>
              <TimelineWaveform
                peaks={peaks}
                width={totalWidth}
                height={WAVEFORM_HEIGHT}
              />
            </div>

            {/* Image track */}
            <TimelineImageTrack
              images={images}
              durationInSeconds={durationInSeconds}
              pxPerSecond={pxPerSecond}
              selectedIndex={selectedImageIndex}
              onSelect={onSelectImage}
              onTimingChange={onImageTimingChange}
              height={TRACK_HEIGHT}
            />

            {/* Intro/Outro markers */}
            {intro && (
              <div
                className="absolute top-0 pointer-events-none z-10"
                style={{
                  left: intro.startTime * pxPerSecond,
                  width: intro.duration * pxPerSecond,
                  height: 26 + WAVEFORM_HEIGHT + TRACK_HEIGHT,
                }}
              >
                <div className="h-full border-l-2 border-r border-dashed border-emerald-500/60 bg-emerald-500/10">
                  <span className="text-[10px] text-emerald-400 font-medium px-1">Intro</span>
                </div>
              </div>
            )}
            {outro && (
              <div
                className="absolute top-0 pointer-events-none z-10"
                style={{
                  left: outro.startTime * pxPerSecond,
                  width: outro.duration * pxPerSecond,
                  height: 26 + WAVEFORM_HEIGHT + TRACK_HEIGHT,
                }}
              >
                <div className="h-full border-l border-r-2 border-dashed border-amber-500/60 bg-amber-500/10">
                  <span className="text-[10px] text-amber-400 font-medium px-1">Outro</span>
                </div>
              </div>
            )}

            {/* Playhead overlay */}
            <TimelinePlayhead
              playerRef={playerRef}
              pxPerSecond={pxPerSecond}
              height={26 + WAVEFORM_HEIGHT + TRACK_HEIGHT}
              scrollContainerRef={scrollRef}
            />
          </div>
        </div>
      </div>
    </div>
  );
};
