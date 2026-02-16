import { useState, useRef } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import { FilePreview } from "@/components/FilePreview";
import { PlaybackWaveform } from "@/components/PlaybackWaveform";
import { supabase } from "@/integrations/supabase/client";
import { format, formatDistanceToNow } from "date-fns";
import { Download, Play, Pause, Mic, FileText, CheckCircle2, AlertTriangle, Clock, ChevronDown, ChevronUp, Upload, PlayCircle, RotateCcw } from "lucide-react";

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
  status: string;
  started_at: string | null;
  completed_at: string | null;
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
  onMarkPhaseComplete?: (phaseId: string, reviewStatus: string) => void;
}

// ─── Shared Sub-components ──────────────────────────────────────────

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

// ─── Timestamp helper ──────────────────────────────────────────────

const TimeStamp = ({ date }: { date: string }) => (
  <span className="text-[10px] text-muted-foreground">
    {format(new Date(date), "MMM d, h:mm a")} · {formatDistanceToNow(new Date(date), { addSuffix: true })}
  </span>
);

// ─── Developer Action Card ─────────────────────────────────────────

type DevActionType = "phase_started" | "phase_completed" | "changes_done";

const DevActionCard = ({ type, phaseNumber, timestamp }: {
  type: DevActionType;
  phaseNumber: number;
  timestamp: string;
}) => {
  const config = {
    phase_started: {
      icon: <PlayCircle className="h-3.5 w-3.5 text-primary" />,
      label: "Phase Started",
      border: "border-primary/20 bg-primary/5",
    },
    phase_completed: {
      icon: <Upload className="h-3.5 w-3.5 text-primary" />,
      label: "Phase Submitted",
      border: "border-primary/20 bg-primary/5",
    },
    changes_done: {
      icon: <RotateCcw className="h-3.5 w-3.5 text-primary" />,
      label: "Changes Submitted",
      border: "border-primary/20 bg-primary/5",
    },
  }[type];

  return (
    <div className={`border rounded-md p-2.5 flex items-center justify-between ${config.border}`}>
      <div className="flex items-center gap-2">
        {config.icon}
        <span className="text-[10px] font-semibold text-muted-foreground">P{phaseNumber}</span>
        <Badge variant="secondary" className="text-[10px] gap-0.5">
          {config.label}
        </Badge>
      </div>
      <TimeStamp date={timestamp} />
    </div>
  );
};

// ─── PM Review Card ─────────────────────────────────────────────────

const ReviewCard = ({ review, phaseNumber, isCurrent, phaseId, onMarkComplete }: { 
  review: { review_status: string; review_comment: string | null; review_voice_path: string | null; review_file_paths: string | null; review_file_names: string | null; change_severity: string | null; change_completed_at: string | null; reviewed_at: string | null; round_number?: number };
  phaseNumber: number;
  isCurrent: boolean;
  phaseId?: string;
  onMarkComplete?: (phaseId: string, reviewStatus: string) => void;
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
          <Badge variant="outline" className="text-[10px] px-1.5 py-0 border-muted-foreground/30">PM Review</Badge>
          <span className="text-[10px] font-semibold text-muted-foreground">P{phaseNumber}{review.round_number ? ` · Round ${review.round_number}` : ""}</span>
          {statusBadge}
        </div>
        {review.reviewed_at && <TimeStamp date={review.reviewed_at} />}
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

      {isCurrent && phaseId && onMarkComplete && (
        <AlertDialog>
          <AlertDialogTrigger asChild>
            <Button 
              size="sm" 
              variant="outline"
              className="w-full border-green-500 text-green-700 hover:bg-green-50 gap-1.5 mt-1"
            >
              <CheckCircle2 className="h-3.5 w-3.5" />
              Mark Changes Complete (P{phaseNumber})
            </Button>
          </AlertDialogTrigger>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Confirm Changes Complete</AlertDialogTitle>
              <AlertDialogDescription>
                Are you sure you want to mark Phase {phaseNumber} changes as complete? This will notify the PM for re-review.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancel</AlertDialogCancel>
              <AlertDialogAction onClick={() => onMarkComplete(phaseId, review.review_status)}>
                Confirm
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      )}
    </div>
  );
};

// ─── Unified Timeline Item ──────────────────────────────────────────

interface TimelineItem {
  key: string;
  timestamp: number; // ms for sorting
  type: "dev_action" | "pm_review";
  // dev_action fields
  actionType?: DevActionType;
  phaseNumber: number;
  phaseId: string;
  dateStr: string;
  // pm_review fields
  review?: any;
  isCurrent?: boolean;
}

// ─── Main Component ─────────────────────────────────────────────────

