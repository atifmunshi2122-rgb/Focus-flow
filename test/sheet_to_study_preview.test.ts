import './test_bootstrap.ts';
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  isTabOverview,
  generateSubjectCode,
  inferColumnTarget,
  inferInitialColumnMappings,
  computeSourceRowKey,
  computeContentHash,
  parseBooleanDone,
  normalizePriority,
  generateImportPreview,
  TabToSubjectMapping,
} from '../src/lib/sheetHub/sheetToStudyTransformer.ts';
import type { SheetColumnMapping, SheetSyncedRow } from '../src/types/sheetHub.ts';
import type { StudySubject, StudyTopic } from '../src/types/study.ts';

describe('Sheet Hub → Study OS Import Bridge: Transformer & Preview Engine (Step 3)', () => {
  describe('Tab Overview Detection', () => {
    it('correctly flags overview/summary tabs as skipped by default', () => {
      assert.strictEqual(isTabOverview('Overview'), true);
      assert.strictEqual(isTabOverview('summary'), true);
      assert.strictEqual(isTabOverview('Dashboard 2026'), true);
      assert.strictEqual(isTabOverview('KPI Tracker'), true);
      assert.strictEqual(isTabOverview('README'), true);
      assert.strictEqual(isTabOverview('Instructions'), true);
      assert.strictEqual(isTabOverview('Guide / Index'), true);
      assert.strictEqual(isTabOverview('Random Tab', 'overview'), true);
    });

    it('correctly preserves academic syllabus and subject tabs', () => {
      assert.strictEqual(isTabOverview('DBMS'), false);
      assert.strictEqual(isTabOverview('Database Management Systems'), false);
      assert.strictEqual(isTabOverview('Prob & Stats'), false);
      assert.strictEqual(isTabOverview('COA'), false);
      assert.strictEqual(isTabOverview('Operating Systems'), false);
      assert.strictEqual(isTabOverview('Data Structures & Algorithms'), false);
      assert.strictEqual(isTabOverview('Python Programming'), false);
    });
  });

  describe('Subject Code Generation', () => {
    it('generates clean subject codes from single words and multi-word titles', () => {
      assert.strictEqual(generateSubjectCode('DBMS'), 'Sub_DBMS');
      assert.strictEqual(generateSubjectCode('Database Management Systems'), 'Sub_DBMS');
      assert.strictEqual(generateSubjectCode('Computer Organization & Architecture'), 'Sub_COA');
      assert.strictEqual(generateSubjectCode('Operating Systems'), 'Sub_OS');
    });

    it('handles collision with existing subject codes by appending numeric suffix', () => {
      const existing = ['Sub_DBMS', 'Sub_OS'];
      const code1 = generateSubjectCode('Database Management Systems', existing);
      assert.strictEqual(code1, 'Sub_DBMS_2');

      const code2 = generateSubjectCode('Operating Systems', [...existing, 'Sub_OS_2']);
      assert.strictEqual(code2, 'Sub_OS_3');
    });

    it('handles empty or special character titles gracefully', () => {
      const emptyCode = generateSubjectCode('');
      assert.ok(emptyCode.startsWith('Sub_'));
      const specCode = generateSubjectCode('!!! @@@ ###');
      assert.ok(specCode.startsWith('Sub_'));
    });
  });

  describe('Column Mapping & Semantic Inference', () => {
    it('infers Unit / Module columns correctly', () => {
      assert.strictEqual(inferColumnTarget('Module'), 'unit');
      assert.strictEqual(inferColumnTarget('Unit Number'), 'unit');
      assert.strictEqual(inferColumnTarget('Chapter'), 'unit');
      assert.strictEqual(inferColumnTarget('Mod'), 'unit');
    });

    it('infers Subtopic columns before generic topic columns', () => {
      assert.strictEqual(inferColumnTarget('Subtopic'), 'subtopic');
      assert.strictEqual(inferColumnTarget('Sub-topic'), 'subtopic');
      assert.strictEqual(inferColumnTarget('Subtopic Title'), 'subtopic');
      assert.strictEqual(inferColumnTarget('Concept Item'), 'subtopic');
    });

    it('infers Topic columns correctly', () => {
      assert.strictEqual(inferColumnTarget('Topic'), 'topic');
      assert.strictEqual(inferColumnTarget('Topic Name'), 'topic');
      assert.strictEqual(inferColumnTarget('Main Topic'), 'topic');
    });

    it('infers Done / Theory completion columns', () => {
      assert.strictEqual(inferColumnTarget('Done'), 'done');
      assert.strictEqual(inferColumnTarget('Completed'), 'done');
      assert.strictEqual(inferColumnTarget('Status'), 'done');
      assert.strictEqual(inferColumnTarget('Any Header', 'checkbox'), 'done');
      assert.strictEqual(inferColumnTarget('Any Header', 'boolean'), 'done');
    });

    it('infers Notes and Priority columns', () => {
      assert.strictEqual(inferColumnTarget('Notes'), 'notes');
      assert.strictEqual(inferColumnTarget('Remarks'), 'notes');
      assert.strictEqual(inferColumnTarget('Formulas & Links'), 'notes');
      assert.strictEqual(inferColumnTarget('Priority'), 'priority');
      assert.strictEqual(inferColumnTarget('Importance'), 'priority');
    });

    it('leaves ambiguous or unrelated columns as unmapped', () => {
      assert.strictEqual(inferColumnTarget('Tutor Name'), 'unmapped');
      assert.strictEqual(inferColumnTarget('Cost'), 'unmapped');
      assert.strictEqual(inferColumnTarget('Random Code 123'), 'unmapped');
    });

    it('runs inferInitialColumnMappings on standard Google Sheets column definitions', () => {
      const mockColumns = [
        { fieldKey: 'module_0', headerName: 'Module', inferredType: 'text', colIndex: 0 },
        { fieldKey: 'topic_1', headerName: 'Topic', inferredType: 'text', colIndex: 1 },
        { fieldKey: 'subtopic_2', headerName: 'Subtopic', inferredType: 'text', colIndex: 2 },
        { fieldKey: 'done_3', headerName: 'Done', inferredType: 'checkbox', colIndex: 3 },
        { fieldKey: 'notes_4', headerName: 'Notes', inferredType: 'text', colIndex: 4 },
        { fieldKey: 'priority_5', headerName: 'Priority', inferredType: 'text', colIndex: 5 },
        { fieldKey: 'extra_6', headerName: 'Extra Column', inferredType: 'text', colIndex: 6 },
      ] as unknown as SheetColumnMapping[];

      const mapped = inferInitialColumnMappings(mockColumns);
      assert.strictEqual(mapped.find((c) => c.fieldKey === 'module_0')?.targetField, 'unit');
      assert.strictEqual(mapped.find((c) => c.fieldKey === 'topic_1')?.targetField, 'topic');
      assert.strictEqual(mapped.find((c) => c.fieldKey === 'subtopic_2')?.targetField, 'subtopic');
      assert.strictEqual(mapped.find((c) => c.fieldKey === 'done_3')?.targetField, 'done');
      assert.strictEqual(mapped.find((c) => c.fieldKey === 'notes_4')?.targetField, 'notes');
      assert.strictEqual(mapped.find((c) => c.fieldKey === 'priority_5')?.targetField, 'priority');
      assert.strictEqual(mapped.find((c) => c.fieldKey === 'extra_6')?.targetField, 'unmapped');
    });
  });

  describe('Deterministic Composite Key & Content Hashing', () => {
    it('produces identical source row keys regardless of physical row number', () => {
      const key1 = computeSourceRowKey('sheet_123', 0, 'Sub_DBMS', 'Unit 1', 'ER Model', 'Entity Sets');
      const key2 = computeSourceRowKey('sheet_123', 0, 'Sub_DBMS', 'Unit 1', 'ER Model', 'Entity Sets');
      assert.strictEqual(key1, key2);
      assert.ok(key1.startsWith('srow_'));
      assert.strictEqual(key1.length, 37); // 'srow_' + 32-char hex
    });

    it('is case and whitespace insensitive for key stability', () => {
      const key1 = computeSourceRowKey('sheet_123', 0, 'Sub_DBMS', 'Unit 1', 'ER Model', 'Entity Sets');
      const key2 = computeSourceRowKey('sheet_123', 0, 'Sub_dbms', '  unit 1  ', 'er model', 'entity sets  ');
      assert.strictEqual(key1, key2);
    });

    it('changes key when topic or subtopic differs', () => {
      const key1 = computeSourceRowKey('sheet_123', 0, 'Sub_DBMS', 'Unit 1', 'ER Model', 'Entity Sets');
      const key2 = computeSourceRowKey('sheet_123', 0, 'Sub_DBMS', 'Unit 1', 'ER Model', 'Relationships');
      assert.notStrictEqual(key1, key2);
    });

    it('computes content hash for change detection', () => {
      const hash1 = computeContentHash('Unit 1', 'Topic A', 'Subtopic B', 'Some notes');
      const hash2 = computeContentHash('Unit 1', 'Topic A', 'Subtopic B', 'Some notes');
      const hash3 = computeContentHash('Unit 1', 'Topic A', 'Subtopic B', 'Updated notes');
      assert.strictEqual(hash1, hash2);
      assert.notStrictEqual(hash1, hash3);
    });
  });

  describe('Boolean & Priority Normalization', () => {
    it('normalizes boolean done states accurately', () => {
      assert.strictEqual(parseBooleanDone(true), true);
      assert.strictEqual(parseBooleanDone('true'), true);
      assert.strictEqual(parseBooleanDone('True'), true);
      assert.strictEqual(parseBooleanDone('DONE'), true);
      assert.strictEqual(parseBooleanDone('completed'), true);
      assert.strictEqual(parseBooleanDone('1'), true);
      assert.strictEqual(parseBooleanDone(1), true);
      assert.strictEqual(parseBooleanDone('☑'), true);
      assert.strictEqual(parseBooleanDone('✓'), true);

      assert.strictEqual(parseBooleanDone(false), false);
      assert.strictEqual(parseBooleanDone('false'), false);
      assert.strictEqual(parseBooleanDone('0'), false);
      assert.strictEqual(parseBooleanDone(''), false);
      assert.strictEqual(parseBooleanDone(null), false);
      assert.strictEqual(parseBooleanDone(undefined), false);
    });

    it('normalizes priorities correctly', () => {
      assert.strictEqual(normalizePriority('High'), 'High');
      assert.strictEqual(normalizePriority('urgent'), 'High');
      assert.strictEqual(normalizePriority('P0'), 'High');
      assert.strictEqual(normalizePriority('low'), 'Low');
      assert.strictEqual(normalizePriority('P3'), 'Low');
      assert.strictEqual(normalizePriority('medium'), 'Medium');
      assert.strictEqual(normalizePriority('unknown'), 'Medium');
      assert.strictEqual(normalizePriority(undefined), 'Medium');
    });
  });

  describe('generateImportPreview Safety & Accuracy', () => {
    const mockMapping: TabToSubjectMapping = {
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

    const mockRows = [
      {
        id: 'r1',
        rowUid: 'r1',
        sheetDocId: 'doc_1',
        tabId: 'tab_dbms',
        userId: 'usr_test',
        rowIndex: 1,
        values: {
          module: 'Unit 1: Foundations',
          topic: 'ER Model',
          subtopic: 'Entity Sets & Attributes',
          done: true,
          notes: 'Important diagram',
          priority: 'High',
        },
      },
      {
        id: 'r2',
        rowUid: 'r2',
        sheetDocId: 'doc_1',
        tabId: 'tab_dbms',
        userId: 'usr_test',
        rowIndex: 2,
        values: {
          module: 'Unit 1: Foundations',
          topic: 'ER Model',
          subtopic: 'Relationships & Constraints',
          done: false,
          notes: '',
          priority: 'Medium',
        },
      },
      {
        id: 'r3',
        rowUid: 'r3',
        sheetDocId: 'doc_1',
        tabId: 'tab_dbms',
        userId: 'usr_test',
        rowIndex: 3,
        values: {
          // Exact duplicate of row 1 in source sheet
          module: 'Unit 1: Foundations',
          topic: 'ER Model',
          subtopic: 'Entity Sets & Attributes',
          done: true,
          notes: 'Important diagram',
          priority: 'High',
        },
      },
      {
        id: 'r4',
        rowUid: 'r4',
        sheetDocId: 'doc_1',
        tabId: 'tab_dbms',
        userId: 'usr_test',
        rowIndex: 4,
        values: {
          // Missing both topic and subtopic -> invalid row
          module: 'Unit 2',
          topic: '',
          subtopic: '',
          done: false,
        },
      },
    ] as unknown as SheetSyncedRow[];

    it('enforces safety invariant: Done = TRUE maps to Theory = true, Practice = false', () => {
      const preview = generateImportPreview({
        tabs: [{ mapping: mockMapping, rows: mockRows }],
        existingSubjects: [],
        existingTopics: [],
        spreadsheetId: 'spread_123',
        selectedTierId: 'tier1_sem3',
        markDoneAsTheoryOnly: true,
      });

      const subjects = preview.previewSubjects;
      assert.strictEqual(subjects.length, 1);
      const topics = subjects[0].topics;

      // First topic had done: true
      const topic1 = topics[0];
      assert.strictEqual(topic1.theory, true, 'Done = true must map to Theory = true');
      assert.strictEqual(topic1.practice, false, 'Done = true must keep Practice = false (Unchanged)');
      assert.strictEqual(topic1.pyq, false, 'Done = true must keep PYQ = false (Unchanged)');

      // Second topic had done: false
      const topic2 = topics[1];
      assert.strictEqual(topic2.theory, false, 'Done = false must map to Theory = false');
      assert.strictEqual(topic2.practice, false, 'Practice must remain false');
    });

    it('accurately counts duplicate rows, invalid rows, and theory completed metrics', () => {
      const preview = generateImportPreview({
        tabs: [{ mapping: mockMapping, rows: mockRows }],
        existingSubjects: [],
        existingTopics: [],
        spreadsheetId: 'spread_123',
        selectedTierId: 'tier1_sem3',
        markDoneAsTheoryOnly: true,
      });

      const summary = preview.summary;
      assert.strictEqual(summary.tabsSelectedCount, 1);
      assert.strictEqual(summary.subjectsToCreateCount, 1);
      assert.strictEqual(summary.subjectsToMergeCount, 0);
      assert.strictEqual(summary.invalidRowsCount, 1, 'Row 4 had empty topic and subtopic');
      assert.strictEqual(summary.duplicateRowsCount, 1, 'Row 3 was duplicate of Row 1');
      assert.strictEqual(summary.theoryCompletedCount, 2, 'Row 1 and Row 3 had Done = true');
    });

    it('identifies existing topics and subjects for non-destructive merging', () => {
      const existingSubjects: StudySubject[] = [
        {
          id: 'subj_1',
          userId: 'usr_test',
          code: 'Sub_DBMS',
          name: 'Database Management Systems',
          tierId: 'tier1_sem3',
          totalSubtopics: 10,
          completedSubtopics: 4,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        },
      ];

      const existingTopics: StudyTopic[] = [
        {
          id: 'topic_existing_1',
          userId: 'usr_test',
          subjectCode: 'Sub_DBMS',
          unit: 'Unit 1: Foundations',
          topic: 'ER Model',
          subtopic: 'Relationships & Constraints',
          priority: 'Medium',
          theory: true,
          practice: true,
          pyq: true,
          revisionCount: 3,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        },
      ];

      const preview = generateImportPreview({
        tabs: [{ mapping: { ...mockMapping, action: 'map_existing' }, rows: mockRows }],
        existingSubjects,
        existingTopics,
        spreadsheetId: 'spread_123',
        selectedTierId: 'tier1_sem3',
      });

      assert.strictEqual(preview.summary.subjectsToCreateCount, 0);
      assert.strictEqual(preview.summary.subjectsToMergeCount, 1);
      assert.strictEqual(preview.summary.existingTopicsCount, 1, 'Relationships & Constraints matches existing topic');
      assert.strictEqual(preview.summary.newTopicsCount, 2, 'Entity Sets & Attributes (x2)');

      const matchTopic = preview.previewSubjects[0].topics.find(
        (t) => t.subtopic === 'Relationships & Constraints'
      );
      assert.ok(matchTopic);
      assert.strictEqual(matchTopic?.isExistingMatch, true);
      assert.strictEqual(matchTopic?.existingTopicId, 'topic_existing_1');
    });
  });
});
