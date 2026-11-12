/**
 * Centralized Date & Time Engine for FocusFlow & Finance.
 * Supports configurable timezones with Asia/Kolkata (IST, UTC+5:30) as default.
 * Provides timezone-correct daily boundaries, leap-year calculations,
 * robust month-end recurrence without rollover bugs, and deterministic streak analytics.
 */

export const DEFAULT_TIMEZONE = 'Asia/Kolkata';

export interface ZonedDateParts {
  year: number;
  month: number; // 1 - 12
  day: number; // 1 - 31
  hour: number; // 0 - 23
  minute: number; // 0 - 59
  second: number; // 0 - 59
  dayOfWeek: number; // 0 (Sun) - 6 (Sat)
}

/**
 * Extract zoned date parts deterministically via Intl.DateTimeFormat.
 */
export function getZonedDateParts(
  input: Date | string | number = new Date(),
  timezone: string = DEFAULT_TIMEZONE
): ZonedDateParts {
  const date = typeof input === 'string' || typeof input === 'number' ? new Date(input) : input;
  const safeDate = Number.isNaN(date.getTime()) ? new Date() : date;

  try {
    const formatter = new Intl.DateTimeFormat('en-US', {
      timeZone: timezone,
      year: 'numeric',
      month: 'numeric',
      day: 'numeric',
      hour: 'numeric',
      minute: 'numeric',
      second: 'numeric',
      hour12: false,
      weekday: 'short',
    });

    const parts = formatter.formatToParts(safeDate);
    const map: Record<string, string> = {};
    for (const p of parts) {
      map[p.type] = p.value;
    }

    const dayName = map.weekday || '';
    const dayMap: Record<string, number> = {
      Sun: 0,
      Mon: 1,
      Tue: 2,
      Wed: 3,
      Thu: 4,
      Fri: 5,
      Sat: 6,
    };

    let hour = parseInt(map.hour || '0', 10);
    if (hour === 24) hour = 0; // Handle 24:00 edge in some Intl environments

    return {
      year: parseInt(map.year || '2026', 10),
      month: parseInt(map.month || '1', 10),
      day: parseInt(map.day || '1', 10),
      hour,
      minute: parseInt(map.minute || '0', 10),
      second: parseInt(map.second || '0', 10),
      dayOfWeek: dayMap[dayName] !== undefined ? dayMap[dayName] : safeDate.getDay(),
    };
  } catch {
    // Fallback if timezone is unrecognized
    return {
      year: safeDate.getFullYear(),
      month: safeDate.getMonth() + 1,
      day: safeDate.getDate(),
      hour: safeDate.getHours(),
      minute: safeDate.getMinutes(),
      second: safeDate.getSeconds(),
      dayOfWeek: safeDate.getDay(),
    };
  }
}

/**
 * Returns today's date in YYYY-MM-DD string format within the target timezone.
 * Solves the UTC offset issue where early morning hours (00:00 - 05:30 IST) were marked as yesterday.
 */
export function getTodayDateString(timezone: string = DEFAULT_TIMEZONE): string {
  const parts = getZonedDateParts(new Date(), timezone);
  const m = String(parts.month).padStart(2, '0');
  const d = String(parts.day).padStart(2, '0');
  return `${parts.year}-${m}-${d}`;
}

/**
 * Format any timestamp or date into YYYY-MM-DD in the target timezone.
 */
export function formatDateInTimezone(
  input: Date | string | number,
  timezone: string = DEFAULT_TIMEZONE
): string {
  const parts = getZonedDateParts(input, timezone);
  const m = String(parts.month).padStart(2, '0');
  const d = String(parts.day).padStart(2, '0');
  return `${parts.year}-${m}-${d}`;
}

/**
 * Determine if a year is a leap year.
 */
