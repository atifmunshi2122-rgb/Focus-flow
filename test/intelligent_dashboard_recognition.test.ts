import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import type { SheetInspectCellMeta, SheetTabInspectionInput } from '../src/types/sheetHub.ts';
import {
  classifySheetPurpose,
  detectTabSchema,
  detectWorkbookSchema,
  extractCrossSheetFormulas,
  extractDashboardReferenceData,
} from '../src/lib/sheetHub/schemaDetector.ts';
import {
  generateImportPreview,
  isTabOverview,
  performCrossSheetValidation,
  TabToSubjectMapping,
} from '../src/lib/sheetHub/sheetToStudyTransformer.ts';
import { executeSheetToStudyImport } from '../src/lib/sheetHub/sheetToStudyImportEngine.ts';

function createCell(
  value: any,
  formula?: string,
  isBoolean = false,
  formatType?: string
): SheetInspectCellMeta {
  return {
    value,
    formattedValue: value !== null && value !== undefined ? String(value) : null,
    formula: formula || null,
    isBooleanCell: isBoolean,
    numberFormatType: formatType || null,
  };
}

describe('Intelligent Overview / Dashboard Sheet Recognition & Cross-Sheet Validation', () => {
  // ==========================================================================
  // 1. Structural Dashboard Recognition
  // ==========================================================================
  describe('1. Structural Dashboard Recognition', () => {
    it('1.1 Recognizes dashboard sheet via cross-sheet formulas regardless of tab name', () => {
      const rows: SheetInspectCellMeta[][] = [
        [createCell('Subject'), createCell('Total Topics'), createCell('Completed')],
        [createCell('DBMS'), createCell(198, "=COUNTA('DBMS'!A2:A)"), createCell(150, "=COUNTIF('DBMS'!D:D, TRUE)")],
        [createCell('COA'), createCell(125, "=COUNTA('COA'!A2:A)"), createCell(100, "=COUNTIF('COA'!D:D, TRUE)")],
        [createCell('Python'), createCell(147, "=COUNTA('Python'!A2:A)"), createCell(120, "=COUNTIF('Python'!D:D, TRUE)")],
        [createCell('Prob & Stats'), createCell(127, "=COUNTA('Prob & Stats'!A2:A)"), createCell(80, "=COUNTIF('Prob & Stats'!D:D, TRUE)")],
      ];

      const formulas = extractCrossSheetFormulas(rows, ['DBMS', 'COA', 'Python', 'Prob & Stats']);
      assert.equal(formulas.length, 8);
      assert.equal(formulas.filter((f) => !f.isBroken).length, 8);

      const dashboardReport = extractDashboardReferenceData('Curriculum Status', 99, rows, [
        'DBMS',
        'COA',
        'Python',
        'Prob & Stats',
      ]);
      assert.equal(dashboardReport.isRecognizedDashboard, true);
      assert.equal(dashboardReport.confidence, 'high');
      assert.equal(dashboardReport.subjectReferences.length, 4);
    });

    it('1.2 Recognizes dashboard sheet via multi-subject summary table and KPI layout', () => {
      const rows: SheetInspectCellMeta[][] = [
        [createCell('Academic Progress Overview'), createCell(null), createCell(null)],
        [createCell('Total Syllabus:'), createCell(597), createCell(null)],
        [createCell('Overall Progress:'), createCell('65%'), createCell(null)],
        [createCell('Subject'), createCell('Topics'), createCell('Done'), createCell('Progress %')],
        [createCell('DBMS'), createCell(198), createCell(150), createCell('75.8%')],
        [createCell('COA'), createCell(125), createCell(100), createCell('80%')],
        [createCell('Python'), createCell(147), createCell(120), createCell('81.6%')],
        [createCell('Prob & Stats'), createCell(127), createCell(80), createCell('63%')],
      ];

      const dashboardReport = extractDashboardReferenceData('Overview', 1, rows);
      assert.equal(dashboardReport.isRecognizedDashboard, true);
      assert.equal(dashboardReport.totalSyllabusCount, 597);
      assert.equal(dashboardReport.subjectReferences.length, 4);

      const dbmsRef = dashboardReport.subjectReferences.find((s) => s.subjectName === 'DBMS');
      assert.ok(dbmsRef);
      assert.equal(dbmsRef.expectedTotalTopics, 198);
      assert.equal(dbmsRef.expectedCompletedTopics, 150);
    });

    it('1.3 Classifies sheet purpose dynamically as dashboard, reference, or syllabus', () => {
      // A) Dashboard sheet
      const dashboardRows: SheetInspectCellMeta[][] = [
        [createCell('Subject'), createCell('Total Topics')],
        [createCell('DBMS'), createCell(198, "=COUNTA('DBMS'!A:A)")],
        [createCell('COA'), createCell(125, "=COUNTA('COA'!A:A)")],
      ];
      const dashboardClassification = classifySheetPurpose(
        'Overview',
        dashboardRows[0],
        dashboardRows.slice(1),
        [
          { colIndex: 0, colLetter: 'A', fieldKey: 'subj', headerName: 'Subject', displayName: 'Subject', inferredType: 'text', confirmedType: 'text', semanticRole: 'group', confidence: 'high', editable: true, requiresConfirmation: false },
          { colIndex: 1, colLetter: 'B', fieldKey: 'tot', headerName: 'Total Topics', displayName: 'Total Topics', inferredType: 'formula', confirmedType: 'formula', semanticRole: 'metric', confidence: 'high', editable: false, requiresConfirmation: false },
        ],
        2,
        6,
        ['DBMS', 'COA']
      );
      assert.equal(dashboardClassification.purpose, 'dashboard');
      assert.equal(dashboardClassification.role, 'overview');

      // B) Reference / Lookup sheet
      const referenceRows: SheetInspectCellMeta[][] = [
        [createCell('Subject Code'), createCell('Full Course Title'), createCell('Credits')],
        [createCell('CS301'), createCell('Database Management Systems'), createCell(4)],
        [createCell('CS302'), createCell('Computer Organization & Architecture'), createCell(4)],
      ];
      const referenceClassification = classifySheetPurpose(
        'Course Reference',
        referenceRows[0],
        referenceRows.slice(1),
        [
          { colIndex: 0, colLetter: 'A', fieldKey: 'code', headerName: 'Subject Code', displayName: 'Subject Code', inferredType: 'text', confirmedType: 'text', semanticRole: 'id', confidence: 'high', editable: true, requiresConfirmation: false },
          { colIndex: 1, colLetter: 'B', fieldKey: 'title', headerName: 'Full Course Title', displayName: 'Full Course Title', inferredType: 'text', confirmedType: 'text', semanticRole: 'title', confidence: 'high', editable: true, requiresConfirmation: false },
          { colIndex: 2, colLetter: 'C', fieldKey: 'credits', headerName: 'Credits', displayName: 'Credits', inferredType: 'number', confirmedType: 'number', semanticRole: 'metric', confidence: 'high', editable: true, requiresConfirmation: false },
        ],
        0,
        9
      );
      assert.equal(referenceClassification.purpose, 'reference');
      assert.equal(referenceClassification.role, 'reference');

      // C) Syllabus data sheet
      const syllabusRows: SheetInspectCellMeta[][] = [
        [createCell('Unit'), createCell('Topic'), createCell('Done')],
        [createCell('Unit 1'), createCell('ER Modeling'), createCell(true, undefined, true)],
        [createCell('Unit 1'), createCell('Relational Algebra'), createCell(false, undefined, true)],
      ];
      const syllabusClassification = classifySheetPurpose(
        'DBMS',
        syllabusRows[0],
        syllabusRows.slice(1),
        [
          { colIndex: 0, colLetter: 'A', fieldKey: 'unit', headerName: 'Unit', displayName: 'Unit', inferredType: 'text', confirmedType: 'text', semanticRole: 'group', confidence: 'high', editable: true, requiresConfirmation: false },
          { colIndex: 1, colLetter: 'B', fieldKey: 'topic', headerName: 'Topic', displayName: 'Topic', inferredType: 'text', confirmedType: 'text', semanticRole: 'title', confidence: 'high', editable: true, requiresConfirmation: false },
          { colIndex: 2, colLetter: 'C', fieldKey: 'done', headerName: 'Done', displayName: 'Done', inferredType: 'checkbox', confirmedType: 'checkbox', semanticRole: 'done', confidence: 'high', editable: true, requiresConfirmation: false },
        ],
        0,
        9
      );
      assert.equal(syllabusClassification.purpose, 'syllabus');
      assert.equal(syllabusClassification.role, 'data');
    });

    it('1.4 Detects broken cross-sheet references (#REF! and missing tab targets)', () => {
      const rows: SheetInspectCellMeta[][] = [
        [createCell('Subject'), createCell('Count')],
        [createCell('DBMS'), createCell(null, "='Deleted Tab'!A1:A")],
        [createCell('COA'), createCell(null, "=COUNT(#REF!)")],
      ];

      const formulas = extractCrossSheetFormulas(rows, ['DBMS', 'COA']);
      assert.equal(formulas.length, 2);
      assert.equal(formulas[0].isBroken, true);
      assert.ok(formulas[0].brokenReason?.includes('does not exist'));
      assert.equal(formulas[1].isBroken, true);
      assert.ok(formulas[1].brokenReason?.includes('#REF!'));
    });
  });

  // ==========================================================================
  // 2. Cross-Sheet Validation Engine
  // ==========================================================================
  describe('2. Cross-Sheet Validation Engine', () => {
    it('2.1 Reports 100% consistent when Dashboard expectations match parsed syllabus records', () => {
      const dashboardReport = {
        sheetTitle: 'Overview',
        sheetId: 1,
        isRecognizedDashboard: true,
        confidence: 'high' as const,
        confidenceScore: 0.9,
        reasons: ['Cross-sheet formulas found'],
        totalSyllabusCount: 323,
        totalCompletedCount: 250,
        overallCompletionPct: 77.4,
        brokenReferencesCount: 0,
        crossSheetFormulas: [],
        subjectReferences: [
          { subjectName: 'DBMS', expectedTotalTopics: 198, expectedCompletedTopics: 150 },
          { subjectName: 'COA', expectedTotalTopics: 125, expectedCompletedTopics: 100 },
        ],
      };

      const previewSubjects = [
        {
          subjectCode: 'Sub_DBMS',
          subjectName: 'DBMS',
          sheetTitle: 'DBMS',
          tierId: 'tier1_sem3',
          color: '#3b82f6',
          isNewSubject: true,
          topics: [],
          totalTopics: 198,
          theoryCompletedCount: 150,
          duplicateRowsCount: 0,
          invalidRowsCount: 0,
        },
        {
          subjectCode: 'Sub_COA',
          subjectName: 'COA',
          sheetTitle: 'COA',
          tierId: 'tier1_sem3',
          color: '#8b5cf6',
          isNewSubject: true,
          topics: [],
          totalTopics: 125,
          theoryCompletedCount: 100,
          duplicateRowsCount: 0,
          invalidRowsCount: 0,
        },
      ];

      const report = performCrossSheetValidation(dashboardReport, previewSubjects, [
        { sheetTitle: 'DBMS', sheetId: 2, isIncluded: true },
        { sheetTitle: 'COA', sheetId: 3, isIncluded: true },
      ]);

      assert.ok(report);
      assert.equal(report.isConsistent, true);
      assert.equal(report.discrepancies.length, 0);
      assert.equal(report.overallMetrics.isTotalConsistent, true);
      assert.equal(report.validatedSubjects.length, 2);
      assert.equal(report.validatedSubjects[0].countMatches, true);
      assert.equal(report.validatedSubjects[0].completionMatches, true);
    });

    it('2.2 Detects topic count mismatch between Dashboard and parsed syllabus records', () => {
      const dashboardReport = {
        sheetTitle: 'Overview',
        sheetId: 1,
        isRecognizedDashboard: true,
        confidence: 'high' as const,
        confidenceScore: 0.9,
        reasons: ['Summary table detected'],
        totalSyllabusCount: 198,
        brokenReferencesCount: 0,
        crossSheetFormulas: [],
        subjectReferences: [
          { subjectName: 'DBMS', expectedTotalTopics: 198 },
        ],
      };

      const previewSubjects = [
        {
          subjectCode: 'Sub_DBMS',
          subjectName: 'DBMS',
          sheetTitle: 'DBMS',
          tierId: 'tier1_sem3',
          color: '#3b82f6',
          isNewSubject: true,
          topics: [],
          totalTopics: 195, // 3 rows fewer than expected
          theoryCompletedCount: 100,
          duplicateRowsCount: 0,
          invalidRowsCount: 0,
        },
      ];

      const report = performCrossSheetValidation(dashboardReport, previewSubjects, [
        { sheetTitle: 'DBMS', sheetId: 2, isIncluded: true },
      ]);

      assert.ok(report);
      assert.equal(report.isConsistent, false);
      assert.equal(report.discrepancies.length, 1);
      assert.equal(report.discrepancies[0].type, 'count_mismatch');
      assert.equal(report.discrepancies[0].expectedValue, 198);
      assert.equal(report.discrepancies[0].actualValue, 195);
      assert.ok(report.discrepancies[0].recommendation.includes('195 topics parsed'));
    });

    it('2.3 Detects missing subject sheets listed on Dashboard', () => {
      const dashboardReport = {
        sheetTitle: 'Overview',
        sheetId: 1,
        isRecognizedDashboard: true,
        confidence: 'high' as const,
        confidenceScore: 0.9,
        reasons: ['Summary table detected'],
        totalSyllabusCount: 300,
        brokenReferencesCount: 0,
        crossSheetFormulas: [],
        subjectReferences: [
          { subjectName: 'DBMS', expectedTotalTopics: 198 },
          { subjectName: 'Computer Networks', expectedTotalTopics: 102 }, // Tab does not exist
        ],
      };

      const previewSubjects = [
        {
          subjectCode: 'Sub_DBMS',
          subjectName: 'DBMS',
          sheetTitle: 'DBMS',
          tierId: 'tier1_sem3',
          color: '#3b82f6',
          isNewSubject: true,
          topics: [],
          totalTopics: 198,
          theoryCompletedCount: 150,
          duplicateRowsCount: 0,
          invalidRowsCount: 0,
        },
      ];

      const report = performCrossSheetValidation(dashboardReport, previewSubjects, [
        { sheetTitle: 'DBMS', sheetId: 2, isIncluded: true },
      ]);

      assert.ok(report);
      const missingDiscrepancy = report.discrepancies.find((d) => d.type === 'missing_sheet');
      assert.ok(missingDiscrepancy);
      assert.equal(missingDiscrepancy.subjectName, 'Computer Networks');
      assert.ok(missingDiscrepancy.message.includes('no matching worksheet tab exists'));
    });

    it('2.4 Detects outdated Dashboard total calculation', () => {
      const dashboardReport = {
        sheetTitle: 'Overview',
        sheetId: 1,
        isRecognizedDashboard: true,
        confidence: 'high' as const,
        confidenceScore: 0.9,
        reasons: ['Summary table detected'],
        totalSyllabusCount: 600, // Stale hardcoded number
        brokenReferencesCount: 0,
        crossSheetFormulas: [],
        subjectReferences: [
          { subjectName: 'DBMS', expectedTotalTopics: 198 },
          { subjectName: 'COA', expectedTotalTopics: 125 },
          { subjectName: 'Python', expectedTotalTopics: 147 },
          { subjectName: 'Prob & Stats', expectedTotalTopics: 127 },
        ], // Sum is 597, but KPI cell says 600
      };

      const previewSubjects = [
        { subjectCode: 'Sub_DBMS', subjectName: 'DBMS', sheetTitle: 'DBMS', tierId: 't1', color: '#3b82f6', isNewSubject: true, topics: [], totalTopics: 198, theoryCompletedCount: 0, duplicateRowsCount: 0, invalidRowsCount: 0 },
        { subjectCode: 'Sub_COA', subjectName: 'COA', sheetTitle: 'COA', tierId: 't1', color: '#8b5cf6', isNewSubject: true, topics: [], totalTopics: 125, theoryCompletedCount: 0, duplicateRowsCount: 0, invalidRowsCount: 0 },
        { subjectCode: 'Sub_Python', subjectName: 'Python', sheetTitle: 'Python', tierId: 't1', color: '#10b981', isNewSubject: true, topics: [], totalTopics: 147, theoryCompletedCount: 0, duplicateRowsCount: 0, invalidRowsCount: 0 },
        { subjectCode: 'Sub_ProbStats', subjectName: 'Prob & Stats', sheetTitle: 'Prob & Stats', tierId: 't1', color: '#f59e0b', isNewSubject: true, topics: [], totalTopics: 127, theoryCompletedCount: 0, duplicateRowsCount: 0, invalidRowsCount: 0 },
      ];

      const report = performCrossSheetValidation(dashboardReport, previewSubjects, [
        { sheetTitle: 'DBMS', sheetId: 2, isIncluded: true },
        { sheetTitle: 'COA', sheetId: 3, isIncluded: true },
        { sheetTitle: 'Python', sheetId: 4, isIncluded: true },
        { sheetTitle: 'Prob & Stats', sheetId: 5, isIncluded: true },
      ]);

      assert.ok(report);
      const outdated = report.discrepancies.find((d) => d.type === 'outdated_dashboard');
      assert.ok(outdated);
      assert.equal(outdated.expectedValue, 597);
      assert.equal(outdated.actualValue, 600);
    });
  });

  // ==========================================================================
  // 3. Invariants & Safety Guarantees
  // ==========================================================================
  describe('3. Invariants & Safety Guarantees', () => {
    it('3.1 Invariant: Dashboard sheet produces ZERO syllabus subjects and ZERO syllabus topics', () => {
      // 5 tabs: 4 syllabus tabs (597 total rows) + 1 Overview tab (18 rows with summary numbers)
      const overviewRows: SheetInspectCellMeta[][] = [
        [createCell('Syllabus Overview'), createCell(null)],
        [createCell('Total Syllabus:'), createCell(597)],
        [createCell('DBMS'), createCell(198)],
        [createCell('COA'), createCell(125)],
        [createCell('Python'), createCell(147)],
        [createCell('Prob & Stats'), createCell(127)],
      ];

      const dashboardReport = extractDashboardReferenceData('Overview', 1, overviewRows);

      // Create preview input with Overview marked as included=false (default) or even if accidentally included
      const previewInput = {
        tabs: [
          {
            mapping: {
              tabId: 'tab_overview',
              sheetId: 1,
              sheetTitle: 'Overview',
              isIncluded: true, // Test that even if user left it included, isTabOverview catches it
              action: 'create_new' as const,
              targetSubjectCode: 'Sub_OVERVIEW',
              targetSubjectName: 'Overview',
              targetColor: '#3b82f6',
              columns: [
                { fieldKey: 'c0', headerName: 'Subject', targetField: 'topic' as const },
                { fieldKey: 'c1', headerName: 'Count', targetField: 'subtopic' as const },
              ],
              detectedRowCount: 6,
            },
            rows: overviewRows.map((r, idx) => ({
              rowUid: `r_${idx}`,
              lastKnownSheetRow: idx + 1,
              values: { c0: r[0].value, c1: r[1].value },
              baseValues: {},
              rowHash: `hash_${idx}`,
              version: 1,
              lastSyncOrigin: 'sheet' as const,
              dirtyFields: [],
              localUpdatedAt: null,
              sheetSyncedAt: new Date().toISOString(),
              status: 'synced' as const,
            })),
          },
          {
            mapping: {
              tabId: 'tab_dbms',
              sheetId: 2,
              sheetTitle: 'DBMS',
              isIncluded: true,
              action: 'create_new' as const,
              targetSubjectCode: 'Sub_DBMS',
              targetSubjectName: 'DBMS',
              targetColor: '#3b82f6',
              columns: [
                { fieldKey: 'unit', headerName: 'Unit', targetField: 'unit' as const },
                { fieldKey: 'topic', headerName: 'Topic', targetField: 'topic' as const },
                { fieldKey: 'done', headerName: 'Done', targetField: 'done' as const },
              ],
              detectedRowCount: 3,
            },
            rows: [
              {
                rowUid: 'dbms_1',
                lastKnownSheetRow: 2,
                values: { unit: 'Unit 1', topic: 'ER Modeling', done: true },
                baseValues: {},
                rowHash: 'h1',
                version: 1,
                lastSyncOrigin: 'sheet' as const,
                dirtyFields: [],
                localUpdatedAt: null,
                sheetSyncedAt: new Date().toISOString(),
                status: 'synced' as const,
              },
              {
                rowUid: 'dbms_2',
                lastKnownSheetRow: 3,
                values: { unit: 'Unit 1', topic: 'Relational Model', done: false },
                baseValues: {},
                rowHash: 'h2',
                version: 1,
                lastSyncOrigin: 'sheet' as const,
                dirtyFields: [],
                localUpdatedAt: null,
                sheetSyncedAt: new Date().toISOString(),
                status: 'synced' as const,
              },
            ],
          },
        ],
        existingSubjects: [],
        existingTopics: [],
        spreadsheetId: 'test_sheet_123',
        selectedTierId: 'tier1_sem3',
        dashboardReport,
      };

      const preview = generateImportPreview(previewInput);

      // Verify that NO subjects were created for Overview
      assert.equal(preview.previewSubjects.some((s) => s.subjectCode === 'Sub_OVERVIEW'), false);
      // Only DBMS was created
      assert.equal(preview.previewSubjects.length, 1);
      assert.equal(preview.previewSubjects[0].subjectCode, 'Sub_DBMS');
      assert.equal(preview.previewSubjects[0].topics.length, 2);

      // Verify crossSheetValidation was executed and attached
      assert.ok(preview.summary.crossSheetValidation);
      assert.equal(preview.summary.dashboardReferenceTitle, 'Overview');
    });

    it('3.2 Progress Invariant: Theory completed count strictly derives from topic checkboxes, not dashboard %', () => {
      const overviewRows: SheetInspectCellMeta[][] = [
        [createCell('Total Syllabus:'), createCell(10)],
        [createCell('Overall Progress:'), createCell('99%')], // 99% in overview
      ];

      const dashboardReport = extractDashboardReferenceData('Overview', 1, overviewRows);

      const previewInput = {
        tabs: [
          {
            mapping: {
              tabId: 'tab_dbms',
              sheetId: 2,
              sheetTitle: 'DBMS',
              isIncluded: true,
              action: 'create_new' as const,
              targetSubjectCode: 'Sub_DBMS',
              targetSubjectName: 'DBMS',
              targetColor: '#3b82f6',
              columns: [
                { fieldKey: 'unit', headerName: 'Unit', targetField: 'unit' as const },
                { fieldKey: 'topic', headerName: 'Topic', targetField: 'topic' as const },
                { fieldKey: 'done', headerName: 'Done', targetField: 'done' as const },
              ],
              detectedRowCount: 2,
            },
            rows: [
              {
                rowUid: 'dbms_1',
                lastKnownSheetRow: 2,
                values: { unit: 'Unit 1', topic: 'Topic 1', done: true }, // Only 1 checkbox is TRUE (50%)
                baseValues: {},
                rowHash: 'h1',
                version: 1,
                lastSyncOrigin: 'sheet' as const,
                dirtyFields: [],
                localUpdatedAt: null,
                sheetSyncedAt: new Date().toISOString(),
                status: 'synced' as const,
              },
              {
                rowUid: 'dbms_2',
                lastKnownSheetRow: 3,
                values: { unit: 'Unit 1', topic: 'Topic 2', done: false },
                baseValues: {},
                rowHash: 'h2',
                version: 1,
                lastSyncOrigin: 'sheet' as const,
                dirtyFields: [],
                localUpdatedAt: null,
                sheetSyncedAt: new Date().toISOString(),
                status: 'synced' as const,
              },
            ],
          },
        ],
        existingSubjects: [],
        existingTopics: [],
        spreadsheetId: 'test_sheet_123',
        selectedTierId: 'tier1_sem3',
        dashboardReport,
      };

      const preview = generateImportPreview(previewInput);

      // Verified: Exactly 1 theory completed (derived from row checkbox), NOT from 99%
      assert.equal(preview.summary.theoryCompletedCount, 1);
      assert.equal(preview.previewSubjects[0].theoryCompletedCount, 1);
      assert.equal(preview.previewSubjects[0].topics[0].theory, true);
      assert.equal(preview.previewSubjects[0].topics[1].theory, false);
    });
  });
});

