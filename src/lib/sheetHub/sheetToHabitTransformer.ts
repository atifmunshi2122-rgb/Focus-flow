/**
 * FocusFlow & Finance — Deterministic Sheet Hub → Habit Tracker Transformer
 *
 * 100% zero-AI, deterministic parser supporting two common Habit Sheet layouts:
 * 1. Matrix Grid Layout: rows = habits, columns = dates (1..31, Day 1..31, Nov 1, YYYY-MM-DD)
 * 2. List / Log Layout: columns = Habit, Category, Frequency, Target, Date, Done
 *
 * Automatically filters out summary/total/formula rows, normalizes dates to YYYY-MM-DD,
 * computes consecutive-day streaks, and matches existing Habits to prevent duplicates.
 */

import type { SheetColumnMapping, SheetSyncedRow, SheetTabSchema } from '../../types/sheetHub.ts';
import type { Habit } from '../../types/index.ts';

export type HabitSheetLayout = 'matrix' | 'log';
export type HabitImportMergeMode = 'merge' | 'replace';

export interface HabitTabImportConfig {
  tabId: string;
  sheetId: string | number;
  sheetTitle: string;
  isIncluded: boolean;
  layout: HabitSheetLayout;
  detectedLayout: HabitSheetLayout;
  detectedDateColsCount: number;
  monthYear: string; // YYYY-MM used when Matrix columns are day numbers (1..31)
  defaultCategory: string;
  rowCount: number;
}

export interface PreviewHabitItem {
  title: string;
  description: string;
  category: string;
  color: string;
  frequency: 'daily' | 'weekly' | 'custom';
  targetDaysPerWeek: number;
  incomingDates: string[];
  mergedDates: string[];
  newDatesAddedCount: number;
  bestStreakDays: number;
  isExistingMatch: boolean;
  existingHabitId?: string;
  sourceTabTitle: string;
  sourceSheetId: string | number;
  sourceRowId?: string;
  sourceMappingKey: string;
  sourceLayout: HabitSheetLayout;
}

export interface HabitImportPreviewSummary {
  tabsSelectedCount: number;
  habitsToCreateCount: number;
  habitsToUpdateCount: number;
  unchangedHabitsCount: number;
  totalIncomingCheckins: number;
  newCheckinsAddedCount: number;
  skippedRowsCount: number;
}

export interface HabitImportPreviewResult {
  summary: HabitImportPreviewSummary;
  habits: PreviewHabitItem[];
}

export const HABIT_COLOR_PRESETS = [
  '#10b981', // Emerald
  '#3b82f6', // Blue
  '#8b5cf6', // Purple
  '#f59e0b', // Amber
  '#ec4899', // Pink
  '#06b6d4', // Cyan
  '#ef4444', // Rose
  '#6366f1', // Indigo
];

const MONTH_NAME_MAP: Record<string, number> = {
  jan: 1, january: 1,
  feb: 2, february: 2,
  mar: 3, march: 3,
  apr: 4, april: 4,
  may: 5,
  jun: 6, june: 6,
  jul: 7, july: 7,
  aug: 8, august: 8,
  sep: 9, sept: 9, september: 9,
  oct: 10, october: 10,
  nov: 11, november: 11,
  dec: 12, december: 12,
};

