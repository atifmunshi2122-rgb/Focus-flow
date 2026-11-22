/**
 * FocusFlow — Phase 1.9 Persistent Idempotency Ledger & Storage Abstraction
 *
 * Replaces ephemeral single-instance file storage with shared transactional Cloud Firestore storage
 * compatible with Vercel Serverless Functions.
 *
 * Production Collection:
 *   driveIdempotency/{operationId}
 *
 * Lifecycle States:
 *   CREATED -> PROCESSING -> COPY_REQUESTED -> COPY_CONFIRMED -> DRIVE_COPY_CREATED
 *   -> NATIVE_SHEET_CREATED -> COMPLETED
 *
 * Ambiguous & Failure Branches:
 *   -> COPY_OUTCOME_UNKNOWN
 *   -> FAILED_REQUIRES_RECONCILIATION
 *
 * Guarantees:
 * - Shared, authoritative multi-instance persistence via Cloud Firestore in focus-flow-by-atif.
 * - Atomic Firestore ACID transactions for all claims, state transitions, and completions.
 * - Zero silent fallback to local files in production.
 * - Strict binding of authenticated ownerUid and sourceSpreadsheetId.
 * - Ambiguous outcome safety: if files.copy times out or is interrupted, enters COPY_OUTCOME_UNKNOWN
 *   and verifies appProperties before any further action; never issues automatic duplicate copies.
 * - Lease safety: leaseGeneration counter increments on each claim/reclaim; stale workers rejected.
 * - Zero OAuth token, client secret, or private credential logging.
 */

import fs from 'node:fs';
import path from 'node:path';
import { SheetHubWorkerError } from './universalSheetsWorker.ts';
import { resolveServiceAccount, PRODUCTION_PROJECT_ID, resolveProjectId } from './vaultBackendService.ts';

export type DuplicationLifecycleStatus =
  | 'CREATED'
  | 'PROCESSING'
  | 'COPY_REQUESTED'
  | 'COPY_CONFIRMED'
  | 'COPY_OUTCOME_UNKNOWN'
  | 'DRIVE_COPY_CREATED'
  | 'NATIVE_SHEET_CREATED'
  | 'COMPLETED'
  | 'FAILED_REQUIRES_RECONCILIATION';

export interface DurableDuplicationRecord {
  operationId: string;
  ownerUid: string;
  sourceSpreadsheetId: string;
  targetTitle: string;
  status: DuplicationLifecycleStatus;
  driveFileId: string | null;
  driveUrl: string | null;
  nativeSheetId: string | null;
  claimedAt: number;
  leaseExpiresAt: number;
  leaseGeneration: number;
  attempts: number;
  lastErrorCode: string | null;
  errorMessage: string | null;
  reconciledAt: string | null;
  createdAt: string;
  updatedAt: string;
  completedAt: string | null;
}

export interface ClaimOperationInput {
  operationId: string;
  ownerUid: string;
  sourceSpreadsheetId: string;
  targetTitle?: string;
  leaseTimeoutMs?: number;
}

export interface ClaimOperationResult {
  record: DurableDuplicationRecord;
  action: 'claimed' | 'reused' | 'reclaimed' | 'requires_ambiguous_resolution';
}

export interface UpdateStageInput {
  operationId: string;
  status: DuplicationLifecycleStatus;
  leaseGeneration: number;
  driveFileId?: string | null;
  driveUrl?: string | null;
  nativeSheetId?: string | null;
  lastErrorCode?: string | null;
  errorMessage?: string | null;
}

export interface RecordCopyConfirmedInput {
  operationId: string;
  leaseGeneration: number;
  driveFileId: string;
  driveUrl?: string;
}

export interface ReconcileOperationInput {
  operationId: string;
  status: DuplicationLifecycleStatus;
  ownerUid?: string;
  driveFileId?: string;
  nativeSheetId?: string;
  errorMessage?: string;
}

export const DEFAULT_LEASE_TIMEOUT_MS = 60_000; // 60 seconds
export const DEFAULT_COLLECTION_NAME = 'driveIdempotency';

// ============================================================================
// TASK 1: STORAGE ABSTRACTION INTERFACE
// ============================================================================

export interface IdempotencyLedgerRepository {
  readonly storageType: 'firestore' | 'file';

  claimOperation(input: ClaimOperationInput): Promise<ClaimOperationResult>;
  updateOperationStage(input: UpdateStageInput): Promise<DurableDuplicationRecord>;
  recordCopyRequested(operationId: string, leaseGeneration: number): Promise<DurableDuplicationRecord>;
  recordCopyConfirmed(input: RecordCopyConfirmedInput): Promise<DurableDuplicationRecord>;
  recordCopyOutcomeUnknown(operationId: string, leaseGeneration: number, errorCode?: string): Promise<DurableDuplicationRecord>;
  reconcileOperation(input: ReconcileOperationInput): Promise<DurableDuplicationRecord>;
  getOperation(operationId: string): Promise<DurableDuplicationRecord | null>;
  recordFailed(
    opIdOrOptions: string | { operationId: string; errorMessage: string; preserveDriveFileId?: boolean },
    posErrorMessage?: string,
    preserveDriveFileId?: boolean
  ): Promise<DurableDuplicationRecord>;
  recordDriveCopyCreated?(
    opIdOrOptions: string | { operationId: string; driveFileId: string; driveUrl?: string },
    posDriveFileId?: string,
    posDriveUrl?: string
  ): Promise<DurableDuplicationRecord>;
  recordNativeSheetCreated?(
    opIdOrOptions: string | { operationId: string; nativeSheetId: string },
    posNativeSheetId?: string
  ): Promise<DurableDuplicationRecord>;
  recordCompleted?(
    opIdOrOptions: string | { operationId: string; driveFileId?: string; nativeSheetId?: string },
    posDriveFileId?: string,
    posNativeSheetId?: string
  ): Promise<DurableDuplicationRecord>;
  clearLedger?(): Promise<void> | void;
}

// ============================================================================
// FIRESTORE REST API VALUE ENCODING / DECODING HELPERS
// ============================================================================

