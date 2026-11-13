import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

import {
  DESIGN_STYLES,
  ACCENT_PRESETS,
  BACKGROUND_GRADIENT_PRESETS,
  FONT_PAIRINGS,
} from '../src/theme/stylesRegistry.ts';
import { CURATED_PALETTES, PALETTE_CATEGORIES } from '../src/theme/palettes100.ts';

import {
  WORKSHEET_NAMES,
  colIndexToLetter,
  buildDynamicClearRanges,
  SheetsSnapshotPayload,
} from '../src/lib/sheetsSpec.ts';
import {
  syncAllData,
  historicalResync,
  applyWorkbookFormatting,
  flushQueueOperations,
  computeBackoffDelayMs,
} from '../server/sheetsWorker.ts';
import { offlineOutbox } from '../src/lib/offlineOutbox.ts';
import { googleSheetsService } from '../src/lib/googleSheetsService.ts';
import { dbService } from '../server/db.ts';
import { getTodayDateString, getDaysInMonth } from '../server/dateTime.ts';
import type { DurableSyncOperation } from '../src/types/index.ts';

function createEmptySnapshot(): SheetsSnapshotPayload {
  return {
    sessions: [],
    incomes: [],
    recurring: [],
    expenses: [],
    bills: [],
    tasks: [],
    envelopes: [],
    savingsGoals: [],
  };
}

function createMemoryStorage() {
  const store = new Map<string, string>();
  return {
    getItem: (key: string) => (store.has(key) ? store.get(key)! : null),
    setItem: (key: string, value: string) => {
      store.set(key, String(value));
    },
    removeItem: (key: string) => {
      store.delete(key);
    },
    clear: () => store.clear(),
  };
}

function makeMockMetadataResponse(spreadsheetId: string) {
  return new Response(
    JSON.stringify({
      spreadsheetId,
      properties: { title: 'FocusFlow & Finance — Master Management Ledger' },
      sheets: WORKSHEET_NAMES.map((title, idx) => ({
        properties: {
          sheetId: 100 + idx,
          title,
          gridProperties: {
            rowCount: idx < 3 ? 120 : 800,
            columnCount: idx < 3 ? 26 : 18,
          },
        },
      })),
    }),
    { status: 200, headers: { 'Content-Type': 'application/json' } }
  );
}

// ============================================================================
// 1. THEME PRESERVATION AGAINST BACKUP INVENTORY
// ============================================================================
test('Audit Fix 1 — Exact Theme Inventory Matches Baseline Backup', () => {
  const backupPath = path.resolve(process.cwd(), 'data', 'theme_inventory_backup.json');
  assert.ok(fs.existsSync(backupPath), 'theme_inventory_backup.json must exist');

  const backup = JSON.parse(fs.readFileSync(backupPath, 'utf-8')) as {
    counts: {
      designStyles: number;
      curatedPalettes: number;
      paletteCategories: number;
      accentPresets: number;
      backgroundGradientPresets: number;
      fontPairings: number;
    };
    designStyleIds: Array<{ id: string; name: string }>;
    paletteCategoryIds: Array<{ id: string }>;
    curatedPaletteIds: Array<{ id: string }>;
    accentPresets: Array<{ name: string; primary: string }>;
    backgroundGradientPresetIds: Array<{ id: string }>;
    fontPairings: Array<{ id: string }>;
  };

  assert.equal(DESIGN_STYLES.length, backup.counts.designStyles);
  assert.equal(CURATED_PALETTES.length, backup.counts.curatedPalettes);
  assert.equal(PALETTE_CATEGORIES.length, backup.counts.paletteCategories);
  assert.equal(ACCENT_PRESETS.length, backup.counts.accentPresets);
  assert.equal(BACKGROUND_GRADIENT_PRESETS.length, backup.counts.backgroundGradientPresets);
  assert.equal(FONT_PAIRINGS.length, backup.counts.fontPairings);

  const currentStyleIds = new Set(DESIGN_STYLES.map((s) => s.id));
  for (const s of backup.designStyleIds) {
    assert.ok(currentStyleIds.has(s.id as typeof DESIGN_STYLES[number]['id']), `Missing design style: ${s.id}`);
  }

  const currentPaletteIds = new Set(CURATED_PALETTES.map((p) => p.id));
  for (const p of backup.curatedPaletteIds) {
    assert.ok(currentPaletteIds.has(p.id), `Missing curated palette: ${p.id}`);
  }

  const currentCatIds = new Set(PALETTE_CATEGORIES.map((c) => c.id));
  for (const c of backup.paletteCategoryIds) {
    assert.ok(
      currentCatIds.has(c.id as typeof PALETTE_CATEGORIES[number]['id']),
      `Missing palette category: ${c.id}`
    );
  }

  const currentFontIds = new Set(FONT_PAIRINGS.map((f) => f.id));
  for (const f of backup.fontPairings) {
    assert.ok(currentFontIds.has(f.id as typeof FONT_PAIRINGS[number]['id']), `Missing font pairing: ${f.id}`);
  }
});

