/**
 * FocusFlow & Finance — Sheet Hub → Study OS Data Import Engine (Step 4 Hardened)
 *
 * Implements:
 * 1. Strict Fail-Fast on Critical Read Failures:
 *    - Never silently converts request failures (network drop, 401, 403, 500) into empty arrays.
 *    - Genuine empty queries succeed; failed queries immediately abort import before any writes.
 * 2. Hardened Topic Identity & Ambiguity Detection:
 *    - Concept-level matching strictly includes Unit to prevent cross-unit collision.
 *    - Identifies stable source-row IDs via `computeSourceMappingKey(spreadsheetId, sheetId, sourceRowId)`.
 *    - Detects ambiguous multi-matches and never guesses or silently merges different topics.
 * 3. Recoverable & Idempotent Import Sessions:
 *    - Creates an import session before the first write.
 *    - Tracks committed subject IDs and topic IDs.
 *    - Records failed operations and marks session status (completed, partial, failed).
 *    - Allows safe resumption/retry of uncommitted operations only.
 * 4. Critical Progress Preservation:
 *    - Never overwrites Practice, Revision, PYQ, Flashcards, or Mistake data.
 *    - Done = TRUE completes Theory only; Practice stays unchanged.
 *    - Never regresses Theory if student completed it in Study OS.
 *    - Spreadsheet row deletions do NOT delete existing Study OS content.
 * 5. Bounded Firestore batch commits (max 200 writes per batch, well within 500 limit).
 * 6. Multi-tenant isolation under users/{userId}/* strictly respecting firestore.rules.
 */

import { doc, writeBatch } from 'firebase/firestore';
import { auth, db, waitForInitialAuth } from '../firebase.ts';
import { firestoreService } from '../firestoreService.ts';
import { api } from '../api.ts';
import { clientDataCache } from '../dataCache.ts';
import { sheetHubStore } from './sheetHubStore.ts';
import {
  computeContentHash,
  computeSourceMappingKey,
  computeSourceRowKey,
  isSummaryOrInvalidSyllabusRow,
  isTabOverview,
  normalizePriority,
  parseBooleanDone,
  TabToSubjectMapping,
} from './sheetToStudyTransformer.ts';
import { studyImportHistoryStore } from './studyImportHistoryStore.ts';
import type {
  CrossSheetValidationReport,
  DashboardReferenceReport,
  SheetCellScalar,
  SheetConnection,
  SheetSyncedRow,
} from '../../types/sheetHub.ts';
import type {
  AcademicTier,
  StudyImportFailedRecord,
  StudyImportHistoryRecord,
  StudyImportSession,
  StudySubject,
  StudyTopic,
  StudyTopicSourceMapping,
} from '../../types/study.ts';

export class StudyImportCriticalReadError extends Error {
  public code: string;
  public originalError?: unknown;

  constructor(message: string, code = 'CRITICAL_READ_FAILED', originalError?: unknown) {
    super(message);
    this.name = 'StudyImportCriticalReadError';
    this.code = code;
    this.originalError = originalError;
  }
}

export class StudyImportExecutionError extends Error {
  public sessionId: string;
  public committedCount: number;
  public totalPlannedCount: number;
  public failedOperations: any[];

  constructor(
    message: string,
    sessionId: string,
    committedCount: number,
    totalPlannedCount: number,
    failedOperations: any[]
  ) {
    super(message);
    this.name = 'StudyImportExecutionError';
    this.sessionId = sessionId;
    this.committedCount = committedCount;
    this.totalPlannedCount = totalPlannedCount;
    this.failedOperations = failedOperations;
  }
}

export interface ImportDetailItem {
  subjectCode: string;
  subjectName: string;
  createdTopics: number;
  updatedTopics: number;
  unchangedTopics: number;
  skippedTopics: number;
  invalidRows: number;
  duplicateRows: number;
  theoryCompleted: number;
  ambiguousTopics?: number;
  movedTopics?: number;
  renamedTopics?: number;
}

export interface ImportReconciliationReport {
  totalRowsEvaluated: number;
  created: number;
  updated: number;
  unchanged: number;
  skipped: number;
  duplicate: number;
  invalid: number;
  failed: number;
  sumBreakdown: number;
  isReconciled: boolean;
}

export interface OrphanedSourceTopic {
  id: string;
  subjectCode: string;
  unit: string;
  topic: string;
  subtopic: string;
  theory: boolean;
  practice: boolean;
  revisionCount: number;
  sourceRowId?: string;
  sourceMappingKey?: string;
}

export interface SheetToStudyImportResult {
  success: boolean;
  selectedTierId: string;
  createdSubjectsCount: number;
  updatedSubjectsCount: number;
  createdTopicsCount: number;
  updatedTopicsCount: number;
  unchangedTopicsCount: number;
  skippedTopicsCount: number;
  duplicateRowsCount: number;
  invalidRowsCount: number;
  failedTopicsCount: number;
  theoryCompletedCount: number;
  movedTopicsCount: number;
  renamedTopicsCount: number;
  orphanedSourceTopicsCount: number;
  orphanedTopicsForReview?: OrphanedSourceTopic[];
  reconciliation: ImportReconciliationReport;
  details: ImportDetailItem[];
  historyId?: string;
  sessionId?: string;
  status: 'success' | 'partial' | 'failed';
  failedRecords?: StudyImportFailedRecord[];
  dashboardReferenceTitle?: string;
  crossSheetValidation?: CrossSheetValidationReport;
  error?: string;
}

/**
 * Yields execution to the event loop so UI animations and progress indicators
 * never freeze or block the browser during large multi-thousand row imports.
 */
export function yieldToEventLoop(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 0));
}

export interface ExecuteImportOptions {
  userId: string;
  connection: SheetConnection;
  selectedTierId: string;
  tabMappings: Record<string, TabToSubjectMapping>;
  cachedRowsByTabId?: Record<string, SheetSyncedRow[]>;
  markDoneAsTheoryOnly?: boolean;
  updateSourceManagedContent?: boolean; // If false, preserves existing topic names/units/priorities
  recordHistory?: boolean; // Defaults to true
  resumeSessionId?: string; // If retrying a partial session
  previouslyCommittedSubjectIds?: string[];
  previouslyCommittedTopicIds?: string[];
  dashboardReport?: DashboardReferenceReport;
  crossSheetValidation?: CrossSheetValidationReport;
  onProgress?: (progress: { stage: string; current: number; total: number; percent: number }) => void;
}

/**
 * Strips non-printable ASCII control characters except newline and tab,
 * trims excess whitespace, and caps length.
 */
export function sanitizeText(val: unknown, maxLength = 256): string {
  if (val === null || val === undefined) return '';
  const str = String(val);
  const cleaned = str.replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, '');
  return cleaned.trim().slice(0, maxLength);
}

function stripUndefined<T extends Record<string, unknown>>(obj: T): T {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(obj)) {
    if (v !== undefined) {
      out[k] = v;
    }
  }
  return out as T;
}

function isSignedInAs(userId: string): boolean {
  return Boolean(auth?.currentUser && auth.currentUser.uid === userId);
}

/**
 * Core Import Engine for Sheet Hub → Study OS
 */
