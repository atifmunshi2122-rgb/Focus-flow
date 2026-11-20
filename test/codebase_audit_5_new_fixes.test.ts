import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {
  syncStudyTopicCompletionToGoogleSheets,
  flushPendingWritebacks,
} from '../src/lib/sheetHub/sheetStudySyncService.ts';
import { setSheetHubWriteAccessToken } from '../src/lib/firebase.ts';
import { sheetHubStore } from '../src/lib/sheetHub/sheetHubStore.ts';
import { dispatchAppsScriptWriteback, AppsScriptBridgeError } from '../server/appsScriptBridgeWorker.ts';
import { DatabaseService } from '../server/db.ts';
import os from 'node:os';
import type { SheetColumnMapping, SheetConnection, SheetSyncedRow, SheetTabSchema } from '../src/types/sheetHub.ts';
import type { StudyTopic } from '../src/types/study.ts';

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

(globalThis as any).window = {
  localStorage: mockLocalStorage,
};
(globalThis as any).localStorage = mockLocalStorage;

function createMockConnection(params: {
  id: string;
  userId: string;
  spreadsheetId: string;
  status?: 'active' | 'auth_required';
  writeAuthStatus?: 'authorized' | 'expired';
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
    writeMode: 'native_oauth',
    writeAuthStatus: params.writeAuthStatus || 'authorized',
    writeAuthorizedAt: new Date().toISOString(),
    pollIntervalSec: null,
    syncOnOpen: true,
    status: params.status || 'active',
    lastSyncedAt: new Date().toISOString(),
    lastSuccessfulPullAt: new Date().toISOString(),
    lastSuccessfulPushAt: null,
    lastError: null,
    pendingChangesCount: 0,
    conflictCount: 0,
    tabOrder: [`${params.id}__tab_0`],
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
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
}

test('Bug 1: syncStudyTopicCompletionToGoogleSheets keeps status pending_push and original baseValues on queued/error', async () => {
  const userId = 'usr_test_bug1';
  const connId = 'conn_test_bug1';
  const tabId = `${connId}__tab_0`;

  const connection = createMockConnection({
    id: connId,
    userId,
    spreadsheetId: 'real_test_spreadsheet_123',
  });
  await sheetHubStore.saveConnection(userId, connection, { force: true });

  const tab = createMockTab({
    tabId,
    connectionId: connId,
    userId,
    sheetTitle: 'COA',
  });
  await sheetHubStore.saveTabSchema(userId, tab);

  const row: SheetSyncedRow = {
    rowUid: 'row_101_1',
    lastKnownSheetRow: 2,
    values: { unit: 'Unit 1', topic: 'Logic', subtopic: 'Gates', done: false },
    baseValues: { unit: 'Unit 1', topic: 'Logic', subtopic: 'Gates', done: false },
    rowHash: 'hash_row1',
    version: 1,
    lastSyncOrigin: 'sheet',
    dirtyFields: [],
    localUpdatedAt: null,
    sheetSyncedAt: new Date().toISOString(),
    status: 'synced',
  };
  await sheetHubStore.saveTabRowsChunked({
    userId,
    connectionId: connId,
    tabId,
    rows: [row],
  });

  const topic: StudyTopic = {
    id: 'top_bug1',
    userId,
    subjectCode: 'Sub_COA',
    unit: 'Unit 1',
    topic: 'Logic',
    subtopic: 'Gates',
    priority: 'High',
    theory: true,
    practice: false,
    pyq: false,
    revisionCount: 0,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };

  // Trigger sync when no OAuth token is available in memory
  // Token is missing, so it returns status: 'queued'
  const result = await syncStudyTopicCompletionToGoogleSheets(userId, topic, true, 'COA');
  assert.equal(result.status, 'queued');

  // Verify that the row in Sheet Hub was NOT marked as synced!
  const rowsAfter = await sheetHubStore.loadTabRows(userId, tabId, connId);
  assert.equal(rowsAfter[0].values.done, true, 'Local optimistic value is updated');
  assert.equal(rowsAfter[0].baseValues.done, false, 'baseValues must NOT be updated until write succeeds');
  assert.equal(rowsAfter[0].status, 'pending_push', 'Row must be in pending_push state, NOT synced');
  assert.ok(rowsAfter[0].dirtyFields.includes('done'), 'dirtyFields must include done');
});

test('Bug 2: Code.gs returns 404 SPREADSHEET_NOT_FOUND on openById failure rather than falling back to active', () => {
  const codeGsPath = path.resolve('scripts/appsScript/Code.gs');
  const content = fs.readFileSync(codeGsPath, 'utf8');

  // Must check that openErr returns 404 SPREADSHEET_NOT_FOUND
  assert.ok(content.includes('SPREADSHEET_NOT_FOUND'));
  assert.ok(!content.includes('catch (openErr) {\n        ss = SpreadsheetApp.getActiveSpreadsheet();'));
});

test('Bug 3: flushPendingWritebacks clears auth_required and restores active / authorized', async () => {
  const userId = 'usr_test_bug3';
  const connId = 'conn_test_bug3';

  const connection = createMockConnection({
    id: connId,
    userId,
    spreadsheetId: '1BxiMVs0XRA5nFMdKvBdBZjgmUUqptlbs74OgvE2upms',
    status: 'auth_required',
    writeAuthStatus: 'expired',
  });
  connection.lastError = 'Google Sheets authorization expired. Please reconnect.';
  await sheetHubStore.saveConnection(userId, connection, { force: true });

  // Directly set pending queue in localStorage
  const queueEntry = {
    id: 'pend_1',
    userId,
    connectionId: connId,
    spreadsheetId: connection.spreadsheetId,
    sheetTitle: 'COA',
    rowNumber: 2,
    colLetter: 'D',
    cellRef: 'COA!D2',
    value: true,
    topicUnit: 'Unit 1',
    topicTopic: 'Logic',
    topicSubtopic: 'Gates',
    queuedAt: new Date().toISOString(),
    attempts: 0,
  };
  localStorage.setItem(`ff_pending_topic_writeback_${userId}`, JSON.stringify([queueEntry]));

  // Set write token via official setter
  setSheetHubWriteAccessToken('ya29.mock_token');

  // Mock fetch for sheetHubPushCells
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (url, init) => {
    if (typeof url === 'string' && url.includes('api/sheet-hub/push-cells')) {
      return new Response(JSON.stringify({ success: true, updatedCells: 1 }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    }
    return originalFetch(url, init);
  };

  try {
    const flushed = await flushPendingWritebacks(userId);
    assert.equal(flushed, 1);

    // Verify connection status was updated back to active & authorized!
    const connAfter = await sheetHubStore.getConnection(userId, connId);
    assert.ok(connAfter);
    assert.equal(connAfter.status, 'active');
    assert.equal(connAfter.writeAuthStatus, 'authorized');
    assert.equal(connAfter.lastError, null);
  } finally {
    globalThis.fetch = originalFetch;
    setSheetHubWriteAccessToken(null);
  }
});

test('Bug 4: dispatchAppsScriptWriteback preserves 4xx error codes rather than collapsing to 500', async () => {
  // Test 1: Apps Script returns 200 OK with code INVALID_SIGNATURE (Apps Script limitation)
  const mockFetch1: typeof fetch = async () => {
    return new Response(
      JSON.stringify({
        success: false,
        error: 'Invalid signature',
        code: 'INVALID_SIGNATURE',
      }),
      { status: 200, headers: { 'Content-Type': 'application/json' } }
    );
  };

  await assert.rejects(
    () =>
      dispatchAppsScriptWriteback(
        { spreadsheetId: 'test_sheet_123', sheetTitle: 'COA', rowNumber: 2, colLetter: 'D', value: true },
        { webAppUrl: 'https://script.google.com/test', secret: 'secret', fetchImpl: mockFetch1 }
      ),
    (err: unknown) =>
      err instanceof AppsScriptBridgeError &&
      err.status === 401 &&
      err.code === 'INVALID_SIGNATURE'
  );

  // Test 2: Apps Script returns 200 OK with code DUPLICATE_ROW_IDENTITY
  const mockFetch2: typeof fetch = async () => {
    return new Response(
      JSON.stringify({
        success: false,
        error: 'Multiple rows match',
        code: 'DUPLICATE_ROW_IDENTITY',
      }),
      { status: 200, headers: { 'Content-Type': 'application/json' } }
    );
  };

  await assert.rejects(
    () =>
      dispatchAppsScriptWriteback(
        { spreadsheetId: 'test_sheet_123', sheetTitle: 'COA', rowNumber: 2, colLetter: 'D', value: true },
        { webAppUrl: 'https://script.google.com/test', secret: 'secret', fetchImpl: mockFetch2 }
      ),
    (err: unknown) =>
      err instanceof AppsScriptBridgeError &&
      err.status === 409 &&
      err.code === 'DUPLICATE_ROW_IDENTITY'
  );

  // Test 3: SPREADSHEET_NOT_FOUND returns 404
  const mockFetch3: typeof fetch = async () => {
    return new Response(
      JSON.stringify({
        success: false,
        error: 'Spreadsheet not found',
        code: 'SPREADSHEET_NOT_FOUND',
      }),
      { status: 200, headers: { 'Content-Type': 'application/json' } }
    );
  };

  await assert.rejects(
    () =>
      dispatchAppsScriptWriteback(
        { spreadsheetId: 'test_sheet_123', sheetTitle: 'COA', rowNumber: 2, colLetter: 'D', value: true },
        { webAppUrl: 'https://script.google.com/test', secret: 'secret', fetchImpl: mockFetch3 }
      ),
    (err: unknown) =>
      err instanceof AppsScriptBridgeError &&
      err.status === 404 &&
      err.code === 'SPREADSHEET_NOT_FOUND'
  );
});

test('Bug 5: rejectVaultInvitation rejects when user.email is missing on invitation with invitedEmail', async () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ff_test_vault_'));
  const db = new DatabaseService(tmpDir);

  const inviteCode = 'CODE123';
  db.getRaw().vaultInvitations = [
    {
      id: 'inv_1',
      vaultId: 'v_1',
      vaultName: 'Our Vault',
      invitedByUid: 'usr_1',
      invitedByName: 'Partner 1',
      inviteCode,
      invitedEmail: 'partner@example.com',
      status: 'pending',
      expiresAt: new Date(Date.now() + 86400000).toISOString(),
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    },
  ];

  // User without email attempting to reject
  assert.throws(
    () => db.rejectVaultInvitation(inviteCode, { id: 'usr_stranger' }),
    /This invitation was sent to a different email address/
  );

  // User with mismatched email attempting to reject
  assert.throws(
    () => db.rejectVaultInvitation(inviteCode, { id: 'usr_stranger', email: 'wrong@example.com' }),
    /This invitation was sent to a different email address/
  );

  // User with matching email succeeds
  const rejected = db.rejectVaultInvitation(inviteCode, { id: 'usr_partner', email: 'partner@example.com' });
  assert.equal(rejected.status, 'rejected');

  fs.rmSync(tmpDir, { recursive: true, force: true });
});
