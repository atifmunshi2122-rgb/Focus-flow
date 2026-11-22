import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import {
  FirestoreTransactionalLedgerRepository,
  IdempotencyLedgerRepository,
  DurableDuplicationRecord,
  DuplicationLifecycleStatus,
  toFsValue,
  fromFsValue,
  fromFsDoc,
} from '../server/durableIdempotencyLedger.ts';
import {
  duplicateGoogleDriveFile,
  searchDriveByOperationMarker,
} from '../server/driveWorker.ts';
import { SheetHubWorkerError } from '../server/universalSheetsWorker.ts';

/**
 * Creates an in-memory Firestore REST API + Google Drive API mock fetch dispatcher.
 * Simulates genuine Google Cloud Firestore v1 REST transactions without touching
 * the local filesystem or live Firebase projects.
 */
function createMockFirestoreAndDriveFetch(options?: {
  simulateUnavailable?: boolean;
  failCommitOnFirstAttempt?: boolean;
  driveListFiles?: any[];
  failCopyDrive?: boolean;
  copyTimeoutDrive?: boolean;
}) {
  // Shared Firestore in-memory state representing remote cloud collection
  const documents = new Map<string, { record: DurableDuplicationRecord; updateTime: string }>();
  const activeTransactions = new Map<string, { startTime: string }>();
  let commitCount = 0;
  let copyCount = 0;
  let txSeq = 0;

  const mockFetch = async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    const url = String(input);
    const method = init?.method || 'GET';

    // 1. Simulate Firestore service unavailability (Task 8 - Scenario 6)
    if (options?.simulateUnavailable && url.includes('firestore.googleapis.com')) {
      return new Response(JSON.stringify({ error: { code: 503, message: 'The service is temporarily unavailable.' } }), {
        status: 503,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    // 2. Firestore :beginTransaction
    if (url.includes(':beginTransaction') && method === 'POST') {
      txSeq++;
      const txId = `tx_${txSeq}_${Date.now()}`;
      activeTransactions.set(txId, { startTime: new Date().toISOString() });
      return new Response(JSON.stringify({ transaction: txId }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    // 3. Firestore :rollback
    if (url.includes(':rollback') && method === 'POST') {
      const parsed = init?.body ? JSON.parse(String(init.body)) : {};
      if (parsed.transaction) {
        activeTransactions.delete(parsed.transaction);
      }
      return new Response(JSON.stringify({}), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    // 4. Firestore :commit
    if (url.includes(':commit') && method === 'POST') {
      commitCount++;
      const parsed = init?.body ? JSON.parse(String(init.body)) : {};
      const txId = parsed.transaction;
      activeTransactions.delete(txId);

      if (options?.failCommitOnFirstAttempt && commitCount === 1) {
        // Return 409 contention conflict
        return new Response(JSON.stringify({
          error: {
            code: 409,
            status: 'ABORTED',
            message: 'Too much contention on these documents. Please retry.',
          },
        }), { status: 409, headers: { 'Content-Type': 'application/json' } });
      }

      const writes = parsed.writes || [];
      const writeResults: any[] = [];
      const nowIso = new Date().toISOString();

      for (const w of writes) {
        const docName = w.update?.name || '';
        const opId = decodeURIComponent(docName.split('/').pop() || '');
        const fields = w.update?.fields || {};
        const precondition = w.currentDocument;

        const existing = documents.get(opId);

        // Enforce preconditions (optimistic concurrency control)
        if (precondition?.exists === false && existing) {
          return new Response(JSON.stringify({
            error: { code: 409, status: 'ALREADY_EXISTS', message: 'Document already exists.' },
          }), { status: 409, headers: { 'Content-Type': 'application/json' } });
        }

        if (precondition?.updateTime && existing && existing.updateTime !== precondition.updateTime) {
          return new Response(JSON.stringify({
            error: { code: 409, status: 'ABORTED', message: 'Transaction precondition failed: document was updated.' },
          }), { status: 409, headers: { 'Content-Type': 'application/json' } });
        }

        const decoded = fromFsDoc({ fields });
        documents.set(opId, {
          record: decoded as DurableDuplicationRecord,
          updateTime: nowIso,
        });

        writeResults.push({ updateTime: nowIso });
      }

      return new Response(JSON.stringify({ commitTime: nowIso, writeResults }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    // 5. Firestore Document GET (with or without ?transaction=)
    if (url.includes('/driveIdempotency/') && method === 'GET') {
      const match = url.match(/\/driveIdempotency\/([^?]+)/);
      const opId = match ? decodeURIComponent(match[1]) : '';
      const doc = documents.get(opId);

      if (!doc) {
        return new Response(JSON.stringify({ error: { code: 404, message: 'Document not found' } }), {
          status: 404,
          headers: { 'Content-Type': 'application/json' },
        });
      }

      const fsFields: Record<string, any> = {};
      for (const [k, v] of Object.entries(doc.record)) {
        fsFields[k] = toFsValue(v);
      }

      return new Response(JSON.stringify({
        name: `projects/focus-flow-by-atif/databases/(default)/documents/driveIdempotency/${encodeURIComponent(opId)}`,
        fields: fsFields,
        createTime: doc.record.createdAt,
        updateTime: doc.updateTime,
      }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    // 6. Google Drive files.list (search by marker)
    if (url.includes('googleapis.com/drive/v3/files?') && method === 'GET') {
      const files = options?.driveListFiles ?? [];
      return new Response(JSON.stringify({ files }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    // 7. Google Drive files.get (pre-flight check)
    if (url.includes('googleapis.com/drive/v3/files/') && method === 'GET' && !url.includes('/copy')) {
      const parts = url.split('googleapis.com/drive/v3/files/')[1] || '';
      const requestedId = decodeURIComponent(parts.split('?')[0]);
      return new Response(JSON.stringify({
        id: requestedId || 'source_sheet_123',
        name: 'Source Syllabus Spreadsheet',
        capabilities: { canCopy: true },
        trashed: false,
      }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    // 8. Google Drive files.copy
    if (url.includes('/drive/v3/files/') && url.includes('/copy') && method === 'POST') {
      if (options?.copyTimeoutDrive) {
        throw new Error('ETIMEDOUT: Connection to Google Drive files.copy timed out.');
      }
      if (options?.failCopyDrive) {
        return new Response(JSON.stringify({
          error: { code: 500, message: 'Drive backend internal error during copy.' },
        }), { status: 500, headers: { 'Content-Type': 'application/json' } });
      }

      copyCount++;
      const body = init?.body ? JSON.parse(String(init.body)) : {};
      const newId = `drive_copy_file_${copyCount}`;
      return new Response(JSON.stringify({
        id: newId,
        name: body.name || 'Copy of Spreadsheet',
        webViewLink: `https://docs.google.com/spreadsheets/d/${newId}/edit`,
        createdTime: new Date().toISOString(),
        appProperties: body.appProperties || {},
      }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    // 9. Sheets API batchUpdate / get
    if (url.includes('googleapis.com/v4/spreadsheets/')) {
      return new Response(JSON.stringify({
        spreadsheetId: 'mock-sheet',
        sheets: [{ properties: { sheetId: 0, title: 'Sheet1' } }],
        replies: [{}],
      }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    return new Response('Not Found', { status: 404 });
  };

  return {
    fetch: mockFetch as typeof fetch,
    getDocuments: () => documents,
    getCopyCount: () => copyCount,
    getCommitCount: () => commitCount,
  };
}

describe('FOCUSFLOW PHASE 1.9 — Firestore Transactional Idempotency Ledger Tests', () => {
  const sourceSpreadsheetId = '1BxiMVs0XRA5nFMdKvBdBZjgmUUqptlbs74OgvE2upms';
  const ownerUid = 'usr_alice';

  // ==========================================================================
  // SCENARIO 1: Two distinct server instances sharing one Firestore repository
  // ==========================================================================
  it('Scenario 1: Two distinct serverless instances sharing Firestore repository reuse duplicate without re-copying', async () => {
    const operationId = 'op_scenario_1_shared_repo';
    const mock = createMockFirestoreAndDriveFetch();

    // Instance A (Vercel lambda container 1)
    const instanceA = new FirestoreTransactionalLedgerRepository({
      projectId: 'focus-flow-by-atif',
      fetchImpl: mock.fetch,
      authToken: 'test_token',
    });

    const resultA = await duplicateGoogleDriveFile(
      { sourceSpreadsheetId, operationId, ownerUid },
      'oauth_token_123',
      mock.fetch,
      instanceA
    );

    assert.ok(resultA.driveFileId);
    assert.equal(Boolean(resultA.reusedExistingCopy), false);
    assert.equal(mock.getCopyCount(), 1);

    // Instance B (Vercel lambda container 2, completely isolated memory space)
    const instanceB = new FirestoreTransactionalLedgerRepository({
      projectId: 'focus-flow-by-atif',
      fetchImpl: mock.fetch,
      authToken: 'test_token',
    });

    // Instance B retries with same operationId
    const resultB = await duplicateGoogleDriveFile(
      { sourceSpreadsheetId, operationId, ownerUid },
      'oauth_token_123',
      mock.fetch,
      instanceB
    );

    assert.equal(resultB.driveFileId, resultA.driveFileId);
    assert.equal(resultB.reusedExistingCopy, true);
    // Verified: No second Drive copy was executed!
    assert.equal(mock.getCopyCount(), 1);

    const persisted = await instanceB.getOperation(operationId);
    assert.ok(persisted);
    assert.equal(persisted?.driveFileId, resultA.driveFileId);
    assert.equal(persisted?.status, 'DRIVE_COPY_CREATED');
  });

  // ==========================================================================
  // SCENARIO 2: Simultaneous transactional claim (conflict / 409 contention)
  // ==========================================================================
  it('Scenario 2: Simultaneous transactional claim retries on 409 conflict and safely completes', async () => {
    const operationId = 'op_scenario_2_conflict_retry';
    const mock = createMockFirestoreAndDriveFetch({ failCommitOnFirstAttempt: true });

    const repo = new FirestoreTransactionalLedgerRepository({
      projectId: 'focus-flow-by-atif',
      fetchImpl: mock.fetch,
      authToken: 'test_token',
    });

    // Claim operation: First commit attempt fails with 409, repository retries with backoff and succeeds
    const claimResult = await repo.claimOperation({
      operationId,
      ownerUid,
      sourceSpreadsheetId,
    });

    assert.equal(claimResult.action, 'claimed');
    assert.equal(claimResult.record.operationId, operationId);
    assert.equal(claimResult.record.status, 'PROCESSING');
    assert.equal(claimResult.record.attempts, 1);
    // Verified: 2 commits were attempted due to retry
    assert.equal(mock.getCommitCount(), 2);
  });

  // ==========================================================================
  // SCENARIO 3: Lease expiry while a Drive request remains unresolved
  // ==========================================================================
  it('Scenario 3: Lease expires while request is in-flight; subsequent claim marks requires_ambiguous_resolution', async () => {
    const operationId = 'op_scenario_3_lease_expiry';
    const mock = createMockFirestoreAndDriveFetch();

    const repo = new FirestoreTransactionalLedgerRepository({
      projectId: 'focus-flow-by-atif',
      fetchImpl: mock.fetch,
      authToken: 'test_token',
    });

    // Worker 1 claims operation with a very short lease (10ms)
    const claim1 = await repo.claimOperation({
      operationId,
      ownerUid,
      sourceSpreadsheetId,
      leaseTimeoutMs: 10,
    });
    assert.equal(claim1.action, 'claimed');

    // Worker 1 records that files.copy was requested
    await repo.recordCopyRequested(operationId, claim1.record.leaseGeneration);

    // Simulate delay causing lease to expire
    await new Promise((r) => setTimeout(r, 25));

    // Worker 2 arrives after lease expiry: because status is COPY_REQUESTED,
    // worker 2 MUST NOT blindly create another copy; it receives 'requires_ambiguous_resolution'
    const claim2 = await repo.claimOperation({
      operationId,
      ownerUid,
      sourceSpreadsheetId,
    });

    assert.equal(claim2.action, 'requires_ambiguous_resolution');
    assert.equal(claim2.record.status, 'COPY_OUTCOME_UNKNOWN');
    assert.ok(claim2.record.leaseGeneration > claim1.record.leaseGeneration);
  });

  // ==========================================================================
  // SCENARIO 4: Timeout after successful Drive copy
  // ==========================================================================
  it('Scenario 4: Timeout after Drive copy is recovered via appProperties marker search without re-duplicating', async () => {
    const operationId = 'op_scenario_4_timeout_recovery';
    const recoveredDriveFileId = 'drive_recovered_after_timeout_999';

    // Mock where files.copy times out, but Drive list returns the file that Google created
    const mock = createMockFirestoreAndDriveFetch({
      copyTimeoutDrive: true,
      driveListFiles: [
        {
          id: recoveredDriveFileId,
          name: 'FocusFlow Recovered Sheet',
          webViewLink: `https://docs.google.com/spreadsheets/d/${recoveredDriveFileId}/edit`,
          createdTime: new Date().toISOString(),
          appProperties: {
            focusFlowOpId: operationId,
            sourceSpreadsheetId,
            ownerUid,
          },
        },
      ],
    });

    const repo = new FirestoreTransactionalLedgerRepository({
      projectId: 'focus-flow-by-atif',
      fetchImpl: mock.fetch,
      authToken: 'test_token',
    });

    // When duplicateGoogleDriveFile runs, files.copy throws ETIMEDOUT,
    // but the ambiguous outcome handler queries appProperties, finds the file, and reuses it!
    const result = await duplicateGoogleDriveFile(
      { sourceSpreadsheetId, operationId, ownerUid },
      'oauth_token_123',
      mock.fetch,
      repo
    );

    assert.equal(result.driveFileId, recoveredDriveFileId);
    assert.equal(result.reusedExistingCopy, true);

    const ledgerRecord = await repo.getOperation(operationId);
    assert.equal(ledgerRecord?.status, 'DRIVE_COPY_CREATED');
    assert.equal(ledgerRecord?.driveFileId, recoveredDriveFileId);
  });

  // ==========================================================================
  // SCENARIO 5: Browser refresh before native sheet creation
  // ==========================================================================
  it('Scenario 5: Browser refresh before native sheet creation reloads stable operationId and reuses Drive file', async () => {
    const operationId = 'op_scenario_5_browser_refresh';
    const mock = createMockFirestoreAndDriveFetch();

    const repo = new FirestoreTransactionalLedgerRepository({
      projectId: 'focus-flow-by-atif',
      fetchImpl: mock.fetch,
      authToken: 'test_token',
    });

    // 1. User initiates wizard: Drive duplication succeeds
    const driveResult = await duplicateGoogleDriveFile(
      { sourceSpreadsheetId, operationId, ownerUid },
      'oauth_token_123',
      mock.fetch,
      repo
    );
    assert.ok(driveResult.driveFileId);
    assert.equal(mock.getCopyCount(), 1);

    // 2. Browser refresh occurs: ConnectSheetWizard reloads persisted operationId from sessionStorage
    const restoredOpId = operationId;

    // 3. Wizard resumes and calls duplicateGoogleDriveFile with restoredOpId
    const resumedResult = await duplicateGoogleDriveFile(
      { sourceSpreadsheetId, operationId: restoredOpId, ownerUid },
      'oauth_token_123',
      mock.fetch,
      repo
    );

    assert.equal(resumedResult.driveFileId, driveResult.driveFileId);
    assert.equal(resumedResult.reusedExistingCopy, true);
    assert.equal(mock.getCopyCount(), 1);

    // 4. Native sheet creation completes
    await repo.updateOperationStage({
      operationId: restoredOpId,
      status: 'NATIVE_SHEET_CREATED',
      leaseGeneration: 1,
      nativeSheetId: 'native_sheet_recovered_55',
    });
    await repo.reconcileOperation({
      operationId: restoredOpId,
      status: 'COMPLETED',
      nativeSheetId: 'native_sheet_recovered_55',
    });

    const finalRecord = await repo.getOperation(restoredOpId);
    assert.equal(finalRecord?.status, 'COMPLETED');
    assert.equal(finalRecord?.nativeSheetId, 'native_sheet_recovered_55');
  });

  // ==========================================================================
  // SCENARIO 6: Firestore ledger unavailable (503 controlled rejection)
  // ==========================================================================
  it('Scenario 6: Firestore ledger unavailable throws 503 PERSISTENT_STORAGE_UNAVAILABLE and makes 0 Drive copy calls', async () => {
    const operationId = 'op_scenario_6_unavailable';
    const mock = createMockFirestoreAndDriveFetch({ simulateUnavailable: true });

    const repo = new FirestoreTransactionalLedgerRepository({
      projectId: 'focus-flow-by-atif',
      fetchImpl: mock.fetch,
      authToken: 'test_token',
    });

    await assert.rejects(
      async () => {
        await duplicateGoogleDriveFile(
          { sourceSpreadsheetId, operationId, ownerUid },
          'oauth_token_123',
          mock.fetch,
          repo
        );
      },
      (err: any) => {
        assert.ok(err instanceof SheetHubWorkerError);
        assert.equal(err.status, 503);
        assert.equal(err.code, 'PERSISTENT_STORAGE_UNAVAILABLE');
        return true;
      }
    );

    // Invariant: Zero Drive copy calls were initiated!
    assert.equal(mock.getCopyCount(), 0);
  });

  // ==========================================================================
  // SCENARIO 7: Multiple Drive marker matches (stops and requires reconciliation)
  // ==========================================================================
  it('Scenario 7: Multiple Drive marker matches halts with DRIVE_MULTIPLE_COPIES_DETECTED', async () => {
    const operationId = 'op_scenario_7_multiple_markers';
    const mock = createMockFirestoreAndDriveFetch({
      copyTimeoutDrive: true,
      driveListFiles: [
        { id: 'copy_1', appProperties: { focusFlowOpId: operationId, sourceSpreadsheetId, ownerUid } },
        { id: 'copy_2', appProperties: { focusFlowOpId: operationId, sourceSpreadsheetId, ownerUid } },
      ],
    });

    const repo = new FirestoreTransactionalLedgerRepository({
      projectId: 'focus-flow-by-atif',
      fetchImpl: mock.fetch,
      authToken: 'test_token',
    });

    await assert.rejects(
      async () => {
        await duplicateGoogleDriveFile(
          { sourceSpreadsheetId, operationId, ownerUid },
          'oauth_token_123',
          mock.fetch,
          repo
        );
      },
      (err: any) => {
        assert.ok(err instanceof SheetHubWorkerError);
        assert.equal(err.status, 409);
        assert.equal(err.code, 'MULTIPLE_DRIVE_DUPLICATES_FOUND');
        return true;
      }
    );

    const record = await repo.getOperation(operationId);
    assert.equal(record?.status, 'FAILED_REQUIRES_RECONCILIATION');
  });

  // ==========================================================================
  // SCENARIO 8: No Drive marker match after ambiguous outcome (does not auto-copy)
  // ==========================================================================
  it('Scenario 8: No Drive marker match after ambiguous outcome does NOT auto-copy; halts safely', async () => {
    const operationId = 'op_scenario_8_no_marker_found';
    const mock = createMockFirestoreAndDriveFetch({
      copyTimeoutDrive: true,
      driveListFiles: [], // 0 matches found in search
    });

    const repo = new FirestoreTransactionalLedgerRepository({
      projectId: 'focus-flow-by-atif',
      fetchImpl: mock.fetch,
      authToken: 'test_token',
    });

    await assert.rejects(
      async () => {
        await duplicateGoogleDriveFile(
          { sourceSpreadsheetId, operationId, ownerUid },
          'oauth_token_123',
          mock.fetch,
          repo
        );
      },
      (err: any) => {
        assert.ok(err instanceof SheetHubWorkerError);
        assert.equal(err.status, 504);
        assert.equal(err.code, 'COPY_OUTCOME_UNKNOWN');
        return true;
      }
    );

    const record = await repo.getOperation(operationId);
    assert.equal(record?.status, 'COPY_OUTCOME_UNKNOWN');
  });

  // ==========================================================================
  // SCENARIO 9: Wrong owner UID (403 OPERATION_OWNER_MISMATCH)
  // ==========================================================================
  it('Scenario 9: Wrong owner UID attempting to claim or reconcile is rejected with 403 OPERATION_OWNER_MISMATCH', async () => {
    const operationId = 'op_scenario_9_owner_check';
    const mock = createMockFirestoreAndDriveFetch();

    const repo = new FirestoreTransactionalLedgerRepository({
      projectId: 'focus-flow-by-atif',
      fetchImpl: mock.fetch,
      authToken: 'test_token',
    });

    // Legitimate owner Alice claims operation
    await repo.claimOperation({ operationId, ownerUid: 'usr_alice', sourceSpreadsheetId });

    // Unauthorized user Mallory attempts to claim same operation
    await assert.rejects(
      async () => {
        await repo.claimOperation({ operationId, ownerUid: 'usr_mallory', sourceSpreadsheetId });
      },
      (err: any) => {
        assert.ok(err instanceof SheetHubWorkerError);
        assert.equal(err.status, 403);
        assert.equal(err.code, 'OPERATION_OWNER_MISMATCH');
        return true;
      }
    );

    // Unauthorized user Mallory attempts to reconcile operation
    await assert.rejects(
      async () => {
        await repo.reconcileOperation({ operationId, status: 'COMPLETED', ownerUid: 'usr_mallory' });
      },
      (err: any) => {
        assert.ok(err instanceof SheetHubWorkerError);
        assert.equal(err.status, 403);
        assert.equal(err.code, 'OPERATION_OWNER_MISMATCH');
        return true;
      }
    );
  });

  // ==========================================================================
  // SCENARIO 10: Wrong source spreadsheet ID (400 OPERATION_SOURCE_MISMATCH)
  // ==========================================================================
  it('Scenario 10: Wrong source spreadsheet ID is rejected with 400 OPERATION_SOURCE_MISMATCH', async () => {
    const operationId = 'op_scenario_10_source_check';
    const mock = createMockFirestoreAndDriveFetch();

    const repo = new FirestoreTransactionalLedgerRepository({
      projectId: 'focus-flow-by-atif',
      fetchImpl: mock.fetch,
      authToken: 'test_token',
    });

    // Claim with Sheet A
    await repo.claimOperation({ operationId, ownerUid, sourceSpreadsheetId: 'sheet_alpha_111' });

    // Attempt to claim with Sheet B using same operation ID
    await assert.rejects(
      async () => {
        await repo.claimOperation({ operationId, ownerUid, sourceSpreadsheetId: 'sheet_beta_222' });
      },
      (err: any) => {
        assert.ok(err instanceof SheetHubWorkerError);
        assert.equal(err.status, 400);
        assert.equal(err.code, 'OPERATION_SOURCE_MISMATCH');
        return true;
      }
    );
  });

  // ==========================================================================
  // SCENARIO 11: Native sheet creation failure after successful Drive copy
  // ==========================================================================
  it('Scenario 11: Native sheet failure preserves Drive file ID and sets FAILED_REQUIRES_RECONCILIATION', async () => {
    const operationId = 'op_scenario_11_native_fail';
    const mock = createMockFirestoreAndDriveFetch();

    const repo = new FirestoreTransactionalLedgerRepository({
      projectId: 'focus-flow-by-atif',
      fetchImpl: mock.fetch,
      authToken: 'test_token',
    });

    const driveResult = await duplicateGoogleDriveFile(
      { sourceSpreadsheetId, operationId, ownerUid },
      'oauth_token_123',
      mock.fetch,
      repo
    );
    assert.ok(driveResult.driveFileId);

    // Simulate Native Sheet creation failure (e.g. Firestore schema error)
    await repo.recordFailed(operationId, 'Native sheet write failed: transaction lock conflict');

    const record = await repo.getOperation(operationId);
    assert.equal(record?.status, 'FAILED_REQUIRES_RECONCILIATION');
    // Critical: driveFileId is preserved!
    assert.equal(record?.driveFileId, driveResult.driveFileId);
    assert.equal(record?.errorMessage, 'Native sheet write failed: transaction lock conflict');
  });

  // ==========================================================================
  // SCENARIO 12: Recovery without duplicate copy
  // ==========================================================================
  it('Scenario 12: Recovery from failed state reclaims operation without second Drive copy', async () => {
    const operationId = 'op_scenario_12_recovery_no_copy';
    const mock = createMockFirestoreAndDriveFetch();

    const repo = new FirestoreTransactionalLedgerRepository({
      projectId: 'focus-flow-by-atif',
      fetchImpl: mock.fetch,
      authToken: 'test_token',
    });

    // 1. Initial run creates Drive copy
    const initialResult = await duplicateGoogleDriveFile(
      { sourceSpreadsheetId, operationId, ownerUid },
      'oauth_token_123',
      mock.fetch,
      repo
    );
    assert.ok(initialResult.driveFileId);
    assert.equal(mock.getCopyCount(), 1);

    // 2. Mark failed
    await repo.recordFailed(operationId, 'Native sheet timeout');

    // 3. User clicks Retry: Re-running duplicateGoogleDriveFile reuses existing Drive file
    const retryResult = await duplicateGoogleDriveFile(
      { sourceSpreadsheetId, operationId, ownerUid },
      'oauth_token_123',
      mock.fetch,
      repo
    );

    assert.equal(retryResult.driveFileId, initialResult.driveFileId);
    assert.equal(retryResult.reusedExistingCopy, true);
    // Verified: No second copy made!
    assert.equal(mock.getCopyCount(), 1);

    // 4. Complete native sheet and reconcile to COMPLETED
    const currentOp = await repo.getOperation(operationId);
    await repo.updateOperationStage({
      operationId,
      status: 'NATIVE_SHEET_CREATED',
      leaseGeneration: currentOp!.leaseGeneration,
      nativeSheetId: 'native_sheet_recovered_12',
    });
    await repo.reconcileOperation({
      operationId,
      status: 'COMPLETED',
      nativeSheetId: 'native_sheet_recovered_12',
    });

    const finalRecord = await repo.getOperation(operationId);
    assert.equal(finalRecord?.status, 'COMPLETED');
    assert.equal(finalRecord?.driveFileId, initialResult.driveFileId);
    assert.equal(finalRecord?.nativeSheetId, 'native_sheet_recovered_12');
  });
});