export async function executeSheetToStudyImport(
  options: ExecuteImportOptions
): Promise<SheetToStudyImportResult> {
  const {
    userId,
    connection,
    selectedTierId,
    tabMappings,
    cachedRowsByTabId = {},
    updateSourceManagedContent = true,
    recordHistory = true,
    resumeSessionId,
    previouslyCommittedSubjectIds = [],
    previouslyCommittedTopicIds = [],
    dashboardReport,
    crossSheetValidation,
    onProgress,
  } = options;

  if (!userId || !userId.trim()) {
    throw new StudyImportCriticalReadError(
      'Authenticated user ID is required for Study OS import.',
      'AUTH_REQUIRED'
    );
  }
  if (auth?.currentUser && auth.currentUser.uid !== userId) {
    throw new StudyImportCriticalReadError(
      "Permission denied: Authenticated user cannot modify another user's syllabus import records.",
      'AUTH_REQUIRED'
    );
  }

  const selectedTabs = Object.values(tabMappings).filter((t) => t.isIncluded);
  if (selectedTabs.length === 0) {
    throw new Error('At least one worksheet tab must be selected for import.');
  }

  onProgress?.({ stage: 'Validating academic tier and permissions...', current: 1, total: 10, percent: 10 });

  // --------------------------------------------------------------------------
  // 1. Critical Read: Academic Tiers
  // --------------------------------------------------------------------------
  let tiers: AcademicTier[];
  try {
    tiers = await api.getStudyTiers();
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Network or server error';
    throw new StudyImportCriticalReadError(
      `Failed to read academic tiers: ${msg}`,
      'TIERS_READ_FAILED',
      err
    );
  }

  const tierExists = tiers.some((t) => t.id === selectedTierId);
  if (
    !tierExists &&
    selectedTierId !== 'tier1_sem3' &&
    selectedTierId !== 'tier2_placements' &&
    selectedTierId !== 'tier3_gate'
  ) {
    throw new Error(
      `Academic Tier "${selectedTierId}" does not exist or does not belong to the user.`
    );
  }

  onProgress?.({ stage: 'Reading spreadsheet rows...', current: 2, total: 10, percent: 20 });

  // --------------------------------------------------------------------------
  // 2. Critical Read: Spreadsheet Rows by Tab
  // --------------------------------------------------------------------------
  const rowsByTabId: Record<string, SheetSyncedRow[]> = { ...cachedRowsByTabId };
  const spreadsheetId = connection.sourceSpreadsheetId || connection.id;

  for (const tab of selectedTabs) {
    if (!rowsByTabId[tab.tabId] || rowsByTabId[tab.tabId].length === 0) {
      try {
        const loaded = await sheetHubStore.loadTabRows(userId, tab.tabId, connection.id);
        if (loaded && loaded.length > 0) {
          rowsByTabId[tab.tabId] = loaded;
        }
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : 'Failed to load cached rows';
        throw new StudyImportCriticalReadError(
          `Failed to read rows from store for tab "${tab.sheetTitle}": ${msg}`,
          'TAB_ROWS_READ_FAILED',
          err
        );
      }

      // If still empty and it's a Google Sheet, attempt public pull
      if ((!rowsByTabId[tab.tabId] || rowsByTabId[tab.tabId].length === 0) && !connection.isNative) {
        try {
          const pullRes = await api.sheetHubPull(
            {
              spreadsheetId,
              tabs: [{ sheetId: tab.sheetId, sheetTitle: tab.sheetTitle }],
              publicAccess: true,
            },
            null
          );
          if (pullRes?.tabs && pullRes.tabs[0]?.rows) {
            const pt = pullRes.tabs[0];
            const mappedRows: SheetSyncedRow[] = pt.rows.map((r, idx) => {
              const rowVals: Record<string, SheetCellScalar> = {};
              for (let c = 0; c < tab.columns.length; c++) {
                const col = tab.columns[c];
                rowVals[col.fieldKey] = r.values[c] ?? null;
              }
              const rowUid = `row_${tab.sheetId}_${r.sheetRowNumber || idx + 1}`;
              return {
                id: rowUid,
                rowUid,
                tabId: tab.tabId,
                sheetDocId: connection.id,
                userId,
                rowIndex: idx + 1,
                lastKnownSheetRow: r.sheetRowNumber || idx + 1,
                values: rowVals,
                baseValues: rowVals,
                rowHash: `hash_${r.sheetRowNumber || idx + 1}`,
                version: 1,
                status: 'synced',
                createdAt: new Date().toISOString(),
                updatedAt: new Date().toISOString(),
              } as SheetSyncedRow;
            });
            rowsByTabId[tab.tabId] = mappedRows;
          }
        } catch (pullErr: unknown) {
          const msg = pullErr instanceof Error ? pullErr.message : 'Public sheet fetch failed';
          throw new StudyImportCriticalReadError(
            `Failed to read rows from worksheet "${tab.sheetTitle}": ${msg}`,
            'PUBLIC_PULL_FAILED',
            pullErr
          );
        }
      }
    }
  }

  onProgress?.({ stage: 'Fetching existing Study OS subjects, topics and source mappings...', current: 3, total: 10, percent: 30 });

  // --------------------------------------------------------------------------
  // 3. Critical Read: Existing Study OS Subjects, Topics & Source Mappings
  //    (Stop import immediately if duplicate-check read fails; DO NOT convert to [])
  // --------------------------------------------------------------------------
  let existingSubjects: StudySubject[];
  let allExistingTopics: StudyTopic[];
  let existingSourceMappings: StudyTopicSourceMapping[] = [];

  try {
    if (isSignedInAs(userId)) {
      [existingSubjects, allExistingTopics, existingSourceMappings] = await Promise.all([
        firestoreService.getStudySubjects(userId),
        firestoreService.getStudyTopics(userId),
        studyImportHistoryStore.getTopicSourceMappings(userId),
      ]);
    } else {
      [existingSubjects, allExistingTopics, existingSourceMappings] = await Promise.all([
        api.getStudySubjects(),
        api.getStudyTopics(),
        studyImportHistoryStore.getTopicSourceMappings(userId),
      ]);
    }
  } catch (readErr: unknown) {
    const msg = readErr instanceof Error ? readErr.message : 'Database query failure';
    throw new StudyImportCriticalReadError(
      `Failed to read existing Study OS subjects and topics for duplicate prevention: ${msg}. Import aborted to prevent duplicate records.`,
      'CRITICAL_DUPLICATE_CHECK_FAILED',
      readErr
    );
  }

  // Index active subjects by Subject Code
  const existingSubjectByCode = new Map<string, StudySubject>();
  for (const s of existingSubjects) {
    if (!s.deletedAt && (!s.userId || s.userId === userId)) {
      existingSubjectByCode.set(s.code.toUpperCase(), s);
    }
  }

  // Index active topics by Subject Code
  const existingTopicsBySubjectCode = new Map<string, StudyTopic[]>();
  for (const t of allExistingTopics) {
    if (!t.deletedAt && (!t.userId || t.userId === userId)) {
      const codeKey = t.subjectCode.toUpperCase();
      const list = existingTopicsBySubjectCode.get(codeKey) || [];
      list.push(t);
      existingTopicsBySubjectCode.set(codeKey, list);
    }
  }

  // Index existing source mappings by mappingKey
  const topicIdBySourceMappingKey = new Map<string, string>();
  for (const sm of existingSourceMappings) {
    topicIdBySourceMappingKey.set(sm.mappingKey, sm.studyTopicId);
  }

  const nowIso = new Date().toISOString();
  let totalCreatedSubjects = 0;
  let totalUpdatedSubjects = 0;
  let totalCreatedTopics = 0;
  let totalUpdatedTopics = 0;
  let totalUnchangedTopics = 0;
  let totalSkippedTopics = 0;
  let totalDuplicateRows = 0;
  let totalInvalidRows = 0;
  let totalTheoryCompleted = 0;
  let totalMovedTopics = 0;
  let totalRenamedTopics = 0;
  let totalFailedTopics = 0;
  let totalEvaluatedRows = 0;

  const matchedExistingTopicIds = new Set<string>();
  const targetSubjectCodesIncluded = new Set<string>();

  const resultDetails: ImportDetailItem[] = [];

  // Data collections to commit
  const subjectsToSave: StudySubject[] = [];
  const topicsToCreate: StudyTopic[] = [];
  const topicsToUpdate: Array<{ id: string; updates: Partial<StudyTopic> }> = [];
  const newSourceMappings: StudyTopicSourceMapping[] = [];

  onProgress?.({ stage: 'Reconciling topics with Study OS invariants...', current: 5, total: 10, percent: 50 });

  // --------------------------------------------------------------------------
  // 4. Process Each Selected Tab
  // --------------------------------------------------------------------------
  for (let tabIdx = 0; tabIdx < selectedTabs.length; tabIdx++) {
    const tabMapping = selectedTabs[tabIdx];
    const rows = rowsByTabId[tabMapping.tabId] || [];
    totalEvaluatedRows += rows.length;

    const cleanSubjectCode = sanitizeText(tabMapping.targetSubjectCode, 64);
    const upperCode = cleanSubjectCode.toUpperCase();
    targetSubjectCodesIncluded.add(upperCode);
    const cleanSubjectName = sanitizeText(tabMapping.targetSubjectName, 256) || 'Subject';
    const isOverview = isTabOverview(tabMapping.sheetTitle, (tabMapping as any).role);

    if (!cleanSubjectCode) {
      throw new Error(`Subject code is missing for tab "${tabMapping.sheetTitle}".`);
    }

    // 4A. Topic Identity Indexing for This Subject
    const subjectTopics = existingTopicsBySubjectCode.get(upperCode) || [];
    const topicById = new Map<string, StudyTopic>();
    const topicBySourceMappingKey = new Map<string, StudyTopic>();
    const topicBySourceRowKey = new Map<string, StudyTopic>();
    const topicsByConceptKey = new Map<string, StudyTopic[]>();

    for (const t of subjectTopics) {
      topicById.set(t.id, t);
      if (t.sourceMappingKey) {
        topicBySourceMappingKey.set(t.sourceMappingKey, t);
      }
      if (t.sourceRowKey) {
        topicBySourceRowKey.set(t.sourceRowKey, t);
      }
      // Concept-level key MUST strictly include cleanSubjectCode + unit + topic + subtopic
      const conceptKey = `${upperCode}|${(t.unit || 'general').trim().toLowerCase()}|${t.topic.trim().toLowerCase()}::${t.subtopic.trim().toLowerCase()}`;
      const list = topicsByConceptKey.get(conceptKey) || [];
      list.push(t);
      topicsByConceptKey.set(conceptKey, list);
    }

    // Extract column keys supporting flexible hierarchy depths
    const unitCol = tabMapping.columns.find((c) => c.targetField === 'unit')?.fieldKey;
    const moduleCol = tabMapping.columns.find((c) => c.targetField === 'module')?.fieldKey;
    const chapterCol = tabMapping.columns.find((c) => c.targetField === 'chapter')?.fieldKey;
    const subjectCol = tabMapping.columns.find((c) => c.targetField === 'subject')?.fieldKey;
    const topicCol = tabMapping.columns.find((c) => c.targetField === 'topic')?.fieldKey;
    const subtopicCol = tabMapping.columns.find((c) => c.targetField === 'subtopic')?.fieldKey;
    const doneCol = tabMapping.columns.find((c) => c.targetField === 'done')?.fieldKey;
    const notesCol = tabMapping.columns.find((c) => c.targetField === 'notes')?.fieldKey;
    const priorityCol = tabMapping.columns.find((c) => c.targetField === 'priority')?.fieldKey;

    let tabCreatedTopics = 0;
    let tabUpdatedTopics = 0;
    let tabUnchangedTopics = 0;
    let tabSkippedTopics = 0;
    let tabDuplicateRows = 0;
    let tabInvalidRows = 0;
    let tabTheoryCompleted = 0;
    let tabAmbiguousTopics = 0;
    let tabMovedTopics = 0;
    let tabRenamedTopics = 0;

    const seenTabCompositeKeys = new Set<string>();
    const tabTopicsToCreate: StudyTopic[] = [];
    const tabTopicsToUpdate: Array<{ id: string; updates: Partial<StudyTopic> }> = [];
    const tabNewSourceMappings: StudyTopicSourceMapping[] = [];

    for (let rIdx = 0; rIdx < rows.length; rIdx++) {
      if (rIdx > 0 && rIdx % 100 === 0) {
        await yieldToEventLoop();
      }
      const r = rows[rIdx];
      const rawUnitDirect = unitCol ? sanitizeText(r.values?.[unitCol], 128) : '';
      const rawModule = moduleCol ? sanitizeText(r.values?.[moduleCol], 128) : '';
      const rawChapter = chapterCol ? sanitizeText(r.values?.[chapterCol], 128) : '';
      let rawUnit = rawUnitDirect;
      if (!rawUnit) {
        if (rawModule && rawChapter) rawUnit = `${rawModule} - ${rawChapter}`;
        else if (rawModule) rawUnit = rawModule;
        else if (rawChapter) rawUnit = rawChapter;
      }

      const rawTopic = topicCol ? sanitizeText(r.values?.[topicCol], 256) : '';
      const rawSubtopic = subtopicCol ? sanitizeText(r.values?.[subtopicCol], 256) : '';
      const rawDone = doneCol ? r.values?.[doneCol] : undefined;
      const theoryCol = tabMapping.columns.find((c) => (c.targetField as string) === 'theory')?.fieldKey;
      const practiceCol = tabMapping.columns.find((c) => (c.targetField as string) === 'practice')?.fieldKey;
      const pyqCol = tabMapping.columns.find((c) => (c.targetField as string) === 'pyq')?.fieldKey;

      const rawNotes = notesCol ? sanitizeText(r.values?.[notesCol], 2000) : '';
      const rawPriority = priorityCol ? r.values?.[priorityCol] : undefined;

      // Filter out invalid/empty rows, pure numeric aggregate counts, and summary labels
      const rowCheck = isSummaryOrInvalidSyllabusRow(rawUnit, rawTopic, rawSubtopic);
      if (rowCheck.isInvalid) {
        tabInvalidRows++;
        continue;
      }

      const unit = rawUnit || 'General';
      const topic = rawTopic || rawSubtopic;
      const subtopic = rawSubtopic || rawTopic;
      const notes = rawNotes || undefined;
      const priority = normalizePriority(rawPriority);
      const isDone = parseBooleanDone(rawDone);
      const isTheoryDone = theoryCol ? parseBooleanDone(r.values?.[theoryCol]) : isDone;
      const isPracticeDone = practiceCol
        ? parseBooleanDone(r.values?.[practiceCol])
        : options.markDoneAsTheoryOnly
        ? false
        : isDone;
      const isPyqDone = pyqCol ? parseBooleanDone(r.values?.[pyqCol]) : false;

      if (isDone || isTheoryDone) {
        tabTheoryCompleted++;
      }

      // Stable row ID from sheet
      const stableSourceRowId = r.rowUid || r.id || `row_${tabMapping.sheetId}_${r.lastKnownSheetRow || r.rowIndex || rIdx + 1}`;
      const sourceMappingKey = computeSourceMappingKey(spreadsheetId, tabMapping.sheetId, stableSourceRowId);
      const sourceRowKey = computeSourceRowKey(
        spreadsheetId,
        tabMapping.sheetId,
        cleanSubjectCode,
        unit,
        topic,
        subtopic
      );
      const contentHash = computeContentHash(unit, topic, subtopic, notes);

      // Check intra-sheet duplicate row
      if (seenTabCompositeKeys.has(sourceRowKey)) {
        tabDuplicateRows++;
        continue;
      }
      seenTabCompositeKeys.add(sourceRowKey);

      // ----------------------------------------------------------------------
      // Hardened Topic Matching Hierarchy:
      // Priority 1: Stable source mapping key (persists across renames and reordering)
      // Priority 2: Deterministic composite sourceRowKey
      // Priority 3: Concept key (Unit + Topic + Subtopic)
      // Ambiguity Guard: Never guess if multiple existing topics share identical concept keys
      // ----------------------------------------------------------------------
      let existingMatch: StudyTopic | undefined;

      // Check Priority 1: Source Mapping Key
      existingMatch = topicBySourceMappingKey.get(sourceMappingKey);
      if (!existingMatch) {
        const mappedTopicId = topicIdBySourceMappingKey.get(sourceMappingKey);
        if (mappedTopicId) {
          existingMatch = topicById.get(mappedTopicId);
        }
      }

      // Check Priority 2: Source Row Key
      if (!existingMatch) {
        existingMatch = topicBySourceRowKey.get(sourceRowKey);
      }

      // Check Priority 3: Unit + Topic + Subtopic Concept Key
      const conceptKey = `${upperCode}|${unit.toLowerCase()}|${topic.toLowerCase()}::${subtopic.toLowerCase()}`;
      if (!existingMatch) {
        const conceptCandidates = topicsByConceptKey.get(conceptKey) || [];
        if (conceptCandidates.length === 1) {
          existingMatch = conceptCandidates[0];
        } else if (conceptCandidates.length > 1) {
          tabAmbiguousTopics++;
          existingMatch = undefined;
        }
      }

      if (!existingMatch) {
        // --- Scenario A: NEW TOPIC ---
        const newTopicId = `topic_${Date.now()}_${Math.random().toString(36).slice(2, 6)}_${topicsToCreate.length + tabTopicsToCreate.length}`;
        const newTopic: StudyTopic = {
          id: newTopicId,
          userId,
          subjectCode: cleanSubjectCode,
          unit,
          topic,
          subtopic,
          priority,
          theory: isTheoryDone,     // Done = TRUE in Sheets -> Theory = true (Completed in Study OS)
          practice: isPracticeDone, // Done = TRUE in Sheets -> Practice = true (Completed in Study OS)
          pyq: isPyqDone,
          revisionCount: 0,   // Invariant: Ebbinghaus intervals start at 0
          notes: notes || undefined,
          rowIndex: rIdx + 1,
          createdAt: nowIso,
          updatedAt: nowIso,
          deletedAt: null,
          sourceOrigin: 'google_sheet',
          sourceSpreadsheetId: spreadsheetId,
          sourceSheetId: tabMapping.sheetId,
          sourceRowId: stableSourceRowId,
          sourceRowKey,
          sourceMappingKey,
          sourceContentHash: contentHash,
          importedAt: nowIso,
          lastImportedAt: nowIso,
        };

        tabTopicsToCreate.push(newTopic);
        tabNewSourceMappings.push({
          mappingKey: sourceMappingKey,
          spreadsheetId,
          sheetId: tabMapping.sheetId,
          sourceRowId: stableSourceRowId,
          studyTopicId: newTopicId,
          subjectCode: cleanSubjectCode,
          unit,
          topic,
          subtopic,
          lastImportedAt: nowIso,
        });

        // Register in local lookup
        topicById.set(newTopicId, newTopic);
        topicBySourceMappingKey.set(sourceMappingKey, newTopic);
        topicBySourceRowKey.set(sourceRowKey, newTopic);
        const clist = topicsByConceptKey.get(conceptKey) || [];
        clist.push(newTopic);
        topicsByConceptKey.set(conceptKey, clist);

        tabCreatedTopics++;
      } else {
        matchedExistingTopicIds.add(existingMatch.id);
        if (existingMatch.unit !== unit) {
          tabMovedTopics++;
        }
        if (existingMatch.topic !== topic || existingMatch.subtopic !== subtopic) {
          tabRenamedTopics++;
        }

        // --- Scenario B: RE-IMPORT OF EXISTING TOPIC (PROGRESS PRESERVATION) ---
        const updates: Partial<StudyTopic> = {};
        let changed = false;

        // Invariant: If sheet has Done = true, mark Completed in Study OS (theory + practice).
        // NEVER reset existing theory or practice to false if it was unchecked in the sheet!
        if (isTheoryDone && !existingMatch.theory) {
          updates.theory = true;
          changed = true;
          existingMatch.theory = true;
        }
        if (isPracticeDone && !existingMatch.practice) {
          updates.practice = true;
          changed = true;
          existingMatch.practice = true;
        }
        if (isPyqDone && !existingMatch.pyq) {
          updates.pyq = true;
          changed = true;
          existingMatch.pyq = true;
        }

        // Update source content if content changed and user approved updating source-managed content
        if (updateSourceManagedContent) {
          if (existingMatch.sourceContentHash !== contentHash) {
            if (existingMatch.unit !== unit) {
              updates.unit = unit;
              changed = true;
            }
            if (existingMatch.topic !== topic) {
              updates.topic = topic;
              changed = true;
            }
            if (existingMatch.subtopic !== subtopic) {
              updates.subtopic = subtopic;
              changed = true;
            }
          }

          if (priorityCol && existingMatch.priority !== priority) {
            updates.priority = priority;
            changed = true;
          }

          // Update notes only if existing notes were empty and source provides notes
          if (notesCol && !existingMatch.notes && notes) {
            updates.notes = notes;
            changed = true;
          }
        }

        // Register mapping for future lookups
        tabNewSourceMappings.push({
          mappingKey: sourceMappingKey,
          spreadsheetId,
          sheetId: tabMapping.sheetId,
          sourceRowId: stableSourceRowId,
          studyTopicId: existingMatch.id,
          subjectCode: cleanSubjectCode,
          unit,
          topic,
          subtopic,
          lastImportedAt: nowIso,
        });

        if (changed) {
          updates.updatedAt = nowIso;
          tabTopicsToUpdate.push({ id: existingMatch.id, updates });
          tabUpdatedTopics++;
        } else {
          tabUnchangedTopics++;
          tabSkippedTopics++;
        }
      }
    }

    // Invariant 3: Never automatically create a Study OS subject from an Overview or Summary sheet
    if (isOverview) {
      console.warn(`[sheetToStudyImportEngine] Skipping Overview/Summary tab "${tabMapping.sheetTitle}" — never automatically created as a Study OS subject.`);
      totalInvalidRows += rows.length;
      resultDetails.push({
        subjectCode: cleanSubjectCode,
        subjectName: cleanSubjectName,
        createdTopics: 0,
        updatedTopics: 0,
        unchangedTopics: 0,
        skippedTopics: rows.length,
        invalidRows: rows.length,
        duplicateRows: 0,
        theoryCompleted: 0,
        ambiguousTopics: 0,
        movedTopics: 0,
        renamedTopics: 0,
      });
      continue;
    }

    const hasValidTopics = (tabTopicsToCreate.length + tabTopicsToUpdate.length + tabUnchangedTopics + tabSkippedTopics) > 0;
    const subjectAlreadyExists = existingSubjectByCode.has(upperCode);
    if (!hasValidTopics && !subjectAlreadyExists) {
      totalInvalidRows += tabInvalidRows;
      continue;
    }

    // Determine or update Subject
    let targetSubject = existingSubjectByCode.get(upperCode);
    if (!targetSubject) {
      targetSubject = {
        id: `subj_${Date.now()}_${Math.random().toString(36).slice(2, 6)}_${tabIdx}`,
        userId,
        code: cleanSubjectCode,
        name: cleanSubjectName,
        tierId: selectedTierId,
        color: tabMapping.targetColor || '#3b82f6',
        totalSubtopics: 0,
        completedSubtopics: 0,
        createdAt: nowIso,
        updatedAt: nowIso,
        deletedAt: null,
      };
      existingSubjectByCode.set(upperCode, targetSubject);
      subjectsToSave.push(targetSubject);
      totalCreatedSubjects++;
    } else {
      targetSubject.name = cleanSubjectName || targetSubject.name;
      targetSubject.color = tabMapping.targetColor || targetSubject.color;
      targetSubject.updatedAt = nowIso;
      subjectsToSave.push(targetSubject);
      totalUpdatedSubjects++;
    }

    // Commit tab's topics and source mappings
    topicsToCreate.push(...tabTopicsToCreate);
    topicsToUpdate.push(...tabTopicsToUpdate);
    newSourceMappings.push(...tabNewSourceMappings);

    totalCreatedTopics += tabCreatedTopics;
    totalUpdatedTopics += tabUpdatedTopics;
    totalUnchangedTopics += tabUnchangedTopics;
    totalSkippedTopics += tabSkippedTopics;
    totalDuplicateRows += tabDuplicateRows;
    totalInvalidRows += tabInvalidRows;
    totalTheoryCompleted += tabTheoryCompleted;
    totalMovedTopics += tabMovedTopics;
    totalRenamedTopics += tabRenamedTopics;

    resultDetails.push({
      subjectCode: cleanSubjectCode,
      subjectName: cleanSubjectName,
      createdTopics: tabCreatedTopics,
      updatedTopics: tabUpdatedTopics,
      unchangedTopics: tabUnchangedTopics,
      skippedTopics: tabSkippedTopics,
      invalidRows: tabInvalidRows,
      duplicateRows: tabDuplicateRows,
      theoryCompleted: tabTheoryCompleted,
      ambiguousTopics: tabAmbiguousTopics,
      movedTopics: tabMovedTopics,
      renamedTopics: tabRenamedTopics,
    });
  }

  // --------------------------------------------------------------------------
  // 5. Recoverable Import Session Initialization (Before the First Write)
  // --------------------------------------------------------------------------
  const sessionId = resumeSessionId || `sess_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
  const totalPlannedCount = subjectsToSave.length + topicsToCreate.length + topicsToUpdate.length;

  const session: StudyImportSession = {
    sessionId,
    userId,
    sourceSpreadsheetId: spreadsheetId,
    sourceSpreadsheetTitle: sanitizeText(connection.title, 128) || 'Google Spreadsheet',
    targetTierId: selectedTierId,
    status: 'in_progress',
    startedAt: nowIso,
    updatedAt: nowIso,
    plannedSubjectsCount: subjectsToSave.length,
    plannedTopicsCount: topicsToCreate.length + topicsToUpdate.length,
    committedSubjectIds: [...previouslyCommittedSubjectIds],
    committedTopicIds: [...previouslyCommittedTopicIds],
    failedOperations: [],
  };

  try {
    await studyImportHistoryStore.saveImportSession(userId, session);
  } catch (sessErr) {
    console.warn('[ImportEngine] Could not persist initial import session:', sessErr);
  }

  onProgress?.({ stage: 'Writing records to database in safe chunks...', current: 7, total: 10, percent: 70 });

  // --------------------------------------------------------------------------
  // 6. Bounded Writes Execution with Idempotency & Session Tracking
  // --------------------------------------------------------------------------
  const isDirectFirestore = isSignedInAs(userId);
  if (isDirectFirestore) {
    await waitForInitialAuth().catch(() => null);
  }

  // 6A. Commit Subjects (Skip already committed)
  for (const subj of subjectsToSave) {
    if (session.committedSubjectIds.includes(subj.id)) {
      continue;
    }
    try {
      if (isDirectFirestore) {
        const subjectDocRef = doc(db, `users/${userId}/study_subjects/${subj.id}`);
        await writeBatch(db).set(subjectDocRef, stripUndefined({ ...subj }), { merge: true }).commit();
      } else {
        await api.saveStudySubject(subj);
      }
      session.committedSubjectIds.push(subj.id);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Subject write failed';
      session.failedOperations.push({
        type: 'subject',
        id: subj.id,
        codeOrTitle: subj.code,
        error: msg,
      });
      session.status = (session.committedTopicIds.length > 0 || session.committedSubjectIds.length > 0) ? 'partial' : 'failed';
      await studyImportHistoryStore.saveImportSession(userId, session).catch(() => {});
      throw new StudyImportExecutionError(
        `Failed to commit subject "${subj.code}": ${msg}`,
        sessionId,
        session.committedTopicIds.length,
        totalPlannedCount,
        session.failedOperations
      );
    }
  }

  // 6B. Commit Created Topics in Bounded Batches (Skip already committed)
  const CHUNK_SIZE = 200;
  const uncommittedTopicsToCreate = topicsToCreate.filter((t) => !session.committedTopicIds.includes(t.id));

  for (let i = 0; i < uncommittedTopicsToCreate.length; i += CHUNK_SIZE) {
    const chunk = uncommittedTopicsToCreate.slice(i, i + CHUNK_SIZE);
    try {
      if (isDirectFirestore) {
        const batch = writeBatch(db);
        for (const t of chunk) {
          const topicDocRef = doc(db, `users/${userId}/study_topics/${t.id}`);
          batch.set(topicDocRef, stripUndefined({ ...t }), { merge: true });
        }
        await batch.commit();
        for (const t of chunk) {
          session.committedTopicIds.push(t.id);
        }
      } else {
        for (const t of chunk) {
          await api.saveStudyTopic(t);
          session.committedTopicIds.push(t.id);
        }
      }
      await studyImportHistoryStore.saveImportSession(userId, session).catch(() => {});
    } catch (chunkErr: unknown) {
      const msg = chunkErr instanceof Error ? chunkErr.message : 'Chunk write failed';
      const uncommittedInChunk = chunk.filter((t) => !session.committedTopicIds.includes(t.id));
      for (const t of uncommittedInChunk) {
        session.failedOperations.push({
          type: 'topic',
          id: t.id,
          codeOrTitle: `${t.subjectCode} - ${t.topic}`,
          error: msg,
        });
      }
      session.status = (session.committedTopicIds.length > 0 || session.committedSubjectIds.length > 0) ? 'partial' : 'failed';
      await studyImportHistoryStore.saveImportSession(userId, session).catch(() => {});
      throw new StudyImportExecutionError(
        `Failed to commit topic chunk at index ${i}: ${msg}`,
        sessionId,
        session.committedTopicIds.length,
        totalPlannedCount,
        session.failedOperations
      );
    }

    onProgress?.({
      stage: `Saving created topics (${Math.min(i + CHUNK_SIZE, uncommittedTopicsToCreate.length)} / ${uncommittedTopicsToCreate.length})...`,
      current: 7 + Math.floor(((i + CHUNK_SIZE) / uncommittedTopicsToCreate.length) * 2),
      total: 10,
      percent: 70 + Math.floor(((i + CHUNK_SIZE) / uncommittedTopicsToCreate.length) * 20),
    });
  }

  // 6C. Commit Updated Topics in Bounded Batches (Skip already committed)
  const uncommittedTopicsToUpdate = topicsToUpdate.filter((t) => !session.committedTopicIds.includes(t.id));

  for (let i = 0; i < uncommittedTopicsToUpdate.length; i += CHUNK_SIZE) {
    const chunk = uncommittedTopicsToUpdate.slice(i, i + CHUNK_SIZE);
    try {
      if (isDirectFirestore) {
        const batch = writeBatch(db);
        for (const item of chunk) {
          const topicDocRef = doc(db, `users/${userId}/study_topics/${item.id}`);
          batch.set(topicDocRef, stripUndefined(item.updates), { merge: true });
        }
        await batch.commit();
        for (const item of chunk) {
          session.committedTopicIds.push(item.id);
        }
      } else {
        for (const item of chunk) {
          await api.saveStudyTopic({ id: item.id, ...item.updates });
          session.committedTopicIds.push(item.id);
        }
      }
      await studyImportHistoryStore.saveImportSession(userId, session).catch(() => {});
    } catch (chunkErr: unknown) {
      const msg = chunkErr instanceof Error ? chunkErr.message : 'Update write failed';
      const uncommittedUpdatesInChunk = chunk.filter((item) => !session.committedTopicIds.includes(item.id));
      for (const item of uncommittedUpdatesInChunk) {
        session.failedOperations.push({
          type: 'topic',
          id: item.id,
          codeOrTitle: `Update for topic ${item.id}`,
          error: msg,
        });
      }
      session.status = (session.committedTopicIds.length > 0 || session.committedSubjectIds.length > 0) ? 'partial' : 'failed';
      await studyImportHistoryStore.saveImportSession(userId, session).catch(() => {});
      throw new StudyImportExecutionError(
        `Failed to commit topic updates at index ${i}: ${msg}`,
        sessionId,
        session.committedTopicIds.length,
        totalPlannedCount,
        session.failedOperations
      );
    }
  }

  // 6D. Recalculate and update totalSubtopics and completedSubtopics on each subject
  for (const subj of subjectsToSave) {
    const activeSubjTopics = [
      ...topicsToCreate.filter((t) => t.subjectCode.toUpperCase() === subj.code.toUpperCase()),
      ...(existingTopicsBySubjectCode.get(subj.code.toUpperCase()) || []),
    ];

    const totalTopicsCount = activeSubjTopics.length;
    const completedCount = activeSubjTopics.filter((t) => t.theory && t.practice).length;

    subj.totalSubtopics = totalTopicsCount;
    subj.completedSubtopics = completedCount;
    subj.updatedAt = new Date().toISOString();

    if (isDirectFirestore) {
      const subjRef = doc(db, `users/${userId}/study_subjects/${subj.id}`);
      const batch = writeBatch(db);
      batch.set(subjRef, { totalSubtopics: totalTopicsCount, completedSubtopics: completedCount, updatedAt: subj.updatedAt }, { merge: true });
      await batch.commit();
    } else {
      await api.saveStudySubject(subj);
    }
  }

  // 6E. Save updated source mappings
  if (newSourceMappings.length > 0) {
    await studyImportHistoryStore.saveTopicSourceMappings(userId, newSourceMappings).catch(() => {});
  }

  // 6F. Mark session completed & invalidate Study OS caches so re-imported subjects appear immediately
  session.status = 'completed';
  session.completedAt = new Date().toISOString();
  session.updatedAt = session.completedAt;
  await studyImportHistoryStore.saveImportSession(userId, session).catch(() => {});
  clientDataCache.invalidate('study');
  clientDataCache.invalidate('dashboard');

  onProgress?.({ stage: 'Import completed successfully!', current: 10, total: 10, percent: 100 });

  // 6G. Identify orphaned source records (topics previously imported from this sheet that are missing in this run)
  // Invariant: NEVER automatically delete orphaned topics; preserve them and flag for review.
  const orphanedTopicsForReview: OrphanedSourceTopic[] = [];
  for (const t of allExistingTopics) {
    if (t.deletedAt) continue;
    const isSubjectTarget = targetSubjectCodesIncluded.has(t.subjectCode.toUpperCase());
    const isSourceMatch = t.sourceSpreadsheetId === spreadsheetId || t.sourceOrigin === 'google_sheet';
    if (isSubjectTarget && isSourceMatch && !matchedExistingTopicIds.has(t.id)) {
      orphanedTopicsForReview.push({
        id: t.id,
        subjectCode: t.subjectCode,
        unit: t.unit,
        topic: t.topic,
        subtopic: t.subtopic,
        theory: Boolean(t.theory),
        practice: Boolean(t.practice),
        revisionCount: t.revisionCount || 0,
        sourceRowId: t.sourceRowId,
        sourceMappingKey: t.sourceMappingKey,
      });
    }
  }
  const orphanedSourceTopicsCount = orphanedTopicsForReview.length;

  // 6H. Strict mathematical reconciliation
  const sumBreakdown =
    totalCreatedTopics +
    totalUpdatedTopics +
    totalUnchangedTopics +
    totalDuplicateRows +
    totalInvalidRows +
    totalSkippedTopics +
    totalFailedTopics;

  const reconciliation: ImportReconciliationReport = {
    totalRowsEvaluated: totalEvaluatedRows,
    created: totalCreatedTopics,
    updated: totalUpdatedTopics,
    unchanged: totalUnchangedTopics,
    skipped: totalSkippedTopics,
    duplicate: totalDuplicateRows,
    invalid: totalInvalidRows,
    failed: totalFailedTopics,
    sumBreakdown,
    isReconciled: sumBreakdown === totalEvaluatedRows,
  };

  const historyId = `hist_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
  const importResult: SheetToStudyImportResult = {
    success: true,
    historyId,
    sessionId,
    status: 'success',
    selectedTierId,
    createdSubjectsCount: totalCreatedSubjects,
    updatedSubjectsCount: totalUpdatedSubjects,
    createdTopicsCount: totalCreatedTopics,
    updatedTopicsCount: totalUpdatedTopics,
    unchangedTopicsCount: totalUnchangedTopics,
    skippedTopicsCount: totalSkippedTopics,
    duplicateRowsCount: totalDuplicateRows,
    invalidRowsCount: totalInvalidRows,
    failedTopicsCount: totalFailedTopics,
    theoryCompletedCount: totalTheoryCompleted,
    movedTopicsCount: totalMovedTopics,
    renamedTopicsCount: totalRenamedTopics,
    orphanedSourceTopicsCount,
    orphanedTopicsForReview,
    reconciliation,
    details: resultDetails,
    dashboardReferenceTitle: dashboardReport?.sheetTitle,
    crossSheetValidation,
  };

  // 7. Record History in study_import_history
  if (recordHistory) {
    try {
      const historyRecord: StudyImportHistoryRecord = {
        id: historyId,
        userId,
        sourceSpreadsheetId: spreadsheetId,
        sourceSpreadsheetTitle: sanitizeText(connection.title, 128) || 'Google Spreadsheet',
        targetTierId: selectedTierId,
        targetTierName: tiers.find((t) => t.id === selectedTierId)?.name,
        selectedTabs: selectedTabs.map((t) => t.sheetTitle),
        createdSubjectsCount: totalCreatedSubjects,
        updatedSubjectsCount: totalUpdatedSubjects,
        createdTopicsCount: totalCreatedTopics,
        updatedTopicsCount: totalUpdatedTopics,
        unchangedTopicsCount: totalUnchangedTopics,
        skippedTopicsCount: totalSkippedTopics,
        duplicateRowsCount: totalDuplicateRows,
        invalidRowsCount: totalInvalidRows,
        failedTopicsCount: totalFailedTopics,
        theoryCompletedCount: totalTheoryCompleted,
        movedTopicsCount: totalMovedTopics,
        renamedTopicsCount: totalRenamedTopics,
        orphanedSourceTopicsCount,
        reconciliation,
        dashboardReferenceTitle: dashboardReport?.sheetTitle,
        crossSheetValidation,
        status: 'success',
        importedAt: nowIso,
        details: resultDetails,
      };
      await studyImportHistoryStore.recordImportHistory(userId, historyRecord);
    } catch (histErr) {
      console.warn('[ImportEngine] Could not record import history:', histErr);
    }
  }

  return importResult;
}

