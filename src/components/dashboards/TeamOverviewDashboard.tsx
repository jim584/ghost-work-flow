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

// Compact SLA indicator for the order list
const SlaStatusIndicator = ({ deadline, calendar, leaves, slaHours }: {
  deadline: string; calendar?: CalendarConfig | null; leaves?: LeaveRecord[]; slaHours?: number;
}) => {
  const [now, setNow] = useState(new Date());
  useEffect(() => {
    const interval = setInterval(() => setNow(new Date()), 30000); // update every 30s
    return () => clearInterval(interval);
  }, []);

  const deadlineDate = new Date(deadline);
  const diffMs = deadlineDate.getTime() - now.getTime();

  if (calendar) {
    if (diffMs <= 0) {
      const overdueMin = calculateOverdueWorkingMinutes(now, deadlineDate, calendar, leaves || []);
      const totalMin = overdueMin + (slaHours || 0) * 60;
      const h = Math.floor(totalMin / 60);
      const m = Math.floor(totalMin % 60);
      return (
        <span className="text-xs font-mono text-destructive font-semibold">
          ⚠ {h}h {m}m overdue
        </span>
      );
    }
    const remaining = calculateRemainingWorkingMinutes(now, deadlineDate, calendar, leaves || []);
    const h = Math.floor(remaining / 60);
    const m = Math.floor(remaining % 60);
    const isUrgent = remaining < 120;
    return (
      <span className={`text-xs font-mono ${isUrgent ? 'text-destructive' : 'text-muted-foreground'}`}>
        {h}h {m}m left
      </span>
    );
  }

  // Fallback
  if (diffMs <= 0) return <span className="text-xs font-mono text-destructive">Overdue</span>;
  const totalMinutes = Math.floor(diffMs / 60000);
  const h = Math.floor(totalMinutes / 60);
  const m = totalMinutes % 60;
  return <span className="text-xs font-mono text-muted-foreground">{h}h {m}m left</span>;
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

      {/* Priority-Sorted Order List */}
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <CardTitle className="text-sm font-medium">Priority Orders ({sortedActiveTasks.length})</CardTitle>
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
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
            {sortedActiveTasks.map(task => {
              const taskPhases = allPhases?.filter(p => p.task_id === task.id) || [];
              const devName = (task as any).developers?.name || "Unassigned";
              const cal = task.developer_id ? getDevCalendar(task.developer_id) : null;
              const leaves = task.developer_id ? getDevLeaves(task.developer_id) : [];

              return (
                <div
                  key={task.id}
                  className={`border rounded-lg p-3 transition-colors hover:bg-muted/30 ${
                    getPriority(task) === 1 ? 'border-destructive bg-destructive/5' :
                    getPriority(task) === 2 ? 'border-destructive/50 bg-destructive/5' :
                    getPriority(task) === 3 ? 'border-amber-500 bg-amber-500/5' :
                    getPriority(task) === 4 ? 'border-blue-500 bg-blue-500/5' : ''
                  }`}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex-1 min-w-0 space-y-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-mono text-xs text-muted-foreground">#{task.task_number}</span>
                        {getPriorityBadge(task)}
                        <h4 className="font-medium text-sm truncate">{task.title}</h4>
                      </div>
                      <div className="flex items-center gap-3 text-xs text-muted-foreground">
                        <span className="font-medium text-foreground">{devName}</span>
                        <span>•</span>
                        <span>{task.teams?.name}</span>
                        <span>•</span>
                        <span>Phase {task.current_phase || 1}{task.total_phases ? `/${task.total_phases}` : ''}</span>
                        {task.status === "assigned" && <Badge className="text-[10px] bg-blue-500/10 text-blue-700">Awaiting ACK</Badge>}
                        {task.status === "in_progress" && <Badge className="text-[10px]" variant="secondary">In Progress</Badge>}
                      </div>
                      {/* SLA Timer */}
                      {task.sla_deadline && (
                        <SlaStatusIndicator
                          deadline={task.sla_deadline}
                          calendar={cal}
                          leaves={leaves}
                          slaHours={9}
                        />
                      )}
                      {/* Phase review info */}
                      {taskPhases.filter(p => p.review_status && !p.change_completed_at &&
                        (p.review_status === 'approved_with_changes' || p.review_status === 'disapproved_with_changes')
                      ).map(p => (
                        <Badge
                          key={p.id}
                          variant={p.review_status === 'disapproved_with_changes' ? 'destructive' : 'secondary'}
                          className="text-[10px]"
                        >
                          P{p.phase_number}: {p.review_status === 'disapproved_with_changes' ? 'Changes Required' : 'Changes Needed'}
                        </Badge>
                      ))}
                    </div>
                    <div className="flex items-center gap-1.5">
                      <Button size="sm" variant="ghost" className="h-7 px-2" onClick={() => setViewDetailsTask(task)}>
                        <FileText className="h-3 w-3" />
                      </Button>
                      <Button size="sm" variant="ghost" className="h-7 px-2 relative" onClick={() => setChatTask(task)}>
                        <MessageCircle className="h-3 w-3" />
                        {(unreadCounts?.get(task.id) || 0) > 0 && (
                          <span className="absolute -top-1 -right-1 bg-destructive text-destructive-foreground text-[9px] rounded-full h-3.5 min-w-[14px] flex items-center justify-center px-0.5">
                            {unreadCounts!.get(task.id)}
                          </span>
                        )}
                      </Button>
                    </div>
                  </div>
                </div>
              );
            })}
            {sortedActiveTasks.length === 0 && (
              <div className="text-center text-muted-foreground py-8">
                {searchQuery ? "No matching orders found" : "No active orders"}
              </div>
            )}
          </div>
        </CardContent>
      </Card>

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
