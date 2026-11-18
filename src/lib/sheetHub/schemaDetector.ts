/**
 * Universal Sheet Sync Hub — Dynamic Schema Detector
 * Reusable, zero-hardcoded-schema inference engine for arbitrary multi-tab spreadsheets.
 * Prioritizes native Google Sheets cell metadata (formulas, validations, number formats, booleans)
 * and uses header keywords and value patterns strictly as supplementary signals.
 */

import type {
  DetectedTabSchema,
  DetectedWorkbookSchema,
  SheetCellScalar,
  SheetColumnMapping,
  SheetConfidence,
  SheetDefaultView,
  SheetFieldType,
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
  /\b(overview|summary|dashboard|kpi|readme|guide|index|home|instructions)\b/i;

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

interface HeaderCandidate {
  rowIndex0: number;
  score: number;
  nonEmptyCount: number;
}

/**
 * Scans the top rows (up to 10) to locate the most probable header row.
 * Handles title banners above tables, merged header intros, and standard row-1 tables.
 */
export function detectHeaderRowIndex(rows: SheetInspectCellMeta[][]): number {
  const maxScan = Math.min(rows.length, 10);
  let best: HeaderCandidate | null = null;

  for (let r = 0; r < maxScan; r++) {
    const row = rows[r] || [];
    const nonEmptyCells = row.filter((c) => isNonEmptyCell(c));
    if (nonEmptyCells.length === 0) continue;

    // A single wide banner cell in row 1 when subsequent rows have multiple columns is likely a title, not headers
    const texts = nonEmptyCells.map((c) => cellText(c));
    const distinctTexts = new Set(texts.map((t) => t.toLowerCase()));
    const stringLikeCount = nonEmptyCells.filter(
      (c) =>
        !c.formula &&
        !c.isBooleanCell &&
        typeof c.value === 'string' &&
        c.value.trim().length > 0 &&
        c.value.trim().length <= 64
    ).length;
    const formulaCount = nonEmptyCells.filter((c) => Boolean(c.formula)).length;
    const avgLen =
      texts.reduce((sum, t) => sum + t.length, 0) / Math.max(1, texts.length);

    // Check if the row immediately below has tabular data
    const nextRow = rows[r + 1] || [];
    const nextNonEmpty = nextRow.filter((c) => isNonEmptyCell(c)).length;

    let score = 0;
    score += nonEmptyCells.length * 3;
    score += stringLikeCount * 2.5;
    score += distinctTexts.size === nonEmptyCells.length ? 4 : -3;
    score -= formulaCount * 6;
    if (avgLen > 50) score -= 8;
    if (nonEmptyCells.length === 1 && rows.length > r + 1) score -= 12;
    if (nextNonEmpty >= Math.max(2, Math.floor(nonEmptyCells.length * 0.5))) score += 5;
    // Slight preference for earlier rows when scores tie
    score -= r * 0.4;

    if (!best || score > best.score) {
      best = { rowIndex0: r, score, nonEmptyCount: nonEmptyCells.length };
    }
  }

  return best ? best.rowIndex0 : -1;
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
    ...(enumOptions && enumOptions.length > 0 ? { enumOptions } : {}),
  };
}

/**
 * Classifies a single tab (empty / overview / data) and infers its column schema,
 * identity candidates, and view recommendations without mutating source data.
 */
export function detectTabSchema(tab: SheetTabInspectionInput): DetectedTabSchema {
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
  const isOverviewByName = OVERVIEW_TAB_NAME_REGEX.test(tab.sheetTitle);

  // Detect header row
  const headerIdx0 = detectHeaderRowIndex(rows);
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

  const columns: SheetColumnMapping[] = activeColIndices.map((cIdx) => {
    const headerLabel = cellText(headerRow[cIdx]);
    const colCells = dataRows.map((r) => r[cIdx] || { value: null });
    return inferColumnMapping(cIdx, headerLabel, colCells);
  });

  // 2. Classify Data vs Overview / Summary tab
  let role: SheetTabRole = 'data';
  let roleConfidence: SheetConfidence = 'high';
  let roleReason = 'Structured tabular headers and data rows detected.';

  const formulaColumnsCount = columns.filter((c) => c.inferredType === 'formula').length;
  const headerNotAtTop = headerIdx0 >= 2;

  if (
    formulaRatio >= 0.25 ||
    (isOverviewByName && (formulaCellCount >= 3 || headerNotAtTop)) ||
    (columns.length > 0 && formulaColumnsCount / columns.length >= 0.4 && isOverviewByName)
  ) {
    role = 'overview';
    roleConfidence = formulaRatio >= 0.25 || (isOverviewByName && formulaCellCount > 0) ? 'high' : 'medium';
    roleReason =
      formulaCellCount > 0
        ? `Summary/overview tab with ${formulaCellCount} formula cell(s) (${Math.round(formulaRatio * 100)}% of non-empty cells). Marked read-only by default.`
        : 'Tab name and non-uniform block structure match an overview/summary layout.';
    // Protect all columns on overview tabs as read-only by default
    for (const col of columns) {
      col.editable = false;
      if (!col.readOnlyReason) {
        col.readOnlyReason = 'Overview/summary tab defaults to read-only';
      }
    }
  } else if (dataRows.length === 0) {
    role = 'ignored';
    roleConfidence = 'medium';
    roleReason = 'Only header row found without data rows yet.';
  } else if (isOverviewByName && dataRows.length < 15 && formulaCellCount > 0) {
    role = 'overview';
    roleConfidence = 'medium';
    roleReason = 'Tab title and formula presence suggest an overview/summary view; please confirm if tabular.';
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
  };
}

/**
 * Inspects all tabs in a workbook and produces a complete schema detection summary.
 */
export function detectWorkbookSchema(tabs: SheetTabInspectionInput[]): DetectedWorkbookSchema {
  const detected = tabs.map((tab) => detectTabSchema(tab));
  const dataTabCount = detected.filter((t) => t.role === 'data').length;
  const overviewTabCount = detected.filter((t) => t.role === 'overview').length;
  const emptyTabCount = detected.filter((t) => t.role === 'ignored').length;

  return {
    tabs: detected,
    dataTabCount,
    overviewTabCount,
    emptyTabCount,
    requiresUserConfirmation: true, // Always require explicit confirmation before import
  };
}
