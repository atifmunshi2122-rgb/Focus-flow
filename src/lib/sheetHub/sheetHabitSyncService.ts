/**
 * FocusFlow & Finance — Deterministic Habit Tracker ↔ Google Sheets Two-Way Sync Service (Phase 2)
 *
 * 100% zero-AI, deterministic two-way sync:
 * - Direction A (Habit Tracker → Sheet): Toggling a date on a sheet-linked Habit updates
 *   the local Sheet Hub cache and pushes TRUE/FALSE to the exact (rowNumber, colLetter)
 *   cell in Google Sheets via `api.sheetHubPushCells`, queuing safely if OAuth is expired.
 * - Direction B (Sheet Hub Checkbox → Habit Tracker): Toggling a date/done checkbox inside
 *   Sheet Hub immediately updates the matching Habit's `completedDates` & `bestStreakDays`.
 * - Direction C (Google Sheets Pull → Habit Tracker): Manual or post-pull reconciliation
 *   merges external Google Sheet checkbox edits into linked Habits without duplicates.
 */

import { api } from '../api.ts';
import { clientDataCache } from '../dataCache.ts';
import { getSheetHubWriteAccessToken } from '../firebase.ts';
import { getGisDualCopyToken } from '../googleAuthGis.ts';
import { sheetHubStore } from './sheetHubStore.ts';
import {
  computeBestStreak,
  detectHabitTabConfig,
  generateHabitImportPreview,
  inferMonthYearFromTitle,
  isOverviewOrSummaryTab,
  normalizeHabitKey,
  parseDateToIso,
} from './sheetToHabitTransformer.ts';
import type {
  SheetColumnMapping,
  SheetConnection,
  SheetSyncedRow,
  SheetTabSchema,
} from '../../types/sheetHub.ts';
import type { Habit } from '../../types/index.ts';

export interface PendingHabitWriteback {
  id: string;
  userId: string;
  connectionId: string;
  spreadsheetId: string;
  sheetTitle: string;
  rowNumber: number;
  colLetter: string;
  cellRef: string;
  habitId: string;
  habitTitle: string;
  dateStr: string;
  value: boolean;
  createdAt: string;
  attempts: number;
  lastAttemptAt: string | null;
  lastError: string | null;
}

export interface HabitSyncResult {
  status: 'synced' | 'queued' | 'read_only' | 'no_connection' | 'no_matching_cell' | 'error';
  synced: boolean;
  sheetTitle?: string;
  cellRef?: string;
  error?: string;
}

export interface HabitSheetsPullReport {
  success: boolean;
  syncedAt: string;
  updatedHabitsCount: number;
  flushedWritebacksCount: number;
  error: string | null;
}

const PENDING_HABIT_WRITEBACK_KEY = (userId: string) => `ff_pending_habit_writeback_${userId}`;
const MAX_HABIT_WRITEBACK_ATTEMPTS = 5;

function classifyHabitPushError(err: unknown): {
  isAuthErr: boolean;
  isPermanentErr: boolean;
  message: string;
} {
  const message = err instanceof Error ? err.message : String(err);
  const isAuthErr =
    message.includes('401') ||
    message.includes('SHEETS_AUTH_REQUIRED') ||
    message.includes('UNAUTHENTICATED') ||
    message.includes('invalid_grant');
  const isPermanentErr =
    !isAuthErr &&
    (/\b400\b/.test(message) ||
      /\b403\b/.test(message) ||
      /\b404\b/.test(message) ||
      message.includes('NOT_FOUND') ||
      message.includes('PERMISSION_DENIED') ||
      message.includes('INVALID_ARGUMENT'));
  return { isAuthErr, isPermanentErr, message };
}

function readPendingQueue(userId: string): PendingHabitWriteback[] {
  if (typeof window === 'undefined' || !window.localStorage) return [];
  try {
    const raw = window.localStorage.getItem(PENDING_HABIT_WRITEBACK_KEY(userId));
    return raw ? (JSON.parse(raw) as PendingHabitWriteback[]) : [];
  } catch {
    return [];
  }
}

function writePendingQueue(userId: string, queue: PendingHabitWriteback[]): void {
  if (typeof window === 'undefined' || !window.localStorage) return;
  try {
    window.localStorage.setItem(PENDING_HABIT_WRITEBACK_KEY(userId), JSON.stringify(queue));
  } catch {
    // Non-fatal
  }
}

