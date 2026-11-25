/**
 * Universal Sheet Sync Hub — Study OS ↔ Google Sheets Checkbox Write-Back Service
 *
 * ARCHITECTURE (post-review, promoted Native OAuth as primary):
 * ┌─────────────────────────────────────────────────────────────────────────────┐
 * │  PRIMARY PATH (every user, any sheet):                                      │
 * │    Native per-user Google Sheets API v4 (POST /api/sheet-hub/push-cells)   │
 * │    — User authorizes their own Google account; writes to their own sheets.  │
 * │    — Zero cross-user privilege. Zero static allowlist required.             │
 * │                                                                             │
 * │  FALLBACK when OAuth token missing / expired:                               │
 * │    1. Preserve FocusFlow local completion state (already done before sync). │
 * │    2. Enqueue PendingTopicWriteback in localStorage (per userId).           │
 * │    3. Mark connection status = 'auth_required'.                             │
 * │    4. Return status = 'queued' so caller can surface a reconnect prompt.    │
 * │                                                                             │
 * │  PERSONAL / TEST-ONLY OPTIONAL PATH (writeMode === 'apps_script'):         │
 * │    Apps Script Bridge — only for explicitly flagged personal connections.  │
 * │    NEVER used as an automatic fallback for another user's connection.       │
 * └─────────────────────────────────────────────────────────────────────────────┘
 *
 * Safety invariants:
 * - Cross-user writes are impossible: writeToken comes from the authenticated user's own popup.
 * - Apps Script "Execute as: Me" is restricted to `writeMode === 'apps_script'` connections only.
 * - If the token is absent or expired, the write is queued — NOT silently re-routed through Apps Script.
 */

import { api } from '../api.ts';
import { getSheetHubWriteAccessToken } from '../firebase.ts';
import { sheetHubStore } from './sheetHubStore.ts';
import { parseBooleanDone, isSummaryOrInvalidSyllabusRow } from './sheetToStudyTransformer.ts';
import type {
  PendingTopicWriteback,
  SheetColumnMapping,
  SheetConnection,
  SheetSyncedRow,
  SheetTabSchema,
  StudyTopicSyncResult,
  StudySheetsSyncReport,
  StudySheetSyncState,
} from '../../types/sheetHub.ts';
import type { StudyTopic } from '../../types/study.ts';

export type { StudyTopicSyncResult, StudySheetsSyncReport, StudySheetSyncState };

// ============================================================================
// PENDING WRITEBACK QUEUE — localStorage, keyed per user
// ============================================================================

const PENDING_WRITEBACK_KEY = (userId: string) => `ff_pending_topic_writeback_${userId}`;

function readPendingQueue(userId: string): PendingTopicWriteback[] {
  if (typeof window === 'undefined' || !window.localStorage) return [];
  try {
    const raw = window.localStorage.getItem(PENDING_WRITEBACK_KEY(userId));
    if (!raw) return [];
    return JSON.parse(raw) as PendingTopicWriteback[];
  } catch {
    return [];
  }
}

function writePendingQueue(userId: string, queue: PendingTopicWriteback[]): void {
  if (typeof window === 'undefined' || !window.localStorage) return;
  try {
    window.localStorage.setItem(PENDING_WRITEBACK_KEY(userId), JSON.stringify(queue));
  } catch {
    // localStorage quota exceeded — no-op; local FocusFlow state is still correct
  }
}

