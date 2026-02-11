import { useState, useEffect } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Progress } from "@/components/ui/progress";
import { LogOut, Upload, CheckCircle2, Clock, FolderKanban, Download, ChevronDown, ChevronUp, FileText, AlertCircle, AlertTriangle, Globe, Timer, Play, RotateCcw } from "lucide-react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { Database } from "@/integrations/supabase/types";
import { ScrollArea } from "@/components/ui/scroll-area";
import { FilePreview } from "@/components/FilePreview";
import { differenceInHours, differenceInMinutes, format } from "date-fns";
import { useDesignerNotifications } from "@/hooks/useDesignerNotifications";
import { NotificationBell } from "@/components/NotificationBell";

// SLA Countdown component
const SlaCountdown = ({ deadline, label }: { deadline: string; label?: string }) => {
  const [now, setNow] = useState(new Date());

  useEffect(() => {
    const interval = setInterval(() => setNow(new Date()), 60000);
    return () => clearInterval(interval);
  }, []);

  const deadlineDate = new Date(deadline);
  const totalMinutes = differenceInMinutes(deadlineDate, now);

  if (totalMinutes <= 0) {
    const overdueHours = Math.abs(Math.floor(totalMinutes / 60));
    const overdueMins = Math.abs(totalMinutes % 60);
    return (
      <div className="flex items-center gap-1.5 text-destructive">
        <Timer className="h-3.5 w-3.5" />
        <span className="text-xs font-semibold">{label || "SLA"} OVERDUE by {overdueHours}h {overdueMins}m</span>
      </div>
    );
  }

  const hours = Math.floor(totalMinutes / 60);
  const mins = totalMinutes % 60;
  const isUrgent = totalMinutes < 120;

  return (
    <div className={`flex items-center gap-1.5 ${isUrgent ? 'text-destructive' : 'text-warning'}`}>
      <Timer className="h-3.5 w-3.5" />
      <span className="text-xs font-semibold">
        {label || "SLA"}: {hours}h {mins}m remaining
      </span>
    </div>
  );
};

// Phase progress component
const PhaseProgress = ({ currentPhase, totalPhases }: { currentPhase: number; totalPhases: number }) => {
  const phasePages: Record<number, string> = {
    1: "Homepage (1 page)",
    2: "3 inner pages (4 total)",
    3: "3 inner pages (7 total)",
    4: "3 inner pages (10 total)",
  };

  const progressPercent = ((currentPhase - 1) / totalPhases) * 100;

  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between text-xs">
        <span className="font-medium">Phase {currentPhase} of {totalPhases}</span>
        <span className="text-muted-foreground">{phasePages[currentPhase] || ""}</span>
      </div>
      <Progress value={progressPercent} className="h-2" />
    </div>
  );
};

