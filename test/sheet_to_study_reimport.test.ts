import './test_bootstrap.ts';
import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import {
  executeSheetToStudyImport,
  retrySheetToStudyImport,
} from '../src/lib/sheetHub/sheetToStudyImportEngine.ts';
import { generateImportPreview, TabToSubjectMapping } from '../src/lib/sheetHub/sheetToStudyTransformer.ts';
import { studyImportHistoryStore } from '../src/lib/sheetHub/studyImportHistoryStore.ts';
import { api } from '../src/lib/api.ts';
import type { SheetConnection, SheetSyncedRow } from '../src/types/sheetHub.ts';
import type { StudySubject, StudyTopic } from '../src/types/study.ts';

describe('Sheet Hub → Study OS Re-import, Conflict & History Engine (Step 5)', () => {
  const userId = 'usr_test_reimport';
  const spreadsheetId = 'sheet_os_syllabus_101';

  const mockConnection: SheetConnection = {
    id: 'conn_test_reimport_1',
    userId,
    spreadsheetId,
    title: 'Operating Systems & Distributed Systems Syllabus',
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
    tabOrder: ['tab_os'],
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    deletedAt: null,
  };

  const initialTabMapping: TabToSubjectMapping = {
    tabId: 'tab_os',
    sheetId: 0,
    sheetTitle: 'OS',
    isIncluded: true,
    action: 'create_new',
    targetSubjectCode: 'Sub_OS',
    targetSubjectName: 'Operating Systems',
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

  const baseRows: SheetSyncedRow[] = [
    {
      id: 'r1',
      rowUid: 'row_0_1',
      tabId: 'tab_os',
      sheetDocId: mockConnection.id,
      userId,
      rowIndex: 1,
      lastKnownSheetRow: 1,
      values: {
        module: 'Unit 1: Process Management',
        topic: 'Process Scheduling',
        subtopic: 'Round Robin & Priority',
        done: 'TRUE',
        notes: 'Review time quantum formula',
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
      id: 'r2',
      rowUid: 'row_0_2',
      tabId: 'tab_os',
      sheetDocId: mockConnection.id,
      userId,
      rowIndex: 2,
      lastKnownSheetRow: 2,
      values: {
        module: 'Unit 1: Process Management',
        topic: 'Inter-Process Communication',
        subtopic: 'Shared Memory & Message Passing',
        done: 'FALSE',
        notes: '',
        priority: 'Medium',
      },
      baseValues: {},
      rowHash: 'h2',
      version: 1,
      status: 'synced',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    } as unknown as SheetSyncedRow,
    {
      id: 'r3',
      rowUid: 'row_0_3',
      tabId: 'tab_os',
      sheetDocId: mockConnection.id,
      userId,
      rowIndex: 3,
      lastKnownSheetRow: 3,
      values: {
        module: 'Unit 2: Concurrency & Synchronization',
        topic: 'Deadlocks',
        subtopic: "Banker's Algorithm",
        done: 'TRUE',
        notes: 'Safety check algorithm',
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

  // In-memory persistent mock stores
  let mockSubjectsStore: StudySubject[] = [];
  let mockTopicsStore: StudyTopic[] = [];

  beforeEach(async () => {
    mockSubjectsStore = [];
    mockTopicsStore = [];

    // Clear history and sources in store
    await studyImportHistoryStore.clearImportHistory(userId);
    const existingSources = await studyImportHistoryStore.getImportSources(userId);
    for (const src of existingSources) {
      await studyImportHistoryStore.deleteImportSource(userId, src.id);
    }

    api.getStudyTiers = async () => [
      { id: 'tier1_sem3', name: 'Semester Core', shortTitle: 'Sem Core', description: 'Core engineering' },
    ];
    api.getStudySubjects = async () => [...mockSubjectsStore];
    api.getStudyTopics = async (code?: string) => {
      if (code) return mockTopicsStore.filter((t) => t.subjectCode === code);
      return [...mockTopicsStore];
    };
    api.saveStudySubject = async (s: Partial<StudySubject>) => {
      const idx = mockSubjectsStore.findIndex((sub) => sub.code.toUpperCase() === s.code?.toUpperCase());
      const item: StudySubject = {
        id: s.id || `subj_${Date.now()}_${Math.random()}`,
        userId,
        code: s.code || 'Sub_OS',
        name: s.name || 'Operating Systems',
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
        userId,
        subjectCode: t.subjectCode || existing?.subjectCode || 'Sub_OS',
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

  // TEST 1: Same source re-imported multiple times
  it('re-importing the same source multiple times produces zero duplicates and records history', async () => {
    // 1st Import
    const res1 = await executeSheetToStudyImport({
      userId,
      connection: mockConnection,
      selectedTierId: 'tier1_sem3',
      tabMappings: { tab_os: initialTabMapping },
      cachedRowsByTabId: { tab_os: baseRows },
    });
    assert.strictEqual(res1.createdSubjectsCount, 1);
    assert.strictEqual(res1.createdTopicsCount, 3);
    assert.strictEqual(mockTopicsStore.length, 3);

    // 2nd Import (identical)
    const res2 = await executeSheetToStudyImport({
      userId,
      connection: mockConnection,
      selectedTierId: 'tier1_sem3',
      tabMappings: { tab_os: initialTabMapping },
      cachedRowsByTabId: { tab_os: baseRows },
    });
    assert.strictEqual(res2.createdSubjectsCount, 0);
    assert.strictEqual(res2.createdTopicsCount, 0);
    assert.strictEqual(res2.updatedSubjectsCount, 1);
    assert.strictEqual(res2.skippedTopicsCount, 3);
    assert.strictEqual(mockTopicsStore.length, 3, 'Zero duplicate topics created');

    // 3rd Import (identical)
    const res3 = await executeSheetToStudyImport({
      userId,
      connection: mockConnection,
      selectedTierId: 'tier1_sem3',
      tabMappings: { tab_os: initialTabMapping },
      cachedRowsByTabId: { tab_os: baseRows },
    });
    assert.strictEqual(res3.createdTopicsCount, 0);
    assert.strictEqual(res3.skippedTopicsCount, 3);
    assert.strictEqual(mockTopicsStore.length, 3);

    // Verify history records
    const history = await studyImportHistoryStore.getImportHistory(userId);
    assert.strictEqual(history.length, 3, 'Recorded all 3 import runs');
    assert.strictEqual(history[0].status, 'success');
  });

  // TEST 2: Source tab renamed
  it('handles source tab renaming smoothly without creating duplicate topics', async () => {
    // Initial import
    await executeSheetToStudyImport({
      userId,
      connection: mockConnection,
      selectedTierId: 'tier1_sem3',
      tabMappings: { tab_os: initialTabMapping },
      cachedRowsByTabId: { tab_os: baseRows },
    });
    assert.strictEqual(mockTopicsStore.length, 3);

    // User marks practice done in Study OS
    mockTopicsStore[0].practice = true;
    mockTopicsStore[0].revisionCount = 4;

    // Source tab renamed in Google Sheets from "OS" to "Operating Systems (CS301)"
    const renamedTabMapping: TabToSubjectMapping = {
      ...initialTabMapping,
      sheetTitle: 'Operating Systems (CS301)',
      targetSubjectName: 'Operating Systems (CS301)',
      // Same subject code mapped
      targetSubjectCode: 'Sub_OS',
    };

    const res = await executeSheetToStudyImport({
      userId,
      connection: mockConnection,
      selectedTierId: 'tier1_sem3',
      tabMappings: { tab_os: renamedTabMapping },
      cachedRowsByTabId: { tab_os: baseRows },
    });

    assert.strictEqual(res.createdTopicsCount, 0, 'No duplicate topics created on tab rename');
    assert.strictEqual(mockTopicsStore.length, 3);
    assert.strictEqual(mockTopicsStore[0].practice, true, 'Practice preserved after tab rename');
    assert.strictEqual(mockTopicsStore[0].revisionCount, 4, 'Revision count preserved');
  });

  // TEST 3: New topic appended
  it('adds only genuinely new topics when a new row is appended to the spreadsheet', async () => {
    // Initial import with 3 rows
    await executeSheetToStudyImport({
      userId,
      connection: mockConnection,
      selectedTierId: 'tier1_sem3',
      tabMappings: { tab_os: initialTabMapping },
      cachedRowsByTabId: { tab_os: baseRows },
    });
    assert.strictEqual(mockTopicsStore.length, 3);

    // Append 4th row in spreadsheet
    const appendedRows: SheetSyncedRow[] = [
      ...baseRows,
      {
        id: 'r4',
        rowUid: 'row_0_4',
        tabId: 'tab_os',
        sheetDocId: mockConnection.id,
        userId,
        rowIndex: 4,
        lastKnownSheetRow: 4,
        values: {
          module: 'Unit 3: Memory Management',
          topic: 'Virtual Memory',
          subtopic: 'Page Replacement Algorithms (LRU, FIFO)',
          done: 'TRUE',
          notes: 'FIFO Belady anomaly',
          priority: 'High',
        },
        baseValues: {},
        rowHash: 'h4',
        version: 1,
        status: 'synced',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      } as unknown as SheetSyncedRow,
    ];

    const res = await executeSheetToStudyImport({
      userId,
      connection: mockConnection,
      selectedTierId: 'tier1_sem3',
      tabMappings: { tab_os: initialTabMapping },
      cachedRowsByTabId: { tab_os: appendedRows },
    });

    assert.strictEqual(res.createdTopicsCount, 1, 'Only the newly appended topic is created');
    assert.strictEqual(res.skippedTopicsCount, 3, 'Existing 3 topics skipped');
    assert.strictEqual(mockTopicsStore.length, 4);

    const newTopic = mockTopicsStore.find((t) => t.topic === 'Virtual Memory');
    assert.ok(newTopic);
    assert.strictEqual(newTopic?.theory, true);
    assert.strictEqual(newTopic?.practice, false, 'New topic practice is false');
  });

  // TEST 4: Existing topic edited in spreadsheet
  it('updates approved source fields when topic text is edited in spreadsheet', async () => {
    await executeSheetToStudyImport({
      userId,
      connection: mockConnection,
      selectedTierId: 'tier1_sem3',
      tabMappings: { tab_os: initialTabMapping },
      cachedRowsByTabId: { tab_os: baseRows },
    });

    // Mark topic 1 as mastered in Study OS
    mockTopicsStore[0].practice = true;
    mockTopicsStore[0].revisionCount = 5;
    mockTopicsStore[0].pyq = true;

    // Teacher updates module and priority in spreadsheet
    const editedRows: SheetSyncedRow[] = [
      {
        ...baseRows[0],
        values: {
          ...baseRows[0].values,
          module: 'Unit 1: Process Management & Threads',
          priority: 'Low',
        },
      },
      baseRows[1],
      baseRows[2],
    ];

    // Re-import with updateSourceManagedContent: true
    const res = await executeSheetToStudyImport({
      userId,
      connection: mockConnection,
      selectedTierId: 'tier1_sem3',
      tabMappings: { tab_os: initialTabMapping },
      cachedRowsByTabId: { tab_os: editedRows },
      updateSourceManagedContent: true,
    });

    assert.strictEqual(res.updatedTopicsCount, 1, '1 topic updated');
    const updated = mockTopicsStore.find((t) => t.topic === 'Process Scheduling');
    assert.ok(updated);
    assert.strictEqual(updated?.unit, 'Unit 1: Process Management & Threads');
    assert.strictEqual(updated?.priority, 'Low');
    // PROGRESS STRICTLY PRESERVED
    assert.strictEqual(updated?.practice, true, 'Practice remains true');
    assert.strictEqual(updated?.revisionCount, 5, 'Revisions remain 5');
    assert.strictEqual(updated?.pyq, true, 'PYQ remains true');
  });

  // TEST 5: Rows reordered in spreadsheet
  it('does not duplicate topics when rows are reordered in the spreadsheet', async () => {
    await executeSheetToStudyImport({
      userId,
      connection: mockConnection,
      selectedTierId: 'tier1_sem3',
      tabMappings: { tab_os: initialTabMapping },
      cachedRowsByTabId: { tab_os: baseRows },
    });
    assert.strictEqual(mockTopicsStore.length, 3);

    // Reorder: Move row 3 (Deadlocks) to top
    const reorderedRows = [baseRows[2], baseRows[0], baseRows[1]];

    const res = await executeSheetToStudyImport({
      userId,
      connection: mockConnection,
      selectedTierId: 'tier1_sem3',
      tabMappings: { tab_os: initialTabMapping },
      cachedRowsByTabId: { tab_os: reorderedRows },
    });

    assert.strictEqual(res.createdTopicsCount, 0, 'No duplicate topics created on reorder');
    assert.strictEqual(mockTopicsStore.length, 3);
  });

  // TEST 6: Source row deleted in spreadsheet
  it('does NOT delete or prune Study OS topics when rows are deleted in spreadsheet', async () => {
    await executeSheetToStudyImport({
      userId,
      connection: mockConnection,
      selectedTierId: 'tier1_sem3',
      tabMappings: { tab_os: initialTabMapping },
      cachedRowsByTabId: { tab_os: baseRows },
    });
    assert.strictEqual(mockTopicsStore.length, 3);

    // Student has practiced Deadlocks
    mockTopicsStore[2].practice = true;

    // Spreadsheet row for Deadlocks is deleted (only 2 rows remain)
    const prunedRows = [baseRows[0], baseRows[1]];

    const res = await executeSheetToStudyImport({
      userId,
      connection: mockConnection,
      selectedTierId: 'tier1_sem3',
      tabMappings: { tab_os: initialTabMapping },
      cachedRowsByTabId: { tab_os: prunedRows },
    });

    assert.strictEqual(mockTopicsStore.length, 3, 'Orphaned topic was NOT deleted');
    const deadlockTopic = mockTopicsStore.find((t) => t.topic === 'Deadlocks');
    assert.ok(deadlockTopic);
    assert.strictEqual(deadlockTopic?.practice, true, 'Practice data on orphaned topic preserved');
  });

  // TEST 7: Conflict preview accurately calculates diffs and missing rows
  it('generateImportPreview identifies changed topics, unchanged topics, and missing source rows', () => {
    // Populate existing topics in Study OS
    const existingTopics: StudyTopic[] = [
      {
        id: 't1',
        userId,
        subjectCode: 'Sub_OS',
        unit: 'Unit 1: Process Management',
        topic: 'Process Scheduling',
        subtopic: 'Round Robin & Priority',
        priority: 'High',
        theory: true,
        practice: true,
        pyq: false,
        revisionCount: 2,
        rowIndex: 1,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      },
      {
        id: 't_missing',
        userId,
        subjectCode: 'Sub_OS',
        unit: 'Unit 2: Concurrency',
        topic: 'Semaphores',
        subtopic: 'Counting and Binary',
        priority: 'Medium',
        theory: true,
        practice: true,
        pyq: true,
        revisionCount: 3,
        rowIndex: 2,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      },
    ];

    // Incoming sheet has:
    // 1) Process Scheduling (edited priority from High to Low)
    // 2) Brand new topic: Deadlocks
    const incomingRows: SheetSyncedRow[] = [
      {
        ...baseRows[0],
        values: {
          ...baseRows[0].values,
          priority: 'Low',
        },
      },
      baseRows[2], // Deadlocks (new)
    ];

    const preview = generateImportPreview({
      tabs: [
        {
          mapping: initialTabMapping,
          rows: incomingRows,
        },
      ],
      existingSubjects: [
        {
          id: 's_os',
          userId,
          code: 'Sub_OS',
          name: 'Operating Systems',
          tierId: 'tier1_sem3',
          totalSubtopics: 2,
          completedSubtopics: 1,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        },
      ],
      existingTopics,
      spreadsheetId,
      selectedTierId: 'tier1_sem3',
    });

    assert.ok(preview.conflictAnalysis);
    // 1 new topic (Deadlocks)
    assert.strictEqual(preview.conflictAnalysis.newTopics.length, 1);
    assert.strictEqual(preview.conflictAnalysis.newTopics[0].topic, 'Deadlocks');

    // 1 changed topic (Process Scheduling: priority changed)
    assert.strictEqual(preview.conflictAnalysis.changedTopics.length, 1);
    assert.strictEqual(preview.conflictAnalysis.changedTopics[0].existing.topic, 'Process Scheduling');
    assert.ok(preview.conflictAnalysis.changedTopics[0].diffFields.includes('priority'));

    // 1 missing topic in sheet (Semaphores is in Study OS but not in sheet)
    assert.strictEqual(preview.conflictAnalysis.missingSourceTopics.length, 1);
    assert.strictEqual(preview.conflictAnalysis.missingSourceTopics[0].topic, 'Semaphores');
    assert.strictEqual(preview.conflictAnalysis.missingSourceTopics[0].practice, true);
  });

  // TEST 8: Import history tracking and source registration
  it('records complete import history and updates source metadata without storing credentials', async () => {
    const res = await executeSheetToStudyImport({
      userId,
      connection: mockConnection,
      selectedTierId: 'tier1_sem3',
      tabMappings: { tab_os: initialTabMapping },
      cachedRowsByTabId: { tab_os: baseRows },
    });

    assert.ok(res.historyId);
    const history = await studyImportHistoryStore.getImportHistory(userId);
    assert.strictEqual(history.length, 1);
    const item = history[0];

    assert.strictEqual(item.sourceSpreadsheetId, spreadsheetId);
    assert.strictEqual(item.sourceSpreadsheetTitle, mockConnection.title);
    assert.strictEqual(item.createdTopicsCount, 3);
    assert.strictEqual(item.status, 'success');
    assert.ok(item.importedAt);

    // Check that NO credentials or access tokens exist in history
    assert.strictEqual((item as any).accessToken, undefined);
    assert.strictEqual((item as any).refreshToken, undefined);
    assert.strictEqual((item as any).clientSecret, undefined);

    // Verify source registration
    const sources = await studyImportHistoryStore.getImportSources(userId);
    assert.strictEqual(sources.length, 1);
    assert.strictEqual(sources[0].spreadsheetId, spreadsheetId);
    assert.strictEqual(sources[0].status, 'active');
    assert.strictEqual(sources[0].totalImportsCount, 1);
    assert.ok(sources[0].importedSubjectCodes.includes('Sub_OS'));
  });

  // TEST 9: Retry after partial failure
  it('retrySheetToStudyImport safely retries without duplicating already created records', async () => {
    // 1st partial import: import first 2 rows
    await executeSheetToStudyImport({
      userId,
      connection: mockConnection,
      selectedTierId: 'tier1_sem3',
      tabMappings: { tab_os: initialTabMapping },
      cachedRowsByTabId: { tab_os: [baseRows[0], baseRows[1]] },
    });
    assert.strictEqual(mockTopicsStore.length, 2);

    // Simulated retry with all 3 rows
    const retryRes = await retrySheetToStudyImport({
      userId,
      connection: mockConnection,
      selectedTierId: 'tier1_sem3',
      tabMappings: { tab_os: initialTabMapping },
      cachedRowsByTabId: { tab_os: baseRows },
    });

    assert.strictEqual(retryRes.createdTopicsCount, 1, 'Only the missing 3rd row is created on retry');
    assert.strictEqual(retryRes.skippedTopicsCount, 2, 'First 2 rows skipped cleanly');
    assert.strictEqual(mockTopicsStore.length, 3);
  });

  // TEST 10: User stops tracking a source
  it('allows user to stop tracking a source while preserving all Study OS data', async () => {
    await executeSheetToStudyImport({
      userId,
      connection: mockConnection,
      selectedTierId: 'tier1_sem3',
      tabMappings: { tab_os: initialTabMapping },
      cachedRowsByTabId: { tab_os: baseRows },
    });

    const sources = await studyImportHistoryStore.getImportSources(userId);
    assert.strictEqual(sources[0].status, 'active');

    // Stop tracking
    await studyImportHistoryStore.setSourceUntracked(userId, sources[0].id);

    const updatedSources = await studyImportHistoryStore.getImportSources(userId);
    assert.strictEqual(updatedSources[0].status, 'untracked');

    // Study OS content completely untouched
    assert.strictEqual(mockTopicsStore.length, 3);
    assert.strictEqual(mockSubjectsStore.length, 1);
  });

  // TEST 11: User removes source metadata without deleting Study OS content
  it('removing source metadata deletes tracking entry but preserves all Study OS content', async () => {
    await executeSheetToStudyImport({
      userId,
      connection: mockConnection,
      selectedTierId: 'tier1_sem3',
      tabMappings: { tab_os: initialTabMapping },
      cachedRowsByTabId: { tab_os: baseRows },
    });

    const sources = await studyImportHistoryStore.getImportSources(userId);
    assert.strictEqual(sources.length, 1);

    // Delete source metadata
    await studyImportHistoryStore.deleteImportSource(userId, sources[0].id);

    const remainingSources = await studyImportHistoryStore.getImportSources(userId);
    assert.strictEqual(remainingSources.length, 0, 'Source metadata removed');

    // Study OS subjects and topics remain 100% intact
    assert.strictEqual(mockSubjectsStore.length, 1, 'Subject preserved');
    assert.strictEqual(mockTopicsStore.length, 3, 'Topics preserved');
  });
});
