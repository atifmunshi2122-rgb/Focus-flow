import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import {
  duplicateGoogleDriveFile,
  ensureDriveProgressTrackerTab,
  clearDriveIdempotencyCache,
} from '../server/driveWorker.ts';
import { sheetHubStore } from '../src/lib/sheetHub/sheetHubStore.ts';
import {
  syncStudyTopicCompletionToGoogleSheets,
  pullDualCopyChangesFromDrive,
} from '../src/lib/sheetHub/sheetStudySyncService.ts';
import {
  SHEET_HUB_DUAL_COPY_SCOPES,
  setSheetHubWriteAccessToken,
} from '../src/lib/firebase.ts';
import type {
  SheetColumnMapping,
  SheetConnection,
  SheetSyncedRow,
} from '../src/types/sheetHub.ts';
import type { StudyTopic } from '../src/types/study.ts';

// In-memory local storage mock for Node environment
const testStorage = new Map<string, string>();
const mockLocalStorage = {
  getItem: (key: string): string | null => testStorage.get(key) ?? null,
  setItem: (key: string, value: string): void => {
    testStorage.set(key, String(value));
  },
  removeItem: (key: string): void => {
    testStorage.delete(key);
  },
  clear: (): void => {
    testStorage.clear();
  },
};

(globalThis as unknown as { window: unknown }).window = {
  localStorage: mockLocalStorage,
};

