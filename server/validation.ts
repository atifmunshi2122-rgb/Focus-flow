import type { FocusSession } from './db.js';
import {
  DEFAULT_TIMEZONE,
  getTodayDateString,
  calculateFocusStreakDays,
  computeBestStreakDays as computeBestStreakDaysTz,
  computeNextRecurrenceDueDate as computeSafeNextRecurrenceDueDate,
} from './dateTime.js';

export const ALLOWED_CURRENCIES = ['INR', 'USD', 'EUR', 'GBP'] as const;
export const ALLOWED_THEMES = ['light', 'dark', 'system'] as const;
export const ALLOWED_TASK_PRIORITIES = ['low', 'medium', 'high'] as const;
export const ALLOWED_TASK_STATUSES = ['todo', 'in_progress', 'completed'] as const;
export const ALLOWED_TASK_RECURRENCES = ['none', 'daily', 'weekly', 'monthly'] as const;
export const ALLOWED_FOCUS_MODES = ['work', 'short_break', 'long_break'] as const;
export const ALLOWED_PAYMENT_METHODS = [
  'credit_card',
  'debit_card',
  'upi_bank',
  'cash',
  'other',
] as const;
export const ALLOWED_RECURRENCES = ['monthly', 'quarterly', 'yearly'] as const;
export const ALLOWED_CATEGORY_TYPES = ['fixed', 'variable', 'both'] as const;
export const ALLOWED_STUDY_PRIORITIES = ['High', 'Medium', 'Low'] as const;
export const ALLOWED_REVISION_DIFFICULTIES = ['easy', 'medium', 'hard'] as const;
export const ALLOWED_REVISION_STATUSES = ['scheduled', 'due', 'overdue', 'mastered'] as const;
export const ALLOWED_MISTAKE_SEVERITIES = ['High', 'Medium', 'Low'] as const;
export const ALLOWED_HABIT_FREQUENCIES = ['daily', 'weekly', 'custom'] as const;

export function parsePositiveInt(
  value: unknown,
  min = 1,
  max = Number.MAX_SAFE_INTEGER
): number | null {
  if (value === null || value === undefined || typeof value === 'boolean') return null;
  if (typeof value === 'string' && value.trim() === '') return null;
  const num = Number(value);
  if (!Number.isFinite(num) || !Number.isInteger(num)) return null;
  if (num < min || num > max) return null;
  return num;
}

export function parseNonNegativeInt(
  value: unknown,
  max = Number.MAX_SAFE_INTEGER
): number | null {
  return parsePositiveInt(value, 0, max);
}

export function parseNonEmptyString(value: unknown, maxLen = 500): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  if (!trimmed || trimmed.length > maxLen) return null;
  return trimmed;
}

export function parseOptionalString(value: unknown, maxLen = 2000): string | null {
  if (value === undefined || value === null) return '';
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  if (trimmed.length > maxLen) return null;
  return trimmed;
}

/**
 * Neutralizes spreadsheet formula injection (OWASP CSV/Sheets CWE-1236)
 * when writing strings under USER_ENTERED mode.
 */
export function escapeSheetFormulaCell(value: string): string {
  const str = String(value ?? '');
  return /^[=+\-@\t\r]/.test(str) ? `'${str}` : str;
}

export function parseIsoDate(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) return null;
  const parsed = new Date(`${trimmed}T00:00:00.000Z`);
  if (Number.isNaN(parsed.getTime())) return null;
  // Reject rollovers such as 2026-02-31
  if (parsed.toISOString().slice(0, 10) !== trimmed) return null;
  return trimmed;
}

export function parseEnum<T extends string>(
  value: unknown,
  allowed: readonly T[]
): T | null {
  if (typeof value !== 'string') return null;
  return (allowed as readonly string[]).includes(value) ? (value as T) : null;
}

export interface SubtaskPayload {
  id: string;
  title: string;
  done: boolean;
}

export function parseSubtasks(raw: unknown): SubtaskPayload[] | null {
  if (!Array.isArray(raw)) return null;
  if (raw.length > 50) return null;
  const parsed: SubtaskPayload[] = [];
  for (const item of raw) {
    if (!item || typeof item !== 'object') return null;
    const rec = item as Record<string, unknown>;
    const title = parseNonEmptyString(rec.title, 200);
    if (!title) return null;
    const id =
      typeof rec.id === 'string' && rec.id.trim()
        ? rec.id.trim().slice(0, 80)
        : `sub_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
    parsed.push({
      id,
      title,
      done: Boolean(rec.done),
    });
  }
  return parsed;
}

export function computeNextRecurrenceDueDate(
  currentDueDate: string | null,
  recurrence: 'daily' | 'weekly' | 'monthly'
): string {
  return (
    computeSafeNextRecurrenceDueDate(currentDueDate, recurrence) ||
    getTodayDateString(DEFAULT_TIMEZONE)
  );
}

const MAX_STREAK_DAYS = 365;

/**
 * Timezone-aware bounded streak calculation using calendar-day arithmetic.
 * Accurately tracks consecutive work sessions mapped to target timezone days.
 */
export function calculateBoundedStreakDays(
  sessions: ReadonlyArray<Pick<FocusSession, 'startedAt' | 'completed' | 'mode'>>,
  timezoneOrRefDate: string | Date = DEFAULT_TIMEZONE,
  referenceDate: Date = new Date()
): number {
  const tz = typeof timezoneOrRefDate === 'string' ? timezoneOrRefDate : DEFAULT_TIMEZONE;
  const refDate = timezoneOrRefDate instanceof Date ? timezoneOrRefDate : referenceDate;
  return calculateFocusStreakDays(sessions, tz, refDate);
}

/**
 * Deterministic all-time longest consecutive streak (non-punitive historical record).
 */
export function computeBestStreakDays(
  sessions: ReadonlyArray<Pick<FocusSession, 'startedAt' | 'completed' | 'mode'>>,
  timezone: string = DEFAULT_TIMEZONE
): number {
  return computeBestStreakDaysTz(sessions, timezone);
}
