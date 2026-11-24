/**
 * Universal Sheet Sync Hub — Dynamic Schema Detector
 * Reusable, zero-hardcoded-schema inference engine for arbitrary multi-tab spreadsheets.
 * Prioritizes native Google Sheets cell metadata (formulas, validations, number formats, booleans)
 * and uses header keywords and value patterns strictly as supplementary signals.
 */

import type {
  DashboardCrossSheetFormula,
  DashboardReferenceReport,
  DashboardSubjectReference,
  DetectedTabSchema,
  DetectedWorkbookSchema,
  SheetCellScalar,
  SheetColumnMapping,
  SheetConfidence,
  SheetDefaultView,
  SheetDetectedPurpose,
  SheetFieldType,
  SheetHeaderCandidate,
  SheetIdentityStrategy,
  SheetInspectCellMeta,
  SheetSemanticRole,
  SheetTabInspectionInput,
  SheetTabRole,
} from '../../types/sheetHub.ts';

/**
 * Converts a 0-based column index (0 -> A, 25 -> Z, 26 -> AA) into an A1 column letter.
 */
export function colIndexToLetter(colIndex: number): string {
  let n = Math.max(0, Math.floor(colIndex));
  let result = '';
  while (n >= 0) {
    result = String.fromCharCode((n % 26) + 65) + result;
    n = Math.floor(n / 26) - 1;
  }
  return result;
}

/**
 * Produces a stable, URL/Firestore-safe key from a column header and index.
 */
export function normalizeFieldKey(headerName: string, colIndex: number): string {
  const slug = headerName
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 48);
  return slug ? `${slug}_${colIndex}` : `col_${colIndexToLetter(colIndex).toLowerCase()}`;
}

function isEmptyScalar(v: SheetCellScalar | undefined): boolean {
  if (v === null || v === undefined) return true;
  if (typeof v === 'string' && v.trim() === '') return true;
  return false;
}

function isNonEmptyCell(cell: SheetInspectCellMeta | undefined): boolean {
  if (!cell) return false;
  if (cell.formula && cell.formula.trim().length > 0) return true;
  if (cell.dataValidationType && cell.dataValidationType.trim().length > 0) return true;
  if (cell.isBooleanCell) return true;
  if (!isEmptyScalar(cell.value)) return true;
  if (cell.formattedValue && cell.formattedValue.trim().length > 0) return true;
  return false;
}

function cellText(cell: SheetInspectCellMeta | undefined): string {
  if (!cell) return '';
  if (typeof cell.formattedValue === 'string' && cell.formattedValue.trim() !== '') {
    return cell.formattedValue.trim();
  }
  if (cell.value === null || cell.value === undefined) return '';
  return String(cell.value).trim();
}

const OVERVIEW_TAB_NAME_REGEX =
  /\b(overview|summary|dashboard|kpi|readme|guide|index|home|instructions|about|progress|stats|statistics|tracker|syllabus[\s_-]?overview|course[\s_-]?overview)\b/i;

const URL_VALUE_REGEX = /^https?:\/\/[^\s]+$/i;
const ISO_DATE_REGEX = /^\d{4}-\d{2}-\d{2}(?:[T\s]\d{2}:\d{2}(?::\d{2})?)?$/;
const HUMAN_DATE_REGEX = /^(?:\d{1,2}[\/\-]\d{1,2}[\/\-]\d{2,4}|[A-Za-z]{3,9}\s+\d{1,2},?\s+\d{4})$/;
const CURRENCY_TEXT_REGEX = /^[\s]*[₹$€£¥]\s*-?[\d,]+(?:\.\d+)?$|^-?[\d,]+(?:\.\d+)?\s*(?:INR|USD|EUR|GBP)$/i;
const BOOLEAN_TEXT_SET = new Set(['true', 'false', 'yes', 'no', '☑', '☐', '✓', '✗']);
const PRIORITY_VALUE_SET = new Set(['high', 'medium', 'low', 'critical', 'urgent', 'p0', 'p1', 'p2', 'p3']);
const STATUS_VALUE_SET = new Set([
  'todo',
  'to do',
  'pending',
  'in progress',
  'in_progress',
  'doing',
  'done',
  'completed',
  'blocked',
  'skipped',
  'review',
  'scheduled',
  'not started',
  'paid',
  'unpaid',
  'overdue',
]);

const HEADER_KEYWORD_REGEX =
  /(?:^|[\s_/\-()])(module|unit|chapter|chap|ch|topic|subtopic|section|subject|course|paper|lesson|concept|title|name|status|done|completed?|finished?|notes?|remarks?|priority|weightage|importance|date|due|links?|url|resource)(?:$|[\s_/\-()])|(টপিক|অধ্যায়|বিষয়|একক|মডিউল|সম্পন্ন|নোট|গুরুত্ব|পাঠ|শীর্ষক|विषय|अध्याय|मॉड्यूल|पूर्ण|स्थिति)/i;

/**
 * Flexible Header Detection:
 * Scans up to 25 rows to discover and rank all candidate header rows.
 * Handles metadata banners, merged cells, blank prologue rows, and multi-tier headers.
 */
