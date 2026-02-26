import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Globe, ExternalLink, Clock, CheckCircle2, AlertTriangle, MessageSquare, FileText } from "lucide-react";
import { format, formatDistanceToNow } from "date-fns";

interface LatestSubmissionPanelProps {
  task: any;
  phases: any[];
  phaseReviews: any[];
  unreadReplyCount: number;
  submissions: any[];
  isAssignedPM: boolean;
  onApprove: (phaseId: string) => void;
  onApproveWithChanges: (phaseId: string, phaseNumber: number) => void;
  onDisapprove: (phaseId: string, phaseNumber: number) => void;
  isPending?: boolean;
}

const parseUrls = (comment: string): { label: string; url: string }[] => {
  const results: { label: string; url: string }[] = [];
  const lines = comment.split('\n');
  for (const line of lines) {
    const match = line.match(/🔗\s*(.+?):\s*((?:https?:\/\/)?[^\s]+\.[a-zA-Z]{2,}[^\s]*)/);
    if (match) {
      const url = match[2].match(/^https?:\/\//) ? match[2] : `https://${match[2]}`;
      results.push({ label: match[1].trim(), url: url.trim() });
    }
  }
  return results;
};

export const LatestSubmissionPanel = ({
  task,
  phases,
  phaseReviews,
  unreadReplyCount,
  submissions,
  isAssignedPM,
  onApprove,
  onApproveWithChanges,
  onDisapprove,
  isPending,
}: LatestSubmissionPanelProps) => {
  if (task.post_type !== "Website Design") return null;

  const taskPhases = phases
    .filter(p => p.task_id === task.id)
    .sort((a, b) => a.phase_number - b.phase_number);

  if (taskPhases.length === 0) return null;

  // Find the latest phase that needs attention:
  // 1. Submitted (completed_at set) but not yet reviewed
  // 2. Has review with completed changes (revision re-submitted, needs re-review)
  // 3. Has latest review in a non-approved non-change-request intermediate state
  const getLatestActionableReview = (phaseId: string) => {
    return [...phaseReviews]
      .filter((r: any) =>
        r.phase_id === phaseId &&
        r.review_status !== "pm_note" &&
        r.review_status !== "add_revision_notes" &&
        !r.superseded_at
      )
      .sort((a: any, b: any) => {
        const roundDiff = (b.round_number || 0) - (a.round_number || 0);
        if (roundDiff !== 0) return roundDiff;
        return new Date(b.reviewed_at || 0).getTime() - new Date(a.reviewed_at || 0).getTime();
      })[0];
  };

  const getPhaseState = (phase: any) => {
    const latestReview = getLatestActionableReview(phase.id);
    return {
      review_status: latestReview ? latestReview.review_status : phase.review_status,
      change_completed_at: latestReview ? latestReview.change_completed_at : phase.change_completed_at,
      change_deadline: latestReview ? latestReview.change_deadline : phase.change_deadline,
    };
  };

  const actionablePhase = [...taskPhases].reverse().find((phase) => {
    const phaseState = getPhaseState(phase);

    if (phase.completed_at && !phaseState.review_status) return true;
    if (phase.completed_at && phaseState.change_completed_at && phaseState.review_status !== "approved") return true;
    if (
      phase.completed_at &&
      phaseState.review_status &&
      phaseState.review_status !== "approved" &&
      phaseState.review_status !== "approved_with_changes" &&
      phaseState.review_status !== "disapproved_with_changes"
    ) {
      return true;
    }

    return false;
  });

  const phaseWithPendingChanges = [...taskPhases].reverse().find((phase) => {
    const phaseState = getPhaseState(phase);
    return (
      (phaseState.review_status === "approved_with_changes" || phaseState.review_status === "disapproved_with_changes") &&
      !phaseState.change_completed_at
    );
  });

  const displayPhase = actionablePhase || phaseWithPendingChanges;

  if (!displayPhase) return null;

  const displayPhaseState = getPhaseState(displayPhase);

  const phaseLabel = displayPhase.phase_number === 1 ? "Phase 1 — Homepage" : `Phase ${displayPhase.phase_number} — Inner Pages`;

  // Get URLs — prioritize phase.submission_comment (phase-specific) over design_submissions
  let urls: { label: string; url: string }[] = [];
  if (displayPhase.submission_comment) {
    urls = parseUrls(displayPhase.submission_comment);
  } else {
    // Fallback: assign submissions to nearest phase by completion time
    const urlSubmissions = [...submissions]
      .filter(s => s.designer_comment?.includes('🔗'))
      .sort((a, b) => new Date(a.submitted_at || '').getTime() - new Date(b.submitted_at || '').getTime());
    
    const completedPhases = taskPhases.filter(p => p.completed_at).sort((a, b) => a.phase_number - b.phase_number);
    
    const phaseSubmissions: any[] = [];
    for (const sub of urlSubmissions) {
      const subTime = new Date(sub.submitted_at || '').getTime();
      let bestPhase = completedPhases[0];
      let bestDiff = bestPhase ? Math.abs(new Date(bestPhase.completed_at).getTime() - subTime) : Infinity;
      for (const phase of completedPhases) {
        const diff = Math.abs(new Date(phase.completed_at).getTime() - subTime);
        if (diff < bestDiff) { bestDiff = diff; bestPhase = phase; }
      }
      if (bestPhase?.phase_number === displayPhase.phase_number) phaseSubmissions.push(sub);
    }
    urls = phaseSubmissions.flatMap(s => parseUrls(s.designer_comment || ''));
  }

  // Determine the state for action buttons based on latest actionable review state
  const hasActiveRevision =
    (displayPhaseState.review_status === "approved_with_changes" ||
      displayPhaseState.review_status === "disapproved_with_changes") &&
    !displayPhaseState.change_completed_at;

  const isSubmittedAwaitingReview = !!actionablePhase && !hasActiveRevision;
  const isChangesInProgress = !!phaseWithPendingChanges && !actionablePhase;
  const isRevisionResubmission = isSubmittedAwaitingReview && !!displayPhaseState.change_completed_at;

  // Status indicator
  const getStatusBadge = () => {
    if (isSubmittedAwaitingReview) {
      if (isRevisionResubmission) {
        return <Badge className="bg-emerald-600 text-white text-xs gap-1"><CheckCircle2 className="h-3 w-3" />Changes Submitted — Awaiting Re-review</Badge>;
      }
      return <Badge className="bg-blue-600 text-white text-xs gap-1"><Clock className="h-3 w-3" />Awaiting Review</Badge>;
    }
    if (isChangesInProgress) {
      const isOverdue = displayPhaseState.change_deadline && new Date(displayPhaseState.change_deadline) < new Date();
      if (isOverdue) {
        return <Badge variant="destructive" className="text-xs gap-1"><AlertTriangle className="h-3 w-3" />Changes Overdue</Badge>;
      }
      return <Badge className="bg-amber-500 text-white text-xs gap-1"><Clock className="h-3 w-3" />Changes In Progress</Badge>;
    }
    return null;
  };

  // Non-URL comment text
  const getNonUrlComment = () => {
    const comment = displayPhase.submission_comment;
    if (!comment) return null;
    const lines = comment.split('\n').filter((line: string) => !line.match(/🔗/)).join('\n').trim();
    return lines || null;
  };

  return (
    <div className="mx-4 mb-2 p-3 rounded-lg border-2 border-blue-200 bg-blue-50/50 dark:border-blue-800 dark:bg-blue-950/20 space-y-2.5">
      {/* Header */}
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <div className="flex items-center gap-2">
          <FileText className="h-4 w-4 text-blue-600 dark:text-blue-400" />
          <span className="text-sm font-semibold text-blue-900 dark:text-blue-100">
            {isRevisionResubmission ? "Revision Submitted" : "Latest Submission"} — {phaseLabel}
          </span>
        </div>
        <div className="flex items-center gap-2">
          {getStatusBadge()}
          {unreadReplyCount > 0 && (
            <Badge variant="destructive" className="text-xs gap-1">
              <MessageSquare className="h-3 w-3" />{unreadReplyCount} unread
            </Badge>
          )}
        </div>
      </div>

      {/* Timestamp */}
      {displayPhase.completed_at && (
        <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
          <Clock className="h-3 w-3 shrink-0" />
          <span>Submitted on {format(new Date(displayPhase.completed_at), "MMM d, yyyy 'at' h:mm a")}</span>
          <span className="text-muted-foreground/60">({formatDistanceToNow(new Date(displayPhase.completed_at), { addSuffix: true })})</span>
        </div>
      )}

      {/* URLs */}
      {urls.length > 0 && (
        <div className="space-y-1">
          {urls.map((u, i) => (
            <a key={i} href={u.url} target="_blank" rel="noopener noreferrer" className="flex items-center gap-1.5 text-xs text-primary hover:underline">
              <Globe className="h-3 w-3 shrink-0" />
              <span className="truncate">{u.label}: {u.url}</span>
              <ExternalLink className="h-3 w-3 shrink-0 opacity-50" />
            </a>
          ))}
        </div>
      )}

      {/* Non-URL comment */}
      {getNonUrlComment() && (
        <p className="text-xs text-muted-foreground whitespace-pre-wrap">{getNonUrlComment()}</p>
      )}

      {/* Submission files */}
      {displayPhase.submission_file_names && (
        <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
          <FileText className="h-3 w-3" />
          <span>{displayPhase.submission_file_names.split('|||').length} file(s) attached</span>
        </div>
      )}

      {/* Action buttons - only for assigned PM, when phase is submitted and awaiting review */}
      {isAssignedPM && isSubmittedAwaitingReview && (
        <div className="flex items-center gap-1.5 pt-1">
          <Button
            size="sm"
            variant="outline"
            className="h-7 text-xs bg-green-50 border-green-300 text-green-700 hover:bg-green-100"
            onClick={() => onApprove(displayPhase.id)}
            disabled={isPending}
          >
            <CheckCircle2 className="h-3 w-3 mr-1" />Approve
          </Button>
          <Button
            size="sm"
            variant="outline"
            className="h-7 text-xs bg-amber-50 border-amber-300 text-amber-700 hover:bg-amber-100"
            onClick={() => onApproveWithChanges(displayPhase.id, displayPhase.phase_number)}
          >
            <Clock className="h-3 w-3 mr-1" />Approve w/ Changes
          </Button>
          <Button
            size="sm"
            variant="outline"
            className="h-7 text-xs bg-red-50 border-red-300 text-red-700 hover:bg-red-100"
            onClick={() => onDisapprove(displayPhase.id, displayPhase.phase_number)}
          >
            <AlertTriangle className="h-3 w-3 mr-1" />Disapprove
          </Button>
        </div>
      )}

      {/* Change deadline info when changes are in progress */}
      {isChangesInProgress && displayPhaseState.change_deadline && (
        <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
          <Clock className="h-3 w-3" />
          <span>
            Change deadline: {format(new Date(displayPhaseState.change_deadline), "MMM d, yyyy 'at' h:mm a")}
            {" "}({formatDistanceToNow(new Date(displayPhaseState.change_deadline), { addSuffix: true })})
          </span>
        </div>
      )}
    </div>
  );
};
