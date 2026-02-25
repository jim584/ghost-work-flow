import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

interface CalendarConfig {
  working_days: number[];
  start_time: string; // "HH:MM"
  end_time: string;   // "HH:MM"
  saturday_start_time?: string;
  saturday_end_time?: string;
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

function toTimezoneDate(utcDate: Date, _timezone: string): Date {
  const fmt = new Intl.DateTimeFormat("en-US", {
    timeZone: _timezone,
    year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false,
  });
  const parts = fmt.formatToParts(utcDate);
  const get = (type: string) => parts.find((p) => p.type === type)?.value || "0";
  return new Date(
    `${get("year")}-${get("month")}-${get("day")}T${get("hour")}:${get("minute")}:${get("second")}`
  );
}

function fromTimezoneToUTC(localDate: Date, timezone: string): Date {
  const refUTC = new Date(localDate.toISOString().replace("Z", "") + "Z");
  const refLocal = toTimezoneDate(refUTC, timezone);
  const offsetMs = refLocal.getTime() - refUTC.getTime();
  return new Date(localDate.getTime() - offsetMs);
}

/**
 * Check if a shift is overnight (crosses midnight).
 */
function isOvernightShift(startMin: number, endMin: number): boolean {
  return endMin <= startMin;
}

/**
 * Get the total working minutes in a shift.
 */
function getShiftDuration(startMin: number, endMin: number): number {
  if (isOvernightShift(startMin, endMin)) {
    return (24 * 60 - startMin) + endMin;
  }
  return endMin - startMin;
}

/**
 * Check if a given minute-of-day is within a shift.
 * For overnight shifts (e.g., 16:00-01:00), the range wraps around midnight.
 */
function isWithinShift(minuteOfDay: number, shiftStart: number, shiftEnd: number): boolean {
  if (isOvernightShift(shiftStart, shiftEnd)) {
    // e.g., 960 to 60: working if >= 960 OR < 60
    return minuteOfDay >= shiftStart || minuteOfDay < shiftEnd;
  }
  return minuteOfDay >= shiftStart && minuteOfDay < shiftEnd;
}

/**
 * Get available working minutes from a given minute-of-day until shift end.
 * For overnight shifts, accounts for wrapping around midnight.
 */
function minutesUntilShiftEnd(currentMinute: number, shiftStart: number, shiftEnd: number): number {
  if (!isWithinShift(currentMinute, shiftStart, shiftEnd)) return 0;
  if (isOvernightShift(shiftStart, shiftEnd)) {
    if (currentMinute >= shiftStart) {
      // Before midnight: remaining = (24*60 - currentMinute) + shiftEnd
      return (24 * 60 - currentMinute) + shiftEnd;
    } else {
      // After midnight: remaining = shiftEnd - currentMinute
      return shiftEnd - currentMinute;
    }
  }
  return shiftEnd - currentMinute;
}

/**
 * Advance currentLocal to the shift start. If the shift starts later today, set to today.
 * If we're past the shift (including overnight end), advance to next day's shift start.
 */
function advanceToShiftStart(currentLocal: Date, shiftStart: number): void {
  currentLocal.setHours(Math.floor(shiftStart / 60), shiftStart % 60, 0, 0);
}

function getLeaveOverlap(
  windowStart: Date, windowEnd: Date, leaves: LeaveRecord[], timezone: string
): number {
  let totalOverlap = 0;
  for (const leave of leaves) {
    const leaveStart = toTimezoneDate(new Date(leave.leave_start_datetime), timezone);
    const leaveEnd = toTimezoneDate(new Date(leave.leave_end_datetime), timezone);
    const overlapStart = new Date(Math.max(windowStart.getTime(), leaveStart.getTime()));
    const overlapEnd = new Date(Math.min(windowEnd.getTime(), leaveEnd.getTime()));
    if (overlapStart < overlapEnd) {
      totalOverlap += (overlapEnd.getTime() - overlapStart.getTime()) / (1000 * 60);
    }
  }
  return totalOverlap;
}

/**
 * Core SLA calculation algorithm with overnight shift support.
 */
function calculateDeadline(
  startTimeUTC: Date, slaMinutes: number, calendar: CalendarConfig, leaves: LeaveRecord[]
): Date {
  const { working_days, start_time, end_time, saturday_start_time, saturday_end_time, timezone } = calendar;
  const workStartMin = timeToMinutes(start_time);
  const workEndMin = timeToMinutes(end_time);
  const satStartMin = saturday_start_time ? timeToMinutes(saturday_start_time) : workStartMin;
  const satEndMin = saturday_end_time ? timeToMinutes(saturday_end_time) : workEndMin;

  let currentLocal = toTimezoneDate(startTimeUTC, timezone);
  let remainingMinutes = slaMinutes;
  let iterations = 0;
  const maxIterations = 730; // doubled for overnight shifts spanning 2 calendar days

  while (remainingMinutes > 0 && iterations < maxIterations) {
    iterations++;
    const dayOfWeek = getISODay(currentLocal);

    if (!working_days.includes(dayOfWeek)) {
      currentLocal.setDate(currentLocal.getDate() + 1);
      const nextDay = getISODay(currentLocal);
      const nextStart = nextDay === 6 ? satStartMin : workStartMin;
      advanceToShiftStart(currentLocal, nextStart);
      continue;
    }

    const isSaturday = dayOfWeek === 6;
    const todayStart = isSaturday ? satStartMin : workStartMin;
    const todayEnd = isSaturday ? satEndMin : workEndMin;
    const overnight = isOvernightShift(todayStart, todayEnd);
    const currentMinute = currentLocal.getHours() * 60 + currentLocal.getMinutes();

    // Check if we're within the shift
    if (!isWithinShift(currentMinute, todayStart, todayEnd)) {
      if (overnight && currentMinute < todayStart && currentMinute >= todayEnd) {
        // Between overnight end and next shift start - advance to shift start today
        advanceToShiftStart(currentLocal, todayStart);
      } else if (!overnight && currentMinute < todayStart) {
        advanceToShiftStart(currentLocal, todayStart);
      } else {
        // Past shift end - advance to next day
        currentLocal.setDate(currentLocal.getDate() + 1);
        const nextDay = getISODay(currentLocal);
        const nextStart = nextDay === 6 ? satStartMin : workStartMin;
        advanceToShiftStart(currentLocal, nextStart);
      }
      continue;
    }

    // We're within the shift - calculate available minutes
    const availableMinutes = minutesUntilShiftEnd(currentMinute, todayStart, todayEnd);

    // Build window for leave overlap
    const windowStart = new Date(currentLocal);
    let windowEnd: Date;
    if (overnight && currentMinute >= todayStart) {
      // Window extends past midnight to todayEnd tomorrow
      windowEnd = new Date(currentLocal);
      windowEnd.setDate(windowEnd.getDate() + 1);
      windowEnd.setHours(Math.floor(todayEnd / 60), todayEnd % 60, 0, 0);
    } else if (overnight && currentMinute < todayEnd) {
      // We're in the after-midnight portion
      windowEnd = new Date(currentLocal);
      windowEnd.setHours(Math.floor(todayEnd / 60), todayEnd % 60, 0, 0);
    } else {
      windowEnd = new Date(currentLocal);
      windowEnd.setHours(Math.floor(todayEnd / 60), todayEnd % 60, 0, 0);
    }

    const leaveOverlap = getLeaveOverlap(windowStart, windowEnd, leaves, timezone);
    const usableMinutes = Math.max(0, availableMinutes - leaveOverlap);

    if (usableMinutes <= 0) {
      // Skip to next day
      // Advance to next calendar day shift start (overnight already accounted for in windowEnd)
      currentLocal.setDate(currentLocal.getDate() + 1);
      const nextDay = getISODay(currentLocal);
      const nextStart = nextDay === 6 ? satStartMin : workStartMin;
      advanceToShiftStart(currentLocal, nextStart);
      continue;
    }

    if (remainingMinutes <= usableMinutes) {
      if (leaveOverlap === 0) {
        currentLocal = new Date(windowStart.getTime() + remainingMinutes * 60 * 1000);
      } else {
        currentLocal = walkThroughWindow(windowStart, windowEnd, remainingMinutes, leaves, timezone);
      }
      remainingMinutes = 0;
    } else {
      remainingMinutes -= usableMinutes;
      // Advance past this shift window
      // Move to the next shift start on the following calendar day
      currentLocal.setDate(currentLocal.getDate() + 1);
      const nextDay = getISODay(currentLocal);
      const nextStart = nextDay === 6 ? satStartMin : workStartMin;
      advanceToShiftStart(currentLocal, nextStart);
    }
  }

  if (iterations >= maxIterations) {
    throw new Error("SLA calculation exceeded maximum iterations");
  }

  return fromTimezoneToUTC(currentLocal, timezone);
}

function walkThroughWindow(
  windowStart: Date, windowEnd: Date, minutes: number, leaves: LeaveRecord[], timezone: string
): Date {
  let accumulated = 0;
  let current = new Date(windowStart);
  const leaveWindows = leaves.map((l) => ({
    start: toTimezoneDate(new Date(l.leave_start_datetime), timezone),
    end: toTimezoneDate(new Date(l.leave_end_datetime), timezone),
  }));

  while (accumulated < minutes && current < windowEnd) {
    const inLeave = leaveWindows.some((lw) => current >= lw.start && current < lw.end);
    if (!inLeave) {
      accumulated++;
      if (accumulated >= minutes) {
        return new Date(current.getTime() + 60 * 1000);
      }
    }
    current = new Date(current.getTime() + 60 * 1000);
  }
  return current;
}

/**
 * Calculate remaining working minutes between two dates (for resume-from-hold).
 */
function calculateRemainingMinutes(
  fromUTC: Date, toUTC: Date, calendar: CalendarConfig, leaves: LeaveRecord[]
): number {
  const { working_days, start_time, end_time, saturday_start_time, saturday_end_time, timezone } = calendar;
  const workStartMin = timeToMinutes(start_time);
  const workEndMin = timeToMinutes(end_time);
  const satStartMin = saturday_start_time ? timeToMinutes(saturday_start_time) : workStartMin;
  const satEndMin = saturday_end_time ? timeToMinutes(saturday_end_time) : workEndMin;

  let currentLocal = toTimezoneDate(fromUTC, timezone);
  const deadlineLocal = toTimezoneDate(toUTC, timezone);
  let totalMinutes = 0;
  let iterations = 0;

  while (currentLocal < deadlineLocal && iterations < 730) {
    iterations++;
    const dayOfWeek = getISODay(currentLocal);
    if (!working_days.includes(dayOfWeek)) {
      currentLocal.setDate(currentLocal.getDate() + 1);
      const nextStart = getISODay(currentLocal) === 6 ? satStartMin : workStartMin;
      currentLocal.setHours(Math.floor(nextStart / 60), nextStart % 60, 0, 0);
      continue;
    }
    const isSaturday = dayOfWeek === 6;
    const todayStart = isSaturday ? satStartMin : workStartMin;
    const todayEnd = isSaturday ? satEndMin : workEndMin;
    const currentMinute = currentLocal.getHours() * 60 + currentLocal.getMinutes();

    if (!isWithinShift(currentMinute, todayStart, todayEnd)) {
      if (!isOvernightShift(todayStart, todayEnd) && currentMinute < todayStart) {
        currentLocal.setHours(Math.floor(todayStart / 60), todayStart % 60, 0, 0);
      } else if (isOvernightShift(todayStart, todayEnd) && currentMinute < todayStart && currentMinute >= todayEnd) {
        currentLocal.setHours(Math.floor(todayStart / 60), todayStart % 60, 0, 0);
      } else {
        currentLocal.setDate(currentLocal.getDate() + 1);
        const nextStart = getISODay(currentLocal) === 6 ? satStartMin : workStartMin;
        currentLocal.setHours(Math.floor(nextStart / 60), nextStart % 60, 0, 0);
        continue;
      }
    }

    const available = minutesUntilShiftEnd(
      currentLocal.getHours() * 60 + currentLocal.getMinutes(), todayStart, todayEnd
    );
    let windowEnd: Date;
    const overnight = isOvernightShift(todayStart, todayEnd);
    const curMin = currentLocal.getHours() * 60 + currentLocal.getMinutes();
    if (overnight && curMin >= todayStart) {
      windowEnd = new Date(currentLocal);
      windowEnd.setDate(windowEnd.getDate() + 1);
      windowEnd.setHours(Math.floor(todayEnd / 60), todayEnd % 60, 0, 0);
    } else {
      windowEnd = new Date(currentLocal);
      windowEnd.setHours(Math.floor(todayEnd / 60), todayEnd % 60, 0, 0);
    }

    const effectiveEnd = deadlineLocal < windowEnd ? deadlineLocal : windowEnd;
    const cappedMinutes = Math.max(0, Math.floor((effectiveEnd.getTime() - currentLocal.getTime()) / (1000 * 60)));
    const minutesToCount = Math.min(available, cappedMinutes);

    const leaveOverlap = getLeaveOverlap(new Date(currentLocal), effectiveEnd, leaves, timezone);
    totalMinutes += Math.max(0, minutesToCount - leaveOverlap);

    if (deadlineLocal <= windowEnd) break;

    // Continue from the next calendar day shift start
    currentLocal.setDate(currentLocal.getDate() + 1);
    const nextStart = getISODay(currentLocal) === 6 ? satStartMin : workStartMin;
    currentLocal.setHours(Math.floor(nextStart / 60), nextStart % 60, 0, 0);
  }
  return totalMinutes;
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const supabaseAdmin = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""
    );