export function toFsValue(v: unknown): Record<string, unknown> {
  if (v === null || v === undefined) return { nullValue: null };
  if (typeof v === 'string') return { stringValue: v };
  if (typeof v === 'boolean') return { booleanValue: v };
  if (typeof v === 'number') {
    return Number.isInteger(v) ? { integerValue: String(v) } : { doubleValue: v };
  }
  if (Array.isArray(v)) {
    return { arrayValue: { values: v.map(toFsValue) } };
  }
  if (typeof v === 'object') {
    const fields: Record<string, unknown> = {};
    for (const [k, val] of Object.entries(v as Record<string, unknown>)) {
      if (val !== undefined) fields[k] = toFsValue(val);
    }
    return { mapValue: { fields } };
  }
  return { stringValue: String(v) };
}

export function fromFsValue(val: any): any {
  if (!val || typeof val !== 'object') return val;
  if ('stringValue' in val) return val.stringValue;
  if ('integerValue' in val) return parseInt(val.integerValue, 10);
  if ('doubleValue' in val) return val.doubleValue;
  if ('booleanValue' in val) return val.booleanValue;
  if ('nullValue' in val) return null;
  if ('arrayValue' in val) {
    return (val.arrayValue.values || []).map(fromFsValue);
  }
  if ('mapValue' in val) {
    const res: Record<string, any> = {};
    for (const [k, v] of Object.entries(val.mapValue.fields || {})) {
      res[k] = fromFsValue(v);
    }
    return res;
  }
  return val;
}

export function toFsDocFields(record: DurableDuplicationRecord): Record<string, unknown> {
  const fields: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(record)) {
    if (v !== undefined) {
      fields[k] = toFsValue(v);
    }
  }
  return fields;
}

export function fromFsDoc(doc: any): DurableDuplicationRecord {
  const fields = doc?.fields || {};
  const res: Record<string, any> = {};
  for (const [k, v] of Object.entries(fields)) {
    res[k] = fromFsValue(v);
  }
  return res as DurableDuplicationRecord;
}

// ============================================================================
// TASK 1, 2, 3 & 5: FIRESTORE TRANSACTIONAL LEDGER REPOSITORY
// ============================================================================

export interface FirestoreRepositoryConfig {
  projectId?: string;
  databaseId?: string;
  emulatorHost?: string;
  authToken?: string;
  fetchImpl?: typeof fetch;
}

export class FirestoreTransactionalLedgerRepository implements IdempotencyLedgerRepository {
  public readonly storageType = 'firestore' as const;
  private readonly projectId: string;
  private readonly databaseId: string;
  private readonly emulatorHost: string | null;
  private readonly customAuthToken: string | null;
  private readonly fetchImpl: typeof fetch;

  constructor(config?: FirestoreRepositoryConfig) {
    this.emulatorHost = config?.emulatorHost ?? process.env.FIRESTORE_EMULATOR_HOST ?? null;
    this.customAuthToken = config?.authToken ?? null;
    this.fetchImpl = config?.fetchImpl ?? fetch;

    const resolvedProject =
      config?.projectId ||
      process.env.FIREBASE_PROJECT_ID ||
      process.env.VITE_FIREBASE_PROJECT_ID ||
      (this.emulatorHost ? 'test-rules-project' : PRODUCTION_PROJECT_ID);

    // Security Invariant: Production ledger must never silently use seismic-codex-m01dl
    if (resolvedProject === 'seismic-codex-m01dl') {
      throw new SheetHubWorkerError(
        'CRITICAL CONFIG SAFETY ERROR: seismic-codex-m01dl is strictly forbidden for production idempotency ledger. Target must be focus-flow-by-atif.',
        500,
        'INVALID_LEDGER_PROJECT'
      );
    }

    // In production, target project must strictly be focus-flow-by-atif
    if (isProductionEnvironment() && resolvedProject !== PRODUCTION_PROJECT_ID) {
      throw new SheetHubWorkerError(
        `CRITICAL CONFIG SAFETY ERROR: Production idempotency ledger must strictly target ${PRODUCTION_PROJECT_ID}, received '${resolvedProject}'.`,
        500,
        'INVALID_LEDGER_PROJECT'
      );
    }

    // In production, emulator host routing is strictly forbidden
    if (isProductionEnvironment() && this.emulatorHost) {
      throw new SheetHubWorkerError(
        'CRITICAL CONFIG SAFETY ERROR: FIRESTORE_EMULATOR_HOST cannot be used in production.',
        500,
        'EMULATOR_IN_PRODUCTION_VIOLATION'
      );
    }

    this.projectId = resolvedProject;
    this.databaseId = config?.databaseId || process.env.FIRESTORE_DATABASE_ID || '(default)';
  }

  private getBaseUrl(): string {
    if (this.emulatorHost) {
      return `http://${this.emulatorHost}/v1/projects/${this.projectId}/databases/${this.databaseId}/documents`;
    }
    return `https://firestore.googleapis.com/v1/projects/${this.projectId}/databases/${this.databaseId}/documents`;
  }

  private async getAuthHeader(): Promise<string> {
    if (this.customAuthToken) {
      return `Bearer ${this.customAuthToken}`;
    }
    if (this.emulatorHost) {
      // In emulator mode, dummy authorization is accepted
      return 'Bearer owner_emulator_token';
    }

    // In production, exchange service account credentials
    const sa = resolveServiceAccount();
    if (!sa) {
      throw new SheetHubWorkerError(
        'Firestore persistence credentials unavailable in serverless environment. Drive copy rejected to prevent unrecorded operations.',
        503,
        'PERSISTENT_STORAGE_UNAVAILABLE'
      );
    }

    try {
      const { getGoogleOAuthAccessToken } = await import('./vaultBackendService.ts');
      const token = await getGoogleOAuthAccessToken(sa);
      return `Bearer ${token}`;
    } catch {
      throw new SheetHubWorkerError(
        'Failed to obtain Cloud Firestore authorization token for idempotency ledger.',
        503,
        'PERSISTENT_STORAGE_UNAVAILABLE'
      );
    }
  }

