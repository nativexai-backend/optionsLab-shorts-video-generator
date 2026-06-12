import React, { useRef, useEffect, useCallback } from "react";
import type { PlayerRef, CallbackListener } from "@remotion/player";
import { VIDEO_FPS } from "../remotion/types";

interface Props {
  playerRef: React.RefObject<PlayerRef | null>;
  pxPerSecond: number;
  height: number;
  scrollContainerRef: React.RefObject<HTMLDivElement | null>;
}

export const TimelinePlayhead: React.FC<Props> = ({
  playerRef,
  pxPerSecond,
  height,
  scrollContainerRef,
}) => {
  const lineRef = useRef<HTMLDivElement>(null);
  const rafRef = useRef<number>(0);
  const isPlayingRef = useRef(false);

  const updatePosition = useCallback(() => {
    const player = playerRef.current;
    const line = lineRef.current;
    if (!player || !line) return;
    const frame = player.getCurrentFrame();
    const timeSec = frame / VIDEO_FPS;
    const x = timeSec * pxPerSecond;
    line.style.transform = `translateX(${x}px)`;
  }, [playerRef, pxPerSecond]);

  // rAF loop during playback + polling fallback to recover from Player remounts
  useEffect(() => {
    const tick = () => {
      updatePosition();
      if (isPlayingRef.current) {
        rafRef.current = requestAnimationFrame(tick);
      }
    };

    let currentPlayer = playerRef.current;

    const attachListeners = (player: PlayerRef) => {
      const onPlay: CallbackListener<"play"> = () => {
        isPlayingRef.current = true;
        rafRef.current = requestAnimationFrame(tick);
      };
      const onPause: CallbackListener<"pause"> = () => {
        isPlayingRef.current = false;
        cancelAnimationFrame(rafRef.current);
      };
      const onFrameUpdate: CallbackListener<"frameupdate"> = () => {
        if (!isPlayingRef.current) updatePosition();
      };
      const onSeeked: CallbackListener<"seeked"> = () => {
        updatePosition();
      };

      player.addEventListener("play", onPlay);
      player.addEventListener("pause", onPause);
      player.addEventListener("frameupdate", onFrameUpdate);
      player.addEventListener("seeked", onSeeked);

      if (player.isPlaying()) {
        isPlayingRef.current = true;
        rafRef.current = requestAnimationFrame(tick);
      } else {
        updatePosition();
      }

      return () => {
        cancelAnimationFrame(rafRef.current);
        player.removeEventListener("play", onPlay);
        player.removeEventListener("pause", onPause);
        player.removeEventListener("frameupdate", onFrameUpdate);
        player.removeEventListener("seeked", onSeeked);
      };
    };

    let detach: (() => void) | null = null;
    if (currentPlayer) {
      detach = attachListeners(currentPlayer);
    }

    // Poll to detect Player remount (ref.current changes to new instance)
    const poll = setInterval(() => {
      const latest = playerRef.current;
      if (latest && latest !== currentPlayer) {
        detach?.();
        currentPlayer = latest;
        detach = attachListeners(currentPlayer);
      }
      // Also keep position updated as a fallback
      updatePosition();
    }, 300);

    return () => {
      clearInterval(poll);
      detach?.();
    };
  }, [playerRef, updatePosition]);

  // Dragging on the playhead to scrub
  const handlePointerDown = useCallback(
    (e: React.PointerEvent) => {
      e.preventDefault();
      e.stopPropagation();
      const target = e.currentTarget as HTMLElement;
      target.setPointerCapture(e.pointerId);

      const container = scrollContainerRef.current;
      if (!container) return;

      const scrub = (clientX: number) => {
        const rect = container.getBoundingClientRect();
        const x = clientX - rect.left + container.scrollLeft;
        const timeSec = Math.max(0, x / pxPerSecond);
        const frame = Math.round(timeSec * VIDEO_FPS);
        playerRef.current?.seekTo(frame);
      };

      const onMove = (ev: PointerEvent) => scrub(ev.clientX);
      const onUp = () => {
        target.removeEventListener("pointermove", onMove);
        target.removeEventListener("pointerup", onUp);
      };
      target.addEventListener("pointermove", onMove);
      target.addEventListener("pointerup", onUp);

      scrub(e.clientX);
    },
    [playerRef, pxPerSecond, scrollContainerRef]
  );

  return (
    <div
      ref={lineRef}
      className="absolute top-0 z-30 pointer-events-none"
      style={{ height, willChange: "transform" }}
    >
      {/* Clickable head area */}
      <div
        className="absolute -left-1.5 -top-1 w-3 h-3 bg-red-500 rounded-full cursor-col-resize pointer-events-auto"
        onPointerDown={handlePointerDown}
      />
      {/* Vertical line */}
      <div className="w-px h-full bg-red-500 mx-auto" />
    </div>
  );
};
