import { DurableSyncOperation } from '../types/index.ts';
import { api } from './api.ts';
import {
  auth,
  getAccessToken,
  getSheetHubAccessToken,
  getSheetHubWriteAccessToken,
} from './firebase.ts';
import { googleSheetsService, WorksheetName } from './googleSheetsService.ts';

export type SyncCoordinatorStatus =
  | 'idle'
  | 'syncing'
  | 'synced'
  | 'pending'
  | 'auth_required'
  | 'permission_denied'
  | 'failed';

export interface SyncCoordinatorState {
  status: SyncCoordinatorStatus;
  pendingCount: number;
  lastSyncedAt: string | null;
  lastError: string | null;
  isOnline: boolean;
}

type SyncStateListener = (state: SyncCoordinatorState) => void;

class GoogleSheetsSyncCoordinator {
  private status: SyncCoordinatorStatus = 'idle';
  private lastSyncedAt: string | null = null;
  private lastError: string | null = null;
  private pendingCount = 0;
  private isOnline =
    typeof navigator !== 'undefined' && typeof navigator.onLine === 'boolean'
      ? navigator.onLine
      : true;

  private activeSpreadsheetId: string | null = null;
  private activeAccessToken: string | null = null;

  private isFlushing = false;
  private hasPendingFlush = false;
  private inFlightFlushPromise: Promise<number> | null = null;

  private listeners = new Set<SyncStateListener>();

  constructor() {
    this.setupNetworkListeners();
    // Subscribe to lower-level googleSheetsService queue changes
    googleSheetsService.subscribeQueue((count) => {
      this.pendingCount = count;
      if (this.pendingCount > 0 && this.status === 'synced') {
        this.status = 'pending';
      }
      this.emitChange();
    });
  }

  private setupNetworkListeners(): void {
    if (typeof window === 'undefined') return;

    window.addEventListener('online', () => {
      this.isOnline = true;
      this.emitChange();
      // Auto-drain queue when re-connecting to the internet
      void this.flushQueueSafe();
    });

    window.addEventListener('offline', () => {
      this.isOnline = false;
      this.emitChange();
    });
  }

  public subscribe(listener: SyncStateListener): () => void {
    this.listeners.add(listener);
    listener(this.getState());
    return () => {
      this.listeners.delete(listener);
    };
  }

  public getState(): SyncCoordinatorState {
    return {
      status: this.status,
      pendingCount: this.pendingCount,
      lastSyncedAt: this.lastSyncedAt,
      lastError: this.lastError,
      isOnline: this.isOnline,
    };
  }

  private emitChange(): void {
    const state = this.getState();
    this.listeners.forEach((fn) => {
      try {
        fn(state);
      } catch {
        // isolate subscriber faults
      }
    });
  }

  public reset(): void {
    const hadState =
      this.activeSpreadsheetId !== null ||
      this.activeAccessToken !== null ||
      this.status !== 'idle' ||
      this.lastSyncedAt !== null ||
      this.lastError !== null ||
      this.pendingCount !== 0 ||
      this.hasPendingFlush;

    this.activeSpreadsheetId = null;
    this.activeAccessToken = null;
    this.status = 'idle';
    this.lastSyncedAt = null;
    this.lastError = null;
    this.pendingCount = 0;
    this.hasPendingFlush = false;

    if (hadState) {
      this.emitChange();
    }
  }

  public setCredentials(spreadsheetId: string | null, accessToken: string | null): void {
    if (!spreadsheetId && !accessToken) {
      this.reset();
      return;
    }

    const previousSpreadsheetId = this.activeSpreadsheetId;
    const idChanged = previousSpreadsheetId !== spreadsheetId;
    const tokenChanged = this.activeAccessToken !== accessToken;

    this.activeSpreadsheetId = spreadsheetId;
    this.activeAccessToken = accessToken;

    if (!spreadsheetId) {
      this.status = 'idle';
      this.lastSyncedAt = null;
      this.lastError = null;
      this.pendingCount = 0;
      this.hasPendingFlush = false;
      this.emitChange();
      return;
    }

    if (previousSpreadsheetId && idChanged) {
      this.lastSyncedAt = null;
      this.lastError = null;
      this.status = this.pendingCount > 0 ? 'pending' : 'idle';
      this.emitChange();
    }

    if (spreadsheetId && accessToken && (idChanged || tokenChanged || this.pendingCount > 0)) {
      if (this.status === 'auth_required' || this.status === 'permission_denied') {
        this.status = this.pendingCount > 0 ? 'pending' : 'idle';
        this.lastError = null;
        this.emitChange();
      }
      // Trigger background auto-flush for any existing pending queue operations
      void this.flushQueueSafe();
    }
  }

  public async init(spreadsheetId?: string | null, token?: string | null): Promise<void> {
    if (spreadsheetId !== undefined) this.activeSpreadsheetId = spreadsheetId;
    if (token !== undefined) this.activeAccessToken = token;

    if (!this.activeAccessToken) {
      const stored = await getAccessToken().catch(() => null);
      if (stored) this.activeAccessToken = stored;
    }

    try {
      this.pendingCount = await googleSheetsService.refreshQueueCount();
    } catch {
      this.pendingCount = googleSheetsService.getQueueLength();
    }

    if (this.pendingCount > 0) {
      this.status = 'pending';
    } else if (this.activeSpreadsheetId && this.activeAccessToken) {
      this.status = 'synced';
    } else {
      this.status = 'idle';
    }

    this.emitChange();

    if (this.pendingCount > 0 && this.activeSpreadsheetId && this.activeAccessToken && this.isOnline) {
      void this.flushQueueSafe();
    }
  }

