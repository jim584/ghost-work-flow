import { useState, useEffect } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { LogOut, Upload, CheckCircle2, Clock, FolderKanban, Download, ChevronDown, ChevronUp, FileText, AlertCircle, AlertTriangle, Globe } from "lucide-react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { Database } from "@/integrations/supabase/types";
import { ScrollArea } from "@/components/ui/scroll-area";
import { FilePreview } from "@/components/FilePreview";
import { differenceInHours, format } from "date-fns";
import { useDesignerNotifications } from "@/hooks/useDesignerNotifications";
import { NotificationBell } from "@/components/NotificationBell";

const DeveloperDashboard = () => {
  const { user, signOut } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [selectedTask, setSelectedTask] = useState<any>(null);
  const [files, setFiles] = useState<File[]>([]);
  const [filePreviews, setFilePreviews] = useState<{[key: number]: string}>({});
  const [uploading, setUploading] = useState(false);
  const [developerComment, setDeveloperComment] = useState("");
  const [expandedTaskId, setExpandedTaskId] = useState<string | null>(null);
  const [viewDetailsTask, setViewDetailsTask] = useState<any>(null);
  const [statusFilter, setStatusFilter] = useState<string | null>("pending_or_revision");
  const [userTeams, setUserTeams] = useState<string[]>([]);
  const [searchQuery, setSearchQuery] = useState("");

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

  // Helper function to check if a task is a website order
  const isWebsiteOrder = (task: any) => {
    return task.post_type === 'Website Design';
  };

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
      
      // Filter to only website orders
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
      const hasRevision = taskSubmissions.some(s => s.revision_status === "needs_revision");

      // If uploading revision, mark old "needs_revision" submissions as "revised"
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
            designer_comment: developerComment.trim() || null,
          });

        if (submissionError) throw submissionError;
        uploadedCount++;
        
        // Show progress
        toast({ 
          title: `Uploaded ${uploadedCount} of ${files.length} files` 
        });
      }

      // Update task status after all files are uploaded (only if not a revision)
      if (!hasRevision) {
        const { error: statusError } = await supabase
          .from("tasks")
          .update({ status: "completed" })
          .eq("id", selectedTask.id);

        if (statusError) throw statusError;
      }

      queryClient.invalidateQueries({ queryKey: ["developer-tasks"] });
      queryClient.invalidateQueries({ queryKey: ["developer-submissions"] });
      toast({ 
        title: hasRevision ? "Revision uploaded successfully" : "All files uploaded successfully",
        description: `${files.length} file(s) submitted for review`
      });
      setSelectedTask(null);
      setFiles([]);
      setFilePreviews({});
      setDeveloperComment("");
    } catch (error: any) {
      toast({
        variant: "destructive",
        title: "Error uploading files",
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
    const createdAt = new Date(task.created_at);
    const hoursSinceCreation = differenceInHours(new Date(), createdAt);
    // Task is delayed if it's been more than 24 hours and still pending or needs revision
    const needsRevision = tasksNeedingRevision.some(t => t.id === task.id);
    return hoursSinceCreation > 24 && (task.status === "pending" || needsRevision);
  };

  const delayedTasks = tasks?.filter(isTaskDelayed) || [];

  const stats = {
    total: tasks?.length || 0,
    pending: tasks?.filter((t) => t.status === "pending").length || 0,
    in_progress: tasks?.filter((t) => t.status === "in_progress").length || 0,
    needs_revision: tasksNeedingRevision.length,
    delayed: delayedTasks.length,
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
          <h1 className="text-2xl font-bold text-foreground">Developer Dashboard</h1>
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
                    {stats.delayed} task{stats.delayed > 1 ? 's have' : ' has'} been pending for more than 24 hours. Please prioritize {stats.delayed > 1 ? 'these orders' : 'this order'} urgently.
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
        
        <div className="grid gap-6 md:grid-cols-4 mb-8">
          <Card 
            className={`cursor-pointer transition-all hover:shadow-md ${statusFilter === null ? 'ring-2 ring-primary' : ''}`}
            onClick={() => setStatusFilter(null)}
          >
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Total Orders</CardTitle>
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
        </div>

        <Card>
          <CardHeader>
            <CardTitle>Website Orders</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {filteredTasks?.map((task) => {
                const taskSubmissions = submissions?.filter(s => s.task_id === task.id) || [];
                const isExpanded = expandedTaskId === task.id;
                const hasRevision = taskSubmissions.some(s => s.revision_status === "needs_revision");
                const isDelayed = isTaskDelayed(task);
                const createdAt = new Date(task.created_at);
                const hoursSinceCreation = differenceInHours(new Date(), createdAt);
                
                return (
                  <div 
                    key={task.id} 
                    className={`border rounded-lg ${hasRevision ? 'border-destructive border-2 bg-destructive/5' : ''} ${isDelayed ? 'border-destructive border-2 bg-destructive/10' : ''}`}
                  >
                    <div className="flex items-center justify-between p-4 hover:bg-muted/50 transition-colors">
                      <div className="space-y-1 flex-1">
                        <div className="flex items-center gap-3">
                          <span className="font-mono text-sm text-muted-foreground">
                            #{task.task_number}
                          </span>
                          <Badge variant="secondary" className="gap-1 bg-primary/10 text-primary">
                            <Globe className="h-3 w-3" />
                            Website Order
                          </Badge>
                          <h3 className="font-semibold">{task.title}</h3>
                          {isDelayed && (
                            <Badge variant="destructive" className="gap-1 animate-pulse">
                              <AlertTriangle className="h-3 w-3" />
                              DELAYED {hoursSinceCreation}h
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
                        {task.status === "in_progress" && (
                          <Button size="sm" onClick={() => setSelectedTask(task)}>
                            <Upload className="mr-2 h-4 w-4" />
                            Upload
                          </Button>
                        )}
                        {hasRevision && (
                          <Button 
                            size="sm" 
                            variant="default"
                            className="bg-destructive hover:bg-destructive/90"
                            onClick={() => setSelectedTask(task)}
                          >
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
                              <Button
                                size="sm"
                                variant="outline"
                                onClick={() => handleDownload(submission.file_path, submission.file_name)}
                              >
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
                <p className="text-center text-muted-foreground py-8">
                  No website orders assigned to your team yet
                </p>
              )}
            </div>
          </CardContent>
        </Card>
      </main>

      <Dialog open={!!selectedTask} onOpenChange={() => setSelectedTask(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Upload Files</DialogTitle>
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
              <Label htmlFor="file">Files (multiple allowed)</Label>
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
                accept="*/*"
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
              <Label htmlFor="developer-comment">Comment (optional)</Label>
              <Textarea
                id="developer-comment"
                placeholder="Add any notes or comments about your submission..."
                value={developerComment}
                onChange={(e) => setDeveloperComment(e.target.value)}
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
            <DialogTitle>Website Order Details - #{viewDetailsTask?.task_number}</DialogTitle>
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
                    <Label className="text-muted-foreground">Team</Label>
                    <p className="font-medium">{viewDetailsTask?.teams?.name}</p>
                  </div>
                  <div>
                    <Label className="text-muted-foreground">Deadline</Label>
                    <p className="font-medium">{viewDetailsTask?.deadline ? new Date(viewDetailsTask.deadline).toLocaleDateString() : "N/A"}</p>
                  </div>
                  <div>
                    <Label className="text-muted-foreground">Deadline Type</Label>
                    <p className="font-medium">{viewDetailsTask?.website_deadline_type || "N/A"}</p>
                  </div>
                </div>
              </div>

              {/* Website Details */}
              <div className="space-y-3">
                <h3 className="font-semibold text-lg border-b pb-2">Website Details</h3>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <Label className="text-muted-foreground">Website Type</Label>
                    <p className="font-medium">{viewDetailsTask?.website_type || "N/A"}</p>
                  </div>
                  <div>
                    <Label className="text-muted-foreground">Number of Pages</Label>
                    <p className="font-medium">{viewDetailsTask?.number_of_pages || "N/A"}</p>
                  </div>
                  <div>
                    <Label className="text-muted-foreground">Domain/Hosting Status</Label>
                    <p className="font-medium">{viewDetailsTask?.domain_hosting_status || "N/A"}</p>
                  </div>
                  <div>
                    <Label className="text-muted-foreground">Content Provided</Label>
                    <p className="font-medium">{viewDetailsTask?.content_provided ? "Yes" : "No"}</p>
                  </div>
                </div>
                <div>
                  <Label className="text-muted-foreground">Website Features</Label>
                  <p className="font-medium">{viewDetailsTask?.website_features || "N/A"}</p>
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
                <div>
                  <Label className="text-muted-foreground">Design References</Label>
                  <p className="font-medium">{viewDetailsTask?.design_references || "N/A"}</p>
                </div>
              </div>

              {/* Additional Notes/Instructions */}
              {viewDetailsTask?.notes_extra_instructions && (
                <div className="space-y-3">
                  <h3 className="font-semibold text-lg border-b pb-2">Additional Notes & Instructions</h3>
                  <div className="p-3 bg-muted/30 rounded">
                    <p className="font-medium whitespace-pre-wrap">{viewDetailsTask.notes_extra_instructions}</p>
                  </div>
                </div>
              )}

              {/* Description */}
              {viewDetailsTask?.description && (
                <div className="space-y-3">
                  <h3 className="font-semibold text-lg border-b pb-2">Description</h3>
                  <div className="p-3 bg-muted/30 rounded">
                    <p className="font-medium whitespace-pre-wrap">{viewDetailsTask.description}</p>
                  </div>
                </div>
              )}

              {/* Attachments */}
              {viewDetailsTask?.attachment_file_path && (
                <div className="space-y-3">
                  <h3 className="font-semibold text-lg border-b pb-2">Task Attachments</h3>
                  <div className="space-y-2">
                    {viewDetailsTask.attachment_file_path.split('|||').map((filePath: string, index: number) => {
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

export default DeveloperDashboard;