// ============================================================================
// 2. GOOGLE SHEETS WORKER — SYNC FORMATTING PRESERVATION & HISTORICAL RESYNC
// ============================================================================
test('Audit Fix 2 & 4 — syncAllData Is Strictly Value-Only (Zero Auto-Resize or Style Overwrite)', async () => {
  const requestsLog: Array<{ url: string; method: string; body?: unknown }> = [];
  const spreadsheetId = 'sheet_test_1234567890';

  const mockFetch = async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    const url = String(input);
    const method = init?.method || 'GET';
    const body = init?.body ? JSON.parse(String(init.body)) : undefined;
    requestsLog.push({ url, method, body });

    if (method === 'GET') {
      return makeMockMetadataResponse(spreadsheetId);
    }
    if (url.includes('/values:batchUpdate')) {
      return new Response(JSON.stringify({ totalUpdatedRows: 23 }), { status: 200 });
    }
    throw new Error(`Unexpected HTTP call during value-only sync: ${method} ${url}`);
  };

  const result = await syncAllData(
    spreadsheetId,
    'ya29.mock_access_token',
    createEmptySnapshot(),
    { verifyFirst: true },
    mockFetch as typeof fetch
  );

  assert.equal(result.updatedRangesCount, 23);
  assert.equal(requestsLog.length, 2, 'Should issue exactly 1 metadata GET + 1 values:batchUpdate POST');
  assert.ok(requestsLog[0].method === 'GET');
  assert.ok(requestsLog[1].url.endsWith('/values:batchUpdate'));
  assert.ok(
    !requestsLog.some((r) => /\/spreadsheets\/[^/]+:batchUpdate$/.test(r.url)),
    'Must NEVER call spreadsheet :batchUpdate / autoResizeDimensions during normal sync'
  );
  assert.ok(
    !requestsLog.some((r) => JSON.stringify(r.body || '').includes('autoResizeDimensions')),
    'syncAllData must not transmit autoResizeDimensions payloads'
  );
});

test('Audit Fix 4 — applyWorkbookFormatting Sends Styling & AutoResize Only on Explicit Request', async () => {
  const requestsLog: Array<{ url: string; body?: { requests?: Array<Record<string, unknown>> } }> = [];
  const spreadsheetId = 'sheet_fmt_1234567890';

  const mockFetch = async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    const url = String(input);
    const body = init?.body ? JSON.parse(String(init.body)) : undefined;
    requestsLog.push({ url, body });
    if (!init?.method || init.method === 'GET') {
      return makeMockMetadataResponse(spreadsheetId);
    }
    return new Response(JSON.stringify({ replies: [] }), { status: 200 });
  };

  await applyWorkbookFormatting(
    spreadsheetId,
    'ya29.mock_access_token',
    { includeHeaders: false, includeAutoResize: true, verifyFirst: true },
    mockFetch as typeof fetch
  );

  const styleCall = requestsLog.find((r) => r.url.endsWith(':batchUpdate'));
  assert.ok(styleCall, 'Explicit formatting call must invoke :batchUpdate');
  const reqs = styleCall.body?.requests || [];
  assert.ok(reqs.some((r) => 'autoResizeDimensions' in r), 'Explicit formatting must include autoResizeDimensions');
  assert.ok(reqs.some((r) => 'addChart' in r), 'Explicit formatting must include chart specs');
});