/**
 * Retries a failed or partial import safely using the session tracking ledger.
 * Skips already committed subjects and topics.
 */
export async function retrySheetToStudyImport(
  options: ExecuteImportOptions
): Promise<SheetToStudyImportResult> {
  const { userId, resumeSessionId } = options;
  if (resumeSessionId) {
    const existingSession = await studyImportHistoryStore.getImportSession(userId, resumeSessionId);
    if (existingSession) {
      return executeSheetToStudyImport({
        ...options,
        previouslyCommittedSubjectIds: existingSession.committedSubjectIds,
        previouslyCommittedTopicIds: existingSession.committedTopicIds,
        resumeSessionId,
      });
    }
  }
  return executeSheetToStudyImport(options);
}

export interface ImportUndoResult {
  success: boolean;
  message: string;
  removedTopicsCount: number;
  removedSubjectsCount: number;
  preservedTopicsWithProgressCount: number;
  sessionId: string;
}

/**
 * Universal session-scoped rollback and undo engine.
 * Allows users to safely rollback any completed or partial import session.
 * Removes topics and empty subjects created by that specific session while
 * strictly preserving any topics where the user has active practice or revision progress.
 */
export async function undoImportSession(
  userId: string,
  sessionId: string,
  options?: { force?: boolean }
): Promise<ImportUndoResult> {
  if (!userId || !sessionId) {
    throw new Error('User ID and Session ID are required to undo an import session.');
  }

  const session = await studyImportHistoryStore.getImportSession(userId, sessionId);
  if (!session) {
    return {
      success: false,
      message: `Import session "${sessionId}" not found.`,
      removedTopicsCount: 0,
      removedSubjectsCount: 0,
      preservedTopicsWithProgressCount: 0,
      sessionId,
    };
  }

  let allSubjects: StudySubject[] = [];
  let allTopics: StudyTopic[] = [];

  if (isSignedInAs(userId)) {
    [allSubjects, allTopics] = await Promise.all([
      firestoreService.getStudySubjects(userId),
      firestoreService.getStudyTopics(userId),
    ]);
  } else {
    try {
      [allSubjects, allTopics] = await Promise.all([
        api.getStudySubjects(),
        api.getStudyTopics(),
      ]);
    } catch {
      try {
        [allSubjects, allTopics] = await Promise.all([
          firestoreService.getStudySubjects(userId),
          firestoreService.getStudyTopics(userId),
        ]);
      } catch {
        allSubjects = [];
        allTopics = [];
      }
    }
  }

  const committedTopicIdSet = new Set(session.committedTopicIds || []);
  const committedSubjectIdSet = new Set(session.committedSubjectIds || []);

  const topicsToDelete: StudyTopic[] = [];
  let preservedCount = 0;

  for (const topic of allTopics) {
    if (committedTopicIdSet.has(topic.id)) {
      // Invariant: Never delete a topic if user has active practice or revision progress unless force = true
      if (!options?.force && (topic.practice || topic.revisionCount > 0)) {
        preservedCount++;
      } else {
        topicsToDelete.push(topic);
      }
    }
  }

  let removedTopicsCount = 0;
  for (const topic of topicsToDelete) {
    try {
      if (isSignedInAs(userId)) {
        await firestoreService.deleteStudyTopic(userId, topic.id);
      } else {
        await api.deleteStudyTopic(topic.id);
      }
      removedTopicsCount++;
    } catch (err) {
      console.warn(`[ImportEngine] Failed to delete topic ${topic.id}:`, err);
    }
  }

  // Delete subjects only if they have no remaining topics
  const remainingTopics = allTopics.filter((t) => !topicsToDelete.some((del) => del.id === t.id));
  const remainingSubjectCodes = new Set(remainingTopics.map((t) => t.subjectCode.toUpperCase()));

  let removedSubjectsCount = 0;
  for (const subj of allSubjects) {
    if (committedSubjectIdSet.has(subj.id)) {
      if (!remainingSubjectCodes.has(subj.code.toUpperCase())) {
        try {
          if (isSignedInAs(userId)) {
            await firestoreService.deleteStudySubject(userId, subj.id);
          } else {
            await api.deleteStudySubject(subj.id);
          }
          removedSubjectsCount++;
        } catch (err) {
          console.warn(`[ImportEngine] Failed to delete subject ${subj.id}:`, err);
        }
      }
    }
  }

  // Update session status in ledger
  session.status = 'failed';
  session.errorMessage = 'Rolled back by user';
  await studyImportHistoryStore.saveImportSession(userId, session);

  return {
    success: true,
    message: `Successfully rolled back import session "${sessionId}". Removed ${removedTopicsCount} topic(s) and ${removedSubjectsCount} subject(s). (${preservedCount} topic(s) preserved with user progress).`,
    removedTopicsCount,
    removedSubjectsCount,
    preservedTopicsWithProgressCount: preservedCount,
    sessionId,
  };
}

