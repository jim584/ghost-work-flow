import { useState, useRef } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { Collapsible, CollapsibleTrigger, CollapsibleContent } from "@/components/ui/collapsible";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { ScrollArea } from "@/components/ui/scroll-area";
import { FilePreview } from "@/components/FilePreview";
import { PlaybackWaveform } from "@/components/PlaybackWaveform";
import { PhaseReviewReplySection } from "@/components/dashboards/PhaseReviewReplySection";
import { supabase } from "@/integrations/supabase/client";
import { format, formatDistanceToNow } from "date-fns";
import { Download, Play, Pause, Mic, CheckCircle2, AlertTriangle, Clock, ChevronDown, Upload, PlayCircle, RotateCcw, History } from "lucide-react";

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
  reviewerNames?: Record<string, string>;
  userId?: string;
  canReply?: boolean;
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

// ─── Timeline event types ──────────────────────────────────────────

type DevActionType = "phase_started" | "phase_completed" | "changes_done";

interface TimelineEvent {
  key: string;
  timestamp: number;
  type: "dev_action" | "pm_review";
  actionType?: DevActionType;
  phaseNumber: number;
  phaseId: string;
  dateStr: string;
  review?: any;
  isCurrent?: boolean;
}

// ─── Build timeline events for a single phase ──────────────────────