  /**
   * Begins a Firestore readWrite transaction.
   */
  private async beginTransaction(): Promise<string> {
    const auth = await this.getAuthHeader();
    const url = `${this.getBaseUrl()}:beginTransaction`;

    const res = await this.fetchImpl(url, {
      method: 'POST',
      headers: {
        Authorization: auth,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ options: { readWrite: {} } }),
    });

    if (!res.ok) {
      const text = await res.text().catch(() => '');
      throw new SheetHubWorkerError(
        `Failed to begin Firestore transaction for idempotency ledger (${res.status}): ${text}`,
        503,
        'PERSISTENT_STORAGE_UNAVAILABLE'
      );
    }

    const data = (await res.json()) as { transaction: string };
    return data.transaction;
  }

  /**
   * Fetches an existing operation document inside an active transaction.
   */
  private async getDocumentInTransaction(
    operationId: string,
    txId: string
  ): Promise<{ doc: DurableDuplicationRecord | null; rawDocName?: string; updateTime?: string }> {
    const auth = await this.getAuthHeader();
    const docPath = `${DEFAULT_COLLECTION_NAME}/${encodeURIComponent(operationId)}`;
    const url = `${this.getBaseUrl()}/${docPath}?transaction=${encodeURIComponent(txId)}`;

    const res = await this.fetchImpl(url, {
      method: 'GET',
      headers: { Authorization: auth },
    });

    if (res.status === 404) {
      return { doc: null };
    }

    if (!res.ok) {
      const text = await res.text().catch(() => '');
      if (res.status === 409) {
        throw new SheetHubWorkerError('Firestore transaction conflict contention.', 409, 'TRANSACTION_CONTENTION');
      }
      throw new SheetHubWorkerError(
        `Firestore read error during idempotency transaction (${res.status}): ${text}`,
        503,
        'PERSISTENT_STORAGE_UNAVAILABLE'
      );
    }

    const raw = await res.json();
    return {
      doc: fromFsDoc(raw),
      rawDocName: raw.name,
      updateTime: raw.updateTime,
    };
  }

  /**
   * Commits an atomic write to the operation document within the transaction.
   */
  private async commitWrite(
    operationId: string,
    record: DurableDuplicationRecord,
    txId: string,
    currentDocumentCondition?: { exists?: boolean; updateTime?: string }
  ): Promise<void> {
    const auth = await this.getAuthHeader();
    const url = `${this.getBaseUrl()}:commit`;
    const docName = `projects/${this.projectId}/databases/${this.databaseId}/documents/${DEFAULT_COLLECTION_NAME}/${operationId}`;

    const writeOp: Record<string, unknown> = {
      update: {
        name: docName,
        fields: toFsDocFields(record),
      },
    };

    if (currentDocumentCondition) {
      writeOp.currentDocument = currentDocumentCondition;
    }

    const commitRes = await this.fetchImpl(url, {
      method: 'POST',
      headers: {
        Authorization: auth,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        transaction: txId,
        writes: [writeOp],
      }),
    });

    if (!commitRes.ok) {
      const errText = await commitRes.text().catch(() => '');
      if (commitRes.status === 409) {
        throw new SheetHubWorkerError(
          'Concurrent transaction conflict while updating idempotency record.',
          409,
          'TRANSACTION_CONTENTION'
        );
      }
      throw new SheetHubWorkerError(
        `Failed to commit Firestore idempotency transaction (${commitRes.status}): ${errText}`,
        503,
        'PERSISTENT_STORAGE_UNAVAILABLE'
      );
    }
  }

  /**
   * Rollback transaction on non-fatal catch.
   */
  private async rollback(txId: string): Promise<void> {
    try {
      const auth = await this.getAuthHeader();
      await this.fetchImpl(`${this.getBaseUrl()}:rollback`, {
        method: 'POST',
        headers: {
          Authorization: auth,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ transaction: txId }),
      });
    } catch {
      // Non-fatal rollback attempt
    }
  }

  /**
   * Atomically claims an operation lease in Firestore using an ACID transaction.
   */
  public async claimOperation(input: ClaimOperationInput): Promise<ClaimOperationResult> {
    const opId = (input.operationId || '').trim();
    if (!opId) {
      throw new SheetHubWorkerError('operationId is required for durable duplication.', 400, 'INVALID_OPERATION_ID');
    }

    const ownerUid = (input.ownerUid || '').trim();
    if (!ownerUid) {
      throw new SheetHubWorkerError('ownerUid is required for durable duplication.', 400, 'INVALID_OWNER_UID');
    }

    const sourceId = (input.sourceSpreadsheetId || '').trim();
    if (!sourceId) {
      throw new SheetHubWorkerError('sourceSpreadsheetId is required for durable duplication.', 400, 'INVALID_SPREADSHEET_ID');
    }

    const leaseDuration = input.leaseTimeoutMs && input.leaseTimeoutMs > 0 ? input.leaseTimeoutMs : DEFAULT_LEASE_TIMEOUT_MS;
    const now = Date.now();
    const isoNow = new Date(now).toISOString();

    // Transaction execution with up to 3 retry attempts on 409 contention
    let attempts = 0;
    while (attempts < 3) {
      attempts++;
      const txId = await this.beginTransaction();

      try {
        const { doc: existing, updateTime } = await this.getDocumentInTransaction(opId, txId);

        // Case 1: Fresh Operation -> Claim Lease
        if (!existing) {
          const newRecord: DurableDuplicationRecord = {
            operationId: opId,
            ownerUid,
            sourceSpreadsheetId: sourceId,
            targetTitle: (input.targetTitle || '').trim() || `FocusFlow Copy — ${sourceId.slice(0, 8)}`,
            status: 'PROCESSING',
            driveFileId: null,
            driveUrl: null,
            nativeSheetId: null,
            claimedAt: now,
            leaseExpiresAt: now + leaseDuration,
            leaseGeneration: 1,
            attempts: 1,
            lastErrorCode: null,
            errorMessage: null,
            reconciledAt: null,
            createdAt: isoNow,
            updatedAt: isoNow,
            completedAt: null,
          };

          await this.commitWrite(opId, newRecord, txId, { exists: false });
          return { record: newRecord, action: 'claimed' };
        }

        // Case 2: Security Invariant — Owner UID Binding
        if (existing.ownerUid && existing.ownerUid !== ownerUid) {
          await this.rollback(txId);
          throw new SheetHubWorkerError(
            `Operation owner mismatch. Operation "${opId}" was initiated by user "${existing.ownerUid}" but requested by "${ownerUid}".`,
            403,
            'OPERATION_OWNER_MISMATCH'
          );
        }

        // Case 3: Data Integrity Invariant — Source Spreadsheet ID Binding
        if (existing.sourceSpreadsheetId && existing.sourceSpreadsheetId !== sourceId) {
          await this.rollback(txId);
          throw new SheetHubWorkerError(
            `Operation source spreadsheet mismatch. Operation "${opId}" is bound to spreadsheet "${existing.sourceSpreadsheetId}" but requested for "${sourceId}".`,
            400,
            'OPERATION_SOURCE_MISMATCH'
          );
        }

        // Case 4: Already Succeeded or Drive file already created
        if (
          existing.status === 'COMPLETED' ||
          existing.status === 'NATIVE_SHEET_CREATED' ||
          existing.status === 'DRIVE_COPY_CREATED' ||
          existing.status === 'COPY_CONFIRMED' ||
          (existing.status === 'FAILED_REQUIRES_RECONCILIATION' && existing.driveFileId)
        ) {
          await this.rollback(txId);
          return { record: existing, action: 'reused' };
        }

        // Case 5: Ambiguous Drive Outcome (Task 4)
        if (existing.status === 'COPY_OUTCOME_UNKNOWN' || existing.status === 'COPY_REQUESTED') {
          // An expired lease must NOT automatically authorize another external Drive copy when outcome is uncertain
          if (existing.status === 'COPY_REQUESTED' && now >= existing.leaseExpiresAt) {
            existing.status = 'COPY_OUTCOME_UNKNOWN';
            existing.leaseGeneration = (existing.leaseGeneration || 1) + 1;
            existing.updatedAt = isoNow;
            await this.commitWrite(opId, existing, txId, updateTime ? { updateTime } : undefined);
          } else {
            await this.rollback(txId);
          }
          return { record: existing, action: 'requires_ambiguous_resolution' };
        }

        // Case 6: Active PROCESSING Lease -> Reject Concurrent Collisions (Task 5)
        if (existing.status === 'PROCESSING') {
          if (now < existing.leaseExpiresAt) {
            await this.rollback(txId);
            throw new SheetHubWorkerError(
              `Duplication operation "${opId}" is currently being processed by another worker instance. Concurrent requests are locked until lease expiry.`,
              409,
              'CONCURRENT_OPERATION_IN_PROGRESS'
            );
          }

          // Lease expired -> Reclaim lease with incremented generation number
          existing.status = 'PROCESSING';
          existing.claimedAt = now;
          existing.leaseExpiresAt = now + leaseDuration;
          existing.leaseGeneration = (existing.leaseGeneration || 1) + 1;
          existing.attempts += 1;
          existing.updatedAt = isoNow;

          await this.commitWrite(opId, existing, txId, updateTime ? { updateTime } : undefined);
          return { record: existing, action: 'reclaimed' };
        }

        // Case 7: FAILED_REQUIRES_RECONCILIATION without driveFileId -> Reclaim
        existing.status = 'PROCESSING';
        existing.claimedAt = now;
        existing.leaseExpiresAt = now + leaseDuration;
        existing.leaseGeneration = (existing.leaseGeneration || 1) + 1;
        existing.attempts += 1;
        existing.updatedAt = isoNow;

        await this.commitWrite(opId, existing, txId, updateTime ? { updateTime } : undefined);
        return { record: existing, action: 'reclaimed' };
      } catch (err: any) {
        if (err?.code === 'TRANSACTION_CONTENTION' && attempts < 3) {
          await new Promise((r) => setTimeout(r, 20 + Math.random() * 50));
          continue;
        }
        throw err;
      }
    }

    throw new SheetHubWorkerError(
      `Unable to claim operation lease for "${opId}" due to high concurrent transaction contention.`,
      409,
      'CONCURRENT_OPERATION_IN_PROGRESS'
    );
  }

  /**
   * Updates stage of an operation verifying lease generation.
   */
  public async updateOperationStage(input: UpdateStageInput): Promise<DurableDuplicationRecord> {
    const txId = await this.beginTransaction();
    try {
      const { doc: existing, updateTime } = await this.getDocumentInTransaction(input.operationId, txId);
      if (!existing) {
        await this.rollback(txId);
        throw new SheetHubWorkerError(`Operation "${input.operationId}" not found in ledger.`, 404, 'OPERATION_NOT_FOUND');
      }

      // Stale Worker Rejection
      if (input.leaseGeneration && existing.leaseGeneration !== input.leaseGeneration) {
        await this.rollback(txId);
        throw new SheetHubWorkerError(
          `Stale worker lease generation (${input.leaseGeneration} !== ${existing.leaseGeneration}) for operation "${input.operationId}". Another worker took over this operation.`,
          409,
          'STALE_LEASE_GENERATION'
        );
      }

      const iso = new Date().toISOString();
      existing.status = input.status;
      if (input.driveFileId !== undefined) existing.driveFileId = input.driveFileId;
      if (input.driveUrl !== undefined) existing.driveUrl = input.driveUrl;
      if (input.nativeSheetId !== undefined) existing.nativeSheetId = input.nativeSheetId;
      if (input.lastErrorCode !== undefined) existing.lastErrorCode = input.lastErrorCode;
      if (input.errorMessage !== undefined) existing.errorMessage = input.errorMessage;
      existing.updatedAt = iso;

      await this.commitWrite(input.operationId, existing, txId, updateTime ? { updateTime } : undefined);
      return existing;
    } catch (err) {
      await this.rollback(txId);
      throw err;
    }
  }

  public async recordCopyRequested(operationId: string, leaseGeneration: number): Promise<DurableDuplicationRecord> {
    return this.updateOperationStage({
      operationId,
      status: 'COPY_REQUESTED',
      leaseGeneration,
    });
  }

  public async recordCopyConfirmed(input: RecordCopyConfirmedInput): Promise<DurableDuplicationRecord> {
    return this.updateOperationStage({
      operationId: input.operationId,
      status: 'DRIVE_COPY_CREATED',
      leaseGeneration: input.leaseGeneration,
      driveFileId: input.driveFileId,
      driveUrl: input.driveUrl || `https://docs.google.com/spreadsheets/d/${encodeURIComponent(input.driveFileId)}/edit`,
    });
  }

  public async recordCopyOutcomeUnknown(operationId: string, leaseGeneration: number, errorCode?: string): Promise<DurableDuplicationRecord> {
    return this.updateOperationStage({
      operationId,
      status: 'COPY_OUTCOME_UNKNOWN',
      leaseGeneration,
      lastErrorCode: errorCode || 'NETWORK_OR_TIMEOUT_ERROR',
      errorMessage: 'Drive duplicate request response was lost or timed out. Outcome is uncertain pending marker check.',
    });
  }

  public async reconcileOperation(input: ReconcileOperationInput): Promise<DurableDuplicationRecord> {
    const txId = await this.beginTransaction();
    try {
      const { doc: existing, updateTime } = await this.getDocumentInTransaction(input.operationId, txId);
      if (!existing) {
        await this.rollback(txId);
        throw new SheetHubWorkerError(`Cannot reconcile: operation "${input.operationId}" not found.`, 404, 'OPERATION_NOT_FOUND');
      }

      if (input.ownerUid && existing.ownerUid !== input.ownerUid) {
        await this.rollback(txId);
        throw new SheetHubWorkerError(
          `Cannot reconcile operation: owner mismatch (${input.ownerUid} !== ${existing.ownerUid}).`,
          403,
          'OPERATION_OWNER_MISMATCH'
        );
      }

      const iso = new Date().toISOString();
      existing.status = input.status;
      if (input.driveFileId) existing.driveFileId = input.driveFileId;
      if (input.nativeSheetId) existing.nativeSheetId = input.nativeSheetId;
      if (input.errorMessage) existing.errorMessage = input.errorMessage;
      existing.reconciledAt = iso;
      existing.updatedAt = iso;
      if (input.status === 'COMPLETED' && !existing.completedAt) {
        existing.completedAt = iso;
      }

      await this.commitWrite(input.operationId, existing, txId, updateTime ? { updateTime } : undefined);
      return existing;
    } catch (err) {
      await this.rollback(txId);
      throw err;
    }
  }

  public async getOperation(operationId: string): Promise<DurableDuplicationRecord | null> {
    const auth = await this.getAuthHeader();
    const docPath = `${DEFAULT_COLLECTION_NAME}/${encodeURIComponent(operationId)}`;
    const url = `${this.getBaseUrl()}/${docPath}`;

    const res = await this.fetchImpl(url, {
      method: 'GET',
      headers: { Authorization: auth },
    });

    if (res.status === 404) return null;
    if (!res.ok) {
      throw new SheetHubWorkerError(`Failed to fetch operation "${operationId}": HTTP ${res.status}`, 503, 'PERSISTENT_STORAGE_UNAVAILABLE');
    }

    const raw = await res.json();
    return fromFsDoc(raw);
  }

  public async recordFailed(
    opIdOrOptions: string | { operationId: string; errorMessage: string; preserveDriveFileId?: boolean },
    posErrorMessage?: string
  ): Promise<DurableDuplicationRecord> {
    const opId = typeof opIdOrOptions === 'object' ? opIdOrOptions.operationId : opIdOrOptions;
    const errorMessage = typeof opIdOrOptions === 'object' ? opIdOrOptions.errorMessage : (posErrorMessage || 'Unknown failure');
    return this.reconcileOperation({
      operationId: opId,
      status: 'FAILED_REQUIRES_RECONCILIATION',
      errorMessage,
    });
  }
}

