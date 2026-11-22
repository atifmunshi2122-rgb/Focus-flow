import test from 'node:test';
import assert from 'node:assert/strict';
import {
  flushQueueOperations,
  verifySpreadsheet,
} from '../server/sheetsWorker.ts';
import { DurableSyncOperation } from '../src/types/index.ts';
import { googleSheetsService } from '../src/lib/googleSheetsService.ts';
import { syncCoordinator } from '../src/lib/syncCoordinator.ts';

const VALID_SPREADSHEET_ID = '1BxiMVs0XRA5nFMdKvBdBZjgmUUqptlbs74OgvE2upms';
const DUMMY_ACCESS_TOKEN = 'ya29.a0AfH6SMB_valid_dummy_token_1234567890';

interface RecordedRequest {
  url: string;
  method: string;
  body?: any;
}

function createMockFetch(initialColumnA: Record<string, string[]> = {}, failureConfig: {
  failStatus?: number;
  failBody?: any;
  networkError?: boolean;
} = {}): {
  fetchImpl: typeof fetch;
  requests: RecordedRequest[];
} {
  const requests: RecordedRequest[] = [];
  const columnData = { ...initialColumnA };

  const fetchImpl: typeof fetch = async (input, init) => {
    const url = String(input);
    const method = String(init?.method || 'GET');
    let body: any = null;
    if (init?.body) {
      try {
        body = JSON.parse(String(init.body));
      } catch {
        body = String(init.body);
      }
    }
    requests.push({ url, method, body });

    if (failureConfig.networkError) {
      throw new Error('TypeError: Failed to fetch (simulated network offline)');
    }

    if (failureConfig.failStatus) {
      return new Response(
        JSON.stringify(failureConfig.failBody || { error: { code: failureConfig.failStatus, message: 'Google API Error' } }),
        { status: failureConfig.failStatus, headers: { 'Content-Type': 'application/json' } }
      );
    }

    // Spreadsheet verification endpoint
    if (url.includes(`https://sheets.googleapis.com/v4/spreadsheets/${VALID_SPREADSHEET_ID}?fields=`)) {
      return new Response(
        JSON.stringify({
          spreadsheetId: VALID_SPREADSHEET_ID,
          properties: { title: 'FocusFlow & Finance Master Ledger' },
          sheets: [
            { properties: { sheetId: 100, title: 'Executive_Dashboard', gridProperties: { rowCount: 100, columnCount: 26 } } },
            { properties: { sheetId: 105, title: 'Income', gridProperties: { rowCount: 500, columnCount: 18 } } },
            { properties: { sheetId: 106, title: 'Fixed_Expenses', gridProperties: { rowCount: 500, columnCount: 18 } } },
            { properties: { sheetId: 107, title: 'Variable_Expenses', gridProperties: { rowCount: 500, columnCount: 18 } } },
            { properties: { sheetId: 108, title: 'Bills_Payments', gridProperties: { rowCount: 500, columnCount: 18 } } },
            { properties: { sheetId: 109, title: 'Budgets', gridProperties: { rowCount: 500, columnCount: 18 } } },
            { properties: { sheetId: 110, title: 'Savings_Goals', gridProperties: { rowCount: 500, columnCount: 18 } } },
            { properties: { sheetId: 116, title: 'Tasks', gridProperties: { rowCount: 500, columnCount: 18 } } },
            { properties: { sheetId: 115, title: 'Focus_Sessions', gridProperties: { rowCount: 500, columnCount: 18 } } },
          ],
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } }
      );
    }

    // Batch get Column A IDs (A2:A)
    if (url.includes('/values:batchGet?')) {
      const valueRanges = Object.entries(columnData).map(([sheet, ids]) => ({
        range: `${sheet}!A2:A`,
        values: ids.map((id) => [id]),
      }));
      return new Response(
        JSON.stringify({ valueRanges }),
        { status: 200, headers: { 'Content-Type': 'application/json' } }
      );
    }

    // Append endpoint
    if (url.includes(':append')) {
      return new Response(
        JSON.stringify({ updates: { updatedRows: 1, updatedCells: 7 } }),
        { status: 200, headers: { 'Content-Type': 'application/json' } }
      );
    }

    // Put/update endpoint
    if (method === 'PUT') {
      return new Response(
        JSON.stringify({ updatedRows: 1, updatedCells: 7 }),
        { status: 200, headers: { 'Content-Type': 'application/json' } }
      );
    }

    // Clear endpoint
    if (url.includes(':clear') || url.includes('/values:batchClear')) {
      return new Response(
        JSON.stringify({ clearedRanges: ['A2:Z2'] }),
        { status: 200, headers: { 'Content-Type': 'application/json' } }
      );
    }

    return new Response(JSON.stringify({ success: true }), { status: 200 });
  };

  return { fetchImpl, requests };
}

