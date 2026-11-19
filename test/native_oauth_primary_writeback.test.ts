import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import {
  syncStudyTopicCompletionToGoogleSheets,
  flushPendingWritebacks,
  listPendingWritebacks,
  enqueuePendingWriteback,
} from '../src/lib/sheetHub/sheetStudySyncService.ts';
import { sheetHubStore } from '../src/lib/sheetHub/sheetHubStore.ts';
import { api } from '../src/lib/api.ts';
import { setSheetHubWriteAccessToken } from '../src/lib/firebase.ts';
import type {
  SheetColumnMapping,
  SheetConnection,
  SheetSyncedRow,
  SheetTabSchema,
} from '../src/types/sheetHub.ts';
import type { StudyTopic } from '../src/types/study.ts';

// ============================================================================
// MOCK LOCALSTORAGE & WINDOW SETUP FOR NODE.JS TEST RUNNER
// ============================================================================

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

// ============================================================================
// HELPER FACTORIES
// ============================================================================

function createMockConnection(params: {
  id: string;
  userId: string;
  spreadsheetId: string;
  writeMode?: 'native_oauth' | 'apps_script' | 'none';
  tabIds?: string[];
}): SheetConnection {
  return {
    id: params.id,
    userId: params.userId,
    ownerUid: params.userId,
    spreadsheetId: params.spreadsheetId,
    spreadsheetUrl: `https://docs.google.com/spreadsheets/d/${params.spreadsheetId}/edit`,
    title: `Sheet for ${params.spreadsheetId}`,
    templateHint: 'checklist',
    syncMode: 'two_way',
    writeMode: params.writeMode,
    writeAuthStatus: 'authorized',
    writeAuthorizedAt: new Date().toISOString(),
    pollIntervalSec: null,
    syncOnOpen: true,
    status: 'active',
    lastSyncedAt: new Date().toISOString(),
    lastSuccessfulPullAt: new Date().toISOString(),
    lastSuccessfulPushAt: null,
    lastError: null,
    pendingChangesCount: 0,
    conflictCount: 0,
    tabOrder: params.tabIds || [`${params.id}__tab_0`],
    schemaVersion: 1,
    sortOrder: 0,
    isNative: false,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    deletedAt: null,
  };
}