export function detectHeaderRowCandidates(rows: SheetInspectCellMeta[][]): SheetHeaderCandidate[] {
  const maxScan = Math.min(rows.length, 25);
  const candidates: SheetHeaderCandidate[] = [];

  for (let r = 0; r < maxScan; r++) {
    const row = rows[r] || [];
    const nonEmptyCells = row.filter((c) => isNonEmptyCell(c));
    if (nonEmptyCells.length === 0) continue;

    const texts = nonEmptyCells.map((c) => cellText(c)).filter(Boolean);
    if (texts.length === 0) continue;

    const distinctTexts = new Set(texts.map((t) => t.toLowerCase()));
    const stringLikeCount = nonEmptyCells.filter(
      (c) =>
        !c.formula &&
        !c.isBooleanCell &&
        typeof c.value === 'string' &&
        c.value.trim().length > 0 &&
        c.value.trim().length <= 80
    ).length;
    const formulaCount = nonEmptyCells.filter((c) => Boolean(c.formula)).length;
    const avgLen = texts.reduce((sum, t) => sum + t.length, 0) / Math.max(1, texts.length);

    // Header vocabulary match count
    const headerKeywordMatches = texts.filter((t) => HEADER_KEYWORD_REGEX.test(t)).length;

    // Check if the row immediately below has tabular data
    const nextRow = rows[r + 1] || [];
    const nextNonEmpty = nextRow.filter((c) => isNonEmptyCell(c)).length;

    let score = 0;
    score += nonEmptyCells.length * 3;
    score += stringLikeCount * 2.5;
    score += distinctTexts.size === nonEmptyCells.length ? 5 : -4;
    score += headerKeywordMatches * 6; // Big boost for standard header terminology
    score -= formulaCount * 8;

    // A row containing boolean checkboxes is a data row, not a header row
    const booleanCount = nonEmptyCells.filter((c) => c.isBooleanCell || typeof c.value === 'boolean').length;
    score -= booleanCount * 12;

    if (avgLen > 60) score -= 10;
    if (nonEmptyCells.length === 1 && rows.length > r + 1 && nextNonEmpty > 1) score -= 16; // single banner row penalty when table has multiple columns
    if (nextNonEmpty >= Math.max(2, Math.floor(nonEmptyCells.length * 0.5))) score += 6;

    // Penalize row if all cells are purely numeric
    const numericCells = nonEmptyCells.filter(
      (c) => typeof c.value === 'number' || /^\d+(\.\d+)?$/.test(cellText(c))
    ).length;
    if (numericCells / nonEmptyCells.length >= 0.7) {
      score -= 15;
    }

    // Slight preference for earlier rows when scores tie
    score -= r * 0.25;

    if (score > 0) {
      let confidence: SheetConfidence = 'low';
      if (score >= 22 && (headerKeywordMatches >= 1 || distinctTexts.size >= 3)) {
        confidence = 'high';
      } else if (score >= 12) {
        confidence = 'medium';
      }

      candidates.push({
        rowIndex0: r,
        rowNumber: r + 1,
        score,
        confidence,
        nonEmptyCount: nonEmptyCells.length,
        sampleHeaders: texts.slice(0, 6),
      });
    }
  }

  if (candidates.length === 0) {
    const firstNonEmpty = rows.findIndex((r) => r.some((c) => isNonEmptyCell(c)));
    if (firstNonEmpty >= 0) {
      const row = rows[firstNonEmpty] || [];
      const nonEmptyCells = row.filter((c) => isNonEmptyCell(c));
      const texts = nonEmptyCells.map((c) => cellText(c)).filter(Boolean);
      candidates.push({
        rowIndex0: firstNonEmpty,
        rowNumber: firstNonEmpty + 1,
        score: 1,
        confidence: 'low',
        nonEmptyCount: nonEmptyCells.length,
        sampleHeaders: texts.slice(0, 6),
      });
    }
  }

  candidates.sort((a, b) => b.score - a.score);
  return candidates;
}

/**
 * Scans rows dynamically to locate the most probable header row index (0-based).
 * Returns top-scoring candidate index, or -1 if no suitable header row found.
 */
export function detectHeaderRowIndex(rows: SheetInspectCellMeta[][]): number {
  const candidates = detectHeaderRowCandidates(rows);
  return candidates.length > 0 ? candidates[0].rowIndex0 : -1;
}

function inferSemanticRole(
  headerName: string,
  inferredType: SheetFieldType,
  colIndex: number
): { role: SheetSemanticRole; confidence: SheetConfidence } {
  const h = headerName.trim().toLowerCase();

  if (inferredType === 'formula') {
    return { role: 'metric', confidence: 'high' };
  }
  if (inferredType === 'checkbox' || inferredType === 'boolean') {
    if (/\b(done|complete|completed|checked|finish|finished|studied|revised|paid)\b/.test(h)) {
      return { role: 'done', confidence: 'high' };
    }
    return { role: 'done', confidence: 'medium' };
  }
  if (inferredType === 'url' || /\b(link|url|website|resource|ref|reference)\b/.test(h)) {
    return { role: 'link', confidence: inferredType === 'url' ? 'high' : 'medium' };
  }
  if (inferredType === 'date' || /\b(date|due|deadline|exam\s*date|scheduled|target\s*date)\b/.test(h)) {
    return { role: 'due_date', confidence: inferredType === 'date' ? 'high' : 'medium' };
  }
  if (inferredType === 'priority' || /\b(priority|severity|importance|urgency)\b/.test(h)) {
    return { role: 'priority', confidence: 'high' };
  }
  if (inferredType === 'status' || /\b(status|state|stage|phase)\b/.test(h)) {
    return { role: 'status', confidence: 'high' };
  }
  if (/^(id|row[_\s]?id|record[_\s]?id|uid|code|sku|key|_ff_row_id)$/.test(h) || /\bid$/.test(h)) {
    return { role: 'id', confidence: 'high' };
  }
  if (/\b(note|notes|practice|comment|comments|remark|remarks|description|detail|details|summary|memo)\b/.test(h)) {
    return { role: 'notes', confidence: 'high' };
  }
  if (/\b(subtopic|sub[\s_-]?topic|item|task|title|name|lesson|question|problem)\b/.test(h)) {
    return { role: 'title', confidence: 'high' };
  }
  if (/\b(module|unit|section|chapter|category|subject|phase|pillar|domain|group)\b/.test(h)) {
    return { role: 'group', confidence: 'high' };
  }
  if (/\b(topic|sub[\s_-]?section|sub[\s_-]?group|area|theme)\b/.test(h)) {
    return { role: 'subgroup', confidence: 'high' };
  }
  if (inferredType === 'currency' || inferredType === 'number') {
    return { role: 'metric', confidence: 'medium' };
  }
  if (colIndex === 0 && inferredType === 'text') {
    return { role: 'title', confidence: 'low' };
  }
  return { role: 'custom', confidence: 'low' };
}