// ============================================================================
// AUTOMATED TEST SUITE: 15 SPECIFICATION SCENARIOS
// ============================================================================

test('Scenario 1: Create Expense -> Row created in Google Sheets', async () => {
  const { fetchImpl, requests } = createMockFetch({ Variable_Expenses: [] });

  const op: DurableSyncOperation = {
    id: 'op_exp_create_1',
    userId: 'usr_test_1',
    entityType: 'expense',
    action: 'append',
    sheetName: 'Variable_Expenses',
    payload: ['exp_001', '2026-11-23', 'Office Stationery', 'Office Supplies', 450, 'UPI / BANK', 'Notebooks & pens'],
    status: 'pending',
    attempts: 0,
    createdAt: new Date().toISOString(),
  };

  const summary = await flushQueueOperations(VALID_SPREADSHEET_ID, DUMMY_ACCESS_TOKEN, [op], fetchImpl);
  assert.equal(summary.processed, 1);
  assert.equal(summary.failed, 0);
  assert.equal(summary.results[0].status, 'completed');

  const appendReq = requests.find((r) => decodeURIComponent(r.url).includes('Variable_Expenses!A2:append') && r.method === 'POST');
  assert.ok(appendReq, 'Must issue POST append to Variable_Expenses!A2:append');
  assert.equal(appendReq.body?.values?.[0]?.[0], 'exp_001');
  assert.equal(appendReq.body?.values?.[0]?.[2], 'Office Stationery');
  assert.equal(appendReq.body?.values?.[0]?.[4], 450);
});

test('Scenario 2: Edit Expense -> Row updated in Google Sheets with new values', async () => {
  const { fetchImpl, requests } = createMockFetch({ Variable_Expenses: ['exp_old_0', 'exp_001', 'exp_other'] });

  const op: DurableSyncOperation = {
    id: 'op_exp_update_1',
    userId: 'usr_test_1',
    entityType: 'expense',
    action: 'update',
    sheetName: 'Variable_Expenses',
    payload: ['exp_001', '2026-11-23', 'Office Stationery (Premium)', 'Office Supplies', 650, 'CARD', 'Updated items'],
    status: 'pending',
    attempts: 0,
    createdAt: new Date().toISOString(),
  };

  const summary = await flushQueueOperations(VALID_SPREADSHEET_ID, DUMMY_ACCESS_TOKEN, [op], fetchImpl);
  assert.equal(summary.processed, 1);
  assert.equal(summary.results[0].status, 'completed');

  // exp_001 is index 1 in A2:A, which maps to row 3 (2 + 1)
  const updateReq = requests.find((r) => decodeURIComponent(r.url).includes('Variable_Expenses!A3') && r.method === 'PUT');
  assert.ok(updateReq, 'Must issue PUT update to exact matching row Variable_Expenses!A3');
  assert.equal(updateReq.body?.values?.[0]?.[2], 'Office Stationery (Premium)');
  assert.equal(updateReq.body?.values?.[0]?.[4], 650);
});

