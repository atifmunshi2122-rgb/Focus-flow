import './test_bootstrap.ts';
import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import {
  executeSheetToStudyImport,
  retrySheetToStudyImport,
  StudyImportCriticalReadError,
  StudyImportExecutionError,
} from '../src/lib/sheetHub/sheetToStudyImportEngine.ts';
import {
  computeSourceMappingKey,
  generateImportPreview,
  TabToSubjectMapping,
} from '../src/lib/sheetHub/sheetToStudyTransformer.ts';
import { studyImportHistoryStore } from '../src/lib/sheetHub/studyImportHistoryStore.ts';
import { api } from '../src/lib/api.ts';
import type { SheetConnection, SheetSyncedRow } from '../src/types/sheetHub.ts';
import type {
  StudySubject,
  StudyTopic,
  StudyTopicSourceMapping,
  StudyImportSession,
} from '../src/types/study.ts';

describe('Step 4 — Sheet Hub to Study OS Import Integrity & Recovery Suite', () => {
  const userId = 'usr_integrity_tester';
  const spreadsheetId = 'sheet_gate_syllabus_2026';

  const mockConnection: SheetConnection = {
    id: 'conn_integrity_1',
    userId,
    spreadsheetId,
    title: 'GATE CS 2026 Comprehensive Syllabus',
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

  const mockTabMappingAlgo: TabToSubjectMapping = {
    tabId: 'tab_algo',
    sheetId: 0,
    sheetTitle: 'Algorithms',
    isIncluded: true,
    action: 'create_new',
    targetSubjectCode: 'Sub_ALGO',
    targetSubjectName: 'Algorithms & Data Structures',
    targetColor: '#6366f1',
    columns: [
      { fieldKey: 'module', headerName: 'Unit', targetField: 'unit' },
      { fieldKey: 'topic', headerName: 'Topic', targetField: 'topic' },
      { fieldKey: 'subtopic', headerName: 'Subtopic', targetField: 'subtopic' },
      { fieldKey: 'done', headerName: 'Done', targetField: 'done' },
      { fieldKey: 'notes', headerName: 'Notes', targetField: 'notes' },
      { fieldKey: 'priority', headerName: 'Priority', targetField: 'priority' },
    ],
    detectedRowCount: 4,
  };

  let mockSubjectsStore: StudySubject[] = [];
  let mockTopicsStore: StudyTopic[] = [];
  let mockMappingsStore: StudyTopicSourceMapping[] = [];
  let mockSessionsStore: Record<string, StudyImportSession> = {};

  beforeEach(() => {
    mockSubjectsStore = [];
    mockTopicsStore = [];
    mockMappingsStore = [];
    mockSessionsStore = {};

    // Standard working API mocks
    api.getStudyTiers = async () => [
      { id: 'tier1_sem3', name: 'Semester 3', shortTitle: 'Sem 3', description: 'Core' },
      { id: 'tier3_gate', name: 'GATE CSE', shortTitle: 'GATE', description: 'Exam' },
    ];

    api.getStudySubjects = async () => [...mockSubjectsStore];

    api.getStudyTopics = async (code?: string) => {
      if (code) return mockTopicsStore.filter((t) => t.subjectCode === code);
      return [...mockTopicsStore];
    };

    api.saveStudySubject = async (s: Partial<StudySubject>) => {
      const idx = mockSubjectsStore.findIndex((sub) => sub.code === s.code);
      const item: StudySubject = {
        id: s.id || `subj_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
        userId: s.userId || userId,
        code: s.code || 'Sub_ALGO',
        name: s.name || 'Subject',
        tierId: s.tierId || 'tier3_gate',
        totalSubtopics: s.totalSubtopics || 0,
        completedSubtopics: s.completedSubtopics || 0,
        color: s.color || '#6366f1',
        createdAt: s.createdAt || new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        deletedAt: null,
        ...s,
      };
      if (idx >= 0) {
        mockSubjectsStore[idx] = item;
      } else {
        mockSubjectsStore.push(item);
      }
      return item;
    };

    api.saveStudyTopic = async (t: Partial<StudyTopic>) => {
      const idx = mockTopicsStore.findIndex((top) => top.id === t.id);
      const existing = idx >= 0 ? mockTopicsStore[idx] : undefined;
      const item: StudyTopic = {
        id: t.id || `topic_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
        userId: t.userId || existing?.userId || userId,
        subjectCode: t.subjectCode || existing?.subjectCode || 'Sub_ALGO',
        unit: t.unit !== undefined ? t.unit : (existing?.unit || 'Unit 1'),
        topic: t.topic !== undefined ? t.topic : (existing?.topic || 'General Topic'),
        subtopic: t.subtopic !== undefined ? t.subtopic : (existing?.subtopic || 'Concept'),
        priority: t.priority !== undefined ? t.priority : (existing?.priority || 'Medium'),
        theory: t.theory !== undefined ? Boolean(t.theory) : Boolean(existing?.theory),
        practice: t.practice !== undefined ? Boolean(t.practice) : Boolean(existing?.practice),
        pyq: t.pyq !== undefined ? Boolean(t.pyq) : Boolean(existing?.pyq),
        revisionCount: t.revisionCount !== undefined ? Number(t.revisionCount) : (existing?.revisionCount ?? 0),
        notes: t.notes !== undefined ? t.notes : (existing?.notes ?? ''),
        createdAt: t.createdAt || existing?.createdAt || new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        deletedAt: t.deletedAt !== undefined ? t.deletedAt : (existing?.deletedAt ?? null),
        ...t,
      };
      if (idx >= 0) {
        mockTopicsStore[idx] = item;
      } else {
        mockTopicsStore.push(item);
      }
      return item;
    };

    studyImportHistoryStore.getTopicSourceMappings = async () => [...mockMappingsStore];
    studyImportHistoryStore.saveTopicSourceMappings = async (_u: string, mappings: StudyTopicSourceMapping[]) => {
      mockMappingsStore = [...mappings];
    };

    studyImportHistoryStore.getImportSession = async (_u: string, sId: string) => mockSessionsStore[sId] || null;
    studyImportHistoryStore.saveImportSession = async (_u: string, session: StudyImportSession) => {
      mockSessionsStore[session.sessionId] = { ...session };
    };
  });

  // ==========================================================================
  // 1. FAILED-READ BEHAVIOR TESTS
  // ==========================================================================
  describe('1. Critical Read Failure & Zero Data Corruption', () => {
    it('stops before any write when getStudyTiers throws a network error', async () => {
      api.getStudyTiers = async () => {
        throw new Error('Network timeout: could not reach Firestore service');
      };

      const rows: SheetSyncedRow[] = [
        {
          id: 'r1',
          rowUid: 'row_algo_1',
          tabId: 'tab_algo',
          sheetDocId: mockConnection.id,
          userId,
          rowIndex: 1,
          values: { module: 'Unit 1', topic: 'Graphs', subtopic: 'DFS', done: 'TRUE' },
        } as unknown as SheetSyncedRow,
      ];

      await assert.rejects(
        async () => {
          await executeSheetToStudyImport({
            userId,
            connection: mockConnection,
            selectedTierId: 'tier3_gate',
            tabMappings: { tab_algo: mockTabMappingAlgo },
            cachedRowsByTabId: { tab_algo: rows },
          });
        },
        (err: any) => {
          assert.strictEqual(err.name, 'StudyImportCriticalReadError');
          assert.strictEqual(err.code, 'TIERS_READ_FAILED');
          assert.match(err.message, /Failed to read academic tiers/);
          return true;
        }
      );

      // Verify ZERO writes occurred
      assert.strictEqual(mockSubjectsStore.length, 0, 'No subjects must be written when tiers read fails');
      assert.strictEqual(mockTopicsStore.length, 0, 'No topics must be written when tiers read fails');
    });

    it('stops before any write when getStudySubjects throws a 500 error', async () => {
      api.getStudySubjects = async () => {
        throw new Error('500 Internal Server Error: Firestore query failed');
      };

      const rows: SheetSyncedRow[] = [
        {
          id: 'r1',
          rowUid: 'row_algo_1',
          tabId: 'tab_algo',
          sheetDocId: mockConnection.id,
          userId,
          rowIndex: 1,
          values: { module: 'Unit 1', topic: 'Graphs', subtopic: 'DFS', done: 'TRUE' },
        } as unknown as SheetSyncedRow,
      ];

      await assert.rejects(
        async () => {
          await executeSheetToStudyImport({
            userId,
            connection: mockConnection,
            selectedTierId: 'tier3_gate',
            tabMappings: { tab_algo: mockTabMappingAlgo },
            cachedRowsByTabId: { tab_algo: rows },
          });
        },
        (err: any) => {
          assert.strictEqual(err.name, 'StudyImportCriticalReadError');
          assert.strictEqual(err.code, 'CRITICAL_DUPLICATE_CHECK_FAILED');
          assert.match(err.message, /500 Internal Server Error/);
          return true;
        }
      );

      assert.strictEqual(mockSubjectsStore.length, 0);
      assert.strictEqual(mockTopicsStore.length, 0);
    });

    it('stops before topic mutations when getStudyTopics throws an authorization error', async () => {
      api.getStudyTopics = async () => {
        throw new Error('403 Forbidden: Insufficient permissions for study_topics');
      };

      const rows: SheetSyncedRow[] = [
        {
          id: 'r1',
          rowUid: 'row_algo_1',
          tabId: 'tab_algo',
          sheetDocId: mockConnection.id,
          userId,
          rowIndex: 1,
          values: { module: 'Unit 1', topic: 'Graphs', subtopic: 'DFS', done: 'TRUE' },
        } as unknown as SheetSyncedRow,
      ];

      await assert.rejects(
        async () => {
          await executeSheetToStudyImport({
            userId,
            connection: mockConnection,
            selectedTierId: 'tier3_gate',
            tabMappings: { tab_algo: mockTabMappingAlgo },
            cachedRowsByTabId: { tab_algo: rows },
          });
        },
        (err: any) => {
          assert.strictEqual(err.name, 'StudyImportCriticalReadError');
          assert.strictEqual(err.code, 'CRITICAL_DUPLICATE_CHECK_FAILED');
          assert.match(err.message, /403 Forbidden/);
          return true;
        }
      );

      assert.strictEqual(mockTopicsStore.length, 0);
    });

    it('stops import when reading source mappings throws an error', async () => {
      studyImportHistoryStore.getTopicSourceMappings = async () => {
        throw new Error('Storage disconnected');
      };

      const rows: SheetSyncedRow[] = [
        {
          id: 'r1',
          rowUid: 'row_algo_1',
          tabId: 'tab_algo',
          sheetDocId: mockConnection.id,
          userId,
          rowIndex: 1,
          values: { module: 'Unit 1', topic: 'Graphs', subtopic: 'DFS', done: 'TRUE' },
        } as unknown as SheetSyncedRow,
      ];

      await assert.rejects(
        async () => {
          await executeSheetToStudyImport({
            userId,
            connection: mockConnection,
            selectedTierId: 'tier3_gate',
            tabMappings: { tab_algo: mockTabMappingAlgo },
            cachedRowsByTabId: { tab_algo: rows },
          });
        },
        (err: any) => {
          assert.strictEqual(err.name, 'StudyImportCriticalReadError');
          assert.strictEqual(err.code, 'CRITICAL_DUPLICATE_CHECK_FAILED');
          assert.match(err.message, /Storage disconnected/);
          return true;
        }
      );
    });

    it('succeeds normally when queries legitimately return genuine empty arrays', async () => {
      // Both subjects and topics are legitimately empty
      mockSubjectsStore = [];
      mockTopicsStore = [];

      const rows: SheetSyncedRow[] = [
        {
          id: 'r1',
          rowUid: 'row_algo_1',
          tabId: 'tab_algo',
          sheetDocId: mockConnection.id,
          userId,
          rowIndex: 1,
          values: { module: 'Unit 1', topic: 'Sorting', subtopic: 'Merge Sort', done: 'TRUE' },
        } as unknown as SheetSyncedRow,
      ];

      const result = await executeSheetToStudyImport({
        userId,
        connection: mockConnection,
        selectedTierId: 'tier3_gate',
        tabMappings: { tab_algo: mockTabMappingAlgo },
        cachedRowsByTabId: { tab_algo: rows },
      });

      assert.strictEqual(result.createdSubjectsCount, 1);
      assert.strictEqual(result.createdTopicsCount, 1);
      assert.strictEqual(mockTopicsStore.length, 1);
      assert.strictEqual(mockTopicsStore[0].subtopic, 'Merge Sort');
    });
  });

  // ==========================================================================
  // 2. TOPIC IDENTITY & UNIT DISAMBIGUATION TESTS
  // ==========================================================================
  describe('2. Topic Identity & Unit Disambiguation', () => {
    it('creates distinct topics for identical topic/subtopic names in different units', async () => {
      // "Sorting" / "Analysis" in Unit 1 (Divide and Conquer) vs Unit 2 (Linear Time Algorithms)
      const rows: SheetSyncedRow[] = [
        {
          id: 'r_unit1',
          rowUid: 'row_unit1_sort',
          tabId: 'tab_algo',
          sheetDocId: mockConnection.id,
          userId,
          rowIndex: 1,
          values: {
            module: 'Unit 1: Divide & Conquer',
            topic: 'Sorting',
            subtopic: 'Analysis',
            done: 'TRUE',
          },
        } as unknown as SheetSyncedRow,
        {
          id: 'r_unit2',
          rowUid: 'row_unit2_sort',
          tabId: 'tab_algo',
          sheetDocId: mockConnection.id,
          userId,
          rowIndex: 2,
          values: {
            module: 'Unit 2: Linear Time Algorithms',
            topic: 'Sorting',
            subtopic: 'Analysis',
            done: 'FALSE',
          },
        } as unknown as SheetSyncedRow,
      ];

      const result = await executeSheetToStudyImport({
        userId,
        connection: mockConnection,
        selectedTierId: 'tier3_gate',
        tabMappings: { tab_algo: mockTabMappingAlgo },
        cachedRowsByTabId: { tab_algo: rows },
      });

      assert.strictEqual(result.createdTopicsCount, 2, 'Must create 2 distinct topics, not collapse into 1');
      assert.strictEqual(mockTopicsStore.length, 2);

      const unit1Topic = mockTopicsStore.find((t) => t.unit.includes('Unit 1'));
      const unit2Topic = mockTopicsStore.find((t) => t.unit.includes('Unit 2'));

      assert.ok(unit1Topic, 'Unit 1 topic must exist');
      assert.ok(unit2Topic, 'Unit 2 topic must exist');
      assert.notStrictEqual(unit1Topic?.id, unit2Topic?.id);
      assert.strictEqual(unit1Topic?.theory, true);
      assert.strictEqual(unit2Topic?.theory, false);
    });

    it('matches existing topic by sourceMappingKey even when topic and subtopic are renamed', async () => {
      // Step 1: Initial import
      const originalRow: SheetSyncedRow = {
        id: 'r_orig',
        rowUid: 'row_persistent_unique_id',
        tabId: 'tab_algo',
        sheetDocId: mockConnection.id,
        userId,
        rowIndex: 1,
        values: {
          module: 'Unit 3: Dynamic Programming',
          topic: 'Knapsack Problem',
          subtopic: '0/1 Knapsack Formulation',
          done: 'TRUE',
          priority: 'Medium',
        },
      } as unknown as SheetSyncedRow;

      const firstImport = await executeSheetToStudyImport({
        userId,
        connection: mockConnection,
        selectedTierId: 'tier3_gate',
        tabMappings: { tab_algo: mockTabMappingAlgo },
        cachedRowsByTabId: { tab_algo: [originalRow] },
      });

      assert.strictEqual(firstImport.createdTopicsCount, 1);
      const createdId = mockTopicsStore[0].id;

      // Step 2: Spreadsheet author renames topic and subtopic in the same row
      const renamedRow: SheetSyncedRow = {
        id: 'r_orig',
        rowUid: 'row_persistent_unique_id', // Same persistent row identifier
        tabId: 'tab_algo',
        sheetDocId: mockConnection.id,
        userId,
        rowIndex: 1,
        values: {
          module: 'Unit 3: Dynamic Programming',
          topic: 'Advanced Dynamic Programming', // Renamed
          subtopic: '0/1 Knapsack with Space Optimization', // Renamed
          done: 'TRUE',
          priority: 'High',
        },
      } as unknown as SheetSyncedRow;

      const secondImport = await executeSheetToStudyImport({
        userId,
        connection: mockConnection,
        selectedTierId: 'tier3_gate',
        tabMappings: { tab_algo: mockTabMappingAlgo },
        cachedRowsByTabId: { tab_algo: [renamedRow] },
      });

      assert.strictEqual(secondImport.createdTopicsCount, 0, 'Must NOT create duplicate topic on rename');
      assert.strictEqual(secondImport.updatedTopicsCount, 1, 'Must update existing topic matched by source mapping');
      assert.strictEqual(mockTopicsStore.length, 1);
      assert.strictEqual(mockTopicsStore[0].id, createdId);
      assert.strictEqual(mockTopicsStore[0].topic, 'Advanced Dynamic Programming');
      assert.strictEqual(mockTopicsStore[0].subtopic, '0/1 Knapsack with Space Optimization');
      assert.strictEqual(mockTopicsStore[0].priority, 'High');
    });

    it('generates consistent sourceMappingKey using computeSourceMappingKey helper', () => {
      const key1 = computeSourceMappingKey('sheet_123', 0, 'row_456');
      const key2 = computeSourceMappingKey('sheet_123', '0', 'row_456');
      const keyDifferent = computeSourceMappingKey('sheet_123', 1, 'row_456');

      assert.strictEqual(key1, 'srowmap_sheet_123|0|row_456');
      assert.strictEqual(key1, key2);
      assert.notStrictEqual(key1, keyDifferent);
    });
  });

  // ==========================================================================
  // 3. RE-IMPORT, ROW REORDERING & ROW DELETION PRESERVATION
  // ==========================================================================
  describe('3. Re-Import Behavior & Preservation Invariants', () => {
    it('creates only new topics when new rows are appended, leaving existing untouched', async () => {
      const row1: SheetSyncedRow = {
        id: 'r1',
        rowUid: 'row_1',
        tabId: 'tab_algo',
        sheetDocId: mockConnection.id,
        userId,
        rowIndex: 1,
        values: { module: 'Unit 1', topic: 'Greedy', subtopic: 'Huffman Coding', done: 'TRUE' },
      } as unknown as SheetSyncedRow;

      await executeSheetToStudyImport({
        userId,
        connection: mockConnection,
        selectedTierId: 'tier3_gate',
        tabMappings: { tab_algo: mockTabMappingAlgo },
        cachedRowsByTabId: { tab_algo: [row1] },
      });

      assert.strictEqual(mockTopicsStore.length, 1);
      const existingTopicId = mockTopicsStore[0].id;

      // Re-import with row1 + new row2
      const row2: SheetSyncedRow = {
        id: 'r2',
        rowUid: 'row_2',
        tabId: 'tab_algo',
        sheetDocId: mockConnection.id,
        userId,
        rowIndex: 2,
        values: { module: 'Unit 1', topic: 'Greedy', subtopic: 'Activity Selection', done: 'FALSE' },
      } as unknown as SheetSyncedRow;

      const secondResult = await executeSheetToStudyImport({
        userId,
        connection: mockConnection,
        selectedTierId: 'tier3_gate',
        tabMappings: { tab_algo: mockTabMappingAlgo },
        cachedRowsByTabId: { tab_algo: [row1, row2] },
      });

      assert.strictEqual(secondResult.createdTopicsCount, 1, 'Only row2 should be created');
      assert.strictEqual(mockTopicsStore.length, 2);
      assert.strictEqual(mockTopicsStore[0].id, existingTopicId, 'Existing topic must retain identical ID');
    });

    it('does not duplicate topics when rows are reordered in the spreadsheet', async () => {
      const rowA: SheetSyncedRow = {
        id: 'r_a',
        rowUid: 'row_alpha',
        tabId: 'tab_algo',
        sheetDocId: mockConnection.id,
        userId,
        rowIndex: 1,
        lastKnownSheetRow: 1,
        values: { module: 'Unit 1', topic: 'Trees', subtopic: 'BST Insertion', done: 'TRUE' },
      } as unknown as SheetSyncedRow;

      const rowB: SheetSyncedRow = {
        id: 'r_b',
        rowUid: 'row_beta',
        tabId: 'tab_algo',
        sheetDocId: mockConnection.id,
        userId,
        rowIndex: 2,
        lastKnownSheetRow: 2,
        values: { module: 'Unit 1', topic: 'Trees', subtopic: 'AVL Rotations', done: 'FALSE' },
      } as unknown as SheetSyncedRow;

      await executeSheetToStudyImport({
        userId,
        connection: mockConnection,
        selectedTierId: 'tier3_gate',
        tabMappings: { tab_algo: mockTabMappingAlgo },
        cachedRowsByTabId: { tab_algo: [rowA, rowB] },
      });

      assert.strictEqual(mockTopicsStore.length, 2);

      // Reorder rows in sheet: rowB is row 1, rowA is row 2
      const reorderedA = { ...rowA, rowIndex: 2, lastKnownSheetRow: 2 };
      const reorderedB = { ...rowB, rowIndex: 1, lastKnownSheetRow: 1 };

      const reorderResult = await executeSheetToStudyImport({
        userId,
        connection: mockConnection,
        selectedTierId: 'tier3_gate',
        tabMappings: { tab_algo: mockTabMappingAlgo },
        cachedRowsByTabId: { tab_algo: [reorderedB, reorderedA] },
      });

      assert.strictEqual(reorderResult.createdTopicsCount, 0, 'Reordering must not create new topics');
      assert.strictEqual(mockTopicsStore.length, 2, 'Total topics must remain 2');
    });

    it('does NOT delete or prune Study OS topics when rows are deleted in Google Sheets', async () => {
      const row1: SheetSyncedRow = {
        id: 'r1',
        rowUid: 'row_1',
        tabId: 'tab_algo',
        sheetDocId: mockConnection.id,
        userId,
        rowIndex: 1,
        values: { module: 'Unit 1', topic: 'Hashing', subtopic: 'Chaining', done: 'TRUE' },
      } as unknown as SheetSyncedRow;

      const row2: SheetSyncedRow = {
        id: 'r2',
        rowUid: 'row_2',
        tabId: 'tab_algo',
        sheetDocId: mockConnection.id,
        userId,
        rowIndex: 2,
        values: { module: 'Unit 1', topic: 'Hashing', subtopic: 'Open Addressing', done: 'TRUE' },
      } as unknown as SheetSyncedRow;

      await executeSheetToStudyImport({
        userId,
        connection: mockConnection,
        selectedTierId: 'tier3_gate',
        tabMappings: { tab_algo: mockTabMappingAlgo },
        cachedRowsByTabId: { tab_algo: [row1, row2] },
      });

      assert.strictEqual(mockTopicsStore.length, 2);

      // User deleted row 2 from Google Sheet; re-import only has row 1
      const reimportResult = await executeSheetToStudyImport({
        userId,
        connection: mockConnection,
        selectedTierId: 'tier3_gate',
        tabMappings: { tab_algo: mockTabMappingAlgo },
        cachedRowsByTabId: { tab_algo: [row1] },
      });

      assert.strictEqual(reimportResult.createdTopicsCount, 0);
      assert.strictEqual(mockTopicsStore.length, 2, 'Study OS topic 2 must be preserved, NEVER pruned or deleted');
      assert.strictEqual(mockTopicsStore[1].subtopic, 'Open Addressing');
    });
  });

  // ==========================================================================
  // 4. CRITICAL PROGRESS & USER INVARIANTS PRESERVATION
  // ==========================================================================
  describe('4. Critical Progress Preservation Invariants', () => {
    it('enforces Done = TRUE maps strictly to Theory = true, leaving Practice and PYQ untouched', async () => {
      // Seed pre-existing Study OS topic with user progress
      const preExistingTopic: StudyTopic = {
        id: 'topic_user_mastered',
        userId,
        subjectCode: 'Sub_ALGO',
        unit: 'Unit 4: NP Completeness',
        topic: 'Complexity Classes',
        subtopic: '3-SAT Reduction',
        priority: 'High',
        theory: false,
        practice: true, // User completed 5 practice problems
        pyq: true, // User solved previous year question
        revisionCount: 3, // Spaced repetition count
        notes: 'Personal note: watch out for gadget clause reduction',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };
      mockTopicsStore.push(preExistingTopic);

      // Re-import with Done = true in sheet
      const incomingRow: SheetSyncedRow = {
        id: 'r_sat',
        rowUid: 'row_sat_1',
        tabId: 'tab_algo',
        sheetDocId: mockConnection.id,
        userId,
        rowIndex: 1,
        values: {
          module: 'Unit 4: NP Completeness',
          topic: 'Complexity Classes',
          subtopic: '3-SAT Reduction',
          done: 'TRUE',
          notes: '', // Empty sheet note
        },
      } as unknown as SheetSyncedRow;

      await executeSheetToStudyImport({
        userId,
        connection: mockConnection,
        selectedTierId: 'tier3_gate',
        tabMappings: { tab_algo: mockTabMappingAlgo },
        cachedRowsByTabId: { tab_algo: [incomingRow] },
      });

      const updated = mockTopicsStore.find((t) => t.id === 'topic_user_mastered');
      assert.ok(updated);
      assert.strictEqual(updated?.theory, true, 'Theory is updated to true from sheet Done checkbox');
      assert.strictEqual(updated?.practice, true, 'Practice MUST remain true');
      assert.strictEqual(updated?.pyq, true, 'PYQ MUST remain true');
      assert.strictEqual(updated?.revisionCount, 3, 'Revision count MUST remain untouched');
      assert.strictEqual(
        updated?.notes,
        'Personal note: watch out for gadget clause reduction',
        'Personal notes must NEVER be wiped out by an empty sheet cell'
      );
    });

    it('never regresses completed theory back to false if sheet unchecks Done', async () => {
      const completedTopic: StudyTopic = {
        id: 'topic_theory_done',
        userId,
        subjectCode: 'Sub_ALGO',
        unit: 'Unit 1: Basics',
        topic: 'Asymptotics',
        subtopic: 'Master Theorem',
        priority: 'Medium',
        theory: true, // Already completed
        practice: false,
        pyq: false,
        revisionCount: 1,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };
      mockTopicsStore.push(completedTopic);

      // Sheet row has Done = false / unchecked
      const incomingRow: SheetSyncedRow = {
        id: 'r_asymp',
        rowUid: 'row_asymp_1',
        tabId: 'tab_algo',
        sheetDocId: mockConnection.id,
        userId,
        rowIndex: 1,
        values: {
          module: 'Unit 1: Basics',
          topic: 'Asymptotics',
          subtopic: 'Master Theorem',
          done: 'FALSE',
        },
      } as unknown as SheetSyncedRow;

      await executeSheetToStudyImport({
        userId,
        connection: mockConnection,
        selectedTierId: 'tier3_gate',
        tabMappings: { tab_algo: mockTabMappingAlgo },
        cachedRowsByTabId: { tab_algo: [incomingRow] },
      });

      const topic = mockTopicsStore.find((t) => t.id === 'topic_theory_done');
      assert.ok(topic);
      assert.strictEqual(topic?.theory, true, 'Completed theory must NOT be downgraded to false on re-import');
    });
  });

  // ==========================================================================
  // 5. RECOVERABLE IMPORT SESSIONS & SAFE RETRIES
  // ==========================================================================
  describe('5. Recoverable Import Sessions & Safe Partial Retries', () => {
    it('creates an in_progress session, records committed IDs, and completes on success', async () => {
      const rows: SheetSyncedRow[] = [
        {
          id: 'r1',
          rowUid: 'row_1',
          tabId: 'tab_algo',
          sheetDocId: mockConnection.id,
          userId,
          rowIndex: 1,
          values: { module: 'Unit 1', topic: 'Graphs', subtopic: 'BFS', done: 'TRUE' },
        } as unknown as SheetSyncedRow,
        {
          id: 'r2',
          rowUid: 'row_2',
          tabId: 'tab_algo',
          sheetDocId: mockConnection.id,
          userId,
          rowIndex: 2,
          values: { module: 'Unit 1', topic: 'Graphs', subtopic: 'Dijkstra', done: 'FALSE' },
        } as unknown as SheetSyncedRow,
      ];

      const result = await executeSheetToStudyImport({
        userId,
        connection: mockConnection,
        selectedTierId: 'tier3_gate',
        tabMappings: { tab_algo: mockTabMappingAlgo },
        cachedRowsByTabId: { tab_algo: rows },
      });

      assert.strictEqual(result.sessionId !== undefined, true);
      assert.ok(result.sessionId);

      const session = mockSessionsStore[result.sessionId];
      assert.ok(session, 'Session must be persisted');
      assert.strictEqual(session.status, 'completed');
      assert.strictEqual(session.plannedSubjectsCount, 1);
      assert.strictEqual(session.plannedTopicsCount, 2);
      assert.strictEqual(session.committedSubjectIds.length, 1);
      assert.strictEqual(session.committedTopicIds.length, 2);
      assert.strictEqual(session.failedOperations.length, 0);
    });

    it('marks session as partial/failed on write failure and safe retry commits only uncommitted records', async () => {
      const row1: SheetSyncedRow = {
        id: 'r1',
        rowUid: 'row_rec_1',
        tabId: 'tab_algo',
        sheetDocId: mockConnection.id,
        userId,
        rowIndex: 1,
        values: { module: 'Unit 1', topic: 'DP', subtopic: 'LCS', done: 'TRUE' },
      } as unknown as SheetSyncedRow;

      const row2: SheetSyncedRow = {
        id: 'r2',
        rowUid: 'row_rec_2',
        tabId: 'tab_algo',
        sheetDocId: mockConnection.id,
        userId,
        rowIndex: 2,
        values: { module: 'Unit 1', topic: 'DP', subtopic: 'LIS', done: 'FALSE' },
      } as unknown as SheetSyncedRow;

      // Simulate failure on the second topic write during initial import
      let topicSaveCallCount = 0;
      const originalSaveStudyTopic = api.saveStudyTopic;
      api.saveStudyTopic = async (t: Partial<StudyTopic>) => {
        topicSaveCallCount++;
        if (topicSaveCallCount === 2) {
          throw new Error('Firestore write quota exceeded on topic 2');
        }
        return originalSaveStudyTopic(t);
      };

      let failedSessionId = '';
      await assert.rejects(
        async () => {
          await executeSheetToStudyImport({
            userId,
            connection: mockConnection,
            selectedTierId: 'tier3_gate',
            tabMappings: { tab_algo: mockTabMappingAlgo },
            cachedRowsByTabId: { tab_algo: [row1, row2] },
          });
        },
        (err: any) => {
          assert.strictEqual(err.name, 'StudyImportExecutionError');
          assert.ok(err.sessionId);
          failedSessionId = err.sessionId;
          return true;
        }
      );

      // Verify partial session state
      const failedSession = mockSessionsStore[failedSessionId];
      assert.ok(failedSession);
      assert.strictEqual(failedSession.status, 'partial');
      assert.strictEqual(failedSession.committedTopicIds.length, 1, 'Only 1 topic should be committed');
      assert.strictEqual(failedSession.failedOperations.length, 1, '1 operation must be recorded in failedOperations');
      assert.strictEqual(mockTopicsStore.length, 1, 'Store must only contain 1 topic');

      // Restore working saveTopic
      api.saveStudyTopic = originalSaveStudyTopic;

      // Now invoke retry with resumeSessionId
      const retryResult = await retrySheetToStudyImport({
        userId,
        connection: mockConnection,
        selectedTierId: 'tier3_gate',
        tabMappings: { tab_algo: mockTabMappingAlgo },
        cachedRowsByTabId: { tab_algo: [row1, row2] },
        resumeSessionId: failedSessionId,
      });

      // Verify that retry completed and created only the uncommitted second topic
      assert.strictEqual(retryResult.createdTopicsCount, 1, 'Retry must only create the 1 uncommitted topic');
      assert.strictEqual(mockTopicsStore.length, 2, 'Total topics must now be 2');

      const resumedSession = mockSessionsStore[failedSessionId];
      assert.ok(resumedSession);
      assert.strictEqual(resumedSession.status, 'completed', 'Session must now be completed');
      assert.strictEqual(resumedSession.committedTopicIds.length, 2);
    });

    it('ensures repeated retry execution is strictly idempotent with zero duplicate topics', async () => {
      const row1: SheetSyncedRow = {
        id: 'r1',
        rowUid: 'row_idem_1',
        tabId: 'tab_algo',
        sheetDocId: mockConnection.id,
        userId,
        rowIndex: 1,
        values: { module: 'Unit 1', topic: 'Divide & Conquer', subtopic: 'Strassen Multiplication', done: 'TRUE' },
      } as unknown as SheetSyncedRow;

      const firstResult = await executeSheetToStudyImport({
        userId,
        connection: mockConnection,
        selectedTierId: 'tier3_gate',
        tabMappings: { tab_algo: mockTabMappingAlgo },
        cachedRowsByTabId: { tab_algo: [row1] },
      });

      assert.strictEqual(firstResult.createdTopicsCount, 1);
      assert.strictEqual(mockTopicsStore.length, 1);

      // Retry same session
      const retryResult = await retrySheetToStudyImport({
        userId,
        connection: mockConnection,
        selectedTierId: 'tier3_gate',
        tabMappings: { tab_algo: mockTabMappingAlgo },
        cachedRowsByTabId: { tab_algo: [row1] },
        resumeSessionId: firstResult.sessionId,
      });

      assert.strictEqual(retryResult.createdTopicsCount, 0, 'Retry of already completed import creates 0 topics');
      assert.strictEqual(mockTopicsStore.length, 1, 'Topic store must remain at 1');
    });
  });
});