export function enqueuePendingWriteback(
  userId: string,
  entry: Omit<PendingTopicWriteback, 'id' | 'createdAt' | 'attempts' | 'lastAttemptAt' | 'lastError'>
): PendingTopicWriteback {
  const queue = readPendingQueue(userId);
  // De-duplicate: replace any existing pending entry for the same cell
  const dedupeKey = `${entry.connectionId}::${entry.sheetTitle}::${entry.colLetter}::${entry.topicSubtopic}`;
  const filtered = queue.filter((p) => {
    const k = `${p.connectionId}::${p.sheetTitle}::${p.colLetter}::${p.topicSubtopic}`;
    return k !== dedupeKey;
  });
  const pending: PendingTopicWriteback = {
    ...entry,
    id: `pwb_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
    createdAt: new Date().toISOString(),
    attempts: 0,
    lastAttemptAt: null,
    lastError: null,
  };
  filtered.unshift(pending);
  writePendingQueue(userId, filtered);
  return pending;
}

export function dequeuePendingWriteback(userId: string, pendingId: string): void {
  const queue = readPendingQueue(userId);
  writePendingQueue(userId, queue.filter((p) => p.id !== pendingId));
}

export function listPendingWritebacks(userId: string): PendingTopicWriteback[] {
  return readPendingQueue(userId);
}

// ============================================================================
// MATCHING HELPERS
// ============================================================================

function normalizeForComparison(val: unknown): string {
  if (typeof val !== 'string') return '';
  return val.toLowerCase().replace(/[^a-z0-9]/g, '').trim();
}

export function isSubjectMatchingTab(
  subjectCode: string,
  subjectName: string | undefined,
  tabTitle: string
): boolean {
  const normTab = normalizeForComparison(tabTitle);
  const normCode = normalizeForComparison(subjectCode);
  const normName = normalizeForComparison(subjectName || '');

  if (!normTab) return false;

  if (normCode.includes(normTab) || normTab.includes(normCode)) return true;
  if (normName && (normName.includes(normTab) || normTab.includes(normName))) return true;

  const cleanCode = normalizeForComparison(subjectCode.replace(/^sub_/i, ''));
  if (cleanCode && (normTab.includes(cleanCode) || cleanCode.includes(normTab))) return true;

  const knownAliases: Record<string, string[]> = {
    sub_coa: ['coa', 'computerorganization', 'arch', 'co', 'ca'],
    sub_dbms: ['dbms', 'database', 'sql'],
    sub_python: ['python', 'py'],
    sub_probstats: ['probstats', 'probability', 'statistics', 'stats', 'math', 'discrete'],
    sub_os: ['os', 'operatingsystems'],
    sub_dsa: ['dsa', 'datastructures', 'algorithms'],
    sub_toc: ['toc', 'theoryofcomputation', 'automata'],
  };

  const aliases = knownAliases[subjectCode.toLowerCase()] || [];
  return aliases.some((a) => normTab.includes(a) || a.includes(normTab));
}

export function findDoneColumn(columns: SheetColumnMapping[]): SheetColumnMapping | null {
  const doneCol = columns.find((c) => c.semanticRole === 'done');
  if (doneCol) return doneCol;

  const checkboxCol = columns.find((c) => c.inferredType === 'checkbox');
  if (checkboxCol) return checkboxCol;

  const titleCol = columns.find((c) => {
    const norm = (c.headerName || c.displayName || '').toLowerCase().trim();
    return norm === 'done' || norm === 'completed' || norm === 'status' || norm === 'chk';
  });
  return titleCol || null;
}

export function findMatchingRowForTopic(
  rows: SheetSyncedRow[],
  topic: StudyTopic
): SheetSyncedRow | null {
  if (!rows || rows.length === 0) return null;

  // Priority 1: Direct source row ID match
  if (topic.sourceRowId) {
    const directMatch = rows.find(
      (r) => r.rowUid === topic.sourceRowId || r.id === topic.sourceRowId
    );
    if (directMatch) return directMatch;
  }

  const normSubtopic = normalizeForComparison(topic.subtopic);
  const normTopic = normalizeForComparison(topic.topic);
  const normUnit = normalizeForComparison(topic.unit);

  // Priority 2: Exact (unit, topic, subtopic) match in row values
  if (normSubtopic || normTopic) {
    const exactMatch = rows.find((r) => {
      const rowVals = Object.values(r.values).map(normalizeForComparison);
      const hasUnit = !normUnit || rowVals.includes(normUnit);
      const hasTopic = !normTopic || rowVals.includes(normTopic);
      const hasSubtopic = !normSubtopic || rowVals.includes(normSubtopic);
      return hasUnit && hasTopic && hasSubtopic;
    });
    if (exactMatch) return exactMatch;
  }

  let bestMatch: SheetSyncedRow | null = null;
  let bestScore = 0;

  for (const r of rows) {
    let score = 0;
    const rowValues = Object.values(r.values);

    for (const val of rowValues) {
      const normVal = normalizeForComparison(val);
      if (!normVal) continue;

      if (normSubtopic) {
        if (normVal === normSubtopic) score += 5;
        else if (normVal.includes(normSubtopic) || normSubtopic.includes(normVal)) score += 3;
      }
      if (normTopic) {
        if (normVal === normTopic) score += 4;
        else if (normVal.includes(normTopic) || normTopic.includes(normVal)) score += 2;
      }
      if (normUnit) {
        if (normVal === normUnit) score += 3;
        else if (normVal.includes(normUnit) || normUnit.includes(normVal)) score += 2;
      }
    }

    const rIdx = topic.rowIndex;
    if (typeof rIdx === 'number' && rIdx > 0 && r.lastKnownSheetRow === rIdx + 1) {
      score += 1;
    }

    if (score > bestScore) {
      bestScore = score;
      bestMatch = r;
    }
  }

  if (bestScore >= 3 && bestMatch) return bestMatch;

  // Subtopic-only fallback
  if (normSubtopic) {
    for (const r of rows) {
      for (const val of Object.values(r.values)) {
        const normVal = normalizeForComparison(val);
        if (normVal && (normVal === normSubtopic || normVal.includes(normSubtopic))) {
          return r;
        }
      }
    }
  }

  return null;
}

// ============================================================================
// NATIVE OAUTH WRITE (PRIMARY PATH)
// ============================================================================

/**
 * Attempts a Native OAuth write for one connection.
 * Returns true if the write succeeded; false (with optional queueEntry) if the token is absent/expired.
 *
 * NEVER routes through Apps Script for `writeMode !== 'apps_script'` connections.
 */
async function attemptNativeOAuthWrite(
  userId: string,
  conn: SheetConnection,
  matchingTab: SheetTabSchema,
  doneCol: SheetColumnMapping,
  targetRow: SheetSyncedRow,
  rowNumber: number,
  colLetter: string,
  cellRef: string,
  isCompleted: boolean,
  topic: StudyTopic
): Promise<StudyTopicSyncResult> {
  // 0. Distinguish read-only connections (sheet_to_app, writeMode: none, public links)
  if (conn.syncMode === 'sheet_to_app' || conn.writeMode === 'none' || (conn as any).isPublicLink) {
    return {
      status: 'read_only',
      synced: false,
      sheetTitle: matchingTab.sheetTitle,
      rowNumber,
      colLetter,
      cellRef,
      spreadsheetId: conn.spreadsheetId,
      value: isCompleted,
      connectionId: conn.id,
      error: 'READ_ONLY_CONNECTION',
    };
  }

  // 1. Try to get the user's own write token (in-memory session, not from localStorage).
  const writeToken = await getSheetHubWriteAccessToken();

  if (!writeToken) {
    // Token missing or expired. Queue the update and mark the connection auth_required.
    const pending = enqueuePendingWriteback(userId, {
      userId,
      connectionId: conn.id,
      spreadsheetId: conn.spreadsheetId,
      sheetTitle: matchingTab.sheetTitle,
      rowNumber,
      colLetter,
      cellRef,
      value: isCompleted,
      topicUnit: topic.unit || '',
      topicTopic: topic.topic || '',
      topicSubtopic: topic.subtopic || '',
    });

    // Persist auth_required status to Firestore so the UI can show a reconnect badge.
    try {
      await sheetHubStore.saveConnection(userId, {
        ...conn,
        status: 'auth_required',
        writeAuthStatus: 'expired',
        lastError: 'Google Sheets write authorization required. Please reconnect.',
        updatedAt: new Date().toISOString(),
      }, { force: true });
    } catch {
      // Non-fatal: local state and queue are preserved regardless.
    }

    return {
      status: 'queued',
      synced: false,
      sheetTitle: matchingTab.sheetTitle,
      rowNumber,
      colLetter,
      cellRef,
      spreadsheetId: conn.spreadsheetId,
      value: isCompleted,
      connectionId: conn.id,
      pendingId: pending.id,
      error: 'OAUTH_TOKEN_MISSING',
    };
  }

  // 2. We have a token — try the write.
  try {
    const updates: Array<{
      sheetTitle: string;
      rowNumber: number;
      colLetter: string;
      value: boolean;
    }> = [{
      sheetTitle: matchingTab.sheetTitle,
      rowNumber,
      colLetter,
      value: isCompleted,
    }];

    // If Dual-Copy: also sync to "Progress Tracker" tab
    if (conn.isDualCopy) {
      try {
        const tabs = await sheetHubStore.listTabsForConnection(userId, conn.id);
        const trackerTab = tabs.find((t) => t.sheetTitle.toLowerCase() === 'progress tracker');
        if (trackerTab) {
          const trackerRows = await sheetHubStore.loadTabRows(userId, trackerTab.id, conn.id);
          const matchedTrackerRow = trackerRows.find((r) =>
            (r.values.unit || '') === (topic.unit || '') &&
            (r.values.topic || '') === (topic.topic || '') &&
            (!topic.subtopic || (r.values.subtopic || '') === (topic.subtopic || ''))
          );
          if (matchedTrackerRow && matchedTrackerRow.lastKnownSheetRow) {
            updates.push({
              sheetTitle: trackerTab.sheetTitle,
              rowNumber: matchedTrackerRow.lastKnownSheetRow,
              colLetter: 'D',
              value: isCompleted,
            });
            matchedTrackerRow.values.done = isCompleted;
            matchedTrackerRow.values.lastSynced = new Date().toISOString();
            await sheetHubStore.saveTabRowsChunked({
              userId,
              connectionId: conn.id,
              tabId: trackerTab.id,
              rows: trackerRows,
            });
          }
        }
      } catch (trackerErr) {
        console.warn('[SheetStudySync] Notice: Progress Tracker writeback error:', trackerErr);
      }
    }

    await api.sheetHubPushCells(
      {
        spreadsheetId: conn.spreadsheetId,
        updates,
      },
      writeToken
    );

    // Update connection: mark authorized, clear error.
    if (conn.status !== 'active' || conn.writeAuthStatus !== 'authorized') {
      try {
        await sheetHubStore.saveConnection(userId, {
          ...conn,
          status: 'active',
          writeAuthStatus: 'authorized',
          writeAuthorizedAt: conn.writeAuthorizedAt || new Date().toISOString(),
          lastSuccessfulPushAt: new Date().toISOString(),
          lastError: null,
          updatedAt: new Date().toISOString(),
        }, { force: true });
      } catch {
        // Non-fatal
      }
    }

    return {
      status: 'synced',
      synced: true,
      sheetTitle: matchingTab.sheetTitle,
      rowNumber,
      colLetter,
      cellRef,
      spreadsheetId: conn.spreadsheetId,
      value: isCompleted,
      connectionId: conn.id,
    };
  } catch (pushErr: unknown) {
    const errMsg = pushErr instanceof Error ? pushErr.message : String(pushErr);
    const isAuthError =
      errMsg.includes('401') ||
      errMsg.includes('SHEETS_AUTH_REQUIRED') ||
      errMsg.includes('UNAUTHENTICATED') ||
      errMsg.includes('invalid_grant') ||
      errMsg.includes('Token has been expired');

    if (isAuthError) {
      // Token was rejected by Google Sheets API — treat as expired.
      const pending = enqueuePendingWriteback(userId, {
        userId,
        connectionId: conn.id,
        spreadsheetId: conn.spreadsheetId,
        sheetTitle: matchingTab.sheetTitle,
        rowNumber,
        colLetter,
        cellRef,
        value: isCompleted,
        topicUnit: topic.unit || '',
        topicTopic: topic.topic || '',
        topicSubtopic: topic.subtopic || '',
      });

      try {
        await sheetHubStore.saveConnection(userId, {
          ...conn,
          status: 'auth_required',
          writeAuthStatus: 'expired',
          lastError: 'Google Sheets authorization expired. Please reconnect.',
          updatedAt: new Date().toISOString(),
        }, { force: true });
      } catch {
        // Non-fatal
      }

      return {
        status: 'queued',
        synced: false,
        sheetTitle: matchingTab.sheetTitle,
        rowNumber,
        colLetter,
        cellRef,
        spreadsheetId: conn.spreadsheetId,
        value: isCompleted,
        connectionId: conn.id,
        pendingId: pending.id,
        error: 'OAUTH_TOKEN_EXPIRED',
      };
    }

    // Non-auth error (network, sheet locked, quota exceeded, etc.) — log and preserve local state.
    console.warn('[SheetStudySync] Native OAuth write failed (non-auth):', errMsg);
    return {
      status: 'error',
      synced: false,
      error: errMsg,
      sheetTitle: matchingTab.sheetTitle,
      rowNumber,
      colLetter,
      cellRef,
      spreadsheetId: conn.spreadsheetId,
      connectionId: conn.id,
    };
  }
}

// ============================================================================
// APPS SCRIPT PATH — PERSONAL / TEST-ONLY
// ============================================================================

/**
 * Only called for connections where the owner has explicitly set writeMode === 'apps_script'.
 * This path runs the owner's Apps Script webhook and must NEVER be called for connections
 * belonging to other users or connections that do not opt into this mode.
 */
async function attemptAppsScriptWrite(
  conn: SheetConnection,
  matchingTab: SheetTabSchema,
  rowNumber: number,
  colLetter: string,
  cellRef: string,
  isCompleted: boolean,
  topic: StudyTopic
): Promise<{ success: boolean; updatedCell?: string }> {
  try {
    const res = await api.sheetHubAppsScriptWriteback({
      connectionId: conn.id,
      spreadsheetId: conn.spreadsheetId,
      sheetTitle: matchingTab.sheetTitle,
      rowNumber,
      colLetter,
      value: isCompleted,
      expectedIdentity: {
        module: topic.unit || '',
        topic: topic.topic || '',
        subtopic: topic.subtopic || '',
      },
    });
    return { success: !!(res?.success), updatedCell: res?.updatedCell };
  } catch (err) {
    console.warn('[SheetStudySync] Apps Script personal write failed:', err instanceof Error ? err.message : err);
    return { success: false };
  }
}

// ============================================================================
// FLUSH PENDING QUEUE (call after user re-authorizes)
// ============================================================================

/**
 * Attempts to flush all pending writebacks for a user after OAuth re-authorization.
 * Returns the number of items successfully flushed.
 *
 * Call this after `authorizeSheetHubWrite()` succeeds.
 */
export async function flushPendingWritebacks(userId: string): Promise<number> {
  const queue = readPendingQueue(userId);
  if (queue.length === 0) return 0;

  const writeToken = await getSheetHubWriteAccessToken();
  if (!writeToken) return 0;

  let flushed = 0;
  const remaining: PendingTopicWriteback[] = [];
  const affectedConnectionIds = new Set<string>();
  const now = new Date().toISOString();

  for (const entry of queue) {
    // Composite key drift re-check is handled server-side via sheetHubPushCells.
    // Row numbers in queue may be stale — this is acceptable for flush since
    // the Google Sheets API will write to the exact A1 reference provided.
    // For production use, re-pull rows before flush if drift is a concern.
    try {
      await api.sheetHubPushCells(
        {
          spreadsheetId: entry.spreadsheetId,
          updates: [{
            sheetTitle: entry.sheetTitle,
            rowNumber: entry.rowNumber,
            colLetter: entry.colLetter,
            value: entry.value,
          }],
        },
        writeToken
      );
      flushed++;
      if (entry.connectionId) {
        affectedConnectionIds.add(entry.connectionId);
      }
    } catch (err: unknown) {
      const errMsg = err instanceof Error ? err.message : String(err);
      remaining.push({
        ...entry,
        attempts: entry.attempts + 1,
        lastAttemptAt: now,
        lastError: errMsg,
      });
    }
  }

  writePendingQueue(userId, remaining);

  // Restore connection status back to active & authorized once pending writes are flushed
  for (const connId of affectedConnectionIds) {
    try {
      const conn = await sheetHubStore.getConnection(userId, connId);
      if (conn && (conn.status === 'auth_required' || conn.writeAuthStatus !== 'authorized' || conn.lastError)) {
        await sheetHubStore.saveConnection(userId, {
          ...conn,
          status: 'active',
          writeAuthStatus: 'authorized',
          writeAuthorizedAt: conn.writeAuthorizedAt || now,
          lastSuccessfulPushAt: now,
          lastError: null,
          updatedAt: now,
        }, { force: true });
      }
    } catch (err) {
      console.warn(`[SheetStudySync] Could not update connection ${connId} after flush:`, err);
    }
  }

  return flushed;
}

// ============================================================================
// MAIN PUBLIC API
// ============================================================================

/**
 * Synchronizes a topic completion state change to all connected Google Sheets.
 *
 * Order of operations:
 * 1. FocusFlow local state is already updated by the caller before this is invoked.
 * 2. For each active, two-way connection:
 *    a. Find the matching tab and Done column.
 *    b. Find the matching row via composite key scoring.
 *    c. Update the row in the local Sheet Hub store.
 *    d. If `writeMode === 'apps_script'`: use Apps Script personal webhook.
 *    e. Otherwise (default `native_oauth`): use Native OAuth Sheets API v4.
 *       — If token missing/expired: queue update, mark conn `auth_required`, return `status: 'queued'`.
 *       — If write succeeds: return `status: 'synced'`.
 * 3. Returns after the first connection match (the most specific match wins).
 */
export async function syncStudyTopicCompletionToGoogleSheets(
  userId: string,
  topic: StudyTopic,
  isCompleted: boolean,
  subjectName?: string
): Promise<StudyTopicSyncResult> {
  try {
    // 1. Get active write-enabled connections for this user
    const connections = await sheetHubStore.listConnections(userId);
    const writeConnections = connections.filter(
      (c) =>
        c.status !== 'paused' &&
        c.status !== 'error' &&
        !c.deletedAt &&
        !c.isNative &&
        (!c.syncMode || c.syncMode === 'two_way' || c.syncMode === 'manual_only')
    );

    if (writeConnections.length === 0) {
      return { status: 'no_connection', synced: false, error: 'NO_WRITE_CONNECTIONS' };
    }

    // Prioritize the connection that matches this topic's source spreadsheet ID
    if (topic.sourceSpreadsheetId) {
      writeConnections.sort((a, b) => {
        if (a.spreadsheetId === topic.sourceSpreadsheetId) return -1;
        if (b.spreadsheetId === topic.sourceSpreadsheetId) return 1;
        return 0;
      });
    }

    // 2. Discover matching tab across write-enabled connections
    for (const conn of writeConnections) {
      const tabs = await sheetHubStore.listTabsForConnection(userId, conn.id);
      let matchingTab = topic.sourceSheetId
        ? tabs.find((t) => String(t.sheetId) === String(topic.sourceSheetId))
        : undefined;

      if (!matchingTab) {
        matchingTab = tabs.find((t) =>
          isSubjectMatchingTab(topic.subjectCode, subjectName, t.sheetTitle)
        );
      }

      if (!matchingTab) continue;

      // 3. Locate Done column
      const doneCol = findDoneColumn(matchingTab.columns);
      if (!doneCol) continue;

      // 4. Load rows and locate target row
      const rows = await sheetHubStore.loadTabRows(userId, matchingTab.id, conn.id);
      const targetRow = findMatchingRowForTopic(rows, topic);
      if (!targetRow || !targetRow.lastKnownSheetRow || targetRow.lastKnownSheetRow < 1) continue;

      const rowNumber = targetRow.lastKnownSheetRow;
      const colLetter = doneCol.colLetter;
      const cellRef = `${matchingTab.sheetTitle}!${colLetter}${rowNumber}`;

      // 5. Update local row state immediately (optimistic update as pending_push)
      const nowIso = new Date().toISOString();
      const pendingRow: SheetSyncedRow = {
        ...targetRow,
        values: { ...targetRow.values, [doneCol.fieldKey]: isCompleted },
        baseValues: targetRow.baseValues, // Retain original sheet baseValues until confirmed
        dirtyFields: Array.from(new Set([...(targetRow.dirtyFields || []), doneCol.fieldKey])),
        lastSyncOrigin: 'app',
        localUpdatedAt: nowIso,
        sheetSyncedAt: targetRow.sheetSyncedAt || nowIso,
        status: 'pending_push',
      };

      const pendingRows = rows.map((r) => (r.rowUid === targetRow.rowUid ? pendingRow : r));
      await sheetHubStore.saveTabRowsChunked({
        userId,
        connectionId: conn.id,
        tabId: matchingTab.id,
        rows: pendingRows,
      });

      const markRowConfirmedSynced = async () => {
        const syncedRow: SheetSyncedRow = {
          ...pendingRow,
          baseValues: { ...pendingRow.baseValues, [doneCol.fieldKey]: isCompleted },
          dirtyFields: [],
          sheetSyncedAt: new Date().toISOString(),
          status: 'synced',
        };
        const syncedRows = rows.map((r) => (r.rowUid === targetRow.rowUid ? syncedRow : r));
        await sheetHubStore.saveTabRowsChunked({
          userId,
          connectionId: conn.id,
          tabId: matchingTab.id,
          rows: syncedRows,
        });
      };

      // 6. Demo / sample spreadsheet: local state is sufficient, mark confirmed
      if (conn.spreadsheetId === 'sem3-syllabus-sample') {
        await markRowConfirmedSynced();
        return {
          status: 'demo',
          synced: true,
          sheetTitle: matchingTab.sheetTitle,
          rowNumber,
          colLetter,
          cellRef,
          spreadsheetId: conn.spreadsheetId,
          value: isCompleted,
          connectionId: conn.id,
        };
      }

      // 7. Determine effective write mode
      //    'apps_script' is an explicit opt-in for personal/test connections only.
      //    Default is 'native_oauth'.
      const effectiveWriteMode = conn.writeMode === 'apps_script' ? 'apps_script' : 'native_oauth';

      if (effectiveWriteMode === 'apps_script') {
        // PERSONAL / TEST-ONLY: Apps Script webhook (single-user, owner-executed)
        const { success, updatedCell } = await attemptAppsScriptWrite(
          conn, matchingTab, rowNumber, colLetter, cellRef, isCompleted, topic
        );
        if (success) {
          await markRowConfirmedSynced();
          return {
            status: 'synced',
            synced: true,
            sheetTitle: matchingTab.sheetTitle,
            rowNumber,
            colLetter,
            cellRef: updatedCell || cellRef,
            spreadsheetId: conn.spreadsheetId,
            value: isCompleted,
            connectionId: conn.id,
          };
        }
        // Apps Script failed — do NOT fall back to native_oauth for apps_script-flagged connections.
        return {
          status: 'error',
          synced: false,
          error: 'APPS_SCRIPT_WRITE_FAILED',
          sheetTitle: matchingTab.sheetTitle,
          rowNumber,
          colLetter,
          cellRef,
          spreadsheetId: conn.spreadsheetId,
          connectionId: conn.id,
        };
      }

      // PRIMARY PATH: Native per-user Google Sheets API v4
      const writeResult = await attemptNativeOAuthWrite(
        userId, conn, matchingTab, doneCol, targetRow,
        rowNumber, colLetter, cellRef, isCompleted, topic
      );

      if (writeResult.status === 'synced') {
        await markRowConfirmedSynced();
      }

      return writeResult;
    }

    return { status: 'no_matching_tab', synced: false, error: 'NO_MATCHING_TAB' };
  } catch (err: unknown) {
    console.error('[SheetStudySync] Unexpected error in syncStudyTopicCompletionToGoogleSheets:', err);
    return { status: 'error', synced: false, error: err instanceof Error ? err.message : String(err) };
  }
}

/**
 * Direction B: Google Drive Copy → FocusFlow Firestore Two-Way Sync
 * Pulls latest values from the user's Drive duplicate, reconciles with Firestore native copy,
 * handles row shifts via composite keys, and records 3-way merge conflicts when detected.
 */
export async function pullDualCopyChangesFromDrive(
  userId: string,
  connectionId: string,
  customToken?: string
): Promise<{
  updatedCells: number;
  conflictsDetected: number;
  lastSyncedAt: string;
}> {
  const conn = await sheetHubStore.getConnection(userId, connectionId);
  if (!conn || !conn.spreadsheetId) {
    throw new Error(`Connection "${connectionId}" not found.`);
  }

  const token = customToken || (await getSheetHubWriteAccessToken());
  if (!token) {
    throw new Error('Google Drive/Sheets access token required for synchronization.');
  }

  const tabs = await sheetHubStore.listTabsForConnection(userId, connectionId);
  const tabsToPull = tabs.map((t) => ({
    sheetId: t.sheetId,
    sheetTitle: t.sheetTitle,
    headerRowIndex: t.headerRowIndex || 1,
  }));

  const pullRes = await api.sheetHubPull(
    {
      spreadsheetId: conn.spreadsheetId,
      tabs: tabsToPull,
    },
    token
  );

  let updatedCells = 0;
  let conflictsDetected = 0;
  const nowIso = new Date().toISOString();

  for (const tabSchema of tabs) {
    const pulledTab = pullRes.tabs.find((pt) => pt.sheetTitle === tabSchema.sheetTitle);
    if (!pulledTab) continue;

    const localRows = await sheetHubStore.loadTabRows(userId, tabSchema.id, connectionId);
    let tabModified = false;

    for (const pulledRow of pulledTab.rows) {
      // Find matching local row by composite key or physical row
      const keyCols = tabSchema.identityColumns && tabSchema.identityColumns.length > 0
        ? tabSchema.identityColumns
        : ['unit', 'topic', 'subtopic'];

      const rowValues = pulledRow.values;
      const matchedLocalRow = localRows.find((lr) => {
        return keyCols.every((colKey) => {
          const colDef = tabSchema.columns.find((c) => c.fieldKey === colKey);
          if (!colDef) return true;
          const remoteVal = String(rowValues[colDef.colIndex] ?? '').trim();
          const localVal = String(lr.values[colKey] ?? '').trim();
          return remoteVal.toLowerCase() === localVal.toLowerCase();
        });
      }) || localRows.find((lr) => lr.lastKnownSheetRow === pulledRow.sheetRowNumber);

      if (!matchedLocalRow) continue;

      // Update physical row cache in case rows shifted
      matchedLocalRow.lastKnownSheetRow = pulledRow.sheetRowNumber;

      // 3-way reconciliation on editable fields
      for (const col of tabSchema.columns) {
        if (!col.editable) continue;
        const remoteVal = rowValues[col.colIndex] ?? null;
        const baseVal = matchedLocalRow.baseValues[col.fieldKey] ?? null;
        const localVal = matchedLocalRow.values[col.fieldKey] ?? null;

        // Check if remote value changed
        if (remoteVal !== baseVal) {
          // If local ALSO changed and differs from remote -> Conflict!
          if (localVal !== baseVal && localVal !== remoteVal) {
            conflictsDetected++;
            matchedLocalRow.status = 'conflict';
            try {
              await sheetHubStore.saveConflict(userId, {
                id: `conflict_${connectionId}_${matchedLocalRow.rowUid}_${col.fieldKey}`,
                connectionId,
                tabId: tabSchema.id,
                userId,
                rowUid: matchedLocalRow.rowUid,
                fieldKey: col.fieldKey,
                fieldLabel: col.displayName || col.headerName,
                baseValue: baseVal,
                localValue: localVal,
                remoteValue: remoteVal,
                status: 'open',
                resolution: null,
                detectedAt: nowIso,
                resolvedAt: null,
              });
            } catch (err) {
              console.warn('[SheetStudySync] Could not save conflict record:', err);
            }
          } else {
            // No local conflict -> adopt remote value cleanly!
            matchedLocalRow.values[col.fieldKey] = remoteVal;
            matchedLocalRow.baseValues[col.fieldKey] = remoteVal;
            matchedLocalRow.status = 'synced';
            matchedLocalRow.sheetSyncedAt = nowIso;
            updatedCells++;
            tabModified = true;
          }
        }
      }
    }

    if (tabModified) {
      await sheetHubStore.saveTabRowsChunked({
        userId,
        connectionId,
        tabId: tabSchema.id,
        rows: localRows,
      });
    }
  }

  // Update connection sync timestamps
  await sheetHubStore.saveConnection(userId, {
    ...conn,
    lastSyncedAt: nowIso,
    lastSuccessfulPullAt: nowIso,
    lastDriveSyncAt: nowIso,
    driveSyncStatus: conflictsDetected > 0 ? 'conflict' : 'synced',
    conflictCount: conflictsDetected,
    updatedAt: nowIso,
  }, { force: true });

  return {
    updatedCells,
    conflictsDetected,
    lastSyncedAt: nowIso,
  };
}

// ============================================================================
// DIRECTION C: GOOGLE SHEETS → STUDY OS AUTOMATIC SYNC & POLLING
// ============================================================================

/**
 * Pulls current row states from connected syllabus tabs in Google Sheets.
 * Detects external changes to checkboxes (e.g. checked directly in Google Sheets).
 * Updates corresponding StudyTopic records in Study OS (theory + practice) and
 * updates StudySubject completed topic counts without creating duplicate topics.
 *
 * Invariants:
 * - Overview / Dashboard / Summary tabs are strictly ignored (never create/sync syllabus topics from them).
 * - Topics are matched via stable source keys or (subjectCode, unit, topic, subtopic) tuples.
 * - Progress calculations are immediately refreshed for affected subjects.
 * - Idempotent: running multiple times with unchanged sheet values produces 0 mutations.
 */
export async function pollAndSyncGoogleSheetsToStudyOS(
  userId: string,
  options?: { manual?: boolean }
): Promise<StudySheetsSyncReport> {
  const nowIso = new Date().toISOString();
  try {
    const connections = await sheetHubStore.listConnections(userId);
    const activeConnections = connections.filter(
      (c) =>
        c.status !== 'paused' &&
        c.status !== 'error' &&
        !c.deletedAt
    );

    if (activeConnections.length === 0) {
      return {
        success: true,
        syncedAt: nowIso,
        updatedTopicsCount: 0,
        updatedSubjectsCount: 0,
        error: null,
      };
    }

    let totalUpdatedTopics = 0;
    const affectedSubjectCodes = new Set<string>();
    const token = await getSheetHubWriteAccessToken().catch(() => null);
    let livePullFailed = false;
    let livePullErrorDetail: string | null = null;

    // Load existing Study OS state
    const existingTopics = await api.getStudyTopics();
    const activeTopics = (existingTopics || []).filter((t) => !t.deletedAt);
    const existingSubjects = await api.getStudySubjects();
    const activeSubjects = (existingSubjects || []).filter((s) => !s.deletedAt);

    // Build fast & normalized lookup indexes for active topics
    const topicBySourceKey = new Map<string, StudyTopic>();
    const topicByRowId = new Map<string, StudyTopic>();
    const topicByConcept = new Map<string, StudyTopic>();
    const topicByNormConcept = new Map<string, StudyTopic>();
    const topicBySubjectAndTitle = new Map<string, StudyTopic | null>();

    for (const t of activeTopics) {
      if (t.sourceMappingKey) topicBySourceKey.set(t.sourceMappingKey, t);
      if (t.sourceRowId) topicByRowId.set(t.sourceRowId, t);

      const cKey = `${t.subjectCode.toUpperCase()}|${(t.unit || 'general').trim().toLowerCase()}|${t.topic.trim().toLowerCase()}::${t.subtopic.trim().toLowerCase()}`;
      if (!topicByConcept.has(cKey)) topicByConcept.set(cKey, t);

      const normSubj = normalizeForComparison(t.subjectCode);
      const normUnit = normalizeForComparison(t.unit || 'general');
      const normTop = normalizeForComparison(t.topic || '');
      const normSub = normalizeForComparison(t.subtopic || '');
      const normKey = `${normSubj}|${normUnit}|${normTop}|${normSub}`;
      if (!topicByNormConcept.has(normKey)) topicByNormConcept.set(normKey, t);

      const titleOnlyKey = `${normSubj}|${normSub || normTop}`;
      if (!topicBySubjectAndTitle.has(titleOnlyKey)) {
        topicBySubjectAndTitle.set(titleOnlyKey, t);
      } else {
        // Mark ambiguous if multiple topics share the exact same title in one subject
        topicBySubjectAndTitle.set(titleOnlyKey, null);
      }
    }

    const resolveTopicMatch = (
      rowUid: string | undefined,
      connId: string,
      sheetId: string | number,
      subjectCode: string,
      unit: string,
      topic: string,
      subtopic: string
    ): StudyTopic | undefined => {
      if (rowUid) {
        const byRow = topicByRowId.get(rowUid);
        if (byRow) return byRow;
        const bySource =
          topicBySourceKey.get(rowUid) ||
          topicBySourceKey.get(`${connId}:${sheetId}:${rowUid}`);
        if (bySource) return bySource;
      }

      const rawKey = `${subjectCode.toUpperCase()}|${unit.toLowerCase()}|${topic.toLowerCase()}::${subtopic.toLowerCase()}`;
      const byRaw = topicByConcept.get(rawKey);
      if (byRaw) return byRaw;

      const normSubj = normalizeForComparison(subjectCode);
      const normUnit = normalizeForComparison(unit || 'general');
      const normTop = normalizeForComparison(topic || '');
      const normSub = normalizeForComparison(subtopic || '');

      const byNorm = topicByNormConcept.get(`${normSubj}|${normUnit}|${normTop}|${normSub}`);
      if (byNorm) return byNorm;

      const byTitle = topicBySubjectAndTitle.get(`${normSubj}|${normSub || normTop}`);
      return byTitle || undefined;
    };

    const applyTopicCompletion = async (matchedTopic: StudyTopic, isDone: boolean, rowUid?: string) => {
      const needsUpdate =
        Boolean(matchedTopic.theory) !== isDone || Boolean(matchedTopic.practice) !== isDone;
      if (!needsUpdate) return;

      matchedTopic.theory = isDone;
      matchedTopic.practice = isDone;
      if (rowUid && !matchedTopic.sourceRowId) {
        matchedTopic.sourceRowId = rowUid;
      }
      matchedTopic.updatedAt = nowIso;

      try {
        await api.saveStudyTopic(matchedTopic);
        totalUpdatedTopics++;
        affectedSubjectCodes.add(matchedTopic.subjectCode);
      } catch (saveErr) {
        console.warn('[SheetStudySync] Could not save updated topic:', saveErr);
      }
    };

    for (const conn of activeConnections) {
      const tabs = await sheetHubStore.listTabsForConnection(userId, conn.id);
      // Strictly skip dashboard, overview, and reference tabs
      const syllabusTabs = tabs.filter((t) => {
        if (
          t.role === 'overview' ||
          t.role === 'summary' ||
          t.role === 'instructions' ||
          t.role === 'metadata' ||
          t.role === 'ignored'
        ) {
          return false;
        }
        const normTitle = t.sheetTitle.toLowerCase().trim();
        return (
          normTitle !== 'overview' &&
          normTitle !== 'summary' &&
          normTitle !== 'dashboard' &&
          normTitle !== 'index'
        );
      });

      if (syllabusTabs.length === 0) continue;

      let pullRes: Awaited<ReturnType<typeof api.sheetHubPull>> | null = null;
      if (!conn.isNative && conn.spreadsheetId !== 'sem3-syllabus-sample') {
        const tabsToPull = syllabusTabs.map((t) => ({
          sheetId: t.sheetId,
          sheetTitle: t.sheetTitle,
          headerRowIndex: t.headerRowIndex || 1,
        }));

        try {
          pullRes = await api.sheetHubPull(
            {
              spreadsheetId: conn.spreadsheetId,
              tabs: tabsToPull,
              publicAccess: Boolean((conn as any).isPublicLink),
            },
            token || undefined
          );
        } catch (pullErr: unknown) {
          livePullFailed = true;
          livePullErrorDetail =
            pullErr instanceof Error ? pullErr.message : 'Google Sheets pull failed';
          console.warn(
            `[SheetStudySync] Live pull failed for ${conn.spreadsheetId}, falling back to Sheet Hub cache:`,
            pullErr
          );
        }
      }

      if (pullRes && pullRes.tabs && pullRes.tabs.length > 0) {
        for (const pulledTab of pullRes.tabs) {
          const tabSchema = syllabusTabs.find(
            (t) => t.sheetTitle.toLowerCase() === pulledTab.sheetTitle.toLowerCase()
          );
          if (!tabSchema) continue;

          const doneCol = findDoneColumn(tabSchema.columns);
          const headers = pulledTab.headers || [];
          let doneColIndex = doneCol ? doneCol.colIndex : -1;
          if (doneColIndex < 0) {
            doneColIndex = headers.findIndex((h) =>
              /^(done|completed|status|chk|complete|checked)$/i.test(h.trim())
            );
          }
          if (doneColIndex < 0) continue;

          const matchedSubject = activeSubjects.find((s) =>
            isSubjectMatchingTab(s.code, s.name, tabSchema.sheetTitle)
          );
          const subjectCode =
            matchedSubject?.code || `sub_${tabSchema.sheetTitle.toLowerCase().replace(/[^a-z0-9]/g, '')}`;

          const unitCol = tabSchema.columns.find((c) => c.semanticRole === 'group');
          const topicCol = tabSchema.columns.find((c) => c.semanticRole === 'subgroup' || c.semanticRole === 'title');
          const subtopicCol = tabSchema.columns.find((c) => c.semanticRole === 'title');

          const unitIdx = unitCol ? unitCol.colIndex : headers.findIndex((h) => /^(unit|module|chapter|section)$/i.test(h.trim()));
          const topicIdx = topicCol ? topicCol.colIndex : headers.findIndex((h) => /^(topic|concept|title|name)$/i.test(h.trim()));
          const subtopicIdx = subtopicCol ? subtopicCol.colIndex : headers.findIndex((h) => /^(sub[\s_-]?topic|subtopic|item|detail)$/i.test(h.trim()));

          for (const pulledRow of pulledTab.rows || []) {
            if (pulledRow.formulaColumns?.includes(doneColIndex)) continue;

            const isDone = parseBooleanDone(pulledRow.values[doneColIndex]);
            const rawUnit = unitIdx >= 0 ? String(pulledRow.values[unitIdx] ?? '').trim() : '';
            const rawTopic = topicIdx >= 0 ? String(pulledRow.values[topicIdx] ?? '').trim() : '';
            const rawSubtopic = subtopicIdx >= 0 ? String(pulledRow.values[subtopicIdx] ?? '').trim() : '';

            if (isSummaryOrInvalidSyllabusRow(rawUnit, rawTopic, rawSubtopic).isInvalid) continue;

            const unit = rawUnit || 'General';
            const topic = rawTopic || rawSubtopic;
            const subtopic = rawSubtopic || rawTopic;

            const matchedTopic = resolveTopicMatch(
              (pulledRow as any).rowUid,
              conn.id,
              tabSchema.sheetId,
              subjectCode,
              unit,
              topic,
              subtopic
            );
            if (!matchedTopic) continue;

            await applyTopicCompletion(matchedTopic, isDone, (pulledRow as any).rowUid);
          }
        }
      } else {
        // Reconcile from Sheet Sync Hub stored rows (Native Sheets, Demo, or when live Google pull fails/offline)
        for (const tabSchema of syllabusTabs) {
          const doneCol = findDoneColumn(tabSchema.columns);
          if (!doneCol) continue;

          const storedRows = await sheetHubStore.loadTabRows(userId, tabSchema.id).catch(() => []);
          if (storedRows.length === 0) continue;

          const matchedSubject = activeSubjects.find((s) =>
            isSubjectMatchingTab(s.code, s.name, tabSchema.sheetTitle)
          );
          const subjectCode =
            matchedSubject?.code || `sub_${tabSchema.sheetTitle.toLowerCase().replace(/[^a-z0-9]/g, '')}`;

          const unitCol = tabSchema.columns.find((c) => c.semanticRole === 'group');
          const topicCol = tabSchema.columns.find((c) => c.semanticRole === 'subgroup' || c.semanticRole === 'title');
          const subtopicCol =
            tabSchema.columns.find((c) => c.semanticRole === 'title') ||
            tabSchema.columns.find((c) => c.inferredType === 'text');

          for (const storedRow of storedRows) {
            const vals = storedRow.values || storedRow.cells || {};
            const isDone = parseBooleanDone(vals[doneCol.fieldKey]);

            const rawUnit = unitCol ? String(vals[unitCol.fieldKey] ?? '').trim() : '';
            const rawTopic = topicCol ? String(vals[topicCol.fieldKey] ?? '').trim() : '';
            const rawSubtopic = subtopicCol ? String(vals[subtopicCol.fieldKey] ?? '').trim() : '';

            if (isSummaryOrInvalidSyllabusRow(rawUnit, rawTopic, rawSubtopic).isInvalid) continue;

            const unit = rawUnit || 'General';
            const topic = rawTopic || rawSubtopic;
            const subtopic = rawSubtopic || rawTopic;

            const matchedTopic = resolveTopicMatch(
              storedRow.rowUid,
              conn.id,
              tabSchema.sheetId,
              subjectCode,
              unit,
              topic,
              subtopic
            );
            if (!matchedTopic) continue;

            await applyTopicCompletion(matchedTopic, isDone, storedRow.rowUid);
          }
        }
      }

      // Update connection lastSyncedAt only when live pull succeeded or local-only sheet
      if (!livePullFailed) {
        try {
          await sheetHubStore.saveConnection(
            userId,
            {
              ...conn,
              lastSyncedAt: nowIso,
              lastSuccessfulPullAt: nowIso,
              updatedAt: nowIso,
            },
            { force: true }
          );
        } catch {
          // Non-fatal
        }
      }
    }

    // Recalculate affected subjects
    let updatedSubjectsCount = 0;
    for (const code of affectedSubjectCodes) {
      const subj = activeSubjects.find((s) => s.code === code);
      if (subj) {
        const subjTopics = activeTopics.filter((t) => t.subjectCode === code);
        subj.completedSubtopics = subjTopics.filter((t) => t.theory && t.practice).length;
        subj.totalSubtopics = subjTopics.length;
        subj.updatedAt = nowIso;
        try {
          await api.saveStudySubject(subj);
          updatedSubjectsCount++;
        } catch {
          // Non-fatal
        }
      }
    }

    // Flush any pending writebacks if write token is active
    if (token) {
      await flushPendingWritebacks(userId).catch(() => {});
    }

    if (livePullFailed && totalUpdatedTopics === 0) {
      return {
        success: false,
        syncedAt: nowIso,
        updatedTopicsCount: 0,
        updatedSubjectsCount: 0,
        error: `Reconnect Google Sheets to pull live changes (${livePullErrorDetail || 'auth expired'}). Local Sheet Hub cache checked.`,
      };
    }

    return {
      success: true,
      syncedAt: nowIso,
      updatedTopicsCount: totalUpdatedTopics,
      updatedSubjectsCount,
      error: livePullFailed
        ? 'Synced from local Sheet Hub cache; reconnect Google Sheets to pull live changes.'
        : null,
    };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error('[SheetStudySync] Error during pollAndSyncGoogleSheetsToStudyOS:', err);
    return {
      success: false,
      syncedAt: nowIso,
      updatedTopicsCount: 0,
      updatedSubjectsCount: 0,
      error: msg,
    };
  }
}

/**
 * Retrieves the current synchronization health and status for Study OS.
 */
export async function syncSheetRowCheckboxToStudyOS(input: {
  userId: string;
  connection: SheetConnection;
  tab: SheetTabSchema;
  row: SheetSyncedRow;
  fieldKey: string;
  nextValue: boolean;
}): Promise<boolean> {
  const { connection, tab, row, fieldKey, nextValue } = input;
  const doneCol = findDoneColumn(tab.columns);
  const editedCol = tab.columns.find((c) => c.fieldKey === fieldKey);
  const isDoneField =
    (doneCol && doneCol.fieldKey === fieldKey) ||
    editedCol?.semanticRole === 'done' ||
    editedCol?.inferredType === 'checkbox';

  if (!isDoneField) return false;

  const [existingTopics, existingSubjects] = await Promise.all([
    api.getStudyTopics().catch(() => [] as StudyTopic[]),
    api.getStudySubjects().catch(() => []),
  ]);
  const activeTopics = (existingTopics || []).filter((t) => !t.deletedAt);
  const activeSubjects = (existingSubjects || []).filter((s) => !s.deletedAt);
  if (activeTopics.length === 0) return false;

  const subjectNameByCode = new Map(activeSubjects.map((s) => [s.code, s.name]));

  // Priority 1: Direct sourceRowId or sourceMappingKey match
  let matchedTopic = activeTopics.find(
    (t) =>
      (t.sourceRowId && t.sourceRowId === row.rowUid) ||
      (t.sourceMappingKey &&
        (t.sourceMappingKey === row.rowUid ||
          t.sourceMappingKey === `${connection.id}:${tab.sheetId}:${row.rowUid}`))
  );

  // Priority 2: Semantic hierarchy match against tab's title/group/subgroup columns
  if (!matchedTopic) {
    const rowValues = row.values || row.cells || {};
    const titleCol =
      tab.columns.find((c) => c.semanticRole === 'title') ||
      tab.columns.find((c) => c.inferredType === 'text');
    const groupCol = tab.columns.find((c) => c.semanticRole === 'group');
    const subgroupCol = tab.columns.find((c) => c.semanticRole === 'subgroup');

    const rowTitle = normalizeForComparison(titleCol ? String(rowValues[titleCol.fieldKey] ?? '') : '');
    const rowGroup = normalizeForComparison(groupCol ? String(rowValues[groupCol.fieldKey] ?? '') : '');
    const rowSubgroup = normalizeForComparison(subgroupCol ? String(rowValues[subgroupCol.fieldKey] ?? '') : '');

    if (rowTitle || rowSubgroup) {
      matchedTopic = activeTopics.find((t) => {
        if (!isSubjectMatchingTab(t.subjectCode, subjectNameByCode.get(t.subjectCode), tab.sheetTitle)) {
          return false;
        }
        const normSubtopic = normalizeForComparison(t.subtopic || '');
        const normTopic = normalizeForComparison(t.topic || '');
        const normUnit = normalizeForComparison(t.unit || '');

        const titleMatches =
          (rowTitle && (normSubtopic === rowTitle || normTopic === rowTitle)) ||
          (rowSubgroup && normSubtopic === rowSubgroup);
        if (!titleMatches) return false;

        if (rowGroup && normUnit && normUnit !== 'general' && normUnit !== rowGroup && normTopic !== rowGroup) {
          return false;
        }
        return true;
      });
    }
  }

  if (!matchedTopic) return false;

  const currentlyDone = Boolean(matchedTopic.theory && matchedTopic.practice);
  if (currentlyDone === nextValue && matchedTopic.theory === nextValue && matchedTopic.practice === nextValue) {
    return false;
  }

  const nowIso = new Date().toISOString();
  const updatedTopic: StudyTopic = {
    ...matchedTopic,
    theory: nextValue,
    practice: nextValue,
    sourceRowId: matchedTopic.sourceRowId || row.rowUid,
    updatedAt: nowIso,
  };

  await api.saveStudyTopic(updatedTopic);

  // Update subject completedSubtopics count cleanly
  const subject = activeSubjects.find((s) => s.code === matchedTopic!.subjectCode);
  if (subject) {
    const subjectTopics = activeTopics.map((t) => (t.id === updatedTopic.id ? updatedTopic : t));
    const completedCount = subjectTopics.filter(
      (t) => t.subjectCode === subject.code && Boolean(t.theory && t.practice)
    ).length;
    if (subject.completedSubtopics !== completedCount) {
      await api
        .saveStudySubject({
          ...subject,
          completedSubtopics: completedCount,
          updatedAt: nowIso,
        })
        .catch(() => {});
    }
  }

  return true;
}

export async function getStudySheetSyncState(userId: string): Promise<StudySheetSyncState> {
  try {
    const connections = await sheetHubStore.listConnections(userId);
    const active = connections.filter((c) => !c.deletedAt && !c.isNative);
    const pending = readPendingQueue(userId);

    if (active.length === 0) {
      return {
        status: 'no_connection',
        lastSyncedAt: null,
        pendingCount: 0,
        canWrite: false,
      };
    }

    const primaryConn = active[0];
    const canWrite = primaryConn.writeAuthStatus === 'authorized' && !primaryConn.isPublicLink;

    let status: StudySheetSyncState['status'] = 'synced';
    if (pending.length > 0) {
      status = 'pending_changes';
    } else if (primaryConn.status === 'auth_required' || primaryConn.writeAuthStatus === 'expired') {
      status = 'permission_required';
    } else if (primaryConn.syncMode === 'sheet_to_app' || primaryConn.writeMode === 'none' || (primaryConn as any).isPublicLink) {
      status = 'read_only';
    } else if (primaryConn.status === 'error') {
      status = 'sync_failed';
    } else {
      status = 'synced';
    }

    return {
      status,
      lastSyncedAt: primaryConn.lastSyncedAt || primaryConn.lastSuccessfulPushAt || null,
      pendingCount: pending.length,
      connectedSheetTitle: primaryConn.title || primaryConn.spreadsheetId,
      canWrite,
      errorMessage: primaryConn.lastError || null,
    };
  } catch (err) {
    return {
      status: 'no_connection',
      lastSyncedAt: null,
      pendingCount: 0,
      canWrite: false,
      errorMessage: err instanceof Error ? err.message : 'Failed to get sync state',
    };
  }
}