function inferColumnMapping(
  colIndex: number,
  headerName: string,
  columnCells: SheetInspectCellMeta[]
): SheetColumnMapping {
  const colLetter = colIndexToLetter(colIndex);
  const cleanHeader = headerName.trim() || `Column ${colLetter}`;
  const fieldKey = normalizeFieldKey(cleanHeader, colIndex);
  const hLower = cleanHeader.toLowerCase();

  const nonEmpty = columnCells.filter((c) => isNonEmptyCell(c));
  const totalSample = nonEmpty.length;

  let formulaCount = 0;
  let checkboxValidationCount = 0;
  let boolCellCount = 0;
  let boolTextCount = 0;
  let dropdownValidationCount = 0;
  const dropdownOptions = new Set<string>();
  let currencyFormatCount = 0;
  let dateFormatCount = 0;
  let numberCount = 0;
  let urlCount = 0;
  let dateStringCount = 0;
  let currencyStringCount = 0;
  let longTextCount = 0;
  let priorityMatchCount = 0;
  let statusMatchCount = 0;
  const distinctStrings = new Set<string>();

  for (const cell of nonEmpty) {
    if (cell.formula && cell.formula.trim().length > 0) formulaCount++;
    if (cell.dataValidationType === 'BOOLEAN') checkboxValidationCount++;
    if (cell.dataValidationType === 'ONE_OF_LIST') {
      dropdownValidationCount++;
      for (const opt of cell.dataValidationValues || []) {
        if (opt.trim()) dropdownOptions.add(opt.trim());
      }
    }
    if (cell.isBooleanCell || typeof cell.value === 'boolean') boolCellCount++;
    if (cell.numberFormatType === 'CURRENCY') currencyFormatCount++;
    if (cell.numberFormatType === 'DATE' || cell.numberFormatType === 'DATE_TIME') dateFormatCount++;
    if (typeof cell.value === 'number' && !cell.numberFormatType?.includes('DATE')) numberCount++;

    const txt = cellText(cell);
    if (txt) {
      const lower = txt.toLowerCase();
      distinctStrings.add(txt);
      if (BOOLEAN_TEXT_SET.has(lower)) boolTextCount++;
      if (URL_VALUE_REGEX.test(txt)) urlCount++;
      if (ISO_DATE_REGEX.test(txt) || HUMAN_DATE_REGEX.test(txt)) dateStringCount++;
      if (CURRENCY_TEXT_REGEX.test(txt)) currencyStringCount++;
      if (txt.length >= 80 || txt.includes('\n')) longTextCount++;
      if (PRIORITY_VALUE_SET.has(lower)) priorityMatchCount++;
      if (STATUS_VALUE_SET.has(lower)) statusMatchCount++;
    }
  }

  let inferredType: SheetFieldType = 'text';
  let typeConfidence: SheetConfidence = 'low';
  let editable = true;
  let readOnlyReason: string | null = null;
  let enumOptions: string[] | undefined;

  if (totalSample > 0 && formulaCount / totalSample >= 0.4) {
    inferredType = 'formula';
    typeConfidence = 'high';
    editable = false;
    readOnlyReason = 'Formula-derived column (protected from overwrite)';
  } else if (totalSample > 0 && checkboxValidationCount / totalSample >= 0.5) {
    inferredType = 'checkbox';
    typeConfidence = 'high';
  } else if (totalSample > 0 && boolCellCount / totalSample >= 0.7) {
    inferredType = 'boolean';
    typeConfidence = 'high';
  } else if (totalSample > 0 && dropdownValidationCount / totalSample >= 0.5) {
    const opts = Array.from(dropdownOptions);
    const isPriorityEnum = opts.some((o) => PRIORITY_VALUE_SET.has(o.toLowerCase()));
    inferredType = isPriorityEnum ? 'priority' : 'status';
    typeConfidence = 'high';
    enumOptions = opts;
  } else if (totalSample > 0 && dateFormatCount / totalSample >= 0.6) {
    inferredType = 'date';
    typeConfidence = 'high';
  } else if (totalSample > 0 && currencyFormatCount / totalSample >= 0.6) {
    inferredType = 'currency';
    typeConfidence = 'high';
  } else if (totalSample > 0 && urlCount / totalSample >= 0.6) {
    inferredType = 'url';
    typeConfidence = 'high';
  } else if (totalSample > 0 && dateStringCount / totalSample >= 0.7) {
    inferredType = 'date';
    typeConfidence = 'medium';
  } else if (totalSample > 0 && currencyStringCount / totalSample >= 0.6) {
    inferredType = 'currency';
    typeConfidence = 'medium';
  } else if (totalSample > 0 && boolTextCount / totalSample >= 0.8) {
    inferredType = 'boolean';
    typeConfidence = 'medium';
  } else if (totalSample > 0 && numberCount / totalSample >= 0.8) {
    if (/\b(amount|price|cost|budget|fee|salary|income|expense|inr|usd|rupee|paise)\b/.test(hLower)) {
      inferredType = 'currency';
      typeConfidence = 'medium';
    } else {
      inferredType = 'number';
      typeConfidence = 'high';
    }
  } else if (totalSample > 0 && priorityMatchCount / totalSample >= 0.7) {
    inferredType = 'priority';
    typeConfidence = 'medium';
    enumOptions = Array.from(distinctStrings).slice(0, 12);
  } else if (totalSample > 0 && statusMatchCount / totalSample >= 0.7) {
    inferredType = 'status';
    typeConfidence = 'medium';
    enumOptions = Array.from(distinctStrings).slice(0, 12);
  } else if (
    (totalSample > 0 && longTextCount / totalSample >= 0.35) ||
    /\b(note|notes|practice|comment|comments|description|remark|remarks|memo)\b/.test(hLower)
  ) {
    inferredType = 'long_text';
    typeConfidence = totalSample > 0 && longTextCount > 0 ? 'high' : 'medium';
  } else if (totalSample > 0) {
    inferredType = 'text';
    typeConfidence = 'high';
  } else {
    // Empty column (e.g., Notes / Practice currently blank): infer carefully with medium/low confidence
    if (/\b(done|complete|completed|checked)\b/.test(hLower)) {
      inferredType = 'boolean';
      typeConfidence = 'medium';
    } else if (/\b(date|due|deadline)\b/.test(hLower)) {
      inferredType = 'date';
      typeConfidence = 'medium';
    } else if (/\b(link|url)\b/.test(hLower)) {
      inferredType = 'url';
      typeConfidence = 'medium';
    } else {
      inferredType = 'text';
      typeConfidence = 'low';
    }
  }

  const { role: semanticRole, confidence: roleConfidence } = inferSemanticRole(
    cleanHeader,
    inferredType,
    colIndex
  );

  // Overall confidence is the conservative minimum of type confidence and semantic confidence
  const rank: Record<SheetConfidence, number> = { high: 2, medium: 1, low: 0 };
  const combinedRank = Math.min(rank[typeConfidence], rank[roleConfidence]);
  const confidence: SheetConfidence =
    combinedRank === 2 ? 'high' : combinedRank === 1 ? 'medium' : 'low';

  const requiresConfirmation = confidence !== 'high' || totalSample === 0;
  const isUncertain = confidence === 'low' || semanticRole === 'custom';

  return {
    colIndex,
    colLetter,
    fieldKey,
    headerName: cleanHeader,
    displayName: cleanHeader,
    inferredType,
    confirmedType: inferredType,
    semanticRole,
    confidence,
    editable,
    readOnlyReason,
    requiresConfirmation,
    isUncertain,
    mappingConfidence: confidence,
    ...(enumOptions && enumOptions.length > 0 ? { enumOptions } : {}),
  };
}

export interface SheetPurposeClassification {
  purpose: SheetDetectedPurpose;
  role: SheetTabRole;
  confidence: SheetConfidence;
  confidenceScore: number;
  requiresUserClassification: boolean;
  reason: string;
}

