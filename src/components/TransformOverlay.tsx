"use client";

import React, { useCallback, useRef } from "react";
import type { ClipTransform } from "../remotion/types";

interface Props {
  transform: ClipTransform;
  playerWidth: number;
  playerHeight: number;
  onChange: (transform: ClipTransform) => void;
}

const MIN_SIZE = 0.08; // normalized — keep the box grabbable

/**
 * Drag/resize editing box for the selected overlay (picture-in-picture) clip,
 * rendered over the preview player. Values are normalized 0..1 and flow through
 * the same onChange as the ClipInspector's numeric fields (which remain the
 * fine-tune path).
 */
export const TransformOverlay: React.FC<Props> = ({
  transform,
  playerWidth,
  playerHeight,
  onChange,
}) => {
  // Start-of-gesture snapshot so each move recomputes from stable values
  const gestureRef = useRef<{
    mode: "move" | "resize";
    startX: number;
    startY: number;
    orig: ClipTransform;
  } | null>(null);

  const startGesture = useCallback(
    (mode: "move" | "resize") => (e: React.PointerEvent) => {
      e.preventDefault();
      e.stopPropagation();
      const target = e.currentTarget as HTMLElement;
      target.setPointerCapture(e.pointerId);
      gestureRef.current = { mode, startX: e.clientX, startY: e.clientY, orig: transform };

      const onMove = (ev: PointerEvent) => {
        const g = gestureRef.current;
        if (!g) return;
        const dx = (ev.clientX - g.startX) / playerWidth;
        const dy = (ev.clientY - g.startY) / playerHeight;
        if (g.mode === "move") {
          onChange({
            ...g.orig,
            x: Math.max(0, Math.min(g.orig.x + dx, 1 - g.orig.width)),
            y: Math.max(0, Math.min(g.orig.y + dy, 1 - g.orig.height)),
          });
        } else {
          const width = Math.max(MIN_SIZE, Math.min(g.orig.width + dx, 1 - g.orig.x));
          const height = Math.max(MIN_SIZE, Math.min(g.orig.height + dy, 1 - g.orig.y));
          onChange({ ...g.orig, width, height });
        }
      };
      const onUp = () => {
        gestureRef.current = null;
        target.removeEventListener("pointermove", onMove);
        target.removeEventListener("pointerup", onUp);
      };
      target.addEventListener("pointermove", onMove);
      target.addEventListener("pointerup", onUp);
    },
    [transform, playerWidth, playerHeight, onChange]
  );

  return (
    <div className="absolute inset-0 z-20 pointer-events-none select-none">
      <div
        className="absolute border-2 border-blue-400 bg-blue-400/10 cursor-move pointer-events-auto rounded-sm shadow-[0_0_0_1px_rgba(0,0,0,0.5)]"
        style={{
          left: transform.x * playerWidth,
          top: transform.y * playerHeight,
          width: transform.width * playerWidth,
          height: transform.height * playerHeight,
        }}
        onPointerDown={startGesture("move")}
        title="Drag to position the overlay"
      >
        {/* Resize handle — bottom-right corner */}
        <div
          className="absolute -right-1.5 -bottom-1.5 w-3.5 h-3.5 bg-blue-400 border border-zinc-900 rounded-sm cursor-nwse-resize pointer-events-auto"
          onPointerDown={startGesture("resize")}
          title="Drag to resize"
        />
      </div>
    </div>
  );
};
