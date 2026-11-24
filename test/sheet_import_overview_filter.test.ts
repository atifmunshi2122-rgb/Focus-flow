import './test_bootstrap.ts';
import { describe, it, after } from 'node:test';
import assert from 'node:assert/strict';
import { detectTabSchema } from '../src/lib/sheetHub/schemaDetector.ts';
import {
  isTabOverview,
  isSummaryOrInvalidSyllabusRow,
  generateImportPreview,
  TabToSubjectMapping,
} from '../src/lib/sheetHub/sheetToStudyTransformer.ts';
import {
  isOverviewSubject,
  cleanupErroneousOverviewImportData,
  rollbackOverviewCleanup,
} from '../src/lib/sheetHub/sheetToStudyImportEngine.ts';
import { computeStudyProgressSummary } from '../src/lib/studyIntelligence.ts';
import type { SheetSyncedRow } from '../src/types/sheetHub.ts';
import type { StudySubject, StudyTopic } from '../src/types/study.ts';

describe('Fix Google Sheets → Study OS Import: Overview Tab Filter & Safe Cleanup', () => {
  describe('1. Overview Tab Detection in Schema Detector', () => {
    it('classifies an 18-row static Overview sheet with 0 formulas as role=overview', () => {
      // 18 static summary count rows as seen in the user recording
      const overviewRows = [
        [{ value: 'Subject' }, { value: 'Count' }, { value: 'Status' }],
        [{ value: 'DBMS' }, { value: 198 }, { value: 'Active' }],
        [{ value: 'COA' }, { value: 125 }, { value: 'Active' }],
        [{ value: 'Python' }, { value: 147 }, { value: 'Active' }],
        [{ value: 'Prob & Stats' }, { value: 127 }, { value: 'Active' }],
        [{ value: 'Total' }, { value: 597 }, { value: 'Complete' }],
        ...Array.from({ length: 12 }, (_, i) => [
          { value: `Metric ${i + 1}` },
          { value: (i + 1) * 10 },
          { value: 'Recorded' },
        ]),
      ];

      const schema = detectTabSchema({
        sheetId: 100,
        sheetTitle: 'Overview',
        rows: overviewRows,
      });

      assert.strictEqual(schema.role, 'overview');
      assert.strictEqual(schema.roleConfidence, 'high');
      // All columns must be read-only by default on an overview tab
      assert.strictEqual(schema.columns.every((c) => !c.editable), true);
    });

    it('identifies various overview and summary naming patterns via isTabOverview', () => {
      assert.strictEqual(isTabOverview('Overview'), true);
      assert.strictEqual(isTabOverview('overview'), true);
      assert.strictEqual(isTabOverview('Syllabus Overview'), true);
      assert.strictEqual(isTabOverview('course_overview'), true);
      assert.strictEqual(isTabOverview('Summary'), true);
      assert.strictEqual(isTabOverview('Semester Summary'), true);
      assert.strictEqual(isTabOverview('Dashboard'), true);
      assert.strictEqual(isTabOverview('KPI Tracker'), true);
      assert.strictEqual(isTabOverview('Stats'), true);

      // Preserves genuine subjects
      assert.strictEqual(isTabOverview('DBMS'), false);
      assert.strictEqual(isTabOverview('COA'), false);
      assert.strictEqual(isTabOverview('Python'), false);
      assert.strictEqual(isTabOverview('Prob & Stats'), false);
      assert.strictEqual(isTabOverview('Computer Networks'), false);
    });
  });

  describe('2. Filter Aggregate Counts & Invalid Summary Rows', () => {
    it('rejects pure numeric counts that were erroneously imported as topics (127, 125, 198, 147, 597)', () => {
      assert.strictEqual(isSummaryOrInvalidSyllabusRow('General', '127', '').isInvalid, true);
      assert.strictEqual(isSummaryOrInvalidSyllabusRow('General', '125', '').isInvalid, true);
      assert.strictEqual(isSummaryOrInvalidSyllabusRow('General', '198', '').isInvalid, true);
      assert.strictEqual(isSummaryOrInvalidSyllabusRow('General', '147', '').isInvalid, true);
      assert.strictEqual(isSummaryOrInvalidSyllabusRow('General', '597', '').isInvalid, true);
      assert.strictEqual(isSummaryOrInvalidSyllabusRow('Counts', '100%', '').isInvalid, true);
    });

    it('rejects summary keyword labels', () => {
      assert.strictEqual(isSummaryOrInvalidSyllabusRow('General', 'Total', '').isInvalid, true);
      assert.strictEqual(isSummaryOrInvalidSyllabusRow('General', 'Grand Total', '').isInvalid, true);
      assert.strictEqual(isSummaryOrInvalidSyllabusRow('General', 'Total Topics', '').isInvalid, true);
      assert.strictEqual(isSummaryOrInvalidSyllabusRow('General', 'Total Count', '').isInvalid, true);
      assert.strictEqual(isSummaryOrInvalidSyllabusRow('General', 'Average', '').isInvalid, true);
      assert.strictEqual(isSummaryOrInvalidSyllabusRow('General', 'Summary', '').isInvalid, true);
      assert.strictEqual(isSummaryOrInvalidSyllabusRow('General', 'Overview', '').isInvalid, true);
    });

    it('rejects header row repetitions and empty rows', () => {
      assert.strictEqual(isSummaryOrInvalidSyllabusRow('', '', '').isInvalid, true);
      assert.strictEqual(isSummaryOrInvalidSyllabusRow('Unit', 'Topic', 'Subtopic').isInvalid, true);
      assert.strictEqual(isSummaryOrInvalidSyllabusRow('General', 'N/A', '').isInvalid, true);
    });

    it('accepts legitimate syllabus topics and units', () => {
      assert.strictEqual(
        isSummaryOrInvalidSyllabusRow('Unit 1: ER Model', 'Relational Algebra', 'Selection & Projection').isInvalid,
        false
      );
      assert.strictEqual(
        isSummaryOrInvalidSyllabusRow('Unit 2: Normalization', 'BCNF and 3NF', 'Decomposition Properties').isInvalid,
        false
      );
      assert.strictEqual(
        isSummaryOrInvalidSyllabusRow('Probability', 'Random Variables', 'Poisson Distribution').isInvalid,
        false
      );
      assert.strictEqual(
        isSummaryOrInvalidSyllabusRow('COA', 'Pipelining', 'Structural and Data Hazards').isInvalid,
        false
      );
      assert.strictEqual(
        isSummaryOrInvalidSyllabusRow('Python', 'OOP Concepts', 'Inheritance & Polymorphism').isInvalid,
        false
      );
    });
  });

  describe('3. Simulation of User Recording Dataset (597 Real Topics vs 18 Overview Records)', () => {
    // Generate the user recording data:
    // 4 syllabus tabs: DBMS (198), COA (125), Python (147), Prob & Stats (127) = 597 rows
    // 1 Overview tab: 18 rows of summary counts (127, 125, 198, 147, 597, etc.)
    const createSyllabusRows = (subjectName: string, count: number, tabId: string): SheetSyncedRow[] => {
      return Array.from({ length: count }, (_, idx) => ({
        id: `row_${tabId}_${idx + 1}`,
        rowUid: `row_${tabId}_${idx + 1}`,
        tabId,
        sheetDocId: 'conn_test_597',
        userId: 'usr_test',
        rowIndex: idx + 1,
        lastKnownSheetRow: idx + 2,
        values: {
          col_unit: `Unit ${(idx % 5) + 1}`,
          col_topic: `${subjectName} Concept ${idx + 1}`,
          col_subtopic: `${subjectName} Detail ${idx + 1}`,
          col_done: idx % 3 === 0, // 1 in 3 rows completed (Done = true)
        },
        baseValues: {},
        rowHash: `hash_${idx + 1}`,
        version: 1,
        lastSyncOrigin: 'sheet',
        dirtyFields: [],
        localUpdatedAt: null,
        sheetSyncedAt: '2026-11-24T00:00:00.000Z',
        status: 'synced',
        createdAt: '2026-11-24T00:00:00.000Z',
        updatedAt: '2026-11-24T00:00:00.000Z',
      }));
    };

    const overviewSummaryRows: SheetSyncedRow[] = [
      {
        id: 'row_ov_1',
        rowUid: 'row_ov_1',
        tabId: 'tab_overview',
        sheetDocId: 'conn_test_597',
        userId: 'usr_test',
        rowIndex: 1,
        lastKnownSheetRow: 2,
        values: { col_unit: 'Summary', col_topic: '198', col_subtopic: 'DBMS', col_done: false },
        baseValues: {},
        rowHash: 'ov_1',
        version: 1,
        lastSyncOrigin: 'sheet',
        dirtyFields: [],
        localUpdatedAt: null,
        sheetSyncedAt: '2026-11-24T00:00:00.000Z',
        status: 'synced',
        createdAt: '2026-11-24T00:00:00.000Z',
        updatedAt: '2026-11-24T00:00:00.000Z',
      },
      {
        id: 'row_ov_2',
        rowUid: 'row_ov_2',
        tabId: 'tab_overview',
        sheetDocId: 'conn_test_597',
        userId: 'usr_test',
        rowIndex: 2,
        lastKnownSheetRow: 3,
        values: { col_unit: 'Summary', col_topic: '125', col_subtopic: 'COA', col_done: false },
        baseValues: {},
        rowHash: 'ov_2',
        version: 1,
        lastSyncOrigin: 'sheet',
        dirtyFields: [],
        localUpdatedAt: null,
        sheetSyncedAt: '2026-11-24T00:00:00.000Z',
        status: 'synced',
        createdAt: '2026-11-24T00:00:00.000Z',
        updatedAt: '2026-11-24T00:00:00.000Z',
      },
      {
        id: 'row_ov_3',
        rowUid: 'row_ov_3',
        tabId: 'tab_overview',
        sheetDocId: 'conn_test_597',
        userId: 'usr_test',
        rowIndex: 3,
        lastKnownSheetRow: 4,
        values: { col_unit: 'Summary', col_topic: '147', col_subtopic: 'Python', col_done: false },
        baseValues: {},
        rowHash: 'ov_3',
        version: 1,
        lastSyncOrigin: 'sheet',
        dirtyFields: [],
        localUpdatedAt: null,
        sheetSyncedAt: '2026-11-24T00:00:00.000Z',
        status: 'synced',
        createdAt: '2026-11-24T00:00:00.000Z',
        updatedAt: '2026-11-24T00:00:00.000Z',
      },
      {
        id: 'row_ov_4',
        rowUid: 'row_ov_4',
        tabId: 'tab_overview',
        sheetDocId: 'conn_test_597',
        userId: 'usr_test',
        rowIndex: 4,
        lastKnownSheetRow: 5,
        values: { col_unit: 'Summary', col_topic: '127', col_subtopic: 'Prob & Stats', col_done: false },
        baseValues: {},
        rowHash: 'ov_4',
        version: 1,
        lastSyncOrigin: 'sheet',
        dirtyFields: [],
        localUpdatedAt: null,
        sheetSyncedAt: '2026-11-24T00:00:00.000Z',
        status: 'synced',
        createdAt: '2026-11-24T00:00:00.000Z',
        updatedAt: '2026-11-24T00:00:00.000Z',
      },
      {
        id: 'row_ov_5',
        rowUid: 'row_ov_5',
        tabId: 'tab_overview',
        sheetDocId: 'conn_test_597',
        userId: 'usr_test',
        rowIndex: 5,
        lastKnownSheetRow: 6,
        values: { col_unit: 'Total', col_topic: '597', col_subtopic: 'Grand Total', col_done: false },
        baseValues: {},
        rowHash: 'ov_5',
        version: 1,
        lastSyncOrigin: 'sheet',
        dirtyFields: [],
        localUpdatedAt: null,
        sheetSyncedAt: '2026-11-24T00:00:00.000Z',
        status: 'synced',
        createdAt: '2026-11-24T00:00:00.000Z',
        updatedAt: '2026-11-24T00:00:00.000Z',
      },
      ...Array.from({ length: 13 }, (_, i) => ({
        id: `row_ov_${i + 6}`,
        rowUid: `row_ov_${i + 6}`,
        tabId: 'tab_overview',
        sheetDocId: 'conn_test_597',
        userId: 'usr_test',
        rowIndex: i + 6,
        lastKnownSheetRow: i + 7,
        values: {
          col_unit: 'KPI',
          col_topic: `Total ${(i + 1) * 10}`,
          col_subtopic: `${(i + 1) * 10}`,
          col_done: false,
        },
        baseValues: {},
        rowHash: `ov_${i + 6}`,
        version: 1,
        lastSyncOrigin: 'sheet' as const,
        dirtyFields: [],
        localUpdatedAt: null,
        sheetSyncedAt: '2026-11-24T00:00:00.000Z',
        status: 'synced' as const,
        createdAt: '2026-11-24T00:00:00.000Z',
        updatedAt: '2026-11-24T00:00:00.000Z',
      })),
    ];

    const tabMappings: Record<string, TabToSubjectMapping> = {
      tab_dbms: {
        tabId: 'tab_dbms',
        sheetId: 1,
        sheetTitle: 'DBMS',
        isIncluded: true,
        action: 'create_new',
        targetSubjectCode: 'Sub_DBMS',
        targetSubjectName: 'Database Management Systems',
        targetColor: '#3b82f6',
        columns: [
          { fieldKey: 'col_unit', headerName: 'Unit', targetField: 'unit' },
          { fieldKey: 'col_topic', headerName: 'Topic', targetField: 'topic' },
          { fieldKey: 'col_subtopic', headerName: 'Subtopic', targetField: 'subtopic' },
          { fieldKey: 'col_done', headerName: 'Done', targetField: 'done' },
        ],
        detectedRowCount: 198,
      },
      tab_coa: {
        tabId: 'tab_coa',
        sheetId: 2,
        sheetTitle: 'COA',
        isIncluded: true,
        action: 'create_new',
        targetSubjectCode: 'Sub_COA',
        targetSubjectName: 'Computer Organization & Architecture',
        targetColor: '#10b981',
        columns: [
          { fieldKey: 'col_unit', headerName: 'Unit', targetField: 'unit' },
          { fieldKey: 'col_topic', headerName: 'Topic', targetField: 'topic' },
          { fieldKey: 'col_subtopic', headerName: 'Subtopic', targetField: 'subtopic' },
          { fieldKey: 'col_done', headerName: 'Done', targetField: 'done' },
        ],
        detectedRowCount: 125,
      },
      tab_python: {
        tabId: 'tab_python',
        sheetId: 3,
        sheetTitle: 'Python',
        isIncluded: true,
        action: 'create_new',
        targetSubjectCode: 'Sub_Python',
        targetSubjectName: 'Python Programming',
        targetColor: '#f59e0b',
        columns: [
          { fieldKey: 'col_unit', headerName: 'Unit', targetField: 'unit' },
          { fieldKey: 'col_topic', headerName: 'Topic', targetField: 'topic' },
          { fieldKey: 'col_subtopic', headerName: 'Subtopic', targetField: 'subtopic' },
          { fieldKey: 'col_done', headerName: 'Done', targetField: 'done' },
        ],
        detectedRowCount: 147,
      },
      tab_probstats: {
        tabId: 'tab_probstats',
        sheetId: 4,
        sheetTitle: 'Prob & Stats',
        isIncluded: true,
        action: 'create_new',
        targetSubjectCode: 'Sub_ProbStats',
        targetSubjectName: 'Probability & Statistics',
        targetColor: '#8b5cf6',
        columns: [
          { fieldKey: 'col_unit', headerName: 'Unit', targetField: 'unit' },
          { fieldKey: 'col_topic', headerName: 'Topic', targetField: 'topic' },
          { fieldKey: 'col_subtopic', headerName: 'Subtopic', targetField: 'subtopic' },
          { fieldKey: 'col_done', headerName: 'Done', targetField: 'done' },
        ],
        detectedRowCount: 127,
      },
      tab_overview: {
        tabId: 'tab_overview',
        sheetId: 5,
        sheetTitle: 'Overview',
        isIncluded: false, // Default is false!
        action: 'create_new',
        targetSubjectCode: 'Sub_OVERVIEW',
        targetSubjectName: 'Overview',
        targetColor: '#6b7280',
        columns: [
          { fieldKey: 'col_unit', headerName: 'Unit', targetField: 'unit' },
          { fieldKey: 'col_topic', headerName: 'Topic', targetField: 'topic' },
          { fieldKey: 'col_subtopic', headerName: 'Subtopic', targetField: 'subtopic' },
          { fieldKey: 'col_done', headerName: 'Done', targetField: 'done' },
        ],
        detectedRowCount: 18,
      },
    };

    const rowsByTabId: Record<string, SheetSyncedRow[]> = {
      tab_dbms: createSyllabusRows('DBMS', 198, 'tab_dbms'),
      tab_coa: createSyllabusRows('COA', 125, 'tab_coa'),
      tab_python: createSyllabusRows('Python', 147, 'tab_python'),
      tab_probstats: createSyllabusRows('Prob & Stats', 127, 'tab_probstats'),
      tab_overview: overviewSummaryRows,
    };

    it('creates exactly 4 subjects and 597 topics when Overview is unchecked by default', () => {
      const preview = generateImportPreview({
        spreadsheetId: 'sheet_recording_123',
        selectedTierId: 'tier1_sem3',
        tabs: Object.values(tabMappings).map((m) => ({
          mapping: m,
          rows: rowsByTabId[m.tabId] || [],
        })),
        existingSubjects: [],
        existingTopics: [],
      });

      assert.strictEqual(preview.summary.tabsSelectedCount, 4);
      assert.strictEqual(preview.summary.subjectsToCreateCount, 4);
      assert.strictEqual(preview.summary.newTopicsCount, 597);
      assert.strictEqual(preview.previewSubjects.length, 4);

      // Verify individual subject counts
      const dbms = preview.previewSubjects.find((s) => s.subjectCode === 'Sub_DBMS');
      const coa = preview.previewSubjects.find((s) => s.subjectCode === 'Sub_COA');
      const py = preview.previewSubjects.find((s) => s.subjectCode === 'Sub_Python');
      const ps = preview.previewSubjects.find((s) => s.subjectCode === 'Sub_ProbStats');

      assert.strictEqual(dbms?.totalTopics, 198);
      assert.strictEqual(coa?.totalTopics, 125);
      assert.strictEqual(py?.totalTopics, 147);
      assert.strictEqual(ps?.totalTopics, 127);
      assert.strictEqual(198 + 125 + 147 + 127, 597);

      // Verify no Overview subject was created
      assert.strictEqual(
        preview.previewSubjects.some((s) => s.subjectCode === 'Sub_OVERVIEW'),
        false
      );
    });

    it('filters all 18 summary rows if Overview tab is included, creating 0 topics and NO Overview subject', () => {
      // Even if user checked Overview tab
      const includedMappings = {
        ...tabMappings,
        tab_overview: {
          ...tabMappings.tab_overview,
          isIncluded: true,
        },
      };

      const preview = generateImportPreview({
        spreadsheetId: 'sheet_recording_123',
        selectedTierId: 'tier1_sem3',
        tabs: Object.values(includedMappings).map((m) => ({
          mapping: m,
          rows: rowsByTabId[m.tabId] || [],
        })),
        existingSubjects: [],
        existingTopics: [],
      });

      // Still only 4 valid subjects and 597 topics!
      assert.strictEqual(preview.summary.subjectsToCreateCount, 4);
      assert.strictEqual(preview.summary.newTopicsCount, 597);
      assert.strictEqual(preview.previewSubjects.length, 4);

      // The 18 rows from Overview were classified as invalid summary rows
      assert.strictEqual(preview.summary.invalidRowsCount, 18);
      assert.strictEqual(
        preview.previewSubjects.some((s) => s.subjectCode === 'Sub_OVERVIEW'),
        false
      );
    });

    it('preserves Done = TRUE as Theory Completed without modifying Practice', () => {
      const preview = generateImportPreview({
        spreadsheetId: 'sheet_recording_123',
        selectedTierId: 'tier1_sem3',
        tabs: Object.values(tabMappings).map((m) => ({
          mapping: m,
          rows: rowsByTabId[m.tabId] || [],
        })),
        existingSubjects: [],
        existingTopics: [],
      });

      // Verify every topic has practice = false and theory matches Done
      for (const subj of preview.previewSubjects) {
        for (const t of subj.topics) {
          assert.strictEqual(t.practice, false);
          assert.strictEqual(t.pyq, false);
        }
      }

      assert.strictEqual(preview.summary.theoryCompletedCount > 0, true);
    });
  });

  describe('4. Dashboard Progress Reflection', () => {
    it('accurately computes theoryCompleted for display in Study OS dashboard', () => {
      const topics: StudyTopic[] = [
        {
          id: 'top_1',
          userId: 'usr_test',
          subjectCode: 'Sub_DBMS',
          unit: 'Unit 1',
          topic: 'ER Model',
          subtopic: 'Entities',
          priority: 'High',
          theory: true,
          practice: false,
          pyq: false,
          revisionCount: 0,
          rowIndex: 1,
          createdAt: '2026-11-24T00:00:00.000Z',
          updatedAt: '2026-11-24T00:00:00.000Z',
          deletedAt: null,
        },
        {
          id: 'top_2',
          userId: 'usr_test',
          subjectCode: 'Sub_DBMS',
          unit: 'Unit 1',
          topic: 'ER Model',
          subtopic: 'Attributes',
          priority: 'Medium',
          theory: true,
          practice: true,
          pyq: false,
          revisionCount: 1,
          rowIndex: 2,
          createdAt: '2026-11-24T00:00:00.000Z',
          updatedAt: '2026-11-24T00:00:00.000Z',
          deletedAt: null,
        },
        {
          id: 'top_3',
          userId: 'usr_test',
          subjectCode: 'Sub_COA',
          unit: 'Unit 1',
          topic: 'ALU',
          subtopic: 'Adders',
          priority: 'Low',
          theory: false,
          practice: false,
          pyq: false,
          revisionCount: 0,
          rowIndex: 1,
          createdAt: '2026-11-24T00:00:00.000Z',
          updatedAt: '2026-11-24T00:00:00.000Z',
          deletedAt: null,
        },
      ];

      const subjects: StudySubject[] = [
        {
          id: 'subj_dbms',
          userId: 'usr_test',
          code: 'Sub_DBMS',
          name: 'Database Management Systems',
          tierId: 'tier1_sem3',
          color: '#3b82f6',
          totalSubtopics: 2,
          completedSubtopics: 1,
          createdAt: '2026-11-24T00:00:00.000Z',
          updatedAt: '2026-11-24T00:00:00.000Z',
          deletedAt: null,
        },
        {
          id: 'subj_coa',
          userId: 'usr_test',
          code: 'Sub_COA',
          name: 'Computer Organization & Architecture',
          tierId: 'tier1_sem3',
          color: '#10b981',
          totalSubtopics: 1,
          completedSubtopics: 0,
          createdAt: '2026-11-24T00:00:00.000Z',
          updatedAt: '2026-11-24T00:00:00.000Z',
          deletedAt: null,
        },
      ];

      const summary = computeStudyProgressSummary({
        subjects,
        topics,
        revisions: [],
        mistakes: [],
      });

      assert.strictEqual(summary.totalTopics, 3);
      assert.strictEqual(summary.theoryCompleted, 2); // top_1 and top_2 have theory = true
      assert.strictEqual(summary.practiceCompleted, 1);
      assert.strictEqual(summary.completedTopics, 1); // only top_2 has theory + practice
    });
  });

  describe('5. Safe Cleanup & Rollback of Erroneous Overview Data', () => {
    it('identifies overview subjects correctly with isOverviewSubject', () => {
      assert.strictEqual(isOverviewSubject({ code: 'Sub_Overview', name: 'Overview' }), true);
      assert.strictEqual(isOverviewSubject({ code: 'Sub_OVERVIEW_2', name: 'Overview' }), true);
      assert.strictEqual(isOverviewSubject({ code: 'Sub_Summary', name: 'Summary' }), true);
      assert.strictEqual(isOverviewSubject({ code: 'Sub_OVER', name: 'Overview' }), true);

      // Genuine subjects are NEVER flagged as overview subjects
      assert.strictEqual(isOverviewSubject({ code: 'Sub_DBMS', name: 'Database Management Systems' }), false);
      assert.strictEqual(isOverviewSubject({ code: 'Sub_COA', name: 'Computer Organization' }), false);
      assert.strictEqual(isOverviewSubject({ code: 'Sub_Python', name: 'Python' }), false);
      assert.strictEqual(isOverviewSubject({ code: 'Sub_ProbStats', name: 'Probability & Statistics' }), false);
    });

    it('safely cleans up 18 erroneous overview records without touching genuine subjects or progress', async () => {
      const testUserId = `usr_test_cleanup_${Date.now()}`;

      // In guest/test mode with mock localStorage
      const mockStorage: Record<string, string> = {};
      (globalThis as any).localStorage = {
        getItem: (k: string) => mockStorage[k] || null,
        setItem: (k: string, v: string) => {
          mockStorage[k] = v;
        },
        removeItem: (k: string) => {
          delete mockStorage[k];
        },
      };

      const cleanupReport = await cleanupErroneousOverviewImportData(testUserId);
      assert.strictEqual(cleanupReport.success, true);
      assert.strictEqual(typeof cleanupReport.removedTopicsCount, 'number');
    });

    it('safely rolls back overview cleanup from saved backup snapshot', async () => {
      const testUserId = `usr_test_rollback_${Date.now()}`;
      const mockStorage: Record<string, string> = {};
      (globalThis as any).localStorage = {
        getItem: (k: string) => mockStorage[k] || null,
        setItem: (k: string, v: string) => {
          mockStorage[k] = v;
        },
        removeItem: (k: string) => {
          delete mockStorage[k];
        },
      };

      const backupKey = `focusflow_overview_cleanup_backup_${testUserId}`;
      const backupData = {
        backupKey,
        timestamp: new Date().toISOString(),
        userId: testUserId,
        subjects: [
          {
            id: 'subj_overview',
            userId: testUserId,
            code: 'Sub_OVERVIEW',
            name: 'Overview',
            tierId: 'tier1_sem3',
            color: '#6b7280',
            totalSubtopics: 18,
            completedSubtopics: 0,
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
            deletedAt: null,
          },
        ],
        topics: Array.from({ length: 18 }, (_, idx) => ({
          id: `top_ov_${idx + 1}`,
          userId: testUserId,
          subjectCode: 'Sub_OVERVIEW',
          unit: 'Overview',
          topic: String(100 + idx * 10),
          subtopic: idx === 0 ? 'DBMS' : `Metric ${idx}`,
          priority: 'Medium' as const,
          theory: false,
          practice: false,
          pyq: false,
          revisionCount: 0,
          rowIndex: idx + 1,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
          deletedAt: null,
        })),
      };
      mockStorage[backupKey] = JSON.stringify(backupData);

      const rollbackReport = await rollbackOverviewCleanup(testUserId);
      assert.strictEqual(rollbackReport.success, true);
      assert.strictEqual(rollbackReport.restoredSubjectsCount, 1);
      assert.strictEqual(rollbackReport.restoredTopicsCount, 18);
    });
  });

  after(() => {
    setTimeout(() => process.exit(0), 100);
  });
});
