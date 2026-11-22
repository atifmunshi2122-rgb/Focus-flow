import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import {
  DurableIdempotencyLedger,
  DuplicationLifecycleStatus,
} from '../server/durableIdempotencyLedger.ts';
import {
  duplicateGoogleDriveFile,
  clearDriveIdempotencyCache,
} from '../server/driveWorker.ts';
import { SheetHubWorkerError } from '../server/universalSheetsWorker.ts';

describe('Durable Google Drive Duplication Idempotency & Integration Hardening', () => {
  let tempDir: string;
  let ledgerPath: string;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'focusflow-ledger-test-'));
    ledgerPath = path.join(tempDir, 'idempotency_ledger.json');
    clearDriveIdempotencyCache();
  });

  afterEach(() => {
    clearDriveIdempotencyCache();
    if (fs.existsSync(tempDir)) {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  });

  const createMockFetch = (options?: {
    filesListResult?: any[];
    canCopy?: boolean;
    copyFileId?: string;
    onCopyCalled?: (body: any) => void;
  }) => {
    let copyCount = 0;
    const mock = async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
      const url = String(input);
      const method = init?.method || 'GET';

      // 1. files.list query (search by appProperties)
      if (url.includes('googleapis.com/drive/v3/files?') && method === 'GET') {
        const files = options?.filesListResult ?? [];
        return new Response(JSON.stringify({ files }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        });
      }

      // 2. files.get (pre-flight check)
      if (url.includes('googleapis.com/drive/v3/files/') && method === 'GET' && !url.includes('/copy')) {
        const afterFiles = url.split('googleapis.com/drive/v3/files/')[1] || '';
        const requestedId = decodeURIComponent(afterFiles.split('?')[0]);
        return new Response(
          JSON.stringify({
            id: requestedId || '1BxiMVs0XRA5nFMdKvBdBZjgmUUqptlbs74OgvE2upms',
            name: 'Original Syllabus Sheet',
            capabilities: { canCopy: options?.canCopy !== false },
            trashed: false,
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } }
        );
      }

      // 3. files.copy
      if (url.includes('/drive/v3/files/') && url.includes('/copy') && method === 'POST') {
        copyCount++;
        const parsedBody = init?.body ? JSON.parse(String(init.body)) : {};
        if (options?.onCopyCalled) {
          options.onCopyCalled(parsedBody);
        }
        const assignedId = options?.copyFileId || `copy_drive_file_${copyCount}`;
        return new Response(
          JSON.stringify({
            id: assignedId,
            name: parsedBody.name || 'Copy of Spreadsheet',
            webViewLink: `https://docs.google.com/spreadsheets/d/${assignedId}/edit`,
            createdTime: new Date().toISOString(),
            appProperties: parsedBody.appProperties || {},
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } }
        );
      }

      // 4. Sheets API metadata or batchUpdate (for Progress Tracker tab provisioning)
      if (url.includes('googleapis.com/v4/spreadsheets/')) {
        return new Response(
          JSON.stringify({
            spreadsheetId: 'mock-sheet',
            sheets: [{ properties: { sheetId: 0, title: 'Sheet1' } }],
            replies: [{}],
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } }
        );
      }

      return new Response('Not Found', { status: 404 });
    };

    return {
      fetch: mock as any,
      getCopyCount: () => copyCount,
    };
  };

  // ==========================================================================
  // SCENARIO 1: Same operation ID retried across different simulated server instances
  // ==========================================================================
  it('Scenario 1: Same operation ID retried across simulated server instances reuses duplicate without re-copying', async () => {
    const mock = createMockFetch();
    const sourceSpreadsheetId = '1BxiMVs0XRA5nFMdKvBdBZjgmUUqptlbs74OgvE2upms';
    const operationId = 'op_user123_syllabus_retry_cross_instance';
    const ownerUid = 'usr_alice';

    // Serverless Instance 1
    const instance1Ledger = new DurableIdempotencyLedger(ledgerPath);
    const result1 = await duplicateGoogleDriveFile(
      {
        sourceSpreadsheetId,
        operationId,
        ownerUid,
        title: 'Alice Syllabus Copy',
      },
      'mock_token_1',
      mock.fetch,
      instance1Ledger
    );

    assert.equal(result1.operationId, operationId);
    assert.ok(result1.driveFileId);
    assert.equal(mock.getCopyCount(), 1);
    assert.equal(result1.reusedExistingCopy, undefined);

    // Simulate Serverless Instance 2 (Cold Start - separate process memory, same persistent ledger)
    const instance2Ledger = new DurableIdempotencyLedger(ledgerPath);
    const result2 = await duplicateGoogleDriveFile(
      {
        sourceSpreadsheetId,
        operationId,
        ownerUid,
        title: 'Alice Syllabus Copy',
      },
      'mock_token_2',
      mock.fetch,
      instance2Ledger
    );

    // Verified: Second instance reuses the exact same Drive copy
    assert.equal(result2.operationId, operationId);
    assert.equal(result2.driveFileId, result1.driveFileId);
    assert.equal(result2.reusedExistingCopy, true);
    // Verified: Zero additional Drive copies executed
    assert.equal(mock.getCopyCount(), 1);
  });

  // ==========================================================================
  // SCENARIO 2: Timeout after successful Drive copy & lease recovery
  // ==========================================================================
  it('Scenario 2: Lease expires after successful Drive copy and retry reclaims/reuses existing copy without error', async () => {
    const mock = createMockFetch();
    const ledger = new DurableIdempotencyLedger(ledgerPath);
    const sourceSpreadsheetId = '1BxiMVs0XRA5nFMdKvBdBZjgmUUqptlbs74OgvE2upms';
    const operationId = 'op_timeout_recovery_test';
    const ownerUid = 'usr_alice';

    // Step 1: Claim operation with short lease (10ms)
    const claim1 = await ledger.claimOperation({
      operationId,
      ownerUid,
      sourceSpreadsheetId,
      leaseTimeoutMs: 10,
    });
    assert.equal(claim1.action, 'claimed');

    // Record drive copy created
    await ledger.recordDriveCopyCreated({
      operationId,
      driveFileId: 'drive_timeout_recovered_file_99',
      driveUrl: 'https://docs.google.com/spreadsheets/d/drive_timeout_recovered_file_99/edit',
    });

    // Wait for lease to expire
    await new Promise((r) => setTimeout(r, 25));

    // Step 2: Retry with same operation ID after lease expired
    const claim2 = await ledger.claimOperation({
      operationId,
      ownerUid,
      sourceSpreadsheetId,
      leaseTimeoutMs: 60_000,
    });

    // Should reclaim or reuse existing Drive copy rather than blocking
    assert.ok(claim2.action === 'reused' || claim2.action === 'reclaimed');
    assert.equal(claim2.record.driveFileId, 'drive_timeout_recovered_file_99');

    // Calling duplicateGoogleDriveFile now returns the existing copy
    const dupRes = await duplicateGoogleDriveFile(
      { sourceSpreadsheetId, operationId, ownerUid },
      'valid_token',
      mock.fetch,
      ledger
    );
    assert.equal(dupRes.driveFileId, 'drive_timeout_recovered_file_99');
    assert.equal(mock.getCopyCount(), 0);
  });

  // ==========================================================================
  // SCENARIO 3: Duplicate simultaneous requests (409 lock)
  // ==========================================================================
  it('Scenario 3: Concurrent in-flight request with same operation ID is rejected with 409 CONCURRENT_OPERATION_IN_PROGRESS', async () => {
    const ledger = new DurableIdempotencyLedger(ledgerPath);
    const sourceSpreadsheetId = '1BxiMVs0XRA5nFMdKvBdBZjgmUUqptlbs74OgvE2upms';
    const operationId = 'op_concurrent_lock_test';
    const ownerUid = 'usr_alice';

    // Request 1 claims the operation with an active 60s lease
    const claim1 = await ledger.claimOperation({
      operationId,
      ownerUid,
      sourceSpreadsheetId,
      leaseTimeoutMs: 60_000,
    });
    assert.equal(claim1.action, 'claimed');

    // Request 2 arrives simultaneously while Request 1 is still in PROCESSING
    await assert.rejects(
      async () => {
        await ledger.claimOperation({
          operationId,
          ownerUid,
          sourceSpreadsheetId,
          leaseTimeoutMs: 60_000,
        });
      },
      (err: any) => {
        assert.ok(err instanceof SheetHubWorkerError);
        assert.equal(err.status, 409);
        assert.equal(err.code, 'CONCURRENT_OPERATION_IN_PROGRESS');
        assert.ok(err.message.includes('currently being processed'));
        return true;
      }
    );
  });

  // ==========================================================================
  // SCENARIO 4: Native Firestore creation failure handling
  // ==========================================================================
  it('Scenario 4: Native sheet creation failure preserves Drive file ID and marks FAILED_REQUIRES_RECONCILIATION', async () => {
    const mock = createMockFetch();
    const ledger = new DurableIdempotencyLedger(ledgerPath);
    const sourceSpreadsheetId = '1BxiMVs0XRA5nFMdKvBdBZjgmUUqptlbs74OgvE2upms';
    const operationId = 'op_native_failure_handling';
    const ownerUid = 'usr_alice';

    // 1. Google Drive copy succeeds
    const driveResult = await duplicateGoogleDriveFile(
      {
        sourceSpreadsheetId,
        operationId,
        ownerUid,
      },
      'token_123',
      mock.fetch,
      ledger
    );
    assert.ok(driveResult.driveFileId);

    // 2. Client encounters Firestore write error (e.g. quota, permissions, or schema error)
    await ledger.recordFailed({
      operationId,
      errorMessage: 'Firestore transaction quota exceeded',
    });

    const opRecord = await ledger.getOperation(operationId);
    assert.equal(opRecord?.status, 'FAILED_REQUIRES_RECONCILIATION');
    assert.equal(opRecord?.driveFileId, driveResult.driveFileId);
    assert.equal(opRecord?.errorMessage, 'Firestore transaction quota exceeded');

    // 3. User clicks Retry: The operation is reclaimed and Drive file ID is preserved
    const retryClaim = await ledger.claimOperation({
      operationId,
      ownerUid,
      sourceSpreadsheetId,
    });
    assert.ok(retryClaim.action === 'reused' || retryClaim.action === 'reclaimed');
    assert.equal(retryClaim.record.driveFileId, driveResult.driveFileId);

    // Drive duplicate is not called again during retry
    const retryDup = await duplicateGoogleDriveFile(
      { sourceSpreadsheetId, operationId, ownerUid },
      'token_123',
      mock.fetch,
      ledger
    );
    assert.equal(retryDup.driveFileId, driveResult.driveFileId);
    assert.equal(retryDup.reusedExistingCopy, true);
    assert.equal(mock.getCopyCount(), 1);
  });

  // ==========================================================================
  // SCENARIO 5: Retry after function restart (cache wiped, reloads from disk)
  // ==========================================================================
  it('Scenario 5: Function restart wipes process memory but reloads authoritative state from persistent storage', async () => {
    const sourceSpreadsheetId = '1BxiMVs0XRA5nFMdKvBdBZjgmUUqptlbs74OgvE2upms';
    const operationId = 'op_restart_persistence_test';
    const ownerUid = 'usr_alice';

    // Function Instance A writes completed operation
    const ledgerA = new DurableIdempotencyLedger(ledgerPath);
    await ledgerA.claimOperation({ operationId, ownerUid, sourceSpreadsheetId });
    await ledgerA.recordDriveCopyCreated({
      operationId,
      driveFileId: 'drive_persisted_id_44',
      driveUrl: 'https://docs.google.com/spreadsheets/d/drive_persisted_id_44/edit',
    });
    await ledgerA.recordNativeSheetCreated({
      operationId,
      nativeSheetId: 'conn_native_focusflow_44',
    });
    await ledgerA.recordCompleted({ operationId });

    // Instance A shuts down / container is recycled.
    // Function Instance B boots from cold start with brand new memory space.
    const ledgerB = new DurableIdempotencyLedger(ledgerPath);
    const reloadedOp = await ledgerB.getOperation(operationId);

    assert.ok(reloadedOp);
    assert.equal(reloadedOp.status, 'COMPLETED');
    assert.equal(reloadedOp.driveFileId, 'drive_persisted_id_44');
    assert.equal(reloadedOp.nativeSheetId, 'conn_native_focusflow_44');
    assert.ok(reloadedOp.completedAt);
  });

  // ==========================================================================
  // SCENARIO 6: Operation ledger reconciliation
  // ==========================================================================
  it('Scenario 6: Operation ledger reconciliation transitions state to COMPLETED or FAILED_REQUIRES_RECONCILIATION', async () => {
    const ledger = new DurableIdempotencyLedger(ledgerPath);
    const sourceSpreadsheetId = '1BxiMVs0XRA5nFMdKvBdBZjgmUUqptlbs74OgvE2upms';
    const operationId = 'op_reconcile_test';
    const ownerUid = 'usr_alice';

    await ledger.claimOperation({ operationId, ownerUid, sourceSpreadsheetId });

    // Reconcile to COMPLETED
    const reconciledCompleted = await ledger.reconcileOperation({
      operationId,
      status: 'COMPLETED',
      driveFileId: 'drive_rec_1',
      nativeSheetId: 'conn_rec_1',
    });
    assert.equal(reconciledCompleted.status, 'COMPLETED');
    assert.equal(reconciledCompleted.driveFileId, 'drive_rec_1');
    assert.equal(reconciledCompleted.nativeSheetId, 'conn_rec_1');
    assert.ok(reconciledCompleted.reconciledAt);

    // Reconcile another to FAILED_REQUIRES_RECONCILIATION
    const op2Id = 'op_reconcile_fail_test';
    await ledger.claimOperation({ operationId: op2Id, ownerUid, sourceSpreadsheetId });
    const reconciledFailed = await ledger.reconcileOperation({
      operationId: op2Id,
      status: 'FAILED_REQUIRES_RECONCILIATION',
      driveFileId: 'drive_rec_2',
      errorMessage: 'Firestore network error during commit',
    });
    assert.equal(reconciledFailed.status, 'FAILED_REQUIRES_RECONCILIATION');
    assert.equal(reconciledFailed.errorMessage, 'Firestore network error during commit');
  });

  // ==========================================================================
  // SCENARIO 7: Existing Drive copy recovery via appProperties
  // ==========================================================================
  it('Scenario 7: Recovers existing Google Drive duplicate via appProperties when local ledger is empty', async () => {
    const sourceSpreadsheetId = '1BxiMVs0XRA5nFMdKvBdBZjgmUUqptlbs74OgvE2upms';
    const operationId = 'op_app_properties_recovery_test';
    const ownerUid = 'usr_alice';

    // Mock Google Drive files.list returning an existing duplicate tagged with this focusFlowOpId
    const mock = createMockFetch({
      filesListResult: [
        {
          id: 'drive_recovered_via_app_properties_777',
          name: 'FocusFlow Syllabus (Dual-Copy)',
          webViewLink: 'https://docs.google.com/spreadsheets/d/drive_recovered_via_app_properties_777/edit',
          createdTime: new Date().toISOString(),
          appProperties: {
            focusFlowOpId: operationId,
            sourceSpreadsheetId,
            ownerUid,
            focusFlowRole: 'dual_copy_duplicate',
          },
        },
      ],
    });

    // Fresh ledger without this operation record
    const emptyLedger = new DurableIdempotencyLedger(ledgerPath);
    assert.equal(await emptyLedger.getOperation(operationId), null);

    const result = await duplicateGoogleDriveFile(
      {
        sourceSpreadsheetId,
        operationId,
        ownerUid,
      },
      'token_123',
      mock.fetch,
      emptyLedger
    );

    // Verified: Recovers existing Drive file without files.copy call
    assert.equal(result.driveFileId, 'drive_recovered_via_app_properties_777');
    assert.equal(result.reusedExistingCopy, true);
    assert.equal(mock.getCopyCount(), 0);

    // Verified: Synced recovered copy back into durable ledger
    const ledgerOp = await emptyLedger.getOperation(operationId);
    assert.ok(ledgerOp);
    assert.equal(ledgerOp.driveFileId, 'drive_recovered_via_app_properties_777');
    assert.equal(ledgerOp.status, 'DRIVE_COPY_CREATED');
  });

  // ==========================================================================
  // SCENARIO 8: Different intentional operation IDs
  // ==========================================================================
  it('Scenario 8: Different intentional operation IDs create distinct duplicates without interference', async () => {
    const mock = createMockFetch();
    const ledger = new DurableIdempotencyLedger(ledgerPath);
    const sourceSpreadsheetId = '1BxiMVs0XRA5nFMdKvBdBZjgmUUqptlbs74OgvE2upms';

    const resultA = await duplicateGoogleDriveFile(
      {
        sourceSpreadsheetId,
        operationId: 'op_user_action_A',
        ownerUid: 'usr_alice',
        title: 'Copy A',
      },
      'token_123',
      mock.fetch,
      ledger
    );

    const resultB = await duplicateGoogleDriveFile(
      {
        sourceSpreadsheetId,
        operationId: 'op_user_action_B',
        ownerUid: 'usr_alice',
        title: 'Copy B',
      },
      'token_123',
      mock.fetch,
      ledger
    );

    assert.notEqual(resultA.driveFileId, resultB.driveFileId);
    assert.notEqual(resultA.operationId, resultB.operationId);
    assert.equal(mock.getCopyCount(), 2);
  });

  // ==========================================================================
  // SCENARIO 9: Owner UID mismatch (403)
  // ==========================================================================
  it('Scenario 9: Owner UID mismatch is rejected with 403 OPERATION_OWNER_MISMATCH', async () => {
    const ledger = new DurableIdempotencyLedger(ledgerPath);
    const sourceSpreadsheetId = '1BxiMVs0XRA5nFMdKvBdBZjgmUUqptlbs74OgvE2upms';
    const operationId = 'op_owner_security_test';

    // Alice claims operation
    await ledger.claimOperation({
      operationId,
      ownerUid: 'usr_alice',
      sourceSpreadsheetId,
    });

    // Bob attempts to claim Alice's operation
    await assert.rejects(
      async () => {
        await ledger.claimOperation({
          operationId,
          ownerUid: 'usr_bob_attacker',
          sourceSpreadsheetId,
        });
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
  // SCENARIO 10: Source spreadsheet ID mismatch (400)
  // ==========================================================================
  it('Scenario 10: Source spreadsheet ID mismatch is rejected with 400 OPERATION_SOURCE_MISMATCH', async () => {
    const ledger = new DurableIdempotencyLedger(ledgerPath);
    const operationId = 'op_source_integrity_test';
    const ownerUid = 'usr_alice';

    // Claimed for Sheet A
    await ledger.claimOperation({
      operationId,
      ownerUid,
      sourceSpreadsheetId: '1BxiMVs0XRA5nFMdKvBdBZjgmUUqptlbs74OgvE2upms',
    });

    // Request attempts to reuse operation for Sheet B
    await assert.rejects(
      async () => {
        await ledger.claimOperation({
          operationId,
          ownerUid,
          sourceSpreadsheetId: 'different_source_spreadsheet_id_99999',
        });
      },
      (err: any) => {
        assert.ok(err instanceof SheetHubWorkerError);
        assert.equal(err.status, 400);
        assert.equal(err.code, 'OPERATION_SOURCE_MISMATCH');
        return true;
      }
    );
  });
});
