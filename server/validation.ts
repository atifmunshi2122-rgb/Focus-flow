import type { FocusSession } from './db.js';

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
  const baseStr = currentDueDate && parseIsoDate(currentDueDate)
    ? currentDueDate
    : new Date().toISOString().slice(0, 10);
  const d = new Date(`${baseStr}T00:00:00.000Z`);
  if (recurrence === 'daily') {
    d.setUTCDate(d.getUTCDate() + 1);
  } else if (recurrence === 'weekly') {
    d.setUTCDate(d.getUTCDate() + 7);
  } else {
    d.setUTCMonth(d.getUTCMonth() + 1);
  }
  return d.toISOString().slice(0, 10);
}

const MAX_STREAK_DAYS = 365;

/**
 * Bounded O(N) streak calculation using a Set of valid YYYY-MM-DD dates.
 * Caps iteration strictly to MAX_STREAK_DAYS so corrupt session records can never hang Node.
 */
export function calculateBoundedStreakDays(
  sessions: ReadonlyArray<Pick<FocusSession, 'startedAt' | 'completed' | 'mode'>>,
  referenceDate: Date = new Date()
): number {
  const completedWorkDates = new Set<string>();

  for (const session of sessions) {
    if (!session || !session.completed || session.mode !== 'work') continue;
    if (typeof session.startedAt !== 'string' || session.startedAt.length < 10) continue;
    const candidateDate = session.startedAt.slice(0, 10);
    if (parseIsoDate(candidateDate)) {
      completedWorkDates.add(candidateDate);
    }
  }

  if (completedWorkDates.size === 0) return 0;

  const formatUtcDate = (d: Date) => d.toISOString().slice(0, 10);
  const baseUtc = new Date(
    Date.UTC(referenceDate.getUTCFullYear(), referenceDate.getUTCMonth(), referenceDate.getUTCDate())
  );

  const todayStr = formatUtcDate(baseUtc);
  const yesterdayUtc = new Date(baseUtc);
  yesterdayUtc.setUTCDate(yesterdayUtc.getUTCDate() - 1);
  const yesterdayStr = formatUtcDate(yesterdayUtc);

  let startOffset = -1;
  if (completedWorkDates.has(todayStr)) {
    startOffset = 0;
  } else if (completedWorkDates.has(yesterdayStr)) {
    startOffset = 1;
  } else {
    return 0;
  }

  let streak = 0;
  for (let i = 0; i < MAX_STREAK_DAYS; i++) {
    const cursor = new Date(baseUtc);
    cursor.setUTCDate(cursor.getUTCDate() - (startOffset + i));
    if (completedWorkDates.has(formatUtcDate(cursor))) {
      streak++;
    } else {
      break;
    }
  }

  return streak;
}

/**
 * Deterministic all-time longest consecutive streak (non-punitive historical record).
 */
export function computeBestStreakDays(
  sessions: ReadonlyArray<Pick<FocusSession, 'startedAt' | 'completed' | 'mode'>>
): number {
  const uniqueDates = new Set<string>();
  for (const s of sessions) {
    if (!s || !s.completed || s.mode !== 'work' || typeof s.startedAt !== 'string') continue;
    const dateStr = s.startedAt.slice(0, 10);
    if (parseIsoDate(dateStr)) {
      uniqueDates.add(dateStr);
    }
  }
  if (uniqueDates.size === 0) return 0;

  const sorted = Array.from(uniqueDates).sort();
  let best = 1;
  let current = 1;

  for (let i = 1; i < sorted.length; i++) {
    const prevMs = Date.parse(`${sorted[i - 1]}T00:00:00.000Z`);
    const currMs = Date.parse(`${sorted[i]}T00:00:00.000Z`);
    const diffDays = Math.round((currMs - prevMs) / 86_400_000);
    if (diffDays === 1) {
      current++;
      if (current > best) best = current;
    } else if (diffDays > 1) {
      current = 1;
    }
  }

  return best;
}
