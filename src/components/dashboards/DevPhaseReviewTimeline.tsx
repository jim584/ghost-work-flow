import { useState, useRef } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { FilePreview } from "@/components/FilePreview";
import { PlaybackWaveform } from "@/components/PlaybackWaveform";
import { supabase } from "@/integrations/supabase/client";
import { format, formatDistanceToNow } from "date-fns";
import { Download, Play, Pause, Mic, FileText, CheckCircle2, AlertTriangle, Clock, ChevronDown, ChevronUp } from "lucide-react";

interface PhaseReview {
  id: string;
  phase_id: string;
  task_id: string;
  reviewed_by: string;
  reviewed_at: string;
  review_status: string;
  review_comment: string | null;
  review_voice_path: string | null;
  review_file_paths: string | null;
  review_file_names: string | null;
  change_severity: string | null;
  change_deadline: string | null;
  change_completed_at: string | null;
  round_number: number;
}

interface Phase {
  id: string;
  phase_number: number;
  review_status: string | null;
  review_comment: string | null;
  review_voice_path: string | null;
  review_file_paths: string | null;
  review_file_names: string | null;
  change_severity: string | null;
  change_deadline: string | null;
  change_completed_at: string | null;
  reviewed_at: string | null;
}

interface DevPhaseReviewTimelineProps {
  phases: Phase[];
  phaseReviews: PhaseReview[];
  taskId: string;
  compact?: boolean;
}

const VoicePlayer = ({ voicePath }: { voicePath: string }) => {
  const [isPlaying, setIsPlaying] = useState(false);
  const [duration, setDuration] = useState(0);
  const [currentTime, setCurrentTime] = useState(0);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  const togglePlay = async () => {
    if (isPlaying && audioRef.current) {
      audioRef.current.pause();
      setIsPlaying(false);
      return;
    }

    if (!audioRef.current) {
      const { data } = await supabase.storage.from("design-files").download(voicePath);
      if (!data) return;
      const url = URL.createObjectURL(data);
      const audio = new Audio(url);
      audio.onloadedmetadata = () => setDuration(audio.duration);
      audio.ontimeupdate = () => setCurrentTime(audio.currentTime);
      audio.onended = () => { setIsPlaying(false); setCurrentTime(0); };
      audioRef.current = audio;
    }
    audioRef.current.play();
    setIsPlaying(true);
  };

  const formatTime = (s: number) => {
    const m = Math.floor(s / 60);
    const sec = Math.floor(s % 60);
    return `${m}:${sec.toString().padStart(2, "0")}`;
  };

  return (
    <div className="flex items-center gap-2 p-2 bg-muted/50 rounded-md">
      <Button variant="ghost" size="sm" className="h-7 w-7 p-0" onClick={togglePlay}>
        {isPlaying ? <Pause className="h-3.5 w-3.5" /> : <Play className="h-3.5 w-3.5" />}
      </Button>
      <Mic className="h-3 w-3 text-muted-foreground" />
      <PlaybackWaveform audioElement={audioRef.current} isPlaying={isPlaying} barCount={20} className="flex-1" />
      <span className="text-[10px] text-muted-foreground tabular-nums">
        {isPlaying || currentTime > 0 ? formatTime(currentTime) : ""}{duration > 0 ? ` / ${formatTime(duration)}` : ""}
      </span>
    </div>
  );
};

const ReviewFileAttachments = ({ filePaths, fileNames }: { filePaths: string; fileNames: string }) => {
  const paths = filePaths.split("|||");
  const names = fileNames.split("|||");

  const handleDownload = async (path: string, name: string) => {
    const { data } = await supabase.storage.from("design-files").download(path.trim());
    if (data) {
      const url = URL.createObjectURL(data);
      const a = document.createElement("a");
      a.href = url; a.download = name.trim(); document.body.appendChild(a); a.click();
      document.body.removeChild(a); URL.revokeObjectURL(url);
    }
  };

  return (
    <div className="space-y-1.5">
      <span className="text-[10px] font-medium text-muted-foreground uppercase tracking-wide">Attached Files</span>
      <div className="flex flex-wrap gap-2">
        {paths.map((path, i) => {
          const name = names[i]?.trim() || `File ${i + 1}`;
          return (
            <div key={i} className="flex flex-col items-center gap-1">
              <div className="cursor-pointer hover:opacity-80 transition-opacity" onClick={() => handleDownload(path, name)}>
                <FilePreview filePath={path.trim()} fileName={name} className="w-14 h-14" />
              </div>
              <Button size="sm" variant="ghost" className="h-5 px-1.5 text-[10px] gap-0.5" onClick={() => handleDownload(path, name)}>
                <Download className="h-2.5 w-2.5" />
                {name.length > 12 ? name.slice(0, 12) + "…" : name}
              </Button>
            </div>
          );
        })}
      </div>
    </div>
  );
};

