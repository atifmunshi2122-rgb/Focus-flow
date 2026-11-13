import { DurableSyncOperation } from '../types/index.ts';
import { api } from './api.ts';
import { auth } from './firebase.ts';
import {
  WORKSHEET_NAMES,
  WorksheetName,
  getSheetId,
  isDashboardWorksheet,
  colIndexToLetter,
  WORKSHEET_HEADERS,
  SHEET_COLUMN_FORMATS,
  SheetFormatSpec,
  SyncQueueItem,
  SheetsSnapshotPayload,
  SpreadsheetSheetMeta,
  VerifiedSpreadsheetMetadata,
  formatPaymentMethodLabel,
  buildCreateStylingRequests,
  buildSyncResizeRequests,
  buildSyncValueUpdates,
  buildDynamicClearRanges,
  buildInitialHeaderValueUpdates,
} from './sheetsSpec.ts';

export {
  WORKSHEET_NAMES,
  getSheetId,
  isDashboardWorksheet,
  colIndexToLetter,
  WORKSHEET_HEADERS,
  SHEET_COLUMN_FORMATS,
  formatPaymentMethodLabel,
  buildCreateStylingRequests,
  buildSyncResizeRequests,
  buildSyncValueUpdates,
  buildDynamicClearRanges,
  buildInitialHeaderValueUpdates,
};
export type {
  WorksheetName,
  SheetFormatSpec,
  SyncQueueItem,
  SheetsSnapshotPayload,
  SpreadsheetSheetMeta,
  VerifiedSpreadsheetMetadata,
};

type QueueListener = (count: number) => void;

const CACHE_KEY_PREFIX = 'ff_sync_queue_cache_v1_';

function getQueueCacheStorageKey(): string {
  const uid = auth.currentUser?.uid || 'guest';
  return `${CACHE_KEY_PREFIX}${uid}`;
}