export function isProductionEnvironment(): boolean {
  return (
    process.env.NODE_ENV === 'production' ||
    process.env.VERCEL === '1' ||
    Boolean(process.env.VERCEL_ENV) ||
    process.env.APP_ENV === 'production'
  );
}

// ============================================================================
// TASK 1: LOCAL FILE LEDGER REPOSITORY (LOCAL DEV / ISOLATED UNIT TESTS ONLY)
// ============================================================================

export class LocalFileLedgerRepository implements IdempotencyLedgerRepository {
  public readonly storageType = 'file' as const;
  private readonly ledgerFilePath: string | null;
  private memoryRecords = new Map<string, DurableDuplicationRecord>();
  private writeLock: Promise<void> = Promise.resolve();

  constructor(customStoragePath?: string | null) {
    if (isProductionEnvironment()) {
      throw new SheetHubWorkerError(
        'Local file idempotency ledger is strictly forbidden in production environments. Firestore transactional persistence is mandatory.',
        500,
        'PRODUCTION_STORAGE_VIOLATION'
      );
    }

    if (customStoragePath === null) {
      this.ledgerFilePath = null;
    } else if (customStoragePath) {
      this.ledgerFilePath = path.resolve(customStoragePath);
      this.ensureDirectoryAndLoad();
    } else {
      const baseDir = process.env.DATA_DIR ? path.resolve(process.env.DATA_DIR) : path.resolve(process.cwd(), 'data');
      this.ledgerFilePath = path.resolve(baseDir, 'idempotency_ledger.json');
      this.ensureDirectoryAndLoad();
    }
  }

