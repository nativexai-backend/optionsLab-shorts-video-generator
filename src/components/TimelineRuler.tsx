import React, { useCallback } from "react";
import type { PlayerRef } from "@remotion/player";
import { VIDEO_FPS } from "../remotion/types";

interface Props {
  durationInSeconds: number;
  pxPerSecond: number;
  playerRef: React.RefObject<PlayerRef | null>;
}

function formatTime(s: number): string {
  const m = Math.floor(s / 60);
  const sec = Math.floor(s % 60);
  return `${m}:${String(sec).padStart(2, "0")}`;
}

function getTickInterval(pxPerSec: number): number {
  if (pxPerSec >= 200) return 0.5;
  if (pxPerSec >= 80) return 1;
  if (pxPerSec >= 40) return 2;
  return 5;
}

export const TimelineRuler: React.FC<Props> = ({
  durationInSeconds,
  pxPerSecond,
  playerRef,
}) => {
  const tickInterval = getTickInterval(pxPerSecond);
  const totalWidth = durationInSeconds * pxPerSecond;

  const handleClick = useCallback(
    (e: React.MouseEvent<HTMLDivElement>) => {
      const rect = e.currentTarget.getBoundingClientRect();
      const x = e.clientX - rect.left;
      const timeSec = x / pxPerSecond;
      const frame = Math.round(timeSec * VIDEO_FPS);
      playerRef.current?.seekTo(frame);
    },
    [pxPerSecond, playerRef]
  );

  const ticks: React.ReactNode[] = [];
  for (let t = 0; t <= durationInSeconds; t += tickInterval) {
    const x = t * pxPerSecond;
    const isMajor = t % (tickInterval * 2) === 0 || tickInterval >= 2;
    ticks.push(
      <div key={t} className="absolute top-0" style={{ left: x }}>
        <div
          className={`w-px ${isMajor ? "h-3 bg-zinc-500" : "h-2 bg-zinc-700"}`}
        />
        {isMajor && (
          <span className="absolute top-3 left-0 -translate-x-1/2 text-micro text-zinc-500 select-none whitespace-nowrap">
            {formatTime(t)}
          </span>
        )}
      </div>
    );
  }

  return (
    <div
      className="relative h-6 cursor-pointer flex-shrink-0"
      style={{ width: totalWidth }}
      onClick={handleClick}
    >
      {ticks}
    </div>
  );
};