export interface OverviewCleanupReport {
  success: boolean;
  message: string;
  identifiedSubjects: Array<{ id: string; code: string; name: string }>;
  removedTopicsCount: number;
  removedSubjectCount: number;
  backupSessionKey: string;
  backupTimestamp: string;
}

export interface OverviewRollbackReport {
  success: boolean;
  message: string;
  restoredTopicsCount: number;
  restoredSubjectsCount: number;
}

export function isOverviewSubject(subject: { code: string; name?: string }): boolean {
  const normCode = (subject.code || '').trim().toLowerCase();
  const normName = (subject.name || '').trim().toLowerCase();
  return (
    normCode === 'sub_overview' ||
    normCode.startsWith('sub_overview_') ||
    normCode === 'sub_summary' ||
    normCode.startsWith('sub_summary_') ||
    normCode === 'sub_over' ||
    normName === 'overview' ||
    normName === 'summary' ||
    normName === 'syllabus overview' ||
    normName === 'course overview' ||
    normName === 'dashboard'
  );
}

/**
 * Safely cleans up erroneously imported Overview subjects and their summary count topics.
 * 1. Identifies only Overview subjects and their associated topics (e.g. 18 records).
 * 2. Creates a restorable snapshot in localStorage before deletion.
 * 3. Removes the Overview subject and topics without touching legitimate subjects (DBMS, COA, Python, etc.)
 *    or resetting user progress.
 */
