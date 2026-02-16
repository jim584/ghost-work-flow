import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { CheckCircle2, AlertTriangle, Clock, MessageSquare, Globe, ExternalLink } from "lucide-react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { format } from "date-fns";
import { PhaseReviewSubmissionPanel } from "@/components/PhaseReviewSubmissionPanel";

const SEVERITY_OPTIONS = [
  { value: "minor", label: "Minor", hours: 2, description: "Small tweaks" },
  { value: "average", label: "Average", hours: 4, description: "Moderate changes" },
  { value: "major", label: "Major", hours: 9, description: "Significant rework (1 day)" },
  { value: "major_major", label: "Major Major", hours: 18, description: "Extensive rework (2 days)" },
] as const;

interface PhaseReviewSectionProps {
  task: any;
  phases: any[];
  userId: string;
  isAssignedPM: boolean;
  queryKeysToInvalidate: string[][];
  readOnly?: boolean;
  submissions?: any[];
}

export const PhaseReviewSection = ({ task, phases, userId, isAssignedPM, queryKeysToInvalidate, readOnly, submissions = [] }: PhaseReviewSectionProps) => {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [reviewDialog, setReviewDialog] = useState<{
    open: boolean;
    phaseId: string;
    phaseNumber: number;
    reviewType: "approved_with_changes" | "disapproved_with_changes";
  } | null>(null);
  const [reviewComment, setReviewComment] = useState("");
  const [changeSeverity, setChangeSeverity] = useState<string>("minor");
  const [reviewVoiceBlob, setReviewVoiceBlob] = useState<Blob | null>(null);
  const [reviewFiles, setReviewFiles] = useState<File[]>([]);

  const taskPhases = phases.filter(p => p.task_id === task.id).sort((a, b) => a.phase_number - b.phase_number);

  if (taskPhases.length === 0) return null;

  const submitReview = useMutation({
    mutationFn: async ({ phaseId, reviewStatus, comment, severity, voiceBlob, files }: {
      phaseId: string; reviewStatus: string; comment?: string; severity?: string;
      voiceBlob?: Blob | null; files?: File[];
    }) => {
      const now = new Date().toISOString();

      // Upload voice recording if present
      let reviewVoicePath: string | null = null;
      if (voiceBlob) {
        const ext = voiceBlob.type.includes('webm') ? 'webm' : 'm4a';
        const safeName = `${Date.now()}_${Math.random().toString(36).slice(2)}.${ext}`;
        const storagePath = `phase-reviews/${phaseId}/${safeName}`;
        const { error: uploadError } = await supabase.storage
          .from("design-files")
          .upload(storagePath, voiceBlob, { contentType: voiceBlob.type });
        if (uploadError) throw uploadError;
        reviewVoicePath = storagePath;
      }

      // Upload attached files
      let reviewFilePaths: string | null = null;
      let reviewFileNames: string | null = null;
      if (files && files.length > 0) {
        const paths: string[] = [];
        const names: string[] = [];
        for (const file of files) {
          const ext = file.name.split(".").pop();
          const safeName = `${Date.now()}_${Math.random().toString(36).slice(2)}.${ext}`;
          const storagePath = `phase-reviews/${phaseId}/${safeName}`;
          const { error: uploadError } = await supabase.storage
            .from("design-files")
            .upload(storagePath, file);
          if (uploadError) throw uploadError;
          paths.push(storagePath);
          names.push(file.name);
        }
        reviewFilePaths = paths.join("|||");
        reviewFileNames = names.join("|||");
      }

      const updateData: any = {
        review_status: reviewStatus,
        review_comment: comment || null,
        reviewed_at: now,
        reviewed_by: userId,
        change_severity: severity || null,
        review_voice_path: reviewVoicePath,
        review_file_paths: reviewFilePaths,
        review_file_names: reviewFileNames,
      };

      // When a phase is approved (straight approve), mark it as completed
      if (reviewStatus === "approved") {
        updateData.status = "completed";
        updateData.completed_at = now;
      }

      // Calculate change deadline if severity is set
      if (severity && task.developer_id) {
        const severityHours = SEVERITY_OPTIONS.find(s => s.value === severity)?.hours || 2;
        try {
          const slaResponse = await supabase.functions.invoke('calculate-sla-deadline', {
            body: { developer_id: task.developer_id, start_time: new Date().toISOString(), sla_hours: severityHours },
          });
          if (slaResponse.data?.deadline) {
            updateData.change_deadline = slaResponse.data.deadline;
          }
        } catch (e) {
          console.error("Change deadline calculation failed:", e);
        }
      }

      const { error } = await supabase
        .from("project_phases")
        .update(updateData)
        .eq("id", phaseId);
      if (error) throw error;

      // Notify the developer
      // Find the developer's user_id from the developers table
      if (task.developer_id) {
        const { data: dev } = await supabase
          .from("developers")
          .select("user_id")
          .eq("id", task.developer_id)
          .single();

        if (dev?.user_id) {
          const phase = taskPhases.find(p => p.id === phaseId);
          const phaseLabel = phase?.phase_number === 1 ? "Homepage" : `Phase ${phase?.phase_number}`;
          const statusLabel = reviewStatus === "approved" ? "Approved" :
            reviewStatus === "approved_with_changes" ? "Approved with Changes" : "Disapproved with Changes";

          await supabase.from("notifications").insert({
            user_id: dev.user_id,
            type: "phase_review",
            title: `Phase Review: ${statusLabel}`,
            message: `${phaseLabel} for "${task.title}" has been ${statusLabel.toLowerCase()}.${comment ? ` Comment: ${comment}` : ""}${reviewStatus === "disapproved_with_changes" ? " Work is blocked until changes are made." : ""}`,
            task_id: task.id,
          });
        }
      }
    },
    onSuccess: () => {
      queryKeysToInvalidate.forEach(key => queryClient.invalidateQueries({ queryKey: key }));
      toast({ title: "Phase review submitted" });
      setReviewDialog(null);
      setReviewComment("");
      setChangeSeverity("minor");
      setReviewVoiceBlob(null);
      setReviewFiles([]);
    },
    onError: (error: any) => {
      toast({ variant: "destructive", title: "Error submitting review", description: error.message });
    },
  });

  const getReviewBadge = (phase: any) => {
    if (!phase.review_status) return null;
    if (phase.review_status === "approved") {
      return <Badge className="bg-green-600 text-white text-xs gap-1"><CheckCircle2 className="h-3 w-3" />Approved</Badge>;
    }
    if (phase.review_status === "approved_with_changes") {
      return (
        <Badge className="bg-amber-500 text-white text-xs gap-1">
          <Clock className="h-3 w-3" />
          Changes Needed {phase.change_severity ? `(${phase.change_severity})` : ""}
        </Badge>
      );
    }
    if (phase.review_status === "disapproved_with_changes") {
      return (
        <Badge variant="destructive" className="text-xs gap-1">
          <AlertTriangle className="h-3 w-3" />
          Changes Required {phase.change_severity ? `(${phase.change_severity})` : ""}
        </Badge>
      );
    }
    return null;
  };

  const isWebsiteOrder = task.post_type === "Website Design";
  if (!isWebsiteOrder) return null;

  // Extract URLs from submissions' designer_comment field
  const parseUrls = (comment: string): { label: string; url: string }[] => {
    const results: { label: string; url: string }[] = [];
    const lines = comment.split('\n');
    for (const line of lines) {
      const match = line.match(/🔗\s*(.+?):\s*(https?:\/\/\S+)/);
      if (match) {
        results.push({ label: match[1].trim(), url: match[2].trim() });
      }
    }
    return results;
  };

  // Group submissions by phase - use submitted_at ordering to match phases
  const getPhaseSubmissions = (phaseNumber: number) => {
    // Sort submissions by submitted_at
    const sorted = [...submissions].sort((a, b) => 
      new Date(a.submitted_at || '').getTime() - new Date(b.submitted_at || '').getTime()
    );
    // Each submission corresponds to the phase that was current when it was submitted
    // We can match by checking: submissions made while phase was in_progress or completed
    // Simplest: return submissions whose comment contains "Homepage" for phase 1, otherwise for later phases
    if (phaseNumber === 1) {
      return sorted.filter(s => s.designer_comment?.includes('Homepage'));
    }
    // For inner pages, show submissions that mention "Inner Page" or don't mention "Homepage"
    return sorted.filter(s => s.designer_comment && !s.designer_comment.includes('Homepage'));
  };

  return (
    <>
      <div className="border-t pt-3 mt-3">
        <h4 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-2">Phase Reviews</h4>
        <div className="space-y-2">
          {taskPhases.map(phase => {
            const phaseLabel = phase.phase_number === 1 ? "Phase 1 — Homepage" : `Phase ${phase.phase_number} — Inner Pages`;
            const canReview = isAssignedPM && !readOnly && (phase.status === "in_progress" || phase.status === "completed") && !phase.review_status;
            const hasReview = !!phase.review_status;
            const phaseUrls = submissions.length > 0 ? getPhaseSubmissions(phase.phase_number) : [];

            return (
              <div key={phase.id} className="p-2 bg-muted/20 rounded-md border space-y-2">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2 flex-1 min-w-0">
                    <span className="text-xs font-medium truncate">{phaseLabel}</span>
                    <Badge variant="outline" className="text-xs shrink-0">{phase.status}</Badge>
                    {getReviewBadge(phase)}
                    {phase.change_completed_at && (
                      <Badge className="bg-green-100 text-green-700 text-xs">Changes Done</Badge>
                    )}
                  </div>
                  <div className="flex items-center gap-1 ml-2">
                    {canReview && (
                      <>
                        <Button
                          size="sm"
                          variant="outline"
                          className="h-7 text-xs bg-green-50 border-green-300 text-green-700 hover:bg-green-100"
                          onClick={() => submitReview.mutate({
                            phaseId: phase.id, reviewStatus: "approved",
                          })}
                          disabled={submitReview.isPending}
                        >
                          <CheckCircle2 className="h-3 w-3 mr-1" />
                          Approve
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          className="h-7 text-xs bg-amber-50 border-amber-300 text-amber-700 hover:bg-amber-100"
                          onClick={() => setReviewDialog({
                            open: true, phaseId: phase.id, phaseNumber: phase.phase_number,
                            reviewType: "approved_with_changes",
                          })}
                        >
                          <Clock className="h-3 w-3 mr-1" />
                          Approve w/ Changes
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          className="h-7 text-xs bg-red-50 border-red-300 text-red-700 hover:bg-red-100"
                          onClick={() => setReviewDialog({
                            open: true, phaseId: phase.id, phaseNumber: phase.phase_number,
                            reviewType: "disapproved_with_changes",
                          })}
                        >
                          <AlertTriangle className="h-3 w-3 mr-1" />
                          Disapprove
                        </Button>
                      </>
                    )}
                    {hasReview && phase.review_comment && (
                      <div className="text-xs text-muted-foreground max-w-[200px] truncate" title={phase.review_comment}>
                        <MessageSquare className="h-3 w-3 inline mr-1" />
                        {phase.review_comment}
                      </div>
                    )}
                  </div>
                </div>
                {/* Submitted URLs for this phase */}
                {phaseUrls.length > 0 && (
                  <div className="pl-2 space-y-1">
                    {phaseUrls.map((sub: any) => {
                      const urls = parseUrls(sub.designer_comment || '');
                      return urls.map((u, i) => (
                        <a
                          key={`${sub.id}-${i}`}
                          href={u.url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="flex items-center gap-1.5 text-xs text-primary hover:underline"
                        >
                          <Globe className="h-3 w-3 shrink-0" />
                          <span className="truncate">{u.label}: {u.url}</span>
                          <ExternalLink className="h-3 w-3 shrink-0 opacity-50" />
                        </a>
                      ));
                    })}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* Review Dialog */}
      <Dialog open={!!reviewDialog} onOpenChange={() => { setReviewDialog(null); setReviewComment(""); setChangeSeverity("minor"); setReviewVoiceBlob(null); setReviewFiles([]); }}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>
              {reviewDialog?.reviewType === "approved_with_changes" ? "Approve with Changes" : "Disapprove with Changes"}
              {" — "}Phase {reviewDialog?.phaseNumber}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            {reviewDialog?.reviewType === "disapproved_with_changes" && (
              <div className="p-3 bg-destructive/10 border border-destructive/20 rounded-md text-sm text-destructive">
                <p className="font-medium">⚠️ The developer will be blocked from advancing to the next phase until changes are completed.</p>
              </div>
            )}
            {reviewDialog?.reviewType === "approved_with_changes" && (
              <div className="p-3 bg-accent border border-border rounded-md text-sm text-accent-foreground">
                <p>The developer can continue to the next phase while addressing these changes. A separate change timer will run.</p>
              </div>
            )}
            <div className="space-y-2">
              <Label className="font-medium">Change Severity</Label>
              <div className="grid grid-cols-2 gap-2">
                {SEVERITY_OPTIONS.map(opt => (
                  <Button
                    key={opt.value}
                    variant={changeSeverity === opt.value ? "default" : "outline"}
                    size="sm"
                    className="h-auto py-2 flex flex-col items-start"
                    onClick={() => setChangeSeverity(opt.value)}
                  >
                    <span className="font-medium">{opt.label} — {opt.hours}h</span>
                    <span className="text-xs opacity-70">{opt.description}</span>
                  </Button>
                ))}
              </div>
            </div>
            <div className="space-y-2">
              <Label>
                Feedback <span className="text-destructive">*</span>
                <span className="text-xs text-muted-foreground ml-1">(text, voice, or file required)</span>
              </Label>
              <PhaseReviewSubmissionPanel
                comment={reviewComment}
                onCommentChange={setReviewComment}
                voiceBlob={reviewVoiceBlob}
                onVoiceBlobChange={setReviewVoiceBlob}
                files={reviewFiles}
                onFilesChange={setReviewFiles}
              />
            </div>
            <Button
              className="w-full"
              disabled={
                submitReview.isPending ||
                (!reviewComment.trim() && !reviewVoiceBlob && reviewFiles.length === 0)
              }
              onClick={() => {
                if (!reviewDialog) return;
                submitReview.mutate({
                  phaseId: reviewDialog.phaseId,
                  reviewStatus: reviewDialog.reviewType,
                  comment: reviewComment.trim() || undefined,
                  severity: changeSeverity,
                  voiceBlob: reviewVoiceBlob,
                  files: reviewFiles,
                });
              }}
            >
              {submitReview.isPending ? "Submitting..." : "Submit Review"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
};