    const { developer_id, start_time, sla_hours = 8, resume_from_hold, held_at, original_sla_deadline } = await req.json();

    if (!developer_id) {
      return new Response(
        JSON.stringify({ error: "developer_id is required" }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 400 }
      );
    }

    const startTimeUTC = start_time ? new Date(start_time) : new Date();
    let slaMinutes = sla_hours * 60;

    console.log(`Calculating SLA: developer=${developer_id}, start=${startTimeUTC.toISOString()}, hours=${sla_hours}`);

    const { data: developer, error: devError } = await supabaseAdmin
      .from("developers")
      .select("id, timezone, availability_calendar_id, availability_calendars(working_days, start_time, end_time, saturday_start_time, saturday_end_time, timezone)")
      .eq("id", developer_id)
      .single();

    if (devError || !developer) {
      console.error("Developer not found:", devError);
      return new Response(
        JSON.stringify({ error: "Developer not found" }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 404 }
      );
    }

    const cal = (developer as any).availability_calendars;
    if (!cal) {
      return new Response(
        JSON.stringify({ error: "Developer has no availability calendar" }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 400 }
      );
    }

    const calendar: CalendarConfig = {
      working_days: cal.working_days,
      start_time: cal.start_time,
      end_time: cal.end_time,
      saturday_start_time: cal.saturday_start_time,
      saturday_end_time: cal.saturday_end_time,
      timezone: cal.timezone,
    };

