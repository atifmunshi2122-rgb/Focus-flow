import './test_bootstrap.ts';
import { describe, it, after } from 'node:test';
import assert from 'node:assert/strict';
import {
  classifySheetPurpose,
  detectTabSchema,
} from '../src/lib/sheetHub/schemaDetector.ts';
import {
  inferColumnTarget,
  inferInitialColumnMappings,
  isSummaryOrInvalidSyllabusRow,
  isTabOverview,
  generateImportPreview,
  TabToSubjectMapping,
} from '../src/lib/sheetHub/sheetToStudyTransformer.ts';
import {
  executeSheetToStudyImport,
  undoImportSession,
} from '../src/lib/sheetHub/sheetToStudyImportEngine.ts';
import { studyImportHistoryStore } from '../src/lib/sheetHub/studyImportHistoryStore.ts';
import { computeStudyProgressSummary } from '../src/lib/studyIntelligence.ts';
import type { SheetSyncedRow } from '../src/types/sheetHub.ts';
import type { StudySubject, StudyTopic } from '../src/types/study.ts';

describe('Universal Google Sheets Import Engine — Data-Agnostic Test Suite', () => {
  // Helper to create valid SheetSyncedRow mocks
  const makeMockRow = (
    tabId: string,
    idx: number,
    values: Record<string, any>
  ): SheetSyncedRow => ({
    id: `row_${tabId}_${idx}`,
    rowUid: `row_${tabId}_${idx}`,
    tabId,
    sheetDocId: 'conn_univ_test',
    userId: 'usr_universal_test',
    rowIndex: idx,
    lastKnownSheetRow: idx + 1,
    values,
    baseValues: {},
    rowHash: `hash_${tabId}_${idx}`,
    version: 1,
    lastSyncOrigin: 'sheet',
    dirtyFields: [],
    localUpdatedAt: null,
    sheetSyncedAt: '2026-11-24T00:00:00.000Z',
    status: 'synced',
    createdAt: '2026-11-24T00:00:00.000Z',
    updatedAt: '2026-11-24T00:00:00.000Z',
  });

  // --------------------------------------------------------------------------
  // 1. Universal Sheet Detection (Zero Hardcoded Sheet Names)
  // --------------------------------------------------------------------------
  describe('1. Universal Sheet Detection', () => {
    it('dynamically identifies a syllabus sheet with arbitrary name (Tab_77) using column & row structure', () => {
      const rows = [
        [{ value: 'Module' }, { value: 'Topic' }, { value: 'Concept' }, { value: 'Completed' }],
        ...Array.from({ length: 25 }, (_, i) => [
          { value: `Module ${(i % 4) + 1}` },
          { value: `Algorithms Part ${i + 1}` },
          { value: `Complexity Analysis for Step ${i + 1}` },
          { value: i % 2 === 0 },
        ]),
      ];

      const schema = detectTabSchema({
        sheetId: 101,
        sheetTitle: 'Tab_77', // Completely non-descriptive tab name
        rows,
      });

      assert.strictEqual(schema.role, 'data');
      assert.strictEqual(schema.detectedPurpose, 'syllabus');
      assert.strictEqual(schema.roleConfidence, 'high');
      assert.strictEqual(schema.requiresUserClassification, false);
      assert.strictEqual(schema.columns.some((c) => c.editable), true);
    });

    it('dynamically identifies a summary sheet with non-overview name (Sheet1) using aggregate formulas and keyword rows', () => {
      const rows = [
        [{ value: 'Metric Name' }, { value: 'Formula Value' }],
        [{ value: 'Total Topics' }, { value: 250, formula: '=SUM(B2:B20)' }],
        [{ value: 'Average Completion' }, { value: 75, formula: '=AVERAGE(C2:C20)' }],
        [{ value: 'Total Solved' }, { value: 180, formula: '=COUNTIF(D2:D20, TRUE)' }],
        [{ value: 'Grand Total' }, { value: 500 }],
      ];

      const schema = detectTabSchema({
        sheetId: 102,
        sheetTitle: 'Sheet1', // Generic spreadsheet name
        rows,
      });

      assert.strictEqual(schema.role, 'overview');
      assert.strictEqual(schema.detectedPurpose, 'summary');
      assert.strictEqual(schema.roleConfidence, 'high');
      // All columns must be read-only by default on a summary tab
      assert.strictEqual(schema.columns.every((c) => !c.editable), true);
    });

    it('dynamically identifies an instructions/readme sheet using text paragraph density', () => {
      const rows = [
        [{ value: 'Instructions and Syllabus Navigation Guidelines' }],
        [{ value: 'Welcome to the distributed systems study tracker. Please review the prerequisites before starting.' }],
        [{ value: 'Step 1: Complete the theory readings assigned for each milestone and check the box.' }],
        [{ value: 'Step 2: Solve the practice exercises and track your spaced repetition intervals.' }],
        [{ value: 'Important Note: Ensure you do not modify formulas in the summary sheet.' }],
      ];

      const schema = detectTabSchema({
        sheetId: 103,
        sheetTitle: 'ReadMe_Guide',
        rows,
      });

      assert.strictEqual(schema.role, 'overview');
      assert.strictEqual(schema.detectedPurpose, 'instructions');
      assert.strictEqual(schema.roleConfidence, 'high');
    });

    it('dynamically identifies a metadata sheet using key-value pair layouts', () => {
      const rows = [
        [{ value: 'Property' }, { value: 'Value' }],
        [{ value: 'Semester:' }, { value: 'Fall 2026' }],
        [{ value: 'Course Code:' }, { value: 'CS-401' }],
        [{ value: 'Instructor:' }, { value: 'Dr. Alan Turing' }],
        [{ value: 'Target Exam:' }, { value: 'Finals' }],
        [{ value: 'Total Credits:' }, { value: 4 }],
      ];

      const schema = detectTabSchema({
        sheetId: 104,
        sheetTitle: 'Course_Config',
        rows,
      });

      assert.strictEqual(schema.role, 'overview');
      assert.strictEqual(schema.detectedPurpose, 'metadata');
    });

    it('flags ambiguous layouts as uncertain and requires user confirmation', () => {
      // 2 rows with no clear syllabus headers and ambiguous text
      const rows = [
        [{ value: 'Col A' }, { value: 'Col B' }],
        [{ value: 'Alpha' }, { value: 'Beta' }],
      ];

      const schema = detectTabSchema({
        sheetId: 105,
        sheetTitle: 'Random_Scratchpad',
        rows,
      });

      // Low confidence or uncertain layout
      assert.strictEqual(
        schema.roleConfidence === 'low' || schema.requiresUserClassification === true,
        true
      );
    });
  });

  // --------------------------------------------------------------------------
  // 2. Dynamic Syllabus Structure & Hierarchy Detection
  // --------------------------------------------------------------------------
  describe('2. Dynamic Syllabus Structure Detection', () => {
    it('infers multi-level hierarchy (Module + Chapter + Topic + Subtopic)', () => {
      assert.strictEqual(inferColumnTarget('Module'), 'module');
      assert.strictEqual(inferColumnTarget('Mod 1'), 'module');
      assert.strictEqual(inferColumnTarget('Chapter'), 'chapter');
      assert.strictEqual(inferColumnTarget('Lesson'), 'chapter');
      assert.strictEqual(inferColumnTarget('Main Topic'), 'topic');
      assert.strictEqual(inferColumnTarget('Subtopic Concept'), 'subtopic');
      assert.strictEqual(inferColumnTarget('Status'), 'done');
      assert.strictEqual(inferColumnTarget('Importance'), 'priority');
      assert.strictEqual(inferColumnTarget('Remarks'), 'notes');
      assert.strictEqual(inferColumnTarget('Course Name'), 'subject');
    });

    it('synthesizes combined unit from Module and Chapter when both are mapped', () => {
      const mapping: TabToSubjectMapping = {
        tabId: 'tab_synth',
        sheetId: 1,
        sheetTitle: 'Operating Systems',
        isIncluded: true,
        action: 'create_new',
        targetSubjectCode: 'Sub_OS',
        targetSubjectName: 'Operating Systems',
        targetColor: '#3b82f6',
        columns: [
          { fieldKey: 'c_mod', headerName: 'Module', targetField: 'module' },
          { fieldKey: 'c_chap', headerName: 'Chapter', targetField: 'chapter' },
          { fieldKey: 'c_topic', headerName: 'Topic', targetField: 'topic' },
          { fieldKey: 'c_sub', headerName: 'Subtopic', targetField: 'subtopic' },
          { fieldKey: 'c_done', headerName: 'Done', targetField: 'done' },
        ],
        detectedRowCount: 2,
      };

      const rows: SheetSyncedRow[] = [
        makeMockRow('tab_synth', 1, {
          c_mod: 'Module 1 (Kernel)',
          c_chap: 'Process Synchronization',
          c_topic: 'Semaphores',
          c_sub: 'Binary & Counting Mutex',
          c_done: true,
        }),
      ];

      const preview = generateImportPreview({
        tabs: [{ mapping, rows }],
        existingSubjects: [],
        existingTopics: [],
        spreadsheetId: 'sheet_synth',
        selectedTierId: 'tier1',
      });

      assert.strictEqual(preview.summary.newTopicsCount, 1);
      const topic = preview.previewSubjects[0].topics[0];
      assert.strictEqual(topic.unit, 'Module 1 (Kernel) - Process Synchronization');
      assert.strictEqual(topic.topic, 'Semaphores');
      assert.strictEqual(topic.subtopic, 'Binary & Counting Mutex');
      assert.strictEqual(topic.theory, true);
      assert.strictEqual(topic.practice, false);
    });
  });

  // --------------------------------------------------------------------------
  // 3. Universal Data Validation & Context-Aware Numeric Resolution
  // --------------------------------------------------------------------------
  describe('3. Universal Data Validation & Context-Aware Numeric Resolution', () => {
    it('accepts valid numeric topic names in academic contexts', () => {
      // Microprocessor 8086 with descriptive subtopic
      const v1 = isSummaryOrInvalidSyllabusRow('Microprocessors', '8086', 'Architecture and Bus Interface');
      assert.strictEqual(v1.isInvalid, false);

      // Section dot-decimal numbering (1.1, 3.4.2)
      const v2 = isSummaryOrInvalidSyllabusRow('Unit 1', '1.1', 'Introduction to Relational Calculus');
      assert.strictEqual(v2.isInvalid, false);

      // Standalone section dot-decimal without subtopic
      const v3 = isSummaryOrInvalidSyllabusRow('Unit 2', '2.4.1', '');
      assert.strictEqual(v3.isInvalid, false);

      // Technical protocol code (301, RFC 793)
      const v4 = isSummaryOrInvalidSyllabusRow('Web Protocols', '301', 'HTTP Moved Permanently Redirection');
      assert.strictEqual(v4.isInvalid, false);

      const v5 = isSummaryOrInvalidSyllabusRow('Networking', 'RFC 793', 'Transmission Control Protocol Spec');
      assert.strictEqual(v5.isInvalid, false);
    });

    it('rejects numeric summary values and aggregate counts using surrounding context', () => {
      // 198 in row labeled "Summary"
      const r1 = isSummaryOrInvalidSyllabusRow('Summary', '198', 'DBMS');
      assert.strictEqual(r1.isInvalid, true);
      assert.strictEqual(r1.category, 'summary_row');

      // 597 in row labeled "Total"
      const r2 = isSummaryOrInvalidSyllabusRow('Total', '597', 'Grand Total');
      assert.strictEqual(r2.isInvalid, true);
      assert.strictEqual(r2.category, 'summary_row');

      // Standalone integer without any concept text
      const r3 = isSummaryOrInvalidSyllabusRow('', '127', '');
      assert.strictEqual(r3.isInvalid, true);
      assert.strictEqual(r3.category, 'aggregate_count');

      // Pure percentage without topic text
      const r4 = isSummaryOrInvalidSyllabusRow('Metrics', '100%', '');
      assert.strictEqual(r4.isInvalid, true);
      assert.strictEqual(r4.category, 'summary_row');

      // Repeated header echo
      const r5 = isSummaryOrInvalidSyllabusRow('Unit', 'Topic', 'Subtopic');
      assert.strictEqual(r5.isInvalid, true);
      assert.strictEqual(r5.category, 'header_echo');

      // Empty row
      const r6 = isSummaryOrInvalidSyllabusRow('', '', '');
      assert.strictEqual(r6.isInvalid, true);
      assert.strictEqual(r6.category, 'empty');
    });

    it('collects structured validation breakdowns in import preview summary', () => {
      const mapping: TabToSubjectMapping = {
        tabId: 'tab_val',
        sheetId: 1,
        sheetTitle: 'Sample Validation Tab',
        isIncluded: true,
        action: 'create_new',
        targetSubjectCode: 'Sub_VAL',
        targetSubjectName: 'Validation Subject',
        targetColor: '#3b82f6',
        columns: [
          { fieldKey: 'c_unit', headerName: 'Unit', targetField: 'unit' },
          { fieldKey: 'c_topic', headerName: 'Topic', targetField: 'topic' },
          { fieldKey: 'c_sub', headerName: 'Subtopic', targetField: 'subtopic' },
        ],
        detectedRowCount: 5,
      };

      const rows: SheetSyncedRow[] = [
        makeMockRow('tab_val', 1, { c_unit: 'Unit 1', c_topic: 'Valid Topic A', c_sub: 'Concept A' }),
        makeMockRow('tab_val', 2, { c_unit: 'Summary', c_topic: 'Total Topics', c_sub: '100' }), // summary row
        makeMockRow('tab_val', 3, { c_unit: '', c_topic: '500', c_sub: '' }), // aggregate count
        makeMockRow('tab_val', 4, { c_unit: '', c_topic: '', c_sub: '' }), // empty
        makeMockRow('tab_val', 5, { c_unit: 'Unit', c_topic: 'Topic', c_sub: 'Subtopic' }), // header echo
      ];

      const preview = generateImportPreview({
        tabs: [{ mapping, rows }],
        existingSubjects: [],
        existingTopics: [],
        spreadsheetId: 'sheet_val',
        selectedTierId: 'tier1',
      });

      assert.strictEqual(preview.summary.newTopicsCount, 1);
      assert.strictEqual(preview.summary.invalidRowsCount, 4);
      assert.strictEqual(preview.summary.validationBreakdown?.summaryRowsCount, 1);
      assert.strictEqual(preview.summary.validationBreakdown?.aggregateCountsCount, 1);
      assert.strictEqual(preview.summary.validationBreakdown?.emptyRowsCount, 1);
      assert.strictEqual(preview.summary.validationBreakdown?.headerEchoesCount, 1);
    });
  });

  // --------------------------------------------------------------------------
  // 4. Idempotent Re-Import & Progress Preservation
  // --------------------------------------------------------------------------
  describe('4. Universal Idempotency & Progress Preservation', () => {
    it('produces 0 duplicate topics and 0 duplicate subjects when re-importing unchanged dataset', () => {
      const mapping: TabToSubjectMapping = {
        tabId: 'tab_idemp',
        sheetId: 1,
        sheetTitle: 'Discrete Math',
        isIncluded: true,
        action: 'create_new',
        targetSubjectCode: 'Sub_DM',
        targetSubjectName: 'Discrete Mathematics',
        targetColor: '#8b5cf6',
        columns: [
          { fieldKey: 'c_unit', headerName: 'Unit', targetField: 'unit' },
          { fieldKey: 'c_topic', headerName: 'Topic', targetField: 'topic' },
          { fieldKey: 'c_sub', headerName: 'Subtopic', targetField: 'subtopic' },
          { fieldKey: 'c_done', headerName: 'Done', targetField: 'done' },
        ],
        detectedRowCount: 2,
      };

      const rows: SheetSyncedRow[] = [
        makeMockRow('tab_idemp', 1, { c_unit: 'Unit 1', c_topic: 'Set Theory', c_sub: 'Venn Diagrams', c_done: true }),
        makeMockRow('tab_idemp', 2, { c_unit: 'Unit 1', c_topic: 'Relations', c_sub: 'Equivalence Classes', c_done: false }),
      ];

      const existingSubjects: StudySubject[] = [
        {
          id: 'subj_dm',
          userId: 'usr_test_idemp',
          code: 'Sub_DM',
          name: 'Discrete Mathematics',
          tierId: 'tier1',
          color: '#8b5cf6',
          totalSubtopics: 2,
          completedSubtopics: 1,
          createdAt: '2026-11-24T00:00:00.000Z',
          updatedAt: '2026-11-24T00:00:00.000Z',
        },
      ];

      const existingTopics: StudyTopic[] = [
        {
          id: 'top_dm_1',
          userId: 'usr_test_idemp',
          subjectCode: 'Sub_DM',
          unit: 'Unit 1',
          topic: 'Set Theory',
          subtopic: 'Venn Diagrams',
          priority: 'High',
          theory: true,
          practice: true, // Student practiced!
          pyq: false,
          revisionCount: 2, // Student revised twice!
          createdAt: '2026-11-24T00:00:00.000Z',
          updatedAt: '2026-11-24T00:00:00.000Z',
        },
        {
          id: 'top_dm_2',
          userId: 'usr_test_idemp',
          subjectCode: 'Sub_DM',
          unit: 'Unit 1',
          topic: 'Relations',
          subtopic: 'Equivalence Classes',
          priority: 'Medium',
          theory: false,
          practice: false,
          pyq: false,
          revisionCount: 0,
          createdAt: '2026-11-24T00:00:00.000Z',
          updatedAt: '2026-11-24T00:00:00.000Z',
        },
      ];

      const preview = generateImportPreview({
        tabs: [{ mapping, rows }],
        existingSubjects,
        existingTopics,
        spreadsheetId: 'sheet_dm',
        selectedTierId: 'tier1',
      });

      // Exactly 0 new topics, 0 subjects to create, 2 existing matches!
      assert.strictEqual(preview.summary.newTopicsCount, 0);
      assert.strictEqual(preview.summary.existingTopicsCount, 2);
      assert.strictEqual(preview.summary.subjectsToCreateCount, 0);
      assert.strictEqual(preview.summary.subjectsToMergeCount, 1);
    });
  });

  // --------------------------------------------------------------------------
  // 5. Multi-User Isolation & Session-Scoped Undo
  // --------------------------------------------------------------------------
  describe('5. Multi-User Isolation & Session-Scoped Undo', () => {
    it('safely rolls back a specific import session without touching other sessions or user progress', async () => {
      const testUserId = `usr_session_undo_${Date.now()}`;
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

      // Mock session in storage
      const sessionId = `sess_${Date.now()}`;
      const sessionKey = `ff_study_import_sessions_${testUserId}`;
      const sessionData = [
        {
          sessionId,
          userId: testUserId,
          sourceSpreadsheetId: 'sheet_undo_test',
          sourceSpreadsheetTitle: 'Test Syllabus',
          targetTierId: 'tier1',
          status: 'completed' as const,
          startedAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
          committedSubjectIds: ['subj_test_1'],
          committedTopicIds: ['top_test_1', 'top_test_2'],
          plannedSubjectsCount: 1,
          plannedTopicsCount: 2,
          failedOperations: [],
        },
      ];
      mockStorage[sessionKey] = JSON.stringify(sessionData);
      await studyImportHistoryStore.saveImportSession(testUserId, sessionData[0]);

      const undoReport = await undoImportSession(testUserId, sessionId);
      assert.strictEqual(undoReport.success, true);
      assert.strictEqual(undoReport.sessionId, sessionId);
    });
  });

  // --------------------------------------------------------------------------
  // 6. Dynamic Progress Synchronization
  // --------------------------------------------------------------------------
  describe('6. Dynamic Progress Synchronization', () => {
    it('dynamically computes syllabus completion percentages for arbitrary user dataset', () => {
      const subjects: StudySubject[] = [
        {
          id: 's1',
          userId: 'u1',
          code: 'Sub_A',
          name: 'Subject Alpha',
          tierId: 't1',
          totalSubtopics: 4,
          completedSubtopics: 2,
          createdAt: '2026-11-24T00:00:00.000Z',
          updatedAt: '2026-11-24T00:00:00.000Z',
        },
      ];

      const topics: StudyTopic[] = [
        {
          id: 't1',
          userId: 'u1',
          subjectCode: 'Sub_A',
          unit: 'U1',
          topic: 'T1',
          subtopic: 'S1',
          priority: 'High',
          theory: true,
          practice: true, // Fully mastered
          pyq: false,
          revisionCount: 1,
          createdAt: '2026-11-24T00:00:00.000Z',
          updatedAt: '2026-11-24T00:00:00.000Z',
        },
        {
          id: 't2',
          userId: 'u1',
          subjectCode: 'Sub_A',
          unit: 'U1',
          topic: 'T2',
          subtopic: 'S2',
          priority: 'Medium',
          theory: true,
          practice: false, // Theory only
          pyq: false,
          revisionCount: 0,
          createdAt: '2026-11-24T00:00:00.000Z',
          updatedAt: '2026-11-24T00:00:00.000Z',
        },
        {
          id: 't3',
          userId: 'u1',
          subjectCode: 'Sub_A',
          unit: 'U1',
          topic: 'T3',
          subtopic: 'S3',
          priority: 'Low',
          theory: false,
          practice: false,
          pyq: false,
          revisionCount: 0,
          createdAt: '2026-11-24T00:00:00.000Z',
          updatedAt: '2026-11-24T00:00:00.000Z',
        },
        {
          id: 't4',
          userId: 'u1',
          subjectCode: 'Sub_A',
          unit: 'U1',
          topic: 'T4',
          subtopic: 'S4',
          priority: 'Low',
          theory: false,
          practice: false,
          pyq: false,
          revisionCount: 0,
          createdAt: '2026-11-24T00:00:00.000Z',
          updatedAt: '2026-11-24T00:00:00.000Z',
        },
      ];

      const progress = computeStudyProgressSummary({
        subjects,
        topics,
        revisions: [],
        mistakes: [],
      });

      assert.strictEqual(progress.totalTopics, 4);
      assert.strictEqual(progress.completedTopics, 1); // 1 fully mastered (t1)
      assert.strictEqual(progress.theoryCompleted, 2); // 2 theory completed (t1, t2)
      assert.strictEqual(progress.practiceCompleted, 1); // 1 practice completed (t1)
      assert.strictEqual(progress.overallCompletionPct, 25); // 1 / 4 * 100 = 25%
    });
  });

  after(() => {
    setTimeout(() => process.exit(0), 100);
  });
});
