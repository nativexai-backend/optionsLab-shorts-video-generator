"use client";

import React, { useCallback, useEffect, useMemo, useRef } from "react";
import { VIDEO_WIDTH, VIDEO_HEIGHT, ImageSegment } from "../remotion/types";

interface Props {
  open: boolean;
  onClose: () => void;
  images: ImageSegment[];
  projectName: string;
  showToast: (message: string, type: "error" | "success") => void;
  // Settings are owned by the Editor so they save/restore with each project
  copy: string;
  onCopyChange: (v: string) => void;
  fontSize: number;
  onFontSizeChange: (v: number) => void;
  imageIndex: number;
  onImageIndexChange: (v: number) => void;
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("Image failed to load"));
    img.src = src;
  });
}

/** Word-wrap one paragraph to maxWidth using the canvas' current font. */
function wrapParagraph(ctx: CanvasRenderingContext2D, text: string, maxWidth: number): string[] {
  const words = text.split(/\s+/).filter(Boolean);
  const lines: string[] = [];
  let current = "";
  for (const word of words) {
    const candidate = current ? `${current} ${word}` : word;
    if (ctx.measureText(candidate).width <= maxWidth || !current) {
      current = candidate;
    } else {
      lines.push(current);
      current = word;
    }
  }
  if (current) lines.push(current);
  return lines;
}

async function drawThumbnail(
  canvas: HTMLCanvasElement,
  imageSrc: string | null,
  copy: string,
  targetFontSize: number
): Promise<void> {
  canvas.width = VIDEO_WIDTH;
  canvas.height = VIDEO_HEIGHT;
  const ctx = canvas.getContext("2d");
  if (!ctx) return;

  // Background image, cover-fit
  ctx.fillStyle = "#0d1117";
  ctx.fillRect(0, 0, VIDEO_WIDTH, VIDEO_HEIGHT);
  if (imageSrc) {
    try {
      const img = await loadImage(imageSrc);
      const scale = Math.max(VIDEO_WIDTH / img.width, VIDEO_HEIGHT / img.height);
      const dw = img.width * scale;
      const dh = img.height * scale;
      ctx.drawImage(img, (VIDEO_WIDTH - dw) / 2, (VIDEO_HEIGHT - dh) / 2, dw, dh);
    } catch {
      // keep dark background
    }
  }

  // Dark scrim so the copy is always readable (the "blurry dark bit")
  const scrim = ctx.createLinearGradient(0, VIDEO_HEIGHT * 0.4, 0, VIDEO_HEIGHT);
  scrim.addColorStop(0, "rgba(0,0,0,0)");
  scrim.addColorStop(0.5, "rgba(0,0,0,0.55)");
  scrim.addColorStop(1, "rgba(0,0,0,0.92)");
  ctx.fillStyle = scrim;
  ctx.fillRect(0, 0, VIDEO_WIDTH, VIDEO_HEIGHT);

  // Bold copy, bottom-left, auto-sized to fit
  const text = copy.trim();
  if (!text) return;

  const padX = 44;
  const padBottom = 52;
  const maxWidth = VIDEO_WIDTH - padX * 2;
  const paragraphs = text.split(/\n+/).filter(Boolean);

  // Use the requested size; shrink only if the block would overflow
  // the frame itself (the user controls how dominant the text is).
  let fontSize = targetFontSize;
  let lines: string[] = [];
  while (fontSize >= 28) {
    ctx.font = `800 ${fontSize}px Inter, system-ui, -apple-system, sans-serif`;
    lines = paragraphs.flatMap((p) => wrapParagraph(ctx, p, maxWidth));
    if (lines.length * fontSize * 1.12 <= VIDEO_HEIGHT * 0.8) break;
    fontSize -= 6;
  }

  const lineHeight = fontSize * 1.12;
  const firstLineY = VIDEO_HEIGHT - padBottom - (lines.length - 1) * lineHeight;

  ctx.textBaseline = "alphabetic";
  ctx.fillStyle = "#FFFFFF";
  ctx.shadowColor = "rgba(0,0,0,0.65)";
  ctx.shadowBlur = 14;
  ctx.shadowOffsetY = 3;
  lines.forEach((line, i) => {
    ctx.fillText(line, padX, firstLineY + i * lineHeight);
  });
  ctx.shadowColor = "transparent";
  ctx.shadowBlur = 0;
  ctx.shadowOffsetY = 0;
}