const ReviewCard = ({ review, phaseNumber, isCurrent }: { 
  review: { review_status: string; review_comment: string | null; review_voice_path: string | null; review_file_paths: string | null; review_file_names: string | null; change_severity: string | null; change_completed_at: string | null; reviewed_at: string | null; round_number?: number };
  phaseNumber: number;
  isCurrent: boolean;
}) => {
  const isDisapproved = review.review_status === "disapproved_with_changes";
  const isApprovedWithChanges = review.review_status === "approved_with_changes";
  const isApproved = review.review_status === "approved";
  const changesDone = !!review.change_completed_at;

  let borderClass = "border-amber-500/30 bg-amber-500/5";
  let statusBadge = <Badge className="bg-amber-500 text-white text-[10px]">Changes Needed</Badge>;

  if (isApproved) {
    borderClass = "border-green-500/30 bg-green-500/5";
    statusBadge = <Badge className="bg-green-600 text-white text-[10px] gap-0.5"><CheckCircle2 className="h-2.5 w-2.5" />Approved</Badge>;
  } else if (isDisapproved) {
    borderClass = "border-destructive/30 bg-destructive/5";
    statusBadge = changesDone
      ? <Badge className="bg-green-600 text-white text-[10px] gap-0.5"><CheckCircle2 className="h-2.5 w-2.5" />Changes Done{review.change_severity ? ` (${review.change_severity})` : ""}</Badge>
      : <Badge variant="destructive" className="text-[10px] gap-0.5"><AlertTriangle className="h-2.5 w-2.5" />Changes Required{review.change_severity ? ` (${review.change_severity})` : ""}</Badge>;
  } else if (isApprovedWithChanges) {
    statusBadge = changesDone
      ? <Badge className="bg-green-600 text-white text-[10px] gap-0.5"><CheckCircle2 className="h-2.5 w-2.5" />Changes Done{review.change_severity ? ` (${review.change_severity})` : ""}</Badge>
      : <Badge className="bg-amber-500 text-white text-[10px] gap-0.5"><Clock className="h-2.5 w-2.5" />Revision In Progress{review.change_severity ? ` (${review.change_severity})` : ""}</Badge>;
  }

  if (changesDone && !isApproved) {
    borderClass = "border-green-500/30 bg-green-500/5";
  }

  return (
    <div className={`border rounded-md p-3 space-y-2 ${borderClass}`}>
      <div className="flex items-center justify-between flex-wrap gap-1">
        <div className="flex items-center gap-1.5">
          <span className="text-[10px] font-semibold text-muted-foreground">P{phaseNumber}{review.round_number ? ` · Round ${review.round_number}` : ""}</span>
          {statusBadge}
        </div>
        {review.reviewed_at && (
          <span className="text-[10px] text-muted-foreground">
            {format(new Date(review.reviewed_at), "MMM d, h:mm a")} · {formatDistanceToNow(new Date(review.reviewed_at), { addSuffix: true })}
          </span>
        )}
      </div>

      {review.review_comment && (
        <div className="text-xs text-foreground whitespace-pre-wrap">{review.review_comment}</div>
      )}

      {review.review_voice_path && (
        <VoicePlayer voicePath={review.review_voice_path} />
      )}

      {review.review_file_paths && review.review_file_names && (
        <ReviewFileAttachments filePaths={review.review_file_paths} fileNames={review.review_file_names} />
      )}
    </div>
  );
};

