import { useState, useMemo } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { LogOut, Users, FolderKanban, CheckCircle2, Clock, FileText, Download, ChevronDown, ChevronUp, UserCog, UserPlus, Edit2, Shield, KeyRound, RefreshCw, History, Palette, Code, FileDown } from "lucide-react";
import { exportTasksToCSV, exportSalesPerformanceToCSV, exportUsersToCSV } from "@/utils/csvExport";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { FilePreview } from "@/components/FilePreview";
import { useProjectManagers } from "@/hooks/useProjectManagers";
import { format, startOfWeek, startOfMonth } from "date-fns";
import { z } from "zod";
import { Alert, AlertDescription } from "@/components/ui/alert";

// Password validation schema
const passwordSchema = z.string()
  .min(8, { message: "Password must be at least 8 characters" })
  .max(128, { message: "Password must be less than 128 characters" })
  .regex(/[A-Z]/, { message: "Must contain uppercase letter" })
  .regex(/[a-z]/, { message: "Must contain lowercase letter" })
  .regex(/[0-9]/, { message: "Must contain number" })
  .regex(/[^A-Za-z0-9]/, { message: "Must contain special character" });

const AdminDashboard = () => {
  const { signOut, user } = useAuth();
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
  
  const [viewDetailsTask, setViewDetailsTask] = useState<any>(null);
  const [expandedTaskId, setExpandedTaskId] = useState<string | null>(null);
  const [revisionDialog, setRevisionDialog] = useState<{ open: boolean; submissionId: string; fileName: string } | null>(null);
  const [revisionNotes, setRevisionNotes] = useState("");
  const [revisionFile, setRevisionFile] = useState<File | null>(null);
  const [uploadingRevision, setUploadingRevision] = useState(false);
  const [showUserManagement, setShowUserManagement] = useState(false);
  const [showAddUserDialog, setShowAddUserDialog] = useState(false);
  const [newUserData, setNewUserData] = useState({ 
    email: "", 
    password: "", 
    full_name: "", 
    team_name: "", 
    role: "designer" as "admin" | "project_manager" | "designer" | "developer" | "front_sales" 
  });
  const [passwordError, setPasswordError] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState<string | null>("priority");
  const [editTeamDialog, setEditTeamDialog] = useState<{ open: boolean; teamId: string; currentName: string } | null>(null);
  const [newTeamName, setNewTeamName] = useState("");
  const [viewMode, setViewMode] = useState<'tasks' | 'portfolio' | 'sales_performance'>('tasks');
  const [passwordResetDialog, setPasswordResetDialog] = useState<{ open: boolean; userId: string; userName: string } | null>(null);
  const [newPassword, setNewPassword] = useState("");
  const [newPasswordError, setNewPasswordError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [reassignDialog, setReassignDialog] = useState<{ open: boolean; taskId: string; taskTitle: string; currentPmId: string } | null>(null);
  const [reassignReason, setReassignReason] = useState("");
  const [selectedNewPmId, setSelectedNewPmId] = useState("");
  const [metricDetailsDialog, setMetricDetailsDialog] = useState<{
    open: boolean;
    userId: string;
    userName: string;
    metricType: 'target' | 'total_achieved' | 'transferred' | 'closed' | 'revenue' | 'pm_closed' | 'pm_upsells' | 'pm_total';
  } | null>(null);
  const [editTaskDialog, setEditTaskDialog] = useState<{ open: boolean; task: any } | null>(null);
  const [editTaskData, setEditTaskData] = useState({
    customer_name: "",
    customer_email: "",
    customer_phone: "",
    customer_domain: "",
    amount_total: "",
    amount_paid: "",
    amount_pending: "",
    deadline: "",
    business_name: "",
    business_email: "",
    business_phone: "",
  });

  // Helper function to filter tasks by metric type for a specific user
  const getFilteredTasksForMetric = (userId: string, metricType: string) => {
    if (!tasks) return [];
    
    switch (metricType) {
      case 'transferred':
        return tasks.filter(t => t.transferred_by === userId && !t.is_upsell);
      case 'closed':
        return tasks.filter(t => t.closed_by === userId && !t.is_upsell);
      case 'total_achieved':
        return tasks.filter(t => 
          (t.transferred_by === userId || t.closed_by === userId) && !t.is_upsell
        );
      case 'revenue':
        return tasks.filter(t => t.closed_by === userId && !t.is_upsell);
      case 'pm_closed':
        return tasks.filter(t => t.closed_by === userId && !t.is_upsell);
      case 'pm_upsells':
        return tasks.filter(t => t.closed_by === userId && t.is_upsell);
      case 'pm_total':
        return tasks.filter(t => t.closed_by === userId);
      default:
        return [];
    }
  };

  // Helper to get metric type display name
  const getMetricDisplayName = (metricType: string) => {
    switch (metricType) {
      case 'transferred': return 'Transferred Orders';
      case 'closed': return 'Closed Orders';
      case 'total_achieved': return 'Total Achieved Orders';
      case 'revenue': return 'Closed Revenue Orders';
      case 'pm_closed': return 'Closed Value Orders';
      case 'pm_upsells': return 'Upsell Orders';
      case 'pm_total': return 'Total Achieved Orders';
      default: return 'Orders';
    }
  };

  const { data: projectManagers = [] } = useProjectManagers();

  const { data: tasks } = useQuery({
    queryKey: ["admin-tasks"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("tasks")
        .select(`
          *,
          teams(name),
          profiles!tasks_project_manager_id_fkey(email, full_name)
        `)
        .order("created_at", { ascending: false });

      if (error) throw error;
      
      // Fetch creator, transferred_by, and closed_by profiles separately
      if (data && data.length > 0) {
        const userIds = new Set<string>();
        data.forEach(task => {
          if (task.created_by) userIds.add(task.created_by);
          if (task.transferred_by) userIds.add(task.transferred_by);
          if (task.closed_by) userIds.add(task.closed_by);
        });
        
        if (userIds.size > 0) {
          const { data: profiles } = await supabase
            .from("profiles")
            .select("id, email, full_name")
            .in("id", Array.from(userIds));
          
          const profileMap = new Map(profiles?.map(p => [p.id, p]) || []);
          
          return data.map(task => ({
            ...task,
            creator: task.created_by ? profileMap.get(task.created_by) : null,
            transferred_by_profile: task.transferred_by ? profileMap.get(task.transferred_by) : null,
            closed_by_profile: task.closed_by ? profileMap.get(task.closed_by) : null,
          }));
        }
      }
      
      return data;
    },
  });

  // Fetch developer profiles for website orders (team members with developer role)
  const { data: developerProfiles } = useQuery({
    queryKey: ["developer-profiles"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("team_members")
        .select(`
          team_id,
          user_id,
          profiles!team_members_user_id_fkey(id, full_name, email)
        `);
      if (error) throw error;
      return data;
    },
  });

  // Helper to get developer name for a team
  const getDeveloperForTeam = (teamId: string) => {
    const member = developerProfiles?.find(m => m.team_id === teamId);
    if (member?.profiles) {
      const profile = member.profiles as any;
      return profile.full_name || profile.email || "Unknown";
    }
    return null;
  };

  const { data: submissions } = useQuery({
    queryKey: ["admin-submissions"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("design_submissions")
        .select(`
          *,
          profiles!design_submissions_designer_id_fkey(email, full_name)
        `)
        .order("submitted_at", { ascending: false });
      
      if (error) throw error;
      return data;
    },
  });

  const { data: users } = useQuery({
    queryKey: ["admin-users"],
    queryFn: async () => {
      // Fetch profiles
      const { data: profiles, error: profilesError } = await supabase
        .from("profiles")
        .select("*");
      
      if (profilesError) throw profilesError;
      
      // Fetch user roles
      const { data: roles, error: rolesError } = await supabase
        .from("user_roles")
        .select("user_id, role");
      
      if (rolesError) throw rolesError;
      
      // Combine profiles with their roles
      return profiles?.map(profile => ({
        ...profile,
        user_roles: roles?.filter(r => r.user_id === profile.id) || []
      }));
    },
  });

  const { data: teams } = useQuery({
    queryKey: ["admin-teams"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("teams")
        .select("*")
        .order("name");
      
      if (error) throw error;
      return data;
    },
  });

  // Fetch front sales users with their tasks
  const { data: frontSalesUsers } = useQuery({
    queryKey: ["front-sales-users"],
    queryFn: async () => {
      // Get all front sales user IDs
      const { data: frontSalesRoles, error: rolesError } = await supabase
        .from("user_roles")
        .select("user_id")
        .eq("role", "front_sales");
      
      if (rolesError) throw rolesError;
      if (!frontSalesRoles?.length) return [];
      
      const salesUserIds = frontSalesRoles.map(r => r.user_id);
      
      // Get profiles for these users
      const { data: profiles, error: profilesError } = await supabase
        .from("profiles")
        .select("id, email, full_name")
        .in("id", salesUserIds);
      
      if (profilesError) throw profilesError;
      
      // Get all tasks created by front sales users
      const { data: salesTasks, error: tasksError } = await supabase
        .from("tasks")
        .select("*")
        .in("created_by", salesUserIds);
      
      if (tasksError) throw tasksError;
      
      // Combine profiles with their tasks
      return profiles?.map(profile => ({
        ...profile,
        tasks: salesTasks?.filter(t => t.created_by === profile.id) || []
      })) || [];
    },
  });

  // Fetch sales targets for all users
  const { data: salesTargets } = useQuery({
    queryKey: ["sales-targets"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("sales_targets")
        .select("*");
      if (error) throw error;
      return data;
    },
  });

  // Fetch PM users with their performance data
  const { data: pmUsers } = useQuery({
    queryKey: ["pm-users-performance"],
    queryFn: async () => {
      // Get all PM user IDs
      const { data: pmRoles, error: rolesError } = await supabase
        .from("user_roles")
        .select("user_id")
        .eq("role", "project_manager");
      
      if (rolesError) throw rolesError;
      if (!pmRoles?.length) return [];
      
      const pmUserIds = pmRoles.map(r => r.user_id);
      
      // Get profiles for these users
      const { data: profiles, error: profilesError } = await supabase
        .from("profiles")
        .select("id, email, full_name")
        .in("id", pmUserIds);
      
      if (profilesError) throw profilesError;
      
      // Get revenue data - tasks closed by each PM (non-upsell)
      const { data: closedTasks, error: closedError } = await supabase
        .from("tasks")
        .select("closed_by, amount_total")
        .in("closed_by", pmUserIds)
        .eq("is_upsell", false);
      
      if (closedError) throw closedError;
      
      // Group closed revenue by PM
      const closedRevenueByPm = new Map<string, number>();
      closedTasks?.forEach(task => {
        if (task.closed_by) {
          const current = closedRevenueByPm.get(task.closed_by) || 0;
          closedRevenueByPm.set(task.closed_by, current + (Number(task.amount_total) || 0));
        }
      });
      
      return profiles?.map(profile => ({
        ...profile,
        closedRevenue: closedRevenueByPm.get(profile.id) || 0,
      })) || [];
    },
  });

  // Fetch performance history
  const { data: performanceHistory } = useQuery({
    queryKey: ["performance-history"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("sales_performance_history")
        .select("*")
        .order("month_year", { ascending: false });
      if (error) throw error;
      return data;
    },
    enabled: viewMode === 'sales_performance',
  });

  // State for editing targets
  const [editTargetDialog, setEditTargetDialog] = useState<{ open: boolean; userId: string; userName: string; currentTarget: number } | null>(null);
  const [newTargetValue, setNewTargetValue] = useState("");
  const [editPmTargetDialog, setEditPmTargetDialog] = useState<{ open: boolean; userId: string; userName: string; currentTarget: number } | null>(null);
  const [newPmTargetValue, setNewPmTargetValue] = useState("");

  // Mutation to update sales target (for Front Sales)
  const updateSalesTarget = useMutation({
    mutationFn: async ({ userId, target }: { userId: string; target: number }) => {
      const { data: existing } = await supabase
        .from("sales_targets")
        .select("id")
        .eq("user_id", userId)
        .maybeSingle();
      
      if (existing) {
        const { error } = await supabase
          .from("sales_targets")
          .update({ monthly_order_target: target })
          .eq("user_id", userId);
        if (error) throw error;
      } else {
        const { error } = await supabase
          .from("sales_targets")
          .insert({ user_id: userId, monthly_order_target: target });
        if (error) throw error;
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["sales-targets"] });
      toast({ title: "Target updated successfully" });
      setEditTargetDialog(null);
      setNewTargetValue("");
    },
    onError: (error: any) => {
      toast({
        variant: "destructive",
        title: "Error updating target",
        description: error.message,
      });
    },
  });

  // Mutation to update PM dollar target
  const updatePmDollarTarget = useMutation({
    mutationFn: async ({ userId, target }: { userId: string; target: number }) => {
      const { data: existing } = await supabase
        .from("sales_targets")
        .select("id")
        .eq("user_id", userId)
        .maybeSingle();
      
      if (existing) {
        const { error } = await supabase
          .from("sales_targets")
          .update({ monthly_dollar_target: target })
          .eq("user_id", userId);
        if (error) throw error;
      } else {
        const { error } = await supabase
          .from("sales_targets")
          .insert({ user_id: userId, monthly_dollar_target: target });
        if (error) throw error;
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["sales-targets"] });
      queryClient.invalidateQueries({ queryKey: ["pm-users-performance"] });
      toast({ title: "PM target updated successfully" });
      setEditPmTargetDialog(null);
      setNewPmTargetValue("");
    },
    onError: (error: any) => {
      toast({
        variant: "destructive",
        title: "Error updating PM target",
        description: error.message,
      });
    },
  });

  const createUser = useMutation({
    mutationFn: async (userData: { 
      email: string; 
      password: string; 
      full_name: string; 
      team_name: string;
      role: "admin" | "project_manager" | "designer" | "developer" | "front_sales";
    }) => {
      // Validate password
      passwordSchema.parse(userData.password);
      
      const { data, error } = await supabase.auth.signUp({
        email: userData.email,
        password: userData.password,
        options: {
          data: {
            full_name: userData.full_name,
          },
        },
      });
      if (error) throw error;
      
      if (!data.user) throw new Error("User creation failed");
      
      // Update profile with team_name if provided
      if (userData.team_name) {
        const { error: profileError } = await supabase
          .from('profiles')
          .update({ team_name: userData.team_name })
          .eq('id', data.user.id);
        
        if (profileError) throw profileError;
      }
      
      // Assign role using admin function
      const { error: roleError } = await supabase.rpc('admin_set_user_role', {
        target_user_id: data.user.id,
        role_name: userData.role,
      });
      
      if (roleError) throw roleError;
      
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin-users"] });
      toast({ 
        title: "User created successfully",
        description: "The user can now sign in with their credentials."
      });
      setShowAddUserDialog(false);
      setNewUserData({ 
        email: "", 
        password: "", 
        full_name: "", 
        team_name: "", 
        role: "designer" 
      });
      setPasswordError(null);
    },
    onError: (error: any) => {
      if (error instanceof z.ZodError) {
        setPasswordError(error.errors[0].message);
      } else {
        toast({
          variant: "destructive",
          title: "Error creating user",
          description: error.message,
        });
      }
    },
  });

  const assignRole = useMutation({
    mutationFn: async ({ userId, role }: { userId: string; role: "admin" | "project_manager" | "designer" | "developer" | "front_sales" }) => {
      const { error } = await supabase.rpc('admin_set_user_role', {
        target_user_id: userId,
        role_name: role,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin-users"] });
      toast({ title: "Role assigned successfully" });
    },
    onError: (error: any) => {
      toast({
        variant: "destructive",
        title: "Error assigning role",
        description: error.message,
      });
    },
  });

  const updateTeamName = useMutation({
    mutationFn: async ({ teamId, newName }: { teamId: string; newName: string }) => {
      const { error } = await supabase
        .from("teams")
        .update({ name: newName })
        .eq("id", teamId);
      
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin-teams"] });
      queryClient.invalidateQueries({ queryKey: ["admin-tasks"] });
      toast({ title: "Team name updated successfully" });
      setEditTeamDialog(null);
      setNewTeamName("");
    },
    onError: (error: any) => {
      toast({
        variant: "destructive",
        title: "Error updating team name",
        description: error.message,
      });
    },
  });

  const setUserPassword = useMutation({
    mutationFn: async ({ userId, password }: { userId: string; password: string }) => {
      // Validate password
      passwordSchema.parse(password);

      const { data: { session } } = await supabase.auth.getSession();
      if (!session) throw new Error("Not authenticated");

      const response = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/reset-user-password`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "Authorization": `Bearer ${session.access_token}`,
          },
          body: JSON.stringify({ userId, newPassword: password }),
        }
      );

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || "Failed to set password");
      }

      return await response.json();
    },
    onSuccess: () => {
      toast({
        title: "Password Updated",
        description: "User password has been successfully updated",
      });
      setPasswordResetDialog(null);
      setNewPassword("");
      setNewPasswordError(null);
    },
    onError: (error: any) => {
      if (error instanceof z.ZodError) {
        setNewPasswordError(error.errors[0].message);
      } else {
        toast({
          variant: "destructive",
          title: "Error",
          description: error.message,
        });
      }
    },
  });

  const reassignTask = useMutation({
    mutationFn: async ({ taskId, newPmId, reason }: { taskId: string; newPmId: string; reason: string }) => {
      const { error } = await supabase
        .from("tasks")
        .update({ 
          reassigned_from: user!.id,
          project_manager_id: newPmId,
          reassignment_reason: reason,
          reassigned_at: new Date().toISOString(),
        })
        .eq("id", taskId);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin-tasks"] });
      toast({ title: "Task reassigned successfully" });
      setReassignDialog(null);
      setReassignReason("");
      setSelectedNewPmId("");
    },
    onError: (error: any) => {
      toast({
        variant: "destructive",
        title: "Error reassigning task",
        description: error.message,
      });
    },
  });

  const updateTask = useMutation({
    mutationFn: async (data: {
      taskId: string;
      customer_name?: string;
      customer_email?: string;
      customer_phone?: string;
      customer_domain?: string;
      amount_total?: number;
      amount_paid?: number;
      amount_pending?: number;
      deadline?: string | null;
      business_name?: string;
      business_email?: string;
      business_phone?: string;
    }) => {
      const { taskId, ...updateData } = data;
      const { error } = await supabase
        .from("tasks")
        .update(updateData)
        .eq("id", taskId);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin-tasks"] });
      toast({ title: "Task updated successfully" });
      setEditTaskDialog(null);
    },
    onError: (error: any) => {
      toast({
        variant: "destructive",
        title: "Error updating task",
        description: error.message,
      });
    },
  });

  const openEditTaskDialog = (task: any) => {
    setEditTaskData({
      customer_name: task.customer_name || "",
      customer_email: task.customer_email || "",
      customer_phone: task.customer_phone || "",
      customer_domain: task.customer_domain || "",
      amount_total: task.amount_total?.toString() || "",
      amount_paid: task.amount_paid?.toString() || "",
      amount_pending: task.amount_pending?.toString() || "",
      deadline: task.deadline || "",
      business_name: task.business_name || "",
      business_email: task.business_email || "",
      business_phone: task.business_phone || "",
    });
    setEditTaskDialog({ open: true, task });
  };

  const handleSaveTask = () => {
    if (!editTaskDialog?.task) return;
    updateTask.mutate({
      taskId: editTaskDialog.task.id,
      customer_name: editTaskData.customer_name || null,
      customer_email: editTaskData.customer_email || null,
      customer_phone: editTaskData.customer_phone || null,
      customer_domain: editTaskData.customer_domain || null,
      amount_total: editTaskData.amount_total ? parseFloat(editTaskData.amount_total) : 0,
      amount_paid: editTaskData.amount_paid ? parseFloat(editTaskData.amount_paid) : 0,
      amount_pending: editTaskData.amount_pending ? parseFloat(editTaskData.amount_pending) : 0,
      deadline: editTaskData.deadline || null,
      business_name: editTaskData.business_name || null,
      business_email: editTaskData.business_email || null,
      business_phone: editTaskData.business_phone || null,
    });
  };

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
      queryClient.invalidateQueries({ queryKey: ["admin-submissions"] });
      toast({ title: "Design approved successfully" });
    },
  });

  const handleRequestRevision = async () => {
    if (!revisionDialog || !revisionNotes.trim()) {
      toast({
        variant: "destructive",
        title: "Error",
        description: "Please provide revision notes",
      });
      return;
    }

    setUploadingRevision(true);
    try {
      let revisionFilePath = null;
      let revisionFileName = null;

      if (revisionFile) {
        const sanitizedFileName = revisionFile.name.replace(/[^a-zA-Z0-9._-]/g, "_");
        revisionFileName = `revision_reference_${Date.now()}_${sanitizedFileName}`;
        revisionFilePath = `revisions/${revisionFileName}`;

        const { error: uploadError } = await supabase.storage
          .from("design-files")
          .upload(revisionFilePath, revisionFile);

        if (uploadError) throw uploadError;
      }

      // Get submission details to find task
      const { data: submission } = await supabase
        .from("design_submissions")
        .select("task_id, tasks(title)")
        .eq("id", revisionDialog.submissionId)
        .single();

      const { error } = await supabase
        .from("design_submissions")
        .update({
          revision_status: "needs_revision",
          revision_notes: revisionNotes,
          revision_reference_file_path: revisionFilePath,
          revision_reference_file_name: revisionFileName,
          reviewed_at: new Date().toISOString(),
        })
        .eq("id", revisionDialog.submissionId);

      if (error) throw error;

      queryClient.invalidateQueries({ queryKey: ["admin-submissions"] });
      toast({ title: "Revision requested successfully" });

      // Send email notification to designers
      if (submission?.task_id) {
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
                  taskId: submission.task_id,
                  notificationType: "revision_requested",
                  taskTitle: (submission.tasks as any)?.title || "Task",
                  revisionNotes: revisionNotes,
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
      setRevisionFile(null);
    } catch (error: any) {
      toast({
        variant: "destructive",
        title: "Error requesting revision",
        description: error.message,
      });
    } finally {
      setUploadingRevision(false);
    }
  };

  const today = new Date();
  today.setHours(0, 0, 0, 0);

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

  const stats = {
    recently_delivered: tasks?.filter(t => 
      submissions?.some(s => s.task_id === t.id && s.revision_status === 'pending_review')
    ).length || 0,
    delayed: tasks?.filter(t => 
      t.deadline && new Date(t.deadline) < today && 
      !['completed', 'approved'].includes(t.status)
    ).length || 0,
    pending: tasks?.filter((t) => t.status === "pending").length || 0,
    in_progress: tasks?.filter((t) => t.status === "in_progress").length || 0,
    needs_revision: tasks?.filter(t =>
      submissions?.some(s => s.task_id === t.id && s.revision_status === 'needs_revision')
    ).length || 0,
    total: tasks?.length || 0,
    completed: tasks?.filter((t) => t.status === "completed").length || 0,
    approved: tasks?.filter((t) => t.status === "approved").length || 0,
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

  const isWebsiteOrder = (task: any) => {
    return task?.post_type === "Website Design";
  };

  const tasksByIndustry = useMemo(() => {
    const grouped: Record<string, any[]> = {};
    
    tasks?.forEach(task => {
      if (task.industry) {
        const hasDeliveredSubmissions = submissions?.some(
          s => s.task_id === task.id && ['approved', 'pending_review'].includes(s.revision_status || '')
        );
        
        if (hasDeliveredSubmissions) {
          if (!grouped[task.industry]) {
            grouped[task.industry] = [];
          }
          grouped[task.industry].push(task);
        }
      }
    });
    
    return grouped;
  }, [tasks, submissions]);

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
          <div>
            <h1 className="text-2xl font-bold text-foreground">Welcome, {profile?.full_name || 'Admin'}</h1>
            <p className="text-sm text-muted-foreground">Admin Dashboard</p>
          </div>
          <div className="flex gap-2">
            <Button 
              onClick={() => setShowUserManagement(!showUserManagement)} 
              variant="outline" 
              size="sm"
            >
              <UserCog className="mr-2 h-4 w-4" />
              {showUserManagement ? "View Tasks" : "Manage Users"}
            </Button>
            <Button onClick={signOut} variant="outline" size="sm">
              <LogOut className="mr-2 h-4 w-4" />
              Sign Out
            </Button>
          </div>
        </div>
      </header>

      <main className="container mx-auto px-4 py-8">
        {showUserManagement ? (
          <div className="space-y-6">
            {/* Teams Management Section */}
            <Card>
              <CardHeader>
                <CardTitle>Teams Management</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  {teams?.map((team) => (
                    <div key={team.id} className="flex items-center justify-between p-4 border rounded-lg">
                      <div className="space-y-1">
                        <p className="font-medium">{team.name}</p>
                        {team.description && (
                          <p className="text-sm text-muted-foreground">{team.description}</p>
                        )}
                      </div>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => {
                          setEditTeamDialog({ open: true, teamId: team.id, currentName: team.name });
                          setNewTeamName(team.name);
                        }}
                      >
                        <Edit2 className="h-3 w-3 mr-1" />
                        Edit Name
                      </Button>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <CardTitle>User Management</CardTitle>
              <div className="flex gap-2">
                <Button 
                  variant="outline" 
                  size="sm"
                  onClick={() => exportUsersToCSV(users || [], teams || [], developerProfiles || [])}
                >
                  <FileDown className="mr-2 h-4 w-4" />
                  Export Users
                </Button>
                <Button onClick={() => setShowAddUserDialog(true)} size="sm">
                  <UserPlus className="mr-2 h-4 w-4" />
                  Add User
                </Button>
              </div>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                {users?.map((user) => {
                  const currentRole = Array.isArray(user.user_roles) && user.user_roles.length > 0 
                    ? user.user_roles[0].role 
                    : null;
                  
                  return (
                    <div key={user.id} className="flex items-center justify-between p-4 border rounded-lg">
                      <div className="space-y-1">
                        <p className="font-medium">{user.full_name || "No name"}</p>
                        <p className="text-sm text-muted-foreground">{user.email}</p>
                        {currentRole && <Badge variant="outline">{currentRole}</Badge>}
                        {!currentRole && <Badge variant="outline">No role assigned</Badge>}
                      </div>
                      <div className="flex gap-2">
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => setPasswordResetDialog({ 
                            open: true, 
                            userId: user.id, 
                            userName: user.full_name || user.email 
                          })}
                        >
                          <KeyRound className="h-3 w-3 mr-1" />
                          Set Password
                        </Button>
                        <Select
                          value={currentRole || undefined}
                          onValueChange={(role: "admin" | "project_manager" | "designer" | "developer") => 
                            assignRole.mutate({ userId: user.id, role })
                          }
                        >
                          <SelectTrigger className="w-[180px]">
                            <SelectValue placeholder="Assign role" />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="designer">Designer</SelectItem>
                            <SelectItem value="developer">Developer</SelectItem>
                            <SelectItem value="project_manager">Project Manager</SelectItem>
                            <SelectItem value="front_sales">Front Sales</SelectItem>
                            <SelectItem value="admin">Admin</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                    </div>
                  );
                })}
              </div>
            </CardContent>
          </Card>
          </div>
        ) : (
          <>
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
          <div className="flex gap-2">
            <Button
              variant={viewMode === 'tasks' ? 'default' : 'outline'}
              onClick={() => setViewMode('tasks')}
            >
              Tasks View
            </Button>
            <Button
              variant={viewMode === 'portfolio' ? 'default' : 'outline'}
              onClick={() => setViewMode('portfolio')}
            >
              Industry Portfolio
            </Button>
            <Button
              variant={viewMode === 'sales_performance' ? 'default' : 'outline'}
              onClick={() => setViewMode('sales_performance')}
            >
              Sales Performance
            </Button>
          </div>
          {viewMode === 'tasks' && (
            <div className="flex gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => exportTasksToCSV(tasks || [], submissions || [])}
              >
                <FileDown className="h-4 w-4 mr-1" />
                Export Tasks
              </Button>
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
          )}
          </div>
        
        {viewMode === 'tasks' && (
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
        )}

        {viewMode === 'tasks' && (
        <Card>
          <CardHeader>
            <CardTitle>All Tasks</CardTitle>
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
                        <div className="text-sm text-muted-foreground mb-1">
                          Created: <span className="font-medium">{format(new Date(task.created_at), 'MMM d, yyyy h:mm a')}</span>
                        </div>
                        <div className="flex items-center gap-3 text-sm">
                          <span className="text-muted-foreground">
                            {isWebsiteOrder(task) ? (
                              <>Developer: <span className="font-medium">{getDeveloperForTeam(task.team_id) || task.teams?.name}</span></>
                            ) : (
                              <>Team: <span className="font-medium">{task.teams?.name}</span></>
                            )}
                          </span>
                          {task.profiles && (
                            <span className="text-muted-foreground">
                              • PM: <span className="font-medium">{task.profiles.full_name || task.profiles.email}</span>
                            </span>
                          )}
                          {taskSubmissions.length > 0 && (
                            <span className="text-primary">
                              • {taskSubmissions.length} submission(s)
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
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => openEditTaskDialog(task)}
                          >
                            <Edit2 className="h-3 w-3 mr-1" />
                            Edit
                          </Button>
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => setReassignDialog({ 
                              open: true, 
                              taskId: task.id, 
                              taskTitle: task.title,
                              currentPmId: task.project_manager_id 
                            })}
                          >
                            <RefreshCw className="h-3 w-3 mr-1" />
                            Reassign PM
                          </Button>
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        {getCategoryBadge()}
                        <Badge className={getStatusColor(task.status)}>
                          {task.status.replace("_", " ")}
                        </Badge>
                        {task.status === "pending" && (task as any).accepted_by_pm && (
                          <Badge className="bg-green-100 text-green-700 border-green-300">
                            <CheckCircle2 className="h-3 w-3 mr-1" />
                            PM Accepted
                          </Badge>
                        )}
                        {task.status === "pending" && !(task as any).accepted_by_pm && (
                          <Badge variant="outline" className="text-yellow-600 border-yellow-400">
                            <Clock className="h-3 w-3 mr-1" />
                            Awaiting PM
                          </Badge>
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
                      </div>
                    </div>
                    
                    {isExpanded && taskSubmissions.length > 0 && (
                      <div className="border-t bg-muted/20 p-4">
                        <h4 className="text-sm font-semibold mb-3">Design Submissions:</h4>
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
                                  Designer: <span className="font-medium">{submission.profiles?.full_name || submission.profiles?.email}</span>
                                </p>
                                 <p className="text-xs text-muted-foreground">
                                   Delivered: {submission.submitted_at ? format(new Date(submission.submitted_at), 'MMM d, yyyy h:mm a') : 'N/A'}
                                 </p>
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
                                     <p className="text-muted-foreground mt-1">{submission.revision_notes}</p>
                                   </div>
                                 )}
                              </div>
                              <div className="flex gap-2">
                                <Button
                                  size="sm"
                                  variant="outline"
                                  onClick={() => handleDownload(submission.file_path, submission.file_name)}
                                >
                                  <Download className="h-4 w-4" />
                                </Button>
                                {submission.revision_status !== "approved" && (
                                  <>
                                    <Button
                                      size="sm"
                                      variant="default"
                                      onClick={() => handleApproveSubmission.mutate(submission.id)}
                                    >
                                      Approve
                                    </Button>
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
                                  </>
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
                  No tasks available
                </p>
              )}
            </div>
          </CardContent>
        </Card>
        )}

        {viewMode === 'portfolio' && (
          <Card>
            <CardHeader>
              <CardTitle>Industry Portfolio - Delivered Logo Designs</CardTitle>
            </CardHeader>
            <CardContent>
              {Object.keys(tasksByIndustry).length === 0 ? (
                <p className="text-center text-muted-foreground py-8">
                  No delivered logo designs available
                </p>
              ) : (
                <Accordion type="single" collapsible className="w-full">
                  {Object.entries(tasksByIndustry)
                    .sort(([a], [b]) => a.localeCompare(b))
                    .map(([industry, industryTasks]) => {
                      const deliveredCount = industryTasks.length;
                      
                      return (
                        <AccordionItem key={industry} value={industry}>
                          <AccordionTrigger className="text-left">
                            <div className="flex items-center justify-between w-full pr-4">
                              <span className="font-semibold text-lg">{industry}</span>
                              <Badge variant="secondary">{deliveredCount} design{deliveredCount !== 1 ? 's' : ''}</Badge>
                            </div>
                          </AccordionTrigger>
                          <AccordionContent>
                            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3 pt-4">
                              {industryTasks.map((task) => {
                                const approvedSubmissions = submissions?.filter(
                                  s => s.task_id === task.id && ['approved', 'pending_review'].includes(s.revision_status || '')
                                );
                                
                                return approvedSubmissions?.map((submission) => (
                                  <Card key={submission.id} className="overflow-hidden">
                                    <CardContent className="p-4 space-y-3">
                                      <FilePreview 
                                        filePath={submission.file_path}
                                        fileName={submission.file_name}
                                        className="w-full h-48"
                                      />
                                      
                                      <div className="space-y-2">
                                        <div>
                                          <p className="text-xs text-muted-foreground">Business Name</p>
                                          <p className="font-semibold">{task.business_name || 'N/A'}</p>
                                        </div>
                                        
                                        <div>
                                          <p className="text-xs text-muted-foreground">Order Title</p>
                                          <p className="text-sm font-medium">{task.title}</p>
                                        </div>
                                        
                                        <div>
                                          <p className="text-xs text-muted-foreground">Designer</p>
                                          <p className="text-sm">{submission.profiles?.full_name || submission.profiles?.email}</p>
                                        </div>
                                        
                                        <div>
                                          <p className="text-xs text-muted-foreground">Delivered</p>
                                          <p className="text-sm">
                                            {submission.submitted_at ? format(new Date(submission.submitted_at), 'MMM d, yyyy') : 'N/A'}
                                          </p>
                                        </div>
                                        
                                        <div className="flex items-center gap-2">
                                          <Badge 
                                            variant={submission.revision_status === 'approved' ? 'default' : 'secondary'}
                                            className="text-xs"
                                          >
                                            {submission.revision_status?.replace('_', ' ')}
                                          </Badge>
                                        </div>
                                        
                                        <Button
                                          size="sm"
                                          variant="outline"
                                          className="w-full"
                                          onClick={() => handleDownload(submission.file_path, submission.file_name)}
                                        >
                                          <Download className="h-3 w-3 mr-2" />
                                          Download
                                        </Button>
                                      </div>
                                    </CardContent>
                                  </Card>
                                ));
                              })}
                            </div>
                          </AccordionContent>
                        </AccordionItem>
                      );
                    })}
                </Accordion>
              )}
            </CardContent>
          </Card>
        )}

        {viewMode === 'sales_performance' && (
          <>
          <div className="flex justify-end mb-4">
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                const designerDeveloperUsers = users?.filter(u => 
                  u.user_roles?.some((r: any) => r.role === 'designer' || r.role === 'developer')
                ) || [];
                exportSalesPerformanceToCSV(
                  frontSalesUsers || [],
                  pmUsers || [],
                  salesTargets || [],
                  designerDeveloperUsers,
                  submissions || []
                );
              }}
            >
              <FileDown className="h-4 w-4 mr-1" />
              Export All Performance Data
            </Button>
          </div>
          <Card>
            <CardHeader>
              <CardTitle>Front Sales Performance</CardTitle>
            </CardHeader>
            <CardContent>
              {!frontSalesUsers?.length ? (
                <p className="text-center text-muted-foreground py-8">
                  No front sales users found
                </p>
              ) : (
                <div className="space-y-6">
                  {frontSalesUsers.map((salesUser) => {
                    // Get target and attributed metrics for this user from sales_targets
                    const userTarget = salesTargets?.find(t => t.user_id === salesUser.id);
                    const monthlyTarget = userTarget?.monthly_order_target ?? 10;
                    const transferredCount = userTarget?.transferred_orders_count ?? 0;
                    const closedCount = userTarget?.closed_orders_count ?? 0;
                    const closedRevenue = Number(userTarget?.closed_revenue ?? 0);
                    const totalAchieved = transferredCount + closedCount;
                    const targetProgress = monthlyTarget > 0 ? Math.min((totalAchieved / monthlyTarget) * 100, 100) : 0;
                    
                    return (
                      <Card key={salesUser.id} className="border-l-4 border-l-primary">
                        <CardHeader className="pb-2">
                          <div className="flex items-center justify-between">
                            <CardTitle className="text-lg flex items-center gap-2">
                              <Users className="h-5 w-5 text-primary" />
                              {salesUser.full_name || salesUser.email}
                            </CardTitle>
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => {
                                setEditTargetDialog({
                                  open: true,
                                  userId: salesUser.id,
                                  userName: salesUser.full_name || salesUser.email,
                                  currentTarget: monthlyTarget,
                                });
                                setNewTargetValue(monthlyTarget.toString());
                              }}
                            >
                              <Edit2 className="h-4 w-4 mr-1" />
                              Edit Target
                            </Button>
                          </div>
                        </CardHeader>
                        <CardContent>
                          <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
                            <div 
                              className="space-y-1 cursor-pointer hover:bg-muted/50 rounded-lg p-2 -m-2 transition-colors"
                              onClick={() => {
                                setEditTargetDialog({
                                  open: true,
                                  userId: salesUser.id,
                                  userName: salesUser.full_name || salesUser.email,
                                  currentTarget: monthlyTarget,
                                });
                                setNewTargetValue(monthlyTarget.toString());
                              }}
                            >
                              <p className="text-sm text-muted-foreground">Monthly Target</p>
                              <p className="text-2xl font-bold text-primary">{monthlyTarget}</p>
                            </div>
                            <div 
                              className="space-y-1 cursor-pointer hover:bg-muted/50 rounded-lg p-2 -m-2 transition-colors"
                              onClick={() => setMetricDetailsDialog({
                                open: true,
                                userId: salesUser.id,
                                userName: salesUser.full_name || salesUser.email,
                                metricType: 'total_achieved',
                              })}
                            >
                              <p className="text-sm text-muted-foreground">Total Achieved</p>
                              <p className="text-2xl font-bold">{totalAchieved}</p>
                              <div className="h-1.5 bg-muted rounded-full overflow-hidden">
                                <div 
                                  className="h-full bg-primary transition-all" 
                                  style={{ width: `${targetProgress}%` }}
                                />
                              </div>
                            </div>
                            <div 
                              className="space-y-1 cursor-pointer hover:bg-muted/50 rounded-lg p-2 -m-2 transition-colors"
                              onClick={() => setMetricDetailsDialog({
                                open: true,
                                userId: salesUser.id,
                                userName: salesUser.full_name || salesUser.email,
                                metricType: 'transferred',
                              })}
                            >
                              <p className="text-sm text-muted-foreground">Transferred</p>
                              <p className="text-2xl font-bold text-orange-500">{transferredCount}</p>
                            </div>
                            <div 
                              className="space-y-1 cursor-pointer hover:bg-muted/50 rounded-lg p-2 -m-2 transition-colors"
                              onClick={() => setMetricDetailsDialog({
                                open: true,
                                userId: salesUser.id,
                                userName: salesUser.full_name || salesUser.email,
                                metricType: 'closed',
                              })}
                            >
                              <p className="text-sm text-muted-foreground">Closed</p>
                              <p className="text-2xl font-bold text-emerald-500">{closedCount}</p>
                            </div>
                            <div 
                              className="space-y-1 cursor-pointer hover:bg-muted/50 rounded-lg p-2 -m-2 transition-colors"
                              onClick={() => setMetricDetailsDialog({
                                open: true,
                                userId: salesUser.id,
                                userName: salesUser.full_name || salesUser.email,
                                metricType: 'revenue',
                              })}
                            >
                              <p className="text-sm text-muted-foreground">Closed Revenue</p>
                              <p className="text-2xl font-bold text-green-600">${closedRevenue.toLocaleString()}</p>
                            </div>
                          </div>
                        </CardContent>
                      </Card>
                    );
                  })}
                </div>
              )}
            </CardContent>
          </Card>

          {/* PM Performance Section */}
          <Card className="mt-6">
            <CardHeader>
              <CardTitle>Project Manager Performance</CardTitle>
            </CardHeader>
            <CardContent>
              {!pmUsers?.length ? (
                <p className="text-center text-muted-foreground py-8">
                  No project managers found
                </p>
              ) : (
                <div className="space-y-6">
                  {pmUsers.map((pmUser) => {
                    const userTarget = salesTargets?.find(t => t.user_id === pmUser.id);
                    const dollarTarget = userTarget?.monthly_dollar_target ?? 0;
                    const upsellRevenue = Number(userTarget?.upsell_revenue || 0);
                    const totalAchieved = pmUser.closedRevenue + upsellRevenue;
                    const targetProgress = dollarTarget > 0 ? Math.min((totalAchieved / dollarTarget) * 100, 100) : 0;
                    
                    return (
                      <Card key={pmUser.id} className="border-l-4 border-l-secondary">
                        <CardHeader className="pb-2">
                          <div className="flex items-center justify-between">
                            <CardTitle className="text-lg flex items-center gap-2">
                              <Users className="h-5 w-5 text-secondary" />
                              {pmUser.full_name || pmUser.email}
                            </CardTitle>
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => {
                                setEditPmTargetDialog({
                                  open: true,
                                  userId: pmUser.id,
                                  userName: pmUser.full_name || pmUser.email,
                                  currentTarget: dollarTarget,
                                });
                                setNewPmTargetValue(dollarTarget.toString());
                              }}
                            >
                              <Edit2 className="h-4 w-4 mr-1" />
                              Edit Target
                            </Button>
                          </div>
                        </CardHeader>
                        <CardContent>
                          <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
                            <div 
                              className="space-y-1 cursor-pointer hover:bg-muted/50 rounded-lg p-2 -m-2 transition-colors"
                              onClick={() => {
                                setEditPmTargetDialog({
                                  open: true,
                                  userId: pmUser.id,
                                  userName: pmUser.full_name || pmUser.email,
                                  currentTarget: dollarTarget,
                                });
                                setNewPmTargetValue(dollarTarget.toString());
                              }}
                            >
                              <p className="text-sm text-muted-foreground">Monthly Target</p>
                              <p className="text-2xl font-bold text-secondary">${dollarTarget.toLocaleString()}</p>
                            </div>
                            <div 
                              className="space-y-1 cursor-pointer hover:bg-muted/50 rounded-lg p-2 -m-2 transition-colors"
                              onClick={() => setMetricDetailsDialog({
                                open: true,
                                userId: pmUser.id,
                                userName: pmUser.full_name || pmUser.email,
                                metricType: 'pm_closed',
                              })}
                            >
                              <p className="text-sm text-muted-foreground">Closed Value</p>
                              <p className="text-2xl font-bold">${pmUser.closedRevenue.toLocaleString()}</p>
                            </div>
                            <div 
                              className="space-y-1 cursor-pointer hover:bg-muted/50 rounded-lg p-2 -m-2 transition-colors"
                              onClick={() => setMetricDetailsDialog({
                                open: true,
                                userId: pmUser.id,
                                userName: pmUser.full_name || pmUser.email,
                                metricType: 'pm_upsells',
                              })}
                            >
                              <p className="text-sm text-muted-foreground">Upsells</p>
                              <p className="text-2xl font-bold">${upsellRevenue.toLocaleString()}</p>
                            </div>
                            <div 
                              className="space-y-1 cursor-pointer hover:bg-muted/50 rounded-lg p-2 -m-2 transition-colors"
                              onClick={() => setMetricDetailsDialog({
                                open: true,
                                userId: pmUser.id,
                                userName: pmUser.full_name || pmUser.email,
                                metricType: 'pm_total',
                              })}
                            >
                              <p className="text-sm text-muted-foreground">Total Achieved</p>
                              <p className="text-2xl font-bold text-primary">${totalAchieved.toLocaleString()}</p>
                              {dollarTarget > 0 && (
                                <div className="h-1.5 bg-muted rounded-full overflow-hidden">
                                  <div 
                                    className="h-full bg-primary transition-all" 
                                    style={{ width: `${targetProgress}%` }}
                                  />
                                </div>
                              )}
                            </div>
                            <div className="space-y-1">
                              <p className="text-sm text-muted-foreground">Progress</p>
                              <p className="text-2xl font-bold">{dollarTarget > 0 ? `${targetProgress.toFixed(0)}%` : 'No Target'}</p>
                            </div>
                          </div>
                        </CardContent>
                      </Card>
                    );
                  })}
                </div>
              )}
            </CardContent>
          </Card>

          {/* Designer/Developer Performance Section */}
          <Card className="mt-6">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Palette className="h-5 w-5" />
                Designer & Developer Performance
              </CardTitle>
            </CardHeader>
            <CardContent>
              {(() => {
                // Get designers and developers
                const designerDeveloperUsers = users?.filter(u => 
                  u.user_roles?.some((r: any) => r.role === 'designer' || r.role === 'developer')
                ) || [];
                
                if (!designerDeveloperUsers.length) {
                  return (
                    <p className="text-center text-muted-foreground py-8">
                      No designers or developers found
                    </p>
                  );
                }
                
                return (
                  <div className="space-y-4">
                    {designerDeveloperUsers.map((user) => {
                      const userRole = user.user_roles?.[0]?.role;
                      const userSubmissions = submissions?.filter(s => s.designer_id === user.id) || [];
                      const totalSubmissions = userSubmissions.length;
                      const approvedSubmissions = userSubmissions.filter(s => s.revision_status === 'approved').length;
                      const revisionsNeeded = userSubmissions.filter(s => s.revision_status === 'needs_revision').length;
                      const pendingReview = userSubmissions.filter(s => s.revision_status === 'pending_review').length;
                      const approvalRate = totalSubmissions > 0 
                        ? ((approvedSubmissions / totalSubmissions) * 100).toFixed(1) 
                        : '0';
                      
                      return (
                        <Card key={user.id} className={`border-l-4 ${userRole === 'designer' ? 'border-l-purple-500' : 'border-l-blue-500'}`}>
                          <CardHeader className="pb-2">
                            <div className="flex items-center justify-between">
                              <CardTitle className="text-lg flex items-center gap-2">
                                {userRole === 'designer' ? (
                                  <Palette className="h-5 w-5 text-purple-500" />
                                ) : (
                                  <Code className="h-5 w-5 text-blue-500" />
                                )}
                                {user.full_name || user.email}
                              </CardTitle>
                              <Badge variant="outline" className={userRole === 'designer' ? 'border-purple-500 text-purple-600' : 'border-blue-500 text-blue-600'}>
                                {userRole === 'designer' ? 'Designer' : 'Developer'}
                              </Badge>
                            </div>
                          </CardHeader>
                          <CardContent>
                            <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
                              <div className="space-y-1">
                                <p className="text-sm text-muted-foreground">Total Submissions</p>
                                <p className="text-2xl font-bold">{totalSubmissions}</p>
                              </div>
                              <div className="space-y-1">
                                <p className="text-sm text-muted-foreground">Approved</p>
                                <p className="text-2xl font-bold text-green-600">{approvedSubmissions}</p>
                              </div>
                              <div className="space-y-1">
                                <p className="text-sm text-muted-foreground">Needs Revision</p>
                                <p className="text-2xl font-bold text-orange-500">{revisionsNeeded}</p>
                              </div>
                              <div className="space-y-1">
                                <p className="text-sm text-muted-foreground">Pending Review</p>
                                <p className="text-2xl font-bold text-yellow-500">{pendingReview}</p>
                              </div>
                              <div className="space-y-1">
                                <p className="text-sm text-muted-foreground">Approval Rate</p>
                                <p className={`text-2xl font-bold ${Number(approvalRate) >= 80 ? 'text-green-600' : Number(approvalRate) >= 50 ? 'text-yellow-600' : 'text-red-500'}`}>
                                  {approvalRate}%
                                </p>
                                <div className="h-1.5 bg-muted rounded-full overflow-hidden">
                                  <div 
                                    className={`h-full transition-all ${Number(approvalRate) >= 80 ? 'bg-green-500' : Number(approvalRate) >= 50 ? 'bg-yellow-500' : 'bg-red-500'}`}
                                    style={{ width: `${approvalRate}%` }}
                                  />
                                </div>
                              </div>
                            </div>
                          </CardContent>
                        </Card>
                      );
                    })}
                  </div>
                );
              })()}
            </CardContent>
          </Card>

          {/* Performance History Section */}
          <Card className="mt-6">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <History className="h-5 w-5" />
                Performance History
              </CardTitle>
            </CardHeader>
            <CardContent>
              {!performanceHistory?.length ? (
                <p className="text-center text-muted-foreground py-8">
                  No historical data yet. Data will be archived at the start of each month.
                </p>
              ) : (
                <div className="space-y-4">
                  {Array.from(new Set(performanceHistory.map(h => h.month_year))).map(monthYear => {
                    const monthRecords = performanceHistory.filter(h => h.month_year === monthYear);
                    const formattedMonth = new Date(monthYear + 'T00:00:00').toLocaleDateString('en-US', { 
                      month: 'long', 
                      year: 'numeric' 
                    });
                    
                    return (
                      <Accordion key={monthYear} type="single" collapsible className="border rounded-lg">
                        <AccordionItem value={monthYear} className="border-0">
                          <AccordionTrigger className="px-4 hover:no-underline">
                            <div className="flex items-center gap-4">
                              <span className="font-semibold">{formattedMonth}</span>
                              <Badge variant="outline">{monthRecords.length} users</Badge>
                              <span className="text-sm text-muted-foreground">
                                Total: ${monthRecords.reduce((sum, r) => sum + Number(r.upsell_revenue || 0), 0).toLocaleString()} upsells
                              </span>
                            </div>
                          </AccordionTrigger>
                          <AccordionContent className="px-4 pb-4">
                            <div className="overflow-x-auto">
                              <table className="w-full text-sm">
                                <thead>
                                  <tr className="border-b">
                                    <th className="text-left py-2 font-medium">User</th>
                                    <th className="text-right py-2 font-medium">Transferred</th>
                                    <th className="text-right py-2 font-medium">Closed</th>
                                    <th className="text-right py-2 font-medium">Upsell Revenue</th>
                                    <th className="text-right py-2 font-medium">Target</th>
                                  </tr>
                                </thead>
                                <tbody>
                                  {monthRecords.map(record => {
                                    const userProfile = users?.find(u => u.id === record.user_id);
                                    return (
                                      <tr key={record.id} className="border-b last:border-0">
                                        <td className="py-2">{userProfile?.full_name || userProfile?.email || 'Unknown User'}</td>
                                        <td className="text-right py-2">{record.transferred_orders_count}</td>
                                        <td className="text-right py-2">{record.closed_orders_count}</td>
                                        <td className="text-right py-2 text-green-600">${Number(record.upsell_revenue || 0).toLocaleString()}</td>
                                        <td className="text-right py-2">${Number(record.monthly_dollar_target || 0).toLocaleString()}</td>
                                      </tr>
                                    );
                                  })}
                                </tbody>
                              </table>
                            </div>
                          </AccordionContent>
                        </AccordionItem>
                      </Accordion>
                    );
                  })}
                </div>
              )}
            </CardContent>
          </Card>
          </>
        )}
        </>
        )}
      </main>

      <Dialog open={!!viewDetailsTask} onOpenChange={() => setViewDetailsTask(null)}>
        <DialogContent className="max-w-2xl">
          <DialogHeader className="flex flex-row items-center justify-between">
            <DialogTitle>Task Details - #{viewDetailsTask?.task_number}</DialogTitle>
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                openEditTaskDialog(viewDetailsTask);
                setViewDetailsTask(null);
              }}
            >
              <Edit2 className="h-4 w-4 mr-1" />
              Edit Task
            </Button>
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
                  <div>
                    <Label className="text-muted-foreground">Customer Domain</Label>
                    <p className="font-medium text-primary break-all">{viewDetailsTask?.customer_domain || "N/A"}</p>
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
                    <Label className="text-muted-foreground">
                      {isWebsiteOrder(viewDetailsTask) ? "Assigned Developer" : "Team"}
                    </Label>
                    <p className="font-medium">
                      {isWebsiteOrder(viewDetailsTask) 
                        ? (getDeveloperForTeam(viewDetailsTask?.team_id) || viewDetailsTask?.teams?.name)
                        : viewDetailsTask?.teams?.name}
                    </p>
                  </div>
                  <div>
                    <Label className="text-muted-foreground">Project Manager</Label>
                    <p className="font-medium">{viewDetailsTask?.profiles?.full_name || viewDetailsTask?.profiles?.email || "N/A"}</p>
                  </div>
                </div>
              </div>

              {/* Order Attribution */}
              <div className="space-y-3">
                <h3 className="font-semibold text-lg border-b pb-2">Order Attribution</h3>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <Label className="text-muted-foreground">Transferred By</Label>
                    <p className="font-medium">{(viewDetailsTask as any)?.transferred_by_profile?.full_name || (viewDetailsTask as any)?.transferred_by_profile?.email || "—"}</p>
                  </div>
                  <div>
                    <Label className="text-muted-foreground">Closed By</Label>
                    <p className="font-medium">{(viewDetailsTask as any)?.closed_by_profile?.full_name || (viewDetailsTask as any)?.closed_by_profile?.email || "N/A"}</p>
                  </div>
                </div>
                <p className="text-xs text-muted-foreground mt-2">
                  Created by: {(viewDetailsTask as any)?.creator?.full_name || (viewDetailsTask as any)?.creator?.email || "N/A"}
                </p>
              </div>

              {/* Website Details - Only for Website Orders */}
              {isWebsiteOrder(viewDetailsTask) && (
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
                      <Label className="text-muted-foreground">Domain & Hosting</Label>
                      <p className="font-medium">{viewDetailsTask?.domain_hosting_status || "N/A"}</p>
                    </div>
                    <div>
                      <Label className="text-muted-foreground">Content Provided</Label>
                      <p className="font-medium">{viewDetailsTask?.content_provided ? "Yes" : "No"}</p>
                    </div>
                    <div>
                      <Label className="text-muted-foreground">Timeline</Label>
                      <p className="font-medium">{viewDetailsTask?.website_deadline_type || "N/A"}</p>
                    </div>
                    <div>
                      <Label className="text-muted-foreground">Design Style</Label>
                      <p className="font-medium">{viewDetailsTask?.design_style || "N/A"}</p>
                    </div>
                  </div>
                  <div>
                    <Label className="text-muted-foreground">Website Features</Label>
                    <p className="font-medium">{viewDetailsTask?.website_features || "N/A"}</p>
                  </div>
                  <div>
                    <Label className="text-muted-foreground">Design References</Label>
                    <p className="font-medium">{viewDetailsTask?.design_references || "N/A"}</p>
                  </div>
                </div>
              )}

              {/* Post Details - Only for Social Media Posts */}
              {!isLogoOrder(viewDetailsTask) && !isWebsiteOrder(viewDetailsTask) && (
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

      <Dialog open={revisionDialog?.open || false} onOpenChange={(open) => !open && setRevisionDialog(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Request Revision - {revisionDialog?.fileName}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label>Revision Notes (Required)</Label>
              <Textarea
                value={revisionNotes}
                onChange={(e) => setRevisionNotes(e.target.value)}
                placeholder="Explain what needs to be changed..."
                className="mt-2"
                rows={4}
              />
            </div>
            <div>
              <Label>Reference File (Optional)</Label>
              <Input
                type="file"
                onChange={(e) => setRevisionFile(e.target.files?.[0] || null)}
                className="mt-2"
              />
              <p className="text-xs text-muted-foreground mt-1">
                Upload a reference file to help the designer understand the changes
              </p>
            </div>
            <Button
              onClick={handleRequestRevision}
              disabled={uploadingRevision || !revisionNotes.trim()}
              className="w-full"
            >
              {uploadingRevision ? "Uploading..." : "Submit Revision Request"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Add User Dialog */}
      <Dialog open={showAddUserDialog} onOpenChange={setShowAddUserDialog}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Shield className="h-5 w-5 text-primary" />
              Add New User
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <Alert>
              <Shield className="h-4 w-4" />
              <AlertDescription className="text-xs">
                Password must be 8+ characters with uppercase, lowercase, number, and special character.
              </AlertDescription>
            </Alert>
            
            <div className="space-y-2">
              <Label htmlFor="new-user-role">Role *</Label>
              <Select
                value={newUserData.role}
                onValueChange={(value: "admin" | "project_manager" | "designer" | "developer") => 
                  setNewUserData({ ...newUserData, role: value })
                }
              >
                <SelectTrigger id="new-user-role">
                  <SelectValue placeholder="Select role" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="designer">Designer</SelectItem>
                  <SelectItem value="developer">Developer</SelectItem>
                  <SelectItem value="project_manager">Project Manager</SelectItem>
                  <SelectItem value="front_sales">Front Sales</SelectItem>
                  <SelectItem value="admin">Admin</SelectItem>
                </SelectContent>
              </Select>
            </div>
            
            <div className="space-y-2">
              <Label htmlFor="new-user-email">Email *</Label>
              <Input
                id="new-user-email"
                type="email"
                placeholder="user@example.com"
                value={newUserData.email}
                onChange={(e) => setNewUserData({ ...newUserData, email: e.target.value })}
                required
              />
            </div>
            
            <div className="space-y-2">
              <Label htmlFor="new-user-password">Password *</Label>
              <Input
                id="new-user-password"
                type="password"
                placeholder="••••••••"
                value={newUserData.password}
                onChange={(e) => {
                  setNewUserData({ ...newUserData, password: e.target.value });
                  setPasswordError(null);
                }}
                className={passwordError ? "border-destructive" : ""}
                required
              />
              {passwordError && (
                <p className="text-sm text-destructive">{passwordError}</p>
              )}
            </div>
            
            <div className="space-y-2">
              <Label htmlFor="new-user-name">Full Name</Label>
              <Input
                id="new-user-name"
                type="text"
                placeholder="John Doe"
                value={newUserData.full_name}
                onChange={(e) => setNewUserData({ ...newUserData, full_name: e.target.value })}
              />
            </div>
            
            {(newUserData.role === "designer" || newUserData.role === "developer") && (
              <div className="space-y-2">
                <Label htmlFor="new-user-team-name">Team Name</Label>
                <Input
                  id="new-user-team-name"
                  type="text"
                  placeholder={newUserData.role === "developer" ? "e.g., Web Dev Team A" : "e.g., Logo Team A"}
                  value={newUserData.team_name}
                  onChange={(e) => setNewUserData({ ...newUserData, team_name: e.target.value })}
                />
                <p className="text-xs text-muted-foreground">
                  Team name shown to project managers when assigning tasks
                </p>
              </div>
            )}
          </div>
          
          <div className="flex justify-end gap-2">
            <Button
              variant="outline"
              onClick={() => {
                setShowAddUserDialog(false);
                setNewUserData({ 
                  email: "", 
                  password: "", 
                  full_name: "", 
                  team_name: "", 
                  role: "designer" 
                });
                setPasswordError(null);
              }}
            >
              Cancel
            </Button>
            <Button
              onClick={() => createUser.mutate(newUserData)}
              disabled={!newUserData.email || !newUserData.password || createUser.isPending}
            >
              {createUser.isPending ? "Creating..." : "Create User"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Edit Team Name Dialog */}
      <Dialog open={editTeamDialog?.open || false} onOpenChange={(open) => !open && setEditTeamDialog(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Edit Team Name</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="team-name">Team Name</Label>
              <Input
                id="team-name"
                type="text"
                placeholder="Enter new team name"
                value={newTeamName}
                onChange={(e) => setNewTeamName(e.target.value)}
              />
            </div>
            <div className="flex justify-end gap-2">
              <Button
                variant="outline"
                onClick={() => {
                  setEditTeamDialog(null);
                  setNewTeamName("");
                }}
              >
                Cancel
              </Button>
              <Button
                onClick={() => {
                  if (editTeamDialog && newTeamName.trim()) {
                    updateTeamName.mutate({ teamId: editTeamDialog.teamId, newName: newTeamName.trim() });
                  }
                }}
                disabled={!newTeamName.trim() || updateTeamName.isPending}
              >
                {updateTeamName.isPending ? "Saving..." : "Save"}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Set Password Dialog */}
      <Dialog open={passwordResetDialog?.open || false} onOpenChange={(open) => {
        if (!open) {
          setPasswordResetDialog(null);
          setNewPassword("");
          setNewPasswordError(null);
        }
      }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <KeyRound className="h-5 w-5 text-primary" />
              Set Password for {passwordResetDialog?.userName}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <Alert>
              <Shield className="h-4 w-4" />
              <AlertDescription className="text-xs">
                Password must be 8+ characters with uppercase, lowercase, number, and special character.
              </AlertDescription>
            </Alert>
            
            <div className="space-y-2">
              <Label htmlFor="new-password">New Password *</Label>
              <Input
                id="new-password"
                type="password"
                placeholder="Enter new password"
                value={newPassword}
                onChange={(e) => {
                  setNewPassword(e.target.value);
                  setNewPasswordError(null);
                }}
              />
              {newPasswordError && (
                <p className="text-sm text-destructive">{newPasswordError}</p>
              )}
            </div>
          </div>
          
          <div className="flex justify-end gap-2">
            <Button
              variant="outline"
              onClick={() => {
                setPasswordResetDialog(null);
                setNewPassword("");
                setNewPasswordError(null);
              }}
            >
              Cancel
            </Button>
            <Button
              onClick={() => {
                if (passwordResetDialog && newPassword) {
                  setUserPassword.mutate({ 
                    userId: passwordResetDialog.userId, 
                    password: newPassword 
                  });
                }
              }}
              disabled={!newPassword || setUserPassword.isPending}
            >
              {setUserPassword.isPending ? "Setting..." : "Set Password"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Edit Sales Target Dialog */}
      <Dialog open={editTargetDialog?.open || false} onOpenChange={(open) => !open && setEditTargetDialog(null)}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Edit Monthly Target</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <p className="text-sm text-muted-foreground">
              Set the monthly order target for <strong>{editTargetDialog?.userName}</strong>
            </p>
            <div className="space-y-2">
              <Label htmlFor="target-value">Monthly Order Target</Label>
              <Input
                id="target-value"
                type="number"
                min="1"
                placeholder="Enter target"
                value={newTargetValue}
                onChange={(e) => setNewTargetValue(e.target.value)}
              />
            </div>
          </div>
          <div className="flex justify-end gap-2">
            <Button
              variant="outline"
              onClick={() => {
                setEditTargetDialog(null);
                setNewTargetValue("");
              }}
            >
              Cancel
            </Button>
            <Button
              onClick={() => {
                if (editTargetDialog && newTargetValue) {
                  updateSalesTarget.mutate({
                    userId: editTargetDialog.userId,
                    target: parseInt(newTargetValue, 10),
                  });
                }
              }}
              disabled={!newTargetValue || updateSalesTarget.isPending}
            >
              {updateSalesTarget.isPending ? "Saving..." : "Save Target"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Edit PM Dollar Target Dialog */}
      <Dialog open={editPmTargetDialog?.open || false} onOpenChange={(open) => !open && setEditPmTargetDialog(null)}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Edit PM Monthly Target</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <p className="text-sm text-muted-foreground">
              Set the monthly dollar target for <strong>{editPmTargetDialog?.userName}</strong>
            </p>
            <div className="space-y-2">
              <Label htmlFor="pm-target-value">Monthly Dollar Target ($)</Label>
              <Input
                id="pm-target-value"
                type="number"
                min="0"
                placeholder="Enter target amount"
                value={newPmTargetValue}
                onChange={(e) => setNewPmTargetValue(e.target.value)}
              />
            </div>
          </div>
          <div className="flex justify-end gap-2">
            <Button
              variant="outline"
              onClick={() => {
                setEditPmTargetDialog(null);
                setNewPmTargetValue("");
              }}
            >
              Cancel
            </Button>
            <Button
              onClick={() => {
                if (editPmTargetDialog && newPmTargetValue) {
                  updatePmDollarTarget.mutate({
                    userId: editPmTargetDialog.userId,
                    target: parseFloat(newPmTargetValue),
                  });
                }
              }}
              disabled={!newPmTargetValue || updatePmDollarTarget.isPending}
            >
              {updatePmDollarTarget.isPending ? "Saving..." : "Save Target"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Reassign Task Dialog */}
      <Dialog open={reassignDialog?.open || false} onOpenChange={(open) => {
        if (!open) {
          setReassignDialog(null);
          setReassignReason("");
          setSelectedNewPmId("");
        }
      }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Reassign Task to Another Project Manager</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">
              Task: <span className="font-medium">{reassignDialog?.taskTitle}</span>
            </p>
            <div className="space-y-2">
              <Label htmlFor="new-pm">Select New Project Manager</Label>
              <Select value={selectedNewPmId} onValueChange={setSelectedNewPmId}>
                <SelectTrigger>
                  <SelectValue placeholder="Choose a project manager" />
                </SelectTrigger>
                <SelectContent>
                  {projectManagers
                    .filter(pm => pm.id !== reassignDialog?.currentPmId)
                    .map((pm) => (
                      <SelectItem key={pm.id} value={pm.id}>
                        {pm.full_name || pm.email}
                      </SelectItem>
                    ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="reassign-reason">Reason for Reassignment *</Label>
              <Textarea
                id="reassign-reason"
                value={reassignReason}
                onChange={(e) => setReassignReason(e.target.value)}
                placeholder="Explain why you are reassigning this task..."
                rows={4}
              />
            </div>
            <Button
              onClick={() => reassignDialog && reassignTask.mutate({ 
                taskId: reassignDialog.taskId, 
                newPmId: selectedNewPmId,
                reason: reassignReason
              })}
              disabled={!selectedNewPmId || !reassignReason.trim() || reassignTask.isPending}
              className="w-full"
            >
              {reassignTask.isPending ? "Reassigning..." : "Reassign Task"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Metric Details Dialog */}
      <Dialog open={metricDetailsDialog?.open || false} onOpenChange={(open) => !open && setMetricDetailsDialog(null)}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>
              {metricDetailsDialog?.userName} - {metricDetailsDialog && getMetricDisplayName(metricDetailsDialog.metricType)}
            </DialogTitle>
          </DialogHeader>
          <ScrollArea className="max-h-[60vh]">
            {metricDetailsDialog && (() => {
              const filteredTasks = getFilteredTasksForMetric(metricDetailsDialog.userId, metricDetailsDialog.metricType);
              
              if (filteredTasks.length === 0) {
                return (
                  <p className="text-center text-muted-foreground py-8">
                    No orders found for this metric.
                  </p>
                );
              }
              
              return (
                <div className="space-y-3 pr-4">
                  {filteredTasks.map((task) => (
                    <Card key={task.id} className="p-4">
                      <div className="flex items-start justify-between gap-4">
                        <div className="space-y-1 flex-1">
                          <div className="flex items-center gap-2">
                            <span className="font-mono text-sm text-muted-foreground">
                              #{task.task_number}
                            </span>
                            <span className="font-medium">{task.title}</span>
                          </div>
                          <p className="text-sm text-muted-foreground">
                            {task.customer_name || task.business_name || 'No customer name'}
                          </p>
                          <div className="flex items-center gap-3 mt-2">
                            <Badge 
                              variant={task.status === 'completed' || task.status === 'approved' ? 'default' : 'secondary'}
                            >
                              {task.status}
                            </Badge>
                            {metricDetailsDialog.metricType === 'revenue' && (
                              <span className="text-sm font-medium text-green-600">
                                ${Number(task.amount_total || 0).toLocaleString()}
                              </span>
                            )}
                            {(metricDetailsDialog.metricType === 'pm_closed' || metricDetailsDialog.metricType === 'pm_total' || metricDetailsDialog.metricType === 'pm_upsells') && (
                              <div className="flex items-center gap-2">
                                <span className="text-sm font-medium">
                                  Total: ${Number(task.amount_total || 0).toLocaleString()}
                                </span>
                                <span className="text-sm font-medium text-green-600">
                                  Paid: ${Number(task.amount_paid || 0).toLocaleString()}
                                </span>
                                {Number(task.amount_pending || 0) > 0 && (
                                  <span className="text-sm font-medium text-orange-500">
                                    Pending: ${Number(task.amount_pending || 0).toLocaleString()}
                                  </span>
                                )}
                              </div>
                            )}
                            <span className="text-xs text-muted-foreground">
                              {task.created_at ? format(new Date(task.created_at), 'MMM d, yyyy') : ''}
                            </span>
                          </div>
                        </div>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => {
                            setMetricDetailsDialog(null);
                            setViewDetailsTask(task);
                          }}
                        >
                          View Details
                        </Button>
                      </div>
                    </Card>
                  ))}
                </div>
              );
            })()}
          </ScrollArea>
        </DialogContent>
      </Dialog>

      {/* Edit Task Dialog */}
      <Dialog open={editTaskDialog?.open || false} onOpenChange={(open) => !open && setEditTaskDialog(null)}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Edit2 className="h-5 w-5 text-primary" />
              Edit Task - #{editTaskDialog?.task?.task_number}
            </DialogTitle>
          </DialogHeader>
          <ScrollArea className="max-h-[70vh] pr-4">
            <div className="space-y-6">
              {/* Customer Information */}
              <div className="space-y-3">
                <h3 className="font-semibold text-lg border-b pb-2">Customer Information</h3>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label>Customer Name</Label>
                    <Input
                      value={editTaskData.customer_name}
                      onChange={(e) => setEditTaskData(prev => ({ ...prev, customer_name: e.target.value }))}
                      placeholder="Enter customer name"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Customer Email</Label>
                    <Input
                      type="email"
                      value={editTaskData.customer_email}
                      onChange={(e) => setEditTaskData(prev => ({ ...prev, customer_email: e.target.value }))}
                      placeholder="Enter customer email"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Customer Phone</Label>
                    <Input
                      value={editTaskData.customer_phone}
                      onChange={(e) => setEditTaskData(prev => ({ ...prev, customer_phone: e.target.value }))}
                      placeholder="Enter customer phone"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Customer Domain</Label>
                    <Input
                      value={editTaskData.customer_domain}
                      onChange={(e) => setEditTaskData(prev => ({ ...prev, customer_domain: e.target.value }))}
                      placeholder="Enter customer domain"
                    />
                  </div>
                </div>
              </div>

              {/* Business Information */}
              <div className="space-y-3">
                <h3 className="font-semibold text-lg border-b pb-2">Business Information</h3>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label>Business Name</Label>
                    <Input
                      value={editTaskData.business_name}
                      onChange={(e) => setEditTaskData(prev => ({ ...prev, business_name: e.target.value }))}
                      placeholder="Enter business name"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Business Email</Label>
                    <Input
                      type="email"
                      value={editTaskData.business_email}
                      onChange={(e) => setEditTaskData(prev => ({ ...prev, business_email: e.target.value }))}
                      placeholder="Enter business email"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Business Phone</Label>
                    <Input
                      value={editTaskData.business_phone}
                      onChange={(e) => setEditTaskData(prev => ({ ...prev, business_phone: e.target.value }))}
                      placeholder="Enter business phone"
                    />
                  </div>
                </div>
              </div>

              {/* Payment Information */}
              <div className="space-y-3">
                <h3 className="font-semibold text-lg border-b pb-2">Payment Information</h3>
                <div className="grid grid-cols-3 gap-4">
                  <div className="space-y-2">
                    <Label>Total Amount ($)</Label>
                    <Input
                      type="number"
                      step="0.01"
                      value={editTaskData.amount_total}
                      onChange={(e) => setEditTaskData(prev => ({ ...prev, amount_total: e.target.value }))}
                      placeholder="0.00"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Amount Paid ($)</Label>
                    <Input
                      type="number"
                      step="0.01"
                      value={editTaskData.amount_paid}
                      onChange={(e) => setEditTaskData(prev => ({ ...prev, amount_paid: e.target.value }))}
                      placeholder="0.00"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Amount Pending ($)</Label>
                    <Input
                      type="number"
                      step="0.01"
                      value={editTaskData.amount_pending}
                      onChange={(e) => setEditTaskData(prev => ({ ...prev, amount_pending: e.target.value }))}
                      placeholder="0.00"
                    />
                  </div>
                </div>
              </div>

              {/* Deadline */}
              <div className="space-y-3">
                <h3 className="font-semibold text-lg border-b pb-2">Deadline</h3>
                <div className="space-y-2">
                  <Label>Deadline Date</Label>
                  <Input
                    type="date"
                    value={editTaskData.deadline}
                    onChange={(e) => setEditTaskData(prev => ({ ...prev, deadline: e.target.value }))}
                  />
                </div>
              </div>
            </div>
          </ScrollArea>
          <div className="flex justify-end gap-2 pt-4 border-t">
            <Button variant="outline" onClick={() => setEditTaskDialog(null)}>
              Cancel
            </Button>
            <Button onClick={handleSaveTask} disabled={updateTask.isPending}>
              {updateTask.isPending ? "Saving..." : "Save Changes"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default AdminDashboard;
