import React, { useRef, useEffect } from "react";

interface Props {
  peaks: Float32Array | null;
  width: number;
  height: number;
}

export const TimelineWaveform: React.FC<Props> = ({ peaks, width, height }) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const dpr = window.devicePixelRatio || 1;
    canvas.width = width * dpr;
    canvas.height = height * dpr;
    ctx.scale(dpr, dpr);

    ctx.clearRect(0, 0, width, height);

    if (!peaks || peaks.length === 0) return;

    ctx.fillStyle = "rgba(59,130,246,0.4)";
    const barWidth = 2;
    const gap = 1;
    const totalBars = Math.floor(width / (barWidth + gap));
    const samplesPerBar = peaks.length / totalBars;

    for (let i = 0; i < totalBars; i++) {
      const peakIdx = Math.floor(i * samplesPerBar);
      const val = peaks[Math.min(peakIdx, peaks.length - 1)];
      const barHeight = Math.max(1, val * height);
      const x = i * (barWidth + gap);
      const y = (height - barHeight) / 2;
      ctx.fillRect(x, y, barWidth, barHeight);
    }
  }, [peaks, width, height]);

  return (
    <canvas
      ref={canvasRef}
      style={{ width, height }}
      className="block flex-shrink-0"
    />
  );
};