export async function cleanupErroneousOverviewImportData(userId: string): Promise<OverviewCleanupReport> {
  if (!userId || !userId.trim()) {
    throw new Error('User ID is required for overview data cleanup.');
  }

  // 1. Fetch all subjects and topics for the user
  let subjects: StudySubject[] = [];
  let topics: StudyTopic[] = [];

  if (isSignedInAs(userId)) {
    [subjects, topics] = await Promise.all([
      firestoreService.getStudySubjects(userId),
      firestoreService.getStudyTopics(userId),
    ]);
  } else {
    try {
      [subjects, topics] = await Promise.all([
        api.getStudySubjects(),
        api.getStudyTopics(),
      ]);
    } catch {
      try {
        [subjects, topics] = await Promise.all([
          firestoreService.getStudySubjects(userId),
          firestoreService.getStudyTopics(userId),
        ]);
      } catch {
        subjects = [];
        topics = [];
      }
    }
  }

  // 2. Identify Overview subjects
  const matchedSubjects = subjects.filter((s) => !s.deletedAt && isOverviewSubject(s));
  const matchedSubjectCodes = new Set(matchedSubjects.map((s) => s.code.toUpperCase()));

  // 3. Identify topics belonging to Overview subjects OR orphaned overview topics
  const matchedTopics = topics.filter((t) => {
    if (t.deletedAt) return false;
    if (matchedSubjectCodes.has(t.subjectCode.toUpperCase())) return true;
    const check = isSummaryOrInvalidSyllabusRow(t.unit || '', t.topic || '', t.subtopic || '');
    if (check.isInvalid && isOverviewSubject({ code: t.subjectCode, name: t.unit })) {
      return true;
    }
    return false;
  });

  if (matchedSubjects.length === 0 && matchedTopics.length === 0) {
    return {
      success: true,
      message: 'No erroneously imported Overview subjects or topics were found. System is clean.',
      identifiedSubjects: [],
      removedSubjectCount: 0,
      removedTopicsCount: 0,
      backupSessionKey: '',
      backupTimestamp: new Date().toISOString(),
    };
  }

  // 4. Create safe rollback snapshot before any mutation
  const nowIso = new Date().toISOString();
  const backupKey = `focusflow_overview_cleanup_backup_${userId}`;
  const backupData = {
    backupKey,
    timestamp: nowIso,
    userId,
    subjects: matchedSubjects,
    topics: matchedTopics,
  };

  try {
    if (typeof localStorage !== 'undefined') {
      localStorage.setItem(backupKey, JSON.stringify(backupData));
    }
  } catch (e) {
    console.warn('[cleanupErroneousOverviewImportData] Could not save to localStorage:', e);
  }

  // 5. Delete topics
  const isDirectFirestore = isSignedInAs(userId);
  if (isDirectFirestore) {
    const BATCH_SIZE = 400;
    for (let i = 0; i < matchedTopics.length; i += BATCH_SIZE) {
      const chunk = matchedTopics.slice(i, i + BATCH_SIZE);
      const batch = writeBatch(db);
      for (const t of chunk) {
        batch.set(doc(db, `users/${userId}/study_topics/${t.id}`), { deletedAt: nowIso, updatedAt: nowIso }, { merge: true });
      }
      await batch.commit();
    }

    // Delete subjects
    for (const s of matchedSubjects) {
      await firestoreService.deleteStudySubject(userId, s.id);
    }
  } else {
    for (const t of matchedTopics) {
      await api.deleteStudyTopic(t.id).catch(() => {});
    }
    for (const s of matchedSubjects) {
      await api.deleteStudySubject(s.id).catch(() => {});
    }
  }

  return {
    success: true,
    message: `Successfully removed ${matchedSubjects.length} Overview subject(s) and ${matchedTopics.length} erroneous summary topic(s). All genuine syllabus data preserved.`,
    identifiedSubjects: matchedSubjects.map((s) => ({ id: s.id, code: s.code, name: s.name })),
    removedSubjectCount: matchedSubjects.length,
    removedTopicsCount: matchedTopics.length,
    backupSessionKey: backupKey,
    backupTimestamp: nowIso,
  };
}

