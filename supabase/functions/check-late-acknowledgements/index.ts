import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

// --- Working-hours calculation utilities ---
interface CalendarConfig {
  working_days: number[];
  start_time: string;
  end_time: string;
  saturday_start_time?: string | null;
  saturday_end_time?: string | null;
  timezone: string;
}

interface LeaveRecord {
  leave_start_datetime: string;
  leave_end_datetime: string;
}

function timeToMinutes(time: string): number {
  const [h, m] = time.split(":").map(Number);
  return h * 60 + m;
}

function getISODay(date: Date): number {
  const d = date.getDay();
  return d === 0 ? 7 : d;
}

function toTimezoneDate(utcDate: Date, tz: string): Date {
  const fmt = new Intl.DateTimeFormat("en-US", {
    timeZone: tz, year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false,
  });
  const parts = fmt.formatToParts(utcDate);
  const get = (type: string) => parts.find((p) => p.type === type)?.value || "0";
  return new Date(`${get("year")}-${get("month")}-${get("day")}T${get("hour")}:${get("minute")}:${get("second")}`);
}

function isOvernightShift(startMin: number, endMin: number): boolean {
  return endMin <= startMin;
}

function isWithinShift(minuteOfDay: number, shiftStart: number, shiftEnd: number): boolean {
  if (isOvernightShift(shiftStart, shiftEnd)) {
    return minuteOfDay >= shiftStart || minuteOfDay < shiftEnd;
  }
  return minuteOfDay >= shiftStart && minuteOfDay < shiftEnd;
}

function minutesUntilShiftEnd(currentMinute: number, shiftStart: number, shiftEnd: number): number {
  if (!isWithinShift(currentMinute, shiftStart, shiftEnd)) return 0;
  if (isOvernightShift(shiftStart, shiftEnd)) {
    if (currentMinute >= shiftStart) {
      return (24 * 60 - currentMinute) + shiftEnd;
    }
    return shiftEnd - currentMinute;
  }
  return shiftEnd - currentMinute;
}

function calculateRemainingWorkingMinutes(
  nowUTC: Date, deadlineUTC: Date, calendar: CalendarConfig, leaves: LeaveRecord[]
): number {
  if (deadlineUTC <= nowUTC) return 0;

  const { working_days, start_time, end_time, saturday_start_time, saturday_end_time, timezone } = calendar;
  const workStartMin = timeToMinutes(start_time);
  const workEndMin = timeToMinutes(end_time);
  const satStartMin = saturday_start_time ? timeToMinutes(saturday_start_time) : workStartMin;
  const satEndMin = saturday_end_time ? timeToMinutes(saturday_end_time) : workEndMin;

  let currentLocal = toTimezoneDate(nowUTC, timezone);
  const deadlineLocal = toTimezoneDate(deadlineUTC, timezone);
  let totalWorkingMinutes = 0;
  let iterations = 0;

  while (currentLocal < deadlineLocal && iterations < 730) {
    iterations++;
    const dayOfWeek = getISODay(currentLocal);

    if (!working_days.includes(dayOfWeek)) {
      currentLocal.setDate(currentLocal.getDate() + 1);
      const nextDay = getISODay(currentLocal);
      const nextStart = nextDay === 6 ? satStartMin : workStartMin;
      currentLocal.setHours(Math.floor(nextStart / 60), nextStart % 60, 0, 0);
      continue;
    }

    const isSaturday = dayOfWeek === 6;
    const todayStart = isSaturday ? satStartMin : workStartMin;
    const todayEnd = isSaturday ? satEndMin : workEndMin;
    const overnight = isOvernightShift(todayStart, todayEnd);
    const currentMinute = currentLocal.getHours() * 60 + currentLocal.getMinutes();

    if (!isWithinShift(currentMinute, todayStart, todayEnd)) {
      if (overnight && currentMinute < todayStart && currentMinute >= todayEnd) {
        currentLocal.setHours(Math.floor(todayStart / 60), todayStart % 60, 0, 0);
      } else if (!overnight && currentMinute < todayStart) {
        currentLocal.setHours(Math.floor(todayStart / 60), todayStart % 60, 0, 0);
      } else {
        currentLocal.setDate(currentLocal.getDate() + 1);
        const nextDay = getISODay(currentLocal);
        const nextStart = nextDay === 6 ? satStartMin : workStartMin;
        currentLocal.setHours(Math.floor(nextStart / 60), nextStart % 60, 0, 0);
        continue;
      }
    }

    const availableMinutes = minutesUntilShiftEnd(
      currentLocal.getHours() * 60 + currentLocal.getMinutes(), todayStart, todayEnd
    );

    let windowEnd: Date;
    if (overnight && (currentLocal.getHours() * 60 + currentLocal.getMinutes()) >= todayStart) {
      windowEnd = new Date(currentLocal);
      windowEnd.setDate(windowEnd.getDate() + 1);
      windowEnd.setHours(Math.floor(todayEnd / 60), todayEnd % 60, 0, 0);
    } else {
      windowEnd = new Date(currentLocal);
      windowEnd.setHours(Math.floor(todayEnd / 60), todayEnd % 60, 0, 0);
    }

    const effectiveEnd = deadlineLocal < windowEnd ? deadlineLocal : windowEnd;
    const cappedMinutes = Math.max(0, Math.floor((effectiveEnd.getTime() - currentLocal.getTime()) / (1000 * 60)));
    const minutesToCount = Math.min(availableMinutes, cappedMinutes);

    const windowStart = new Date(currentLocal);
    let leaveOverlap = 0;
    for (const leave of leaves) {
      const ls = toTimezoneDate(new Date(leave.leave_start_datetime), timezone);
      const le = toTimezoneDate(new Date(leave.leave_end_datetime), timezone);
      const os = new Date(Math.max(windowStart.getTime(), ls.getTime()));
      const oe = new Date(Math.min(effectiveEnd.getTime(), le.getTime()));
      if (os < oe) leaveOverlap += (oe.getTime() - os.getTime()) / (1000 * 60);
    }

    totalWorkingMinutes += Math.max(0, minutesToCount - leaveOverlap);

    if (deadlineLocal <= windowEnd) break;

    // Continue from the next calendar day shift start
    currentLocal.setDate(currentLocal.getDate() + 1);
    const nextDay = getISODay(currentLocal);
    const nextStart = nextDay === 6 ? satStartMin : workStartMin;
    currentLocal.setHours(Math.floor(nextStart / 60), nextStart % 60, 0, 0);
  }

  return totalWorkingMinutes;
}