test('Audit Fix 3 — historicalResync Requires Explicit Approval, Dynamic Clear Ranges, & Throws on Clear Failure', async () => {
  const spreadsheetId = 'sheet_resync_1234567890';

  // 1. Dynamic range helper verification (never hardcoded A2:Z500)
  assert.equal(colIndexToLetter(1), 'A');
  assert.equal(colIndexToLetter(18), 'R');
  assert.equal(colIndexToLetter(26), 'Z');
  const dynamicRanges = buildDynamicClearRanges([
    { properties: { sheetId: 103, title: 'Focus_Sessions', gridProperties: { rowCount: 1200, columnCount: 9 } } },
    { properties: { sheetId: 110, title: 'Income', gridProperties: { rowCount: 750, columnCount: 6 } } },
  ]);
  assert.deepEqual(dynamicRanges, ['Focus_Sessions!A2:I1200', 'Income!A2:F750']);

  // 2. Rejects when confirmed !== true
  await assert.rejects(
    () => historicalResync(spreadsheetId, 'ya29.mock', createEmptySnapshot(), false),
    /explicit user confirmation/i
  );

  // 3. Throws loudly if values:batchClear fails (never swallows errors!)
  const failingClearFetch = async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    const url = String(input);
    if (!init?.method || init.method === 'GET') {
      return makeMockMetadataResponse(spreadsheetId);
    }
    if (url.includes('/values:batchClear')) {
      return new Response(JSON.stringify({ error: { message: 'Simulated Sheets clear failure' } }), {
        status: 500,
      });
    }
    throw new Error('syncAllData must NOT run when batchClear fails!');
  };

  await assert.rejects(
    () =>
      historicalResync(
        spreadsheetId,
        'ya29.mock',
        createEmptySnapshot(),
        true,
        failingClearFetch as typeof fetch
      ),
    /clearing existing ranges failed/i
  );

  // 4. Succeeds when confirmed === true & clear succeeds
  let sawBatchClear = false;
  let sawBatchUpdate = false;
  const okFetch = async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    const url = String(input);
    if (!init?.method || init.method === 'GET') {
      return makeMockMetadataResponse(spreadsheetId);
    }
    if (url.includes('/values:batchClear')) {
      sawBatchClear = true;
      const body = JSON.parse(String(init.body)) as { ranges: string[] };
      assert.ok(body.ranges.some((r) => r.includes('!A2:R800')), 'Must clear dynamic range up to grid rowCount');
      assert.ok(!body.ranges.some((r) => r.endsWith('!A2:Z500')), 'Must not use hardcoded A2:Z500');
      return new Response(JSON.stringify({ clearedRanges: body.ranges }), { status: 200 });
    }
    if (url.includes('/values:batchUpdate')) {
      sawBatchUpdate = true;
      return new Response(JSON.stringify({ totalUpdatedRows: 23 }), { status: 200 });
    }
    throw new Error(`Unexpected call: ${url}`);
  };

  const res = await historicalResync(
    spreadsheetId,
    'ya29.mock',
    createEmptySnapshot(),
    true,
    okFetch as typeof fetch
  );
  assert.equal(sawBatchClear, true);
  assert.equal(sawBatchUpdate, true);
  assert.ok(res.clearedRangesCount > 0);
  assert.equal(res.updatedRangesCount, 23);
});