export const DevPhaseReviewTimeline = ({ phases, phaseReviews, taskId, compact = false }: DevPhaseReviewTimelineProps) => {
  const [expanded, setExpanded] = useState(!compact);

  // Build a timeline: combine phase_reviews records with latest phase-level review data
  const reviewItems: Array<{
    key: string;
    phaseNumber: number;
    review: any;
    isCurrent: boolean;
  }> = [];

  // Add all phase_reviews entries
  for (const pr of phaseReviews) {
    const phase = phases.find(p => p.id === pr.phase_id);
    if (!phase) continue;
    reviewItems.push({
      key: `pr-${pr.id}`,
      phaseNumber: phase.phase_number,
      review: { ...pr, round_number: pr.round_number },
      isCurrent: !pr.change_completed_at && (pr.review_status === "approved_with_changes" || pr.review_status === "disapproved_with_changes"),
    });
  }

  // For phases with review data but no matching phase_reviews entry, add them too
  for (const phase of phases) {
    if (!phase.review_status) continue;
    const hasReviewRecord = phaseReviews.some(pr => pr.phase_id === phase.id);
    if (!hasReviewRecord) {
      reviewItems.push({
        key: `phase-${phase.id}`,
        phaseNumber: phase.phase_number,
        review: {
          review_status: phase.review_status,
          review_comment: phase.review_comment,
          review_voice_path: phase.review_voice_path,
          review_file_paths: phase.review_file_paths,
          review_file_names: phase.review_file_names,
          change_severity: phase.change_severity,
          change_completed_at: phase.change_completed_at,
          reviewed_at: phase.reviewed_at,
        },
        isCurrent: !phase.change_completed_at && (phase.review_status === "approved_with_changes" || phase.review_status === "disapproved_with_changes"),
      });
    }
  }

  // Sort by reviewed_at ascending
  reviewItems.sort((a, b) => {
    const aDate = a.review.reviewed_at ? new Date(a.review.reviewed_at).getTime() : 0;
    const bDate = b.review.reviewed_at ? new Date(b.review.reviewed_at).getTime() : 0;
    return aDate - bDate;
  });

  if (reviewItems.length === 0) return null;

  const activeReviews = reviewItems.filter(r => r.isCurrent);
  const historicalReviews = reviewItems.filter(r => !r.isCurrent);

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <span className="text-xs font-semibold flex items-center gap-1.5">
          <FileText className="h-3.5 w-3.5" />
          PM Reviews ({reviewItems.length})
        </span>
        {compact && (
          <Button variant="ghost" size="sm" className="h-6 px-2 text-[10px]" onClick={() => setExpanded(!expanded)}>
            {expanded ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
            {expanded ? "Collapse" : "Expand"}
          </Button>
        )}
      </div>

      {expanded && (
        <div className="space-y-2">
          {/* Active reviews first */}
          {activeReviews.map(item => (
            <ReviewCard key={item.key} review={item.review} phaseNumber={item.phaseNumber} isCurrent={true} />
          ))}

          {/* Historical reviews */}
          {historicalReviews.length > 0 && (
            <HistoricalReviews reviews={historicalReviews} />
          )}
        </div>
      )}
    </div>
  );
};

const HistoricalReviews = ({ reviews }: { reviews: Array<{ key: string; phaseNumber: number; review: any; isCurrent: boolean }> }) => {
  const [showHistory, setShowHistory] = useState(false);

  if (reviews.length === 0) return null;

  return (
    <div>
      <Button variant="ghost" size="sm" className="h-6 px-2 text-[10px] text-muted-foreground w-full justify-start gap-1" onClick={() => setShowHistory(!showHistory)}>
        {showHistory ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
        {showHistory ? "Hide" : "Show"} Previous Reviews ({reviews.length})
      </Button>
      {showHistory && (
        <div className="space-y-2 mt-1.5 opacity-80">
          {reviews.map(item => (
            <ReviewCard key={item.key} review={item.review} phaseNumber={item.phaseNumber} isCurrent={false} />
          ))}
        </div>
      )}
    </div>
  );
};
