import { useState } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { LogOut, Upload, CheckCircle2, Clock, FolderKanban } from "lucide-react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { Database } from "@/integrations/supabase/types";

const DesignerDashboard = () => {
  const { user, signOut } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [selectedTask, setSelectedTask] = useState<any>(null);
  const [files, setFiles] = useState<File[]>([]);
  const [uploading, setUploading] = useState(false);

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
        .order("created_at", { ascending: false });

      if (error) throw error;
      return data;
    },
  });

  const handleFileUpload = async () => {
    if (!files.length || !selectedTask) return;

    setUploading(true);
    try {
      const teamName = selectedTask.teams.name.replace(/\s+/g, "_");
      let uploadedCount = 0;

      // Upload all files and create submissions
      for (const file of files) {
        // Sanitize file name to remove special characters
        const sanitizedFileName = file.name.replace(/[^a-zA-Z0-9._-]/g, "_");
        const fileName = `${teamName}_Task_${selectedTask.task_number}_${sanitizedFileName}`;
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
          });

        if (submissionError) throw submissionError;
        uploadedCount++;
        
        // Show progress
        toast({ 
          title: `Uploaded ${uploadedCount} of ${files.length} files` 
        });
      }

      // Update task status after all files are uploaded
      const { error: statusError } = await supabase
        .from("tasks")
        .update({ status: "completed" })
        .eq("id", selectedTask.id);

      if (statusError) throw statusError;

      queryClient.invalidateQueries({ queryKey: ["designer-tasks"] });
      toast({ 
        title: "All designs uploaded successfully",
        description: `${files.length} file(s) submitted for review`
      });
      setSelectedTask(null);
      setFiles([]);
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
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["designer-tasks"] });
      toast({ title: "Task status updated" });
    },
  });

  const stats = {
    total: tasks?.length || 0,
    pending: tasks?.filter((t) => t.status === "pending").length || 0,
    in_progress: tasks?.filter((t) => t.status === "in_progress").length || 0,
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
          <h1 className="text-2xl font-bold text-foreground">Designer Dashboard</h1>
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
              <CardTitle className="text-sm font-medium">Pending</CardTitle>
              <Clock className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{stats.pending}</div>
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
        </div>

        <Card>
          <CardHeader>
            <CardTitle>Team Tasks</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {tasks?.map((task) => (
                <div
                  key={task.id}
                  className="flex items-center justify-between p-4 border rounded-lg hover:bg-muted/50 transition-colors"
                >
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
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <Badge className={getStatusColor(task.status)}>
                      {task.status.replace("_", " ")}
                    </Badge>
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
                  </div>
                </div>
              ))}
              {!tasks?.length && (
                <p className="text-center text-muted-foreground py-8">
                  No tasks assigned to your team yet
                </p>
              )}
            </div>
          </CardContent>
        </Card>
      </main>

      <Dialog open={!!selectedTask} onOpenChange={() => setSelectedTask(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Upload Design</DialogTitle>
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
                  setFiles(prev => [...prev, ...newFiles]);
                  e.target.value = ''; // Reset input to allow selecting same file again
                }}
                accept="image/*,.pdf,.ai,.psd,.fig,.sketch"
              />
              {files.length > 0 && (
                <div className="space-y-2">
                  <p className="text-sm font-medium text-muted-foreground">
                    {files.length} file(s) selected:
                  </p>
                  <div className="max-h-32 overflow-y-auto space-y-1">
                    {files.map((file, index) => (
                      <div key={index} className="flex items-center justify-between text-sm bg-muted/50 rounded px-2 py-1">
                        <span className="truncate flex-1">{file.name}</span>
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          className="h-6 w-6 p-0 ml-2"
                          onClick={() => setFiles(prev => prev.filter((_, i) => i !== index))}
                        >
                          ×
                        </Button>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
            <Button
              onClick={handleFileUpload}
              disabled={!files.length || uploading}
              className="w-full"
            >
              {uploading ? "Uploading..." : `Upload ${files.length || ""} Design${files.length !== 1 ? "s" : ""}`}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default DesignerDashboard;
