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

/**
 * Parse a "HH:MM" time string into total minutes from midnight.
 */
function timeToMinutes(time: string): number {
  const [h, m] = time.split(":").map(Number);
  return h * 60 + m;
}

/**
 * Get the ISO day-of-week for a Date (1=Mon … 7=Sun).
 */
function getISODay(date: Date): number {
  const d = date.getDay(); // 0=Sun
  return d === 0 ? 7 : d;
}

/**
 * Create a Date in a specific timezone by building an ISO string
 * and using the timezone offset. We work in UTC internally and
 * convert at boundaries.
 */
function toTimezoneDate(utcDate: Date, _timezone: string): Date {
  // We use Intl to get the local components in the target timezone
  const fmt = new Intl.DateTimeFormat("en-US", {
    timeZone: _timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  });
  const parts = fmt.formatToParts(utcDate);
  const get = (type: string) => parts.find((p) => p.type === type)?.value || "0";

  return new Date(
    `${get("year")}-${get("month")}-${get("day")}T${get("hour")}:${get("minute")}:${get("second")}`
  );
}

/**
 * Convert a local datetime back to UTC given its timezone.
 * We find the UTC offset by comparing a known UTC time with its local representation.
 */
function fromTimezoneToUTC(localDate: Date, timezone: string): Date {
  // Use a reference point to calculate offset
  const refUTC = new Date(localDate.toISOString().replace("Z", "") + "Z");
  const refLocal = toTimezoneDate(refUTC, timezone);
  const offsetMs = refLocal.getTime() - refUTC.getTime();

  // Adjust: local = utc + offset, so utc = local - offset
  return new Date(localDate.getTime() - offsetMs);
}

/**
 * Check if a given local datetime falls within any approved leave period.
 * Returns the end of the leave period if overlapping, or null.
 */
function getLeaveOverlap(
  localTime: Date,
  dayEndLocal: Date,
  leaves: LeaveRecord[],
  timezone: string
): { overlapMinutes: number } {
  let totalOverlap = 0;

  for (const leave of leaves) {
    const leaveStart = toTimezoneDate(new Date(leave.leave_start_datetime), timezone);
    const leaveEnd = toTimezoneDate(new Date(leave.leave_end_datetime), timezone);

    // Check if leave overlaps with the window [localTime, dayEndLocal]
    const overlapStart = new Date(Math.max(localTime.getTime(), leaveStart.getTime()));
    const overlapEnd = new Date(Math.min(dayEndLocal.getTime(), leaveEnd.getTime()));

    if (overlapStart < overlapEnd) {
      totalOverlap += (overlapEnd.getTime() - overlapStart.getTime()) / (1000 * 60);
    }
  }

  return { overlapMinutes: totalOverlap };
}

/**
 * Core SLA calculation algorithm.
 *
 * Accumulates `slaMinutes` of working time starting from `startTimeUTC`,
 * using the developer's calendar and skipping leaves.
 *
 * Returns the deadline as a UTC Date.
 */
