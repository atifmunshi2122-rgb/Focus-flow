/**
 * FocusFlow & Finance — Sheet Hub → Study OS Data Import Engine (Step 4)
 *
 * Implements:
 * 1. Public Sheet Reader integration (non-destructive public access fallback).
 * 2. Strict data sanitization, normalization, and validation.
 * 3. Idempotent composite-key duplicate prevention.
 * 4. Critical progress protection:
 *    - Never overwrites Practice, Revision, PYQ, Flashcards, or Mistake data.
 *    - Done = TRUE completes Theory only; Practice stays unchanged.
 *    - Never regresses Theory if student completed it in Study OS.
 *    - Sheet row deletions do NOT delete existing Study OS content.
 * 5. Bounded Firestore batch commits (max 200 writes per batch, well within 500 limit).
 * 6. Multi-tenant isolation under users/{userId}/* strictly respecting firestore.rules.
 */

import { collection, doc, getDoc, getDocs, query, where, writeBatch } from 'firebase/firestore';
import { auth, db, waitForInitialAuth } from '../firebase.ts';
import { firestoreService } from '../firestoreService.ts';
import { api } from '../api.ts';
import { sheetHubStore } from './sheetHubStore.ts';
import {
  computeContentHash,
  computeSourceRowKey,
  normalizePriority,
  parseBooleanDone,
  TabToSubjectMapping,
} from './sheetToStudyTransformer.ts';
import { studyImportHistoryStore } from './studyImportHistoryStore.ts';
import type { SheetCellScalar, SheetConnection, SheetSyncedRow } from '../../types/sheetHub.ts';
import type { AcademicTier, StudyImportFailedRecord, StudyImportHistoryRecord, StudySubject, StudyTopic } from '../../types/study.ts';

export interface ImportDetailItem {
  subjectCode: string;
  subjectName: string;
  createdTopics: number;
  updatedTopics: number;
  skippedTopics: number;
  invalidRows: number;
  duplicateRows: number;
  theoryCompleted: number;
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
  status?: 'success' | 'partial' | 'failed';
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
  onProgress?: (progress: { stage: string; current: number; total: number; percent: number }) => void;
}

/**
 * Strips non-printable ASCII control characters except newline and tab,
 * trims excess whitespace, and caps length.
 */
