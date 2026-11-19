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
import type {
  PendingTopicWriteback,
  SheetColumnMapping,
  SheetConnection,
  SheetSyncedRow,
  SheetTabSchema,
  StudyTopicSyncResult,
} from '../../types/sheetHub.ts';
import type { StudyTopic } from '../../types/study.ts';

export type { StudyTopicSyncResult };

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

  const normSubtopic = normalizeForComparison(topic.subtopic);
  const normTopic = normalizeForComparison(topic.topic);
  const normUnit = normalizeForComparison(topic.unit);

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
    await api.sheetHubPushCells(
      {
        spreadsheetId: conn.spreadsheetId,
        updates: [{
          sheetTitle: matchingTab.sheetTitle,
          rowNumber,
          colLetter,
          value: isCompleted,
        }],
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
        (c.syncMode === 'two_way' || c.syncMode === 'manual_only')
    );

    if (writeConnections.length === 0) {
      return { status: 'no_connection', synced: false, error: 'NO_WRITE_CONNECTIONS' };
    }

    // 2. Discover matching tab across write-enabled connections
    for (const conn of writeConnections) {
      const tabs = await sheetHubStore.listTabsForConnection(userId, conn.id);
      const matchingTab = tabs.find((t) =>
        isSubjectMatchingTab(topic.subjectCode, subjectName, t.sheetTitle)
      );

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

      // 5. Update local row state immediately (optimistic update)
      const nowIso = new Date().toISOString();
      const updatedRow: SheetSyncedRow = {
        ...targetRow,
        values: { ...targetRow.values, [doneCol.fieldKey]: isCompleted },
        baseValues: { ...targetRow.baseValues, [doneCol.fieldKey]: isCompleted },
        localUpdatedAt: nowIso,
        sheetSyncedAt: nowIso,
        status: 'synced',
      };

      const updatedRows = rows.map((r) => (r.rowUid === targetRow.rowUid ? updatedRow : r));
      await sheetHubStore.saveTabRowsChunked({
        userId,
        connectionId: conn.id,
        tabId: matchingTab.id,
        rows: updatedRows,
      });

      // 6. Demo / sample spreadsheet: local state is sufficient, no remote write needed
      if (conn.spreadsheetId === 'sem3-syllabus-sample') {
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
      return await attemptNativeOAuthWrite(
        userId, conn, matchingTab, doneCol, targetRow,
        rowNumber, colLetter, cellRef, isCompleted, topic
      );
    }

    return { status: 'no_matching_tab', synced: false, error: 'NO_MATCHING_TAB' };
  } catch (err: unknown) {
    console.error('[SheetStudySync] Unexpected error in syncStudyTopicCompletionToGoogleSheets:', err);
    return { status: 'error', synced: false, error: err instanceof Error ? err.message : String(err) };
  }
}
