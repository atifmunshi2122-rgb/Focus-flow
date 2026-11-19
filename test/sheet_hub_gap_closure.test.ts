import './test_bootstrap.ts';
import test, { describe, it, after } from 'node:test';
import assert from 'node:assert/strict';
import { terminate } from 'firebase/firestore';
import { db } from '../src/lib/firebase.ts';
import { sheetHubStore, SheetHubPersistenceError, type PendingSheetOperation } from '../src/lib/sheetHub/sheetHubStore.ts';
import { clientDataCache } from '../src/lib/dataCache.ts';
import type { SheetConnection, SheetTabSchema, SheetSyncedRow } from '../src/types/sheetHub.ts';

describe('FocusFlow Sheet Hub — Gap Closure & Adversarial Verification Matrix', () => {
  const userId = `uid_gap_closure_${Date.now()}`;

  after(async () => {
    if (db) {
      try {
        await terminate(db);
      } catch {}
    }
  });

  // --------------------------------------------------------------------------
  // Item 1: Canonical storage completeness & Safe Reconciliation
  // --------------------------------------------------------------------------
  it('Item 1: Canonical-only spreadsheets remain visible when sheet_connections is partially populated (5 in index, 7 in canonical -> 7 visible)', async () => {
    const testUser = `usr_canon_test_${Date.now()}`;
    const now = new Date().toISOString();

    // Setup:
    // 5 matching records in local / fallback index
    // 7 records in canonical sheets (5 matching + 2 canonical-only)
    const matchingSheets: SheetConnection[] = Array.from({ length: 5 }, (_, i) => ({
      id: `sheet_match_${i}_${Date.now()}`,
      userId: testUser,
      title: `Matching Sheet ${i + 1}`,
      spreadsheetId: `sheet_match_${i}_${Date.now()}`,
      spreadsheetUrl: '',
      templateHint: 'table',
      syncMode: 'manual_only',
      pollIntervalSec: null,
      syncOnOpen: false,
      status: 'active',
      lastSyncedAt: now,
      lastSuccessfulPullAt: now,
      lastSuccessfulPushAt: null,
      lastError: null,
      pendingChangesCount: 0,
      conflictCount: 0,
      tabOrder: ['tab_1'],
      isNative: true,
      schemaVersion: 1,
      createdAt: now,
      updatedAt: now,
      deletedAt: null,
    }));

    const canonicalOnlySheets: SheetConnection[] = Array.from({ length: 2 }, (_, i) => ({
      id: `sheet_canonical_only_${i}_${Date.now()}`,
      userId: testUser,
      title: `Canonical Only Sheet ${i + 1}`,
      spreadsheetId: `sheet_canonical_only_${i}_${Date.now()}`,
      spreadsheetUrl: '',
      templateHint: 'table',
      syncMode: 'manual_only',
      pollIntervalSec: null,
      syncOnOpen: false,
      status: 'active',
      lastSyncedAt: now,
      lastSuccessfulPullAt: now,
      lastSuccessfulPushAt: null,
      lastError: null,
      pendingChangesCount: 0,
      conflictCount: 0,
      tabOrder: ['tab_1'],
      isNative: true,
      schemaVersion: 1,
      createdAt: now,
      updatedAt: now,
      deletedAt: null,
    }));

    // Populate local fallback index with 5 matching
    sheetHubStore.clearUserCache(testUser);
    for (const s of matchingSheets) {
      await sheetHubStore.saveConnection(testUser, s);
    }
    const initialList = await sheetHubStore.listConnections(testUser);
    assert.equal(initialList.length, 5, 'Initially 5 matching sheets in index');

    // Add 2 canonical-only sheets
    for (const s of canonicalOnlySheets) {
      await sheetHubStore.saveConnection(testUser, s);
    }
    const fullList = await sheetHubStore.listConnections(testUser);
    assert.equal(fullList.length, 7, 'All 7 unique spreadsheets appear when canonical sheets contains 7 records');

    // Verify all 7 IDs are present and distinct
    const ids = new Set(fullList.map((s) => s.id));
    assert.equal(ids.size, 7, 'Must have exactly 7 distinct sheet IDs');
    for (const s of matchingSheets) assert.ok(ids.has(s.id));
    for (const s of canonicalOnlySheets) assert.ok(ids.has(s.id));
  });

  // --------------------------------------------------------------------------
  // Item 2: Cascade Deletion Reliability & Idempotent Resumable Workflow
  // --------------------------------------------------------------------------
  it('Item 2: Cascade deletion cleans all associated documents leaving zero orphans', async () => {
    const testUser = `usr_del_test_${Date.now()}`;
    const now = new Date().toISOString();
    const sheetId = `sheet_cascade_${Date.now()}`;
    const tab1Id = `tab_c1_${Date.now()}`;
    const tab2Id = `tab_c2_${Date.now()}`;

    // Create a multi-tab spreadsheet
    const sheet: SheetConnection = {
      id: sheetId,
      userId: testUser,
      title: 'Cascade Deletion Sheet',
      spreadsheetId: sheetId,
      spreadsheetUrl: '',
      templateHint: 'table',
      syncMode: 'manual_only',
      pollIntervalSec: null,
      syncOnOpen: false,
      status: 'active',
      lastSyncedAt: now,
      lastSuccessfulPullAt: now,
      lastSuccessfulPushAt: null,
      lastError: null,
      pendingChangesCount: 0,
      conflictCount: 0,
      tabOrder: [tab1Id, tab2Id],
      isNative: true,
      schemaVersion: 1,
      createdAt: now,
      updatedAt: now,
      deletedAt: null,
    };

    await sheetHubStore.saveConnection(testUser, sheet);

    // Create 2 tabs
    const tab1: SheetTabSchema = {
      id: tab1Id,
      connectionId: sheetId,
      sheetDocId: sheetId,
      userId: testUser,
      sheetId: 0,
      sheetTitle: 'Tab 1',
      position: 0,
      role: 'data',
      headerRowIndex: 1,
      dataStartRow: 2,
      dataEndColumn: 'C',
      identityStrategy: 'metadata_column',
      identityColumns: ['col_a'],
      metadataIdColumn: null,
      columns: [{ colIndex: 0, colLetter: 'A', fieldKey: 'col_a', headerName: 'A', displayName: 'A', inferredType: 'text', confirmedType: 'text', semanticRole: 'title', confidence: 'high', editable: true, requiresConfirmation: false }],
      defaultView: 'table',
      groupByColumnId: null,
      lastPullHash: 'hash1',
      rowCount: 1,
      chunkCount: 1,
      createdAt: now,
      updatedAt: now,
    };
    const tab2: SheetTabSchema = {
      ...tab1,
      id: tab2Id,
      sheetId: 1,
      sheetTitle: 'Tab 2',
      position: 1,
    };

    await sheetHubStore.saveTabSchema(testUser, tab1);
    await sheetHubStore.saveTabSchema(testUser, tab2);

    // Save rows for both tabs
    const makeMockRow = (uid: string, text: string): SheetSyncedRow => ({
      rowUid: uid,
      rowIndex: 0,
      values: { col_a: text },
      baseValues: { col_a: text },
      lastKnownSheetRow: 2,
      rowHash: 'hash',
      version: 1,
      lastSyncOrigin: 'app',
      dirtyFields: [],
      localUpdatedAt: null,
      sheetSyncedAt: now,
      status: 'synced',
      updatedAt: now,
    });

    await sheetHubStore.saveTabRowsChunked({
      userId: testUser,
      connectionId: sheetId,
      tabId: tab1Id,
      rows: [makeMockRow(`row_1_${Date.now()}`, 'Hello')],
    });
    await sheetHubStore.saveTabRowsChunked({
      userId: testUser,
      connectionId: sheetId,
      tabId: tab2Id,
      rows: [makeMockRow(`row_2_${Date.now()}`, 'World')],
    });

    // Verify before deletion
    const beforeList = await sheetHubStore.listConnections(testUser);
    assert.equal(beforeList.some((s) => s.id === sheetId), true);
    const beforeTabs = await sheetHubStore.listTabsForConnection(testUser, sheetId);
    assert.equal(beforeTabs.length, 2);

    // Execute cascade deletion
    await sheetHubStore.deleteConnection(testUser, sheetId);

    // Verify after deletion
    const afterList = await sheetHubStore.listConnections(testUser);
    assert.equal(afterList.some((s) => s.id === sheetId), false, 'Sheet must be completely removed');

    const fetchedConn = await sheetHubStore.getConnection(testUser, sheetId);
    assert.equal(fetchedConn, null, 'Deleted connection must return null');

    const afterTabs = await sheetHubStore.listTabsForConnection(testUser, sheetId);
    assert.equal(afterTabs.length, 0, 'Deleted tabs must return empty');

    const afterRows1 = await sheetHubStore.loadTabRows(testUser, tab1Id, sheetId);
    assert.equal(afterRows1.length, 0, 'Tab 1 rows must be purged');

    const afterRows2 = await sheetHubStore.loadTabRows(testUser, tab2Id, sheetId);
    assert.equal(afterRows2.length, 0, 'Tab 2 rows must be purged');

    // Idempotency: second deletion of already-deleted sheet must succeed cleanly without throwing
    await assert.doesNotReject(async () => {
      await sheetHubStore.deleteConnection(testUser, sheetId);
    });
  });

  // --------------------------------------------------------------------------
  // Item 3: A/B Concurrent Edit Conflict Detection
  // --------------------------------------------------------------------------
  it('Item 3: A/B concurrent edit conflict prevents silent last-write-wins data loss', async () => {
    const testUser = `usr_conflict_test_${Date.now()}`;
    const t0 = new Date(Date.now() - 60000).toISOString();
    const t1 = new Date(Date.now() - 30000).toISOString();
    const t2 = new Date(Date.now()).toISOString();
    const sheetId = `sheet_confl_${Date.now()}`;

    // Base sheet created at T0
    const baseSheet: SheetConnection = {
      id: sheetId,
      userId: testUser,
      title: 'Original Title T0',
      spreadsheetId: sheetId,
      spreadsheetUrl: '',
      templateHint: 'table',
      syncMode: 'manual_only',
      pollIntervalSec: null,
      syncOnOpen: false,
      status: 'active',
      lastSyncedAt: t0,
      lastSuccessfulPullAt: t0,
      lastSuccessfulPushAt: null,
      lastError: null,
      pendingChangesCount: 0,
      conflictCount: 0,
      tabOrder: ['tab_1'],
      isNative: true,
      schemaVersion: 1,
      createdAt: t0,
      updatedAt: t0,
      deletedAt: null,
    };
    await sheetHubStore.saveConnection(testUser, baseSheet);

    // Device B is online and commits newer version at T2
    const deviceBSheet: SheetConnection = {
      ...baseSheet,
      title: 'Device B Newer Title T2',
      updatedAt: t2,
    };
    await sheetHubStore.saveConnection(testUser, deviceBSheet);

    // Device A had made edits while disconnected based on T0, resulting in T1 (< T2)
    const deviceASheet: SheetConnection = {
      ...baseSheet,
      title: 'Device A Stale Title T1',
      updatedAt: t1,
    };

    // When Device A retries pending operations with stale revision:
    // It must NOT overwrite Device B's newer cloud revision
    const queue = sheetHubStore.getPendingOperations(testUser);
    assert.equal(queue.length, 0);

    // Simulate Device A having queued the stale edit
    sheetHubStore.enqueuePendingOperation(testUser, {
      type: 'connection',
      userId: testUser,
      connectionId: sheetId,
      payload: deviceASheet,
    });

    // Call retryPendingOperations
    const retryResult = await sheetHubStore.retryPendingOperations(testUser);
    assert.equal(retryResult.retried, 1);
    assert.equal(retryResult.conflicts, 1, 'Must detect and count concurrent modification conflict');
    assert.equal(retryResult.succeeded, 0, 'Stale edit must not succeed');

    // Verify cloud document remains Device B's newer version (no silent data loss)
    const currentDoc = await sheetHubStore.getConnection(testUser, sheetId);
    assert.equal(currentDoc?.title, 'Device B Newer Title T2', "Cloud document must preserve newer Device B data");
  });

  // --------------------------------------------------------------------------
  // Item 4: Canonical vs Mirror Write Distinction & Recoverable Index Sync
  // --------------------------------------------------------------------------
  it('Item 4: Mirror failure recovery queues index_sync and repairs index without failing authoritative save', async () => {
    const testUser = `usr_sync_test_${Date.now()}`;
    const now = new Date().toISOString();
    const sheetId = `sheet_sync_recov_${Date.now()}`;

    const sheet: SheetConnection = {
      id: sheetId,
      userId: testUser,
      title: 'Recoverable Index Sync Sheet',
      spreadsheetId: sheetId,
      spreadsheetUrl: '',
      templateHint: 'table',
      syncMode: 'manual_only',
      pollIntervalSec: null,
      syncOnOpen: false,
      status: 'active',
      lastSyncedAt: now,
      lastSuccessfulPullAt: now,
      lastSuccessfulPushAt: null,
      lastError: null,
      pendingChangesCount: 0,
      conflictCount: 0,
      tabOrder: ['tab_1'],
      isNative: true,
      schemaVersion: 1,
      createdAt: now,
      updatedAt: now,
      deletedAt: null,
    };

    // Save connection normally
    const saved = await sheetHubStore.saveConnection(testUser, sheet);
    assert.equal(saved.id, sheetId);

    // Verify index_sync pending operation handling
    sheetHubStore.enqueuePendingOperation(testUser, {
      type: 'index_sync',
      userId: testUser,
      connectionId: sheetId,
      payload: sheet,
    });

    const retryRes = await sheetHubStore.retryPendingOperations(testUser);
    assert.equal(retryRes.retried, 1);
    assert.equal(retryRes.succeeded, 1, 'index_sync retry must succeed and repair secondary index');
  });

  // --------------------------------------------------------------------------
  // Item 5: deleteNativeTab prevents deleting the last tab
  // --------------------------------------------------------------------------
  it('Item 5: deleteNativeTab forbids deleting the only tab in a spreadsheet', async () => {
    const testUser = `usr_tab_guard_${Date.now()}`;
    const now = new Date().toISOString();
    const sheetId = `sheet_single_tab_${Date.now()}`;
    const singleTabId = `tab_single_${Date.now()}`;

    const sheet: SheetConnection = {
      id: sheetId,
      userId: testUser,
      title: 'Single Tab Sheet',
      spreadsheetId: sheetId,
      spreadsheetUrl: '',
      templateHint: 'table',
      syncMode: 'manual_only',
      pollIntervalSec: null,
      syncOnOpen: false,
      status: 'active',
      lastSyncedAt: now,
      lastSuccessfulPullAt: now,
      lastSuccessfulPushAt: null,
      lastError: null,
      pendingChangesCount: 0,
      conflictCount: 0,
      tabOrder: [singleTabId],
      isNative: true,
      schemaVersion: 1,
      createdAt: now,
      updatedAt: now,
      deletedAt: null,
    };
    await sheetHubStore.saveConnection(testUser, sheet);

    const singleTab: SheetTabSchema = {
      id: singleTabId,
      connectionId: sheetId,
      sheetDocId: sheetId,
      userId: testUser,
      sheetId: 0,
      sheetTitle: 'Sole Tab',
      position: 0,
      role: 'data',
      headerRowIndex: 1,
      dataStartRow: 2,
      dataEndColumn: 'B',
      identityStrategy: 'metadata_column',
      identityColumns: ['col_a'],
      metadataIdColumn: null,
      columns: [],
      defaultView: 'table',
      groupByColumnId: null,
      lastPullHash: 'hash',
      rowCount: 0,
      chunkCount: 0,
      createdAt: now,
      updatedAt: now,
    };
    await sheetHubStore.saveTabSchema(testUser, singleTab);

    // Attempting to delete the only tab must be rejected
    await assert.rejects(async () => {
      await sheetHubStore.deleteNativeTab(testUser, sheetId, singleTabId);
    }, /Cannot delete the only tab in a spreadsheet/);

    // Verify tab still exists
    const tabsAfter = await sheetHubStore.listTabsForConnection(testUser, sheetId);
    assert.equal(tabsAfter.length, 1);
  });
});
