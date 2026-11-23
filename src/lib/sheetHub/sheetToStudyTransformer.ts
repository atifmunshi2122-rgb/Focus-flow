/**
 * FocusFlow & Finance — Sheet Hub → Study OS Import Bridge Transformer
 *
 * Implements composite key calculation, column-to-field inference,
 * duplicate detection, and non-destructive preview data calculation.
 *
 * Invariant: Never mutates Firestore during preview calculations.
 * Invariant: Done = TRUE maps to Theory = true, Practice = false (Unchanged).
 */

import { deterministicHashHex } from './rowIdentity.ts';
import type { SheetColumnMapping, SheetSyncedRow } from '../../types/sheetHub.ts';
import type { StudySubject, StudyTopic, TopicConflictAnalysis } from '../../types/study.ts';

export type StudyTargetField = 'unit' | 'topic' | 'subtopic' | 'done' | 'notes' | 'priority' | 'unmapped';

export interface ColumnToFieldMapping {
  fieldKey: string;
  headerName: string;
  targetField: StudyTargetField;
}

export interface TabToSubjectMapping {
  tabId: string;
  sheetId: number;
  sheetTitle: string;
  isIncluded: boolean;
  action: 'create_new' | 'map_existing';
  targetSubjectId?: string;
  targetSubjectCode: string;
  targetSubjectName: string;
  targetColor: string;
  columns: ColumnToFieldMapping[];
  detectedRowCount: number;
}

export interface ImportPreviewTopic {
  unit: string;
  topic: string;
  subtopic: string;
  theory: boolean;
  practice: boolean;
  pyq: boolean;
  notes?: string;
  priority: 'High' | 'Medium' | 'Low';
  sourceRowKey: string;
  isExistingMatch: boolean;
  existingTopicId?: string;
  hasMissingRequiredFields: boolean;
}

export interface ImportPreviewSubject {
  subjectCode: string;
  subjectName: string;
  sheetTitle: string;
  tierId: string;
  color: string;
  isNewSubject: boolean;
  topics: ImportPreviewTopic[];
  totalTopics: number;
  theoryCompletedCount: number;
  duplicateRowsCount: number;
  invalidRowsCount: number;
}

export interface ImportPreviewSummary {
  tabsSelectedCount: number;
  subjectsToCreateCount: number;
  subjectsToMergeCount: number;
  newTopicsCount: number;
  existingTopicsCount: number;
  duplicateRowsCount: number;
  invalidRowsCount: number;
  theoryCompletedCount: number;
}

const OVERVIEW_TAB_REGEX = /\b(overview|summary|dashboard|kpi|readme|guide|index|home|instructions|about)\b/i;

/**
 * Checks whether a sheet tab is likely an overview/dashboard tab that should be unchecked by default.
 */
export function isTabOverview(tabTitle: string, tabRole?: string): boolean {
  if (tabRole === 'overview') return true;
  return OVERVIEW_TAB_REGEX.test(tabTitle.trim());
}

/**
 * Converts a human-readable title (e.g. "Database Management Systems" or "Prob & Stats")
 * into a standardized Study OS Subject Code (e.g. "Sub_DBMS" or "Sub_ProbStats").
 */