export const DevPhaseReviewTimeline = ({ phases, phaseReviews, taskId, compact = false, onMarkPhaseComplete }: DevPhaseReviewTimelineProps) => {
  const [expanded, setExpanded] = useState(!compact);

  // Build unified timeline
  const timelineItems: TimelineItem[] = [];

  // 1. Add developer actions from phases
  for (const phase of phases) {
    if (phase.started_at) {
      timelineItems.push({
        key: `start-${phase.id}`,
        timestamp: new Date(phase.started_at).getTime(),
        type: "dev_action",
        actionType: "phase_started",
        phaseNumber: phase.phase_number,
        phaseId: phase.id,
        dateStr: phase.started_at,
      });
    }
    if (phase.completed_at) {
      timelineItems.push({
        key: `complete-${phase.id}`,
        timestamp: new Date(phase.completed_at).getTime(),
        type: "dev_action",
        actionType: "phase_completed",
        phaseNumber: phase.phase_number,
        phaseId: phase.id,
        dateStr: phase.completed_at,
      });
    }
  }

  // 2. Add change_completed_at from phase_reviews
  for (const pr of phaseReviews) {
    if (pr.change_completed_at) {
      const phase = phases.find(p => p.id === pr.phase_id);
      if (phase) {
        timelineItems.push({
          key: `changes-done-${pr.id}`,
          timestamp: new Date(pr.change_completed_at).getTime(),
          type: "dev_action",
          actionType: "changes_done",
          phaseNumber: phase.phase_number,
          phaseId: phase.id,
          dateStr: pr.change_completed_at,
        });
      }
    }
  }

  // Also add change_completed_at from phases themselves (for phases without matching phase_reviews)
  for (const phase of phases) {
    if (phase.change_completed_at) {
      const hasReviewWithChange = phaseReviews.some(pr => pr.phase_id === phase.id && pr.change_completed_at);
      if (!hasReviewWithChange) {
        timelineItems.push({
          key: `changes-done-phase-${phase.id}`,
          timestamp: new Date(phase.change_completed_at).getTime(),
          type: "dev_action",
          actionType: "changes_done",
          phaseNumber: phase.phase_number,
          phaseId: phase.id,
          dateStr: phase.change_completed_at,
        });
      }
    }
  }

  // 3. Add PM reviews from phase_reviews table
  for (const pr of phaseReviews) {
    const phase = phases.find(p => p.id === pr.phase_id);
    if (!phase) continue;
    timelineItems.push({
      key: `pr-${pr.id}`,
      timestamp: new Date(pr.reviewed_at).getTime(),
      type: "pm_review",
      phaseNumber: phase.phase_number,
      phaseId: phase.id,
      dateStr: pr.reviewed_at,
      review: { ...pr, round_number: pr.round_number },
      isCurrent: !pr.change_completed_at && (pr.review_status === "approved_with_changes" || pr.review_status === "disapproved_with_changes"),
    });
  }

  // 4. Add phase-level reviews without matching phase_reviews entries
  for (const phase of phases) {
    if (!phase.review_status || !phase.reviewed_at) continue;
    const hasReviewRecord = phaseReviews.some(pr => pr.phase_id === phase.id);
    if (!hasReviewRecord) {
      timelineItems.push({
        key: `phase-review-${phase.id}`,
        timestamp: new Date(phase.reviewed_at).getTime(),
        type: "pm_review",
        phaseNumber: phase.phase_number,
        phaseId: phase.id,
        dateStr: phase.reviewed_at,
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

  // Sort chronologically
  timelineItems.sort((a, b) => a.timestamp - b.timestamp);

  if (timelineItems.length === 0) return null;

  const totalEvents = timelineItems.length;
  const reviewCount = timelineItems.filter(t => t.type === "pm_review").length;

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <span className="text-xs font-semibold flex items-center gap-1.5">
          <FileText className="h-3.5 w-3.5" />
          Phase Timeline ({totalEvents} events{reviewCount > 0 ? ` · ${reviewCount} reviews` : ""})
        </span>
        {compact && (
          <Button variant="ghost" size="sm" className="h-6 px-2 text-[10px]" onClick={() => setExpanded(!expanded)}>
            {expanded ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
            {expanded ? "Collapse" : "Expand"}
          </Button>
        )}
      </div>

      {expanded && (
        <div className="relative space-y-1.5">
          {/* Vertical connector line */}
          <div className="absolute left-3 top-2 bottom-2 w-px bg-border" />

          {timelineItems.map((item) => (
            <div key={item.key} className="relative pl-7">
              {/* Timeline dot */}
              <div className={`absolute left-[9px] top-3 w-1.5 h-1.5 rounded-full ${
                item.type === "pm_review" ? "bg-amber-500" : "bg-primary"
              }`} />

              {item.type === "dev_action" ? (
                <DevActionCard
                  type={item.actionType!}
                  phaseNumber={item.phaseNumber}
                  timestamp={item.dateStr}
                />
              ) : (
                <ReviewCard
                  review={item.review}
                  phaseNumber={item.phaseNumber}
                  isCurrent={item.isCurrent || false}
                  phaseId={item.phaseId}
                  onMarkComplete={onMarkPhaseComplete}
                />
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
};
