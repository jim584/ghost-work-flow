import { useState, useRef, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Paperclip, Mic, Square, Play, Pause, X, SmilePlus, Upload, FileIcon } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { FilePreview } from "@/components/FilePreview";

const EMOJI_SET = ["👍", "👎", "❤️", "😂", "😮", "😢", "🔥", "✅", "❌", "🙏", "👏", "🎉", "💯", "👀", "🤔"];

interface PhaseReviewSubmissionPanelProps {
  comment: string;
  onCommentChange: (value: string) => void;
  voiceBlob: Blob | null;
  onVoiceBlobChange: (blob: Blob | null) => void;
  files: File[];
  onFilesChange: (files: File[]) => void;
}

export const PhaseReviewSubmissionPanel = ({
  comment,
  onCommentChange,
  voiceBlob,
  onVoiceBlobChange,
  files,
  onFilesChange,
}: PhaseReviewSubmissionPanelProps) => {
  const { toast } = useToast();
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Voice recording state
  const [isRecording, setIsRecording] = useState(false);
  const [recordingDuration, setRecordingDuration] = useState(0);
  const [audioPreviewUrl, setAudioPreviewUrl] = useState<string | null>(null);
  const [isPlayingPreview, setIsPlayingPreview] = useState(false);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const recordingTimerRef = useRef<NodeJS.Timeout | null>(null);
  const previewAudioRef = useRef<HTMLAudioElement | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const animationFrameRef = useRef<number | null>(null);
  const [waveformBars, setWaveformBars] = useState<number[]>(new Array(32).fill(0));

  // Drag & drop
  const [isDragOver, setIsDragOver] = useState(false);
  const dragCounterRef = useRef(0);

  const handleDragEnter = useCallback((e: React.DragEvent) => {
    e.preventDefault(); e.stopPropagation();
    dragCounterRef.current++;
    if (e.dataTransfer.types.includes("Files")) setIsDragOver(true);
  }, []);
  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault(); e.stopPropagation();
    dragCounterRef.current--;
    if (dragCounterRef.current === 0) setIsDragOver(false);
  }, []);
  const handleDragOver = useCallback((e: React.DragEvent) => { e.preventDefault(); e.stopPropagation(); }, []);
  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault(); e.stopPropagation();
    setIsDragOver(false); dragCounterRef.current = 0;
    const dropped = Array.from(e.dataTransfer.files || []);
    if (dropped.length > 0) onFilesChange([...files, ...dropped]);
  }, [files, onFilesChange]);

  // Voice recording
  const startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mediaRecorder = new MediaRecorder(stream, {
        mimeType: MediaRecorder.isTypeSupported('audio/webm') ? 'audio/webm' : 'audio/mp4',
      });
      mediaRecorderRef.current = mediaRecorder;
      audioChunksRef.current = [];

      const audioContext = new AudioContext();
      const source = audioContext.createMediaStreamSource(stream);
      const analyser = audioContext.createAnalyser();
      analyser.fftSize = 64;
      source.connect(analyser);
      analyserRef.current = analyser;

      const updateWaveform = () => {
        if (!analyserRef.current) return;
        const dataArray = new Uint8Array(analyserRef.current.frequencyBinCount);
        analyserRef.current.getByteFrequencyData(dataArray);
        setWaveformBars(Array.from(dataArray.slice(0, 32)).map(v => v / 255));
        animationFrameRef.current = requestAnimationFrame(updateWaveform);
      };
      updateWaveform();

      mediaRecorder.ondataavailable = (e) => {
        if (e.data.size > 0) audioChunksRef.current.push(e.data);
      };
      mediaRecorder.onstop = () => {
        stream.getTracks().forEach(t => t.stop());
        audioContext.close();
        const blob = new Blob(audioChunksRef.current, { type: mediaRecorder.mimeType });
        const url = URL.createObjectURL(blob);
        setAudioPreviewUrl(url);
        onVoiceBlobChange(blob);
      };

      mediaRecorder.start(250);
      setIsRecording(true);
      setRecordingDuration(0);
      recordingTimerRef.current = setInterval(() => setRecordingDuration(d => d + 1), 1000);
    } catch {
      toast({ variant: "destructive", title: "Microphone access denied" });
    }
  };

  const cleanupWaveform = () => {
    analyserRef.current = null;
    if (animationFrameRef.current) { cancelAnimationFrame(animationFrameRef.current); animationFrameRef.current = null; }
    setWaveformBars(new Array(32).fill(0));
  };

  const stopRecording = () => {
    cleanupWaveform();
    mediaRecorderRef.current?.stop();
    setIsRecording(false);
    if (recordingTimerRef.current) { clearInterval(recordingTimerRef.current); recordingTimerRef.current = null; }
  };

  const cancelRecording = () => {
    cleanupWaveform();
    if (isRecording) {
      mediaRecorderRef.current?.stop();
      setIsRecording(false);
      if (recordingTimerRef.current) { clearInterval(recordingTimerRef.current); recordingTimerRef.current = null; }
    }
    if (audioPreviewUrl) { URL.revokeObjectURL(audioPreviewUrl); setAudioPreviewUrl(null); }
    onVoiceBlobChange(null);
    if (previewAudioRef.current) { previewAudioRef.current.pause(); previewAudioRef.current = null; }
    setIsPlayingPreview(false);
    setRecordingDuration(0);
  };

  const togglePreviewPlayback = () => {
    if (!audioPreviewUrl) return;
    if (isPlayingPreview && previewAudioRef.current) {
      previewAudioRef.current.pause();
      setIsPlayingPreview(false);
    } else {
      if (!previewAudioRef.current) {
        const audio = new Audio(audioPreviewUrl);
        audio.onended = () => setIsPlayingPreview(false);
        previewAudioRef.current = audio;
      }
      previewAudioRef.current.play();
      setIsPlayingPreview(true);
    }
  };

  const formatDuration = (seconds: number) => {
    const m = Math.floor(seconds / 60);
    const s = seconds % 60;
    return `${m}:${s.toString().padStart(2, '0')}`;
  };

  const removeFile = (index: number) => {
    onFilesChange(files.filter((_, i) => i !== index));
  };

  const isImageFile = (name: string) => /\.(jpe?g|png|gif|webp|svg|bmp)$/i.test(name);

  return (
    <div
      className="space-y-3 relative"
      onDragEnter={handleDragEnter}
      onDragLeave={handleDragLeave}
      onDragOver={handleDragOver}
      onDrop={handleDrop}
    >
      {/* Drag overlay */}
      {isDragOver && (
        <div className="absolute inset-0 z-50 bg-primary/5 border-2 border-dashed border-primary rounded-lg flex items-center justify-center backdrop-blur-md">
          <div className="flex flex-col items-center gap-2 text-primary">
            <Upload className="h-8 w-8" />
            <span className="text-sm font-semibold">Drop files to attach</span>
          </div>
        </div>
      )}

      {/* Text area with emoji */}
      <div className="relative">
        <Textarea
          placeholder="Describe the changes needed..."
          value={comment}
          onChange={(e) => onCommentChange(e.target.value)}
          rows={4}
          className="pr-10"
        />
        <Popover>
          <PopoverTrigger asChild>
            <Button variant="ghost" size="sm" className="absolute top-1 right-1 h-7 w-7 p-0">
              <SmilePlus className="h-4 w-4 text-muted-foreground" />
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-auto p-2" side="top" align="end">
            <div className="grid grid-cols-5 gap-1">
              {EMOJI_SET.map(emoji => (
                <button
                  key={emoji}
                  className="text-lg hover:bg-muted rounded p-1 transition-colors"
                  onClick={() => onCommentChange(comment + emoji)}
                >
                  {emoji}
                </button>
              ))}
            </div>
          </PopoverContent>
        </Popover>
      </div>

      {/* Voice recording section */}
      {isRecording ? (
        <div className="flex items-center gap-2 p-3 bg-red-50 dark:bg-red-950/20 border border-red-200 dark:border-red-800 rounded-md">
          <div className="h-3 w-3 bg-red-500 rounded-full animate-pulse" />
          <div className="flex-1 flex items-center gap-1 h-8">
            {waveformBars.map((bar, i) => (
              <div
                key={i}
                className="w-1 bg-red-400 rounded-full transition-all duration-75"
                style={{ height: `${Math.max(4, bar * 32)}px` }}
              />
            ))}
          </div>
          <span className="text-xs text-red-600 dark:text-red-400 tabular-nums font-medium">{formatDuration(recordingDuration)}</span>
          <Button variant="ghost" size="sm" className="h-7 w-7 p-0 text-red-600" onClick={cancelRecording}><X className="h-4 w-4" /></Button>
          <Button variant="default" size="sm" className="h-7 bg-red-600 hover:bg-red-700" onClick={stopRecording}><Square className="h-3 w-3 mr-1" /> Stop</Button>
        </div>
      ) : voiceBlob && audioPreviewUrl ? (
        <div className="flex items-center gap-2 p-3 bg-muted/50 border rounded-md">
          <Button variant="ghost" size="sm" className="h-7 w-7 p-0" onClick={togglePreviewPlayback}>
            {isPlayingPreview ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4" />}
          </Button>
          <Mic className="h-3 w-3 text-muted-foreground" />
          <span className="text-xs text-muted-foreground flex-1">Voice note recorded — {formatDuration(recordingDuration)}</span>
          <Button variant="ghost" size="sm" className="h-7 w-7 p-0 text-destructive" onClick={cancelRecording}><X className="h-4 w-4" /></Button>
        </div>
      ) : null}

      {/* Attached files */}
      {files.length > 0 && (
        <div className="space-y-1">
          {files.map((file, i) => (
            <div key={i} className="flex items-center gap-2 p-2 bg-muted/30 border rounded-md text-xs">
              {isImageFile(file.name) ? (
                <img src={URL.createObjectURL(file)} alt={file.name} className="h-8 w-8 object-cover rounded" />
              ) : (
                <FileIcon className="h-4 w-4 text-muted-foreground shrink-0" />
              )}
              <span className="flex-1 truncate">{file.name}</span>
              <span className="text-muted-foreground shrink-0">{(file.size / 1024).toFixed(0)} KB</span>
              <Button variant="ghost" size="sm" className="h-6 w-6 p-0 text-destructive" onClick={() => removeFile(i)}><X className="h-3 w-3" /></Button>
            </div>
          ))}
        </div>
      )}

      {/* Action buttons */}
      <div className="flex items-center gap-2">
        <input
          ref={fileInputRef}
          type="file"
          multiple
          className="hidden"
          onChange={(e) => {
            const newFiles = Array.from(e.target.files || []);
            if (newFiles.length > 0) onFilesChange([...files, ...newFiles]);
            e.target.value = "";
          }}
        />
        <Button variant="outline" size="sm" className="h-8 gap-1.5" onClick={() => fileInputRef.current?.click()}>
          <Paperclip className="h-3.5 w-3.5" /> Attach Files
        </Button>
        {!isRecording && !voiceBlob && (
          <Button variant="outline" size="sm" className="h-8 gap-1.5" onClick={startRecording}>
            <Mic className="h-3.5 w-3.5" /> Record Voice
          </Button>
        )}
      </div>
    </div>
  );
};
