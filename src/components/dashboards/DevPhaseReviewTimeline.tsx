import { useState, useRef, useEffect } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { Collapsible, CollapsibleTrigger, CollapsibleContent } from "@/components/ui/collapsible";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { ScrollArea } from "@/components/ui/scroll-area";
import { FilePreview } from "@/components/FilePreview";
import { PlaybackWaveform } from "@/components/PlaybackWaveform";
import { PhaseReviewReplySection } from "@/components/dashboards/PhaseReviewReplySection";
import { supabase } from "@/integrations/supabase/client";
import { useQuery } from "@tanstack/react-query";
import { format, formatDistanceToNow } from "date-fns";
import { Download, Play, Pause, Mic, CheckCircle2, AlertTriangle, Clock, ChevronDown, Upload, PlayCircle, RotateCcw, History, Paperclip, Send, X, PauseCircle, UserCheck, Bell, Rocket, ArrowRightLeft, List, Layers, Eye } from "lucide-react";

// Helper to make URLs in text clickable (supports with or without http/https prefix)
const LinkifyText = ({ text }: { text: string }) => {
  const urlRegex = /(https?:\/\/[^\s]+|(?:www\.)[^\s]+|[a-zA-Z0-9](?:[a-zA-Z0-9-]*[a-zA-Z0-9])?\.(?:com|org|net|io|dev|co|app|me|info|biz|us|uk|ca|au|de|fr|in|xyz|tech|site|online|store|shop|pro)[^\s]*)/gi;
  const parts = text.split(urlRegex);
  return (
    <>
      {parts.map((part, i) => {
        urlRegex.lastIndex = 0;
        if (urlRegex.test(part)) {
          const href = part.match(/^https?:\/\//) ? part : `https://${part}`;
          return (
            <a key={i} href={href} target="_blank" rel="noopener noreferrer" className="text-primary underline hover:text-primary/80 break-all">
              {part}
            </a>
          );
        }
        return <span key={i}>{part}</span>;
      })}
    </>
  );
};

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
  change_completed_by: string | null;
  round_number: number;
  dev_read_at?: string | null;
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
  started_by: string | null;
  completed_by: string | null;
  submission_file_paths: string | null;
  submission_file_names: string | null;
  submission_comment: string | null;
}

interface DevPhaseReviewTimelineProps {
  phases: Phase[];
  phaseReviews: PhaseReview[];
  taskId: string;
  compact?: boolean;
  onMarkPhaseComplete?: (phaseId: string, reviewStatus: string, comment?: string, filePaths?: string, fileNames?: string) => void;
  reviewerNames?: Record<string, string>;
  userId?: string;
  canReply?: boolean;
  devNames?: Record<string, string>;
  autoMarkRead?: boolean;
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
  devName?: string;
  submissionFilePaths?: string | null;
  submissionFileNames?: string | null;
  submissionComment?: string | null;
}

// ─── Build timeline events for a single phase ──────────────────────

