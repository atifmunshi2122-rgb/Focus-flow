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
import { sheetHubStore } from './sheetHubStore.ts';
import {
  computeContentHash,
  computeSourceMappingKey,
  computeSourceRowKey,
  normalizePriority,
  parseBooleanDone,
  TabToSubjectMapping,
} from './sheetToStudyTransformer.ts';
import { studyImportHistoryStore } from './studyImportHistoryStore.ts';
import type { SheetCellScalar, SheetConnection, SheetSyncedRow } from '../../types/sheetHub.ts';
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
  skippedTopics: number;
  invalidRows: number;
  duplicateRows: number;
  theoryCompleted: number;
  ambiguousTopics?: number;
}

export interface SheetToStudyImportResult {
  success: boolean;
  selectedTierId: string;
  createdSubjectsCount: number;
  updatedSubjectsCount: number;
  createdTopicsCount: number;
  updatedTopicsCount: number;
  skippedTopicsCount: number;
  duplicateRowsCount: number;
  invalidRowsCount: number;
  theoryCompletedCount: number;
  details: ImportDetailItem[];
  historyId?: string;
  sessionId?: string;
  status: 'success' | 'partial' | 'failed';
  failedRecords?: StudyImportFailedRecord[];
  error?: string;
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
    onProgress,
  } = options;

  if (!userId || !userId.trim()) {
    throw new StudyImportCriticalReadError(
      'Authenticated user ID is required for Study OS import.',
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
  let totalSkippedTopics = 0;
  let totalDuplicateRows = 0;
  let totalInvalidRows = 0;
  let totalTheoryCompleted = 0;

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

    const cleanSubjectCode = sanitizeText(tabMapping.targetSubjectCode, 64);
    const upperCode = cleanSubjectCode.toUpperCase();
    const cleanSubjectName = sanitizeText(tabMapping.targetSubjectName, 256) || 'Subject';

    if (!cleanSubjectCode) {
      throw new Error(`Subject code is missing for tab "${tabMapping.sheetTitle}".`);
    }

    // 4A. Determine Subject
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

    // 4B. Topic Identity Indexing for This Subject
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

    // Extract column keys
    const unitCol = tabMapping.columns.find((c) => c.targetField === 'unit')?.fieldKey;
    const topicCol = tabMapping.columns.find((c) => c.targetField === 'topic')?.fieldKey;
    const subtopicCol = tabMapping.columns.find((c) => c.targetField === 'subtopic')?.fieldKey;
    const doneCol = tabMapping.columns.find((c) => c.targetField === 'done')?.fieldKey;
    const notesCol = tabMapping.columns.find((c) => c.targetField === 'notes')?.fieldKey;
    const priorityCol = tabMapping.columns.find((c) => c.targetField === 'priority')?.fieldKey;

    let tabCreatedTopics = 0;
    let tabUpdatedTopics = 0;
    let tabSkippedTopics = 0;
    let tabDuplicateRows = 0;
    let tabInvalidRows = 0;
    let tabTheoryCompleted = 0;
    let tabAmbiguousTopics = 0;

    const seenTabCompositeKeys = new Set<string>();

    for (let rIdx = 0; rIdx < rows.length; rIdx++) {
      const r = rows[rIdx];
      const rawUnit = unitCol ? sanitizeText(r.values?.[unitCol], 128) : '';
      const rawTopic = topicCol ? sanitizeText(r.values?.[topicCol], 256) : '';
      const rawSubtopic = subtopicCol ? sanitizeText(r.values?.[subtopicCol], 256) : '';
      const rawDone = doneCol ? r.values?.[doneCol] : undefined;
      const rawNotes = notesCol ? sanitizeText(r.values?.[notesCol], 2000) : '';
      const rawPriority = priorityCol ? r.values?.[priorityCol] : undefined;

      // Blank row validation
      if (!rawTopic && !rawSubtopic) {
        tabInvalidRows++;
        totalInvalidRows++;
        continue;
      }

      const unit = rawUnit || 'General';
      const topic = rawTopic || rawSubtopic;
      const subtopic = rawSubtopic || rawTopic;
      const notes = rawNotes || undefined;
      const priority = normalizePriority(rawPriority);
      const isDone = parseBooleanDone(rawDone);

      if (isDone) {
        tabTheoryCompleted++;
        totalTheoryCompleted++;
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
        totalDuplicateRows++;
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
          // Ambiguity detected: multiple topics match identical names in this unit
          // Invariant: DO NOT GUESS OR SILENTLY MERGE. Treat as ambiguous.
          tabAmbiguousTopics++;
          // Fall through to create distinct topic with unique identity
          existingMatch = undefined;
        }
      }

      if (!existingMatch) {
        // --- Scenario A: NEW TOPIC ---
        const newTopicId = `topic_${Date.now()}_${Math.random().toString(36).slice(2, 6)}_${topicsToCreate.length}`;
        const newTopic: StudyTopic = {
          id: newTopicId,
          userId,
          subjectCode: cleanSubjectCode,
          unit,
          topic,
          subtopic,
          priority,
          theory: isDone,     // Done = TRUE -> Theory = true
          practice: false,    // Invariant: Practice NEVER overwritten / set false
          pyq: false,         // Invariant: PYQ NEVER overwritten / set false
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

        topicsToCreate.push(newTopic);
        newSourceMappings.push({
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
        totalCreatedTopics++;
      } else {
        // --- Scenario B: RE-IMPORT OF EXISTING TOPIC (PROGRESS PRESERVATION) ---
        const updates: Partial<StudyTopic> = {};
        let changed = false;

        // Invariant: Only update theory if sheet has Done = true and Study OS has false
        // NEVER reset existing theory to false if it was unchecked in the sheet!
        if (isDone && !existingMatch.theory) {
          updates.theory = true;
          changed = true;
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

          if (existingMatch.priority !== priority) {
            updates.priority = priority;
            changed = true;
          }

          // Update notes only if existing notes were empty and source provides notes
          if (!existingMatch.notes && notes) {
            updates.notes = notes;
            changed = true;
          }
        }

        // Register mapping for future lookups
        newSourceMappings.push({
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
          topicsToUpdate.push({ id: existingMatch.id, updates });
          tabUpdatedTopics++;
          totalUpdatedTopics++;
        } else {
          tabSkippedTopics++;
          totalSkippedTopics++;
        }
      }
    }

    resultDetails.push({
      subjectCode: cleanSubjectCode,
      subjectName: cleanSubjectName,
      createdTopics: tabCreatedTopics,
      updatedTopics: tabUpdatedTopics,
      skippedTopics: tabSkippedTopics,
      invalidRows: tabInvalidRows,
      duplicateRows: tabDuplicateRows,
      theoryCompleted: tabTheoryCompleted,
      ambiguousTopics: tabAmbiguousTopics,
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
      ...topicsToCreate.filter((t) => t.subjectCode === subj.code),
      ...(existingTopicsBySubjectCode.get(subj.code) || []),
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

  // 6F. Mark session completed
  session.status = 'completed';
  session.completedAt = new Date().toISOString();
  session.updatedAt = session.completedAt;
  await studyImportHistoryStore.saveImportSession(userId, session).catch(() => {});

  onProgress?.({ stage: 'Import completed successfully!', current: 10, total: 10, percent: 100 });

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
    skippedTopicsCount: totalSkippedTopics,
    duplicateRowsCount: totalDuplicateRows,
    invalidRowsCount: totalInvalidRows,
    theoryCompletedCount: totalTheoryCompleted,
    details: resultDetails,
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
        skippedTopicsCount: totalSkippedTopics,
        duplicateRowsCount: totalDuplicateRows,
        invalidRowsCount: totalInvalidRows,
        theoryCompletedCount: totalTheoryCompleted,
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