export function isLeapYear(year: number): boolean {
  return (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0;
}

/**
 * Returns the exact count of days in a given year and month (1-based month: 1=Jan, 12=Dec).
 */
export function getDaysInMonth(year: number, month: number): number {
  if (month === 2) {
    return isLeapYear(year) ? 29 : 28;
  }
  if ([4, 6, 9, 11].includes(month)) {
    return 30;
  }
  return 31;
}

/**
 * Parse a YYYY-MM-DD date string into its components.
 */
export function parseDateString(dateStr: string): { year: number; month: number; day: number } | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) return null;
  const [y, m, d] = dateStr.split('-').map((v) => parseInt(v, 10));
  if (m < 1 || m > 12) return null;
  const maxDays = getDaysInMonth(y, m);
  if (d < 1 || d > maxDays) return null;
  return { year: y, month: m, day: d };
}

/**
 * Format year, month, and day into YYYY-MM-DD.
 */
export function formatYmd(year: number, month: number, day: number): string {
  const m = String(month).padStart(2, '0');
  const d = String(day).padStart(2, '0');
  return `${year}-${m}-${d}`;
}

/**
 * Get start of the week (Monday) in YYYY-MM-DD for the given date and timezone.
 */
export function getStartOfWeek(
  input: Date | string | number = new Date(),
  timezone: string = DEFAULT_TIMEZONE
): string {
  const parts = getZonedDateParts(input, timezone);
  const day = parts.dayOfWeek;
  const diffToMonday = (day + 6) % 7;

  // Compute via UTC date arithmetic on base Y-M-D to avoid local drift
  const base = new Date(Date.UTC(parts.year, parts.month - 1, parts.day));
  base.setUTCDate(base.getUTCDate() - diffToMonday);

  const y = base.getUTCFullYear();
  const m = String(base.getUTCMonth() + 1).padStart(2, '0');
  const d = String(base.getUTCDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

/**
 * Get end of the week (Sunday) in YYYY-MM-DD for the given date and timezone.
 */
export function getEndOfWeek(
  input: Date | string | number = new Date(),
  timezone: string = DEFAULT_TIMEZONE
): string {
  const startStr = getStartOfWeek(input, timezone);
  const parsed = parseDateString(startStr);
  if (!parsed) return startStr;

  const base = new Date(Date.UTC(parsed.year, parsed.month - 1, parsed.day));
  base.setUTCDate(base.getUTCDate() + 6);

  const y = base.getUTCFullYear();
  const m = String(base.getUTCMonth() + 1).padStart(2, '0');
  const d = String(base.getUTCDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

/**
 * Get start of month in YYYY-MM-DD.
 */
export function getStartOfMonth(
  input: Date | string | number = new Date(),
  timezone: string = DEFAULT_TIMEZONE
): string {
  const parts = getZonedDateParts(input, timezone);
  return formatYmd(parts.year, parts.month, 1);
}

/**
 * Get end of month in YYYY-MM-DD with exact leap-year and 30/31-day boundary calculation.
 */
export function getEndOfMonth(
  input: Date | string | number = new Date(),
  timezone: string = DEFAULT_TIMEZONE
): string {
  const parts = getZonedDateParts(input, timezone);
  const lastDay = getDaysInMonth(parts.year, parts.month);
  return formatYmd(parts.year, parts.month, lastDay);
}

/**
 * Add or subtract days safely from a YYYY-MM-DD string.
 */
export function addDays(dateStr: string, days: number): string {
  const parsed = parseDateString(dateStr);
  if (!parsed) return dateStr;
  const d = new Date(Date.UTC(parsed.year, parsed.month - 1, parsed.day));
  d.setUTCDate(d.getUTCDate() + days);
  return formatYmd(d.getUTCFullYear(), d.getUTCMonth() + 1, d.getUTCDate());
}

/**
 * Compute the next recurrence due date safely:
 * - Fixes the month-end recurrence rollover bug (e.g. Jan 31 + 1 month -> Feb 28/29, not March 3).
 * - Preserves original due day preference across shorter and longer months.
 */
export function computeNextRecurrenceDueDate(
  currentDueDate: string | null | undefined,
  recurrence: 'none' | 'daily' | 'weekly' | 'monthly' | 'quarterly' | 'yearly',
  preferredDueDay?: number,
  timezone: string = DEFAULT_TIMEZONE
): string | null {
  if (recurrence === 'none') return null;

  const baseStr =
    currentDueDate && parseDateString(currentDueDate)
      ? currentDueDate
      : getTodayDateString(timezone);

  const parsed = parseDateString(baseStr);
  if (!parsed) return null;

  if (recurrence === 'daily') {
    return addDays(baseStr, 1);
  }

  if (recurrence === 'weekly') {
    return addDays(baseStr, 7);
  }

  const targetDay =
    preferredDueDay && preferredDueDay >= 1 && preferredDueDay <= 31
      ? preferredDueDay
      : parsed.day;

  let targetYear = parsed.year;
  let targetMonth = parsed.month;

  if (recurrence === 'monthly') {
    targetMonth += 1;
    if (targetMonth > 12) {
      targetMonth = 1;
      targetYear += 1;
    }
  } else if (recurrence === 'quarterly') {
    targetMonth += 3;
    if (targetMonth > 12) {
      targetMonth -= 12;
      targetYear += 1;
    }
  } else if (recurrence === 'yearly') {
    targetYear += 1;
  }

  // Clamped cleanly to maximum days in the target month (e.g. Feb has 28 or 29, Apr has 30)
  const maxDayInTargetMonth = getDaysInMonth(targetYear, targetMonth);
  const clampedDay = Math.min(targetDay, maxDayInTargetMonth);

  return formatYmd(targetYear, targetMonth, clampedDay);
}

/**
 * Determine if a given dueDate string is overdue in the target timezone.
 */
export function isDueDateOverdue(dueDate: string | null | undefined, timezone: string = DEFAULT_TIMEZONE): boolean {
  if (!dueDate || !parseDateString(dueDate)) return false;
  const today = getTodayDateString(timezone);
  return dueDate < today;
}

/**
 * Bounded, timezone-correct focus streak calculation.
 * Accurately tracks consecutive work sessions mapped to target timezone days.
 */
export function calculateFocusStreakDays(
  sessions: ReadonlyArray<{ startedAt: string; completed?: boolean; mode?: string }>,
  timezone: string = DEFAULT_TIMEZONE,
  referenceDate: Date = new Date()
): number {
  const completedDays = new Set<string>();

  for (const s of sessions) {
    if (!s || !s.completed || s.mode !== 'work') continue;
    if (typeof s.startedAt !== 'string') continue;
    try {
      const zonedDateStr = formatDateInTimezone(s.startedAt, timezone);
      if (parseDateString(zonedDateStr)) {
        completedDays.add(zonedDateStr);
      }
    } catch {
      // ignore unparseable timestamps
    }
  }

  if (completedDays.size === 0) return 0;

  const todayStr = formatDateInTimezone(referenceDate, timezone);
  const yesterdayStr = addDays(todayStr, -1);

  let startOffset = -1;
  if (completedDays.has(todayStr)) {
    startOffset = 0;
  } else if (completedDays.has(yesterdayStr)) {
    startOffset = 1;
  } else {
    return 0;
  }

  let streak = 0;
  for (let i = 0; i < 365; i++) {
    const checkDate = addDays(todayStr, -(startOffset + i));
    if (completedDays.has(checkDate)) {
      streak++;
    } else {
      break;
    }
  }

  return streak;
}

/**
 * All-time longest streak calculation in target timezone.
 */
export function computeBestStreakDays(
  sessions: ReadonlyArray<{ startedAt: string; completed?: boolean; mode?: string }>,
  timezone: string = DEFAULT_TIMEZONE
): number {
  const uniqueDates = new Set<string>();

  for (const s of sessions) {
    if (!s || !s.completed || s.mode !== 'work') continue;
    if (typeof s.startedAt !== 'string') continue;
    try {
      const zonedDateStr = formatDateInTimezone(s.startedAt, timezone);
      if (parseDateString(zonedDateStr)) {
        uniqueDates.add(zonedDateStr);
      }
    } catch {
      // ignore
    }
  }

  if (uniqueDates.size === 0) return 0;
  const sorted = Array.from(uniqueDates).sort();

  let best = 1;
  let current = 1;

  for (let i = 1; i < sorted.length; i++) {
    const prev = sorted[i - 1];
    const expected = addDays(prev, 1);
    if (sorted[i] === expected) {
      current++;
      if (current > best) best = current;
    } else {
      current = 1;
    }
  }

  return best;
}

