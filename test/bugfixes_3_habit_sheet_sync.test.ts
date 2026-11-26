import './test_bootstrap.ts';
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  syncHabitToggleToGoogleSheets,
  flushPendingHabitWritebacks,
  pollAndSyncGoogleSheetsToHabits,
  listPendingHabitWritebacks,
  enqueuePendingHabitWriteback,
} from '../src/lib/sheetHub/sheetHabitSyncService.ts';
import { sheetHubStore } from '../src/lib/sheetHub/sheetHubStore.ts';
import { api } from '../src/lib/api.ts';
import { setSheetHubWriteAccessToken } from '../src/lib/firebase.ts';
import type { Habit } from '../src/types/index.ts';
import type { SheetConnection, SheetSyncedRow, SheetTabSchema } from '../src/types/sheetHub.ts';

function createMemoryStorage(): Storage {
  const store = new Map<string, string>();
  return {
    get length() {
      return store.size;
    },
    clear() {
      store.clear();
    },
    getItem(key: string) {
      return store.get(key) ?? null;
    },
    key(index: number) {
      return Array.from(store.keys())[index] ?? null;
    },
    removeItem(key: string) {
      store.delete(key);
    },
    setItem(key: string, value: string) {
      store.set(key, String(value));
    },
  };
}

function makeHabit(completedDates: string[]): Habit {
  return {
    id: 'hab_1',
    userId: 'u_sync',
    title: 'Morning Run',
    category: 'Fitness',
    color: '#10b981',
    frequency: 'daily',
    targetDaysPerWeek: 7,
    completedDates,
    bestStreakDays: completedDates.length,
    createdAt: '2026-11-01T00:00:00Z',
    updatedAt: '2026-11-26T00:00:00Z',
    sourceSpreadsheetId: 'sheet_habit_abc',
    sourceSheetId: 10,
    sourceRowId: 'canon_row_run',
    sourceMappingKey: 'sheet_habit_abc::10::morning_run',
    sourceLayout: 'matrix',
  };
}

function makeConnection(userId: string): SheetConnection {
  const now = '2026-11-26T00:00:00Z';
  return {
    id: 'conn_habit_1',
    userId,
    ownerUid: userId,
    spreadsheetId: 'sheet_habit_abc',
    sourceSpreadsheetId: 'sheet_habit_abc',
    spreadsheetUrl: 'https://docs.google.com/spreadsheets/d/sheet_habit_abc/edit',
    title: 'Habit Tracker Nov 2026',
    templateHint: 'checklist',
    syncMode: 'two_way',
    writeMode: 'native_oauth',
    writeAuthStatus: 'authorized',
    writeAuthorizedAt: now,
    pollIntervalSec: null,
    syncOnOpen: true,
    status: 'active',
    lastSyncedAt: now,
    lastSuccessfulPullAt: now,
    lastSuccessfulPushAt: now,
    lastError: null,
    pendingChangesCount: 0,
    conflictCount: 0,
    tabOrder: ['tab_nov'],
    schemaVersion: 1,
    sortOrder: 0,
    isNative: false,
    createdAt: now,
    updatedAt: now,
    deletedAt: null,
  };
}

function makeTab(): SheetTabSchema {
  return {
    id: 'tab_nov',
    connectionId: 'conn_habit_1',
    userId: 'u_sync',
    sheetId: 10,
    sheetTitle: 'Nov 2026',
    headerRowIndex: 1,
    columns: [
      {
        colIndex: 0,
        colLetter: 'A',
        fieldKey: 'habit',
        headerName: 'Habit',
        displayName: 'Habit',
        inferredType: 'text',
        confirmedType: 'text',
        semanticRole: 'title',
        confidence: 'high',
        editable: true,
        requiresConfirmation: false,
      },
      {
        colIndex: 1,
        colLetter: 'B',
        fieldKey: 'd24',
        headerName: '2026-11-24',
        displayName: '2026-11-24',
        inferredType: 'checkbox',
        confirmedType: 'checkbox',
        semanticRole: 'done',
        confidence: 'high',
        editable: true,
        requiresConfirmation: false,
      },
      {
        colIndex: 2,
        colLetter: 'C',
        fieldKey: 'd25',
        headerName: '2026-11-25',
        displayName: '2026-11-25',
        inferredType: 'checkbox',
        confirmedType: 'checkbox',
        semanticRole: 'done',
        confidence: 'high',
        editable: true,
        requiresConfirmation: false,
      },
      {
        colIndex: 3,
        colLetter: 'D',
        fieldKey: 'd26',
        headerName: '2026-11-26',
        displayName: '2026-11-26',
        inferredType: 'checkbox',
        confirmedType: 'checkbox',
        semanticRole: 'done',
        confidence: 'high',
        editable: true,
        requiresConfirmation: false,
      },
    ],
  } as unknown as SheetTabSchema;
}

