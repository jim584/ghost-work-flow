export interface CalendarConfig {
  working_days: number[];
  start_time: string;
  end_time: string;
  saturday_start_time?: string | null;
  saturday_end_time?: string | null;
  timezone: string;
}

export interface LeaveRecord {
  leave_start_datetime: string;
  leave_end_datetime: string;
}

export function timeToMinutes(time: string): number {
  const [h, m] = time.split(":").map(Number);
  return h * 60 + m;
}

export function getISODay(date: Date): number {
  const d = date.getDay();
  return d === 0 ? 7 : d;
}

export function toTimezoneDate(utcDate: Date, tz: string): Date {
  const fmt = new Intl.DateTimeFormat("en-US", {
    timeZone: tz, year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false,
  });
  const parts = fmt.formatToParts(utcDate);
  const get = (type: string) => parts.find((p) => p.type === type)?.value || "0";
  return new Date(`${get("year")}-${get("month")}-${get("day")}T${get("hour")}:${get("minute")}:${get("second")}`);
}

export function isOvernightShift(startMin: number, endMin: number): boolean {
  return endMin <= startMin;
}

export function isWithinShift(minuteOfDay: number, shiftStart: number, shiftEnd: number): boolean {
  if (isOvernightShift(shiftStart, shiftEnd)) {
    return minuteOfDay >= shiftStart || minuteOfDay < shiftEnd;
  }
  return minuteOfDay >= shiftStart && minuteOfDay < shiftEnd;
}

export function minutesUntilShiftEnd(currentMinute: number, shiftStart: number, shiftEnd: number): number {
  if (!isWithinShift(currentMinute, shiftStart, shiftEnd)) return 0;
  if (isOvernightShift(shiftStart, shiftEnd)) {
    if (currentMinute >= shiftStart) {
      return (24 * 60 - currentMinute) + shiftEnd;
    }
    return shiftEnd - currentMinute;
  }
  return shiftEnd - currentMinute;
}

/**
 * Calculate remaining working minutes between now and deadline,
 * with overnight shift support.
 */
export function calculateRemainingWorkingMinutes(
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
    } else if (overnight) {
      windowEnd = new Date(currentLocal);
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

/**
 * Calculate how many working minutes have elapsed PAST the deadline (for overdue display).
 */
export function calculateOverdueWorkingMinutes(
  nowUTC: Date, deadlineUTC: Date, calendar: CalendarConfig, leaves: LeaveRecord[]
): number {
  if (nowUTC <= deadlineUTC) return 0;
  return calculateRemainingWorkingMinutes(deadlineUTC, nowUTC, calendar, leaves);
}