export function generateSubjectCode(title: string, existingCodes: string[] = []): string {
  const normTitle = title.trim().toLowerCase();

  let base = '';
  if (/^database\s*(management)?\s*(system)?s?$/i.test(normTitle) || normTitle === 'dbms') {
    base = 'Sub_DBMS';
  } else if (/^computer\s*org(anization)?\s*(&|and)?\s*arch(itecture)?$/i.test(normTitle) || normTitle === 'coa') {
    base = 'Sub_COA';
  } else if (/^operating\s*systems?$/i.test(normTitle) || normTitle === 'os') {
    base = 'Sub_OS';
  } else if (/^data\s*structures?\s*(&|and)?\s*(algo|algorithms?)?$/i.test(normTitle) || normTitle === 'dsa') {
    base = 'Sub_DSA';
  } else if (/^prob(ability)?\s*(&|and)?\s*stat(istics|s)?$/i.test(normTitle)) {
    base = 'Sub_ProbStats';
  } else if (/^discrete\s*math(ematics)?$/i.test(normTitle)) {
    base = 'Sub_DiscreteMath';
  } else if (/^theory\s*of\s*computation|automata$/i.test(normTitle) || normTitle === 'toc') {
    base = 'Sub_TOC';
  } else if (/^computer\s*networks?$/i.test(normTitle) || normTitle === 'cn') {
    base = 'Sub_CN';
  } else {
    const clean = title.trim().replace(/[^a-zA-Z0-9\s]/g, '');
    const words = clean.split(/\s+/).filter(Boolean);

    if (words.length === 0) {
      base = 'Sub_Custom';
    } else if (words.length === 1) {
      const single = words[0];
      base = single.length <= 5 ? `Sub_${single.toUpperCase()}` : `Sub_${single.slice(0, 4).toUpperCase()}`;
    } else if (words.length >= 2 && words.length <= 4) {
      // Generate acronym (e.g. DBMS, COA, OS)
      const acronym = words.map((w) => w[0].toUpperCase()).join('');
      base = `Sub_${acronym}`;
    } else {
      // Longer title: use first 3 initials + first word part
      const acronym = words.slice(0, 3).map((w) => w[0].toUpperCase()).join('');
      base = `Sub_${acronym}`;
    }
  }

  // Ensure uniqueness if existing codes passed
  let uniqueCode = base;
  let counter = 2;
  const upperExisting = new Set(existingCodes.map((c) => c.toUpperCase()));
  while (upperExisting.has(uniqueCode.toUpperCase())) {
    uniqueCode = `${base}_${counter}`;
    counter++;
  }

  return uniqueCode;
}

/**
 * Infers the best Study OS target field for a given column based on header name and type metadata.
 */
export function inferColumnTarget(
  headerName: string,
  inferredType?: string,
  existingMappedTargets?: Set<StudyTargetField>
): StudyTargetField {
  const norm = headerName.trim().toLowerCase();

  // Unit / Module detection
  if (/\b(modules?|units?|chapters?|mods?|chs?|blocks?|sections?)\b/i.test(norm)) {
    if (!existingMappedTargets?.has('unit')) return 'unit';
  }

  // Subtopic detection (prioritized before general 'topic')
  if (/\b(sub[\s_-]?topics?|subtopics?|sub-concepts?|items?|subitems?|details?|sub[\s_-]?units?|lectures?)\b/i.test(norm)) {
    if (!existingMappedTargets?.has('subtopic')) return 'subtopic';
  }

  // Topic detection
  if (/\b(topics?|topics?[\s_-]?names?|concepts?|areas?|main[\s_-]?topics?)\b/i.test(norm)) {
    if (!existingMappedTargets?.has('topic')) return 'topic';
  }

  // Done / Theory completion
  if (
    /\b(done|completed?|status|finished?|complete|is[\s_-]?done|solved?)\b/i.test(norm) ||
    inferredType === 'checkbox' ||
    inferredType === 'boolean'
  ) {
    if (!existingMappedTargets?.has('done')) return 'done';
  }

  // Notes / References
  if (/\b(notes?|remarks?|comments?|references?|links?|urls?|formulas?|resources?)\b/i.test(norm)) {
    if (!existingMappedTargets?.has('notes')) return 'notes';
  }

  // Priority
  if (/\b(priority|priorities|importance|weightage|urgency|ranks?)\b/i.test(norm)) {
    if (!existingMappedTargets?.has('priority')) return 'priority';
  }

  return 'unmapped';
}

/**
 * Generates initial column mappings for a given tab's column list.
 */
