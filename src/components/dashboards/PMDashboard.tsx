import { useState } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { LogOut, Plus, CheckCircle2, Clock, FolderKanban, Download, ChevronDown, ChevronUp, FileText, Trash2 } from "lucide-react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { Database } from "@/integrations/supabase/types";
import { CreateTaskForm } from "./CreateTaskForm";
import { CreateLogoOrderForm } from "./CreateLogoOrderForm";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { ScrollArea } from "@/components/ui/scroll-area";
import { FilePreview } from "@/components/FilePreview";
import { format } from "date-fns";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";

const PMDashboard = () => {
  const { user, signOut } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const [taskType, setTaskType] = useState<"social_media" | "logo" | null>(null);
  const [expandedTaskId, setExpandedTaskId] = useState<string | null>(null);
  const [viewDetailsTask, setViewDetailsTask] = useState<any>(null);
  const [deleteTaskId, setDeleteTaskId] = useState<string | null>(null);
  const [revisionDialog, setRevisionDialog] = useState<{ open: boolean; submissionId: string; fileName: string } | null>(null);
  const [revisionNotes, setRevisionNotes] = useState("");
  const [revisionFiles, setRevisionFiles] = useState<File[]>([]);
  const [uploadingRevision, setUploadingRevision] = useState(false);
  const [statusFilter, setStatusFilter] = useState<string | null>("priority");
  const [searchQuery, setSearchQuery] = useState("");

  const { data: teams } = useQuery({
    queryKey: ["teams"],
    queryFn: async () => {
      const { data, error } = await supabase.from("teams").select("*");
      if (error) throw error;
      return data;
    },
  });

  const { data: myTasks } = useQuery({
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

  // Query for all tasks (used when searching) - PMs can view via admin-like search
  const { data: allTasks } = useQuery({
    queryKey: ["all-tasks-search", searchQuery],
    queryFn: async () => {
      // Use RPC or a broader query - but PMs only have RLS for their own tasks
      // We need to use the project_manager profile to get names
      const { data, error } = await supabase
        .from("tasks")
        .select("*, teams(name), profiles!tasks_project_manager_id_fkey(full_name, email)")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data;
    },
    enabled: !!searchQuery.trim(), // Only fetch when searching
  });

  // Use allTasks when searching, otherwise use myTasks
  const tasks = searchQuery.trim() ? allTasks : myTasks;

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
    mutationFn: async ({ submissionId, notes, files }: { submissionId: string; notes: string; files: File[] }) => {
      setUploadingRevision(true);
      try {
        let referenceFilePaths: string[] = [];
        let referenceFileNames: string[] = [];

        // Upload reference files if provided
        if (files.length > 0) {
          for (const file of files) {
            const sanitizedFileName = file.name.replace(/[^a-zA-Z0-9._-]/g, "_");
            const fileName = `revision_ref_${Date.now()}_${sanitizedFileName}`;
            const filePath = `${user!.id}/revision_references/${fileName}`;

            const { error: uploadError } = await supabase.storage
              .from("design-files")
              .upload(filePath, file);

            if (uploadError) throw uploadError;

            referenceFilePaths.push(filePath);
            referenceFileNames.push(fileName);
          }
        }

        // Get submission details to find task
        const { data: submission } = await supabase
          .from("design_submissions")
          .select("task_id, tasks(title)")
          .eq("id", submissionId)
          .single();

        const { error } = await supabase
          .from("design_submissions")
          .update({
            revision_status: "needs_revision",
            revision_notes: notes,
            revision_reference_file_path: referenceFilePaths.length > 0 ? referenceFilePaths.join("|||") : null,
            revision_reference_file_name: referenceFileNames.length > 0 ? referenceFileNames.join("|||") : null,
            reviewed_at: new Date().toISOString(),
            reviewed_by: user!.id,
          })
          .eq("id", submissionId);
        
        if (error) throw error;

        return { submission, notes };
      } finally {
        setUploadingRevision(false);
      }
    },
    onSuccess: async (data) => {
      queryClient.invalidateQueries({ queryKey: ["design-submissions"] });
      toast({ title: "Revision requested" });

      // Send email notification to designers
      if (data?.submission?.task_id) {
        try {
          const { data: { session } } = await supabase.auth.getSession();
          if (session) {
            await fetch(
              `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/send-task-notification`,
              {
                method: "POST",
                headers: {
                  "Content-Type": "application/json",
                  "Authorization": `Bearer ${session.access_token}`,
                },
                body: JSON.stringify({
                  taskId: data.submission.task_id,
                  notificationType: "revision_requested",
                  taskTitle: (data.submission.tasks as any)?.title || "Task",
                  revisionNotes: data.notes,
                }),
              }
            );
          }
        } catch (emailError) {
          console.error("Failed to send notification email:", emailError);
        }
      }

      setRevisionDialog(null);
      setRevisionNotes("");
      setRevisionFiles([]);
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

  const deleteTask = useMutation({
    mutationFn: async (taskId: string) => {
      const { error } = await supabase
        .from("tasks")
        .delete()
        .eq("id", taskId)
        .eq("status", "pending");
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["pm-tasks"] });
      toast({ title: "Task deleted successfully" });
      setDeleteTaskId(null);
    },
    onError: (error: any) => {
      toast({
        variant: "destructive",
        title: "Error deleting task",
        description: error.message,
      });
    },
  });

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const stats = {
    recently_delivered: tasks?.filter(t => 
      submissions?.some(s => s.task_id === t.id && s.revision_status === 'pending_review')
    ).length || 0,
    delayed: tasks?.filter(t => 
      t.deadline && new Date(t.deadline) < today && 
      !['completed', 'approved'].includes(t.status)
    ).length || 0,
    pending: tasks?.filter(t => t.status === 'pending').length || 0,
    in_progress: tasks?.filter(t => t.status === 'in_progress').length || 0,
    needs_revision: tasks?.filter(t =>
      submissions?.some(s => s.task_id === t.id && s.revision_status === 'needs_revision')
    ).length || 0,
    total: tasks?.length || 0,
  };

  const getTaskCategory = (task: any, submissions: any[]) => {
    const taskSubmissions = submissions?.filter(s => s.task_id === task.id) || [];
    const hasPendingReview = taskSubmissions.some(s => s.revision_status === 'pending_review');
    const hasNeedsRevision = taskSubmissions.some(s => s.revision_status === 'needs_revision');
    // Only consider all approved if there are submissions AND all are approved
    const allApproved = taskSubmissions.length > 0 && taskSubmissions.every(s => s.revision_status === 'approved');
    const isDelayed = task.deadline && new Date(task.deadline) < today && 
                     !['completed', 'approved'].includes(task.status);
    
    // Check for pending work items first - these always show in priority
    if (hasPendingReview) return 'recently_delivered';
    if (hasNeedsRevision) return 'needs_revision';
    if (isDelayed) return 'delayed';
    
    // Only move to 'other' if ALL submissions are approved (not just some)
    // Task must have submissions AND all must be approved to leave priority
    if (allApproved) return 'other';
    
    // Task status-based completion only applies if explicitly set
    if (task.status === 'completed' || task.status === 'approved') return 'other';
    
    if (task.status === 'pending') return 'pending';
    if (task.status === 'in_progress') return 'in_progress';
    return 'other';
  };

  const getCategoryPriority = (category: string) => {
    const priorities: Record<string, number> = {
      recently_delivered: 1,
      delayed: 2,
      pending: 3,
      in_progress: 4,
      needs_revision: 5,
      other: 6,
    };
    return priorities[category] || 99;
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

  const isLogoOrder = (task: any) => {
    return task?.post_type === "Logo Design";
  };

  const filteredTasks = tasks?.filter((task) => {
    // Search filter - if searching, show all matching tasks regardless of status
    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase();
      return task.title?.toLowerCase().includes(query) ||
        task.task_number?.toString().includes(query) ||
        task.business_name?.toLowerCase().includes(query) ||
        task.description?.toLowerCase().includes(query) ||
        `#${task.task_number}`.includes(query);
    }
    
    // Status filter (only applied when not searching)
    if (!statusFilter) return true;
    if (statusFilter === 'priority') {
      const category = getTaskCategory(task, submissions || []);
      return ['recently_delivered', 'delayed', 'pending', 'in_progress', 'needs_revision'].includes(category);
    }
    // Handle specific category filters
    if (['recently_delivered', 'delayed', 'needs_revision'].includes(statusFilter)) {
      const category = getTaskCategory(task, submissions || []);
      return category === statusFilter;
    }
    return task.status === statusFilter;
  }).sort((a, b) => {
    if (statusFilter === 'priority') {
      const categoryA = getTaskCategory(a, submissions || []);
      const categoryB = getTaskCategory(b, submissions || []);
      const priorityDiff = getCategoryPriority(categoryA) - getCategoryPriority(categoryB);
      
      if (priorityDiff !== 0) return priorityDiff;
      
      // Within same category, sort by date
      if (categoryA === 'recently_delivered') {
        const submissionA = submissions?.filter(s => s.task_id === a.id).sort((x, y) => 
          new Date(y.submitted_at!).getTime() - new Date(x.submitted_at!).getTime()
        )[0];
        const submissionB = submissions?.filter(s => s.task_id === b.id).sort((x, y) => 
          new Date(y.submitted_at!).getTime() - new Date(x.submitted_at!).getTime()
        )[0];
        return new Date(submissionB?.submitted_at || 0).getTime() - new Date(submissionA?.submitted_at || 0).getTime();
      }
      if (categoryA === 'delayed') {
        return new Date(a.deadline!).getTime() - new Date(b.deadline!).getTime();
      }
    }
    return new Date(b.created_at!).getTime() - new Date(a.created_at!).getTime();
  });

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
        <div className="mb-6">
          <Input
            type="text"
            placeholder="Search by task #, title, business name, or description..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="max-w-md"
          />
        </div>
        
        <div className="flex justify-between items-center mb-4">
          <Button
            variant={statusFilter === 'priority' ? 'default' : 'outline'}
            onClick={() => setStatusFilter('priority')}
          >
            Priority View
          </Button>
          <Button
            variant={!statusFilter ? 'default' : 'outline'}
            onClick={() => setStatusFilter(null)}
          >
            All Tasks
          </Button>
        </div>

        <div className="grid gap-4 md:grid-cols-5 mb-8">
          <Card 
            className={`border-l-4 border-l-green-500 cursor-pointer transition-all hover:shadow-md ${statusFilter === 'recently_delivered' ? 'ring-2 ring-green-500' : ''}`}
            onClick={() => setStatusFilter('recently_delivered')}
          >
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Recently Delivered</CardTitle>
              <CheckCircle2 className="h-4 w-4 text-green-500" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{stats.recently_delivered}</div>
              <p className="text-xs text-muted-foreground">Awaiting review</p>
            </CardContent>
          </Card>
          
          <Card 
            className={`border-l-4 border-l-red-500 cursor-pointer transition-all hover:shadow-md ${statusFilter === 'delayed' ? 'ring-2 ring-red-500' : ''}`}
            onClick={() => setStatusFilter('delayed')}
          >
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Delayed Orders</CardTitle>
              <Clock className="h-4 w-4 text-red-500" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{stats.delayed}</div>
              <p className="text-xs text-muted-foreground">Past deadline</p>
            </CardContent>
          </Card>
          
          <Card 
            className={`cursor-pointer transition-all hover:shadow-md ${statusFilter === 'pending' ? 'ring-2 ring-primary' : ''}`}
            onClick={() => setStatusFilter('pending')}
          >
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Pending</CardTitle>
              <FolderKanban className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{stats.pending}</div>
              <p className="text-xs text-muted-foreground">Not started</p>
            </CardContent>
          </Card>
          
          <Card 
            className={`cursor-pointer transition-all hover:shadow-md ${statusFilter === 'in_progress' ? 'ring-2 ring-warning' : ''}`}
            onClick={() => setStatusFilter('in_progress')}
          >
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">In Progress</CardTitle>
              <Clock className="h-4 w-4 text-warning" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{stats.in_progress}</div>
              <p className="text-xs text-muted-foreground">Being worked on</p>
            </CardContent>
          </Card>
          
          <Card 
            className={`border-l-4 border-l-orange-500 cursor-pointer transition-all hover:shadow-md ${statusFilter === 'needs_revision' ? 'ring-2 ring-orange-500' : ''}`}
            onClick={() => setStatusFilter('needs_revision')}
          >
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Needs Revision</CardTitle>
              <FileText className="h-4 w-4 text-orange-500" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{stats.needs_revision}</div>
              <p className="text-xs text-muted-foreground">Requires changes</p>
            </CardContent>
          </Card>
        </div>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle>My Tasks</CardTitle>
            <Dialog open={open} onOpenChange={(isOpen) => {
              setOpen(isOpen);
              if (!isOpen) setTaskType(null);
            }}>
              <DialogTrigger asChild>
                <Button>
                  <Plus className="mr-2 h-4 w-4" />
                  Create Task
                </Button>
              </DialogTrigger>
              <DialogContent className="max-w-3xl">
                {!taskType ? (
                  <div className="space-y-4">
                    <DialogHeader>
                      <DialogTitle>Select Task Type</DialogTitle>
                    </DialogHeader>
                    <div className="grid grid-cols-2 gap-4">
                      <Button
                        variant="outline"
                        className="h-32 flex flex-col gap-2"
                        onClick={() => setTaskType("social_media")}
                      >
                        <FolderKanban className="h-8 w-8" />
                        <div className="text-center">
                          <p className="font-semibold">Social Media Post</p>
                          <p className="text-xs text-muted-foreground">Create social media content</p>
                        </div>
                      </Button>
                      <Button
                        variant="outline"
                        className="h-32 flex flex-col gap-2"
                        onClick={() => setTaskType("logo")}
                      >
                        <FileText className="h-8 w-8" />
                        <div className="text-center">
                          <p className="font-semibold">Logo Order</p>
                          <p className="text-xs text-muted-foreground">Create logo design order</p>
                        </div>
                      </Button>
                    </div>
                  </div>
                ) : taskType === "social_media" ? (
                  <>
                    <DialogHeader>
                      <DialogTitle>Create New Social Media Post Request</DialogTitle>
                    </DialogHeader>
                    <CreateTaskForm 
                      userId={user!.id} 
                      teams={teams || []} 
                      onSuccess={() => {
                        setOpen(false);
                        setTaskType(null);
                      }}
                    />
                  </>
                ) : (
                  <>
                    <DialogHeader>
                      <DialogTitle>Create New Logo Order</DialogTitle>
                    </DialogHeader>
                    <CreateLogoOrderForm 
                      userId={user!.id} 
                      teams={teams || []} 
                      onSuccess={() => {
                        setOpen(false);
                        setTaskType(null);
                      }}
                    />
                  </>
                )}
              </DialogContent>
            </Dialog>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {filteredTasks?.map((task) => {
                const taskSubmissions = submissions?.filter(s => s.task_id === task.id) || [];
                const isExpanded = expandedTaskId === task.id;
                const category = getTaskCategory(task, submissions || []);
                
                const getBorderClass = () => {
                  if (category === 'recently_delivered') return 'border-l-4 border-l-green-500 bg-green-50/10';
                  if (category === 'delayed') return 'border-l-4 border-l-red-500 bg-red-50/10';
                  if (category === 'needs_revision') return 'border-l-4 border-l-orange-500 bg-orange-50/10';
                  return '';
                };

                const getCategoryBadge = () => {
                  if (category === 'recently_delivered') {
                    return <Badge className="bg-green-500 text-white">Delivered - Awaiting Review</Badge>;
                  }
                  if (category === 'delayed') {
                    return <Badge className="bg-red-500 text-white">DELAYED</Badge>;
                  }
                  if (category === 'needs_revision') {
                    return <Badge className="bg-orange-500 text-white">Needs Revision</Badge>;
                  }
                  return null;
                };
                
                return (
                  <div key={task.id} className={`border rounded-lg ${getBorderClass()}`}>
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
                          Created: <span className="font-medium">{format(new Date(task.created_at), 'MMM d, yyyy h:mm a')}</span>
                        </div>
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
                        </div>
                        {task.attachment_file_path && (
                          <div className="mt-3 space-y-2">
                            <p className="text-xs text-muted-foreground">Task Attachments ({task.attachment_file_path.split('|||').length}):</p>
                            {task.attachment_file_path.split('|||').map((filePath: string, index: number) => {
                              const fileName = task.attachment_file_name?.split('|||')[index] || `attachment_${index + 1}`;
                              return (
                                <div key={index} className="p-2 bg-muted/30 rounded border">
                                  <div className="flex items-center gap-2 mb-2">
                                    <FilePreview 
                                      filePath={filePath.trim()}
                                      fileName={fileName.trim()}
                                      className="w-10 h-10"
                                    />
                                    <span className="text-xs flex-1 truncate">{fileName.trim()}</span>
                                    <Button
                                      size="sm"
                                      variant="outline"
                                      onClick={() => handleDownload(filePath.trim(), fileName.trim())}
                                    >
                                      <Download className="h-3 w-3" />
                                    </Button>
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                        )}
                      </div>
                      <div className="flex items-center gap-2">
                        {getCategoryBadge()}
                        <Badge className={getStatusColor(task.status)}>
                          {task.status.replace("_", " ")}
                        </Badge>
                        {task.status === "pending" && (
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => setDeleteTaskId(task.id)}
                          >
                            <Trash2 className="h-4 w-4 text-destructive" />
                          </Button>
                        )}
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
                            <div key={submission.id} className="flex items-center gap-3 justify-between bg-background p-3 rounded-md">
                              <FilePreview 
                                filePath={submission.file_path}
                                fileName={submission.file_name}
                              />
                              <div className="flex-1 min-w-0">
                                <div className="flex items-center gap-2">
                                  <p className="text-sm font-medium truncate">{submission.file_name}</p>
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
                                   Delivered: {submission.submitted_at ? format(new Date(submission.submitted_at), 'MMM d, yyyy h:mm a') : 'N/A'}
                                 </p>
                                 {submission.designer_comment && (
                                   <div className="mt-2 p-2 bg-primary/10 rounded text-xs">
                                     <span className="font-medium text-primary">Designer comment:</span>
                                     <p className="text-muted-foreground mt-1">{submission.designer_comment}</p>
                                   </div>
                                 )}
                                 {submission.revision_notes && (
                                   <div className="mt-2 p-2 bg-destructive/10 rounded text-xs">
                                     <div className="flex items-center justify-between mb-1">
                                       <span className="font-medium text-destructive">Revision notes:</span>
                                       {submission.reviewed_at && (
                                         <span className="text-xs text-muted-foreground">
                                           {format(new Date(submission.reviewed_at), 'MMM d, yyyy h:mm a')}
                                         </span>
                                       )}
                                     </div>
                                     <p className="text-muted-foreground">{submission.revision_notes}</p>
                                     {submission.revision_reference_file_path && (
                                       <div className="mt-3 space-y-2">
                                         <span className="text-xs font-medium text-muted-foreground">Reference files:</span>
                                         <div className="flex flex-wrap gap-3">
                                           {submission.revision_reference_file_path.split("|||").map((filePath, fileIndex) => {
                                             const fileNames = submission.revision_reference_file_name?.split("|||") || [];
                                             const fileName = fileNames[fileIndex] || `Reference ${fileIndex + 1}`;
                                             return (
                                               <div key={fileIndex} className="flex flex-col items-center gap-1">
                                                 <div 
                                                   className="cursor-pointer hover:opacity-80 transition-opacity"
                                                   onClick={() => handleDownload(filePath.trim(), fileName.trim())}
                                                 >
                                                   <FilePreview 
                                                     filePath={filePath.trim()} 
                                                     fileName={fileName.trim()} 
                                                     className="w-16 h-16"
                                                   />
                                                 </div>
                                                 <Button
                                                   size="sm"
                                                   variant="ghost"
                                                   className="h-6 px-2 text-xs"
                                                   onClick={() => handleDownload(filePath.trim(), fileName.trim())}
                                                 >
                                                   <Download className="h-3 w-3 mr-1" />
                                                   Download
                                                 </Button>
                                               </div>
                                             );
                                           })}
                                         </div>
                                       </div>
                                     )}
                                   </div>
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
                                {submission.revision_status !== "approved" && submission.revision_status !== "needs_revision" && (
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
              {/* Customer Information */}
              <div className="space-y-3">
                <h3 className="font-semibold text-lg border-b pb-2">Customer Information</h3>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <Label className="text-muted-foreground">Customer Name</Label>
                    <p className="font-medium">{viewDetailsTask?.customer_name || "N/A"}</p>
                  </div>
                  <div>
                    <Label className="text-muted-foreground">Customer Email</Label>
                    <p className="font-medium">{viewDetailsTask?.customer_email || "N/A"}</p>
                  </div>
                  <div>
                    <Label className="text-muted-foreground">Customer Phone</Label>
                    <p className="font-medium">{viewDetailsTask?.customer_phone || "N/A"}</p>
                  </div>
                </div>
              </div>

              {/* Payment Information */}
              <div className="space-y-3">
                <h3 className="font-semibold text-lg border-b pb-2">Payment Information</h3>
                <div className="grid grid-cols-3 gap-4">
                  <div>
                    <Label className="text-muted-foreground">Total Amount</Label>
                    <p className="font-medium">${Number(viewDetailsTask?.amount_total || 0).toFixed(2)}</p>
                  </div>
                  <div>
                    <Label className="text-muted-foreground">Amount Paid</Label>
                    <p className="font-medium text-green-600">${Number(viewDetailsTask?.amount_paid || 0).toFixed(2)}</p>
                  </div>
                  <div>
                    <Label className="text-muted-foreground">Amount Pending</Label>
                    <p className="font-medium text-amber-600">${Number(viewDetailsTask?.amount_pending || 0).toFixed(2)}</p>
                  </div>
                </div>
              </div>

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

              {/* Logo Details - Only for Logo Orders */}
              {isLogoOrder(viewDetailsTask) && (
                <div className="space-y-3">
                  <h3 className="font-semibold text-lg border-b pb-2">Logo Details</h3>
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <Label className="text-muted-foreground">Logo Type</Label>
                      <p className="font-medium">{viewDetailsTask?.logo_type || "N/A"}</p>
                    </div>
                    <div>
                      <Label className="text-muted-foreground">Logo Style</Label>
                      <p className="font-medium">{viewDetailsTask?.logo_style || "N/A"}</p>
                    </div>
                    <div>
                      <Label className="text-muted-foreground">Number of Concepts</Label>
                      <p className="font-medium">{viewDetailsTask?.number_of_concepts || "N/A"}</p>
                    </div>
                    <div>
                      <Label className="text-muted-foreground">Number of Revisions</Label>
                      <p className="font-medium">{viewDetailsTask?.number_of_revisions || "N/A"}</p>
                    </div>
                    <div>
                      <Label className="text-muted-foreground">File Formats Needed</Label>
                      <p className="font-medium">{viewDetailsTask?.file_formats_needed || "N/A"}</p>
                    </div>
                    <div>
                      <Label className="text-muted-foreground">Usage Type</Label>
                      <p className="font-medium">{viewDetailsTask?.usage_type || "N/A"}</p>
                    </div>
                  </div>
                  <div>
                    <Label className="text-muted-foreground">Tagline</Label>
                    <p className="font-medium">{viewDetailsTask?.tagline || "N/A"}</p>
                  </div>
                  <div>
                    <Label className="text-muted-foreground">Competitors/Inspiration</Label>
                    <p className="font-medium">{viewDetailsTask?.competitors_inspiration || "N/A"}</p>
                  </div>
                  <div>
                    <Label className="text-muted-foreground">Description</Label>
                    <p className="font-medium">{viewDetailsTask?.description || "N/A"}</p>
                  </div>
                </div>
              )}

              {/* Post Details - Only for Social Media Posts */}
              {!isLogoOrder(viewDetailsTask) && (
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
              )}

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

              {/* Content - Only for Social Media Posts */}
              {!isLogoOrder(viewDetailsTask) && (
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
              )}

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

              {/* Attachments */}
              {viewDetailsTask?.attachment_file_path && (
                <div className="space-y-3">
                  <h3 className="font-semibold text-lg border-b pb-2">Task Attachments</h3>
                  <div className="space-y-3">
                    {viewDetailsTask.attachment_file_path.split('|||').map((filePath: string, index: number) => {
                      const fileName = viewDetailsTask.attachment_file_name?.split('|||')[index] || `attachment_${index + 1}`;
                      return (
                        <div key={index} className="p-3 bg-muted/30 rounded">
                          <FilePreview 
                            filePath={filePath.trim()}
                            fileName={fileName.trim()}
                          />
                          <Button
                            size="sm"
                            variant="outline"
                            className="mt-3 w-full"
                            onClick={() => handleDownload(filePath.trim(), fileName.trim())}
                          >
                            <Download className="h-3 w-3 mr-2" />
                            Download {fileName.trim()}
                          </Button>
                        </div>
                      );
                    })}
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
          setRevisionFiles([]);
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
              <Label htmlFor="revision-file">Reference Files (optional)</Label>
              <Input
                id="revision-file"
                type="file"
                multiple
                onChange={(e) => setRevisionFiles(prev => [...prev, ...Array.from(e.target.files || [])])}
                accept="image/*,.pdf,.ai,.psd,.fig,.sketch,audio/*,video/*,.mp3,.wav,.m4a,.aac,.ogg,.mp4,.mov,.avi,.mkv,.webm"
              />
              {revisionFiles.length > 0 && (
                <div className="space-y-1">
                  {revisionFiles.map((file, index) => (
                    <div key={index} className="flex items-center justify-between text-xs text-muted-foreground">
                      <span>{file.name}</span>
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => setRevisionFiles(files => files.filter((_, i) => i !== index))}
                      >
                        Remove
                      </Button>
                    </div>
                  ))}
                </div>
              )}
              <p className="text-xs text-muted-foreground">
                Upload annotated images, audio, video, or reference files to clarify the changes needed (multiple files allowed)
              </p>
            </div>
            <Button
              onClick={() => revisionDialog && handleRequestRevision.mutate({ 
                submissionId: revisionDialog.submissionId, 
                notes: revisionNotes,
                files: revisionFiles
              })}
              disabled={!revisionNotes.trim() || uploadingRevision}
              className="w-full"
            >
              {uploadingRevision ? "Uploading..." : "Submit Revision Request"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      <AlertDialog open={!!deleteTaskId} onOpenChange={() => setDeleteTaskId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Task</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete this task? This action cannot be undone.
              Only pending tasks can be deleted.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => deleteTaskId && deleteTask.mutate(deleteTaskId)}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
};

export default PMDashboard;
