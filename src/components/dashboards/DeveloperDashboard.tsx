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
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { LogOut, Upload, CheckCircle2, Clock, FolderKanban, Download, ChevronDown, ChevronUp, FileText, AlertCircle, AlertTriangle, Globe, Timer, Play, RotateCcw, Link, MessageCircle, Users } from "lucide-react";
import TeamOverviewDashboard from "@/components/dashboards/TeamOverviewDashboard";
import { OrderChat, useUnreadMessageCounts } from "@/components/OrderChat";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { Database } from "@/integrations/supabase/types";
import { ScrollArea } from "@/components/ui/scroll-area";
import { FilePreview } from "@/components/FilePreview";
import { DevPhaseReviewTimeline } from "@/components/dashboards/DevPhaseReviewTimeline";
import { differenceInHours, differenceInMinutes, format } from "date-fns";
import { useDesignerNotifications } from "@/hooks/useDesignerNotifications";
import { NotificationBell } from "@/components/NotificationBell";

import {
  CalendarConfig, LeaveRecord, calculateRemainingWorkingMinutes, calculateOverdueWorkingMinutes,
  timeToMinutes, getISODay, toTimezoneDate, isOvernightShift, isWithinShift
} from "@/utils/workingHours";

// Format overdue minutes with decimal days and hours/minutes
function formatOverdueTime(totalMinutes: number, slaHoursPerDay: number, paused: boolean): string {
  const h = Math.floor(totalMinutes / 60);
  const m = Math.floor(totalMinutes % 60);
  if (slaHoursPerDay > 0) {
    const minutesPerDay = slaHoursPerDay * 60;
    const decimalDays = totalMinutes / minutesPerDay;
    const hm = `${h}h ${m}m`;
    const pausedStr = paused ? ' (paused)' : '';
    const timeStr = `${hm}${pausedStr} — ${decimalDays.toFixed(1)} days`;
    return timeStr;
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
      // Add initial SLA hours to show total elapsed working time
      const totalMinutesWithSla = overdueMinutes + (slaHours || 0) * 60;
      // Check if currently in working hours
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
      // Only show ticking seconds if currently within working hours
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
    // Fallback to wall-clock if no calendar
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

// ACK Overdue ticking badge - shows overdue working time with ticking seconds
const AckOverdueBadge = ({ ackDeadline, calendar, leaves }: { 
  ackDeadline: string; calendar?: CalendarConfig | null; leaves?: LeaveRecord[] 
}) => {
  const [now, setNow] = useState(new Date());

  useEffect(() => {
    const interval = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(interval);
  }, []);

  let label = "ACK OVERDUE";
  if (calendar) {
    const dl = new Date(ackDeadline);
    if (now > dl) {
      const overdueMin = calculateOverdueWorkingMinutes(now, dl, calendar, leaves || []);
      // Add initial 30-min ACK window to show total elapsed working time
      const totalMin = overdueMin + 30;
      const h = Math.floor(totalMin / 60);
      const m = Math.floor(totalMin % 60);
      // Check if currently in working hours for ticking seconds
      const localNow = toTimezoneDate(now, calendar.timezone);
      const dayOfWeek = getISODay(localNow);
      const currentMinute = localNow.getHours() * 60 + localNow.getMinutes();
      const isSat = dayOfWeek === 6;
      const todayStart = isSat && calendar.saturday_start_time ? timeToMinutes(calendar.saturday_start_time) : timeToMinutes(calendar.start_time);
      const todayEnd = isSat && calendar.saturday_end_time ? timeToMinutes(calendar.saturday_end_time) : timeToMinutes(calendar.end_time);
      const isWorkingNow = calendar.working_days.includes(dayOfWeek) && isWithinShift(currentMinute, todayStart, todayEnd);
      const s = isWorkingNow ? (now.getSeconds() % 60) : 0;
      // ACK uses 9h as a working day for the decimal days display
      const ackDaysDecimal = totalMin / (9 * 60);
      const timeStr = isWorkingNow
        ? `${h}h ${m}m ${s.toString().padStart(2, '0')}s — ${ackDaysDecimal.toFixed(1)} days`
        : `${h}h ${m}m (paused) — ${ackDaysDecimal.toFixed(1)} days`;
      label = `ACK OVERDUE — ${timeStr}`;
    } else {
      // Wall-clock before deadline but working minutes exhausted
      const remaining = calculateRemainingWorkingMinutes(now, dl, calendar, leaves || []);
      if (remaining <= 0) {
        // Calculate total working minutes from ack_deadline backward to find how much of the 30m window passed
        label = "ACK OVERDUE — 30m+ (paused)";
      }
    }
  }

  return (
    <Badge variant="destructive" className="gap-1 animate-pulse">
      <AlertTriangle className="h-3 w-3" />
      <span className="font-mono">{label}</span>
    </Badge>
  );
};

// Phase progress component
const PhaseProgress = ({ currentPhase, totalPhases, phases }: { currentPhase: number; totalPhases?: number | null; phases?: any[] }) => {
  const getPhaseLabel = (phase: number) => {
    if (phase === 1) return "Homepage (1 page, 3 pts)";
    return "Inner pages (3 pts max)";
  };

  // Calculate total pages developed and total points
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
      {/* Review status badges per phase */}
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

const DeveloperDashboard = () => {
  const { user, role, signOut } = useAuth();
  const { toast } = useToast();
  const isTeamLeader = role === "development_team_leader";
  const [viewMode, setViewMode] = useState<"team" | "my_orders">(isTeamLeader ? "team" : "my_orders");
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

  // Fetch developer's calendar and leaves for working-hours SLA countdown
  const { data: devCalendar } = useQuery({
    queryKey: ["developer-calendar", user?.id],
    queryFn: async () => {
      const { data: dev } = await supabase
        .from("developers")
        .select("id, availability_calendars(working_days, start_time, end_time, saturday_start_time, saturday_end_time, timezone)")
        .eq("user_id", user!.id)
        .maybeSingle();
      if (!dev) {
        // For team leaders without a developers record, fetch the default calendar
        if (isTeamLeader) {
          const { data: defaultCal } = await supabase
            .from("availability_calendars")
            .select("working_days, start_time, end_time, saturday_start_time, saturday_end_time, timezone")
            .limit(1)
            .single();
          if (defaultCal) {
            return {
              developerId: null as string | null,
              calendar: defaultCal as CalendarConfig,
            };
          }
        }
        return null;
      }
      const cal = (dev as any).availability_calendars;
      if (!cal) return null;
      return {
        developerId: dev.id as string | null,
        calendar: {
          working_days: cal.working_days,
          start_time: cal.start_time,
          end_time: cal.end_time,
          saturday_start_time: cal.saturday_start_time,
          saturday_end_time: cal.saturday_end_time,
          timezone: cal.timezone,
        } as CalendarConfig,
      };
    },
    enabled: !!user?.id,
  });

  const { data: devLeaves } = useQuery({
    queryKey: ["developer-leaves", devCalendar?.developerId],
    queryFn: async () => {
      const { data } = await supabase
        .from("leave_records")
        .select("leave_start_datetime, leave_end_datetime")
        .eq("developer_id", devCalendar!.developerId)
        .eq("status", "approved");
      return (data || []) as LeaveRecord[];
    },
    enabled: !!devCalendar?.developerId,
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
  const [reassignDevId, setReassignDevId] = useState("");
  const [phaseCompleteTask, setPhaseCompleteTask] = useState<any>(null);
  const [completionAction, setCompletionAction] = useState<"next_phase" | "complete_website" | null>(null);
  const [finalPhasePages, setFinalPhasePages] = useState<number>(3);
  const [homepageUrls, setHomepageUrls] = useState<string[]>([]);
  const [urlInput, setUrlInput] = useState("");
  const [chatTask, setChatTask] = useState<any>(null);
  const [nameserverInputs, setNameserverInputs] = useState<{[taskId: string]: {ns1: string; ns2: string; ns3: string; ns4: string}}>({});
  const [dnsInputs, setDnsInputs] = useState<{[taskId: string]: {aRecord: string; cname: string; mx: string}}>({});
  const [wetransferInputs, setWetransferInputs] = useState<{[taskId: string]: string}>({});

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

  const handleMarkPhaseComplete = async (phaseId: string, reviewStatus: string, changeComment?: string, changeFilePaths?: string, changeFileNames?: string) => {
    const updateData: any = { change_completed_at: new Date().toISOString(), change_completed_by: user!.id };
    if (changeComment) updateData.change_comment = changeComment;
    if (changeFilePaths) updateData.change_file_paths = changeFilePaths;
    if (changeFileNames) updateData.change_file_names = changeFileNames;
    if (reviewStatus === 'disapproved_with_changes') {
      updateData.review_status = null;
      updateData.change_severity = null;
      updateData.change_deadline = null;
      updateData.review_comment = null;
      updateData.reviewed_at = null;
      updateData.reviewed_by = null;
      updateData.review_voice_path = null;
      updateData.review_file_paths = null;
      updateData.review_file_names = null;
    }
    await supabase.from("project_phases").update(updateData).eq("id", phaseId);
    // Also update corresponding phase_reviews record
    const { data: latestReview } = await supabase
      .from("phase_reviews")
      .select("id")
      .eq("phase_id", phaseId)
      .is("change_completed_at", null)
      .order("round_number", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (latestReview) {
      const reviewUpdate: any = { change_completed_at: new Date().toISOString(), change_completed_by: user!.id };
      if (changeComment) reviewUpdate.change_comment = changeComment;
      if (changeFilePaths) reviewUpdate.change_file_paths = changeFilePaths;
      if (changeFileNames) reviewUpdate.change_file_names = changeFileNames;
      await supabase.from("phase_reviews").update(reviewUpdate).eq("id", latestReview.id);
    }
    queryClient.invalidateQueries({ queryKey: ["developer-tasks"] });
    queryClient.invalidateQueries({ queryKey: ["developer-phases"] });
    queryClient.invalidateQueries({ queryKey: ["developer-phase-reviews"] });
    toast({ title: "Phase changes marked as complete" });
  };

  const { data: tasks } = useQuery({
    queryKey: ["developer-tasks", user?.id, isTeamLeader],
    queryFn: async () => {
      if (isTeamLeader) {
        // Team leaders see ALL website tasks across all teams
        const { data, error } = await supabase
          .from("tasks")
          .select("*, teams(name), profiles!tasks_project_manager_id_fkey(full_name, email)")
          .eq("post_type", "Website Design")
          .order("created_at", { ascending: false });
        if (error) throw error;
        return data || [];
      }

      // Regular developers see only their team's tasks
      const { data: teamMembers } = await supabase
        .from("team_members")
        .select("team_id")
        .eq("user_id", user!.id);

      if (!teamMembers?.length) return [];

      const teamIds = teamMembers.map((tm) => tm.team_id);
      const { data, error } = await supabase
        .from("tasks")
        .select("*, teams(name), profiles!tasks_project_manager_id_fkey(full_name, email)")
        .in("team_id", teamIds)
        .order("created_at", { ascending: false });

      if (error) throw error;
      return data?.filter(isWebsiteOrder) || [];
    },
  });

  // Unread message counts for chat
  const taskIdsForChat = tasks?.map(t => t.id) || [];
  const { data: unreadCounts } = useUnreadMessageCounts(taskIdsForChat);

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

  const { data: phaseReviews } = useQuery({
    queryKey: ["developer-phase-reviews", user?.id],
    queryFn: async () => {
      if (!tasks?.length) return [];
      const taskIds = tasks.map(t => t.id);
      const { data, error } = await supabase
        .from("phase_reviews")
        .select("*")
        .in("task_id", taskIds)
        .order("reviewed_at", { ascending: true });
      if (error) throw error;
      return data;
    },
    enabled: !!tasks?.length,
  });

  // Realtime subscription for phase_reviews and project_phases updates
  useEffect(() => {
    const channel = supabase
      .channel('developer-phase-reviews-realtime')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'phase_reviews' }, () => {
        queryClient.invalidateQueries({ queryKey: ["developer-phase-reviews"] });
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'project_phases' }, () => {
        queryClient.invalidateQueries({ queryKey: ["developer-phases"] });
      })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [queryClient]);

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

      // Set started_by on Phase 1
      await supabase
        .from("project_phases")
        .update({ started_by: user!.id } as any)
        .eq("task_id", taskId)
        .eq("phase_number", 1);
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

  // Fetch active developers for team leader direct reassignment
  const { data: allDevelopers } = useQuery({
    queryKey: ["active-developers-for-reassign"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("developers")
        .select("id, name, user_id")
        .eq("is_active", true)
        .order("name");
      if (error) throw error;
      return data;
    },
    enabled: isTeamLeader,
  });

  // Direct reassignment mutation for team leaders
  const directReassignment = useMutation({
    mutationFn: async ({ taskId, newDevId, reason }: { taskId: string; newDevId: string; reason: string }) => {
      const task = tasks?.find(t => t.id === taskId);
      const newDev = allDevelopers?.find(d => d.id === newDevId);
      if (!newDev) throw new Error("Developer not found");

      // Get new developer's team
      const { data: teamMember } = await supabase
        .from("team_members")
        .select("team_id")
        .eq("user_id", newDev.user_id)
        .single();
      if (!teamMember) throw new Error("Developer team not found");

      const { error: taskError } = await supabase
        .from("tasks")
        .update({
          developer_id: newDevId,
          team_id: teamMember.team_id,
          reassigned_from: task?.developer_id || null,
          reassigned_at: new Date().toISOString(),
          reassignment_reason: reason,
          reassignment_requested_at: null,
          reassignment_request_reason: null,
        })
        .eq("id", taskId);
      if (taskError) throw taskError;

      // Log reassignment history
      await supabase.from("reassignment_history" as any).insert({
        task_id: taskId,
        from_developer_id: task?.developer_id || null,
        to_developer_id: newDevId,
        reason: reason,
        reassigned_by: user!.id,
      });

      // Recalculate SLA
      try {
        await supabase.functions.invoke("calculate-sla-deadline", {
          body: { taskId },
        });
      } catch (e) {
        console.error("SLA recalculation error:", e);
      }

      // Notify admins and PM
      const { data: admins } = await supabase
        .from("user_roles")
        .select("user_id")
        .eq("role", "admin");
      if (admins) {
        for (const admin of admins) {
          await supabase.from("notifications").insert({
            user_id: admin.user_id,
            type: "task_reassigned",
            title: "Order Reassigned by Team Leader",
            message: `Order "${task?.title}" reassigned to ${newDev.name}. Reason: ${reason}`,
            task_id: taskId,
          });
        }
      }
      if (task?.project_manager_id) {
        await supabase.from("notifications").insert({
          user_id: task.project_manager_id,
          type: "task_reassigned",
          title: "Order Reassigned by Team Leader",
          message: `Order "${task.title}" reassigned to ${newDev.name}. Reason: ${reason}`,
          task_id: taskId,
        });
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["developer-tasks"] });
      toast({ title: "Order reassigned", description: "The order has been reassigned successfully." });
      setReassignTask(null);
      setReassignReason("");
      setReassignDevId("");
    },
    onError: (error: any) => {
      toast({ variant: "destructive", title: "Error", description: error.message });
    },
  });

  // Build reviewer names map from phase_reviews reviewed_by + task PM profiles
  const reviewerNames: Record<string, string> = {};
  const devNames: Record<string, string> = {};
  // From task PM profiles (already fetched via tasks join)
  if (tasks) {
    for (const task of tasks) {
      const pm = (task as any).profiles;
      if (pm && task.project_manager_id) {
        reviewerNames[task.project_manager_id] = pm.full_name || pm.email || "PM";
      }
    }
  }
  // Build dev names from allDevelopers
  if (allDevelopers) {
    for (const dev of allDevelopers) {
      devNames[dev.user_id] = dev.name;
    }
  }
  // Add current user
  if (user?.id && user?.email) {
    if (!devNames[user.id]) {
      devNames[user.id] = user.user_metadata?.full_name || user.email || "You";
    }
  }


  const completePhase = useMutation({
    mutationFn: async ({ taskId, currentPhase, totalPhases, action, pagesCompleted }: { 
      taskId: string; currentPhase: number; totalPhases: number; 
      action: "next_phase" | "complete_website"; pagesCompleted?: number 
    }) => {
      // Determine points: Phase 1 always = 3, others = pages completed (default 3)
      const phasePoints = currentPhase === 1 ? 3 : (pagesCompleted || 3);
      const phasePages = currentPhase === 1 ? 1 : (pagesCompleted || 3);

      const { error: phaseError } = await supabase
        .from("project_phases")
        .update({ 
          status: "completed", 
          completed_at: new Date().toISOString(),
          completed_by: user!.id,
          pages_completed: phasePages,
          points: phasePoints,
        } as any)
        .eq("task_id", taskId)
        .eq("phase_number", currentPhase);
      
      if (phaseError) throw phaseError;

      if (action === "next_phase") {
        const nextPhase = currentPhase + 1;
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

        const { error: insertPhaseError } = await supabase.from("project_phases").insert({
          task_id: taskId, phase_number: nextPhase, sla_hours: 9,
          sla_deadline: slaDeadline, started_at: new Date().toISOString(), started_by: user!.id, status: "in_progress",
        } as any);
        if (insertPhaseError) throw insertPhaseError;

        await supabase.from("tasks").update({
          current_phase: nextPhase, sla_deadline: slaDeadline,
        }).eq("id", taskId);
      } else {
        // Complete website
        await supabase.from("tasks").update({
          status: "completed" as any, current_phase: currentPhase,
        }).eq("id", taskId);
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["developer-tasks"] });
      queryClient.invalidateQueries({ queryKey: ["developer-phases"] });
      setPhaseCompleteTask(null);
      setCompletionAction(null);
      setFinalPhasePages(3);
      toast({ title: "Phase completed!" });
    },
    onError: (error: any) => {
      toast({ variant: "destructive", title: "Error completing phase", description: error.message });
    },
  });

  const handleFileUpload = async () => {
    if (!selectedTask || !homepageUrls.length) return;

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

      const urlsText = homepageUrls.map((u, i) => `🔗 ${i === 0 ? 'Homepage' : `URL ${i + 1}`}: ${u}`).join('\n');
      const commentPayload = [urlsText, developerComment.trim()].filter(Boolean).join('\n') || null;

      const uploadedPaths: string[] = [];
      const uploadedNames: string[] = [];

      if (files.length > 0) {
        for (const file of files) {
          const sanitizedFileName = file.name.replace(/[^a-zA-Z0-9._-]/g, "_");
          const timestamp = Date.now();
          const fileName = `${teamName}_Task_${selectedTask.task_number}_${timestamp}_${sanitizedFileName}`;
          const filePath = `${user!.id}/${fileName}`;

          const { error: uploadError } = await supabase.storage.from("design-files").upload(filePath, file);
          if (uploadError) throw uploadError;

          uploadedPaths.push(filePath);
          uploadedNames.push(file.name);

          const { error: submissionError } = await supabase.from("design_submissions").insert({
            task_id: selectedTask.id, designer_id: user!.id,
            file_path: filePath, file_name: fileName,
            designer_comment: commentPayload,
          });
          if (submissionError) throw submissionError;
          uploadedCount++;
          toast({ title: `Uploaded ${uploadedCount} of ${files.length} files` });
        }
      } else {
        // No files — submit just the comment/URL as a submission record
        const { error: submissionError } = await supabase.from("design_submissions").insert({
          task_id: selectedTask.id, designer_id: user!.id,
          file_path: "no-file", file_name: "comment-only",
          designer_comment: commentPayload,
        });
        if (submissionError) throw submissionError;
      }

      // Update phase with submission files and comment
      const phaseUpdate: any = {
        submission_comment: commentPayload,
        completed_by: user!.id,
      };
      if (uploadedPaths.length > 0) {
        phaseUpdate.submission_file_paths = uploadedPaths.join("|||");
        phaseUpdate.submission_file_names = uploadedNames.join("|||");
      }
      await supabase.from("project_phases")
        .update(phaseUpdate)
        .eq("task_id", selectedTask.id)
        .eq("phase_number", selectedTask.current_phase || 1);

      // Reset SLA to 9 working hours from now after every upload
      if (selectedTask.developer_id) {
        try {
          const slaResponse = await supabase.functions.invoke('calculate-sla-deadline', {
            body: { 
              developer_id: selectedTask.developer_id, 
              start_time: new Date().toISOString(), 
              sla_hours: 9 
            },
          });
          if (slaResponse.data?.deadline) {
            const newDeadline = slaResponse.data.deadline;
            // Update project_phases SLA deadline for current phase
            await supabase.from("project_phases").update({ 
              sla_deadline: newDeadline, sla_hours: 9 
            }).eq("task_id", selectedTask.id).eq("phase_number", selectedTask.current_phase || 1);
            // Update tasks SLA deadline
            await supabase.from("tasks").update({ 
              sla_deadline: newDeadline 
            }).eq("id", selectedTask.id);
          }
        } catch (e) {
          console.error("SLA reset on upload failed:", e);
        }
      }

      if (!hasRevision) {
        setPhaseCompleteTask(selectedTask);
      }

      queryClient.invalidateQueries({ queryKey: ["developer-tasks"] });
      queryClient.invalidateQueries({ queryKey: ["developer-submissions"] });
      queryClient.invalidateQueries({ queryKey: ["developer-phases"] });
      toast({ 
        title: hasRevision ? "Revision uploaded successfully" : "Submission complete — choose next action",
        description: files.length ? `${files.length} file(s) submitted` : "Submitted successfully"
      });
      setSelectedTask(null);
      setFiles([]);
      setFilePreviews({});
      setDeveloperComment("");
      setHomepageUrls([]);
      setUrlInput("");
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

  const submitNameservers = useMutation({
    mutationFn: async ({ taskId, ns1, ns2, ns3, ns4, pmId, domain }: { 
      taskId: string; ns1: string; ns2: string; ns3: string; ns4: string; pmId: string; domain: string;
    }) => {
      const { error } = await supabase
        .from("tasks")
        .update({
          launch_nameserver_status: "nameservers_provided",
          launch_nameserver_1: ns1,
          launch_nameserver_2: ns2 || null,
          launch_nameserver_3: ns3 || null,
          launch_nameserver_4: ns4 || null,
        } as any)
        .eq("id", taskId);
      if (error) throw error;

      await supabase.from("notifications").insert({
        user_id: pmId,
        type: "nameserver_ready",
        title: "Nameservers Ready",
        message: `Nameservers for ${domain} are ready. Please forward to client.`,
        task_id: taskId,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["developer-tasks"] });
      toast({ title: "Nameservers submitted" });
    },
  });

  const submitDnsRecords = useMutation({
    mutationFn: async ({ taskId, aRecord, cname, mx, pmId, domain }: { 
      taskId: string; aRecord: string; cname: string; mx: string; pmId: string; domain: string;
    }) => {
      const { error } = await supabase
        .from("tasks")
        .update({
          launch_dns_status: "dns_provided",
          launch_dns_a_record: aRecord,
          launch_dns_cname: cname || null,
          launch_dns_mx_record: mx || null,
        } as any)
        .eq("id", taskId);
      if (error) throw error;

      await supabase.from("notifications").insert({
        user_id: pmId,
        type: "dns_ready",
        title: "DNS Records Ready",
        message: `DNS records for ${domain} are ready. Please forward to client.`,
        task_id: taskId,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["developer-tasks"] });
      toast({ title: "DNS records submitted" });
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
    if (task.status !== "assigned" || !task.ack_deadline) return false;
    // Wall-clock check
    if (new Date(task.ack_deadline) < new Date()) return true;
    // Working-minutes check: if calendar available, check if remaining working minutes = 0
    if (devCalendar?.calendar) {
      const remaining = calculateRemainingWorkingMinutes(
        new Date(), new Date(task.ack_deadline), devCalendar.calendar, devLeaves || []
      );
      if (remaining <= 0) return true;
    }
    // Also check the late_acknowledgement flag from DB
    if (task.late_acknowledgement) return true;
    return false;
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
      case "approved": return "bg-orange-500/10 text-orange-700 dark:text-orange-400";
      case "on_hold": return "bg-amber-500/10 text-amber-700 dark:text-amber-400";
      default: return "bg-muted text-muted-foreground";
    }
  };

  const getStatusLabel = (status: string, task?: any) => {
    if (status === "assigned") return "Awaiting Acknowledgement";
    if (status === "in_progress") return `Phase ${task?.current_phase || 1} in Progress`;
    if (status === "completed") return "Website Complete";
    if (status === "on_hold") return "On Hold";
    if (status === "approved" && task) {
      if (task.launch_website_live_at) return "Website Live";
      if (task.launch_nameserver_status && task.launch_nameserver_status !== "nameservers_confirmed") {
        const nsLabels: Record<string, string> = { pending_nameservers: "Nameserver Pending", nameservers_provided: "Nameservers Provided", nameservers_forwarded: "Nameservers Forwarded" };
        return nsLabels[task.launch_nameserver_status] || "Nameserver Pending";
      }
      if (task.launch_dns_status && task.launch_dns_status !== "dns_confirmed") {
        const dnsLabels: Record<string, string> = { pending_dns: "DNS Pending", dns_provided: "DNS Provided", dns_forwarded: "DNS Forwarded" };
        return dnsLabels[task.launch_dns_status] || "DNS Pending";
      }
      if (task.launch_delegate_status && task.launch_delegate_status !== "confirmed") return "Delegate Pending";
      if (task.launch_self_launch_status && task.launch_self_launch_status !== "confirmed") return "Self-Launch Pending";
      if (task.launch_hosting_delegate_status && task.launch_hosting_delegate_status !== "confirmed") return "Hosting Delegate Pending";
      return "Launch Pending";
    }
    return status.replace("_", " ");
  };

  const filteredTasks = tasks?.filter((task) => {
    // In "My Orders" mode for team leaders, only show tasks assigned to their developer record
    if (isTeamLeader && viewMode === "my_orders" && devCalendar?.developerId) {
      if (task.developer_id !== devCalendar.developerId) return false;
    }
    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase();
      return task.title?.toLowerCase().includes(query) ||
        task.task_number?.toString().includes(query) ||
        task.business_name?.toLowerCase().includes(query) ||
        task.description?.toLowerCase().includes(query) ||
        `#${task.task_number}`.includes(query);
    }
    if (statusFilter === "active") {
      return task.status === "assigned" || task.status === "pending" || task.status === "in_progress" || tasksNeedingRevision.some(t => t.id === task.id) || (task.status === "approved" && !(task as any).launch_website_live_at);
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
            <p className="text-sm text-muted-foreground">{isTeamLeader ? 'Development Team Leader' : 'Developer Dashboard'}</p>
          </div>
          <div className="flex items-center gap-2">
            {isTeamLeader && (
              <Tabs value={viewMode} onValueChange={(v) => setViewMode(v as "team" | "my_orders")}>
                <TabsList>
                  <TabsTrigger value="team" className="gap-1.5">
                    <Users className="h-3.5 w-3.5" />
                    Team Overview
                  </TabsTrigger>
                  <TabsTrigger value="my_orders" className="gap-1.5">
                    <Globe className="h-3.5 w-3.5" />
                    My Orders
                  </TabsTrigger>
                </TabsList>
              </Tabs>
            )}
            <NotificationBell userId={user!.id} />
            <Button onClick={signOut} variant="outline" size="sm">
              <LogOut className="mr-2 h-4 w-4" />
              Sign Out
            </Button>
          </div>
        </div>
      </header>

      <main className="container mx-auto px-4 py-8">
        {isTeamLeader && viewMode === "team" ? (
          <TeamOverviewDashboard userId={user!.id} />
        ) : (
        <>
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

        {/* Monthly Points Summary */}
        {projectPhases && projectPhases.length > 0 && (
          <Card className="mb-6">
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-medium flex items-center gap-2">
                <CheckCircle2 className="h-4 w-4 text-primary" />
                Points Summary
              </CardTitle>
            </CardHeader>
            <CardContent>
              {(() => {
                const now = new Date();
                const currentMonth = now.getMonth();
                const currentYear = now.getFullYear();
                const completedPhases = projectPhases.filter(p => p.status === "completed" && p.completed_at);
                const monthlyPhases = completedPhases.filter(p => {
                  const d = new Date(p.completed_at!);
                  return d.getMonth() === currentMonth && d.getFullYear() === currentYear;
                });
                const totalPoints = completedPhases.reduce((s, p) => s + (p.points || 3), 0);
                const monthlyPoints = monthlyPhases.reduce((s, p) => s + (p.points || 3), 0);
                const totalPages = completedPhases.reduce((s, p) => s + (p.phase_number === 1 ? 1 : (p.pages_completed || 3)), 0);
                const monthlyPages = monthlyPhases.reduce((s, p) => s + (p.phase_number === 1 ? 1 : (p.pages_completed || 3)), 0);
                return (
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                    <div className="text-center p-3 bg-primary/5 rounded-lg">
                      <div className="text-2xl font-bold text-primary">{monthlyPoints}</div>
                      <div className="text-xs text-muted-foreground">This Month's Points</div>
                    </div>
                    <div className="text-center p-3 bg-muted/30 rounded-lg">
                      <div className="text-2xl font-bold">{monthlyPages}</div>
                      <div className="text-xs text-muted-foreground">Pages This Month</div>
                    </div>
                    <div className="text-center p-3 bg-muted/30 rounded-lg">
                      <div className="text-2xl font-bold">{totalPoints}</div>
                      <div className="text-xs text-muted-foreground">All-Time Points</div>
                    </div>
                    <div className="text-center p-3 bg-muted/30 rounded-lg">
                      <div className="text-2xl font-bold">{totalPages}</div>
                      <div className="text-xs text-muted-foreground">All-Time Pages</div>
                    </div>
                  </div>
                );
              })()}
            </CardContent>
          </Card>
        )}

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
                          {isAssigned && !ackOverdue && !task.late_acknowledgement && (
                            <Badge className="gap-1 bg-blue-500/10 text-blue-700 dark:text-blue-400 border-blue-500">
                              <Play className="h-3 w-3" />
                              NEW
                            </Badge>
                          )}
                          {(ackOverdue || (isAssigned && task.late_acknowledgement)) && task.ack_deadline && (
                            <AckOverdueBadge ackDeadline={task.ack_deadline} calendar={devCalendar?.calendar} leaves={devLeaves} />
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
                          {task.late_acknowledgement && !isAssigned && (
                            <Badge variant="destructive" className="gap-1">
                              <AlertTriangle className="h-3 w-3" />
                              LATE ACK
                            </Badge>
                          )}
                        </div>
                        <p className="text-sm text-muted-foreground">{task.description}</p>
                        {/* Pages & Points - always visible on every card */}
                        {(() => {
                          const taskPhases = projectPhases?.filter(p => p.task_id === task.id && p.status === "completed") || [];
                          const totalPts = taskPhases.reduce((sum, p) => sum + (p.points || 3), 0);
                          const totalPgs = taskPhases.reduce((sum, p) => sum + (p.phase_number === 1 ? 1 : (p.pages_completed || 3)), 0);
                          return (
                            <div className="flex items-center gap-3 text-xs mt-1">
                              <span className="text-muted-foreground">{taskPhases.length} phase{taskPhases.length !== 1 ? 's' : ''} completed</span>
                              <span className="text-muted-foreground">•</span>
                              <span className="text-muted-foreground">{totalPgs} page{totalPgs !== 1 ? 's' : ''} developed</span>
                              <span className="text-muted-foreground">•</span>
                              <span className="font-semibold text-primary">{totalPts} pts</span>
                            </div>
                          );
                        })()}
                        
                        {/* SLA & Ack Timers for assigned tasks */}
                        {isAssigned && (
                          <div className="mt-2 p-2.5 bg-blue-500/5 border border-blue-200 dark:border-blue-800 rounded-md space-y-1.5">
                            {task.ack_deadline && (
                              <SlaCountdown deadline={task.ack_deadline} label="Ack Timer" calendar={devCalendar?.calendar} leaves={devLeaves} />
                            )}
                            {task.sla_deadline && (
                              <SlaCountdown deadline={task.sla_deadline} label="9hr SLA" calendar={devCalendar?.calendar} leaves={devLeaves} slaHours={9} />
                            )}
                          </div>
                        )}

                        {/* Phase Progress & SLA for in-progress tasks */}
                        {!isAssigned && task.current_phase && task.status !== "completed" && task.status !== "approved" && (
                          <div className="mt-2 p-2.5 bg-muted/30 rounded-md space-y-2">
                            {task.sla_deadline && <SlaCountdown deadline={task.sla_deadline} calendar={devCalendar?.calendar} leaves={devLeaves} slaHours={9} />}
                            {/* Change timers for phases with changes needed */}
                            {projectPhases?.filter(p => p.task_id === task.id && p.change_deadline && !p.change_completed_at && (p.review_status === 'approved_with_changes' || p.review_status === 'disapproved_with_changes')).map(p => (
                              <SlaCountdown key={p.id} deadline={p.change_deadline} label={`Changes (P${p.phase_number} - ${p.change_severity})`} calendar={devCalendar?.calendar} leaves={devLeaves} slaHours={
                                p.change_severity === 'minor' ? 2 : p.change_severity === 'average' ? 4 : p.change_severity === 'major' ? 9 : 18
                              } />
                            ))}
                            {/* Phase Submissions Timeline */}
                            {(() => {
                              const taskPhases = projectPhases?.filter(p => p.task_id === task.id) || [];
                              const taskReviews = phaseReviews?.filter(pr => pr.task_id === task.id) || [];
                              if (taskPhases.length > 0) {
                                return <DevPhaseReviewTimeline phases={taskPhases} phaseReviews={taskReviews} taskId={task.id} onMarkPhaseComplete={handleMarkPhaseComplete} reviewerNames={reviewerNames} userId={user?.id} canReply={true} devNames={devNames} />;
                              }
                              return null;
                            })()}
                          </div>
                        )}

                        {/* Points summary for completed tasks */}
                        {(task.status === "completed" || task.status === "approved") && (
                          <div className="mt-2 p-2.5 bg-primary/5 rounded-md">
                            {(() => {
                              const taskPhases = projectPhases?.filter(p => p.task_id === task.id && p.status === "completed") || [];
                              const totalPts = taskPhases.reduce((sum, p) => sum + (p.points || 3), 0);
                              const totalPgs = taskPhases.reduce((sum, p) => sum + (p.phase_number === 1 ? 1 : (p.pages_completed || 3)), 0);
                              return (
                                <div className="flex items-center justify-between text-xs">
                                  <span className="text-muted-foreground">{taskPhases.length} phase{taskPhases.length !== 1 ? 's' : ''} • {totalPgs} pages</span>
                                  <span className="font-semibold text-primary">{totalPts} points earned</span>
                                </div>
                              );
                            })()}
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
                          <Button size="sm" variant="outline" className="relative" onClick={() => setChatTask(task)}>
                            <MessageCircle className="h-3 w-3 mr-1" />
                            Chat
                            {(unreadCounts?.get(task.id) || 0) > 0 && (
                              <span className="absolute -top-1.5 -right-1.5 bg-destructive text-destructive-foreground text-[10px] rounded-full h-4 min-w-[16px] flex items-center justify-center px-1">
                                {unreadCounts!.get(task.id)}
                              </span>
                            )}
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

                        {/* Nameserver Provisioning Section */}
                        {(task as any).launch_access_method === "nameservers" && (task as any).launch_nameserver_status === "pending_nameservers" && (
                          <div className="mt-3 p-3 border rounded-md bg-muted/30 space-y-3">
                            <p className="text-sm font-medium">🖥️ Provide Nameservers for {(task as any).launch_domain || 'this domain'}</p>
                            <div className="grid grid-cols-2 gap-2">
                              <div>
                                <Label className="text-xs">Primary NS *</Label>
                                <Input
                                  placeholder="ns1.example.com"
                                  value={nameserverInputs[task.id]?.ns1 || ''}
                                  onChange={(e) => setNameserverInputs(prev => ({
                                    ...prev,
                                    [task.id]: { ...prev[task.id], ns1: e.target.value, ns2: prev[task.id]?.ns2 || '', ns3: prev[task.id]?.ns3 || '', ns4: prev[task.id]?.ns4 || '' }
                                  }))}
                                />
                              </div>
                              <div>
                                <Label className="text-xs">Secondary NS</Label>
                                <Input
                                  placeholder="ns2.example.com"
                                  value={nameserverInputs[task.id]?.ns2 || ''}
                                  onChange={(e) => setNameserverInputs(prev => ({
                                    ...prev,
                                    [task.id]: { ...prev[task.id], ns1: prev[task.id]?.ns1 || '', ns2: e.target.value, ns3: prev[task.id]?.ns3 || '', ns4: prev[task.id]?.ns4 || '' }
                                  }))}
                                />
                              </div>
                              <div>
                                <Label className="text-xs">NS3 (optional)</Label>
                                <Input
                                  placeholder="ns3.example.com"
                                  value={nameserverInputs[task.id]?.ns3 || ''}
                                  onChange={(e) => setNameserverInputs(prev => ({
                                    ...prev,
                                    [task.id]: { ...prev[task.id], ns1: prev[task.id]?.ns1 || '', ns2: prev[task.id]?.ns2 || '', ns3: e.target.value, ns4: prev[task.id]?.ns4 || '' }
                                  }))}
                                />
                              </div>
                              <div>
                                <Label className="text-xs">NS4 (optional)</Label>
                                <Input
                                  placeholder="ns4.example.com"
                                  value={nameserverInputs[task.id]?.ns4 || ''}
                                  onChange={(e) => setNameserverInputs(prev => ({
                                    ...prev,
                                    [task.id]: { ...prev[task.id], ns1: prev[task.id]?.ns1 || '', ns2: prev[task.id]?.ns2 || '', ns3: prev[task.id]?.ns3 || '', ns4: e.target.value }
                                  }))}
                                />
                              </div>
                            </div>
                            <Button
                              size="sm"
                              onClick={() => {
                                const ns = nameserverInputs[task.id];
                                if (!ns?.ns1?.trim()) {
                                  toast({ variant: "destructive", title: "Primary nameserver is required" });
                                  return;
                                }
                                submitNameservers.mutate({
                                  taskId: task.id,
                                  ns1: ns.ns1.trim(),
                                  ns2: ns.ns2?.trim() || '',
                                  ns3: ns.ns3?.trim() || '',
                                  ns4: ns.ns4?.trim() || '',
                                  pmId: task.project_manager_id,
                                  domain: (task as any).launch_domain || '',
                                });
                              }}
                              disabled={submitNameservers.isPending}
                            >
                              Submit Nameservers
                            </Button>
                          </div>
                        )}

                        {/* Nameserver Confirmed Badge */}
                        {(task as any).launch_access_method === "nameservers" && (task as any).launch_nameserver_status === "nameservers_confirmed" && (
                          <div className="mt-3 p-2 border rounded-md bg-green-500/10">
                            <Badge className="bg-green-600 text-white">
                              🚀 Nameservers Confirmed — Proceed with Launch
                            </Badge>
                          </div>
                        )}

                        {/* Nameservers Provided - waiting for PM */}
                        {(task as any).launch_access_method === "nameservers" && ((task as any).launch_nameserver_status === "nameservers_provided" || (task as any).launch_nameserver_status === "forwarded_to_client") && (
                          <div className="mt-3 p-2 border rounded-md bg-muted/30">
                            <p className="text-xs text-muted-foreground">Nameservers submitted — waiting for client confirmation</p>
                          </div>
                        )}

                        {/* DNS Records Provisioning Section */}
                        {(task as any).launch_access_method === "dns_records" && (task as any).launch_dns_status === "pending_dns" && (
                          <div className="mt-3 p-3 border rounded-md bg-muted/30 space-y-3">
                            <p className="text-sm font-medium">🌐 Provide DNS Records for {(task as any).launch_domain || 'this domain'}</p>
                            <div className="space-y-2">
                              <div>
                                <Label className="text-xs">A Record (IP Address) *</Label>
                                <Input
                                  placeholder="e.g. 192.168.1.1"
                                  value={dnsInputs[task.id]?.aRecord || ''}
                                  onChange={(e) => setDnsInputs(prev => ({
                                    ...prev,
                                    [task.id]: { ...prev[task.id], aRecord: e.target.value, cname: prev[task.id]?.cname || '', mx: prev[task.id]?.mx || '' }
                                  }))}
                                />
                              </div>
                              <div>
                                <Label className="text-xs">CNAME Record (optional)</Label>
                                <Input
                                  placeholder="e.g. www.example.com"
                                  value={dnsInputs[task.id]?.cname || ''}
                                  onChange={(e) => setDnsInputs(prev => ({
                                    ...prev,
                                    [task.id]: { ...prev[task.id], aRecord: prev[task.id]?.aRecord || '', cname: e.target.value, mx: prev[task.id]?.mx || '' }
                                  }))}
                                />
                              </div>
                              <div>
                                <Label className="text-xs">MX Record (optional)</Label>
                                <Input
                                  placeholder="e.g. mail.example.com"
                                  value={dnsInputs[task.id]?.mx || ''}
                                  onChange={(e) => setDnsInputs(prev => ({
                                    ...prev,
                                    [task.id]: { ...prev[task.id], aRecord: prev[task.id]?.aRecord || '', cname: prev[task.id]?.cname || '', mx: e.target.value }
                                  }))}
                                />
                              </div>
                            </div>
                            <Button
                              size="sm"
                              onClick={() => {
                                const dns = dnsInputs[task.id];
                                if (!dns?.aRecord?.trim()) {
                                  toast({ variant: "destructive", title: "A Record is required" });
                                  return;
                                }
                                submitDnsRecords.mutate({
                                  taskId: task.id,
                                  aRecord: dns.aRecord.trim(),
                                  cname: dns.cname?.trim() || '',
                                  mx: dns.mx?.trim() || '',
                                  pmId: task.project_manager_id,
                                  domain: (task as any).launch_domain || '',
                                });
                              }}
                              disabled={submitDnsRecords.isPending}
                            >
                              Submit DNS Records
                            </Button>
                          </div>
                        )}

                        {/* DNS Confirmed Badge */}
                        {(task as any).launch_access_method === "dns_records" && (task as any).launch_dns_status === "dns_confirmed" && (
                          <div className="mt-3 p-2 border rounded-md bg-green-500/10">
                            <Badge className="bg-green-600 text-white">
                              🚀 DNS Records Confirmed — Proceed with Launch
                            </Badge>
                          </div>
                        )}

                        {/* DNS Provided - waiting for PM */}
                        {(task as any).launch_access_method === "dns_records" && ((task as any).launch_dns_status === "dns_provided" || (task as any).launch_dns_status === "dns_forwarded_to_client") && (
                          <div className="mt-3 p-2 border rounded-md bg-muted/30">
                            <p className="text-xs text-muted-foreground">DNS records submitted — waiting for client confirmation</p>
                          </div>
                        )}

                        {/* Delegate Access Status Badges */}
                        {(task as any).launch_access_method === "delegate" && (task as any).launch_delegate_status === "pending_delegation" && (
                          <div className="mt-3 p-2 border rounded-md bg-muted/30">
                            <p className="text-xs text-muted-foreground">⏳ Awaiting delegate access from client to Charley@plexLogo.com...</p>
                          </div>
                        )}
                        {(task as any).launch_access_method === "delegate" && (task as any).launch_delegate_status === "forwarded_to_client" && (
                          <div className="mt-3 p-2 border rounded-md bg-muted/30">
                            <p className="text-xs text-muted-foreground">📞 PM has contacted client about delegation</p>
                          </div>
                        )}
                        {(task as any).launch_access_method === "delegate" && (task as any).launch_delegate_status === "access_granted" && (
                          <div className="mt-3 p-2 border rounded-md bg-green-500/10">
                            <Badge className="bg-green-600 text-white">
                              🚀 Delegate Access Confirmed — Proceed with Launch
                            </Badge>
                          </div>
                        )}

                        {/* Domain Credentials Section */}
                        {(task as any).launch_access_method === "credentials" && ((task as any).launch_domain_username || (task as any).launch_domain_password) && (
                          <div className="mt-3 p-3 border rounded-md bg-muted/30 space-y-1">
                            <p className="text-sm font-medium">🔑 Domain Login Credentials</p>
                            {(task as any).launch_domain_provider && (
                              <p className="text-xs text-muted-foreground">Provider: <span className="font-medium text-foreground">{(task as any).launch_domain_provider}</span></p>
                            )}
                            <p className="text-xs text-muted-foreground">Username: <span className="font-mono text-foreground">{(task as any).launch_domain_username}</span></p>
                            <p className="text-xs text-muted-foreground">Password: <span className="font-mono text-foreground">{(task as any).launch_domain_password}</span></p>
                          </div>
                        )}

                        {/* Hosting Credentials Section */}
                        {(task as any).launch_hosting_access_method === "hosting_credentials" && ((task as any).launch_hosting_username || (task as any).launch_hosting_password) && (
                          <div className="mt-3 p-3 border rounded-md bg-muted/30 space-y-1">
                            <p className="text-sm font-medium">🖥️ Hosting Login Credentials</p>
                            {(task as any).launch_hosting_provider_name && (
                              <p className="text-xs text-muted-foreground">Provider: <span className="font-medium text-foreground">{(task as any).launch_hosting_provider_name}</span></p>
                            )}
                            <p className="text-xs text-muted-foreground">Username: <span className="font-mono text-foreground">{(task as any).launch_hosting_username}</span></p>
                            <p className="text-xs text-muted-foreground">Password: <span className="font-mono text-foreground">{(task as any).launch_hosting_password}</span></p>
                          </div>
                        )}

                        {/* Hosting Delegate Access Status Badges */}
                        {(task as any).launch_hosting_access_method === "hosting_delegate" && (task as any).launch_hosting_delegate_status === "pending_delegation" && (
                          <div className="mt-3 p-2 border rounded-md bg-muted/30">
                            <p className="text-xs text-muted-foreground">⏳ Awaiting hosting delegate access from client ({(task as any).launch_hosting_provider_name || 'hosting'})...</p>
                          </div>
                        )}
                        {(task as any).launch_hosting_access_method === "hosting_delegate" && (task as any).launch_hosting_delegate_status === "forwarded_to_client" && (
                          <div className="mt-3 p-2 border rounded-md bg-muted/30">
                            <p className="text-xs text-muted-foreground">📞 PM has contacted client about hosting delegation</p>
                          </div>
                        )}
                        {(task as any).launch_hosting_access_method === "hosting_delegate" && (task as any).launch_hosting_delegate_status === "access_granted" && (
                          <div className="mt-3 p-2 border rounded-md bg-green-500/10">
                            <Badge className="bg-green-600 text-white">
                              🚀 Hosting Delegate Access Confirmed — Proceed with Launch
                            </Badge>
                          </div>
                        )}

                        {/* Self-Launch WeTransfer Link Section */}
                        {(task as any).launch_hosting_access_method === "self_launch" && (task as any).launch_self_launch_status === "pending_link" && (
                          <div className="mt-3 p-3 border rounded-md bg-amber-50 dark:bg-amber-950/30 border-amber-200 dark:border-amber-800 space-y-2">
                            <p className="text-sm font-medium text-amber-800 dark:text-amber-200">📦 Generate WeTransfer Link</p>
                            <p className="text-xs text-muted-foreground">
                              Client will self-launch. Please generate a WeTransfer download link for the website files and paste it below.
                            </p>
                            <div className="flex gap-2">
                              <Input
                                placeholder="https://we.tl/..."
                                value={wetransferInputs[task.id] || ''}
                                onChange={(e) => setWetransferInputs(prev => ({ ...prev, [task.id]: e.target.value }))}
                                className="flex-1"
                              />
                              <Button
                                size="sm"
                                onClick={async () => {
                                  const link = wetransferInputs[task.id]?.trim();
                                  if (!link) {
                                    toast({ variant: "destructive", title: "Please enter a WeTransfer link" });
                                    return;
                                  }
                                  if (!link) {
                                    toast({ variant: "destructive", title: "Please enter a WeTransfer link" });
                                    return;
                                  }
                                  const { error } = await supabase
                                    .from("tasks")
                                    .update({
                                      launch_wetransfer_link: link,
                                      launch_self_launch_status: "link_provided",
                                    } as any)
                                    .eq("id", task.id);
                                  if (error) {
                                    toast({ variant: "destructive", title: "Error", description: error.message });
                                    return;
                                  }
                                  // Notify PM
                                  await supabase.from("notifications").insert({
                                    user_id: task.project_manager_id,
                                    type: "self_launch_link_request",
                                    title: "WeTransfer Link Ready",
                                    message: `WeTransfer link for ${(task as any).launch_domain || task.title} is ready. Please share with the client.`,
                                    task_id: task.id,
                                  });
                                  queryClient.invalidateQueries({ queryKey: ["developer-tasks"] });
                                  toast({ title: "WeTransfer link submitted — PM notified" });
                                }}
                              >
                                Submit Link
                              </Button>
                            </div>
                          </div>
                        )}
                        {(task as any).launch_hosting_access_method === "self_launch" && (task as any).launch_self_launch_status === "link_provided" && (
                          <div className="mt-3 p-2 border rounded-md bg-muted/30">
                            <p className="text-xs text-muted-foreground">📤 WeTransfer link sent to PM — awaiting client self-launch</p>
                          </div>
                        )}
                        {(task as any).launch_hosting_access_method === "self_launch" && (task as any).launch_self_launch_status === "self_launch_completed" && (
                          <div className="mt-3 p-2 border rounded-md bg-green-500/10">
                            <Badge className="bg-green-600 text-white">
                              ✅ Client has self-launched. Verify the website is live.
                            </Badge>
                          </div>
                        )}

                        {/* Mark Website Live Button - appears when all access methods are resolved */}
                        {task.status === "approved" && !(task as any).launch_website_live_at && (() => {
                          const domainMethod = (task as any).launch_access_method;
                          const domainResolved = 
                            !domainMethod || domainMethod === "not_required" ||
                            domainMethod === "credentials" ||
                            (domainMethod === "delegate" && (task as any).launch_delegate_status === "access_granted") ||
                            (domainMethod === "nameservers" && (task as any).launch_nameserver_status === "nameservers_confirmed") ||
                            (domainMethod === "dns_records" && (task as any).launch_dns_status === "dns_confirmed");
                          
                          const hostingProvider = (task as any).launch_hosting_provider;
                          const hostingMethod = (task as any).launch_hosting_access_method;
                          const hostingResolved = 
                            hostingProvider === "plex_hosting" || !hostingProvider ||
                            hostingMethod === "hosting_credentials" ||
                            (hostingMethod === "hosting_delegate" && (task as any).launch_hosting_delegate_status === "access_granted") ||
                            (hostingMethod === "self_launch" && (task as any).launch_self_launch_status === "self_launch_completed");
                          
                          if (!domainResolved || !hostingResolved) return null;
                          
                          return (
                            <div className="mt-3 p-3 border rounded-md bg-primary/5 border-primary/20">
                              <p className="text-sm font-medium mb-2">🚀 All access methods resolved — ready to launch!</p>
                              <Button
                                size="sm"
                                className="bg-green-600 hover:bg-green-700"
                                onClick={async () => {
                                  const { error } = await supabase
                                    .from("tasks")
                                    .update({
                                      launch_website_live_at: new Date().toISOString(),
                                      launch_website_live_by: user!.id,
                                    } as any)
                                    .eq("id", task.id);
                                  if (error) {
                                    toast({ variant: "destructive", title: "Error", description: error.message });
                                    return;
                                  }
                                  await supabase.from("notifications").insert({
                                    user_id: task.project_manager_id,
                                    type: "website_marked_live",
                                    title: "Website Marked Live",
                                    message: `Developer has marked ${(task as any).launch_domain || task.title} as live. Please verify and close the task.`,
                                    task_id: task.id,
                                  });
                                  queryClient.invalidateQueries({ queryKey: ["developer-tasks"] });
                                  toast({ title: "Website marked as live — PM notified to verify" });
                                }}
                              >
                                <CheckCircle2 className="h-3.5 w-3.5 mr-1.5" />
                                Mark Website Live
                              </Button>
                            </div>
                          );
                        })()}

                        {/* Website Already Marked Live */}
                        {(task as any).launch_website_live_at && (
                          <div className="mt-3 p-2 border rounded-md bg-green-500/10">
                            <Badge className="bg-green-600 text-white">
                              <CheckCircle2 className="h-3 w-3 mr-1" />
                              Website Marked Live — {format(new Date((task as any).launch_website_live_at), 'MMM d, yyyy HH:mm')}
                            </Badge>
                          </div>
                        )}
                      </div>
                      <div className="flex flex-col items-end gap-2 ml-4">
                        <Badge className={hasRevision ? "bg-destructive text-destructive-foreground" : getStatusColor(task.status)}>
                          {hasRevision ? "Revision Needed" : getStatusLabel(task.status, task)}
                        </Badge>
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
                              {isTeamLeader ? "Reassign" : "Request Reassignment"}
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
                            <Globe className="mr-2 h-4 w-4" />
                            Submit Phase {task.current_phase || 1}
                          </Button>
                        )}
                        {/* Mark Changes Complete button removed - now inline in review timeline cards */}
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
        </>
        )}
      </main>

      {/* Submit Phase Dialog */}
      <Dialog open={!!selectedTask} onOpenChange={() => setSelectedTask(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Submit Work — Phase {selectedTask?.current_phase || 1}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <p className="text-sm text-muted-foreground mb-2">Task: {selectedTask?.title}</p>
              {selectedTask?.current_phase && (
                <div className="mb-3">
                  <PhaseProgress currentPhase={selectedTask.current_phase} totalPhases={selectedTask.total_phases} phases={projectPhases?.filter(p => p.task_id === selectedTask?.id)} />
                </div>
              )}
              <p className="text-xs text-muted-foreground">
                Enter the website URL you are working on. You can also add comments or upload files if needed.
              </p>
            </div>
            <div className="space-y-2">
              <Label htmlFor="homepage-url" className="flex items-center gap-1.5">
                <Link className="h-3.5 w-3.5" />
                Website URLs <span className="text-destructive">*</span>
                <span className="text-xs text-muted-foreground font-normal ml-1">(at least one required)</span>
              </Label>
              <div className="flex gap-2">
                <Input
                  id="homepage-url"
                  type="url"
                  placeholder="https://www.example.com"
                  value={urlInput}
                  onChange={(e) => setUrlInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      const trimmed = urlInput.trim();
                      if (trimmed && !homepageUrls.includes(trimmed)) {
                        setHomepageUrls(prev => [...prev, trimmed]);
                        setUrlInput("");
                      }
                    }
                  }}
                />
                <Button
                  type="button"
                  variant="secondary"
                  size="sm"
                  disabled={!urlInput.trim()}
                  onClick={() => {
                    const trimmed = urlInput.trim();
                    if (trimmed && !homepageUrls.includes(trimmed)) {
                      setHomepageUrls(prev => [...prev, trimmed]);
                      setUrlInput("");
                    }
                  }}
                >Add</Button>
              </div>
              {homepageUrls.length > 0 && (
                <div className="flex flex-wrap gap-1.5">
                  {homepageUrls.map((url, index) => (
                    <Badge key={index} variant="secondary" className="gap-1 text-xs max-w-full">
                      <Globe className="h-3 w-3 shrink-0" />
                      <span className="truncate max-w-[200px]">{url}</span>
                      <button
                        type="button"
                        className="ml-0.5 hover:text-destructive"
                        onClick={() => setHomepageUrls(prev => prev.filter((_, i) => i !== index))}
                      >×</button>
                    </Badge>
                  ))}
                </div>
              )}
            </div>
            <div className="space-y-2">
              <Label htmlFor="developer-comment">Comment (optional)</Label>
              <Textarea id="developer-comment" placeholder="Add any notes about your submission..." value={developerComment} onChange={(e) => setDeveloperComment(e.target.value)} rows={3} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="file">Files (optional)</Label>
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
            <Button onClick={handleFileUpload} disabled={!homepageUrls.length || uploading} className="w-full">
              {uploading ? "Submitting..." : "Submit"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Phase Completion Dialog */}
      <Dialog open={!!phaseCompleteTask} onOpenChange={() => { setPhaseCompleteTask(null); setCompletionAction(null); setFinalPhasePages(3); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <CheckCircle2 className="h-5 w-5 text-primary" />
              Phase {phaseCompleteTask?.current_phase || 1} Delivered
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">
              Task: <span className="font-medium text-foreground">{phaseCompleteTask?.title}</span>
            </p>

            {!completionAction && (() => {
              // Check if any phase is disapproved and changes not completed - block progression
              const isBlocked = projectPhases?.some(p => 
                p.task_id === phaseCompleteTask?.id && 
                p.review_status === 'disapproved_with_changes' && 
                !p.change_completed_at
              );
              
              if (isBlocked) {
                return (
                  <div className="space-y-3">
                    <div className="p-3 bg-destructive/10 border border-destructive/20 rounded-md">
                      <div className="flex items-center gap-2 text-destructive font-medium text-sm mb-1">
                        <AlertTriangle className="h-4 w-4" />
                        Blocked — Changes Required
                      </div>
                      <p className="text-xs text-muted-foreground">
                        A previous phase has been disapproved. You must complete the requested changes before advancing to the next phase or completing the website.
                      </p>
                    </div>
                    <Button variant="ghost" size="sm" onClick={() => setPhaseCompleteTask(null)} className="w-full">
                      Close
                    </Button>
                  </div>
                );
              }

              return (
                <div className="space-y-3">
                  <p className="text-sm font-medium">What would you like to do next?</p>
                  <div className="grid grid-cols-2 gap-3">
                    <Button
                      variant="outline"
                      className="h-auto py-4 flex flex-col items-center gap-2"
                      onClick={() => {
                        completePhase.mutate({
                          taskId: phaseCompleteTask.id,
                          currentPhase: phaseCompleteTask.current_phase || 1,
                          totalPhases: phaseCompleteTask.total_phases || 4,
                          action: "next_phase",
                          pagesCompleted: phaseCompleteTask.current_phase === 1 ? 1 : 3,
                        });
                      }}
                      disabled={completePhase.isPending}
                    >
                      <Play className="h-5 w-5" />
                      <span className="text-sm font-medium">Move to Next Phase</span>
                      <span className="text-xs text-muted-foreground">3 pages / 3 points</span>
                    </Button>
                    <Button
                      variant="outline"
                      className="h-auto py-4 flex flex-col items-center gap-2 border-primary"
                      onClick={() => setCompletionAction("complete_website")}
                    >
                      <CheckCircle2 className="h-5 w-5 text-primary" />
                      <span className="text-sm font-medium">Complete Website</span>
                      <span className="text-xs text-muted-foreground">Finish this project</span>
                    </Button>
                  </div>
                </div>
              );
            })()}

            {completionAction === "complete_website" && phaseCompleteTask?.current_phase > 1 && (
              <div className="space-y-3">
                <p className="text-sm font-medium">How many pages did you complete in Phase {phaseCompleteTask?.current_phase}?</p>
                <div className="flex gap-3">
                  {[1, 2, 3].map(n => (
                    <Button
                      key={n}
                      variant={finalPhasePages === n ? "default" : "outline"}
                      className="flex-1 h-16 flex flex-col items-center gap-1"
                      onClick={() => setFinalPhasePages(n)}
                    >
                      <span className="text-lg font-bold">{n}</span>
                      <span className="text-xs">page{n > 1 ? 's' : ''} / {n} pts</span>
                    </Button>
                  ))}
                </div>
                <Button
                  className="w-full"
                  onClick={() => {
                    completePhase.mutate({
                      taskId: phaseCompleteTask.id,
                      currentPhase: phaseCompleteTask.current_phase || 1,
                      totalPhases: phaseCompleteTask.total_phases || 4,
                      action: "complete_website",
                      pagesCompleted: finalPhasePages,
                    });
                  }}
                  disabled={completePhase.isPending}
                >
                  {completePhase.isPending ? "Completing..." : `Complete Website (${finalPhasePages} pts for this phase)`}
                </Button>
                <Button variant="ghost" size="sm" onClick={() => setCompletionAction(null)} className="w-full">
                  ← Back
                </Button>
              </div>
            )}

            {completionAction === "complete_website" && phaseCompleteTask?.current_phase === 1 && (
              <div className="space-y-3">
                <p className="text-sm text-muted-foreground">Phase 1 (Homepage) = 3 points. The website will be marked as complete.</p>
                <Button
                  className="w-full"
                  onClick={() => {
                    completePhase.mutate({
                      taskId: phaseCompleteTask.id,
                      currentPhase: 1,
                      totalPhases: phaseCompleteTask.total_phases || 4,
                      action: "complete_website",
                      pagesCompleted: 1,
                    });
                  }}
                  disabled={completePhase.isPending}
                >
                  {completePhase.isPending ? "Completing..." : "Complete Website (3 pts)"}
                </Button>
                <Button variant="ghost" size="sm" onClick={() => setCompletionAction(null)} className="w-full">
                  ← Back
                </Button>
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>

      {/* Reassignment Dialog */}
      <Dialog open={!!reassignTask} onOpenChange={() => { setReassignTask(null); setReassignReason(""); setReassignDevId(""); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <RotateCcw className="h-5 w-5 text-orange-600" />
              {isTeamLeader ? "Reassign Order" : "Request Reassignment"}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">
              Task: <span className="font-medium text-foreground">{reassignTask?.title}</span>
            </p>
            {isTeamLeader ? (
              <>
                <div className="space-y-2">
                  <Label>Assign to Developer *</Label>
                  <Select value={reassignDevId} onValueChange={setReassignDevId}>
                    <SelectTrigger>
                      <SelectValue placeholder="Select developer..." />
                    </SelectTrigger>
                    <SelectContent>
                      {allDevelopers?.filter(d => d.id !== reassignTask?.developer_id).map(dev => (
                        <SelectItem key={dev.id} value={dev.id}>{dev.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>Reason for Reassignment *</Label>
                  <Textarea
                    placeholder="Please provide a reason..."
                    value={reassignReason}
                    onChange={(e) => setReassignReason(e.target.value)}
                    rows={3}
                  />
                </div>
                <Button
                  onClick={() => {
                    if (!reassignDevId || !reassignReason.trim()) {
                      toast({ variant: "destructive", title: "Developer and reason are required" });
                      return;
                    }
                    directReassignment.mutate({ taskId: reassignTask.id, newDevId: reassignDevId, reason: reassignReason.trim() });
                  }}
                  disabled={!reassignDevId || !reassignReason.trim() || directReassignment.isPending}
                  className="w-full bg-orange-600 hover:bg-orange-700 text-white"
                >
                  {directReassignment.isPending ? "Reassigning..." : "Reassign Order"}
                </Button>
              </>
            ) : (
              <>
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
              </>
            )}
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
              {viewDetailsTask?.current_phase && (
                <div className="p-4 bg-muted/30 rounded-lg space-y-3">
                  <h3 className="font-semibold text-lg">Project Progress</h3>
                  <PhaseProgress currentPhase={viewDetailsTask.current_phase} totalPhases={viewDetailsTask.total_phases} phases={projectPhases?.filter(p => p.task_id === viewDetailsTask?.id)} />
                  {viewDetailsTask.sla_deadline && viewDetailsTask.status !== "completed" && viewDetailsTask.status !== "approved" && (
                    <SlaCountdown deadline={viewDetailsTask.sla_deadline} label="9hr SLA" calendar={devCalendar?.calendar} leaves={devLeaves} slaHours={9} />
                  )}
                  {viewDetailsTask.ack_deadline && viewDetailsTask.status === "assigned" && (
                    <SlaCountdown deadline={viewDetailsTask.ack_deadline} label="Ack Timer" calendar={devCalendar?.calendar} leaves={devLeaves} />
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

              {/* Phase Submissions Timeline in Details */}
              {viewDetailsTask && (() => {
                const taskPhases = projectPhases?.filter(p => p.task_id === viewDetailsTask.id) || [];
                const taskReviews = phaseReviews?.filter(pr => pr.task_id === viewDetailsTask.id) || [];
                if (taskPhases.length > 0) {
                  return (
                    <div className="p-4 bg-muted/30 rounded-lg">
                      <h3 className="font-semibold text-lg mb-3">Phase Submissions</h3>
                      <DevPhaseReviewTimeline phases={taskPhases} phaseReviews={taskReviews} taskId={viewDetailsTask.id} onMarkPhaseComplete={handleMarkPhaseComplete} reviewerNames={reviewerNames} userId={user?.id} canReply={true} devNames={devNames} />
                    </div>
                  );
                }
                return null;
              })()}

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
                    <Label className="text-muted-foreground">Assigned Project Manager</Label>
                    <p className="font-medium">{(viewDetailsTask as any)?.profiles?.full_name || (viewDetailsTask as any)?.profiles?.email || "N/A"}</p>
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

export default DeveloperDashboard;