export function inferInitialColumnMappings(columns: SheetColumnMapping[]): ColumnToFieldMapping[] {
  const mappedTargets = new Set<StudyTargetField>();
  const results: ColumnToFieldMapping[] = [];

  for (const col of columns) {
    const target = inferColumnTarget(col.headerName, col.inferredType, mappedTargets);
    if (target !== 'unmapped') {
      mappedTargets.add(target);
    }
    results.push({
      fieldKey: col.fieldKey,
      headerName: col.headerName,
      targetField: target,
    });
  }

  // Fallback: If no topic column was detected, map the first text column to topic
  if (!mappedTargets.has('topic')) {
    const candidate = results.find((r) => r.targetField === 'unmapped');
    if (candidate) {
      candidate.targetField = 'topic';
      mappedTargets.add('topic');
    }
  }

  return results;
}

/**
 * Computes deterministic 32-hex FNV-1a composite key for a topic row.
 * Format: srow_<hash(spreadsheetId | sheetId | subjectCode | unit | topic | subtopic)>
 */
export function computeSourceRowKey(
  spreadsheetId: string,
  sheetId: number | string,
  subjectCode: string,
  unit: string,
  topic: string,
  subtopic: string
): string {
  const raw = `${spreadsheetId.trim()}|${String(sheetId).trim()}|${subjectCode.trim().toLowerCase()}|${unit.trim().toLowerCase()}|${topic.trim().toLowerCase()}|${subtopic.trim().toLowerCase()}`;
  return `srow_${deterministicHashHex(raw)}`;
}

/**
 * Computes deterministic FNV-1a content hash for change detection on re-import.
 */
export function computeContentHash(unit: string, topic: string, subtopic: string, notes?: string): string {
  const raw = `${unit.trim().toLowerCase()}|${topic.trim().toLowerCase()}|${subtopic.trim().toLowerCase()}|${(notes || '').trim()}`;
  return deterministicHashHex(raw);
}

export function parseBooleanDone(val: unknown): boolean {
  if (val === true || val === 1) return true;
  if (typeof val === 'string') {
    const s = val.trim().toLowerCase();
    return s === 'true' || s === 'done' || s === 'completed' || s === '1' || s === 'yes' || s === '☑' || s === '✓';
  }
  return false;
}

export function normalizePriority(val: unknown): 'High' | 'Medium' | 'Low' {
  if (typeof val === 'string') {
    const s = val.trim().toLowerCase();
    if (s.includes('high') || s === 'p0' || s === 'p1' || s.includes('urgent') || s.includes('crit')) return 'High';
    if (s.includes('low') || s === 'p3') return 'Low';
  }
  return 'Medium';
}

export interface GenerateImportPreviewInput {
  tabs: Array<{
    mapping: TabToSubjectMapping;
    rows: SheetSyncedRow[];
  }>;
  existingSubjects: StudySubject[];
  existingTopics: StudyTopic[];
  spreadsheetId: string;
  selectedTierId: string;
}

/**
 * Generates the full preview model, summary metrics, and conflict analysis without writing anything to Firestore.
 */
