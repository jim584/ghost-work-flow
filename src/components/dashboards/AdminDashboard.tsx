import { useState, useMemo, useEffect } from "react";
import { calculateOverdueWorkingMinutes, calculateRemainingWorkingMinutes, CalendarConfig, LeaveRecord, toTimezoneDate, getISODay, timeToMinutes, isWithinShift } from "@/utils/workingHours";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { LogOut, Users, FolderKanban, CheckCircle2, Clock, FileText, Download, ChevronDown, ChevronUp, UserCog, UserPlus, Edit2, Shield, KeyRound, RefreshCw, History, Palette, Code, FileDown, Plus, Globe, Image, XCircle, Ban, User, Mail, Phone, DollarSign, Calendar, MessageCircle, Timer, RotateCcw, PauseCircle, PlayCircle, Rocket, AlertTriangle } from "lucide-react";
import { OrderChat, useUnreadMessageCounts } from "@/components/OrderChat";
import { exportTasksToCSV, exportSalesPerformanceToCSV, exportUsersToCSV } from "@/utils/csvExport";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { FilePreview } from "@/components/FilePreview";
import { useProjectManagers } from "@/hooks/useProjectManagers";
import { NotificationBell } from "@/components/NotificationBell";
import { CreateTaskForm } from "./CreateTaskForm";
import { CreateLogoOrderForm } from "./CreateLogoOrderForm";
import { CreateWebsiteOrderForm } from "./CreateWebsiteOrderForm";
import { format, startOfWeek, startOfMonth, endOfMonth, subMonths, isWithinInterval } from "date-fns";
import { z } from "zod";
import { AvailabilityCalendarsManager } from "@/components/admin/AvailabilityCalendarsManager";
import { DeveloperResourcesManager } from "@/components/admin/DeveloperResourcesManager";
import { LeaveManagement } from "@/components/admin/LeaveManagement";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Database } from "@/integrations/supabase/types";
import { PhaseReviewSection } from "./PhaseReviewSection";

// Format overdue minutes with decimal days and hours/minutes
function formatOverdueTime(totalMinutes: number, slaHoursPerDay: number, paused: boolean): string {
  const h = Math.floor(totalMinutes / 60);
  const m = Math.floor(totalMinutes % 60);
  if (slaHoursPerDay > 0) {
    const minutesPerDay = slaHoursPerDay * 60;
    const decimalDays = totalMinutes / minutesPerDay;
    const hm = `${h}h ${m}m`;
    const pausedStr = paused ? ' (paused)' : '';
    return `${hm}${pausedStr} — ${decimalDays.toFixed(1)} days`;
  }
  const timeStr = `${h}h ${m}m`;
  return paused ? `${timeStr} (paused)` : timeStr;
}

// SLA Countdown component - shows remaining working hours
const SlaCountdown = ({ deadline, label, calendar, leaves, slaHours }: { 
  deadline: string; label?: string; calendar?: CalendarConfig | null; leaves?: LeaveRecord[]; slaHours?: number 
}) => {
  const [now, setNow] = useState(new Date());

  useEffect(() => {
    const interval = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(interval);
  }, []);

  const deadlineDate = new Date(deadline);
  const diffMs = deadlineDate.getTime() - now.getTime();

  let hours: number, mins: number, secs: number, timeStr: string;

  if (calendar) {
    if (diffMs <= 0) {
      const overdueMinutes = calculateOverdueWorkingMinutes(now, deadlineDate, calendar, leaves || []);
      const totalMinutesWithSla = overdueMinutes + (slaHours || 0) * 60;
      const localNow = toTimezoneDate(now, calendar.timezone);
      const dayOfWeek = getISODay(localNow);
      const currentMinute = localNow.getHours() * 60 + localNow.getMinutes();
      const isSat = dayOfWeek === 6;
      const todayStart = isSat && calendar.saturday_start_time ? timeToMinutes(calendar.saturday_start_time) : timeToMinutes(calendar.start_time);
      const todayEnd = isSat && calendar.saturday_end_time ? timeToMinutes(calendar.saturday_end_time) : timeToMinutes(calendar.end_time);
      const isWorkingNow = calendar.working_days.includes(dayOfWeek) && isWithinShift(currentMinute, todayStart, todayEnd);
      hours = Math.floor(totalMinutesWithSla / 60);
      mins = Math.floor(totalMinutesWithSla % 60);
      secs = 0;
      timeStr = formatOverdueTime(totalMinutesWithSla, slaHours || 0, !isWorkingNow);
    } else {
      const remainingMinutes = calculateRemainingWorkingMinutes(now, deadlineDate, calendar, leaves || []);
      hours = Math.floor(remainingMinutes / 60);
      mins = Math.floor(remainingMinutes % 60);
      const localNow = toTimezoneDate(now, calendar.timezone);
      const dayOfWeek = getISODay(localNow);
      const currentMinute = localNow.getHours() * 60 + localNow.getMinutes();
      const isSat = dayOfWeek === 6;
      const todayStart = isSat && calendar.saturday_start_time ? timeToMinutes(calendar.saturday_start_time) : timeToMinutes(calendar.start_time);
      const todayEnd = isSat && calendar.saturday_end_time ? timeToMinutes(calendar.saturday_end_time) : timeToMinutes(calendar.end_time);
      const isWorkingNow = calendar.working_days.includes(dayOfWeek) && isWithinShift(currentMinute, todayStart, todayEnd);
      if (isWorkingNow) {
        secs = 60 - now.getSeconds();
        if (secs === 60) secs = 0;
      } else {
        secs = 0;
      }
      timeStr = isWorkingNow
        ? `${hours}h ${mins}m ${secs.toString().padStart(2, '0')}s`
        : `${hours}h ${mins}m (paused)`;
    }
  } else {
    const totalSeconds = Math.floor(Math.abs(diffMs) / 1000);
    hours = Math.floor(totalSeconds / 3600);
    mins = Math.floor((totalSeconds % 3600) / 60);
    secs = totalSeconds % 60;
    timeStr = `${hours}h ${mins}m ${secs.toString().padStart(2, '0')}s`;
  }

  if (diffMs <= 0) {
    return (
      <div className="flex items-center gap-1.5 text-destructive">
        <Timer className="h-3.5 w-3.5 animate-pulse" />
        <span className="text-xs font-semibold font-mono">{label || "SLA"} OVERDUE by {timeStr}</span>
      </div>
    );
  }

  const isUrgent = calendar 
    ? (hours === 0 && mins < 120) || (hours < 2)
    : diffMs < 120 * 60 * 1000;

  return (
    <div className={`flex items-center gap-1.5 ${isUrgent ? 'text-destructive' : 'text-warning'}`}>
      <Timer className="h-3.5 w-3.5" />
      <span className="text-xs font-semibold font-mono">
        {label || "SLA"}: {timeStr} remaining
      </span>
    </div>
  );
};