function createMockTab(params: {
  tabId: string;
  connectionId: string;
  userId: string;
  sheetTitle: string;
  doneColLetter?: string;
}): SheetTabSchema {
  const doneCol = params.doneColLetter || 'D';
  const columns: SheetColumnMapping[] = [
    {
      colIndex: 0,
      colLetter: 'A',
      fieldKey: 'unit',
      headerName: 'Module',
      displayName: 'Module',
      inferredType: 'text',
      confirmedType: 'text',
      semanticRole: 'group',
      confidence: 'high',
      editable: false,
      requiresConfirmation: false,
    },
    {
      colIndex: 1,
      colLetter: 'B',
      fieldKey: 'topic',
      headerName: 'Topic',
      displayName: 'Topic',
      inferredType: 'text',
      confirmedType: 'text',
      semanticRole: 'group',
      confidence: 'high',
      editable: false,
      requiresConfirmation: false,
    },
    {
      colIndex: 2,
      colLetter: 'C',
      fieldKey: 'subtopic',
      headerName: 'Subtopic',
      displayName: 'Subtopic',
      inferredType: 'text',
      confirmedType: 'text',
      semanticRole: 'title',
      confidence: 'high',
      editable: false,
      requiresConfirmation: false,
    },
    {
      colIndex: 3,
      colLetter: doneCol,
      fieldKey: 'done',
      headerName: 'Done',
      displayName: 'Done',
      inferredType: 'checkbox',
      confirmedType: 'checkbox',
      semanticRole: 'done',
      confidence: 'high',
      editable: true,
      requiresConfirmation: false,
    },
  ];

  return {
    id: params.tabId,
    connectionId: params.connectionId,
    sheetDocId: params.connectionId,
    userId: params.userId,
    ownerUid: params.userId,
    sheetId: 0,
    sheetTitle: params.sheetTitle,
    role: 'data',
    headerRowIndex: 1,
    dataStartRow: 2,
    dataEndColumn: doneCol,
    identityStrategy: 'composite_key',
    identityColumns: ['unit', 'topic', 'subtopic'],
    metadataIdColumn: null,
    columns,
    defaultView: 'checklist',
    groupByColumnId: 'unit',
    lastPullHash: 'hash',
    rowCount: 1,
    chunkCount: 1,
    position: 0,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
}

function createMockRow(params: {
  rowUid: string;
  sheetRowNumber: number;
  unit: string;
  topic: string;
  subtopic: string;
  doneValue?: boolean;
}): SheetSyncedRow {
  const vals = {
    unit: params.unit,
    topic: params.topic,
    subtopic: params.subtopic,
    done: params.doneValue ?? false,
    A: params.unit,
    B: params.topic,
    C: params.subtopic,
    D: params.doneValue ?? false,
  };

  return {
    rowUid: params.rowUid,
    rowIndex: 0,
    lastKnownSheetRow: params.sheetRowNumber,
    values: vals,
    baseValues: vals,
    rowHash: `hash_${params.rowUid}`,
    version: 1,
    lastSyncOrigin: 'app',
    dirtyFields: [],
    localUpdatedAt: new Date().toISOString(),
    sheetSyncedAt: new Date().toISOString(),
    status: 'synced',
  };
}

// ============================================================================
// TEST SUITE: NATIVE OAUTH PRIMARY WRITE-BACK ARCHITECTURE
// ============================================================================

describe('FocusFlow Native Per-User Google OAuth Primary Write-Back Architecture', () => {
  const originalPushCells = api.sheetHubPushCells;
  const originalAppsScript = api.sheetHubAppsScriptWriteback;

  let nativePushCalls: Array<{
    spreadsheetId: string;
    updates: Array<{ sheetTitle: string; rowNumber: number; colLetter: string; value: unknown }>;
    token: string;
  }> = [];

  let appsScriptCalls: Array<{
    connectionId: string;
    spreadsheetId: string;
    sheetTitle: string;
    rowNumber: number;
    colLetter: string;
    value: unknown;
  }> = [];

  beforeEach(() => {
    testStorage.clear();
    nativePushCalls = [];
    appsScriptCalls = [];
    setSheetHubWriteAccessToken('mock_valid_user_oauth_token_12345');

    api.sheetHubPushCells = async (payload, token) => {
      nativePushCalls.push({
        spreadsheetId: payload.spreadsheetId,
        updates: payload.updates,
        token,
      });
      return {
        success: true,
        spreadsheetId: payload.spreadsheetId,
        updatedCells: payload.updates.length,
        updatedRangeCount: payload.updates.length,
        pushedAt: new Date().toISOString(),
      };
    };

    api.sheetHubAppsScriptWriteback = async (payload) => {
      appsScriptCalls.push({
        connectionId: payload.connectionId,
        spreadsheetId: payload.spreadsheetId,
        sheetTitle: payload.sheetTitle,
        rowNumber: payload.rowNumber,
        colLetter: payload.colLetter,
        value: payload.value,
      });
      return {
        success: true,
        updatedCell: `${payload.sheetTitle}!${payload.colLetter}${payload.rowNumber}`,
        value: payload.value,
        updatedAt: new Date().toISOString(),
        bridgeMode: 'apps_script',
      };
    };
  });

  afterEach(() => {
    api.sheetHubPushCells = originalPushCells;
    api.sheetHubAppsScriptWriteback = originalAppsScript;
    setSheetHubWriteAccessToken(null);
    testStorage.clear();
  });

  // ==========================================================================
  // SCENARIO 1: One user connects two different spreadsheets
  // ==========================================================================
  it('Scenario 1: One user connects two separate spreadsheets and each topic writes to its corresponding sheet', async () => {
    const userId = `usr_multi_sheet_${Date.now()}`;
    const conn1Id = `conn_coa_${Date.now()}`;
    const conn2Id = `conn_dbms_${Date.now()}`;
    const tab1Id = `${conn1Id}__tab_0`;
    const tab2Id = `${conn2Id}__tab_0`;

    const conn1 = createMockConnection({ id: conn1Id, userId, spreadsheetId: 'sheet_alpha_coa_111' });
    const tab1 = createMockTab({ tabId: tab1Id, connectionId: conn1Id, userId, sheetTitle: 'COA' });
    const row1 = createMockRow({
      rowUid: 'row_coa_1',
      sheetRowNumber: 4,
      unit: 'Digital Logic',
      topic: 'Binary Arithmetic',
      subtopic: 'Two Complement Representation',
    });

    const conn2 = createMockConnection({ id: conn2Id, userId, spreadsheetId: 'sheet_beta_dbms_222' });
    const tab2 = createMockTab({ tabId: tab2Id, connectionId: conn2Id, userId, sheetTitle: 'DBMS' });
    const row2 = createMockRow({
      rowUid: 'row_dbms_1',
      sheetRowNumber: 8,
      unit: 'Transactions',
      topic: 'Concurrency Control',
      subtopic: 'Two-Phase Locking (2PL)',
    });

    await sheetHubStore.saveConnection(userId, conn1, { force: true });
    await sheetHubStore.saveTabSchema(userId, tab1);
    await sheetHubStore.saveTabRowsChunked({ userId, connectionId: conn1Id, tabId: tab1Id, rows: [row1] });

    await sheetHubStore.saveConnection(userId, conn2, { force: true });
    await sheetHubStore.saveTabSchema(userId, tab2);
    await sheetHubStore.saveTabRowsChunked({ userId, connectionId: conn2Id, tabId: tab2Id, rows: [row2] });

    // 1. Mark COA topic completed
    const coaTopic: StudyTopic = {
      id: 'top_coa_1',
      userId,
      subjectCode: 'Sub_COA',
      unit: 'Digital Logic',
      topic: 'Binary Arithmetic',
      subtopic: 'Two Complement Representation',
      priority: 'High',
      theory: true,
      practice: true,
      pyq: false,
      revisionCount: 1,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    const res1 = await syncStudyTopicCompletionToGoogleSheets(userId, coaTopic, true, 'Computer Organization');
    assert.equal(res1.status, 'synced');
    assert.equal(res1.spreadsheetId, 'sheet_alpha_coa_111');
    assert.equal(res1.cellRef, 'COA!D4');

    // 2. Mark DBMS topic completed
    const dbmsTopic: StudyTopic = {
      id: 'top_dbms_1',
      userId,
      subjectCode: 'Sub_DBMS',
      unit: 'Transactions',
      topic: 'Concurrency Control',
      subtopic: 'Two-Phase Locking (2PL)',
      priority: 'High',
      theory: true,
      practice: true,
      pyq: false,
      revisionCount: 1,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    const res2 = await syncStudyTopicCompletionToGoogleSheets(userId, dbmsTopic, true, 'Database Management Systems');
    assert.equal(res2.status, 'synced');
    assert.equal(res2.spreadsheetId, 'sheet_beta_dbms_222');
    assert.equal(res2.cellRef, 'DBMS!D8');

    assert.equal(nativePushCalls.length, 2);
    assert.equal(nativePushCalls[0].spreadsheetId, 'sheet_alpha_coa_111');
    assert.equal(nativePushCalls[1].spreadsheetId, 'sheet_beta_dbms_222');
    assert.equal(appsScriptCalls.length, 0, 'Must NOT invoke Apps Script for native OAuth connections');
  });

  // ==========================================================================
  // SCENARIO 2: New arbitrary spreadsheet works dynamically without code changes
  // ==========================================================================
  it('Scenario 2: Newly added arbitrary spreadsheet ID functions dynamically without code changes or allowlists', async () => {
    const userId = `usr_dynamic_${Date.now()}`;
    const dynamicSheetId = `arbitrary_user_sheet_${Date.now()}_abcxyz`;
    const connId = `conn_dyn_${Date.now()}`;
    const tabId = `${connId}__tab_0`;

    const conn = createMockConnection({ id: connId, userId, spreadsheetId: dynamicSheetId });
    const tab = createMockTab({ tabId, connectionId: connId, userId, sheetTitle: 'Python' });
    const row = createMockRow({
      rowUid: 'row_py_1',
      sheetRowNumber: 12,
      unit: 'Functions',
      topic: 'Decorators',
      subtopic: 'Function Wrappers',
    });

    await sheetHubStore.saveConnection(userId, conn, { force: true });
    await sheetHubStore.saveTabSchema(userId, tab);
    await sheetHubStore.saveTabRowsChunked({ userId, connectionId: connId, tabId, rows: [row] });

    const pyTopic: StudyTopic = {
      id: 'top_py_1',
      userId,
      subjectCode: 'Sub_Python',
      unit: 'Functions',
      topic: 'Decorators',
      subtopic: 'Function Wrappers',
      priority: 'High',
      theory: true,
      practice: true,
      pyq: false,
      revisionCount: 0,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    const res = await syncStudyTopicCompletionToGoogleSheets(userId, pyTopic, true, 'Python Programming');
    assert.equal(res.status, 'synced');
    assert.equal(res.spreadsheetId, dynamicSheetId);
    assert.equal(res.cellRef, 'Python!D12');
    assert.equal(nativePushCalls.length, 1);
    assert.equal(nativePushCalls[0].spreadsheetId, dynamicSheetId);
  });

  // ==========================================================================
  // SCENARIO 3: User A marks topic -> only User A's spreadsheet updates
  // ==========================================================================
  it('Scenario 3: User A marking a topic writes only to User A’s spreadsheet using User A’s OAuth token', async () => {
    const userA = `usr_user_a_${Date.now()}`;
    const sheetA = `sheet_user_a_private_${Date.now()}`;
    const connAId = `conn_a_${Date.now()}`;
    const tabAId = `${connAId}__tab_0`;

    const connA = createMockConnection({ id: connAId, userId: userA, spreadsheetId: sheetA });
    const tabA = createMockTab({ tabId: tabAId, connectionId: connAId, userId: userA, sheetTitle: 'COA' });
    const rowA = createMockRow({
      rowUid: 'row_a_1',
      sheetRowNumber: 5,
      unit: 'Pipelining',
      topic: 'Hazards',
      subtopic: 'Data Hazards',
    });

    await sheetHubStore.saveConnection(userA, connA, { force: true });
    await sheetHubStore.saveTabSchema(userA, tabA);
    await sheetHubStore.saveTabRowsChunked({ userId: userA, connectionId: connAId, tabId: tabAId, rows: [rowA] });

    setSheetHubWriteAccessToken('token_belonging_to_user_a');

    const topicA: StudyTopic = {
      id: 'top_hazards',
      userId: userA,
      subjectCode: 'Sub_COA',
      unit: 'Pipelining',
      topic: 'Hazards',
      subtopic: 'Data Hazards',
      priority: 'High',
      theory: true,
      practice: true,
      pyq: false,
      revisionCount: 0,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    const res = await syncStudyTopicCompletionToGoogleSheets(userA, topicA, true, 'Computer Architecture');
    assert.equal(res.status, 'synced');
    assert.equal(res.spreadsheetId, sheetA);
    assert.equal(nativePushCalls.length, 1);
    assert.equal(nativePushCalls[0].spreadsheetId, sheetA);
    assert.equal(nativePushCalls[0].token, 'token_belonging_to_user_a');
  });

  // ==========================================================================
  // SCENARIO 4: User B marks topic -> only User B's spreadsheet updates
  // ==========================================================================
  it('Scenario 4: User B marking a topic writes only to User B’s spreadsheet using User B’s token', async () => {
    const userB = `usr_user_b_${Date.now()}`;
    const sheetB = `sheet_user_b_private_${Date.now()}`;
    const connBId = `conn_b_${Date.now()}`;
    const tabBId = `${connBId}__tab_0`;

    const connB = createMockConnection({ id: connBId, userId: userB, spreadsheetId: sheetB });
    const tabB = createMockTab({ tabId: tabBId, connectionId: connBId, userId: userB, sheetTitle: 'COA' });
    const rowB = createMockRow({
      rowUid: 'row_b_1',
      sheetRowNumber: 7,
      unit: 'Pipelining',
      topic: 'Hazards',
      subtopic: 'Control Hazards',
    });

    await sheetHubStore.saveConnection(userB, connB, { force: true });
    await sheetHubStore.saveTabSchema(userB, tabB);
    await sheetHubStore.saveTabRowsChunked({ userId: userB, connectionId: connBId, tabId: tabBId, rows: [rowB] });

    setSheetHubWriteAccessToken('token_belonging_to_user_b');

    const topicB: StudyTopic = {
      id: 'top_ctrl_hazards',
      userId: userB,
      subjectCode: 'Sub_COA',
      unit: 'Pipelining',
      topic: 'Hazards',
      subtopic: 'Control Hazards',
      priority: 'Medium',
      theory: true,
      practice: true,
      pyq: false,
      revisionCount: 0,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    const res = await syncStudyTopicCompletionToGoogleSheets(userB, topicB, true, 'Computer Architecture');
    assert.equal(res.status, 'synced');
    assert.equal(res.spreadsheetId, sheetB);
    assert.equal(nativePushCalls.length, 1);
    assert.equal(nativePushCalls[0].spreadsheetId, sheetB);
    assert.equal(nativePushCalls[0].token, 'token_belonging_to_user_b');
  });

  // ==========================================================================
  // SCENARIO 5: TRUE write-back
  // ==========================================================================
  it('Scenario 5: Marking topic complete transmits value: true to Google Sheets', async () => {
    const userId = `usr_true_${Date.now()}`;
    const connId = `conn_true_${Date.now()}`;
    const tabId = `${connId}__tab_0`;

    const conn = createMockConnection({ id: connId, userId, spreadsheetId: 'sheet_check_true' });
    const tab = createMockTab({ tabId, connectionId: connId, userId, sheetTitle: 'COA' });
    const row = createMockRow({
      rowUid: 'row_t_1',
      sheetRowNumber: 3,
      unit: 'Memory',
      topic: 'Cache',
      subtopic: 'Direct Mapped Cache',
      doneValue: false,
    });

    await sheetHubStore.saveConnection(userId, conn, { force: true });
    await sheetHubStore.saveTabSchema(userId, tab);
    await sheetHubStore.saveTabRowsChunked({ userId, connectionId: connId, tabId, rows: [row] });

    const topic: StudyTopic = {
      id: 'top_cache_direct',
      userId,
      subjectCode: 'Sub_COA',
      unit: 'Memory',
      topic: 'Cache',
      subtopic: 'Direct Mapped Cache',
      priority: 'High',
      theory: true,
      practice: true,
      pyq: false,
      revisionCount: 0,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    const res = await syncStudyTopicCompletionToGoogleSheets(userId, topic, true, 'COA');
    assert.equal(res.status, 'synced');
    assert.equal(res.value, true);
    assert.equal(nativePushCalls.length, 1);
    assert.equal(nativePushCalls[0].updates[0].value, true);
    assert.equal(nativePushCalls[0].updates[0].rowNumber, 3);
    assert.equal(nativePushCalls[0].updates[0].colLetter, 'D');
  });

  // ==========================================================================
  // SCENARIO 6: FALSE write-back (unmarking)
  // ==========================================================================
  it('Scenario 6: Unmarking topic complete transmits value: false to Google Sheets', async () => {
    const userId = `usr_false_${Date.now()}`;
    const connId = `conn_false_${Date.now()}`;
    const tabId = `${connId}__tab_0`;

    const conn = createMockConnection({ id: connId, userId, spreadsheetId: 'sheet_check_false' });
    const tab = createMockTab({ tabId, connectionId: connId, userId, sheetTitle: 'COA' });
    const row = createMockRow({
      rowUid: 'row_f_1',
      sheetRowNumber: 6,
      unit: 'Memory',
      topic: 'Virtual Memory',
      subtopic: 'Page Tables',
      doneValue: true,
    });

    await sheetHubStore.saveConnection(userId, conn, { force: true });
    await sheetHubStore.saveTabSchema(userId, tab);
    await sheetHubStore.saveTabRowsChunked({ userId, connectionId: connId, tabId, rows: [row] });

    const topic: StudyTopic = {
      id: 'top_page_tables',
      userId,
      subjectCode: 'Sub_COA',
      unit: 'Memory',
      topic: 'Virtual Memory',
      subtopic: 'Page Tables',
      priority: 'High',
      theory: false,
      practice: false,
      pyq: false,
      revisionCount: 1,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    const res = await syncStudyTopicCompletionToGoogleSheets(userId, topic, false, 'COA');
    assert.equal(res.status, 'synced');
    assert.equal(res.value, false);
    assert.equal(nativePushCalls.length, 1);
    assert.equal(nativePushCalls[0].updates[0].value, false);
    assert.equal(nativePushCalls[0].updates[0].rowNumber, 6);
  });

  // ==========================================================================
  // SCENARIO 7: Missing token -> status: 'queued', entry in pending queue
  // ==========================================================================
  it('Scenario 7: Missing OAuth token queues update, returns status: "queued", marks auth_required', async () => {
    const userId = `usr_missing_tok_${Date.now()}`;
    const connId = `conn_queue_${Date.now()}`;
    const tabId = `${connId}__tab_0`;

    const conn = createMockConnection({ id: connId, userId, spreadsheetId: 'sheet_missing_tok' });
    const tab = createMockTab({ tabId, connectionId: connId, userId, sheetTitle: 'COA' });
    const row = createMockRow({
      rowUid: 'row_q_1',
      sheetRowNumber: 10,
      unit: 'ALU',
      topic: 'Multiplication',
      subtopic: 'Booth Algorithm',
    });

    await sheetHubStore.saveConnection(userId, conn, { force: true });
    await sheetHubStore.saveTabSchema(userId, tab);
    await sheetHubStore.saveTabRowsChunked({ userId, connectionId: connId, tabId, rows: [row] });

    // Explicitly clear write access token
    setSheetHubWriteAccessToken(null);

    const topic: StudyTopic = {
      id: 'top_booth',
      userId,
      subjectCode: 'Sub_COA',
      unit: 'ALU',
      topic: 'Multiplication',
      subtopic: 'Booth Algorithm',
      priority: 'High',
      theory: true,
      practice: true,
      pyq: false,
      revisionCount: 0,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    const res = await syncStudyTopicCompletionToGoogleSheets(userId, topic, true, 'COA');

    // 1. Returns queued status and error code
    assert.equal(res.status, 'queued');
    assert.equal(res.synced, false);
    assert.equal(res.error, 'OAUTH_TOKEN_MISSING');
    assert.ok(res.pendingId);

    // 2. No native API push occurred
    assert.equal(nativePushCalls.length, 0);

    // 3. Pending queue has the queued writeback
    const queue = listPendingWritebacks(userId);
    assert.equal(queue.length, 1);
    assert.equal(queue[0].spreadsheetId, 'sheet_missing_tok');
    assert.equal(queue[0].rowNumber, 10);
    assert.equal(queue[0].colLetter, 'D');
    assert.equal(queue[0].value, true);

    // 4. Connection was marked auth_required in store
    const updatedConn = await sheetHubStore.getConnection(userId, connId);
    assert.equal(updatedConn?.status, 'auth_required');
    assert.equal(updatedConn?.writeAuthStatus, 'expired');
  });

  // ==========================================================================
  // SCENARIO 8: Expired token (401 error from API) -> status: 'queued'
  // ==========================================================================
  it('Scenario 8: Expired token 401 error triggers graceful queueing without error throw', async () => {
    const userId = `usr_expired_tok_${Date.now()}`;
    const connId = `conn_exp_${Date.now()}`;
    const tabId = `${connId}__tab_0`;

    const conn = createMockConnection({ id: connId, userId, spreadsheetId: 'sheet_expired_tok' });
    const tab = createMockTab({ tabId, connectionId: connId, userId, sheetTitle: 'COA' });
    const row = createMockRow({
      rowUid: 'row_e_1',
      sheetRowNumber: 15,
      unit: 'I/O',
      topic: 'Interrupts',
      subtopic: 'Daisy Chaining',
    });

    await sheetHubStore.saveConnection(userId, conn, { force: true });
    await sheetHubStore.saveTabSchema(userId, tab);
    await sheetHubStore.saveTabRowsChunked({ userId, connectionId: connId, tabId, rows: [row] });

    setSheetHubWriteAccessToken('stale_expired_token_xyz');
    api.sheetHubPushCells = async () => {
      const authErr = new Error('Request failed with status code 401: SHEETS_AUTH_REQUIRED');
      (authErr as unknown as { status: number }).status = 401;
      throw authErr;
    };

    const topic: StudyTopic = {
      id: 'top_interrupts',
      userId,
      subjectCode: 'Sub_COA',
      unit: 'I/O',
      topic: 'Interrupts',
      subtopic: 'Daisy Chaining',
      priority: 'Low',
      theory: true,
      practice: false,
      pyq: false,
      revisionCount: 0,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    const res = await syncStudyTopicCompletionToGoogleSheets(userId, topic, true, 'COA');

    assert.equal(res.status, 'queued');
    assert.equal(res.synced, false);
    assert.equal(res.error, 'OAUTH_TOKEN_EXPIRED');

    const queue = listPendingWritebacks(userId);
    assert.equal(queue.length, 1);
    assert.equal(queue[0].rowNumber, 15);
  });

  // ==========================================================================
  // SCENARIO 9: flushPendingWritebacks succeeds after token restored
  // ==========================================================================
  it('Scenario 9: flushPendingWritebacks drains queued updates after OAuth re-authorization', async () => {
    const userId = `usr_flush_test_${Date.now()}`;
    const connId = `conn_flush_${Date.now()}`;

    enqueuePendingWriteback(userId, {
      userId,
      connectionId: connId,
      spreadsheetId: 'sheet_flush_target',
      sheetTitle: 'COA',
      rowNumber: 4,
      colLetter: 'D',
      cellRef: 'COA!D4',
      value: true,
      topicUnit: 'Unit 1',
      topicTopic: 'Topic 1',
      topicSubtopic: 'Subtopic 1',
    });

    enqueuePendingWriteback(userId, {
      userId,
      connectionId: connId,
      spreadsheetId: 'sheet_flush_target',
      sheetTitle: 'COA',
      rowNumber: 9,
      colLetter: 'D',
      cellRef: 'COA!D9',
      value: false,
      topicUnit: 'Unit 2',
      topicTopic: 'Topic 2',
      topicSubtopic: 'Subtopic 2',
    });

    assert.equal(listPendingWritebacks(userId).length, 2);

    // Case A: token not restored yet -> flush returns 0
    setSheetHubWriteAccessToken(null);
    const flushAttempt1 = await flushPendingWritebacks(userId);
    assert.equal(flushAttempt1, 0);
    assert.equal(listPendingWritebacks(userId).length, 2);

    // Case B: token restored -> flush drains all items
    setSheetHubWriteAccessToken('fresh_active_token_999');
    const flushAttempt2 = await flushPendingWritebacks(userId);
    assert.equal(flushAttempt2, 2);
    assert.equal(listPendingWritebacks(userId).length, 0, 'Queue must be empty after successful flush');
    assert.equal(nativePushCalls.length, 2);
  });

  // ==========================================================================
  // SCENARIO 10: Cross-user ownership denial
  // ==========================================================================
  it('Scenario 10: User cannot access or write to connections belonging to another user', async () => {
    const victimUserId = `usr_victim_${Date.now()}`;
    const attackerUserId = `usr_attacker_${Date.now()}`;
    const victimConnId = `conn_victim_${Date.now()}`;
    const victimTabId = `${victimConnId}__tab_0`;

    const victimConn = createMockConnection({
      id: victimConnId,
      userId: victimUserId,
      spreadsheetId: 'victim_confidential_sheet',
    });
    const victimTab = createMockTab({
      tabId: victimTabId,
      connectionId: victimConnId,
      userId: victimUserId,
      sheetTitle: 'COA',
    });

    await sheetHubStore.saveConnection(victimUserId, victimConn, { force: true });
    await sheetHubStore.saveTabSchema(victimUserId, victimTab);

    // Attacker tries to query connections: attacker should see 0 connections
    const attackerConns = await sheetHubStore.listConnections(attackerUserId);
    assert.equal(attackerConns.length, 0);

    // Attacker tries to trigger sync for a topic using attacker's userId
    const attackerTopic: StudyTopic = {
      id: 'top_attack',
      userId: attackerUserId,
      subjectCode: 'Sub_COA',
      unit: 'Confidential',
      topic: 'Secret',
      subtopic: 'Payload',
      priority: 'High',
      theory: true,
      practice: true,
      pyq: false,
      revisionCount: 0,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    const res = await syncStudyTopicCompletionToGoogleSheets(attackerUserId, attackerTopic, true, 'COA');
    assert.equal(res.status, 'no_connection');
    assert.equal(res.synced, false);
    assert.equal(nativePushCalls.length, 0, 'Must NOT push anything to victim spreadsheet');
  });

  // ==========================================================================
  // SCENARIO 11: writeMode === 'apps_script' uses Apps Script path
  // ==========================================================================
  it('Scenario 11: Explicit writeMode === "apps_script" connection uses Apps Script bridge and NOT native OAuth', async () => {
    const userId = `usr_apps_script_${Date.now()}`;
    const connId = `conn_as_${Date.now()}`;
    const tabId = `${connId}__tab_0`;

    const conn = createMockConnection({
      id: connId,
      userId,
      spreadsheetId: 'FocusFlow Writeback Test',
      writeMode: 'apps_script',
    });
    const tab = createMockTab({ tabId, connectionId: connId, userId, sheetTitle: 'COA' });
    const row = createMockRow({
      rowUid: 'row_as_1',
      sheetRowNumber: 5,
      unit: 'TestUnit',
      topic: 'TestTopic',
      subtopic: 'TestSubtopic',
    });

    await sheetHubStore.saveConnection(userId, conn, { force: true });
    await sheetHubStore.saveTabSchema(userId, tab);
    await sheetHubStore.saveTabRowsChunked({ userId, connectionId: connId, tabId, rows: [row] });

    const topic: StudyTopic = {
      id: 'top_as_test',
      userId,
      subjectCode: 'Sub_COA',
      unit: 'TestUnit',
      topic: 'TestTopic',
      subtopic: 'TestSubtopic',
      priority: 'Medium',
      theory: true,
      practice: true,
      pyq: false,
      revisionCount: 0,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    const res = await syncStudyTopicCompletionToGoogleSheets(userId, topic, true, 'COA');
    assert.equal(res.status, 'synced');
    assert.equal(res.synced, true);

    // Apps Script was called
    assert.equal(appsScriptCalls.length, 1);
    assert.equal(appsScriptCalls[0].spreadsheetId, 'FocusFlow Writeback Test');
    assert.equal(appsScriptCalls[0].value, true);

    // Native OAuth was NEVER called
    assert.equal(nativePushCalls.length, 0, 'Native OAuth must NOT be called for apps_script connection');
  });

  // ==========================================================================
  // SCENARIO 12: writeMode !== 'apps_script' (default) NEVER uses Apps Script
  // ==========================================================================
  it('Scenario 12: Default production connection (writeMode undefined or native_oauth) NEVER falls back to Apps Script', async () => {
    const userId = `usr_native_default_${Date.now()}`;
    const connId = `conn_nat_${Date.now()}`;
    const tabId = `${connId}__tab_0`;

    const conn = createMockConnection({
      id: connId,
      userId,
      spreadsheetId: 'sheet_prod_standard',
      writeMode: undefined, // Default
    });
    const tab = createMockTab({ tabId, connectionId: connId, userId, sheetTitle: 'COA' });
    const row = createMockRow({
      rowUid: 'row_nat_1',
      sheetRowNumber: 11,
      unit: 'Storage',
      topic: 'RAID',
      subtopic: 'RAID 5 Parity',
    });

    await sheetHubStore.saveConnection(userId, conn, { force: true });
    await sheetHubStore.saveTabSchema(userId, tab);
    await sheetHubStore.saveTabRowsChunked({ userId, connectionId: connId, tabId, rows: [row] });

    // Token missing — should queue and NOT fall back to Apps Script!
    setSheetHubWriteAccessToken(null);

    const topic: StudyTopic = {
      id: 'top_raid',
      userId,
      subjectCode: 'Sub_COA',
      unit: 'Storage',
      topic: 'RAID',
      subtopic: 'RAID 5 Parity',
      priority: 'High',
      theory: true,
      practice: true,
      pyq: false,
      revisionCount: 0,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    const res = await syncStudyTopicCompletionToGoogleSheets(userId, topic, true, 'COA');
    assert.equal(res.status, 'queued');

    // Critical security assertion: Apps Script MUST NEVER be called
    assert.equal(appsScriptCalls.length, 0, 'Apps Script must NEVER be used as an automatic fallback');
    assert.equal(nativePushCalls.length, 0);
  });
});
