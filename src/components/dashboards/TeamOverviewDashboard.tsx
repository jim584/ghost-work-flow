import { useState, useEffect, useMemo } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { FilePreview } from "@/components/FilePreview";
import { OrderChat, useUnreadMessageCounts } from "@/components/OrderChat";
import { DevPhaseReviewTimeline } from "@/components/dashboards/DevPhaseReviewTimeline";
import {
  AlertTriangle, Clock, CheckCircle2, Play, Timer, Globe, Users,
  FileText, Search, MessageCircle, Download, AlertCircle, RotateCcw,
  ChevronDown, ChevronUp, Upload, Link
} from "lucide-react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { format } from "date-fns";
import { useToast } from "@/hooks/use-toast";
import {
  CalendarConfig, LeaveRecord, calculateRemainingWorkingMinutes, calculateOverdueWorkingMinutes,
  timeToMinutes, getISODay, toTimezoneDate, isWithinShift
} from "@/utils/workingHours";

interface TeamOverviewProps {
  userId: string;
}

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

// ACK Overdue ticking badge
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
      const totalMin = overdueMin + 30;
      const h = Math.floor(totalMin / 60);
      const m = Math.floor(totalMin % 60);
      const localNow = toTimezoneDate(now, calendar.timezone);
      const dayOfWeek = getISODay(localNow);
      const currentMinute = localNow.getHours() * 60 + localNow.getMinutes();
      const isSat = dayOfWeek === 6;
      const todayStart = isSat && calendar.saturday_start_time ? timeToMinutes(calendar.saturday_start_time) : timeToMinutes(calendar.start_time);
      const todayEnd = isSat && calendar.saturday_end_time ? timeToMinutes(calendar.saturday_end_time) : timeToMinutes(calendar.end_time);
      const isWorkingNow = calendar.working_days.includes(dayOfWeek) && isWithinShift(currentMinute, todayStart, todayEnd);
      const s = isWorkingNow ? (now.getSeconds() % 60) : 0;
      const ackDaysDecimal = totalMin / (9 * 60);
      const timeStr = isWorkingNow
        ? `${h}h ${m}m ${s.toString().padStart(2, '0')}s — ${ackDaysDecimal.toFixed(1)} days`
        : `${h}h ${m}m (paused) — ${ackDaysDecimal.toFixed(1)} days`;
      label = `ACK OVERDUE — ${timeStr}`;
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
  const completedPhases = phases?.filter(p => p.status === "completed").length || 0;
  let totalPages = 0;
  let totalPoints = 0;
  if (phases?.length) {
    for (const p of phases) {
      if (p.status === "completed" || p.status === "in_progress") {
        if (p.phase_number === 1) totalPages += 1;
        else if (p.status === "completed") totalPages += p.pages_completed || 3;
        if (p.status === "completed") totalPoints += p.points || 3;
      }
    }
  }

  const getReviewBadge = (phase: any) => {
    if (!phase.review_status) return null;
    if (phase.review_status === "approved") return <Badge className="bg-green-600 text-white text-[10px] px-1.5 py-0">Approved</Badge>;
    if (phase.review_status === "approved_with_changes") return <Badge className="bg-amber-500 text-white text-[10px] px-1.5 py-0">Changes Needed</Badge>;
    if (phase.review_status === "disapproved_with_changes") return <Badge variant="destructive" className="text-[10px] px-1.5 py-0">Changes Required</Badge>;
    return null;
  };

  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between text-xs">
        <span className="font-medium">Phase {currentPhase}{totalPhases ? ` of ${totalPhases}` : ''}</span>
      </div>
      <div className="flex gap-1">
        {Array.from({ length: currentPhase }).map((_, i) => {
          const phase = phases?.find(p => p.phase_number === i + 1);
          let barColor = i < completedPhases ? 'bg-primary' : 'bg-primary/40';
          if (phase?.review_status === 'disapproved_with_changes' && !phase?.change_completed_at) barColor = 'bg-destructive';
          else if (phase?.review_status === 'approved_with_changes' && !phase?.change_completed_at) barColor = 'bg-amber-500';
          else if (phase?.review_status === 'approved') barColor = 'bg-green-600';
          return <div key={i} className={`h-2 flex-1 rounded-full ${barColor}`} />;
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

const TeamOverviewDashboard = ({ userId }: TeamOverviewProps) => {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [searchQuery, setSearchQuery] = useState("");
  const [viewDetailsTask, setViewDetailsTask] = useState<any>(null);
  const [chatTask, setChatTask] = useState<any>(null);
  const [expandedDeveloper, setExpandedDeveloper] = useState<string | null>(null);
  const [expandedTaskId, setExpandedTaskId] = useState<string | null>(null);

  // Upload/Phase states
  const [selectedTask, setSelectedTask] = useState<any>(null);
  const [files, setFiles] = useState<File[]>([]);
  const [filePreviews, setFilePreviews] = useState<{[key: number]: string}>({});
  const [uploading, setUploading] = useState(false);
  const [developerComment, setDeveloperComment] = useState("");
  const [homepageUrls, setHomepageUrls] = useState<string[]>([]);
  const [urlInput, setUrlInput] = useState("");
  const [phaseCompleteTask, setPhaseCompleteTask] = useState<any>(null);
  const [completionAction, setCompletionAction] = useState<"next_phase" | "complete_website" | null>(null);
  const [finalPhasePages, setFinalPhasePages] = useState<number>(3);
  const [reassignTask, setReassignTask] = useState<any>(null);
  const [reassignReason, setReassignReason] = useState("");
  const [reassignDevId, setReassignDevId] = useState<string>("");

  // Real-time subscription for task/phase changes
  useEffect(() => {
    const channel = supabase
      .channel('team-overview-realtime')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'tasks' }, () => {
        queryClient.invalidateQueries({ queryKey: ["team-overview-tasks"] });
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'project_phases' }, () => {
        queryClient.invalidateQueries({ queryKey: ["team-overview-phases"] });
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'design_submissions' }, () => {
        queryClient.invalidateQueries({ queryKey: ["team-overview-submissions"] });
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'phase_reviews' }, () => {
        queryClient.invalidateQueries({ queryKey: ["team-overview-phase-reviews"] });
      })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [queryClient]);

  // Fetch all developers with their calendars
  const { data: developers } = useQuery({
    queryKey: ["team-overview-developers"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("developers")
        .select("id, name, user_id, is_active, availability_calendars(working_days, start_time, end_time, saturday_start_time, saturday_end_time, timezone)")
        .eq("is_active", true)
        .order("name");
      if (error) throw error;
      return data || [];
    },
    refetchInterval: 30000,
  });

  // Fetch all active website tasks
  const { data: allTasks } = useQuery({
    queryKey: ["team-overview-tasks"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("tasks")
        .select("*, teams(name), profiles!tasks_project_manager_id_fkey(full_name, email), developers!tasks_developer_id_fkey(name)")
        .eq("post_type", "Website Design")
        .eq("is_deleted", false)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data || [];
    },
    refetchInterval: 30000,
  });

  // Fetch all phases for active tasks
  const { data: allPhases } = useQuery({
    queryKey: ["team-overview-phases", allTasks?.length],
    queryFn: async () => {
      if (!allTasks?.length) return [];
      const taskIds = allTasks.map(t => t.id);
      const chunks = [];
      for (let i = 0; i < taskIds.length; i += 50) {
        chunks.push(taskIds.slice(i, i + 50));
      }
      const results = await Promise.all(
        chunks.map(chunk =>
          supabase.from("project_phases").select("*").in("task_id", chunk).order("phase_number")
        )
      );
      return results.flatMap(r => r.data || []);
    },
    enabled: !!allTasks?.length,
    refetchInterval: 30000,
  });

  // Fetch submissions for all tasks (team leader can view all)
  const { data: allSubmissions } = useQuery({
    queryKey: ["team-overview-submissions"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("design_submissions")
        .select("*")
        .order("submitted_at", { ascending: false });
      if (error) throw error;
      return data || [];
    },
    refetchInterval: 30000,
  });

  // Fetch all phase reviews for timeline
  const { data: allPhaseReviews } = useQuery({
    queryKey: ["team-overview-phase-reviews", allTasks?.length],
    queryFn: async () => {
      if (!allTasks?.length) return [];
      const taskIds = allTasks.map(t => t.id);
      const chunks = [];
      for (let i = 0; i < taskIds.length; i += 50) {
        chunks.push(taskIds.slice(i, i + 50));
      }
      const results = await Promise.all(
        chunks.map(chunk =>
          supabase.from("phase_reviews").select("*").in("task_id", chunk).order("reviewed_at")
        )
      );
      return results.flatMap(r => r.data || []);
    },
    enabled: !!allTasks?.length,
    refetchInterval: 30000,
  });

  // Fetch leave records for all developers
  const { data: allLeaves } = useQuery({
    queryKey: ["team-overview-leaves", developers?.length],
    queryFn: async () => {
      if (!developers?.length) return [];
      const devIds = developers.map(d => d.id);
      const { data } = await supabase
        .from("leave_records")
        .select("developer_id, leave_start_datetime, leave_end_datetime")
        .in("developer_id", devIds)
        .eq("status", "approved");
      return data || [];
    },
    enabled: !!developers?.length,
    refetchInterval: 30000,
  });

  // Unread counts for chat
  const taskIdsForChat = allTasks?.map(t => t.id) || [];
  const { data: unreadCounts } = useUnreadMessageCounts(taskIdsForChat);

  // Fetch reassignment history
  const { data: reassignmentHistory } = useQuery({
    queryKey: ["reassignment-history", viewDetailsTask?.id],
    queryFn: async () => {
      if (!viewDetailsTask?.id) return [];
      const { data, error } = await supabase
        .from("reassignment_history" as any)
        .select("*")
        .eq("task_id", viewDetailsTask.id)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data || [];
    },
    enabled: !!viewDetailsTask?.id,
  });

  // Build reviewer names map from PM profiles in tasks
  const reviewerNames = useMemo(() => {
    const names: Record<string, string> = {};
    allTasks?.forEach(t => {
      const pm = (t as any).profiles;
      if (pm?.full_name && t.project_manager_id) {
        names[t.project_manager_id] = pm.full_name;
      }
    });
    return names;
  }, [allTasks]);

  // Handle mark phase complete (for DevPhaseReviewTimeline)
  const handleMarkPhaseComplete = async (phaseId: string, reviewStatus: string) => {
    const updateData: any = { change_completed_at: new Date().toISOString() };
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
    const { data: latestReview } = await supabase
      .from("phase_reviews")
      .select("id")
      .eq("phase_id", phaseId)
      .is("change_completed_at", null)
      .order("round_number", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (latestReview) {
      await supabase.from("phase_reviews").update({ change_completed_at: new Date().toISOString() }).eq("id", latestReview.id);
    }
    queryClient.invalidateQueries({ queryKey: ["team-overview-tasks"] });
    queryClient.invalidateQueries({ queryKey: ["team-overview-phases"] });
    queryClient.invalidateQueries({ queryKey: ["team-overview-phase-reviews"] });
    toast({ title: "Phase changes marked as complete" });
  };

  // Active tasks (not completed/approved/cancelled)
  const activeTasks = useMemo(() =>
    allTasks?.filter(t => !["completed", "approved", "cancelled"].includes(t.status)) || [],
    [allTasks]
  );

  // Get calendar for a developer
  const getDevCalendar = (devId: string): CalendarConfig | null => {
    const dev = developers?.find(d => d.id === devId);
    if (!dev) return null;
    const cal = (dev as any).availability_calendars;
    if (!cal) return null;
    return {
      working_days: cal.working_days,
      start_time: cal.start_time,
      end_time: cal.end_time,
      saturday_start_time: cal.saturday_start_time,
      saturday_end_time: cal.saturday_end_time,
      timezone: cal.timezone,
    };
  };

  const getDevLeaves = (devId: string): LeaveRecord[] =>
    (allLeaves?.filter(l => l.developer_id === devId) || []).map(l => ({
      leave_start_datetime: l.leave_start_datetime,
      leave_end_datetime: l.leave_end_datetime,
    }));

  // Priority scoring for tasks
  const getPriority = (task: any): number => {
    const now = new Date();
    if (task.sla_deadline && new Date(task.sla_deadline) < now &&
      !["completed", "approved", "cancelled"].includes(task.status)) {
      return 1;
    }
    if (task.late_acknowledgement || (task.status === "assigned" && task.ack_deadline && new Date(task.ack_deadline) < now)) {
      return 2;
    }
    if (task.status === "in_progress" && task.sla_deadline && task.developer_id) {
      const cal = getDevCalendar(task.developer_id);
      if (cal) {
        const remaining = calculateRemainingWorkingMinutes(now, new Date(task.sla_deadline), cal, getDevLeaves(task.developer_id));
        if (remaining > 0 && remaining <= 120) return 3;
      }
    }
    if (task.status === "assigned" || task.status === "pending") return 4;
    return 5;
  };

  const getOverdueMinutes = (task: any): number => {
    if (!task.sla_deadline || !task.developer_id) return 0;
    const cal = getDevCalendar(task.developer_id);
    if (!cal) return 0;
    return calculateOverdueWorkingMinutes(new Date(), new Date(task.sla_deadline), cal, getDevLeaves(task.developer_id));
  };

  // Priority-sorted active tasks
  const sortedActiveTasks = useMemo(() => {
    const filtered = searchQuery.trim()
      ? activeTasks.filter(t => {
          const q = searchQuery.toLowerCase();
          return t.title?.toLowerCase().includes(q) ||
            t.task_number?.toString().includes(q) ||
            t.business_name?.toLowerCase().includes(q) ||
            `#${t.task_number}`.includes(q) ||
            (t as any).developers?.name?.toLowerCase().includes(q);
        })
      : activeTasks;

    return [...filtered].sort((a, b) => {
      const pa = getPriority(a);
      const pb = getPriority(b);
      if (pa !== pb) return pa - pb;
      if (pa === 1) return getOverdueMinutes(b) - getOverdueMinutes(a);
      return 0;
    });
  }, [activeTasks, searchQuery, developers, allLeaves]);

  // Summary stats
  const stats = useMemo(() => {
    const now = new Date();
    const overdueSla = activeTasks.filter(t =>
      t.sla_deadline && new Date(t.sla_deadline) < now
    ).length;
    const lateAck = activeTasks.filter(t =>
      t.late_acknowledgement || (t.status === "assigned" && t.ack_deadline && new Date(t.ack_deadline) < now)
    ).length;
    const inRevision = allTasks?.filter(t => {
      const taskPhases = allPhases?.filter(p => p.task_id === t.id) || [];
      return taskPhases.some(p =>
        (p.review_status === "approved_with_changes" || p.review_status === "disapproved_with_changes") &&
        !p.change_completed_at
      );
    }).length || 0;
    return {
      totalActive: activeTasks.length,
      overdueSla,
      lateAck,
      inRevision,
    };
  }, [activeTasks, allTasks, allPhases]);

  // Developer workload data
  const developerWorkload = useMemo(() => {
    if (!developers) return [];
    return developers.map(dev => {
      const devTasks = activeTasks.filter(t => t.developer_id === dev.id);
      const now = new Date();
      const hasOverdue = devTasks.some(t => t.sla_deadline && new Date(t.sla_deadline) < now);
      const hasLateAck = devTasks.some(t => t.late_acknowledgement ||
        (t.status === "assigned" && t.ack_deadline && new Date(t.ack_deadline) < now));
      const inProgressTask = devTasks.find(t => t.status === "in_progress");
      const currentPhaseInfo = inProgressTask
        ? `Phase ${inProgressTask.current_phase || 1}${inProgressTask.total_phases ? `/${inProgressTask.total_phases}` : ''}`
        : devTasks.some(t => t.status === "assigned") ? "Awaiting Ack" : "—";

      return {
        id: dev.id,
        name: dev.name,
        activeCount: devTasks.length,
        currentPhaseInfo,
        hasOverdue,
        hasLateAck,
        tasks: devTasks,
      };
    }).sort((a, b) => {
      if (a.hasOverdue && !b.hasOverdue) return -1;
      if (!a.hasOverdue && b.hasOverdue) return 1;
      if (a.hasLateAck && !b.hasLateAck) return -1;
      if (!a.hasLateAck && b.hasLateAck) return 1;
      return b.activeCount - a.activeCount;
    });
  }, [developers, activeTasks]);

  const getPriorityBadge = (task: any) => {
    const p = getPriority(task);
    if (p === 1) return <Badge variant="destructive" className="gap-1 text-[10px]"><AlertTriangle className="h-2.5 w-2.5" />SLA Overdue</Badge>;
    if (p === 2) return <Badge variant="destructive" className="gap-1 text-[10px]"><AlertTriangle className="h-2.5 w-2.5" />Late ACK</Badge>;
    if (p === 3) return <Badge className="gap-1 text-[10px] bg-amber-500 text-white"><Clock className="h-2.5 w-2.5" />Approaching</Badge>;
    if (p === 4) return <Badge className="gap-1 text-[10px] bg-blue-500/10 text-blue-700 dark:text-blue-400 border-blue-500"><Play className="h-2.5 w-2.5" />New</Badge>;
    return null;
  };

  const handleDownload = async (filePath: string, fileName: string) => {
    const { data, error } = await supabase.storage.from("design-files").download(filePath);
    if (error) return;
    const url = URL.createObjectURL(data);
    const a = document.createElement("a");
    a.href = url;
    a.download = fileName;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  // Acknowledge task
  const acknowledgeTask = useMutation({
    mutationFn: async (taskId: string) => {
      const task = allTasks?.find(t => t.id === taskId);
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
      queryClient.invalidateQueries({ queryKey: ["team-overview-tasks"] });
      toast({ title: "Task acknowledged", description: "Status changed to In Progress – Phase 1." });
    },
    onError: (error: any) => {
      toast({ variant: "destructive", title: "Error", description: error.message });
    },
  });

  // Direct reassignment to another developer
  const directReassignment = useMutation({
    mutationFn: async ({ taskId, newDevId, reason }: { taskId: string; newDevId: string; reason: string }) => {
      const task = allTasks?.find(t => t.id === taskId);
      const newDev = developers?.find(d => d.id === newDevId);
      if (!newDev) throw new Error("Developer not found");

      // Get the new developer's team
      const { data: teamMember } = await supabase
        .from("team_members")
        .select("team_id")
        .eq("user_id", newDev.user_id)
        .limit(1)
        .single();
      if (!teamMember) throw new Error("Developer has no team");

      // Update the task with new developer and team
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
        } as any)
        .eq("id", taskId);
      if (taskError) throw taskError;

      // Log reassignment history
      await supabase.from("reassignment_history" as any).insert({
        task_id: taskId,
        from_developer_id: task?.developer_id || null,
        to_developer_id: newDevId,
        reason,
        reassigned_by: userId,
      } as any);

      // Recalculate SLA deadline for the new developer if task is in progress
      if (task?.status === "in_progress" && task?.current_phase) {
        try {
          const slaResponse = await supabase.functions.invoke('calculate-sla-deadline', {
            body: { developer_id: newDevId, start_time: new Date().toISOString(), sla_hours: 9 },
          });
          if (slaResponse.data?.deadline) {
            await supabase.from("tasks").update({ sla_deadline: slaResponse.data.deadline } as any).eq("id", taskId);
            await supabase.from("project_phases").update({ sla_deadline: slaResponse.data.deadline, started_at: new Date().toISOString() } as any)
              .eq("task_id", taskId).eq("phase_number", task.current_phase);
          }
        } catch (e) { console.error("SLA recalculation failed:", e); }
      }

      // Notify admins
      const { data: admins } = await supabase.from("user_roles").select("user_id").eq("role", "admin");
      if (admins) {
        for (const admin of admins) {
          await supabase.from("notifications").insert({
            user_id: admin.user_id,
            type: "reassignment_requested",
            title: "Order Reassigned by Team Leader",
            message: `Order #${task?.task_number} "${task?.title}" reassigned to ${newDev.name}. Reason: ${reason}`,
            task_id: taskId,
          });
        }
      }

      // Notify PM
      if (task?.project_manager_id) {
        await supabase.from("notifications").insert({
          user_id: task.project_manager_id,
          type: "reassignment_requested",
          title: "Order Reassigned by Team Leader",
          message: `Order #${task.task_number} "${task.title}" reassigned to ${newDev.name}. Reason: ${reason}`,
          task_id: taskId,
        });
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["team-overview-tasks"] });
      queryClient.invalidateQueries({ queryKey: ["team-overview-phases"] });
      queryClient.invalidateQueries({ queryKey: ["reassignment-history"] });
      toast({ title: "Order reassigned", description: "The order has been reassigned to the selected developer." });
      setReassignTask(null);
      setReassignReason("");
      setReassignDevId("");
    },
    onError: (error: any) => {
      toast({ variant: "destructive", title: "Error", description: error.message });
    },
  });

  // Complete phase mutation
  const completePhase = useMutation({
    mutationFn: async ({ taskId, currentPhase, totalPhases, action, pagesCompleted }: { 
      taskId: string; currentPhase: number; totalPhases: number; 
      action: "next_phase" | "complete_website"; pagesCompleted?: number 
    }) => {
      const phasePoints = currentPhase === 1 ? 3 : (pagesCompleted || 3);
      const phasePages = currentPhase === 1 ? 1 : (pagesCompleted || 3);

      const { error: phaseError } = await supabase
        .from("project_phases")
        .update({ 
          status: "completed", 
          completed_at: new Date().toISOString(),
          pages_completed: phasePages,
          points: phasePoints,
        })
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

        await supabase.from("project_phases").insert({
          task_id: taskId, phase_number: nextPhase, sla_hours: 9,
          sla_deadline: slaDeadline, started_at: new Date().toISOString(), status: "in_progress",
        });

        await supabase.from("tasks").update({
          current_phase: nextPhase, sla_deadline: slaDeadline,
        }).eq("id", taskId);
      } else {
        await supabase.from("tasks").update({
          status: "completed" as any, current_phase: currentPhase,
        }).eq("id", taskId);
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["team-overview-tasks"] });
      queryClient.invalidateQueries({ queryKey: ["team-overview-phases"] });
      setPhaseCompleteTask(null);
      setCompletionAction(null);
      setFinalPhasePages(3);
      toast({ title: "Phase completed!" });
    },
    onError: (error: any) => {
      toast({ variant: "destructive", title: "Error completing phase", description: error.message });
    },
  });

  // Handle file upload for a task
  const handleFileUpload = async () => {
    if (!selectedTask || !homepageUrls.length) return;

    setUploading(true);
    try {
      const teamName = selectedTask.teams?.name?.replace(/\s+/g, "_") || "Team";
      let uploadedCount = 0;

      const taskSubmissions = allSubmissions?.filter(s => s.task_id === selectedTask.id) || [];
      const hasRevision = taskSubmissions.some(s => s.revision_status === "needs_revision");

      if (hasRevision) {
        const revisionsToUpdate = taskSubmissions.filter(s => s.revision_status === "needs_revision");
        for (const submission of revisionsToUpdate) {
          await supabase.from("design_submissions").update({ revision_status: "revised" }).eq("id", submission.id);
        }
      }

      const urlsText = homepageUrls.map((u, i) => `🔗 ${i === 0 ? 'Homepage' : `URL ${i + 1}`}: ${u}`).join('\n');
      const commentPayload = [urlsText, developerComment.trim()].filter(Boolean).join('\n') || null;

      if (files.length > 0) {
        for (const file of files) {
          const sanitizedFileName = file.name.replace(/[^a-zA-Z0-9._-]/g, "_");
          const timestamp = Date.now();
          const fileName = `${teamName}_Task_${selectedTask.task_number}_${timestamp}_${sanitizedFileName}`;
          const filePath = `${userId}/${fileName}`;

          const { error: uploadError } = await supabase.storage.from("design-files").upload(filePath, file);
          if (uploadError) throw uploadError;

          const { error: submissionError } = await supabase.from("design_submissions").insert({
            task_id: selectedTask.id, designer_id: userId,
            file_path: filePath, file_name: fileName,
            designer_comment: commentPayload,
          });
          if (submissionError) throw submissionError;
          uploadedCount++;
          toast({ title: `Uploaded ${uploadedCount} of ${files.length} files` });
        }
      } else {
        const { error: submissionError } = await supabase.from("design_submissions").insert({
          task_id: selectedTask.id, designer_id: userId,
          file_path: "no-file", file_name: "comment-only",
          designer_comment: commentPayload,
        });
        if (submissionError) throw submissionError;
      }

      // Reset SLA
      if (selectedTask.developer_id) {
        try {
          const slaResponse = await supabase.functions.invoke('calculate-sla-deadline', {
            body: { developer_id: selectedTask.developer_id, start_time: new Date().toISOString(), sla_hours: 9 },
          });
          if (slaResponse.data?.deadline) {
            const newDeadline = slaResponse.data.deadline;
            await supabase.from("project_phases").update({ sla_deadline: newDeadline, sla_hours: 9 })
              .eq("task_id", selectedTask.id).eq("phase_number", selectedTask.current_phase || 1);
            await supabase.from("tasks").update({ sla_deadline: newDeadline }).eq("id", selectedTask.id);
          }
        } catch (e) {
          console.error("SLA reset on upload failed:", e);
        }
      }

      if (!hasRevision) {
        setPhaseCompleteTask(selectedTask);
      }

      queryClient.invalidateQueries({ queryKey: ["team-overview-tasks"] });
      queryClient.invalidateQueries({ queryKey: ["team-overview-submissions"] });
      queryClient.invalidateQueries({ queryKey: ["team-overview-phases"] });
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

  return (
    <div className="space-y-6">
      {/* Summary Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Active Orders</CardTitle>
            <Globe className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats.totalActive}</div>
          </CardContent>
        </Card>
        <Card className={stats.overdueSla > 0 ? "border-destructive bg-destructive/5" : ""}>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">SLA Overdue</CardTitle>
            <AlertTriangle className="h-4 w-4 text-destructive" />
          </CardHeader>
          <CardContent>
            <div className={`text-2xl font-bold ${stats.overdueSla > 0 ? "text-destructive" : ""}`}>{stats.overdueSla}</div>
          </CardContent>
        </Card>
        <Card className={stats.lateAck > 0 ? "border-destructive bg-destructive/5" : ""}>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Late Acknowledgements</CardTitle>
            <Clock className="h-4 w-4 text-destructive" />
          </CardHeader>
          <CardContent>
            <div className={`text-2xl font-bold ${stats.lateAck > 0 ? "text-destructive" : ""}`}>{stats.lateAck}</div>
          </CardContent>
        </Card>
        <Card className={stats.inRevision > 0 ? "border-amber-500 bg-amber-500/5" : ""}>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Changes Needed</CardTitle>
            <AlertCircle className="h-4 w-4 text-amber-500" />
          </CardHeader>
          <CardContent>
            <div className={`text-2xl font-bold ${stats.inRevision > 0 ? "text-amber-600" : ""}`}>{stats.inRevision}</div>
          </CardContent>
        </Card>
      </div>

      {/* Developer Workload Table */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm font-medium flex items-center gap-2">
            <Users className="h-4 w-4" />
            Developer Workload
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Developer</TableHead>
                <TableHead className="text-center">Active Tasks</TableHead>
                <TableHead>Current Phase</TableHead>
                <TableHead>SLA Status</TableHead>
                <TableHead>Flags</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {developerWorkload.map(dev => (
                <TableRow
                  key={dev.id}
                  className={`cursor-pointer hover:bg-muted/50 ${dev.hasOverdue ? 'bg-destructive/5' : ''}`}
                  onClick={() => setExpandedDeveloper(expandedDeveloper === dev.id ? null : dev.id)}
                >
                  <TableCell className="font-medium">{dev.name}</TableCell>
                  <TableCell className="text-center">
                    <Badge variant={dev.activeCount > 0 ? "default" : "secondary"}>{dev.activeCount}</Badge>
                  </TableCell>
                  <TableCell className="text-sm text-muted-foreground">{dev.currentPhaseInfo}</TableCell>
                  <TableCell>
                    {dev.hasOverdue ? (
                      <Badge variant="destructive" className="text-[10px]">Overdue</Badge>
                    ) : dev.activeCount > 0 ? (
                      <Badge className="text-[10px] bg-green-600 text-white">On Time</Badge>
                    ) : (
                      <span className="text-xs text-muted-foreground">—</span>
                    )}
                  </TableCell>
                  <TableCell>
                    {dev.hasLateAck && (
                      <Badge variant="destructive" className="text-[10px] gap-1">
                        <AlertTriangle className="h-2.5 w-2.5" />Late ACK
                      </Badge>
                    )}
                  </TableCell>
                </TableRow>
              ))}
              {developerWorkload.length === 0 && (
                <TableRow>
                  <TableCell colSpan={5} className="text-center text-muted-foreground py-8">
                    No active developers found
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* Priority-Sorted Full Order Cards */}
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="text-lg font-semibold">Priority Orders ({sortedActiveTasks.length})</h3>
          <div className="relative w-64">
            <Search className="absolute left-2.5 top-2.5 h-3.5 w-3.5 text-muted-foreground" />
            <Input
              placeholder="Search orders or developers..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-8 h-8 text-sm"
            />
          </div>
        </div>

        <Card>
          <CardHeader><CardTitle>Website Orders</CardTitle></CardHeader>
          <CardContent>
            <div className="space-y-4">
              {sortedActiveTasks.map(task => {
                const taskPhases = allPhases?.filter(p => p.task_id === task.id) || [];
                const taskSubmissions = allSubmissions?.filter(s => s.task_id === task.id) || [];
                const devName = (task as any).developers?.name || "Unassigned";
                const cal = task.developer_id ? getDevCalendar(task.developer_id) : null;
                const leaves = task.developer_id ? getDevLeaves(task.developer_id) : [];
                const isAssigned = task.status === "assigned";
                const isDelayed = task.sla_deadline && new Date(task.sla_deadline) < new Date() && !["completed", "approved", "cancelled"].includes(task.status);
                const ackOverdue = isAssigned && task.ack_deadline && (
                  new Date(task.ack_deadline) < new Date() || task.late_acknowledgement
                );
                const hasReassignmentRequest = !!(task as any).reassignment_requested_at;
                const hasChangesNeeded = taskPhases.some(p =>
                  (p.review_status === 'approved_with_changes' || p.review_status === 'disapproved_with_changes') && !p.change_completed_at
                );
                const hasRevision = taskSubmissions.some(s => s.revision_status === "needs_revision");
                const isExpanded = expandedTaskId === task.id;

                return (
                  <div
                    key={task.id}
                    className={`border rounded-lg ${isAssigned ? 'border-blue-500 border-2 bg-blue-500/5' : ''} ${ackOverdue ? 'border-destructive border-2 bg-destructive/5' : ''} ${isDelayed && !isAssigned && !ackOverdue ? 'border-destructive border-2 bg-destructive/10' : ''}`}
                  >
                    <div className="flex items-start justify-between p-4 hover:bg-muted/50 transition-colors">
                      <div className="space-y-1 flex-1">
                        <div className="flex items-center gap-3 flex-wrap">
                          <span className="font-mono text-sm text-muted-foreground">#{task.task_number}</span>
                          {getPriorityBadge(task)}
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
                          {ackOverdue && task.ack_deadline && (
                            <AckOverdueBadge ackDeadline={task.ack_deadline} calendar={cal} leaves={leaves} />
                          )}
                          {isDelayed && !isAssigned && (
                            <Badge variant="destructive" className="gap-1 animate-pulse">
                              <AlertTriangle className="h-3 w-3" />
                              DELAYED
                            </Badge>
                          )}
                          {hasChangesNeeded && (
                            <Badge variant="destructive" className="gap-1">
                              <AlertCircle className="h-3 w-3" />
                              Changes Needed
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

                        {/* SLA & Ack Timers for assigned tasks */}
                        {isAssigned && (
                          <div className="mt-2 p-2.5 bg-blue-500/5 border border-blue-200 dark:border-blue-800 rounded-md space-y-1.5">
                            {task.ack_deadline && (
                              <SlaCountdown deadline={task.ack_deadline} label="Ack Timer" calendar={cal} leaves={leaves} />
                            )}
                            {task.sla_deadline && (
                              <SlaCountdown deadline={task.sla_deadline} label="9hr SLA" calendar={cal} leaves={leaves} slaHours={9} />
                            )}
                          </div>
                        )}

                        {/* Phase Progress & SLA for in-progress tasks */}
                        {!isAssigned && task.current_phase && task.status !== "completed" && task.status !== "approved" && (
                          <div className="mt-2 p-2.5 bg-muted/30 rounded-md space-y-2">
                            {task.sla_deadline && <SlaCountdown deadline={task.sla_deadline} calendar={cal} leaves={leaves} slaHours={9} />}
                            {taskPhases.filter(p => p.change_deadline && !p.change_completed_at && (p.review_status === 'approved_with_changes' || p.review_status === 'disapproved_with_changes')).map(p => (
                              <SlaCountdown key={p.id} deadline={p.change_deadline} label={`Changes (P${p.phase_number} - ${p.change_severity})`} calendar={cal} leaves={leaves} slaHours={
                                p.change_severity === 'minor' ? 2 : p.change_severity === 'average' ? 4 : p.change_severity === 'major' ? 9 : 18
                              } />
                            ))}
                            {/* Phase Submissions Timeline */}
                            {taskPhases.length > 0 && (
                              <DevPhaseReviewTimeline
                                phases={taskPhases}
                                phaseReviews={allPhaseReviews?.filter(pr => pr.task_id === task.id) || []}
                                taskId={task.id}
                                onMarkPhaseComplete={handleMarkPhaseComplete}
                                reviewerNames={reviewerNames}
                                userId={userId}
                                canReply={true}
                              />
                            )}
                          </div>
                        )}

                        {/* Points summary for completed tasks */}
                        {(task.status === "completed" || task.status === "approved") && (
                          <div className="mt-2 p-2.5 bg-primary/5 rounded-md">
                            {(() => {
                              const completed = taskPhases.filter(p => p.status === "completed");
                              const totalPts = completed.reduce((sum, p) => sum + (p.points || 3), 0);
                              const totalPgs = completed.reduce((sum, p) => sum + (p.phase_number === 1 ? 1 : (p.pages_completed || 3)), 0);
                              return (
                                <div className="flex items-center justify-between text-xs">
                                  <span className="text-muted-foreground">{completed.length} phase{completed.length !== 1 ? 's' : ''} • {totalPgs} pages</span>
                                  <span className="font-semibold text-primary">{totalPts} points earned</span>
                                </div>
                              );
                            })()}
                          </div>
                        )}

                        <div className="text-sm text-muted-foreground">
                          Developer: <span className="font-semibold text-foreground">{devName}</span>
                          <span className="mx-2">•</span>
                          Team: <span className="font-medium">{task.teams?.name}</span>
                        </div>
                        <div className="text-sm text-muted-foreground">
                          PM: <span className="font-medium">{(task as any).profiles?.full_name || "N/A"}</span>
                          <span className="mx-2">•</span>
                          Created: <span className="font-medium">{format(new Date(task.created_at), 'MMM d, yyyy h:mm a')}</span>
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
                      </div>
                      <div className="flex flex-col items-end gap-2 ml-4">
                        <Badge className={
                          task.status === "assigned" ? "bg-blue-500/10 text-blue-700 dark:text-blue-400" :
                          task.status === "in_progress" ? "bg-warning text-warning-foreground" :
                          task.status === "completed" ? "bg-primary text-primary-foreground" :
                          task.status === "approved" ? "bg-green-600 text-white" :
                          "bg-muted text-muted-foreground"
                        }>
                          {task.status === "assigned" ? "Awaiting Acknowledgement" :
                           task.status === "in_progress" ? `Phase ${task.current_phase || 1} in Progress` :
                           task.status === "completed" ? "Website Complete" :
                           task.status?.replace("_", " ")}
                        </Badge>
                        {taskSubmissions.length > 0 && (
                          <Button size="sm" variant="ghost" onClick={() => setExpandedTaskId(isExpanded ? null : task.id)}>
                            {isExpanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                          </Button>
                        )}

                        {/* Acknowledge button for assigned tasks */}
                        {isAssigned && !hasReassignmentRequest && (
                          <Button
                            size="sm"
                            className="bg-blue-600 hover:bg-blue-700 text-white"
                            onClick={() => acknowledgeTask.mutate(task.id)}
                            disabled={acknowledgeTask.isPending}
                          >
                            <CheckCircle2 className="mr-2 h-4 w-4" />
                            Acknowledge
                          </Button>
                        )}

                        {/* Upload Phase button for in-progress tasks */}
                        {task.status === "in_progress" && (
                          <Button size="sm" onClick={() => setSelectedTask(task)}>
                            <Upload className="mr-2 h-4 w-4" />
                            Upload Phase {task.current_phase || 1}
                          </Button>
                        )}

                        {/* Mark Changes Complete button removed - now inline in review timeline cards */}

                        {/* Upload Revision button */}
                        {hasRevision && (
                          <Button size="sm" variant="default" className="bg-destructive hover:bg-destructive/90" onClick={() => setSelectedTask(task)}>
                            <Upload className="mr-2 h-4 w-4" />
                            Upload Revision
                          </Button>
                        )}

                        {/* Reassign Order button */}
                        {!["completed", "approved", "cancelled"].includes(task.status) && (
                          <Button
                            size="sm"
                            variant="outline"
                            className="border-orange-500 text-orange-600 hover:bg-orange-50"
                            onClick={() => setReassignTask(task)}
                          >
                            <RotateCcw className="mr-2 h-4 w-4" />
                            Reassign
                          </Button>
                        )}
                      </div>
                    </div>

                    {/* Expanded submissions */}
                    {isExpanded && taskSubmissions.length > 0 && (
                      <div className="border-t bg-muted/20 p-4">
                        <h4 className="text-sm font-semibold mb-3">Uploaded Files:</h4>
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
                                    <span className="font-medium text-primary">Comment:</span>
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
              {sortedActiveTasks.length === 0 && (
                <p className="text-center text-muted-foreground py-8">
                  {searchQuery ? "No matching orders found" : "No active orders"}
                </p>
              )}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Upload Dialog */}
      <Dialog open={!!selectedTask} onOpenChange={() => { setSelectedTask(null); setFiles([]); setFilePreviews({}); setDeveloperComment(""); setHomepageUrls([]); setUrlInput(""); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Submit Work — Phase {selectedTask?.current_phase || 1}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <p className="text-sm text-muted-foreground mb-2">Task: {selectedTask?.title}</p>
              {selectedTask?.current_phase && (
                <div className="mb-3">
                  <PhaseProgress currentPhase={selectedTask.current_phase} totalPhases={selectedTask.total_phases} phases={allPhases?.filter(p => p.task_id === selectedTask?.id)} />
                </div>
              )}
              <p className="text-xs text-muted-foreground">
                Enter the website URL you are working on. You can also add comments or upload files if needed.
              </p>
            </div>
            <div className="space-y-2">
              <Label htmlFor="team-homepage-url" className="flex items-center gap-1.5">
                <Link className="h-3.5 w-3.5" />
                Website URLs <span className="text-destructive">*</span>
                <span className="text-xs text-muted-foreground font-normal ml-1">(at least one required)</span>
              </Label>
              <div className="flex gap-2">
                <Input
                  id="team-homepage-url"
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
              <Label htmlFor="team-developer-comment">Comment (optional)</Label>
              <Textarea id="team-developer-comment" placeholder="Add any notes about your submission..." value={developerComment} onChange={(e) => setDeveloperComment(e.target.value)} rows={3} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="team-file">Files (optional)</Label>
              <Input
                id="team-file" type="file" multiple
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
              const isBlocked = allPhases?.some(p => 
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
                        A previous phase has been disapproved. You must complete the requested changes before advancing.
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

      {/* View Details Dialog */}
      <Dialog open={!!viewDetailsTask} onOpenChange={() => setViewDetailsTask(null)}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Order Details — #{viewDetailsTask?.task_number}</DialogTitle>
          </DialogHeader>
          <ScrollArea className="max-h-[70vh] pr-4">
            <div className="space-y-4">
              {/* Phase Progress in Details */}
              {viewDetailsTask?.current_phase && (
                <div className="p-4 bg-muted/30 rounded-lg space-y-3">
                  <h3 className="font-semibold text-lg">Project Progress</h3>
                  <PhaseProgress currentPhase={viewDetailsTask.current_phase} totalPhases={viewDetailsTask.total_phases} phases={allPhases?.filter(p => p.task_id === viewDetailsTask?.id)} />
                  {viewDetailsTask.sla_deadline && viewDetailsTask.status !== "completed" && viewDetailsTask.status !== "approved" && (() => {
                    const cal = viewDetailsTask.developer_id ? getDevCalendar(viewDetailsTask.developer_id) : null;
                    const leaves = viewDetailsTask.developer_id ? getDevLeaves(viewDetailsTask.developer_id) : [];
                    return <SlaCountdown deadline={viewDetailsTask.sla_deadline} label="9hr SLA" calendar={cal} leaves={leaves} slaHours={9} />;
                  })()}
                </div>
              )}

              {/* Phase Submissions Timeline in Details */}
              {viewDetailsTask && (() => {
                const detailPhases = allPhases?.filter(p => p.task_id === viewDetailsTask.id) || [];
                const detailReviews = allPhaseReviews?.filter(pr => pr.task_id === viewDetailsTask.id) || [];
                if (detailPhases.length > 0) {
                  return (
                    <div className="p-4 bg-muted/30 rounded-lg">
                      <h3 className="font-semibold text-lg mb-3">Phase Submissions</h3>
                      <DevPhaseReviewTimeline phases={detailPhases} phaseReviews={detailReviews} taskId={viewDetailsTask.id} onMarkPhaseComplete={handleMarkPhaseComplete} reviewerNames={reviewerNames} userId={userId} canReply={true} />
                    </div>
                  );
                }
                return null;
              })()}

              <div className="grid grid-cols-2 gap-3 text-sm">
                <div><Label className="text-muted-foreground">Title</Label><p className="font-medium">{viewDetailsTask?.title}</p></div>
                <div><Label className="text-muted-foreground">Developer</Label><p className="font-medium">{(viewDetailsTask as any)?.developers?.name || "Unassigned"}</p></div>
                <div><Label className="text-muted-foreground">Team</Label><p className="font-medium">{viewDetailsTask?.teams?.name}</p></div>
                <div><Label className="text-muted-foreground">PM</Label><p className="font-medium">{(viewDetailsTask as any)?.profiles?.full_name || "N/A"}</p></div>
                <div><Label className="text-muted-foreground">Status</Label><p className="font-medium capitalize">{viewDetailsTask?.status?.replace("_", " ")}</p></div>
                <div><Label className="text-muted-foreground">Phase</Label><p className="font-medium">{viewDetailsTask?.current_phase || 1}{viewDetailsTask?.total_phases ? ` of ${viewDetailsTask.total_phases}` : ''}</p></div>
                <div><Label className="text-muted-foreground">Business Name</Label><p className="font-medium">{viewDetailsTask?.business_name || "N/A"}</p></div>
                <div><Label className="text-muted-foreground">Created</Label><p className="font-medium">{viewDetailsTask?.created_at ? format(new Date(viewDetailsTask.created_at), 'MMM d, yyyy') : "N/A"}</p></div>
              </div>
              {viewDetailsTask?.description && (
                <div><Label className="text-muted-foreground">Description</Label><p className="text-sm mt-1">{viewDetailsTask.description}</p></div>
              )}
              {viewDetailsTask?.business_email && (
                <div><Label className="text-muted-foreground">Business Email</Label><p className="text-sm font-medium">{viewDetailsTask.business_email}</p></div>
              )}
              {viewDetailsTask?.business_phone && (
                <div><Label className="text-muted-foreground">Business Phone</Label><p className="text-sm font-medium">{viewDetailsTask.business_phone}</p></div>
              )}
              {viewDetailsTask?.design_references && (
                <div><Label className="text-muted-foreground">Design References</Label><p className="text-sm mt-1 whitespace-pre-wrap">{viewDetailsTask.design_references}</p></div>
              )}
              {viewDetailsTask?.notes_extra_instructions && (
                <div><Label className="text-muted-foreground">Additional Notes</Label><p className="text-sm mt-1 whitespace-pre-wrap">{viewDetailsTask.notes_extra_instructions}</p></div>
              )}
              {viewDetailsTask?.sla_deadline && (
                <div className="p-3 bg-muted/30 rounded-md">
                  <Label className="text-muted-foreground text-xs">SLA Deadline</Label>
                  <p className="text-sm font-medium">{format(new Date(viewDetailsTask.sla_deadline), 'MMM d, yyyy h:mm a')}</p>
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
                    {reassignmentHistory.map((entry: any) => {
                      const fromDev = developers?.find(d => d.id === entry.from_developer_id);
                      const toDev = developers?.find(d => d.id === entry.to_developer_id);
                      return (
                        <div key={entry.id} className="p-3 bg-background rounded-md border text-sm space-y-1">
                          <div className="flex items-center justify-between">
                            <div className="flex items-center gap-1.5">
                              <span className="text-muted-foreground">{fromDev?.name || "Unassigned"}</span>
                              <span className="text-muted-foreground">→</span>
                              <span className="font-medium text-foreground">{toDev?.name || "Unknown"}</span>
                            </div>
                            <span className="text-xs text-muted-foreground">
                              {format(new Date(entry.created_at), 'MMM d, yyyy h:mm a')}
                            </span>
                          </div>
                          <p className="text-xs text-muted-foreground">
                            <span className="font-medium">Reason:</span> {entry.reason}
                          </p>
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

      {/* Reassign Order Dialog */}
      <Dialog open={!!reassignTask} onOpenChange={(open) => { if (!open) { setReassignTask(null); setReassignReason(""); setReassignDevId(""); } }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Reassign Order</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">
              Reassign <span className="font-semibold text-foreground">#{reassignTask?.task_number} — {reassignTask?.title}</span> to a different developer.
            </p>
            <div>
              <Label>Assign to developer *</Label>
              <select
                className="w-full mt-1.5 rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus:outline-none focus:ring-2 focus:ring-ring"
                value={reassignDevId}
                onChange={(e) => setReassignDevId(e.target.value)}
              >
                <option value="">Select a developer...</option>
                {developers?.filter(d => d.id !== reassignTask?.developer_id).map(d => (
                  <option key={d.id} value={d.id}>{d.name}</option>
                ))}
              </select>
            </div>
            <div>
              <Label>Reason for reassignment *</Label>
              <Textarea
                placeholder="Explain why this order is being reassigned..."
                value={reassignReason}
                onChange={(e) => setReassignReason(e.target.value)}
                rows={3}
              />
            </div>
            <div className="flex gap-2 justify-end">
              <Button variant="ghost" onClick={() => { setReassignTask(null); setReassignReason(""); setReassignDevId(""); }}>
                Cancel
              </Button>
              <Button
                className="bg-primary hover:bg-primary/90 text-primary-foreground"
                disabled={!reassignReason.trim() || !reassignDevId || directReassignment.isPending}
                onClick={() => directReassignment.mutate({ taskId: reassignTask.id, newDevId: reassignDevId, reason: reassignReason.trim() })}
              >
                <RotateCcw className="mr-2 h-4 w-4" />
                {directReassignment.isPending ? "Reassigning..." : "Reassign Order"}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default TeamOverviewDashboard;