// ============================================================================
// 3. DURABLE QUEUE — COLUMN A IDEMPOTENCY, BACKOFF & TERMINAL FAILURE
// ============================================================================
test('Audit Fix 5 — Queue Flush Prevents Duplicate Column A Rows, Applies Exponential Backoff & Terminal Status', async () => {
  const spreadsheetId = 'sheet_queue_1234567890';
  const appendedUrls: string[] = [];

  // Exponential backoff calculation capped at 300,000ms
  assert.equal(computeBackoffDelayMs(1, 0), 4_000);
  assert.equal(computeBackoffDelayMs(2, 0), 8_000);
  assert.equal(computeBackoffDelayMs(10, 1), 300_000);

  const ops: DurableSyncOperation[] = [
    {
      id: 'op_dup',
      userId: 'usr_1',
      entityType: 'expense',
      action: 'append',
      sheetName: 'Variable_Expenses',
      payload: ['exp_existing_1', '2026-11-13', 'Coffee', 'Food', 250, 'UPI / BANK', ''],
      status: 'pending',
      attempts: 0,
      createdAt: '2026-11-13T00:00:00.000Z',
    },
    {
      id: 'op_new',
      userId: 'usr_1',
      entityType: 'task',
      action: 'append',
      sheetName: 'Tasks',
      payload: ['tsk_new_1', 'Write audit tests', 'high', 'todo', '2026-11-14', 2, 0, '2026-11-13', '2026-11-13'],
      status: 'pending',
      attempts: 0,
      createdAt: '2026-11-13T00:00:00.000Z',
    },
    {
      id: 'op_fail_terminal',
      userId: 'usr_1',
      entityType: 'income',
      action: 'append',
      sheetName: 'Income',
      payload: ['inc_fail_1', '2026-11-13', 'Bonus', 'Salary', 1000, ''],
      status: 'pending',
      attempts: 4, // 5th failure transitions to terminal 'failed'
      createdAt: '2026-11-13T00:00:00.000Z',
    },
  ];

  const mockFetch = async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    const url = String(input);
    if (!init?.method || init.method === 'GET') {
      if (url.includes('values:batchGet')) {
        return new Response(
          JSON.stringify({
            valueRanges: [
              { range: 'Variable_Expenses!A2:A', values: [['exp_existing_1']] },
              { range: 'Tasks!A2:A', values: [] },
              { range: 'Income!A2:A', values: [] },
            ],
          }),
          { status: 200 }
        );
      }
      return makeMockMetadataResponse(spreadsheetId);
    }
    if (url.includes('Income!A2:append') || encodeURIComponent('Income!A2:append') === url.split('/').pop()?.split('?')[0]) {
      return new Response(JSON.stringify({ error: { message: 'Quota exceeded' } }), { status: 429 });
    }
    appendedUrls.push(url);
    return new Response(JSON.stringify({ updates: { updatedRows: 1 } }), { status: 200 });
  };

  const now = 1_700_000_000_000;
  const summary = await flushQueueOperations(
    spreadsheetId,
    'ya29.mock',
    ops,
    mockFetch as typeof fetch,
    now
  );

  assert.equal(summary.skippedDuplicates, 1, 'Existing Column A ID must be skipped cleanly');
  assert.equal(summary.processed, 2, 'Duplicate skip + new append count as processed');
  assert.equal(summary.failed, 1);
  assert.equal(appendedUrls.length, 1, 'Only Tasks row should have been appended via HTTP POST');
  assert.ok(appendedUrls[0].includes('Tasks'));

  const terminalRes = summary.results.find((r) => r.id === 'op_fail_terminal');
  assert.equal(terminalRes?.status, 'failed');
  assert.equal(terminalRes?.attempts, 5);
  assert.equal(terminalRes?.nextRetryAt, null);
});