const buildPhaseTimeline = (
  phase: Phase,
  phaseReviews: PhaseReview[],
  onMarkComplete?: (phaseId: string, reviewStatus: string) => void,
  reviewerNames?: Record<string, string>,
): TimelineEvent[] => {
  const items: TimelineEvent[] = [];

  if (phase.started_at) {
    items.push({
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
    items.push({
      key: `complete-${phase.id}`,
      timestamp: new Date(phase.completed_at).getTime(),
      type: "dev_action",
      actionType: "phase_completed",
      phaseNumber: phase.phase_number,
      phaseId: phase.id,
      dateStr: phase.completed_at,
    });
  }

  const reviewsForPhase = phaseReviews.filter(pr => pr.phase_id === phase.id);

  for (const pr of reviewsForPhase) {
    items.push({
      key: `pr-${pr.id}`,
      timestamp: new Date(pr.reviewed_at).getTime(),
      type: "pm_review",
      phaseNumber: phase.phase_number,
      phaseId: phase.id,
      dateStr: pr.reviewed_at,
      review: { ...pr, round_number: pr.round_number },
      isCurrent: !pr.change_completed_at && (pr.review_status === "approved_with_changes" || pr.review_status === "disapproved_with_changes"),
    });

    if (pr.change_completed_at) {
      items.push({
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

  // Phase-level review if no matching phase_reviews entries
  if (reviewsForPhase.length === 0 && phase.review_status && phase.reviewed_at) {
    items.push({
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

    if (phase.change_completed_at) {
      items.push({
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

  items.sort((a, b) => a.timestamp - b.timestamp);
  return items;
};

// ─── Inline timeline rendering ──────────────────────────────────────

const PhaseTimelineContent = ({ events, onMarkComplete, reviewerNames, taskId, userId, canReply }: {
  events: TimelineEvent[];
  onMarkComplete?: (phaseId: string, reviewStatus: string) => void;
  reviewerNames?: Record<string, string>;
  taskId?: string;
  userId?: string;
  canReply?: boolean;
}) => {
  if (events.length === 0) {
    return <p className="text-xs text-muted-foreground italic">No activity yet.</p>;
  }

  return (
    <div className="relative space-y-1.5">
      <div className="absolute left-3 top-2 bottom-2 w-px bg-border" />
      {events.map((item) => (
        <div key={item.key} className="relative pl-7">
          <div className={`absolute left-[9px] top-3 w-1.5 h-1.5 rounded-full ${
            item.type === "pm_review" ? "bg-amber-500" : "bg-primary"
          }`} />
          {item.type === "dev_action" ? (
            <DevActionCard type={item.actionType!} phaseNumber={item.phaseNumber} timestamp={item.dateStr} />
          ) : (
            <ReviewCard
              review={item.review}
              phaseNumber={item.phaseNumber}
              isCurrent={item.isCurrent || false}
              phaseId={item.phaseId}
              onMarkComplete={onMarkComplete}
              reviewerName={item.review?.reviewed_by ? reviewerNames?.[item.review.reviewed_by] : undefined}
              taskId={taskId}
              userId={userId}
              canReply={canReply}
            />
          )}
        </div>
      ))}
    </div>
  );
};

// ─── Developer Action Card ─────────────────────────────────────────

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

const ReviewCard = ({ review, phaseNumber, isCurrent, phaseId, onMarkComplete, reviewerName, taskId, userId, canReply }: { 
  review: { id?: string; review_status: string; review_comment: string | null; review_voice_path: string | null; review_file_paths: string | null; review_file_names: string | null; change_severity: string | null; change_completed_at: string | null; reviewed_at: string | null; round_number?: number; reviewed_by?: string };
  phaseNumber: number;
  isCurrent: boolean;
  phaseId?: string;
  onMarkComplete?: (phaseId: string, reviewStatus: string) => void;
  reviewerName?: string;
  taskId?: string;
  userId?: string;
  canReply?: boolean;
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
          <Badge variant="outline" className="text-[10px] px-1.5 py-0 border-muted-foreground/30">PM Review{reviewerName ? ` · ${reviewerName}` : ""}</Badge>
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

      {/* Phase-specific reply section */}
      {review.id && taskId && userId && canReply && (
        <PhaseReviewReplySection
          phaseReviewId={review.id}
          taskId={taskId}
          userId={userId}
          canReply={canReply}
        />
      )}
    </div>
  );
};

// ─── Phase status badge for accordion header ────────────────────────

const getPhaseStatusBadge = (phase: Phase) => {
  if (!phase.review_status) {
    return <Badge variant="outline" className="text-[10px] shrink-0">{phase.status}</Badge>;
  }
  if (phase.review_status === "approved") {
    return <Badge className="bg-green-600 text-white text-[10px] gap-0.5"><CheckCircle2 className="h-2.5 w-2.5" />Approved</Badge>;
  }
  if (phase.review_status === "approved_with_changes") {
    if (phase.change_completed_at) {
      return <Badge className="bg-green-600 text-white text-[10px] gap-0.5"><CheckCircle2 className="h-2.5 w-2.5" />Changes Done</Badge>;
    }
    return <Badge className="bg-amber-500 text-white text-[10px] gap-0.5"><Clock className="h-2.5 w-2.5" />Revision In Progress</Badge>;
  }
  if (phase.review_status === "disapproved_with_changes") {
    if (phase.change_completed_at) {
      return <Badge className="bg-green-600 text-white text-[10px] gap-0.5"><CheckCircle2 className="h-2.5 w-2.5" />Changes Done</Badge>;
    }
    return <Badge variant="destructive" className="text-[10px] gap-0.5"><AlertTriangle className="h-2.5 w-2.5" />Changes Required</Badge>;
  }
  return <Badge variant="outline" className="text-[10px] shrink-0">{phase.status}</Badge>;
};

// ─── Main Component ─────────────────────────────────────────────────

export const DevPhaseReviewTimeline = ({ phases, phaseReviews, taskId, compact = false, onMarkPhaseComplete, reviewerNames = {}, userId, canReply = false }: DevPhaseReviewTimelineProps) => {
  const sortedPhases = [...phases].sort((a, b) => a.phase_number - b.phase_number);

  if (sortedPhases.length === 0) return null;

  // Determine the active/latest phase (same logic as PM dashboard)
  const getActivePhaseId = () => {
    for (const phase of [...sortedPhases].reverse()) {
      if (phase.status === "in_progress") return phase.id;
      if ((phase.review_status === "approved_with_changes" || phase.review_status === "disapproved_with_changes") && !phase.change_completed_at) return phase.id;
    }
    return sortedPhases[sortedPhases.length - 1]?.id;
  };

  const activePhaseId = getActivePhaseId();
  const activePhase = sortedPhases.find(p => p.id === activePhaseId);
  const otherPhases = sortedPhases.filter(p => p.id !== activePhaseId);

  const getContextualTimestamp = (phase: Phase) => {
    const reviewsForPhase = phaseReviews
      .filter(pr => pr.phase_id === phase.id)
      .sort((a, b) => new Date(b.reviewed_at).getTime() - new Date(a.reviewed_at).getTime());
    const latestReview = reviewsForPhase[0];

    const hasActiveRevision = latestReview
      ? (latestReview.review_status === "approved_with_changes" || latestReview.review_status === "disapproved_with_changes") && !latestReview.change_completed_at
      : (phase.review_status === "approved_with_changes" || phase.review_status === "disapproved_with_changes") && !phase.change_completed_at;

    const hasCompletedChanges = latestReview
      ? !!latestReview.change_completed_at
      : !!phase.change_completed_at;

    if (hasActiveRevision) {
      const reviewDate = latestReview?.reviewed_at || phase.reviewed_at;
      if (reviewDate) {
        return (
          <span className="text-[10px] text-destructive font-medium">
            Changes Needed · {formatDistanceToNow(new Date(reviewDate), { addSuffix: true })}
          </span>
        );
      }
    }

    if (hasCompletedChanges) {
      const completedDate = latestReview?.change_completed_at || phase.change_completed_at;
      if (completedDate) {
        return (
          <span className="text-[10px] text-muted-foreground">
            Changes Submitted · {formatDistanceToNow(new Date(completedDate), { addSuffix: true })}
          </span>
        );
      }
    }

    return (
      <>
        {phase.started_at && (
          <span className="text-[10px] text-muted-foreground">
            Started {format(new Date(phase.started_at), "MMM d, h:mm a")}
          </span>
        )}
        {phase.completed_at && (
          <span className="text-[10px] text-muted-foreground">
            · Submitted {format(new Date(phase.completed_at), "MMM d, h:mm a")}
          </span>
        )}
      </>
    );
  };

  const renderPhaseAccordionItem = (phase: Phase) => {
    const phaseLabel = phase.phase_number === 1 ? "Phase 1 — Homepage" : `Phase ${phase.phase_number} — Inner Pages`;
    const events = buildPhaseTimeline(phase, phaseReviews, onMarkPhaseComplete, reviewerNames);
    const reviewCount = events.filter(e => e.type === "pm_review").length;

    return (
      <AccordionItem key={phase.id} value={phase.id} className="border rounded-md mb-2 px-2">
        <AccordionTrigger className="py-2 hover:no-underline">
          <div className="flex items-center gap-2 flex-1 min-w-0 pr-2 flex-wrap">
            <span className="text-xs font-medium truncate">{phaseLabel}</span>
            {getPhaseStatusBadge(phase)}
            <div className="flex items-center gap-2 ml-auto shrink-0">
              {getContextualTimestamp(phase)}
              {reviewCount > 0 && (
                <span className="text-[10px] text-muted-foreground">
                  · {reviewCount} review{reviewCount !== 1 ? "s" : ""}
                </span>
              )}
            </div>
          </div>
        </AccordionTrigger>
        <AccordionContent className="pb-3">
          <PhaseTimelineContent
            events={events}
            onMarkComplete={onMarkPhaseComplete}
            reviewerNames={reviewerNames}
            taskId={taskId}
            userId={userId}
            canReply={canReply}
          />
        </AccordionContent>
      </AccordionItem>
    );
  };

  return (
    <div className="space-y-2">
      {/* Active phase shown prominently */}
      {activePhase && (
        <Accordion type="single" collapsible defaultValue={activePhase.id}>
          {renderPhaseAccordionItem(activePhase)}
        </Accordion>
      )}

      {/* Previous phases collapsed */}
      {otherPhases.length > 0 && (
        <Collapsible defaultOpen={false}>
          <CollapsibleTrigger className="flex items-center gap-2 w-full text-left group">
            <ChevronDown className="h-3.5 w-3.5 text-muted-foreground transition-transform group-data-[state=open]:rotate-180" />
            <h4 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Previous Phases</h4>
            <Badge variant="outline" className="text-[10px] ml-auto">{otherPhases.length} phase{otherPhases.length !== 1 ? "s" : ""}</Badge>
          </CollapsibleTrigger>
          <CollapsibleContent className="mt-2">
            <Accordion type="single" collapsible>
              {otherPhases.map(phase => renderPhaseAccordionItem(phase))}
            </Accordion>
          </CollapsibleContent>
        </Collapsible>
      )}
    </div>
  );
};