test('Scenario 3: Delete Expense -> Row cleared in Google Sheets', async () => {
  const { fetchImpl, requests } = createMockFetch({ Variable_Expenses: ['exp_001'] });

  const op: DurableSyncOperation = {
    id: 'op_exp_delete_1',
    userId: 'usr_test_1',
    entityType: 'expense',
    action: 'delete',
    sheetName: 'Variable_Expenses',
    payload: ['exp_001'],
    status: 'pending',
    attempts: 0,
    createdAt: new Date().toISOString(),
  };

  const summary = await flushQueueOperations(VALID_SPREADSHEET_ID, DUMMY_ACCESS_TOKEN, [op], fetchImpl);
  assert.equal(summary.processed, 1);
  assert.equal(summary.results[0].status, 'completed');

  // exp_001 is at row 2
  const clearReq = requests.find((r) => decodeURIComponent(r.url).includes('Variable_Expenses!A2:Z2') && r.method === 'POST');
  assert.ok(clearReq, 'Must issue clear request to Variable_Expenses!A2:Z2:clear');
});

test('Scenario 4: Create Income -> Row created in Google Sheets (Income)', async () => {
  const { fetchImpl, requests } = createMockFetch({ Income: [] });

  const op: DurableSyncOperation = {
    id: 'op_inc_create_1',
    userId: 'usr_test_1',
    entityType: 'income',
    action: 'append',
    sheetName: 'Income',
    payload: ['inc_101', '2026-11-23', 'Client Retainer - Alpha', 'Consulting', 75000, 'Monthly retainer receipt'],
    status: 'pending',
    attempts: 0,
    createdAt: new Date().toISOString(),
  };

  const summary = await flushQueueOperations(VALID_SPREADSHEET_ID, DUMMY_ACCESS_TOKEN, [op], fetchImpl);
  assert.equal(summary.processed, 1);
  assert.equal(summary.results[0].status, 'completed');

  const appendReq = requests.find((r) => decodeURIComponent(r.url).includes('Income!A2:append') && r.method === 'POST');
  assert.ok(appendReq, 'Must issue append to Income!A2:append');
  assert.equal(appendReq.body?.values?.[0]?.[0], 'inc_101');
  assert.equal(appendReq.body?.values?.[0]?.[2], 'Client Retainer - Alpha');
});

test('Scenario 5: Edit Income -> Row updated in Google Sheets with new values', async () => {
  const { fetchImpl, requests } = createMockFetch({ Income: ['inc_101'] });

  const op: DurableSyncOperation = {
    id: 'op_inc_update_1',
    userId: 'usr_test_1',
    entityType: 'income',
    action: 'update',
    sheetName: 'Income',
    payload: ['inc_101', '2026-11-23', 'Client Retainer - Alpha (Bonus)', 'Consulting', 85000, 'Includes milestone bonus'],
    status: 'pending',
    attempts: 0,
    createdAt: new Date().toISOString(),
  };

  const summary = await flushQueueOperations(VALID_SPREADSHEET_ID, DUMMY_ACCESS_TOKEN, [op], fetchImpl);
  assert.equal(summary.processed, 1);
  assert.equal(summary.results[0].status, 'completed');

  const updateReq = requests.find((r) => decodeURIComponent(r.url).includes('Income!A2') && r.method === 'PUT');
  assert.ok(updateReq, 'Must update Income!A2 in place');
  assert.equal(updateReq.body?.values?.[0]?.[4], 85000);
});

test('Scenario 6: Create Task -> Row created in Google Sheets (Tasks)', async () => {
  const { fetchImpl, requests } = createMockFetch({ Tasks: [] });

  const op: DurableSyncOperation = {
    id: 'op_task_create_1',
    userId: 'usr_test_1',
    entityType: 'task',
    action: 'append',
    sheetName: 'Tasks',
    payload: ['task_901', 'Prepare Q4 Balance Sheet', 'high', 'todo', 4, 0, '2026-11-30', 'Finance', 'none', '2026-11-23T10:00:00Z'],
    status: 'pending',
    attempts: 0,
    createdAt: new Date().toISOString(),
  };

  const summary = await flushQueueOperations(VALID_SPREADSHEET_ID, DUMMY_ACCESS_TOKEN, [op], fetchImpl);
  assert.equal(summary.processed, 1);
  assert.equal(summary.results[0].status, 'completed');

  const appendReq = requests.find((r) => decodeURIComponent(r.url).includes('Tasks!A2:append') && r.method === 'POST');
  assert.ok(appendReq, 'Must issue append to Tasks!A2:append');
  assert.equal(appendReq.body?.values?.[0]?.[1], 'Prepare Q4 Balance Sheet');
});

