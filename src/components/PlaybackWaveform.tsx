import { useState, useEffect, useRef, useCallback } from "react";

// Global cache: an HTMLMediaElement can only have one MediaElementSourceNode ever
const audioSourceCache = new WeakMap<HTMLAudioElement, { ctx: AudioContext; source: MediaElementAudioSourceNode; analyser: AnalyserNode }>();

interface PlaybackWaveformProps {
  audioElement: HTMLAudioElement | null;
  isPlaying: boolean;
  barCount?: number;
  barClassName?: string;
  className?: string;
}

export const PlaybackWaveform = ({
  audioElement,
  isPlaying,
  barCount = 24,
  barClassName = "bg-primary/70",
  className = "",
}: PlaybackWaveformProps) => {
  const [bars, setBars] = useState<number[]>(new Array(barCount).fill(0));
  const analyserRef = useRef<AnalyserNode | null>(null);
  const rafRef = useRef<number | null>(null);

  const animate = useCallback(() => {
    if (!analyserRef.current) return;
    const dataArray = new Uint8Array(analyserRef.current.frequencyBinCount);
    analyserRef.current.getByteFrequencyData(dataArray);
    const step = Math.floor(dataArray.length / barCount);
    const newBars = Array.from({ length: barCount }, (_, i) => dataArray[i * step] / 255);
    setBars(newBars);
    rafRef.current = requestAnimationFrame(animate);
  }, [barCount]);

  useEffect(() => {
    if (isPlaying && audioElement) {
      let cached = audioSourceCache.get(audioElement);
      if (!cached) {
        try {
          const ctx = new AudioContext();
          const source = ctx.createMediaElementSource(audioElement);
          const analyser = ctx.createAnalyser();
          analyser.fftSize = 64;
          source.connect(analyser);
          analyser.connect(ctx.destination);
          cached = { ctx, source, analyser };
          audioSourceCache.set(audioElement, cached);
        } catch {
          // Element already connected elsewhere — skip waveform
          return;
        }
      }
      if (cached.ctx.state === 'suspended') {
        cached.ctx.resume();
      }
      analyserRef.current = cached.analyser;
      rafRef.current = requestAnimationFrame(animate);
    } else {
      if (rafRef.current) {
        cancelAnimationFrame(rafRef.current);
        rafRef.current = null;
      }
      setBars(new Array(barCount).fill(0));
    }

    return () => {
      if (rafRef.current) {
        cancelAnimationFrame(rafRef.current);
        rafRef.current = null;
      }
    };
  }, [isPlaying, audioElement, animate, barCount]);

  return (
    <div className={`flex items-end gap-[2px] h-6 ${className}`}>
      {bars.map((bar, i) => (
        <div
          key={i}
          className={`w-[2px] rounded-full transition-all duration-75 ${barClassName}`}
          style={{ height: `${Math.max(2, bar * 22)}px` }}
        />
      ))}
    </div>
  );
};
