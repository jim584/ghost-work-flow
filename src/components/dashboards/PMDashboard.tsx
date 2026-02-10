import { useState, useMemo } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { LogOut, Plus, CheckCircle2, Clock, FolderKanban, Download, ChevronDown, ChevronUp, FileText, Globe, User, Mail, Phone, DollarSign, Calendar, Users, Image, Palette, RefreshCw, XCircle, Ban } from "lucide-react";

import { useProjectManagers } from "@/hooks/useProjectManagers";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { Database } from "@/integrations/supabase/types";
import { CreateTaskForm } from "./CreateTaskForm";
import { CreateLogoOrderForm } from "./CreateLogoOrderForm";
import { CreateWebsiteOrderForm } from "./CreateWebsiteOrderForm";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { ScrollArea } from "@/components/ui/scroll-area";
import { FilePreview } from "@/components/FilePreview";
import { format } from "date-fns";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";

const PMDashboard = () => {
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
  
  const [open, setOpen] = useState(false);
  const [taskType, setTaskType] = useState<"social_media" | "logo" | "website" | null>(null);
  const [expandedTaskId, setExpandedTaskId] = useState<string | null>(null);
  const [viewDetailsTask, setViewDetailsTask] = useState<any>(null);
  
  const [revisionDialog, setRevisionDialog] = useState<{ open: boolean; submissionId: string; fileName: string } | null>(null);
  const [revisionNotes, setRevisionNotes] = useState("");
  const [revisionFiles, setRevisionFiles] = useState<File[]>([]);
  const [uploadingRevision, setUploadingRevision] = useState(false);
  const [statusFilter, setStatusFilter] = useState<string | null>("priority");
  const [orderTypeFilter, setOrderTypeFilter] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [reassignDialog, setReassignDialog] = useState<{ open: boolean; taskId: string; currentPmId: string } | null>(null);
  const [reassignReason, setReassignReason] = useState("");
  const [selectedNewPmId, setSelectedNewPmId] = useState("");
  const [cancelDialog, setCancelDialog] = useState<{ open: boolean; taskId: string } | null>(null);
  const [cancelReason, setCancelReason] = useState("");

  const { data: projectManagers = [] } = useProjectManagers();

  const { data: teams } = useQuery({
    queryKey: ["teams"],
    queryFn: async () => {
      const { data, error } = await supabase.from("teams").select("*");
      if (error) throw error;
      return data;
    },
  });

  // Fetch designer teams only (exclude developer-only teams) for logo/social media orders
  const { data: designerTeams } = useQuery({
    queryKey: ["designer-teams"],
    queryFn: async () => {
      // Get all team members who are designers
      const { data: designerRoles, error: rolesError } = await supabase
        .from("user_roles")
        .select("user_id")
        .eq("role", "designer");
      
      if (rolesError) throw rolesError;
      
      const designerUserIds = designerRoles?.map(r => r.user_id) || [];
      
      if (designerUserIds.length === 0) return [];
      
      // Get teams that have designers
      const { data: designerTeamMembers, error: membersError } = await supabase
        .from("team_members")
        .select("team_id")
        .in("user_id", designerUserIds);
      
      if (membersError) throw membersError;
      
      const designerTeamIds = [...new Set(designerTeamMembers?.map(m => m.team_id) || [])];
      
      if (designerTeamIds.length === 0) return [];
      
      // Get the actual team data
      const { data: teamsData, error: teamsError } = await supabase
        .from("teams")
        .select("*")
        .in("id", designerTeamIds);
      
      if (teamsError) throw teamsError;
      return teamsData;
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
          profiles!team_members_user_id_profiles_fkey(id, full_name, email)
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

  const { data: myTasks } = useQuery({
    queryKey: ["pm-tasks", user?.id],
    queryFn: async () => {
      // Get orders assigned to this PM
      const { data: assignedOrders, error: assignedError } = await supabase
        .from("tasks")
        .select("*, teams(name)")
        .eq("project_manager_id", user!.id)
        .order("created_at", { ascending: false });
      if (assignedError) throw assignedError;
      
      // Get orders closed by this PM (but assigned to different PM)
      const { data: closedOrders, error: closedError } = await supabase
        .from("tasks")
        .select("*, teams(name)")
        .eq("closed_by", user!.id)
        .neq("project_manager_id", user!.id)
        .order("created_at", { ascending: false });
      if (closedError) throw closedError;
      
      // Merge and deduplicate by task id
      const taskMap = new Map<string, any>();
      assignedOrders?.forEach(task => taskMap.set(task.id, task));
      closedOrders?.forEach(task => {
        if (!taskMap.has(task.id)) {
          taskMap.set(task.id, task);
        }
      });
      
      const data = Array.from(taskMap.values()).sort(
        (a, b) => new Date(b.created_at!).getTime() - new Date(a.created_at!).getTime()
      );
      
      // Fetch creator, transferred_by, and closed_by profiles separately
      if (data && data.length > 0) {
        const userIds = new Set<string>();
        data.forEach(task => {
          if (task.created_by) userIds.add(task.created_by);
          if (task.transferred_by) userIds.add(task.transferred_by);
          if (task.closed_by) userIds.add(task.closed_by);
          if (task.project_manager_id) userIds.add(task.project_manager_id);
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
            project_manager_profile: task.project_manager_id ? profileMap.get(task.project_manager_id) : null,
          }));
        }
      }
      
      return data;
    },
  });

  // Query for all tasks (used when searching) - PMs can view via admin-like search
  const { data: allTasks } = useQuery({
    queryKey: ["all-tasks-search", searchQuery],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("tasks")
        .select("*, teams(name), profiles!tasks_project_manager_id_fkey(full_name, email)")
        .order("created_at", { ascending: false });
      if (error) throw error;
      
      // Fetch creator, transferred_by, and closed_by profiles separately
      if (data && data.length > 0) {
        const userIds = new Set<string>();
        data.forEach(task => {
          if (task.created_by) userIds.add(task.created_by);
          if (task.transferred_by) userIds.add(task.transferred_by);
          if (task.closed_by) userIds.add(task.closed_by);
          if (task.project_manager_id) userIds.add(task.project_manager_id);
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
            project_manager_profile: task.project_manager_id ? profileMap.get(task.project_manager_id) : null,
          }));
        }
      }
      
      return data;
    },
    enabled: !!searchQuery.trim(),
  });

  // Fetch PM's own sales target stats
  const { data: myTargetStats } = useQuery({
    queryKey: ["pm-target-stats", user?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("sales_targets")
        .select("*")
        .eq("user_id", user!.id)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
    enabled: !!user?.id,
  });

  // Fetch revenue from closed new customer orders (non-upsell)
  // Count unique orders only once by order_group_id for multi-team orders
  const { data: closedNewCustomerRevenue } = useQuery({
    queryKey: ["pm-closed-revenue", user?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("tasks")
        .select("amount_total, order_group_id")
        .eq("closed_by", user!.id)
        .eq("is_upsell", false);
      if (error) throw error;
      
      // Deduplicate by order_group_id - count each multi-team order only once
      const seenOrderGroups = new Set<string>();
      let total = 0;
      
      data?.forEach(task => {
        if (task.order_group_id) {
          // Multi-team order - only count if we haven't seen this group
          if (!seenOrderGroups.has(task.order_group_id)) {
            seenOrderGroups.add(task.order_group_id);
            total += Number(task.amount_total) || 0;
          }
        } else {
          // Single-team order - always count
          total += Number(task.amount_total) || 0;
        }
      });
      
      return total;
    },
    enabled: !!user?.id,
  });

  // Use allTasks when searching, otherwise use myTasks
  const tasks = searchQuery.trim() ? allTasks : myTasks;

  // Memoize taskIds to avoid recalculating on every render
  const taskIds = useMemo(() => tasks?.map(t => t.id) || [], [tasks]);

  const { data: submissions } = useQuery({
    queryKey: ["design-submissions", user?.id, taskIds],
    queryFn: async () => {
      if (!taskIds.length) return [];
      
      const { data, error } = await supabase
        .from("design_submissions")
        .select("*")
        .in("task_id", taskIds)
        .order("submitted_at", { ascending: false });
      
      if (error) throw error;
      return data;
    },
    enabled: !!taskIds.length,
  });

  // Group tasks by order_group_id for multi-team orders
  const groupedOrders = useMemo(() => {
    if (!tasks) return [];

    const groups = new Map<string, {
      groupId: string;
      primaryTask: any;
      allTasks: any[];
      isMultiTeam: boolean;
      teamNames: string[];
    }>();

    tasks.forEach((task: any) => {
      // Use order_group_id if present, otherwise use task.id (single-team order)
      const key = task.order_group_id || task.id;

      if (!groups.has(key)) {
        groups.set(key, {
          groupId: key,
          primaryTask: task,
          allTasks: [task],
          isMultiTeam: !!task.order_group_id,
          teamNames: [task.teams?.name || "Unknown Team"],
        });
      } else {
        const group = groups.get(key)!;
        group.allTasks.push(task);
        if (task.teams?.name && !group.teamNames.includes(task.teams.name)) {
          group.teamNames.push(task.teams.name);
        }
      }
    });

    return Array.from(groups.values());
  }, [tasks]);

  // Get all submissions for a grouped order
  const getGroupSubmissions = (group: typeof groupedOrders[0]) => {
    if (!submissions) return [];
    const taskIds = group.allTasks.map((t: any) => t.id);
    return submissions.filter((s: any) => taskIds.includes(s.task_id));
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
      queryClient.invalidateQueries({ queryKey: ["pm-tasks"] });
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

  const acceptOrder = useMutation({
    mutationFn: async (taskId: string) => {
      const { error } = await supabase
        .from("tasks")
        .update({ accepted_by_pm: true } as any)
        .eq("id", taskId);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["pm-tasks"] });
      queryClient.invalidateQueries({ queryKey: ["all-tasks-search"] });
      toast({ title: "Order accepted successfully" });
    },
    onError: (error: any) => {
      toast({
        variant: "destructive",
        title: "Error accepting order",
        description: error.message,
      });
    },
  });

  const cancelOrder = useMutation({
    mutationFn: async ({ taskId, reason }: { taskId: string; reason: string }) => {
      const task = myTasks?.find(t => t.id === taskId);
      if (!task) throw new Error("Task not found");

      const { error } = await supabase
        .from("tasks")
        .update({ 
          status: "cancelled" as any, 
          cancellation_reason: reason,
          cancelled_at: new Date().toISOString(),
        } as any)
        .eq("id", taskId);
      if (error) throw error;

      // Notify designers in the task's team
      const { data: teamMembers } = await supabase
        .from("team_members")
        .select("user_id")
        .eq("team_id", task.team_id);

      if (teamMembers) {
        for (const member of teamMembers) {
          await supabase.from("notifications").insert({
            user_id: member.user_id,
            type: "order_cancelled",
            title: "Order Cancelled",
            message: `Order #${task.task_number} "${task.title}" has been cancelled. Reason: ${reason}`,
            task_id: taskId,
          });
        }
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["pm-tasks"] });
      queryClient.invalidateQueries({ queryKey: ["all-tasks-search"] });
      toast({ title: "Order cancelled successfully" });
      setCancelDialog(null);
      setCancelReason("");
    },
    onError: (error: any) => {
      toast({
        variant: "destructive",
        title: "Error cancelling order",
        description: error.message,
      });
    },
  });

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  // Helper to get team delivery status
  const getTeamDeliveryStatus = (task: any, allSubmissions: any[]) => {
    // Check if the task is cancelled first
    if (task.status === 'cancelled') {
      return { status: 'cancelled', label: 'Cancelled', color: 'destructive' };
    }
    
    const teamSubmissions = allSubmissions?.filter(s => s.task_id === task.id) || [];
    
    if (teamSubmissions.length === 0) {
      return { status: 'pending_delivery', label: 'Pending Delivery', color: 'warning' };
    }
    
    const hasPending = teamSubmissions.some(s => s.revision_status === 'pending_review');
    const hasRevision = teamSubmissions.some(s => s.revision_status === 'needs_revision');
    const allApproved = teamSubmissions.every(s => s.revision_status === 'approved');
    
    if (hasPending) return { status: 'pending_review', label: 'Pending Review', color: 'blue' };
    if (hasRevision) return { status: 'needs_revision', label: 'Needs Revision', color: 'destructive' };
    if (allApproved) return { status: 'approved', label: 'Approved', color: 'success' };
    return { status: 'in_progress', label: 'In Progress', color: 'default' };
  };

  // Helper to get multi-team delivery progress for card front indicator
  const getMultiTeamDeliveryProgress = (group: typeof groupedOrders[0], allSubmissions: any[]) => {
    if (!group.isMultiTeam) return null;
    
    const teamsWithDeliveries = group.allTasks.filter((task: any) =>
      allSubmissions?.some(s => s.task_id === task.id)
    ).length;
    
    const totalTeams = group.allTasks.length;
    
    return {
      delivered: teamsWithDeliveries,
      total: totalTeams,
      hasPartialDelivery: teamsWithDeliveries > 0 && teamsWithDeliveries < totalTeams
    };
  };

  // Helper to get ALL applicable categories for a grouped order
  const getGroupCategories = (group: typeof groupedOrders[0], allSubmissions: any[]): string[] => {
    const activeTasks = group.allTasks.filter((t: any) => t.status !== 'cancelled');
    const allCancelled = activeTasks.length === 0;
    if (allCancelled) return ['cancelled'];

    const groupSubmissions = activeTasks.flatMap((task: any) => 
      allSubmissions?.filter(s => s.task_id === task.id) || []
    );
    const tasksWithSubmissions = activeTasks.filter((task: any) =>
      allSubmissions?.some(s => s.task_id === task.id)
    );
    const allTeamsHaveSubmissions = tasksWithSubmissions.length === activeTasks.length;
    const hasPendingReview = groupSubmissions.some(s => s.revision_status === 'pending_review');
    const hasNeedsRevision = groupSubmissions.some(s => s.revision_status === 'needs_revision');
    const allSubmissionsApproved = groupSubmissions.length > 0 && groupSubmissions.every(s => s.revision_status === 'approved');
    const allApproved = allTeamsHaveSubmissions && allSubmissionsApproved;
    const hasTeamsPendingDelivery = group.isMultiTeam && !allTeamsHaveSubmissions;
    const representativeTask = activeTasks[0] || group.primaryTask;
    const isDeadlineDelayed = activeTasks.some((t: any) => 
      t.deadline && new Date(t.deadline) < today && 
      !['completed', 'approved', 'cancelled'].includes(t.status)
    );
    const now = new Date();
    const isRevisionDelayed = groupSubmissions.some(s => 
      s.revision_status === 'needs_revision' && s.reviewed_at && 
      (now.getTime() - new Date(s.reviewed_at).getTime()) > 24 * 60 * 60 * 1000
    );
    const isDelayed = isDeadlineDelayed || isRevisionDelayed;

    const categories: string[] = [];
    if (hasPendingReview) categories.push('recently_delivered');
    if (hasNeedsRevision) categories.push('needs_revision');
    if (isDelayed) categories.push('delayed');
    if (hasTeamsPendingDelivery) categories.push('pending_delivery');
    
    // For multi-team orders, also check individual task statuses
    const hasAnyPending = activeTasks.some((t: any) => t.status === 'pending');
    const hasAnyInProgress = activeTasks.some((t: any) => t.status === 'in_progress');
    const hasAnyCancelled = group.allTasks.some((t: any) => t.status === 'cancelled');
    if (hasAnyPending) categories.push('pending');
    if (hasAnyInProgress) categories.push('in_progress');
    if (hasAnyCancelled) categories.push('cancelled');
    
    if (categories.length === 0) {
      if (allApproved) categories.push('other');
      else if (representativeTask.status === 'completed' || representativeTask.status === 'approved') categories.push('other');
      else categories.push('other');
    }
    
    return categories;
  };

  // Primary category for display/sorting (highest priority)
  const getGroupCategory = (group: typeof groupedOrders[0], allSubmissions: any[]) => {
    return getGroupCategories(group, allSubmissions)[0];
  };

  // Stats now count unique orders (grouped) - an order can count in multiple categories
  const stats = {
    recently_delivered: groupedOrders.filter(g => getGroupCategories(g, submissions || []).includes('recently_delivered')).length,
    delayed: groupedOrders.filter(g => getGroupCategories(g, submissions || []).includes('delayed')).length,
    pending: groupedOrders.filter(g => getGroupCategories(g, submissions || []).includes('pending')).length,
    in_progress: groupedOrders.filter(g => getGroupCategories(g, submissions || []).includes('in_progress')).length,
    needs_revision: groupedOrders.filter(g => getGroupCategories(g, submissions || []).includes('needs_revision')).length,
    pending_delivery: groupedOrders.filter(g => getGroupCategories(g, submissions || []).includes('pending_delivery')).length,
    cancelled: groupedOrders.filter(g => getGroupCategories(g, submissions || []).includes('cancelled')).length,
    total: groupedOrders.length,
  };

  const getTaskCategory = (task: any, submissions: any[]) => {
    const taskSubmissions = submissions?.filter(s => s.task_id === task.id) || [];
    const hasPendingReview = taskSubmissions.some(s => s.revision_status === 'pending_review');
    const hasNeedsRevision = taskSubmissions.some(s => s.revision_status === 'needs_revision');
    // Only consider all approved if there are submissions AND all are approved
    const allApproved = taskSubmissions.length > 0 && taskSubmissions.every(s => s.revision_status === 'approved');
    const isDeadlineDelayed = task.deadline && new Date(task.deadline) < today && 
                     !['completed', 'approved', 'cancelled'].includes(task.status);
    const nowTask = new Date();
    const isRevisionDelayed = taskSubmissions.some(s => 
      s.revision_status === 'needs_revision' && s.reviewed_at && 
      (nowTask.getTime() - new Date(s.reviewed_at).getTime()) > 24 * 60 * 60 * 1000
    );
    const isDelayed = isDeadlineDelayed || isRevisionDelayed;
    
    if (task.status === 'cancelled') return 'cancelled';
    
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
      pending_delivery: 2,  // Partial deliveries show high - PM needs to track remaining teams
      delayed: 3,
      pending: 4,
      in_progress: 5,
      needs_revision: 6,
      other: 7,
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
      case "cancelled":
        return "bg-destructive text-destructive-foreground";
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

  // Filter and sort grouped orders instead of individual tasks
  const filteredOrders = groupedOrders.filter((group) => {
    const task = group.primaryTask;
    
    // Search filter - if searching, show all matching orders regardless of status
    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase();
      const matchesSearch = task.title?.toLowerCase().includes(query) ||
        task.task_number?.toString().includes(query) ||
        task.business_name?.toLowerCase().includes(query) ||
        task.description?.toLowerCase().includes(query) ||
        `#${task.task_number}`.includes(query);
      
      // Still apply order type filter even when searching
      if (orderTypeFilter) {
        const matchesOrderType = 
          (orderTypeFilter === 'logo' && task.post_type === 'Logo Design') ||
          (orderTypeFilter === 'social_media' && task.post_type !== 'Logo Design' && task.post_type !== 'Website Design') ||
          (orderTypeFilter === 'website' && task.post_type === 'Website Design');
        return matchesSearch && matchesOrderType;
      }
      return matchesSearch;
    }
    
    // Order type filter
    if (orderTypeFilter) {
      const matchesOrderType = 
        (orderTypeFilter === 'logo' && task.post_type === 'Logo Design') ||
        (orderTypeFilter === 'social_media' && task.post_type !== 'Logo Design' && task.post_type !== 'Website Design') ||
        (orderTypeFilter === 'website' && task.post_type === 'Website Design');
      if (!matchesOrderType) return false;
    }
    
    // Status filter (only applied when not searching)
    if (!statusFilter) return true;
    if (statusFilter === 'priority') {
      const categories = getGroupCategories(group, submissions || []);
      return categories.some(c => ['recently_delivered', 'delayed', 'pending', 'in_progress', 'needs_revision', 'pending_delivery'].includes(c));
    }
    // Handle all category filters using getGroupCategories for multi-team support
    const categories = getGroupCategories(group, submissions || []);
    return categories.includes(statusFilter);
  }).sort((a, b) => {
    if (statusFilter === 'priority') {
      const categoryA = getGroupCategory(a, submissions || []);
      const categoryB = getGroupCategory(b, submissions || []);
      const priorityA = getCategoryPriority(categoryA);
      const priorityB = getCategoryPriority(categoryB);
      
      const priorityDiff = priorityA - priorityB;
      
      if (priorityDiff !== 0) return priorityDiff;
      
      // Within same category, sort by date or secondary criteria
      if (categoryA === 'recently_delivered') {
        const submissionsA = getGroupSubmissions(a);
        const submissionsB = getGroupSubmissions(b);
        const latestA = submissionsA.sort((x: any, y: any) => 
          new Date(y.submitted_at!).getTime() - new Date(x.submitted_at!).getTime()
        )[0];
        const latestB = submissionsB.sort((x: any, y: any) => 
          new Date(y.submitted_at!).getTime() - new Date(x.submitted_at!).getTime()
        )[0];
        return new Date(latestB?.submitted_at || 0).getTime() - new Date(latestA?.submitted_at || 0).getTime();
      }
      if (categoryA === 'delayed') {
        return new Date(a.primaryTask.deadline!).getTime() - new Date(b.primaryTask.deadline!).getTime();
      }
      // Within pending_delivery, put actual partial deliveries (some teams delivered) first
      if (categoryA === 'pending_delivery') {
        const progressA = getMultiTeamDeliveryProgress(a, submissions || []);
        const progressB = getMultiTeamDeliveryProgress(b, submissions || []);
        const hasPartialA = progressA?.hasPartialDelivery ? 1 : 0;
        const hasPartialB = progressB?.hasPartialDelivery ? 1 : 0;
        // Higher partial = comes first (descending order)
        if (hasPartialB !== hasPartialA) return hasPartialB - hasPartialA;
      }
    }
    return new Date(b.primaryTask.created_at!).getTime() - new Date(a.primaryTask.created_at!).getTime();
  });

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b bg-card">
        <div className="container mx-auto px-4 py-4 flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-foreground">Welcome, {profile?.full_name || 'Project Manager'}</h1>
            <p className="text-sm text-muted-foreground">Project Manager Dashboard</p>
          </div>
          <div className="flex items-center gap-4">
            {(myTargetStats || closedNewCustomerRevenue !== undefined) && (
              <div className="flex items-center gap-3 text-sm text-muted-foreground border rounded-lg px-3 py-1.5 bg-muted/30">
                <span>Target: <strong className="text-foreground">${Number(myTargetStats?.monthly_dollar_target || 0).toLocaleString()}</strong></span>
                <span className="text-border">|</span>
                <span>Closed: <strong className="text-foreground">{myTargetStats?.closed_orders_count || 0}</strong></span>
                <span className="text-border">|</span>
                <span>Closed Value: <strong className="text-foreground">${(closedNewCustomerRevenue || 0).toLocaleString()}</strong></span>
                <span className="text-border">|</span>
                <span>Transferred: <strong className="text-foreground">{myTargetStats?.transferred_orders_count || 0}</strong></span>
                <span className="text-border">|</span>
                <span>Upsells: <strong className="text-foreground">${Number(myTargetStats?.upsell_revenue || 0).toLocaleString()}</strong></span>
                <span className="text-border">|</span>
                <span>Total: <strong className="text-primary">${((closedNewCustomerRevenue || 0) + Number(myTargetStats?.upsell_revenue || 0)).toLocaleString()}</strong></span>
                {Number(myTargetStats?.monthly_dollar_target || 0) > 0 && (
                  <>
                    <span className="text-border">|</span>
                    <span>Progress: <strong className={((closedNewCustomerRevenue || 0) + Number(myTargetStats?.upsell_revenue || 0)) >= Number(myTargetStats?.monthly_dollar_target || 0) ? "text-green-600" : "text-foreground"}>
                      {Math.min(((closedNewCustomerRevenue || 0) + Number(myTargetStats?.upsell_revenue || 0)) / Number(myTargetStats?.monthly_dollar_target) * 100, 100).toFixed(0)}%
                    </strong></span>
                  </>
                )}
              </div>
            )}
            
            <Button onClick={signOut} variant="outline" size="sm">
              <LogOut className="mr-2 h-4 w-4" />
              Sign Out
            </Button>
          </div>
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
          <div className="flex gap-2">
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
          <div className="flex gap-2">
            <Button
              variant={!orderTypeFilter ? 'default' : 'outline'}
              size="sm"
              onClick={() => setOrderTypeFilter(null)}
            >
              All Types
            </Button>
            <Button
              variant={orderTypeFilter === 'logo' ? 'default' : 'outline'}
              size="sm"
              onClick={() => setOrderTypeFilter('logo')}
            >
              <FileText className="h-4 w-4 mr-1" />
              Logo
            </Button>
            <Button
              variant={orderTypeFilter === 'social_media' ? 'default' : 'outline'}
              size="sm"
              onClick={() => setOrderTypeFilter('social_media')}
            >
              <FolderKanban className="h-4 w-4 mr-1" />
              Social Media
            </Button>
            <Button
              variant={orderTypeFilter === 'website' ? 'default' : 'outline'}
              size="sm"
              onClick={() => setOrderTypeFilter('website')}
            >
              <Globe className="h-4 w-4 mr-1" />
              Website
            </Button>
          </div>
        </div>

        <div className="grid gap-4 md:grid-cols-6 mb-8">
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
          
          <Card 
            className={`border-l-4 border-l-gray-500 cursor-pointer transition-all hover:shadow-md ${statusFilter === 'cancelled' ? 'ring-2 ring-gray-500' : ''}`}
            onClick={() => setStatusFilter('cancelled')}
          >
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Cancelled</CardTitle>
              <Ban className="h-4 w-4 text-gray-500" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{stats.cancelled}</div>
              <p className="text-xs text-muted-foreground">Cancelled orders</p>
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
                    <div className="grid grid-cols-3 gap-4">
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
                      <Button
                        variant="outline"
                        className="h-32 flex flex-col gap-2"
                        onClick={() => setTaskType("website")}
                      >
                        <Globe className="h-8 w-8" />
                        <div className="text-center">
                          <p className="font-semibold">Website Order</p>
                          <p className="text-xs text-muted-foreground">Create website design order</p>
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
                      teams={designerTeams || []} 
                      onSuccess={() => {
                        setOpen(false);
                        setTaskType(null);
                      }}
                      showProjectManagerSelector={true}
                      showUpsellToggle={true}
                    />
                  </>
                ) : taskType === "logo" ? (
                  <>
                    <DialogHeader>
                      <DialogTitle>Create New Logo Order</DialogTitle>
                    </DialogHeader>
                    <CreateLogoOrderForm 
                      userId={user!.id} 
                      teams={designerTeams || []} 
                      onSuccess={() => {
                        setOpen(false);
                        setTaskType(null);
                      }}
                      showProjectManagerSelector={true}
                      showUpsellToggle={true}
                    />
                  </>
                ) : (
                  <>
                    <DialogHeader>
                      <DialogTitle>Create New Website Order</DialogTitle>
                    </DialogHeader>
                    <CreateWebsiteOrderForm 
                      userId={user!.id} 
                      onSuccess={() => {
                        setOpen(false);
                        setTaskType(null);
                      }}
                      showProjectManagerSelector={true}
                      showUpsellToggle={true}
                    />
                  </>
                )}
              </DialogContent>
            </Dialog>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {filteredOrders.map((group) => {
                const task = group.primaryTask;
                const groupSubmissions = getGroupSubmissions(group);
                const isExpanded = expandedTaskId === group.groupId;
                const allCategories = getGroupCategories(group, submissions || []);
                const category = (statusFilter && allCategories.includes(statusFilter)) ? statusFilter : getGroupCategory(group, submissions || []);
                
                const getBorderClass = () => {
                  if (category === 'recently_delivered') return 'border-l-4 border-l-green-500 bg-green-50/10';
                  if (category === 'delayed') return 'border-l-4 border-l-red-500 bg-red-50/10';
                  if (category === 'needs_revision') return 'border-l-4 border-l-orange-500 bg-orange-50/10';
                  if (category === 'pending_delivery') return 'border-l-4 border-l-yellow-500 bg-yellow-50/10';
                  if (category === 'cancelled') return 'border-l-4 border-l-gray-500 bg-gray-50/10 opacity-75';
                  return '';
                };

                const getCategoryBadge = () => {
                  if (category === 'recently_delivered') {
                    return <Badge className="bg-green-500 text-white">Delivered - Awaiting Review</Badge>;
                  }
                  if (category === 'delayed') {
                    return null; // Handled by getDelayedBadge
                  }
                  if (category === 'needs_revision') {
                    return <Badge className="bg-orange-500 text-white">Needs Revision</Badge>;
                  }
                  if (category === 'pending_delivery') {
                    return <Badge className="bg-yellow-500 text-white">Awaiting Team Delivery</Badge>;
                  }
                  if (category === 'cancelled') {
                    return <Badge className="bg-gray-500 text-white">{(task as any).is_deleted ? 'Deleted' : 'Cancelled'}</Badge>;
                  }
                  return null;
                };

                const getDelayedBadge = () => {
                  const allCats = getGroupCategories(group, submissions || []);
                  if (!allCats.includes('delayed')) return null;
                  const now = new Date();
                  const activeTasks = group.isMultiTeam ? group.allTasks.filter((t: any) => t.status !== 'cancelled') : [task];
                  
                  // Check deadline-based delay
                  const delayedTask = activeTasks.find((t: any) => t.deadline && new Date(t.deadline) < now && !['completed', 'approved', 'cancelled'].includes(t.status));
                  const deadlineHours = delayedTask ? Math.floor((now.getTime() - new Date(delayedTask.deadline).getTime()) / (1000 * 60 * 60)) : 0;
                  
                  // Check revision-based delay (24h+ since revision requested)
                  const groupSubs = submissions?.filter(s => activeTasks.some((t: any) => t.id === s.task_id)) || [];
                  const delayedRevision = groupSubs.find(s => 
                    s.revision_status === 'needs_revision' && s.reviewed_at && 
                    (now.getTime() - new Date(s.reviewed_at).getTime()) > 24 * 60 * 60 * 1000
                  );
                  const revisionHours = delayedRevision ? Math.floor((now.getTime() - new Date(delayedRevision.reviewed_at).getTime()) / (1000 * 60 * 60)) : 0;
                  
                  const maxHours = Math.max(deadlineHours, revisionHours);
                  const label = revisionHours > deadlineHours ? 'Revision delayed' : 'DELAYED';
                  return <Badge className="bg-red-500 text-white">{label} — {maxHours} hour{maxHours !== 1 ? 's' : ''} overdue</Badge>;
                };
                
                const getOrderTypeIcon = () => {
                  if (isWebsiteOrder(task)) return <Globe className="h-5 w-5 text-blue-500" />;
                  if (isLogoOrder(task)) return <Palette className="h-5 w-5 text-purple-500" />;
                  return <Image className="h-5 w-5 text-pink-500" />;
                };

                const getOrderTypeBadge = () => {
                  if (isWebsiteOrder(task)) return <Badge variant="outline" className="bg-blue-500/10 text-blue-600 border-blue-200">Website</Badge>;
                  if (isLogoOrder(task)) return <Badge variant="outline" className="bg-purple-500/10 text-purple-600 border-purple-200">Logo</Badge>;
                  return <Badge variant="outline" className="bg-pink-500/10 text-pink-600 border-pink-200">Social Media</Badge>;
                };

                return (
                  <div 
                    key={group.groupId} 
                    className={`group border rounded-xl shadow-sm hover:shadow-md transition-all duration-300 overflow-hidden animate-fade-in ${getBorderClass()}`}
                  >
                    {/* Card Header */}
                    <div className="p-4 bg-gradient-to-r from-muted/30 to-transparent border-b">
                      <div className="flex items-start justify-between gap-4">
                        <div className="flex items-center gap-3 flex-1 min-w-0">
                          <div className="p-2 rounded-lg bg-background shadow-sm">
                            {getOrderTypeIcon()}
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 flex-wrap">
                              <span className="font-mono text-xs px-2 py-0.5 bg-muted rounded-full text-muted-foreground">
                                #{task.task_number}
                              </span>
                              {getOrderTypeBadge()}
                              {group.isMultiTeam && (
                                <>
                                  <Badge variant="outline" className="bg-indigo-500/10 text-indigo-600 border-indigo-200">
                                    {group.teamNames.length} Teams
                                  </Badge>
                                  {(() => {
                                    const progress = getMultiTeamDeliveryProgress(group, submissions || []);
                                    if (progress?.hasPartialDelivery) {
                                      return (
                                        <Badge className="bg-blue-500 text-white animate-pulse">
                                          {progress.delivered}/{progress.total} Teams Delivered
                                        </Badge>
                                      );
                                    }
                                    return null;
                                  })()}
                                </>
                              )}
                              {getCategoryBadge()}
                              {getDelayedBadge()}
                            </div>
                            <h3 className="font-semibold text-lg mt-1 truncate">{task.title}</h3>
                          </div>
                        </div>
                        <div className="flex items-center gap-2 flex-shrink-0">
                          {(() => {
                            // Check for partial delivery status on multi-team orders
                            if (group.isMultiTeam) {
                              const progress = getMultiTeamDeliveryProgress(group, submissions || []);
                              if (progress?.hasPartialDelivery) {
                                return (
                                  <Badge className="bg-blue-600 text-white shadow-sm">
                                    Partially Delivered
                                  </Badge>
                                );
                              }
                            }
                            // Default to regular status
                            return (
                              <Badge className={`${getStatusColor(task.status)} shadow-sm`}>
                                {task.status === 'cancelled' && (task as any).is_deleted ? 'deleted' : task.status.replace("_", " ")}
                              </Badge>
                            );
                          })()}
                          {/* Cancel button for single-team orders - show for pending/in_progress, not completed/approved/cancelled */}
                          {!group.isMultiTeam && (task.status === "pending" || task.status === "in_progress") && task.project_manager_id === user?.id && (
                            <Button
                              size="sm"
                              variant="ghost"
                              className="h-8 w-8 p-0 hover:bg-destructive/10"
                              onClick={() => setCancelDialog({ open: true, taskId: task.id })}
                            >
                              <XCircle className="h-4 w-4 text-destructive" />
                            </Button>
                          )}
                        </div>
                      </div>
                    </div>

                    {/* Card Body */}
                    <div className="p-4 space-y-4">
                      {task.description && (
                        <p className="text-sm text-muted-foreground line-clamp-2">{task.description}</p>
                      )}

                      {/* Info Grid */}
                      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                        {/* Customer Info */}
                        {(task.customer_name || task.customer_email || task.customer_phone) && (
                          <div className="bg-muted/30 rounded-lg p-3 space-y-2">
                            <div className="flex items-center gap-2 text-xs font-medium text-muted-foreground uppercase tracking-wide">
                              <User className="h-3.5 w-3.5" />
                              Customer
                            </div>
                            <div className="space-y-1">
                              {task.customer_name && (
                                <p className="text-sm font-medium truncate">{task.customer_name}</p>
                              )}
                              {task.customer_email && (
                                <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                                  <Mail className="h-3 w-3" />
                                  <span className="truncate">{task.customer_email}</span>
                                </div>
                              )}
                              {task.customer_phone && (
                                <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                                  <Phone className="h-3 w-3" />
                                  <span>{task.customer_phone}</span>
                                </div>
                              )}
                            </div>
                          </div>
                        )}

                        {/* Payment Info */}
                        {(task.amount_total || task.amount_paid || task.amount_pending) && (
                          <div className="bg-muted/30 rounded-lg p-3 space-y-2">
                            <div className="flex items-center gap-2 text-xs font-medium text-muted-foreground uppercase tracking-wide">
                              <DollarSign className="h-3.5 w-3.5" />
                              Payment
                            </div>
                            <div className="space-y-1">
                              {task.amount_total != null && (
                                <p className="text-sm font-semibold">${Number(task.amount_total).toFixed(2)}</p>
                              )}
                              <div className="flex items-center gap-3 text-xs">
                                {task.amount_paid != null && (
                                  <span className="text-green-600 font-medium">
                                    ✓ ${Number(task.amount_paid).toFixed(2)} paid
                                  </span>
                                )}
                                {task.amount_pending != null && task.amount_pending > 0 && (
                                  <span className="text-orange-600 font-medium">
                                    ○ ${Number(task.amount_pending).toFixed(2)} pending
                                  </span>
                                )}
                              </div>
                            </div>
                          </div>
                        )}

                        {/* Assignment & Date Info */}
                        <div className="bg-muted/30 rounded-lg p-3 space-y-2">
                          <div className="flex items-center gap-2 text-xs font-medium text-muted-foreground uppercase tracking-wide">
                            <Users className="h-3.5 w-3.5" />
                            Assignment
                          </div>
                          <div className="space-y-1">
                            <p className="text-sm font-medium">
                              {group.isMultiTeam 
                                ? `${group.teamNames.length} teams assigned`
                                : (() => {
                                    const teamName = isWebsiteOrder(task) 
                                      ? getDeveloperForTeam(task.team_id) || task.teams?.name
                                      : task.teams?.name;
                                    const teamSubs = (submissions || []).filter((s: any) => s.task_id === task.id);
                                    const hasNeedsRev = teamSubs.some((s: any) => s.revision_status === 'needs_revision');
                                    const hasPendingRev = teamSubs.some((s: any) => s.revision_status === 'pending_review');
                                    if (hasNeedsRev) return <>{teamName} — <span className="text-orange-500">Needs Revision</span></>;
                                    if (hasPendingRev) return <>{teamName} — <span className="text-blue-500">Delivered</span></>;
                                    return teamName;
                                  })()
                              }
                            </p>
                            {group.isMultiTeam && (
                              <div className="space-y-1 mt-1">
                                {group.allTasks.map((t: any) => {
                                  const teamSubmissions = (submissions || []).filter((s: any) => s.task_id === t.id);
                                  const hasDelivery = teamSubmissions.length > 0;
                                  const hasPendingReview = teamSubmissions.some((s: any) => s.revision_status === 'pending_review');
                                  const hasNeedsRevision = teamSubmissions.some((s: any) => s.revision_status === 'needs_revision');
                                  const isApproved = t.status === 'approved';
                                  
                                  let statusIcon = "○";
                                  let statusColor = "text-muted-foreground";
                                  let statusText = "Pending";
                                  
                                  if (hasNeedsRevision) {
                                    statusIcon = "↻";
                                    statusColor = "text-orange-500";
                                    statusText = "Needs Revision";
                                  } else if (isApproved) {
                                    statusIcon = "✓";
                                    statusColor = "text-green-600";
                                    statusText = "Approved";
                                  } else if (hasPendingReview) {
                                    statusIcon = "●";
                                    statusColor = "text-blue-500";
                                    statusText = "Delivered";
                                  } else if (hasDelivery) {
                                    statusIcon = "●";
                                    statusColor = "text-blue-500";
                                    statusText = "Delivered";
                                  } else if (t.status === 'in_progress') {
                                    statusIcon = "◉";
                                    statusColor = "text-yellow-500";
                                    statusText = "Working";
                                  } else if (t.status === 'completed') {
                                    statusIcon = "●";
                                    statusColor = "text-primary";
                                    statusText = "Completed";
                                  } else if (t.status === 'cancelled') {
                                    statusIcon = "✕";
                                    statusColor = "text-destructive";
                                    statusText = "Cancelled";
                                  }
                                  
                                  const canCancel = (t.status === 'pending' || t.status === 'in_progress') && t.status !== 'completed' && t.status !== 'approved' && t.status !== 'cancelled';
                                  
                                  return (
                                    <div key={t.id} className="flex items-center justify-between text-xs">
                                      <span className="truncate">{t.teams?.name || "Unknown"}</span>
                                      <span className="flex items-center gap-1">
                                        <span className={`${statusColor} font-medium flex items-center gap-1`}>
                                          {statusIcon} {statusText}
                                        </span>
                                        {canCancel && (
                                          <button
                                            className="ml-1 p-0.5 rounded hover:bg-destructive/10"
                                            onClick={(e) => { e.stopPropagation(); setCancelDialog({ open: true, taskId: t.id }); }}
                                          >
                                            <XCircle className="h-3 w-3 text-destructive" />
                                          </button>
                                        )}
                                      </span>
                                    </div>
                                  );
                                })}
                              </div>
                            )}
                            <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                              <Calendar className="h-3 w-3" />
                              <span>{format(new Date(task.created_at), 'MMM d, yyyy')}</span>
                            </div>
                            {groupSubmissions.length > 0 && (
                              <div className="flex items-center gap-1.5 text-xs text-primary font-medium">
                                <FileText className="h-3 w-3" />
                                <span>{groupSubmissions.length} file(s) submitted</span>
                              </div>
                            )}
                          </div>
                        </div>
                      </div>

                      {/* Attachments */}
                      {task.attachment_file_path && (
                        <div className="pt-2 border-t">
                          <p className="text-xs text-muted-foreground mb-2">
                            Attachments ({task.attachment_file_path.split('|||').length})
                          </p>
                          <div className="flex flex-wrap gap-2">
                            {task.attachment_file_path.split('|||').slice(0, 3).map((filePath: string, index: number) => {
                              const fileName = task.attachment_file_name?.split('|||')[index] || `attachment_${index + 1}`;
                              return (
                                <div key={index} className="flex items-center gap-2 p-2 bg-muted/30 rounded-lg border hover:border-primary/50 transition-colors">
                                  <FilePreview 
                                    filePath={filePath.trim()}
                                    fileName={fileName.trim()}
                                    className="w-8 h-8"
                                  />
                                  <span className="text-xs max-w-[100px] truncate">{fileName.trim()}</span>
                                  <Button
                                    size="sm"
                                    variant="ghost"
                                    className="h-6 w-6 p-0"
                                    onClick={() => handleDownload(filePath.trim(), fileName.trim())}
                                  >
                                    <Download className="h-3 w-3" />
                                  </Button>
                                </div>
                              );
                            })}
                            {task.attachment_file_path.split('|||').length > 3 && (
                              <span className="text-xs text-muted-foreground self-center">
                                +{task.attachment_file_path.split('|||').length - 3} more
                              </span>
                            )}
                          </div>
                        </div>
                      )}
                    </div>

                    {/* Card Footer */}
                    <div className="px-4 py-3 bg-muted/20 border-t flex items-center justify-between gap-2">
                      <div className="flex gap-2">
                        <Button
                          size="sm"
                          variant="outline"
                          className="hover-scale"
                          onClick={() => setViewDetailsTask(task)}
                        >
                          <FileText className="h-3.5 w-3.5 mr-1.5" />
                          View Details
                        </Button>
                        {task.status === "completed" && (
                          <Button
                            size="sm"
                            className="bg-green-600 hover:bg-green-700 hover-scale"
                            onClick={() =>
                              updateTaskStatus.mutate({ taskId: task.id, status: "approved" })
                            }
                          >
                            <CheckCircle2 className="h-3.5 w-3.5 mr-1.5" />
                            Approve
                          </Button>
                        )}
                        {task.status === "pending" && !(task as any).accepted_by_pm && task.created_by !== user?.id && task.project_manager_id === user?.id && (
                          <>
                            <Button
                              size="sm"
                              className="bg-green-600 hover:bg-green-700 hover-scale"
                              onClick={() => acceptOrder.mutate(task.id)}
                            >
                              <CheckCircle2 className="h-3.5 w-3.5 mr-1.5" />
                              Accept Order
                            </Button>
                            <Button
                              size="sm"
                              variant="outline"
                              className="hover-scale"
                              onClick={() => setReassignDialog({ 
                                open: true, 
                                taskId: task.id, 
                                currentPmId: task.project_manager_id 
                              })}
                            >
                              <RefreshCw className="h-3.5 w-3.5 mr-1.5" />
                              Reassign
                            </Button>
                          </>
                        )}
                        {task.status === "pending" && ((task as any).accepted_by_pm || (task.created_by === user?.id && task.project_manager_id === user?.id)) && (
                          <Badge className="bg-green-100 text-green-700 border-green-300">
                            <CheckCircle2 className="h-3 w-3 mr-1" />
                            Accepted
                          </Badge>
                        )}
                        {/* Cancel button - show before delivery (no submissions) and not already cancelled */}
                        {/* Cancel button in expanded view - for non-multi-team, show for pending/in_progress */}
                        {!group.isMultiTeam && (task.status === "pending" || task.status === "in_progress") && task.project_manager_id === user?.id && (
                          <Button
                            size="sm"
                            variant="outline"
                            className="border-destructive/50 text-destructive hover:bg-destructive/10 hover-scale"
                            onClick={() => setCancelDialog({ 
                              open: true, 
                              taskId: task.id,
                            })}
                          >
                            <XCircle className="h-3.5 w-3.5 mr-1.5" />
                            Cancel Order
                          </Button>
                        )}
                        {/* Show cancellation/deletion reason for cancelled orders */}
                        {task.status === "cancelled" && (task as any).cancellation_reason && (
                          <p className="text-xs text-muted-foreground italic">
                            Reason: {(task as any).cancellation_reason}
                          </p>
                        )}
                      </div>
                      {groupSubmissions.length > 0 && (
                        <Button
                          size="sm"
                          variant="ghost"
                          className="gap-1"
                          onClick={() => setExpandedTaskId(isExpanded ? null : group.groupId)}
                        >
                          {isExpanded ? (
                            <>
                              <ChevronUp className="h-4 w-4" />
                              Hide Files
                            </>
                          ) : (
                            <>
                              <ChevronDown className="h-4 w-4" />
                              Show Files
                            </>
                          )}
                        </Button>
                      )}
                    </div>

                    {/* Expanded Submissions - Organized by Team for Multi-Team Orders */}
                    {isExpanded && groupSubmissions.length > 0 && (
                      <div className="border-t bg-muted/10 p-4 animate-fade-in">
                        <h4 className="text-sm font-semibold mb-3 flex items-center gap-2">
                          <FileText className="h-4 w-4" />
                          Submitted Files {group.isMultiTeam && `(${group.teamNames.length} Teams)`}
                        </h4>
                        
                        {group.isMultiTeam ? (
                          // Multi-team: Show accordion organized by team
                          <Accordion type="multiple" className="space-y-2">
                            {group.allTasks.map((teamTask: any) => {
                              const teamSubmissions = submissions?.filter(s => s.task_id === teamTask.id) || [];
                              const teamName = teamTask.teams?.name || "Unknown Team";
                              const teamStatus = getTeamDeliveryStatus(teamTask, submissions || []);
                              
                              const getTeamStatusBadge = () => {
                                switch (teamStatus.status) {
                                  case 'cancelled':
                                    return <Badge variant="destructive" className="text-xs">Cancelled</Badge>;
                                  case 'pending_delivery':
                                    return <Badge className="bg-yellow-500 text-white text-xs">Pending Delivery</Badge>;
                                  case 'pending_review':
                                    return <Badge className="bg-blue-500 text-white text-xs">Pending Review</Badge>;
                                  case 'needs_revision':
                                    return <Badge variant="destructive" className="text-xs">Needs Revision</Badge>;
                                  case 'approved':
                                    return <Badge className="bg-green-500 text-white text-xs">Approved</Badge>;
                                  default:
                                    return <Badge variant="secondary" className="text-xs">In Progress</Badge>;
                                }
                              };
                              
                              return (
                                <AccordionItem key={teamTask.id} value={teamTask.id} className="border rounded-lg bg-background">
                                  <AccordionTrigger className="px-4 py-2 hover:no-underline">
                                    <div className="flex items-center justify-between w-full pr-4">
                                      <span className="font-medium">{teamName}</span>
                                      <div className="flex items-center gap-2">
                                        {getTeamStatusBadge()}
                                        <Badge variant="outline" className="ml-1">
                                          {teamSubmissions.length} file(s)
                                        </Badge>
                                      </div>
                                    </div>
                                  </AccordionTrigger>
                                  <AccordionContent className="px-4 pb-4">
                                    {teamSubmissions.length === 0 ? (
                                      <div className="flex items-center gap-2 text-sm text-muted-foreground py-2">
                                        <Clock className="h-4 w-4 text-yellow-500" />
                                        <span>Awaiting file upload from designer</span>
                                      </div>
                                    ) : (
                                      <div className="space-y-2">
                                        {teamSubmissions.filter((s: any) => !s.parent_submission_id).map((submission: any) => {
                                          const collectChain = (parentId: string): any[] => {
                                            const children = teamSubmissions.filter((s: any) => s.parent_submission_id === parentId)
                                              .sort((a: any, b: any) => new Date(a.submitted_at || '').getTime() - new Date(b.submitted_at || '').getTime());
                                            return children.flatMap((child: any) => [child, ...collectChain(child.id)]);
                                          };
                                          const childRevisions = collectChain(submission.id);
                                          return (
                                          <div key={submission.id} className="space-y-0">
                                          <div className="flex items-center gap-3 justify-between bg-muted/30 p-3 rounded-lg border hover:border-primary/30 transition-colors">
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
                                                    submission.revision_status === "revised" ? "outline" : "secondary"
                                                  }
                                                  className="text-xs"
                                                >
                                                  {submission.revision_status === "pending_review" ? "Pending Review" : 
                                                   submission.revision_status === "needs_revision" ? "Needs Revision" : 
                                                   submission.revision_status === "revised" ? "Revised" : "Approved"}
                                                </Badge>
                                              </div>
                                              {submission.designer_comment && (
                                                <p className="text-xs text-muted-foreground mt-1 truncate">
                                                  Designer: {submission.designer_comment}
                                                </p>
                                              )}
                                              <p className="text-xs text-muted-foreground">
                                                Submitted: {format(new Date(submission.submitted_at!), 'MMM d, yyyy h:mm a')}
                                              </p>
                                            </div>
                                            <div className="flex items-center gap-2 flex-shrink-0">
                                              <Button
                                                size="sm"
                                                variant="outline"
                                                onClick={() => handleDownload(submission.file_path, submission.file_name)}
                                              >
                                                <Download className="h-3 w-3" />
                                              </Button>
                                              {(submission.revision_status === "pending_review" || submission.revision_status === "approved") && (
                                                <>
                                                  {submission.revision_status === "pending_review" && (
                                                    <Button
                                                      size="sm"
                                                      className="bg-green-600 hover:bg-green-700"
                                                      onClick={() => handleApproveSubmission.mutate(submission.id)}
                                                    >
                                                      Approve
                                                    </Button>
                                                  )}
                                                  <Button
                                                    size="sm"
                                                    variant="outline"
                                                    className="border-orange-300 text-orange-600 hover:bg-orange-50"
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
                                          {/* PM Review block */}
                                          {(submission.revision_notes || submission.revision_reference_file_path) && (
                                            <div className="ml-8 mt-1 border-l-2 border-orange-300 pl-3">
                                              <div className="bg-orange-50 dark:bg-orange-950/20 p-2 rounded-md border border-orange-200 dark:border-orange-800">
                                                <div className="flex items-center justify-between mb-1">
                                                  <p className="text-xs font-medium text-orange-700 dark:text-orange-400">PM Review</p>
                                                  {submission.reviewed_at && (
                                                    <p className="text-xs text-orange-500 dark:text-orange-400/70">{format(new Date(submission.reviewed_at), 'MMM d, yyyy h:mm a')}</p>
                                                  )}
                                                </div>
                                                {submission.revision_notes && (
                                                  <p className="text-xs text-orange-600 dark:text-orange-300">{submission.revision_notes}</p>
                                                )}
                                                {submission.revision_reference_file_path && (
                                                  <div className="space-y-1.5 mt-1.5">
                                                    {submission.revision_reference_file_path.split('|||').map((filePath: string, idx: number) => {
                                                      const fileNames = submission.revision_reference_file_name?.split('|||') || [];
                                                      const fileName = fileNames[idx] || `Reference ${idx + 1}`;
                                                      return (
                                                        <div key={idx} className="flex items-center gap-2 bg-orange-100/50 dark:bg-orange-900/20 p-1.5 rounded">
                                                          <FilePreview filePath={filePath.trim()} fileName={fileName.trim()} />
                                                          <p className="text-xs flex-1 min-w-0 truncate">{fileName.trim()}</p>
                                                          <Button
                                                            size="sm"
                                                            variant="outline"
                                                            className="h-6 text-xs border-orange-300 text-orange-600 hover:bg-orange-100"
                                                            onClick={() => handleDownload(filePath.trim(), fileName.trim())}
                                                          >
                                                            <Download className="h-2.5 w-2.5" />
                                                          </Button>
                                                        </div>
                                                      );
                                                    })}
                                                  </div>
                                                )}
                                              </div>
                                            </div>
                                          )}
                                          {/* Child revision files nested under parent */}
                                          {childRevisions.length > 0 && (
                                            <div className="ml-8 mt-1 space-y-1 border-l-2 border-primary/20 pl-3">
                                              <p className="text-xs font-medium text-muted-foreground">Revision(s) delivered:</p>
                                              {childRevisions.map((rev: any, idx: number) => (
                                                <div key={rev.id} className="space-y-0">
                                                <div className="flex items-center gap-3 justify-between bg-green-50 dark:bg-green-950/20 p-2 rounded-md border border-green-200 dark:border-green-800">
                                                  <FilePreview filePath={rev.file_path} fileName={rev.file_name} />
                                                  <div className="flex-1 min-w-0">
                                                    <div className="flex items-center gap-2">
                                                    <p className="text-sm font-medium truncate">{rev.file_name}</p>
                                                    {rev.designer_comment && (
                                                      <p className="text-xs text-muted-foreground mt-0.5 truncate">
                                                        Designer: {rev.designer_comment}
                                                      </p>
                                                    )}
                                                    <p className="text-xs text-muted-foreground">
                                                      {format(new Date(rev.submitted_at!), 'MMM d, yyyy h:mm a')}
                                                    </p>
                                                  </div>
                                                  <div className="flex items-center gap-2 flex-shrink-0">
                                                    <Badge variant="outline" className="text-xs border-orange-400 text-orange-600 dark:text-orange-400">
                                                      <RefreshCw className="h-2.5 w-2.5 mr-1" />
                                                      Revision {idx + 1}
                                                    </Badge>
                                                    </div>
                                                    <Button size="sm" variant="outline" onClick={() => handleDownload(rev.file_path, rev.file_name)}>
                                                      <Download className="h-3 w-3" />
                                                    </Button>
                                                    {(rev.revision_status === "pending_review" || rev.revision_status === "approved") && (
                                                      <>
                                                        {rev.revision_status === "pending_review" && (
                                                          <Button size="sm" className="bg-green-600 hover:bg-green-700" onClick={() => handleApproveSubmission.mutate(rev.id)}>
                                                            Approve
                                                          </Button>
                                                        )}
                                                        <Button size="sm" variant="outline" className="border-orange-300 text-orange-600 hover:bg-orange-50"
                                                          onClick={() => setRevisionDialog({ open: true, submissionId: rev.id, fileName: rev.file_name })}>
                                                          Request Revision
                                                        </Button>
                                                      </>
                                                    )}
                                                  </div>
                                                </div>
                                                {/* PM Review block for revision delivery */}
                                                {(rev.revision_notes || rev.revision_reference_file_path) && (
                                                  <div className="mt-1 border-l-2 border-orange-300 pl-3">
                                                    <div className="bg-orange-50 dark:bg-orange-950/20 p-2 rounded-md border border-orange-200 dark:border-orange-800">
                                                      <div className="flex items-center justify-between mb-1">
                                                        <p className="text-xs font-medium text-orange-700 dark:text-orange-400">PM Review</p>
                                                        {rev.reviewed_at && (
                                                          <p className="text-xs text-orange-500 dark:text-orange-400/70">{format(new Date(rev.reviewed_at), 'MMM d, yyyy h:mm a')}</p>
                                                        )}
                                                      </div>
                                                      {rev.revision_notes && (
                                                        <p className="text-xs text-orange-600 dark:text-orange-300">{rev.revision_notes}</p>
                                                      )}
                                                      {rev.revision_reference_file_path && (
                                                        <div className="space-y-1.5 mt-1.5">
                                                          {rev.revision_reference_file_path.split('|||').map((filePath: string, idx: number) => {
                                                            const fileNames = rev.revision_reference_file_name?.split('|||') || [];
                                                            const fileName = fileNames[idx] || `Reference ${idx + 1}`;
                                                            return (
                                                              <div key={idx} className="flex items-center gap-2 bg-orange-100/50 dark:bg-orange-900/20 p-1.5 rounded">
                                                                <FilePreview filePath={filePath.trim()} fileName={fileName.trim()} />
                                                                <p className="text-xs flex-1 min-w-0 truncate">{fileName.trim()}</p>
                                                                <Button size="sm" variant="outline" className="h-6 text-xs border-orange-300 text-orange-600 hover:bg-orange-100" onClick={() => handleDownload(filePath.trim(), fileName.trim())}>
                                                                  <Download className="h-2.5 w-2.5" />
                                                                </Button>
                                                              </div>
                                                            );
                                                          })}
                                                        </div>
                                                      )}
                                                    </div>
                                                  </div>
                                                )}
                                                </div>
                                              ))}
                                            </div>
                                          )}
                                          </div>
                                          );
                                        })}
                                      </div>
                                    )}
                                  </AccordionContent>
                                </AccordionItem>
                              );
                            })}
                          </Accordion>
                        ) : (
                          // Single team: Show flat list as before
                          <div className="space-y-2">
                            {groupSubmissions.filter((s: any) => !s.parent_submission_id).map((submission: any) => {
                              const collectChain = (parentId: string): any[] => {
                                const children = groupSubmissions.filter((s: any) => s.parent_submission_id === parentId)
                                  .sort((a: any, b: any) => new Date(a.submitted_at || '').getTime() - new Date(b.submitted_at || '').getTime());
                                return children.flatMap((child: any) => [child, ...collectChain(child.id)]);
                              };
                              const childRevisions = collectChain(submission.id);
                              return (
                              <div key={submission.id} className="space-y-0">
                              <div className="flex items-center gap-3 justify-between bg-background p-3 rounded-lg border hover:border-primary/30 transition-colors">
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
                                        submission.revision_status === "revised" ? "outline" : "secondary"
                                      }
                                      className="text-xs"
                                    >
                                      {submission.revision_status === "pending_review" ? "Pending Review" : 
                                       submission.revision_status === "needs_revision" ? "Needs Revision" : 
                                       submission.revision_status === "revised" ? "Revised" : "Approved"}
                                    </Badge>
                                  </div>
                                  {submission.designer_comment && (
                                    <p className="text-xs text-muted-foreground mt-1 truncate">
                                      Designer: {submission.designer_comment}
                                    </p>
                                  )}
                                  <p className="text-xs text-muted-foreground">
                                    Submitted: {format(new Date(submission.submitted_at!), 'MMM d, yyyy h:mm a')}
                                  </p>
                                </div>
                                <div className="flex items-center gap-2 flex-shrink-0">
                                  <Button
                                    size="sm"
                                    variant="outline"
                                    onClick={() => handleDownload(submission.file_path, submission.file_name)}
                                  >
                                    <Download className="h-3 w-3" />
                                  </Button>
                                  {(submission.revision_status === "pending_review" || submission.revision_status === "approved") && (
                                    <>
                                      {submission.revision_status === "pending_review" && (
                                        <Button
                                          size="sm"
                                          className="bg-green-600 hover:bg-green-700"
                                          onClick={() => handleApproveSubmission.mutate(submission.id)}
                                        >
                                          Approve
                                        </Button>
                                      )}
                                      <Button
                                        size="sm"
                                        variant="outline"
                                        className="border-orange-300 text-orange-600 hover:bg-orange-50"
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
                              {/* PM Review block */}
                              {(submission.revision_notes || submission.revision_reference_file_path) && (
                                <div className="ml-8 mt-1 border-l-2 border-orange-300 pl-3">
                                  <div className="bg-orange-50 dark:bg-orange-950/20 p-2 rounded-md border border-orange-200 dark:border-orange-800">
                                    <div className="flex items-center justify-between mb-1">
                                      <p className="text-xs font-medium text-orange-700 dark:text-orange-400">PM Review</p>
                                      {submission.reviewed_at && (
                                        <p className="text-xs text-orange-500 dark:text-orange-400/70">{format(new Date(submission.reviewed_at), 'MMM d, yyyy h:mm a')}</p>
                                      )}
                                    </div>
                                    {submission.revision_notes && (
                                      <p className="text-xs text-orange-600 dark:text-orange-300">{submission.revision_notes}</p>
                                    )}
                                    {submission.revision_reference_file_path && (
                                      <div className="space-y-1.5 mt-1.5">
                                        {submission.revision_reference_file_path.split('|||').map((filePath: string, idx: number) => {
                                          const fileNames = submission.revision_reference_file_name?.split('|||') || [];
                                          const fileName = fileNames[idx] || `Reference ${idx + 1}`;
                                          return (
                                            <div key={idx} className="flex items-center gap-2 bg-orange-100/50 dark:bg-orange-900/20 p-1.5 rounded">
                                              <FilePreview filePath={filePath.trim()} fileName={fileName.trim()} />
                                              <p className="text-xs flex-1 min-w-0 truncate">{fileName.trim()}</p>
                                              <Button
                                                size="sm"
                                                variant="outline"
                                                className="h-6 text-xs border-orange-300 text-orange-600 hover:bg-orange-100"
                                                onClick={() => handleDownload(filePath.trim(), fileName.trim())}
                                              >
                                                <Download className="h-2.5 w-2.5" />
                                              </Button>
                                            </div>
                                          );
                                        })}
                                      </div>
                                    )}
                                  </div>
                                </div>
                              )}
                              {/* Child revision files nested under parent */}
                              {childRevisions.length > 0 && (
                                <div className="ml-8 mt-1 space-y-1 border-l-2 border-primary/20 pl-3">
                                  <p className="text-xs font-medium text-muted-foreground">Revision(s) delivered:</p>
                                  {childRevisions.map((rev: any, idx: number) => (
                                    <div key={rev.id} className="space-y-0">
                                    <div className="flex items-center gap-3 justify-between bg-green-50 dark:bg-green-950/20 p-2 rounded-md border border-green-200 dark:border-green-800">
                                      <FilePreview filePath={rev.file_path} fileName={rev.file_name} />
                                      <div className="flex-1 min-w-0">
                                        <div className="flex items-center gap-2">
                                        <p className="text-sm font-medium truncate">{rev.file_name}</p>
                                        <Badge variant="outline" className="text-xs border-orange-400 text-orange-600 dark:text-orange-400">
                                          <RefreshCw className="h-2.5 w-2.5 mr-1" />
                                          Revision {idx + 1}
                                        </Badge>
                                        </div>
                                        {rev.designer_comment && (
                                          <p className="text-xs text-muted-foreground mt-0.5 truncate">
                                            Designer: {rev.designer_comment}
                                          </p>
                                        )}
                                        <p className="text-xs text-muted-foreground">
                                          {format(new Date(rev.submitted_at!), 'MMM d, yyyy h:mm a')}
                                        </p>
                                      </div>
                                      <div className="flex items-center gap-2 flex-shrink-0">
                                        <Button size="sm" variant="outline" onClick={() => handleDownload(rev.file_path, rev.file_name)}>
                                          <Download className="h-3 w-3" />
                                        </Button>
                                        {(rev.revision_status === "pending_review" || rev.revision_status === "approved") && (
                                          <>
                                            {rev.revision_status === "pending_review" && (
                                              <Button size="sm" className="bg-green-600 hover:bg-green-700" onClick={() => handleApproveSubmission.mutate(rev.id)}>
                                                Approve
                                              </Button>
                                            )}
                                            <Button size="sm" variant="outline" className="border-orange-300 text-orange-600 hover:bg-orange-50"
                                              onClick={() => setRevisionDialog({ open: true, submissionId: rev.id, fileName: rev.file_name })}>
                                              Request Revision
                                            </Button>
                                          </>
                                        )}
                                      </div>
                                    </div>
                                    {/* PM Review block for revision delivery */}
                                    {(rev.revision_notes || rev.revision_reference_file_path) && (
                                      <div className="mt-1 border-l-2 border-orange-300 pl-3">
                                        <div className="bg-orange-50 dark:bg-orange-950/20 p-2 rounded-md border border-orange-200 dark:border-orange-800">
                                          <div className="flex items-center justify-between mb-1">
                                            <p className="text-xs font-medium text-orange-700 dark:text-orange-400">PM Review</p>
                                            {rev.reviewed_at && (
                                              <p className="text-xs text-orange-500 dark:text-orange-400/70">{format(new Date(rev.reviewed_at), 'MMM d, yyyy h:mm a')}</p>
                                            )}
                                          </div>
                                          {rev.revision_notes && (
                                            <p className="text-xs text-orange-600 dark:text-orange-300">{rev.revision_notes}</p>
                                          )}
                                          {rev.revision_reference_file_path && (
                                            <div className="space-y-1.5 mt-1.5">
                                              {rev.revision_reference_file_path.split('|||').map((filePath: string, idx: number) => {
                                                const fileNames = rev.revision_reference_file_name?.split('|||') || [];
                                                const fileName = fileNames[idx] || `Reference ${idx + 1}`;
                                                return (
                                                  <div key={idx} className="flex items-center gap-2 bg-orange-100/50 dark:bg-orange-900/20 p-1.5 rounded">
                                                    <FilePreview filePath={filePath.trim()} fileName={fileName.trim()} />
                                                    <p className="text-xs flex-1 min-w-0 truncate">{fileName.trim()}</p>
                                                    <Button size="sm" variant="outline" className="h-6 text-xs border-orange-300 text-orange-600 hover:bg-orange-100" onClick={() => handleDownload(filePath.trim(), fileName.trim())}>
                                                      <Download className="h-2.5 w-2.5" />
                                                    </Button>
                                                  </div>
                                                );
                                              })}
                                            </div>
                                          )}
                                        </div>
                                      </div>
                                    )}
                                    </div>
                                  ))}
                                </div>
                              )}
                              </div>
                              );
                            })}
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
              {filteredOrders.length === 0 && (
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
                  {isWebsiteOrder(viewDetailsTask) && (
                    <>
                      <div>
                        <Label className="text-muted-foreground">Business Email</Label>
                        <p className="font-medium">{(viewDetailsTask as any)?.business_email || "N/A"}</p>
                      </div>
                      <div>
                        <Label className="text-muted-foreground">Business Phone</Label>
                        <p className="font-medium">{(viewDetailsTask as any)?.business_phone || "N/A"}</p>
                      </div>
                    </>
                  )}
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
                </div>
              </div>

              {/* Cancellation/Deletion Details - Only for Cancelled Orders */}
              {viewDetailsTask?.status === "cancelled" && (
                <div className="space-y-3 bg-destructive/10 border border-destructive/20 rounded-lg p-4">
                  <h3 className="font-semibold text-lg text-destructive">{(viewDetailsTask as any)?.is_deleted ? 'Deletion' : 'Cancellation'} Details</h3>
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <Label className="text-muted-foreground">{(viewDetailsTask as any)?.is_deleted ? 'Deleted' : 'Cancelled'} At</Label>
                      <p className="font-medium">{(viewDetailsTask as any)?.cancelled_at ? new Date((viewDetailsTask as any).cancelled_at).toLocaleString() : "N/A"}</p>
                    </div>
                    <div>
                      <Label className="text-muted-foreground">Status</Label>
                      <Badge className="bg-destructive text-destructive-foreground">{(viewDetailsTask as any)?.is_deleted ? 'Deleted' : 'Cancelled'}</Badge>
                    </div>
                  </div>
                  <div>
                    <Label className="text-muted-foreground">Reason</Label>
                    <p className="font-medium whitespace-pre-wrap">{(viewDetailsTask as any)?.cancellation_reason || "No reason provided"}</p>
                  </div>
                </div>
              )}

              {/* Order Attribution */}
              <div className="space-y-3">
                <h3 className="font-semibold text-lg border-b pb-2">Order Attribution</h3>
                <div className="grid grid-cols-3 gap-4">
                  <div>
                    <Label className="text-muted-foreground">Assigned PM</Label>
                    <p className="font-medium">{(viewDetailsTask as any)?.project_manager_profile?.full_name || (viewDetailsTask as any)?.project_manager_profile?.email || "N/A"}</p>
                  </div>
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

              {/* Logo Details - Only for Logo Orders */}
              {isLogoOrder(viewDetailsTask) && (
                <div className="space-y-3">
                  <h3 className="font-semibold text-lg border-b pb-2">Logo Details</h3>
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <Label className="text-muted-foreground">Look & Feel</Label>
                      <p className="font-medium">{viewDetailsTask?.logo_style || "N/A"}</p>
                    </div>
                    <div>
                      <Label className="text-muted-foreground">Color Combination</Label>
                      <p className="font-medium">{viewDetailsTask?.brand_colors || "N/A"}</p>
                    </div>
                  </div>
                  <div>
                    <Label className="text-muted-foreground">Primary Focus</Label>
                    <p className="font-medium whitespace-pre-wrap">{viewDetailsTask?.description || "N/A"}</p>
                  </div>
                </div>
              )}

              {/* Website Details - Only for Website Orders */}
              {isWebsiteOrder(viewDetailsTask) && (
                <div className="space-y-3">
                  <h3 className="font-semibold text-lg border-b pb-2">Website Details</h3>
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <Label className="text-muted-foreground">Number of Pages</Label>
                      <p className="font-medium">{viewDetailsTask?.number_of_pages || "N/A"}</p>
                    </div>
                    <div>
                      <Label className="text-muted-foreground">Video Keywords</Label>
                      <p className="font-medium">{(viewDetailsTask as any)?.video_keywords || "N/A"}</p>
                    </div>
                  </div>
                  <div>
                    <Label className="text-muted-foreground">Supporting Text</Label>
                    <p className="font-medium whitespace-pre-wrap">{viewDetailsTask?.supporting_text || "N/A"}</p>
                  </div>
                  <div>
                    <Label className="text-muted-foreground">Design References</Label>
                    <p className="font-medium">{viewDetailsTask?.design_references || "N/A"}</p>
                  </div>
                  
                  {/* Logo Files for Website Orders */}
                  {viewDetailsTask?.logo_url && (
                    <div className="space-y-3">
                      <Label className="text-muted-foreground">Logo Files</Label>
                      <div className="space-y-3">
                        {viewDetailsTask.logo_url.split('|||').map((filePath: string, index: number) => {
                          const fileName = filePath.split('/').pop() || `logo_${index + 1}`;
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

              {/* Product/Service Information - Only for Social Media Posts */}
              {!isLogoOrder(viewDetailsTask) && !isWebsiteOrder(viewDetailsTask) && (
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
              )}

              {/* Design Requirements - Only for Social Media Posts */}
              {!isLogoOrder(viewDetailsTask) && !isWebsiteOrder(viewDetailsTask) && (
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
              )}

              {/* Content - Only for Social Media Posts */}
              {!isLogoOrder(viewDetailsTask) && !isWebsiteOrder(viewDetailsTask) && (
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

              {/* Target Audience - Only for Social Media Posts */}
              {!isLogoOrder(viewDetailsTask) && !isWebsiteOrder(viewDetailsTask) && (
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
              )}

              {/* Additional Notes */}
              {(viewDetailsTask?.notes_extra_instructions || viewDetailsTask?.additional_details) && (
                <div className="space-y-3">
                  <h3 className="font-semibold text-lg border-b pb-2">Additional Notes</h3>
                  <div className="space-y-3">
                    {viewDetailsTask?.notes_extra_instructions && (
                      <div>
                        <Label className="text-muted-foreground">Extra Instructions</Label>
                        <p className="font-medium whitespace-pre-wrap">{viewDetailsTask.notes_extra_instructions}</p>
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
                accept="image/*,.pdf,.ai,.psd,.fig,.sketch,audio/*,video/*,.mp3,.wav,.m4a,.aac,.ogg,.mp4,.mov,.avi,.mkv,.webm,.zip"
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

      

      <Dialog open={reassignDialog?.open || false} onOpenChange={(open) => {
        if (!open) {
          setReassignDialog(null);
          setReassignReason("");
          setSelectedNewPmId("");
        }
      }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Reassign Task</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="new-pm">Select New Project Manager *</Label>
              <Select value={selectedNewPmId} onValueChange={setSelectedNewPmId}>
                <SelectTrigger id="new-pm">
                  <SelectValue placeholder="Select Project Manager" />
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
              disabled={!selectedNewPmId || !reassignReason.trim()}
              className="w-full"
            >
              Reassign Task
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={cancelDialog?.open || false} onOpenChange={(open) => {
        if (!open) {
          setCancelDialog(null);
          setCancelReason("");
        }
      }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Cancel Order</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">
              Are you sure you want to cancel this order? This action will move it to cancelled orders.
            </p>
            <div className="space-y-2">
              <Label htmlFor="cancel-reason">Cancellation Reason *</Label>
              <Textarea
                id="cancel-reason"
                value={cancelReason}
                onChange={(e) => setCancelReason(e.target.value)}
                placeholder="Explain why this order is being cancelled..."
                rows={4}
              />
            </div>
            <Button
              onClick={() => cancelDialog && cancelOrder.mutate({ 
                taskId: cancelDialog.taskId, 
                reason: cancelReason,
              })}
              disabled={!cancelReason.trim()}
              className="w-full bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Cancel Order
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default PMDashboard;
