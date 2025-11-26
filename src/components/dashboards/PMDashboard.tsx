import { useState } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { LogOut, Plus, CheckCircle2, Clock, FolderKanban, Download, ChevronDown, ChevronUp, FileText } from "lucide-react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { Database } from "@/integrations/supabase/types";
import { CreateTaskForm } from "./CreateTaskForm";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { ScrollArea } from "@/components/ui/scroll-area";

const PMDashboard = () => {
  const { user, signOut } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const [expandedTaskId, setExpandedTaskId] = useState<string | null>(null);
  const [viewDetailsTask, setViewDetailsTask] = useState<any>(null);
  const [revisionDialog, setRevisionDialog] = useState<{ open: boolean; submissionId: string; fileName: string } | null>(null);
  const [revisionNotes, setRevisionNotes] = useState("");
  const [revisionFile, setRevisionFile] = useState<File | null>(null);
  const [uploadingRevision, setUploadingRevision] = useState(false);

  const { data: teams } = useQuery({
    queryKey: ["teams"],
    queryFn: async () => {
      const { data, error } = await supabase.from("teams").select("*");
      if (error) throw error;
      return data;
    },
  });

  const { data: tasks } = useQuery({
    queryKey: ["pm-tasks", user?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("tasks")
        .select("*, teams(name)")
        .eq("project_manager_id", user!.id)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data;
    },
  });

  const { data: submissions } = useQuery({
    queryKey: ["design-submissions", user?.id],
    queryFn: async () => {
      const taskIds = tasks?.map(t => t.id) || [];
      if (!taskIds.length) return [];
      
      const { data, error } = await supabase
        .from("design_submissions")
        .select("*")
        .in("task_id", taskIds)
        .order("submitted_at", { ascending: false });
      
      if (error) throw error;
      return data;
    },
    enabled: !!tasks?.length,
  });

  const handleDownload = async (filePath: string, fileName: string) => {
    try {
      const { data, error } = await supabase.storage
        .from("design-files")
        .download(filePath);
      
      if (error) throw error;
      
      const url = URL.createObjectURL(data);
      const a = document.createElement("a");
      a.href = url;
      a.download = fileName;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      
      toast({ title: "Download started" });
    } catch (error: any) {
      toast({
        variant: "destructive",
        title: "Error downloading file",
        description: error.message,
      });
    }
  };

  const handleApproveSubmission = useMutation({
    mutationFn: async (submissionId: string) => {
      const { error } = await supabase
        .from("design_submissions")
        .update({
          revision_status: "approved",
          reviewed_at: new Date().toISOString(),
          reviewed_by: user!.id,
        })
        .eq("id", submissionId);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["design-submissions"] });
      toast({ title: "Design approved" });
    },
  });

  const handleRequestRevision = useMutation({
    mutationFn: async ({ submissionId, notes, file }: { submissionId: string; notes: string; file: File | null }) => {
      setUploadingRevision(true);
      try {
        let referenceFilePath = null;
        let referenceFileName = null;

        // Upload reference file if provided
        if (file) {
          const sanitizedFileName = file.name.replace(/[^a-zA-Z0-9._-]/g, "_");
          referenceFileName = `revision_ref_${Date.now()}_${sanitizedFileName}`;
          referenceFilePath = `${user!.id}/revision_references/${referenceFileName}`;

          const { error: uploadError } = await supabase.storage
            .from("design-files")
            .upload(referenceFilePath, file);

          if (uploadError) throw uploadError;
        }

        const { error } = await supabase
          .from("design_submissions")
          .update({
            revision_status: "needs_revision",
            revision_notes: notes,
            revision_reference_file_path: referenceFilePath,
            revision_reference_file_name: referenceFileName,
            reviewed_at: new Date().toISOString(),
            reviewed_by: user!.id,
          })
          .eq("id", submissionId);
        
        if (error) throw error;
      } finally {
        setUploadingRevision(false);
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["design-submissions"] });
      toast({ title: "Revision requested" });
      setRevisionDialog(null);
      setRevisionNotes("");
      setRevisionFile(null);
    },
    onError: (error: any) => {
      toast({
        variant: "destructive",
        title: "Error requesting revision",
        description: error.message,
      });
    },
  });


  const updateTaskStatus = useMutation({
    mutationFn: async ({ taskId, status }: { taskId: string; status: Database["public"]["Enums"]["task_status"] }) => {
      const { error } = await supabase
        .from("tasks")
        .update({ status })
        .eq("id", taskId);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["pm-tasks"] });
      toast({ title: "Task status updated" });
    },
  });

  const stats = {
    total: tasks?.length || 0,
    in_progress: tasks?.filter((t) => t.status === "in_progress").length || 0,
    completed: tasks?.filter((t) => t.status === "completed").length || 0,
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case "pending":
        return "bg-muted text-muted-foreground";
      case "in_progress":
        return "bg-warning text-warning-foreground";
      case "completed":
        return "bg-primary text-primary-foreground";
      case "approved":
        return "bg-success text-success-foreground";
      default:
        return "bg-muted text-muted-foreground";
    }
  };

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b bg-card">
        <div className="container mx-auto px-4 py-4 flex items-center justify-between">
          <h1 className="text-2xl font-bold text-foreground">Project Manager Dashboard</h1>
          <Button onClick={signOut} variant="outline" size="sm">
            <LogOut className="mr-2 h-4 w-4" />
            Sign Out
          </Button>
        </div>
      </header>

      <main className="container mx-auto px-4 py-8">
        <div className="grid gap-6 md:grid-cols-3 mb-8">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Total Tasks</CardTitle>
              <FolderKanban className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{stats.total}</div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">In Progress</CardTitle>
              <Clock className="h-4 w-4 text-warning" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{stats.in_progress}</div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Completed</CardTitle>
              <CheckCircle2 className="h-4 w-4 text-success" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{stats.completed}</div>
            </CardContent>
          </Card>
        </div>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle>My Tasks</CardTitle>
            <Dialog open={open} onOpenChange={setOpen}>
              <DialogTrigger asChild>
                <Button>
                  <Plus className="mr-2 h-4 w-4" />
                  Create Task
                </Button>
              </DialogTrigger>
              <DialogContent className="max-w-3xl">
                <DialogHeader>
                  <DialogTitle>Create New Social Media Post Request</DialogTitle>
                </DialogHeader>
                <CreateTaskForm 
                  userId={user!.id} 
                  teams={teams || []} 
                  onSuccess={() => setOpen(false)}
                />
              </DialogContent>
            </Dialog>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {tasks?.map((task) => {
                const taskSubmissions = submissions?.filter(s => s.task_id === task.id) || [];
                const isExpanded = expandedTaskId === task.id;
                
                return (
                  <div key={task.id} className="border rounded-lg">
                    <div className="flex items-center justify-between p-4 hover:bg-muted/50 transition-colors">
                      <div className="space-y-1 flex-1">
                        <div className="flex items-center gap-3">
                          <span className="font-mono text-sm text-muted-foreground">
                            #{task.task_number}
                          </span>
                          <h3 className="font-semibold">{task.title}</h3>
                        </div>
                        <p className="text-sm text-muted-foreground">{task.description}</p>
                        <div className="text-sm text-muted-foreground">
                          Team: <span className="font-medium">{task.teams?.name}</span>
                          {taskSubmissions.length > 0 && (
                            <span className="ml-2 text-primary">
                              • {taskSubmissions.length} file(s) submitted
                            </span>
                          )}
                        </div>
                        <div className="flex gap-2 mt-2">
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => setViewDetailsTask(task)}
                          >
                            <FileText className="h-3 w-3 mr-1" />
                            View Details
                          </Button>
                          {task.attachment_file_path && (
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => handleDownload(task.attachment_file_path!, task.attachment_file_name!)}
                            >
                              <Download className="h-3 w-3 mr-1" />
                              Download Attachment
                            </Button>
                          )}
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <Badge className={getStatusColor(task.status)}>
                          {task.status.replace("_", " ")}
                        </Badge>
                        {taskSubmissions.length > 0 && (
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => setExpandedTaskId(isExpanded ? null : task.id)}
                          >
                            {isExpanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                          </Button>
                        )}
                        {task.status === "completed" && (
                          <Button
                            size="sm"
                            onClick={() =>
                              updateTaskStatus.mutate({ taskId: task.id, status: "approved" })
                            }
                          >
                            Approve
                          </Button>
                        )}
                      </div>
                    </div>
                    
                    {isExpanded && taskSubmissions.length > 0 && (
                      <div className="border-t bg-muted/20 p-4">
                        <h4 className="text-sm font-semibold mb-3">Submitted Files:</h4>
                        <div className="space-y-2">
                          {taskSubmissions.map((submission) => (
                            <div
                              key={submission.id}
                              className="flex items-center justify-between bg-background p-3 rounded-md"
                            >
                              <div className="flex-1">
                                <div className="flex items-center gap-2">
                                  <p className="text-sm font-medium">{submission.file_name}</p>
                                  <Badge 
                                    variant={
                                      submission.revision_status === "approved" ? "default" :
                                      submission.revision_status === "needs_revision" ? "destructive" : 
                                      "secondary"
                                    }
                                    className="text-xs"
                                  >
                                    {submission.revision_status?.replace("_", " ")}
                                  </Badge>
                                </div>
                                <p className="text-xs text-muted-foreground">
                                  Submitted: {new Date(submission.submitted_at || "").toLocaleString()}
                                </p>
                                {submission.revision_notes && (
                                  <p className="text-xs text-muted-foreground mt-1">
                                    <span className="font-medium">Revision notes:</span> {submission.revision_notes}
                                  </p>
                                )}
                              </div>
                              <div className="flex items-center gap-2">
                                <Button
                                  size="sm"
                                  variant="outline"
                                  onClick={() => handleDownload(submission.file_path, submission.file_name)}
                                >
                                  <Download className="h-4 w-4" />
                                </Button>
                                {submission.revision_status !== "approved" && (
                                  <Button
                                    size="sm"
                                    variant="default"
                                    onClick={() => handleApproveSubmission.mutate(submission.id)}
                                  >
                                    Approve
                                  </Button>
                                )}
                                {submission.revision_status !== "needs_revision" && (
                                  <Button
                                    size="sm"
                                    variant="destructive"
                                    onClick={() => setRevisionDialog({ 
                                      open: true, 
                                      submissionId: submission.id,
                                      fileName: submission.file_name 
                                    })}
                                  >
                                    Request Revision
                                  </Button>
                                )}
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
              {!tasks?.length && (
                <p className="text-center text-muted-foreground py-8">
                  No tasks yet. Create your first task!
                </p>
              )}
            </div>
          </CardContent>
        </Card>
      </main>

      <Dialog open={!!viewDetailsTask} onOpenChange={() => setViewDetailsTask(null)}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Task Details - #{viewDetailsTask?.task_number}</DialogTitle>
          </DialogHeader>
          <ScrollArea className="max-h-[70vh] pr-4">
            <div className="space-y-6">
              {/* Basic Information */}
              <div className="space-y-3">
                <h3 className="font-semibold text-lg border-b pb-2">Basic Information</h3>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <Label className="text-muted-foreground">Title</Label>
                    <p className="font-medium">{viewDetailsTask?.title}</p>
                  </div>
                  <div>
                    <Label className="text-muted-foreground">Business Name</Label>
                    <p className="font-medium">{viewDetailsTask?.business_name || "N/A"}</p>
                  </div>
                  <div>
                    <Label className="text-muted-foreground">Industry</Label>
                    <p className="font-medium">{viewDetailsTask?.industry || "N/A"}</p>
                  </div>
                  <div>
                    <Label className="text-muted-foreground">Website</Label>
                    <p className="font-medium text-primary break-all">{viewDetailsTask?.website_url || "N/A"}</p>
                  </div>
                  <div>
                    <Label className="text-muted-foreground">Deadline</Label>
                    <p className="font-medium">{viewDetailsTask?.deadline ? new Date(viewDetailsTask.deadline).toLocaleDateString() : "N/A"}</p>
                  </div>
                  <div>
                    <Label className="text-muted-foreground">Team</Label>
                    <p className="font-medium">{viewDetailsTask?.teams?.name}</p>
                  </div>
                </div>
              </div>

              {/* Post Details */}
              <div className="space-y-3">
                <h3 className="font-semibold text-lg border-b pb-2">Post Details</h3>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <Label className="text-muted-foreground">Post Type</Label>
                    <p className="font-medium">{viewDetailsTask?.post_type || "N/A"}</p>
                  </div>
                  <div>
                    <Label className="text-muted-foreground">Objective</Label>
                    <p className="font-medium">{viewDetailsTask?.objective || "N/A"}</p>
                  </div>
                  <div>
                    <Label className="text-muted-foreground">Post Type Required</Label>
                    <p className="font-medium">{viewDetailsTask?.post_type_required || "N/A"}</p>
                  </div>
                  <div>
                    <Label className="text-muted-foreground">Platforms</Label>
                    <p className="font-medium">{viewDetailsTask?.platforms?.join(", ") || "N/A"}</p>
                  </div>
                </div>
                <div>
                  <Label className="text-muted-foreground">Description</Label>
                  <p className="font-medium">{viewDetailsTask?.description || "N/A"}</p>
                </div>
              </div>

              {/* Product/Service Information */}
              <div className="space-y-3">
                <h3 className="font-semibold text-lg border-b pb-2">Product/Service Information</h3>
                <div className="space-y-3">
                  <div>
                    <Label className="text-muted-foreground">Name</Label>
                    <p className="font-medium">{viewDetailsTask?.product_service_name || "N/A"}</p>
                  </div>
                  <div>
                    <Label className="text-muted-foreground">Description</Label>
                    <p className="font-medium">{viewDetailsTask?.product_service_description || "N/A"}</p>
                  </div>
                  <div>
                    <Label className="text-muted-foreground">Pricing</Label>
                    <p className="font-medium">{viewDetailsTask?.pricing || "N/A"}</p>
                  </div>
                </div>
              </div>

              {/* Design Requirements */}
              <div className="space-y-3">
                <h3 className="font-semibold text-lg border-b pb-2">Design Requirements</h3>
                <div className="space-y-3">
                  <div>
                    <Label className="text-muted-foreground">Design Style</Label>
                    <p className="font-medium">{viewDetailsTask?.design_style || "N/A"}</p>
                  </div>
                  <div>
                    <Label className="text-muted-foreground">Brand Colors</Label>
                    <p className="font-medium">{viewDetailsTask?.brand_colors || "N/A"}</p>
                  </div>
                  <div>
                    <Label className="text-muted-foreground">Fonts</Label>
                    <p className="font-medium">{viewDetailsTask?.fonts || "N/A"}</p>
                  </div>
                </div>
              </div>

              {/* Content */}
              <div className="space-y-3">
                <h3 className="font-semibold text-lg border-b pb-2">Content</h3>
                <div className="space-y-3">
                  <div>
                    <Label className="text-muted-foreground">Headline/Main Text</Label>
                    <p className="font-medium">{viewDetailsTask?.headline_main_text || "N/A"}</p>
                  </div>
                  <div>
                    <Label className="text-muted-foreground">Supporting Text</Label>
                    <p className="font-medium">{viewDetailsTask?.supporting_text || "N/A"}</p>
                  </div>
                  <div>
                    <Label className="text-muted-foreground">Call to Action</Label>
                    <p className="font-medium">{viewDetailsTask?.cta || "N/A"}</p>
                  </div>
                </div>
              </div>

              {/* Target Audience */}
              <div className="space-y-3">
                <h3 className="font-semibold text-lg border-b pb-2">Target Audience</h3>
                <div className="space-y-3">
                  <div>
                    <Label className="text-muted-foreground">Age</Label>
                    <p className="font-medium">{viewDetailsTask?.target_audience_age || "N/A"}</p>
                  </div>
                  <div>
                    <Label className="text-muted-foreground">Location</Label>
                    <p className="font-medium">{viewDetailsTask?.target_audience_location || "N/A"}</p>
                  </div>
                  <div>
                    <Label className="text-muted-foreground">Interests</Label>
                    <p className="font-medium">{viewDetailsTask?.target_audience_interest || "N/A"}</p>
                  </div>
                  <div>
                    <Label className="text-muted-foreground">Other</Label>
                    <p className="font-medium">{viewDetailsTask?.target_audience_other || "N/A"}</p>
                  </div>
                </div>
              </div>

              {/* Additional Notes */}
              {(viewDetailsTask?.notes_extra_instructions || viewDetailsTask?.additional_details) && (
                <div className="space-y-3">
                  <h3 className="font-semibold text-lg border-b pb-2">Additional Notes</h3>
                  <div className="space-y-3">
                    {viewDetailsTask?.notes_extra_instructions && (
                      <div>
                        <Label className="text-muted-foreground">Extra Instructions</Label>
                        <p className="font-medium">{viewDetailsTask.notes_extra_instructions}</p>
                      </div>
                    )}
                    {viewDetailsTask?.additional_details && (
                      <div>
                        <Label className="text-muted-foreground">Additional Details</Label>
                        <p className="font-medium">{viewDetailsTask.additional_details}</p>
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>
          </ScrollArea>
        </DialogContent>
      </Dialog>

      <Dialog open={revisionDialog?.open || false} onOpenChange={(open) => {
        if (!open) {
          setRevisionDialog(null);
          setRevisionNotes("");
          setRevisionFile(null);
        }
      }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Request Revision</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">
              File: <span className="font-medium">{revisionDialog?.fileName}</span>
            </p>
            <div className="space-y-2">
              <Label htmlFor="revision-notes">Revision Notes</Label>
              <Textarea
                id="revision-notes"
                value={revisionNotes}
                onChange={(e) => setRevisionNotes(e.target.value)}
                placeholder="Explain what needs to be changed..."
                rows={4}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="revision-file">Reference File (optional)</Label>
              <Input
                id="revision-file"
                type="file"
                onChange={(e) => setRevisionFile(e.target.files?.[0] || null)}
                accept="image/*,.pdf,.ai,.psd,.fig,.sketch"
              />
              {revisionFile && (
                <p className="text-xs text-muted-foreground">
                  Selected: {revisionFile.name}
                </p>
              )}
              <p className="text-xs text-muted-foreground">
                Upload an annotated image or reference file to clarify the changes needed
              </p>
            </div>
            <Button
              onClick={() => revisionDialog && handleRequestRevision.mutate({ 
                submissionId: revisionDialog.submissionId, 
                notes: revisionNotes,
                file: revisionFile
              })}
              disabled={!revisionNotes.trim() || uploadingRevision}
              className="w-full"
            >
              {uploadingRevision ? "Uploading..." : "Submit Revision Request"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default PMDashboard;