const AGGREGATE_FORMULA_REGEX = /^\s*=\s*(SUM|COUNT|COUNTA|COUNTIF|COUNTIFS|AVERAGE|AVERAGEIF|SUBTOTAL|MAX|MIN|MEDIAN)\b/i;
const SUMMARY_KEYWORD_REGEX = /^(total|grand\s*total|subtotal|count|sum|average|avg|kpi|summary|overview|all|metrics|completion\s*rate)\b/i;
const INSTRUCTIONS_KEYWORD_REGEX = /\b(instructions?|guidelines?|how\s*to\s*use|readme|welcome|important\s*notes?|rules?|steps?)\b/i;
const METADATA_KEY_REGEX = /^(semester|academic\s*year|author|instructor|professor|course\s*(code|name|id)|date|created|updated|version|target\s*exam|total\s*credits?|notes?)$/i;
const SYLLABUS_HEADER_REGEX = /\b(modules?|units?|chapters?|topics?|sub[\s_-]?topics?|subtopics?|concepts?|done|status|priority|weightage|lectures?|contents?)\b/i;
const REFERENCE_KEYWORD_REGEX = /\b(reference|lookup|glossary|abbreviations?|acronyms?|definitions?|legend)\b/i;
const TOTAL_ROW_PATTERN = /^(total|grand\s*total|subtotal|count|sum|average|avg|mean|median|min|max|all|kpi|metrics?|progress|completion\s*rate|percentage)\b/i;

function parseNumberOrPct(text: string): { val: number; type: 'number' | 'percent' } | undefined {
  if (!text) return undefined;
  const trimmed = text.trim();
  if (/^\d+(?:\.\d+)?\s*%$/.test(trimmed)) {
    const n = parseFloat(trimmed.replace('%', '').trim());
    if (!isNaN(n)) return { val: n, type: 'percent' };
  }
  if (/^\d+(?:\.\d+)?$/.test(trimmed)) {
    const n = parseFloat(trimmed);
    if (!isNaN(n)) return { val: n, type: 'number' };
  }
  return undefined;
}

/**
 * Extracts and audits all cross-sheet formulas from a set of rows.
 * Detects target sheet names, ranges, and identifies broken references (#REF! or missing sheets).
 */
export function extractCrossSheetFormulas(
  rows: SheetInspectCellMeta[][],
  allKnownTabTitles?: string[]
): DashboardCrossSheetFormula[] {
  const knownSet = allKnownTabTitles
    ? new Set(allKnownTabTitles.map((t) => t.trim().toLowerCase()))
    : null;
  const list: DashboardCrossSheetFormula[] = [];
  const CROSS_SHEET_REF_REGEX = /(?:'([^']+)'|([A-Za-z0-9_]+))!([A-Za-z0-9:$]+)/g;

  for (let rIdx = 0; rIdx < rows.length; rIdx++) {
    const row = rows[rIdx] || [];
    for (let cIdx = 0; cIdx < row.length; cIdx++) {
      const cell = row[cIdx];
      if (!cell || !cell.formula) continue;

      const formula = cell.formula.trim();
      const sourceCell = `${colIndexToLetter(cIdx)}${rIdx + 1}`;

      if (/#REF!/i.test(formula)) {
        list.push({
          sourceCell,
          formula,
          targetSheetTitle: 'Unknown (#REF!)',
          isBroken: true,
          brokenReason: 'Formula contains broken reference (#REF!)',
        });
        continue;
      }

      CROSS_SHEET_REF_REGEX.lastIndex = 0;
      let match: RegExpExecArray | null;
      while ((match = CROSS_SHEET_REF_REGEX.exec(formula)) !== null) {
        const targetSheetTitle = (match[1] || match[2] || '').trim();
        const targetRange = (match[3] || '').trim();
        if (!targetSheetTitle) continue;

        const isKnownSheet = knownSet ? knownSet.has(targetSheetTitle.toLowerCase()) : true;
        const isBroken = knownSet ? !isKnownSheet : false;
        const brokenReason = isBroken
          ? `Referenced sheet "${targetSheetTitle}" does not exist in workbook`
          : undefined;

        list.push({
          sourceCell,
          formula,
          targetSheetTitle,
          targetRange,
          isBroken,
          brokenReason,
        });
      }
    }
  }

  return list;
}

/**
 * Extracts high-value summary metrics, subject expectations, and cross-sheet formulas
 * from an Overview or Dashboard tab to use as reference data for cross-sheet validation.
 */