// --- Main handler ---
serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseAdmin = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""
    );

    console.log("Checking for late acknowledgements...");

    const now = new Date();
    const nowISO = now.toISOString();

    // Find tasks that are:
    // - status = 'assigned' (not yet acknowledged)
    // - late_acknowledgement = false (not yet flagged)
    // - have an ack_deadline set
    const { data: assignedTasks, error: tasksError } = await supabaseAdmin
      .from("tasks")
      .select("id, title, task_number, project_manager_id, team_id, ack_deadline, developer_id")
      .eq("status", "assigned")
      .eq("late_acknowledgement", false)
      .not("ack_deadline", "is", null);

    if (tasksError) throw tasksError;

    if (!assignedTasks || assignedTasks.length === 0) {
      console.log("No assigned tasks to check");
      return new Response(
        JSON.stringify({ success: true, message: "No assigned tasks to check", count: 0 }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 200 }
      );
    }

    console.log(`Found ${assignedTasks.length} assigned tasks to evaluate`);

    // Get all admin and development_team_leader user IDs
    const { data: admins } = await supabaseAdmin
      .from("user_roles")
      .select("user_id")
      .in("role", ["admin", "development_team_leader"]);

    const adminIds = admins?.map(a => a.user_id) || [];

    let notifiedCount = 0;

    for (const task of assignedTasks) {
      const ackDeadline = new Date(task.ack_deadline);
      let isLate = false;

      // Check 1: Wall-clock deadline passed
      if (ackDeadline < now) {
        isLate = true;
        console.log(`Task #${task.task_number}: wall-clock deadline passed`);
      }

      // Check 2: Working minutes exhausted (even if wall-clock deadline is in the future)
      if (!isLate && task.developer_id) {
        try {
          // Fetch the developer's calendar
          const { data: dev } = await supabaseAdmin
            .from("developers")
            .select("id, availability_calendars(working_days, start_time, end_time, saturday_start_time, saturday_end_time, timezone)")
            .eq("id", task.developer_id)
            .single();

          if (dev) {
            const cal = (dev as any).availability_calendars;
            if (cal) {
              const calendar: CalendarConfig = {
                working_days: cal.working_days,
                start_time: cal.start_time,
                end_time: cal.end_time,
                saturday_start_time: cal.saturday_start_time,
                saturday_end_time: cal.saturday_end_time,
                timezone: cal.timezone,
              };

              // Fetch approved leaves
              const { data: leaves } = await supabaseAdmin
                .from("leave_records")
                .select("leave_start_datetime, leave_end_datetime")
                .eq("developer_id", dev.id)
                .eq("status", "approved");

              const remainingMinutes = calculateRemainingWorkingMinutes(
                now, ackDeadline, calendar, (leaves || []) as LeaveRecord[]
              );

              if (remainingMinutes <= 0) {
                isLate = true;
                console.log(`Task #${task.task_number}: working minutes exhausted (0 remaining)`);
              }
            }
          }
        } catch (e) {
          console.error(`Error checking working minutes for task #${task.task_number}:`, e);
        }
      }

      if (!isLate) continue;

      // Flag the task as late acknowledgement
      await supabaseAdmin
        .from("tasks")
        .update({ late_acknowledgement: true })
        .eq("id", task.id);

      // Notify all admins (Development Head)
      for (const adminId of adminIds) {
        await supabaseAdmin.from("notifications").insert({
          user_id: adminId,
          type: "late_acknowledgement",
          title: "Late Acknowledgement Alert",
          message: `Task #${task.task_number} "${task.title}" was not acknowledged within 30 working minutes.`,
          task_id: task.id,
        });
      }

      // Notify the Project Manager
      if (task.project_manager_id && !adminIds.includes(task.project_manager_id)) {
        await supabaseAdmin.from("notifications").insert({
          user_id: task.project_manager_id,
          type: "late_acknowledgement",
          title: "Late Acknowledgement Alert",
          message: `Task #${task.task_number} "${task.title}" was not acknowledged within 30 working minutes.`,
          task_id: task.id,
        });
      }

      notifiedCount++;
      console.log(`Flagged and notified for task #${task.task_number}`);
    }

    return new Response(
      JSON.stringify({ success: true, message: `Flagged ${notifiedCount} late acknowledgements`, count: notifiedCount }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 200 }
    );
  } catch (error: unknown) {
    console.error("Error checking late acknowledgements:", error instanceof Error ? error.message : error);
    return new Response(
      JSON.stringify({ error: "Operation failed" }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 400 }
    );
  }
});