export function normalizeHabitKey(val: unknown): string {
  return String(val ?? '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

export function buildHabitSourceMappingKey(
  spreadsheetId: string,
  sheetId: string | number,
  habitTitle: string
): string {
  const norm = normalizeHabitKey(habitTitle).replace(/\s+/g, '_');
  return `${spreadsheetId}:${sheetId}:${norm}`;
}

export function parseHabitBoolean(val: unknown): boolean {
  if (typeof val === 'boolean') return val;
  if (typeof val === 'number') return val > 0;
  if (typeof val !== 'string') return false;
  const norm = val.trim().toLowerCase();
  if (!norm) return false;
  return (
    norm === 'true' ||
    norm === 'yes' ||
    norm === 'y' ||
    norm === '1' ||
    norm === '✓' ||
    norm === '✔' ||
    norm === '☑' ||
    norm === '✅' ||
    norm === 'x' ||
    norm === 'done' ||
    norm === 'completed' ||
    norm === 'complete'
  );
}

export function isOverviewOrSummaryTab(sheetTitle: string, role?: string): boolean {
  if (
    role === 'overview' ||
    role === 'summary' ||
    role === 'instructions' ||
    role === 'metadata' ||
    role === 'ignored'
  ) {
    return true;
  }
  const norm = sheetTitle.trim().toLowerCase();
  return /^(overview|summary|dashboard|index|readme|instructions|stats|analytics|chart|charts)$/i.test(norm);
}

export function isSummaryOrInvalidHabitTitle(rawTitle: unknown): boolean {
  if (rawTitle === null || rawTitle === undefined) return true;
  const trimmed = String(rawTitle).trim();
  if (!trimmed) return true;
  if (trimmed.startsWith('=')) return true;
  // Pure number, percentage, or fraction like "12", "85%", "12/30"
  if (/^\d+(\.\d+)?\s*%?$/.test(trimmed)) return true;
  if (/^\d+\s*\/\s*\d+$/.test(trimmed)) return true;

  const lower = trimmed.toLowerCase();
  if (
    /^(total|totals|grand total|summary|overall|average|avg|completion|completion\s*%|progress|score|streak|daily total|weekly total|monthly total|habits completed|completed|done|percentage|rate|notes?)$/i.test(
      lower
    )
  ) {
    return true;
  }
  if (/^(total|summary|average)\s+/.test(lower) && lower.length <= 28) {
    return true;
  }
  return false;
}

function pad2(n: number): string {
  return String(n).padStart(2, '0');
}

function isValidCalendarDate(year: number, month: number, day: number): boolean {
  if (year < 1990 || year > 2100 || month < 1 || month > 12 || day < 1 || day > 31) return false;
  const d = new Date(Date.UTC(year, month - 1, day));
  return d.getUTCFullYear() === year && d.getUTCMonth() === month - 1 && d.getUTCDate() === day;
}

/**
 * Infers YYYY-MM from a tab title such as "Nov 2026", "November '26", "2026-11", or "11/2026".
 */
export function inferMonthYearFromTitle(
  sheetTitle: string,
  fallbackNow: Date = new Date()
): string {
  const defaultYear = fallbackNow.getFullYear();
  const defaultMonth = fallbackNow.getMonth() + 1;
  const trimmed = (sheetTitle || '').trim();

  // Pattern 1: YYYY-MM or YYYY/MM
  const isoMatch = trimmed.match(/\b(20\d{2})[-/](\d{1,2})\b/);
  if (isoMatch) {
    const y = Number(isoMatch[1]);
    const m = Number(isoMatch[2]);
    if (m >= 1 && m <= 12) return `${y}-${pad2(m)}`;
  }

  // Pattern 2: Month name + optional year ("Nov 2026", "November '26", "Nov")
  const monthRegex = new RegExp(
    `\\b(${Object.keys(MONTH_NAME_MAP).join('|')})\\b(?:[\\s,'-]+(?:'?(\\d{2,4})))?`,
    'i'
  );
  const nameMatch = trimmed.match(monthRegex);
  if (nameMatch) {
    const m = MONTH_NAME_MAP[nameMatch[1].toLowerCase()];
    let y = defaultYear;
    if (nameMatch[2]) {
      const parsedY = Number(nameMatch[2]);
      y = parsedY < 100 ? 2000 + parsedY : parsedY;
    }
    return `${y}-${pad2(m)}`;
  }

  return `${defaultYear}-${pad2(defaultMonth)}`;
}

/**
 * Parses a sheet column header or date cell value into YYYY-MM-DD.
 * Supports:
 * - YYYY-MM-DD / YYYY/MM/DD
 * - Day number: "1".."31", "01".."31", "Day 1", "D1", "1 (Mon)", "Mon 1"
 * - Month + Day: "Nov 5", "5 Nov", "Nov-05", "5-Nov-2026"
 * - Numeric DD/MM/YYYY or MM/DD/YYYY (defaults to DD/MM/YYYY when first part > 12)
 */
export function parseDateToIso(
  raw: unknown,
  defaultYear: number,
  defaultMonth: number
): string | null {
  if (raw === null || raw === undefined) return null;
  const str = String(raw).trim();
  if (!str) return null;

  // 1. ISO YYYY-MM-DD or YYYY/MM/DD
  const iso = str.match(/^(\d{4})[-/](\d{1,2})[-/](\d{1,2})(?:[T\s].*)?$/);
  if (iso) {
    const y = Number(iso[1]);
    const m = Number(iso[2]);
    const d = Number(iso[3]);
    return isValidCalendarDate(y, m, d) ? `${y}-${pad2(m)}-${pad2(d)}` : null;
  }

  // 2. Pure day number "1".."31" or "Day 1" / "D1" / "1 Mon" / "Mon 1"
  const dayOnly = str.match(/^(?:(?:day|d)\s*#?\s*)?(\d{1,2})(?:\s*[-–/(]?\s*(?:mon|tue|wed|thu|fri|sat|sun)[a-z]*\)?)?$/i);
  if (dayOnly) {
    const day = Number(dayOnly[1]);
    return isValidCalendarDate(defaultYear, defaultMonth, day)
      ? `${defaultYear}-${pad2(defaultMonth)}-${pad2(day)}`
      : null;
  }

  const weekdayThenDay = str.match(/^(?:mon|tue|wed|thu|fri|sat|sun)[a-z]*[\s,.-]+(\d{1,2})$/i);
  if (weekdayThenDay) {
    const day = Number(weekdayThenDay[1]);
    return isValidCalendarDate(defaultYear, defaultMonth, day)
      ? `${defaultYear}-${pad2(defaultMonth)}-${pad2(day)}`
      : null;
  }

  // 3. "Nov 5", "Nov 5, 2026", "Nov-05"
  const monthFirst = str.match(
    new RegExp(`^(${Object.keys(MONTH_NAME_MAP).join('|')})[\\s.-]+(\\d{1,2})(?:[\\s,.-]+(\\d{2,4}))?$`, 'i')
  );
  if (monthFirst) {
    const m = MONTH_NAME_MAP[monthFirst[1].toLowerCase()];
    const d = Number(monthFirst[2]);
    let y = defaultYear;
    if (monthFirst[3]) {
      const py = Number(monthFirst[3]);
      y = py < 100 ? 2000 + py : py;
    }
    return isValidCalendarDate(y, m, d) ? `${y}-${pad2(m)}-${pad2(d)}` : null;
  }

  // 4. "5 Nov", "05-Nov-2026"
  const dayFirst = str.match(
    new RegExp(`^(\\d{1,2})[\\s.-]+(${Object.keys(MONTH_NAME_MAP).join('|')})(?:[\\s,.-]+(\\d{2,4}))?$`, 'i')
  );
  if (dayFirst) {
    const d = Number(dayFirst[1]);
    const m = MONTH_NAME_MAP[dayFirst[2].toLowerCase()];
    let y = defaultYear;
    if (dayFirst[3]) {
      const py = Number(dayFirst[3]);
      y = py < 100 ? 2000 + py : py;
    }
    return isValidCalendarDate(y, m, d) ? `${y}-${pad2(m)}-${pad2(d)}` : null;
  }

  // 5. Numeric slash/dash date: DD/MM/YYYY or MM/DD/YYYY or DD/MM
  const numSlash = str.match(/^(\d{1,2})[-/](\d{1,2})(?:[-/](\d{2,4}))?$/);
  if (numSlash) {
    const a = Number(numSlash[1]);
    const b = Number(numSlash[2]);
    let y = defaultYear;
    if (numSlash[3]) {
      const py = Number(numSlash[3]);
      y = py < 100 ? 2000 + py : py;
    }
    // If a > 12 it must be DD/MM; if b > 12 it must be MM/DD; otherwise prefer DD/MM if b matches defaultMonth
    let m: number;
    let d: number;
    if (a > 12) {
      d = a;
      m = b;
    } else if (b > 12) {
      m = a;
      d = b;
    } else if (b === defaultMonth) {
      d = a;
      m = b;
    } else {
      m = a;
      d = b;
    }
    return isValidCalendarDate(y, m, d) ? `${y}-${pad2(m)}-${pad2(d)}` : null;
  }

  return null;
}

export function computeBestStreak(dates: string[]): number {
  if (!dates || dates.length === 0) return 0;
  const uniqueSorted = Array.from(new Set(dates)).sort();
  let best = 1;
  let current = 1;

  for (let i = 1; i < uniqueSorted.length; i++) {
    const prev = new Date(`${uniqueSorted[i - 1]}T00:00:00Z`).getTime();
    const curr = new Date(`${uniqueSorted[i]}T00:00:00Z`).getTime();
    const diffDays = Math.round((curr - prev) / 86400000);
    if (diffDays === 1) {
      current += 1;
      if (current > best) best = current;
    } else if (diffDays > 1) {
      current = 1;
    }
  }
  return best;
}

function normalizeFrequency(
  rawFreq: unknown,
  rawTarget: unknown
): { frequency: 'daily' | 'weekly' | 'custom'; targetDaysPerWeek: number } {
  const fStr = String(rawFreq ?? '').trim().toLowerCase();
  const parsedTarget = Number(String(rawTarget ?? '').replace(/[^0-9.]/g, ''));

  if (fStr.includes('week')) {
    const target = Number.isFinite(parsedTarget) && parsedTarget >= 1 && parsedTarget <= 7
      ? Math.round(parsedTarget)
      : 3;
    return { frequency: 'weekly', targetDaysPerWeek: target };
  }
  if (fStr.includes('custom') || fStr.includes('mon') || fStr.includes('weekday')) {
    const target = Number.isFinite(parsedTarget) && parsedTarget >= 1 && parsedTarget <= 7
      ? Math.round(parsedTarget)
      : 5;
    return { frequency: 'custom', targetDaysPerWeek: target };
  }
  if (Number.isFinite(parsedTarget) && parsedTarget >= 1 && parsedTarget < 7) {
    return { frequency: 'weekly', targetDaysPerWeek: Math.round(parsedTarget) };
  }
  return { frequency: 'daily', targetDaysPerWeek: 7 };
}

function getDateColumnsForTab(
  columns: SheetColumnMapping[],
  defaultYear: number,
  defaultMonth: number
): Array<{ col: SheetColumnMapping; dateIso: string }> {
  const results: Array<{ col: SheetColumnMapping; dateIso: string }> = [];
  for (const col of columns) {
    if (col.inferredType === 'formula') continue;
    const header = (col.headerName || col.displayName || '').trim();
    const dateIso = parseDateToIso(header, defaultYear, defaultMonth);
    if (dateIso) {
      results.push({ col, dateIso });
    }
  }
  return results;
}

export function detectHabitTabConfig(
  tab: SheetTabSchema,
  fallbackNow: Date = new Date()
): HabitTabImportConfig {
  const monthYear = inferMonthYearFromTitle(tab.sheetTitle, fallbackNow);
  const [yStr, mStr] = monthYear.split('-');
  const year = Number(yStr) || fallbackNow.getFullYear();
  const month = Number(mStr) || fallbackNow.getMonth() + 1;

  const dateCols = getDateColumnsForTab(tab.columns || [], year, month);
  const detectedLayout: HabitSheetLayout = dateCols.length >= 3 ? 'matrix' : 'log';
  const isOverview = isOverviewOrSummaryTab(tab.sheetTitle, tab.role);

  return {
    tabId: tab.id,
    sheetId: tab.sheetId,
    sheetTitle: tab.sheetTitle,
    isIncluded: !isOverview,
    layout: detectedLayout,
    detectedLayout,
    detectedDateColsCount: dateCols.length,
    monthYear,
    defaultCategory: 'General',
    rowCount: tab.rowCount || 0,
  };
}

function findColumnByRegex(columns: SheetColumnMapping[], regex: RegExp): SheetColumnMapping | undefined {
  return columns.find((c) => regex.test((c.headerName || c.displayName || '').trim()));
}

function parseTabRowsToHabits(input: {
  tab: SheetTabSchema;
  config: HabitTabImportConfig;
  rows: SheetSyncedRow[];
  spreadsheetId: string;
}): {
  parsed: Array<{
    title: string;
    description: string;
    category: string;
    frequency: 'daily' | 'weekly' | 'custom';
    targetDaysPerWeek: number;
    dates: Set<string>;
    sourceRowId?: string;
    sourceMappingKey: string;
    sourceSheetId: string | number;
    sourceTabTitle: string;
    sourceLayout: HabitSheetLayout;
  }>;
  skippedRowsCount: number;
} {
  const { tab, config, rows, spreadsheetId } = input;
  const cols = tab.columns || [];
  const [yStr, mStr] = (config.monthYear || '').split('-');
  const now = new Date();
  const year = Number(yStr) || now.getFullYear();
  const month = Number(mStr) || now.getMonth() + 1;

  const titleCol =
    findColumnByRegex(cols, /^(habit|habit\s*name|title|name|routine|activity|task|item)$/i) ||
    cols.find((c) => c.semanticRole === 'title') ||
    cols.find((c) => c.inferredType === 'text');

  const categoryCol = findColumnByRegex(cols, /^(category|group|type|domain|area|tag)$/i);
  const descCol = findColumnByRegex(cols, /^(description|notes?|details?|remarks?)$/i);
  const freqCol = findColumnByRegex(cols, /^(frequency|freq|schedule|cadence|repeat)$/i);
  const targetCol = findColumnByRegex(cols, /^(target|goal|days\s*\/\s*week|days\s*per\s*week|weekly\s*target)$/i);

  let skippedRowsCount = 0;

  if (config.layout === 'matrix') {
    const dateCols = getDateColumnsForTab(cols, year, month);
    const byKey = new Map<
      string,
      {
        title: string;
        description: string;
        category: string;
        frequency: 'daily' | 'weekly' | 'custom';
        targetDaysPerWeek: number;
        dates: Set<string>;
        sourceRowId?: string;
        sourceMappingKey: string;
        sourceSheetId: string | number;
        sourceTabTitle: string;
        sourceLayout: HabitSheetLayout;
      }
    >();

    for (const row of rows) {
      const vals = row.values || row.cells || {};
      const rawTitle = titleCol ? vals[titleCol.fieldKey] : Object.values(vals).find((v) => typeof v === 'string' && v.trim());
      if (isSummaryOrInvalidHabitTitle(rawTitle)) {
        skippedRowsCount++;
        continue;
      }
      const title = String(rawTitle).trim();
      const normKey = normalizeHabitKey(title);
      if (!normKey) {
        skippedRowsCount++;
        continue;
      }

      const category = (categoryCol ? String(vals[categoryCol.fieldKey] ?? '').trim() : '') || config.defaultCategory || 'General';
      const description = descCol ? String(vals[descCol.fieldKey] ?? '').trim() : '';
      const { frequency, targetDaysPerWeek } = normalizeFrequency(
        freqCol ? vals[freqCol.fieldKey] : undefined,
        targetCol ? vals[targetCol.fieldKey] : undefined
      );

      let entry = byKey.get(normKey);
      if (!entry) {
        entry = {
          title,
          description,
          category,
          frequency,
          targetDaysPerWeek,
          dates: new Set<string>(),
          sourceRowId: row.rowUid,
          sourceMappingKey: buildHabitSourceMappingKey(spreadsheetId, tab.sheetId, title),
          sourceSheetId: tab.sheetId,
          sourceTabTitle: tab.sheetTitle,
          sourceLayout: 'matrix',
        };
        byKey.set(normKey, entry);
      }

      for (const { col, dateIso } of dateCols) {
        if (parseHabitBoolean(vals[col.fieldKey])) {
          entry.dates.add(dateIso);
        }
      }
    }

    return { parsed: Array.from(byKey.values()), skippedRowsCount };
  }

  // LOG / LIST LAYOUT
  const dateCol =
    findColumnByRegex(cols, /^(date|day|completed\s*date|logged\s*on|timestamp)$/i) ||
    cols.find((c) => c.inferredType === 'date');
  const doneCol =
    findColumnByRegex(cols, /^(done|completed|status|checked|chk|tick|value)$/i) ||
    cols.find((c) => c.semanticRole === 'done' || c.inferredType === 'checkbox' || c.inferredType === 'boolean');

  const byKey = new Map<
    string,
    {
      title: string;
      description: string;
      category: string;
      frequency: 'daily' | 'weekly' | 'custom';
      targetDaysPerWeek: number;
      dates: Set<string>;
      sourceRowId?: string;
      sourceMappingKey: string;
      sourceSheetId: string | number;
      sourceTabTitle: string;
      sourceLayout: HabitSheetLayout;
    }
  >();

  for (const row of rows) {
    const vals = row.values || row.cells || {};
    const rawTitle = titleCol ? vals[titleCol.fieldKey] : Object.values(vals).find((v) => typeof v === 'string' && v.trim());
    if (isSummaryOrInvalidHabitTitle(rawTitle)) {
      skippedRowsCount++;
      continue;
    }
    const title = String(rawTitle).trim();
    const normKey = normalizeHabitKey(title);
    if (!normKey) {
      skippedRowsCount++;
      continue;
    }

    const category = (categoryCol ? String(vals[categoryCol.fieldKey] ?? '').trim() : '') || config.defaultCategory || 'General';
    const description = descCol ? String(vals[descCol.fieldKey] ?? '').trim() : '';
    const { frequency, targetDaysPerWeek } = normalizeFrequency(
      freqCol ? vals[freqCol.fieldKey] : undefined,
      targetCol ? vals[targetCol.fieldKey] : undefined
    );

    let entry = byKey.get(normKey);
    if (!entry) {
      entry = {
        title,
        description,
        category,
        frequency,
        targetDaysPerWeek,
        dates: new Set<string>(),
        sourceRowId: row.rowUid,
        sourceMappingKey: buildHabitSourceMappingKey(spreadsheetId, tab.sheetId, title),
        sourceSheetId: tab.sheetId,
        sourceTabTitle: tab.sheetTitle,
        sourceLayout: 'log',
      };
      byKey.set(normKey, entry);
    }

    const rawDate = dateCol ? vals[dateCol.fieldKey] : null;
    const parsedDate = parseDateToIso(rawDate, year, month);
    const isDone = doneCol ? parseHabitBoolean(vals[doneCol.fieldKey]) : Boolean(parsedDate);

    if (parsedDate && isDone) {
      entry.dates.add(parsedDate);
    }
  }

  return { parsed: Array.from(byKey.values()), skippedRowsCount };
}

export function generateHabitImportPreview(input: {
  tabs: Array<{
    tab: SheetTabSchema;
    config: HabitTabImportConfig;
    rows: SheetSyncedRow[];
  }>;
  existingHabits: Habit[];
  spreadsheetId: string;
  mergeMode: HabitImportMergeMode;
}): HabitImportPreviewResult {
  const { tabs, existingHabits, spreadsheetId, mergeMode } = input;
  const activeExisting = (existingHabits || []).filter((h) => !h.deletedAt);

  // Lookup existing habits by sourceMappingKey first, then normalized title
  const existingBySourceKey = new Map<string, Habit>();
  const existingByTitle = new Map<string, Habit>();
  for (const h of activeExisting) {
    if (h.sourceMappingKey) existingBySourceKey.set(h.sourceMappingKey, h);
    const normTitle = normalizeHabitKey(h.title);
    if (normTitle && !existingByTitle.has(normTitle)) {
      existingByTitle.set(normTitle, h);
    }
  }

  // Merge habits with the same title across multiple selected tabs (e.g. Oct 2026 + Nov 2026 tabs!)
  const combinedByTitle = new Map<
    string,
    {
      title: string;
      description: string;
      category: string;
      frequency: 'daily' | 'weekly' | 'custom';
      targetDaysPerWeek: number;
      dates: Set<string>;
      sourceRowId?: string;
      sourceMappingKey: string;
      sourceSheetId: string | number;
      sourceTabTitle: string;
      sourceLayout: HabitSheetLayout;
    }
  >();

  let skippedRowsCount = 0;

  for (const item of tabs) {
    if (!item.config.isIncluded) continue;
    const res = parseTabRowsToHabits({
      tab: item.tab,
      config: item.config,
      rows: item.rows,
      spreadsheetId,
    });
    skippedRowsCount += res.skippedRowsCount;

    for (const h of res.parsed) {
      const normTitle = normalizeHabitKey(h.title);
      const prev = combinedByTitle.get(normTitle);
      if (!prev) {
        combinedByTitle.set(normTitle, h);
      } else {
        for (const d of h.dates) prev.dates.add(d);
        if (!prev.description && h.description) prev.description = h.description;
        if (prev.category === 'General' && h.category !== 'General') prev.category = h.category;
      }
    }
  }

  const previewHabits: PreviewHabitItem[] = [];
  let habitsToCreateCount = 0;
  let habitsToUpdateCount = 0;
  let unchangedHabitsCount = 0;
  let totalIncomingCheckins = 0;
  let newCheckinsAddedCount = 0;

  let colorIdx = 0;
  for (const parsed of combinedByTitle.values()) {
    const incomingDates = Array.from(parsed.dates).sort();
    totalIncomingCheckins += incomingDates.length;

    const existing =
      existingBySourceKey.get(parsed.sourceMappingKey) ||
      existingByTitle.get(normalizeHabitKey(parsed.title));

    let mergedDates: string[];
    let newDatesAddedCount = 0;

    if (existing) {
      const existingSet = new Set(existing.completedDates || []);
      if (mergeMode === 'merge') {
        const union = new Set<string>(existingSet);
        for (const d of incomingDates) {
          if (!union.has(d)) {
            union.add(d);
            newDatesAddedCount++;
          }
        }
        mergedDates = Array.from(union).sort();
      } else {
        mergedDates = incomingDates;
        newDatesAddedCount = incomingDates.filter((d) => !existingSet.has(d)).length;
      }

      const datesChanged =
        mergedDates.length !== (existing.completedDates || []).length ||
        mergedDates.some((d, i) => d !== [...(existing.completedDates || [])].sort()[i]);

      if (datesChanged || !existing.sourceMappingKey) {
        habitsToUpdateCount++;
      } else {
        unchangedHabitsCount++;
      }
    } else {
      mergedDates = incomingDates;
      newDatesAddedCount = incomingDates.length;
      habitsToCreateCount++;
    }

    newCheckinsAddedCount += newDatesAddedCount;

    const bestStreakDays = Math.max(
      existing?.bestStreakDays || 0,
      computeBestStreak(mergedDates)
    );

    previewHabits.push({
      title: parsed.title,
      description: parsed.description || existing?.description || '',
      category: existing?.category || parsed.category || 'General',
      color: existing?.color || HABIT_COLOR_PRESETS[colorIdx++ % HABIT_COLOR_PRESETS.length],
      frequency: existing?.frequency || parsed.frequency,
      targetDaysPerWeek: existing?.targetDaysPerWeek || parsed.targetDaysPerWeek,
      incomingDates,
      mergedDates,
      newDatesAddedCount,
      bestStreakDays,
      isExistingMatch: Boolean(existing),
      existingHabitId: existing?.id,
      sourceTabTitle: parsed.sourceTabTitle,
      sourceSheetId: parsed.sourceSheetId,
      sourceRowId: parsed.sourceRowId,
      sourceMappingKey: parsed.sourceMappingKey,
      sourceLayout: parsed.sourceLayout,
    });
  }

  return {
    summary: {
      tabsSelectedCount: tabs.filter((t) => t.config.isIncluded).length,
      habitsToCreateCount,
      habitsToUpdateCount,
      unchangedHabitsCount,
      totalIncomingCheckins,
      newCheckinsAddedCount,
      skippedRowsCount,
    },
    habits: previewHabits,
  };
}