  private ensureDirectoryAndLoad(): void {
    if (!this.ledgerFilePath) return;
    try {
      const dir = path.dirname(this.ledgerFilePath);
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }
      if (fs.existsSync(this.ledgerFilePath)) {
        const raw = fs.readFileSync(this.ledgerFilePath, 'utf-8');
        if (raw.trim()) {
          const parsed = JSON.parse(raw) as Record<string, DurableDuplicationRecord>;
          for (const [key, val] of Object.entries(parsed)) {
            this.memoryRecords.set(key, val);
          }
        }
      }
    } catch (err) {
      console.warn('[LocalFileLedger] Warning: Failed to load local ledger:', err);
    }
  }

  private async persistToDisk(): Promise<void> {
    if (!this.ledgerFilePath) return;
    this.writeLock = this.writeLock
      .then(async () => {
        const data: Record<string, DurableDuplicationRecord> = {};
        for (const [k, v] of this.memoryRecords.entries()) {
          data[k] = v;
        }
        const serialized = JSON.stringify(data, null, 2);
        const tempPath = `${this.ledgerFilePath}.${Date.now()}.${Math.random().toString(36).slice(2, 7)}.tmp`;
        const dir = path.dirname(this.ledgerFilePath!);
        if (!fs.existsSync(dir)) {
          await fs.promises.mkdir(dir, { recursive: true });
        }
        await fs.promises.writeFile(tempPath, serialized, 'utf-8');
        await fs.promises.rename(tempPath, this.ledgerFilePath!);
      })
      .catch((err) => {
        console.error('[LocalFileLedger] Error persisting to disk:', err);
      });
    await this.writeLock;
  }

  public reloadFromDisk(): void {
    if (!this.ledgerFilePath) return;
    try {
      if (fs.existsSync(this.ledgerFilePath)) {
        const raw = fs.readFileSync(this.ledgerFilePath, 'utf-8');
        if (raw.trim()) {
          const parsed = JSON.parse(raw) as Record<string, DurableDuplicationRecord>;
          this.memoryRecords.clear();
          for (const [key, val] of Object.entries(parsed)) {
            this.memoryRecords.set(key, val);
          }
        }
      }
    } catch (err) {
      console.warn('[LocalFileLedger] Warning: reloadFromDisk failed:', err);
    }
  }

  public async claimOperation(input: ClaimOperationInput): Promise<ClaimOperationResult> {
    const opId = (input.operationId || '').trim();
    if (!opId) throw new SheetHubWorkerError('operationId is required.', 400, 'INVALID_OPERATION_ID');
    const ownerUid = (input.ownerUid || '').trim();
    if (!ownerUid) throw new SheetHubWorkerError('ownerUid is required.', 400, 'INVALID_OWNER_UID');
    const sourceId = (input.sourceSpreadsheetId || '').trim();
    if (!sourceId) throw new SheetHubWorkerError('sourceSpreadsheetId is required.', 400, 'INVALID_SPREADSHEET_ID');

    this.reloadFromDisk();
    const existing = this.memoryRecords.get(opId);
    const leaseDuration = input.leaseTimeoutMs && input.leaseTimeoutMs > 0 ? input.leaseTimeoutMs : DEFAULT_LEASE_TIMEOUT_MS;
    const now = Date.now();
    const isoNow = new Date(now).toISOString();

    if (!existing) {
      const newRecord: DurableDuplicationRecord = {
        operationId: opId,
        ownerUid,
        sourceSpreadsheetId: sourceId,
        targetTitle: (input.targetTitle || '').trim() || `FocusFlow Copy — ${sourceId.slice(0, 8)}`,
        status: 'PROCESSING',
        driveFileId: null,
        driveUrl: null,
        nativeSheetId: null,
        claimedAt: now,
        leaseExpiresAt: now + leaseDuration,
        leaseGeneration: 1,
        attempts: 1,
        lastErrorCode: null,
        errorMessage: null,
        reconciledAt: null,
        createdAt: isoNow,
        updatedAt: isoNow,
        completedAt: null,
      };
      this.memoryRecords.set(opId, newRecord);
      await this.persistToDisk();
      return { record: newRecord, action: 'claimed' };
    }

    if (existing.ownerUid && existing.ownerUid !== ownerUid) {
      throw new SheetHubWorkerError(`Operation owner mismatch.`, 403, 'OPERATION_OWNER_MISMATCH');
    }
    if (existing.sourceSpreadsheetId && existing.sourceSpreadsheetId !== sourceId) {
      throw new SheetHubWorkerError(`Operation source spreadsheet mismatch.`, 400, 'OPERATION_SOURCE_MISMATCH');
    }

    if (
      existing.status === 'COMPLETED' ||
      existing.status === 'NATIVE_SHEET_CREATED' ||
      existing.status === 'DRIVE_COPY_CREATED' ||
      existing.status === 'COPY_CONFIRMED' ||
      (existing.status === 'FAILED_REQUIRES_RECONCILIATION' && existing.driveFileId)
    ) {
      return { record: existing, action: 'reused' };
    }

    if (existing.status === 'COPY_OUTCOME_UNKNOWN' || existing.status === 'COPY_REQUESTED') {
      if (existing.status === 'COPY_REQUESTED' && now >= existing.leaseExpiresAt) {
        existing.status = 'COPY_OUTCOME_UNKNOWN';
        existing.leaseGeneration = (existing.leaseGeneration || 1) + 1;
        existing.updatedAt = isoNow;
        await this.persistToDisk();
      }
      return { record: existing, action: 'requires_ambiguous_resolution' };
    }

    if (existing.status === 'PROCESSING') {
      if (now < existing.leaseExpiresAt) {
        throw new SheetHubWorkerError(
          `Duplication operation "${opId}" is currently being processed by another worker instance. Concurrent requests are locked until lease expiry.`,
          409,
          'CONCURRENT_OPERATION_IN_PROGRESS'
        );
      }
      existing.status = 'PROCESSING';
      existing.claimedAt = now;
      existing.leaseExpiresAt = now + leaseDuration;
      existing.leaseGeneration = (existing.leaseGeneration || 1) + 1;
      existing.attempts += 1;
      existing.updatedAt = isoNow;
      this.memoryRecords.set(opId, existing);
      await this.persistToDisk();
      return { record: existing, action: 'reclaimed' };
    }

    existing.status = 'PROCESSING';
    existing.claimedAt = now;
    existing.leaseExpiresAt = now + leaseDuration;
    existing.leaseGeneration = (existing.leaseGeneration || 1) + 1;
    existing.attempts += 1;
    existing.updatedAt = isoNow;
    this.memoryRecords.set(opId, existing);
    await this.persistToDisk();
    return { record: existing, action: 'reclaimed' };
  }

  public async updateOperationStage(input: UpdateStageInput): Promise<DurableDuplicationRecord> {
    this.reloadFromDisk();
    const existing = this.memoryRecords.get(input.operationId);
    if (!existing) {
      throw new SheetHubWorkerError(`Operation "${input.operationId}" not found.`, 404, 'OPERATION_NOT_FOUND');
    }

    if (input.leaseGeneration && existing.leaseGeneration !== input.leaseGeneration) {
      throw new SheetHubWorkerError(
        `Stale worker lease generation (${input.leaseGeneration} !== ${existing.leaseGeneration}).`,
        409,
        'STALE_LEASE_GENERATION'
      );
    }

    const iso = new Date().toISOString();
    existing.status = input.status;
    if (input.driveFileId !== undefined) existing.driveFileId = input.driveFileId;
    if (input.driveUrl !== undefined) existing.driveUrl = input.driveUrl;
    if (input.nativeSheetId !== undefined) existing.nativeSheetId = input.nativeSheetId;
    if (input.lastErrorCode !== undefined) existing.lastErrorCode = input.lastErrorCode;
    if (input.errorMessage !== undefined) existing.errorMessage = input.errorMessage;
    existing.updatedAt = iso;

    this.memoryRecords.set(input.operationId, existing);
    await this.persistToDisk();
    return existing;
  }

  public async recordCopyRequested(operationId: string, leaseGeneration: number): Promise<DurableDuplicationRecord> {
    return this.updateOperationStage({
      operationId,
      status: 'COPY_REQUESTED',
      leaseGeneration,
    });
  }

  public async recordCopyConfirmed(input: RecordCopyConfirmedInput): Promise<DurableDuplicationRecord> {
    return this.updateOperationStage({
      operationId: input.operationId,
      status: 'DRIVE_COPY_CREATED',
      leaseGeneration: input.leaseGeneration,
      driveFileId: input.driveFileId,
      driveUrl: input.driveUrl || `https://docs.google.com/spreadsheets/d/${encodeURIComponent(input.driveFileId)}/edit`,
    });
  }

  public async recordCopyOutcomeUnknown(operationId: string, leaseGeneration: number, errorCode?: string): Promise<DurableDuplicationRecord> {
    return this.updateOperationStage({
      operationId,
      status: 'COPY_OUTCOME_UNKNOWN',
      leaseGeneration,
      lastErrorCode: errorCode || 'NETWORK_OR_TIMEOUT_ERROR',
      errorMessage: 'Drive duplicate request response was lost or timed out. Outcome is uncertain.',
    });
  }

  public async reconcileOperation(input: ReconcileOperationInput): Promise<DurableDuplicationRecord> {
    this.reloadFromDisk();
    const existing = this.memoryRecords.get(input.operationId);
    if (!existing) {
      throw new SheetHubWorkerError(`Cannot reconcile: operation "${input.operationId}" not found.`, 404, 'OPERATION_NOT_FOUND');
    }

    if (input.ownerUid && existing.ownerUid !== input.ownerUid) {
      throw new SheetHubWorkerError(`Cannot reconcile: owner mismatch.`, 403, 'OPERATION_OWNER_MISMATCH');
    }

    const iso = new Date().toISOString();
    existing.status = input.status;
    if (input.driveFileId) existing.driveFileId = input.driveFileId;
    if (input.nativeSheetId) existing.nativeSheetId = input.nativeSheetId;
    if (input.errorMessage) existing.errorMessage = input.errorMessage;
    existing.reconciledAt = iso;
    existing.updatedAt = iso;
    if (input.status === 'COMPLETED' && !existing.completedAt) {
      existing.completedAt = iso;
    }

    this.memoryRecords.set(input.operationId, existing);
    await this.persistToDisk();
    return existing;
  }

  public async getOperation(operationId: string): Promise<DurableDuplicationRecord | null> {
    this.reloadFromDisk();
    return this.memoryRecords.get(operationId) || null;
  }

  public async recordFailed(
    opIdOrOptions: string | { operationId: string; errorMessage: string; preserveDriveFileId?: boolean },
    posErrorMessage?: string
  ): Promise<DurableDuplicationRecord> {
    const opId = typeof opIdOrOptions === 'object' ? opIdOrOptions.operationId : opIdOrOptions;
    const errorMessage = typeof opIdOrOptions === 'object' ? opIdOrOptions.errorMessage : (posErrorMessage || 'Unknown failure');
    return this.reconcileOperation({
      operationId: opId,
      status: 'FAILED_REQUIRES_RECONCILIATION',
      errorMessage,
    });
  }

  public clearLedger(): void {
    this.memoryRecords.clear();
    if (this.ledgerFilePath && fs.existsSync(this.ledgerFilePath)) {
      try {
        fs.unlinkSync(this.ledgerFilePath);
      } catch {}
    }
  }
}

