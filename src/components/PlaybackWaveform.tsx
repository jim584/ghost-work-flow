import { useState, useEffect, useRef, useCallback } from "react";

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
  const audioCtxRef = useRef<AudioContext | null>(null);
  const sourceRef = useRef<MediaElementAudioSourceNode | null>(null);
  const rafRef = useRef<number | null>(null);
  const connectedElementRef = useRef<HTMLAudioElement | null>(null);

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
      // Only create context/source once per audio element
      if (connectedElementRef.current !== audioElement) {
        // Clean up old context
        if (audioCtxRef.current) {
          audioCtxRef.current.close().catch(() => {});
        }
        const ctx = new AudioContext();
        const source = ctx.createMediaElementSource(audioElement);
        const analyser = ctx.createAnalyser();
        analyser.fftSize = 64;
        source.connect(analyser);
        analyser.connect(ctx.destination);
        audioCtxRef.current = ctx;
        sourceRef.current = source;
        analyserRef.current = analyser;
        connectedElementRef.current = audioElement;
      }
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

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (audioCtxRef.current) {
        audioCtxRef.current.close().catch(() => {});
      }
    };
  }, []);

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
