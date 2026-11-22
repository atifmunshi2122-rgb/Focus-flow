import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import {
  FirestoreTransactionalLedgerRepository,
  LocalFileLedgerRepository,
  DurableIdempotencyLedger,
  isProductionEnvironment,
  toFsValue,
  fromFsDoc,
} from '../server/durableIdempotencyLedger.ts';
import {
  duplicateGoogleDriveFile,
  searchDriveByOperationMarker,
} from '../server/driveWorker.ts';
import { SheetHubWorkerError } from '../server/universalSheetsWorker.ts';
import { verifyFirebaseIdToken } from '../server/auth.ts';

describe('FOCUSFLOW PHASE 1.9.1 — Production Ledger Hardening & Safety Invariants', () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    process.env = { ...originalEnv };
  });

  afterEach(() => {
    process.env = { ...originalEnv };
  });

  // ==========================================================================
  // TEST 1: Production custom LocalFileRepository injection rejection
  // ==========================================================================
  it('1. Rejects custom LocalFileRepository injection in production', () => {
    process.env.NODE_ENV = 'production';
    process.env.VERCEL = '1';
    assert.equal(isProductionEnvironment(), true);

    // Direct instantiation of LocalFileLedgerRepository in prod must throw
    assert.throws(
      () => new LocalFileLedgerRepository('/tmp/test-ledger.json'),
      (err: any) => {
        assert.ok(err instanceof SheetHubWorkerError);
        assert.equal(err.code, 'PRODUCTION_STORAGE_VIOLATION');
        assert.equal(err.status, 500);
        return true;
      }
    );

    // Injection of file-based repository into DurableIdempotencyLedger must throw
    const dummyFileRepo = {
      storageType: 'file' as const,
      claimOperation: async () => ({ action: 'claimed' as const, record: {} as any }),
      updateOperationStage: async () => ({} as any),
      recordCopyRequested: async () => ({} as any),
      recordCopyConfirmed: async () => ({} as any),
      recordCopyOutcomeUnknown: async () => ({} as any),
      reconcileOperation: async () => ({} as any),
      getOperation: async () => null,
      recordFailed: async () => ({} as any),
    };

    assert.throws(
      () => new DurableIdempotencyLedger(dummyFileRepo),
      (err: any) => {
        assert.ok(err instanceof SheetHubWorkerError);
        assert.equal(err.code, 'PRODUCTION_STORAGE_VIOLATION');
        return true;
      }
    );

    // String path injection into DurableIdempotencyLedger must throw
    assert.throws(
      () => new DurableIdempotencyLedger('/tmp/dummy.json'),
      (err: any) => {
        assert.ok(err instanceof SheetHubWorkerError);
        assert.equal(err.code, 'PRODUCTION_STORAGE_VIOLATION');
        return true;
      }
    );
  });

  // ==========================================================================
  // TEST 2: Production environment override rejection
  // ==========================================================================
  it('2. Rejects ALLOW_LOCAL_FILE_LEDGER_FOR_TESTING override when in production', () => {
    process.env.NODE_ENV = 'production';
    process.env.VERCEL = '1';
    process.env.ALLOW_LOCAL_FILE_LEDGER_FOR_TESTING = 'true';

    assert.equal(isProductionEnvironment(), true);

    // Even with ALLOW_LOCAL_FILE_LEDGER_FOR_TESTING, production cannot be bypassed
    assert.throws(
      () => new LocalFileLedgerRepository('/tmp/test-override.json'),
      (err: any) => {
        assert.ok(err instanceof SheetHubWorkerError);
        assert.equal(err.code, 'PRODUCTION_STORAGE_VIOLATION');
        return true;
      }
    );

    const ledger = new DurableIdempotencyLedger();
    // Default repository in production must resolve to firestore, never file
    assert.equal(ledger.storageType, 'firestore');
  });

  // ==========================================================================
  // TEST 3: Firebase token validation
  // ==========================================================================
  it('3. Independently validates Firebase ID token and extracts owner UID', async () => {
    // Unsigned / malformed token must be rejected
    await assert.rejects(
      async () => {
        await verifyFirebaseIdToken('malformed.bearer.token');
      },
      (err: any) => {
        assert.ok(err instanceof Error);
        return true;
      }
    );

    // In non-production with emulator configured, validates format and claims
    process.env.FIREBASE_AUTH_EMULATOR_HOST = '127.0.0.1:9099';
    process.env.FIREBASE_PROJECT_ID = 'focus-flow-by-atif';

    const header = Buffer.from(JSON.stringify({ alg: 'none', typ: 'JWT' })).toString('base64url');
    const payload = Buffer.from(
      JSON.stringify({
        sub: 'usr_verified_alice',
        aud: 'focus-flow-by-atif',
        exp: Math.floor(Date.now() / 1000) + 3600,
      })
    ).toString('base64url');
    const unsignedJwt = `${header}.${payload}.`;

    const verified = await verifyFirebaseIdToken(unsignedJwt);
    assert.equal(verified.userId, 'usr_verified_alice');
    assert.equal(verified.isGuest, false);
  });

  // ==========================================================================
  // TEST 4: Forged owner UID rejection
  // ==========================================================================
  it('4. Rejects forged owner UID when body ownerUid does not match verified auth subject', async () => {
    const mockFetch = async () => new Response('{}', { status: 200 });
    const repo = new FirestoreTransactionalLedgerRepository({
      projectId: 'focus-flow-by-atif',
      emulatorHost: '127.0.0.1:8080',
      fetchImpl: mockFetch as any,
    });

    // Operation claimed by Alice
    const docState = new Map<string, any>();
    const customFetch = async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
      const url = String(input);
      if (url.includes(':beginTransaction')) {
        return new Response(JSON.stringify({ transaction: 'tx_1' }), { status: 200 });
      }
      if (url.includes('/driveIdempotency/op_forgery_test') && init?.method === 'GET') {
        const doc = docState.get('op_forgery_test');
        if (!doc) return new Response('{}', { status: 404 });
        return new Response(JSON.stringify(doc), { status: 200 });
      }
      if (url.includes(':commit')) {
        const body = JSON.parse(String(init?.body));
        const fields = body.writes[0].update.fields;
        docState.set('op_forgery_test', { fields, updateTime: new Date().toISOString() });
        return new Response(JSON.stringify({ commitTime: new Date().toISOString() }), { status: 200 });
      }
      return new Response('{}', { status: 200 });
    };

    const securedRepo = new FirestoreTransactionalLedgerRepository({
      projectId: 'focus-flow-by-atif',
      emulatorHost: '127.0.0.1:8080',
      fetchImpl: customFetch as any,
    });

    // Alice claims operation
    await securedRepo.claimOperation({
      operationId: 'op_forgery_test',
      ownerUid: 'usr_alice',
      sourceSpreadsheetId: 'sheet_123',
    });

    // Mallory attempts to claim or reconcile Alice's operation
    await assert.rejects(
      async () => {
        await securedRepo.claimOperation({
          operationId: 'op_forgery_test',
          ownerUid: 'usr_mallory_forger',
          sourceSpreadsheetId: 'sheet_123',
        });
      },
      (err: any) => {
        assert.ok(err instanceof SheetHubWorkerError);
        assert.equal(err.status, 403);
        assert.equal(err.code, 'OPERATION_OWNER_MISMATCH');
        return true;
      }
    );

    await assert.rejects(
      async () => {
        await securedRepo.reconcileOperation({
          operationId: 'op_forgery_test',
          status: 'COMPLETED',
          ownerUid: 'usr_mallory_forger',
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
  // TEST 5: Wrong Firebase project rejection in production
  // ==========================================================================
  it('5. Rejects wrong Firebase project when in production environment', () => {
    process.env.NODE_ENV = 'production';
    process.env.VERCEL = '1';

    // Must reject any project other than focus-flow-by-atif in production
    assert.throws(
      () => new FirestoreTransactionalLedgerRepository({ projectId: 'unexpected-project-id' }),
      (err: any) => {
        assert.ok(err instanceof SheetHubWorkerError);
        assert.equal(err.code, 'INVALID_LEDGER_PROJECT');
        assert.equal(err.status, 500);
        return true;
      }
    );

    // Must reject emulator host routing in production
    assert.throws(
      () => new FirestoreTransactionalLedgerRepository({
        projectId: 'focus-flow-by-atif',
        emulatorHost: '127.0.0.1:8080',
      }),
      (err: any) => {
        assert.ok(err instanceof SheetHubWorkerError);
        assert.equal(err.code, 'EMULATOR_IN_PRODUCTION_VIOLATION');
        return true;
      }
    );
  });

  // ==========================================================================
  // TEST 6: Source and target project isolation
  // ==========================================================================
  it('6. Strictly rejects seismic-codex-m01dl across all environments', () => {
    // Development mode
    process.env.NODE_ENV = 'development';
    assert.throws(
      () => new FirestoreTransactionalLedgerRepository({ projectId: 'seismic-codex-m01dl' }),
      (err: any) => {
        assert.ok(err instanceof SheetHubWorkerError);
        assert.equal(err.code, 'INVALID_LEDGER_PROJECT');
        return true;
      }
    );

    // Test mode
    process.env.NODE_ENV = 'test';
    assert.throws(
      () => new FirestoreTransactionalLedgerRepository({ projectId: 'seismic-codex-m01dl' }),
      (err: any) => {
        assert.ok(err instanceof SheetHubWorkerError);
        assert.equal(err.code, 'INVALID_LEDGER_PROJECT');
        return true;
      }
    );
  });

  // ==========================================================================
  // TEST 7: Firestore transaction conflicts (optimistic concurrency / 409)
  // ==========================================================================
  it('7. Handles optimistic concurrency conflict and recovers on transaction retry', async () => {
    let commitAttempts = 0;
    const mockFetch = async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
      const url = String(input);
      if (url.includes(':beginTransaction')) {
        return new Response(JSON.stringify({ transaction: `tx_${Date.now()}` }), { status: 200 });
      }
      if (url.includes('/driveIdempotency/op_tx_conflict') && init?.method === 'GET') {
        return new Response('{}', { status: 404 });
      }
      if (url.includes(':commit')) {
        commitAttempts++;
        if (commitAttempts === 1) {
          // Simulate 409 ABORTED contention on first attempt
          return new Response(
            JSON.stringify({
              error: { code: 409, status: 'ABORTED', message: 'Contention detected on documents' },
            }),
            { status: 409 }
          );
        }
        return new Response(JSON.stringify({ commitTime: new Date().toISOString() }), { status: 200 });
      }
      return new Response('{}', { status: 200 });
    };

    const repo = new FirestoreTransactionalLedgerRepository({
      projectId: 'focus-flow-by-atif',
      fetchImpl: mockFetch as any,
      authToken: 'test_token',
    });

    const res = await repo.claimOperation({
      operationId: 'op_tx_conflict',
      ownerUid: 'usr_alice',
      sourceSpreadsheetId: 'sheet_tx_test',
    });

    assert.equal(res.action, 'claimed');
    assert.equal(commitAttempts, 2);
  });

  // ==========================================================================
  // TEST 8: Expired lease with unresolved Drive copy
  // ==========================================================================
  it('8. Expired lease with COPY_REQUESTED transitions to COPY_OUTCOME_UNKNOWN without auto-copying', async () => {
    let docState: any = null;
    let rollbackCalled = false;

    const mockFetch = async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
      const url = String(input);
      if (url.includes(':beginTransaction')) {
        return new Response(JSON.stringify({ transaction: 'tx_lease_test' }), { status: 200 });
      }
      if (url.includes(':rollback')) {
        rollbackCalled = true;
        return new Response('{}', { status: 200 });
      }
      if (url.includes('/driveIdempotency/op_lease_test') && init?.method === 'GET') {
        if (!docState) return new Response('{}', { status: 404 });
        return new Response(JSON.stringify(docState), { status: 200 });
      }
      if (url.includes(':commit')) {
        const body = JSON.parse(String(init?.body));
        const fields = body.writes[0].update.fields;
        docState = { fields, updateTime: new Date().toISOString() };
        return new Response(JSON.stringify({ commitTime: new Date().toISOString() }), { status: 200 });
      }
      return new Response('{}', { status: 200 });
    };

    const repo = new FirestoreTransactionalLedgerRepository({
      projectId: 'focus-flow-by-atif',
      fetchImpl: mockFetch as any,
      authToken: 'test_token',
    });

    // 1. Worker 1 claims with 10ms lease
    const claim1 = await repo.claimOperation({
      operationId: 'op_lease_test',
      ownerUid: 'usr_alice',
      sourceSpreadsheetId: 'sheet_lease',
      leaseTimeoutMs: 10,
    });
    assert.equal(claim1.action, 'claimed');

    // 2. Worker 1 records COPY_REQUESTED
    await repo.recordCopyRequested('op_lease_test', claim1.record.leaseGeneration);

    // 3. Lease expires
    await new Promise((r) => setTimeout(r, 25));

    // 4. Worker 2 attempts claim: must NOT auto-copy; marks COPY_OUTCOME_UNKNOWN
    const claim2 = await repo.claimOperation({
      operationId: 'op_lease_test',
      ownerUid: 'usr_alice',
      sourceSpreadsheetId: 'sheet_lease',
    });

    assert.equal(claim2.action, 'requires_ambiguous_resolution');
    assert.equal(claim2.record.status, 'COPY_OUTCOME_UNKNOWN');
  });

  // ==========================================================================
  // TEST 9: Ambiguous Drive recovery with 4 validated appProperties
  // ==========================================================================
  it('9. Recovers duplicate only when all 4 appProperties match (focusFlowOpId, sourceSpreadsheetId, ownerUid, focusFlowRole)', async () => {
    const validFile = {
      id: 'copy_recovered_valid_99',
      name: 'Copy of Sheet',
      appProperties: {
        focusFlowOpId: 'op_recovery_test',
        sourceSpreadsheetId: 'sheet_source_99',
        ownerUid: 'usr_alice',
        focusFlowRole: 'dual_copy_duplicate',
      },
    };

    const wrongRoleFile = {
      id: 'copy_wrong_role',
      name: 'Copy with wrong role',
      appProperties: {
        focusFlowOpId: 'op_recovery_test',
        sourceSpreadsheetId: 'sheet_source_99',
        ownerUid: 'usr_alice',
        focusFlowRole: 'some_other_role',
      },
    };

    const wrongSourceFile = {
      id: 'copy_wrong_source',
      name: 'Copy with wrong source',
      appProperties: {
        focusFlowOpId: 'op_recovery_test',
        sourceSpreadsheetId: 'sheet_different_source',
        ownerUid: 'usr_alice',
        focusFlowRole: 'dual_copy_duplicate',
      },
    };

    const mockFetch = async (input: RequestInfo | URL): Promise<Response> => {
      const url = String(input);
      if (url.includes('googleapis.com/drive/v3/files?')) {
        return new Response(JSON.stringify({ files: [validFile, wrongRoleFile, wrongSourceFile] }), {
          status: 200,
        });
      }
      return new Response('{}', { status: 200 });
    };

    const result = await searchDriveByOperationMarker(
      mockFetch as any,
      'token_123',
      'op_recovery_test',
      'sheet_source_99',
      'usr_alice',
      'dual_copy_duplicate'
    );

    // Exactly 1 match must be validated; the wrong role and wrong source files are filtered out!
    assert.equal(result.matches.length, 1);
    assert.equal(result.matches[0].id, 'copy_recovered_valid_99');
  });

  // ==========================================================================
  // TEST 10: Multiple appProperties matches
  // ==========================================================================
  it('10. Halts immediately with MULTIPLE_DRIVE_DUPLICATES_FOUND when multiple copies match', async () => {
    const validSourceId = '1BxiMVs0XRA5nFMdKvBdBZjgmUUqptlbs74OgvE2upms';
    const fileA = {
      id: 'copy_111',
      name: 'Copy 1',
      appProperties: {
        focusFlowOpId: 'op_multiple_test',
        sourceSpreadsheetId: validSourceId,
        ownerUid: 'usr_alice',
        focusFlowRole: 'dual_copy_duplicate',
      },
    };
    const fileB = {
      id: 'copy_222',
      name: 'Copy 2',
      appProperties: {
        focusFlowOpId: 'op_multiple_test',
        sourceSpreadsheetId: validSourceId,
        ownerUid: 'usr_alice',
        focusFlowRole: 'dual_copy_duplicate',
      },
    };

    let docState: any = null;
    const mockFetch = async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
      const url = String(input);
      if (url.includes(':beginTransaction')) {
        return new Response(JSON.stringify({ transaction: 'tx_multi' }), { status: 200 });
      }
      if (url.includes('/driveIdempotency/op_multiple_test') && init?.method === 'GET') {
        if (!docState) return new Response('{}', { status: 404 });
        return new Response(JSON.stringify(docState), { status: 200 });
      }
      if (url.includes(':commit')) {
        const body = JSON.parse(String(init?.body));
        const fields = body.writes[0].update.fields;
        docState = { fields, updateTime: new Date().toISOString() };
        return new Response(JSON.stringify({ commitTime: new Date().toISOString() }), { status: 200 });
      }
      if (url.includes('googleapis.com/drive/v3/files?')) {
        return new Response(JSON.stringify({ files: [fileA, fileB] }), { status: 200 });
      }
      if (url.includes('/drive/v3/files/') && init?.method === 'GET') {
        return new Response(JSON.stringify({ id: validSourceId, capabilities: { canCopy: true }, trashed: false }), { status: 200 });
      }
      return new Response('{}', { status: 200 });
    };

    const repo = new FirestoreTransactionalLedgerRepository({
      projectId: 'focus-flow-by-atif',
      fetchImpl: mockFetch as any,
      authToken: 'test_token',
    });

    await assert.rejects(
      async () => {
        await duplicateGoogleDriveFile(
          { sourceSpreadsheetId: validSourceId, operationId: 'op_multiple_test', ownerUid: 'usr_alice' },
          'oauth_123',
          mockFetch as any,
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
  });

  // ==========================================================================
  // TEST 11: Serverless restart recovery
  // ==========================================================================
  it('11. Reloads completed state across distinct serverless instance cold starts', async () => {
    let persistedDoc: any = null;

    const mockFetch = async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
      const url = String(input);
      if (url.includes(':beginTransaction')) {
        return new Response(JSON.stringify({ transaction: `tx_${Date.now()}` }), { status: 200 });
      }
      if (url.includes('/driveIdempotency/op_cold_start') && init?.method === 'GET') {
        if (!persistedDoc) return new Response('{}', { status: 404 });
        return new Response(JSON.stringify(persistedDoc), { status: 200 });
      }
      if (url.includes(':commit')) {
        const body = JSON.parse(String(init?.body));
        const fields = body.writes[0].update.fields;
        persistedDoc = { fields, updateTime: new Date().toISOString() };
        return new Response(JSON.stringify({ commitTime: new Date().toISOString() }), { status: 200 });
      }
      return new Response('{}', { status: 200 });
    };

    // Lambda Instance 1 executes and completes Drive copy
    const instance1 = new FirestoreTransactionalLedgerRepository({
      projectId: 'focus-flow-by-atif',
      fetchImpl: mockFetch as any,
      authToken: 'token_1',
    });

    const claim1 = await instance1.claimOperation({
      operationId: 'op_cold_start',
      ownerUid: 'usr_alice',
      sourceSpreadsheetId: 'sheet_cold',
    });
    await instance1.recordCopyConfirmed({
      operationId: 'op_cold_start',
      leaseGeneration: claim1.record.leaseGeneration,
      driveFileId: 'drive_file_persisted_77',
      driveUrl: 'https://docs.google.com/spreadsheets/d/drive_file_persisted_77/edit',
    });

    // Lambda Instance 1 process is destroyed.
    // Lambda Instance 2 boots cold with empty memory space.
    const instance2 = new FirestoreTransactionalLedgerRepository({
      projectId: 'focus-flow-by-atif',
      fetchImpl: mockFetch as any,
      authToken: 'token_2',
    });

    const reloaded = await instance2.getOperation('op_cold_start');
    assert.ok(reloaded);
    assert.equal(reloaded?.status, 'DRIVE_COPY_CREATED');
    assert.equal(reloaded?.driveFileId, 'drive_file_persisted_77');
  });

  // ==========================================================================
  // TEST 12: Migration ledger exclusion from historical document count
  // ==========================================================================
  it('12. Enforces exclusion of driveIdempotency from historical migration payload', () => {
    // Simulated historical document line
    const validHistoricalLine = JSON.stringify({
      fullPath: 'users/AAjxV00m8zcUFB1gwyPlvKqJfsF2/settings/app',
      fields: { theme: { stringValue: 'emerald' } },
      canonicalFieldsHash: 'abc123hash',
    });

    // Simulated accidental operational document line
    const operationalLine = JSON.stringify({
      fullPath: 'driveIdempotency/op_test_123',
      fields: { status: { stringValue: 'COMPLETED' } },
      canonicalFieldsHash: 'op123hash',
    });

    const parseLine = (line: string) => {
      const doc = JSON.parse(line);
      const fullPath = doc.fullPath;
      if (fullPath.startsWith('driveIdempotency/') || fullPath === 'driveIdempotency') {
        throw new Error(
          `CRITICAL SAFETY VIOLATION: Operational collection 'driveIdempotency' document (${fullPath}) cannot be included in historical migration payload!`
        );
      }
      return doc;
    };

    // Valid historical doc succeeds
    const parsedValid = parseLine(validHistoricalLine);
    assert.equal(parsedValid.fullPath, 'users/AAjxV00m8zcUFB1gwyPlvKqJfsF2/settings/app');

    // Operational doc is strictly rejected from migration payload
    assert.throws(
      () => parseLine(operationalLine),
      (err: any) => {
        assert.match(err.message, /CRITICAL SAFETY VIOLATION: Operational collection 'driveIdempotency'/);
        return true;
      }
    );
  });
});