// ============================================================================
// COMPATIBILITY WRAPPER CLASS (FOR TESTS AND EXISTING IMPORTS)
// ============================================================================

export class DurableIdempotencyLedger implements IdempotencyLedgerRepository {
  private customRepository?: IdempotencyLedgerRepository;

  constructor(customStoragePathOrRepo?: string | null | IdempotencyLedgerRepository) {
    if (customStoragePathOrRepo && typeof customStoragePathOrRepo === 'object' && 'claimOperation' in customStoragePathOrRepo) {
      if (isProductionEnvironment() && customStoragePathOrRepo.storageType === 'file') {
        throw new SheetHubWorkerError(
          'Local file idempotency ledger injection is strictly forbidden in production. Production must use Firestore transactional persistence.',
          500,
          'PRODUCTION_STORAGE_VIOLATION'
        );
      }
      this.customRepository = customStoragePathOrRepo;
    } else if (customStoragePathOrRepo !== undefined) {
      if (isProductionEnvironment()) {
        throw new SheetHubWorkerError(
          'Local file path idempotency ledger is strictly forbidden in production. Production must use Firestore transactional persistence.',
          500,
          'PRODUCTION_STORAGE_VIOLATION'
        );
      }
      this.customRepository = new LocalFileLedgerRepository(customStoragePathOrRepo);
    }
  }

