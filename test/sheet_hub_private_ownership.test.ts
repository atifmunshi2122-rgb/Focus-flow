import './test_bootstrap.ts';
import test, { describe, it, after } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { terminate } from 'firebase/firestore';
import { db } from '../src/lib/firebase.ts';
import { sheetHubStore } from '../src/lib/sheetHub/sheetHubStore.ts';
import { clientDataCache } from '../src/lib/dataCache.ts';
import type { SheetConnection, SheetSyncedRow, SheetTabSchema } from '../src/types/sheetHub.ts';
import app from '../api/index.ts';

describe('FocusFlow Native Private Spreadsheet System — Multi-User Isolation Matrix', () => {
  const userA = 'uid_Alice_owner_' + Date.now();
  const userB = 'uid_Bob_owner_' + Date.now();

  let nativeSheetA: SheetConnection;
  let nativeTabA: SheetTabSchema;
  let nativeRowsA: SheetSyncedRow[];

  let nativeSheetB: SheetConnection;
  let nativeTabB: SheetTabSchema;
  let nativeRowsB: SheetSyncedRow[];

  // --------------------------------------------------------------------------
  // Item 1 & 14: User A creates a private sheet without Google OAuth
  // --------------------------------------------------------------------------
  it('Item 1 & 14: User A creates a native private spreadsheet without Google OAuth', async () => {
    clientDataCache.setActiveUser(userA);
    const created = await sheetHubStore.createNativeSpreadsheet(userA, {
      title: "Alice's Private Biology Study Plan",
      description: 'Exam preparation and topic tracker',
      templateHint: 'checklist',
    });

    nativeSheetA = created.sheet;
    nativeTabA = created.tab;
    nativeRowsA = created.rows;

    assert.ok(nativeSheetA.id.startsWith('sheet_nat_'), 'Must use native sheetId');
    assert.equal(nativeSheetA.userId, userA);
    assert.equal(nativeSheetA.ownerUid, userA);
    assert.equal(nativeSheetA.isNative, true, 'isNative must be true');
    assert.equal(nativeSheetA.spreadsheetUrl, '', 'Must not require or set a Google Sheets URL');
    assert.equal(nativeSheetA.syncMode, 'manual_only');
    assert.equal(nativeSheetA.status, 'active');

    // Verify zero OAuth tokens exist in document
    assert.equal((nativeSheetA as any).accessToken, undefined);
    assert.equal((nativeSheetA as any).refreshToken, undefined);
    assert.equal((nativeSheetA as any).googleAccessToken, undefined);

    // Verify initial tab and rows created
    assert.equal(nativeTabA.sheetTitle, 'Sheet 1');
    assert.equal(nativeTabA.userId, userA);
    assert.ok(nativeRowsA.length > 0, 'Initial template rows must be populated');
  });

  // --------------------------------------------------------------------------
  // Item 2: User B creates a private sheet
  // --------------------------------------------------------------------------
  it('Item 2: User B creates their own native private spreadsheet', async () => {
    clientDataCache.setActiveUser(userB);
    const created = await sheetHubStore.createNativeSpreadsheet(userB, {
      title: "Bob's Financial Budget Ledger",
      description: 'Personal monthly expenses and savings goals',
      templateHint: 'table',
    });

    nativeSheetB = created.sheet;
    nativeTabB = created.tab;
    nativeRowsB = created.rows;

    assert.ok(nativeSheetB.id.startsWith('sheet_nat_'));
    assert.equal(nativeSheetB.userId, userB);
    assert.equal(nativeSheetB.ownerUid, userB);
    assert.equal(nativeSheetB.isNative, true);
    assert.notEqual(nativeSheetB.id, nativeSheetA.id);
  });

  // --------------------------------------------------------------------------
  // Item 3: User A can read only A's sheet
  // --------------------------------------------------------------------------
  it('Item 3: User A can read only A\'s sheet', async () => {
    clientDataCache.setActiveUser(userA);
    const aliceSheets = await sheetHubStore.listConnections(userA);
    assert.equal(aliceSheets.length, 1);
    assert.equal(aliceSheets[0].id, nativeSheetA.id);
    assert.equal(aliceSheets[0].title, "Alice's Private Biology Study Plan");
    assert.ok(!aliceSheets.some((s) => s.id === nativeSheetB.id), 'Alice must not see Bob\'s sheet');
  });

  // --------------------------------------------------------------------------
  // Item 4: User B can read only B's sheet
  // --------------------------------------------------------------------------
  it('Item 4: User B can read only B\'s sheet', async () => {
    clientDataCache.setActiveUser(userB);
    const bobSheets = await sheetHubStore.listConnections(userB);
    assert.equal(bobSheets.length, 1);
    assert.equal(bobSheets[0].id, nativeSheetB.id);
    assert.equal(bobSheets[0].title, "Bob's Financial Budget Ledger");
    assert.ok(!bobSheets.some((s) => s.id === nativeSheetA.id), 'Bob must not see Alice\'s sheet');
  });

  // --------------------------------------------------------------------------
  // Item 5: User A cannot access B's sheet by ID
  // --------------------------------------------------------------------------
  it('Item 5: User A cannot access B\'s sheet by ID', async () => {
    clientDataCache.setActiveUser(userA);
    const accessAttempt = await sheetHubStore.getConnection(userA, nativeSheetB.id);
    assert.equal(accessAttempt, null, "Alice querying Bob's sheetId must return null");
  });

  // --------------------------------------------------------------------------
  // Item 6: User B cannot access A's sheet by ID
  // --------------------------------------------------------------------------
  it('Item 6: User B cannot access A\'s sheet by ID', async () => {
    clientDataCache.setActiveUser(userB);
    const accessAttempt = await sheetHubStore.getConnection(userB, nativeSheetA.id);
    assert.equal(accessAttempt, null, "Bob querying Alice's sheetId must return null");
  });

  // --------------------------------------------------------------------------
  // Item 7: Cross-user tab access is denied
  // --------------------------------------------------------------------------
  it('Item 7: Cross-user tab access is denied', async () => {
    clientDataCache.setActiveUser(userB);
    // User B tries to list tabs for User A's sheet
    const tabsForAliceSheet = await sheetHubStore.listTabsForConnection(userB, nativeSheetA.id);
    assert.equal(tabsForAliceSheet.length, 0, "User B must get 0 tabs for User A's sheet");

    // User B tries to save a tab targeting User A's sheet
    await assert.rejects(
      async () => {
        await sheetHubStore.saveTabSchema(userB, {
          ...nativeTabA,
          userId: userA,
          sheetTitle: 'Tampered by Bob',
        });
      },
      /Cross-user ownership mutation forbidden/
    );
  });

  // --------------------------------------------------------------------------
  // Item 8: Cross-user row access is denied
  // --------------------------------------------------------------------------
  it('Item 8: Cross-user row access is denied', async () => {
    clientDataCache.setActiveUser(userB);
    // User B tries to read User A's tab rows
    const rowsForAliceTab = await sheetHubStore.loadTabRows(userB, nativeTabA.id);
    assert.equal(rowsForAliceTab.length, 0, "User B must get 0 rows for User A's tab");

    // User B tries to edit User A's cell
    await assert.rejects(
      async () => {
        await sheetHubStore.saveNativeCellEdit(userB, {
          sheetId: nativeSheetA.id,
          tabId: nativeTabA.id,
          rowUid: nativeRowsA[0].rowUid,
          fieldKey: 'col_title',
          value: 'Hacked by Bob',
        });
      },
      /not found in tab/
    );
  });

  // --------------------------------------------------------------------------
  // Item 9: Cross-user update is denied
  // --------------------------------------------------------------------------
  it('Item 9: Cross-user update is denied', async () => {
    clientDataCache.setActiveUser(userB);
    // User B attempts to rename User A's sheet
    await assert.rejects(
      async () => {
        await sheetHubStore.renameNativeSpreadsheet(userB, nativeSheetA.id, 'Hacked Title');
      },
      /not found|Unauthorized/
    );

    // User B attempts to add row to User A's tab
    await assert.rejects(
      async () => {
        await sheetHubStore.addNativeRow(userB, nativeSheetA.id, nativeTabA.id);
      },
      /not found|Unauthorized/
    );
  });

  // --------------------------------------------------------------------------
  // Item 10: Cross-user delete is denied
  // --------------------------------------------------------------------------
  it('Item 10: Cross-user delete is denied', async () => {
    clientDataCache.setActiveUser(userB);
    // User B tries to delete User A's tab
    await assert.rejects(
      async () => {
        await sheetHubStore.deleteNativeTab(userB, nativeSheetA.id, nativeTabA.id);
      },
      /not found|Unauthorized/
    );

    // After User B's attempt, User A's sheet and tabs remain intact
    clientDataCache.setActiveUser(userA);
    const aliceConns = await sheetHubStore.listConnections(userA);
    assert.equal(aliceConns.length, 1);
    assert.equal(aliceConns[0].id, nativeSheetA.id);
  });

  // --------------------------------------------------------------------------
  // Item 11: Ownership reassignment is denied
  // --------------------------------------------------------------------------
  it('Item 11: Ownership reassignment is denied', async () => {
    clientDataCache.setActiveUser(userB);
    // User B attempts to overwrite User A's sheet with User B as owner
    await assert.rejects(
      async () => {
        await sheetHubStore.saveConnection(userB, {
          ...nativeSheetA,
          userId: userA, // trying to spoof Alice's UID under Bob session
        });
      },
      /Cross-user ownership mutation forbidden/
    );
  });

  // --------------------------------------------------------------------------
  // Item 12: Unauthenticated access is denied
  // --------------------------------------------------------------------------
  it('Item 12: Unauthenticated access is denied', async () => {
    await assert.rejects(async () => {
      await sheetHubStore.listConnections('');
    }, /Valid userId is required/);

    await assert.rejects(async () => {
      await sheetHubStore.saveConnection('   ', nativeSheetA);
    }, /Valid userId is required/);

    await assert.rejects(async () => {
      await sheetHubStore.getConnection('', nativeSheetA.id);
    }, /Valid userId is required/);

    await assert.rejects(async () => {
      await sheetHubStore.createNativeSpreadsheet('', { title: 'Test' });
    }, /Valid userId is required/);
  });

  // --------------------------------------------------------------------------
  // Item 13: Unauthorized server API access is denied
  // --------------------------------------------------------------------------
  it('Item 13: Unauthorized server API access is denied', async () => {
    const server = http.createServer(app);
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
    const addr = server.address();
    const port = typeof addr === 'object' && addr ? addr.port : 0;
    const base = `http://127.0.0.1:${port}`;

    try {
      // 1. Inspect without token -> 401
      const resInspect = await fetch(`${base}/api/sheet-hub/inspect`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ spreadsheetId: nativeSheetA.id }),
      });
      assert.equal(resInspect.status, 401);
      const inspectBody = (await resInspect.json()) as { code?: string };
      assert.equal(inspectBody.code, 'AUTH_REQUIRED');

      // 2. Pull without token -> 401
      const resPull = await fetch(`${base}/api/sheet-hub/pull`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ spreadsheetId: nativeSheetA.id, tabs: [{ sheetId: 0, sheetTitle: 'Sheet 1' }] }),
      });
      assert.equal(resPull.status, 401);
      const pullBody = (await resPull.json()) as { code?: string };
      assert.equal(pullBody.code, 'AUTH_REQUIRED');
    } finally {
      server.close();
    }
  });

  // --------------------------------------------------------------------------
  // Item 15: Native spreadsheet grid editing, tabs, and columns
  // --------------------------------------------------------------------------
  it('Item 15: Native spreadsheet grid editing, rows, columns, and tabs operate reliably', async () => {
    clientDataCache.setActiveUser(userA);

    // 1. Inline cell edit
    const targetRow = nativeRowsA[0];
    const editedRow = await sheetHubStore.saveNativeCellEdit(userA, {
      sheetId: nativeSheetA.id,
      tabId: nativeTabA.id,
      rowUid: targetRow.rowUid,
      fieldKey: 'col_title',
      value: 'Updated Biology Unit 1 Topic',
    });
    assert.equal(editedRow.values.col_title, 'Updated Biology Unit 1 Topic');

    // 2. Add row
    const addedRow = await sheetHubStore.addNativeRow(userA, nativeSheetA.id, nativeTabA.id, {
      col_group: 'Unit 2',
      col_title: 'Genetics and Inheritance',
      col_done: false,
      col_notes: 'Practice punnett squares',
    });
    assert.equal(addedRow.values.col_title, 'Genetics and Inheritance');

    const refreshedRows = await sheetHubStore.loadTabRows(userA, nativeTabA.id);
    assert.equal(refreshedRows.length, nativeRowsA.length + 1);

    // 3. Add column
    const updatedTab = await sheetHubStore.addNativeColumn(
      userA,
      nativeSheetA.id,
      nativeTabA.id,
      'Review Date',
      'date'
    );
    assert.ok(updatedTab.columns.some((c) => c.headerName === 'Review Date'));

    // 4. Create new tab
    const tab2 = await sheetHubStore.createNativeTab(userA, nativeSheetA.id, 'Practical Lab Notes');
    assert.equal(tab2.sheetTitle, 'Practical Lab Notes');

    const aliceTabs = await sheetHubStore.listTabsForConnection(userA, nativeSheetA.id);
    assert.equal(aliceTabs.length, 2);

    // 5. Rename tab
    const renamedTab = await sheetHubStore.renameNativeTab(
      userA,
      nativeSheetA.id,
      tab2.id,
      'Lab Work & Experiments'
    );
    assert.equal(renamedTab.sheetTitle, 'Lab Work & Experiments');

    // 6. Rename spreadsheet
    const renamedSheet = await sheetHubStore.renameNativeSpreadsheet(
      userA,
      nativeSheetA.id,
      'AP Biology Master Study OS'
    );
    assert.equal(renamedSheet.title, 'AP Biology Master Study OS');

    // 7. Reorder tabs
    const reordered = await sheetHubStore.reorderNativeTabs(userA, nativeSheetA.id, [tab2.id, nativeTabA.id]);
    assert.deepEqual(reordered.tabOrder, [tab2.id, nativeTabA.id]);

    // 8. Delete tab (Lab Work)
    await sheetHubStore.deleteNativeTab(userA, nativeSheetA.id, tab2.id);
    const finalTabs = await sheetHubStore.listTabsForConnection(userA, nativeSheetA.id);
    assert.equal(finalTabs.length, 1);
    assert.equal(finalTabs[0].id, nativeTabA.id);
  });

  // --------------------------------------------------------------------------
  // Item 16: Account switching clears cache cleanly
  // --------------------------------------------------------------------------
  it('Item 16: Account switching clears user cache cleanly without leaking data', async () => {
    sheetHubStore.clearUserCache(userA);

    // User B's sheets remain completely intact
    clientDataCache.setActiveUser(userB);
    const bobSheets = await sheetHubStore.listConnections(userB);
    assert.equal(bobSheets.length, 1);
    assert.equal(bobSheets[0].id, nativeSheetB.id);

    // User A's memory cache is completely purged
    const aliceCached = clientDataCache.get(`sheet_hub_conns_${userA}`, undefined, userA);
    assert.equal(aliceCached, null, "User A's memory cache must be purged upon clearing cache");
  });

  after(async () => {
    if (db) {
      try {
        await terminate(db);
      } catch {
        // Ignore if already terminated
      }
    }
  });
});
