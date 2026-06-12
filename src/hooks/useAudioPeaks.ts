import { useState, useEffect, useRef } from "react";

/**
 * Decodes an audio File via OfflineAudioContext and returns a downsampled
 * Float32Array of peak amplitudes (max-abs per bucket).
 */
export function useAudioPeaks(
  audioFile: File | null,
  bucketCount: number
): Float32Array | null {
  const [peaks, setPeaks] = useState<Float32Array | null>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout>>(undefined);

  useEffect(() => {
    if (!audioFile || bucketCount <= 0) {
      setPeaks(null);
      return;
    }

    clearTimeout(debounceRef.current);

    debounceRef.current = setTimeout(() => {
      let cancelled = false;

      (async () => {
        try {
          const arrayBuffer = await audioFile.arrayBuffer();
          const audioCtx = new OfflineAudioContext(1, 1, 44100);
          const decoded = await audioCtx.decodeAudioData(arrayBuffer);
          const raw = decoded.getChannelData(0);

          const samplesPerBucket = Math.floor(raw.length / bucketCount);
          if (samplesPerBucket <= 0) return;

          const result = new Float32Array(bucketCount);
          for (let b = 0; b < bucketCount; b++) {
            let max = 0;
            const start = b * samplesPerBucket;
            const end = Math.min(start + samplesPerBucket, raw.length);
            for (let i = start; i < end; i++) {
              const abs = Math.abs(raw[i]);
              if (abs > max) max = abs;
            }
            result[b] = max;
          }

          if (!cancelled) setPeaks(result);
        } catch {
          if (!cancelled) setPeaks(null);
        }
      })();

      return () => {
        cancelled = true;
      };
    }, 200);

    return () => clearTimeout(debounceRef.current);
  }, [audioFile, bucketCount]);

  return peaks;
}