  public get repository(): IdempotencyLedgerRepository {
    if (isProductionEnvironment()) {
      if (this.customRepository && this.customRepository.storageType === 'file') {
        throw new SheetHubWorkerError(
          'Local file repository is strictly forbidden in production.',
          500,
          'PRODUCTION_STORAGE_VIOLATION'
        );
      }
      return this.customRepository || new FirestoreTransactionalLedgerRepository();
    }

    if (this.customRepository) return this.customRepository;

    if (process.env.FIRESTORE_EMULATOR_HOST) {
      return new FirestoreTransactionalLedgerRepository();
    }

    if (process.env.IDEMPOTENCY_STORAGE === 'firestore') {
      return new FirestoreTransactionalLedgerRepository();
    }

    return new LocalFileLedgerRepository();
  }

  public get storageType(): 'firestore' | 'file' {
    return this.repository.storageType;
  }

  public async claimOperation(input: ClaimOperationInput): Promise<ClaimOperationResult> {
    return this.repository.claimOperation(input);
  }

  public async updateOperationStage(input: UpdateStageInput): Promise<DurableDuplicationRecord> {
    return this.repository.updateOperationStage(input);
  }

  public async recordCopyRequested(operationId: string, leaseGeneration: number): Promise<DurableDuplicationRecord> {
    return this.repository.recordCopyRequested(operationId, leaseGeneration);
  }