// Phase progress component for website orders
const PhaseProgress = ({ currentPhase, totalPhases, phases }: { currentPhase: number; totalPhases?: number | null; phases?: any[] }) => {
  const getPhaseLabel = (phase: number) => {
    if (phase === 1) return "Homepage (1 page, 3 pts)";
    return "Inner pages (3 pts max)";
  };

  let totalPages = 0;
  let totalPoints = 0;
  const completedPhases = phases?.filter(p => p.status === "completed").length || 0;
  if (phases?.length) {
    for (const p of phases) {
      if (p.status === "completed" || p.status === "in_progress") {
        if (p.phase_number === 1) {
          totalPages += 1;
        } else if (p.status === "completed") {
          totalPages += p.pages_completed || 3;
        }
        if (p.status === "completed") {
          totalPoints += p.points || 3;
        }
      }
    }
  }

  const getReviewBadge = (phase: any) => {
    if (!phase.review_status) return null;
    if (phase.review_status === "approved") {
      return <Badge className="bg-green-600 text-white text-[10px] px-1.5 py-0">Approved</Badge>;
    }
    if (phase.review_status === "approved_with_changes") {
      return <Badge className="bg-amber-500 text-white text-[10px] px-1.5 py-0">Changes Needed</Badge>;
    }
    if (phase.review_status === "disapproved_with_changes") {
      return <Badge variant="destructive" className="text-[10px] px-1.5 py-0">Changes Required</Badge>;
    }
    return null;
  };

  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between text-xs">
        <span className="font-medium">Phase {currentPhase}{totalPhases ? ` of ${totalPhases}` : ''}</span>
        <span className="text-muted-foreground">{getPhaseLabel(currentPhase)}</span>
      </div>
      <div className="flex gap-1">
        {Array.from({ length: currentPhase }).map((_, i) => {
          const phase = phases?.find(p => p.phase_number === i + 1);
          let barColor = i < completedPhases ? 'bg-primary' : 'bg-primary/40';
          if (phase?.review_status === 'disapproved_with_changes' && !phase?.change_completed_at) {
            barColor = 'bg-destructive';
          } else if (phase?.review_status === 'approved_with_changes' && !phase?.change_completed_at) {
            barColor = 'bg-amber-500';
          } else if (phase?.review_status === 'approved') {
            barColor = 'bg-green-600';
          }
          return (
            <div key={i} className={`h-2 flex-1 rounded-full ${barColor}`} />
          );
        })}
      </div>
      {phases?.some(p => p.review_status) && (
        <div className="flex flex-wrap gap-1">
          {phases?.filter(p => p.review_status).map(p => (
            <div key={p.id} className="flex items-center gap-1">
              <span className="text-[10px] text-muted-foreground">P{p.phase_number}:</span>
              {getReviewBadge(p)}
            </div>
          ))}
        </div>
      )}
      {phases?.length ? (
        <div className="flex items-center justify-between text-xs text-muted-foreground">
          <span>{totalPages} page{totalPages !== 1 ? 's' : ''} developed</span>
          <span className="font-semibold text-primary">{totalPoints} pts earned</span>
        </div>
      ) : null}
    </div>
  );
};

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

  // Realtime subscription for phase_reviews and project_phases
  useEffect(() => {
    const channel = supabase
      .channel('admin-phase-reviews-realtime')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'phase_reviews' }, () => {
        queryClient.invalidateQueries({ queryKey: ["admin-tasks"] });
        queryClient.invalidateQueries({ queryKey: ["admin-project-phases"] });
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'project_phases' }, () => {
        queryClient.invalidateQueries({ queryKey: ["admin-tasks"] });
        queryClient.invalidateQueries({ queryKey: ["admin-project-phases"] });
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'phase_review_replies' }, () => {
        queryClient.invalidateQueries({ queryKey: ["admin-unread-replies"] });
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
  
  const [viewDetailsTask, setViewDetailsTask] = useState<any>(null);
  const [expandedTaskId, setExpandedTaskId] = useState<string | null>(null);
  const [revisionDialog, setRevisionDialog] = useState<{ open: boolean; submissionId: string; fileName: string } | null>(null);
  const [revisionNotes, setRevisionNotes] = useState("");
  const [revisionFile, setRevisionFile] = useState<File | null>(null);
  const [uploadingRevision, setUploadingRevision] = useState(false);
  const [showUserManagement, setShowUserManagement] = useState(false);
  const [showPmBreakdown, setShowPmBreakdown] = useState(false);
  const [showFsBreakdown, setShowFsBreakdown] = useState(false);
  const [showAddUserDialog, setShowAddUserDialog] = useState(false);
  const [newUserData, setNewUserData] = useState({ 
    email: "", 
    password: "", 
    full_name: "", 
    team_name: "", 
    role: "designer" as "admin" | "project_manager" | "designer" | "developer" | "front_sales" | "development_team_leader" 
  });
  const [passwordError, setPasswordError] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState<string | null>("priority");
  const [orderTypeFilter, setOrderTypeFilter] = useState<string | null>(null);
  const [editTeamDialog, setEditTeamDialog] = useState<{ open: boolean; teamId: string; currentName: string } | null>(null);
  const [newTeamName, setNewTeamName] = useState("");
  const [viewMode, setViewMode] = useState<'tasks' | 'portfolio' | 'sales_performance' | 'pm_workload' | 'developer_workload' | 'developer_resources'>('tasks');
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
  const [cancelDialog, setCancelDialog] = useState<{ open: boolean; taskId: string } | null>(null);
  const [cancelReason, setCancelReason] = useState("");
  const [createOrderOpen, setCreateOrderOpen] = useState(false);
  const [taskType, setTaskType] = useState<"social_media" | "logo" | "website" | null>(null);
  const [designerPerformanceOpen, setDesignerPerformanceOpen] = useState(false);
  const [prevMonthDesignerOpen, setPrevMonthDesignerOpen] = useState(false);
  const [showAllCurrentDesigner, setShowAllCurrentDesigner] = useState(false);
  const [showAllPreviousDesigner, setShowAllPreviousDesigner] = useState(false);
  const [pmWorkloadDialog, setPmWorkloadDialog] = useState<{ open: boolean; pmId: string; pmName: string } | null>(null);
  const [pmWorkloadFilter, setPmWorkloadFilter] = useState<'all' | 'this_month'>('all');
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
  const [holdOrderDialog, setHoldOrderDialog] = useState<{ open: boolean; taskId: string }>({ open: false, taskId: "" });
  const [holdOrderReason, setHoldOrderReason] = useState("");

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

  // Unread message counts for chat
  const adminTaskIds = tasks?.map((t: any) => t.id) || [];
  const { data: unreadCounts } = useUnreadMessageCounts(adminTaskIds);

  // Fetch developer calendars for working-hours overdue calculation
  const { data: developerCalendars } = useQuery({
    queryKey: ["admin-developer-calendars"],
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
    queryKey: ["admin-leave-records"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("leave_records")
        .select("developer_id, leave_start_datetime, leave_end_datetime")
        .eq("status", "approved");
      if (error) throw error;
      return data;
    },
  });

  // Fetch reassignment history for view details
  const { data: reassignmentHistory } = useQuery({
    queryKey: ["admin-reassignment-history", viewDetailsTask?.id],
    queryFn: async () => {
      if (!viewDetailsTask?.id) return [];
      const { data, error } = await supabase
        .from("reassignment_history" as any)
        .select("*")
        .eq("task_id", viewDetailsTask.id)
        .order("created_at", { ascending: false });
      if (error) throw error;
      
      // Fetch developer names
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

  // Fetch designer teams only (for order creation forms)
  const { data: designerTeams } = useQuery({
    queryKey: ["designer-teams"],
    queryFn: async () => {
      const { data: designerRoles, error: rolesError } = await supabase
        .from("user_roles")
        .select("user_id")
        .eq("role", "designer");
      if (rolesError) throw rolesError;
      const designerUserIds = designerRoles?.map(r => r.user_id) || [];
      if (designerUserIds.length === 0) return [];
      const { data: designerTeamMembers, error: membersError } = await supabase
        .from("team_members")
        .select("team_id")
        .in("user_id", designerUserIds);
      if (membersError) throw membersError;
      const designerTeamIds = [...new Set(designerTeamMembers?.map(m => m.team_id) || [])];
      if (designerTeamIds.length === 0) return [];
      const { data: teamsData, error: teamsError } = await supabase
        .from("teams")
        .select("*")
        .in("id", designerTeamIds);
      if (teamsError) throw teamsError;
      return teamsData;
    },
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

  // Cancel order mutation
  const cancelOrder = useMutation({
    mutationFn: async ({ taskId, reason }: { taskId: string; reason: string }) => {
      const task = tasks?.find(t => t.id === taskId);
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
      queryClient.invalidateQueries({ queryKey: ["admin-tasks"] });
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

  // Nameserver workflow mutations
  const forwardNameservers = useMutation({
    mutationFn: async ({ taskId }: { taskId: string }) => {
      const { error } = await supabase
        .from("tasks")
        .update({ launch_nameserver_status: "forwarded_to_client" } as any)
        .eq("id", taskId);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin-tasks"] });
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
      queryClient.invalidateQueries({ queryKey: ["admin-tasks"] });
      toast({ title: "Nameservers confirmed — developer notified" });
    },
  });

  // DNS records workflow mutations
  const forwardDnsRecords = useMutation({
    mutationFn: async ({ taskId }: { taskId: string }) => {
      const { error } = await supabase
        .from("tasks")
        .update({ launch_dns_status: "dns_forwarded_to_client" } as any)
        .eq("id", taskId);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin-tasks"] });
      toast({ title: "DNS records forwarded to client" });
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
      queryClient.invalidateQueries({ queryKey: ["admin-tasks"] });
      toast({ title: "DNS records confirmed — developer notified" });
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
      queryClient.invalidateQueries({ queryKey: ["admin-tasks"] });
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
      queryClient.invalidateQueries({ queryKey: ["admin-tasks"] });
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
      queryClient.invalidateQueries({ queryKey: ["admin-tasks"] });
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
        const { data: developer } = await supabase.from("developers").select("user_id").eq("id", developerId).single();
        if (developer?.user_id) {
          await supabase.from("notifications").insert({
            user_id: developer.user_id, type: "hosting_delegate_confirmed",
            title: "Hosting Delegate Access Granted",
            message: `Client has granted hosting delegate access for ${domain}. Proceed with launch.`,
            task_id: taskId,
          });
        }
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin-tasks"] });
      toast({ title: "Hosting delegate access confirmed — developer notified" });
    },
  });

  const markSelfLaunchCompleted = useMutation({
    mutationFn: async ({ taskId, developerId, domain }: { taskId: string; developerId: string | null; domain: string }) => {
      const { error } = await supabase
        .from("tasks")
        .update({ launch_self_launch_status: "self_launch_completed" } as any)
        .eq("id", taskId);
      if (error) throw error;
      if (developerId) {
        const { data: developer } = await supabase.from("developers").select("user_id").eq("id", developerId).single();
        if (developer?.user_id) {
          await supabase.from("notifications").insert({
            user_id: developer.user_id, type: "self_launch_completed",
            title: "Self-Launch Completed",
            message: `Client has self-launched ${domain}. Please verify the website is live.`,
            task_id: taskId,
          });
        }
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin-tasks"] });
      toast({ title: "Self-launch marked as completed — developer notified to verify" });
    },
  });

  // Launch website mutation
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
      queryClient.invalidateQueries({ queryKey: ["admin-tasks"] });
      toast({ title: "Website sent for launch" });
      setLaunchDialog(null);
      setLaunchData({
        domain: "", accessMethod: "", domainProvider: "", hostingUsername: "", hostingPassword: "",
        hostingProvider: "plex_hosting", hostingTotal: "", hostingPaid: "", hostingPending: "",
        hostingAccessMethod: "", hostingProviderName: "", hostingCredUsername: "", hostingCredPassword: "",
      });
    },
  });

  // Update task status (for Approve)
  const updateTaskStatus = useMutation({
    mutationFn: async ({ taskId, status }: { taskId: string; status: Database["public"]["Enums"]["task_status"] }) => {
      const { error } = await supabase
        .from("tasks")
        .update({ status })
        .eq("id", taskId);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin-tasks"] });
      toast({ title: "Task status updated" });
    },
  });

  // Accept order mutation
  const acceptOrder = useMutation({
    mutationFn: async (taskId: string) => {
      const { error } = await supabase
        .from("tasks")
        .update({ accepted_by_pm: true } as any)
        .eq("id", taskId);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin-tasks"] });
      toast({ title: "Order accepted successfully" });
    },
  });

  // Hold order mutation
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
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin-tasks"] });
      toast({ title: "Order put on hold" });
      setHoldOrderDialog({ open: false, taskId: "" });
      setHoldOrderReason("");
    },
  });

  // Resume order mutation
  const resumeOrder = useMutation({
    mutationFn: async (taskId: string) => {
      const { data: taskData } = await supabase
        .from("tasks")
        .select("developer_id, held_at, sla_deadline, current_phase")
        .eq("id", taskId)
        .single();

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
        hold_reason: null,
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

      if (newDeadline && taskData?.current_phase) {
        await supabase
          .from("project_phases")
          .update({ sla_deadline: newDeadline } as any)
          .eq("task_id", taskId)
          .eq("phase_number", taskData.current_phase);
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin-tasks"] });
      toast({ title: "Order resumed", description: "SLA deadline recalculated with remaining time" });
    },
  });

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

  // Fetch project phases for website orders
  const { data: projectPhases } = useQuery({
    queryKey: ["admin-project-phases"],
    queryFn: async () => {
      const websiteTaskIds = tasks?.filter((t: any) => t.post_type === "Website Design").map((t: any) => t.id) || [];
      if (!websiteTaskIds.length) return [];
      const { data, error } = await supabase
        .from("project_phases")
        .select("*")
        .in("task_id", websiteTaskIds)
        .order("phase_number", { ascending: true });
      if (error) throw error;
      return data;
    },
    enabled: !!tasks?.length,
  });

  // Fetch phase reviews for website orders (cross-phase revision badges)
  const { data: adminPhaseReviews } = useQuery({
    queryKey: ["admin-phase-reviews", adminTaskIds],
    queryFn: async () => {
      const websiteTaskIds = tasks?.filter((t: any) => t.post_type === "Website Design").map((t: any) => t.id) || [];
      if (!websiteTaskIds.length) return [];
      const { data, error } = await supabase
        .from("phase_reviews")
        .select("*")
        .in("task_id", websiteTaskIds)
        .order("round_number", { ascending: false });
      if (error) throw error;
      return data;
    },
    enabled: !!tasks?.length,
  });

  // Fetch unread developer replies for admin's tasks
  const { data: unreadReplies } = useQuery({
    queryKey: ["admin-unread-replies", adminTaskIds],
    queryFn: async () => {
      if (!adminTaskIds.length) return [];
      const { data, error } = await supabase
        .from("phase_review_replies")
        .select("id, task_id, pm_read_at, user_id")
        .in("task_id", adminTaskIds)
        .is("pm_read_at", null)
        .neq("user_id", user!.id);
      if (error) throw error;
      return data || [];
    },
    enabled: !!adminTaskIds.length,
  });

  const getUnreadReplyCount = (taskId: string) => {
    return unreadReplies?.filter(r => r.task_id === taskId).length || 0;
  };

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

  // Fetch aggregate platform-wide closed revenue (non-upsell, deduplicated by order_group_id)
  const { data: platformClosedRevenue } = useQuery({
    queryKey: ["admin-platform-closed-revenue"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("tasks")
        .select("amount_total, order_group_id, closed_by")
        .not("closed_by", "is", null)
        .eq("is_upsell", false);
      if (error) throw error;
      const seenOrderGroups = new Set<string>();
      let total = 0;
      data?.forEach(task => {
        if (task.order_group_id) {
          if (!seenOrderGroups.has(task.order_group_id)) {
            seenOrderGroups.add(task.order_group_id);
            total += Number(task.amount_total) || 0;
          }
        } else {
          total += Number(task.amount_total) || 0;
        }
      });
      return total;
    },
  });

  // Compute aggregate platform-wide sales stats from salesTargets
  const platformStats = useMemo(() => {
    if (!salesTargets) return null;
    let totalClosed = 0, totalTransferred = 0, totalUpsell = 0, totalTarget = 0;
    salesTargets.forEach(t => {
      totalClosed += t.closed_orders_count || 0;
      totalTransferred += t.transferred_orders_count || 0;
      totalUpsell += Number(t.upsell_revenue) || 0;
      totalTarget += Number(t.monthly_dollar_target) || 0;
    });
    return { totalClosed, totalTransferred, totalUpsell, totalTarget };
  }, [salesTargets]);

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
      role: "admin" | "project_manager" | "designer" | "developer" | "front_sales" | "development_team_leader";
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
    mutationFn: async ({ userId, role }: { userId: string; role: "admin" | "project_manager" | "designer" | "developer" | "front_sales" | "development_team_leader" }) => {
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
      queryClient.invalidateQueries({ queryKey: ["admin-submissions"] });
      queryClient.invalidateQueries({ queryKey: ["admin-tasks"] });
      toast({ title: "Design approved successfully" });
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
      queryClient.invalidateQueries({ queryKey: ["admin-tasks"] });
      toast({ title: "Order verified and closed successfully" });
    },
    onError: (error: any) => {
      toast({ variant: "destructive", title: "Error", description: error.message });
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

  // Helper to get team delivery status
  const getTeamDeliveryStatus = (task: any, allSubmissions: any[]) => {
    if (task.status === 'cancelled') {
      return { status: 'cancelled', label: 'Cancelled', color: 'destructive' };
    }
    const teamSubmissions = allSubmissions?.filter(s => s.task_id === task.id) || [];
    if (teamSubmissions.length === 0) {
      return { status: 'pending_delivery', label: 'Pending Delivery', color: 'warning' };
    }
    const hasPending = teamSubmissions.some(s => s.revision_status === 'pending_review');
    const hasRevision = teamSubmissions.some(s => s.revision_status === 'needs_revision');
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
    // Check for completed tasks with no pending review but completed status
    const hasCompletedTask = activeTasks.some((t: any) => t.status === 'completed');
    if (hasPendingReview) categories.push('recently_delivered');
    else if (hasCompletedTask && groupSubmissions.length === 0) categories.push('recently_delivered');
    // For website orders, check if any phase has been submitted but not yet reviewed
    const isWebsiteGroup = representativeTask?.post_type === "Website Design";
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
      if (allApproved) categories.push('approved');
      else if (representativeTask.status === 'completed' || representativeTask.status === 'approved') categories.push('approved');
      else categories.push('other');
    }
    
    return categories;
  };

  // Primary category for display/sorting (highest priority)
  const getGroupCategory = (group: typeof groupedOrders[0], allSubmissions: any[]) => {
    return getGroupCategories(group, allSubmissions)[0];
  };

  const getTaskCategory = (task: any, submissions: any[]) => {
    const taskSubmissions = submissions?.filter(s => s.task_id === task.id) || [];
    const hasPendingReview = taskSubmissions.some(s => s.revision_status === 'pending_review');
    const hasNeedsRevision = taskSubmissions.some(s => s.revision_status === 'needs_revision');
    const allApproved = taskSubmissions.length > 0 && taskSubmissions.every(s => s.revision_status === 'approved');
    const isDeadlineDelayed = task.deadline && new Date(task.deadline) < today && 
                     !['completed', 'approved'].includes(task.status);
    const nowTask = new Date();
    const isRevisionDelayed = taskSubmissions.some(s => 
      s.revision_status === 'needs_revision' && s.reviewed_at && 
      (nowTask.getTime() - new Date(s.reviewed_at).getTime()) > 24 * 60 * 60 * 1000
    );
    const isDelayed = isDeadlineDelayed || isRevisionDelayed;
    
    if (task.status === 'cancelled') return 'cancelled';
    if (task.status === 'on_hold') return 'on_hold';
    if (hasPendingReview) return 'recently_delivered';
    // For website orders, check if any phase awaits review
    if (task?.post_type === "Website Design" && !hasPendingReview) {
      const hasPhaseAwaitingReview = (projectPhases || []).some(
        (p: any) => p.task_id === task.id && p.completed_at && !p.reviewed_at
      );
      if (hasPhaseAwaitingReview) return 'recently_delivered';
    }
    if (hasNeedsRevision) return 'needs_revision';
    if (isDelayed) return 'delayed';
    if (allApproved) return 'approved';
    if (task.status === 'completed' || task.status === 'approved') return 'approved';
    if (task.status === 'pending') return 'pending';
    if (task.status === 'in_progress') return 'in_progress';
    return 'other';
  };

  const getCategoryPriority = (category: string) => {
    const priorities: Record<string, number> = {
      recently_delivered: 1,
      pending_delivery: 2,
      delayed: 3,
      delayed_ack: 4,
      pending: 5,
      in_progress: 6,
      needs_revision: 7,
      approved: 8,
      cancelled: 9,
      other: 10,
    };
    return priorities[category] || 99;
  };

  const stats = {
    recently_delivered: groupedOrders.filter(g => getGroupCategories(g, submissions || []).includes('recently_delivered')).length,
    delayed: groupedOrders.filter(g => getGroupCategories(g, submissions || []).includes('delayed')).length,
    delayed_ack: groupedOrders.filter(g => getGroupCategories(g, submissions || []).includes('delayed_ack')).length,
    pending: groupedOrders.filter(g => getGroupCategories(g, submissions || []).includes('pending')).length,
    in_progress: groupedOrders.filter(g => getGroupCategories(g, submissions || []).includes('in_progress')).length,
    needs_revision: groupedOrders.filter(g => getGroupCategories(g, submissions || []).includes('needs_revision')).length,
    pending_delivery: groupedOrders.filter(g => getGroupCategories(g, submissions || []).includes('pending_delivery')).length,
    cancelled: groupedOrders.filter(g => getGroupCategories(g, submissions || []).includes('cancelled')).length,
    approved: groupedOrders.filter(g => getGroupCategories(g, submissions || []).includes('approved')).length,
    on_hold: groupedOrders.filter(g => getGroupCategories(g, submissions || []).includes('on_hold')).length,
    total: groupedOrders.length,
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

  // Filter and sort grouped orders
  const filteredOrders = groupedOrders.filter((group) => {
    const task = group.primaryTask;
    
    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase();
      const matchesSearch = task.title?.toLowerCase().includes(query) ||
        task.task_number?.toString().includes(query) ||
        task.business_name?.toLowerCase().includes(query) ||
        task.description?.toLowerCase().includes(query) ||
        `#${task.task_number}`.includes(query);
      
      if (orderTypeFilter) {
        const matchesOrderType = 
          (orderTypeFilter === 'logo' && task.post_type === 'Logo Design') ||
          (orderTypeFilter === 'social_media' && task.post_type !== 'Logo Design' && task.post_type !== 'Website Design') ||
          (orderTypeFilter === 'website' && task.post_type === 'Website Design');
        return matchesSearch && matchesOrderType;
      }
      return matchesSearch;
    }
    
    if (orderTypeFilter) {
      const matchesOrderType = 
        (orderTypeFilter === 'logo' && task.post_type === 'Logo Design') ||
        (orderTypeFilter === 'social_media' && task.post_type !== 'Logo Design' && task.post_type !== 'Website Design') ||
        (orderTypeFilter === 'website' && task.post_type === 'Website Design');
      if (!matchesOrderType) return false;
    }
    
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
      if (categoryA === 'pending_delivery') {
        const progressA = getMultiTeamDeliveryProgress(a, submissions || []);
        const progressB = getMultiTeamDeliveryProgress(b, submissions || []);
        const hasPartialA = progressA?.hasPartialDelivery ? 1 : 0;
        const hasPartialB = progressB?.hasPartialDelivery ? 1 : 0;
        if (hasPartialB !== hasPartialA) return hasPartialB - hasPartialA;
      }
    }
    return new Date(b.primaryTask.created_at!).getTime() - new Date(a.primaryTask.created_at!).getTime();
  });

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b bg-card">
        <div className="container mx-auto px-4 py-4 flex flex-col gap-3">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-2xl font-bold text-foreground">Welcome, {profile?.full_name || 'Admin'}</h1>
              <p className="text-sm text-muted-foreground">Admin Dashboard</p>
            </div>
            <div className="flex gap-2">
              <NotificationBell userId={user!.id} />
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
          {platformStats && (
            <div className="space-y-0">
              <div className="flex items-center gap-3 text-sm text-muted-foreground border rounded-lg px-3 py-1.5 bg-muted/30 flex-wrap">
                <button 
                  onClick={() => setShowPmBreakdown(!showPmBreakdown)} 
                  className="flex items-center gap-1 font-medium text-foreground hover:text-primary transition-colors"
                >
                  Platform Overview
                  {showPmBreakdown ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
                </button>
                <span className="text-border">|</span>
                <span>Target: <strong className="text-foreground">${platformStats.totalTarget.toLocaleString()}</strong></span>
                <span className="text-border">|</span>
                <span>Closed: <strong className="text-foreground">{platformStats.totalClosed}</strong></span>
                <span className="text-border">|</span>
                <span>Closed Value: <strong className="text-foreground">${(platformClosedRevenue || 0).toLocaleString()}</strong></span>
                <span className="text-border">|</span>
                <span>Transferred: <strong className="text-foreground">{platformStats.totalTransferred}</strong></span>
                <span className="text-border">|</span>
                <span>Upsells: <strong className="text-foreground">${platformStats.totalUpsell.toLocaleString()}</strong></span>
                <span className="text-border">|</span>
                <span>Total: <strong className="text-primary">${((platformClosedRevenue || 0) + platformStats.totalUpsell).toLocaleString()}</strong></span>
                {platformStats.totalTarget > 0 && (
                  <>
                    <span className="text-border">|</span>
                    <span>Progress: <strong className={((platformClosedRevenue || 0) + platformStats.totalUpsell) >= platformStats.totalTarget ? "text-green-600" : "text-foreground"}>
                      {Math.min(((platformClosedRevenue || 0) + platformStats.totalUpsell) / platformStats.totalTarget * 100, 100).toFixed(0)}%
                    </strong></span>
                  </>
                )}
              </div>
              {showPmBreakdown && pmUsers && salesTargets && (
                <div className="border border-t-0 rounded-b-lg bg-card overflow-hidden">
                  <Table>
                    <TableHeader>
                      <TableRow className="text-xs">
                        <TableHead className="py-2">PM</TableHead>
                        <TableHead className="py-2 text-right">Target</TableHead>
                        <TableHead className="py-2 text-right">Closed</TableHead>
                        <TableHead className="py-2 text-right">Closed Value</TableHead>
                        <TableHead className="py-2 text-right">Transferred</TableHead>
                        <TableHead className="py-2 text-right">Upsells</TableHead>
                        <TableHead className="py-2 text-right">Total</TableHead>
                        <TableHead className="py-2 text-right">Progress</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {pmUsers.map(pm => {
                        const target = salesTargets.find(t => t.user_id === pm.id);
                        const dollarTarget = Number(target?.monthly_dollar_target || 0);
                        const closedCount = target?.closed_orders_count || 0;
                        const closedValue = pm.closedRevenue || 0;
                        const transferred = target?.transferred_orders_count || 0;
                        const upsells = Number(target?.upsell_revenue || 0);
                        const total = closedValue + upsells;
                        const progress = dollarTarget > 0 ? Math.min((total / dollarTarget) * 100, 100) : 0;
                        return (
                          <TableRow key={pm.id} className="text-xs">
                            <TableCell className="py-1.5 font-medium">{pm.full_name || pm.email}</TableCell>
                            <TableCell className="py-1.5 text-right">${dollarTarget.toLocaleString()}</TableCell>
                            <TableCell className="py-1.5 text-right">{closedCount}</TableCell>
                            <TableCell className="py-1.5 text-right">${closedValue.toLocaleString()}</TableCell>
                            <TableCell className="py-1.5 text-right">{transferred}</TableCell>
                            <TableCell className="py-1.5 text-right">${upsells.toLocaleString()}</TableCell>
                            <TableCell className="py-1.5 text-right font-medium text-primary">${total.toLocaleString()}</TableCell>
                            <TableCell className="py-1.5 text-right">
                              <strong className={progress >= 100 ? "text-green-600" : "text-foreground"}>
                                {dollarTarget > 0 ? `${progress.toFixed(0)}%` : '—'}
                              </strong>
                            </TableCell>
                          </TableRow>
                        );
                      })}
                    </TableBody>
                  </Table>
                </div>
              )}
            </div>
          )}
          {frontSalesUsers && salesTargets && (
            <div className="space-y-0">
              <div className="flex items-center gap-3 text-sm text-muted-foreground border rounded-lg px-3 py-1.5 bg-muted/30 flex-wrap">
                <button 
                  onClick={() => setShowFsBreakdown(!showFsBreakdown)} 
                  className="flex items-center gap-1 font-medium text-foreground hover:text-primary transition-colors"
                >
                  Front Sales Overview
                  {showFsBreakdown ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
                </button>
                <span className="text-border">|</span>
                <span>Agents: <strong className="text-foreground">{frontSalesUsers.length}</strong></span>
                <span className="text-border">|</span>
                <span>Total Transferred: <strong className="text-foreground">{salesTargets.filter(t => frontSalesUsers.some(f => f.id === t.user_id)).reduce((sum, t) => sum + (t.transferred_orders_count || 0), 0)}</strong></span>
                <span className="text-border">|</span>
                <span>Total Closed: <strong className="text-foreground">{salesTargets.filter(t => frontSalesUsers.some(f => f.id === t.user_id)).reduce((sum, t) => sum + (t.closed_orders_count || 0), 0)}</strong></span>
                <span className="text-border">|</span>
                <span>Total Achieved: <strong className="text-primary">{salesTargets.filter(t => frontSalesUsers.some(f => f.id === t.user_id)).reduce((sum, t) => sum + (t.transferred_orders_count || 0) + (t.closed_orders_count || 0), 0)}</strong></span>
              </div>
              {showFsBreakdown && (
                <div className="border border-t-0 rounded-b-lg bg-card overflow-hidden">
                  <Table>
                    <TableHeader>
                      <TableRow className="text-xs">
                        <TableHead className="py-2">Agent</TableHead>
                        <TableHead className="py-2 text-right">Target</TableHead>
                        <TableHead className="py-2 text-right">Transferred</TableHead>
                        <TableHead className="py-2 text-right">Closed</TableHead>
                        <TableHead className="py-2 text-right">Achieved</TableHead>
                        <TableHead className="py-2 text-right">Progress</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {frontSalesUsers.map(agent => {
                        const target = salesTargets.find(t => t.user_id === agent.id);
                        const orderTarget = target?.monthly_order_target ?? 10;
                        const transferred = target?.transferred_orders_count || 0;
                        const closed = target?.closed_orders_count || 0;
                        const achieved = transferred + closed;
                        const progress = orderTarget > 0 ? Math.min((achieved / orderTarget) * 100, 100) : 0;
                        return (
                          <TableRow key={agent.id} className="text-xs">
                            <TableCell className="py-1.5 font-medium">{agent.full_name || agent.email}</TableCell>
                            <TableCell className="py-1.5 text-right">{orderTarget}</TableCell>
                            <TableCell className="py-1.5 text-right">{transferred}</TableCell>
                            <TableCell className="py-1.5 text-right">{closed}</TableCell>
                            <TableCell className="py-1.5 text-right font-medium text-primary">{achieved}</TableCell>
                            <TableCell className="py-1.5 text-right">
                              <strong className={progress >= 100 ? "text-green-600" : "text-foreground"}>
                                {progress.toFixed(0)}%
                              </strong>
                            </TableCell>
                          </TableRow>
                        );
                      })}
                    </TableBody>
                  </Table>
                </div>
              )}
            </div>
          )}
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
                          onValueChange={(role: "admin" | "project_manager" | "designer" | "developer" | "front_sales" | "development_team_leader") => 
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
                            <SelectItem value="development_team_leader">Dev Team Leader</SelectItem>
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
            <Button
              variant={viewMode === 'pm_workload' ? 'default' : 'outline'}
              onClick={() => setViewMode('pm_workload')}
            >
              PM Workload
            </Button>
            <Button
              variant={viewMode === 'developer_workload' ? 'default' : 'outline'}
              onClick={() => setViewMode('developer_workload')}
            >
              Dev Workload
            </Button>
            <Button
              variant={viewMode === 'developer_resources' ? 'default' : 'outline'}
              onClick={() => setViewMode('developer_resources')}
            >
              Developer Resources
            </Button>
          </div>
          {viewMode === 'tasks' && (
            <div className="flex gap-2 flex-wrap">
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
              <div className="border-l mx-1" />
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
          )}
          </div>
        
        {viewMode === 'tasks' && (
        <div className="grid gap-4 md:grid-cols-4 lg:grid-cols-8 mb-8">
          <Card 
            className={`border-l-4 border-l-amber-500 cursor-pointer transition-all hover:shadow-md ${statusFilter === 'on_hold' ? 'ring-2 ring-amber-500' : ''}`}
            onClick={() => setStatusFilter('on_hold')}
          >
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">On Hold</CardTitle>
              <PauseCircle className="h-4 w-4 text-amber-500" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{stats.on_hold}</div>
              <p className="text-xs text-muted-foreground">Paused orders</p>
            </CardContent>
          </Card>

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

          <Card 
            className={`border-l-4 border-l-emerald-600 cursor-pointer transition-all hover:shadow-md ${statusFilter === 'approved' ? 'ring-2 ring-emerald-600' : ''}`}
            onClick={() => setStatusFilter('approved')}
          >
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Approved</CardTitle>
              <CheckCircle2 className="h-4 w-4 text-emerald-600" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{stats.approved}</div>
              <p className="text-xs text-muted-foreground">Fully closed</p>
            </CardContent>
          </Card>
        </div>
        )}

        {/* Monthly Performance Section - Per Designer */}
        {viewMode === 'tasks' && (() => {
          const now = new Date();
          const curStart = startOfMonth(now);
          const curEnd = endOfMonth(now);
          const prevStart = startOfMonth(subMonths(now, 1));
          const prevEnd = endOfMonth(subMonths(now, 1));

          // Build designer stats from tasks + submissions
          const designerIds = users?.filter(u => 
            u.user_roles?.some((r: any) => r.role === 'designer')
          ).map(u => u.id) || [];

          const designerStats = designerIds.map(designerId => {
            const designerProfile = users?.find(u => u.id === designerId);
            const designerName = designerProfile?.full_name || designerProfile?.email || 'Unknown';
            
            // Find tasks assigned to this designer's teams
            const designerTeamIds = developerProfiles
              ?.filter((tm: any) => tm.user_id === designerId)
              .map((tm: any) => tm.team_id) || [];

            const designerTasks = tasks?.filter(t => designerTeamIds.includes(t.team_id)) || [];

            const currentMonthCompleted = designerTasks.filter(t =>
              (t.status === "completed" || t.status === "approved") &&
              t.updated_at &&
              isWithinInterval(new Date(t.updated_at), { start: curStart, end: curEnd })
            );

            const previousMonthCompleted = designerTasks.filter(t =>
              (t.status === "completed" || t.status === "approved") &&
              t.updated_at &&
              isWithinInterval(new Date(t.updated_at), { start: prevStart, end: prevEnd })
            );

            // Count submissions stats for current month
            const designerSubmissions = submissions?.filter(s => s.designer_id === designerId) || [];
            const currentMonthSubmissions = designerSubmissions.filter(s =>
              s.submitted_at && isWithinInterval(new Date(s.submitted_at), { start: curStart, end: curEnd })
            );
            const approvedCount = currentMonthSubmissions.filter(s => s.revision_status === 'approved').length;
            const revisionCount = currentMonthSubmissions.filter(s => s.revision_status === 'needs_revision').length;
            const pendingCount = currentMonthSubmissions.filter(s => s.revision_status === 'pending_review').length;

            return {
              id: designerId,
              name: designerName,
              currentMonth: currentMonthCompleted,
              previousMonth: previousMonthCompleted,
              totalSubmissions: currentMonthSubmissions.length,
              approvedCount,
              revisionCount,
              pendingCount,
            };
          });

          const totalCurrentMonth = designerStats.reduce((sum, d) => sum + d.currentMonth.length, 0);

          return (
            <Collapsible open={designerPerformanceOpen} onOpenChange={setDesignerPerformanceOpen}>
              <Card className="mb-8">
                <CollapsibleTrigger asChild>
                  <CardHeader className="cursor-pointer hover:bg-muted/50 transition-colors">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <Calendar className="h-5 w-5 text-primary" />
                        <CardTitle>Monthly Performance — Designers</CardTitle>
                      </div>
                      <div className="flex items-center gap-2">
                        <Badge variant="secondary" className="text-sm px-2 py-0.5">
                          {totalCurrentMonth} completed this month
                        </Badge>
                        <ChevronDown className={`h-4 w-4 text-muted-foreground transition-transform ${designerPerformanceOpen ? "rotate-180" : ""}`} />
                      </div>
                    </div>
                  </CardHeader>
                </CollapsibleTrigger>
                <CollapsibleContent>
                  <CardContent className="space-y-6">
                    {/* Current Month */}
                    <div>
                      <h3 className="font-semibold text-lg mb-3">{format(now, "MMMM yyyy")}</h3>
                      {designerStats.length === 0 ? (
                        <p className="text-sm text-muted-foreground text-center py-4">No designers found.</p>
                      ) : (
                        <Table>
                          <TableHeader>
                            <TableRow>
                              <TableHead>Designer</TableHead>
                              <TableHead className="text-center">Orders Completed</TableHead>
                              <TableHead className="text-center">Files Submitted</TableHead>
                              <TableHead className="text-center">Approved</TableHead>
                              <TableHead className="text-center">Revisions</TableHead>
                              <TableHead className="text-center">Pending Review</TableHead>
                            </TableRow>
                          </TableHeader>
                          <TableBody>
                            {designerStats.map(designer => (
                              <TableRow key={designer.id}>
                                <TableCell className="font-medium">{designer.name}</TableCell>
                                <TableCell className="text-center">
                                  <Badge variant="secondary">{designer.currentMonth.length}</Badge>
                                </TableCell>
                                <TableCell className="text-center">{designer.totalSubmissions}</TableCell>
                                <TableCell className="text-center">
                                  <span className="text-green-600 font-medium">{designer.approvedCount}</span>
                                </TableCell>
                                <TableCell className="text-center">
                                  <span className="text-orange-600 font-medium">{designer.revisionCount}</span>
                                </TableCell>
                                <TableCell className="text-center">
                                  <span className="text-blue-600 font-medium">{designer.pendingCount}</span>
                                </TableCell>
                              </TableRow>
                            ))}
                          </TableBody>
                        </Table>
                      )}
                    </div>

                    {/* Previous Month */}
                    <Collapsible open={prevMonthDesignerOpen} onOpenChange={setPrevMonthDesignerOpen}>
                      <CollapsibleTrigger className="flex items-center gap-2 text-sm font-medium text-muted-foreground hover:text-foreground transition-colors w-full">
                        <ChevronDown className={`h-4 w-4 transition-transform ${prevMonthDesignerOpen ? "rotate-180" : ""}`} />
                        {format(subMonths(now, 1), "MMMM yyyy")} — {designerStats.reduce((sum, d) => sum + d.previousMonth.length, 0)} completed
                      </CollapsibleTrigger>
                      <CollapsibleContent className="mt-3">
                        {designerStats.length === 0 ? (
                          <p className="text-sm text-muted-foreground text-center py-4">No data.</p>
                        ) : (
                          <Table>
                            <TableHeader>
                              <TableRow>
                                <TableHead>Designer</TableHead>
                                <TableHead className="text-center">Orders Completed</TableHead>
                              </TableRow>
                            </TableHeader>
                            <TableBody>
                              {designerStats.map(designer => (
                                <TableRow key={designer.id}>
                                  <TableCell className="font-medium">{designer.name}</TableCell>
                                  <TableCell className="text-center">
                                    <Badge variant="secondary">{designer.previousMonth.length}</Badge>
                                  </TableCell>
                                </TableRow>
                              ))}
                            </TableBody>
                          </Table>
                        )}
                      </CollapsibleContent>
                    </Collapsible>
                  </CardContent>
                </CollapsibleContent>
              </Card>
            </Collapsible>
          );
        })()}

        {viewMode === 'tasks' && (
        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle>All Tasks</CardTitle>
            <Dialog open={createOrderOpen} onOpenChange={(isOpen) => {
              setCreateOrderOpen(isOpen);
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
                        setCreateOrderOpen(false);
                        setTaskType(null);
                        queryClient.invalidateQueries({ queryKey: ["admin-tasks"] });
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
                        setCreateOrderOpen(false);
                        setTaskType(null);
                        queryClient.invalidateQueries({ queryKey: ["admin-tasks"] });
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
                        setCreateOrderOpen(false);
                        setTaskType(null);
                        queryClient.invalidateQueries({ queryKey: ["admin-tasks"] });
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
                  if (category === 'delayed_ack') return 'border-l-4 border-l-amber-600 bg-amber-50/10';
                  if (category === 'needs_revision') return 'border-l-4 border-l-orange-500 bg-orange-50/10';
                  if (category === 'pending_delivery') return 'border-l-4 border-l-yellow-500 bg-yellow-50/10';
                  if (category === 'cancelled') return 'border-l-4 border-l-gray-500 bg-gray-50/10 opacity-75';
                  if (category === 'approved') return 'border-l-4 border-l-emerald-600 bg-emerald-50/10';
                  return '';
                };

                const getCategoryBadge = () => {
                  if (category === 'recently_delivered') {
                    if (isWebsiteOrder(task)) {
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
                  if (category === 'delayed') return null; // Handled by getDelayedBadge
                  if (category === 'delayed_ack') return null; // Handled by getAckOverdueBadge
                  if (category === 'needs_revision') return <Badge className="bg-orange-500 text-white">Needs Revision</Badge>;
                  if (category === 'pending_delivery') return <Badge className="bg-yellow-500 text-white">Awaiting Team Delivery</Badge>;
                  if (category === 'cancelled') return <Badge className="bg-gray-500 text-white">{(task as any).is_deleted ? 'Deleted' : 'Cancelled'}</Badge>;
                  if (category === 'approved') return <Badge className="bg-emerald-600 text-white">Approved / Closed</Badge>;
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
                                if (!isWebsiteOrder(task)) return null;
                                const changePhases = (projectPhases || []).filter(
                                  (p: any) => p.task_id === task.id && 
                                  (p.review_status === 'approved_with_changes' || p.review_status === 'disapproved_with_changes')
                                );
                                if (changePhases.length === 0) return null;
                                return changePhases.map((p: any) => {
                                  const latestReview = (adminPhaseReviews || []).find(
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
                            </div>
                            <h3 className="font-semibold text-lg mt-1 truncate">{task.title}</h3>
                          </div>
                        </div>
                        <div className="flex items-center gap-2 flex-shrink-0">
                          {(() => {
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
                            return (
                              <Badge className={`${getStatusColor(task.status)} shadow-sm`}>
                                {task.status === 'cancelled' && (task as any).is_deleted ? 'deleted' : task.status.replace("_", " ")}
                              </Badge>
                            );
                          })()}
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
                              {task.customer_name && <p className="text-sm font-medium truncate">{task.customer_name}</p>}
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
                              {task.amount_total != null && <p className="text-sm font-semibold">${Number(task.amount_total).toFixed(2)}</p>}
                              <div className="flex items-center gap-3 text-xs">
                                {task.amount_paid != null && (
                                  <span className="text-green-600 font-medium">✓ ${Number(task.amount_paid).toFixed(2)} paid</span>
                                )}
                                {task.amount_pending != null && task.amount_pending > 0 && (
                                  <span className="text-orange-600 font-medium">○ ${Number(task.amount_pending).toFixed(2)} pending</span>
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
                                : isWebsiteOrder(task) 
                                  ? getDeveloperForTeam(task.team_id) || task.teams?.name
                                  : task.teams?.name
                              }
                            </p>
                            {task.profiles && (
                              <p className="text-xs text-muted-foreground">PM: {task.profiles.full_name || task.profiles.email}</p>
                            )}
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
                                  
                                  if (hasNeedsRevision) { statusIcon = "↻"; statusColor = "text-orange-500"; statusText = "Needs Revision"; }
                                  else if (isApproved) { statusIcon = "✓"; statusColor = "text-green-600"; statusText = "Approved"; }
                                  else if (hasPendingReview || hasDelivery) { statusIcon = "●"; statusColor = "text-blue-500"; statusText = "Delivered"; }
                                  else if (t.status === 'in_progress') { statusIcon = "◉"; statusColor = "text-yellow-500"; statusText = "Working"; }
                                  else if (t.status === 'completed') { statusIcon = "●"; statusColor = "text-primary"; statusText = "Completed"; }
                                  else if (t.status === 'cancelled') { statusIcon = "✕"; statusColor = "text-destructive"; statusText = "Cancelled"; }
                                  
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

                      {/* Phase Progress for Website Orders */}
                      {isWebsiteOrder(task) && task.current_phase && (
                        <div className="p-2.5 bg-muted/30 rounded-md">
                          <PhaseProgress currentPhase={task.current_phase} totalPhases={task.total_phases} phases={projectPhases?.filter(p => p.task_id === task.id)} />
                        </div>
                      )}

                      {/* SLA Countdown Timers for Website Orders */}
                      {isWebsiteOrder(task) && !['completed', 'approved', 'cancelled', 'on_hold'].includes(task.status) && (() => {
                        const devRecord = developerCalendars?.find((d: any) => d.id === task.developer_id);
                        const cal = devRecord?.availability_calendars as CalendarConfig | undefined;
                        const devLeaves = (allLeaveRecords?.filter((l: any) => l.developer_id === devRecord?.id) || []) as LeaveRecord[];
                        const hasTimers = task.sla_deadline || (task.ack_deadline && task.status === 'assigned');
                        const changePhases = projectPhases?.filter(p => p.task_id === task.id && p.change_deadline && !p.change_completed_at && (p.review_status === 'approved_with_changes' || p.review_status === 'disapproved_with_changes')) || [];
                        if (!hasTimers && changePhases.length === 0) return null;
                        return (
                          <div className="p-2.5 bg-blue-500/5 border border-blue-200 dark:border-blue-800 rounded-md space-y-1.5">
                            {task.ack_deadline && task.status === 'assigned' && (
                              <SlaCountdown deadline={task.ack_deadline} label="Ack Timer" calendar={cal} leaves={devLeaves} />
                            )}
                            {task.sla_deadline && (
                              <SlaCountdown deadline={task.sla_deadline} label="9hr SLA" calendar={cal} leaves={devLeaves} slaHours={9} />
                            )}
                            {changePhases.map(p => (
                              <SlaCountdown key={p.id} deadline={p.change_deadline!} label={`Changes (P${p.phase_number} - ${p.change_severity})`} calendar={cal} leaves={devLeaves} slaHours={
                                p.change_severity === 'minor' ? 2 : p.change_severity === 'average' ? 4 : p.change_severity === 'major' ? 9 : 18
                              } />
                            ))}
                          </div>
                        );
                      })()}

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
                                  <FilePreview filePath={filePath.trim()} fileName={fileName.trim()} className="w-8 h-8" />
                                  <span className="text-xs max-w-[100px] truncate">{fileName.trim()}</span>
                                  <Button size="sm" variant="ghost" className="h-6 w-6 p-0" onClick={() => handleDownload(filePath.trim(), fileName.trim())}>
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

                      {/* Phase Review Section for Website Orders */}
                      {task.post_type === "Website Design" && projectPhases && (
                        <div className="px-4 pb-2">
                          <PhaseReviewSection
                            task={task}
                            phases={projectPhases || []}
                            userId={user!.id}
                            isAssignedPM={true}
                            queryKeysToInvalidate={[["admin-tasks"], ["admin-project-phases"], ["admin-submissions"], ["admin-phase-reviews"], ["admin-unread-replies"]]}
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
                              <Button size="sm" onClick={() => forwardHostingDelegate.mutate({ taskId: task.id })} disabled={forwardHostingDelegate.isPending}>
                                Access Forwarded to Client
                              </Button>
                            </div>
                          )}
                          {(task as any).launch_hosting_delegate_status === "forwarded_to_client" && (
                            <div className="space-y-2">
                              <p className="text-sm text-muted-foreground">Hosting delegation instructions sent to client. Click below once client confirms access granted.</p>
                              <Button size="sm" className="bg-green-600 hover:bg-green-700" onClick={() => confirmHostingDelegate.mutate({ taskId: task.id, developerId: task.developer_id, domain: (task as any).launch_domain || '' })} disabled={confirmHostingDelegate.isPending}>
                                <CheckCircle2 className="h-3.5 w-3.5 mr-1.5" /> Access Granted
                              </Button>
                            </div>
                          )}
                          {(task as any).launch_hosting_delegate_status === "access_granted" && (
                            <Badge className="bg-green-600 text-white"><CheckCircle2 className="h-3 w-3 mr-1" /> Hosting Delegate Access Granted</Badge>
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
                                <a href={(task as any).launch_wetransfer_link} target="_blank" rel="noopener noreferrer" className="text-blue-600 underline break-all">{(task as any).launch_wetransfer_link}</a>
                              </div>
                              <Button size="sm" className="bg-green-600 hover:bg-green-700" onClick={() => markSelfLaunchCompleted.mutate({ taskId: task.id, developerId: task.developer_id, domain: (task as any).launch_domain || '' })} disabled={markSelfLaunchCompleted.isPending}>
                                <CheckCircle2 className="h-3.5 w-3.5 mr-1.5" /> Self-Launch Completed
                              </Button>
                            </div>
                          )}
                          {(task as any).launch_self_launch_status === "self_launch_completed" && (
                            <Badge className="bg-green-600 text-white"><CheckCircle2 className="h-3 w-3 mr-1" /> Self-Launch Completed</Badge>
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
                      <div className="flex gap-2 flex-wrap">
                        <Button size="sm" variant="outline" onClick={() => setViewDetailsTask(task)}>
                          <FileText className="h-3.5 w-3.5 mr-1.5" />
                          View Details
                        </Button>
                        <Button size="sm" variant="outline" className="relative" onClick={() => setChatTask(task)}>
                          <MessageCircle className="h-3.5 w-3.5 mr-1.5" />
                          Chat
                          {(unreadCounts?.get(task.id) || 0) > 0 && (
                            <span className="absolute -top-1.5 -right-1.5 bg-destructive text-destructive-foreground text-[10px] rounded-full h-4 min-w-[16px] flex items-center justify-center px-1">
                              {unreadCounts!.get(task.id)}
                            </span>
                          )}
                        </Button>
                        
                        {/* Launch Website Button */}
                        {task.status === "completed" && isWebsiteOrder(task) && (
                          <Button
                            size="sm"
                            className="bg-blue-600 hover:bg-blue-700"
                            onClick={() =>
                              setLaunchDialog({ taskId: task.id, taskTitle: task.title, developerId: task.developer_id })
                            }
                          >
                            <Rocket className="h-3.5 w-3.5 mr-1.5" />
                            Launch Website
                          </Button>
                        )}

                        {/* Approve Button (for non-website orders) */}
                        {task.status === "completed" && !isWebsiteOrder(task) && (
                          <Button
                            size="sm"
                            className="bg-green-600 hover:bg-green-700"
                            onClick={() => updateTaskStatus.mutate({ taskId: task.id, status: "approved" })}
                          >
                            <CheckCircle2 className="h-3.5 w-3.5 mr-1.5" />
                            Approve
                          </Button>
                        )}

                        {/* Accept Order Button */}
                        {task.status === "pending" && !(task as any).accepted_by_pm && (
                          <Button
                            size="sm"
                            className="bg-green-600 hover:bg-green-700"
                            onClick={() => acceptOrder.mutate(task.id)}
                          >
                            <CheckCircle2 className="h-3.5 w-3.5 mr-1.5" />
                            Accept Order
                          </Button>
                        )}

                        {/* Hold/Resume Buttons */}
                        {task.status !== "completed" && task.status !== "approved" && task.status !== "cancelled" && (
                          task.status === "on_hold" ? (
                            <Button
                              size="sm"
                              variant="outline"
                              className="border-green-500/50 text-green-600 hover:bg-green-500/10"
                              onClick={() => resumeOrder.mutate(task.id)}
                            >
                              <PlayCircle className="h-3.5 w-3.5 mr-1.5" />
                              Resume
                            </Button>
                          ) : (
                            <Button
                              size="sm"
                              variant="outline"
                              className="border-amber-500/50 text-amber-600 hover:bg-amber-500/10"
                              onClick={() => setHoldOrderDialog({ open: true, taskId: task.id })}
                            >
                              <PauseCircle className="h-3.5 w-3.5 mr-1.5" />
                              Hold
                            </Button>
                          )
                        )}

                        <Button size="sm" variant="outline" onClick={() => openEditTaskDialog(task)}>
                          <Edit2 className="h-3.5 w-3.5 mr-1.5" />
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
                          <RefreshCw className="h-3.5 w-3.5 mr-1.5" />
                          Reassign PM
                        </Button>
                        {!group.isMultiTeam && (task.status === "pending" || task.status === "in_progress") && (
                          <Button
                            size="sm"
                            variant="outline"
                            className="border-destructive/50 text-destructive hover:bg-destructive/10"
                            onClick={() => setCancelDialog({ open: true, taskId: task.id })}
                          >
                            <XCircle className="h-3.5 w-3.5 mr-1.5" />
                            Cancel Order
                          </Button>
                        )}
                        {task.status === "cancelled" && (task as any).cancellation_reason && (
                          <p className="text-xs text-muted-foreground italic self-center">
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
                              Show Files ({groupSubmissions.length})
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
                                                <FilePreview filePath={submission.file_path} fileName={submission.file_name} />
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
                                                    <p className="text-xs text-muted-foreground mt-1 truncate">Designer: {submission.designer_comment}</p>
                                                  )}
                                                  <p className="text-xs text-muted-foreground">
                                                    Designer: {submission.profiles?.full_name || submission.profiles?.email}
                                                  </p>
                                                  <p className="text-xs text-muted-foreground">
                                                    Submitted: {format(new Date(submission.submitted_at!), 'MMM d, yyyy h:mm a')}
                                                  </p>
                                                </div>
                                                <div className="flex items-center gap-2 flex-shrink-0">
                                                  <Button size="sm" variant="outline" onClick={() => handleDownload(submission.file_path, submission.file_name)}>
                                                    <Download className="h-3 w-3" />
                                                  </Button>
                                                  {(submission.revision_status === "pending_review" || submission.revision_status === "approved") && (
                                                    <>
                                                      {submission.revision_status === "pending_review" && (
                                                        <Button size="sm" className="bg-green-600 hover:bg-green-700" onClick={() => handleApproveSubmission.mutate(submission.id)}>
                                                          Approve
                                                        </Button>
                                                      )}
                                                      <Button
                                                        size="sm"
                                                        variant="outline"
                                                        className="border-orange-300 text-orange-600 hover:bg-orange-50"
                                                        onClick={() => setRevisionDialog({ open: true, submissionId: submission.id, fileName: submission.file_name })}
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
                                                      <p className="text-xs font-medium text-orange-700 dark:text-orange-400">Review Notes</p>
                                                      {submission.reviewed_at && (
                                                        <p className="text-xs text-orange-500">{format(new Date(submission.reviewed_at), 'MMM d, yyyy h:mm a')}</p>
                                                      )}
                                                    </div>
                                                    {submission.revision_notes && <p className="text-xs text-orange-600 dark:text-orange-300">{submission.revision_notes}</p>}
                                                  </div>
                                                </div>
                                              )}
                                              {/* Child revision files */}
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
                                                            <Badge variant="outline" className="text-xs border-orange-400 text-orange-600">
                                                              <RefreshCw className="h-2.5 w-2.5 mr-1" />
                                                              Revision {idx + 1}
                                                            </Badge>
                                                          </div>
                                                          {rev.designer_comment && (
                                                            <p className="text-xs text-muted-foreground mt-0.5 truncate">Designer: {rev.designer_comment}</p>
                                                          )}
                                                          <p className="text-xs text-muted-foreground">{format(new Date(rev.submitted_at!), 'MMM d, yyyy h:mm a')}</p>
                                                        </div>
                                                        <div className="flex items-center gap-2 flex-shrink-0">
                                                          <Button size="sm" variant="outline" onClick={() => handleDownload(rev.file_path, rev.file_name)}>
                                                            <Download className="h-3 w-3" />
                                                          </Button>
                                                          {(rev.revision_status === "pending_review" || rev.revision_status === "approved") && (
                                                            <>
                                                              {rev.revision_status === "pending_review" && (
                                                                <Button size="sm" className="bg-green-600 hover:bg-green-700" onClick={() => handleApproveSubmission.mutate(rev.id)}>Approve</Button>
                                                              )}
                                                              <Button size="sm" variant="outline" className="border-orange-300 text-orange-600 hover:bg-orange-50"
                                                                onClick={() => setRevisionDialog({ open: true, submissionId: rev.id, fileName: rev.file_name })}>
                                                                Request Revision
                                                              </Button>
                                                            </>
                                                          )}
                                                        </div>
                                                      </div>
                                                      {(rev.revision_notes || rev.revision_reference_file_path) && (
                                                        <div className="mt-1 border-l-2 border-orange-300 pl-3">
                                                          <div className="bg-orange-50 dark:bg-orange-950/20 p-2 rounded-md border border-orange-200 dark:border-orange-800">
                                                            <p className="text-xs font-medium text-orange-700 dark:text-orange-400">Review Notes</p>
                                                            {rev.revision_notes && <p className="text-xs text-orange-600 dark:text-orange-300">{rev.revision_notes}</p>}
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
                          // Single-team: Show flat submission list
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
                                  <div className="flex items-center gap-3 justify-between bg-muted/30 p-3 rounded-lg border hover:border-primary/30 transition-colors">
                                    <FilePreview filePath={submission.file_path} fileName={submission.file_name} />
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
                                      <p className="text-xs text-muted-foreground">
                                        Designer: {submission.profiles?.full_name || submission.profiles?.email}
                                      </p>
                                      <p className="text-xs text-muted-foreground">
                                        Submitted: {format(new Date(submission.submitted_at!), 'MMM d, yyyy h:mm a')}
                                      </p>
                                    </div>
                                    <div className="flex items-center gap-2 flex-shrink-0">
                                      <Button size="sm" variant="outline" onClick={() => handleDownload(submission.file_path, submission.file_name)}>
                                        <Download className="h-3 w-3" />
                                      </Button>
                                      {submission.revision_status !== "approved" && (
                                        <>
                                          <Button size="sm" className="bg-green-600 hover:bg-green-700" onClick={() => handleApproveSubmission.mutate(submission.id)}>
                                            Approve
                                          </Button>
                                          <Button
                                            size="sm"
                                            variant="outline"
                                            className="border-orange-300 text-orange-600 hover:bg-orange-50"
                                            onClick={() => setRevisionDialog({ open: true, submissionId: submission.id, fileName: submission.file_name })}
                                          >
                                            Request Revision
                                          </Button>
                                        </>
                                      )}
                                    </div>
                                  </div>
                                  {(submission.revision_notes || submission.revision_reference_file_path) && (
                                    <div className="ml-8 mt-1 border-l-2 border-orange-300 pl-3">
                                      <div className="bg-orange-50 dark:bg-orange-950/20 p-2 rounded-md border border-orange-200 dark:border-orange-800">
                                        <div className="flex items-center justify-between mb-1">
                                          <p className="text-xs font-medium text-orange-700 dark:text-orange-400">Review Notes</p>
                                          {submission.reviewed_at && (
                                            <p className="text-xs text-orange-500">{format(new Date(submission.reviewed_at), 'MMM d, yyyy h:mm a')}</p>
                                          )}
                                        </div>
                                        {submission.revision_notes && <p className="text-xs text-orange-600 dark:text-orange-300">{submission.revision_notes}</p>}
                                      </div>
                                    </div>
                                  )}
                                  {childRevisions.length > 0 && (
                                    <div className="ml-8 mt-1 space-y-1 border-l-2 border-primary/20 pl-3">
                                      <p className="text-xs font-medium text-muted-foreground">Revision(s) delivered:</p>
                                      {childRevisions.map((rev: any, idx: number) => (
                                        <div key={rev.id} className="flex items-center gap-3 justify-between bg-green-50 dark:bg-green-950/20 p-2 rounded-md border border-green-200 dark:border-green-800">
                                          <FilePreview filePath={rev.file_path} fileName={rev.file_name} />
                                          <div className="flex-1 min-w-0">
                                            <div className="flex items-center gap-2">
                                              <p className="text-sm font-medium truncate">{rev.file_name}</p>
                                              <Badge variant="outline" className="text-xs border-orange-400 text-orange-600">
                                                <RefreshCw className="h-2.5 w-2.5 mr-1" />
                                                Revision {idx + 1}
                                              </Badge>
                                            </div>
                                            <p className="text-xs text-muted-foreground">{format(new Date(rev.submitted_at!), 'MMM d, yyyy h:mm a')}</p>
                                          </div>
                                          <div className="flex items-center gap-2 flex-shrink-0">
                                            <Button size="sm" variant="outline" onClick={() => handleDownload(rev.file_path, rev.file_name)}>
                                              <Download className="h-3 w-3" />
                                            </Button>
                                            {rev.revision_status !== "approved" && (
                                              <>
                                                <Button size="sm" className="bg-green-600 hover:bg-green-700" onClick={() => handleApproveSubmission.mutate(rev.id)}>Approve</Button>
                                                <Button size="sm" variant="outline" className="border-orange-300 text-orange-600 hover:bg-orange-50"
                                                  onClick={() => setRevisionDialog({ open: true, submissionId: rev.id, fileName: rev.file_name })}>
                                                  Request Revision
                                                </Button>
                                              </>
                                            )}
                                          </div>
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
              {!filteredOrders.length && (
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

        {viewMode === 'developer_workload' && (
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Code className="h-5 w-5" />
                Developer Workload Overview
              </CardTitle>
            </CardHeader>
            <CardContent>
              {(() => {
                if (!developerCalendars?.length) {
                  return <p className="text-muted-foreground text-center py-8">No developers found.</p>;
                }

                const now = new Date();
                const monthStart = startOfMonth(now);
                const monthEnd = endOfMonth(now);

                // Compute aggregated totals
                let totalActiveTasks = 0;
                let totalMonthlyPoints = 0;
                let totalAllTimePoints = 0;
                let totalMonthlyPages = 0;
                let totalAllTimePages = 0;

                const devRows = developerCalendars.map((dev: any) => {
                  const devProfile = developerProfiles?.find((p: any) => p.user_id === dev.user_id);
                  const profile = devProfile?.profiles as any;
                  const devName = dev.name || profile?.full_name || profile?.email || 'Unknown';
                  
                  const devTasks = tasks?.filter(t => t.developer_id === dev.id && !t.is_deleted) || [];
                  const activeTasks = devTasks.filter(t => ['assigned', 'in_progress'].includes(t.status));
                  
                  const devPhases = projectPhases?.filter(p => 
                    devTasks.some(t => t.id === p.task_id) && p.status === 'completed'
                  ) || [];
                  
                  const monthlyPhases = devPhases.filter(p => 
                    p.completed_at && isWithinInterval(new Date(p.completed_at), { start: monthStart, end: monthEnd })
                  );
                  
                  const allTimePoints = devPhases.reduce((s, p) => s + (p.points || 3), 0);
                  const monthlyPoints = monthlyPhases.reduce((s, p) => s + (p.points || 3), 0);
                  const allTimePages = devPhases.reduce((s, p) => s + (p.phase_number === 1 ? 1 : (p.pages_completed || 3)), 0);
                  const monthlyPages = monthlyPhases.reduce((s, p) => s + (p.phase_number === 1 ? 1 : (p.pages_completed || 3)), 0);

                  totalActiveTasks += activeTasks.length;
                  totalMonthlyPoints += monthlyPoints;
                  totalAllTimePoints += allTimePoints;
                  totalMonthlyPages += monthlyPages;
                  totalAllTimePages += allTimePages;

                  return { dev, devName, activeTasks, monthlyPoints, allTimePoints, monthlyPages, allTimePages };
                });

                return (
                  <div className="space-y-6">
                    {/* Aggregated Summary */}
                    <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
                      <div className="rounded-lg border bg-card p-4 text-center">
                        <p className="text-xs text-muted-foreground mb-1">Active Tasks</p>
                        <p className="text-2xl font-bold">{totalActiveTasks}</p>
                      </div>
                      <div className="rounded-lg border bg-card p-4 text-center">
                        <p className="text-xs text-muted-foreground mb-1">Points (This Month)</p>
                        <p className="text-2xl font-bold text-primary">{totalMonthlyPoints}</p>
                      </div>
                      <div className="rounded-lg border bg-card p-4 text-center">
                        <p className="text-xs text-muted-foreground mb-1">Points (All-Time)</p>
                        <p className="text-2xl font-bold">{totalAllTimePoints}</p>
                      </div>
                      <div className="rounded-lg border bg-card p-4 text-center">
                        <p className="text-xs text-muted-foreground mb-1">Pages (This Month)</p>
                        <p className="text-2xl font-bold text-primary">{totalMonthlyPages}</p>
                      </div>
                      <div className="rounded-lg border bg-card p-4 text-center">
                        <p className="text-xs text-muted-foreground mb-1">Pages (All-Time)</p>
                        <p className="text-2xl font-bold">{totalAllTimePages}</p>
                      </div>
                    </div>

                    {/* Per-developer table */}
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Developer</TableHead>
                          <TableHead className="text-center">Active Tasks</TableHead>
                          <TableHead className="text-center">Points (This Month)</TableHead>
                          <TableHead className="text-center">Points (All-Time)</TableHead>
                          <TableHead className="text-center">Pages (This Month)</TableHead>
                          <TableHead className="text-center">Pages (All-Time)</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {devRows.map(({ dev, devName, activeTasks, monthlyPoints, allTimePoints, monthlyPages, allTimePages }) => (
                          <TableRow key={dev.id}>
                            <TableCell className="font-medium">
                              <div className="flex items-center gap-2">
                                {devName}
                                {!dev.is_active && <Badge variant="secondary" className="text-[10px]">Inactive</Badge>}
                              </div>
                            </TableCell>
                            <TableCell className="text-center">
                              <Badge variant={activeTasks.length > 0 ? "default" : "secondary"}>{activeTasks.length}</Badge>
                            </TableCell>
                            <TableCell className="text-center">
                              <span className="font-semibold text-primary">{monthlyPoints}</span>
                            </TableCell>
                            <TableCell className="text-center">
                              <Badge variant="outline">{allTimePoints}</Badge>
                            </TableCell>
                            <TableCell className="text-center">
                              <span className="font-semibold">{monthlyPages}</span>
                            </TableCell>
                            <TableCell className="text-center">
                              <Badge variant="outline">{allTimePages}</Badge>
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                );
              })()}
            </CardContent>
          </Card>
        )}

        {viewMode === 'pm_workload' && (
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <FolderKanban className="h-5 w-5" />
                PM Workload Overview
              </CardTitle>
            </CardHeader>
            <CardContent>
              {(() => {
                if (!projectManagers?.length) {
                  return <p className="text-muted-foreground text-center py-8">No project managers found.</p>;
                }

                const now = new Date();
                const monthStart = startOfMonth(now);
                const monthEnd = endOfMonth(now);

                return (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Project Manager</TableHead>
                        <TableHead className="text-center">New This Month</TableHead>
                        <TableHead className="text-center">Total All-Time</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {projectManagers.map((pm) => {
                        const pmTasks = tasks?.filter(t => t.project_manager_id === pm.id && !t.is_deleted) || [];
                        
                        // Deduplicate by order_group_id for accurate counts
                        const seenGroups = new Set<string>();
                        let newThisMonth = 0;
                        let totalAllTime = 0;

                        pmTasks.forEach(t => {
                          const groupKey = t.order_group_id || t.id;
                          if (seenGroups.has(groupKey)) return;
                          seenGroups.add(groupKey);
                          totalAllTime++;
                          if (t.created_at && isWithinInterval(new Date(t.created_at), { start: monthStart, end: monthEnd })) {
                            newThisMonth++;
                          }
                        });

                        return (
                          <TableRow 
                            key={pm.id} 
                            className="cursor-pointer hover:bg-muted/50"
                            onClick={() => setPmWorkloadDialog({ open: true, pmId: pm.id, pmName: pm.full_name || pm.email })}
                          >
                            <TableCell className="font-medium">{pm.full_name || pm.email}</TableCell>
                            <TableCell className="text-center">
                              <Badge variant="secondary">{newThisMonth}</Badge>
                            </TableCell>
                            <TableCell className="text-center">
                              <Badge variant="outline">{totalAllTime}</Badge>
                            </TableCell>
                          </TableRow>
                        );
                      })}
                    </TableBody>
                  </Table>
                );
              })()}
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

        {viewMode === 'developer_resources' && (
          <div className="space-y-6">
            <AvailabilityCalendarsManager />
            <DeveloperResourcesManager />
            <LeaveManagement />
          </div>
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
          <div className="max-h-[70vh] overflow-y-auto pr-4" style={{ overflowWrap: 'anywhere', wordBreak: 'break-word' }}>
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

              {/* Phase Progress in Details View */}
              {isWebsiteOrder(viewDetailsTask) && viewDetailsTask.current_phase && (
                <div className="p-4 bg-muted/30 rounded-lg space-y-3">
                  <h3 className="font-semibold text-lg">Project Progress</h3>
                  <PhaseProgress currentPhase={viewDetailsTask.current_phase} totalPhases={viewDetailsTask.total_phases} phases={projectPhases?.filter(p => p.task_id === viewDetailsTask?.id)} />
                </div>
              )}

              {/* SLA Timers in Details View */}
              {isWebsiteOrder(viewDetailsTask) && !['completed', 'approved', 'cancelled', 'on_hold'].includes(viewDetailsTask.status) && (() => {
                const devRecord = developerCalendars?.find((d: any) => d.id === viewDetailsTask.developer_id);
                const cal = devRecord?.availability_calendars as CalendarConfig | undefined;
                const devLeaves = (allLeaveRecords?.filter((l: any) => l.developer_id === devRecord?.id) || []) as LeaveRecord[];
                const changePhases = projectPhases?.filter(p => p.task_id === viewDetailsTask.id && p.change_deadline && !p.change_completed_at && (p.review_status === 'approved_with_changes' || p.review_status === 'disapproved_with_changes')) || [];
                const hasTimers = viewDetailsTask.sla_deadline || (viewDetailsTask.ack_deadline && viewDetailsTask.status === 'assigned') || changePhases.length > 0;
                if (!hasTimers) return null;
                return (
                  <div className="p-3 bg-blue-500/5 border border-blue-200 dark:border-blue-800 rounded-md space-y-2">
                    <h3 className="font-semibold text-sm">SLA Timers</h3>
                    {viewDetailsTask.ack_deadline && viewDetailsTask.status === 'assigned' && (
                      <SlaCountdown deadline={viewDetailsTask.ack_deadline} label="Ack Timer" calendar={cal} leaves={devLeaves} />
                    )}
                    {viewDetailsTask.sla_deadline && (
                      <SlaCountdown deadline={viewDetailsTask.sla_deadline} label="9hr SLA" calendar={cal} leaves={devLeaves} slaHours={9} />
                    )}
                    {changePhases.map(p => (
                      <SlaCountdown key={p.id} deadline={p.change_deadline!} label={`Changes (P${p.phase_number} - ${p.change_severity})`} calendar={cal} leaves={devLeaves} slaHours={
                        p.change_severity === 'minor' ? 2 : p.change_severity === 'average' ? 4 : p.change_severity === 'major' ? 9 : 18
                      } />
                    ))}
                  </div>
                );
              })()}

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
                  <SelectItem value="development_team_leader">Dev Team Leader</SelectItem>
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
          <div className="max-h-[60vh] overflow-y-auto">
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
          </div>
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
          <div className="max-h-[70vh] overflow-y-auto pr-4" style={{ overflowWrap: 'anywhere', wordBreak: 'break-word' }}>
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
          </div>
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
      {/* Cancel Order Dialog */}
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
              Are you sure you want to cancel this order? This action will notify the assigned designers.
            </p>
            <div className="space-y-2">
              <Label htmlFor="cancel-reason">Reason for Cancellation *</Label>
              <Textarea
                id="cancel-reason"
                value={cancelReason}
                onChange={(e) => setCancelReason(e.target.value)}
                placeholder="Please provide a reason for cancelling this order..."
                rows={4}
              />
            </div>
            <Button
              variant="destructive"
              onClick={() => cancelDialog && cancelOrder.mutate({ taskId: cancelDialog.taskId, reason: cancelReason })}
              disabled={!cancelReason.trim() || cancelOrder.isPending}
              className="w-full"
            >
              {cancelOrder.isPending ? "Cancelling..." : "Cancel Order"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* PM Workload Dialog */}
      <Dialog open={pmWorkloadDialog?.open || false} onOpenChange={(open) => !open && setPmWorkloadDialog(null)}>
        <DialogContent className="max-w-2xl max-h-[80vh]">
          <DialogHeader>
            <DialogTitle>Tasks Assigned to {pmWorkloadDialog?.pmName}</DialogTitle>
          </DialogHeader>
          <div className="flex gap-2 mb-2">
            <Button
              size="sm"
              variant={pmWorkloadFilter === 'all' ? 'default' : 'outline'}
              onClick={() => setPmWorkloadFilter('all')}
            >
              All Tasks
            </Button>
            <Button
              size="sm"
              variant={pmWorkloadFilter === 'this_month' ? 'default' : 'outline'}
              onClick={() => setPmWorkloadFilter('this_month')}
            >
              This Month
            </Button>
          </div>
          <div className="max-h-[60vh] overflow-y-auto">
            {(() => {
              if (!pmWorkloadDialog) return null;
              const now = new Date();
              const monthStart = startOfMonth(now);
              const monthEnd = endOfMonth(now);

              const pmTasks = tasks?.filter(t => t.project_manager_id === pmWorkloadDialog.pmId && !t.is_deleted) || [];
              
              // Deduplicate by order_group_id
              const seenGroups = new Set<string>();
              const uniqueTasks = pmTasks.filter(t => {
                const groupKey = t.order_group_id || t.id;
                if (seenGroups.has(groupKey)) return false;
                seenGroups.add(groupKey);
                return true;
              });

              const filteredTasks = pmWorkloadFilter === 'this_month'
                ? uniqueTasks.filter(t => t.created_at && isWithinInterval(new Date(t.created_at), { start: monthStart, end: monthEnd }))
                : uniqueTasks;

              if (filteredTasks.length === 0) {
                return <p className="text-muted-foreground text-center py-8">No tasks found.</p>;
              }

              return (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Order #</TableHead>
                      <TableHead>Title</TableHead>
                      <TableHead>Customer</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead className="text-right">Amount</TableHead>
                      <TableHead>Date</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredTasks.map(task => (
                      <TableRow key={task.id}>
                        <TableCell className="font-mono text-sm">#{task.task_number}</TableCell>
                        <TableCell className="font-medium max-w-[200px] truncate">{task.title}</TableCell>
                        <TableCell>{task.customer_name || "N/A"}</TableCell>
                        <TableCell>
                          <Badge variant={
                            task.status === 'completed' || task.status === 'approved' ? 'default' :
                            task.status === 'cancelled' ? 'destructive' :
                            task.status === 'in_progress' ? 'secondary' : 'outline'
                          }>
                            {task.status}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-right">${Number(task.amount_total || 0).toLocaleString()}</TableCell>
                        <TableCell className="text-sm text-muted-foreground">
                          {task.created_at ? format(new Date(task.created_at), "MMM d, yyyy") : "N/A"}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              );
            })()}
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
              <Label htmlFor="admin-launch-domain">Domain Name *</Label>
              <Input
                id="admin-launch-domain"
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
                  <Label htmlFor="admin-launch-domain-provider">Domain Provider</Label>
                  <Input
                    id="admin-launch-domain-provider"
                    value={launchData.domainProvider}
                    onChange={(e) => setLaunchData(d => ({ ...d, domainProvider: e.target.value }))}
                    placeholder="e.g. GoDaddy, Namecheap"
                  />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-2">
                    <Label htmlFor="admin-launch-username">Domain Username</Label>
                    <Input
                      id="admin-launch-username"
                      value={launchData.hostingUsername}
                      onChange={(e) => setLaunchData(d => ({ ...d, hostingUsername: e.target.value }))}
                      placeholder="Username"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="admin-launch-password">Domain Password</Label>
                    <Input
                      id="admin-launch-password"
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

export default AdminDashboard;