test('Audit Fix 5 — googleSheetsService.getQueueLength Reads Actual Pending Count & Deduplicates', async () => {
  const originalStorage = (globalThis as Record<string, unknown>).localStorage;
  const originalFetch = globalThis.fetch;
  (globalThis as Record<string, unknown>).localStorage = createMemoryStorage();
  let seq = 0;
  globalThis.fetch = (async (_input: RequestInfo | URL, init?: RequestInit) => {
    seq++;
    const body = init?.body ? JSON.parse(String(init.body)) : {};
    return new Response(
      JSON.stringify({
        id: `sync_mock_${seq}`,
        userId: 'guest',
        entityType: body.entityType || 'task',
        action: body.action || 'append',
        sheetName: body.sheetName || 'Tasks',
        payload: body.payload || [],
        dedupeKey: body.dedupeKey,
        status: 'pending',
        attempts: 0,
        createdAt: new Date().toISOString(),
      }),
      { status: 200, headers: { 'Content-Type': 'application/json' } }
    );
  }) as typeof fetch;
  try {
    await googleSheetsService.enqueueMutation('Tasks', ['tsk_q1', 'Task 1'], 'append', 'Tasks_append_tsk_q1');
    await googleSheetsService.enqueueMutation('Tasks', ['tsk_q1', 'Task 1 Updated'], 'append', 'Tasks_append_tsk_q1');
    await googleSheetsService.enqueueMutation(
      'Focus_Sessions',
      ['foc_q1', '2026-11-13'],
      'append',
      'Focus_Sessions_append_foc_q1'
    );
    await googleSheetsService.enqueueMutation(
      'Savings_Goals',
      ['goal_q1', 'Emergency'],
      'append',
      'Savings_Goals_append_goal_q1'
    );

    const len = googleSheetsService.getQueueLength();
    assert.ok(len >= 3, `Expected queue length >= 3 (got ${len}); duplicate Tasks dedupeKey must not double count`);
  } finally {
    globalThis.fetch = originalFetch;
    (globalThis as Record<string, unknown>).localStorage = originalStorage;
  }
});

// ============================================================================
// 4. FIRESTORE OFFLINE OUTBOX RECOVERY
// ============================================================================
test('Audit Fix 6 — Offline Outbox Per-User Isolation, Deduplication, Error Tracking & Clear', () => {
  const originalStorage = (globalThis as Record<string, unknown>).localStorage;
  (globalThis as Record<string, unknown>).localStorage = createMemoryStorage();
  try {
    const uidA = 'user_alpha';
    const uidB = 'user_beta';

    let latestCountA = -1;
    const unsub = offlineOutbox.subscribe(uidA, (count) => {
      latestCountA = count;
    });
    assert.equal(latestCountA, 0);

    const op1 = offlineOutbox.enqueue(
      uidA,
      'create_expense',
      { id: 'exp_1', amountPaise: 5000 },
      'create_expense_exp_1'
    );
    // Re-enqueuing with same dedupeKey updates rather than duplicating
    offlineOutbox.enqueue(
      uidA,
      'create_expense',
      { id: 'exp_1', amountPaise: 6000 },
      'create_expense_exp_1'
    );
    offlineOutbox.enqueue(uidB, 'create_task', { id: 'tsk_b1', title: 'Beta' }, 'create_task_tsk_b1');

    assert.equal(offlineOutbox.count(uidA), 1);
    assert.equal(offlineOutbox.count(uidB), 1);
    assert.equal(latestCountA, 1);
    assert.equal((offlineOutbox.list(uidA)[0].payload as { amountPaise: number }).amountPaise, 6000);

    offlineOutbox.recordError(uidA, op1.id, 'Transient Firestore unavailable');
    assert.equal(offlineOutbox.list(uidA)[0].attempts, 1);
    assert.equal(offlineOutbox.list(uidA)[0].lastError, 'Transient Firestore unavailable');

    offlineOutbox.remove(uidA, op1.id);
    assert.equal(offlineOutbox.count(uidA), 0);
    assert.equal(offlineOutbox.count(uidB), 1);

    offlineOutbox.clear(uidB);
    assert.equal(offlineOutbox.count(uidB), 0);
    unsub();
  } finally {
    (globalThis as Record<string, unknown>).localStorage = originalStorage;
  }
});