  /**
   * Deterministic, awaited enqueue and trigger pipeline.
   * Completely eliminates fire-and-forget race conditions by awaiting queue persistence before triggering a flush.
   */
  public async syncMutation(
    sheetName: WorksheetName,
    payload: unknown,
    action: DurableSyncOperation['action'] = 'append',
    explicitDedupeKey?: string
  ): Promise<void> {
    // 1. Await atomic enqueue to guarantee durable persistence in Firestore / local DB first
    await googleSheetsService.enqueueMutation(sheetName, payload, action, explicitDedupeKey);
    this.pendingCount = googleSheetsService.getQueueLength();

    // 2. Check prerequisites for immediate automated sync
    if (!this.activeSpreadsheetId) {
      this.status = 'pending';
      this.emitChange();
      return;
    }

    if (!this.activeAccessToken) {
      const restored = await getAccessToken().catch(() => null);
      if (restored) {
        this.activeAccessToken = restored;
      } else {
        this.status = 'auth_required';
        this.emitChange();
        return;
      }
    }

    if (!this.isOnline) {
      this.status = 'pending';
      this.emitChange();
      return;
    }

    // 3. Trigger serialized queue flush
    await this.flushQueueSafe();
  }

  /**
   * Serialized single-flight mutex flush.
   * Prevents premature, overlapping, or duplicated flushQueue calls against Google Sheets API.
   */
  public async flushQueueSafe(): Promise<number> {
    if (this.isFlushing) {
      this.hasPendingFlush = true;
      return this.inFlightFlushPromise || Promise.resolve(0);
    }

    const spreadsheetId = this.activeSpreadsheetId;
    let accessToken = this.activeAccessToken;

    if (!accessToken) {
      accessToken = await getAccessToken().catch(() => null);
      if (accessToken) this.activeAccessToken = accessToken;
    }

    if (!spreadsheetId || !accessToken) {
      if (this.pendingCount > 0) {
        this.status = !accessToken ? 'auth_required' : 'pending';
        this.emitChange();
      }
      return 0;
    }

    this.isFlushing = true;
    this.status = 'syncing';
    this.lastError = null;
    this.emitChange();

    this.inFlightFlushPromise = (async () => {
      let totalFlushed = 0;
      let retriedWithFreshToken = false;
      try {
        while (true) {
          this.hasPendingFlush = false;

          // Process canary check if there are pending operations
          const currentQueue = await api.getSyncQueue().catch(() => []);
          const activeOps = currentQueue.filter((o) => o.status !== 'completed');

          if (activeOps.length === 0) {
            this.pendingCount = 0;
            break;
          }

          try {
            // Execute backend-controlled flush
            const flushedCount = await googleSheetsService.flushQueue(spreadsheetId, accessToken!);
            totalFlushed += flushedCount;
            this.pendingCount = googleSheetsService.getQueueLength();
          } catch (flushErr: unknown) {
            const msg = flushErr instanceof Error ? flushErr.message : '';
            const isAuthErr = /\b401\b|UNAUTHENTICATED|invalid authentication credentials|Invalid Credentials/i.test(
              msg
            );
            if (isAuthErr && !retriedWithFreshToken) {
              retriedWithFreshToken = true;
              const freshToken =
                (await getSheetHubWriteAccessToken().catch(() => null)) ||
                (await getSheetHubAccessToken().catch(() => null)) ||
                (await getAccessToken().catch(() => null));
              if (freshToken && freshToken !== accessToken) {
                accessToken = freshToken;
                this.activeAccessToken = freshToken;
                continue;
              }
            }
            throw flushErr;
          }

          if (!this.hasPendingFlush) break;
        }

        const remainingQueue = await api.getSyncQueue().catch(() => []);
        const uncompleted = remainingQueue.filter((o) => o.status !== 'completed');
        this.pendingCount = uncompleted.length;

        if (this.pendingCount === 0) {
          this.status = 'synced';
          this.lastSyncedAt = new Date().toISOString();
          this.lastError = null;
        } else {
          this.status = 'pending';
          this.lastError = googleSheetsService.getLastError();
        }
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : 'Google Sheets sync failed.';
        this.lastError = msg;

        if (
          /\b401\b|UNAUTHENTICATED|invalid authentication credentials|Invalid Credentials/i.test(msg)
        ) {
          this.status = 'auth_required';
          this.activeAccessToken = null;
        } else if (
          /\b403\b|PERMISSION_DENIED|The caller does not have permission|insufficient authentication scopes/i.test(
            msg
          )
        ) {
          this.status = 'permission_denied';
        } else {
          this.status = 'failed';
        }

        console.error('[SyncCoordinator] Queue flush failed:', err);
      } finally {
        this.isFlushing = false;
        this.inFlightFlushPromise = null;
        this.emitChange();
      }

      return totalFlushed;
    })();

    return this.inFlightFlushPromise;
  }

  public getLastError(): string | null {
    return this.lastError;
  }

  public clearLastError(): void {
    this.lastError = null;
    this.emitChange();
  }
}

export const syncCoordinator = new GoogleSheetsSyncCoordinator();