export function generateImportPreview(input: GenerateImportPreviewInput): {
  summary: ImportPreviewSummary;
  previewSubjects: ImportPreviewSubject[];
  conflictAnalysis: TopicConflictAnalysis;
} {
  const { tabs, existingSubjects, existingTopics, spreadsheetId, selectedTierId } = input;

  const existingSubjectCodes = new Set(existingSubjects.map((s) => s.code.toUpperCase()));
  const existingTopicKeyMap = new Map<string, StudyTopic>();
  const existingTopicNameMap = new Map<string, StudyTopic>();
  const existingTopicConceptMap = new Map<string, StudyTopic>();

  for (const t of existingTopics) {
    if ((t as any).sourceRowKey) {
      existingTopicKeyMap.set((t as any).sourceRowKey, t);
    }
    // Index by subjectCode|unit|topic|subtopic
    const nameKey = `${t.subjectCode.toUpperCase()}|${(t.unit || 'general').trim().toLowerCase()}|${t.topic.trim().toLowerCase()}|${t.subtopic.trim().toLowerCase()}`;
    existingTopicNameMap.set(nameKey, t);
    // Index by subjectCode|topic::subtopic
    const conceptKey = `${t.subjectCode.toUpperCase()}|${t.topic.trim().toLowerCase()}::${t.subtopic.trim().toLowerCase()}`;
    existingTopicConceptMap.set(conceptKey, t);
  }

  let totalSelectedTabs = 0;
  let subjectsToCreate = 0;
  let subjectsToMerge = 0;
  let newTopicsCount = 0;
  let existingTopicsCount = 0;
  let duplicateRowsCount = 0;
  let invalidRowsCount = 0;
  let totalTheoryCompleted = 0;

  const previewSubjects: ImportPreviewSubject[] = [];

  const conflictAnalysis: TopicConflictAnalysis = {
    newTopics: [],
    unchangedTopics: [],
    changedTopics: [],
    duplicateSourceRows: [],
    missingSourceTopics: [],
  };

  const matchedExistingTopicIds = new Set<string>();
  const targetSubjectCodesIncluded = new Set<string>();

  for (const { mapping, rows } of tabs) {
    if (!mapping.isIncluded) continue;

    totalSelectedTabs++;
    targetSubjectCodesIncluded.add(mapping.targetSubjectCode.toUpperCase());

    const isNew = mapping.action === 'create_new' && !existingSubjectCodes.has(mapping.targetSubjectCode.toUpperCase());
    if (isNew) {
      subjectsToCreate++;
    } else {
      subjectsToMerge++;
    }

    // Build field access lookup
    const unitCol = mapping.columns.find((c) => c.targetField === 'unit')?.fieldKey;
    const topicCol = mapping.columns.find((c) => c.targetField === 'topic')?.fieldKey;
    const subtopicCol = mapping.columns.find((c) => c.targetField === 'subtopic')?.fieldKey;
    const doneCol = mapping.columns.find((c) => c.targetField === 'done')?.fieldKey;
    const notesCol = mapping.columns.find((c) => c.targetField === 'notes')?.fieldKey;
    const priorityCol = mapping.columns.find((c) => c.targetField === 'priority')?.fieldKey;

    const seenCompositeKeys = new Map<string, number>();
    const previewTopics: ImportPreviewTopic[] = [];
    let tabTheoryCompleted = 0;
    let tabDuplicateRows = 0;
    let tabInvalidRows = 0;

    for (const r of rows) {
      const rawUnit = unitCol ? String(r.values?.[unitCol] ?? '').trim() : '';
      const rawTopic = topicCol ? String(r.values?.[topicCol] ?? '').trim() : '';
      const rawSubtopic = subtopicCol ? String(r.values?.[subtopicCol] ?? '').trim() : '';
      const rawDone = doneCol ? r.values?.[doneCol] : undefined;
      const rawNotes = notesCol ? String(r.values?.[notesCol] ?? '').trim() : '';
      const rawPriority = priorityCol ? r.values?.[priorityCol] : undefined;

      // Check validity
      if (!rawTopic && !rawSubtopic) {
        tabInvalidRows++;
        invalidRowsCount++;
        continue;
      }

      const unit = rawUnit || 'General';
      const topic = rawTopic || rawSubtopic;
      const subtopic = rawSubtopic || rawTopic;
      const notes = rawNotes || undefined;
      const priority = normalizePriority(rawPriority);

      const sourceRowKey = computeSourceRowKey(
        spreadsheetId,
        mapping.sheetId,
        mapping.targetSubjectCode,
        unit,
        topic,
        subtopic
      );

      // Duplicate check in source spreadsheet
      const prevSeenCount = seenCompositeKeys.get(sourceRowKey) || 0;
      if (prevSeenCount > 0) {
        tabDuplicateRows++;
        duplicateRowsCount++;
        seenCompositeKeys.set(sourceRowKey, prevSeenCount + 1);
        conflictAnalysis.duplicateSourceRows.push({
          subjectCode: mapping.targetSubjectCode,
          unit,
          topic,
          subtopic,
          count: prevSeenCount + 1,
        });
      } else {
        seenCompositeKeys.set(sourceRowKey, 1);
      }

      // Check match in existing Study OS topics
      const nameKey = `${mapping.targetSubjectCode.toUpperCase()}|${unit.toLowerCase()}|${topic.trim().toLowerCase()}|${subtopic.trim().toLowerCase()}`;
      const conceptKey = `${mapping.targetSubjectCode.toUpperCase()}|${topic.trim().toLowerCase()}::${subtopic.trim().toLowerCase()}`;
      const existingMatch = existingTopicKeyMap.get(sourceRowKey) || existingTopicNameMap.get(nameKey) || existingTopicConceptMap.get(conceptKey);

      const isDone = parseBooleanDone(rawDone);
      if (isDone) {
        tabTheoryCompleted++;
        totalTheoryCompleted++;
      }

      if (existingMatch) {
        existingTopicsCount++;
        matchedExistingTopicIds.add(existingMatch.id);

        // Detect changed fields
        const diffFields: string[] = [];
        if (existingMatch.unit !== unit) diffFields.push('unit');
        if (existingMatch.topic !== topic) diffFields.push('topic');
        if (existingMatch.subtopic !== subtopic) diffFields.push('subtopic');
        if (existingMatch.priority !== priority) diffFields.push('priority');
        if (notes && !existingMatch.notes) diffFields.push('notes');

        if (diffFields.length > 0) {
          conflictAnalysis.changedTopics.push({
            id: existingMatch.id,
            subjectCode: mapping.targetSubjectCode,
            existing: {
              unit: existingMatch.unit,
              topic: existingMatch.topic,
              subtopic: existingMatch.subtopic,
              priority: existingMatch.priority,
              notes: existingMatch.notes,
            },
            incoming: {
              unit,
              topic,
              subtopic,
              priority,
              notes,
            },
            diffFields,
          });
        } else {
          conflictAnalysis.unchangedTopics.push({
            id: existingMatch.id,
            subjectCode: mapping.targetSubjectCode,
            unit,
            topic,
            subtopic,
          });
        }
      } else {
        newTopicsCount++;
        conflictAnalysis.newTopics.push({
          subjectCode: mapping.targetSubjectCode,
          unit,
          topic,
          subtopic,
          theory: isDone,
        });
      }

      previewTopics.push({
        unit,
        topic,
        subtopic,
        theory: isDone,
        practice: false, // Invariant: practice always stays false/unchanged on import
        pyq: false,
        notes,
        priority,
        sourceRowKey,
        isExistingMatch: Boolean(existingMatch),
        existingTopicId: existingMatch?.id,
        hasMissingRequiredFields: false,
      });
    }

    previewSubjects.push({
      subjectCode: mapping.targetSubjectCode,
      subjectName: mapping.targetSubjectName,
      sheetTitle: mapping.sheetTitle,
      tierId: selectedTierId,
      color: mapping.targetColor,
      isNewSubject: isNew,
      topics: previewTopics,
      totalTopics: previewTopics.length,
      theoryCompletedCount: tabTheoryCompleted,
      duplicateRowsCount: tabDuplicateRows,
      invalidRowsCount: tabInvalidRows,
    });
  }

  // Find missing source topics: existing Study OS topics in the target subjects not in incoming rows
  for (const t of existingTopics) {
    if (t.deletedAt) continue;
    if (targetSubjectCodesIncluded.has(t.subjectCode.toUpperCase()) && !matchedExistingTopicIds.has(t.id)) {
      conflictAnalysis.missingSourceTopics.push({
        id: t.id,
        subjectCode: t.subjectCode,
        unit: t.unit,
        topic: t.topic,
        subtopic: t.subtopic,
        practice: t.practice,
        revisionCount: t.revisionCount,
      });
    }
  }

  const summary: ImportPreviewSummary = {
    tabsSelectedCount: totalSelectedTabs,
    subjectsToCreateCount: subjectsToCreate,
    subjectsToMergeCount: subjectsToMerge,
    newTopicsCount: newTopicsCount,
    existingTopicsCount: existingTopicsCount,
    duplicateRowsCount: duplicateRowsCount,
    invalidRowsCount: invalidRowsCount,
    theoryCompletedCount: totalTheoryCompleted,
  };

  return { summary, previewSubjects, conflictAnalysis };
}
