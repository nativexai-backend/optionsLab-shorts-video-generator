import React, { useState, useCallback, useRef, useEffect } from "react";
import type { ImageSegment } from "../remotion/types";

const TIMELINE_BLOCK_COLORS = [
  "#3b82f6", "#10b981", "#f59e0b", "#f43f5e",
  "#8b5cf6", "#06b6d4", "#f97316", "#ec4899",
];

const MIN_DURATION = 0.5;

interface Props {
  images: ImageSegment[];
  durationInSeconds: number;
  pxPerSecond: number;
  selectedIndex: number | null;
  onSelect: (index: number) => void;
  onTimingChange: (index: number, startTime: number, endTime: number) => void;
  onTrackChange: (index: number, track: number) => void;
  trackCount: number;
  rowHeight: number;
  addRowHeight: number;
}

type DragMode = "move" | "resize-left" | "resize-right";

interface DragState {
  index: number;
  mode: DragMode;
  startX: number;
  origStart: number;
  origEnd: number;
  origTrack: number;
}

interface SnapResult {
  value: number;
  snapped: boolean;
  snapTarget: number | null;
}

function snap(
  value: number,
  targets: number[],
  threshold: number
): SnapResult {
  let closest = Infinity;
  let snapTarget: number | null = null;
  for (const t of targets) {
    const dist = Math.abs(value - t);
    if (dist < closest && dist < threshold) {
      closest = dist;
      snapTarget = t;
    }
  }
  return snapTarget !== null
    ? { value: snapTarget, snapped: true, snapTarget }
    : { value, snapped: false, snapTarget: null };
}