const buildPhaseTimeline = (
  phase: Phase,
  phaseReviews: PhaseReview[],
  onMarkComplete?: (phaseId: string, reviewStatus: string) => void,
  reviewerNames?: Record<string, string>,
  devNames?: Record<string, string>,
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
      devName: phase.started_by ? devNames?.[phase.started_by] : undefined,
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
      devName: phase.completed_by ? devNames?.[phase.completed_by] : undefined,
      submissionFilePaths: phase.submission_file_paths,
      submissionFileNames: phase.submission_file_names,
      submissionComment: phase.submission_comment,
    });
  }

  const reviewsForPhase = phaseReviews.filter(pr => pr.phase_id === phase.id);

  for (const pr of reviewsForPhase) {
    const isSuperseded = !!(pr as any).superseded_at;
    items.push({
      key: `pr-${pr.id}`,
      timestamp: new Date(pr.reviewed_at).getTime(),
      type: "pm_review",
      phaseNumber: phase.phase_number,
      phaseId: phase.id,
      dateStr: pr.reviewed_at,
      review: { ...pr, round_number: pr.round_number },
      isCurrent: !isSuperseded && !pr.change_completed_at && (pr.review_status === "approved_with_changes" || pr.review_status === "disapproved_with_changes"),
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
        devName: pr.change_completed_by ? devNames?.[pr.change_completed_by] : undefined,
        submissionComment: (pr as any).change_comment,
        submissionFilePaths: (pr as any).change_file_paths,
        submissionFileNames: (pr as any).change_file_names,
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
  onMarkComplete?: (phaseId: string, reviewStatus: string, comment?: string, filePaths?: string, fileNames?: string) => void;
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
            <DevActionCard
              type={item.actionType!}
              phaseNumber={item.phaseNumber}
              timestamp={item.dateStr}
              devName={item.devName}
              submissionFilePaths={item.submissionFilePaths}
              submissionFileNames={item.submissionFileNames}
              submissionComment={item.submissionComment}
            />
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

const DevActionCard = ({ type, phaseNumber, timestamp, devName, submissionFilePaths, submissionFileNames, submissionComment }: {
  type: DevActionType;
  phaseNumber: number;
  timestamp: string;
  devName?: string;
  submissionFilePaths?: string | null;
  submissionFileNames?: string | null;
  submissionComment?: string | null;
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

  const hasFiles = submissionFilePaths && submissionFileNames;

  return (
    <div className={`border rounded-md p-2.5 space-y-2 ${config.border}`}>
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          {config.icon}
          <span className="text-[10px] font-semibold text-muted-foreground">P{phaseNumber}</span>
          <Badge variant="secondary" className="text-[10px] gap-0.5">
            {config.label}
          </Badge>
          {devName && (
            <span className="text-[10px] text-muted-foreground">by {devName}</span>
          )}
        </div>
        <TimeStamp date={timestamp} />
      </div>
      {submissionComment && (
        <div className="text-xs text-foreground whitespace-pre-wrap border-t border-primary/10 pt-1.5">
          <LinkifyText text={submissionComment} />
        </div>
      )}
      {hasFiles && (
        <ReviewFileAttachments filePaths={submissionFilePaths} fileNames={submissionFileNames} />
      )}
    </div>
  );
};

// ─── PM Review Card ─────────────────────────────────────────────────

const MarkChangesCompletePanel = ({ phaseId, phaseNumber, reviewStatus, onMarkComplete }: {
  phaseId: string;
  phaseNumber: number;
  reviewStatus: string;
  onMarkComplete: (phaseId: string, reviewStatus: string, comment?: string, filePaths?: string, fileNames?: string) => void;
}) => {
  const [showPanel, setShowPanel] = useState(false);
  const [comment, setComment] = useState("");
  const [files, setFiles] = useState<File[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleSubmit = async () => {
    setSubmitting(true);
    try {
      let uploadedPaths: string | undefined;
      let uploadedNames: string | undefined;

      if (files.length > 0) {
        const paths: string[] = [];
        const names: string[] = [];
        for (const file of files) {
          const sanitized = file.name.replace(/[^a-zA-Z0-9._-]/g, "_");
          const storagePath = `phase-changes/${phaseId}/${Date.now()}-${sanitized}`;
          const { error } = await supabase.storage.from("design-files").upload(storagePath, file);
          if (error) throw error;
          paths.push(storagePath);
          names.push(file.name);
        }
        uploadedPaths = paths.join("|||");
        uploadedNames = names.join("|||");
      }

      onMarkComplete(phaseId, reviewStatus, comment.trim() || undefined, uploadedPaths, uploadedNames);
      setShowPanel(false);
      setComment("");
      setFiles([]);
    } catch (e: any) {
      console.error("Error uploading change files:", e);
    } finally {
      setSubmitting(false);
    }
  };

  if (!showPanel) {
    return (
      <Button 
        size="sm" 
        variant="outline"
        className="w-full border-green-500 text-green-700 hover:bg-green-50 gap-1.5 mt-1"
        onClick={() => setShowPanel(true)}
      >
        <CheckCircle2 className="h-3.5 w-3.5" />
        Mark Changes Complete (P{phaseNumber})
      </Button>
    );
  }

  return (
    <div className="border border-green-500/30 rounded-md p-2.5 space-y-2 bg-green-500/5 mt-1">
      <div className="text-[11px] font-medium text-foreground">Mark Changes Complete — Phase {phaseNumber}</div>
      <Textarea
        placeholder="Optional: describe what you changed..."
        value={comment}
        onChange={(e) => setComment(e.target.value)}
        className="min-h-[60px] text-xs resize-none"
      />
      {files.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {files.map((f, i) => (
            <div key={i} className="flex items-center gap-1 bg-muted rounded px-2 py-0.5 text-[10px]">
              <span className="truncate max-w-[120px]">{f.name}</span>
              <button onClick={() => setFiles(prev => prev.filter((_, j) => j !== i))} className="text-muted-foreground hover:text-foreground">
                <X className="h-3 w-3" />
              </button>
            </div>
          ))}
        </div>
      )}
      <div className="flex items-center gap-1.5">
        <Button
          size="sm"
          className="h-7 text-xs gap-1 bg-green-600 hover:bg-green-700 text-white"
          disabled={submitting}
          onClick={handleSubmit}
        >
          <Send className="h-3 w-3" />
          {submitting ? "Submitting..." : "Confirm Complete"}
        </Button>
        <Button
          size="sm"
          variant="ghost"
          className="h-7 text-xs gap-1"
          onClick={() => fileInputRef.current?.click()}
        >
          <Paperclip className="h-3 w-3" />
          Attach
        </Button>
        <Button
          size="sm"
          variant="ghost"
          className="h-7 text-xs"
          onClick={() => { setShowPanel(false); setComment(""); setFiles([]); }}
        >
          Cancel
        </Button>
        <input
          ref={fileInputRef}
          type="file"
          multiple
          className="hidden"
          onChange={(e) => {
            if (e.target.files) setFiles(prev => [...prev, ...Array.from(e.target.files!)]);
            e.target.value = "";
          }}
        />
      </div>
    </div>
  );
};

const ReviewCard = ({ review, phaseNumber, isCurrent, phaseId, onMarkComplete, reviewerName, taskId, userId, canReply }: { 
  review: { id?: string; review_status: string; review_comment: string | null; review_voice_path: string | null; review_file_paths: string | null; review_file_names: string | null; change_severity: string | null; change_completed_at: string | null; reviewed_at: string | null; round_number?: number; reviewed_by?: string; change_comment?: string | null; change_file_paths?: string | null; change_file_names?: string | null };
  phaseNumber: number;
  isCurrent: boolean;
  phaseId?: string;
  onMarkComplete?: (phaseId: string, reviewStatus: string, comment?: string, filePaths?: string, fileNames?: string) => void;
  reviewerName?: string;
  taskId?: string;
  userId?: string;
  canReply?: boolean;
}) => {
  const isPmNote = review.review_status === "pm_note";
  const isDisapproved = review.review_status === "disapproved_with_changes";
  const isApprovedWithChanges = review.review_status === "approved_with_changes";
  const isApproved = review.review_status === "approved";
  const changesDone = !!review.change_completed_at;
  const isSuperseded = !!(review as any).superseded_at;

  let borderClass = "border-amber-500/30 bg-amber-500/5";
  let statusBadge = <Badge className="bg-amber-500 text-white text-[10px]">Changes Needed</Badge>;

  if (isSuperseded) {
    borderClass = "border-muted/50 bg-muted/20 opacity-60";
    statusBadge = (
      <div className="flex items-center gap-1">
        <Badge variant="outline" className="text-[10px] line-through text-muted-foreground">
          {isPmNote ? "PM Notes" : isApproved ? "Approved" : isApprovedWithChanges ? "Changes Needed" : "Changes Required"}
        </Badge>
        <Badge variant="outline" className="text-[10px] text-muted-foreground">Superseded</Badge>
      </div>
    );
  } else if (isPmNote) {
    borderClass = "border-muted-foreground/20 bg-muted/30";
    statusBadge = <Badge variant="outline" className="text-[10px]">PM Notes</Badge>;
  } else if (isApproved) {
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

  if (changesDone && !isApproved && !isPmNote && !isSuperseded) {
    borderClass = "border-green-500/30 bg-green-500/5";
  }

  return (
    <div className={`border rounded-md p-3 space-y-2 ${borderClass}`}>
      <div className="flex items-center justify-between flex-wrap gap-1">
        <div className="flex items-center gap-1.5">
          <Badge variant="outline" className="text-[10px] px-1.5 py-0 border-muted-foreground/30">{isPmNote ? "PM Notes" : "PM Review"}{reviewerName ? ` · ${reviewerName}` : ""}</Badge>
          {!isPmNote && <span className="text-[10px] font-semibold text-muted-foreground">P{phaseNumber}{review.round_number ? ` · Round ${review.round_number}` : ""}</span>}
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

      {isCurrent && !isSuperseded && phaseId && onMarkComplete && (
        <MarkChangesCompletePanel
          phaseId={phaseId}
          phaseNumber={phaseNumber}
          reviewStatus={review.review_status}
          onMarkComplete={onMarkComplete}
        />
      )}

      {/* Phase-specific reply section */}
      {review.id && taskId && userId && canReply && (
        <PhaseReviewReplySection
          phaseReviewId={review.id}
          taskId={taskId}
          userId={userId}
          canReply={canReply}
          isDevViewer={true}
        />
      )}
    </div>
  );
};

// ─── Phase status badge for accordion header ────────────────────────

const getPhaseStatusBadge = (phase: Phase, phaseReviews: PhaseReview[] = []) => {
  // Derive status from latest actionable review to avoid stale project_phases data
  const latestReview = [...phaseReviews]
    .filter(r => r.phase_id === phase.id && r.review_status !== "pm_note" && r.review_status !== "add_revision_notes" && !(r as any).superseded_at)
    .sort((a, b) => {
      const roundDiff = (b.round_number || 0) - (a.round_number || 0);
      if (roundDiff !== 0) return roundDiff;
      return new Date(b.reviewed_at || 0).getTime() - new Date(a.reviewed_at || 0).getTime();
    })[0];

  const reviewStatus = latestReview ? latestReview.review_status : phase.review_status;
  const changeCompletedAt = latestReview ? latestReview.change_completed_at : phase.change_completed_at;
  const changeSeverity = latestReview ? latestReview.change_severity : phase.change_severity;
  const severityLabel = changeSeverity ? ` (${changeSeverity})` : "";

  if (!reviewStatus) {
    return <Badge variant="outline" className="text-[10px] shrink-0">{phase.status}</Badge>;
  }
  if (reviewStatus === "approved") {
    return <Badge className="bg-green-600 text-white text-[10px] gap-0.5"><CheckCircle2 className="h-2.5 w-2.5" />Approved</Badge>;
  }
  if (reviewStatus === "approved_with_changes") {
    if (changeCompletedAt) {
      return <Badge className="bg-green-600 text-white text-[10px] gap-0.5"><CheckCircle2 className="h-2.5 w-2.5" />Changes Done{severityLabel}</Badge>;
    }
    return <Badge className="bg-amber-500 text-white text-[10px] gap-0.5"><Clock className="h-2.5 w-2.5" />Revision In Progress{severityLabel}</Badge>;
  }
  if (reviewStatus === "disapproved_with_changes") {
    if (changeCompletedAt) {
      return <Badge className="bg-green-600 text-white text-[10px] gap-0.5"><CheckCircle2 className="h-2.5 w-2.5" />Changes Done{severityLabel}</Badge>;
    }
    return <Badge variant="destructive" className="text-[10px] gap-0.5"><AlertTriangle className="h-2.5 w-2.5" />Changes Required{severityLabel}</Badge>;
  }
  return <Badge variant="outline" className="text-[10px] shrink-0">{phase.status}</Badge>;
};

// ─── Main Component ─────────────────────────────────────────────────

// ─── Compact Active Phase Card ──────────────────────────────────────

const CompactActivePhaseCard = ({ phase, phaseReviews, onMarkComplete, reviewerNames, taskId, userId, canReply, devNames }: {
  phase: Phase;
  phaseReviews: PhaseReview[];
  onMarkComplete?: (phaseId: string, reviewStatus: string) => void;
  reviewerNames?: Record<string, string>;
  taskId: string;
  userId?: string;
  canReply?: boolean;
  devNames?: Record<string, string>;
}) => {
  const phaseLabel = phase.phase_number === 1 ? "Phase 1 — Homepage" : `Phase ${phase.phase_number} — Inner Pages`;
  const reviewsForPhase = phaseReviews
    .filter(pr => pr.phase_id === phase.id)
    .sort((a, b) => new Date(b.reviewed_at).getTime() - new Date(a.reviewed_at).getTime());
  const latestReview = reviewsForPhase[0];

  const hasActiveRevision = latestReview
    ? (latestReview.review_status === "approved_with_changes" || latestReview.review_status === "disapproved_with_changes") && !latestReview.change_completed_at && !(latestReview as any).superseded_at
    : (phase.review_status === "approved_with_changes" || phase.review_status === "disapproved_with_changes") && !phase.change_completed_at;

  return (
    <Accordion type="single" collapsible>
      <AccordionItem value={phase.id} className="border rounded-md px-2">
        <AccordionTrigger className="py-2 hover:no-underline">
          <div className="flex items-center gap-2 flex-1 min-w-0 pr-2 flex-wrap">
            <span className="text-xs font-medium truncate">{phaseLabel}</span>
            {getPhaseStatusBadge(phase, phaseReviews)}
            <div className="flex items-center gap-2 ml-auto shrink-0">
              {hasActiveRevision && (() => {
                const reviewDate = latestReview?.reviewed_at || phase.reviewed_at;
                return (
                  <span className="text-[10px] text-destructive font-medium">
                    Revision Requested · {reviewDate ? formatDistanceToNow(new Date(reviewDate), { addSuffix: true }) : ""}
                  </span>
                );
              })()}
              {!hasActiveRevision && phase.completed_at && (
                <span className="text-[10px] text-muted-foreground">
                  Submitted {format(new Date(phase.completed_at), "MMM d, h:mm a")}
                </span>
              )}
              {!hasActiveRevision && !phase.completed_at && phase.started_at && (
                <span className="text-[10px] text-muted-foreground">
                  Started {format(new Date(phase.started_at), "MMM d, h:mm a")}
                </span>
              )}
              {reviewsForPhase.length > 0 && (() => {
                const noteCount = reviewsForPhase.filter((r: any) => r.review_status === "pm_note").length;
                const reviewCount = reviewsForPhase.length - noteCount;
                const parts: string[] = [];
                if (reviewCount > 0) parts.push(`${reviewCount} review${reviewCount !== 1 ? "s" : ""}`);
                if (noteCount > 0) parts.push(`${noteCount} note${noteCount !== 1 ? "s" : ""}`);
                return (
                  <span className="text-[10px] text-muted-foreground">
                    · {parts.join(", ")}
                  </span>
                );
              })()}
            </div>
          </div>
        </AccordionTrigger>
        <AccordionContent className="pb-3 space-y-2.5">
          {/* Show full timeline for this phase */}
          <PhaseTimelineContent
            events={buildPhaseTimeline(phase, phaseReviews, onMarkComplete, reviewerNames, devNames)}
            onMarkComplete={onMarkComplete}
            reviewerNames={reviewerNames}
            taskId={taskId}
            userId={userId}
            canReply={canReply}
          />
        </AccordionContent>
      </AccordionItem>
    </Accordion>
  );
};

// ─── Compact Previous Phase Row ─────────────────────────────────────

const CompactPhaseRow = ({ phase, phaseReviews, onMarkComplete, reviewerNames, taskId, userId, canReply, devNames }: { 
  phase: Phase; 
  phaseReviews: PhaseReview[];
  onMarkComplete?: (phaseId: string, reviewStatus: string) => void;
  reviewerNames?: Record<string, string>;
  taskId: string;
  userId?: string;
  canReply?: boolean;
  devNames?: Record<string, string>;
}) => {
  const phaseLabel = phase.phase_number === 1 ? "P1 — Homepage" : `P${phase.phase_number} — Inner Pages`;
  const events = buildPhaseTimeline(phase, phaseReviews, onMarkComplete, reviewerNames, devNames);
  const reviewCount = events.filter(e => e.type === "pm_review").length;

  return (
    <Accordion type="single" collapsible>
      <AccordionItem value={phase.id} className="border rounded-md px-2 bg-muted/30">
        <AccordionTrigger className="py-1.5 hover:no-underline">
          <div className="flex items-center gap-2 flex-1 min-w-0 pr-2">
            <span className="text-[11px] text-muted-foreground font-medium">{phaseLabel}</span>
            {getPhaseStatusBadge(phase, phaseReviews)}
            {reviewCount > 0 && (
              <span className="text-[10px] text-muted-foreground ml-auto">
                {reviewCount} review{reviewCount !== 1 ? "s" : ""}
              </span>
            )}
          </div>
        </AccordionTrigger>
        <AccordionContent className="pb-3 space-y-2.5">
          <PhaseTimelineContent
            events={events}
            onMarkComplete={onMarkComplete}
            reviewerNames={reviewerNames}
            taskId={taskId}
            userId={userId}
            canReply={canReply}
          />
        </AccordionContent>
      </AccordionItem>
    </Accordion>
  );
};

// ─── Full Timeline Dialog Content ───────────────────────────────────

const FullTimelineDialogContent = ({ sortedPhases, phaseReviews, onMarkPhaseComplete, reviewerNames, taskId, userId, canReply, devNames, holdEvents = [], taskMilestones, reassignmentEvents = [] }: {
  sortedPhases: Phase[];
  phaseReviews: PhaseReview[];
  onMarkPhaseComplete?: (phaseId: string, reviewStatus: string, comment?: string, filePaths?: string, fileNames?: string) => void;
  reviewerNames: Record<string, string>;
  taskId: string;
  userId?: string;
  canReply?: boolean;
  devNames?: Record<string, string>;
  holdEvents?: any[];
  taskMilestones?: { assigned_at?: string; acknowledged_at?: string; first_phase_started_at?: string; completed_at?: string; approved_at?: string; cancelled_at?: string; cancellation_reason?: string } | null;
  reassignmentEvents?: any[];
}) => {
  const [viewMode, setViewMode] = useState<"grouped" | "chronological">("grouped");

  const renderPhaseAccordionItem = (phase: Phase) => {
    const phaseLabel = phase.phase_number === 1 ? "Phase 1 — Homepage" : `Phase ${phase.phase_number} — Inner Pages`;
    const events = buildPhaseTimeline(phase, phaseReviews, onMarkPhaseComplete, reviewerNames, devNames);
    const reviewCount = events.filter(e => e.type === "pm_review").length;

    return (
      <AccordionItem key={phase.id} value={phase.id} className="border rounded-md mb-2 px-2">
        <AccordionTrigger className="py-2 hover:no-underline">
          <div className="flex items-center gap-2 flex-1 min-w-0 pr-2 flex-wrap">
           <span className="text-xs font-medium truncate">{phaseLabel}</span>
            {(() => {
              const unreadNotes = phaseReviews.filter(pr => pr.phase_id === phase.id && pr.review_status === "pm_note" && !pr.dev_read_at).length;
              return unreadNotes > 0 ? (
                <span className="relative flex h-2.5 w-2.5">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-destructive opacity-75"></span>
                  <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-destructive"></span>
                </span>
              ) : null;
            })()}
            {getPhaseStatusBadge(phase, phaseReviews)}
            {reviewCount > 0 && (
              <span className="text-[10px] text-muted-foreground ml-auto">
                {reviewCount} review{reviewCount !== 1 ? "s" : ""}
              </span>
            )}
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

  const renderHoldEvent = (event: any) => {
    const isHold = event.event_type === "hold";
    const performerName = reviewerNames[event.performed_by] || devNames?.[event.performed_by] || "PM";
    return (
      <div key={event.id} className={`flex items-start gap-3 p-3 rounded-md border ${isHold ? "bg-amber-50 border-amber-200 dark:bg-amber-500/10 dark:border-amber-500/30" : "bg-green-50 border-green-200 dark:bg-green-500/10 dark:border-green-500/30"}`}>
        <div className={`mt-0.5 p-1 rounded-full ${isHold ? "bg-amber-100 dark:bg-amber-500/20" : "bg-green-100 dark:bg-green-500/20"}`}>
          {isHold ? <PauseCircle className="h-3.5 w-3.5 text-amber-600 dark:text-amber-400" /> : <PlayCircle className="h-3.5 w-3.5 text-green-600 dark:text-green-400" />}
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-xs font-semibold">
              {isHold ? "Order Put On Hold" : "Order Resumed"}
            </span>
            <Badge variant="outline" className={`text-[10px] ${isHold ? "text-amber-600 border-amber-300" : "text-green-600 border-green-300"}`}>
              {isHold ? "Hold" : "Resumed"}
            </Badge>
          </div>
          <p className="text-[11px] text-muted-foreground mt-0.5">
            by {performerName} • {format(new Date(event.created_at), "MMM d, yyyy 'at' h:mm a")}
            {" "}({formatDistanceToNow(new Date(event.created_at), { addSuffix: true })})
          </p>
          {isHold && event.reason && (
            <p className="text-xs mt-1.5 text-foreground/80 bg-amber-100/50 dark:bg-amber-500/5 px-2 py-1 rounded">
              <span className="font-medium">Reason:</span> {event.reason}
            </p>
          )}
        </div>
      </div>
    );
  };

  const renderReassignmentEvent = (event: any) => (
    <div key={event.id} className="flex items-start gap-3 p-3 rounded-md border bg-orange-50 border-orange-200 dark:bg-orange-500/10 dark:border-orange-500/30">
      <div className="mt-0.5 p-1 rounded-full bg-orange-100 dark:bg-orange-500/20">
        <ArrowRightLeft className="h-3.5 w-3.5 text-orange-600 dark:text-orange-400" />
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-xs font-semibold">Developer Reassigned</span>
          <Badge variant="outline" className="text-[10px] text-orange-600 border-orange-300">Reassigned</Badge>
        </div>
        <p className="text-[11px] text-muted-foreground mt-0.5">
          {event.from_name && <><span className="font-medium">{event.from_name}</span> → </>}
          <span className="font-medium">{event.to_name || "New Developer"}</span>
          {event.reassigned_by_name && <> • by {event.reassigned_by_name}</>}
          {" "}• {format(new Date(event.created_at), "MMM d, yyyy 'at' h:mm a")}
          {" "}({formatDistanceToNow(new Date(event.created_at), { addSuffix: true })})
        </p>
        {event.reason && (
          <p className="text-xs mt-1.5 text-foreground/80 bg-orange-100/50 dark:bg-orange-500/5 px-2 py-1 rounded">
            <span className="font-medium">Reason:</span> {event.reason}
          </p>
        )}
      </div>
    </div>
  );

  const renderMilestoneCard = (item: { label: string; icon: React.ReactNode; date: string; colorClass: string; reason?: string }) => (
    <div className={`flex items-start gap-3 p-3 rounded-md border ${item.colorClass}`}>
      <div className="mt-0.5">{item.icon}</div>
      <div className="flex-1 min-w-0">
        <span className="text-xs font-semibold">{item.label}</span>
        <p className="text-[11px] text-muted-foreground mt-0.5">
          {format(new Date(item.date), "MMM d, yyyy 'at' h:mm a")}
          {" "}({formatDistanceToNow(new Date(item.date), { addSuffix: true })})
        </p>
        {item.reason && (
          <p className="text-xs mt-1.5 text-foreground/80 bg-red-100/50 dark:bg-red-500/5 px-2 py-1 rounded">
            <span className="font-medium">Reason:</span> {item.reason}
          </p>
        )}
      </div>
    </div>
  );

  // Build milestone items
  const milestoneItems: { label: string; icon: React.ReactNode; date: string; colorClass: string; reason?: string }[] = [];
  if (taskMilestones?.assigned_at) {
    milestoneItems.push({ label: "Order Assigned to Developer", icon: <Rocket className="h-3.5 w-3.5 text-blue-600 dark:text-blue-400" />, date: taskMilestones.assigned_at, colorClass: "bg-blue-50 border-blue-200 dark:bg-blue-500/10 dark:border-blue-500/30" });
  }
  if (taskMilestones?.acknowledged_at) {
    milestoneItems.push({ label: "Order Acknowledged", icon: <UserCheck className="h-3.5 w-3.5 text-emerald-600 dark:text-emerald-400" />, date: taskMilestones.acknowledged_at, colorClass: "bg-emerald-50 border-emerald-200 dark:bg-emerald-500/10 dark:border-emerald-500/30" });
  }
  if (taskMilestones?.first_phase_started_at) {
    milestoneItems.push({ label: "Work Started (Phase 1)", icon: <PlayCircle className="h-3.5 w-3.5 text-primary" />, date: taskMilestones.first_phase_started_at, colorClass: "bg-primary/5 border-primary/20" });
  }
  if (taskMilestones?.completed_at) {
    milestoneItems.push({ label: "Order Completed", icon: <CheckCircle2 className="h-3.5 w-3.5 text-violet-600 dark:text-violet-400" />, date: taskMilestones.completed_at, colorClass: "bg-violet-50 border-violet-200 dark:bg-violet-500/10 dark:border-violet-500/30" });
  }
  if (taskMilestones?.approved_at) {
    milestoneItems.push({ label: "Order Approved", icon: <CheckCircle2 className="h-3.5 w-3.5 text-green-600 dark:text-green-400" />, date: taskMilestones.approved_at, colorClass: "bg-green-50 border-green-200 dark:bg-green-500/10 dark:border-green-500/30" });
  }
  if (taskMilestones?.cancelled_at) {
    milestoneItems.push({ label: "Order Cancelled", icon: <X className="h-3.5 w-3.5 text-red-600 dark:text-red-400" />, date: taskMilestones.cancelled_at, colorClass: "bg-red-50 border-red-200 dark:bg-red-500/10 dark:border-red-500/30", reason: taskMilestones.cancellation_reason });
  }

  // ─── Chronological View ───────────────────────────────────────
  const renderChronologicalView = () => {
    type ChronoItem = { date: string; type: string; render: () => React.ReactNode };
    const items: ChronoItem[] = [];

    // Add milestones
    milestoneItems.forEach((m, idx) => {
      items.push({ date: m.date, type: "milestone", render: () => <div key={`m-${idx}`}>{renderMilestoneCard(m)}</div> });
    });

    // Add hold events
    holdEvents.forEach(e => {
      items.push({ date: e.created_at, type: "hold", render: () => renderHoldEvent(e) });
    });

    // Add reassignment events
    reassignmentEvents.forEach(e => {
      items.push({ date: e.created_at, type: "reassignment", render: () => renderReassignmentEvent(e) });
    });

    // Add phase-level events (flattened from all phases)
    sortedPhases.forEach(phase => {
      const phaseEvents = buildPhaseTimeline(phase, phaseReviews, onMarkPhaseComplete, reviewerNames, devNames);
      phaseEvents.forEach(ev => {
        items.push({
          date: ev.dateStr,
          type: ev.type,
          render: () => (
            <div key={ev.key} className="relative">
              {ev.type === "dev_action" ? (
                <DevActionCard
                  type={ev.actionType!}
                  phaseNumber={ev.phaseNumber}
                  timestamp={ev.dateStr}
                  devName={ev.devName}
                  submissionFilePaths={ev.submissionFilePaths}
                  submissionFileNames={ev.submissionFileNames}
                  submissionComment={ev.submissionComment}
                />
              ) : (
                <ReviewCard
                  review={ev.review}
                  phaseNumber={ev.phaseNumber}
                  isCurrent={ev.isCurrent || false}
                  phaseId={ev.phaseId}
                  onMarkComplete={onMarkPhaseComplete}
                  reviewerName={ev.review?.reviewed_by ? reviewerNames?.[ev.review.reviewed_by] : undefined}
                  taskId={taskId}
                  userId={userId}
                  canReply={canReply}
                />
              )}
            </div>
          ),
        });
      });
    });

    // Add "Notes Read" events for pm_note reviews with dev_read_at
    phaseReviews.forEach(pr => {
      if (pr.review_status === "pm_note" && pr.dev_read_at) {
        const phase = sortedPhases.find(p => p.id === pr.phase_id);
        const phaseNum = phase?.phase_number ?? "?";
        const devUserId = phase?.started_by || phase?.completed_by;
        const devName = devUserId ? devNames?.[devUserId] : undefined;
        items.push({
          date: pr.dev_read_at,
          type: "notes_read",
          render: () => (
            <div key={`notes-read-${pr.id}`} className="flex items-start gap-3 p-3 rounded-md border bg-indigo-50 border-indigo-200 dark:bg-indigo-500/10 dark:border-indigo-500/30">
              <div className="mt-0.5 p-1 rounded-full bg-indigo-100 dark:bg-indigo-500/20">
                <Eye className="h-3.5 w-3.5 text-indigo-600 dark:text-indigo-400" />
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-xs font-semibold">{devName ? `${devName} read PM notes` : "Developer Read PM Notes"}</span>
                  <Badge variant="outline" className="text-[10px] text-indigo-600 border-indigo-300">Phase {phaseNum}</Badge>
                </div>
                <p className="text-[11px] text-muted-foreground mt-0.5">
                  {format(new Date(pr.dev_read_at), "MMM d, yyyy 'at' h:mm a")}
                  {" "}({formatDistanceToNow(new Date(pr.dev_read_at), { addSuffix: true })})
                </p>
              </div>
            </div>
          ),
        });
      }
    });

    items.sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());

    if (items.length === 0) {
      return <p className="text-xs text-muted-foreground italic text-center py-4">No timeline events yet.</p>;
    }

    return (
      <div className="relative space-y-2">
        <div className="absolute left-3 top-2 bottom-2 w-px bg-border" />
        {items.map((item, idx) => (
          <div key={idx} className="relative pl-7">
            <div className={`absolute left-[9px] top-4 w-1.5 h-1.5 rounded-full ${
              item.type === "milestone" ? "bg-blue-500" :
              item.type === "hold" ? "bg-amber-500" :
              item.type === "reassignment" ? "bg-orange-500" :
              item.type === "notes_read" ? "bg-indigo-500" :
              item.type === "pm_review" ? "bg-amber-500" :
              "bg-primary"
            }`} />
            {item.render()}
          </div>
        ))}
      </div>
    );
  };

  // ─── Grouped View (original) ──────────────────────────────────
  const renderGroupedView = () => (
    <div className="space-y-2">
      {milestoneItems.length > 0 && (
        <Collapsible defaultOpen={true}>
          <CollapsibleTrigger className="flex items-center gap-2 w-full text-left group mb-1">
            <ChevronDown className="h-3.5 w-3.5 text-muted-foreground transition-transform group-data-[state=open]:rotate-180" />
            <h4 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Order Milestones</h4>
            <Badge variant="outline" className="text-[10px] ml-auto">{milestoneItems.length}</Badge>
          </CollapsibleTrigger>
          <CollapsibleContent className="space-y-1.5 mb-3">
            {milestoneItems.map((item, idx) => <div key={idx}>{renderMilestoneCard(item)}</div>)}
          </CollapsibleContent>
        </Collapsible>
      )}

      {reassignmentEvents.length > 0 && (
        <Collapsible defaultOpen={true}>
          <CollapsibleTrigger className="flex items-center gap-2 w-full text-left group mb-1">
            <ChevronDown className="h-3.5 w-3.5 text-muted-foreground transition-transform group-data-[state=open]:rotate-180" />
            <h4 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Reassignment History</h4>
            <Badge variant="outline" className="text-[10px] ml-auto">{reassignmentEvents.length}</Badge>
          </CollapsibleTrigger>
          <CollapsibleContent className="space-y-1.5 mb-3">
            {reassignmentEvents
              .sort((a: any, b: any) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime())
              .map((event: any) => renderReassignmentEvent(event))}
          </CollapsibleContent>
        </Collapsible>
      )}

      {holdEvents.length > 0 && (
        <Collapsible defaultOpen={true}>
          <CollapsibleTrigger className="flex items-center gap-2 w-full text-left group mb-1">
            <ChevronDown className="h-3.5 w-3.5 text-muted-foreground transition-transform group-data-[state=open]:rotate-180" />
            <h4 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Hold / Resume History</h4>
            <Badge variant="outline" className="text-[10px] ml-auto">{holdEvents.length}</Badge>
          </CollapsibleTrigger>
          <CollapsibleContent className="space-y-1.5 mb-3">
            {holdEvents
              .sort((a: any, b: any) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime())
              .map((event: any) => renderHoldEvent(event))}
          </CollapsibleContent>
        </Collapsible>
      )}
      {/* Notes Read section */}
      {(() => {
        const notesReadItems = phaseReviews.filter(pr => pr.review_status === "pm_note" && pr.dev_read_at);
        if (notesReadItems.length === 0) return null;
        return (
          <Collapsible defaultOpen={true}>
            <CollapsibleTrigger className="flex items-center gap-2 w-full text-left group mb-1">
              <ChevronDown className="h-3.5 w-3.5 text-muted-foreground transition-transform group-data-[state=open]:rotate-180" />
              <h4 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Notes Read</h4>
              <Badge variant="outline" className="text-[10px] ml-auto">{notesReadItems.length}</Badge>
            </CollapsibleTrigger>
            <CollapsibleContent className="space-y-1.5 mb-3">
              {notesReadItems
                .sort((a, b) => new Date(a.dev_read_at!).getTime() - new Date(b.dev_read_at!).getTime())
                .map(pr => {
                  const phase = sortedPhases.find(p => p.id === pr.phase_id);
                  const phaseNum = phase?.phase_number ?? "?";
                  const devUserId = phase?.started_by || phase?.completed_by;
                  const devName = devUserId ? devNames?.[devUserId] : undefined;
                  return (
                    <div key={`notes-read-${pr.id}`} className="flex items-start gap-3 p-3 rounded-md border bg-indigo-50 border-indigo-200 dark:bg-indigo-500/10 dark:border-indigo-500/30">
                      <div className="mt-0.5 p-1 rounded-full bg-indigo-100 dark:bg-indigo-500/20">
                        <Eye className="h-3.5 w-3.5 text-indigo-600 dark:text-indigo-400" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="text-xs font-semibold">{devName ? `${devName} read PM notes` : "Developer Read PM Notes"}</span>
                          <Badge variant="outline" className="text-[10px] text-indigo-600 border-indigo-300">Phase {phaseNum}</Badge>
                        </div>
                        <p className="text-[11px] text-muted-foreground mt-0.5">
                          {format(new Date(pr.dev_read_at!), "MMM d, yyyy 'at' h:mm a")}
                          {" "}({formatDistanceToNow(new Date(pr.dev_read_at!), { addSuffix: true })})
                        </p>
                      </div>
                    </div>
                  );
                })}
            </CollapsibleContent>
          </Collapsible>
        );
      })()}

      <Accordion type="multiple" defaultValue={sortedPhases.map(p => p.id)}>
        {sortedPhases.map(phase => renderPhaseAccordionItem(phase))}
      </Accordion>
    </div>
  );

  return (
    <div>
      {/* View mode toggle */}
      <div className="flex items-center gap-1 mb-3 p-0.5 bg-muted rounded-md w-fit">
        <Button
          variant={viewMode === "grouped" ? "secondary" : "ghost"}
          size="sm"
          className="h-7 text-[11px] gap-1.5 px-3"
          onClick={() => setViewMode("grouped")}
        >
          <Layers className="h-3 w-3" />
          Grouped
        </Button>
        <Button
          variant={viewMode === "chronological" ? "secondary" : "ghost"}
          size="sm"
          className="h-7 text-[11px] gap-1.5 px-3"
          onClick={() => setViewMode("chronological")}
        >
          <List className="h-3 w-3" />
          Chronological
        </Button>
      </div>
      <ScrollArea className="h-[65vh]">
        {viewMode === "grouped" ? renderGroupedView() : renderChronologicalView()}
      </ScrollArea>
    </div>
  );
};

// ─── Main Component ─────────────────────────────────────────────────

export const DevPhaseReviewTimeline = ({ phases, phaseReviews, taskId, compact = false, onMarkPhaseComplete, reviewerNames = {}, userId, canReply = false, devNames = {}, autoMarkRead = false }: DevPhaseReviewTimelineProps) => {
  const [showFullTimeline, setShowFullTimeline] = useState(false);

  // Fetch hold/resume events for this task
  const { data: holdEvents } = useQuery({
    queryKey: ["task-hold-events", taskId],
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("task_hold_events")
        .select("*")
        .eq("task_id", taskId)
        .order("created_at", { ascending: true });
      if (error) throw error;
      return data || [];
    },
    enabled: showFullTimeline,
  });

  // Fetch reassignment history for this task
  const { data: reassignmentEvents } = useQuery({
    queryKey: ["task-reassignment-history", taskId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("reassignment_history")
        .select("*")
        .eq("task_id", taskId)
        .order("created_at", { ascending: true });
      if (error) throw error;
      if (!data || data.length === 0) return [];

      // Resolve developer names
      const devIds = new Set<string>();
      const userIds = new Set<string>();
      data.forEach((r: any) => {
        if (r.from_developer_id) devIds.add(r.from_developer_id);
        if (r.to_developer_id) devIds.add(r.to_developer_id);
        if (r.reassigned_by) userIds.add(r.reassigned_by);
      });

      const devNameMap: Record<string, string> = {};
      if (devIds.size > 0) {
        const { data: devs } = await supabase
          .from("developers")
          .select("id, name")
          .in("id", Array.from(devIds));
        devs?.forEach((d: any) => { devNameMap[d.id] = d.name; });
      }

      const userNameMap: Record<string, string> = {};
      if (userIds.size > 0) {
        const { data: profiles } = await supabase
          .from("profiles")
          .select("id, full_name, email")
          .in("id", Array.from(userIds));
        profiles?.forEach((p: any) => { userNameMap[p.id] = p.full_name || p.email; });
      }

      return data.map((r: any) => ({
        ...r,
        from_name: r.from_developer_id ? devNameMap[r.from_developer_id] : null,
        to_name: devNameMap[r.to_developer_id] || null,
        reassigned_by_name: userNameMap[r.reassigned_by] || null,
      }));
    },
    enabled: showFullTimeline,
  });

  // Fetch task milestones (assigned_at from status=assigned, acknowledged_at, first phase started_at)
  const { data: taskMilestones } = useQuery({
    queryKey: ["task-milestones", taskId],
    queryFn: async () => {
      // Get task-level data
      const { data: task } = await supabase
        .from("tasks")
        .select("created_at, acknowledged_at, status, updated_at, cancelled_at, cancellation_reason")
        .eq("id", taskId)
        .single();

      // Get first phase started_at
      const { data: firstPhase } = await supabase
        .from("project_phases")
        .select("started_at")
        .eq("task_id", taskId)
        .eq("phase_number", 1)
        .single();

      // Get last phase completed_at for "completed" milestone
      const { data: lastCompletedPhase } = await supabase
        .from("project_phases")
        .select("completed_at")
        .eq("task_id", taskId)
        .not("completed_at", "is", null)
        .order("phase_number", { ascending: false })
        .limit(1)
        .single();

      return {
        assigned_at: task?.created_at || undefined,
        acknowledged_at: task?.acknowledged_at || undefined,
        first_phase_started_at: firstPhase?.started_at || undefined,
        completed_at: task?.status === 'completed' || task?.status === 'approved' ? lastCompletedPhase?.completed_at || undefined : undefined,
        approved_at: task?.status === 'approved' ? task?.updated_at || undefined : undefined,
        cancelled_at: task?.status === 'cancelled' ? task?.cancelled_at || undefined : undefined,
        cancellation_reason: task?.status === 'cancelled' ? task?.cancellation_reason || undefined : undefined,
      };
    },
    enabled: showFullTimeline,
  });

  // Mark unread PM notes as read after a 2-second delay — only when autoMarkRead is true (View Details dialog)
  useEffect(() => {
    if (!autoMarkRead) return;
    const unreadNoteIds = phaseReviews
      .filter(pr => pr.review_status === "pm_note" && !pr.dev_read_at)
      .map(pr => pr.id);
    if (unreadNoteIds.length === 0) return;
    const timer = setTimeout(() => {
      supabase
        .from("phase_reviews")
        .update({ dev_read_at: new Date().toISOString() } as any)
        .in("id", unreadNoteIds)
        .then();
    }, 2000);
    return () => clearTimeout(timer);
  }, [phaseReviews, taskId]);

  const sortedPhases = [...phases].sort((a, b) => a.phase_number - b.phase_number);

  if (sortedPhases.length === 0) return null;

  // Determine the active/latest phase
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

  return (
    <div className="space-y-2">
      {/* Compact: Active phase with latest review info */}
      {activePhase && (
        <CompactActivePhaseCard
          phase={activePhase}
          phaseReviews={phaseReviews}
          onMarkComplete={onMarkPhaseComplete}
          reviewerNames={reviewerNames}
          taskId={taskId}
          userId={userId}
          canReply={canReply}
          devNames={devNames}
        />
      )}

      {/* Compact: Previous phases as minimal rows */}
      {otherPhases.length > 0 && (
        <Collapsible defaultOpen={false}>
          <CollapsibleTrigger className="flex items-center gap-2 w-full text-left group">
            <ChevronDown className="h-3.5 w-3.5 text-muted-foreground transition-transform group-data-[state=open]:rotate-180" />
            <h4 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Previous Phases</h4>
            <Badge variant="outline" className="text-[10px] ml-auto">{otherPhases.length}</Badge>
          </CollapsibleTrigger>
          <CollapsibleContent className="mt-1.5 space-y-1">
            {otherPhases.map(phase => (
              <CompactPhaseRow key={phase.id} phase={phase} phaseReviews={phaseReviews} onMarkComplete={onMarkPhaseComplete} reviewerNames={reviewerNames} taskId={taskId} userId={userId} canReply={canReply} devNames={devNames} />
            ))}
          </CollapsibleContent>
        </Collapsible>
      )}

      {/* View Full Timeline button */}
      <Dialog open={showFullTimeline} onOpenChange={setShowFullTimeline}>
        <Button
          variant="ghost"
          size="sm"
          className="w-full text-[11px] text-muted-foreground gap-1.5 h-7"
          onClick={() => setShowFullTimeline(true)}
        >
          <History className="h-3 w-3" />
          View Full Timeline
        </Button>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle className="text-sm">Full Phase Timeline</DialogTitle>
          </DialogHeader>
          <FullTimelineDialogContent
            sortedPhases={sortedPhases}
            phaseReviews={phaseReviews}
            onMarkPhaseComplete={onMarkPhaseComplete}
            reviewerNames={reviewerNames}
            taskId={taskId}
            userId={userId}
            canReply={canReply}
            devNames={devNames}
            holdEvents={holdEvents || []}
            taskMilestones={taskMilestones}
            reassignmentEvents={reassignmentEvents || []}
          />
        </DialogContent>
      </Dialog>
    </div>
  );
};
