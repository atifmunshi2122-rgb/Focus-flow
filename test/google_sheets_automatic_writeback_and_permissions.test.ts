import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {
  isSubjectMatchingTab,
  findDoneColumn,
  findMatchingRowForTopic,
  syncStudyTopicCompletionToGoogleSheets,
} from '../src/lib/sheetHub/sheetStudySyncService.ts';
import { sheetHubStore } from '../src/lib/sheetHub/sheetHubStore.ts';
import { api } from '../src/lib/api.ts';
import type { SheetColumnMapping, SheetConnection, SheetSyncedRow, SheetTabSchema } from '../src/types/sheetHub.ts';
import type { StudyTopic } from '../src/types/study.ts';

describe('Universal Sheet Sync Hub — Automatic Checkbox Write-Back & Permission Invariants', () => {
  // ==========================================================================
  // 1. SUBJECT TO TAB RESOLUTION & NORMALIZATION
  // ==========================================================================
  describe('1. Subject Code & Tab Title Resilient Matching', () => {
    it('matches COA across codes, subject names, and sheet tab titles', () => {
      assert.ok(isSubjectMatchingTab('Sub_COA', 'Computer Organization & Architecture', 'COA'));
      assert.ok(isSubjectMatchingTab('Sub_COA', 'Computer Organization & Architecture', 'Computer Organization'));
      assert.ok(isSubjectMatchingTab('COA', 'Computer Architecture', 'COA'));
      assert.ok(!isSubjectMatchingTab('Sub_COA', 'Computer Organization & Architecture', 'DBMS'));
    });

    it('matches DBMS across codes, subject names, and sheet tab titles', () => {
      assert.ok(isSubjectMatchingTab('Sub_DBMS', 'Database Management Systems', 'DBMS'));
      assert.ok(isSubjectMatchingTab('Sub_DBMS', 'Database Management Systems', 'Database'));
      assert.ok(isSubjectMatchingTab('DBMS', 'SQL Database', 'DBMS'));
      assert.ok(!isSubjectMatchingTab('Sub_DBMS', 'Database Management Systems', 'Python'));
    });

    it('matches Python across codes and tab titles', () => {
      assert.ok(isSubjectMatchingTab('Sub_Python', 'Python Programming', 'Python'));
      assert.ok(isSubjectMatchingTab('Python', 'Python for Engineers', 'Python'));
      assert.ok(isSubjectMatchingTab('Sub_Python', 'Python 3', 'PY'));
      assert.ok(!isSubjectMatchingTab('Sub_Python', 'Python Programming', 'COA'));
    });

    it('matches Prob & Stats across abbreviations and aliases', () => {
      assert.ok(isSubjectMatchingTab('Sub_ProbStats', 'Probability & Statistics', 'Prob & Stats'));
      assert.ok(isSubjectMatchingTab('Sub_ProbStats', 'Probability & Statistics', 'Probability'));
      assert.ok(isSubjectMatchingTab('Sub_ProbStats', 'Probability and Statistics', 'Stats'));
      assert.ok(!isSubjectMatchingTab('Sub_ProbStats', 'Probability & Statistics', 'OS'));
    });
  });

  // ==========================================================================
  // 2. DONE COLUMN DISCOVERY & TOPIC ROW MATCHING
  // ==========================================================================
  describe('2. Column Discovery & Composite Key Matching', () => {
    const mockColumns: SheetColumnMapping[] = [
      {
        colIndex: 0,
        colLetter: 'A',
        fieldKey: 'col_a',
        headerName: 'Unit',
        displayName: 'Unit',
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
        fieldKey: 'col_b',
        headerName: 'Topic',
        displayName: 'Topic',
        inferredType: 'text',
        confirmedType: 'text',
        semanticRole: 'title',
        confidence: 'high',
        editable: false,
        requiresConfirmation: false,
      },
      {
        colIndex: 2,
        colLetter: 'C',
        fieldKey: 'col_c',
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
        colLetter: 'D',
        fieldKey: 'col_d_done',
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

    it('identifies the Done / Checkbox column accurately', () => {
      const doneCol = findDoneColumn(mockColumns);
      assert.ok(doneCol);
      assert.equal(doneCol?.colLetter, 'D');
      assert.equal(doneCol?.fieldKey, 'col_d_done');
      assert.equal(doneCol?.inferredType, 'checkbox');
    });

    it('identifies Done column by header name heuristic if semantic role is missing', () => {
      const colsNoRole: SheetColumnMapping[] = [
        {
          ...mockColumns[3],
          semanticRole: 'custom',
          inferredType: 'text',
          headerName: 'Completed',
        },
      ];
      const doneCol = findDoneColumn(colsNoRole);
      assert.ok(doneCol);
      assert.equal(doneCol?.headerName, 'Completed');
    });

    it('matches target topic row by subtopic in sheet rows', () => {
      const mockRows: SheetSyncedRow[] = [
        {
          rowUid: 'row_1',
          rowIndex: 0,
          lastKnownSheetRow: 2,
          values: { col_a: 'Unit 1', col_b: 'Digital Logic', col_c: 'Boolean Algebra', col_d_done: false },
          baseValues: { col_a: 'Unit 1', col_b: 'Digital Logic', col_c: 'Boolean Algebra', col_d_done: false },
          rowHash: 'hash1',
          version: 1,
          lastSyncOrigin: 'app',
          dirtyFields: [],
          localUpdatedAt: new Date().toISOString(),
          sheetSyncedAt: new Date().toISOString(),
          status: 'synced',
        },
        {
          rowUid: 'row_2',
          rowIndex: 1,
          lastKnownSheetRow: 3,
          values: { col_a: 'Unit 1', col_b: 'Digital Logic', col_c: 'Binary Arithmetic', col_d_done: false },
          baseValues: { col_a: 'Unit 1', col_b: 'Digital Logic', col_c: 'Binary Arithmetic', col_d_done: false },
          rowHash: 'hash2',
          version: 1,
          lastSyncOrigin: 'app',
          dirtyFields: [],
          localUpdatedAt: new Date().toISOString(),
          sheetSyncedAt: new Date().toISOString(),
          status: 'synced',
        },
      ];

      const topic: StudyTopic = {
        id: 'top_bin_arith',
        userId: 'usr_test',
        subjectCode: 'Sub_COA',
        unit: 'Unit 1',
        topic: 'Digital Logic',
        subtopic: 'Binary Arithmetic',
        priority: 'High',
        theory: false,
        practice: false,
        pyq: false,
        revisionCount: 0,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };

      const matchedRow = findMatchingRowForTopic(mockRows, topic);
      assert.ok(matchedRow);
      assert.equal(matchedRow?.rowUid, 'row_2');
      assert.equal(matchedRow?.lastKnownSheetRow, 3);
    });

    it('matches target topic row by composite topic + unit score when subtopic differs slightly', () => {
      const mockRows: SheetSyncedRow[] = [
        {
          rowUid: 'row_coa_1',
          rowIndex: 0,
          lastKnownSheetRow: 5,
          values: { col_a: 'Module 2: Memory', col_b: 'Cache Hierarchy', col_d_done: false },
          baseValues: { col_a: 'Module 2: Memory', col_b: 'Cache Hierarchy', col_d_done: false },
          rowHash: 'hash3',
          version: 1,
          lastSyncOrigin: 'app',
          dirtyFields: [],
          localUpdatedAt: new Date().toISOString(),
          sheetSyncedAt: new Date().toISOString(),
          status: 'synced',
        },
      ];

      const topic: StudyTopic = {
        id: 'top_cache',
        userId: 'usr_test',
        subjectCode: 'Sub_COA',
        unit: 'Memory',
        topic: 'Cache Hierarchy',
        subtopic: 'L1/L2 Cache Organization',
        priority: 'Medium',
        theory: true,
        practice: false,
        pyq: false,
        revisionCount: 1,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };

      const matchedRow = findMatchingRowForTopic(mockRows, topic);
      assert.ok(matchedRow);
      assert.equal(matchedRow?.rowUid, 'row_coa_1');
    });
  });

  // ==========================================================================
  // 3. AUTOMATIC TOPIC COMPLETION WRITE-BACK BRIDGE
  // ==========================================================================
  describe('3. Topic Completion Write-Back Execution', () => {
    it('executes automatic writeback to sample demo connection without error', async () => {
      const testUserId = `usr_writeback_test_${Date.now()}`;
      const connId = `conn_test_coa_${Date.now()}`;
      const tabId = `${connId}__tab_0`;

      // Setup connection in store
      const mockConn: SheetConnection = {
        id: connId,
        userId: testUserId,
        ownerUid: testUserId,
        spreadsheetId: 'sem3-syllabus-sample',
        spreadsheetUrl: 'https://docs.google.com/spreadsheets/d/sem3-syllabus-sample/edit',
        title: 'Semester 3 Syllabus',
        templateHint: 'checklist',
        syncMode: 'two_way',
        pollIntervalSec: null,
        syncOnOpen: true,
        status: 'active',
        lastSyncedAt: new Date().toISOString(),
        lastSuccessfulPullAt: new Date().toISOString(),
        lastSuccessfulPushAt: null,
        lastError: null,
        pendingChangesCount: 0,
        conflictCount: 0,
        tabOrder: [tabId],
        schemaVersion: 1,
        sortOrder: 0,
        isNative: false,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        deletedAt: null,
      };

      const mockTab: SheetTabSchema = {
        id: tabId,
        connectionId: connId,
        sheetDocId: connId,
        userId: testUserId,
        ownerUid: testUserId,
        sheetId: 0,
        sheetTitle: 'COA',
        role: 'data',
        headerRowIndex: 1,
        dataStartRow: 2,
        dataEndColumn: 'D',
        identityStrategy: 'composite_key',
        identityColumns: ['unit', 'topic', 'subtopic'],
        metadataIdColumn: null,
        columns: [
          {
            colIndex: 0,
            colLetter: 'A',
            fieldKey: 'unit',
            headerName: 'Unit',
            displayName: 'Unit',
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
            semanticRole: 'title',
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
            colLetter: 'D',
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
        ],
        defaultView: 'checklist',
        groupByColumnId: 'unit',
        lastPullHash: 'hash',
        rowCount: 1,
        chunkCount: 1,
        position: 0,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };

      const mockRows: SheetSyncedRow[] = [
        {
          rowUid: 'row_coa_bin_arith',
          rowIndex: 0,
          lastKnownSheetRow: 4,
          values: {
            unit: 'Unit 1: Digital Logic',
            topic: 'Number Systems',
            subtopic: 'Binary Arithmetic',
            done: false,
          },
          baseValues: {
            unit: 'Unit 1: Digital Logic',
            topic: 'Number Systems',
            subtopic: 'Binary Arithmetic',
            done: false,
          },
          rowHash: 'hash_row_1',
          version: 1,
          lastSyncOrigin: 'app',
          dirtyFields: [],
          localUpdatedAt: new Date().toISOString(),
          sheetSyncedAt: new Date().toISOString(),
          status: 'synced',
        },
      ];

      await sheetHubStore.saveConnection(testUserId, mockConn);
      await sheetHubStore.saveTabSchema(testUserId, mockTab);
      await sheetHubStore.saveTabRowsChunked({
        userId: testUserId,
        connectionId: connId,
        tabId: tabId,
        rows: mockRows,
      });

      const topic: StudyTopic = {
        id: 'top_binary_arith_test',
        userId: testUserId,
        subjectCode: 'Sub_COA',
        unit: 'Unit 1: Digital Logic',
        topic: 'Number Systems',
        subtopic: 'Binary Arithmetic',
        priority: 'High',
        theory: true,
        practice: true,
        pyq: false,
        revisionCount: 0,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };

      // Mark topic as completed -> TRUE
      const resCompleted = await syncStudyTopicCompletionToGoogleSheets(
        testUserId,
        topic,
        true,
        'Computer Organization & Architecture'
      );

      assert.equal(resCompleted.synced, true);
      assert.equal(resCompleted.sheetTitle, 'COA');
      assert.equal(resCompleted.rowNumber, 4);
      assert.equal(resCompleted.colLetter, 'D');
      assert.equal(resCompleted.cellRef, 'COA!D4');
      assert.equal(resCompleted.value, true);

      // Verify row in store was updated with done = true
      const loadedRows = await sheetHubStore.loadTabRows(testUserId, tabId, connId);
      assert.equal(loadedRows[0].values.done, true);
      assert.equal(loadedRows[0].baseValues.done, true);

      // Unmark topic -> FALSE
      const resUnmarked = await syncStudyTopicCompletionToGoogleSheets(
        testUserId,
        topic,
        false,
        'Computer Organization & Architecture'
      );

      assert.equal(resUnmarked.synced, true);
      assert.equal(resUnmarked.cellRef, 'COA!D4');
      assert.equal(resUnmarked.value, false);

      const reloadedRows = await sheetHubStore.loadTabRows(testUserId, tabId, connId);
      assert.equal(reloadedRows[0].values.done, false);

      // Cleanup
      await sheetHubStore.deleteConnection(testUserId, connId);
    });
  });

  // ==========================================================================
  // 4. FIRESTORE PERMISSIONS & NORMALIZATION CONFORMANCE
  // ==========================================================================
  describe('4. Firestore Document Shape & Schema Conformance', () => {
    it('verifies ConnectSheetWizard saves connections with ownerUid and active user ID fallback', () => {
      const wizardPath = path.resolve('src/components/sheets-hub/ConnectSheetWizard.tsx');
      const wizardContent = fs.readFileSync(wizardPath, 'utf8');

      // Verify active user fallback logic includes firebaseUser, auth.currentUser, and user.id
      assert.match(
        wizardContent,
        /const activeUserId\s*=\s*firebaseUser\?\.uid\s*\|\|\s*auth\.currentUser\?\.uid\s*\|\|\s*user\?\.id/,
        'ConnectSheetWizard must resolve activeUserId with authenticated Firebase UID preference'
      );

      // Verify connection document explicitly sets ownerUid, schemaVersion, sortOrder, and isNative
      assert.match(wizardContent, /ownerUid:\s*activeUserId/);
      assert.match(wizardContent, /schemaVersion:\s*1/);
      assert.match(wizardContent, /sortOrder:\s*0/);
      assert.match(wizardContent, /isNative:\s*false/);
      assert.match(wizardContent, /syncMode:\s*selectedSyncMode/);
    });

    it('verifies ConnectSheetWizard UI presents two-way write authorization and updated header', () => {
      const wizardPath = path.resolve('src/components/sheets-hub/ConnectSheetWizard.tsx');
      const wizardContent = fs.readFileSync(wizardPath, 'utf8');

      assert.match(
        wizardContent,
        /Universal Sheet Sync Hub.*Checkbox Write-Back.*Two-Way Sync/,
        'Wizard subtitle must clearly indicate Checkbox Write-Back & Two-Way Sync'
      );

      assert.match(
        wizardContent,
        /Authorize Two-Way Checkbox Write-Back \(Recommended\)/,
        'Step 2 must offer prominent Two-Way Write-Back authorization button'
      );

      assert.match(
        wizardContent,
        /authorizeSheetHubWrite\(\)/,
        'Wizard must invoke authorizeSheetHubWrite to acquire spreadsheets write scope'
      );
    });

    it('verifies StudyView contains one-click topic completion and sheet sync link', () => {
      const studyViewPath = path.resolve('src/components/study/StudyView.tsx');
      const studyViewContent = fs.readFileSync(studyViewPath, 'utf8');

      assert.match(
        studyViewContent,
        /syncStudyTopicCompletionToGoogleSheets/,
        'StudyView must import and execute syncStudyTopicCompletionToGoogleSheets'
      );

      assert.match(
        studyViewContent,
        /handleToggleTopicCompleted/,
        'StudyView must provide direct handleToggleTopicCompleted handler'
      );

      assert.match(
        studyViewContent,
        /Sheet Hub Sync|Sync Checkboxes/,
        'StudyView must render a quick Sheet Hub Sync / Sync Checkboxes button'
      );
    });

    it('verifies SheetHubView allows direct checkbox toggles without blocking modal in two_way mode', () => {
      const viewPath = path.resolve('src/components/sheets-hub/SheetHubView.tsx');
      const viewContent = fs.readFileSync(viewPath, 'utf8');

      assert.match(
        viewContent,
        /pushUpdatesWithWriteAuth/,
        'SheetHubView must push cell updates via write auth'
      );
    });
  });

  // ==========================================================================
  // 5. FAILURE RESILIENCE, RETRY & ROW MOVEMENT INVARIANTS
  // ==========================================================================
  describe('5. Failure Resilience, Retry & Row Movement Invariants', () => {
    it('matches correct topic even if rows are sorted or new rows are inserted above', () => {
      // Simulating a spreadsheet where row 2 was inserted as an exam review row
      const sortedRows: SheetSyncedRow[] = [
        {
          rowUid: 'row_inserted_announcement',
          rowIndex: 0,
          lastKnownSheetRow: 2,
          values: { col_a: 'Announcements', col_b: 'Midterm Review', col_c: 'Syllabus Changes', col_d_done: false },
          baseValues: { col_a: 'Announcements', col_b: 'Midterm Review', col_c: 'Syllabus Changes', col_d_done: false },
          rowHash: 'h_ann',
          version: 1,
          lastSyncOrigin: 'sheet',
          dirtyFields: [],
          localUpdatedAt: new Date().toISOString(),
          sheetSyncedAt: new Date().toISOString(),
          status: 'synced',
        },
        {
          rowUid: 'row_original_coa_pushed_down',
          rowIndex: 1,
          lastKnownSheetRow: 14, // Pushed down from row 3 to row 14
          values: { col_a: 'Unit 1: Digital Logic', col_b: 'Number Systems', col_c: 'Binary Arithmetic', col_d_done: false },
          baseValues: { col_a: 'Unit 1: Digital Logic', col_b: 'Number Systems', col_c: 'Binary Arithmetic', col_d_done: false },
          rowHash: 'h_coa_pushed',
          version: 1,
          lastSyncOrigin: 'sheet',
          dirtyFields: [],
          localUpdatedAt: new Date().toISOString(),
          sheetSyncedAt: new Date().toISOString(),
          status: 'synced',
        },
      ];

      const topic: StudyTopic = {
        id: 'top_bin_arith_moved',
        userId: 'usr_test',
        subjectCode: 'Sub_COA',
        unit: 'Unit 1: Digital Logic',
        topic: 'Number Systems',
        subtopic: 'Binary Arithmetic',
        priority: 'High',
        theory: true,
        practice: true,
        pyq: false,
        revisionCount: 0,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };

      const matched = findMatchingRowForTopic(sortedRows, topic);
      assert.ok(matched);
      assert.equal(matched?.rowUid, 'row_original_coa_pushed_down');
      assert.equal(matched?.lastKnownSheetRow, 14, 'Resolves moved physical row 14 dynamically based on semantic keys');
    });

    it('safely handles missing write token without throwing uncaught errors and preserves local state', async () => {
      const testUser = `usr_no_token_${Date.now()}`;
      const topic: StudyTopic = {
        id: 'top_unauth',
        userId: testUser,
        subjectCode: 'Sub_COA',
        unit: 'Unit 1',
        topic: 'Logic',
        subtopic: 'Gates',
        priority: 'Low',
        theory: true,
        practice: true,
        pyq: false,
        revisionCount: 0,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };

      // When no write connections exist, returns graceful error object
      const result = await syncStudyTopicCompletionToGoogleSheets(testUser, topic, true, 'COA');
      assert.equal(result.synced, false);
      assert.equal(result.error, 'NO_WRITE_CONNECTIONS');
    });

    it('composite key scoring distinguishes between similar topics in different units', () => {
      const rowsWithDuplicateSubtopics: SheetSyncedRow[] = [
        {
          rowUid: 'row_unit1_pipeline',
          rowIndex: 0,
          lastKnownSheetRow: 3,
          values: { col_a: 'Unit 1: Datapath', col_b: 'Pipelining Basics', col_c: 'Hazards', col_d_done: false },
          baseValues: { col_a: 'Unit 1: Datapath', col_b: 'Pipelining Basics', col_c: 'Hazards', col_d_done: false },
          rowHash: 'h_u1',
          version: 1,
          lastSyncOrigin: 'sheet',
          dirtyFields: [],
          localUpdatedAt: new Date().toISOString(),
          sheetSyncedAt: new Date().toISOString(),
          status: 'synced',
        },
        {
          rowUid: 'row_unit3_pipeline',
          rowIndex: 1,
          lastKnownSheetRow: 8,
          values: { col_a: 'Unit 3: Advanced Architecture', col_b: 'Superscalar Execution', col_c: 'Hazards', col_d_done: false },
          baseValues: { col_a: 'Unit 3: Advanced Architecture', col_b: 'Superscalar Execution', col_c: 'Hazards', col_d_done: false },
          rowHash: 'h_u3',
          version: 1,
          lastSyncOrigin: 'sheet',
          dirtyFields: [],
          localUpdatedAt: new Date().toISOString(),
          sheetSyncedAt: new Date().toISOString(),
          status: 'synced',
        },
      ];

      const topicUnit3: StudyTopic = {
        id: 'top_u3_hazards',
        userId: 'usr_test',
        subjectCode: 'Sub_COA',
        unit: 'Advanced Architecture',
        topic: 'Superscalar Execution',
        subtopic: 'Hazards',
        priority: 'High',
        theory: true,
        practice: true,
        pyq: false,
        revisionCount: 0,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };

      const matched = findMatchingRowForTopic(rowsWithDuplicateSubtopics, topicUnit3);
      assert.ok(matched);
      // Even though both have subtopic "Hazards", Unit 3 composite score correctly identifies row_unit3_pipeline
      assert.equal(
        matched?.rowUid,
        'row_unit3_pipeline',
        'Matches row_unit3_pipeline via higher composite score despite identical subtopic'
      );
    });
  });
});