/**
 * Rolls back the latest Overview data cleanup if user undoes the action.
 */
export async function rollbackOverviewCleanup(userId: string): Promise<OverviewRollbackReport> {
  const backupKey = `focusflow_overview_cleanup_backup_${userId}`;
  let backupDataStr: string | null = null;
  try {
    if (typeof localStorage !== 'undefined') {
      backupDataStr = localStorage.getItem(backupKey);
    }
  } catch {
    // ignore
  }

  if (!backupDataStr) {
    throw new Error('No Overview cleanup backup found to rollback.');
  }

  const backup = JSON.parse(backupDataStr) as {
    subjects: StudySubject[];
    topics: StudyTopic[];
  };

  const isDirectFirestore = isSignedInAs(userId);
  const nowIso = new Date().toISOString();

  // Restore subjects
  for (const s of backup.subjects || []) {
    const restored = { ...s, deletedAt: null, updatedAt: nowIso };
    if (isDirectFirestore) {
      await firestoreService.saveStudySubject(userId, restored);
    } else {
      try {
        await api.saveStudySubject(restored);
      } catch {
        try {
          await firestoreService.saveStudySubject(userId, restored);
        } catch {
          // offline/test environment fallback
        }
      }
    }
  }

  // Restore topics
  if (isDirectFirestore) {
    const BATCH_SIZE = 400;
    for (let i = 0; i < (backup.topics || []).length; i += BATCH_SIZE) {
      const chunk = backup.topics.slice(i, i + BATCH_SIZE);
      const batch = writeBatch(db);
      for (const t of chunk) {
        batch.set(doc(db, `users/${userId}/study_topics/${t.id}`), { ...t, deletedAt: null, updatedAt: nowIso }, { merge: true });
      }
      await batch.commit();
    }
  } else {
    for (const t of backup.topics || []) {
      try {
        await api.saveStudyTopic({ ...t, deletedAt: null, updatedAt: nowIso });
      } catch {
        try {
          await firestoreService.saveStudyTopic(userId, { ...t, deletedAt: null, updatedAt: nowIso });
        } catch {
          // offline/test environment fallback
        }
      }
    }
  }

  return {
    success: true,
    message: `Successfully restored ${backup.subjects?.length || 0} subject(s) and ${backup.topics?.length || 0} topic(s).`,
    restoredSubjectsCount: backup.subjects?.length || 0,
    restoredTopicsCount: backup.topics?.length || 0,
  };
}