function readCachedQueue(): DurableSyncOperation[] {
  if (typeof localStorage === 'undefined') return [];
  try {
    const raw = localStorage.getItem(getQueueCacheStorageKey());
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function writeCachedQueue(ops: DurableSyncOperation[]): void {
  if (typeof localStorage === 'undefined') return;
  try {
    localStorage.setItem(getQueueCacheStorageKey(), JSON.stringify(ops));
  } catch {
    // ignore storage quota errors
  }
}

// ============================================================================
// GOOGLE SHEETS CLIENT FACADE (ALL SHEETS API CALLS DELEGATE TO BACKEND WORKER)
// ============================================================================
class GoogleSheetsService {
  private lastError: string | null = null;
  private cachedQueueOps: DurableSyncOperation[] = readCachedQueue();
  private listeners = new Set<QueueListener>();

  private notifyListeners(): void {
    const count = this.getQueueLength();
    this.listeners.forEach((cb) => {
      try {
        cb(count);
      } catch {
        // isolate subscriber errors
      }
    });
  }

  public subscribeQueue(listener: QueueListener): () => void {
    this.listeners.add(listener);
    listener(this.getQueueLength());
    return () => {
      this.listeners.delete(listener);
    };
  }

  private setQueueSnapshot(ops: DurableSyncOperation[]): void {
    const active = (ops || []).filter((op) => op && op.status !== 'completed');
    this.cachedQueueOps = active;
    writeCachedQueue(active);
    this.notifyListeners();
  }

  public async refreshQueueCount(): Promise<number> {
    try {
      const ops = await api.getSyncQueue();
      this.setQueueSnapshot(ops);
      return this.getQueueLength();
    } catch {
      this.cachedQueueOps = readCachedQueue();
      this.notifyListeners();
      return this.getQueueLength();
    }
  }

  public getQueueLength(): number {
    return this.cachedQueueOps.filter((op) => op.status !== 'completed').length;
  }

  public getLastError(): string | null {
    return this.lastError;
  }

  public clearLastError(): void {
    this.lastError = null;
  }

  public async verifySpreadsheet(spreadsheetId: string, accessToken: string): Promise<{
    spreadsheetId: string;
    title: string;
    sheetsCount: number;
  }> {
    return api.sheetsVerify(spreadsheetId, accessToken);
  }

  /**
   * Creates a 23-worksheet styled workbook via the backend Google Sheets worker.
   */
  public async createMasterWorkbook(accessToken: string): Promise<string> {
    const res = await api.sheetsCreateWorkbook(accessToken);
    return res.spreadsheetId;
  }

  /**
   * Explicit user-requested formatting & auto-resize repair via backend worker.
   */
  public async applyFormatting(
    spreadsheetId: string,
    accessToken: string,
    includeAutoResize = true
  ): Promise<void> {
    await api.sheetsApplyFormatting(spreadsheetId, accessToken, includeAutoResize);
    this.lastError = null;
  }

  /**
   * Synchronizes all 23 worksheets via backend worker (value-only updates; preserves widths, charts & validations).
   */
  public async syncAllData(
    spreadsheetId: string,
    accessToken: string,
    data: SheetsSnapshotPayload
  ): Promise<void> {
    try {
      await api.sheetsSync(spreadsheetId, accessToken, data);
      this.lastError = null;
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Google Sheets synchronization failed.';
      this.lastError = msg;
      const wrapped = new Error(msg) as Error & { code?: string; status?: number };
      if (err && typeof err === 'object') {
        if ('code' in err && typeof (err as { code?: unknown }).code === 'string') {
          wrapped.code = (err as { code: string }).code;
        }
        if ('status' in err && typeof (err as { status?: unknown }).status === 'number') {
          wrapped.status = (err as { status: number }).status;
        }
      }
      throw wrapped;
    }
  }

  /**
   * Safe historical resync requiring explicit user confirmation (`confirmed === true`).
   * Executed strictly on the backend worker with metadata verification and dynamic clear ranges.
   */
  public async historicalResync(
    spreadsheetId: string,
    accessToken: string,
    data: SheetsSnapshotPayload,
    confirmed: boolean
  ): Promise<{ clearedRangesCount: number; updatedRangesCount: number }> {
    if (confirmed !== true) {
      throw new Error('Historical resync cancelled: explicit confirmation is required.');
    }
    try {
      const res = await api.sheetsHistoricalResync(spreadsheetId, accessToken, data, true);
      this.lastError = null;
      return res;
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Historical resync failed.';
      this.lastError = msg;
      const wrapped = new Error(msg) as Error & { code?: string; status?: number };
      if (err && typeof err === 'object') {
        if ('code' in err && typeof (err as { code?: unknown }).code === 'string') {
          wrapped.code = (err as { code: string }).code;
        }
        if ('status' in err && typeof (err as { status?: unknown }).status === 'number') {
          wrapped.status = (err as { status: number }).status;
        }
      }
      throw wrapped;
    }
  }

  /**
   * Enqueue mutation into durable Firestore/server queue with deterministic dedupeKey.
   */
  public async enqueueMutation(
    sheetName: WorksheetName,
    payload: unknown,
    action: DurableSyncOperation['action'] = 'append',
    explicitDedupeKey?: string
  ): Promise<void> {
    const resolveEntityType = (sheet: WorksheetName): DurableSyncOperation['entityType'] => {
      if (sheet === 'Focus_Sessions') return 'focus_session';
      if (sheet === 'Tasks') return 'task';
      if (sheet === 'Income') return 'income';
      if (sheet === 'Fixed_Expenses' || sheet === 'Variable_Expenses') return 'expense';
      if (sheet === 'Bills_Payments') return 'bill';
      if (sheet === 'Budgets') return 'budget';
      if (sheet === 'Savings_Goals') return 'savings_goal';
      return 'full_sync';
    };

    const rowId =
      Array.isArray(payload) && payload[0] !== undefined && payload[0] !== null
        ? String(payload[0]).trim()
        : '';
    const dedupeKey =
      explicitDedupeKey ||
      `${sheetName}_${action}_${rowId || Date.now().toString(36)}`;

    const opPayload = {
      entityType: resolveEntityType(sheetName),
      action,
      sheetName,
      payload,
      dedupeKey,
    };

    // Optimistic local queue cache update so getQueueLength() reflects pending count immediately
    const existingIdx = this.cachedQueueOps.findIndex(
      (q) => q.dedupeKey === dedupeKey && q.status !== 'completed'
    );
    const optimisticOp: DurableSyncOperation = {
      id: existingIdx >= 0 ? this.cachedQueueOps[existingIdx].id : `pending_${dedupeKey}`,
      userId: auth.currentUser?.uid || 'guest',
      ...opPayload,
      status: 'pending',
      attempts: existingIdx >= 0 ? this.cachedQueueOps[existingIdx].attempts : 0,
      createdAt: new Date().toISOString(),
    };
    if (existingIdx >= 0) {
      this.cachedQueueOps[existingIdx] = optimisticOp;
    } else {
      this.cachedQueueOps = [...this.cachedQueueOps, optimisticOp];
    }
    writeCachedQueue(this.cachedQueueOps);
    this.notifyListeners();

    try {
      const saved = await api.enqueueSync(opPayload);
      const updated = this.cachedQueueOps.filter(
        (q) => q.id !== optimisticOp.id && !(dedupeKey && q.dedupeKey === dedupeKey)
      );
      updated.push(saved);
      this.setQueueSnapshot(updated);
    } catch (err) {
      console.warn('[Sync] Server queue enqueue failed, retained in local pending cache:', err);
    }
  }

  /**
   * Flushes pending durable sync operations via the backend Sheets worker.
   */
  public async flushQueue(spreadsheetId: string, accessToken: string): Promise<number> {
    let pendingOps: DurableSyncOperation[] = [];
    try {
      pendingOps = await api.getSyncQueue();
    } catch {
      pendingOps = this.cachedQueueOps;
    }

    const activeOps = (pendingOps || []).filter((op) => op.status !== 'completed');
    this.setQueueSnapshot(activeOps);
    if (activeOps.length === 0) return 0;

    try {
      const summary = await api.sheetsFlushQueue(spreadsheetId, accessToken, activeOps);

      for (const res of summary.results) {
        await api
          .updateSyncOpStatus(res.id, {
            status: res.status,
            attempts: res.attempts,
            nextRetryAt: res.nextRetryAt ?? null,
            errorMessage: res.errorMessage ?? null,
            lastAttemptAt: new Date().toISOString(),
          })
          .catch(() => {});
      }

      const refreshed = await api.getSyncQueue().catch(() => {
        const resultById = new Map(summary.results.map((r) => [r.id, r]));
        return activeOps.map((op) => {
          const r = resultById.get(op.id);
          return r
            ? {
                ...op,
                status: r.status,
                attempts: r.attempts,
                nextRetryAt: r.nextRetryAt ?? null,
                errorMessage: r.errorMessage ?? null,
              }
            : op;
        });
      });

      this.setQueueSnapshot(refreshed);

      if (summary.failed > 0) {
        const firstErr = summary.results.find((r) => r.errorMessage)?.errorMessage || 'Sync queue error';
        this.lastError = firstErr;
      } else {
        this.lastError = null;
      }

      return summary.processed;
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Queue flush failed.';
      this.lastError = msg;
      const wrapped = new Error(msg) as Error & { code?: string; status?: number };
      if (err && typeof err === 'object') {
        if ('code' in err && typeof (err as { code?: unknown }).code === 'string') {
          wrapped.code = (err as { code: string }).code;
        }
        if ('status' in err && typeof (err as { status?: unknown }).status === 'number') {
          wrapped.status = (err as { status: number }).status;
        }
      }
      throw wrapped;
    }
  }
}

export const googleSheetsService = new GoogleSheetsService();