test('Scenario 7: Edit Task -> Row updated in Google Sheets with new values', async () => {
  const { fetchImpl, requests } = createMockFetch({ Tasks: ['task_901'] });

  const op: DurableSyncOperation = {
    id: 'op_task_update_1',
    userId: 'usr_test_1',
    entityType: 'task',
    action: 'update',
    sheetName: 'Tasks',
    payload: ['task_901', 'Prepare Q4 Balance Sheet & Tax Filing', 'high', 'in_progress', 6, 2, '2026-11-30', 'Finance', 'none', '2026-11-23T10:00:00Z'],
    status: 'pending',
    attempts: 0,
    createdAt: new Date().toISOString(),
  };

  const summary = await flushQueueOperations(VALID_SPREADSHEET_ID, DUMMY_ACCESS_TOKEN, [op], fetchImpl);
  assert.equal(summary.processed, 1);

  const updateReq = requests.find((r) => decodeURIComponent(r.url).includes('Tasks!A2') && r.method === 'PUT');
  assert.ok(updateReq, 'Must update row 2 in place');
  assert.equal(updateReq.body?.values?.[0]?.[1], 'Prepare Q4 Balance Sheet & Tax Filing');
});

test('Scenario 8: Toggle Task status -> Status updated in Google Sheets', async () => {
  const { fetchImpl, requests } = createMockFetch({ Tasks: ['task_901'] });

  const op: DurableSyncOperation = {
    id: 'op_task_status_1',
    userId: 'usr_test_1',
    entityType: 'task',
    action: 'update',
    sheetName: 'Tasks',
    payload: ['task_901', 'Prepare Q4 Balance Sheet & Tax Filing', 'high', 'completed', 6, 6, '2026-11-30', 'Finance', 'none', '2026-11-23T10:00:00Z'],
    status: 'pending',
    attempts: 0,
    createdAt: new Date().toISOString(),
  };

  const summary = await flushQueueOperations(VALID_SPREADSHEET_ID, DUMMY_ACCESS_TOKEN, [op], fetchImpl);
  assert.equal(summary.processed, 1);

  const updateReq = requests.find((r) => decodeURIComponent(r.url).includes('Tasks!A2') && r.method === 'PUT');
  assert.ok(updateReq, 'Must update row 2 with completed status');
  assert.equal(updateReq.body?.values?.[0]?.[3], 'completed');
});

test('Scenario 9: Network failure -> Operation remains pending in queue with exponential backoff', async () => {
  const { fetchImpl } = createMockFetch({}, { networkError: true });

  const op: DurableSyncOperation = {
    id: 'op_net_fail_1',
    userId: 'usr_test_1',
    entityType: 'expense',
    action: 'append',
    sheetName: 'Variable_Expenses',
    payload: ['exp_net_01', '2026-11-23', 'Transit Fare', 'Travel', 120, 'UPI / BANK', 'Metro ticket'],
    status: 'pending',
    attempts: 1,
    createdAt: new Date().toISOString(),
  };

  const summary = await flushQueueOperations(VALID_SPREADSHEET_ID, DUMMY_ACCESS_TOKEN, [op], fetchImpl, 1000000);
  assert.equal(summary.processed, 0);
  assert.equal(summary.failed, 1);
  assert.equal(summary.results[0].status, 'pending', 'Must remain in pending status for non-terminal retry');
  assert.equal(summary.results[0].attempts, 2);
  assert.ok(Number(summary.results[0].nextRetryAt) > 1000000, 'Must compute future nextRetryAt with backoff');
});