export function sanitizeText(val: unknown, maxLength = 256): string {
  if (val === null || val === undefined) return '';
  const str = String(val);
  // Remove control characters except \n (10) and \t (9)
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
    onProgress,
  } = options;

  if (!userId || !userId.trim()) {
    throw new Error('Authenticated user ID is required for import.');
  }

  const selectedTabs = Object.values(tabMappings).filter((t) => t.isIncluded);
  if (selectedTabs.length === 0) {
    throw new Error('At least one worksheet tab must be selected for import.');
  }

  onProgress?.({ stage: 'Validating academic tier and permissions...', current: 1, total: 10, percent: 10 });

  // 1. Validate Academic Tier ownership / existence
  const tiers = await api.getStudyTiers().catch(() => [] as AcademicTier[]);
  const tierExists = tiers.some((t) => t.id === selectedTierId);
  if (!tierExists && selectedTierId !== 'tier1_sem3' && selectedTierId !== 'tier2_placements' && selectedTierId !== 'tier3_gate') {
    throw new Error(`Academic Tier "${selectedTierId}" does not exist or does not belong to the user.`);
  }

  onProgress?.({ stage: 'Reading spreadsheet rows...', current: 2, total: 10, percent: 20 });

  // 2. Ensure rows are available for each selected tab
  const rowsByTabId: Record<string, SheetSyncedRow[]> = { ...cachedRowsByTabId };
  const spreadsheetId = connection.sourceSpreadsheetId || connection.id;

  for (const tab of selectedTabs) {
    if (!rowsByTabId[tab.tabId] || rowsByTabId[tab.tabId].length === 0) {
      try {
        const loaded = await sheetHubStore.loadTabRows(userId, tab.tabId, connection.id);
        if (loaded && loaded.length > 0) {
          rowsByTabId[tab.tabId] = loaded;
        }
      } catch (err) {
        console.warn(`[ImportEngine] Could not load rows from store for tab ${tab.tabId}:`, err);
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
          throw new Error(`Failed to read rows from public worksheet "${tab.sheetTitle}": ${msg}`);
        }
      }
    }
  }

  onProgress?.({ stage: 'Fetching existing Study OS subjects and topics...', current: 3, total: 10, percent: 30 });

  // 3. Fetch existing user Study OS data for duplicate checking (strictly isolated by userId)
  let existingSubjects: StudySubject[] = [];
  let allExistingTopics: StudyTopic[] = [];

  if (isSignedInAs(userId)) {
    [existingSubjects, allExistingTopics] = await Promise.all([
      firestoreService.getStudySubjects(userId).catch(() => [] as StudySubject[]),
      firestoreService.getStudyTopics(userId).catch(() => [] as StudyTopic[]),
    ]);
  } else {
    [existingSubjects, allExistingTopics] = await Promise.all([
      api.getStudySubjects().catch(() => [] as StudySubject[]),
      api.getStudyTopics().catch(() => [] as StudyTopic[]),
    ]);
  }

  const existingSubjectByCode = new Map<string, StudySubject>();
  for (const s of existingSubjects) {
    if (!s.deletedAt && (!s.userId || s.userId === userId)) {
      existingSubjectByCode.set(s.code.toUpperCase(), s);
    }
  }

  // Index active topics by subjectCode -> Map of sourceRowKey and Name (scoped to userId)
  const existingTopicsBySubjectCode = new Map<string, StudyTopic[]>();
  for (const t of allExistingTopics) {
    if (!t.deletedAt && (!t.userId || t.userId === userId)) {
      const codeKey = t.subjectCode.toUpperCase();
      const list = existingTopicsBySubjectCode.get(codeKey) || [];
      list.push(t);
      existingTopicsBySubjectCode.set(codeKey, list);
    }
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

  onProgress?.({ stage: 'Reconciling topics with Study OS invariants...', current: 5, total: 10, percent: 50 });

  // 4. Process each selected tab
  for (let tabIdx = 0; tabIdx < selectedTabs.length; tabIdx++) {
    const tabMapping = selectedTabs[tabIdx];
    const rows = rowsByTabId[tabMapping.tabId] || [];

    const cleanSubjectCode = sanitizeText(tabMapping.targetSubjectCode, 64);
    const upperCode = cleanSubjectCode.toUpperCase();
    const cleanSubjectName = sanitizeText(tabMapping.targetSubjectName, 256) || 'Subject';

    if (!cleanSubjectCode) {
      throw new Error(`Subject code is missing for tab "${tabMapping.sheetTitle}".`);
    }

    // 4A. Determine Subject: Adopt existing or prepare create
    let targetSubject = existingSubjectByCode.get(upperCode);
    let isNewSubject = false;

    if (!targetSubject) {
      isNewSubject = true;
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
      // Existing subject update
      targetSubject.name = cleanSubjectName || targetSubject.name;
      targetSubject.color = tabMapping.targetColor || targetSubject.color;
      targetSubject.updatedAt = nowIso;
      subjectsToSave.push(targetSubject);
      totalUpdatedSubjects++;
    }

    // 4B. Index existing topics for this subject
    const subjectTopics = existingTopicsBySubjectCode.get(upperCode) || [];
    const topicByRowKey = new Map<string, StudyTopic>();
    const topicByNameKey = new Map<string, StudyTopic>();
    const topicByConceptKey = new Map<string, StudyTopic>();

    for (const t of subjectTopics) {
      if ((t as any).sourceRowKey) {
        topicByRowKey.set((t as any).sourceRowKey, t);
      }
      const nameKey = `${sanitizeText(t.unit, 128).toLowerCase()}|${sanitizeText(t.topic, 256).toLowerCase()}|${sanitizeText(t.subtopic, 256).toLowerCase()}`;
      topicByNameKey.set(nameKey, t);
      const conceptKey = `${sanitizeText(t.topic, 256).toLowerCase()}::${sanitizeText(t.subtopic, 256).toLowerCase()}`;
      topicByConceptKey.set(conceptKey, t);
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

    const seenTabCompositeKeys = new Set<string>();

    for (let rIdx = 0; rIdx < rows.length; rIdx++) {
      const r = rows[rIdx];
      const rawUnit = unitCol ? sanitizeText(r.values?.[unitCol], 128) : '';
      const rawTopic = topicCol ? sanitizeText(r.values?.[topicCol], 256) : '';
      const rawSubtopic = subtopicCol ? sanitizeText(r.values?.[subtopicCol], 256) : '';
      const rawDone = doneCol ? r.values?.[doneCol] : undefined;
      const rawNotes = notesCol ? sanitizeText(r.values?.[notesCol], 2000) : '';
      const rawPriority = priorityCol ? r.values?.[priorityCol] : undefined;

      // 4C. Blank row validation
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

      const sourceRowKey = computeSourceRowKey(
        spreadsheetId,
        tabMapping.sheetId,
        cleanSubjectCode,
        unit,
        topic,
        subtopic
      );
      const contentHash = computeContentHash(unit, topic, subtopic, notes);

      // Check duplicate within the same sheet
      if (seenTabCompositeKeys.has(sourceRowKey)) {
        tabDuplicateRows++;
        totalDuplicateRows++;
        // Skip duplicate rows within the source sheet
        continue;
      }
      seenTabCompositeKeys.add(sourceRowKey);

      // Match against existing Study OS topics
      const nameKey = `${unit.toLowerCase()}|${topic.toLowerCase()}|${subtopic.toLowerCase()}`;
      const conceptKey = `${topic.toLowerCase()}::${subtopic.toLowerCase()}`;
      const existingMatch = topicByRowKey.get(sourceRowKey) || topicByNameKey.get(nameKey) || topicByConceptKey.get(conceptKey);

      if (!existingMatch) {
        // --- Scenario A: NEW TOPIC ---
        const newTopic: StudyTopic = {
          id: `topic_${Date.now()}_${Math.random().toString(36).slice(2, 6)}_${topicsToCreate.length}`,
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
          ...( {
            sourceOrigin: 'google_sheet',
            sourceSheetId: tabMapping.sheetId,
            sourceRowKey,
            sourceContentHash: contentHash,
            importedAt: nowIso,
            lastImportedAt: nowIso,
          } as any ),
        };

        topicsToCreate.push(newTopic);
        // Also register in local index to prevent duplicates in later rows
        topicByRowKey.set(sourceRowKey, newTopic);
        topicByNameKey.set(nameKey, newTopic);

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
          if ((existingMatch as any).sourceContentHash !== contentHash) {
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

          // Adopt incoming priority
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
    });
  }

  onProgress?.({ stage: 'Writing records to database in safe chunks...', current: 7, total: 10, percent: 70 });

  // 5. Bounded writes execution (Chunking ≤ 200 ops per commit)
  const isDirectFirestore = isSignedInAs(userId);
  if (isDirectFirestore) {
    await waitForInitialAuth().catch(() => null);
  }

  // 5A. Commit Subjects
  for (const subj of subjectsToSave) {
    if (isDirectFirestore) {
      const subjectDocRef = doc(db, `users/${userId}/study_subjects/${subj.id}`);
      await writeBatch(db).set(subjectDocRef, stripUndefined({ ...subj }), { merge: true }).commit();
    } else {
      await api.saveStudySubject(subj);
    }
  }

  // 5B. Commit Created Topics in bounded batches
  const CHUNK_SIZE = 200;
  for (let i = 0; i < topicsToCreate.length; i += CHUNK_SIZE) {
    const chunk = topicsToCreate.slice(i, i + CHUNK_SIZE);
    if (isDirectFirestore) {
      const batch = writeBatch(db);
      for (const t of chunk) {
        const topicDocRef = doc(db, `users/${userId}/study_topics/${t.id}`);
        batch.set(topicDocRef, stripUndefined({ ...t }), { merge: true });
      }
      await batch.commit();
    } else {
      for (const t of chunk) {
        await api.saveStudyTopic(t);
      }
    }

    onProgress?.({
      stage: `Saving created topics (${Math.min(i + CHUNK_SIZE, topicsToCreate.length)} / ${topicsToCreate.length})...`,
      current: 7 + Math.floor(((i + CHUNK_SIZE) / topicsToCreate.length) * 2),
      total: 10,
      percent: 70 + Math.floor(((i + CHUNK_SIZE) / topicsToCreate.length) * 20),
    });
  }

  // 5C. Commit Updated Topics in bounded batches
  for (let i = 0; i < topicsToUpdate.length; i += CHUNK_SIZE) {
    const chunk = topicsToUpdate.slice(i, i + CHUNK_SIZE);
    if (isDirectFirestore) {
      const batch = writeBatch(db);
      for (const item of chunk) {
        const topicDocRef = doc(db, `users/${userId}/study_topics/${item.id}`);
        batch.set(topicDocRef, stripUndefined(item.updates), { merge: true });
      }
      await batch.commit();
    } else {
      for (const item of chunk) {
        await api.saveStudyTopic({ id: item.id, ...item.updates });
      }
    }
  }

  // 5D. Recalculate and update totalSubtopics and completedSubtopics on each subject
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

  onProgress?.({ stage: 'Import completed successfully!', current: 10, total: 10, percent: 100 });

  const historyId = `hist_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
  const importResult: SheetToStudyImportResult = {
    success: true,
    historyId,
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

  // 6. Record history in study_import_history (Step 5)
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
 * Retries a failed or partial import safely.
 * Thanks to idempotent reconciliation, already processed topics and subjects are skipped cleanly.
 */
export async function retrySheetToStudyImport(
  options: ExecuteImportOptions
): Promise<SheetToStudyImportResult> {
  return executeSheetToStudyImport(options);
}

