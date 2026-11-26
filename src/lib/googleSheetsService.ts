import { DurableSyncOperation } from '../types/index.ts';
import { api } from './api.ts';
import { auth } from './firebase.ts';
import type {
  WorksheetName,
  SheetFormatSpec,
  SyncQueueItem,
  SheetsSnapshotPayload,
  SpreadsheetSheetMeta,
  VerifiedSpreadsheetMetadata,
} from './sheetsSpec.ts';

export interface FlushOpResult {
  id: string;
  status: 'completed' | 'pending' | 'failed' | 'failed_recoverable';
  attempts: number;
  nextRetryAt?: number | null;
  errorMessage?: string | null;
  skippedDuplicate?: boolean;
}

export interface FlushQueueSummary {
  processed: number;
  skippedDuplicates: number;
  failed: number;
  results: FlushOpResult[];
}

export type {
  WorksheetName,
  SheetFormatSpec,
  SyncQueueItem,
  SheetsSnapshotPayload,
  SpreadsheetSheetMeta,
  VerifiedSpreadsheetMetadata,
};


/**
 * Lightweight helper to format payment method labels without loading the 723 kB sheetsSpec.
 */
export function formatPaymentMethodLabel(method?: string | null, isPaid = false): string {
  if (!isPaid && !method) return '—';
  const normalized = (method || '').trim().toLowerCase();
  if (normalized === 'cash') return 'Cash';
  if (normalized === 'card') return 'Card';
  if (normalized === 'upi_bank' || normalized === 'upi') return 'UPI / Bank';
  if (normalized === 'auto_debit') return 'Auto-Debit';
  if (normalized) return normalized.replace(/_/g, ' ').toUpperCase();
  return isPaid ? 'UPI / Bank' : '—';
}

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
  private cachedQueueOwnerKey: string = getQueueCacheStorageKey();
  private cachedQueueOps: DurableSyncOperation[] = readCachedQueue();
  private listeners = new Set<QueueListener>();

  private syncCacheOwner(): string {
    const currentKey = getQueueCacheStorageKey();
    if (this.cachedQueueOwnerKey !== currentKey) {
      this.cachedQueueOwnerKey = currentKey;
      this.cachedQueueOps = readCachedQueue();
      this.lastError = null;
    }
    return currentKey;
  }

  public resetForUserSwitch(): void {
    this.cachedQueueOwnerKey = getQueueCacheStorageKey();
    this.cachedQueueOps = readCachedQueue();
    this.lastError = null;
    this.notifyListeners();
  }

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
    this.syncCacheOwner();
    this.listeners.add(listener);
    listener(this.getQueueLength());
    return () => {
      this.listeners.delete(listener);
    };
  }

  private setQueueSnapshot(
    ops: DurableSyncOperation[],
    expectedOwnerKey: string = this.syncCacheOwner()
  ): void {
    // Discard stale async results if the active user switched mid-request
    if (getQueueCacheStorageKey() !== expectedOwnerKey) {
      this.resetForUserSwitch();
      return;
    }
    const active = (ops || []).filter((op) => op && op.status !== 'completed');
    this.cachedQueueOps = active;
    writeCachedQueue(active);
    this.notifyListeners();
  }

  public async refreshQueueCount(): Promise<number> {
    const scopeKey = this.syncCacheOwner();
    try {
      const ops = await api.getSyncQueue();
      if (getQueueCacheStorageKey() !== scopeKey) {
        this.resetForUserSwitch();
        return this.getQueueLength();
      }
      this.setQueueSnapshot(ops, scopeKey);
      return this.getQueueLength();
    } catch {
      this.syncCacheOwner();
      this.cachedQueueOps = readCachedQueue();
      this.notifyListeners();
      return this.getQueueLength();
    }
  }

  public getQueueLength(): number {
    this.syncCacheOwner();
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
   * Loads the heavy sheetsSpec engine on demand.
   */
  public async createMasterWorkbook(accessToken: string): Promise<string> {
    await import('./sheetsSpec.ts').catch((err) => {
      console.warn('[GoogleSheetsService] Dynamic sheetsSpec preload notice:', err);
    });
    const res = await api.sheetsCreateWorkbook(accessToken);
    return res.spreadsheetId;
  }

  /**
   * Explicit user-requested formatting & auto-resize repair via backend worker.
   * Loads the heavy sheetsSpec engine on demand.
   */
  public async applyFormatting(
    spreadsheetId: string,
    accessToken: string,
    includeAutoResize = true
  ): Promise<void> {
    await import('./sheetsSpec.ts').catch((err) => {
      console.warn('[GoogleSheetsService] Dynamic sheetsSpec preload notice:', err);
    });
    await api.sheetsApplyFormatting(spreadsheetId, accessToken, includeAutoResize);
    this.lastError = null;
  }

  /**
   * Synchronizes all 23 worksheets via backend worker (value-only updates; preserves widths, charts & validations).
   * Loads the heavy sheetsSpec engine on demand.
   */
  public async syncAllData(
    spreadsheetId: string,
    accessToken: string,
    data: SheetsSnapshotPayload
  ): Promise<void> {
    try {
      await import('./sheetsSpec.ts').catch((err) => {
        console.warn('[GoogleSheetsService] Dynamic sheetsSpec preload notice:', err);
      });
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
   * Loads the heavy sheetsSpec engine on demand.
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
      await import('./sheetsSpec.ts').catch((err) => {
        console.warn('[GoogleSheetsService] Dynamic sheetsSpec preload notice:', err);
      });
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

    // Sync cache scope to the active user before mutating optimistic queue state
    const scopeKey = this.syncCacheOwner();

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
      if (getQueueCacheStorageKey() !== scopeKey) {
        this.resetForUserSwitch();
        return;
      }
      const updated = this.cachedQueueOps.filter(
        (q) => q.id !== optimisticOp.id && !(dedupeKey && q.dedupeKey === dedupeKey)
      );
      updated.push(saved);
      this.setQueueSnapshot(updated, scopeKey);
    } catch (err) {
      console.warn('[Sync] Server queue enqueue failed, retained in local pending cache:', err);
    }
  }

  /**
   * Flushes pending durable sync operations via the backend Sheets worker.
   * Employs single-record canary validation when multiple operations are queued
   * to protect batch operations from cascading authentication or permission failures.
   */
  public async flushQueue(spreadsheetId: string, accessToken: string): Promise<number> {
    const scopeKey = this.syncCacheOwner();
    let pendingOps: DurableSyncOperation[] = [];
    try {
      pendingOps = await api.getSyncQueue();
    } catch {
      this.syncCacheOwner();
      pendingOps = this.cachedQueueOps;
    }

    if (getQueueCacheStorageKey() !== scopeKey) {
      this.resetForUserSwitch();
      return 0;
    }

    const activeOps = (pendingOps || []).filter((op) => op.status !== 'completed');
    this.setQueueSnapshot(activeOps, scopeKey);
    if (activeOps.length === 0) return 0;

    try {
      let allResults: FlushQueueSummary['results'] = [];
      let totalProcessed = 0;
      let totalFailed = 0;
      let totalSkipped = 0;

      // STEP 5 Canary protection: When multiple operations exist, verify target workbook connectivity with a single canary operation first
      if (activeOps.length > 1) {
        const canaryOp = [activeOps[0]];
        const canarySummary = await api.sheetsFlushQueue(spreadsheetId, accessToken, canaryOp);
        allResults = [...canarySummary.results];
        totalProcessed += canarySummary.processed;
        totalFailed += canarySummary.failed;
        totalSkipped += canarySummary.skippedDuplicates;

        for (const res of canarySummary.results) {
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

        if (canarySummary.failed > 0) {
          // Canary failed (e.g. 401 unauthenticated, 403 permission denied, 404 not found)
          // Halt remaining batch to prevent queue corruption and rate limit exhaustion
          const firstErr = canarySummary.results.find((r) => r.errorMessage)?.errorMessage || 'Canary validation failed';
          this.lastError = firstErr;
          this.notifyListeners();
          return totalProcessed;
        }

        // Canary passed — safely process remaining operations
        const remainingOps = activeOps.slice(1);
        if (remainingOps.length > 0) {
          const batchSummary = await api.sheetsFlushQueue(spreadsheetId, accessToken, remainingOps);
          allResults = [...allResults, ...batchSummary.results];
          totalProcessed += batchSummary.processed;
          totalFailed += batchSummary.failed;
          totalSkipped += batchSummary.skippedDuplicates;

          for (const res of batchSummary.results) {
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
        }
      } else {
        // Single operation flush
        const summary = await api.sheetsFlushQueue(spreadsheetId, accessToken, activeOps);
        allResults = summary.results;
        totalProcessed = summary.processed;
        totalFailed = summary.failed;
        totalSkipped = summary.skippedDuplicates;

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
      }

      const refreshed = await api.getSyncQueue().catch(() => {
        const resultById = new Map(allResults.map((r) => [r.id, r]));
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

      this.setQueueSnapshot(refreshed, scopeKey);

      if (totalFailed > 0) {
        const firstErr = allResults.find((r) => r.errorMessage)?.errorMessage || 'Sync queue error';
        this.lastError = firstErr;
      } else {
        this.lastError = null;
      }

      return totalProcessed;
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