describe('Dual-Copy Google Drive + Firestore Two-Way Sync Engine', () => {
  const originalFetch = globalThis.fetch;

  beforeEach(() => {
    testStorage.clear();
    clearDriveIdempotencyCache();
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
    clearDriveIdempotencyCache();
  });

  // --------------------------------------------------------------------------
  // 1. Least-Privilege OAuth Scopes Verification
  // --------------------------------------------------------------------------
  it('1. verifies least-privilege OAuth scopes: only drive.file and spreadsheets are requested', () => {
    assert.deepEqual(SHEET_HUB_DUAL_COPY_SCOPES, [
      'https://www.googleapis.com/auth/spreadsheets',
      'https://www.googleapis.com/auth/drive.file',
    ]);

    // Ensure broad 'drive' or 'drive.readonly' scopes are NEVER requested
    assert.ok(!SHEET_HUB_DUAL_COPY_SCOPES.includes('https://www.googleapis.com/auth/drive'));
    assert.ok(!SHEET_HUB_DUAL_COPY_SCOPES.includes('https://www.googleapis.com/auth/drive.readonly'));
  });

  // --------------------------------------------------------------------------
  // 2. Google Drive Duplicate Creation via files.copy
  // --------------------------------------------------------------------------
  it('2. duplicates Google Drive file via Drive API v3 files.copy and returns driveFileId', async () => {
    let copyUrlCalled = '';
    let copyMethodCalled = '';
    let copyBodySent: any = null;

    globalThis.fetch = async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
      const url = String(input);
      if (url.includes('/drive/v3/files/source-valid-1234567890/copy')) {
        copyUrlCalled = url;
        copyMethodCalled = init?.method || '';
        copyBodySent = init?.body ? JSON.parse(String(init.body)) : null;
        return new Response(
          JSON.stringify({
            id: 'drive-copy-999',
            name: 'Study Plan (FocusFlow Copy)',
            webViewLink: 'https://docs.google.com/spreadsheets/d/drive-copy-999/edit',
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } }
        );
      }

      // Default mock response for batchUpdate / get
      return new Response(JSON.stringify({ replies: [{ addSheet: { properties: { sheetId: 1001 } } }] }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    };

    const result = await duplicateGoogleDriveFile(
      {
        sourceSpreadsheetId: 'source-valid-1234567890',
        title: 'Study Plan (FocusFlow Copy)',
      },
      'valid-google-token'
    );

    assert.equal(result.driveFileId, 'drive-copy-999');
    assert.equal(result.driveUrl, 'https://docs.google.com/spreadsheets/d/drive-copy-999/edit');
    assert.equal(result.sourceSpreadsheetId, 'source-valid-1234567890');
    assert.equal(copyMethodCalled, 'POST');
    assert.ok(copyUrlCalled.includes('/drive/v3/files/source-valid-1234567890/copy'));
    assert.equal(copyBodySent?.name, 'Study Plan (FocusFlow Copy)');
  });

  // --------------------------------------------------------------------------
  // 3. Idempotency Cache Protection
  // --------------------------------------------------------------------------
  it('3. idempotency: duplicate calls with same key return cached result without re-calling Drive API', async () => {
    let copyCallCount = 0;

    globalThis.fetch = async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
      const url = String(input);
      if (url.includes('/copy')) {
        copyCallCount++;
        return new Response(
          JSON.stringify({
            id: 'drive-copy-idempotent-1',
            name: 'Idempotent Sheet (FocusFlow Copy)',
            webViewLink: 'https://docs.google.com/spreadsheets/d/drive-copy-idempotent-1/edit',
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } }
        );
      }
      return new Response(JSON.stringify({ replies: [] }), { status: 200, headers: { 'Content-Type': 'application/json' } });
    };

    const req = {
      sourceSpreadsheetId: 'source-idem-1234567890',
      idempotencyKey: 'request-key-xyz-789',
    };

    const res1 = await duplicateGoogleDriveFile(req, 'token-idem');
    const res2 = await duplicateGoogleDriveFile(req, 'token-idem');

    assert.equal(copyCallCount, 1, 'Drive API copy must be called exactly once');
    assert.equal(res1.driveFileId, res2.driveFileId);
    assert.equal(res2.driveFileId, 'drive-copy-idempotent-1');
  });

  // --------------------------------------------------------------------------
  // 4. Progress Tracker Tab Creation in Drive Duplicate
  // --------------------------------------------------------------------------
  it('4. creates dedicated Progress Tracker worksheet tab with headers and topic rows in Drive copy', async () => {
    let batchUpdatePayload: any = null;
    let valuesUpdatePayload: any = null;

    globalThis.fetch = async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
      const url = String(input);
      if (url.includes(':batchUpdate')) {
        batchUpdatePayload = init?.body ? JSON.parse(String(init.body)) : null;
        return new Response(
          JSON.stringify({ replies: [{ addSheet: { properties: { sheetId: 7777, title: 'Progress Tracker' } } }] }),
          { status: 200, headers: { 'Content-Type': 'application/json' } }
        );
      }
      if (url.includes('/values/') && init?.method === 'PUT') {
        valuesUpdatePayload = init?.body ? JSON.parse(String(init.body)) : null;
        return new Response(JSON.stringify({ updatedRows: 3 }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        });
      }
      return new Response(JSON.stringify({ sheets: [] }), { status: 200, headers: { 'Content-Type': 'application/json' } });
    };

    const trackerCreated = await ensureDriveProgressTrackerTab(
      'drive-copy-tracker-12345',
      'token-tracker',
      [
        { unit: 'Unit 1', topic: 'Calculus Fundamentals', subtopic: 'Limits', isCompleted: true },
        { unit: 'Unit 1', topic: 'Calculus Fundamentals', subtopic: 'Derivatives', isCompleted: false },
      ]
    );

    assert.equal(trackerCreated, true);
    assert.ok(batchUpdatePayload?.requests?.[0]?.addSheet?.properties?.title === 'Progress Tracker');
    assert.ok(valuesUpdatePayload?.values?.length >= 2);
  });

  // --------------------------------------------------------------------------
  // 5. Native Firestore Dual-Copy Creation and Linkage
  // --------------------------------------------------------------------------
  it('5. creates native Firestore copy and links connection to Drive duplicate file', async () => {
    const userId = 'usr_dual_test_1';
    const mockColumns: SheetColumnMapping[] = [
      { colIndex: 0, colLetter: 'A', fieldKey: 'module', headerName: 'Module', displayName: 'Module', inferredType: 'text', confirmedType: 'text', semanticRole: 'group', confidence: 'high', editable: true, requiresConfirmation: false },
      { colIndex: 1, colLetter: 'B', fieldKey: 'topic', headerName: 'Topic', displayName: 'Topic', inferredType: 'text', confirmedType: 'text', semanticRole: 'title', confidence: 'high', editable: true, requiresConfirmation: false },
      { colIndex: 2, colLetter: 'C', fieldKey: 'status', headerName: 'Status', displayName: 'Status', inferredType: 'checkbox', confirmedType: 'checkbox', semanticRole: 'done', confidence: 'high', editable: true, requiresConfirmation: false },
    ];

    const mockRows: SheetSyncedRow[] = [
      {
        rowUid: 'row_1',
        lastKnownSheetRow: 2,
        values: { module: 'Physics', topic: 'Thermodynamics', status: false },
        baseValues: { module: 'Physics', topic: 'Thermodynamics', status: false },
        rowHash: 'h1',
        version: 1,
        lastSyncOrigin: 'sheet',
        dirtyFields: [],
        localUpdatedAt: null,
        sheetSyncedAt: new Date().toISOString(),
        status: 'synced',
      },
    ];

    const { connection, tabs } = await sheetHubStore.createDualCopySpreadsheet(userId, {
      title: 'Physics Syllabus',
      sourceSpreadsheetId: 'source-physics-orig',
      driveFileId: 'drive-physics-dup',
      driveUrl: 'https://docs.google.com/spreadsheets/d/drive-physics-dup/edit',
      tabs: [
        {
          sheetTitle: 'Semester 1',
          sheetId: 0,
          role: 'data',
          columns: mockColumns,
          rows: mockRows,
        },
      ],
      progressTrackerTopics: [
        { unit: 'Physics', topic: 'Thermodynamics', isCompleted: false },
      ],
    });

    assert.equal(connection.isDualCopy, true);
    assert.equal(connection.spreadsheetId, 'drive-physics-dup');
    assert.equal(connection.driveFileId, 'drive-physics-dup');
    assert.equal(connection.sourceSpreadsheetId, 'source-physics-orig');
    assert.equal(connection.driveSyncStatus, 'synced');
    assert.ok(connection.tabOrder.length >= 2, 'Should include imported tab and Progress Tracker tab');

    // Verify Progress Tracker tab exists in Firestore
    const trackerTab = tabs.find((t) => t.sheetTitle === 'Progress Tracker');
    assert.ok(trackerTab, 'Progress Tracker tab schema must be created in Firestore');
    assert.equal(trackerTab?.role, 'overview');
  });

  // --------------------------------------------------------------------------
  // 6. FocusFlow Checkbox Writeback to Subject Tab & Progress Tracker Tab
  // --------------------------------------------------------------------------
  it('6. checkbox update in FocusFlow writes back to subject tab AND Progress Tracker tab in Drive copy', async () => {
    const userId = 'usr_dual_test_2';
    const mockColumns: SheetColumnMapping[] = [
      { colIndex: 0, colLetter: 'A', fieldKey: 'unit', headerName: 'Unit', displayName: 'Unit', inferredType: 'text', confirmedType: 'text', semanticRole: 'group', confidence: 'high', editable: true, requiresConfirmation: false },
      { colIndex: 1, colLetter: 'B', fieldKey: 'topic', headerName: 'Topic', displayName: 'Topic', inferredType: 'text', confirmedType: 'text', semanticRole: 'title', confidence: 'high', editable: true, requiresConfirmation: false },
      { colIndex: 2, colLetter: 'C', fieldKey: 'done', headerName: 'Completed', displayName: 'Completed', inferredType: 'checkbox', confirmedType: 'checkbox', semanticRole: 'done', confidence: 'high', editable: true, requiresConfirmation: false },
    ];

    const mockRows: SheetSyncedRow[] = [
      {
        rowUid: 'row_math_1',
        lastKnownSheetRow: 2,
        values: { unit: 'Linear Algebra', topic: 'Eigenvectors', done: false },
        baseValues: { unit: 'Linear Algebra', topic: 'Eigenvectors', done: false },
        rowHash: 'hm1',
        version: 1,
        lastSyncOrigin: 'sheet',
        dirtyFields: [],
        localUpdatedAt: null,
        sheetSyncedAt: new Date().toISOString(),
        status: 'synced',
      },
    ];

    await sheetHubStore.createDualCopySpreadsheet(userId, {
      title: 'Math Syllabus',
      sourceSpreadsheetId: 'source-math-orig',
      driveFileId: 'drive-math-dup',
      tabs: [
        {
          sheetTitle: 'Math Topics',
          sheetId: 10,
          role: 'data',
          columns: mockColumns,
          rows: mockRows,
        },
      ],
      progressTrackerTopics: [
        { unit: 'Linear Algebra', topic: 'Eigenvectors', isCompleted: false },
      ],
    });

    setSheetHubWriteAccessToken('fake-oauth-token');

    let pushedUpdates: any[] = [];
    globalThis.fetch = async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
      const url = String(input);
      if (url.includes('/sheet-hub/push-cells')) {
        const body = init?.body ? JSON.parse(String(init.body)) : null;
        pushedUpdates = body?.updates || [];
        return new Response(JSON.stringify({ success: true, updatedCells: pushedUpdates.length }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        });
      }
      return new Response(JSON.stringify({}), { status: 200, headers: { 'Content-Type': 'application/json' } });
    };

    const studyTopic: StudyTopic = {
      id: 'topic_eigen',
      userId,
      subjectCode: 'MATH',
      unit: 'Linear Algebra',
      topic: 'Eigenvectors',
      subtopic: '',
      priority: 'High',
      theory: true,
      practice: false,
      pyq: false,
      revisionCount: 0,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    const syncResult = await syncStudyTopicCompletionToGoogleSheets(
      userId,
      studyTopic,
      true,
      'Math Topics'
    );

    assert.equal(syncResult.status, 'synced');
    assert.ok(pushedUpdates.some((u) => u.sheetTitle === 'Math Topics' && u.rowNumber === 2 && u.value === true));
    assert.ok(pushedUpdates.some((u) => u.sheetTitle === 'Progress Tracker' && u.colLetter === 'D' && u.value === true));
  });

  // --------------------------------------------------------------------------
  // 7. Direction B: Pull from Drive Copy and Reconcile Changes
  // --------------------------------------------------------------------------
  it('7. direction B: pulls changes from Drive duplicate and updates FocusFlow Firestore rows', async () => {
    const userId = 'usr_dual_test_3';
    const mockColumns: SheetColumnMapping[] = [
      { colIndex: 0, colLetter: 'A', fieldKey: 'module', headerName: 'Module', displayName: 'Module', inferredType: 'text', confirmedType: 'text', semanticRole: 'group', confidence: 'high', editable: true, requiresConfirmation: false },
      { colIndex: 1, colLetter: 'B', fieldKey: 'topic', headerName: 'Topic', displayName: 'Topic', inferredType: 'text', confirmedType: 'text', semanticRole: 'title', confidence: 'high', editable: true, requiresConfirmation: false },
      { colIndex: 2, colLetter: 'C', fieldKey: 'done', headerName: 'Done', displayName: 'Done', inferredType: 'checkbox', confirmedType: 'checkbox', semanticRole: 'done', confidence: 'high', editable: true, requiresConfirmation: false },
    ];

    const mockRows: SheetSyncedRow[] = [
      {
        rowUid: 'row_chem_1',
        lastKnownSheetRow: 2,
        values: { module: 'Organic Chem', topic: 'Alkanes', done: false },
        baseValues: { module: 'Organic Chem', topic: 'Alkanes', done: false },
        rowHash: 'hc1',
        version: 1,
        lastSyncOrigin: 'sheet',
        dirtyFields: [],
        localUpdatedAt: null,
        sheetSyncedAt: new Date().toISOString(),
        status: 'synced',
      },
    ];

    const { connection, tabs } = await sheetHubStore.createDualCopySpreadsheet(userId, {
      title: 'Chemistry Syllabus',
      sourceSpreadsheetId: 'source-chem-orig',
      driveFileId: 'drive-chem-dup',
      tabs: [
        {
          sheetTitle: 'Organic',
          sheetId: 20,
          role: 'data',
          columns: mockColumns,
          rows: mockRows,
        },
      ],
    });

    // Mock Sheets API returning updated remote checkbox value = true
    globalThis.fetch = async (input: RequestInfo | URL): Promise<Response> => {
      const url = String(input);
      if (url.includes('/sheet-hub/pull')) {
        return new Response(
          JSON.stringify({
            spreadsheetId: 'drive-chem-dup',
            tabs: [
              {
                sheetId: 20,
                sheetTitle: 'Organic',
                headerRowIndex: 1,
                columns: mockColumns,
                rows: [
                  {
                    sheetRowNumber: 2,
                    values: ['Organic Chem', 'Alkanes', true],
                  },
                ],
              },
            ],
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } }
        );
      }
      return new Response(JSON.stringify({}), { status: 200, headers: { 'Content-Type': 'application/json' } });
    };

    const organicTab = tabs.find((t) => t.sheetTitle === 'Organic')!;
    const pullResult = await pullDualCopyChangesFromDrive(
      userId,
      connection.id,
      'fake-oauth-token'
    );

    assert.equal(pullResult.updatedCells, 1);
    assert.equal(pullResult.conflictsDetected, 0);

    // Verify row was updated in Firestore store
    const updatedRows = await sheetHubStore.loadTabRows(userId, organicTab.id, connection.id);
    assert.equal(updatedRows[0].values.done, true);
  });

  // --------------------------------------------------------------------------
  // 8. 3-Way Merge Conflict Detection
  // --------------------------------------------------------------------------
  it('8. detects 3-way merge conflict when local row is modified while remote row also changed', async () => {
    const userId = 'usr_dual_test_4';
    const mockColumns: SheetColumnMapping[] = [
      { colIndex: 0, colLetter: 'A', fieldKey: 'module', headerName: 'Module', displayName: 'Module', inferredType: 'text', confirmedType: 'text', semanticRole: 'group', confidence: 'high', editable: true, requiresConfirmation: false },
      { colIndex: 1, colLetter: 'B', fieldKey: 'topic', headerName: 'Topic', displayName: 'Topic', inferredType: 'text', confirmedType: 'text', semanticRole: 'title', confidence: 'high', editable: true, requiresConfirmation: false },
      { colIndex: 2, colLetter: 'C', fieldKey: 'done', headerName: 'Done', displayName: 'Done', inferredType: 'checkbox', confirmedType: 'checkbox', semanticRole: 'done', confidence: 'high', editable: true, requiresConfirmation: false },
    ];

    // Local row has status = 'modified' and dirtyFields = ['done']
    const mockRows: SheetSyncedRow[] = [
      {
        rowUid: 'row_bio_1',
        lastKnownSheetRow: 2,
        values: { module: 'Genetics', topic: 'DNA Replication', done: true },
        baseValues: { module: 'Genetics', topic: 'DNA Replication', done: false },
        rowHash: 'hb1',
        version: 1,
        lastSyncOrigin: 'app',
        dirtyFields: ['done'],
        localUpdatedAt: new Date().toISOString(),
        sheetSyncedAt: new Date().toISOString(),
        status: 'pending_push',
      },
    ];

    const { connection, tabs } = await sheetHubStore.createDualCopySpreadsheet(userId, {
      title: 'Biology Syllabus',
      sourceSpreadsheetId: 'source-bio-orig',
      driveFileId: 'drive-bio-dup',
      tabs: [
        {
          sheetTitle: 'Genetics',
          sheetId: 30,
          role: 'data',
          columns: mockColumns,
          rows: mockRows,
        },
      ],
    });

    // Remote returns that remote row also changed from base (done is 'IN_PROGRESS' string)
    globalThis.fetch = async (input: RequestInfo | URL): Promise<Response> => {
      const url = String(input);
      if (url.includes('/sheet-hub/pull')) {
        return new Response(
          JSON.stringify({
            spreadsheetId: 'drive-bio-dup',
            tabs: [
              {
                sheetId: 30,
                sheetTitle: 'Genetics',
                headerRowIndex: 1,
                columns: mockColumns,
                rows: [
                  {
                    sheetRowNumber: 2,
                    values: ['Genetics', 'DNA Replication', 'IN_PROGRESS'],
                  },
                ],
              },
            ],
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } }
        );
      }
      return new Response(JSON.stringify({}), { status: 200, headers: { 'Content-Type': 'application/json' } });
    };

    const pullResult = await pullDualCopyChangesFromDrive(
      userId,
      connection.id,
      'fake-oauth-token'
    );

    assert.equal(pullResult.conflictsDetected, 1);
    const conflicts = await sheetHubStore.listOpenConflicts(userId, connection.id);
    assert.ok(conflicts.length >= 1, 'Conflict must be recorded in conflict store');
    assert.equal(conflicts[0].fieldKey, 'done');
  });

  // --------------------------------------------------------------------------
  // 9. Multi-User Tenant Isolation
  // --------------------------------------------------------------------------
  it('9. enforces multi-user tenant isolation: User A cannot access User B dual-copy spreadsheets', async () => {
    const userA = 'usr_alice';
    const userB = 'usr_bob';

    const { connection: connA } = await sheetHubStore.createDualCopySpreadsheet(userA, {
      title: "Alice's Syllabus",
      sourceSpreadsheetId: 'source-alice',
      driveFileId: 'drive-alice-dup',
      tabs: [],
    });

    // User A can list and retrieve their connection
    const aliceConns = await sheetHubStore.listConnections(userA);
    assert.ok(aliceConns.some((c) => c.id === connA.id));

    // User B cannot list Alice's connection
    const bobConns = await sheetHubStore.listConnections(userB);
    assert.ok(!bobConns.some((c) => c.id === connA.id));

    // User B cannot get Alice's connection
    const bobAttempt = await sheetHubStore.getConnection(userB, connA.id);
    assert.equal(bobAttempt, null);
  });

  // --------------------------------------------------------------------------
  // 10. Unauthenticated Requests Rejected
  // --------------------------------------------------------------------------
  it('10. rejects unauthenticated duplicate requests with DRIVE_AUTH_REQUIRED', async () => {
    await assert.rejects(
      async () => {
        await duplicateGoogleDriveFile(
          {
            sourceSpreadsheetId: 'source-no-auth',
          },
          '' // Empty token
        );
      },
      (err: any) => {
        assert.equal(err.code, 'DRIVE_AUTH_REQUIRED');
        return true;
      }
    );
  });

  // --------------------------------------------------------------------------
  // 11. Regression: Dual-Copy Save Order & Zero Premature Connection Invariant
  // --------------------------------------------------------------------------
  it('11. verifies Dual-Copy creates exactly one authoritative connection linked to Drive copy without premature source save', async () => {
    const userId = 'usr_dual_order_test';
    const sourceSpreadsheetId = 'source-sheet-original-12345';
    const driveDuplicateFileId = 'drive-copy-duplicate-67890';

    // Track all saveConnection invocations
    const originalSaveConnection = sheetHubStore.saveConnection.bind(sheetHubStore);
    const savedConnections: SheetConnection[] = [];

    sheetHubStore.saveConnection = async (uid: string, conn: SheetConnection, options?: { force?: boolean }) => {
      savedConnections.push({ ...conn });
      return originalSaveConnection(uid, conn, options);
    };

    try {
      // Execute createDualCopySpreadsheet (as ConnectSheetWizard now does directly in Dual-Copy mode)
      const { connection } = await sheetHubStore.createDualCopySpreadsheet(userId, {
        title: 'Biology 101',
        sourceSpreadsheetId,
        driveFileId: driveDuplicateFileId,
        driveUrl: `https://docs.google.com/spreadsheets/d/${driveDuplicateFileId}/edit`,
        tabs: [
          {
            sheetTitle: 'Syllabus',
            sheetId: 0,
            role: 'data',
            columns: [
              { colIndex: 0, colLetter: 'A', fieldKey: 'topic', headerName: 'Topic', displayName: 'Topic', inferredType: 'text', confirmedType: 'text', semanticRole: 'title', confidence: 'high', editable: true, requiresConfirmation: false },
            ],
            rows: [
              {
                rowUid: 'row_bio_1',
                lastKnownSheetRow: 2,
                values: { topic: 'Cell Division' },
                baseValues: { topic: 'Cell Division' },
                rowHash: 'hash_bio_1',
                version: 1,
                lastSyncOrigin: 'sheet',
                dirtyFields: [],
                localUpdatedAt: null,
                sheetSyncedAt: new Date().toISOString(),
                status: 'synced',
              },
            ],
          },
        ],
        progressTrackerTopics: [{ unit: 'Unit 1', topic: 'Cell Division', isCompleted: false }],
      });

      // Assertions:
      // 1. Exactly one connection was saved
      assert.equal(savedConnections.length, 1, 'Only one connection must be saved during Dual-Copy import');

      // 2. The saved connection is authoritative and points to the Drive duplicate, NOT the source sheet ID
      assert.equal(savedConnections[0].id, connection.id);
      assert.equal(savedConnections[0].isDualCopy, true);
      assert.equal(savedConnections[0].spreadsheetId, driveDuplicateFileId);
      assert.equal(savedConnections[0].driveFileId, driveDuplicateFileId);
      assert.equal(savedConnections[0].sourceSpreadsheetId, sourceSpreadsheetId);

      // 3. No connection was ever saved with the sourceSpreadsheetId as primary spreadsheetId
      assert.ok(
        !savedConnections.some((c) => c.spreadsheetId === sourceSpreadsheetId && !c.isDualCopy),
        'Must NOT save a premature standard connection pointing to the source spreadsheet'
      );
    } finally {
      sheetHubStore.saveConnection = originalSaveConnection;
    }
  });

  // --------------------------------------------------------------------------
  // 12. Dual-Copy Rollback on Failure (No Orphaned Records)
  // --------------------------------------------------------------------------
  it('12. rolls back and purges tabs and connection if saveConnection fails during createDualCopySpreadsheet', async () => {
    const userId = 'usr_dual_rollback_test';
    const originalSave = sheetHubStore.saveConnection.bind(sheetHubStore);

    // Simulate Firestore permission or network failure during saveConnection
    sheetHubStore.saveConnection = async () => {
      const err = new Error('Missing or insufficient permissions: Cloud Firestore rules rejected the write.');
      (err as any).code = 'permission-denied';
      throw err;
    };

    try {
      await assert.rejects(
        async () => {
          await sheetHubStore.createDualCopySpreadsheet(userId, {
            title: 'Failing Dual-Copy',
            sourceSpreadsheetId: 'source-fail-1',
            driveFileId: 'drive-fail-1',
            tabs: [
              {
                sheetTitle: 'Tab 1',
                sheetId: 0,
                columns: [],
                rows: [],
              },
            ],
          });
        },
        /Missing or insufficient permissions/
      );

      // Verify no orphaned connections exist in user store
      sheetHubStore.saveConnection = originalSave;
      const userConns = await sheetHubStore.listConnections(userId);
      assert.equal(userConns.length, 0, 'No orphaned connections should remain after failed dual-copy creation');
    } finally {
      sheetHubStore.saveConnection = originalSave;
    }
  });
});
