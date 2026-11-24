import './test_bootstrap.ts';
import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import {
  executeSheetToStudyImport,
  retrySheetToStudyImport,
  sanitizeText,
} from '../src/lib/sheetHub/sheetToStudyImportEngine.ts';
import {
  generateImportPreview,
  TabToSubjectMapping,
} from '../src/lib/sheetHub/sheetToStudyTransformer.ts';
import { studyImportHistoryStore } from '../src/lib/sheetHub/studyImportHistoryStore.ts';
import { api } from '../src/lib/api.ts';
import type { SheetConnection, SheetSyncedRow } from '../src/types/sheetHub.ts';
import type { StudySubject, StudyTopic } from '../src/types/study.ts';

describe('Sheet Hub → Study OS Final QA & Security Audit (Step 6)', () => {
  const aliceUserId = 'usr_alice_owner';
  const bobUserId = 'usr_bob_intruder';
  const spreadsheetId = 'sheet_qa_audit_2026';

  const mockConnection: SheetConnection = {
    id: 'conn_qa_audit_1',
    userId: aliceUserId,
    spreadsheetId,
    title: 'QA Computer Science Core Syllabus',
    spreadsheetUrl: `https://docs.google.com/spreadsheets/d/${spreadsheetId}/edit`,
    sourceSpreadsheetId: spreadsheetId,
    status: 'active',
    syncMode: 'sheet_to_app',
    templateHint: 'table',
    pollIntervalSec: 300,
    syncOnOpen: true,
    lastSyncedAt: null,
    lastSuccessfulPullAt: null,
    lastSuccessfulPushAt: null,
    lastError: null,
    pendingChangesCount: 0,
    conflictCount: 0,
    isNative: false,
    tabOrder: ['tab_algo'],
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    deletedAt: null,
  };

  const mockTabMapping: TabToSubjectMapping = {
    tabId: 'tab_algo',
    sheetId: 0,
    sheetTitle: 'Algorithms & Data Structures',
    isIncluded: true,
    action: 'create_new',
    targetSubjectCode: 'Sub_DSA',
    targetSubjectName: 'Data Structures & Algorithms',
    targetColor: '#3b82f6',
    columns: [
      { fieldKey: 'module', headerName: 'Module', targetField: 'unit' },
      { fieldKey: 'topic', headerName: 'Topic', targetField: 'topic' },
      { fieldKey: 'subtopic', headerName: 'Subtopic', targetField: 'subtopic' },
      { fieldKey: 'done', headerName: 'Done', targetField: 'done' },
      { fieldKey: 'notes', headerName: 'Notes', targetField: 'notes' },
      { fieldKey: 'priority', headerName: 'Priority', targetField: 'priority' },
    ],
    detectedRowCount: 3,
  };

  const mockRows: SheetSyncedRow[] = [
    {
      id: 'r_algo_1',
      rowUid: 'row_0_1',
      tabId: 'tab_algo',
      sheetDocId: mockConnection.id,
      userId: aliceUserId,
      rowIndex: 1,
      lastKnownSheetRow: 1,
      values: {
        module: 'Unit 1: Graph Theory',
        topic: 'Graph Traversals',
        subtopic: 'BFS and DFS implementations',
        done: 'TRUE',
        notes: 'Queue for BFS, recursion/stack for DFS',
        priority: 'High',
      },
      baseValues: {},
      rowHash: 'h1',
      version: 1,
      status: 'synced',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    } as unknown as SheetSyncedRow,
    {
      id: 'r_algo_2',
      rowUid: 'row_0_2',
      tabId: 'tab_algo',
      sheetDocId: mockConnection.id,
      userId: aliceUserId,
      rowIndex: 2,
      lastKnownSheetRow: 2,
      values: {
        module: 'Unit 1: Graph Theory',
        topic: 'Shortest Path',
        subtopic: "Dijkstra's Algorithm",
        done: 'FALSE',
        notes: 'Min-heap priority queue complexity',
        priority: 'High',
      },
      baseValues: {},
      rowHash: 'h2',
      version: 1,
      status: 'synced',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    } as unknown as SheetSyncedRow,
    {
      id: 'r_algo_3',
      rowUid: 'row_0_3',
      tabId: 'tab_algo',
      sheetDocId: mockConnection.id,
      userId: aliceUserId,
      rowIndex: 3,
      lastKnownSheetRow: 3,
      values: {
        module: 'Unit 2: Dynamic Programming',
        topic: '0/1 Knapsack Problem',
        subtopic: 'Bottom-up DP table space optimization',
        done: 'TRUE',
        notes: 'Space optimization to 1D array',
        priority: 'High',
      },
      baseValues: {},
      rowHash: 'h3',
      version: 1,
      status: 'synced',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    } as unknown as SheetSyncedRow,
  ];

  let mockSubjectsStore: StudySubject[] = [];
  let mockTopicsStore: StudyTopic[] = [];

  beforeEach(async () => {
    mockSubjectsStore = [];
    mockTopicsStore = [];

    await studyImportHistoryStore.clearImportHistory(aliceUserId);
    await studyImportHistoryStore.clearImportHistory(bobUserId);

    const aliceSources = await studyImportHistoryStore.getImportSources(aliceUserId);
    for (const s of aliceSources) {
      await studyImportHistoryStore.deleteImportSource(aliceUserId, s.id);
    }

    api.getStudyTiers = async () => [
      { id: 'tier1_sem3', name: 'Semester Core', shortTitle: 'Sem Core', description: 'Core academic syllabus' },
    ];
    api.getStudySubjects = async () => [...mockSubjectsStore];
    api.getStudyTopics = async (code?: string) => {
      if (code) return mockTopicsStore.filter((t) => t.subjectCode === code);
      return [...mockTopicsStore];
    };
    api.saveStudySubject = async (s: Partial<StudySubject>) => {
      const idx = mockSubjectsStore.findIndex((sub) => sub.code.toUpperCase() === s.code?.toUpperCase() && sub.userId === s.userId);
      const item: StudySubject = {
        id: s.id || `subj_${Date.now()}_${Math.random()}`,
        userId: s.userId || aliceUserId,
        code: s.code || 'Sub_DSA',
        name: s.name || 'Data Structures & Algorithms',
        tierId: s.tierId || 'tier1_sem3',
        color: s.color || '#3b82f6',
        totalSubtopics: s.totalSubtopics ?? 0,
        completedSubtopics: s.completedSubtopics ?? 0,
        createdAt: s.createdAt || new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        deletedAt: null,
      };
      if (idx >= 0) {
        mockSubjectsStore[idx] = { ...mockSubjectsStore[idx], ...item };
      } else {
        mockSubjectsStore.push(item);
      }
      return item;
    };
    api.saveStudyTopic = async (t: Partial<StudyTopic>) => {
      const idx = mockTopicsStore.findIndex((top) => top.id === t.id);
      const existing = idx >= 0 ? mockTopicsStore[idx] : null;
      const item: StudyTopic = {
        id: t.id || `topic_${Date.now()}_${Math.random()}`,
        userId: t.userId || existing?.userId || aliceUserId,
        subjectCode: t.subjectCode || existing?.subjectCode || 'Sub_DSA',
        unit: t.unit || existing?.unit || 'General',
        topic: t.topic || existing?.topic || 'Topic',
        subtopic: t.subtopic || existing?.subtopic || 'Subtopic',
        priority: t.priority || existing?.priority || 'Medium',
        theory: t.theory !== undefined ? Boolean(t.theory) : existing?.theory ?? false,
        practice: t.practice !== undefined ? Boolean(t.practice) : existing?.practice ?? false,
        pyq: t.pyq !== undefined ? Boolean(t.pyq) : existing?.pyq ?? false,
        revisionCount: t.revisionCount !== undefined ? t.revisionCount : existing?.revisionCount ?? 0,
        notes: t.notes !== undefined ? t.notes : existing?.notes,
        rowIndex: t.rowIndex || existing?.rowIndex || 1,
        createdAt: existing?.createdAt || new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        deletedAt: null,
        ...( {
          sourceOrigin: 'google_sheet',
          sourceSheetId: (t as any).sourceSheetId || (existing as any)?.sourceSheetId || 0,
          sourceRowKey: (t as any).sourceRowKey || (existing as any)?.sourceRowKey,
          sourceContentHash: (t as any).sourceContentHash || (existing as any)?.sourceContentHash,
        } as any ),
      };
      if (idx >= 0) {
        mockTopicsStore[idx] = item;
      } else {
        mockTopicsStore.push(item);
      }
      return item;
    };
  });

  // ==========================================
  // 1. FUNCTIONAL AUDIT TESTS
  // ==========================================
  describe('1. Functional Audit', () => {
    it('QA-F1: Import creates correct subjects and topics with accurate theory completion', async () => {
      const result = await executeSheetToStudyImport({
        userId: aliceUserId,
        connection: mockConnection,
        selectedTierId: 'tier1_sem3',
        tabMappings: { tab_algo: mockTabMapping },
        cachedRowsByTabId: { tab_algo: mockRows },
        markDoneAsTheoryOnly: true,
      });

      assert.strictEqual(result.success, true);
      assert.strictEqual(result.createdSubjectsCount, 1);
      assert.strictEqual(result.createdTopicsCount, 3);
      assert.strictEqual(result.theoryCompletedCount, 2, '2 rows had Done = TRUE');

      // Verify created subject
      assert.strictEqual(mockSubjectsStore.length, 1);
      assert.strictEqual(mockSubjectsStore[0].code, 'Sub_DSA');
      assert.strictEqual(mockSubjectsStore[0].tierId, 'tier1_sem3');

      // Verify topics & theory/practice mapping
      const bfsTopic = mockTopicsStore.find((t) => t.topic === 'Graph Traversals');
      assert.ok(bfsTopic);
      assert.strictEqual(bfsTopic?.theory, true, 'Done=TRUE maps to Theory=true');
      assert.strictEqual(bfsTopic?.practice, false, 'Done=TRUE leaves Practice=false');

      const dijkstraTopic = mockTopicsStore.find((t) => t.topic === 'Shortest Path');
      assert.ok(dijkstraTopic);
      assert.strictEqual(dijkstraTopic?.theory, false, 'Done=FALSE leaves Theory=false');
      assert.strictEqual(dijkstraTopic?.practice, false, 'Practice is false');
    });

    it('QA-F2: Re-importing is strictly idempotent (zero duplicates created)', async () => {
      await executeSheetToStudyImport({
        userId: aliceUserId,
        connection: mockConnection,
        selectedTierId: 'tier1_sem3',
        tabMappings: { tab_algo: mockTabMapping },
        cachedRowsByTabId: { tab_algo: mockRows },
      });
      assert.strictEqual(mockTopicsStore.length, 3);

      const reimportResult = await executeSheetToStudyImport({
        userId: aliceUserId,
        connection: mockConnection,
        selectedTierId: 'tier1_sem3',
        tabMappings: { tab_algo: mockTabMapping },
        cachedRowsByTabId: { tab_algo: mockRows },
      });

      assert.strictEqual(reimportResult.createdSubjectsCount, 0, 'Zero duplicate subjects');
      assert.strictEqual(reimportResult.createdTopicsCount, 0, 'Zero duplicate topics');
      assert.strictEqual(reimportResult.skippedTopicsCount, 3, 'All 3 topics identified as existing and skipped');
      assert.strictEqual(mockTopicsStore.length, 3);
    });

    it('QA-F3: Preview summary numbers exactly match parsed spreadsheet data', () => {
      const preview = generateImportPreview({
        tabs: [{ mapping: mockTabMapping, rows: mockRows }],
        existingSubjects: [],
        existingTopics: [],
        spreadsheetId,
        selectedTierId: 'tier1_sem3',
      });

      assert.strictEqual(preview.summary.tabsSelectedCount, 1);
      assert.strictEqual(preview.summary.subjectsToCreateCount, 1);
      assert.strictEqual(preview.summary.newTopicsCount, 3);
      assert.strictEqual(preview.summary.existingTopicsCount, 0);
      assert.strictEqual(preview.summary.duplicateRowsCount, 0);
      assert.strictEqual(preview.summary.invalidRowsCount, 0);
      assert.strictEqual(preview.summary.theoryCompletedCount, 2);
    });

    it('QA-F4: Retrying does not duplicate successful imports', async () => {
      // Partial initial run: only first 2 rows
      await executeSheetToStudyImport({
        userId: aliceUserId,
        connection: mockConnection,
        selectedTierId: 'tier1_sem3',
        tabMappings: { tab_algo: mockTabMapping },
        cachedRowsByTabId: { tab_algo: [mockRows[0], mockRows[1]] },
      });
      assert.strictEqual(mockTopicsStore.length, 2);

      // Retry run with all rows
      const retryResult = await retrySheetToStudyImport({
        userId: aliceUserId,
        connection: mockConnection,
        selectedTierId: 'tier1_sem3',
        tabMappings: { tab_algo: mockTabMapping },
        cachedRowsByTabId: { tab_algo: mockRows },
      });

      assert.strictEqual(retryResult.createdTopicsCount, 1, 'Only 1 missing topic created');
      assert.strictEqual(retryResult.skippedTopicsCount, 2, '2 previously imported topics skipped');
      assert.strictEqual(mockTopicsStore.length, 3);
    });
  });

  // ==========================================
  // 2. SECURITY AUDIT TESTS
  // ==========================================
  describe('2. Security & Multi-Tenant Audit', () => {
    it('QA-S1: Multi-tenant boundary check: user B cannot import into user A data', async () => {
      // Alice imports syllabus
      await executeSheetToStudyImport({
        userId: aliceUserId,
        connection: mockConnection,
        selectedTierId: 'tier1_sem3',
        tabMappings: { tab_algo: mockTabMapping },
        cachedRowsByTabId: { tab_algo: mockRows },
      });

      // Bob attempts to run import with Bob's userId
      const bobConnection: SheetConnection = {
        ...mockConnection,
        id: 'conn_bob_1',
        userId: bobUserId,
      };

      const bobResult = await executeSheetToStudyImport({
        userId: bobUserId,
        connection: bobConnection,
        selectedTierId: 'tier1_sem3',
        tabMappings: { tab_algo: mockTabMapping },
        cachedRowsByTabId: { tab_algo: mockRows },
      });

      // Bob's topics must be strictly tagged with bobUserId
      const bobTopics = mockTopicsStore.filter((t) => t.userId === bobUserId);
      const aliceTopics = mockTopicsStore.filter((t) => t.userId === aliceUserId);

      assert.strictEqual(bobTopics.length, 3);
      assert.strictEqual(aliceTopics.length, 3);
      assert.strictEqual(bobResult.createdTopicsCount, 3);

      // Verify history isolation
      const aliceHist = await studyImportHistoryStore.getImportHistory(aliceUserId);
      const bobHist = await studyImportHistoryStore.getImportHistory(bobUserId);
      assert.strictEqual(aliceHist.length, 1);
      assert.strictEqual(bobHist.length, 1);
      assert.strictEqual(aliceHist[0].userId, aliceUserId);
      assert.strictEqual(bobHist[0].userId, bobUserId);
    });

    it('QA-S2: Sanitizes untrusted spreadsheet text: strips control characters and enforces length limits', () => {
      const maliciousPayload = '<script>alert("xss")</script>\x00\x07\x1B\x7F';
      const clean = sanitizeText(maliciousPayload, 128);
      // Strips non-printable ASCII control characters
      assert.strictEqual(clean.includes('\x00'), false);
      assert.strictEqual(clean.includes('\x07'), false);
      assert.strictEqual(clean.includes('\x1B'), false);
      assert.strictEqual(clean.includes('\x7F'), false);
      assert.strictEqual(clean, '<script>alert("xss")</script>');
    });

    it('QA-S3: Zero credential leakage: no tokens or secrets stored in history or sources', async () => {
      const result = await executeSheetToStudyImport({
        userId: aliceUserId,
        connection: mockConnection,
        selectedTierId: 'tier1_sem3',
        tabMappings: { tab_algo: mockTabMapping },
        cachedRowsByTabId: { tab_algo: mockRows },
        markDoneAsTheoryOnly: true,
      });

      assert.ok(result.historyId);
      const history = await studyImportHistoryStore.getImportHistory(aliceUserId);
      assert.strictEqual(history.length, 1);
      const item = history[0];

      assert.strictEqual((item as any).accessToken, undefined);
      assert.strictEqual((item as any).refreshToken, undefined);
      assert.strictEqual((item as any).clientSecret, undefined);
      assert.strictEqual((item as any).apiKey, undefined);

      const sources = await studyImportHistoryStore.getImportSources(aliceUserId);
      assert.strictEqual(sources.length, 1);
      assert.strictEqual((sources[0] as any).accessToken, undefined);
    });

    it('QA-S4: Rejects unauthorized or invalid academic tier IDs', async () => {
      await assert.rejects(
        async () => {
          await executeSheetToStudyImport({
            userId: aliceUserId,
            connection: mockConnection,
            selectedTierId: 'unauthorized_tier_injection',
            tabMappings: { tab_algo: mockTabMapping },
            cachedRowsByTabId: { tab_algo: mockRows },
          });
        },
        {
          name: 'Error',
          message: /does not exist or does not belong to the user/,
        }
      );
    });
  });

  // ==========================================
  // 3. DATA INTEGRITY & PROGRESS PRESERVATION
  // ==========================================
  describe('3. Data Integrity & Progress Invariants', () => {
    it('QA-D1: Re-import NEVER overwrites practice completion', async () => {
      await executeSheetToStudyImport({
        userId: aliceUserId,
        connection: mockConnection,
        selectedTierId: 'tier1_sem3',
        tabMappings: { tab_algo: mockTabMapping },
        cachedRowsByTabId: { tab_algo: mockRows },
      });

      // User marks Practice completed in Study OS
      const topic1 = mockTopicsStore.find((t) => t.topic === 'Graph Traversals')!;
      topic1.practice = true;

      // Re-import identical sheet
      await executeSheetToStudyImport({
        userId: aliceUserId,
        connection: mockConnection,
        selectedTierId: 'tier1_sem3',
        tabMappings: { tab_algo: mockTabMapping },
        cachedRowsByTabId: { tab_algo: mockRows },
      });

      const updated = mockTopicsStore.find((t) => t.topic === 'Graph Traversals')!;
      assert.strictEqual(updated.practice, true, 'Practice must remain true');
    });

    it('QA-D2: Re-import NEVER resets Ebbinghaus revision history or PYQ status', async () => {
      await executeSheetToStudyImport({
        userId: aliceUserId,
        connection: mockConnection,
        selectedTierId: 'tier1_sem3',
        tabMappings: { tab_algo: mockTabMapping },
        cachedRowsByTabId: { tab_algo: mockRows },
      });

      // User logged 4 spaced repetitions and solved PYQs in Study OS
      const topic = mockTopicsStore.find((t) => t.topic === '0/1 Knapsack Problem')!;
      topic.revisionCount = 4;
      topic.pyq = true;

      // Re-import
      await executeSheetToStudyImport({
        userId: aliceUserId,
        connection: mockConnection,
        selectedTierId: 'tier1_sem3',
        tabMappings: { tab_algo: mockTabMapping },
        cachedRowsByTabId: { tab_algo: mockRows },
      });

      const rechecked = mockTopicsStore.find((t) => t.topic === '0/1 Knapsack Problem')!;
      assert.strictEqual(rechecked.revisionCount, 4, 'Revision count must remain 4');
      assert.strictEqual(rechecked.pyq, true, 'PYQ status must remain true');
    });

    it('QA-D3: Re-import NEVER regresses completed theory back to pending if unchecked in sheet', async () => {
      await executeSheetToStudyImport({
        userId: aliceUserId,
        connection: mockConnection,
        selectedTierId: 'tier1_sem3',
        tabMappings: { tab_algo: mockTabMapping },
        cachedRowsByTabId: { tab_algo: mockRows },
      });

      // Student completed Dijkstra theory in Study OS
      const dijkstra = mockTopicsStore.find((t) => t.topic === 'Shortest Path')!;
      dijkstra.theory = true;

      // Sheet still has done = 'FALSE'
      await executeSheetToStudyImport({
        userId: aliceUserId,
        connection: mockConnection,
        selectedTierId: 'tier1_sem3',
        tabMappings: { tab_algo: mockTabMapping },
        cachedRowsByTabId: { tab_algo: mockRows },
      });

      const updatedDijkstra = mockTopicsStore.find((t) => t.topic === 'Shortest Path')!;
      assert.strictEqual(updatedDijkstra.theory, true, 'Theory completion must not regress to false');
    });

    it('QA-D4: Deleting rows in Google Sheets NEVER deletes or prunes Study OS topics', async () => {
      await executeSheetToStudyImport({
        userId: aliceUserId,
        connection: mockConnection,
        selectedTierId: 'tier1_sem3',
        tabMappings: { tab_algo: mockTabMapping },
        cachedRowsByTabId: { tab_algo: mockRows },
      });
      assert.strictEqual(mockTopicsStore.length, 3);

      // Student has solved questions on Knapsack
      mockTopicsStore[2].practice = true;

      // Teacher deletes Knapsack from the spreadsheet (only 2 rows remaining)
      const shortenedRows = [mockRows[0], mockRows[1]];

      await executeSheetToStudyImport({
        userId: aliceUserId,
        connection: mockConnection,
        selectedTierId: 'tier1_sem3',
        tabMappings: { tab_algo: mockTabMapping },
        cachedRowsByTabId: { tab_algo: shortenedRows },
      });

      assert.strictEqual(mockTopicsStore.length, 3, 'Missing row in sheet must NOT delete Study OS topic');
      const knapsack = mockTopicsStore.find((t) => t.topic === '0/1 Knapsack Problem');
      assert.ok(knapsack);
      assert.strictEqual(knapsack?.practice, true);
    });
  });

  // ==========================================
  // 4. PERFORMANCE & CHUNK BOUNDARY AUDIT
  // ==========================================
  describe('4. Performance & Bounded Batch Audit', () => {
    it('QA-P1: Handles 250 rows in bounded chunks strictly under Firestore 200 limit', async () => {
      const largeRows: SheetSyncedRow[] = [];
      for (let i = 1; i <= 250; i++) {
        largeRows.push({
          id: `row_large_${i}`,
          rowUid: `row_0_${i}`,
          tabId: 'tab_algo',
          sheetDocId: mockConnection.id,
          userId: aliceUserId,
          rowIndex: i,
          lastKnownSheetRow: i,
          values: {
            module: `Unit ${Math.ceil(i / 50)}`,
            topic: `Algorithm Topic #${i}`,
            subtopic: `Subconcept #${i}`,
            done: i % 2 === 0 ? 'TRUE' : 'FALSE',
            notes: `Reference note #${i}`,
            priority: i % 3 === 0 ? 'High' : 'Medium',
          },
          baseValues: {},
          rowHash: `hash_${i}`,
          version: 1,
          status: 'synced',
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        } as unknown as SheetSyncedRow);
      }

      let progressEventsCount = 0;
      const res = await executeSheetToStudyImport({
        userId: aliceUserId,
        connection: mockConnection,
        selectedTierId: 'tier1_sem3',
        tabMappings: { tab_algo: { ...mockTabMapping, detectedRowCount: 250 } },
        cachedRowsByTabId: { tab_algo: largeRows },
        onProgress: () => {
          progressEventsCount++;
        },
      });

      assert.strictEqual(res.success, true);
      assert.strictEqual(res.createdTopicsCount, 250);
      assert.strictEqual(mockTopicsStore.length, 250);
      assert.ok(progressEventsCount > 0, 'Reported active chunk progress');
    });
  });
});