  public async recordCopyConfirmed(input: RecordCopyConfirmedInput): Promise<DurableDuplicationRecord> {
    return this.repository.recordCopyConfirmed(input);
  }

  public async recordCopyOutcomeUnknown(operationId: string, leaseGeneration: number, errorCode?: string): Promise<DurableDuplicationRecord> {
    return this.repository.recordCopyOutcomeUnknown(operationId, leaseGeneration, errorCode);
  }

  public async reconcileOperation(input: ReconcileOperationInput): Promise<DurableDuplicationRecord> {
    return this.repository.reconcileOperation(input);
  }

  public async getOperation(operationId: string): Promise<DurableDuplicationRecord | null> {
    return this.repository.getOperation(operationId);
  }

  public async recordDriveCopyCreated(
    opIdOrOptions: string | { operationId: string; driveFileId: string; driveUrl?: string },
    posDriveFileId?: string,
    posDriveUrl?: string
  ): Promise<DurableDuplicationRecord> {
    const opId = typeof opIdOrOptions === 'object' ? opIdOrOptions.operationId : opIdOrOptions;
    const driveFileId = typeof opIdOrOptions === 'object' ? opIdOrOptions.driveFileId : posDriveFileId!;
    const driveUrl = typeof opIdOrOptions === 'object' ? opIdOrOptions.driveUrl : posDriveUrl;

    const op = await this.getOperation(opId);
    const leaseGen = op?.leaseGeneration || 1;

    return this.recordCopyConfirmed({
      operationId: opId,
      leaseGeneration: leaseGen,
      driveFileId,
      driveUrl,
    });
  }

  public async recordNativeSheetCreated(
    opIdOrOptions: string | { operationId: string; nativeSheetId: string },
    posNativeSheetId?: string
  ): Promise<DurableDuplicationRecord> {
    const opId = typeof opIdOrOptions === 'object' ? opIdOrOptions.operationId : opIdOrOptions;
    const nativeSheetId = typeof opIdOrOptions === 'object' ? opIdOrOptions.nativeSheetId : posNativeSheetId!;

    const op = await this.getOperation(opId);
    const leaseGen = op?.leaseGeneration || 1;

    return this.updateOperationStage({
      operationId: opId,
      status: 'NATIVE_SHEET_CREATED',
      leaseGeneration: leaseGen,
      nativeSheetId,
    });
  }

  public async recordCompleted(
    opIdOrOptions: string | { operationId: string; driveFileId?: string; nativeSheetId?: string },
    posDriveFileId?: string,
    posNativeSheetId?: string
  ): Promise<DurableDuplicationRecord> {
    const opId = typeof opIdOrOptions === 'object' ? opIdOrOptions.operationId : opIdOrOptions;
    const driveFileId = typeof opIdOrOptions === 'object' ? opIdOrOptions.driveFileId : posDriveFileId;
    const nativeSheetId = typeof opIdOrOptions === 'object' ? opIdOrOptions.nativeSheetId : posNativeSheetId;

    return this.reconcileOperation({
      operationId: opId,
      status: 'COMPLETED',
      driveFileId,
      nativeSheetId,
    });
  }

  public async recordFailed(
    opIdOrOptions: string | { operationId: string; errorMessage: string; preserveDriveFileId?: boolean },
    posErrorMessage?: string
  ): Promise<DurableDuplicationRecord> {
    const opId = typeof opIdOrOptions === 'object' ? opIdOrOptions.operationId : opIdOrOptions;
    const errorMessage = typeof opIdOrOptions === 'object' ? opIdOrOptions.errorMessage : (posErrorMessage || 'Unknown failure');

    return this.reconcileOperation({
      operationId: opId,
      status: 'FAILED_REQUIRES_RECONCILIATION',
      errorMessage,
    });
  }

  public clearLedger(): void {
    if (this.repository.clearLedger) {
      this.repository.clearLedger();
    }
  }
}

// Global default repository instance
export const defaultIdempotencyLedger = new DurableIdempotencyLedger();
