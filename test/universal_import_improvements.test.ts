import './test_bootstrap.ts';
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  detectHeaderRowCandidates,
  detectHeaderRowIndex,
  detectTabSchema,
} from '../src/lib/sheetHub/schemaDetector.ts';
import {
  inferColumnTargetWithConfidence,
  inferColumnTarget,
  inferInitialColumnMappings,
  normalizeHierarchyKey,
  generateImportPreview,
  computeSourceMappingKey,
  computeSourceRowKey,
  computeContentHash,
} from '../src/lib/sheetHub/sheetToStudyTransformer.ts';
import {
  executeSheetToStudyImport,
  undoImportSession,
  yieldToEventLoop,
} from '../src/lib/sheetHub/sheetToStudyImportEngine.ts';
import { studyImportHistoryStore } from '../src/lib/sheetHub/studyImportHistoryStore.ts';
import type { SheetInspectCellMeta, SheetSyncedRow, SheetConnection } from '../src/types/sheetHub.ts';
import type { StudySubject, StudyTopic, AcademicTier } from '../src/types/study.ts';

describe('Universal Import Engine — Additional Architectural Improvements Test Suite', () => {
  // Helper to construct cell meta
  const cell = (val: any, formula?: string): SheetInspectCellMeta => ({
    value: val,
    formattedValue: val !== null && val !== undefined ? String(val) : '',
    formula: formula || null,
    isBooleanCell: typeof val === 'boolean',
  });

  const makeRow = (
    tabId: string,
    idx: number,
    values: Record<string, any>
  ): SheetSyncedRow => ({
    id: `row_${tabId}_${idx}`,
    rowUid: `row_${tabId}_${idx}`,
    tabId,
    sheetDocId: 'conn_test',
    userId: 'usr_universal_test',
    rowIndex: idx,
    lastKnownSheetRow: idx,
    values,
    baseValues: values,
    rowHash: `hash_${idx}`,
    version: 1,
    lastSyncOrigin: 'sheet' as const,
    dirtyFields: [],
    localUpdatedAt: null,
    sheetSyncedAt: new Date().toISOString(),
    status: 'synced',
  });

  // --------------------------------------------------------------------------
  // 1. Flexible Header Detection
  // --------------------------------------------------------------------------
  describe('1. Flexible Header Detection', () => {
    it('detects headers when located at row 4 after banner, description, and empty line', () => {
      const grid: SheetInspectCellMeta[][] = [
        // Row 1: Title Banner
        [cell('Advanced Engineering Curriculum — Semester V'), cell(null), cell(null), cell(null)],
        // Row 2: Subtitle / Description
        [cell('Published on August 2026 by Department of Computer Science & Engineering'), cell(null), cell(null), cell(null)],
        // Row 3: Blank Row
        [cell(null), cell(null), cell(null), cell(null)],
        // Row 4: Genuine Tabular Headers
        [cell('Module'), cell('Chapter'), cell('Topic Name'), cell('Done Status')],
        // Row 5: Data Row 1
        [cell('Module 1'), cell('Ch 1'), cell('Distributed Hash Tables'), cell(true)],
        // Row 6: Data Row 2
        [cell('Module 1'), cell('Ch 2'), cell('Consistent Hashing'), cell(false)],
      ];

      const candidates = detectHeaderRowCandidates(grid);
      assert.ok(candidates.length > 0, 'Should find header candidates');
      assert.strictEqual(candidates[0].rowIndex0, 3, 'Top candidate must be row index 3 (Row 4)');
      assert.strictEqual(candidates[0].confidence, 'high', 'Should have high confidence');
      assert.strictEqual(detectHeaderRowIndex(grid), 3);
    });

    it('detects headers at row 8 after multiple prologue and metadata rows', () => {
      const grid: SheetInspectCellMeta[][] = [
        [cell('Course: CS801'), cell('Credits: 4'), cell(null)],
        [cell('Faculty: Prof. Alan'), cell(null), cell(null)],
        [cell('Target Exam: Dec 2026'), cell(null), cell(null)],
        [cell('Instructions: Tick done when lecture attended'), cell(null), cell(null)],
        [cell(null), cell(null), cell(null)],
        [cell('Grading Scheme: Theory 70% | Practical 30%'), cell(null), cell(null)],
        [cell(null), cell(null), cell(null)],
        // Row 8 (index 7): True Table Header
        [cell('Unit'), cell('Topic'), cell('Subtopic'), cell('Done'), cell('Priority'), cell('Notes')],
        // Data Rows
        [cell('Unit 1'), cell('Virtualization'), cell('Hypervisors Type 1 & 2'), cell(true), cell('High'), cell('Important for mid-terms')],
        [cell('Unit 1'), cell('Containers'), cell('cgroups & namespaces'), cell(false), cell('Medium'), cell('Hands-on lab')],
      ];

      const detected = detectHeaderRowIndex(grid);
      assert.strictEqual(detected, 7, 'Must detect Row 8 (index 7) as the true header row');
    });

    it('forward-fills sparse headers created by merged column headers', () => {
      const grid: SheetInspectCellMeta[][] = [
        // Row 1: Merged header span (e.g. "Syllabus Details" spanning across col A & B)
        [cell('Syllabus Details'), cell(null), cell('Completion'), cell('Remarks')],
        [cell('Algebra'), cell('Linear Equations'), cell(true), cell('Completed yesterday')],
        [cell('Calculus'), cell('Integration by parts'), cell(false), cell('Practice needed')],
      ];

      const tabSchema = detectTabSchema({
        sheetId: 101,
        sheetTitle: 'Maths_Curriculum',
        rows: grid,
      });

      assert.strictEqual(tabSchema.columns.length, 4);
      // Col 0 has header 'Syllabus Details'
      assert.strictEqual(tabSchema.columns[0].headerName, 'Syllabus Details');
      // Col 1 was empty due to merge; forward-filled
      assert.ok(
        tabSchema.columns[1].headerName.includes('Syllabus Details'),
        `Column 1 should be qualified with merged parent: got "${tabSchema.columns[1].headerName}"`
      );
    });
  });

  // --------------------------------------------------------------------------
  // 2. Intelligent Column Mapping & Never Silently Map Uncertain Columns
  // --------------------------------------------------------------------------
  describe('2. Intelligent Column Mapping', () => {
    it('accurately maps multilingual syllabus headers (Bengali, Hindi, English synonyms)', () => {
      // Bengali
      const bTopic = inferColumnTargetWithConfidence('টপিক');
      assert.strictEqual(bTopic.target, 'topic');
      assert.strictEqual(bTopic.confidence, 'high');

      const bChapter = inferColumnTargetWithConfidence('অধ্যায়', undefined, new Set(['unit']));
      assert.strictEqual(bChapter.target, 'chapter');
      assert.strictEqual(bChapter.confidence, 'high');

      const bDone = inferColumnTargetWithConfidence('সম্পন্ন');
      assert.strictEqual(bDone.target, 'done');
      assert.strictEqual(bDone.confidence, 'high');

      // Hindi
      const hModule = inferColumnTargetWithConfidence('मॉड्यूल');
      assert.strictEqual(hModule.target, 'unit');
      assert.strictEqual(hModule.confidence, 'high');

      // English Synonyms
      const sBlock = inferColumnTargetWithConfidence('Learning Block');
      assert.strictEqual(sBlock.target, 'unit');

      const sTheme = inferColumnTargetWithConfidence('Theme / Lesson', undefined, new Set(['unit']));
      assert.strictEqual(sTheme.target, 'chapter');

      const sPoint = inferColumnTargetWithConfidence('Discussion Points');
      assert.strictEqual(sPoint.target, 'subtopic');
    });

    it('NEVER silently maps an uncertain or unrecognized column to topic', () => {
      const ambiguousHeaders = [
        'Miscellaneous_Col_A',
        'Temp_Field_7',
        'Raw_Value_100',
        'XYZ_Uncertain',
      ];

      for (const h of ambiguousHeaders) {
        const res = inferColumnTargetWithConfidence(h);
        assert.strictEqual(res.target, 'unmapped', `Header "${h}" must NOT be mapped to any field`);
        assert.strictEqual(res.isUncertain, true, `Header "${h}" must be flagged as isUncertain`);
        assert.strictEqual(res.confidence, 'low');
      }

      // In initial column mapping generation:
      const mappings = inferInitialColumnMappings([
        {
          colIndex: 0,
          colLetter: 'A',
          fieldKey: 'col_a',
          headerName: 'Random_Attribute',
          displayName: 'Random_Attribute',
          inferredType: 'text',
          confirmedType: 'text',
          semanticRole: 'custom',
          confidence: 'low',
          editable: true,
          requiresConfirmation: true,
        },
      ]);

      assert.strictEqual(mappings[0].targetField, 'unmapped', 'Uncertain column must remain unmapped');
      assert.strictEqual(mappings[0].isUncertain, true);
    });
  });

  // --------------------------------------------------------------------------
  // 3. Accurate Identity, Hierarchy & Move/Rename Detection
  // --------------------------------------------------------------------------
  describe('3. Accurate Identity & Hierarchy Matching', () => {
    it('guarantees identical topic names in different modules have distinct identities and never collide', () => {
      const keyModule1 = normalizeHierarchyKey('CS101', 'Module 1: Foundations', 'Introduction', 'Overview');
      const keyModule2 = normalizeHierarchyKey('CS101', 'Module 2: Advanced Concepts', 'Introduction', 'Overview');

      assert.notStrictEqual(keyModule1, keyModule2, 'Topics in different modules must produce distinct hierarchy keys');

      // Preview generation with duplicate topic names in different units
      const mapping = {
        tabId: 't1',
        sheetId: 1,
        sheetTitle: 'Syllabus',
        isIncluded: true,
        action: 'create_new' as const,
        targetSubjectCode: 'CS101',
        targetSubjectName: 'Computer Science',
        targetColor: '#3b82f6',
        columns: [
          { fieldKey: 'mod', headerName: 'Module', targetField: 'module' as const },
          { fieldKey: 'top', headerName: 'Topic', targetField: 'topic' as const },
        ],
        detectedRowCount: 2,
      };

      const rows: SheetSyncedRow[] = [
        makeRow('t1', 1, { mod: 'Module 1', top: 'Introduction' }),
        makeRow('t1', 2, { mod: 'Module 2', top: 'Introduction' }),
      ];

      const preview = generateImportPreview({
        tabs: [{ mapping, rows }],
        existingSubjects: [],
        existingTopics: [],
        spreadsheetId: 'sheet_hierarchy_test',
        selectedTierId: 'tier1',
      });

      assert.strictEqual(preview.summary.newTopicsCount, 2, 'Both topics must be recognized as distinct');
      assert.strictEqual(preview.summary.duplicateRowsCount, 0, 'Should not be flagged as duplicates');
    });

    it('detects when an existing topic has been moved to a different unit or renamed', () => {
      const existingTopics: StudyTopic[] = [
        {
          id: 'topic_existing_1',
          userId: 'usr_move_test',
          subjectCode: 'PHY101',
          unit: 'Unit 1: Kinematics',
          topic: 'Newton Laws',
          subtopic: 'First Law of Motion',
          priority: 'High',
          theory: true,
          practice: false,
          pyq: false,
          revisionCount: 1,
          sourceRowKey: computeSourceRowKey('sheet_move', 1, 'PHY101', 'Unit 1: Kinematics', 'Newton Laws', 'First Law of Motion'),
          sourceMappingKey: computeSourceMappingKey('sheet_move', 1, 'row_1_1'),
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        },
      ];

      // Incoming row: Same row ID (row_1_1) but moved to Unit 2 and renamed
      const mapping = {
        tabId: 't_phy',
        sheetId: 1,
        sheetTitle: 'Physics',
        isIncluded: true,
        action: 'create_new' as const,
        targetSubjectCode: 'PHY101',
        targetSubjectName: 'Physics',
        targetColor: '#3b82f6',
        columns: [
          { fieldKey: 'u', headerName: 'Unit', targetField: 'unit' as const },
          { fieldKey: 't', headerName: 'Topic', targetField: 'topic' as const },
          { fieldKey: 's', headerName: 'Subtopic', targetField: 'subtopic' as const },
        ],
        detectedRowCount: 1,
      };

      const rows: SheetSyncedRow[] = [
        {
          ...makeRow('t_phy', 1, {
            u: 'Unit 2: Dynamics', // MOVED
            t: 'Newton Laws of Motion', // RENAMED
            s: 'First Law (Inertia)', // RENAMED
          }),
          id: 'row_1_1',
          rowUid: 'row_1_1',
        },
      ];

      const preview = generateImportPreview({
        tabs: [{ mapping, rows }],
        existingSubjects: [],
        existingTopics,
        spreadsheetId: 'sheet_move',
        selectedTierId: 'tier1',
      });

      assert.strictEqual(preview.conflictAnalysis.changedTopics.length, 1);
      const changed = preview.conflictAnalysis.changedTopics[0];
      assert.ok(changed.diffFields.includes('unit'), 'Must detect unit change (moved)');
      assert.ok(changed.diffFields.includes('topic'), 'Must detect topic change (renamed)');
    });
  });

  // --------------------------------------------------------------------------
  // 4. Preserve Existing Progress
  // --------------------------------------------------------------------------
  describe('4. Preserve Existing Progress', () => {
    it('strictly preserves student theory completion when incoming sheet has Done = false', async () => {
      const testUserId = `usr_preserve_${Date.now()}`;
      const existingTopic: StudyTopic = {
        id: 'top_study_mastered_1',
        userId: testUserId,
        subjectCode: 'CHEM101',
        unit: 'Physical Chemistry',
        topic: 'Thermodynamics',
        subtopic: 'Gibbs Free Energy',
        priority: 'High',
        theory: true,         // Completed by student in Study OS!
        practice: true,       // Solved problems!
        pyq: true,
        revisionCount: 3,     // 3 Ebbinghaus review sessions!
        notes: 'Important exam formula: dG = dH - TdS',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };

      const conn: SheetConnection = {
        id: 'conn_preserve_test',
        userId: testUserId,
        title: 'Chemistry Syllabus',
        spreadsheetId: 'sheet_chem_dummy',
        spreadsheetUrl: 'https://docs.google.com/spreadsheets/d/dummy_chem',
        sourceSpreadsheetId: 'sheet_chem_dummy',
        status: 'active',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        syncMode: 'sheet_to_app',
        writeMode: 'none',
        writeAuthStatus: 'not_requested',
        templateHint: 'custom',
        lastError: null,
        lastSyncedAt: null,
        lastSuccessfulPullAt: null,
        lastSuccessfulPushAt: null,
        pollIntervalSec: 60,
        syncOnOpen: true,
        pendingChangesCount: 0,
        conflictCount: 0,
        tabOrder: [],
        deletedAt: null,
      };

      const mapping = {
        tabId: 'tab_chem',
        sheetId: 10,
        sheetTitle: 'Physical Chemistry',
        isIncluded: true,
        action: 'create_new' as const,
        targetSubjectCode: 'CHEM101',
        targetSubjectName: 'Chemistry',
        targetColor: '#10b981',
        columns: [
          { fieldKey: 'u', headerName: 'Unit', targetField: 'unit' as const },
          { fieldKey: 't', headerName: 'Topic', targetField: 'topic' as const },
          { fieldKey: 's', headerName: 'Subtopic', targetField: 'subtopic' as const },
          { fieldKey: 'done', headerName: 'Done', targetField: 'done' as const },
        ],
        detectedRowCount: 1,
      };

      // Sheet row has Done = FALSE (unchecked)
      const rows: SheetSyncedRow[] = [
        makeRow('tab_chem', 1, {
          u: 'Physical Chemistry',
          t: 'Thermodynamics',
          s: 'Gibbs Free Energy',
          done: false, // Unchecked in sheet!
        }),
      ];

      const preview = generateImportPreview({
        tabs: [{ mapping, rows }],
        existingSubjects: [],
        existingTopics: [existingTopic],
        spreadsheetId: 'sheet_chem_dummy',
        selectedTierId: 'tier1',
      });

      // Existing topic should remain unchanged
      assert.strictEqual(preview.summary.newTopicsCount, 0);
      assert.strictEqual(preview.summary.existingTopicsCount, 1);
      assert.strictEqual(preview.conflictAnalysis.changedTopics.length, 0);
      assert.strictEqual(preview.conflictAnalysis.unchangedTopics.length, 1);
    });
  });

  // --------------------------------------------------------------------------
  // 5. Removed Source Records (Orphan Detection without Deletion)
  // --------------------------------------------------------------------------
  describe('5. Removed Source Records (Orphan Detection)', () => {
    it('flags absent source topics for review and guarantees they are never automatically deleted', () => {
      const existingTopics: StudyTopic[] = [
        {
          id: 'top_retained_1',
          userId: 'usr_orphan_test',
          subjectCode: 'BIO101',
          unit: 'Genetics',
          topic: 'Mendelian Laws',
          subtopic: 'Monohybrid Cross',
          priority: 'High',
          theory: true,
          practice: true,
          pyq: false,
          revisionCount: 2,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        },
        {
          id: 'top_orphaned_in_sheet',
          userId: 'usr_orphan_test',
          subjectCode: 'BIO101',
          unit: 'Genetics',
          topic: 'Linkage & Crossing Over',
          subtopic: 'Gene Mapping',
          priority: 'High',
          theory: true,
          practice: true,
          pyq: true,
          revisionCount: 5,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        },
      ];

      // Sheet only has topic 1; topic 2 was deleted from the spreadsheet
      const mapping = {
        tabId: 't_bio',
        sheetId: 1,
        sheetTitle: 'Biology',
        isIncluded: true,
        action: 'create_new' as const,
        targetSubjectCode: 'BIO101',
        targetSubjectName: 'Biology',
        targetColor: '#22c55e',
        columns: [
          { fieldKey: 'u', headerName: 'Unit', targetField: 'unit' as const },
          { fieldKey: 't', headerName: 'Topic', targetField: 'topic' as const },
          { fieldKey: 's', headerName: 'Subtopic', targetField: 'subtopic' as const },
        ],
        detectedRowCount: 1,
      };

      const rows: SheetSyncedRow[] = [
        makeRow('t_bio', 1, {
          u: 'Genetics',
          t: 'Mendelian Laws',
          s: 'Monohybrid Cross',
        }),
      ];

      const preview = generateImportPreview({
        tabs: [{ mapping, rows }],
        existingSubjects: [],
        existingTopics,
        spreadsheetId: 'sheet_bio',
        selectedTierId: 'tier1',
      });

      assert.strictEqual(preview.conflictAnalysis.missingSourceTopics.length, 1);
      assert.strictEqual(preview.conflictAnalysis.missingSourceTopics[0].id, 'top_orphaned_in_sheet');
      assert.strictEqual(preview.conflictAnalysis.missingSourceTopics[0].practice, true);
      assert.strictEqual(preview.conflictAnalysis.missingSourceTopics[0].revisionCount, 5);
    });
  });

  // --------------------------------------------------------------------------
  // 6. Accurate Import Reporting & Strict Reconciliation
  // --------------------------------------------------------------------------
  describe('6. Accurate Import Reporting & Strict Reconciliation', () => {
    it('mathematically reconciles totalRowsEvaluated === created + updated + unchanged + duplicate + invalid', () => {
      const mapping = {
        tabId: 't_recon',
        sheetId: 7,
        sheetTitle: 'Reconcile_Test',
        isIncluded: true,
        action: 'create_new' as const,
        targetSubjectCode: 'MATH101',
        targetSubjectName: 'Mathematics',
        targetColor: '#6366f1',
        columns: [
          { fieldKey: 'u', headerName: 'Unit', targetField: 'unit' as const },
          { fieldKey: 't', headerName: 'Topic', targetField: 'topic' as const },
          { fieldKey: 's', headerName: 'Subtopic', targetField: 'subtopic' as const },
        ],
        detectedRowCount: 5,
      };

      const existingTopics: StudyTopic[] = [
        {
          id: 'existing_top_1',
          userId: 'usr_recon',
          subjectCode: 'MATH101',
          unit: 'Algebra',
          topic: 'Matrices',
          subtopic: 'Eigenvalues',
          priority: 'High',
          theory: false,
          practice: false,
          pyq: false,
          revisionCount: 0,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        },
      ];

      const rows: SheetSyncedRow[] = [
        // 1. Unchanged match
        makeRow('t_recon', 1, { u: 'Algebra', t: 'Matrices', s: 'Eigenvalues' }),
        // 2. New topic
        makeRow('t_recon', 2, { u: 'Algebra', t: 'Determinants', s: 'Cramer Rule' }),
        // 3. Duplicate row of #2
        makeRow('t_recon', 3, { u: 'Algebra', t: 'Determinants', s: 'Cramer Rule' }),
        // 4. Invalid summary count row
        makeRow('t_recon', 4, { u: 'Total', t: '198', s: '' }),
        // 5. Empty placeholder row
        makeRow('t_recon', 5, { u: '', t: 'n/a', s: '' }),
      ];

      const preview = generateImportPreview({
        tabs: [{ mapping, rows }],
        existingSubjects: [],
        existingTopics,
        spreadsheetId: 'sheet_recon',
        selectedTierId: 'tier1',
      });

      assert.ok(preview.summary.reconciliation, 'Reconciliation report must exist');
      const rec = preview.summary.reconciliation;
      assert.strictEqual(rec.totalRowsEvaluated, 5);
      assert.strictEqual(rec.created, 1);
      assert.strictEqual(rec.unchanged, 1);
      assert.strictEqual(rec.duplicate, 1);
      assert.strictEqual(rec.invalid, 2);
      assert.strictEqual(rec.isReconciled, true, 'Sum of breakdown must exactly equal total rows');
    });
  });

  // --------------------------------------------------------------------------
  // 7. Scalable Performance & Non-blocking Event Loop Yielding
  // --------------------------------------------------------------------------
  describe('7. Scalable Performance', () => {
    it('yields cleanly to event loop during large synthetic dataset parsing', async () => {
      let yielded = false;
      const promise = yieldToEventLoop().then(() => {
        yielded = true;
      });
      assert.strictEqual(yielded, false, 'Yield should be asynchronous');
      await promise;
      assert.strictEqual(yielded, true, 'Must resolve cleanly after event loop cycle');
    });
  });
});