export function listPendingHabitWritebacks(userId: string): PendingHabitWriteback[] {
  return readPendingQueue(userId);
}

export function enqueuePendingHabitWriteback(
  userId: string,
  entry: Omit<PendingHabitWriteback, 'id' | 'createdAt' | 'attempts' | 'lastAttemptAt' | 'lastError'>
): PendingHabitWriteback {
  const queue = readPendingQueue(userId);
  const dedupeKey = `${entry.connectionId}::${entry.sheetTitle}::${entry.colLetter}::${entry.rowNumber}`;
  const filtered = queue.filter(
    (p) => `${p.connectionId}::${p.sheetTitle}::${p.colLetter}::${p.rowNumber}` !== dedupeKey
  );
  const next: PendingHabitWriteback = {
    ...entry,
    id: `phwb_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
    createdAt: new Date().toISOString(),
    attempts: 0,
    lastAttemptAt: null,
    lastError: null,
  };
  filtered.unshift(next);
  writePendingQueue(userId, filtered);
  return next;
}

/**
 * Resolves the exact target (tab, row, column) in a Sheet Hub connection for a given
 * Habit + YYYY-MM-DD date. Supports both Matrix (date columns) and Log (date + done) layouts.
 */
export function resolveHabitCellTarget(input: {
  habit: Habit;
  dateStr: string;
  tabs: SheetTabSchema[];
  rowsByTabId: Record<string, SheetSyncedRow[]>;
}): { tab: SheetTabSchema; row: SheetSyncedRow; col: SheetColumnMapping } | null {
  const { habit, dateStr, tabs, rowsByTabId } = input;
  const normHabitTitle = normalizeHabitKey(habit.title);
  if (!normHabitTitle || !dateStr) return null;

  const targetMonth = dateStr.slice(0, 7); // YYYY-MM

  // Order candidate tabs: matching month first, then matching sourceSheetId, then remaining non-overview tabs
  const candidateTabs = tabs
    .filter((t) => !isOverviewOrSummaryTab(t.sheetTitle, t.role))
    .sort((a, b) => {
      const aMonthMatch = inferMonthYearFromTitle(a.sheetTitle) === targetMonth ? 1 : 0;
      const bMonthMatch = inferMonthYearFromTitle(b.sheetTitle) === targetMonth ? 1 : 0;
      if (aMonthMatch !== bMonthMatch) return bMonthMatch - aMonthMatch;
      const aIdMatch = habit.sourceSheetId != null && String(a.sheetId) === String(habit.sourceSheetId) ? 1 : 0;
      const bIdMatch = habit.sourceSheetId != null && String(b.sheetId) === String(habit.sourceSheetId) ? 1 : 0;
      return bIdMatch - aIdMatch;
    });

  for (const tab of candidateTabs) {
    const rows = rowsByTabId[tab.id] || [];
    if (rows.length === 0) continue;

    const cols = tab.columns || [];
    const tabMonthYear = inferMonthYearFromTitle(tab.sheetTitle);
    const [yStr, mStr] = tabMonthYear.split('-');
    const defaultYear = Number(yStr) || Number(dateStr.slice(0, 4));
    const defaultMonth = Number(mStr) || Number(dateStr.slice(5, 7));

    const titleCol =
      cols.find((c) => /^(habit|habit\s*name|title|name|routine|activity|task|item)$/i.test((c.headerName || c.displayName || '').trim())) ||
      cols.find((c) => c.semanticRole === 'title') ||
      cols.find((c) => c.inferredType === 'text');

    // 1. Check Matrix layout: find column whose header resolves to dateStr
    const dateCol = cols.find((c) => {
      if (c.inferredType === 'formula' || c.editable === false) return false;
      const header = (c.headerName || c.displayName || '').trim();
      return parseDateToIso(header, defaultYear, defaultMonth) === dateStr;
    });

    if (dateCol) {
      const matchedRow =
        (habit.sourceRowId && rows.find((r) => r.rowUid === habit.sourceRowId)) ||
        rows.find((r) => {
          const vals = r.values || r.cells || {};
          const rawTitle = titleCol ? vals[titleCol.fieldKey] : Object.values(vals)[0];
          return normalizeHabitKey(rawTitle) === normHabitTitle;
        });

      if (matchedRow && matchedRow.lastKnownSheetRow >= 1) {
        return { tab, row: matchedRow, col: dateCol };
      }
    }

    // 2. Check Log / List layout: find row matching (habitTitle, dateStr) + Done column
    const rowDateCol =
      cols.find((c) => /^(date|day|completed\s*date|logged\s*on|timestamp)$/i.test((c.headerName || c.displayName || '').trim())) ||
      cols.find((c) => c.inferredType === 'date');
    const doneCol =
      cols.find((c) => /^(done|completed|status|checked|chk|tick|value)$/i.test((c.headerName || c.displayName || '').trim())) ||
      cols.find((c) => c.semanticRole === 'done' || c.inferredType === 'checkbox' || c.inferredType === 'boolean');

    if (rowDateCol && doneCol && doneCol.inferredType !== 'formula' && doneCol.editable !== false) {
      const matchedRow = rows.find((r) => {
        const vals = r.values || r.cells || {};
        const rawTitle = titleCol ? vals[titleCol.fieldKey] : Object.values(vals)[0];
        if (normalizeHabitKey(rawTitle) !== normHabitTitle) return false;
        const parsedDate = parseDateToIso(vals[rowDateCol.fieldKey], defaultYear, defaultMonth);
        return parsedDate === dateStr;
      });

      if (matchedRow && matchedRow.lastKnownSheetRow >= 1) {
        return { tab, row: matchedRow, col: doneCol };
      }
    }
  }

  return null;
}

/**
 * Direction A: Habit Tracker Toggle → Sheet Hub Cache + Google Sheets Cell Writeback
 */
export async function syncHabitToggleToGoogleSheets(
  userId: string,
  habit: Habit,
  dateStr: string,
  isCompleted: boolean
): Promise<HabitSyncResult> {
  if (!habit.sourceSpreadsheetId) {
    return { status: 'no_connection', synced: false };
  }

  try {
    const connections = await sheetHubStore.listConnections(userId);
    const conn = connections.find(
      (c) =>
        !c.deletedAt &&
        c.status !== 'paused' &&
        (c.spreadsheetId === habit.sourceSpreadsheetId ||
          c.sourceSpreadsheetId === habit.sourceSpreadsheetId ||
          c.id === habit.sourceSpreadsheetId)
    );

    if (!conn) {
      return { status: 'no_connection', synced: false };
    }

    const tabs = await sheetHubStore.listTabsForConnection(userId, conn.id);
    const rowsByTabId: Record<string, SheetSyncedRow[]> = {};
    for (const t of tabs) {
      if (isOverviewOrSummaryTab(t.sheetTitle, t.role)) continue;
      rowsByTabId[t.id] = await sheetHubStore.loadTabRows(userId, t.id, conn.id).catch(() => []);
    }

    const target = resolveHabitCellTarget({ habit, dateStr, tabs, rowsByTabId });
    if (!target) {
      return { status: 'no_matching_cell', synced: false };
    }

    const { tab, row, col } = target;
    const rowNumber = row.lastKnownSheetRow;
    const colLetter = col.colLetter;
    const cellRef = `${tab.sheetTitle}!${colLetter}${rowNumber}`;
    const nowIso = new Date().toISOString();

    // Persist locally in Sheet Hub cache first
    const tabRows = rowsByTabId[tab.id] || [];
    const updatedRow: SheetSyncedRow = {
      ...row,
      values: { ...row.values, [col.fieldKey]: isCompleted },
      dirtyFields: Array.from(new Set([...(row.dirtyFields || []), col.fieldKey])),
      lastSyncOrigin: 'app',
      localUpdatedAt: nowIso,
      status: conn.isNative ? 'synced' : 'pending_push',
      updatedAt: nowIso,
    };

    const nextRows = tabRows.map((r) => (r.rowUid === row.rowUid ? updatedRow : r));
    await sheetHubStore.saveTabRowsChunked({
      userId,
      connectionId: conn.id,
      tabId: tab.id,
      rows: nextRows,
    });

    if (conn.isNative || conn.spreadsheetId === 'sem3-syllabus-sample') {
      return { status: 'synced', synced: true, sheetTitle: tab.sheetTitle, cellRef };
    }

    if (conn.isPublicLink || conn.syncMode === 'sheet_to_app' || conn.writeMode === 'none') {
      return { status: 'read_only', synced: false, sheetTitle: tab.sheetTitle, cellRef };
    }

    const writeToken = conn.isDualCopy
      ? getGisDualCopyToken() || (await getSheetHubWriteAccessToken())
      : await getSheetHubWriteAccessToken();

    if (!writeToken) {
      enqueuePendingHabitWriteback(userId, {
        userId,
        connectionId: conn.id,
        spreadsheetId: conn.spreadsheetId,
        sheetTitle: tab.sheetTitle,
        rowNumber,
        colLetter,
        cellRef,
        habitId: habit.id,
        habitTitle: habit.title,
        dateStr,
        value: isCompleted,
      });
      return {
        status: 'queued',
        synced: false,
        sheetTitle: tab.sheetTitle,
        cellRef,
        error: 'OAUTH_TOKEN_MISSING',
      };
    }

    try {
      await api.sheetHubPushCells(
        {
          spreadsheetId: conn.spreadsheetId,
          updates: [{ sheetTitle: tab.sheetTitle, rowNumber, colLetter, value: isCompleted }],
        },
        writeToken
      );

      const confirmedRows = tabRows.map((r) =>
        r.rowUid === row.rowUid
          ? {
              ...updatedRow,
              baseValues: { ...updatedRow.baseValues, [col.fieldKey]: isCompleted },
              dirtyFields: (updatedRow.dirtyFields || []).filter((f) => f !== col.fieldKey),
              sheetSyncedAt: new Date().toISOString(),
              status: 'synced' as const,
            }
          : r
      );
      await sheetHubStore.saveTabRowsChunked({
        userId,
        connectionId: conn.id,
        tabId: tab.id,
        rows: confirmedRows,
      });

      return { status: 'synced', synced: true, sheetTitle: tab.sheetTitle, cellRef };
    } catch (pushErr: unknown) {
      const { isAuthErr, isPermanentErr, message } = classifyHabitPushError(pushErr);

      // Queue auth failures AND transient network/5xx/rate-limit failures; skip permanent 400/403/404 errors
      if (!isPermanentErr) {
        enqueuePendingHabitWriteback(userId, {
          userId,
          connectionId: conn.id,
          spreadsheetId: conn.spreadsheetId,
          sheetTitle: tab.sheetTitle,
          rowNumber,
          colLetter,
          cellRef,
          habitId: habit.id,
          habitTitle: habit.title,
          dateStr,
          value: isCompleted,
        });
        return {
          status: 'queued',
          synced: false,
          sheetTitle: tab.sheetTitle,
          cellRef,
          error: isAuthErr ? 'OAUTH_TOKEN_EXPIRED' : message,
        };
      }
      return { status: 'error', synced: false, sheetTitle: tab.sheetTitle, cellRef, error: message };
    }
  } catch (err: unknown) {
    return {
      status: 'error',
      synced: false,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}

/**
 * Flush queued Habit writebacks after Google Sheets write OAuth is re-authorized.
 */
export async function flushPendingHabitWritebacks(userId: string): Promise<number> {
  const queue = readPendingQueue(userId);
  if (queue.length === 0) return 0;

  const writeToken = (await getSheetHubWriteAccessToken()) || getGisDualCopyToken();
  if (!writeToken) return 0;

  let flushed = 0;
  const flushedEntries: PendingHabitWriteback[] = [];
  const remaining: PendingHabitWriteback[] = [];
  const now = new Date().toISOString();

  for (const entry of queue) {
    try {
      await api.sheetHubPushCells(
        {
          spreadsheetId: entry.spreadsheetId,
          updates: [
            {
              sheetTitle: entry.sheetTitle,
              rowNumber: entry.rowNumber,
              colLetter: entry.colLetter,
              value: entry.value,
            },
          ],
        },
        writeToken
      );
      flushed++;
      flushedEntries.push(entry);
    } catch (err: unknown) {
      const { isPermanentErr, message } = classifyHabitPushError(err);
      const nextAttempts = (entry.attempts || 0) + 1;
      if (!isPermanentErr && nextAttempts < MAX_HABIT_WRITEBACK_ATTEMPTS) {
        remaining.push({
          ...entry,
          attempts: nextAttempts,
          lastAttemptAt: now,
          lastError: message,
        });
      }
    }
  }

  writePendingQueue(userId, remaining);

  // Clear pending_push / dirtyFields on successfully flushed Sheet Hub cache rows
  if (flushedEntries.length > 0) {
    const byConn = new Map<string, PendingHabitWriteback[]>();
    for (const fe of flushedEntries) {
      const list = byConn.get(fe.connectionId) || [];
      list.push(fe);
      byConn.set(fe.connectionId, list);
    }
    for (const [connectionId, entries] of byConn.entries()) {
      try {
        const tabs = await sheetHubStore.listTabsForConnection(userId, connectionId);
        const bySheetTitle = new Map<string, PendingHabitWriteback[]>();
        for (const e of entries) {
          const list = bySheetTitle.get(e.sheetTitle) || [];
          list.push(e);
          bySheetTitle.set(e.sheetTitle, list);
        }
        for (const [sheetTitle, sheetEntries] of bySheetTitle.entries()) {
          const tab = tabs.find((t) => t.sheetTitle === sheetTitle);
          if (!tab) continue;
          const rows = await sheetHubStore.loadTabRows(userId, tab.id, connectionId).catch(() => []);
          if (rows.length === 0) continue;
          let rowsModified = false;
          const nextRows = rows.map((row) => {
            const matching = sheetEntries.filter((se) => se.rowNumber === row.lastKnownSheetRow);
            if (matching.length === 0) return row;
            rowsModified = true;
            const nextBase = { ...(row.baseValues || {}) };
            let nextDirty = [...(row.dirtyFields || [])];
            for (const m of matching) {
              const col = (tab.columns || []).find((c) => c.colLetter === m.colLetter);
              if (col) {
                nextBase[col.fieldKey] = m.value;
                nextDirty = nextDirty.filter((f) => f !== col.fieldKey);
              } else {
                nextDirty = [];
              }
            }
            return {
              ...row,
              baseValues: nextBase,
              dirtyFields: nextDirty,
              sheetSyncedAt: now,
              status: nextDirty.length === 0 ? ('synced' as const) : ('pending_push' as const),
              updatedAt: now,
            };
          });
          if (rowsModified) {
            await sheetHubStore.saveTabRowsChunked({
              userId,
              connectionId,
              tabId: tab.id,
              rows: nextRows,
            });
          }
        }
      } catch {
        // Non-fatal cache sync cleanup
      }
    }
  }

  return flushed;
}

/**
 * Direction B: Direct Sheet Hub Checkbox Toggle → Habit Tracker
 */
export async function syncSheetRowCheckboxToHabits(input: {
  userId: string;
  connection: SheetConnection;
  tab: SheetTabSchema;
  row: SheetSyncedRow;
  fieldKey: string;
  nextValue: boolean;
}): Promise<boolean> {
  const { connection, tab, row, fieldKey, nextValue } = input;
  const cols = tab.columns || [];
  const editedCol = cols.find((c) => c.fieldKey === fieldKey);
  if (!editedCol) return false;

  const tabMonthYear = inferMonthYearFromTitle(tab.sheetTitle);
  const [yStr, mStr] = tabMonthYear.split('-');
  const now = new Date();
  const defaultYear = Number(yStr) || now.getFullYear();
  const defaultMonth = Number(mStr) || now.getMonth() + 1;

  const vals = row.values || row.cells || {};

  // Check if edited column is a Matrix date column OR a Log done column
  let targetDateIso = parseDateToIso(
    (editedCol.headerName || editedCol.displayName || '').trim(),
    defaultYear,
    defaultMonth
  );

  if (!targetDateIso) {
    const isDoneCol =
      editedCol.semanticRole === 'done' ||
      editedCol.inferredType === 'checkbox' ||
      /^(done|completed|status|checked|chk|tick|value)$/i.test(
        (editedCol.headerName || editedCol.displayName || '').trim()
      );
    if (!isDoneCol) return false;

    const dateCol =
      cols.find((c) => /^(date|day|completed\s*date|logged\s*on|timestamp)$/i.test((c.headerName || c.displayName || '').trim())) ||
      cols.find((c) => c.inferredType === 'date');
    if (!dateCol) return false;
    targetDateIso = parseDateToIso(vals[dateCol.fieldKey], defaultYear, defaultMonth);
  }

  if (!targetDateIso) return false;

  const titleCol =
    cols.find((c) => /^(habit|habit\s*name|title|name|routine|activity|task|item)$/i.test((c.headerName || c.displayName || '').trim())) ||
    cols.find((c) => c.semanticRole === 'title') ||
    cols.find((c) => c.inferredType === 'text');
  const normRowTitle = normalizeHabitKey(titleCol ? vals[titleCol.fieldKey] : Object.values(vals)[0]);
  if (!normRowTitle) return false;

  const existingHabits = await api.getHabits().catch(() => [] as Habit[]);
  const activeHabits = (existingHabits || []).filter((h) => !h.deletedAt);
  if (activeHabits.length === 0) return false;

  const spreadsheetId = connection.sourceSpreadsheetId || connection.spreadsheetId || connection.id;
  const matchedHabit =
    activeHabits.find(
      (h) =>
        (h.sourceRowId && h.sourceRowId === row.rowUid) ||
        (h.sourceSpreadsheetId === spreadsheetId && normalizeHabitKey(h.title) === normRowTitle)
    ) || activeHabits.find((h) => normalizeHabitKey(h.title) === normRowTitle);

  if (!matchedHabit) return false;

  const dateSet = new Set(matchedHabit.completedDates || []);
  const alreadyCompleted = dateSet.has(targetDateIso);
  if (alreadyCompleted === nextValue) return false;

  if (nextValue) {
    dateSet.add(targetDateIso);
  } else {
    dateSet.delete(targetDateIso);
  }

  const nextDates = Array.from(dateSet).sort();
  const nextBestStreak = Math.max(matchedHabit.bestStreakDays || 0, computeBestStreak(nextDates));

  await api.updateHabit(matchedHabit.id, {
    completedDates: nextDates,
    bestStreakDays: nextBestStreak,
    sourceSpreadsheetId: matchedHabit.sourceSpreadsheetId || spreadsheetId,
    sourceSheetId: matchedHabit.sourceSheetId ?? tab.sheetId,
    sourceRowId: matchedHabit.sourceRowId || row.rowUid,
  });

  clientDataCache.invalidate('habits');
  return true;
}

/**
 * Direction C: Pull / Reconcile Google Sheets & Sheet Hub Cache → Habit Tracker
 */
export async function pollAndSyncGoogleSheetsToHabits(
  userId: string
): Promise<HabitSheetsPullReport> {
  const nowIso = new Date().toISOString();
  try {
    const existingHabits = await api.getHabits().catch(() => [] as Habit[]);
    const activeHabits = (existingHabits || []).filter((h) => !h.deletedAt);
    const linkedSpreadsheetIds = new Set(
      activeHabits
        .map((h) => h.sourceSpreadsheetId)
        .filter((id): id is string => Boolean(id))
    );

    if (linkedSpreadsheetIds.size === 0) {
      return {
        success: true,
        syncedAt: nowIso,
        updatedHabitsCount: 0,
        flushedWritebacksCount: 0,
        error: null,
      };
    }

    const connections = await sheetHubStore.listConnections(userId);
    const linkedConnections = connections.filter(
      (c) =>
        !c.deletedAt &&
        c.status !== 'paused' &&
        (linkedSpreadsheetIds.has(c.spreadsheetId) ||
          (c.sourceSpreadsheetId && linkedSpreadsheetIds.has(c.sourceSpreadsheetId)) ||
          linkedSpreadsheetIds.has(c.id))
    );

    const token = (await getSheetHubWriteAccessToken().catch(() => null)) || getGisDualCopyToken();
    const flushedWritebacksCount = token
      ? await flushPendingHabitWritebacks(userId).catch(() => 0)
      : 0;

    let updatedHabitsCount = 0;

    for (const conn of linkedConnections) {
      const tabs = await sheetHubStore.listTabsForConnection(userId, conn.id);
      const habitTabs = tabs.filter((t) => !isOverviewOrSummaryTab(t.sheetTitle, t.role));
      if (habitTabs.length === 0) continue;

      // Try live Google Sheets pull when possible so external sheet edits come in fresh
      if (!conn.isNative && conn.spreadsheetId !== 'sem3-syllabus-sample') {
        try {
          const pullRes = await api.sheetHubPull(
            {
              spreadsheetId: conn.spreadsheetId,
              tabs: habitTabs.map((t) => ({
                sheetId: t.sheetId,
                sheetTitle: t.sheetTitle,
                headerRowIndex: t.headerRowIndex || 1,
              })),
              publicAccess: Boolean(conn.isPublicLink),
            },
            token || undefined
          );

          for (const pt of pullRes.tabs || []) {
            const tab = habitTabs.find((t) => t.sheetId === pt.sheetId || t.sheetTitle === pt.sheetTitle);
            if (!tab) continue;
            const existingRows = await sheetHubStore.loadTabRows(userId, tab.id, conn.id).catch(() => []);
            const existingBySheetRow = new Map(existingRows.map((er) => [er.lastKnownSheetRow, er]));
            const syncedRows: SheetSyncedRow[] = (pt.rows || []).map((r) => {
              const rowVals: Record<string, any> = {};
              for (const col of tab.columns) {
                rowVals[col.fieldKey] = r.values[col.colIndex] ?? null;
              }
              const existingRow = existingBySheetRow.get(r.sheetRowNumber);
              const hasDirtyLocalEdits =
                Boolean(existingRow?.dirtyFields && existingRow.dirtyFields.length > 0) ||
                existingRow?.status === 'pending_push';
              const mergedValues = { ...rowVals };
              if (hasDirtyLocalEdits && existingRow) {
                for (const dirtyField of existingRow.dirtyFields || []) {
                  if (dirtyField in (existingRow.values || {})) {
                    mergedValues[dirtyField] = existingRow.values[dirtyField];
                  }
                }
              }
              return {
                rowUid: existingRow?.rowUid || `row_${tab.sheetId}_${r.sheetRowNumber}`,
                lastKnownSheetRow: r.sheetRowNumber,
                values: mergedValues,
                baseValues: rowVals,
                rowHash: `hash_${r.sheetRowNumber}`,
                version: (existingRow?.version || 0) + 1,
                lastSyncOrigin: hasDirtyLocalEdits ? (existingRow?.lastSyncOrigin || 'app') : 'sheet',
                dirtyFields: hasDirtyLocalEdits ? [...(existingRow?.dirtyFields || [])] : [],
                localUpdatedAt: hasDirtyLocalEdits ? (existingRow?.localUpdatedAt ?? nowIso) : null,
                sheetSyncedAt: nowIso,
                status: hasDirtyLocalEdits ? 'pending_push' : 'synced',
              };
            });
            await sheetHubStore.saveTabRowsChunked({
              userId,
              connectionId: conn.id,
              tabId: tab.id,
              rows: syncedRows,
            });
          }
        } catch {
          // Non-fatal: fall back to cached Sheet Hub rows
        }
      }

      const tabInputs = [];
      for (const tab of habitTabs) {
        const rows = await sheetHubStore.loadTabRows(userId, tab.id, conn.id).catch(() => []);
        if (rows.length === 0) continue;
        tabInputs.push({
          tab,
          config: detectHabitTabConfig(tab),
          rows,
        });
      }

      if (tabInputs.length === 0) continue;

      const spreadsheetId = conn.sourceSpreadsheetId || conn.spreadsheetId || conn.id;
      const preview = generateHabitImportPreview({
        tabs: tabInputs,
        existingHabits: activeHabits,
        spreadsheetId,
        mergeMode: 'replace',
      });

      const pendingAfterFlush = readPendingQueue(userId);
      const existingById = new Map(activeHabits.map((h) => [h.id, h]));
      for (const item of preview.habits) {
        if (!item.isExistingMatch || !item.existingHabitId) continue;
        const existing = existingById.get(item.existingHabitId);
        if (!existing) continue;

        // Re-apply any still-pending un-flushed local toggles so pull never clobbers unsynced offline edits
        const finalDateSet = new Set(item.mergedDates);
        for (const pending of pendingAfterFlush) {
          if (pending.habitId !== existing.id || !pending.dateStr) continue;
          if (pending.value) finalDateSet.add(pending.dateStr);
          else finalDateSet.delete(pending.dateStr);
        }
        const finalDates = Array.from(finalDateSet).sort();
        const finalBestStreak = Math.max(existing.bestStreakDays || 0, computeBestStreak(finalDates));

        const prevSorted = [...(existing.completedDates || [])].sort();
        const datesChanged =
          finalDates.length !== prevSorted.length ||
          finalDates.some((d, idx) => d !== prevSorted[idx]);

        if (!datesChanged) continue;

        await api.updateHabit(existing.id, {
          completedDates: finalDates,
          bestStreakDays: finalBestStreak,
        });
        updatedHabitsCount++;
      }
    }

    if (updatedHabitsCount > 0) {
      clientDataCache.invalidate('habits');
    }

    return {
      success: true,
      syncedAt: nowIso,
      updatedHabitsCount,
      flushedWritebacksCount,
      error: null,
    };
  } catch (err: unknown) {
    return {
      success: false,
      syncedAt: nowIso,
      updatedHabitsCount: 0,
      flushedWritebacksCount: 0,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}
