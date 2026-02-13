import { useState, useEffect, useMemo } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Label } from "@/components/ui/label";
import { FilePreview } from "@/components/FilePreview";
import { OrderChat, useUnreadMessageCounts } from "@/components/OrderChat";
import {
  AlertTriangle, Clock, CheckCircle2, Play, Timer, Globe, Users,
  FileText, Search, MessageCircle, Download, AlertCircle, RotateCcw,
  ChevronDown, ChevronUp
} from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { format } from "date-fns";
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
  const [searchQuery, setSearchQuery] = useState("");
  const [viewDetailsTask, setViewDetailsTask] = useState<any>(null);
  const [chatTask, setChatTask] = useState<any>(null);
  const [expandedDeveloper, setExpandedDeveloper] = useState<string | null>(null);

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
  });

  // Fetch all phases for active tasks
  const { data: allPhases } = useQuery({
    queryKey: ["team-overview-phases", allTasks?.length],
    queryFn: async () => {
      if (!allTasks?.length) return [];
      const taskIds = allTasks.map(t => t.id);
      // Batch in chunks of 50
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
  });

  // Unread counts for chat
  const taskIdsForChat = allTasks?.map(t => t.id) || [];
  const { data: unreadCounts } = useUnreadMessageCounts(taskIdsForChat);

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

    // Priority 1: SLA overdue
    if (task.sla_deadline && new Date(task.sla_deadline) < now &&
      !["completed", "approved", "cancelled"].includes(task.status)) {
      return 1;
    }

    // Priority 2: Late acknowledgement
    if (task.late_acknowledgement || (task.status === "assigned" && task.ack_deadline && new Date(task.ack_deadline) < now)) {
      return 2;
    }

    // Priority 3: In-progress approaching deadline (within 2 hours working time)
    if (task.status === "in_progress" && task.sla_deadline && task.developer_id) {
      const cal = getDevCalendar(task.developer_id);
      if (cal) {
        const remaining = calculateRemainingWorkingMinutes(now, new Date(task.sla_deadline), cal, getDevLeaves(task.developer_id));
        if (remaining > 0 && remaining <= 120) return 3;
      }
    }

    // Priority 4: Pending/assigned (not yet acknowledged)
    if (task.status === "assigned" || task.status === "pending") return 4;

    // Priority 5: All other active
    return 5;
  };

  // Overdue amount for sorting within priority 1
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
      // Within same priority, sort by most overdue first
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
      // Tasks with phases that have changes needed
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

      // Current phase info
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
      // Sort: overdue first, then late ack, then by active count desc
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
                            <PhaseProgress currentPhase={task.current_phase} totalPhases={task.total_phases} phases={taskPhases} />
                            {task.sla_deadline && <SlaCountdown deadline={task.sla_deadline} calendar={cal} leaves={leaves} slaHours={9} />}
                            {/* Change timers */}
                            {taskPhases.filter(p => p.change_deadline && !p.change_completed_at && (p.review_status === 'approved_with_changes' || p.review_status === 'disapproved_with_changes')).map(p => (
                              <SlaCountdown key={p.id} deadline={p.change_deadline} label={`Changes (P${p.phase_number} - ${p.change_severity})`} calendar={cal} leaves={leaves} slaHours={
                                p.change_severity === 'minor' ? 2 : p.change_severity === 'average' ? 4 : p.change_severity === 'major' ? 9 : 18
                              } />
                            ))}
                            {/* Review comments */}
                            {taskPhases.filter(p => p.review_comment && (p.review_status === 'approved_with_changes' || p.review_status === 'disapproved_with_changes') && !p.change_completed_at).map(p => (
                              <div key={`comment-${p.id}`} className={`p-2 rounded text-xs ${p.review_status === 'disapproved_with_changes' ? 'bg-destructive/10 border border-destructive/20' : 'bg-amber-500/10 border border-amber-500/20'}`}>
                                <span className="font-medium">PM Comment (P{p.phase_number}):</span> {p.review_comment}
                              </div>
                            ))}
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
                      </div>
                    </div>
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

      {/* View Details Dialog */}
      <Dialog open={!!viewDetailsTask} onOpenChange={() => setViewDetailsTask(null)}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Order Details — #{viewDetailsTask?.task_number}</DialogTitle>
          </DialogHeader>
          <ScrollArea className="max-h-[70vh] pr-4">
            <div className="space-y-4">
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
              {viewDetailsTask?.sla_deadline && (
                <div className="p-3 bg-muted/30 rounded-md">
                  <Label className="text-muted-foreground text-xs">SLA Deadline</Label>
                  <p className="text-sm font-medium">{format(new Date(viewDetailsTask.sla_deadline), 'MMM d, yyyy h:mm a')}</p>
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

export default TeamOverviewDashboard;