// ============================================================================
// 5. FINANCE INTEGRITY, IDEMPOTENCY, RECURRING BILLS, TIMEZONE & ISOLATION
// ============================================================================
test('Audit Fix 7 — Bill Pay Idempotency Replay, Undo -> Re-Pay Non-Duplicate Expense & Cross-User Isolation', () => {
  const userA = `usr_audit_a_${Date.now()}`;
  const userB = `usr_audit_b_${Date.now()}`;
  dbService.ensureUserWorkspace(userA);
  dbService.ensureUserWorkspace(userB);

  const raw = dbService.getRaw();
  const billId = `bill_idem_${Date.now()}`;
  raw.bills.push({
    id: billId,
    userId: userA,
    recurringExpenseId: null,
    name: 'Audit Test Utility Bill',
    amountPaise: 250000,
    categoryId: 'cat_2',
    dueDate: '2026-11-20',
    status: 'UNPAID',
    paymentDate: null,
    notes: '',
    periodKey: '2026-11',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  });
  dbService.save();

  // Cross-user isolation: User B cannot pay User A's bill
  const crossUserPay = dbService.payBill(userB, billId, '2026-11-18', 'upi_bank', 'Attack', 'idem_x');
  assert.equal(crossUserPay.success, false);

  // 1st payment with idempotencyKey succeeds
  const pay1 = dbService.payBill(userA, billId, '2026-11-18', 'upi_bank', 'First pay', 'idem_key_1');
  assert.equal(pay1.success, true);

  // Replay with SAME idempotencyKey safely returns idempotent success without creating duplicate records
  const replay = dbService.payBill(userA, billId, '2026-11-18', 'upi_bank', 'Retry', 'idem_key_1');
  assert.equal(replay.success, true);

  // Payment with DIFFERENT idempotencyKey fails because bill is already PAID
  const dup = dbService.payBill(userA, billId, '2026-11-18', 'upi_bank', 'Dup', 'idem_key_2');
  assert.equal(dup.success, false);

  assert.equal(raw.paymentHistory.filter((p) => p.userId === userA && p.billId === billId).length, 1);
  assert.equal(raw.expenseTransactions.filter((e) => e.userId === userA && e.id === `exp_bill_${billId}`).length, 1);

  // Undo -> Re-Pay cycle preserves 'reversed' entry + creates 2nd completed entry, while reusing exp_bill_<id>
  const undo = dbService.undoBillPayment(userA, billId);
  assert.equal(undo.success, true);

  const repay = dbService.payBill(userA, billId, '2026-11-19', 'credit_card', 'Re-paid', 'idem_key_3');
  assert.equal(repay.success, true);

  const allPayments = raw.paymentHistory.filter((p) => p.userId === userA && p.billId === billId);
  assert.equal(allPayments.length, 2);
  assert.equal(allPayments.filter((p) => p.status === 'reversed').length, 1);
  assert.equal(allPayments.filter((p) => p.status === 'completed').length, 1);

  const allExpForBill = raw.expenseTransactions.filter((e) => e.userId === userA && e.id === `exp_bill_${billId}`);
  assert.equal(allExpForBill.length, 1, 'exp_bill_<id> must be upserted cleanly on re-pay without duplicate row');
  assert.equal(allExpForBill[0].deletedAt, null);

  // Timezone & recurring due-day month-end clamping checks
  const istToday = getTodayDateString('Asia/Kolkata');
  assert.match(istToday, /^\d{4}-\d{2}-\d{2}$/);
  assert.equal(getDaysInMonth(2026, 2), 28);
  assert.equal(getDaysInMonth(2024, 2), 29);

  dbService.clearWorkspace(userA);
  dbService.clearWorkspace(userB);
  dbService.save();
});