const DeveloperDashboard = () => {
  const { user, signOut } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  
  const { data: profile } = useQuery({
    queryKey: ["profile", user?.id],
    queryFn: async () => {
      if (!user?.id) return null;
      const { data, error } = await supabase
        .from("profiles")
        .select("full_name")
        .eq("id", user.id)
        .single();
      if (error) throw error;
      return data;
    },
    enabled: !!user?.id,
  });
  
  const [selectedTask, setSelectedTask] = useState<any>(null);
  const [files, setFiles] = useState<File[]>([]);
  const [filePreviews, setFilePreviews] = useState<{[key: number]: string}>({});
  const [uploading, setUploading] = useState(false);
  const [developerComment, setDeveloperComment] = useState("");
  const [expandedTaskId, setExpandedTaskId] = useState<string | null>(null);
  const [viewDetailsTask, setViewDetailsTask] = useState<any>(null);
  const [statusFilter, setStatusFilter] = useState<string | null>("active");
  const [userTeams, setUserTeams] = useState<string[]>([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [reassignTask, setReassignTask] = useState<any>(null);
  const [reassignReason, setReassignReason] = useState("");

  // Fetch user's team IDs for notifications
  useEffect(() => {
    const fetchTeams = async () => {
      if (!user?.id) return;
      const { data: teamMembers } = await supabase
        .from("team_members")
        .select("team_id")
        .eq("user_id", user.id);
      
      if (teamMembers) {
        setUserTeams(teamMembers.map(tm => tm.team_id));
      }
    };
    fetchTeams();
  }, [user?.id]);

  useDesignerNotifications(user?.id, userTeams);

  const isWebsiteOrder = (task: any) => task.post_type === 'Website Design';

  const { data: tasks } = useQuery({
    queryKey: ["developer-tasks", user?.id],
    queryFn: async () => {
      const { data: teamMembers } = await supabase
        .from("team_members")
        .select("team_id")
        .eq("user_id", user!.id);

      if (!teamMembers?.length) return [];

      const teamIds = teamMembers.map((tm) => tm.team_id);
      const { data, error } = await supabase
        .from("tasks")
        .select("*, teams(name)")
        .in("team_id", teamIds)
        .order("created_at", { ascending: false });

      if (error) throw error;
      return data?.filter(isWebsiteOrder) || [];
    },
  });

  const { data: submissions } = useQuery({
    queryKey: ["developer-submissions", user?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("design_submissions")
        .select("*")
        .eq("designer_id", user!.id)
        .order("submitted_at", { ascending: false });
      
      if (error) throw error;
      return data;
    },
  });

  const { data: projectPhases } = useQuery({
    queryKey: ["developer-phases", user?.id],
    queryFn: async () => {
      if (!tasks?.length) return [];
      const taskIds = tasks.map(t => t.id);
      const { data, error } = await supabase
        .from("project_phases")
        .select("*")
        .in("task_id", taskIds)
        .order("phase_number", { ascending: true });
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
      toast({ variant: "destructive", title: "Error downloading file", description: error.message });
    }
  };

  // Acknowledge task
  const acknowledgeTask = useMutation({
    mutationFn: async (taskId: string) => {
      const task = tasks?.find(t => t.id === taskId);
      const isLate = task?.ack_deadline && new Date(task.ack_deadline) < new Date();
      
      const { error } = await supabase
        .from("tasks")
        .update({ 
          status: "in_progress" as any, 
          acknowledged_at: new Date().toISOString(),
          late_acknowledgement: isLate || false,
        })
        .eq("id", taskId);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["developer-tasks"] });
      toast({ title: "Task acknowledged", description: "Status changed to In Progress – Phase 1." });
    },
    onError: (error: any) => {
      toast({ variant: "destructive", title: "Error", description: error.message });
    },
  });

  // Request reassignment
  const requestReassignment = useMutation({
    mutationFn: async ({ taskId, reason }: { taskId: string; reason: string }) => {
      // Update task with reassignment request
      const { error: taskError } = await supabase
        .from("tasks")
        .update({ 
          reassignment_requested_at: new Date().toISOString(),
          reassignment_request_reason: reason,
        } as any)
        .eq("id", taskId);
      if (taskError) throw taskError;

      // Get task details for notification
      const task = tasks?.find(t => t.id === taskId);

      // Notify all admins (Development Head)
      const { data: admins } = await supabase
        .from("user_roles")
        .select("user_id")
        .eq("role", "admin");
      
      if (admins) {
        for (const admin of admins) {
          await supabase.from("notifications").insert({
            user_id: admin.user_id,
            type: "reassignment_requested",
            title: "Reassignment Requested",
            message: `Developer requested reassignment for: ${task?.title || 'Website Order'}. Reason: ${reason}`,
            task_id: taskId,
          });
        }
      }

      // Notify the PM
      if (task?.project_manager_id) {
        await supabase.from("notifications").insert({
          user_id: task.project_manager_id,
          type: "reassignment_requested",
          title: "Reassignment Requested",
          message: `Developer requested reassignment for: ${task.title}. Reason: ${reason}`,
          task_id: taskId,
        });
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["developer-tasks"] });
      toast({ title: "Reassignment requested", description: "Development Head has been notified." });
      setReassignTask(null);
      setReassignReason("");
    },
    onError: (error: any) => {
      toast({ variant: "destructive", title: "Error", description: error.message });
    },
  });

  // Complete phase mutation
  const completePhase = useMutation({
    mutationFn: async ({ taskId, currentPhase, totalPhases }: { taskId: string; currentPhase: number; totalPhases: number }) => {
      const { error: phaseError } = await supabase
        .from("project_phases")
        .update({ status: "completed", completed_at: new Date().toISOString() })
        .eq("task_id", taskId)
        .eq("phase_number", currentPhase);
      
      if (phaseError) throw phaseError;

      const nextPhase = currentPhase + 1;
      
      if (nextPhase <= totalPhases) {
        const { data: taskData } = await supabase
          .from("tasks")
          .select("developer_id")
          .eq("id", taskId)
          .single();

        let slaDeadline: string | null = null;
        if (taskData?.developer_id) {
          try {
            const slaResponse = await supabase.functions.invoke('calculate-sla-deadline', {
              body: { developer_id: taskData.developer_id, start_time: new Date().toISOString(), sla_hours: 9 },
            });
            if (slaResponse.data?.deadline) slaDeadline = slaResponse.data.deadline;
          } catch (e) {
            console.error("SLA calculation failed:", e);
          }
        }

        await supabase.from("project_phases").insert({
          task_id: taskId, phase_number: nextPhase, sla_hours: 9,
          sla_deadline: slaDeadline, started_at: new Date().toISOString(), status: "in_progress",
        });

        await supabase.from("tasks").update({
          current_phase: nextPhase, sla_deadline: slaDeadline,
        }).eq("id", taskId);
      } else {
        await supabase.from("tasks").update({
          status: "completed" as any, current_phase: totalPhases,
        }).eq("id", taskId);
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["developer-tasks"] });
      queryClient.invalidateQueries({ queryKey: ["developer-phases"] });
      toast({ title: "Phase completed!" });
    },
    onError: (error: any) => {
      toast({ variant: "destructive", title: "Error completing phase", description: error.message });
    },
  });

  const handleFileUpload = async () => {
    if (!files.length || !selectedTask) return;

    setUploading(true);
    try {
      const teamName = selectedTask.teams.name.replace(/\s+/g, "_");
      let uploadedCount = 0;

      const taskSubmissions = submissions?.filter(s => s.task_id === selectedTask.id) || [];
      const hasRevision = taskSubmissions.some(s => s.revision_status === "needs_revision");

      if (hasRevision) {
        const revisionsToUpdate = taskSubmissions.filter(s => s.revision_status === "needs_revision");
        for (const submission of revisionsToUpdate) {
          await supabase.from("design_submissions").update({ revision_status: "revised" }).eq("id", submission.id);
        }
      }

      for (const file of files) {
        const sanitizedFileName = file.name.replace(/[^a-zA-Z0-9._-]/g, "_");
        const timestamp = Date.now();
        const fileName = `${teamName}_Task_${selectedTask.task_number}_${timestamp}_${sanitizedFileName}`;
        const filePath = `${user!.id}/${fileName}`;

        const { error: uploadError } = await supabase.storage.from("design-files").upload(filePath, file);
        if (uploadError) throw uploadError;

        const { error: submissionError } = await supabase.from("design_submissions").insert({
          task_id: selectedTask.id, designer_id: user!.id,
          file_path: filePath, file_name: fileName,
          designer_comment: developerComment.trim() || null,
        });
        if (submissionError) throw submissionError;
        uploadedCount++;
        toast({ title: `Uploaded ${uploadedCount} of ${files.length} files` });
      }

      if (!hasRevision) {
        completePhase.mutate({ 
          taskId: selectedTask.id, 
          currentPhase: selectedTask.current_phase || 1, 
          totalPhases: selectedTask.total_phases || 4 
        });
      }

      queryClient.invalidateQueries({ queryKey: ["developer-tasks"] });
      queryClient.invalidateQueries({ queryKey: ["developer-submissions"] });
      toast({ 
        title: hasRevision ? "Revision uploaded successfully" : "Phase files uploaded successfully",
        description: `${files.length} file(s) submitted for review`
      });
      setSelectedTask(null);
      setFiles([]);
      setFilePreviews({});
      setDeveloperComment("");
    } catch (error: any) {
      toast({ variant: "destructive", title: "Error uploading files", description: error.message });
    } finally {
      setUploading(false);
    }
  };

  const updateTaskStatus = useMutation({
    mutationFn: async ({ taskId, status }: { taskId: string; status: Database["public"]["Enums"]["task_status"] }) => {
      const { error } = await supabase.from("tasks").update({ status }).eq("id", taskId);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["developer-tasks"] });
      toast({ title: "Task status updated" });
    },
  });

  const tasksNeedingRevision = tasks?.filter((t) => {
    const taskSubmissions = submissions?.filter(s => s.task_id === t.id) || [];
    return taskSubmissions.some(s => s.revision_status === "needs_revision");
  }) || [];

  const isTaskDelayed = (task: any) => {
    if (task.sla_deadline) {
      return new Date(task.sla_deadline) < new Date() && 
        !["completed", "approved", "cancelled"].includes(task.status);
    }
    const hoursSinceCreation = differenceInHours(new Date(), new Date(task.created_at));
    const needsRevision = tasksNeedingRevision.some(t => t.id === task.id);
    return hoursSinceCreation > 24 && (task.status === "pending" || task.status === "assigned" || needsRevision);
  };

  const isAckOverdue = (task: any) => {
    return task.status === "assigned" && task.ack_deadline && new Date(task.ack_deadline) < new Date();
  };

  const delayedTasks = tasks?.filter(isTaskDelayed) || [];

  const stats = {
    total: tasks?.length || 0,
    assigned: tasks?.filter((t) => t.status === "assigned").length || 0,
    in_progress: tasks?.filter((t) => t.status === "in_progress").length || 0,
    needs_revision: tasksNeedingRevision.length,
    delayed: delayedTasks.length,
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case "assigned": return "bg-blue-500/10 text-blue-700 dark:text-blue-400";
      case "pending": return "bg-muted text-muted-foreground";
      case "in_progress": return "bg-warning text-warning-foreground";
      case "completed": return "bg-primary text-primary-foreground";
      case "approved": return "bg-success text-success-foreground";
      default: return "bg-muted text-muted-foreground";
    }
  };

  const getStatusLabel = (status: string) => {
    if (status === "assigned") return "Awaiting Acknowledgement";
    if (status === "in_progress") return "In Progress";
    return status.replace("_", " ");
  };

  const filteredTasks = tasks?.filter((task) => {
    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase();
      return task.title?.toLowerCase().includes(query) ||
        task.task_number?.toString().includes(query) ||
        task.business_name?.toLowerCase().includes(query) ||
        task.description?.toLowerCase().includes(query) ||
        `#${task.task_number}`.includes(query);
    }
    if (statusFilter === "active") {
      return task.status === "assigned" || task.status === "pending" || task.status === "in_progress" || tasksNeedingRevision.some(t => t.id === task.id);
    }
    if (statusFilter === "delayed") return isTaskDelayed(task);
    if (!statusFilter) return true;
    if (statusFilter === "needs_revision") return tasksNeedingRevision.some(t => t.id === task.id);
    if (statusFilter === "assigned") return task.status === "assigned";
    return task.status === statusFilter;
  }).sort((a, b) => {
    if (a.status === "assigned" && b.status !== "assigned") return -1;
    if (a.status !== "assigned" && b.status === "assigned") return 1;
    const aDelayed = isTaskDelayed(a);
    const bDelayed = isTaskDelayed(b);
    if (aDelayed && !bDelayed) return -1;
    if (!aDelayed && bDelayed) return 1;
    return 0;
  });

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b bg-card">
        <div className="container mx-auto px-4 py-4 flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-foreground">Welcome, {profile?.full_name || 'Developer'}</h1>
            <p className="text-sm text-muted-foreground">Developer Dashboard</p>
          </div>
          <div className="flex items-center gap-2">
            <NotificationBell userId={user!.id} />
            <Button onClick={signOut} variant="outline" size="sm">
              <LogOut className="mr-2 h-4 w-4" />
              Sign Out
            </Button>
          </div>
        </div>
      </header>

      <main className="container mx-auto px-4 py-8">
        {stats.delayed > 0 && (
          <Card className="mb-6 border-destructive bg-destructive/5">
            <CardContent className="pt-6">
              <div className="flex items-center gap-3">
                <AlertTriangle className="h-6 w-6 text-destructive" />
                <div>
                  <h3 className="font-semibold text-destructive">Urgent: {stats.delayed} Delayed Order{stats.delayed > 1 ? 's' : ''}</h3>
                  <p className="text-sm text-muted-foreground">SLA deadline exceeded. Please prioritize urgently.</p>
                </div>
                <Button variant="destructive" size="sm" className="ml-auto" onClick={() => setStatusFilter("delayed")}>
                  View Delayed Tasks
                </Button>
              </div>
            </CardContent>
          </Card>
        )}

        {stats.assigned > 0 && (
          <Card className="mb-6 border-blue-500 bg-blue-500/5">
            <CardContent className="pt-6">
              <div className="flex items-center gap-3">
                <Play className="h-6 w-6 text-blue-600" />
                <div>
                  <h3 className="font-semibold text-blue-700 dark:text-blue-400">{stats.assigned} New Order{stats.assigned > 1 ? 's' : ''} Awaiting Acknowledgement</h3>
                  <p className="text-sm text-muted-foreground">You must acknowledge within 30 working minutes. SLA timer is already running.</p>
                </div>
                <Button variant="outline" size="sm" className="ml-auto border-blue-500 text-blue-700 hover:bg-blue-500/10" onClick={() => setStatusFilter("assigned")}>
                  View New Orders
                </Button>
              </div>
            </CardContent>
          </Card>
        )}
        
        <div className="mb-6">
          <Input
            type="text"
            placeholder="Search by task #, title, business name, or description..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="max-w-md"
          />
        </div>

        {statusFilter !== "active" && (
          <div className="mb-4">
            <Button variant="outline" size="sm" onClick={() => setStatusFilter("active")} className="gap-2">
              <Clock className="h-4 w-4" />
              Back to Active View
            </Button>
          </div>
        )}
        
        <div className="grid gap-6 md:grid-cols-5 mb-8">
          <Card className={`cursor-pointer transition-all hover:shadow-md ${statusFilter === null ? 'ring-2 ring-primary' : ''}`} onClick={() => setStatusFilter(null)}>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Total Orders</CardTitle>
              <FolderKanban className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent><div className="text-2xl font-bold">{stats.total}</div></CardContent>
          </Card>
          <Card className={`cursor-pointer transition-all hover:shadow-md ${statusFilter === 'assigned' ? 'ring-2 ring-primary' : ''}`} onClick={() => setStatusFilter('assigned')}>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Awaiting Ack</CardTitle>
              <Play className="h-4 w-4 text-blue-500" />
            </CardHeader>
            <CardContent><div className="text-2xl font-bold text-blue-600">{stats.assigned}</div></CardContent>
          </Card>
          <Card className={`cursor-pointer transition-all hover:shadow-md ${statusFilter === 'in_progress' ? 'ring-2 ring-primary' : ''}`} onClick={() => setStatusFilter('in_progress')}>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">In Progress</CardTitle>
              <Clock className="h-4 w-4 text-warning" />
            </CardHeader>
            <CardContent><div className="text-2xl font-bold">{stats.in_progress}</div></CardContent>
          </Card>
          <Card className={`border-destructive cursor-pointer transition-all hover:shadow-md ${statusFilter === 'needs_revision' ? 'ring-2 ring-primary' : ''}`} onClick={() => setStatusFilter('needs_revision')}>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Needs Revision</CardTitle>
              <AlertCircle className="h-4 w-4 text-destructive" />
            </CardHeader>
            <CardContent><div className="text-2xl font-bold text-destructive">{stats.needs_revision}</div></CardContent>
          </Card>
          <Card className={`cursor-pointer transition-all hover:shadow-md ${statusFilter === 'delayed' ? 'ring-2 ring-primary' : ''}`} onClick={() => setStatusFilter('delayed')}>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Delayed</CardTitle>
              <AlertTriangle className="h-4 w-4 text-destructive" />
            </CardHeader>
            <CardContent><div className="text-2xl font-bold text-destructive">{stats.delayed}</div></CardContent>
          </Card>
        </div>

        <Card>
          <CardHeader><CardTitle>Website Orders</CardTitle></CardHeader>
          <CardContent>
            <div className="space-y-4">
              {filteredTasks?.map((task) => {
                const taskSubmissions = submissions?.filter(s => s.task_id === task.id) || [];
                const isExpanded = expandedTaskId === task.id;
                const hasRevision = taskSubmissions.some(s => s.revision_status === "needs_revision");
                const isDelayed = isTaskDelayed(task);
                const isAssigned = task.status === "assigned";
                const ackOverdue = isAckOverdue(task);
                const hasReassignmentRequest = !!(task as any).reassignment_requested_at;
                
                return (
                  <div 
                    key={task.id} 
                    className={`border rounded-lg ${isAssigned ? 'border-blue-500 border-2 bg-blue-500/5' : ''} ${ackOverdue ? 'border-destructive border-2 bg-destructive/5' : ''} ${hasRevision && !isAssigned ? 'border-destructive border-2 bg-destructive/5' : ''} ${isDelayed && !isAssigned && !ackOverdue ? 'border-destructive border-2 bg-destructive/10' : ''}`}
                  >
                    <div className="flex items-start justify-between p-4 hover:bg-muted/50 transition-colors">
                      <div className="space-y-1 flex-1">
                        <div className="flex items-center gap-3 flex-wrap">
                          <span className="font-mono text-sm text-muted-foreground">#{task.task_number}</span>
                          <Badge variant="secondary" className="gap-1 bg-primary/10 text-primary">
                            <Globe className="h-3 w-3" />
                            Website Order
                          </Badge>
                          <h3 className="font-semibold">{task.title}</h3>
                          {isAssigned && !ackOverdue && (
                            <Badge className="gap-1 bg-blue-500/10 text-blue-700 dark:text-blue-400 border-blue-500">
                              <Play className="h-3 w-3" />
                              NEW
                            </Badge>
                          )}
                          {ackOverdue && (
                            <Badge variant="destructive" className="gap-1 animate-pulse">
                              <AlertTriangle className="h-3 w-3" />
                              ACK OVERDUE
                            </Badge>
                          )}
                          {isDelayed && !isAssigned && (
                            <Badge variant="destructive" className="gap-1 animate-pulse">
                              <AlertTriangle className="h-3 w-3" />
                              DELAYED
                            </Badge>
                          )}
                          {hasRevision && (
                            <Badge variant="destructive" className="gap-1">
                              <AlertCircle className="h-3 w-3" />
                              Revision Needed
                            </Badge>
                          )}
                          {hasReassignmentRequest && (
                            <Badge variant="outline" className="gap-1 border-orange-500 text-orange-600">
                              <RotateCcw className="h-3 w-3" />
                              Reassignment Requested
                            </Badge>
                          )}
                        </div>
                        <p className="text-sm text-muted-foreground">{task.description}</p>
                        
                        {/* SLA & Ack Timers for assigned tasks */}
                        {isAssigned && (
                          <div className="mt-2 p-2.5 bg-blue-500/5 border border-blue-200 dark:border-blue-800 rounded-md space-y-1.5">
                            {task.ack_deadline && (
                              <SlaCountdown deadline={task.ack_deadline} label="Ack Timer" />
                            )}
                            {task.sla_deadline && (
                              <SlaCountdown deadline={task.sla_deadline} label="9hr SLA" />
                            )}
                          </div>
                        )}

                        {/* Phase Progress & SLA for in-progress tasks */}
                        {!isAssigned && task.current_phase && task.total_phases && task.status !== "completed" && task.status !== "approved" && (
                          <div className="mt-2 p-2.5 bg-muted/30 rounded-md space-y-2">
                            <PhaseProgress currentPhase={task.current_phase} totalPhases={task.total_phases} />
                            {task.sla_deadline && <SlaCountdown deadline={task.sla_deadline} />}
                          </div>
                        )}

                        <div className="text-sm text-muted-foreground">
                          Created: <span className="font-medium">{format(new Date(task.created_at), 'MMM d, yyyy h:mm a')}</span>
                        </div>
                        <div className="text-sm text-muted-foreground">
                          Team: <span className="font-medium">{task.teams?.name}</span>
                          {taskSubmissions.length > 0 && (
                            <span className="ml-2 text-primary">• {taskSubmissions.length} file(s) uploaded</span>
                          )}
                        </div>
                        <div className="flex gap-2 mt-2">
                          <Button size="sm" variant="outline" onClick={() => setViewDetailsTask(task)}>
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
                                    <FilePreview filePath={filePath.trim()} fileName={fileName.trim()} className="w-10 h-10" />
                                    <span className="text-xs flex-1 truncate">{fileName.trim()}</span>
                                    <Button size="sm" variant="outline" onClick={() => handleDownload(filePath.trim(), fileName.trim())}>
                                      <Download className="h-3 w-3" />
                                    </Button>
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                        )}
                      </div>
                      <div className="flex flex-col items-end gap-2 ml-4">
                        <Badge className={hasRevision ? "bg-destructive text-destructive-foreground" : getStatusColor(task.status)}>
                          {hasRevision ? "Revision Needed" : getStatusLabel(task.status)}
                        </Badge>
                        {task.status === "in_progress" && task.current_phase && (
                          <span className="text-xs text-muted-foreground">Phase {task.current_phase}</span>
                        )}
                        {taskSubmissions.length > 0 && (
                          <Button size="sm" variant="ghost" onClick={() => setExpandedTaskId(isExpanded ? null : task.id)}>
                            {isExpanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                          </Button>
                        )}
                        
                        {/* Assigned task actions */}
                        {isAssigned && !hasReassignmentRequest && (
                          <div className="flex flex-col gap-2">
                            <Button
                              size="sm"
                              className="bg-blue-600 hover:bg-blue-700 text-white"
                              onClick={() => acknowledgeTask.mutate(task.id)}
                              disabled={acknowledgeTask.isPending}
                            >
                              <CheckCircle2 className="mr-2 h-4 w-4" />
                              Acknowledge
                            </Button>
                            <Button
                              size="sm"
                              variant="outline"
                              className="border-orange-500 text-orange-600 hover:bg-orange-50"
                              onClick={() => setReassignTask(task)}
                            >
                              <RotateCcw className="mr-2 h-4 w-4" />
                              Request Reassignment
                            </Button>
                          </div>
                        )}
                        
                        {task.status === "pending" && (
                          <Button size="sm" variant="outline" onClick={() => updateTaskStatus.mutate({ taskId: task.id, status: "in_progress" })}>
                            Start
                          </Button>
                        )}
                        {task.status === "in_progress" && (
                          <Button size="sm" onClick={() => setSelectedTask(task)}>
                            <Upload className="mr-2 h-4 w-4" />
                            Upload Phase {task.current_phase || 1}
                          </Button>
                        )}
                        {hasRevision && (
                          <Button size="sm" variant="default" className="bg-destructive hover:bg-destructive/90" onClick={() => setSelectedTask(task)}>
                            <Upload className="mr-2 h-4 w-4" />
                            Upload Revision
                          </Button>
                        )}
                      </div>
                    </div>
                    
                    {isExpanded && taskSubmissions.length > 0 && (
                      <div className="border-t bg-muted/20 p-4">
                        <h4 className="text-sm font-semibold mb-3">Your Uploaded Files:</h4>
                        <div className="space-y-2">
                          {taskSubmissions.map((submission) => (
                            <div key={submission.id} className="flex items-center gap-3 justify-between p-3 bg-background rounded-md">
                              <FilePreview filePath={submission.file_path} fileName={submission.file_name} />
                              <div className="flex-1 min-w-0">
                                <div className="flex items-center gap-2">
                                  <p className="text-sm font-medium truncate">{submission.file_name}</p>
                                  <Badge
                                    variant={submission.revision_status === "approved" ? "default" : submission.revision_status === "needs_revision" ? "destructive" : "secondary"}
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
                                    <span className="font-medium text-primary">Your comment:</span>
                                    <p className="text-muted-foreground mt-1">{submission.designer_comment}</p>
                                  </div>
                                )}
                                {submission.revision_notes && (
                                  <div className="mt-2 p-2 bg-destructive/10 rounded text-xs">
                                    <div className="flex items-center justify-between mb-1">
                                      <span className="font-medium text-destructive">Revision requested:</span>
                                      {submission.reviewed_at && (
                                        <span className="text-xs text-muted-foreground">{format(new Date(submission.reviewed_at), 'MMM d, yyyy h:mm a')}</span>
                                      )}
                                    </div>
                                    <p className="text-muted-foreground mt-1">{submission.revision_notes}</p>
                                    {submission.revision_reference_file_path && (
                                      <div className="mt-3 space-y-2">
                                        <span className="text-xs font-medium text-muted-foreground">Reference files:</span>
                                        <div className="flex flex-wrap gap-3">
                                          {submission.revision_reference_file_path.split("|||").map((filePath, fileIndex) => {
                                            const fileNames = submission.revision_reference_file_name?.split("|||") || [];
                                            const fileName = fileNames[fileIndex] || `Reference ${fileIndex + 1}`;
                                            return (
                                              <div key={fileIndex} className="flex flex-col items-center gap-1">
                                                <div className="cursor-pointer hover:opacity-80 transition-opacity" onClick={() => handleDownload(filePath.trim(), fileName.trim())}>
                                                  <FilePreview filePath={filePath.trim()} fileName={fileName.trim()} className="w-16 h-16" />
                                                </div>
                                                <Button size="sm" variant="ghost" className="h-6 px-2 text-xs" onClick={() => handleDownload(filePath.trim(), fileName.trim())}>
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
                              <Button size="sm" variant="outline" onClick={() => handleDownload(submission.file_path, submission.file_name)}>
                                <Download className="h-4 w-4" />
                              </Button>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
              {!tasks?.length && (
                <p className="text-center text-muted-foreground py-8">No website orders assigned to your team yet</p>
              )}
            </div>
          </CardContent>
        </Card>
      </main>

      {/* Upload Dialog */}
      <Dialog open={!!selectedTask} onOpenChange={() => setSelectedTask(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Upload Files — Phase {selectedTask?.current_phase || 1} of {selectedTask?.total_phases || 4}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <p className="text-sm text-muted-foreground mb-2">Task: {selectedTask?.title}</p>
              {selectedTask?.current_phase && selectedTask?.total_phases && (
                <div className="mb-3">
                  <PhaseProgress currentPhase={selectedTask.current_phase} totalPhases={selectedTask.total_phases} />
                </div>
              )}
              <p className="text-xs text-muted-foreground">
                Uploading will complete Phase {selectedTask?.current_phase || 1} and advance to the next phase.
              </p>
            </div>
            <div className="space-y-2">
              <Label htmlFor="file">Files (multiple allowed)</Label>
              <Input
                id="file" type="file" multiple
                onChange={(e) => {
                  const newFiles = Array.from(e.target.files || []);
                  const currentLength = files.length;
                  newFiles.forEach((file, index) => {
                    if (file.type.startsWith('image/')) {
                      const reader = new FileReader();
                      reader.onloadend = () => {
                        setFilePreviews(prev => ({ ...prev, [currentLength + index]: reader.result as string }));
                      };
                      reader.readAsDataURL(file);
                    }
                  });
                  setFiles(prev => [...prev, ...newFiles]);
                  e.target.value = '';
                }}
                accept="*/*"
              />
              {files.length > 0 && (
                <div className="space-y-2">
                  <p className="text-sm font-medium text-muted-foreground">{files.length} file(s) selected:</p>
                  <div className="max-h-64 overflow-y-auto space-y-2">
                    {files.map((file, index) => (
                      <div key={index} className="flex items-center gap-3 bg-muted/50 rounded p-2">
                        {filePreviews[index] && <img src={filePreviews[index]} alt={file.name} className="w-12 h-12 object-cover rounded border" />}
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium truncate">{file.name}</p>
                          <p className="text-xs text-muted-foreground">{(file.size / 1024).toFixed(1)} KB</p>
                        </div>
                        <Button type="button" variant="ghost" size="sm" className="h-6 w-6 p-0 ml-2"
                          onClick={() => {
                            setFiles(prev => prev.filter((_, i) => i !== index));
                            setFilePreviews(prev => { const n = { ...prev }; delete n[index]; return n; });
                          }}
                        >×</Button>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
            <div className="space-y-2">
              <Label htmlFor="developer-comment">Comment (optional)</Label>
              <Textarea id="developer-comment" placeholder="Add any notes about your submission..." value={developerComment} onChange={(e) => setDeveloperComment(e.target.value)} rows={3} />
            </div>
            <Button onClick={handleFileUpload} disabled={!files.length || uploading} className="w-full">
              {uploading ? "Uploading..." : `Upload ${files.length} File(s) & Complete Phase ${selectedTask?.current_phase || 1}`}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Request Reassignment Dialog */}
      <Dialog open={!!reassignTask} onOpenChange={() => { setReassignTask(null); setReassignReason(""); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <RotateCcw className="h-5 w-5 text-orange-600" />
              Request Reassignment
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">
              Task: <span className="font-medium text-foreground">{reassignTask?.title}</span>
            </p>
            <div className="p-3 bg-orange-50 dark:bg-orange-950/20 border border-orange-200 dark:border-orange-800 rounded-md text-sm text-orange-800 dark:text-orange-300">
              <p className="font-medium mb-1">⚠️ Important:</p>
              <ul className="list-disc list-inside space-y-1 text-xs">
                <li>A mandatory reason is required</li>
                <li>Development Head will be notified immediately</li>
                <li>The SLA timer continues running until reassigned</li>
              </ul>
            </div>
            <div className="space-y-2">
              <Label htmlFor="reassign-reason">Reason for Reassignment *</Label>
              <Textarea
                id="reassign-reason"
                placeholder="Please provide a detailed reason for requesting reassignment..."
                value={reassignReason}
                onChange={(e) => setReassignReason(e.target.value)}
                rows={4}
              />
            </div>
            <Button
              onClick={() => {
                if (!reassignReason.trim()) {
                  toast({ variant: "destructive", title: "Reason is required" });
                  return;
                }
                requestReassignment.mutate({ taskId: reassignTask.id, reason: reassignReason.trim() });
              }}
              disabled={!reassignReason.trim() || requestReassignment.isPending}
              className="w-full bg-orange-600 hover:bg-orange-700 text-white"
            >
              {requestReassignment.isPending ? "Submitting..." : "Submit Reassignment Request"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* View Details Dialog */}
      <Dialog open={!!viewDetailsTask} onOpenChange={() => setViewDetailsTask(null)}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Website Order Details - #{viewDetailsTask?.task_number}</DialogTitle>
          </DialogHeader>
          <ScrollArea className="max-h-[70vh] pr-4">
            <div className="space-y-6">
              {/* Phase Progress in Details */}
              {viewDetailsTask?.current_phase && viewDetailsTask?.total_phases && (
                <div className="p-4 bg-muted/30 rounded-lg space-y-3">
                  <h3 className="font-semibold text-lg">Project Progress</h3>
                  <PhaseProgress currentPhase={viewDetailsTask.current_phase} totalPhases={viewDetailsTask.total_phases} />
                  {viewDetailsTask.sla_deadline && viewDetailsTask.status !== "completed" && viewDetailsTask.status !== "approved" && (
                    <SlaCountdown deadline={viewDetailsTask.sla_deadline} label="9hr SLA" />
                  )}
                  {viewDetailsTask.ack_deadline && viewDetailsTask.status === "assigned" && (
                    <SlaCountdown deadline={viewDetailsTask.ack_deadline} label="Ack Timer" />
                  )}
                  {viewDetailsTask.acknowledged_at && (
                    <p className="text-xs text-muted-foreground">
                      Acknowledged: {format(new Date(viewDetailsTask.acknowledged_at), 'MMM d, yyyy h:mm a')}
                    </p>
                  )}
                  {viewDetailsTask.late_acknowledgement && (
                    <Badge variant="destructive" className="text-xs">Late Acknowledgement</Badge>
                  )}
                </div>
              )}

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
                    <Label className="text-muted-foreground">Team</Label>
                    <p className="font-medium">{viewDetailsTask?.teams?.name}</p>
                  </div>
                  {viewDetailsTask?.business_email && (
                    <div>
                      <Label className="text-muted-foreground">Business Email</Label>
                      <p className="font-medium">{viewDetailsTask.business_email}</p>
                    </div>
                  )}
                  {viewDetailsTask?.business_phone && (
                    <div>
                      <Label className="text-muted-foreground">Business Phone</Label>
                      <p className="font-medium">{viewDetailsTask.business_phone}</p>
                    </div>
                  )}
                  <div>
                    <Label className="text-muted-foreground">Deadline</Label>
                    <p className="font-medium">{viewDetailsTask?.deadline ? new Date(viewDetailsTask.deadline).toLocaleDateString() : "N/A"}</p>
                  </div>
                  <div>
                    <Label className="text-muted-foreground">Current Website</Label>
                    <p className="font-medium break-all">{viewDetailsTask?.website_url || "N/A"}</p>
                  </div>
                </div>
              </div>

              <div className="space-y-3">
                <h3 className="font-semibold text-lg border-b pb-2">Website Details</h3>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <Label className="text-muted-foreground">Number of Pages</Label>
                    <p className="font-medium">{viewDetailsTask?.number_of_pages || "N/A"}</p>
                  </div>
                  {viewDetailsTask?.video_keywords && (
                    <div>
                      <Label className="text-muted-foreground">Video Keywords</Label>
                      <p className="font-medium">{viewDetailsTask.video_keywords}</p>
                    </div>
                  )}
                </div>
                {viewDetailsTask?.design_references && (
                  <div>
                    <Label className="text-muted-foreground">Design References/Inspiration</Label>
                    <p className="font-medium whitespace-pre-wrap">{viewDetailsTask.design_references}</p>
                  </div>
                )}
              </div>

              {viewDetailsTask?.logo_url && (
                <div className="space-y-3">
                  <h3 className="font-semibold text-lg border-b pb-2">Logo Files</h3>
                  <div className="space-y-2">
                    {viewDetailsTask.logo_url.split('|||').map((filePath: string, index: number) => {
                      const fileName = filePath.split('/').pop() || `logo_${index + 1}`;
                      return (
                        <div key={index} className="p-3 bg-muted/30 rounded">
                          <FilePreview filePath={filePath.trim()} fileName={fileName.trim()} />
                          <Button size="sm" variant="outline" className="mt-3 w-full" onClick={() => handleDownload(filePath.trim(), fileName.trim())}>
                            <Download className="h-3 w-3 mr-2" />
                            Download {fileName.trim()}
                          </Button>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {viewDetailsTask?.supporting_text && (
                <div className="space-y-3">
                  <h3 className="font-semibold text-lg border-b pb-2">Business Description</h3>
                  <div className="p-3 bg-muted/30 rounded">
                    <p className="font-medium whitespace-pre-wrap">{viewDetailsTask.supporting_text}</p>
                  </div>
                </div>
              )}

              {viewDetailsTask?.notes_extra_instructions && (
                <div className="space-y-3">
                  <h3 className="font-semibold text-lg border-b pb-2">Additional Notes & Instructions</h3>
                  <div className="p-3 bg-muted/30 rounded">
                    <p className="font-medium whitespace-pre-wrap">{viewDetailsTask.notes_extra_instructions}</p>
                  </div>
                </div>
              )}

              {viewDetailsTask?.attachment_file_path && (
                <div className="space-y-3">
                  <h3 className="font-semibold text-lg border-b pb-2">Reference Files</h3>
                  <div className="space-y-2">
                    {viewDetailsTask.attachment_file_path.split('|||').map((filePath: string, index: number) => {
                      const fileNames = viewDetailsTask.attachment_file_name?.split('|||') || [];
                      const fileName = fileNames[index] || `attachment_${index + 1}`;
                      return (
                        <div key={index} className="p-3 bg-muted/30 rounded">
                          <FilePreview filePath={filePath.trim()} fileName={fileName.trim()} />
                          <Button size="sm" variant="outline" className="mt-3 w-full" onClick={() => handleDownload(filePath.trim(), fileName.trim())}>
                            <Download className="h-3 w-3 mr-2" />
                            Download
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
    </div>
  );
};

export default DeveloperDashboard;
