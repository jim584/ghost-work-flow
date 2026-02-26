import { useState, useMemo, useEffect } from "react";

import { calculateOverdueWorkingMinutes, CalendarConfig, LeaveRecord } from "@/utils/workingHours";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { LogOut, Plus, CheckCircle2, Clock, FolderKanban, Download, ChevronDown, ChevronUp, FileText, Globe, User, Mail, Phone, DollarSign, Calendar, Users, Image, Palette, RefreshCw, XCircle, Ban, MessageCircle, RotateCcw, AlertTriangle, PauseCircle, PlayCircle, Rocket, ArrowUpRight, Paperclip } from "lucide-react";
import { OrderChat, useUnreadMessageCounts } from "@/components/OrderChat";

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
import { format, subDays, isAfter, formatDistanceToNow } from "date-fns";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { PhaseReviewSection, ExternalReviewTrigger } from "./PhaseReviewSection";
import { LatestSubmissionPanel } from "./LatestSubmissionPanel";

const PMDashboard = () => {
  const { user, signOut } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  // Realtime subscription for phase_reviews, project_phases, and phase_review_replies
  useEffect(() => {
    const channel = supabase
      .channel('pm-phase-reviews-realtime')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'phase_reviews' }, () => {
        queryClient.invalidateQueries({ queryKey: ["pm-tasks"] });
        queryClient.invalidateQueries({ queryKey: ["pm-phase-reviews"] });
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'project_phases' }, () => {
        queryClient.invalidateQueries({ queryKey: ["pm-tasks"] });
        queryClient.invalidateQueries({ queryKey: ["pm-project-phases"] });
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'phase_review_replies' }, () => {
        queryClient.invalidateQueries({ queryKey: ["pm-unread-replies"] });
      })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [queryClient]);

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

  // Fetch reassignment history for view details
  const { data: reassignmentHistory } = useQuery({
    queryKey: ["pm-reassignment-history", viewDetailsTask?.id],
    queryFn: async () => {
      if (!viewDetailsTask?.id) return [];
      const { data, error } = await supabase
        .from("reassignment_history" as any)
        .select("*")
        .eq("task_id", viewDetailsTask.id)
        .order("created_at", { ascending: false });
      if (error) throw error;
      if (data && data.length > 0) {
        const devIds = new Set<string>();
        data.forEach((entry: any) => {
          if (entry.from_developer_id) devIds.add(entry.from_developer_id);
          if (entry.to_developer_id) devIds.add(entry.to_developer_id);
        });
        const { data: devs } = await supabase
          .from("developers")
          .select("id, name")
          .in("id", Array.from(devIds));
        const devMap = new Map(devs?.map(d => [d.id, d.name]) || []);
        return data.map((entry: any) => ({
          ...entry,
          from_name: devMap.get(entry.from_developer_id) || null,
          to_name: devMap.get(entry.to_developer_id) || null,
        }));
      }
      return data || [];
    },
    enabled: !!viewDetailsTask?.id,
  });

  // Fetch hold/resume history for view details
  const { data: holdHistory } = useQuery({
    queryKey: ["pm-hold-history", viewDetailsTask?.id],
    queryFn: async () => {
      if (!viewDetailsTask?.id) return [];
      const { data, error } = await (supabase as any)
        .from("task_hold_events")
        .select("*")
        .eq("task_id", viewDetailsTask.id)
        .order("created_at", { ascending: true });
      if (error) throw error;
      if (data && data.length > 0) {
        const userIds = [...new Set(data.map((e: any) => e.performed_by))] as string[];
        const { data: profiles } = await supabase
          .from("profiles")
          .select("id, full_name, email")
          .in("id", userIds);
        const nameMap = new Map(profiles?.map(p => [p.id, p.full_name || p.email]) || []);
        return data.map((e: any) => ({ ...e, performer_name: nameMap.get(e.performed_by) || "Unknown" }));
      }
      return data || [];
    },
    enabled: !!viewDetailsTask?.id,
  });

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
  const [holdOrderDialog, setHoldOrderDialog] = useState<{ open: boolean; taskId: string }>({ open: false, taskId: "" });
  const [holdOrderReason, setHoldOrderReason] = useState("");
  const [chatTask, setChatTask] = useState<any>(null);
  const [launchDialog, setLaunchDialog] = useState<{ taskId: string; taskTitle: string; developerId: string | null } | null>(null);
  const [launchData, setLaunchData] = useState({
    domain: "",
    accessMethod: "",
    domainProvider: "",
    hostingUsername: "",
    hostingPassword: "",
    hostingProvider: "plex_hosting",
    hostingTotal: "",
    hostingPaid: "",
    hostingPending: "",
    hostingAccessMethod: "",
    hostingProviderName: "",
    hostingCredUsername: "",
    hostingCredPassword: "",
  });

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
      // closedOrders only visible for 3 days from creation
      const threeDaysAgo = subDays(new Date(), 3);
      const taskMap = new Map<string, any>();
      assignedOrders?.forEach(task => taskMap.set(task.id, task));
      closedOrders?.filter(task => task.created_at && isAfter(new Date(task.created_at), threeDaysAgo))
        .forEach(task => {
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

  // Unread message counts for chat
  const { data: unreadCounts } = useUnreadMessageCounts(taskIds);

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

  // Fetch project phases for website orders
  const { data: projectPhases } = useQuery({
    queryKey: ["pm-project-phases", taskIds],
    queryFn: async () => {
      if (!taskIds.length) return [];
      const websiteTaskIds = tasks?.filter(t => t.post_type === "Website Design").map(t => t.id) || [];
      if (!websiteTaskIds.length) return [];
      const { data, error } = await supabase
        .from("project_phases")
        .select("*")
        .in("task_id", websiteTaskIds)
        .order("phase_number", { ascending: true });
      if (error) throw error;
      return data;
    },
    enabled: !!taskIds.length,
  });

  // Fetch developer calendars for working-hours overdue calculation
  const { data: developerCalendars } = useQuery({
    queryKey: ["pm-developer-calendars"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("developers")
        .select("id, user_id, availability_calendar_id, timezone, availability_calendars(working_days, start_time, end_time, saturday_start_time, saturday_end_time, timezone)")
        .eq("is_active", true);
      if (error) throw error;
      return data;
    },
  });

  const { data: allLeaveRecords } = useQuery({
    queryKey: ["pm-leave-records"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("leave_records")
        .select("developer_id, leave_start_datetime, leave_end_datetime")
        .eq("status", "approved");
      if (error) throw error;
      return data;
    },
  });

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

      // Auto-update task status to 'approved' if all active submissions are now approved
      const { data: submission } = await supabase
        .from("design_submissions")
        .select("task_id")
        .eq("id", submissionId)
        .single();

      if (submission) {
        const { data: allSubs } = await supabase
          .from("design_submissions")
          .select("revision_status")
          .eq("task_id", submission.task_id);

        const activeSubs = allSubs?.filter(s => s.revision_status !== 'revised') || [];
        const allApproved = activeSubs.length > 0 && activeSubs.every(s => s.revision_status === 'approved');

        if (allApproved) {
          await supabase
            .from("tasks")
            .update({ status: "approved" as any })
            .eq("id", submission.task_id);
        }
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["design-submissions"] });
      queryClient.invalidateQueries({ queryKey: ["pm-tasks"] });
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

  // Fetch unread developer replies for PM's tasks
  const { data: unreadReplies } = useQuery({
    queryKey: ["pm-unread-replies", taskIds],
    queryFn: async () => {
      if (!taskIds.length) return [];
      const { data, error } = await supabase
        .from("phase_review_replies")
        .select("id, task_id, pm_read_at, user_id")
        .in("task_id", taskIds)
        .is("pm_read_at", null)
        .neq("user_id", user!.id); // exclude PM's own replies
      if (error) throw error;
      return data || [];
    },
    enabled: !!taskIds.length,
  });

  const getUnreadReplyCount = (taskId: string) => {
    return unreadReplies?.filter(r => r.task_id === taskId).length || 0;
  };

  // Fetch phase reviews for website orders (to check latest round status)
  const { data: phaseReviews } = useQuery({
    queryKey: ["pm-phase-reviews", taskIds],
    queryFn: async () => {
      const websiteTaskIds = tasks?.filter(t => t.post_type === "Website Design").map(t => t.id) || [];
      if (!websiteTaskIds.length) return [];
      const { data, error } = await supabase
        .from("phase_reviews")
        .select("*")
        .in("task_id", websiteTaskIds)
        .order("round_number", { ascending: false });
      if (error) throw error;
      return data;
    },
    enabled: !!taskIds.length,
  });
  const [externalReviewTrigger, setExternalReviewTrigger] = useState<Record<string, ExternalReviewTrigger | null>>({});


  // Direct phase approve mutation for LatestSubmissionPanel
  const directPhaseApprove = useMutation({
    mutationFn: async ({ phaseId, taskId }: { phaseId: string; taskId: string }) => {
      const now = new Date().toISOString();
      
      // Get existing reviews count for round number
      const { data: existingReviews } = await supabase
        .from("phase_reviews")
        .select("round_number")
        .eq("phase_id", phaseId)
        .order("round_number", { ascending: false })
        .limit(1);
      
      const nextRound = existingReviews && existingReviews.length > 0 
        ? existingReviews[0].round_number + 1 : 1;
      
      // Insert phase review record
      const { error: insertError } = await supabase
        .from("phase_reviews")
        .insert({
          phase_id: phaseId,
          task_id: taskId,
          review_status: "approved",
          reviewed_by: user!.id,
          reviewed_at: now,
          round_number: nextRound,
        });
      if (insertError) throw insertError;

      // Update the project_phases record
      const { error } = await supabase
        .from("project_phases")
        .update({
          review_status: "approved",
          reviewed_at: now,
          reviewed_by: user!.id,
          status: "completed",
          completed_at: now,
        })
        .eq("id", phaseId);
      if (error) throw error;

      // Notify developer
      const task = tasks?.find(t => t.id === taskId);
      if (task?.developer_id) {
        const { data: dev } = await supabase
          .from("developers")
          .select("user_id")
          .eq("id", task.developer_id)
          .single();
        if (dev?.user_id) {
          const phase = projectPhases?.find(p => p.id === phaseId);
          const phaseLabel = phase?.phase_number === 1 ? "Homepage" : `Phase ${phase?.phase_number}`;
          await supabase.from("notifications").insert({
            user_id: dev.user_id,
            type: "phase_review",
            title: "Phase Review: Approved",
            message: `${phaseLabel} for "${task.title}" has been approved.`,
            task_id: taskId,
          });
        }
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["pm-tasks"] });
      queryClient.invalidateQueries({ queryKey: ["pm-project-phases"] });
      queryClient.invalidateQueries({ queryKey: ["pm-phase-reviews"] });
      toast({ title: "Phase approved" });
    },
    onError: (error: any) => {
      toast({ variant: "destructive", title: "Error approving phase", description: error.message });
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

  const launchWebsite = useMutation({
    mutationFn: async ({ taskId, taskTitle, developerId, launch }: { 
      taskId: string; taskTitle: string; developerId: string | null;
      launch: typeof launchData;
    }) => {
      const isNameserverFlow = launch.accessMethod === "nameservers";
      const isDnsFlow = launch.accessMethod === "dns_records";
      const isDelegateFlow = launch.accessMethod === "delegate";
      const isHostingDelegate = launch.hostingProvider === "client_hosting" && launch.hostingAccessMethod === "hosting_delegate";
      const isSelfLaunch = launch.hostingProvider === "client_hosting" && launch.hostingAccessMethod === "self_launch";
      
      // Update task with launch details and set status to approved
      const { error } = await supabase
        .from("tasks")
        .update({ 
          status: "approved" as any,
          launch_domain: launch.domain,
          launch_access_method: launch.accessMethod,
           launch_domain_username: launch.accessMethod === "credentials" ? launch.hostingUsername : null,
           launch_domain_password: launch.accessMethod === "credentials" ? launch.hostingPassword : null,
           launch_hosting_username: launch.hostingAccessMethod === "hosting_credentials" ? launch.hostingCredUsername : null,
           launch_hosting_password: launch.hostingAccessMethod === "hosting_credentials" ? launch.hostingCredPassword : null,
           launch_domain_provider: launch.accessMethod === "credentials" ? launch.domainProvider : null,
          launch_hosting_provider: launch.hostingProvider,
          launch_hosting_total: launch.hostingProvider === "plex_hosting" ? Number(launch.hostingTotal) || 0 : 0,
          launch_hosting_paid: launch.hostingProvider === "plex_hosting" ? Number(launch.hostingPaid) || 0 : 0,
          launch_hosting_pending: launch.hostingProvider === "plex_hosting" ? Number(launch.hostingPending) || 0 : 0,
          ...(isNameserverFlow ? { launch_nameserver_status: "pending_nameservers" } : {}),
          ...(isDnsFlow ? { launch_dns_status: "pending_dns" } : {}),
          ...(isDelegateFlow ? { launch_delegate_status: "pending_delegation" } : {}),
          ...(launch.hostingProvider === "client_hosting" ? { 
            launch_hosting_access_method: launch.hostingAccessMethod,
            launch_hosting_provider_name: launch.hostingProviderName,
          } : {}),
          ...(isHostingDelegate ? { launch_hosting_delegate_status: "pending_delegation" } : {}),
          ...(isSelfLaunch ? { launch_self_launch_status: "pending_link" } : {}),
        } as any)
        .eq("id", taskId);
      if (error) throw error;

      // Find the developer's user_id to send notification
      if (developerId) {
        const { data: developer } = await supabase
          .from("developers")
          .select("user_id")
          .eq("id", developerId)
          .single();

        if (developer?.user_id) {
          if (isNameserverFlow) {
            await supabase.from("notifications").insert({
              user_id: developer.user_id,
              type: "nameserver_request",
              title: "Provide Nameservers",
              message: `Please provide nameservers for domain: ${launch.domain}`,
              task_id: taskId,
            });
          } else if (isDnsFlow) {
            await supabase.from("notifications").insert({
              user_id: developer.user_id,
              type: "dns_request",
              title: "Provide DNS Records",
              message: `Please provide DNS records for domain: ${launch.domain}`,
              task_id: taskId,
            });
          } else if (isDelegateFlow) {
            await supabase.from("notifications").insert({
              user_id: developer.user_id,
              type: "delegate_request",
              title: "Verify Delegate Access",
              message: `Verify delegate access for domain: ${launch.domain}. Client will delegate access to Charley@plexLogo.com`,
              task_id: taskId,
            });
          }
          
          // Hosting-level notifications
          if (isHostingDelegate) {
            await supabase.from("notifications").insert({
              user_id: developer.user_id,
              type: "hosting_delegate_request",
              title: "Hosting Delegate Access Pending",
              message: `Client will delegate hosting access (${launch.hostingProviderName || 'hosting'}) to Charley@plexLogo.com for ${launch.domain}`,
              task_id: taskId,
            });
          } else if (isSelfLaunch) {
            await supabase.from("notifications").insert({
              user_id: developer.user_id,
              type: "self_launch_link_request",
              title: "Generate WeTransfer Link",
              message: `Client will self-launch ${launch.domain}. Please generate a WeTransfer download link for the website files.`,
              task_id: taskId,
            });
          }
          
          // General launch notification (only if no special domain flow)
          if (!isNameserverFlow && !isDnsFlow && !isDelegateFlow) {
            await supabase.from("notifications").insert({
              user_id: developer.user_id,
              type: "website_launch",
              title: "Website Ready for Launch",
              message: `${taskTitle} has been approved and is ready for launch`,
              task_id: taskId,
            });
          }
        }
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["pm-tasks"] });
      toast({ title: "Website sent for launch" });
      setLaunchDialog(null);
      setLaunchData({
        domain: "", accessMethod: "", domainProvider: "", hostingUsername: "", hostingPassword: "",
        hostingProvider: "plex_hosting", hostingTotal: "", hostingPaid: "", hostingPending: "",
        hostingAccessMethod: "", hostingProviderName: "", hostingCredUsername: "", hostingCredPassword: "",
      });
    },
  });

  const forwardNameservers = useMutation({
    mutationFn: async ({ taskId }: { taskId: string }) => {
      const { error } = await supabase
        .from("tasks")
        .update({ launch_nameserver_status: "forwarded_to_client" } as any)
        .eq("id", taskId);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["pm-tasks"] });
      toast({ title: "Nameservers forwarded to client" });
    },
  });

  const confirmNameservers = useMutation({
    mutationFn: async ({ taskId, developerId, domain }: { taskId: string; developerId: string | null; domain: string }) => {
      const { error } = await supabase
        .from("tasks")
        .update({ launch_nameserver_status: "nameservers_confirmed" } as any)
        .eq("id", taskId);
      if (error) throw error;

      if (developerId) {
        const { data: developer } = await supabase
          .from("developers")
          .select("user_id")
          .eq("id", developerId)
          .single();

        if (developer?.user_id) {
          await supabase.from("notifications").insert({
            user_id: developer.user_id,
            type: "nameserver_confirmed",
            title: "Nameservers Confirmed",
            message: `Client has updated nameservers for ${domain}. Proceed with launch.`,
            task_id: taskId,
          });
        }
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["pm-tasks"] });
      toast({ title: "Nameservers confirmed — developer notified" });
    },
  });

  const forwardDnsRecords = useMutation({
    mutationFn: async ({ taskId }: { taskId: string }) => {
      const { error } = await supabase
        .from("tasks")
        .update({ launch_dns_status: "dns_forwarded_to_client" } as any)
        .eq("id", taskId);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["pm-tasks"] });
      toast({ title: "DNS records forwarded to client" });
    },
  });

  // Delegate access workflow mutations
  const forwardDelegateAccess = useMutation({
    mutationFn: async ({ taskId }: { taskId: string }) => {
      const { error } = await supabase
        .from("tasks")
        .update({ launch_delegate_status: "forwarded_to_client" } as any)
        .eq("id", taskId);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["pm-tasks"] });
      toast({ title: "Delegate access instructions forwarded to client" });
    },
  });

  const confirmDelegateAccess = useMutation({
    mutationFn: async ({ taskId, developerId, domain }: { taskId: string; developerId: string | null; domain: string }) => {
      const { error } = await supabase
        .from("tasks")
        .update({ launch_delegate_status: "access_granted" } as any)
        .eq("id", taskId);
      if (error) throw error;

      if (developerId) {
        const { data: developer } = await supabase
          .from("developers")
          .select("user_id")
          .eq("id", developerId)
          .single();

        if (developer?.user_id) {
          await supabase.from("notifications").insert({
            user_id: developer.user_id,
            type: "delegate_confirmed",
            title: "Delegate Access Granted",
            message: `Client has granted delegate access for ${domain}. Proceed with launch.`,
            task_id: taskId,
          });
        }
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["pm-tasks"] });
      toast({ title: "Delegate access confirmed — developer notified" });
    },
  });

  // Hosting delegate access workflow mutations
  const forwardHostingDelegate = useMutation({
    mutationFn: async ({ taskId }: { taskId: string }) => {
      const { error } = await supabase
        .from("tasks")
        .update({ launch_hosting_delegate_status: "forwarded_to_client" } as any)
        .eq("id", taskId);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["pm-tasks"] });
      toast({ title: "Hosting delegate instructions forwarded to client" });
    },
  });

  const confirmHostingDelegate = useMutation({
    mutationFn: async ({ taskId, developerId, domain }: { taskId: string; developerId: string | null; domain: string }) => {
      const { error } = await supabase
        .from("tasks")
        .update({ launch_hosting_delegate_status: "access_granted" } as any)
        .eq("id", taskId);
      if (error) throw error;

      if (developerId) {
        const { data: developer } = await supabase
          .from("developers")
          .select("user_id")
          .eq("id", developerId)
          .single();

        if (developer?.user_id) {
          await supabase.from("notifications").insert({
            user_id: developer.user_id,
            type: "hosting_delegate_confirmed",
            title: "Hosting Delegate Access Granted",
            message: `Client has granted hosting delegate access for ${domain}. Proceed with launch.`,
            task_id: taskId,
          });
        }
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["pm-tasks"] });
      toast({ title: "Hosting delegate access confirmed — developer notified" });
    },
  });

  // Self-launch workflow mutation
  const markSelfLaunchCompleted = useMutation({
    mutationFn: async ({ taskId, developerId, domain }: { taskId: string; developerId: string | null; domain: string }) => {
      const { error } = await supabase
        .from("tasks")
        .update({ launch_self_launch_status: "self_launch_completed" } as any)
        .eq("id", taskId);
      if (error) throw error;

      if (developerId) {
        const { data: developer } = await supabase
          .from("developers")
          .select("user_id")
          .eq("id", developerId)
          .single();

        if (developer?.user_id) {
          await supabase.from("notifications").insert({
            user_id: developer.user_id,
            type: "self_launch_completed",
            title: "Self-Launch Completed",
            message: `Client has self-launched ${domain}. Please verify the website is live.`,
            task_id: taskId,
          });
        }
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["pm-tasks"] });
      toast({ title: "Self-launch marked as completed — developer notified to verify" });
    },
  });

  const confirmDnsRecords = useMutation({
    mutationFn: async ({ taskId, developerId, domain }: { taskId: string; developerId: string | null; domain: string }) => {
      const { error } = await supabase
        .from("tasks")
        .update({ launch_dns_status: "dns_confirmed" } as any)
        .eq("id", taskId);
      if (error) throw error;

      if (developerId) {
        const { data: developer } = await supabase
          .from("developers")
          .select("user_id")
          .eq("id", developerId)
          .single();

        if (developer?.user_id) {
          await supabase.from("notifications").insert({
            user_id: developer.user_id,
            type: "dns_confirmed",
            title: "DNS Records Confirmed",
            message: `Client has updated DNS records for ${domain}. Proceed with launch.`,
            task_id: taskId,
          });
        }
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["pm-tasks"] });
      toast({ title: "DNS records confirmed — developer notified" });
    },
  });

  // Verify & Close Order mutation
  const verifyAndCloseOrder = useMutation({
    mutationFn: async ({ taskId }: { taskId: string }) => {
      const { error } = await supabase
        .from("tasks")
        .update({ 
          upsell_verified_at: new Date().toISOString(),
          upsell_verified_by: user!.id,
        } as any)
        .eq("id", taskId);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["pm-tasks"] });
      toast({ title: "Website verified & order closed" });
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

  const holdOrder = useMutation({
    mutationFn: async ({ taskId, reason }: { taskId: string; reason: string }) => {
      const { error } = await supabase
        .from("tasks")
        .update({ 
          status: "on_hold" as any, 
          hold_reason: reason,
          held_at: new Date().toISOString(),
          held_by: user!.id,
        } as any)
        .eq("id", taskId);
      if (error) throw error;

      // Record hold event
      await (supabase as any).from("task_hold_events").insert({
        task_id: taskId,
        event_type: "hold",
        performed_by: user!.id,
        reason,
      } as any);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["pm-tasks"] });
      queryClient.invalidateQueries({ queryKey: ["all-tasks-search"] });
      toast({ title: "Order put on hold" });
      setHoldOrderDialog({ open: false, taskId: "" });
      setHoldOrderReason("");
    },
    onError: (error: any) => {
      toast({ variant: "destructive", title: "Error", description: error.message });
    },
  });

  const resumeOrder = useMutation({
    mutationFn: async (taskId: string) => {
      // Fetch task details for SLA recalculation
      const { data: taskData } = await supabase
        .from("tasks")
        .select("developer_id, held_at, sla_deadline")
        .eq("id", taskId)
        .single();

      // Recalculate SLA deadline if developer and hold data exist
      let newDeadline: string | null = null;
      if (taskData?.developer_id && taskData?.held_at && taskData?.sla_deadline) {
        try {
          const { data: slaResult } = await supabase.functions.invoke("calculate-sla-deadline", {
            body: {
              developer_id: taskData.developer_id,
              resume_from_hold: true,
              held_at: taskData.held_at,
              original_sla_deadline: taskData.sla_deadline,
            },
          });
          if (slaResult?.deadline) {
            newDeadline = slaResult.deadline;
          }
        } catch (e) {
          console.error("SLA recalculation failed on resume:", e);
        }
      }

      const updatePayload: any = {
        status: "in_progress" as any,
        held_at: null,
        held_by: null,
      };
      if (newDeadline) {
        updatePayload.sla_deadline = newDeadline;
      }

      const { error } = await supabase
        .from("tasks")
        .update(updatePayload)
        .eq("id", taskId);
      if (error) throw error;

      // Also update the active phase's sla_deadline if applicable
      if (newDeadline && taskData) {
        const { data: task } = await supabase
          .from("tasks")
          .select("current_phase")
          .eq("id", taskId)
          .single();
        if (task?.current_phase) {
          await supabase
            .from("project_phases")
            .update({ sla_deadline: newDeadline } as any)
            .eq("task_id", taskId)
            .eq("phase_number", task.current_phase);
        }
      }

      // Record resume event
      await (supabase as any).from("task_hold_events").insert({
        task_id: taskId,
        event_type: "resume",
        performed_by: user!.id,
      } as any);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["pm-tasks"] });
      queryClient.invalidateQueries({ queryKey: ["all-tasks-search"] });
      toast({ title: "Order resumed", description: "SLA deadline recalculated with remaining time" });
    },
    onError: (error: any) => {
      toast({ variant: "destructive", title: "Error", description: error.message });
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
    // Only consider non-revised submissions for approval check (revised = old version, superseded)
    const activeSubmissions = teamSubmissions.filter(s => s.revision_status !== 'revised');
    const allApproved = activeSubmissions.length > 0 && activeSubmissions.every(s => s.revision_status === 'approved');
    
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
    
    // (upsell check removed)
    
    // Use submission data if available, otherwise fall back to task status
    // This handles closedByMe orders where the user isn't the assigned PM and can't see submissions
    const hasCompletedTask = activeTasks.some((t: any) => t.status === 'completed');
    const isWebsiteGroup = representativeTask?.post_type === "Website Design";
    if (hasPendingReview && !isWebsiteGroup) categories.push('recently_delivered');
    else if (hasCompletedTask && groupSubmissions.length === 0) categories.push('recently_delivered');
    if (isWebsiteGroup && !categories.includes('recently_delivered')) {
      const hasPhaseAwaitingReview = (projectPhases || []).some(
        (p: any) => activeTasks.some((t: any) => t.id === p.task_id) && p.completed_at && !p.reviewed_at
      );
      if (hasPhaseAwaitingReview) categories.push('recently_delivered');
    }
    if (hasNeedsRevision) categories.push('needs_revision');
    if (isDelayed) categories.push('delayed');
    if (hasTeamsPendingDelivery) categories.push('pending_delivery');
    
    // Check for late acknowledgement (ACK OVERDUE)
    const hasLateAck = activeTasks.some((t: any) => t.late_acknowledgement === true && !t.acknowledged_at && t.status !== 'cancelled');
    if (hasLateAck) categories.push('delayed_ack');
    
    // For multi-team orders, also check individual task statuses
    const hasAnyPending = activeTasks.some((t: any) => t.status === 'pending' || t.status === 'assigned');
    const hasAnyInProgress = activeTasks.some((t: any) => t.status === 'in_progress');
    const hasAnyCancelled = group.allTasks.some((t: any) => t.status === 'cancelled');
    const hasAnyOnHold = activeTasks.some((t: any) => t.status === 'on_hold');
    if (hasAnyPending) categories.push('pending');
    if (hasAnyInProgress) categories.push('in_progress');
    if (hasAnyCancelled) categories.push('cancelled');
    if (hasAnyOnHold) categories.push('on_hold');
    
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
    delayed_ack: groupedOrders.filter(g => getGroupCategories(g, submissions || []).includes('delayed_ack')).length,
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
    if (hasPendingReview && task?.post_type !== "Website Design") return 'recently_delivered';
    // For website orders, check if any phase awaits review
    if (task?.post_type === "Website Design") {
      const hasPhaseAwaitingReview = (projectPhases || []).some(
        (p: any) => p.task_id === task.id && p.completed_at && !p.reviewed_at
      );
      if (hasPhaseAwaitingReview) return 'recently_delivered';
    }
    if (hasNeedsRevision) return 'needs_revision';
    if (isDelayed) return 'delayed';
    
    // Only move to 'other' if ALL submissions are approved (not just some)
    // Task must have submissions AND all must be approved to leave priority
    if (allApproved) return 'other';
    
    // Task status-based completion only applies if explicitly set
    // Website orders marked live but not yet verified should stay in priority
    if (task.status === 'approved' && task.launch_website_live_at && !task.upsell_verified_at) {
      return 'pending_delivery';
    }
    if (task.status === 'completed' || task.status === 'approved') return 'other';
    
    if (task.status === 'pending' || task.status === 'assigned') return 'pending';
    if (task.status === 'in_progress') return 'in_progress';
    if (task.status === 'on_hold') return 'on_hold';
    return 'other';
  };

  const getCategoryPriority = (category: string) => {
    const priorities: Record<string, number> = {
      recently_delivered: 1,
      pending_delivery: 2,
      delayed: 3,
      delayed_ack: 4,
      pending: 5,
      in_progress: 7,
      needs_revision: 8,
      other: 9,
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
      case "on_hold":
        return "bg-amber-500 text-white";
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
      return categories.some(c => ['recently_delivered', 'delayed', 'delayed_ack', 'pending', 'in_progress', 'needs_revision', 'pending_delivery', 'on_hold'].includes(c));
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

        <div className="grid gap-4 md:grid-cols-8 mb-8">
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

          <Card 
            className={`border-l-4 border-l-amber-600 cursor-pointer transition-all hover:shadow-md ${statusFilter === 'delayed_ack' ? 'ring-2 ring-amber-600' : ''}`}
            onClick={() => setStatusFilter('delayed_ack')}
          >
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">ACK Overdue</CardTitle>
              <Clock className="h-4 w-4 text-amber-600" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{stats.delayed_ack}</div>
              <p className="text-xs text-muted-foreground">Late acknowledgement</p>
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
                const isWebsite = isWebsiteOrder(task);
                // For website orders, filter out comment-only submissions (URLs) from the files area
                const fileSubmissions = isWebsite 
                  ? groupSubmissions.filter((s: any) => s.file_name !== 'comment-only')
                  : groupSubmissions;
                const isExpanded = expandedTaskId === group.groupId;
                const allCategories = getGroupCategories(group, submissions || []);
                const category = (statusFilter && allCategories.includes(statusFilter)) ? statusFilter : getGroupCategory(group, submissions || []);
                
                const getBorderClass = () => {
                  if (category === 'recently_delivered') return 'border-l-4 border-l-green-500 bg-green-50/10';
                  if (category === 'delayed') return 'border-l-4 border-l-red-500 bg-red-50/10';
                  if (category === 'delayed_ack') return 'border-l-4 border-l-amber-600 bg-amber-50/10';
                  if (category === 'needs_revision') return 'border-l-4 border-l-orange-500 bg-orange-50/10';
                  if (category === 'pending_delivery') return 'border-l-4 border-l-yellow-500 bg-yellow-50/10';
                  if (category === 'cancelled') return 'border-l-4 border-l-gray-500 bg-gray-50/10 opacity-75';
                  return '';
                };

                const getCategoryBadge = () => {
                  if (category === 'recently_delivered') {
                    if (isWebsite) {
                      if (task.status === 'completed') {
                        return <Badge className="bg-green-500 text-white">Website Completed - Awaiting Final Review</Badge>;
                      }
                      const taskPhases = (projectPhases || [])
                        .filter((p: any) => p.task_id === task.id && p.completed_at && !p.reviewed_at)
                        .sort((a: any, b: any) => b.phase_number - a.phase_number);
                      const latestPhase = taskPhases[0];
                      if (latestPhase) {
                        return <Badge className="bg-green-500 text-white">Phase {latestPhase.phase_number} Delivered</Badge>;
                      }
                    }
                    return <Badge className="bg-green-500 text-white">Delivered - Awaiting Review</Badge>;
                  }
                  if (category === 'delayed') {
                    return null; // Handled by getDelayedBadge
                  }
                  if (category === 'delayed_ack') {
                    return null; // Handled by getAckOverdueBadge
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
                
                const getAckOverdueBadge = () => {
                  const allCats = getGroupCategories(group, submissions || []);
                  if (!allCats.includes('delayed_ack')) return null;
                  const activeTasks = group.isMultiTeam ? group.allTasks.filter((t: any) => t.status !== 'cancelled') : [task];
                  const lateTask = activeTasks.find((t: any) => t.late_acknowledgement === true && !t.acknowledged_at && t.ack_deadline);
                  if (!lateTask) return <Badge className="bg-amber-600 text-white">ACK OVERDUE</Badge>;
                  
                  // Find developer calendar for working-hours calculation
                  const devRecord = developerCalendars?.find((d: any) => d.id === lateTask.developer_id);
                  const cal = devRecord?.availability_calendars as CalendarConfig | undefined;
                  const devLeaves = (allLeaveRecords?.filter((l: any) => l.developer_id === devRecord?.id) || []) as LeaveRecord[];
                  
                  if (cal) {
                    const overdueMinutes = calculateOverdueWorkingMinutes(new Date(), new Date(lateTask.ack_deadline), cal, devLeaves);
                    const overdueHours = Math.floor(overdueMinutes / 60);
                    const overdueMins = Math.floor(overdueMinutes % 60);
                    const timeStr = overdueHours > 0 ? `${overdueHours}h ${overdueMins}m` : `${overdueMins}m`;
                    return <Badge className="bg-amber-600 text-white">ACK OVERDUE — {timeStr}</Badge>;
                  }
                  
                  // Fallback: no calendar data available
                  return <Badge className="bg-amber-600 text-white">ACK OVERDUE</Badge>;
                };

                const getLateAckHistoryBadge = () => {
                  const activeTasks = group.isMultiTeam ? group.allTasks.filter((t: any) => t.status !== 'cancelled') : [task];
                  const lateAcked = activeTasks.some((t: any) => t.late_acknowledgement === true && t.acknowledged_at);
                  if (!lateAcked) return null;
                  return <Badge variant="outline" className="text-xs text-amber-600 border-amber-300 bg-amber-50 dark:bg-amber-950/20">Late ACK</Badge>;
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
                              {getAckOverdueBadge()}
                              {getLateAckHistoryBadge()}
                              {(() => {
                                if (!isWebsite) return null;
                                const changePhases = (projectPhases || []).filter(
                                  (p: any) => p.task_id === task.id && 
                                  (p.review_status === 'approved_with_changes' || p.review_status === 'disapproved_with_changes')
                                );
                                if (changePhases.length === 0) return null;
                                return changePhases.map((p: any) => {
                                  // Find the latest review round for this phase (phaseReviews ordered by round_number DESC)
                                  const latestReview = (phaseReviews || []).find(
                                    (r: any) => r.phase_id === p.id && 
                                    (r.review_status === 'approved_with_changes' || r.review_status === 'disapproved_with_changes')
                                  );
                                  if (!latestReview) return null;
                                  if (latestReview.change_completed_at) {
                                    return (
                                      <Badge key={p.id} className="gap-1 bg-primary text-primary-foreground">
                                        <CheckCircle2 className="h-3 w-3" />
                                        Changes Submitted (P{p.phase_number})
                                      </Badge>
                                    );
                                  } else {
                                    return (
                                      <Badge key={p.id} className="gap-1 bg-amber-500 text-white">
                                        <AlertTriangle className="h-3 w-3" />
                                        Changes In Progress (P{p.phase_number})
                                      </Badge>
                                    );
                                  }
                                });
                              })()}
                              {task.status === 'on_hold' && (
                                <Badge className="bg-amber-500 text-white">
                                  <PauseCircle className="h-3 w-3 mr-1" />
                                  On Hold
                                </Badge>
                              )}
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
                          {/* For website orders, hide cancel once any phase has been submitted */}
                          {!group.isMultiTeam && (task.status === "pending" || task.status === "in_progress") && task.project_manager_id === user?.id && !(isWebsite && (projectPhases || []).some((p: any) => p.task_id === task.id && p.completed_at)) && (
                            <Button
                              size="sm"
                              variant="ghost"
                              className="h-8 w-8 p-0 hover:bg-destructive/10"
                              onClick={() => setCancelDialog({ open: true, taskId: task.id })}
                            >
                              <XCircle className="h-4 w-4 text-destructive" />
                            </Button>
                          )}
                          {/* Hold button for single-team orders */}
                          {!group.isMultiTeam && (task.status === "pending" || task.status === "in_progress") && task.project_manager_id === user?.id && (
                            <Button
                              size="sm"
                              variant="ghost"
                              className="h-8 w-8 p-0 hover:bg-amber-500/10"
                              title="Put on Hold"
                              onClick={() => setHoldOrderDialog({ open: true, taskId: task.id })}
                            >
                              <PauseCircle className="h-4 w-4 text-amber-500" />
                            </Button>
                          )}
                          {/* Resume button for on_hold orders */}
                          {!group.isMultiTeam && task.status === "on_hold" && task.project_manager_id === user?.id && (
                            <Button
                              size="sm"
                              variant="ghost"
                              className="h-8 w-8 p-0 hover:bg-green-500/10"
                              title="Resume Order"
                              onClick={() => resumeOrder.mutate(task.id)}
                            >
                              <PlayCircle className="h-4 w-4 text-green-500" />
                            </Button>
                          )}
                        </div>
                      </div>
                    </div>

                    {/* Card Body */}
                    <div className="p-4 space-y-4">
                              {(() => {
                                const unreadCount = getUnreadReplyCount(task.id);
                                if (unreadCount > 0) {
                                  return (
                                    <Badge className="bg-red-500 text-white animate-pulse">
                                      <MessageCircle className="h-3 w-3 mr-1" />
                                      {unreadCount} new {unreadCount === 1 ? 'reply' : 'replies'}
                                    </Badge>
                                  );
                                }
                                return null;
                              })()}

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
                                    const activeSubs = teamSubs.filter((s: any) => s.revision_status !== 'revised');
                                    const hasNeedsRev = teamSubs.some((s: any) => s.revision_status === 'needs_revision');
                                    const hasPendingRev = teamSubs.some((s: any) => s.revision_status === 'pending_review');
                                    const allApproved = activeSubs.length > 0 && activeSubs.every((s: any) => s.revision_status === 'approved');
                                    if (hasNeedsRev) return <>{teamName} — <span className="text-orange-500">Needs Revision</span></>;
                                    if (allApproved) return <>{teamName} — <span className="text-green-600">Approved</span></>;
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
                                  const activeSubmissions = teamSubmissions.filter((s: any) => s.revision_status !== 'revised');
                                  const allSubmissionsApproved = activeSubmissions.length > 0 && activeSubmissions.every((s: any) => s.revision_status === 'approved');
                                  const isApproved = t.status === 'approved' || allSubmissionsApproved;
                                  
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
                                  } else if (t.status === 'on_hold') {
                                    statusIcon = "⏸";
                                    statusColor = "text-amber-500";
                                    statusText = "On Hold";
                                  }
                                  
                                  const isWebsiteTask = isWebsiteOrder(t);
                                  const hasSubmittedPhase = isWebsiteTask && (projectPhases || []).some((p: any) => p.task_id === t.id && p.completed_at);
                                  const canCancel = (t.status === 'pending' || t.status === 'in_progress') && t.status !== 'completed' && t.status !== 'approved' && t.status !== 'cancelled' && !hasSubmittedPhase;
                                  
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
                                        {(t.status === 'pending' || t.status === 'in_progress') && task.project_manager_id === user?.id && (
                                          <button
                                            className="ml-0.5 p-0.5 rounded hover:bg-amber-500/10"
                                            title="Put on Hold"
                                            onClick={(e) => { e.stopPropagation(); setHoldOrderDialog({ open: true, taskId: t.id }); }}
                                          >
                                            <PauseCircle className="h-3 w-3 text-amber-500" />
                                          </button>
                                        )}
                                        {t.status === 'on_hold' && task.project_manager_id === user?.id && (
                                          <button
                                            className="ml-0.5 p-0.5 rounded hover:bg-green-500/10"
                                            title="Resume"
                                            onClick={(e) => { e.stopPropagation(); resumeOrder.mutate(t.id); }}
                                          >
                                            <PlayCircle className="h-3 w-3 text-green-500" />
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
                              <span>Created: {format(new Date(task.created_at), 'MMM d, yyyy h:mm a')}</span>
                            </div>
                            {fileSubmissions.length > 0 && (
                              <div className="flex items-center gap-1.5 text-xs text-primary font-medium">
                                <FileText className="h-3 w-3" />
                                <span>{fileSubmissions.length} file(s) submitted</span>
                              </div>
                            )}
                          </div>
                        </div>
                      </div>




                      {/* Latest Submission Panel for Website Orders */}
                      {isWebsiteOrder(task) && projectPhases && (
                        <LatestSubmissionPanel
                          task={task}
                          phases={projectPhases || []}
                          phaseReviews={phaseReviews || []}
                          unreadReplyCount={getUnreadReplyCount(task.id)}
                          submissions={groupSubmissions.filter((s: any) => s.file_name === 'comment-only')}
                          isAssignedPM={task.project_manager_id === user?.id}
                          onApprove={(phaseId) => directPhaseApprove.mutate({ phaseId, taskId: task.id })}
                          onApproveWithChanges={(phaseId, phaseNumber) => setExternalReviewTrigger(prev => ({ ...prev, [task.id]: { phaseId, phaseNumber, reviewType: "approved_with_changes" } }))}
                          onDisapprove={(phaseId, phaseNumber) => setExternalReviewTrigger(prev => ({ ...prev, [task.id]: { phaseId, phaseNumber, reviewType: "disapproved_with_changes" } }))}
                          isPending={directPhaseApprove.isPending}
                        />
                      )}

                      {/* Phase Review Section for Website Orders */}
                      {isWebsiteOrder(task) && projectPhases && (
                        <div className="px-4 pb-2">
                          <PhaseReviewSection
                            task={task}
                            phases={projectPhases || []}
                            userId={user!.id}
                            isAssignedPM={task.project_manager_id === user?.id}
                            queryKeysToInvalidate={[["pm-tasks"], ["pm-project-phases"], ["design-submissions"], ["pm-phase-reviews"]]}
                            submissions={groupSubmissions.filter((s: any) => s.file_name === 'comment-only')}
                            externalReviewTrigger={externalReviewTrigger[task.id] || null}
                            onExternalReviewHandled={() => setExternalReviewTrigger(prev => ({ ...prev, [task.id]: null }))}
                          />
                        </div>
                      )}
                      {/* Nameserver Status Section */}
                      {(task as any).launch_access_method === "nameservers" && (task as any).launch_nameserver_status && (
                        <div className="px-4 py-3 border-t">
                          {(task as any).launch_nameserver_status === "pending_nameservers" && (
                            <div className="flex items-center gap-2 text-sm text-muted-foreground">
                              <Clock className="h-4 w-4" />
                              <span>Awaiting nameservers from developer...</span>
                            </div>
                          )}
                          {(task as any).launch_nameserver_status === "nameservers_provided" && (
                            <div className="space-y-2">
                              <p className="text-sm font-medium">Nameservers Ready</p>
                              <div className="grid grid-cols-2 gap-2">
                                {[(task as any).launch_nameserver_1, (task as any).launch_nameserver_2, (task as any).launch_nameserver_3, (task as any).launch_nameserver_4]
                                  .filter(Boolean)
                                  .map((ns: string, i: number) => (
                                    <div key={i} className="text-xs bg-muted/50 rounded px-2 py-1.5 font-mono">{ns}</div>
                                  ))}
                              </div>
                              <Button
                                size="sm"
                                className="mt-2"
                                onClick={() => forwardNameservers.mutate({ taskId: task.id })}
                                disabled={forwardNameservers.isPending}
                              >
                                Forward to Client
                              </Button>
                            </div>
                          )}
                          {(task as any).launch_nameserver_status === "forwarded_to_client" && (
                            <div className="space-y-2">
                              <p className="text-sm text-muted-foreground">Nameservers forwarded to client. Click below once client confirms update.</p>
                              <Button
                                size="sm"
                                className="bg-green-600 hover:bg-green-700"
                                onClick={() => confirmNameservers.mutate({ 
                                  taskId: task.id, 
                                  developerId: task.developer_id,
                                  domain: (task as any).launch_domain || ''
                                })}
                                disabled={confirmNameservers.isPending}
                              >
                                <CheckCircle2 className="h-3.5 w-3.5 mr-1.5" />
                                Nameservers Confirmed
                              </Button>
                            </div>
                          )}
                          {(task as any).launch_nameserver_status === "nameservers_confirmed" && (
                            <Badge className="bg-green-600 text-white">
                              <CheckCircle2 className="h-3 w-3 mr-1" />
                              Nameservers Confirmed — Awaiting Launch
                            </Badge>
                          )}
                        </div>
                      )}
                      {/* DNS Records Status Section */}
                      {(task as any).launch_access_method === "dns_records" && (task as any).launch_dns_status && (
                        <div className="px-4 py-3 border-t">
                          {(task as any).launch_dns_status === "pending_dns" && (
                            <div className="flex items-center gap-2 text-sm text-muted-foreground">
                              <Clock className="h-4 w-4" />
                              <span>Awaiting DNS records from developer...</span>
                            </div>
                          )}
                          {(task as any).launch_dns_status === "dns_provided" && (
                            <div className="space-y-2">
                              <p className="text-sm font-medium">DNS Records Ready</p>
                              <div className="space-y-1">
                                {(task as any).launch_dns_a_record && (
                                  <div className="text-xs bg-muted/50 rounded px-2 py-1.5 font-mono">
                                    <span className="text-muted-foreground">A Record:</span> {(task as any).launch_dns_a_record}
                                  </div>
                                )}
                                {(task as any).launch_dns_cname && (
                                  <div className="text-xs bg-muted/50 rounded px-2 py-1.5 font-mono">
                                    <span className="text-muted-foreground">CNAME:</span> {(task as any).launch_dns_cname}
                                  </div>
                                )}
                                {(task as any).launch_dns_mx_record && (
                                  <div className="text-xs bg-muted/50 rounded px-2 py-1.5 font-mono">
                                    <span className="text-muted-foreground">MX:</span> {(task as any).launch_dns_mx_record}
                                  </div>
                                )}
                              </div>
                              <Button
                                size="sm"
                                className="mt-2"
                                onClick={() => forwardDnsRecords.mutate({ taskId: task.id })}
                                disabled={forwardDnsRecords.isPending}
                              >
                                Forward to Client
                              </Button>
                            </div>
                          )}
                          {(task as any).launch_dns_status === "dns_forwarded_to_client" && (
                            <div className="space-y-2">
                              <p className="text-sm text-muted-foreground">DNS records forwarded to client. Click below once client confirms update.</p>
                              <Button
                                size="sm"
                                className="bg-green-600 hover:bg-green-700"
                                onClick={() => confirmDnsRecords.mutate({ 
                                  taskId: task.id, 
                                  developerId: task.developer_id,
                                  domain: (task as any).launch_domain || ''
                                })}
                                disabled={confirmDnsRecords.isPending}
                              >
                                <CheckCircle2 className="h-3.5 w-3.5 mr-1.5" />
                                DNS Records Confirmed
                              </Button>
                            </div>
                          )}
                          {(task as any).launch_dns_status === "dns_confirmed" && (
                            <Badge className="bg-green-600 text-white">
                              <CheckCircle2 className="h-3 w-3 mr-1" />
                              DNS Records Confirmed — Awaiting Launch
                            </Badge>
                          )}
                        </div>
                      )}
                      {/* Delegate Access Status Section */}
                      {(task as any).launch_access_method === "delegate" && (task as any).launch_delegate_status && (
                        <div className="px-4 py-3 border-t">
                          {(task as any).launch_delegate_status === "pending_delegation" && (
                            <div className="space-y-2">
                              <div className="flex items-center gap-2 text-sm">
                                <Mail className="h-4 w-4 text-blue-500" />
                                <span>Client must delegate access to <strong className="font-mono">Charley@plexLogo.com</strong></span>
                              </div>
                              <Button
                                size="sm"
                                onClick={() => forwardDelegateAccess.mutate({ taskId: task.id })}
                                disabled={forwardDelegateAccess.isPending}
                              >
                                Access Forwarded to Client
                              </Button>
                            </div>
                          )}
                          {(task as any).launch_delegate_status === "forwarded_to_client" && (
                            <div className="space-y-2">
                              <p className="text-sm text-muted-foreground">Delegation instructions sent to client. Click below once client confirms access granted.</p>
                              <Button
                                size="sm"
                                className="bg-green-600 hover:bg-green-700"
                                onClick={() => confirmDelegateAccess.mutate({ 
                                  taskId: task.id, 
                                  developerId: task.developer_id,
                                  domain: (task as any).launch_domain || ''
                                })}
                                disabled={confirmDelegateAccess.isPending}
                              >
                                <CheckCircle2 className="h-3.5 w-3.5 mr-1.5" />
                                Access Granted
                              </Button>
                            </div>
                          )}
                          {(task as any).launch_delegate_status === "access_granted" && (
                            <Badge className="bg-green-600 text-white">
                              <CheckCircle2 className="h-3 w-3 mr-1" />
                              Delegate Access Granted — Awaiting Launch
                            </Badge>
                          )}
                        </div>
                      )}
                      {/* Domain Credentials Display */}
                      {(task as any).launch_access_method === "credentials" && ((task as any).launch_domain_username || (task as any).launch_domain_password) && (
                        <div className="px-4 py-3 border-t">
                          <p className="text-xs font-medium text-muted-foreground mb-2">🔑 Domain Login Credentials</p>
                          {(task as any).launch_domain_provider && (
                            <p className="text-sm">Provider: <span className="font-medium">{(task as any).launch_domain_provider}</span></p>
                          )}
                          <p className="text-sm">Username: <span className="font-mono">{(task as any).launch_domain_username}</span></p>
                          <p className="text-sm">Password: <span className="font-mono">{(task as any).launch_domain_password}</span></p>
                        </div>
                      )}
                      {/* Hosting Credentials Display */}
                      {(task as any).launch_hosting_access_method === "hosting_credentials" && ((task as any).launch_hosting_username || (task as any).launch_hosting_password) && (
                        <div className="px-4 py-3 border-t">
                          <p className="text-xs font-medium text-muted-foreground mb-2">🖥️ Hosting Login Credentials</p>
                          {(task as any).launch_hosting_provider_name && (
                            <p className="text-sm">Provider: <span className="font-medium">{(task as any).launch_hosting_provider_name}</span></p>
                          )}
                          <p className="text-sm">Username: <span className="font-mono">{(task as any).launch_hosting_username}</span></p>
                          <p className="text-sm">Password: <span className="font-mono">{(task as any).launch_hosting_password}</span></p>
                        </div>
                      )}
                      {/* Hosting Delegate Access Status Section */}
                      {(task as any).launch_hosting_access_method === "hosting_delegate" && (task as any).launch_hosting_delegate_status && (
                        <div className="px-4 py-3 border-t">
                          <p className="text-xs font-medium text-muted-foreground mb-2">Hosting Delegate Access ({(task as any).launch_hosting_provider_name || 'Client Hosting'})</p>
                          {(task as any).launch_hosting_delegate_status === "pending_delegation" && (
                            <div className="space-y-2">
                              <div className="flex items-center gap-2 text-sm">
                                <Mail className="h-4 w-4 text-blue-500" />
                                <span>Client must delegate hosting access to <strong className="font-mono">Charley@plexLogo.com</strong></span>
                              </div>
                              <Button
                                size="sm"
                                onClick={() => forwardHostingDelegate.mutate({ taskId: task.id })}
                                disabled={forwardHostingDelegate.isPending}
                              >
                                Access Forwarded to Client
                              </Button>
                            </div>
                          )}
                          {(task as any).launch_hosting_delegate_status === "forwarded_to_client" && (
                            <div className="space-y-2">
                              <p className="text-sm text-muted-foreground">Hosting delegation instructions sent to client. Click below once client confirms access granted.</p>
                              <Button
                                size="sm"
                                className="bg-green-600 hover:bg-green-700"
                                onClick={() => confirmHostingDelegate.mutate({ 
                                  taskId: task.id, 
                                  developerId: task.developer_id,
                                  domain: (task as any).launch_domain || ''
                                })}
                                disabled={confirmHostingDelegate.isPending}
                              >
                                <CheckCircle2 className="h-3.5 w-3.5 mr-1.5" />
                                Access Granted
                              </Button>
                            </div>
                          )}
                          {(task as any).launch_hosting_delegate_status === "access_granted" && (
                            <Badge className="bg-green-600 text-white">
                              <CheckCircle2 className="h-3 w-3 mr-1" />
                              Hosting Delegate Access Granted
                            </Badge>
                          )}
                        </div>
                      )}
                      {/* Self-Launch Status Section */}
                      {(task as any).launch_hosting_access_method === "self_launch" && (task as any).launch_self_launch_status && (
                        <div className="px-4 py-3 border-t">
                          <p className="text-xs font-medium text-muted-foreground mb-2">Self-Launch ({(task as any).launch_hosting_provider_name || 'Client Hosting'})</p>
                          {(task as any).launch_self_launch_status === "pending_link" && (
                            <Badge variant="outline">⏳ Awaiting WeTransfer link from developer</Badge>
                          )}
                          {(task as any).launch_self_launch_status === "link_provided" && (
                            <div className="space-y-2">
                              <div className="text-sm">
                                <span className="text-muted-foreground">WeTransfer Link: </span>
                                <a href={(task as any).launch_wetransfer_link} target="_blank" rel="noopener noreferrer" className="text-blue-600 underline break-all">
                                  {(task as any).launch_wetransfer_link}
                                </a>
                              </div>
                              <Button
                                size="sm"
                                className="bg-green-600 hover:bg-green-700"
                                onClick={() => markSelfLaunchCompleted.mutate({ 
                                  taskId: task.id, 
                                  developerId: task.developer_id,
                                  domain: (task as any).launch_domain || ''
                                })}
                                disabled={markSelfLaunchCompleted.isPending}
                              >
                                <CheckCircle2 className="h-3.5 w-3.5 mr-1.5" />
                                Self-Launch Completed
                              </Button>
                            </div>
                          )}
                          {(task as any).launch_self_launch_status === "self_launch_completed" && (
                            <Badge className="bg-green-600 text-white">
                              <CheckCircle2 className="h-3 w-3 mr-1" />
                              Self-Launch Completed
                            </Badge>
                          )}
                        </div>
                      )}
                      {/* Website Marked Live Badge + Verify & Close */}
                      {(task as any).launch_website_live_at && (
                        <div className="px-4 py-3 border-t space-y-2">
                          <Badge className="bg-green-600 text-white">
                            <CheckCircle2 className="h-3 w-3 mr-1" />
                            🚀 Website Marked Live — {format(new Date((task as any).launch_website_live_at), 'MMM d, yyyy HH:mm')}
                          </Badge>
                          {/* Verify & Close - only show if not yet verified */}
                          {!(task as any).upsell_verified_at && (
                            <div>
                              <Button
                                size="sm"
                                className="bg-green-600 hover:bg-green-700 text-white"
                                onClick={() => verifyAndCloseOrder.mutate({ taskId: task.id })}
                                disabled={verifyAndCloseOrder.isPending}
                              >
                                <CheckCircle2 className="h-3.5 w-3.5 mr-1" />
                                Verify & Close Order
                              </Button>
                            </div>
                          )}
                          {/* Verified Badge */}
                          {(task as any).upsell_verified_at && (
                            <Badge className="bg-green-700 text-white">
                              <CheckCircle2 className="h-3 w-3 mr-1" />
                              ✅ Verified & Closed {(task as any).upsell_verified_at ? `— ${format(new Date((task as any).upsell_verified_at), 'MMM d, yyyy')}` : ''}
                            </Badge>
                          )}
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
                        {(() => {
                          const totalFiles = 
                            (task.attachment_file_path ? task.attachment_file_path.split('|||').length : 0) +
                            (task.logo_url ? task.logo_url.split('|||').length : 0);
                          if (totalFiles === 0) return null;
                          return (
                            <span className="inline-flex items-center gap-1 text-xs text-muted-foreground px-2 py-1 bg-muted rounded-md" title={`${totalFiles} file(s) attached`}>
                              <Paperclip className="h-3.5 w-3.5" />
                              {totalFiles}
                            </span>
                          );
                        })()}
                        <Button size="sm" variant="outline" className="relative hover-scale" onClick={() => setChatTask(task)}>
                          <MessageCircle className="h-3.5 w-3.5 mr-1.5" />
                          Chat
                          {(unreadCounts?.get(task.id) || 0) > 0 && (
                            <span className="absolute -top-1.5 -right-1.5 bg-destructive text-destructive-foreground text-[10px] rounded-full h-4 min-w-[16px] flex items-center justify-center px-1">
                              {unreadCounts!.get(task.id)}
                            </span>
                          )}
                        </Button>
                        {task.status === "completed" && task.project_manager_id === user?.id && (
                          isWebsite ? (
                            <Button
                              size="sm"
                              className="bg-blue-600 hover:bg-blue-700 hover-scale"
                              onClick={() =>
                                setLaunchDialog({ taskId: task.id, taskTitle: task.title, developerId: task.developer_id })
                              }
                            >
                              <Rocket className="h-3.5 w-3.5 mr-1.5" />
                              Launch Website
                            </Button>
                          ) : (
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
                          )
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
                        {/* For website orders, hide cancel once any phase has been submitted */}
                        {!group.isMultiTeam && (task.status === "pending" || task.status === "in_progress") && task.project_manager_id === user?.id && !(isWebsite && (projectPhases || []).some((p: any) => p.task_id === task.id && p.completed_at)) && (
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
                        {/* Put on Hold button in expanded view */}
                        {!group.isMultiTeam && (task.status === "pending" || task.status === "in_progress") && task.project_manager_id === user?.id && (
                          <Button
                            size="sm"
                            variant="outline"
                            className="border-amber-500/50 text-amber-600 hover:bg-amber-500/10 hover-scale"
                            onClick={() => setHoldOrderDialog({ open: true, taskId: task.id })}
                          >
                            <PauseCircle className="h-3.5 w-3.5 mr-1.5" />
                            Put on Hold
                          </Button>
                        )}
                        {/* Resume button in expanded view */}
                        {!group.isMultiTeam && task.status === "on_hold" && task.project_manager_id === user?.id && (
                          <Button
                            size="sm"
                            variant="outline"
                            className="border-green-500/50 text-green-600 hover:bg-green-500/10 hover-scale"
                            onClick={() => resumeOrder.mutate(task.id)}
                          >
                            <PlayCircle className="h-3.5 w-3.5 mr-1.5" />
                            Resume
                          </Button>
                        )}
                        {/* Show cancellation/deletion reason for cancelled orders */}
                        {task.status === "cancelled" && (task as any).cancellation_reason && (
                          <p className="text-xs text-muted-foreground italic">
                            Reason: {(task as any).cancellation_reason}
                          </p>
                        )}
                        {/* Show hold reason for on_hold orders */}
                        {task.status === "on_hold" && (task as any).hold_reason && (
                          <p className="text-xs text-amber-600 italic">
                            Hold Reason: {(task as any).hold_reason}
                          </p>
                        )}
                      </div>
                      {fileSubmissions.length > 0 && (
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
                    {isExpanded && fileSubmissions.length > 0 && (
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
                                              {task.project_manager_id === user?.id && (submission.revision_status === "pending_review" || submission.revision_status === "approved") && (
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
                                                    {task.project_manager_id === user?.id && (rev.revision_status === "pending_review" || rev.revision_status === "approved") && (
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
                            {fileSubmissions.filter((s: any) => !s.parent_submission_id).map((submission: any) => {
                              const collectChain = (parentId: string): any[] => {
                                const children = fileSubmissions.filter((s: any) => s.parent_submission_id === parentId)
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
                                  {task.project_manager_id === user?.id && (submission.revision_status === "pending_review" || submission.revision_status === "approved") && (
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
                                        {task.project_manager_id === user?.id && (rev.revision_status === "pending_review" || rev.revision_status === "approved") && (
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
        <DialogContent className="max-w-3xl w-[95vw]">
          <DialogHeader>
            <DialogTitle>Task Details - #{viewDetailsTask?.task_number}</DialogTitle>
          </DialogHeader>
          <div className="max-h-[70vh] overflow-y-auto pr-4">
            <div className="space-y-6 break-words" style={{ overflowWrap: 'anywhere', wordBreak: 'break-word' }}>
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
                  </div>
                  {(viewDetailsTask as any)?.video_keywords && (
                    <div className="overflow-hidden">
                      <Label className="text-muted-foreground">Video Keywords</Label>
                      <p className="font-medium whitespace-pre-wrap" style={{ overflowWrap: 'anywhere', wordBreak: 'break-word' }}>{(viewDetailsTask as any)?.video_keywords}</p>
                    </div>
                  )}
                  <div>
                    <Label className="text-muted-foreground">Supporting Text</Label>
                    <p className="font-medium whitespace-pre-wrap">{viewDetailsTask?.supporting_text || "N/A"}</p>
                  </div>
                  <div>
                    <Label className="text-muted-foreground">Design References</Label>
                    <p className="font-medium break-words whitespace-pre-wrap">{viewDetailsTask?.design_references || "N/A"}</p>
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
                                className="mt-3 w-full overflow-hidden"
                                onClick={() => handleDownload(filePath.trim(), fileName.trim())}
                              >
                                <Download className="h-3 w-3 mr-2 flex-shrink-0" />
                                <span className="truncate">Download {fileName.trim()}</span>
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

              {/* Hold / Resume History */}
              {holdHistory && holdHistory.length > 0 && (
                <div className="p-4 bg-muted/30 rounded-lg space-y-3">
                  <h3 className="font-semibold flex items-center gap-2">
                    <PauseCircle className="h-4 w-4" />
                    Hold / Resume History ({holdHistory.length})
                  </h3>
                  <div className="space-y-2">
                    {holdHistory.map((entry: any) => (
                      <div key={entry.id} className={`p-3 rounded-md border text-sm space-y-1 ${entry.event_type === 'hold' ? 'bg-amber-50 border-amber-200 dark:bg-amber-500/10 dark:border-amber-500/30' : 'bg-green-50 border-green-200 dark:bg-green-500/10 dark:border-green-500/30'}`}>
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-2">
                            {entry.event_type === 'hold' ? (
                              <PauseCircle className="h-3.5 w-3.5 text-amber-600" />
                            ) : (
                              <PlayCircle className="h-3.5 w-3.5 text-green-600" />
                            )}
                            <span className="font-medium">
                              {entry.event_type === 'hold' ? 'Put On Hold' : 'Resumed'}
                            </span>
                            <span className="text-muted-foreground">by {entry.performer_name}</span>
                          </div>
                          <span className="text-xs text-muted-foreground">
                            {format(new Date(entry.created_at), 'MMM d, yyyy h:mm a')}
                          </span>
                        </div>
                        {entry.event_type === 'hold' && entry.reason && (
                          <p className="text-xs text-muted-foreground ml-5.5">
                            <span className="font-medium">Reason:</span> {entry.reason}
                          </p>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Reassignment History */}
              {reassignmentHistory && reassignmentHistory.length > 0 && (
                <div className="p-4 bg-muted/30 rounded-lg space-y-3">
                  <h3 className="font-semibold flex items-center gap-2">
                    <RotateCcw className="h-4 w-4" />
                    Reassignment History ({reassignmentHistory.length})
                  </h3>
                  <div className="space-y-2">
                    {reassignmentHistory.map((entry: any) => (
                      <div key={entry.id} className="p-3 bg-background rounded-md border text-sm space-y-1">
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-1.5">
                            <span className="text-muted-foreground">{entry.from_name || "Unassigned"}</span>
                            <span className="text-muted-foreground">→</span>
                            <span className="font-medium text-foreground">{entry.to_name || "Unknown"}</span>
                          </div>
                          <span className="text-xs text-muted-foreground">
                            {format(new Date(entry.created_at), 'MMM d, yyyy h:mm a')}
                          </span>
                        </div>
                        <p className="text-xs text-muted-foreground">
                          <span className="font-medium">Reason:</span> {entry.reason}
                        </p>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>
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
      {/* Hold Order Dialog */}
      <Dialog open={holdOrderDialog.open} onOpenChange={(open) => {
        if (!open) {
          setHoldOrderDialog({ open: false, taskId: "" });
          setHoldOrderReason("");
        }
      }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Put Order on Hold</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">
              This will pause the entire order. All active phases will be effectively frozen.
            </p>
            <div className="space-y-2">
              <Label htmlFor="hold-reason">Hold Reason *</Label>
              <Textarea
                id="hold-reason"
                value={holdOrderReason}
                onChange={(e) => setHoldOrderReason(e.target.value)}
                placeholder="Explain why this order is being put on hold (e.g., customer unavailable, waiting for information)..."
                rows={4}
              />
            </div>
            <Button
              onClick={() => holdOrder.mutate({ 
                taskId: holdOrderDialog.taskId, 
                reason: holdOrderReason,
              })}
              disabled={!holdOrderReason.trim()}
              className="w-full bg-amber-500 text-white hover:bg-amber-600"
            >
              <PauseCircle className="h-4 w-4 mr-2" />
              Put on Hold
            </Button>
          </div>
        </DialogContent>
      </Dialog>
      {/* Launch Website Dialog */}
      <Dialog open={!!launchDialog} onOpenChange={(open) => {
        if (!open) {
          setLaunchDialog(null);
          setLaunchData({
            domain: "", accessMethod: "", domainProvider: "", hostingUsername: "", hostingPassword: "",
            hostingProvider: "plex_hosting", hostingTotal: "", hostingPaid: "", hostingPending: "",
            hostingAccessMethod: "", hostingProviderName: "", hostingCredUsername: "", hostingCredPassword: "",
          });
        }
      }}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Rocket className="h-5 w-5 text-blue-600" />
              Launch Website
            </DialogTitle>
            <p className="text-sm text-muted-foreground">{launchDialog?.taskTitle}</p>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="launch-domain">Domain Name *</Label>
              <Input
                id="launch-domain"
                value={launchData.domain}
                onChange={(e) => setLaunchData(d => ({ ...d, domain: e.target.value }))}
                placeholder="www.exampleclient.com"
              />
            </div>

            <div className="space-y-2">
              <Label>Access Method *</Label>
              <Select value={launchData.accessMethod} onValueChange={(v) => setLaunchData(d => ({ ...d, accessMethod: v }))}>
                <SelectTrigger>
                  <SelectValue placeholder="Select access method" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="credentials">Client will provide domain login credentials</SelectItem>
                  <SelectItem value="delegate">Client will delegate access</SelectItem>
                   <SelectItem value="nameservers">Client will change nameservers</SelectItem>
                   <SelectItem value="dns_records">Client will update DNS records</SelectItem>
                   <SelectItem value="not_required">Not required</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {launchData.accessMethod === "credentials" && (
              <div className="space-y-3">
                <div className="space-y-2">
                  <Label htmlFor="launch-domain-provider">Domain Provider</Label>
                  <Input
                    id="launch-domain-provider"
                    value={launchData.domainProvider}
                    onChange={(e) => setLaunchData(d => ({ ...d, domainProvider: e.target.value }))}
                    placeholder="e.g. GoDaddy, Namecheap"
                  />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-2">
                    <Label htmlFor="launch-username">Domain Username</Label>
                    <Input
                      id="launch-username"
                      value={launchData.hostingUsername}
                      onChange={(e) => setLaunchData(d => ({ ...d, hostingUsername: e.target.value }))}
                      placeholder="Username"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="launch-password">Domain Password</Label>
                    <Input
                      id="launch-password"
                      type="password"
                      value={launchData.hostingPassword}
                      onChange={(e) => setLaunchData(d => ({ ...d, hostingPassword: e.target.value }))}
                      placeholder="Password"
                    />
                  </div>
                </div>
              </div>
            )}

            {launchData.accessMethod === "delegate" && (
              <div className="p-3 rounded-md border bg-blue-50 dark:bg-blue-950/30 border-blue-200 dark:border-blue-800">
                <p className="text-sm font-medium text-blue-800 dark:text-blue-200 mb-2">📧 Delegate Access Instructions</p>
                <p className="text-sm text-blue-700 dark:text-blue-300">
                  The client will need to provide delegate access to:
                </p>
                <div className="mt-2 px-3 py-2 bg-white dark:bg-background rounded border font-mono text-sm">
                  Charley@plexLogo.com
                </div>
                <p className="text-xs text-muted-foreground mt-2">
                  This email is pre-configured and cannot be changed. You will need to call the client and explain the delegation process.
                </p>
              </div>
            )}

            <div className="space-y-2">
              <Label>Hosting Provider *</Label>
              <Select value={launchData.hostingProvider} onValueChange={(v) => setLaunchData(d => ({ ...d, hostingProvider: v }))}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="plex_hosting">Plex Hosting</SelectItem>
                  <SelectItem value="client_hosting">Client Hosting</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {launchData.hostingProvider === "plex_hosting" && (
              <div className="space-y-2">
                <Label>Plex Hosting Price</Label>
                <div className="grid grid-cols-3 gap-2">
                  <div>
                    <Label className="text-xs text-muted-foreground">Total</Label>
                    <Input
                      type="number"
                      value={launchData.hostingTotal}
                      onChange={(e) => setLaunchData(d => ({ ...d, hostingTotal: e.target.value }))}
                      placeholder="0"
                    />
                  </div>
                  <div>
                    <Label className="text-xs text-muted-foreground">Paid</Label>
                    <Input
                      type="number"
                      value={launchData.hostingPaid}
                      onChange={(e) => setLaunchData(d => ({ ...d, hostingPaid: e.target.value }))}
                      placeholder="0"
                    />
                  </div>
                  <div>
                    <Label className="text-xs text-muted-foreground">Pending</Label>
                    <Input
                      type="number"
                      value={launchData.hostingPending}
                      onChange={(e) => setLaunchData(d => ({ ...d, hostingPending: e.target.value }))}
                      placeholder="0"
                    />
                  </div>
                </div>
              </div>
            )}

            {launchData.hostingProvider === "client_hosting" && (
              <div className="space-y-3">
                <div className="space-y-2">
                  <Label>Hosting Provider Name</Label>
                  <Input
                    value={launchData.hostingProviderName}
                    onChange={(e) => setLaunchData(d => ({ ...d, hostingProviderName: e.target.value }))}
                    placeholder="e.g. GoDaddy, Bluehost, etc."
                  />
                </div>
                <div className="space-y-2">
                  <Label>Hosting Access Method *</Label>
                  <Select value={launchData.hostingAccessMethod} onValueChange={(v) => setLaunchData(d => ({ ...d, hostingAccessMethod: v }))}>
                    <SelectTrigger>
                      <SelectValue placeholder="Select hosting access method" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="hosting_delegate">Client will give delegate access</SelectItem>
                      <SelectItem value="hosting_credentials">Client will provide hosting login credentials</SelectItem>
                      <SelectItem value="self_launch">Client will launch himself (Self-Launch)</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                {launchData.hostingAccessMethod === "hosting_delegate" && (
                  <div className="p-3 rounded-md border bg-blue-50 dark:bg-blue-950/30 border-blue-200 dark:border-blue-800">
                    <p className="text-sm font-medium text-blue-800 dark:text-blue-200 mb-2">📧 Hosting Delegate Access</p>
                    <p className="text-sm text-blue-700 dark:text-blue-300">
                      The client will need to provide delegate access to the hosting account:
                    </p>
                    <div className="mt-2 px-3 py-2 bg-white dark:bg-background rounded border font-mono text-sm">
                      Charley@plexLogo.com
                    </div>
                    <p className="text-xs text-muted-foreground mt-2">
                      Call the client and explain how to delegate hosting access.
                    </p>
                  </div>
                )}

                {launchData.hostingAccessMethod === "hosting_credentials" && (
                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-2">
                      <Label>Hosting Username</Label>
                      <Input
                        value={launchData.hostingCredUsername}
                        onChange={(e) => setLaunchData(d => ({ ...d, hostingCredUsername: e.target.value }))}
                        placeholder="Username"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label>Hosting Password</Label>
                      <Input
                        type="password"
                        value={launchData.hostingCredPassword}
                        onChange={(e) => setLaunchData(d => ({ ...d, hostingCredPassword: e.target.value }))}
                        placeholder="Password"
                      />
                    </div>
                  </div>
                )}

                {launchData.hostingAccessMethod === "self_launch" && (
                  <div className="p-3 rounded-md border bg-amber-50 dark:bg-amber-950/30 border-amber-200 dark:border-amber-800">
                    <p className="text-sm font-medium text-amber-800 dark:text-amber-200 mb-2">📦 Self-Launch Process</p>
                    <p className="text-sm text-amber-700 dark:text-amber-300">
                      The developer will generate a WeTransfer download link for the website files. You will communicate this link to the client, who will perform the launch themselves.
                    </p>
                  </div>
                )}
              </div>
            )}

            <Button
              onClick={() => {
                if (!launchDialog) return;
                if (!launchData.domain.trim() || !launchData.accessMethod) {
                  toast({ variant: "destructive", title: "Please fill in all required fields" });
                  return;
                }
                launchWebsite.mutate({
                  taskId: launchDialog.taskId,
                  taskTitle: launchDialog.taskTitle,
                  developerId: launchDialog.developerId,
                  launch: launchData,
                });
              }}
              disabled={launchWebsite.isPending}
              className="w-full bg-blue-600 hover:bg-blue-700"
            >
              <Rocket className="h-4 w-4 mr-2" />
              {launchWebsite.isPending ? "Launching..." : "Launch Website"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
      {/* Chat Dialog */}
      <Dialog open={!!chatTask} onOpenChange={(open) => !open && setChatTask(null)}>
        <DialogContent className="max-w-xl max-h-[85vh] p-0 gap-0">
          <DialogHeader className="px-6 pt-6 pb-3">
            <DialogTitle>
              Chat — Order #{chatTask?.task_number}
              <span className="block text-sm font-normal text-muted-foreground mt-0.5">{chatTask?.title}</span>
            </DialogTitle>
          </DialogHeader>
          {chatTask && (
            <OrderChat taskId={chatTask.id} taskTitle={chatTask.title} taskNumber={chatTask.task_number} />
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default PMDashboard;
