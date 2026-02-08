import { useState, useEffect } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { LogOut, Upload, CheckCircle2, Clock, FolderKanban, Download, ChevronDown, ChevronUp, FileText, AlertCircle, AlertTriangle, Image, Palette, Ban, Calendar, ChevronRight, RefreshCw } from "lucide-react";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { Database } from "@/integrations/supabase/types";
import { ScrollArea } from "@/components/ui/scroll-area";
import { FilePreview } from "@/components/FilePreview";
import { differenceInHours, format, startOfMonth, endOfMonth, subMonths, isWithinInterval } from "date-fns";
import { useDesignerNotifications } from "@/hooks/useDesignerNotifications";
import { NotificationBell } from "@/components/NotificationBell";

const DesignerDashboard = () => {
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
  const [revisionSubmissionId, setRevisionSubmissionId] = useState<string | null>(null);
  const [files, setFiles] = useState<File[]>([]);
  const [filePreviews, setFilePreviews] = useState<{[key: number]: string}>({});
  const [uploading, setUploading] = useState(false);
  const [designerComment, setDesignerComment] = useState("");
  const [expandedTaskId, setExpandedTaskId] = useState<string | null>(null);
  const [viewDetailsTask, setViewDetailsTask] = useState<any>(null);
  const [statusFilter, setStatusFilter] = useState<string | null>("pending_or_revision");
  const [taskTypeFilter, setTaskTypeFilter] = useState<string | null>(null);
  const [userTeams, setUserTeams] = useState<string[]>([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [prevMonthOpen, setPrevMonthOpen] = useState(false);
  const [showAllCurrent, setShowAllCurrent] = useState(false);
  const [showAllPrevious, setShowAllPrevious] = useState(false);

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

  // Enable sound notifications
  useDesignerNotifications(user?.id, userTeams);

  const { data: tasks } = useQuery({
    queryKey: ["designer-tasks", user?.id],
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
        .eq("is_deleted", false)
        .order("created_at", { ascending: false });

      if (error) throw error;
      return data;
    },
  });

  const { data: submissions } = useQuery({
    queryKey: ["designer-submissions", user?.id],
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

  const handleFileUpload = async () => {
    if (!files.length || !selectedTask) return;

    setUploading(true);
    try {
      const teamName = selectedTask.teams.name.replace(/\s+/g, "_");
      let uploadedCount = 0;

      // Check if this is a revision upload
      const taskSubmissions = submissions?.filter(s => s.task_id === selectedTask.id) || [];
      const isRevisionUpload = !!revisionSubmissionId;

      // If uploading revision for a specific submission, mark only that one as "revised"
      if (isRevisionUpload) {
        const { error: updateError } = await supabase
          .from("design_submissions")
          .update({ revision_status: "revised" })
          .eq("id", revisionSubmissionId);
        
        if (updateError) throw updateError;
      } else {
        // Legacy: check if any need revision (for task-level uploads like "Add Files")
        const hasRevision = taskSubmissions.some(s => s.revision_status === "needs_revision");
        if (hasRevision) {
          const revisionsToUpdate = taskSubmissions.filter(s => s.revision_status === "needs_revision");
          for (const submission of revisionsToUpdate) {
            const { error: updateError } = await supabase
              .from("design_submissions")
              .update({ revision_status: "revised" })
              .eq("id", submission.id);
            
            if (updateError) throw updateError;
          }
        }
      }

      // Upload all files and create submissions
      for (const file of files) {
        // Sanitize file name to remove special characters
        const sanitizedFileName = file.name.replace(/[^a-zA-Z0-9._-]/g, "_");
        const timestamp = Date.now();
        const fileName = `${teamName}_Task_${selectedTask.task_number}_${timestamp}_${sanitizedFileName}`;
        const filePath = `${user!.id}/${fileName}`;

        const { error: uploadError } = await supabase.storage
          .from("design-files")
          .upload(filePath, file);

        if (uploadError) throw uploadError;

        const { error: submissionError } = await supabase
          .from("design_submissions")
          .insert({
            task_id: selectedTask.id,
            designer_id: user!.id,
            file_path: filePath,
            file_name: fileName,
            designer_comment: designerComment.trim() || null,
          });

        if (submissionError) throw submissionError;
        uploadedCount++;
        
        // Show progress
        toast({ 
          title: `Uploaded ${uploadedCount} of ${files.length} files` 
        });
      }

      // Update task status to completed only if:
      // 1. Not a revision upload AND
      // 2. Task is not already completed/approved (adding more files)
      if (!isRevisionUpload && selectedTask.status !== "completed" && selectedTask.status !== "approved") {
        const { error: statusError } = await supabase
          .from("tasks")
          .update({ status: "completed" })
          .eq("id", selectedTask.id);

        if (statusError) throw statusError;
      }

      queryClient.invalidateQueries({ queryKey: ["designer-tasks"] });
      queryClient.invalidateQueries({ queryKey: ["designer-submissions"] });
      const isAddingMoreFiles = selectedTask.status === "completed" || selectedTask.status === "approved";
      toast({ 
        title: isRevisionUpload 
          ? "Revision uploaded successfully" 
          : isAddingMoreFiles 
            ? "Additional files uploaded successfully"
            : "All designs uploaded successfully",
        description: `${files.length} file(s) submitted for review`
      });
      setSelectedTask(null);
      setRevisionSubmissionId(null);
      setFiles([]);
      setFilePreviews({});
      setDesignerComment("");
    } catch (error: any) {
      toast({
        variant: "destructive",
        title: "Error uploading designs",
        description: error.message,
      });
    } finally {
      setUploading(false);
    }
  };

  const updateTaskStatus = useMutation({
    mutationFn: async ({ taskId, status }: { taskId: string; status: Database["public"]["Enums"]["task_status"] }) => {
      const { error } = await supabase
        .from("tasks")
        .update({ status })
        .eq("id", taskId);
      if (error) throw error;

      // Notify PM when designer starts working
      if (status === "in_progress") {
        const task = tasks?.find(t => t.id === taskId);
        if (task) {
          const designerName = profile?.full_name || "A designer";
          await supabase.from("notifications").insert({
            user_id: task.project_manager_id,
            type: "task_started",
            title: "Designer Started Working",
            message: `${designerName} started working on: ${task.title}`,
            task_id: taskId,
          });
        }
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["designer-tasks"] });
      toast({ title: "Task status updated" });
    },
  });

  const tasksNeedingRevision = tasks?.filter((t) => {
    const taskSubmissions = submissions?.filter(s => s.task_id === t.id) || [];
    return taskSubmissions.some(s => s.revision_status === "needs_revision");
  }) || [];

  const isTaskDelayed = (task: any) => {
    const taskSubmissions = submissions?.filter(s => s.task_id === task.id) || [];
    const revisionSubmission = taskSubmissions.find(s => s.revision_status === "needs_revision");
    
    if (revisionSubmission && revisionSubmission.reviewed_at) {
      // Revision request: 12-hour threshold from when revision was requested
      const hoursSinceRevision = differenceInHours(new Date(), new Date(revisionSubmission.reviewed_at));
      return hoursSinceRevision > 12;
    }
    
    // Pending task: 24-hour threshold from creation
    if (task.status === "pending") {
      const hoursSinceCreation = differenceInHours(new Date(), new Date(task.created_at));
      return hoursSinceCreation > 24;
    }
    
    return false;
  };

  const getDelayedHours = (task: any) => {
    const taskSubmissions = submissions?.filter(s => s.task_id === task.id) || [];
    const revisionSubmission = taskSubmissions.find(s => s.revision_status === "needs_revision");
    
    if (revisionSubmission && revisionSubmission.reviewed_at) {
      // Show hours since revision was requested
      return differenceInHours(new Date(), new Date(revisionSubmission.reviewed_at));
    }
    
    // Show hours since task creation
    return differenceInHours(new Date(), new Date(task.created_at));
  };

  const delayedTasks = tasks?.filter(isTaskDelayed) || [];

  const getTaskType = (task: any): 'logo' | 'social_media' | 'unknown' => {
    if (task.post_type === "Logo Design") return 'logo';
    if (task.post_type) return 'social_media';
    return 'unknown';
  };

  const logoTasks = tasks?.filter(t => getTaskType(t) === 'logo') || [];
  const socialMediaTasks = tasks?.filter(t => getTaskType(t) === 'social_media') || [];

  const stats = {
    total: tasks?.length || 0,
    pending: tasks?.filter((t) => t.status === "pending").length || 0,
    in_progress: tasks?.filter((t) => t.status === "in_progress").length || 0,
    needs_revision: tasksNeedingRevision.length,
    delayed: delayedTasks.length,
    logo: logoTasks.length,
    social_media: socialMediaTasks.length,
    cancelled: tasks?.filter((t) => t.status === "cancelled").length || 0,
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
      case "cancelled":
        return "bg-destructive text-destructive-foreground";
      default:
        return "bg-muted text-muted-foreground";
    }
  };

  const filteredTasks = tasks?.filter((task) => {
    // Search filter - if searching, show all matching tasks regardless of status/type
    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase();
      return task.title?.toLowerCase().includes(query) ||
        task.task_number?.toString().includes(query) ||
        task.business_name?.toLowerCase().includes(query) ||
        task.description?.toLowerCase().includes(query) ||
        `#${task.task_number}`.includes(query);
    }
    
    // Task type filter (only applied when not searching)
    if (taskTypeFilter) {
      const taskType = getTaskType(task);
      if (taskType !== taskTypeFilter) return false;
    }

    // Status filter (only applied when not searching)
    if (statusFilter === "pending_or_revision") {
      // Default view: show pending, in progress, or tasks needing revision
      return task.status === "pending" || task.status === "in_progress" || tasksNeedingRevision.some(t => t.id === task.id);
    }
    if (statusFilter === "delayed") {
      return isTaskDelayed(task);
    }
    if (!statusFilter) return true; // Show all when Total Tasks is clicked
    if (statusFilter === "needs_revision") {
      return tasksNeedingRevision.some(t => t.id === task.id);
    }
    return task.status === statusFilter;
  }).sort((a, b) => {
    // Sort delayed tasks to the top
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
            <h1 className="text-2xl font-bold text-foreground">Welcome, {profile?.full_name || 'Designer'}</h1>
            <p className="text-sm text-muted-foreground">Designer Dashboard</p>
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
                  <p className="text-sm text-muted-foreground">
                    {stats.delayed} task{stats.delayed > 1 ? 's have' : ' has'} exceeded their time limit. Please prioritize {stats.delayed > 1 ? 'these orders' : 'this order'} urgently.
                  </p>
                </div>
                <Button
                  variant="destructive"
                  size="sm"
                  className="ml-auto"
                  onClick={() => setStatusFilter("delayed")}
                >
                  View Delayed Tasks
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

        {statusFilter !== "pending_or_revision" && (
          <div className="mb-4">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setStatusFilter("pending_or_revision")}
              className="gap-2"
            >
              <Clock className="h-4 w-4" />
              Back to Default View (Pending, In Progress & Needs Revision)
            </Button>
          </div>
        )}

        <div className="mb-6 flex gap-2">
          <Button
            variant={taskTypeFilter === null ? "default" : "outline"}
            size="sm"
            onClick={() => setTaskTypeFilter(null)}
          >
            All Task Types
          </Button>
          <Button
            variant={taskTypeFilter === "logo" ? "default" : "outline"}
            size="sm"
            onClick={() => setTaskTypeFilter("logo")}
            className="gap-2"
          >
            <Palette className="h-4 w-4" />
            Logo Orders ({stats.logo})
          </Button>
          <Button
            variant={taskTypeFilter === "social_media" ? "default" : "outline"}
            size="sm"
            onClick={() => setTaskTypeFilter("social_media")}
            className="gap-2"
          >
            <Image className="h-4 w-4" />
            Social Media Posts ({stats.social_media})
          </Button>
        </div>
        
        <div className="grid gap-6 md:grid-cols-5 mb-8">
          <Card 
            className={`cursor-pointer transition-all hover:shadow-md ${statusFilter === null ? 'ring-2 ring-primary' : ''}`}
            onClick={() => setStatusFilter(null)}
          >
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Total Tasks</CardTitle>
              <FolderKanban className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{stats.total}</div>
            </CardContent>
          </Card>
          <Card 
            className={`cursor-pointer transition-all hover:shadow-md ${statusFilter === 'pending' ? 'ring-2 ring-primary' : ''}`}
            onClick={() => setStatusFilter('pending')}
          >
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Pending</CardTitle>
              <Clock className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{stats.pending}</div>
            </CardContent>
          </Card>
          <Card 
            className={`cursor-pointer transition-all hover:shadow-md ${statusFilter === 'in_progress' ? 'ring-2 ring-primary' : ''}`}
            onClick={() => setStatusFilter('in_progress')}
          >
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">In Progress</CardTitle>
              <Clock className="h-4 w-4 text-warning" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{stats.in_progress}</div>
            </CardContent>
          </Card>
          <Card 
            className={`border-destructive cursor-pointer transition-all hover:shadow-md ${statusFilter === 'needs_revision' ? 'ring-2 ring-primary' : ''}`}
            onClick={() => setStatusFilter('needs_revision')}
          >
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Needs Revision</CardTitle>
              <AlertCircle className="h-4 w-4 text-destructive" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-destructive">{stats.needs_revision}</div>
            </CardContent>
          </Card>
          <Card 
            className={`cursor-pointer transition-all hover:shadow-md ${statusFilter === 'cancelled' ? 'ring-2 ring-primary' : ''}`}
            onClick={() => setStatusFilter('cancelled')}
          >
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Cancelled</CardTitle>
              <Ban className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{stats.cancelled}</div>
              <p className="text-xs text-muted-foreground">Cancelled orders</p>
            </CardContent>
          </Card>
        </div>

        {/* Monthly Performance Section */}
        {(() => {
          const now = new Date();
          const curStart = startOfMonth(now);
          const curEnd = endOfMonth(now);
          const prevStart = startOfMonth(subMonths(now, 1));
          const prevEnd = endOfMonth(subMonths(now, 1));

          const currentMonthCompleted = tasks?.filter(t =>
            (t.status === "completed" || t.status === "approved") &&
            t.updated_at &&
            isWithinInterval(new Date(t.updated_at), { start: curStart, end: curEnd })
          ) || [];

          const previousMonthCompleted = tasks?.filter(t =>
            (t.status === "completed" || t.status === "approved") &&
            t.updated_at &&
            isWithinInterval(new Date(t.updated_at), { start: prevStart, end: prevEnd })
          ) || [];

          const PREVIEW_LIMIT = 5;

          const OrdersTable = ({ orders, showAll, onToggle }: { orders: typeof currentMonthCompleted; showAll: boolean; onToggle: () => void }) => {
            if (orders.length === 0) return (
              <p className="text-sm text-muted-foreground py-4 text-center">No completed orders.</p>
            );
            const visible = showAll ? orders : orders.slice(0, PREVIEW_LIMIT);
            return (
              <>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Task #</TableHead>
                      <TableHead>Title</TableHead>
                      <TableHead>Business</TableHead>
                      <TableHead>Completed</TableHead>
                      <TableHead>Status</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {visible.map(order => (
                      <TableRow key={order.id}>
                        <TableCell className="font-mono">#{order.task_number}</TableCell>
                        <TableCell>{order.title}</TableCell>
                        <TableCell>{order.business_name || "—"}</TableCell>
                        <TableCell>{order.updated_at ? format(new Date(order.updated_at), "MMM d, yyyy") : "—"}</TableCell>
                        <TableCell>
                          <Badge className={getStatusColor(order.status)}>{order.status}</Badge>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
                {orders.length > PREVIEW_LIMIT && (
                  <Button variant="ghost" size="sm" onClick={onToggle} className="mt-2 w-full">
                    {showAll ? `Show less` : `Show all ${orders.length} orders`}
                  </Button>
                )}
              </>
            );
          };

          return (
            <Card className="mb-8">
              <CardHeader>
                <div className="flex items-center gap-2">
                  <Calendar className="h-5 w-5 text-primary" />
                  <CardTitle>Monthly Performance</CardTitle>
                </div>
              </CardHeader>
              <CardContent className="space-y-6">
                {/* Current month summary */}
                <div>
                  <div className="flex items-center justify-between mb-3">
                    <h3 className="font-semibold text-lg">{format(now, "MMMM yyyy")}</h3>
                    <Badge variant="secondary" className="text-base px-3 py-1">
                      {currentMonthCompleted.length} completed
                    </Badge>
                  </div>
                  <OrdersTable orders={currentMonthCompleted} showAll={showAllCurrent} onToggle={() => setShowAllCurrent(v => !v)} />
                </div>

                {/* Previous month collapsible */}
                <Collapsible open={prevMonthOpen} onOpenChange={setPrevMonthOpen}>
                  <CollapsibleTrigger className="flex items-center gap-2 text-sm font-medium text-muted-foreground hover:text-foreground transition-colors w-full">
                    <ChevronRight className={`h-4 w-4 transition-transform ${prevMonthOpen ? "rotate-90" : ""}`} />
                    {format(subMonths(now, 1), "MMMM yyyy")} — {previousMonthCompleted.length} completed
                  </CollapsibleTrigger>
                  <CollapsibleContent className="mt-3">
                    <OrdersTable orders={previousMonthCompleted} showAll={showAllPrevious} onToggle={() => setShowAllPrevious(v => !v)} />
                  </CollapsibleContent>
                </Collapsible>
              </CardContent>
            </Card>
          );
        })()}

        <Card>
          <CardHeader>
            <CardTitle>Team Tasks</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {filteredTasks?.map((task) => {
                const taskSubmissions = submissions?.filter(s => s.task_id === task.id) || [];
                const isExpanded = expandedTaskId === task.id;
                const hasRevision = taskSubmissions.some(s => s.revision_status === "needs_revision");
                const isDelayed = isTaskDelayed(task);
                const taskType = getTaskType(task);
                
                return (
                  <div 
                    key={task.id} 
                    className={`border rounded-lg ${task.status === 'cancelled' ? 'border-gray-400 bg-muted/30 opacity-75' : ''} ${hasRevision ? 'border-destructive border-2 bg-destructive/5' : ''} ${isDelayed ? 'border-destructive border-2 bg-destructive/10' : ''}`}
                  >
                    <div className="flex items-center justify-between p-4 hover:bg-muted/50 transition-colors">
                      <div className="space-y-1 flex-1">
                        <div className="flex items-center gap-3">
                          <span className="font-mono text-sm text-muted-foreground">
                            #{task.task_number}
                          </span>
                          {taskType === 'logo' && (
                            <Badge variant="secondary" className="gap-1 bg-purple-100 text-purple-700 dark:bg-purple-900 dark:text-purple-200">
                              <Palette className="h-3 w-3" />
                              Logo Order
                            </Badge>
                          )}
                          {taskType === 'social_media' && (
                            <Badge variant="secondary" className="gap-1 bg-blue-100 text-blue-700 dark:bg-blue-900 dark:text-blue-200">
                              <Image className="h-3 w-3" />
                              Social Media Post
                            </Badge>
                          )}
                          <h3 className="font-semibold">{task.title}</h3>
                          {task.status === 'cancelled' && (
                            <Badge variant="destructive" className="gap-1">
                              <Ban className="h-3 w-3" />
                              Cancelled
                            </Badge>
                          )}
                          {isDelayed && (
                            <Badge variant="destructive" className="gap-1 animate-pulse">
                              <AlertTriangle className="h-3 w-3" />
                              DELAYED {getDelayedHours(task)}h
                            </Badge>
                          )}
                          {hasRevision && (
                            <Badge variant="destructive" className="gap-1">
                              <AlertCircle className="h-3 w-3" />
                              Revision Needed
                            </Badge>
                          )}
                        </div>
                        <p className="text-sm text-muted-foreground">{task.description}</p>
                        {task.status === 'cancelled' && (task as any).cancellation_reason && (
                          <div className="mt-2 p-2 bg-destructive/10 border border-destructive/20 rounded text-sm">
                            <span className="font-medium text-destructive">Cancellation Reason: </span>
                            <span className="text-foreground">{(task as any).cancellation_reason}</span>
                          </div>
                        )}
                        <div className="text-sm text-muted-foreground">
                          Created: <span className="font-medium">{format(new Date(task.created_at), 'MMM d, yyyy h:mm a')}</span>
                        </div>
                        <div className="text-sm text-muted-foreground">
                          Team: <span className="font-medium">{task.teams?.name}</span>
                          {taskSubmissions.length > 0 && (
                            <span className="ml-2 text-primary">
                              • {taskSubmissions.length} file(s) uploaded
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
                        <Badge className={hasRevision ? "bg-destructive text-destructive-foreground" : getStatusColor(task.status)}>
                          {hasRevision ? "Revision Needed" : task.status.replace("_", " ")}
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
                        {task.status === "pending" && (
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() =>
                              updateTaskStatus.mutate({ taskId: task.id, status: "in_progress" })
                            }
                          >
                            Start
                          </Button>
                        )}
                        {task.status === "in_progress" && !hasRevision && (
                          <Button size="sm" onClick={() => setSelectedTask(task)}>
                            <Upload className="mr-2 h-4 w-4" />
                            Upload
                          </Button>
                        )}
                        {hasRevision && (
                          <Button 
                            size="sm" 
                            variant="default"
                            className="bg-orange-600 hover:bg-orange-700"
                            onClick={() => setExpandedTaskId(task.id)}
                          >
                            <RefreshCw className="mr-2 h-4 w-4" />
                            View Revisions
                          </Button>
                        )}
                        {/* Add Files button for completed/approved tasks */}
                        {taskSubmissions.length > 0 && 
                         (task.status === "completed" || task.status === "approved") && 
                         !hasRevision && (
                          <Button 
                            size="sm" 
                            variant="outline"
                            onClick={() => setSelectedTask(task)}
                          >
                            <Upload className="mr-2 h-4 w-4" />
                            Add Files
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
                                       <span className="font-medium text-primary">Your comment:</span>
                                       <p className="text-muted-foreground mt-1">{submission.designer_comment}</p>
                                     </div>
                                   )}
                                   {submission.revision_notes && (
                                     <div className="mt-2 p-2 bg-destructive/10 rounded text-xs">
                                       <div className="flex items-center justify-between mb-1">
                                         <span className="font-medium text-destructive">Revision requested:</span>
                                         {submission.reviewed_at && (
                                           <span className="text-xs text-muted-foreground">
                                             {format(new Date(submission.reviewed_at), 'MMM d, yyyy h:mm a')}
                                           </span>
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
                               <div className="flex items-center gap-2 flex-shrink-0">
                                 {submission.revision_status === "needs_revision" && (
                                   <Button
                                     size="sm"
                                     className="bg-orange-600 hover:bg-orange-700"
                                     onClick={() => {
                                       setRevisionSubmissionId(submission.id);
                                       setSelectedTask(task);
                                     }}
                                   >
                                     <Upload className="h-3 w-3 mr-1" />
                                     Upload Revision
                                   </Button>
                                 )}
                                 <Button
                                   size="sm"
                                   variant="outline"
                                   onClick={() => handleDownload(submission.file_path, submission.file_name)}
                                 >
                                   <Download className="h-4 w-4" />
                                 </Button>
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
                  No tasks assigned to your team yet
                </p>
              )}
            </div>
          </CardContent>
        </Card>
      </main>

      <Dialog open={!!selectedTask} onOpenChange={() => { setSelectedTask(null); setRevisionSubmissionId(null); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{revisionSubmissionId ? "Upload Revision" : "Upload Design"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <p className="text-sm text-muted-foreground mb-2">
                Task: {selectedTask?.title}
              </p>
              <p className="text-sm text-muted-foreground">
                Files will be named: {selectedTask?.teams?.name.replace(/\s+/g, "_")}_Task_
                {selectedTask?.task_number}_[filename]
              </p>
            </div>
            <div className="space-y-2">
              <Label htmlFor="file">Design Files (multiple allowed)</Label>
              <Input
                id="file"
                type="file"
                multiple
                onChange={(e) => {
                  const newFiles = Array.from(e.target.files || []);
                  const currentLength = files.length;
                  
                  // Create previews for image files
                  newFiles.forEach((file, index) => {
                    if (file.type.startsWith('image/')) {
                      const reader = new FileReader();
                      reader.onloadend = () => {
                        setFilePreviews(prev => ({
                          ...prev,
                          [currentLength + index]: reader.result as string
                        }));
                      };
                      reader.readAsDataURL(file);
                    }
                  });
                  
                  setFiles(prev => [...prev, ...newFiles]);
                  e.target.value = '';
                }}
                accept="image/*,.pdf,.ai,.psd,.fig,.sketch,.zip"
              />
              {files.length > 0 && (
                <div className="space-y-2">
                  <p className="text-sm font-medium text-muted-foreground">
                    {files.length} file(s) selected:
                  </p>
                  <div className="max-h-64 overflow-y-auto space-y-2">
                    {files.map((file, index) => (
                      <div key={index} className="flex items-center gap-3 bg-muted/50 rounded p-2">
                        {filePreviews[index] && (
                          <img 
                            src={filePreviews[index]} 
                            alt={file.name} 
                            className="w-12 h-12 object-cover rounded border"
                          />
                        )}
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium truncate">{file.name}</p>
                          <p className="text-xs text-muted-foreground">
                            {(file.size / 1024).toFixed(1)} KB
                          </p>
                        </div>
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          className="h-6 w-6 p-0 ml-2"
                          onClick={() => {
                            setFiles(prev => prev.filter((_, i) => i !== index));
                            setFilePreviews(prev => {
                              const newPreviews = { ...prev };
                              delete newPreviews[index];
                              return newPreviews;
                            });
                          }}
                        >
                          ×
                        </Button>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
            <div className="space-y-2">
              <Label htmlFor="designer-comment">Comment (optional)</Label>
              <Textarea
                id="designer-comment"
                placeholder="Add any notes or comments about your design submission..."
                value={designerComment}
                onChange={(e) => setDesignerComment(e.target.value)}
                rows={3}
              />
            </div>
            <Button
              onClick={handleFileUpload}
              disabled={!files.length || uploading}
              className="w-full"
            >
              {uploading ? "Uploading..." : `Upload ${files.length} File(s)`}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={!!viewDetailsTask} onOpenChange={() => setViewDetailsTask(null)}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Task Details - #{viewDetailsTask?.task_number}</DialogTitle>
          </DialogHeader>
          <ScrollArea className="max-h-[70vh] pr-4">
            <div className="space-y-6">
              {/* Basic Information */}
              {/* Logo Order Details - shown first for logo orders */}
              {viewDetailsTask?.post_type === "Logo Design" && (
                <>
                  <div className="space-y-3">
                    <h3 className="font-semibold text-lg border-b pb-2">Logo Details</h3>
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <Label className="text-muted-foreground">Logo Name</Label>
                        <p className="font-medium">{viewDetailsTask?.business_name || "N/A"}</p>
                      </div>
                      <div>
                        <Label className="text-muted-foreground">Industry</Label>
                        <p className="font-medium">{viewDetailsTask?.industry || "N/A"}</p>
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

                  <div className="space-y-3">
                    <h3 className="font-semibold text-lg border-b pb-2">Logo Specifications</h3>
                    <div className="space-y-3">
                      <div>
                        <Label className="text-muted-foreground">Primary Focus</Label>
                        <p className="font-medium">{viewDetailsTask?.description || "N/A"}</p>
                      </div>
                      <div>
                        <Label className="text-muted-foreground">Color Combination</Label>
                        <p className="font-medium">{viewDetailsTask?.brand_colors || "N/A"}</p>
                      </div>
                      <div>
                        <Label className="text-muted-foreground">Overall Look & Feel</Label>
                        <p className="font-medium">{viewDetailsTask?.logo_style || "N/A"}</p>
                      </div>
                    </div>
                  </div>
                </>
              )}

              {/* Basic Information - shown for non-logo orders */}
              {viewDetailsTask?.post_type !== "Logo Design" && (
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
              )}

              {/* Post Details - for social media posts */}
              {viewDetailsTask?.post_type !== "Logo Design" && (
                <>
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
                        <Label className="text-muted-foreground">Images/Links</Label>
                        <p className="font-medium break-all">{viewDetailsTask?.product_service_images || "N/A"}</p>
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
                    <div className="grid grid-cols-2 gap-4">
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
                      <div>
                        <Label className="text-muted-foreground">Logo URL</Label>
                        <p className="font-medium break-all text-primary">{viewDetailsTask?.logo_url || "N/A"}</p>
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
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <Label className="text-muted-foreground">Age</Label>
                        <p className="font-medium">{viewDetailsTask?.target_audience_age || "N/A"}</p>
                      </div>
                      <div>
                        <Label className="text-muted-foreground">Location</Label>
                        <p className="font-medium">{viewDetailsTask?.target_audience_location || "N/A"}</p>
                      </div>
                      <div>
                        <Label className="text-muted-foreground">Interest</Label>
                        <p className="font-medium">{viewDetailsTask?.target_audience_interest || "N/A"}</p>
                      </div>
                      <div>
                        <Label className="text-muted-foreground">Other</Label>
                        <p className="font-medium">{viewDetailsTask?.target_audience_other || "N/A"}</p>
                      </div>
                    </div>
                  </div>
                </>
              )}

              {/* Additional Notes/Instructions */}
              {viewDetailsTask?.notes_extra_instructions && (
                <div className="space-y-3">
                  <h3 className="font-semibold text-lg border-b pb-2">Additional Notes & Instructions</h3>
                  <div className="p-3 bg-muted/30 rounded">
                    <p className="font-medium whitespace-pre-wrap">{viewDetailsTask.notes_extra_instructions}</p>
                  </div>
                </div>
              )}

              {/* Cancellation Details */}
              {viewDetailsTask?.status === "cancelled" && (
                <div className="space-y-3 bg-destructive/10 border border-destructive/20 rounded-lg p-4">
                  <h3 className="font-semibold text-lg text-destructive">Cancellation Details</h3>
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <Label className="text-muted-foreground">Cancelled At</Label>
                      <p className="font-medium">{(viewDetailsTask as any)?.cancelled_at ? new Date((viewDetailsTask as any).cancelled_at).toLocaleString() : "N/A"}</p>
                    </div>
                    <div>
                      <Label className="text-muted-foreground">Status</Label>
                      <Badge className="bg-destructive text-destructive-foreground">Cancelled</Badge>
                    </div>
                  </div>
                  <div>
                    <Label className="text-muted-foreground">Reason</Label>
                    <p className="font-medium whitespace-pre-wrap">{(viewDetailsTask as any)?.cancellation_reason || "No reason provided"}</p>
                  </div>
                </div>
              )}

              {/* Attachments */}
              {viewDetailsTask?.attachment_file_path && (
                <div className="space-y-3">
                  <h3 className="font-semibold text-lg border-b pb-2">Task Attachments</h3>
                  <div className="space-y-2">
                    {viewDetailsTask.attachment_file_path.split('|||').map((filePath, index) => {
                      const fileNames = viewDetailsTask.attachment_file_name?.split('|||') || [];
                      const fileName = fileNames[index] || `attachment_${index + 1}`;
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

export default DesignerDashboard;
