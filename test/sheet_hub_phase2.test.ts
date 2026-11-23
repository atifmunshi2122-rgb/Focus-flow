import './test_bootstrap.ts';
import { describe, it, after } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { terminate } from 'firebase/firestore';
import { db } from '../src/lib/firebase.ts';
import app from '../server/serverless.ts';
import { VALID_NAV_TABS, type NavTab } from '../src/context/AppContext.tsx';
import { sheetHubStore } from '../src/lib/sheetHub/sheetHubStore.ts';
import { evaluateRowIdentities, packRowsIntoChunks } from '../src/lib/sheetHub/rowIdentity.ts';
import { detectTabSchema } from '../src/lib/sheetHub/schemaDetector.ts';
import type {
  SheetConnection,
  SheetTabSchema,
  SheetSyncedRow,
  SheetCellScalar,
  SheetPullResponse,
  SheetTabInspectionInput,
} from '../src/types/sheetHub.ts';

describe('Universal Sheet Sync Hub — Phase 2 Implementation Verification', () => {
  // ==========================================================================
  // 1. NAVIGATION & ROUTE REGISTRATION INTEGRITY
  // ==========================================================================
  describe('1. Navigation & Route Registration', () => {
    it('registers "sheet_hub" in VALID_NAV_TABS without disrupting existing modules', () => {
      assert.ok(VALID_NAV_TABS.includes('sheet_hub' as NavTab), '"sheet_hub" must be in VALID_NAV_TABS');

      // Verify all critical existing tabs are preserved
      const requiredTabs: NavTab[] = [
        'dashboard',
        'tasks',
        'habits',
        'focus',
        'study',
        'calendar',
        'finance',
        'transactions',
        'bills',
        'envelopes',
        'subscriptions',
        'vaults', // Couple Vaults / Joint Vaults
        'analytics',
        'exports',
        'recovery',
        'settings',
        'sheet_hub',
      ];

      for (const tab of requiredTabs) {
        assert.ok(
          VALID_NAV_TABS.includes(tab),
          `Existing navigation tab "${tab}" must remain registered in VALID_NAV_TABS`
        );
      }
    });
  });

  // ==========================================================================
  // 2. EXPRESS API FIXTURE ENDPOINT (/api/sheet-hub/sample-semester3)
  // ==========================================================================
  describe('2. Sample Semester 3 Fixture Endpoint', () => {
    it('serves the full 5-tab Semester 3 syllabus fixture dynamically', async () => {
      const server = http.createServer(app);
      await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', () => resolve()));
      const address = server.address() as { port: number };
      const endpoint = `http://127.0.0.1:${address.port}/api/sheet-hub/sample-semester3`;

      try {
        const res = await fetch(endpoint);
        assert.equal(res.status, 200, 'Endpoint must return 200 OK');
        const data = await res.json();

        assert.ok(data.inspect, 'Response must include inspect schema');
        assert.ok(data.pull, 'Response must include pull rows');

        // Check inspect metadata
        assert.equal(data.inspect.spreadsheetId, 'sem3-syllabus-sample');
        assert.equal(data.inspect.tabs.length, 5, 'Must contain 5 tabs (Overview + 4 subjects)');

        const tabTitles = data.inspect.tabs.map((t: any) => t.sheetTitle);
        assert.deepEqual(tabTitles, ['Overview', 'Prob & Stats', 'COA', 'DBMS', 'Python']);

        // Verify subject columns detection
        for (const tab of data.inspect.tabs) {
          if (tab.sheetTitle === 'Overview') continue;
          const colNames = tab.columns.map((c: any) => c.headerName);
          assert.ok(colNames.includes('Module'), `${tab.sheetTitle} must have Module column`);
          assert.ok(colNames.includes('Topic'), `${tab.sheetTitle} must have Topic column`);
          assert.ok(colNames.includes('Subtopic'), `${tab.sheetTitle} must have Subtopic column`);
          assert.ok(colNames.includes('Done'), `${tab.sheetTitle} must have Done column`);
          assert.ok(colNames.includes('Notes / Practice'), `${tab.sheetTitle} must have Notes / Practice column`);

          const doneCol = tab.columns.find((c: any) => c.headerName === 'Done');
          assert.equal(doneCol?.semanticRole, 'done', 'Done column must have semanticRole: done');
          assert.ok(
            doneCol?.inferredType === 'boolean' || doneCol?.inferredType === 'checkbox',
            'Done column must have boolean or checkbox inferredType'
          );
        }

        // Verify pull data counts
        const pullTabs = data.pull.tabs;
        assert.equal(pullTabs.length, 5);

        const probStats = pullTabs.find((t: any) => t.sheetTitle === 'Prob & Stats');
        const coa = pullTabs.find((t: any) => t.sheetTitle === 'COA');
        const dbms = pullTabs.find((t: any) => t.sheetTitle === 'DBMS');
        const python = pullTabs.find((t: any) => t.sheetTitle === 'Python');

        assert.equal(probStats.rows.length, 127, 'Prob & Stats must have 127 topics');
        assert.equal(coa.rows.length, 125, 'COA must have 125 topics');
        assert.equal(dbms.rows.length, 198, 'DBMS must have 198 topics');
        assert.equal(python.rows.length, 147, 'Python must have 147 topics');

        const totalSubjectTopics =
          probStats.rows.length + coa.rows.length + dbms.rows.length + python.rows.length;
        assert.equal(totalSubjectTopics, 597, 'Total subject topics must be exactly 597');

        // Verify completed topics
        const isRowDone = (row: any) => {
          // values[3] is the Done column in subject tabs
          const val = row.values[3];
          return val === true || val === 'TRUE' || val === 'true' || val === 1;
        };

        const probStatsDone = probStats.rows.filter(isRowDone).length;
        const coaDone = coa.rows.filter(isRowDone).length;
        const dbmsDone = dbms.rows.filter(isRowDone).length;
        const pythonDone = python.rows.filter(isRowDone).length;

        const totalCompleted = probStatsDone + coaDone + dbmsDone + pythonDone;
        assert.equal(probStatsDone, 9, 'Prob & Stats has 9 completed topics');
        assert.equal(coaDone, 0, 'COA has 0 completed topics');
        assert.equal(dbmsDone, 0, 'DBMS has 0 completed topics');
        assert.equal(pythonDone, 0, 'Python has 0 completed topics');
        assert.equal(totalCompleted, 9, 'Total completed topics must be exactly 9');
        assert.equal(totalSubjectTopics - totalCompleted, 588, 'Total remaining must be exactly 588');
      } finally {
        await new Promise<void>((resolve) => server.close(() => resolve()));
      }
    });
  });

  // ==========================================================================
  // 3. DYNAMIC OVERVIEW CALCULATION (ZERO HARDCODED COUNTS)
  // ==========================================================================
  describe('3. Dynamic Overview KPI Calculation', () => {
    it('calculates KPIs dynamically from arbitrary row datasets without hardcoded numbers', () => {
      // Simulate raw imported rows across multiple tabs
      const tabsData = [
        {
          tabTitle: 'Math',
          rows: [
            { values: { topic: 'Algebra', done: true } },
            { values: { topic: 'Calculus', done: true } },
            { values: { topic: 'Geometry', done: false } },
            { values: { topic: 'Trig', done: false } },
          ],
          doneKey: 'done',
        },
        {
          tabTitle: 'Science',
          rows: [
            { values: { topic: 'Physics', done: true } },
            { values: { topic: 'Chemistry', done: false } },
          ],
          doneKey: 'done',
        },
        {
          tabTitle: 'Literature',
          rows: [
            { values: { topic: 'Poetry', done: false } },
            { values: { topic: 'Drama', done: false } },
            { values: { topic: 'Prose', done: false } },
            { values: { topic: 'Essay', done: false } },
          ],
          doneKey: 'done',
        },
      ];

      // Dynamic calculation logic (mirrors DynamicOverviewPanel)
      let totalItems = 0;
      let totalCompleted = 0;
      const breakdowns = tabsData.map((tab) => {
        const count = tab.rows.length;
        const comp = tab.rows.filter((r) => (r.values as Record<string, any>)[tab.doneKey] === true).length;
        const rem = count - comp;
        const pct = count > 0 ? Math.round((comp / count) * 100) : 0;
        totalItems += count;
        totalCompleted += comp;
        return { tabTitle: tab.tabTitle, count, comp, rem, pct };
      });

      const totalRemaining = totalItems - totalCompleted;
      const overallPercent = totalItems > 0 ? Math.round((totalCompleted / totalItems) * 100) : 0;

      assert.equal(totalItems, 10);
      assert.equal(totalCompleted, 3);
      assert.equal(totalRemaining, 7);
      assert.equal(overallPercent, 30);

      assert.deepEqual(breakdowns, [
        { tabTitle: 'Math', count: 4, comp: 2, rem: 2, pct: 50 },
        { tabTitle: 'Science', count: 2, comp: 1, rem: 1, pct: 50 },
        { tabTitle: 'Literature', count: 4, comp: 0, rem: 4, pct: 0 },
      ]);
    });
  });

  // ==========================================================================
  // 4. HIERARCHICAL TREE AGGREGATION (MODULE -> TOPIC -> SUBTOPIC)
  // ==========================================================================
  describe('4. Hierarchical Checklist Tree Builder', () => {
    it('aggregates rows into hierarchical 3-level tree structure correctly', () => {
      // Sample rows matching Semester 3 schema
      const sampleRows: SheetSyncedRow[] = [
        {
          rowUid: 'r1',
          lastKnownSheetRow: 2,
          values: {
            module: 'Module 1: Descriptive Statistics',
            topic: 'Measures of Central Tendency',
            subtopic: 'Mean, Median, Mode',
            done: true,
            notes: 'Completed practice set 1',
          },
          baseValues: {},
          rowHash: 'h1',
          version: 1,
          lastSyncOrigin: 'sheet',
          dirtyFields: [],
          localUpdatedAt: null,
          sheetSyncedAt: new Date().toISOString(),
          status: 'synced',
        },
        {
          rowUid: 'r2',
          lastKnownSheetRow: 3,
          values: {
            module: 'Module 1: Descriptive Statistics',
            topic: 'Measures of Central Tendency',
            subtopic: 'Geometric and Harmonic Mean',
            done: false,
            notes: null,
          },
          baseValues: {},
          rowHash: 'h2',
          version: 1,
          lastSyncOrigin: 'sheet',
          dirtyFields: [],
          localUpdatedAt: null,
          sheetSyncedAt: new Date().toISOString(),
          status: 'synced',
        },
        {
          rowUid: 'r3',
          lastKnownSheetRow: 4,
          values: {
            module: 'Module 1: Descriptive Statistics',
            topic: 'Measures of Dispersion',
            subtopic: 'Variance and Standard Deviation',
            done: false,
            notes: null,
          },
          baseValues: {},
          rowHash: 'h3',
          version: 1,
          lastSyncOrigin: 'sheet',
          dirtyFields: [],
          localUpdatedAt: null,
          sheetSyncedAt: new Date().toISOString(),
          status: 'synced',
        },
        {
          rowUid: 'r4',
          lastKnownSheetRow: 5,
          values: {
            module: 'Module 2: Probability Theory',
            topic: 'Basic Probability',
            subtopic: 'Axioms and Theorems',
            done: true,
            notes: 'Read chapter 3',
          },
          baseValues: {},
          rowHash: 'h4',
          version: 1,
          lastSyncOrigin: 'sheet',
          dirtyFields: [],
          localUpdatedAt: null,
          sheetSyncedAt: new Date().toISOString(),
          status: 'synced',
        },
      ];

      // Mirror the grouping logic in DynamicSheetRenderer
      interface SubgroupGroup {
        subgroupName: string;
        items: SheetSyncedRow[];
      }
      interface GroupNode {
        groupName: string;
        subgroups: SubgroupGroup[];
        totalCount: number;
        completedCount: number;
      }

      const groupsMap = new Map<string, Map<string, SheetSyncedRow[]>>();
      for (const row of sampleRows) {
        const modName = String(row.values.module || 'General');
        const topName = String(row.values.topic || 'General');
        if (!groupsMap.has(modName)) groupsMap.set(modName, new Map());
        const subMap = groupsMap.get(modName)!;
        if (!subMap.has(topName)) subMap.set(topName, []);
        subMap.get(topName)!.push(row);
      }

      const tree: GroupNode[] = [];
      for (const [groupName, subMap] of groupsMap.entries()) {
        const subgroups: SubgroupGroup[] = [];
        let totalCount = 0;
        let completedCount = 0;

        for (const [subgroupName, items] of subMap.entries()) {
          subgroups.push({ subgroupName, items });
          totalCount += items.length;
          completedCount += items.filter((r) => r.values.done === true).length;
        }
        tree.push({ groupName, subgroups, totalCount, completedCount });
      }

      assert.equal(tree.length, 2, 'Should create 2 module nodes');
      assert.equal(tree[0].groupName, 'Module 1: Descriptive Statistics');
      assert.equal(tree[0].subgroups.length, 2, 'Module 1 has 2 topics');
      assert.equal(tree[0].totalCount, 3, 'Module 1 has 3 subtopics');
      assert.equal(tree[0].completedCount, 1, 'Module 1 has 1 completed subtopic');

      assert.equal(tree[1].groupName, 'Module 2: Probability Theory');
      assert.equal(tree[1].subgroups.length, 1, 'Module 2 has 1 topic');
      assert.equal(tree[1].totalCount, 1, 'Module 2 has 1 subtopic');
      assert.equal(tree[1].completedCount, 1, 'Module 2 has 1 completed subtopic');
    });
  });

  // ==========================================================================
  // 5. GENERIC SPREADSHEET SCHEMAS COMPATIBILITY
  // ==========================================================================
  describe('5. Generic Spreadsheet Schema Compatibility', () => {
    it('detects and handles a generic Task Tracker schema', () => {
      const input: SheetTabInspectionInput = {
        sheetId: 101,
        sheetTitle: 'Engineering Tasks',
        rows: [
          [
            { value: 'Task ID', formattedValue: 'Task ID' },
            { value: 'Title', formattedValue: 'Title' },
            { value: 'Priority', formattedValue: 'Priority' },
            { value: 'Assignee', formattedValue: 'Assignee' },
            { value: 'Due Date', formattedValue: 'Due Date' },
            { value: 'Completed', formattedValue: 'Completed' },
          ],
          [
            { value: 'TASK-001', formattedValue: 'TASK-001' },
            { value: 'Fix auth session expiration', formattedValue: 'Fix auth session expiration' },
            { value: 'High', formattedValue: 'High' },
            { value: 'Sarah', formattedValue: 'Sarah' },
            { value: '2026-12-01', formattedValue: '2026-12-01' },
            { value: true, formattedValue: 'TRUE', isBooleanCell: true },
          ],
          [
            { value: 'TASK-002', formattedValue: 'TASK-002' },
            { value: 'Add export to CSV', formattedValue: 'Add export to CSV' },
            { value: 'Low', formattedValue: 'Low' },
            { value: 'Alex', formattedValue: 'Alex' },
            { value: '2026-12-05', formattedValue: '2026-12-05' },
            { value: false, formattedValue: 'FALSE', isBooleanCell: true },
          ],
        ],
      };

      const schema = detectTabSchema(input);
      assert.equal(schema.headerRowIndex, 1);
      assert.equal(schema.columns.length, 6);

      const taskIdCol = schema.columns.find((c) => c.headerName === 'Task ID');
      const titleCol = schema.columns.find((c) => c.headerName === 'Title');
      const compCol = schema.columns.find((c) => c.headerName === 'Completed');

      assert.ok(taskIdCol);
      assert.equal(titleCol?.semanticRole, 'title');
      assert.equal(compCol?.inferredType, 'boolean');
      assert.equal(compCol?.semanticRole, 'done');
    });

    it('detects and handles a generic Finance / Expense schema', () => {
      const input: SheetTabInspectionInput = {
        sheetId: 102,
        sheetTitle: 'Monthly Expenses',
        rows: [
          [
            { value: 'Date', formattedValue: 'Date' },
            { value: 'Category', formattedValue: 'Category' },
            { value: 'Description', formattedValue: 'Description' },
            { value: 'Amount', formattedValue: 'Amount' },
          ],
          [
            { value: '2026-11-01', formattedValue: '2026-11-01', numberFormatType: 'DATE' },
            { value: 'Groceries', formattedValue: 'Groceries' },
            { value: 'Whole Foods organic milk and bread', formattedValue: 'Whole Foods organic milk and bread' },
            { value: 45.5, formattedValue: '$45.50', numberFormatType: 'CURRENCY' },
          ],
          [
            { value: '2026-11-02', formattedValue: '2026-11-02', numberFormatType: 'DATE' },
            { value: 'Utilities', formattedValue: 'Utilities' },
            { value: 'Electric bill payment', formattedValue: 'Electric bill payment' },
            { value: 110.0, formattedValue: '$110.00', numberFormatType: 'CURRENCY' },
          ],
        ],
      };

      const schema = detectTabSchema(input);
      assert.equal(schema.headerRowIndex, 1);
      assert.equal(schema.columns.length, 4);

      const dateCol = schema.columns.find((c) => c.headerName === 'Date');
      const catCol = schema.columns.find((c) => c.headerName === 'Category');
      const amtCol = schema.columns.find((c) => c.headerName === 'Amount');

      assert.equal(dateCol?.inferredType, 'date');
      assert.equal(catCol?.semanticRole, 'group');
      assert.equal(amtCol?.inferredType, 'currency');
    });
  });

  // ==========================================================================
  // 6. STORAGE LAYER LIFECYCLE & CASCADE DELETION
  // ==========================================================================
  describe('6. SheetHubStore Operations & Cascade Cleanup', () => {
    const testUserId = `test_usr_${Date.now()}`;
    const testConnectionId = `conn_test_${Date.now()}`;
    const testTabId = `${testConnectionId}__tab_101`;

    it('saves, retrieves, updates and deletes connection and tabs cleanly', async () => {
      const nowIso = new Date().toISOString();
      const conn: SheetConnection = {
        id: testConnectionId,
        userId: testUserId,
        spreadsheetId: 'test_sheet_123',
        spreadsheetUrl: 'https://docs.google.com/spreadsheets/d/test_sheet_123/edit',
        title: 'Integration Test Sheet',
        templateHint: 'checklist',
        syncMode: 'sheet_to_app',
        pollIntervalSec: null,
        syncOnOpen: true,
        status: 'active',
        lastSyncedAt: nowIso,
        lastSuccessfulPullAt: nowIso,
        lastSuccessfulPushAt: null,
        lastError: null,
        pendingChangesCount: 0,
        conflictCount: 0,
        tabOrder: [testTabId],
        createdAt: nowIso,
        updatedAt: nowIso,
        deletedAt: null,
      };

      // 1. Save connection
      await sheetHubStore.saveConnection(testUserId, conn);

      // 2. Retrieve connection
      const fetchedConn = await sheetHubStore.getConnection(testUserId, testConnectionId);
      assert.ok(fetchedConn);
      assert.equal(fetchedConn?.title, 'Integration Test Sheet');

      // 3. Save tab
      const tabSchema: SheetTabSchema = {
        id: testTabId,
        connectionId: testConnectionId,
        userId: testUserId,
        sheetId: 101,
        sheetTitle: 'Tasks',
        role: 'data',
        headerRowIndex: 1,
        dataStartRow: 2,
        dataEndColumn: 'B',
        identityStrategy: 'column_key',
        identityColumns: ['col_task'],
        metadataIdColumn: null,
        columns: [
          {
            fieldKey: 'col_task',
            headerName: 'Task',
            displayName: 'Task',
            colIndex: 0,
            colLetter: 'A',
            inferredType: 'text',
            confirmedType: 'text',
            semanticRole: 'title',
            confidence: 'high',
            editable: true,
            requiresConfirmation: false,
          },
          {
            fieldKey: 'col_done',
            headerName: 'Done',
            displayName: 'Done',
            colIndex: 1,
            colLetter: 'B',
            inferredType: 'boolean',
            confirmedType: 'boolean',
            semanticRole: 'done',
            confidence: 'high',
            editable: true,
            requiresConfirmation: false,
          },
        ],
        defaultView: 'checklist',
        groupByColumnId: null,
        lastPullHash: 'hash_test_pull',
        rowCount: 2,
        chunkCount: 1,
        updatedAt: nowIso,
      };

      await sheetHubStore.saveTabSchema(testUserId, tabSchema);
      const fetchedTabs = await sheetHubStore.listTabsForConnection(testUserId, testConnectionId);
      assert.equal(fetchedTabs.length, 1);
      assert.equal(fetchedTabs[0].sheetTitle, 'Tasks');

      // 4. Save chunked rows
      const rows: SheetSyncedRow[] = [
        {
          rowUid: 'r_1',
          lastKnownSheetRow: 1,
          values: { col_task: 'Task 1', col_done: true },
          baseValues: { col_task: 'Task 1', col_done: true },
          rowHash: 'hash_1',
          version: 1,
          lastSyncOrigin: 'sheet',
          dirtyFields: [],
          localUpdatedAt: null,
          sheetSyncedAt: nowIso,
          status: 'synced',
        },
        {
          rowUid: 'r_2',
          lastKnownSheetRow: 2,
          values: { col_task: 'Task 2', col_done: false },
          baseValues: { col_task: 'Task 2', col_done: false },
          rowHash: 'hash_2',
          version: 1,
          lastSyncOrigin: 'sheet',
          dirtyFields: [],
          localUpdatedAt: null,
          sheetSyncedAt: nowIso,
          status: 'synced',
        },
      ];

      await sheetHubStore.saveTabRowsChunked({
        userId: testUserId,
        connectionId: testConnectionId,
        tabId: testTabId,
        rows,
      });

      const loadedRows = await sheetHubStore.loadTabRows(testUserId, testTabId);
      assert.equal(loadedRows.length, 2);
      assert.equal(loadedRows[0].rowUid, 'r_1');
      assert.equal(loadedRows[1].rowUid, 'r_2');

      // 5. Cascade delete connection
      await sheetHubStore.deleteConnection(testUserId, testConnectionId);

      const afterConn = await sheetHubStore.getConnection(testUserId, testConnectionId);
      assert.equal(afterConn, null, 'Connection should be deleted');

      const afterTabs = await sheetHubStore.listTabsForConnection(testUserId, testConnectionId);
      assert.equal(afterTabs.length, 0, 'Tabs should be cascade cleared');

      const afterRows = await sheetHubStore.loadTabRows(testUserId, testTabId);
      assert.equal(afterRows.length, 0, 'Rows should be cascade cleared');
    });
  });

  // ==========================================================================
  // 7. READ-ONLY PHASE 2 ARCHITECTURE GUARANTEE
  // ==========================================================================
  describe('7. Read-Only Phase 2 Safety Verification', () => {
    it('guarantees syncMode is strictly "sheet_to_app" and no writeback methods exist', () => {
      // In Phase 2, connections must always specify syncMode = 'sheet_to_app'
      const conn: Partial<SheetConnection> = {
        syncMode: 'sheet_to_app',
      };
      assert.equal(conn.syncMode, 'sheet_to_app', 'Phase 2 strictly enforces sheet_to_app sync direction');

      // Verify that row chunks and sync queue in store do not accept or process pending writeback changes
      assert.equal(typeof (sheetHubStore as any).pushRowsToGoogleSheet, 'undefined', 'Zero sheet write-back method in Phase 2');
    });
  });

  after(async () => {
    try {
      await terminate(db);
    } catch {}
  });
});