export const TimelineImageTrack: React.FC<Props> = ({
  images,
  durationInSeconds,
  pxPerSecond,
  selectedIndex,
  onSelect,
  onTimingChange,
  onTrackChange,
  trackCount,
  rowHeight,
  addRowHeight,
}) => {
  const [dragState, setDragState] = useState<DragState | null>(null);
  const [previewImages, setPreviewImages] = useState<ImageSegment[] | null>(null);
  const [snapLine, setSnapLine] = useState<number | null>(null);
  const [previewTrack, setPreviewTrack] = useState<number | null>(null); // row the dragged clip hovers
  const dragRef = useRef<DragState | null>(null);
  const previewRef = useRef<ImageSegment[] | null>(null);
  const previewTrackRef = useRef<number | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  const height = trackCount * rowHeight + addRowHeight;
  const totalWidth = durationInSeconds * pxPerSecond;
  const snapThreshold = 10 / pxPerSecond; // 10px in seconds

  // Build snap targets (all edges except the one being dragged)
  const getSnapTargets = useCallback(
    (dragIndex: number): number[] => {
      const targets: number[] = [0, durationInSeconds];
      images.forEach((img, i) => {
        if (i !== dragIndex) {
          targets.push(img.startTime, img.endTime);
        }
      });
      return targets;
    },
    [images, durationInSeconds]
  );

  const handlePointerDown = useCallback(
    (index: number, mode: DragMode, e: React.PointerEvent) => {
      e.preventDefault();
      e.stopPropagation();
      const target = e.currentTarget as HTMLElement;
      target.setPointerCapture(e.pointerId);

      const img = images[index];
      const state: DragState = {
        index,
        mode,
        startX: e.clientX,
        origStart: img.startTime,
        origEnd: img.endTime,
        origTrack: img.track ?? 0,
      };
      setDragState(state);
      dragRef.current = state;
      setPreviewImages([...images]);
      previewRef.current = [...images];
      setPreviewTrack(img.track ?? 0);
      previewTrackRef.current = img.track ?? 0;
      onSelect(index);
    },
    [images, onSelect]
  );

  const handlePointerMove = useCallback(
    (e: PointerEvent) => {
      const ds = dragRef.current;
      if (!ds) return;

      const deltaX = e.clientX - ds.startX;
      const deltaSec = deltaX / pxPerSecond;
      const targets = getSnapTargets(ds.index);

      // Vertical: which row is the pointer over? (only when moving, not resizing)
      if (ds.mode === "move" && containerRef.current) {
        const rect = containerRef.current.getBoundingClientRect();
        const row = Math.floor((e.clientY - rect.top) / rowHeight);
        const tgt = Math.max(0, Math.min(trackCount, row)); // trackCount = the "new track" add row
        if (tgt !== previewTrackRef.current) {
          setPreviewTrack(tgt);
          previewTrackRef.current = tgt;
        }
      }

      let newStart = ds.origStart;
      let newEnd = ds.origEnd;

      if (ds.mode === "move") {
        const duration = ds.origEnd - ds.origStart;
        let candidateStart = ds.origStart + deltaSec;
        let candidateEnd = ds.origEnd + deltaSec;

        // Clamp to bounds
        if (candidateStart < 0) {
          candidateStart = 0;
          candidateEnd = duration;
        }
        if (candidateEnd > durationInSeconds) {
          candidateEnd = durationInSeconds;
          candidateStart = durationInSeconds - duration;
        }

        // Snap start edge
        const snapStart = snap(candidateStart, targets, snapThreshold);
        // Snap end edge
        const snapEnd = snap(candidateEnd, targets, snapThreshold);

        if (snapStart.snapped && (!snapEnd.snapped || Math.abs(candidateStart - snapStart.value) <= Math.abs(candidateEnd - snapEnd.value))) {
          newStart = snapStart.value;
          newEnd = snapStart.value + duration;
          setSnapLine(snapStart.snapTarget! * pxPerSecond);
        } else if (snapEnd.snapped) {
          newEnd = snapEnd.value;
          newStart = snapEnd.value - duration;
          setSnapLine(snapEnd.snapTarget! * pxPerSecond);
        } else {
          newStart = candidateStart;
          newEnd = candidateEnd;
          setSnapLine(null);
        }
      } else if (ds.mode === "resize-left") {
        let candidate = ds.origStart + deltaSec;
        candidate = Math.max(0, Math.min(candidate, ds.origEnd - MIN_DURATION));
        const s = snap(candidate, targets, snapThreshold);
        newStart = Math.min(s.value, ds.origEnd - MIN_DURATION);
        newEnd = ds.origEnd;
        setSnapLine(s.snapped ? s.snapTarget! * pxPerSecond : null);
      } else {
        let candidate = ds.origEnd + deltaSec;
        candidate = Math.max(ds.origStart + MIN_DURATION, Math.min(candidate, durationInSeconds));
        const s = snap(candidate, targets, snapThreshold);
        newEnd = Math.max(s.value, ds.origStart + MIN_DURATION);
        newStart = ds.origStart;
        setSnapLine(s.snapped ? s.snapTarget! * pxPerSecond : null);
      }

      const updated = previewRef.current ? [...previewRef.current] : [...images];
      updated[ds.index] = { ...updated[ds.index], startTime: newStart, endTime: newEnd };
      setPreviewImages(updated);
      previewRef.current = updated;
    },
    [pxPerSecond, durationInSeconds, getSnapTargets, snapThreshold, images, rowHeight, trackCount]
  );

  const handlePointerUp = useCallback(() => {
    const ds = dragRef.current;
    const preview = previewRef.current;
    if (ds && preview) {
      const img = preview[ds.index];
      onTimingChange(ds.index, img.startTime, img.endTime);
      const tgt = previewTrackRef.current;
      if (ds.mode === "move" && tgt != null && tgt !== ds.origTrack) {
        onTrackChange(ds.index, tgt);
      }
    }
    setDragState(null);
    dragRef.current = null;
    setPreviewImages(null);
    previewRef.current = null;
    setPreviewTrack(null);
    previewTrackRef.current = null;
    setSnapLine(null);
  }, [onTimingChange, onTrackChange]);

  // Attach global listeners during drag
  useEffect(() => {
    if (!dragState) return;
    window.addEventListener("pointermove", handlePointerMove);
    window.addEventListener("pointerup", handlePointerUp);
    return () => {
      window.removeEventListener("pointermove", handlePointerMove);
      window.removeEventListener("pointerup", handlePointerUp);
    };
  }, [dragState, handlePointerMove, handlePointerUp]);

  const displayImages = previewImages ?? images;
  const isDragging = dragState !== null;

  return (
    <div
      ref={containerRef}
      className="relative flex-shrink-0"
      style={{ width: totalWidth, height }}
    >
      {/* Track row separators */}
      {Array.from({ length: trackCount }, (_, r) => (
        <div
          key={`row-${r}`}
          className={`absolute left-0 right-0 pointer-events-none ${r > 0 ? "border-t border-zinc-800/60" : ""}`}
          style={{ top: r * rowHeight, height: rowHeight }}
        />
      ))}
      {/* "Drag here for a new layer" drop row */}
      <div
        className={`absolute left-0 right-0 border-t border-dashed flex items-center justify-center text-[10px] pointer-events-none transition-colors ${
          previewTrack === trackCount
            ? "border-violet-500 bg-violet-500/10 text-violet-300"
            : "border-zinc-800 text-zinc-700"
        }`}
        style={{ top: trackCount * rowHeight, height: addRowHeight }}
      >
        {previewTrack === trackCount ? "Drop to create a new layer" : isDragging ? "drag here for a new layer" : ""}
      </div>

      {displayImages.map((img, i) => {
        const left = img.startTime * pxPerSecond;
        const width = (img.endTime - img.startTime) * pxPerSecond;
        const isSelected = i === selectedIndex;
        const color = TIMELINE_BLOCK_COLORS[i % TIMELINE_BLOCK_COLORS.length];
        const thisDragging = dragState?.index === i && dragState.mode === "move";
        const tr = thisDragging && previewTrack != null ? previewTrack : (img.track ?? 0);

        return (
          <div
            key={i}
            className={`absolute rounded-md cursor-grab active:cursor-grabbing select-none flex items-center justify-center ${
              isSelected ? "ring-2 ring-white shadow-[0_0_8px_rgba(255,255,255,0.3)] z-10" : ""
            }`}
            style={{
              left,
              top: tr * rowHeight + 2,
              height: rowHeight - 4,
              width: Math.max(width, 4),
              backgroundColor: color,
              opacity: thisDragging ? 0.95 : 0.85,
            }}
            onClick={(e) => {
              e.stopPropagation();
              onSelect(i);
            }}
            onPointerDown={(e) => handlePointerDown(i, "move", e)}
          >
            {/* Left resize handle */}
            <div
              className="absolute left-0 top-0 bottom-0 w-2.5 cursor-col-resize bg-white/10 hover:bg-white/30 rounded-l-md"
              onPointerDown={(e) => handlePointerDown(i, "resize-left", e)}
            />
            {/* Label */}
            <span className="text-[10px] text-white font-bold drop-shadow pointer-events-none truncate px-2">
              {i + 1}
            </span>
            {/* Right resize handle */}
            <div
              className="absolute right-0 top-0 bottom-0 w-2.5 cursor-col-resize bg-white/10 hover:bg-white/30 rounded-r-md"
              onPointerDown={(e) => handlePointerDown(i, "resize-right", e)}
            />
          </div>
        );
      })}

      {/* Snap guide line */}
      {snapLine !== null && (
        <div
          className="absolute top-0 bottom-0 w-px bg-yellow-400 z-20 pointer-events-none"
          style={{ left: snapLine }}
        />
      )}
    </div>
  );
};
