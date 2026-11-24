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

export type StudyTargetField =
  | 'subject'
  | 'module'
  | 'chapter'
  | 'unit'
  | 'topic'
  | 'subtopic'
  | 'done'
  | 'notes'
  | 'priority'
  | 'unmapped';

export interface ColumnToFieldMapping {
  fieldKey: string;
  headerName: string;
  targetField: StudyTargetField;
  confidence?: 'high' | 'medium' | 'low';
  isUncertain?: boolean;
  userConfirmed?: boolean;
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

export interface ValidationBreakdown {
  summaryRowsCount: number;
  aggregateCountsCount: number;
  emptyRowsCount: number;
  headerEchoesCount: number;
  placeholdersCount: number;
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
  validationBreakdown?: ValidationBreakdown;
  unchangedTopicsCount?: number;
  movedTopicsCount?: number;
  renamedTopicsCount?: number;
  orphanedSourceTopicsCount?: number;
  reconciliation?: {
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
  };
}

export const OVERVIEW_TAB_REGEX =
  /\b(overview|summary|dashboard|kpi|readme|guide|index|home|instructions|about|progress|stats|statistics|tracker|syllabus[\s_-]?overview|course[\s_-]?overview)\b/i;

const PURE_NUMERIC_PATTERN = /^\s*#?\s*\d+(?:\.\d+)?\s*%?\s*$/;
const TOTAL_ROW_PATTERN =
  /^(total|grand\s*total|subtotal|count|sum|average|avg|mean|median|min|max|all|kpi|metrics?|progress|completion\s*rate|percentage|total\s*(topics?|records?|rows?|items?|count|subtopics?|questions?|[:\-]?\s*\d+.*)?|count\s*[:\-]?\s*\d+.*|sum\s*[:\-]?\s*\d+.*)$/i;
const OVERVIEW_KEYWORD_PATTERN = /^(overview|summary)$/i;
const HEADER_ECHO_PATTERN =
  /^(topic|subtopic|title|name|subject|unit|chapter|module|status|done|priority|notes?)$/i;
const PLACEHOLDER_PATTERN = /^(n\/?a|na|none|nil|null|undefined|-|--|\?)$/i;

export interface RowValidationResult {
  isInvalid: boolean;
  category?: 'valid' | 'summary_row' | 'aggregate_count' | 'empty' | 'header_echo' | 'placeholder' | 'uncertain';
  reason?: string;
}

/**
 * Universal Context-Aware Row Validator.
 * Validates rows based on their mapped fields and data context:
 * - Distinguishes valid numeric topic names (e.g. "1.1", "Section 3.2", "8086 Microprocessor", "301", "RFC 793")
 *   from numeric summary values (e.g. standalone row count 198, 597, total 100%) using surrounding context.
 * - Detects summary labels ("Total", "Grand Total", "Count", "Sum").
 * - Filters empty, placeholder, and header echo rows.
 */
export function isSummaryOrInvalidSyllabusRow(
  unit: string,
  topic: string,
  subtopic: string
): RowValidationResult {
  const normTopic = (topic || '').trim();
  const normSubtopic = (subtopic || '').trim();
  const normUnit = (unit || '').trim();

  // 1. Missing both topic and subtopic
  if (!normTopic && !normSubtopic) {
    return { isInvalid: true, category: 'empty', reason: 'Empty topic and subtopic cells' };
  }

  const candidate = normTopic || normSubtopic;

  // 2. Summary row detection:
  // Pure aggregation keywords ("Total", "Grand Total", "Sum", "Count") are always invalid summary rows
  if (TOTAL_ROW_PATTERN.test(normUnit) || TOTAL_ROW_PATTERN.test(normTopic) || TOTAL_ROW_PATTERN.test(normSubtopic)) {
    const matchedLabel = [normUnit, normTopic, normSubtopic].find((s) => s && TOTAL_ROW_PATTERN.test(s));
    return {
      isInvalid: true,
      category: 'summary_row',
      reason: `Summary or aggregate row label detected: "${matchedLabel}"`,
    };
  }

  // "Overview" and "Summary" are invalid when accompanied by numeric counts or when standalone (in overview summary tables),
  // but perfectly valid when paired with an actual topic or subtopic (e.g. "Introduction" > "Overview")
  if (
    (OVERVIEW_KEYWORD_PATTERN.test(normUnit) || OVERVIEW_KEYWORD_PATTERN.test(normTopic)) &&
    (/^\s*#?\s*\d+(\.\d+)?\s*%?\s*$/.test(normTopic) || !normSubtopic || OVERVIEW_KEYWORD_PATTERN.test(normSubtopic))
  ) {
    return {
      isInvalid: true,
      category: 'summary_row',
      reason: `Overview/summary label with aggregate count or empty concept: "${normUnit || normTopic}"`,
    };
  }
  if (OVERVIEW_KEYWORD_PATTERN.test(normSubtopic) && (!normTopic || normTopic.toLowerCase() === 'general')) {
    return {
      isInvalid: true,
      category: 'summary_row',
      reason: `Standalone overview/summary label in general unit: "${normSubtopic}"`,
    };
  }

  // Check aggregate count label with value (e.g. "Total: 198", "Count - 50", "Total 10")
  if (/^(total|count|sum|average|avg|summary|overview)\b/i.test(normTopic) && /\d+/.test(normTopic)) {
    return {
      isInvalid: true,
      category: 'summary_row',
      reason: `Aggregate count label with value: "${normTopic}"`,
    };
  }
  if (/^(total|count|sum|average|avg|summary|overview)\b/i.test(normUnit) && /\d+/.test(normUnit)) {
    return {
      isInvalid: true,
      category: 'summary_row',
      reason: `Aggregate unit label with value: "${normUnit}"`,
    };
  }

  // 3. Header row echoes (e.g. "Topic", "Subtopic", "Unit")
  if (HEADER_ECHO_PATTERN.test(normTopic) && HEADER_ECHO_PATTERN.test(normSubtopic || normTopic)) {
    return { isInvalid: true, category: 'header_echo', reason: `Repeated header row: "${candidate}"` };
  }

  // 4. Placeholders (e.g. "N/A", "-", "null")
  if (PLACEHOLDER_PATTERN.test(candidate) && (!normSubtopic || PLACEHOLDER_PATTERN.test(normSubtopic))) {
    return { isInvalid: true, category: 'placeholder', reason: `Placeholder value: "${candidate}"` };
  }

  // 5. Context-aware Numeric Analysis:
  // Distinguish valid numeric topic names (e.g. "1.1", "Section 3.2", "8086", "301", "RFC 793")
  // from numeric summary values (e.g. pure standalone counts without concept descriptions).
  const isTopicPureNumeric = PURE_NUMERIC_PATTERN.test(normTopic);
  const isSubtopicPureNumeric = PURE_NUMERIC_PATTERN.test(normSubtopic);

  // Section numbering check (e.g. "1.1", "2.3.4", "A.1", "3.2(a)")
  const isHierarchicalSection = /^\s*#?\s*[A-Za-z0-9]+(?:\.[A-Za-z0-9]+)+\s*$/.test(candidate);
  if (isHierarchicalSection) {
    // Valid section numbering is accepted as a valid topic!
    return { isInvalid: false, category: 'valid' };
  }

  // If topic is numeric (e.g. "8086", "301", "1"), but subtopic has substantive academic description
  if (isTopicPureNumeric && normSubtopic && !isSubtopicPureNumeric && normSubtopic.length >= 2) {
    return { isInvalid: false, category: 'valid' };
  }

  // If subtopic is numeric, but topic has substantive academic description
  if (isSubtopicPureNumeric && normTopic && !isTopicPureNumeric && normTopic.length >= 2) {
    return { isInvalid: false, category: 'valid' };
  }

  // If both topic and subtopic are pure numbers, or topic is pure number and subtopic is empty
  if (isTopicPureNumeric && (!normSubtopic || isSubtopicPureNumeric)) {
    return {
      isInvalid: true,
      category: 'aggregate_count',
      reason: `Pure numeric aggregate count without concept description: "${normTopic}"`,
    };
  }

  // If candidate is a standalone percentage (e.g. "100%", "75%")
  if (/^\s*\d+(?:\.\d+)?\s*%\s*$/.test(candidate)) {
    return {
      isInvalid: true,
      category: 'aggregate_count',
      reason: `Percentage aggregate metric: "${candidate}"`,
    };
  }

  return { isInvalid: false, category: 'valid' };
}

/**
 * Checks whether a sheet tab is likely an overview/dashboard/summary tab that should be unchecked by default.
 */
export function isTabOverview(tabTitle: string, tabRole?: string): boolean {
  if (
    tabRole === 'overview' ||
    tabRole === 'summary' ||
    tabRole === 'metadata' ||
    tabRole === 'instructions'
  ) {
    return true;
  }
  if (tabRole === 'data') {
    return false;
  }
  const trimmed = (tabTitle || '').trim();
  // Protect genuine academic subjects like "Prob & Stats" or "Probability & Statistics"
  if (/^prob(ability)?\s*(&|and)?\s*stat(istics|s)?$/i.test(trimmed)) {
    return false;
  }
  return OVERVIEW_TAB_REGEX.test(trimmed);
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

export interface ColumnInferenceResult {
  target: StudyTargetField;
  confidence: 'high' | 'medium' | 'low';
  isUncertain: boolean;
  reason: string;
}

/**
 * Intelligent Column Mapping with confidence scoring and multi-lingual synonym support.
 * Supports English, Bengali, Hindi, and common academic naming conventions.
 * Never silently guesses an uncertain column.
 */
function matchesTermOrPattern(
  text: string,
  asciiRegex: RegExp,
  unicodeSubstrings: string[]
): boolean {
  if (asciiRegex.test(text)) return true;
  for (const sub of unicodeSubstrings) {
    if (text.includes(sub)) return true;
  }
  return false;
}

export function inferColumnTargetWithConfidence(
  headerName: string,
  inferredType?: string,
  existingMappedTargets?: Set<StudyTargetField>
): ColumnInferenceResult {
  const norm = (headerName || '').trim().toLowerCase();

  // 1. Subject detection (for single-sheet multi-subject curricula)
  if (
    matchesTermOrPattern(
      norm,
      /\b(subjects?|courses?|course[\s_-]?names?|disciplines?|papers?|tracks?|programs?)\b/i,
      ['বিষয়', 'বিষয়সমূহ', 'विषय']
    )
  ) {
    if (!existingMappedTargets?.has('subject')) {
      return { target: 'subject', confidence: 'high', isUncertain: false, reason: 'Matched subject/course identifier' };
    }
  }

  // 2. Subtopic detection (prioritized before broad 'topic')
  if (
    matchesTermOrPattern(
      norm,
      /\b(sub[\s_-]?topics?|subtopics?|sub[\s_-]?concepts?|sub[\s_-]?units?)\b/i,
      ['উপটপিক', 'উপ-টপিক', 'উপ_টপিক', 'उपशीर्षक']
    )
  ) {
    if (!existingMappedTargets?.has('subtopic')) {
      return { target: 'subtopic', confidence: 'high', isUncertain: false, reason: 'Matched subtopic keyword' };
    }
  }
  if (
    matchesTermOrPattern(
      norm,
      /\b(items?|subitems?|details?|lectures?|points?|bullets?)\b/i,
      ['লেকচার', 'পাঠ্যংশ']
    )
  ) {
    if (!existingMappedTargets?.has('subtopic')) {
      return { target: 'subtopic', confidence: 'medium', isUncertain: false, reason: 'Matched subtopic/item synonym' };
    }
  }

  // 3. Topic detection
  if (
    matchesTermOrPattern(
      norm,
      /\b(topics?|topics?[\s_-]?names?|concepts?|main[\s_-]?topics?)\b/i,
      ['টপিক', 'বিষয়বস্তু', 'शीर्षক']
    )
  ) {
    if (!existingMappedTargets?.has('topic')) {
      return { target: 'topic', confidence: 'high', isUncertain: false, reason: 'Matched topic keyword' };
    }
  }
  if (
    matchesTermOrPattern(
      norm,
      /\b(titles?|contents?|headings?|areas?)\b/i,
      ['পাঠ']
    )
  ) {
    if (!existingMappedTargets?.has('topic')) {
      return { target: 'topic', confidence: 'medium', isUncertain: false, reason: 'Matched topic title synonym' };
    }
  }

  // 4. Unit / Module / Chapter detection
  // Maps to 'unit' by default (as Study OS stores topics under 'unit').
  // If 'unit' is already mapped, maps subsequent hierarchies to 'module' or 'chapter'.
  if (
    matchesTermOrPattern(
      norm,
      /\b(units?|sections?|secs?|divisions?|modules?|mods?|blocks?|parts?|pillars?|groups?|chapters?|chaps?|chs?|lessons?|themes?)\b/i,
      ['মডিউল', 'मॉड्यूल', 'একক', 'यूनिट', 'অধ্যায়', 'अध्याय']
    )
  ) {
    if (!existingMappedTargets?.has('unit')) {
      return { target: 'unit', confidence: 'high', isUncertain: false, reason: 'Matched unit/module/chapter keyword' };
    }
    if (
      !existingMappedTargets?.has('module') &&
      matchesTermOrPattern(norm, /\b(modules?|mods?|blocks?|parts?|pillars?|groups?)\b/i, ['মডিউল', 'मॉड्यूल'])
    ) {
      return { target: 'module', confidence: 'high', isUncertain: false, reason: 'Matched secondary module keyword' };
    }
    if (
      !existingMappedTargets?.has('chapter') &&
      matchesTermOrPattern(norm, /\b(chapters?|chaps?|chs?|lessons?|themes?)\b/i, ['অধ্যায়', 'अध्याय'])
    ) {
      return { target: 'chapter', confidence: 'high', isUncertain: false, reason: 'Matched secondary chapter keyword' };
    }
  }

  // 6. Done / Theory completion
  if (
    inferredType === 'checkbox' ||
    inferredType === 'boolean' ||
    matchesTermOrPattern(
      norm,
      /\b(done|completed?|finished?|complete|is[\s_-]?done|solved?|mastered|checkbox)\b/i,
      ['টিক', 'সম্পন্ন', 'সমাপ্ত', 'পূর্ণ']
    )
  ) {
    if (!existingMappedTargets?.has('done')) {
      return { target: 'done', confidence: 'high', isUncertain: false, reason: 'Matched completion/checkbox status' };
    }
  }
  if (
    matchesTermOrPattern(
      norm,
      /\b(status|progress|state|flags?|phases?|stages?)\b/i,
      ['গতিবিধি', 'स्थिति']
    )
  ) {
    if (!existingMappedTargets?.has('done')) {
      return { target: 'done', confidence: 'medium', isUncertain: false, reason: 'Matched status/progress synonym' };
    }
  }

  // 7. Notes / References
  if (
    matchesTermOrPattern(
      norm,
      /\b(notes?|remarks?|comments?|references?|links?|urls?|resources?|descriptions?|memos?)\b/i,
      ['মন্তব্য', 'নোট', 'टिप्पणी']
    )
  ) {
    if (!existingMappedTargets?.has('notes')) {
      return { target: 'notes', confidence: 'high', isUncertain: false, reason: 'Matched notes keyword' };
    }
  }
  if (/\b(formulas?|tips?|hints?|guidelines?|info)\b/i.test(norm)) {
    if (!existingMappedTargets?.has('notes')) {
      return { target: 'notes', confidence: 'medium', isUncertain: false, reason: 'Matched reference info synonym' };
    }
  }

  // 8. Priority
  if (
    matchesTermOrPattern(
      norm,
      /\b(priority|priorities|importance|weightage|urgency|ranks?|levels?)\b/i,
      ['গুরুত্ব', 'प्राथमिकता']
    )
  ) {
    if (!existingMappedTargets?.has('priority')) {
      return { target: 'priority', confidence: 'high', isUncertain: false, reason: 'Matched priority keyword' };
    }
  }

  // 9. Uncertain / Unmapped (Rule: Never silently map an uncertain column)
  return {
    target: 'unmapped',
    confidence: 'low',
    isUncertain: true,
    reason: `Uncertain or unrecognized header "${headerName || 'unnamed'}". Requires explicit user mapping.`,
  };
}

export function inferColumnTarget(
  headerName: string,
  inferredType?: string,
  existingMappedTargets?: Set<StudyTargetField>
): StudyTargetField {
  return inferColumnTargetWithConfidence(headerName, inferredType, existingMappedTargets).target;
}

/**
 * Generates initial column mappings for a given tab's column list.
 * Invariant: Never silently maps an uncertain column to 'topic' or any other field.
 */
export function inferInitialColumnMappings(columns: SheetColumnMapping[]): ColumnToFieldMapping[] {
  const mappedTargets = new Set<StudyTargetField>();
  const results: ColumnToFieldMapping[] = [];

  for (const col of columns) {
    const inference = inferColumnTargetWithConfidence(col.headerName, col.inferredType, mappedTargets);
    if (inference.target !== 'unmapped' && inference.confidence !== 'low') {
      mappedTargets.add(inference.target);
    }
    results.push({
      fieldKey: col.fieldKey,
      headerName: col.headerName,
      targetField: inference.target,
      confidence: inference.confidence,
      isUncertain: inference.isUncertain,
      userConfirmed: false,
    });
  }

  return results;
}

/**
 * Normalizes a hierarchy path (Subject -> Unit/Module -> Topic -> Subtopic)
 * into a canonical collision-resistant lookup key.
 * Strictly guarantees that "Module 1 > Topic A" is never merged with "Module 2 > Topic A".
 */
export function normalizeHierarchyKey(
  subjectCode: string,
  unit: string,
  topic: string,
  subtopic: string
): string {
  const cleanSubj = (subjectCode || '').trim().toUpperCase();
  const cleanUnit = (unit || 'general').trim().toLowerCase().replace(/\s+/g, ' ');
  const cleanTopic = (topic || '').trim().toLowerCase().replace(/\s+/g, ' ');
  const cleanSubtopic = (subtopic || '').trim().toLowerCase().replace(/\s+/g, ' ');
  return `${cleanSubj}|${cleanUnit}|${cleanTopic}::${cleanSubtopic}`;
}

/**
 * Computes canonical source mapping key linking a spreadsheet row to a Study OS topic.
 * Format: srowmap_<spreadsheetId>|<sheetId>|<sourceRowId>
 */
export function computeSourceMappingKey(
  spreadsheetId: string,
  sheetId: number | string,
  sourceRowId: string
): string {
  return `srowmap_${spreadsheetId.trim()}|${String(sheetId).trim()}|${sourceRowId.trim()}`;
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
  const existingTopicMappingKeyMap = new Map<string, StudyTopic>();
  const existingTopicNameMap = new Map<string, StudyTopic>();
  const existingTopicConceptMap = new Map<string, StudyTopic>();

  for (const t of existingTopics) {
    if ((t as any).sourceMappingKey) {
      existingTopicMappingKeyMap.set((t as any).sourceMappingKey, t);
    }
    if ((t as any).sourceRowKey) {
      existingTopicKeyMap.set((t as any).sourceRowKey, t);
    }
    // Index by subjectCode|unit|topic|subtopic
    const nameKey = `${t.subjectCode.toUpperCase()}|${(t.unit || 'general').trim().toLowerCase()}|${t.topic.trim().toLowerCase()}|${t.subtopic.trim().toLowerCase()}`;
    existingTopicNameMap.set(nameKey, t);
    // Index by subjectCode|unit|topic::subtopic (Concept-level matching MUST include Unit)
    const conceptKey = `${t.subjectCode.toUpperCase()}|${(t.unit || 'general').trim().toLowerCase()}|${t.topic.trim().toLowerCase()}::${t.subtopic.trim().toLowerCase()}`;
    existingTopicConceptMap.set(conceptKey, t);
  }

  let totalSelectedTabs = 0;
  let totalEvaluatedRows = 0;
  let subjectsToCreate = 0;
  let subjectsToMerge = 0;
  let newTopicsCount = 0;
  let existingTopicsCount = 0;
  let duplicateRowsCount = 0;
  let invalidRowsCount = 0;
  let totalTheoryCompleted = 0;

  const validationBreakdown: ValidationBreakdown = {
    summaryRowsCount: 0,
    aggregateCountsCount: 0,
    emptyRowsCount: 0,
    headerEchoesCount: 0,
    placeholdersCount: 0,
  };

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
    totalEvaluatedRows += rows.length;

    // Invariant 3: Never automatically create a Study OS subject from an Overview or Summary sheet
    if (isTabOverview(mapping.sheetTitle)) {
      invalidRowsCount += rows.length;
      continue;
    }

    // Build field access lookup supporting flexible hierarchy depths
    const unitCol = mapping.columns.find((c) => c.targetField === 'unit')?.fieldKey;
    const moduleCol = mapping.columns.find((c) => c.targetField === 'module')?.fieldKey;
    const chapterCol = mapping.columns.find((c) => c.targetField === 'chapter')?.fieldKey;
    const subjectCol = mapping.columns.find((c) => c.targetField === 'subject')?.fieldKey;
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
      const rawUnitDirect = unitCol ? String(r.values?.[unitCol] ?? '').trim() : '';
      const rawModule = moduleCol ? String(r.values?.[moduleCol] ?? '').trim() : '';
      const rawChapter = chapterCol ? String(r.values?.[chapterCol] ?? '').trim() : '';
      let rawUnit = rawUnitDirect;
      if (!rawUnit) {
        if (rawModule && rawChapter) rawUnit = `${rawModule} - ${rawChapter}`;
        else if (rawModule) rawUnit = rawModule;
        else if (rawChapter) rawUnit = rawChapter;
      }

      const rawTopic = topicCol ? String(r.values?.[topicCol] ?? '').trim() : '';
      const rawSubtopic = subtopicCol ? String(r.values?.[subtopicCol] ?? '').trim() : '';
      const rawDone = doneCol ? r.values?.[doneCol] : undefined;
      const rawNotes = notesCol ? String(r.values?.[notesCol] ?? '').trim() : '';
      const rawPriority = priorityCol ? r.values?.[priorityCol] : undefined;

      // Filter empty rows, pure numeric aggregate counts, and summary labels
      const rowCheck = isSummaryOrInvalidSyllabusRow(rawUnit, rawTopic, rawSubtopic);
      if (rowCheck.isInvalid) {
        tabInvalidRows++;
        invalidRowsCount++;
        if (rowCheck.category === 'summary_row') validationBreakdown.summaryRowsCount++;
        else if (rowCheck.category === 'aggregate_count') validationBreakdown.aggregateCountsCount++;
        else if (rowCheck.category === 'empty') validationBreakdown.emptyRowsCount++;
        else if (rowCheck.category === 'header_echo') validationBreakdown.headerEchoesCount++;
        else if (rowCheck.category === 'placeholder') validationBreakdown.placeholdersCount++;
        continue;
      }

      const unit = rawUnit || 'General';
      const topic = rawTopic || rawSubtopic;
      const subtopic = rawSubtopic || rawTopic;
      const notes = rawNotes || undefined;
      const priority = normalizePriority(rawPriority);

      const stableSourceRowId = String(r.rowUid || r.id || r.rowIndex);
      const sourceMappingKey = computeSourceMappingKey(spreadsheetId, mapping.sheetId, stableSourceRowId);

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
      // Concept-level matching strictly includes unit
      const conceptKey = `${mapping.targetSubjectCode.toUpperCase()}|${unit.toLowerCase()}|${topic.trim().toLowerCase()}::${subtopic.trim().toLowerCase()}`;
      const existingMatch =
        existingTopicMappingKeyMap.get(sourceMappingKey) ||
        existingTopicKeyMap.get(sourceRowKey) ||
        existingTopicNameMap.get(nameKey) ||
        existingTopicConceptMap.get(conceptKey);

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
        if (priorityCol && existingMatch.priority !== priority) diffFields.push('priority');
        if (notesCol && notes && !existingMatch.notes) diffFields.push('notes');

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

    if (previewTopics.length > 0) {
      totalSelectedTabs++;
      targetSubjectCodesIncluded.add(mapping.targetSubjectCode.toUpperCase());

      const isNew = mapping.action === 'create_new' && !existingSubjectCodes.has(mapping.targetSubjectCode.toUpperCase());
      if (isNew) {
        subjectsToCreate++;
      } else {
        subjectsToMerge++;
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

  const movedTopicsCount = conflictAnalysis.changedTopics.filter((c) => c.diffFields.includes('unit')).length;
  const renamedTopicsCount = conflictAnalysis.changedTopics.filter(
    (c) => c.diffFields.includes('topic') || c.diffFields.includes('subtopic')
  ).length;
  const unchangedTopicsCount = conflictAnalysis.unchangedTopics.length;
  const orphanedSourceTopicsCount = conflictAnalysis.missingSourceTopics.length;

  const distinctCreatedCount = Math.max(0, newTopicsCount - duplicateRowsCount);
  const sumBreakdown =
    distinctCreatedCount +
    conflictAnalysis.changedTopics.length +
    unchangedTopicsCount +
    duplicateRowsCount +
    invalidRowsCount;

  const reconciliation = {
    totalRowsEvaluated: totalEvaluatedRows,
    created: distinctCreatedCount,
    updated: conflictAnalysis.changedTopics.length,
    unchanged: unchangedTopicsCount,
    skipped: 0,
    duplicate: duplicateRowsCount,
    invalid: invalidRowsCount,
    failed: 0,
    sumBreakdown,
    isReconciled: sumBreakdown === totalEvaluatedRows,
  };

  const summary: ImportPreviewSummary = {
    tabsSelectedCount: totalSelectedTabs,
    subjectsToCreateCount: subjectsToCreate,
    subjectsToMergeCount: subjectsToMerge,
    newTopicsCount: newTopicsCount,
    existingTopicsCount: existingTopicsCount,
    duplicateRowsCount: duplicateRowsCount,
    invalidRowsCount: invalidRowsCount,
    theoryCompletedCount: totalTheoryCompleted,
    validationBreakdown,
    unchangedTopicsCount,
    movedTopicsCount,
    renamedTopicsCount,
    orphanedSourceTopicsCount,
    reconciliation,
  };

  return { summary, previewSubjects, conflictAnalysis };
}