export const ThumbnailModal: React.FC<Props> = ({
  open,
  onClose,
  images,
  projectName,
  showToast,
  copy,
  onCopyChange,
  fontSize,
  onFontSizeChange,
  imageIndex,
  onImageIndexChange,
}) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  const assignedImages = useMemo(() => images.filter((img) => img.src), [images]);
  const selectedSrc = assignedImages[imageIndex]?.src ?? assignedImages[0]?.src ?? null;

  // Redraw the full-resolution canvas on every change
  useEffect(() => {
    if (!open || !canvasRef.current) return;
    drawThumbnail(canvasRef.current, selectedSrc, copy, fontSize);
  }, [open, selectedSrc, copy, fontSize]);

  // Esc to close
  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [open, onClose]);

  const handleDownload = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    canvas.toBlob((blob) => {
      if (!blob) {
        showToast("Thumbnail export failed", "error");
        return;
      }
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      const safeName = (projectName || "video").replace(/[^a-zA-Z0-9_\- ]/g, "").trim() || "video";
      a.href = url;
      a.download = `${safeName}-thumbnail.png`;
      a.click();
      URL.revokeObjectURL(url);
      showToast("Thumbnail downloaded", "success");
    }, "image/png");
  }, [projectName, showToast]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60" onClick={onClose}>
      <div
        className="bg-zinc-900 border border-zinc-700 rounded-xl p-5 shadow-2xl flex gap-5 max-h-[90vh]"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Live preview — the canvas IS the export, scaled down */}
        <div className="flex-shrink-0">
          <canvas
            ref={canvasRef}
            className="rounded-lg border border-zinc-800 bg-zinc-950"
            style={{ width: 270, height: 480 }}
          />
        </div>

        {/* Controls */}
        <div className="w-72 flex flex-col gap-3 min-h-0">
          <div>
            <h3 className="text-sm font-medium text-zinc-200">Thumbnail</h3>
            <p className="text-mini text-zinc-500 mt-0.5">720×1280 — same size as the video. Pick an image, write the copy, download.</p>
          </div>

          <div className="min-h-0 overflow-y-auto">
            <label className="text-xs text-zinc-400 mb-1.5 block">Background image</label>
            {assignedImages.length === 0 ? (
              <p className="text-mini text-zinc-500 bg-zinc-800/60 rounded-lg p-2.5">
                No images in this project yet — add them in ② Visuals first.
              </p>
            ) : (
              <div className="grid grid-cols-4 gap-1.5">
                {assignedImages.map((img, i) => (
                  <button
                    key={`${img.src}-${i}`}
                    type="button"
                    onClick={() => onImageIndexChange(i)}
                    className={`relative aspect-[9/16] rounded overflow-hidden border-2 transition-all ${
                      selectedSrc === img.src
                        ? "border-blue-500 ring-2 ring-blue-500/40"
                        : "border-zinc-700 hover:border-zinc-500"
                    }`}
                  >
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={img.src} alt={`Image ${i + 1}`} className="w-full h-full object-cover" />
                  </button>
                ))}
              </div>
            )}
          </div>

          <div>
            <label className="text-xs text-zinc-400 mb-1 block">Thumbnail copy</label>
            <textarea
              value={copy}
              onChange={(e) => onCopyChange(e.target.value)}
              rows={3}
              placeholder={`Apple's Secret CEO Already Chosen`}
              className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-2.5 py-2 text-sm text-zinc-200 placeholder:text-zinc-600 resize-none focus-visible:ring-2 focus-visible:ring-blue-500"
            />
            <p className="text-micro text-zinc-500 mt-1">Bold, bottom-left. Press Enter for a manual line break.</p>
          </div>

          <div>
            <div className="flex justify-between text-xs text-zinc-400 mb-0.5">
              <label>Text size</label>
              <span>{fontSize}px</span>
            </div>
            <input
              type="range"
              min={36}
              max={220}
              step={2}
              value={fontSize}
              onChange={(e) => onFontSizeChange(Number(e.target.value))}
              className="w-full accent-blue-500"
            />
          </div>

          <div className="mt-auto flex gap-2 justify-end pt-1">
            <button
              onClick={onClose}
              className="px-3 py-1.5 text-xs text-zinc-400 hover:text-zinc-200 transition-colors"
            >
              Close
            </button>
            <button
              onClick={handleDownload}
              disabled={assignedImages.length === 0}
              className="px-4 py-1.5 text-xs font-medium rounded-md text-white transition-colors disabled:opacity-50"
              style={{ background: "var(--gradient-brand)" }}
            >
              Download PNG
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
