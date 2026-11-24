import './test_bootstrap.ts';
import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import {
  executeSheetToStudyImport,
  sanitizeText,
} from '../src/lib/sheetHub/sheetToStudyImportEngine.ts';
import { api } from '../src/lib/api.ts';
import type { SheetConnection, SheetSyncedRow } from '../src/types/sheetHub.ts';
import type { AcademicTier, StudySubject, StudyTopic } from '../src/types/study.ts';
import type { TabToSubjectMapping } from '../src/lib/sheetHub/sheetToStudyTransformer.ts';

describe('Sheet Hub → Study OS Data Import Engine (Step 4)', () => {
  describe('Input Sanitization & Security Validation', () => {
    it('strips non-printable ASCII control characters from untrusted sheet text', () => {
      const dirty = 'Intro to \x00\x08Null\x1F\x7F Bytes & Text';
      const clean = sanitizeText(dirty, 256);
      assert.strictEqual(clean, 'Intro to Null Bytes & Text');
    });

    it('preserves valid newlines and tabs while trimming excess whitespace', () => {
      const multiline = '  Line 1\nLine 2\tTabbed  ';
      const clean = sanitizeText(multiline, 256);
      assert.strictEqual(clean, 'Line 1\nLine 2\tTabbed');
    });

    it('enforces maximum length bounds to prevent document bloat', () => {
      const longStr = 'a'.repeat(500);
      const capped = sanitizeText(longStr, 64);
      assert.strictEqual(capped.length, 64);
    });

    it('handles null, undefined, and non-string types safely', () => {
      assert.strictEqual(sanitizeText(null), '');
      assert.strictEqual(sanitizeText(undefined), '');
      assert.strictEqual(sanitizeText(12345), '12345');
      assert.strictEqual(sanitizeText(true), 'true');
    });
  });

  describe('Import Engine Execution & Progress Invariants', () => {
    const mockConnection: SheetConnection = {
      id: 'conn_test_1',
      userId: 'usr_test_import',
      spreadsheetId: 'test_sheet_123',
      title: 'Computer Science Syllabus 2026',
      spreadsheetUrl: 'https://docs.google.com/spreadsheets/d/test_sheet_123/edit',
      sourceSpreadsheetId: 'test_sheet_123',
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
      tabOrder: ['tab_dbms', 'tab_coa'],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      deletedAt: null,
    };

    const mockTabMappingDBMS: TabToSubjectMapping = {
      tabId: 'tab_dbms',
      sheetId: 0,
      sheetTitle: 'DBMS',
      isIncluded: true,
      action: 'create_new',
      targetSubjectCode: 'Sub_DBMS',
      targetSubjectName: 'Database Management Systems',
      targetColor: '#3b82f6',
      columns: [
        { fieldKey: 'module', headerName: 'Module', targetField: 'unit' },
        { fieldKey: 'topic', headerName: 'Topic', targetField: 'topic' },
        { fieldKey: 'subtopic', headerName: 'Subtopic', targetField: 'subtopic' },
        { fieldKey: 'done', headerName: 'Done', targetField: 'done' },
        { fieldKey: 'notes', headerName: 'Notes', targetField: 'notes' },
        { fieldKey: 'priority', headerName: 'Priority', targetField: 'priority' },
      ],
      detectedRowCount: 4,
    };

    const mockTabMappingCOA: TabToSubjectMapping = {
      tabId: 'tab_coa',
      sheetId: 1,
      sheetTitle: 'COA',
      isIncluded: true,
      action: 'create_new',
      targetSubjectCode: 'Sub_COA',
      targetSubjectName: 'Computer Organization & Architecture',
      targetColor: '#10b981',
      columns: [
        { fieldKey: 'module', headerName: 'Module', targetField: 'unit' },
        { fieldKey: 'topic', headerName: 'Topic', targetField: 'topic' },
        { fieldKey: 'subtopic', headerName: 'Subtopic', targetField: 'subtopic' },
        { fieldKey: 'done', headerName: 'Done', targetField: 'done' },
      ],
      detectedRowCount: 1,
    };

    // In-memory mock store for testing import engine without live cloud dependency
    let mockSubjectsStore: StudySubject[] = [];
    let mockTopicsStore: StudyTopic[] = [];

    beforeEach(() => {
      mockSubjectsStore = [];
      mockTopicsStore = [];

      // Intercept api methods for isolated deterministic unit testing
      api.getStudyTiers = async () => [
        { id: 'tier1_sem3', name: 'Semester Core', shortTitle: 'Sem Core', description: 'Core engineering' },
      ];
      api.getStudySubjects = async () => [...mockSubjectsStore];
      api.getStudyTopics = async (code?: string) => {
        if (code) return mockTopicsStore.filter((t) => t.subjectCode === code);
        return [...mockTopicsStore];
      };
      api.saveStudySubject = async (s: Partial<StudySubject>) => {
        const existingIdx = mockSubjectsStore.findIndex((sub) => sub.code === s.code);
        const item: StudySubject = {
          id: s.id || `subj_${Date.now()}_${Math.random()}`,
          userId: s.userId || 'usr_test_import',
          code: s.code || 'Sub_General',
          name: s.name || 'Subject',
          tierId: s.tierId || 'tier1_sem3',
          totalSubtopics: s.totalSubtopics || 0,
          completedSubtopics: s.completedSubtopics || 0,
          color: s.color || '#3b82f6',
          createdAt: s.createdAt || new Date().toISOString(),
          updatedAt: new Date().toISOString(),
          deletedAt: null,
          ...s,
        };
        if (existingIdx >= 0) {
          mockSubjectsStore[existingIdx] = item;
        } else {
          mockSubjectsStore.push(item);
        }
        return item;
      };
      api.saveStudyTopic = async (t: Partial<StudyTopic>) => {
        const existingIdx = mockTopicsStore.findIndex((top) => top.id === t.id);
        const existing = existingIdx >= 0 ? mockTopicsStore[existingIdx] : undefined;
        const item: StudyTopic = {
          id: t.id || `topic_${Date.now()}_${Math.random()}`,
          userId: t.userId || existing?.userId || 'usr_test_import',
          subjectCode: t.subjectCode || existing?.subjectCode || 'Sub_General',
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
        };
        if (existingIdx >= 0) {
          mockTopicsStore[existingIdx] = item;
        } else {
          mockTopicsStore.push(item);
        }
        return item;
      };
    });

    it('Test 1: First Import — creates subjects, topics, and sets Theory while keeping Practice false', async () => {
      const mockRows: SheetSyncedRow[] = [
        {
          id: 'r1',
          rowUid: 'r1',
          sheetDocId: 'test_sheet_123',
          tabId: 'tab_dbms',
          userId: 'usr_test_import',
          rowIndex: 1,
          values: {
            module: 'Unit 1: Foundations',
            topic: 'ER Model',
            subtopic: 'Entity Sets',
            done: true,
            notes: 'Lecture 1 notes',
            priority: 'High',
          },
        } as unknown as SheetSyncedRow,
        {
          id: 'r2',
          rowUid: 'r2',
          sheetDocId: 'test_sheet_123',
          tabId: 'tab_dbms',
          userId: 'usr_test_import',
          rowIndex: 2,
          values: {
            module: 'Unit 1: Foundations',
            topic: 'ER Model',
            subtopic: 'Attributes & Keys',
            done: false,
            notes: '',
            priority: 'Medium',
          },
        } as unknown as SheetSyncedRow,
      ];

      const result = await executeSheetToStudyImport({
        userId: 'usr_test_import',
        connection: mockConnection,
        selectedTierId: 'tier1_sem3',
        tabMappings: { tab_dbms: mockTabMappingDBMS },
        cachedRowsByTabId: { tab_dbms: mockRows },
        markDoneAsTheoryOnly: true,
      });

      assert.strictEqual(result.success, true);
      assert.strictEqual(result.createdSubjectsCount, 1);
      assert.strictEqual(result.createdTopicsCount, 2);
      assert.strictEqual(result.theoryCompletedCount, 1);

      // Verify created subject
      assert.strictEqual(mockSubjectsStore.length, 1);
      assert.strictEqual(mockSubjectsStore[0].code, 'Sub_DBMS');

      // Verify topic invariants
      assert.strictEqual(mockTopicsStore.length, 2);

      const topic1 = mockTopicsStore.find((t) => t.subtopic === 'Entity Sets');
      assert.ok(topic1);
      assert.strictEqual(topic1?.theory, true, 'Done = true must complete Theory');
      assert.strictEqual(topic1?.practice, false, 'Practice must strictly remain false');
      assert.strictEqual(topic1?.pyq, false, 'PYQ must strictly remain false');
      assert.strictEqual(topic1?.revisionCount, 0, 'Revision count must start at 0');

      const topic2 = mockTopicsStore.find((t) => t.subtopic === 'Attributes & Keys');
      assert.ok(topic2);
      assert.strictEqual(topic2?.theory, false, 'Done = false must leave Theory pending');
      assert.strictEqual(topic2?.practice, false);
    });

    it('Test 2: Repeated Import — idempotent, creates zero duplicate subjects or topics', async () => {
      const mockRows: SheetSyncedRow[] = [
        {
          id: 'r1',
          rowUid: 'r1',
          sheetDocId: 'test_sheet_123',
          tabId: 'tab_dbms',
          userId: 'usr_test_import',
          rowIndex: 1,
          values: {
            module: 'Unit 1: Foundations',
            topic: 'ER Model',
            subtopic: 'Entity Sets',
            done: true,
          },
        } as unknown as SheetSyncedRow,
      ];

      // 1st import
      await executeSheetToStudyImport({
        userId: 'usr_test_import',
        connection: mockConnection,
        selectedTierId: 'tier1_sem3',
        tabMappings: { tab_dbms: mockTabMappingDBMS },
        cachedRowsByTabId: { tab_dbms: mockRows },
      });

      assert.strictEqual(mockSubjectsStore.length, 1);
      assert.strictEqual(mockTopicsStore.length, 1);

      // 2nd import (identical data)
      const repeatResult = await executeSheetToStudyImport({
        userId: 'usr_test_import',
        connection: mockConnection,
        selectedTierId: 'tier1_sem3',
        tabMappings: { tab_dbms: mockTabMappingDBMS },
        cachedRowsByTabId: { tab_dbms: mockRows },
      });

      assert.strictEqual(repeatResult.createdSubjectsCount, 0, 'No duplicate subject created');
      assert.strictEqual(repeatResult.createdTopicsCount, 0, 'No duplicate topic created');
      assert.strictEqual(repeatResult.skippedTopicsCount, 1, 'Topic was skipped as unchanged');
      assert.strictEqual(mockSubjectsStore.length, 1);
      assert.strictEqual(mockTopicsStore.length, 1);
    });

    it('Test 3: New Rows on Re-import — creates only new topics, leaves existing untouched', async () => {
      const initialRow: SheetSyncedRow = {
        id: 'r1',
        rowUid: 'r1',
        sheetDocId: 'test_sheet_123',
        tabId: 'tab_dbms',
        userId: 'usr_test_import',
        rowIndex: 1,
        values: {
          module: 'Unit 1',
          topic: 'ER Model',
          subtopic: 'Entity Sets',
          done: true,
        },
      } as unknown as SheetSyncedRow;

      await executeSheetToStudyImport({
        userId: 'usr_test_import',
        connection: mockConnection,
        selectedTierId: 'tier1_sem3',
        tabMappings: { tab_dbms: mockTabMappingDBMS },
        cachedRowsByTabId: { tab_dbms: [initialRow] },
      });

      const secondRow: SheetSyncedRow = {
        id: 'r2',
        rowUid: 'r2',
        sheetDocId: 'test_sheet_123',
        tabId: 'tab_dbms',
        userId: 'usr_test_import',
        rowIndex: 2,
        values: {
          module: 'Unit 1',
          topic: 'ER Model',
          subtopic: 'Weak Entities',
          done: false,
        },
      } as unknown as SheetSyncedRow;

      // Re-import with both rows (1 old, 1 newly added)
      const reimportResult = await executeSheetToStudyImport({
        userId: 'usr_test_import',
        connection: mockConnection,
        selectedTierId: 'tier1_sem3',
        tabMappings: { tab_dbms: mockTabMappingDBMS },
        cachedRowsByTabId: { tab_dbms: [initialRow, secondRow] },
      });

      assert.strictEqual(reimportResult.createdTopicsCount, 1, 'Only Weak Entities was created');
      assert.strictEqual(reimportResult.skippedTopicsCount, 1, 'Entity Sets was skipped');
      assert.strictEqual(mockTopicsStore.length, 2);
    });

    it('Test 4: Changed Rows — updates approved source-owned fields', async () => {
      const initialRow: SheetSyncedRow = {
        id: 'r1',
        rowUid: 'r1',
        sheetDocId: 'test_sheet_123',
        tabId: 'tab_dbms',
        userId: 'usr_test_import',
        rowIndex: 1,
        values: {
          module: 'Unit 1',
          topic: 'ER Model',
          subtopic: 'Entity Sets',
          done: false,
          priority: 'Low',
        },
      } as unknown as SheetSyncedRow;

      await executeSheetToStudyImport({
        userId: 'usr_test_import',
        connection: mockConnection,
        selectedTierId: 'tier1_sem3',
        tabMappings: { tab_dbms: mockTabMappingDBMS },
        cachedRowsByTabId: { tab_dbms: [initialRow] },
      });

      const updatedRow: SheetSyncedRow = {
        id: 'r1',
        rowUid: 'r1',
        sheetDocId: 'test_sheet_123',
        tabId: 'tab_dbms',
        userId: 'usr_test_import',
        rowIndex: 1,
        values: {
          module: 'Unit 1: Advanced Foundations', // Updated unit
          topic: 'ER Model',
          subtopic: 'Entity Sets',
          done: true,                            // Completed in sheet
          priority: 'High',                      // Updated priority
        },
      } as unknown as SheetSyncedRow;

      const updateResult = await executeSheetToStudyImport({
        userId: 'usr_test_import',
        connection: mockConnection,
        selectedTierId: 'tier1_sem3',
        tabMappings: { tab_dbms: mockTabMappingDBMS },
        cachedRowsByTabId: { tab_dbms: [updatedRow] },
      });

      assert.strictEqual(updateResult.updatedTopicsCount, 1);
      assert.strictEqual(updateResult.createdTopicsCount, 0);

      const topic = mockTopicsStore[0];
      assert.strictEqual(topic.unit, 'Unit 1: Advanced Foundations');
      assert.strictEqual(topic.theory, true);
      assert.strictEqual(topic.priority, 'High');
    });

    it('Test 5: Duplicate Titles in Different Tabs — separate topics created for each subject', async () => {
      // Both tabs have a topic named "Unit 1" / "Introduction"
      const dbmsRow: SheetSyncedRow = {
        id: 'r_dbms_1',
        rowUid: 'r_dbms_1',
        sheetDocId: 'test_sheet_123',
        tabId: 'tab_dbms',
        userId: 'usr_test_import',
        rowIndex: 1,
        values: { module: 'Unit 1', topic: 'Introduction', subtopic: 'Overview', done: true },
      } as unknown as SheetSyncedRow;

      const coaRow: SheetSyncedRow = {
        id: 'r_coa_1',
        rowUid: 'r_coa_1',
        sheetDocId: 'test_sheet_123',
        tabId: 'tab_coa',
        userId: 'usr_test_import',
        rowIndex: 1,
        values: { module: 'Unit 1', topic: 'Introduction', subtopic: 'Overview', done: false },
      } as unknown as SheetSyncedRow;

      const result = await executeSheetToStudyImport({
        userId: 'usr_test_import',
        connection: mockConnection,
        selectedTierId: 'tier1_sem3',
        tabMappings: { tab_dbms: mockTabMappingDBMS, tab_coa: mockTabMappingCOA },
        cachedRowsByTabId: { tab_dbms: [dbmsRow], tab_coa: [coaRow] },
      });

      assert.strictEqual(result.createdSubjectsCount, 2);
      assert.strictEqual(result.createdTopicsCount, 2);

      const dbmsTopic = mockTopicsStore.find((t) => t.subjectCode === 'Sub_DBMS');
      const coaTopic = mockTopicsStore.find((t) => t.subjectCode === 'Sub_COA');
      assert.ok(dbmsTopic);
      assert.ok(coaTopic);
      assert.notStrictEqual(dbmsTopic?.id, coaTopic?.id);
      assert.strictEqual(dbmsTopic?.theory, true);
      assert.strictEqual(coaTopic?.theory, false);
    });

    it('Test 6: Blank Rows — skipped safely and counted as invalid', async () => {
      const rowsWithBlanks: SheetSyncedRow[] = [
        {
          id: 'r1',
          rowUid: 'r1',
          sheetDocId: 'test_sheet_123',
          tabId: 'tab_dbms',
          userId: 'usr_test_import',
          rowIndex: 1,
          values: { module: 'Unit 1', topic: 'Relational Model', subtopic: 'Tuples', done: true },
        } as unknown as SheetSyncedRow,
        {
          id: 'r2',
          rowUid: 'r2',
          sheetDocId: 'test_sheet_123',
          tabId: 'tab_dbms',
          userId: 'usr_test_import',
          rowIndex: 2,
          values: { module: '', topic: '', subtopic: '', done: false }, // Completely blank
        } as unknown as SheetSyncedRow,
        {
          id: 'r3',
          rowUid: 'r3',
          sheetDocId: 'test_sheet_123',
          tabId: 'tab_dbms',
          userId: 'usr_test_import',
          rowIndex: 3,
          values: { module: 'Unit 2', topic: '   ', subtopic: '', done: false }, // Whitespace only
        } as unknown as SheetSyncedRow,
      ];

      const result = await executeSheetToStudyImport({
        userId: 'usr_test_import',
        connection: mockConnection,
        selectedTierId: 'tier1_sem3',
        tabMappings: { tab_dbms: mockTabMappingDBMS },
        cachedRowsByTabId: { tab_dbms: rowsWithBlanks },
      });

      assert.strictEqual(result.createdTopicsCount, 1);
      assert.strictEqual(result.invalidRowsCount, 2, '2 blank rows safely skipped');
    });

    it('Test 7: TRUE/FALSE Checkbox Values — handles diverse spreadsheet boolean representations', async () => {
      const boolRows: SheetSyncedRow[] = [
        { id: '1', rowUid: '1', values: { module: 'U1', topic: 'T1', subtopic: 'S1', done: 'TRUE' } } as unknown as SheetSyncedRow,
        { id: '2', rowUid: '2', values: { module: 'U1', topic: 'T1', subtopic: 'S2', done: 'True' } } as unknown as SheetSyncedRow,
        { id: '3', rowUid: '3', values: { module: 'U1', topic: 'T1', subtopic: 'S3', done: 'completed' } } as unknown as SheetSyncedRow,
        { id: '4', rowUid: '4', values: { module: 'U1', topic: 'T1', subtopic: 'S4', done: '☑' } } as unknown as SheetSyncedRow,
        { id: '5', rowUid: '5', values: { module: 'U1', topic: 'T1', subtopic: 'S5', done: 'FALSE' } } as unknown as SheetSyncedRow,
        { id: '6', rowUid: '6', values: { module: 'U1', topic: 'T1', subtopic: 'S6', done: '0' } } as unknown as SheetSyncedRow,
      ];

      const result = await executeSheetToStudyImport({
        userId: 'usr_test_import',
        connection: mockConnection,
        selectedTierId: 'tier1_sem3',
        tabMappings: { tab_dbms: mockTabMappingDBMS },
        cachedRowsByTabId: { tab_dbms: boolRows },
      });

      assert.strictEqual(result.createdTopicsCount, 6);
      assert.strictEqual(result.theoryCompletedCount, 4, 'S1, S2, S3, S4 had truthy done values');

      const s1 = mockTopicsStore.find((t) => t.subtopic === 'S1');
      const s5 = mockTopicsStore.find((t) => t.subtopic === 'S5');
      assert.strictEqual(s1?.theory, true);
      assert.strictEqual(s5?.theory, false);
    });

    it('Test 8: Existing Practice Progress Preservation — Practice NEVER overwritten or reset', async () => {
      // Seed existing topic with practice = true
      const existingTopic: StudyTopic = {
        id: 'existing_top_1',
        userId: 'usr_test_import',
        subjectCode: 'Sub_DBMS',
        unit: 'Unit 1: Foundations',
        topic: 'ER Model',
        subtopic: 'Entity Sets',
        priority: 'High',
        theory: false,
        practice: true, // Student solved coding/problems
        pyq: false,
        revisionCount: 2,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };
      mockTopicsStore.push(existingTopic);

      // Re-import where sheet has Done = true
      const incomingRow: SheetSyncedRow = {
        id: 'r1',
        rowUid: 'r1',
        values: {
          module: 'Unit 1: Foundations',
          topic: 'ER Model',
          subtopic: 'Entity Sets',
          done: true,
        },
      } as unknown as SheetSyncedRow;

      await executeSheetToStudyImport({
        userId: 'usr_test_import',
        connection: mockConnection,
        selectedTierId: 'tier1_sem3',
        tabMappings: { tab_dbms: mockTabMappingDBMS },
        cachedRowsByTabId: { tab_dbms: [incomingRow] },
      });

      const updated = mockTopicsStore.find((t) => t.id === 'existing_top_1');
      assert.ok(updated);
      assert.strictEqual(updated?.theory, true, 'Theory updated to true');
      assert.strictEqual(updated?.practice, true, 'Practice must strictly remain preserved as true!');
    });

    it('Test 9: Existing Revision & PYQ Progress Preservation — intervals and PYQ untouched', async () => {
      const existingTopic: StudyTopic = {
        id: 'existing_top_2',
        userId: 'usr_test_import',
        subjectCode: 'Sub_DBMS',
        unit: 'Unit 1',
        topic: 'Relational Algebra',
        subtopic: 'Join Operations',
        priority: 'High',
        theory: true,
        practice: true,
        pyq: true,           // Student solved GATE questions
        revisionCount: 4,    // 4th Ebbinghaus repetition interval
        notes: 'Personal mnemonic notes',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };
      mockTopicsStore.push(existingTopic);

      // Incoming sheet row has notes and Done = false (e.g. unchecked by mistake in sheet)
      const incomingRow: SheetSyncedRow = {
        id: 'r2',
        rowUid: 'r2',
        values: {
          module: 'Unit 1',
          topic: 'Relational Algebra',
          subtopic: 'Join Operations',
          done: false, // Unchecked in sheet
          notes: 'Source sheet link',
        },
      } as unknown as SheetSyncedRow;

      await executeSheetToStudyImport({
        userId: 'usr_test_import',
        connection: mockConnection,
        selectedTierId: 'tier1_sem3',
        tabMappings: { tab_dbms: mockTabMappingDBMS },
        cachedRowsByTabId: { tab_dbms: [incomingRow] },
      });

      const preserved = mockTopicsStore.find((t) => t.id === 'existing_top_2');
      assert.ok(preserved);
      assert.strictEqual(preserved?.theory, true, 'Theory must NEVER regress to false if student completed it');
      assert.strictEqual(preserved?.practice, true, 'Practice must be preserved');
      assert.strictEqual(preserved?.pyq, true, 'PYQ must be preserved');
      assert.strictEqual(preserved?.revisionCount, 4, 'Revision count must be preserved');
      assert.strictEqual(preserved?.notes, 'Personal mnemonic notes', 'Personal notes must be preserved');
    });

    it('Test 10: Invalid Academic Tier Rejection — rejects nonexistent tiers with structured error', async () => {
      await assert.rejects(
        async () => {
          await executeSheetToStudyImport({
            userId: 'usr_test_import',
            connection: mockConnection,
            selectedTierId: 'invalid_tier_9999',
            tabMappings: { tab_dbms: mockTabMappingDBMS },
            cachedRowsByTabId: { tab_dbms: [] },
          });
        },
        /Academic Tier "invalid_tier_9999" does not exist/
      );
    });

    it('Test 11: Missing Source Rows in Re-import — does NOT delete Study OS topics', async () => {
      // Seed 2 existing topics in Study OS
      const t1: StudyTopic = {
        id: 't_persisted_1',
        userId: 'usr_test_import',
        subjectCode: 'Sub_DBMS',
        unit: 'Unit 1',
        topic: 'Topic A',
        subtopic: 'Subtopic A',
        priority: 'High',
        theory: true,
        practice: false,
        pyq: false,
        revisionCount: 1,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };
      const t2: StudyTopic = {
        id: 't_persisted_2',
        userId: 'usr_test_import',
        subjectCode: 'Sub_DBMS',
        unit: 'Unit 1',
        topic: 'Topic B',
        subtopic: 'Subtopic B',
        priority: 'Medium',
        theory: false,
        practice: false,
        pyq: false,
        revisionCount: 0,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };
      mockTopicsStore.push(t1, t2);

      // Incoming sheet only has Topic A (Topic B was deleted from the spreadsheet)
      const incomingRow: SheetSyncedRow = {
        id: 'r1',
        rowUid: 'r1',
        values: { module: 'Unit 1', topic: 'Topic A', subtopic: 'Subtopic A', done: true },
      } as unknown as SheetSyncedRow;

      await executeSheetToStudyImport({
        userId: 'usr_test_import',
        connection: mockConnection,
        selectedTierId: 'tier1_sem3',
        tabMappings: { tab_dbms: mockTabMappingDBMS },
        cachedRowsByTabId: { tab_dbms: [incomingRow] },
      });

      // Both topics MUST still exist in Study OS
      assert.strictEqual(mockTopicsStore.length, 2);
      assert.ok(mockTopicsStore.some((t) => t.id === 't_persisted_2'), 'Topic B was NOT deleted from Study OS');
    });
  });
});