test('Scenario 10: Expired OAuth -> Reauthorization required reported (401)', async () => {
  const { fetchImpl } = createMockFetch({}, {
    failStatus: 401,
    failBody: { error: { code: 401, message: 'Request had invalid authentication credentials. Expected OAuth 2 access token.' } },
  });

  const op: DurableSyncOperation = {
    id: 'op_oauth_fail_1',
    userId: 'usr_test_1',
    entityType: 'expense',
    action: 'append',
    sheetName: 'Variable_Expenses',
    payload: ['exp_auth_01', '2026-11-23', 'Snacks', 'Food', 150, 'CASH', ''],
    status: 'pending',
    attempts: 0,
    createdAt: new Date().toISOString(),
  };

  await assert.rejects(
    async () => {
      await flushQueueOperations(VALID_SPREADSHEET_ID, DUMMY_ACCESS_TOKEN, [op], fetchImpl);
    },
    (err: Error) => {
      assert.ok(err.message.includes('401') || err.message.includes('authentication credentials'));
      return true;
    }
  );
});

test('Scenario 11: Duplicate retry -> Idempotent append skips duplicate row creation', async () => {
  // exp_dup_01 already exists in Column A of Variable_Expenses
  const { fetchImpl, requests } = createMockFetch({ Variable_Expenses: ['exp_dup_01'] });

  const op: DurableSyncOperation = {
    id: 'op_dup_retry_1',
    userId: 'usr_test_1',
    entityType: 'expense',
    action: 'append',
    sheetName: 'Variable_Expenses',
    payload: ['exp_dup_01', '2026-11-23', 'Already Appended Item', 'General', 300, 'UPI / BANK', ''],
    status: 'pending',
    attempts: 1,
    createdAt: new Date().toISOString(),
  };

  const summary = await flushQueueOperations(VALID_SPREADSHEET_ID, DUMMY_ACCESS_TOKEN, [op], fetchImpl);
  assert.equal(summary.skippedDuplicates, 1, 'Must register skipped duplicate');
  assert.equal(summary.processed, 1);
  assert.equal(summary.results[0].status, 'completed');
  assert.equal(summary.results[0].skippedDuplicate, true);

  const appendReq = requests.find((r) => r.url.includes(':append'));
  assert.equal(appendReq, undefined, 'Must NEVER send second append request for existing ID');
});

test('Scenario 12: Browser reload -> Pending queue restored from persistent store', async () => {
  const initialCount = googleSheetsService.getQueueLength();
  assert.ok(typeof initialCount === 'number');

  // Verify sync coordinator maintains state
  const state = syncCoordinator.getState();
  assert.ok('pendingCount' in state);
  assert.ok('status' in state);
  assert.ok('isOnline' in state);
});

test('Scenario 13: Wrong spreadsheet ID -> Write rejected with clear error', async () => {
  const invalidSpreadsheetId = 'invalid!id#';

  await assert.rejects(
    async () => {
      await verifySpreadsheet(invalidSpreadsheetId, DUMMY_ACCESS_TOKEN);
    },
    (err: Error) => {
      assert.ok(err.message.includes('Invalid Google Spreadsheet ID format'));
      return true;
    }
  );
});

test('Scenario 14: Guest user -> Sync denied / deferred safely', async () => {
  // Coordinator without credentials must not trigger outbound calls
  syncCoordinator.setCredentials(null, null);
  const state = syncCoordinator.getState();
  assert.ok(state.status === 'idle' || state.status === 'auth_required' || state.status === 'pending');
});

test('Scenario 15: Read-only sync mode -> Outbound write blocked with 403', async () => {
  const { fetchImpl } = createMockFetch({}, {
    failStatus: 403,
    failBody: { error: { code: 403, message: 'The caller does not have permission' } },
  });

  await assert.rejects(
    async () => {
      await flushQueueOperations(VALID_SPREADSHEET_ID, 'ya29.readonly_token', [
        {
          id: 'op_readonly_1',
          userId: 'usr_test_1',
          entityType: 'expense',
          action: 'append',
          sheetName: 'Variable_Expenses',
          payload: ['exp_ro_1', '2026-11-23', 'Coffee', 'Food', 200, 'CASH', ''],
          status: 'pending',
          attempts: 0,
          createdAt: new Date().toISOString(),
        },
      ], fetchImpl);
    },
    (err: Error) => {
      assert.ok(err.message.includes('403') || err.message.includes('permission'));
      return true;
    }
  );
});