function calculateDeadline(
  startTimeUTC: Date,
  slaMinutes: number,
  calendar: CalendarConfig,
  leaves: LeaveRecord[]
): Date {
  const { working_days, start_time, end_time, saturday_start_time, saturday_end_time, timezone } = calendar;
  const workStartMinutes = timeToMinutes(start_time);
  const workEndMinutes = timeToMinutes(end_time);
  const satStartMinutes = saturday_start_time ? timeToMinutes(saturday_start_time) : workStartMinutes;
  const satEndMinutes = saturday_end_time ? timeToMinutes(saturday_end_time) : workEndMinutes;
  const dailyWorkMinutes = workEndMinutes - workStartMinutes;

  if (dailyWorkMinutes <= 0) {
    throw new Error("Invalid calendar: end_time must be after start_time");
  }

  // Convert start time to local timezone
  let currentLocal = toTimezoneDate(startTimeUTC, timezone);
  let remainingMinutes = slaMinutes;

  // Safety: max 365 days iteration
  const maxIterations = 365;
  let iterations = 0;

  while (remainingMinutes > 0 && iterations < maxIterations) {
    iterations++;
    const dayOfWeek = getISODay(currentLocal);

    // Check if today is a working day
    if (!working_days.includes(dayOfWeek)) {
      // Skip to next day, start of work
      currentLocal = new Date(currentLocal);
      currentLocal.setDate(currentLocal.getDate() + 1);
      const skipDay = getISODay(currentLocal);
      const skipStart = skipDay === 6 ? satStartMinutes : workStartMinutes;
      currentLocal.setHours(Math.floor(skipStart / 60), skipStart % 60, 0, 0);
      continue;
    }

    // Use Saturday-specific hours if today is Saturday (day 6)
    const isSaturday = dayOfWeek === 6;
    const todayStart = isSaturday ? satStartMinutes : workStartMinutes;
    const todayEnd = isSaturday ? satEndMinutes : workEndMinutes;

    const currentMinuteOfDay =
      currentLocal.getHours() * 60 + currentLocal.getMinutes();

    // If before work hours, advance to work start
    if (currentMinuteOfDay < todayStart) {
      currentLocal.setHours(Math.floor(todayStart / 60), todayStart % 60, 0, 0);
    }

    // If after work hours, advance to next day
    if (currentMinuteOfDay >= todayEnd) {
      currentLocal.setDate(currentLocal.getDate() + 1);
      const nextDay = getISODay(currentLocal);
      const nextStart = nextDay === 6 ? satStartMinutes : workStartMinutes;
      currentLocal.setHours(Math.floor(nextStart / 60), nextStart % 60, 0, 0);
      continue;
    }

    // Calculate available minutes for the rest of this working day
    const effectiveStart = Math.max(
      currentLocal.getHours() * 60 + currentLocal.getMinutes(),
      todayStart
    );
    const availableMinutesInDay = todayEnd - effectiveStart;

    // Build day end local time for leave overlap check
    const dayEndLocal = new Date(currentLocal);
    dayEndLocal.setHours(Math.floor(todayEnd / 60), todayEnd % 60, 0, 0);

    const dayStartLocal = new Date(currentLocal);
    dayStartLocal.setHours(
      Math.floor(effectiveStart / 60),
      effectiveStart % 60,
      0,
      0
    );

    // Calculate leave overlap for this working window
    const { overlapMinutes } = getLeaveOverlap(
      dayStartLocal,
      dayEndLocal,
      leaves,
      timezone
    );

    const usableMinutes = Math.max(0, availableMinutesInDay - overlapMinutes);

    if (usableMinutes <= 0) {
      // Entire remaining work period is on leave, skip to next day
      currentLocal.setDate(currentLocal.getDate() + 1);
      const nextDay2 = getISODay(currentLocal);
      const nextStart2 = nextDay2 === 6 ? satStartMinutes : workStartMinutes;
      currentLocal.setHours(Math.floor(nextStart2 / 60), nextStart2 % 60, 0, 0);
      continue;
    }

    if (remainingMinutes <= usableMinutes) {
      // SLA completes today - advance by remaining minutes (accounting for leave gaps)
      // Simple approach: advance minute by minute through available time
      // For efficiency, if no leave overlap, just add minutes directly
      if (overlapMinutes === 0) {
        currentLocal = new Date(
          dayStartLocal.getTime() + remainingMinutes * 60 * 1000
        );
      } else {
        // Need to walk through the day accounting for leave gaps
        currentLocal = walkThroughDay(
          dayStartLocal,
          dayEndLocal,
          remainingMinutes,
          leaves,
          timezone
        );
      }
      remainingMinutes = 0;
    } else {
      // Consume all usable minutes today, continue tomorrow
      remainingMinutes -= usableMinutes;
      currentLocal.setDate(currentLocal.getDate() + 1);
      const nextDay3 = getISODay(currentLocal);
      const nextStart3 = nextDay3 === 6 ? satStartMinutes : workStartMinutes;
      currentLocal.setHours(Math.floor(nextStart3 / 60), nextStart3 % 60, 0, 0);
    }
  }

  if (iterations >= maxIterations) {
    throw new Error("SLA calculation exceeded maximum iterations");
  }

  // Convert back to UTC
  return fromTimezoneToUTC(currentLocal, timezone);
}

/**
 * Walk through a working day minute-by-minute to find when N working minutes
 * have elapsed, accounting for leave gaps.
 */
function walkThroughDay(
  dayStart: Date,
  dayEnd: Date,
  minutes: number,
  leaves: LeaveRecord[],
  timezone: string
): Date {
  let accumulated = 0;
  let current = new Date(dayStart);

  const leaveWindows = leaves.map((l) => ({
    start: toTimezoneDate(new Date(l.leave_start_datetime), timezone),
    end: toTimezoneDate(new Date(l.leave_end_datetime), timezone),
  }));

  while (accumulated < minutes && current < dayEnd) {
    // Check if current minute is in a leave window
    const inLeave = leaveWindows.some(
      (lw) => current >= lw.start && current < lw.end
    );

    if (!inLeave) {
      accumulated++;
      if (accumulated >= minutes) {
        // Add one more minute to mark the deadline at end of last working minute
        return new Date(current.getTime() + 60 * 1000);
      }
    }

    current = new Date(current.getTime() + 60 * 1000);
  }

  return current;
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

    const { developer_id, start_time, sla_hours = 8 } = await req.json();

    if (!developer_id) {
      return new Response(
        JSON.stringify({ error: "developer_id is required" }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 400 }
      );
    }

    const startTimeUTC = start_time ? new Date(start_time) : new Date();
    const slaMinutes = sla_hours * 60;

    console.log(`Calculating SLA: developer=${developer_id}, start=${startTimeUTC.toISOString()}, hours=${sla_hours}`);

    // Fetch developer with calendar
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

    // Fetch approved leaves for this developer in a reasonable window (next 60 days)
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

    const deadline = calculateDeadline(
      startTimeUTC,
      slaMinutes,
      calendar,
      leaves || []
    );

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