    const windowEnd = new Date(startTimeUTC);
    windowEnd.setDate(windowEnd.getDate() + 60);

    const { data: leaves, error: leaveError } = await supabaseAdmin
      .from("leave_records")
      .select("leave_start_datetime, leave_end_datetime")
      .eq("developer_id", developer_id)
      .eq("status", "approved")
      .lte("leave_start_datetime", windowEnd.toISOString())
      .gte("leave_end_datetime", startTimeUTC.toISOString());

    if (leaveError) {
      console.error("Error fetching leaves:", leaveError);
    }

    // If resuming from hold, compute remaining working minutes between held_at and original deadline
    if (resume_from_hold && held_at && original_sla_deadline) {
      const heldAtUTC = new Date(held_at);
      const originalDeadlineUTC = new Date(original_sla_deadline);
      
      if (originalDeadlineUTC > heldAtUTC) {
        const remainingMinutes = calculateRemainingMinutes(heldAtUTC, originalDeadlineUTC, calendar, leaves || []);
        slaMinutes = Math.max(1, Math.round(remainingMinutes));
        console.log(`Resume mode: ${remainingMinutes} working minutes remained at hold time`);
      } else {
        slaMinutes = 0;
        console.log(`Resume mode: was already overdue at hold time`);
      }
    }

    const deadline = calculateDeadline(startTimeUTC, slaMinutes, calendar, leaves || []);

    console.log(`SLA deadline calculated: ${deadline.toISOString()}`);

    return new Response(
      JSON.stringify({
        success: true,
        deadline: deadline.toISOString(),
        developer_id,
        sla_hours,
        start_time: startTimeUTC.toISOString(),
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 200 }
    );
  } catch (error: unknown) {
    console.error("SLA calculation error:", error instanceof Error ? error.message : error);
    return new Response(
      JSON.stringify({ error: "SLA calculation failed. Please try again." }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 400 }
    );
  }
});