export function extractDashboardReferenceData(
  tabTitle: string,
  tabId: number,
  rows: SheetInspectCellMeta[][],
  allKnownTabTitles?: string[]
): DashboardReferenceReport {
  const crossSheetFormulas = extractCrossSheetFormulas(rows, allKnownTabTitles);
  const brokenReferencesCount = crossSheetFormulas.filter((f) => f.isBroken).length;

  const subjectMap = new Map<string, DashboardSubjectReference>();
  const reasons: string[] = [];
  const detectedKpis: Record<string, number | string> = {};

  let totalSyllabusCount: number | undefined;
  let totalCompletedCount: number | undefined;
  let overallCompletionPct: number | undefined;

  // 1. Group cross-sheet formulas by target sheet title
  for (const csf of crossSheetFormulas) {
    if (csf.isBroken) continue;
    const normSheet = csf.targetSheetTitle;
    if (!subjectMap.has(normSheet)) {
      subjectMap.set(normSheet, {
        subjectName: normSheet,
        referencedSheetTitle: normSheet,
        formulaReferences: [csf.formula],
      });
    } else {
      const existing = subjectMap.get(normSheet)!;
      if (!existing.formulaReferences) existing.formulaReferences = [];
      existing.formulaReferences.push(csf.formula);
    }
  }

  // 2. Scan for KPI metric blocks across the sheet
  for (let rIdx = 0; rIdx < rows.length; rIdx++) {
    const row = rows[rIdx] || [];
    for (let cIdx = 0; cIdx < row.length; cIdx++) {
      const cell = row[cIdx];
      const text = cellText(cell);
      if (!text) continue;

      const normLabel = text.replace(/[:\-]$/, '').trim();
      if (/^(total\s*(syllabus|topics?|records?|subtopics?|questions?|items?)|syllabus\s*count)$/i.test(normLabel)) {
        const valRight = parseNumberOrPct(cellText(row[cIdx + 1]));
        const valBelow = rIdx + 1 < rows.length ? parseNumberOrPct(cellText(rows[rIdx + 1][cIdx])) : undefined;
        const numVal = valRight ?? valBelow;
        if (numVal !== undefined && numVal.type === 'number') {
          totalSyllabusCount = numVal.val;
          detectedKpis[text] = numVal.val;
        }
      }

      if (/^(total\s*(completed|done)|completed\s*(topics?|count)|theory\s*completed)$/i.test(normLabel)) {
        const valRight = parseNumberOrPct(cellText(row[cIdx + 1]));
        const valBelow = rIdx + 1 < rows.length ? parseNumberOrPct(cellText(rows[rIdx + 1][cIdx])) : undefined;
        const numVal = valRight ?? valBelow;
        if (numVal !== undefined && numVal.type === 'number') {
          totalCompletedCount = numVal.val;
          detectedKpis[text] = numVal.val;
        }
      }

      if (/^(overall\s*(progress|completion)|completion\s*(rate|%|percentage)|progress\s*(%|percentage)?)$/i.test(normLabel)) {
        const valRight = parseNumberOrPct(cellText(row[cIdx + 1]));
        const valBelow = rIdx + 1 < rows.length ? parseNumberOrPct(cellText(rows[rIdx + 1][cIdx])) : undefined;
        const numVal = valRight ?? valBelow;
        if (numVal !== undefined) {
          overallCompletionPct = numVal.type === 'percent' ? numVal.val : (numVal.val <= 1 ? numVal.val * 100 : numVal.val);
          detectedKpis[text] = `${overallCompletionPct.toFixed(1)}%`;
        }
      }
    }
  }

  // 3. Scan for multi-subject summary table rows
  for (let rIdx = 0; rIdx < rows.length; rIdx++) {
    const row = rows[rIdx] || [];
    // Data rows with checkboxes are checklist/task items, not dashboard summary rows
    if (row.some((c) => c && (c.isBooleanCell || typeof c.value === 'boolean' || c.dataValidationType === 'BOOLEAN'))) {
      continue;
    }

    const nonEmpty = row.filter((c) => isNonEmptyCell(c));
    if (nonEmpty.length < 2) continue;

    // Find first text cell in this row that could be a subject
    const firstTextIdx = row.findIndex((c) => {
      const t = cellText(c);
      return t && typeof t === 'string' && !/^\d+(\.\d+)?%?$/.test(t) && !TOTAL_ROW_PATTERN.test(t) && t.length <= 60;
    });

    if (firstTextIdx >= 0) {
      const candidateSubjectName = cellText(row[firstTextIdx]).trim();
      const lowerCand = candidateSubjectName.toLowerCase();
      if (/^(subjects?|courses?|names?|titles?|items?|overview|summary|sl\.?\s*no\.?|#)$/i.test(candidateSubjectName)) {
        continue;
      }

      const remainingCells = row.slice(firstTextIdx + 1);
      const parsedValues = remainingCells
        .map((c) => parseNumberOrPct(cellText(c)))
        .filter(Boolean) as Array<{ val: number; type: 'number' | 'percent' }>;

      if (parsedValues.length >= 1) {
        const countCandidate = parsedValues.find((p) => p.type === 'number');
        const pctCandidate = parsedValues.find((p) => p.type === 'percent');
        const completedCandidate = parsedValues.filter((p) => p.type === 'number')[1];

        const matchesKnownTab = allKnownTabTitles?.some((t) => t.trim().toLowerCase() === lowerCand);
        if (countCandidate || matchesKnownTab) {
          const existing = subjectMap.get(candidateSubjectName) || {
            subjectName: candidateSubjectName,
            referencedSheetTitle: matchesKnownTab
              ? allKnownTabTitles?.find((t) => t.trim().toLowerCase() === lowerCand)
              : candidateSubjectName,
          };

          if (countCandidate && !existing.expectedTotalTopics) {
            existing.expectedTotalTopics = Math.round(countCandidate.val);
          }
          if (completedCandidate && !existing.expectedCompletedTopics) {
            existing.expectedCompletedTopics = Math.round(completedCandidate.val);
          }
          if (pctCandidate && !existing.expectedCompletionPct) {
            existing.expectedCompletionPct = pctCandidate.val;
          } else if (existing.expectedTotalTopics && existing.expectedCompletedTopics && !existing.expectedCompletionPct) {
            existing.expectedCompletionPct = Math.round((existing.expectedCompletedTopics / existing.expectedTotalTopics) * 100);
          }

          existing.rawRowIndex = rIdx + 1;
          subjectMap.set(candidateSubjectName, existing);
        }
      }
    }
  }

  // Calculate totals if not explicitly given in KPI block
  const subjectList = Array.from(subjectMap.values());
  if (totalSyllabusCount === undefined && subjectList.length > 0) {
    const sumExpected = subjectList.reduce((acc, s) => acc + (s.expectedTotalTopics || 0), 0);
    if (sumExpected > 0) {
      totalSyllabusCount = sumExpected;
    }
  }
  if (totalCompletedCount === undefined && subjectList.length > 0) {
    const sumCompleted = subjectList.reduce((acc, s) => acc + (s.expectedCompletedTopics || 0), 0);
    if (sumCompleted > 0) {
      totalCompletedCount = sumCompleted;
    }
  }
  if (overallCompletionPct === undefined && totalSyllabusCount && totalCompletedCount) {
    overallCompletionPct = Math.round((totalCompletedCount / totalSyllabusCount) * 100);
  }

  // Score confidence and establish if it is a recognized dashboard
  let confidenceScore = 0;
  const distinctReferencedSheets = new Set(
    crossSheetFormulas.filter((f) => !f.isBroken).map((f) => f.targetSheetTitle.toLowerCase())
  );

  if (distinctReferencedSheets.size >= 2) {
    confidenceScore += 0.55;
    reasons.push(
      `Contains cross-sheet formulas referencing ${distinctReferencedSheets.size} distinct sheets (${Array.from(distinctReferencedSheets).join(', ')}).`
    );
  } else if (distinctReferencedSheets.size === 1) {
    confidenceScore += 0.35;
    reasons.push(`Contains cross-sheet formulas referencing sheet "${Array.from(distinctReferencedSheets)[0]}".`);
  }

  if (subjectList.length >= 2 && subjectList.some((s) => s.expectedTotalTopics)) {
    confidenceScore += 0.4;
    reasons.push(`Detected summary table with ${subjectList.length} subjects and expected topic metrics.`);
  }

  if (totalSyllabusCount !== undefined || overallCompletionPct !== undefined) {
    confidenceScore += 0.2;
    reasons.push(
      `Extracted overall syllabus KPI metrics: ${totalSyllabusCount ? `Total Topics: ${totalSyllabusCount}` : ''} ${overallCompletionPct !== undefined ? `Completion: ${overallCompletionPct}%` : ''}`.trim()
    );
  }

  if (brokenReferencesCount > 0) {
    reasons.push(`Detected ${brokenReferencesCount} broken cross-sheet formula reference(s) (#REF! or missing sheets).`);
  }

  const isProbStats = /^prob(ability)?\s*(&|and)?\s*stat(istics|s)?$/i.test(tabTitle.trim());
  const titleMatchesOverview = !isProbStats && OVERVIEW_TAB_NAME_REGEX.test(tabTitle.trim());
  if (titleMatchesOverview) {
    confidenceScore += 0.25;
    reasons.push(`Sheet title "${tabTitle}" matches standard overview/dashboard conventions.`);
  }

  const hasCrossSheetFormulas = distinctReferencedSheets.size > 0;
  const isRecognizedDashboard = hasCrossSheetFormulas
    ? confidenceScore >= 0.5 || (titleMatchesOverview && (subjectList.length > 0 || crossSheetFormulas.length > 0))
    : titleMatchesOverview && (subjectList.length >= 2 || totalSyllabusCount !== undefined) && confidenceScore >= 0.6;
  const confidence: SheetConfidence = confidenceScore >= 0.75 ? 'high' : confidenceScore >= 0.5 ? 'medium' : 'low';

  return {
    sheetTitle: tabTitle,
    sheetId: tabId,
    isRecognizedDashboard,
    confidence,
    confidenceScore: Math.min(1.0, confidenceScore),
    reasons,
    totalSyllabusCount,
    totalCompletedCount,
    overallCompletionPct,
    subjectReferences: subjectList,
    crossSheetFormulas,
    brokenReferencesCount,
    detectedKpis: Object.keys(detectedKpis).length > 0 ? detectedKpis : undefined,
  };
}

/**
 * Universal multi-signal structural purpose classifier.
 * Evaluates formula types, row text lengths, aggregate keywords, syllabus concepts,
 * and key-value layouts to identify syllabus vs summary vs metadata vs instructions.
 */
export function classifySheetPurpose(
  tabTitle: string,
  headerRow: SheetInspectCellMeta[],
  dataRows: SheetInspectCellMeta[][],
  columns: SheetColumnMapping[],
  formulaCellCount: number,
  totalNonEmptyCells: number,
  allKnownTabTitles?: string[]
): SheetPurposeClassification {
  const normTitle = tabTitle.trim();
  const isProbStatsSubject = /^prob(ability)?\s*(&|and)?\s*stat(istics|s)?$/i.test(normTitle);
  const titleMatchesOverview = !isProbStatsSubject && OVERVIEW_TAB_NAME_REGEX.test(normTitle);
  const titleMatchesInstructions = INSTRUCTIONS_KEYWORD_REGEX.test(normTitle);

  if (dataRows.length === 0) {
    return {
      purpose: 'empty',
      role: 'ignored',
      confidence: 'medium',
      confidenceScore: 0.5,
      requiresUserClassification: false,
      reason: 'Header row found without data rows yet.',
    };
  }

  // 1. Dashboard structural signal recognition
  const dashboardRef = extractDashboardReferenceData(
    tabTitle,
    0,
    [headerRow, ...dataRows],
    allKnownTabTitles
  );

  if (dashboardRef.isRecognizedDashboard) {
    return {
      purpose: 'dashboard',
      role: 'overview',
      confidence: dashboardRef.confidence,
      confidenceScore: dashboardRef.confidenceScore,
      requiresUserClassification: false,
      reason: dashboardRef.reasons.join(' '),
    };
  }

  const sampleDataRows = dataRows.slice(0, 50);
  let aggregateFormulaCount = 0;
  let summaryKeywordRowCount = 0;
  let pureNumericCellInTopicColCount = 0;
  let totalTextChars = 0;
  let textCellCount = 0;
  let longTextCellCount = 0;

  for (const row of sampleDataRows) {
    let rowHasSummaryWord = false;
    for (let cIdx = 0; cIdx < row.length; cIdx++) {
      const cell = row[cIdx];
      if (!isNonEmptyCell(cell)) continue;

      if (cell.formula && AGGREGATE_FORMULA_REGEX.test(cell.formula)) {
        aggregateFormulaCount++;
      }

      const text = cellText(cell);
      if (text) {
        totalTextChars += text.length;
        textCellCount++;
        if (text.length > 70) {
          longTextCellCount++;
        }
        if (SUMMARY_KEYWORD_REGEX.test(text.trim())) {
          rowHasSummaryWord = true;
        }
      }
    }
    if (rowHasSummaryWord) {
      summaryKeywordRowCount++;
    }
  }

  // Find candidate topic column
  const candidateTopicCol = columns.find((c) => c.semanticRole === 'title') || columns[1] || columns[0];
  if (candidateTopicCol) {
    for (const row of sampleDataRows) {
      const cell = row[candidateTopicCol.colIndex];
      const text = cellText(cell);
      if (text && /^\s*#?\s*\d+(\.\d+)?\s*%?\s*$/.test(text)) {
        pureNumericCellInTopicColCount++;
      }
    }
  }

  const formulaRatio = formulaCellCount / Math.max(1, totalNonEmptyCells);
  const summaryRowRatio = summaryKeywordRowCount / Math.max(1, sampleDataRows.length);
  const numericTopicRatio = pureNumericCellInTopicColCount / Math.max(1, sampleDataRows.length);
  const avgTextLen = textCellCount > 0 ? totalTextChars / textCellCount : 0;
  const longTextRatio = textCellCount > 0 ? longTextCellCount / textCellCount : 0;

  let syllabusHeaderMatches = 0;
  for (const col of columns) {
    if (SYLLABUS_HEADER_REGEX.test(col.headerName)) {
      syllabusHeaderMatches++;
    }
  }
  const hasDoneOrStatus = columns.some(
    (c) => c.semanticRole === 'done' || c.inferredType === 'checkbox' || c.inferredType === 'boolean'
  );

  let keyValueMatchCount = 0;
  if (columns.length >= 2 && columns.length <= 3 && sampleDataRows.length <= 30) {
    for (const row of sampleDataRows) {
      const c0Text = cellText(row[columns[0].colIndex]);
      if (c0Text && (c0Text.endsWith(':') || METADATA_KEY_REGEX.test(c0Text.replace(/:$/, '').trim()))) {
        keyValueMatchCount++;
      }
    }
  }
  const isKeyValueLayout = keyValueMatchCount >= Math.min(3, sampleDataRows.length);

  let syllabusScore = 0;
  let summaryScore = 0;
  let instructionsScore = 0;
  let metadataScore = 0;

  if (syllabusHeaderMatches >= 2) syllabusScore += 0.55;
  else if (syllabusHeaderMatches === 1) syllabusScore += 0.3;
  if (hasDoneOrStatus) syllabusScore += 0.25;
  if (numericTopicRatio < 0.25 && avgTextLen >= 4 && avgTextLen <= 90) syllabusScore += 0.25;
  if (sampleDataRows.length >= 10) syllabusScore += 0.1;
  if (summaryRowRatio > 0.2) syllabusScore -= 0.3;
  if (formulaRatio > 0.3) syllabusScore -= 0.3;
  if (numericTopicRatio > 0.5) syllabusScore -= 0.4;

  if (aggregateFormulaCount > 0) summaryScore += 0.5;
  if (formulaRatio >= 0.25) summaryScore += 0.35;
  if (summaryRowRatio >= 0.15) summaryScore += 0.4;
  if (numericTopicRatio >= 0.4 && sampleDataRows.length > 0) summaryScore += 0.4;
  if (titleMatchesOverview) summaryScore += 0.35;

  if (titleMatchesInstructions) instructionsScore += 0.45;
  if (columns.length <= 2 && avgTextLen > 60) instructionsScore += 0.4;
  if (longTextRatio > 0.3) instructionsScore += 0.35;
  if (syllabusHeaderMatches === 0 && !hasDoneOrStatus) instructionsScore += 0.2;

  if (isKeyValueLayout) metadataScore += 0.7;
  if (/meta|config|info|settings/i.test(normTitle)) metadataScore += 0.3;

  const maxScore = Math.max(syllabusScore, summaryScore, instructionsScore, metadataScore);

  if (metadataScore >= 0.65 && metadataScore >= maxScore) {
    return {
      purpose: 'metadata',
      role: 'overview',
      confidence: 'high',
      confidenceScore: Math.min(1, metadataScore),
      requiresUserClassification: false,
      reason: 'Key-value configuration/metadata layout detected.',
    };
  }

  if (instructionsScore >= 0.65 && instructionsScore >= maxScore) {
    return {
      purpose: 'instructions',
      role: 'overview',
      confidence: 'high',
      confidenceScore: Math.min(1, instructionsScore),
      requiresUserClassification: false,
      reason: 'Informational text / instructions layout with paragraph content detected.',
    };
  }

  if (summaryScore >= 0.6 && summaryScore > syllabusScore) {
    return {
      purpose: 'summary',
      role: 'overview',
      confidence: 'high',
      confidenceScore: Math.min(1, summaryScore),
      requiresUserClassification: false,
      reason: titleMatchesOverview
        ? `Tab purpose identified as summary/overview (detected aggregate formula/count density and name "${normTitle}").`
        : 'Tab structure contains summary rows, aggregate counts, or formula density matching an overview/summary sheet.',
    };
  }

  if (syllabusScore >= 0.6 && syllabusScore > summaryScore) {
    return {
      purpose: 'syllabus',
      role: 'data',
      confidence: 'high',
      confidenceScore: Math.min(1, syllabusScore),
      requiresUserClassification: false,
      reason: 'Structured tabular headers and distinct syllabus concept rows detected.',
    };
  }

  if (titleMatchesOverview && summaryScore >= 0.4) {
    return {
      purpose: 'summary',
      role: 'overview',
      confidence: 'medium',
      confidenceScore: 0.6,
      requiresUserClassification: false,
      reason: `Tab name "${normTitle}" and row layout match an overview/summary sheet.`,
    };
  }

  // Reference / Lookup Sheet Recognition
  let referenceScore = 0;
  if (REFERENCE_KEYWORD_REGEX.test(normTitle)) referenceScore += 0.5;
  if (columns.length >= 2 && columns.length <= 4 && !hasDoneOrStatus && syllabusHeaderMatches === 0) {
    const hasIdOrKey = columns.some((c) => c.semanticRole === 'id' || /code|key|term|abbr|acronym/i.test(c.headerName));
    const hasDesc = columns.some((c) => /desc|definition|meaning|detail/i.test(c.headerName));
    if (hasIdOrKey || hasDesc) referenceScore += 0.4;
  }
  if (referenceScore >= 0.6) {
    return {
      purpose: 'reference',
      role: 'reference',
      confidence: 'high',
      confidenceScore: Math.min(1, referenceScore),
      requiresUserClassification: false,
      reason: 'Reference/lookup or glossary table detected (non-syllabus definition mapping).',
    };
  }

  const isLikelyData = syllabusScore >= summaryScore;
  return {
    purpose: 'uncertain',
    role: isLikelyData ? 'data' : 'overview',
    confidence: 'low',
    confidenceScore: Math.max(0.3, maxScore),
    requiresUserClassification: true,
    reason: `Unconventional tab structure (syllabus score: ${syllabusScore.toFixed(2)}, summary score: ${summaryScore.toFixed(2)}). Please confirm tab purpose before import.`,
  };
}

/**
 * Classifies a single tab (empty / overview / data) and infers its column schema,
 * identity candidates, and view recommendations without mutating source data.
 */
export function detectTabSchema(tab: SheetTabInspectionInput, allKnownTabTitles?: string[]): DetectedTabSchema {
  const rows = tab.rows || [];
  let nonEmptyRowCount = 0;
  let totalNonEmptyCells = 0;
  let formulaCellCount = 0;
  let maxColCount = 0;

  for (const row of rows) {
    let rowHasValue = false;
    if (row.length > maxColCount) maxColCount = row.length;
    for (const cell of row) {
      if (isNonEmptyCell(cell)) {
        rowHasValue = true;
        totalNonEmptyCells++;
        if (cell.formula && cell.formula.trim().length > 0) {
          formulaCellCount++;
        }
      }
    }
    if (rowHasValue) nonEmptyRowCount++;
  }

  // 1. Empty tab detection
  if (nonEmptyRowCount === 0 || totalNonEmptyCells === 0) {
    return {
      sheetId: tab.sheetId,
      sheetTitle: tab.sheetTitle,
      role: 'ignored',
      roleConfidence: 'high',
      roleReason: 'Tab contains no non-empty cells.',
      detectedPurpose: 'empty',
      purposeConfidence: 1.0,
      requiresUserClassification: false,
      headerRowIndex: 0,
      dataStartRow: 1,
      dataEndColumn: 'A',
      columns: [],
      suggestedIdentityStrategy: 'composite_key',
      suggestedIdentityColumns: [],
      suggestedDefaultView: 'table',
      suggestedGroupByFieldKey: null,
      requiresMappingConfirmation: false,
      sampleRowCount: 0,
      formulaCellCount: 0,
      sampleRows: [],
    };
  }

  const formulaRatio = formulaCellCount / Math.max(1, totalNonEmptyCells);
  const isProbStatsSubject = /^prob(ability)?\s*(&|and)?\s*stat(istics|s)?$/i.test(tab.sheetTitle.trim());
  const isOverviewByName = !isProbStatsSubject && OVERVIEW_TAB_NAME_REGEX.test(tab.sheetTitle);

  // Detect header row with candidate ranking
  const headerCandidates = detectHeaderRowCandidates(rows);
  const headerIdx0 = headerCandidates.length > 0 ? headerCandidates[0].rowIndex0 : -1;
  const headerRow = headerIdx0 >= 0 ? rows[headerIdx0] || [] : [];
  const dataRows = headerIdx0 >= 0 ? rows.slice(headerIdx0 + 1).filter((r) => r.some((c) => isNonEmptyCell(c))) : [];

  // Determine active columns (columns that have a header or data in the detected region)
  const activeColIndices: number[] = [];
  const scanCols = Math.max(headerRow.length, maxColCount);
  for (let c = 0; c < scanCols; c++) {
    const hasHeader = isNonEmptyCell(headerRow[c]);
    const hasData = dataRows.some((r) => isNonEmptyCell(r[c]));
    if (hasHeader || hasData) {
      activeColIndices.push(c);
    }
  }

  // Forward-fill merged headers or label sparse header cells
  let lastSeenHeader = '';
  const columns: SheetColumnMapping[] = activeColIndices.map((cIdx) => {
    let headerLabel = cellText(headerRow[cIdx]);
    if (!headerLabel && lastSeenHeader) {
      headerLabel = `${lastSeenHeader} (Part ${colIndexToLetter(cIdx)})`;
    } else if (headerLabel) {
      lastSeenHeader = headerLabel;
    }
    const colCells = dataRows.map((r) => r[cIdx] || { value: null });
    return inferColumnMapping(cIdx, headerLabel, colCells);
  });

  // Extract Dashboard reference info
  const dashboardReference = extractDashboardReferenceData(
    tab.sheetTitle,
    tab.sheetId,
    rows,
    allKnownTabTitles
  );

  // 2. Classify Data vs Overview / Summary / Dashboard / Reference / Metadata / Instructions tab dynamically
  const classification = classifySheetPurpose(
    tab.sheetTitle,
    headerRow,
    dataRows,
    columns,
    formulaCellCount,
    totalNonEmptyCells,
    allKnownTabTitles
  );

  const role: SheetTabRole = classification.role;
  const roleConfidence: SheetConfidence = classification.confidence;
  const roleReason = classification.reason;
  const detectedPurpose = classification.purpose;
  const purposeConfidence = classification.confidenceScore;
  const requiresUserClassification = classification.requiresUserClassification;

  if (
    role === 'overview' ||
    role === 'summary' ||
    role === 'dashboard' ||
    role === 'reference' ||
    role === 'metadata' ||
    role === 'instructions'
  ) {
    // Protect all columns on overview/summary/dashboard/reference/instruction tabs as read-only by default
    for (const col of columns) {
      col.editable = false;
      if (!col.readOnlyReason) {
        col.readOnlyReason = `${classification.purpose} tab defaults to read-only`;
      }
    }
  }

  // Reconcile semantic title column if only group/subgroup/custom text exist
  const hasTitle = columns.some((c) => c.semanticRole === 'title');
  if (!hasTitle && role === 'data') {
    const firstTextCol = columns.find(
      (c) =>
        (c.inferredType === 'text' || c.inferredType === 'long_text') &&
        c.semanticRole !== 'id' &&
        c.semanticRole !== 'notes' &&
        c.semanticRole !== 'group'
    );
    if (firstTextCol) {
      firstTextCol.semanticRole = 'title';
      firstTextCol.confidence = 'medium';
      firstTextCol.requiresConfirmation = true;
    }
  }

  // Suggest identity strategy (non-invasive: column_key if unique ID column exists, else composite_key)
  const idCol = columns.find((c) => c.semanticRole === 'id');
  let suggestedIdentityStrategy: SheetIdentityStrategy = 'composite_key';
  let suggestedIdentityColumns: string[] = [];

  if (idCol) {
    const seen = new Set<string>();
    let allValidAndUnique = dataRows.length > 0;
    for (const row of dataRows) {
      const val = cellText(row[idCol.colIndex]);
      if (!val || seen.has(val)) {
        allValidAndUnique = false;
        break;
      }
      seen.add(val);
    }
    if (allValidAndUnique) {
      suggestedIdentityStrategy = 'column_key';
      suggestedIdentityColumns = [idCol.fieldKey];
    }
  }

  if (suggestedIdentityColumns.length === 0) {
    const keyCandidates = columns.filter(
      (c) =>
        c.semanticRole === 'group' ||
        c.semanticRole === 'subgroup' ||
        c.semanticRole === 'title'
    );
    suggestedIdentityColumns =
      keyCandidates.length > 0
        ? keyCandidates.map((c) => c.fieldKey)
        : columns.slice(0, Math.min(3, columns.length)).map((c) => c.fieldKey);
  }

  // Suggest default UI view
  const hasDoneCol = columns.some(
    (c) => c.semanticRole === 'done' || c.inferredType === 'checkbox' || c.inferredType === 'boolean'
  );
  const groupCol = columns.find((c) => c.semanticRole === 'group');
  const suggestedDefaultView: SheetDefaultView = hasDoneCol
    ? 'checklist'
    : groupCol
    ? 'grouped_list'
    : 'table';

  const lastColIdx = activeColIndices.length > 0 ? activeColIndices[activeColIndices.length - 1] : 0;

  // Build up to 5 sample preview rows keyed by fieldKey
  const sampleRows = dataRows.slice(0, 5).map((r) => {
    const obj: Record<string, SheetCellScalar> = {};
    for (const col of columns) {
      const cell = r[col.colIndex];
      obj[col.fieldKey] = cell ? cell.value : null;
    }
    return obj;
  });

  const requiresMappingConfirmation =
    role === 'data' &&
    (roleConfidence !== 'high' ||
      columns.some((c) => c.requiresConfirmation) ||
      suggestedIdentityStrategy === 'composite_key');

  return {
    sheetId: tab.sheetId,
    sheetTitle: tab.sheetTitle,
    role,
    roleConfidence,
    roleReason,
    detectedPurpose,
    purposeConfidence,
    requiresUserClassification,
    headerRowIndex: headerIdx0 >= 0 ? headerIdx0 + 1 : 0,
    dataStartRow: headerIdx0 >= 0 ? headerIdx0 + 2 : 1,
    dataEndColumn: colIndexToLetter(lastColIdx),
    columns,
    suggestedIdentityStrategy,
    suggestedIdentityColumns,
    suggestedDefaultView,
    suggestedGroupByFieldKey: groupCol ? groupCol.fieldKey : null,
    requiresMappingConfirmation,
    sampleRowCount: dataRows.length,
    formulaCellCount,
    sampleRows,
    headerCandidates,
    ...(dashboardReference.isRecognizedDashboard ||
    role === 'overview' ||
    role === 'summary' ||
    role === 'dashboard'
      ? { dashboardReference }
      : {}),
  };
}

/**
 * Inspects all tabs in a workbook and produces a complete schema detection summary.
 */
export function detectWorkbookSchema(tabs: SheetTabInspectionInput[]): DetectedWorkbookSchema {
  const allKnownTabTitles = tabs.map((t) => t.sheetTitle);
  const detected = tabs.map((tab) => detectTabSchema(tab, allKnownTabTitles));
  const dataTabCount = detected.filter((t) => t.role === 'data').length;
  const overviewTabCount = detected.filter(
    (t) =>
      t.role === 'overview' ||
      t.role === 'summary' ||
      t.role === 'dashboard' ||
      t.role === 'reference'
  ).length;
  const emptyTabCount = detected.filter((t) => t.role === 'ignored').length;

  return {
    tabs: detected,
    dataTabCount,
    overviewTabCount,
    emptyTabCount,
    requiresUserConfirmation: true, // Always require explicit confirmation before import
  };
}
