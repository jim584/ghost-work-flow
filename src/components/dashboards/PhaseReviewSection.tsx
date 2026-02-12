import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { CheckCircle2, AlertTriangle, Clock, MessageSquare } from "lucide-react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { format } from "date-fns";

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
}

export const PhaseReviewSection = ({ task, phases, userId, isAssignedPM, queryKeysToInvalidate, readOnly }: PhaseReviewSectionProps) => {
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

  const taskPhases = phases.filter(p => p.task_id === task.id).sort((a, b) => a.phase_number - b.phase_number);

  if (taskPhases.length === 0) return null;

  const submitReview = useMutation({
    mutationFn: async ({ phaseId, reviewStatus, comment, severity }: {
      phaseId: string; reviewStatus: string; comment?: string; severity?: string;
    }) => {
      const updateData: any = {
        review_status: reviewStatus,
        review_comment: comment || null,
        reviewed_at: new Date().toISOString(),
        reviewed_by: userId,
        change_severity: severity || null,
      };

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

  return (
    <>
      <div className="border-t pt-3 mt-3">
        <h4 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-2">Phase Reviews</h4>
        <div className="space-y-2">
          {taskPhases.map(phase => {
            const phaseLabel = phase.phase_number === 1 ? "Phase 1 — Homepage" : `Phase ${phase.phase_number} — Inner Pages`;
            const canReview = isAssignedPM && !readOnly && (phase.status === "in_progress" || phase.status === "completed") && !phase.review_status;
            const hasReview = !!phase.review_status;

            return (
              <div key={phase.id} className="flex items-center justify-between p-2 bg-muted/20 rounded-md border">
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
            );
          })}
        </div>
      </div>

      {/* Review Dialog */}
      <Dialog open={!!reviewDialog} onOpenChange={() => { setReviewDialog(null); setReviewComment(""); setChangeSeverity("minor"); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {reviewDialog?.reviewType === "approved_with_changes" ? "Approve with Changes" : "Disapprove with Changes"}
              {" — "}Phase {reviewDialog?.phaseNumber}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            {reviewDialog?.reviewType === "disapproved_with_changes" && (
              <div className="p-3 bg-red-50 dark:bg-red-950/20 border border-red-200 dark:border-red-800 rounded-md text-sm text-red-800 dark:text-red-300">
                <p className="font-medium">⚠️ The developer will be blocked from advancing to the next phase until changes are completed.</p>
              </div>
            )}
            {reviewDialog?.reviewType === "approved_with_changes" && (
              <div className="p-3 bg-amber-50 dark:bg-amber-950/20 border border-amber-200 dark:border-amber-800 rounded-md text-sm text-amber-800 dark:text-amber-300">
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
              <Label htmlFor="review-comment">
                Comment {reviewDialog?.reviewType === "disapproved_with_changes" ? "*" : "(optional)"}
              </Label>
              <Textarea
                id="review-comment"
                placeholder="Describe the changes needed..."
                value={reviewComment}
                onChange={(e) => setReviewComment(e.target.value)}
                rows={4}
              />
            </div>
            <Button
              className="w-full"
              disabled={
                submitReview.isPending ||
                (reviewDialog?.reviewType === "disapproved_with_changes" && !reviewComment.trim())
              }
              onClick={() => {
                if (!reviewDialog) return;
                submitReview.mutate({
                  phaseId: reviewDialog.phaseId,
                  reviewStatus: reviewDialog.reviewType,
                  comment: reviewComment.trim() || undefined,
                  severity: changeSeverity,
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