test('Bug 1 & 3 — pollAndSyncGoogleSheetsToHabits unchecks unchecked Sheet cells & preserves canonical rowUid + dirtyFields', async () => {
  const userId = 'u_sync';
  const origWindow = (globalThis as any).window;
  const storage = createMemoryStorage();
  (globalThis as any).window = { localStorage: storage };

  const origListConns = sheetHubStore.listConnections;
  const origListTabs = sheetHubStore.listTabsForConnection;
  const origLoadRows = sheetHubStore.loadTabRows;
  const origSaveRows = sheetHubStore.saveTabRowsChunked;
  const origGetHabits = api.getHabits;
  const origUpdateHabit = api.updateHabit;
  const origPull = api.sheetHubPull;

  let storedRows: SheetSyncedRow[] = [
    {
      rowUid: 'canon_row_run',
      lastKnownSheetRow: 2,
      values: { habit: 'Morning Run', d24: false, d25: true, d26: true },
      baseValues: { habit: 'Morning Run', d24: false, d25: true, d26: false },
      rowHash: 'hash_2',
      version: 2,
      lastSyncOrigin: 'app',
      dirtyFields: ['d26'], // Unsynced local edit on d26!
      localUpdatedAt: '2026-11-26T08:00:00Z',
      sheetSyncedAt: '2026-11-25T08:00:00Z',
      status: 'pending_push',
    },
  ];
  let updatedDatesInApp: string[] | null = null;

  sheetHubStore.listConnections = async () => [makeConnection(userId)];
  sheetHubStore.listTabsForConnection = async () => [makeTab()];
  sheetHubStore.loadTabRows = async () => storedRows;
  sheetHubStore.saveTabRowsChunked = async ({ rows }) => {
    storedRows = rows;
    return { chunkCount: 1, maxChunkBytes: 512, oversizedRowUids: [] };
  };
  api.getHabits = async () => [makeHabit(['2026-11-25', '2026-11-26'])];
  api.updateHabit = async (_id, patch) => {
    updatedDatesInApp = patch.completedDates || null;
    return makeHabit(patch.completedDates || []);
  };
  // Live sheet says d25 was UNCHECKED (false), d26 is false in sheet (but dirty locally in app!)
  api.sheetHubPull = async () =>
    ({
      tabs: [
        {
          sheetId: 10,
          sheetTitle: 'Nov 2026',
          rows: [{ sheetRowNumber: 2, values: ['Morning Run', false, false, false] }],
        },
      ],
    }) as any;

  try {
    const report = await pollAndSyncGoogleSheetsToHabits(userId);
    assert.equal(report.success, true);
    assert.equal(report.updatedHabitsCount, 1);

    // Bug 3: canonical rowUid & dirtyFields ['d26'] preserved, status remains pending_push, d26 value stays true
    assert.equal(storedRows[0].rowUid, 'canon_row_run');
    assert.deepEqual(storedRows[0].dirtyFields, ['d26']);
    assert.equal(storedRows[0].status, 'pending_push');
    assert.equal(storedRows[0].values.d26, true);

    // Bug 1: d25 was unchecked in Sheet -> removed from completedDates, while dirty d26 stays true
    assert.deepEqual(updatedDatesInApp, ['2026-11-26']);
  } finally {
    sheetHubStore.listConnections = origListConns;
    sheetHubStore.listTabsForConnection = origListTabs;
    sheetHubStore.loadTabRows = origLoadRows;
    sheetHubStore.saveTabRowsChunked = origSaveRows;
    api.getHabits = origGetHabits;
    api.updateHabit = origUpdateHabit;
    api.sheetHubPull = origPull;
    (globalThis as any).window = origWindow;
  }
});

test('Bug 2 — syncHabitToggleToGoogleSheets queues 5xx/network errors, flush clears pending_push, and drops permanent 404 errors', async () => {
  const userId = 'u_sync_q';
  const origWindow = (globalThis as any).window;
  const storage = createMemoryStorage();
  (globalThis as any).window = { localStorage: storage };

  const origListConns = sheetHubStore.listConnections;
  const origListTabs = sheetHubStore.listTabsForConnection;
  const origLoadRows = sheetHubStore.loadTabRows;
  const origSaveRows = sheetHubStore.saveTabRowsChunked;
  const origPush = api.sheetHubPushCells;

  let storedRows: SheetSyncedRow[] = [
    {
      rowUid: 'canon_row_run',
      lastKnownSheetRow: 2,
      values: { habit: 'Morning Run', d25: false, d26: false },
      baseValues: { habit: 'Morning Run', d25: false, d26: false },
      rowHash: 'hash_2',
      version: 1,
      lastSyncOrigin: 'sheet',
      dirtyFields: [],
      localUpdatedAt: null,
      sheetSyncedAt: '2026-11-25T08:00:00Z',
      status: 'synced',
    },
  ];

  sheetHubStore.listConnections = async () => [makeConnection(userId)];
  sheetHubStore.listTabsForConnection = async () => [makeTab()];
  sheetHubStore.loadTabRows = async () => storedRows;
  sheetHubStore.saveTabRowsChunked = async ({ rows }) => {
    storedRows = rows;
    return { chunkCount: 1, maxChunkBytes: 512, oversizedRowUids: [] };
  };
  setSheetHubWriteAccessToken('tok_valid_write');

  try {
    // 1. Transient 503 network error MUST enqueue writeback
    api.sheetHubPushCells = async () => {
      throw new Error('503 Service Unavailable');
    };
    const res503 = await syncHabitToggleToGoogleSheets(
      userId,
      makeHabit(['2026-11-26']),
      '2026-11-26',
      true
    );
    assert.equal(res503.status, 'queued');
    assert.equal(listPendingHabitWritebacks(userId).length, 1);
    assert.equal(storedRows[0].status, 'pending_push');
    assert.deepEqual(storedRows[0].dirtyFields, ['d26']);

    // 2. Permanent 404 on a second stale queued entry must be dropped instead of infinite-retrying
    enqueuePendingHabitWriteback(userId, {
      userId,
      connectionId: 'conn_habit_1',
      spreadsheetId: 'sheet_habit_abc',
      sheetTitle: 'Nov 2026',
      rowNumber: 99,
      colLetter: 'C',
      cellRef: 'Nov 2026!C99',
      habitId: 'hab_deleted',
      habitTitle: 'Deleted',
      dateStr: '2026-11-25',
      value: true,
    });

    api.sheetHubPushCells = async (payload) => {
      if (payload.updates[0].rowNumber === 99) {
        throw new Error('404 Requested entity was not found');
      }
      return { success: true, updatedCount: 1 } as any;
    };

    const flushedCount = await flushPendingHabitWritebacks(userId);
    assert.equal(flushedCount, 1);
    assert.equal(listPendingHabitWritebacks(userId).length, 0, '404 entry must be dropped and 503 entry flushed');
    assert.equal(storedRows[0].status, 'synced', 'Flushing must clear pending_push on cached row');
    assert.deepEqual(storedRows[0].dirtyFields, []);
    assert.equal(storedRows[0].baseValues.d26, true);
  } finally {
    setSheetHubWriteAccessToken(null);
    sheetHubStore.listConnections = origListConns;
    sheetHubStore.listTabsForConnection = origListTabs;
    sheetHubStore.loadTabRows = origLoadRows;
    sheetHubStore.saveTabRowsChunked = origSaveRows;
    api.sheetHubPushCells = origPush;
    (globalThis as any).window = origWindow;
  }
});
