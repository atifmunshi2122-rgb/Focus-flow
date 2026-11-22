/**
 * Universal Sheet Sync Hub — Stateless Backend Google Sheets API v4 Worker (Phase 1 Read-Only)
 *
 * Implements:
 * - inspectSpreadsheet: validates ID, discovers tabs & numeric sheetIds, fetches bounded preview grid
 *   with cell metadata/validations/formats/formulas, and returns dynamic schema detection results.
 * - pullSpreadsheetTabs: reads selected tabs via values:batchGet (UNFORMATTED_VALUE + FORMULA)
 *   to preserve booleans/dates while flagging computed formula cells as read-only.
 *
 * Security:
 * - Zero Firebase Admin credentials.
 * - Zero OAuth token logging or persistence.
 * - Rejects missing/expired Google OAuth tokens strictly (never falls back unauthenticated).
 */

import type {
  SheetCellScalar,
  SheetInspectCellMeta,
  SheetInspectResponse,
  SheetPullResponse,
  SheetPullTabRequest,
  SheetPullTabResult,
  SheetTabInspectionInput,
} from '../src/types/sheetHub.ts';
import {
  isValidGoogleSpreadsheetId,
  parseGoogleSheetUrl,
} from '../src/lib/sheetHub/urlParser.ts';
import { detectWorkbookSchema } from '../src/lib/sheetHub/schemaDetector.ts';
import { isZipBuffer, parseXlsxBuffer } from './localXlsxParser.ts';

const SHEETS_API_BASE = 'https://sheets.googleapis.com/v4/spreadsheets';
const PUBLIC_EXPORT_BASE = 'https://docs.google.com/spreadsheets/d';
const MAX_INSPECT_TABS = 25;
const MAX_PULL_TABS = 25;
const DEFAULT_PREVIEW_ROWS = 50;
const MAX_PREVIEW_ROWS = 100;

export type FetchLike = typeof fetch;

export class SheetHubWorkerError extends Error {
  public readonly status: number;
  public readonly code: string;
  public readonly details?: Record<string, unknown>;

  constructor(message: string, status = 502, code = 'SHEETS_UPSTREAM_ERROR', details?: Record<string, unknown>) {
    super(message);
    this.name = 'SheetHubWorkerError';
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

interface GoogleExtendedValue {
  numberValue?: number;
  stringValue?: string;
  boolValue?: boolean;
  formulaValue?: string;
  errorValue?: { type?: string; message?: string };
}

interface GoogleCellData {
  userEnteredValue?: GoogleExtendedValue;
  effectiveValue?: GoogleExtendedValue;
  formattedValue?: string;
  userEnteredFormat?: {
    numberFormat?: { type?: string; pattern?: string };
  };
  dataValidation?: {
    condition?: {
      type?: string;
      values?: Array<{ userEnteredValue?: string }>;
    };
  };
}

interface GoogleSheetProperties {
  sheetId?: number;
  title?: string;
  sheetType?: string;
  gridProperties?: {
    rowCount?: number;
    columnCount?: number;
  };
}

interface GoogleSheetObject {
  properties?: GoogleSheetProperties;
  data?: Array<{
    rowData?: Array<{
      values?: GoogleCellData[];
    }>;
  }>;
}

interface GoogleSpreadsheetResponse {
  spreadsheetId?: string;
  properties?: { title?: string };
  sheets?: GoogleSheetObject[];
}

interface GoogleBatchGetResponse {
  spreadsheetId?: string;
  valueRanges?: Array<{
    range?: string;
    values?: unknown[][];
  }>;
}

function escapeSheetTitleForA1(title: string): string {
  const escaped = title.replace(/'/g, "''");
  return `'${escaped}'`;
}

export interface GoogleApiErrorDetail {
  status: number;
  message: string;
  reason?: string;
  domain?: string;
  rawText?: string;
}

export async function parseGoogleApiError(res: Response): Promise<GoogleApiErrorDetail> {
  const status = res.status;
  try {
    const text = await res.text();
    if (!text) return { status, message: `HTTP ${status} ${res.statusText}` };
    try {
      const parsed = JSON.parse(text) as {
        error?: {
          code?: number;
          message?: string;
          status?: string;
          errors?: Array<{ message?: string; domain?: string; reason?: string }>;
        };
      };
      if (parsed?.error) {
        const msg = parsed.error.message || `HTTP ${status} ${res.statusText}`;
        const firstErr = parsed.error.errors?.[0];
        const reason = firstErr?.reason || parsed.error.status;
        const domain = firstErr?.domain;
        return {
          status,
          message: msg,
          reason,
          domain,
          rawText: text.slice(0, 400),
        };
      }
    } catch {
      // plain text fallback
    }
    return { status, message: text.slice(0, 400), rawText: text.slice(0, 400) };
  } catch {
    return { status, message: `HTTP ${status} ${res.statusText}` };
  }
}

async function readGoogleError(res: Response): Promise<GoogleApiErrorDetail> {
  return parseGoogleApiError(res);
}

function mapGoogleHttpError(
  status: number,
  errorDetail: GoogleApiErrorDetail | string,
  context: string
): SheetHubWorkerError {
  const message = typeof errorDetail === 'string' ? errorDetail : errorDetail.message;
  const reason = typeof errorDetail === 'object' ? errorDetail.reason : undefined;

  if (
    status === 401 ||
    /\b401\b|UNAUTHENTICATED|invalid authentication credentials|Invalid Credentials|insufficient authentication scopes/i.test(
      message
    )
  ) {
    return new SheetHubWorkerError(
      `Google Sheets authorization expired or missing (${context}): ${message}`,
      401,
      'SHEETS_AUTH_REQUIRED',
      { status, reason, context, originalMessage: message }
    );
  }
  if (status === 403) {
    const reasonDetail = reason ? ` (Reason: ${reason})` : '';
    return new SheetHubWorkerError(
      `Access denied to Google Spreadsheet (${context}): ${message}${reasonDetail}. Verify that your authorized Google account has permission to view this spreadsheet and that Google Sheets API access is granted.`,
      403,
      'SHEETS_PERMISSION_DENIED',
      { status, reason, context, originalMessage: message }
    );
  }
  if (status === 404) {
    return new SheetHubWorkerError(
      `Google Spreadsheet not found or inaccessible (${context}): ${message}. Verify the spreadsheet URL or ID. For private spreadsheets, use "Browse My Google Drive" to select the file.`,
      404,
      'SPREADSHEET_NOT_FOUND',
      { status, reason, context, originalMessage: message }
    );
  }
  if (status === 429) {
    return new SheetHubWorkerError(
      `Google Sheets API rate limit reached (${context}): ${message}. Please retry shortly.`,
      429,
      'SHEETS_RATE_LIMITED',
      { status, reason, context, originalMessage: message }
    );
  }
  return new SheetHubWorkerError(
    `Google Sheets API error (${context}, HTTP ${status}): ${message}`,
    status >= 400 && status < 500 ? status : 502,
    'SHEETS_UPSTREAM_ERROR',
    { status, reason, context, originalMessage: message }
  );
}

function convertGoogleCellToMeta(cell: GoogleCellData | undefined): SheetInspectCellMeta {
  if (!cell) {
    return { value: null };
  }

  const eff = cell.effectiveValue;
  const entered = cell.userEnteredValue;
  const formula = typeof entered?.formulaValue === 'string' ? entered.formulaValue : null;

  let value: SheetCellScalar = null;
  let isBooleanCell = false;

  if (eff) {
    if (typeof eff.boolValue === 'boolean') {
      value = eff.boolValue;
      isBooleanCell = true;
    } else if (typeof eff.numberValue === 'number' && Number.isFinite(eff.numberValue)) {
      value = eff.numberValue;
    } else if (typeof eff.stringValue === 'string') {
      value = eff.stringValue;
    }
  } else if (entered) {
    if (typeof entered.boolValue === 'boolean') {
      value = entered.boolValue;
      isBooleanCell = true;
    } else if (typeof entered.numberValue === 'number' && Number.isFinite(entered.numberValue)) {
      value = entered.numberValue;
    } else if (typeof entered.stringValue === 'string') {
      value = entered.stringValue;
    }
  }

  const dvCondition = cell.dataValidation?.condition;
  const dataValidationType = typeof dvCondition?.type === 'string' ? dvCondition.type : null;
  const dataValidationValues = Array.isArray(dvCondition?.values)
    ? dvCondition.values
        .map((v) => (typeof v?.userEnteredValue === 'string' ? v.userEnteredValue : ''))
        .filter(Boolean)
    : undefined;

  const numberFormatType = cell.userEnteredFormat?.numberFormat?.type || null;

  return {
    value,
    formattedValue: typeof cell.formattedValue === 'string' ? cell.formattedValue : null,
    formula,
    numberFormatType,
    dataValidationType,
    ...(dataValidationValues && dataValidationValues.length > 0 ? { dataValidationValues } : {}),
    isBooleanCell: isBooleanCell || dataValidationType === 'BOOLEAN',
  };
}

function normalizeBatchScalar(raw: unknown): SheetCellScalar {
  if (raw === null || raw === undefined) return null;
  if (typeof raw === 'boolean') return raw;
  if (typeof raw === 'number') return Number.isFinite(raw) ? raw : null;
  if (typeof raw === 'string') return raw;
  return String(raw);
}

function resolveSpreadsheetIdInput(input: {
  spreadsheetId?: string;
  spreadsheetUrl?: string;
}): { spreadsheetId: string; canonicalUrl: string } {
  if (typeof input.spreadsheetUrl === 'string' && input.spreadsheetUrl.trim()) {
    const parsed = parseGoogleSheetUrl(input.spreadsheetUrl);
    if (!parsed.ok) {
      throw new SheetHubWorkerError(parsed.error, 400, parsed.code);
    }
    return {
      spreadsheetId: parsed.spreadsheetId,
      canonicalUrl: parsed.canonicalUrl,
    };
  }

  const rawId = typeof input.spreadsheetId === 'string' ? input.spreadsheetId.trim() : '';
  if (!isValidGoogleSpreadsheetId(rawId)) {
    throw new SheetHubWorkerError(
      'A valid Google Spreadsheet ID or Google Sheets URL is required.',
      400,
      'INVALID_SPREADSHEET_ID'
    );
  }
  return {
    spreadsheetId: rawId,
    canonicalUrl: `https://docs.google.com/spreadsheets/d/${rawId}/edit`,
  };
}

/**
 * Phase 1 Read-Only Inspect:
 * Discovers spreadsheet title, all tabs & numeric sheetIds, fetches bounded preview grid
 * with Google Sheets metadata (validations, formats, formulas), and runs dynamic schema detection.
 */
export async function inspectSpreadsheet(
  input: {
    spreadsheetId?: string;
    spreadsheetUrl?: string;
    previewRows?: number;
  },
  accessToken: string,
  fetchImpl: FetchLike = fetch
): Promise<SheetInspectResponse> {
  if (!accessToken || !accessToken.trim()) {
    throw new SheetHubWorkerError(
      'Google Sheets authorization token is required.',
      401,
      'SHEETS_AUTH_REQUIRED'
    );
  }

  const { spreadsheetId, canonicalUrl } = resolveSpreadsheetIdInput(input);
  const previewRows = Math.max(
    10,
    Math.min(MAX_PREVIEW_ROWS, Math.floor(input.previewRows || DEFAULT_PREVIEW_ROWS))
  );

  // Step 1: Discover workbook title and sheet metadata
  const metaFields = encodeURIComponent(
    'spreadsheetId,properties.title,sheets(properties(sheetId,title,sheetType,gridProperties))'
  );
  const metaRes = await fetchImpl(`${SHEETS_API_BASE}/${spreadsheetId}?fields=${metaFields}`, {
    method: 'GET',
    headers: {
      Authorization: `Bearer ${accessToken}`,
    },
  });

  if (!metaRes.ok) {
    const errMsg = await readGoogleError(metaRes);
    throw mapGoogleHttpError(metaRes.status, errMsg, 'inspect metadata');
  }

  let metaJson: GoogleSpreadsheetResponse;
  try {
    metaJson = (await metaRes.json()) as GoogleSpreadsheetResponse;
  } catch {
    throw new SheetHubWorkerError(
      'Malformed JSON response while reading spreadsheet metadata.',
      502,
      'MALFORMED_SHEETS_RESPONSE'
    );
  }

  if (!metaJson || typeof metaJson !== 'object' || !Array.isArray(metaJson.sheets)) {
    throw new SheetHubWorkerError(
      'Spreadsheet metadata response was missing the sheets array.',
      502,
      'MALFORMED_SHEETS_RESPONSE'
    );
  }

  const title = metaJson.properties?.title || 'Untitled Spreadsheet';
  const gridSheets = metaJson.sheets
    .filter((s) => s?.properties && typeof s.properties.title === 'string' && typeof s.properties.sheetId === 'number')
    .filter((s) => !s.properties?.sheetType || s.properties.sheetType === 'GRID')
    .slice(0, MAX_INSPECT_TABS);

  if (gridSheets.length === 0) {
    return {
      spreadsheetId,
      title,
      canonicalUrl,
      tabs: [],
      summary: {
        totalTabs: 0,
        dataTabs: 0,
        overviewTabs: 0,
        emptyTabs: 0,
        requiresUserConfirmation: true,
      },
      inspectedAt: new Date().toISOString(),
    };
  }

  // Step 2: Fetch bounded preview grid WITH cell metadata (validations, numberFormat, formulas)
  const rangeQuery = gridSheets
    .map((s) => {
      const tabTitle = s.properties!.title!;
      const maxCols = Math.min(26, Math.max(1, s.properties?.gridProperties?.columnCount || 26));
      const endColLetter = String.fromCharCode(64 + maxCols);
      const maxRows = Math.min(previewRows, Math.max(1, s.properties?.gridProperties?.rowCount || previewRows));
      return `ranges=${encodeURIComponent(`${escapeSheetTitleForA1(tabTitle)}!A1:${endColLetter}${maxRows}`)}`;
    })
    .join('&');

  const gridFields = encodeURIComponent(
    'spreadsheetId,sheets(properties(sheetId,title,gridProperties),data.rowData.values(userEnteredValue,effectiveValue,formattedValue,userEnteredFormat.numberFormat,dataValidation))'
  );

  const gridRes = await fetchImpl(
    `${SHEETS_API_BASE}/${spreadsheetId}?includeGridData=true&${rangeQuery}&fields=${gridFields}`,
    {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    }
  );

  if (!gridRes.ok) {
    const errMsg = await readGoogleError(gridRes);
    throw mapGoogleHttpError(gridRes.status, errMsg, 'inspect grid preview');
  }

  let gridJson: GoogleSpreadsheetResponse;
  try {
    gridJson = (await gridRes.json()) as GoogleSpreadsheetResponse;
  } catch {
    throw new SheetHubWorkerError(
      'Malformed JSON response while reading spreadsheet preview grid.',
      502,
      'MALFORMED_SHEETS_RESPONSE'
    );
  }

  if (!gridJson || !Array.isArray(gridJson.sheets)) {
    throw new SheetHubWorkerError(
      'Spreadsheet grid response was malformed.',
      502,
      'MALFORMED_SHEETS_RESPONSE'
    );
  }

  const inspectionInputs: SheetTabInspectionInput[] = gridJson.sheets.map((sheetObj, idx) => {
    const props = sheetObj.properties || gridSheets[idx]?.properties || {};
    const rowData = sheetObj.data?.[0]?.rowData || [];
    const parsedRows: SheetInspectCellMeta[][] = rowData.map((r) =>
      (r.values || []).map((cell) => convertGoogleCellToMeta(cell))
    );
    return {
      sheetId: typeof props.sheetId === 'number' ? props.sheetId : idx,
      sheetTitle: typeof props.title === 'string' ? props.title : `Sheet ${idx + 1}`,
      rowCount: props.gridProperties?.rowCount,
      columnCount: props.gridProperties?.columnCount,
      rows: parsedRows,
    };
  });

  const workbookSchema = detectWorkbookSchema(inspectionInputs);

  return {
    spreadsheetId,
    title,
    canonicalUrl,
    tabs: workbookSchema.tabs,
    summary: {
      totalTabs: workbookSchema.tabs.length,
      dataTabs: workbookSchema.dataTabCount,
      overviewTabs: workbookSchema.overviewTabCount,
      emptyTabs: workbookSchema.emptyTabCount,
      requiresUserConfirmation: workbookSchema.requiresUserConfirmation,
    },
    inspectedAt: new Date().toISOString(),
  };
}

/**
 * Phase 1 Read-Only Pull:
 * Reads selected tabs/ranges using Google Sheets values:batchGet (UNFORMATTED_VALUE + FORMULA)
 * so booleans and dates are preserved and formula cells are flagged read-only.
 */
export async function pullSpreadsheetTabs(
  input: {
    spreadsheetId: string;
    tabs: SheetPullTabRequest[];
  },
  accessToken: string,
  fetchImpl: FetchLike = fetch
): Promise<SheetPullResponse> {
  if (!accessToken || !accessToken.trim()) {
    throw new SheetHubWorkerError(
      'Google Sheets authorization token is required.',
      401,
      'SHEETS_AUTH_REQUIRED'
    );
  }

  const { spreadsheetId } = resolveSpreadsheetIdInput({ spreadsheetId: input.spreadsheetId });

  if (!Array.isArray(input.tabs) || input.tabs.length === 0) {
    throw new SheetHubWorkerError(
      'At least one tab must be specified to pull data.',
      400,
      'INVALID_PULL_REQUEST'
    );
  }

  const requestedTabs = input.tabs.slice(0, MAX_PULL_TABS);
  for (const tab of requestedTabs) {
    if (!tab || typeof tab.sheetTitle !== 'string' || !tab.sheetTitle.trim()) {
      throw new SheetHubWorkerError(
        'Each tab entry must include a non-empty sheetTitle.',
        400,
        'INVALID_PULL_REQUEST'
      );
    }
  }

  // Fetch workbook metadata (title + sheetId map)
  const metaFields = encodeURIComponent('spreadsheetId,properties.title,sheets(properties(sheetId,title))');
  const metaRes = await fetchImpl(`${SHEETS_API_BASE}/${spreadsheetId}?fields=${metaFields}`, {
    method: 'GET',
    headers: {
      Authorization: `Bearer ${accessToken}`,
    },
  });

  if (!metaRes.ok) {
    const errMsg = await readGoogleError(metaRes);
    throw mapGoogleHttpError(metaRes.status, errMsg, 'pull metadata');
  }

  let metaJson: GoogleSpreadsheetResponse;
  try {
    metaJson = (await metaRes.json()) as GoogleSpreadsheetResponse;
  } catch {
    throw new SheetHubWorkerError(
      'Malformed JSON response while reading spreadsheet metadata for pull.',
      502,
      'MALFORMED_SHEETS_RESPONSE'
    );
  }

  if (!metaJson || !Array.isArray(metaJson.sheets)) {
    throw new SheetHubWorkerError(
      'Spreadsheet metadata response was missing sheets.',
      502,
      'MALFORMED_SHEETS_RESPONSE'
    );
  }

  const sheetIdByTitle = new Map<string, number>();
  for (const sh of metaJson.sheets) {
    if (typeof sh.properties?.title === 'string' && typeof sh.properties.sheetId === 'number') {
      sheetIdByTitle.set(sh.properties.title, sh.properties.sheetId);
    }
  }

  const a1Ranges = requestedTabs.map((t) =>
    t.range && t.range.trim()
      ? t.range.trim()
      : `${escapeSheetTitleForA1(t.sheetTitle.trim())}!A1:Z1000`
  );
  const rangesParam = a1Ranges.map((r) => `ranges=${encodeURIComponent(r)}`).join('&');

  // Batch fetch both UNFORMATTED_VALUE (real booleans & numbers, formatted dates) and FORMULA (formula detection)
  const [valuesRes, formulasRes] = await Promise.all([
    fetchImpl(
      `${SHEETS_API_BASE}/${spreadsheetId}/values:batchGet?${rangesParam}&valueRenderOption=UNFORMATTED_VALUE&dateTimeRenderOption=FORMATTED_STRING`,
      {
        method: 'GET',
        headers: { Authorization: `Bearer ${accessToken}` },
      }
    ),
    fetchImpl(
      `${SHEETS_API_BASE}/${spreadsheetId}/values:batchGet?${rangesParam}&valueRenderOption=FORMULA`,
      {
        method: 'GET',
        headers: { Authorization: `Bearer ${accessToken}` },
      }
    ),
  ]);

  if (!valuesRes.ok) {
    const errMsg = await readGoogleError(valuesRes);
    throw mapGoogleHttpError(valuesRes.status, errMsg, 'pull values');
  }
  if (!formulasRes.ok) {
    const errMsg = await readGoogleError(formulasRes);
    throw mapGoogleHttpError(formulasRes.status, errMsg, 'pull formulas');
  }

  let valuesJson: GoogleBatchGetResponse;
  let formulasJson: GoogleBatchGetResponse;
  try {
    valuesJson = (await valuesRes.json()) as GoogleBatchGetResponse;
    formulasJson = (await formulasRes.json()) as GoogleBatchGetResponse;
  } catch {
    throw new SheetHubWorkerError(
      'Malformed JSON response from Google Sheets values:batchGet.',
      502,
      'MALFORMED_SHEETS_RESPONSE'
    );
  }

  if (!Array.isArray(valuesJson?.valueRanges) || !Array.isArray(formulasJson?.valueRanges)) {
    throw new SheetHubWorkerError(
      'Google Sheets values:batchGet response was missing valueRanges.',
      502,
      'MALFORMED_SHEETS_RESPONSE'
    );
  }

  const tabs: SheetPullTabResult[] = requestedTabs.map((reqTab, idx) => {
    const valRange = valuesJson.valueRanges?.[idx];
    const formRange = formulasJson.valueRanges?.[idx];
    const rawValues = Array.isArray(valRange?.values) ? valRange.values : [];
    const rawFormulas = Array.isArray(formRange?.values) ? formRange.values : [];

    const headerRowIndex = Math.max(1, Math.floor(reqTab.headerRowIndex || 1));
    const headerRow0 = headerRowIndex - 1;
    const rawHeaders = Array.isArray(rawValues[headerRow0]) ? rawValues[headerRow0] : [];
    const headers = rawHeaders.map((h) => (h === null || h === undefined ? '' : String(h).trim()));

    const formulaColCounts = new Map<number, number>();
    const normalizedRows: SheetPullTabResult['rows'] = [];

    for (let r = headerRow0 + 1; r < rawValues.length; r++) {
      const rowVals = Array.isArray(rawValues[r]) ? rawValues[r] : [];
      const rowForms = Array.isArray(rawFormulas[r]) ? rawFormulas[r] : [];
      const colLen = Math.max(headers.length, rowVals.length, rowForms.length);

      const scalars: SheetCellScalar[] = [];
      const formulaCols: number[] = [];
      let hasAnyValue = false;

      for (let c = 0; c < colLen; c++) {
        const val = normalizeBatchScalar(rowVals[c]);
        const formRaw = rowForms[c];
        const isFormula = typeof formRaw === 'string' && formRaw.trim().startsWith('=');
        if (isFormula) {
          formulaCols.push(c);
          formulaColCounts.set(c, (formulaColCounts.get(c) || 0) + 1);
        }
        if (val !== null && (typeof val !== 'string' || val.trim() !== '')) {
          hasAnyValue = true;
        }
        scalars.push(val);
      }

      if (hasAnyValue || formulaCols.length > 0) {
        normalizedRows.push({
          sheetRowNumber: r + 1,
          values: scalars,
          formulaColumns: formulaCols,
        });
      }
    }

    const formulaColumnIndices = Array.from(formulaColCounts.entries())
      .filter(([, count]) => count > 0)
      .map(([colIdx]) => colIdx)
      .sort((a, b) => a - b);

    return {
      sheetTitle: reqTab.sheetTitle.trim(),
      sheetId: sheetIdByTitle.get(reqTab.sheetTitle.trim()) ?? reqTab.sheetId ?? null,
      range: valRange?.range || a1Ranges[idx],
      headers,
      headerRowIndex,
      rows: normalizedRows,
      formulaColumnIndices,
      totalRows: normalizedRows.length,
    };
  });

  return {
    spreadsheetId,
    title: metaJson.properties?.title || 'Untitled Spreadsheet',
    tabs,
    pulledAt: new Date().toISOString(),
  };
}

function extractTitleFromContentDisposition(header: string | null): string {
  if (!header) return 'Public Google Spreadsheet';
  const utf8Match = header.match(/filename\*\s*=\s*UTF-8''([^;]+)/i);
  if (utf8Match?.[1]) {
    try {
      const decoded = decodeURIComponent(utf8Match[1].trim().replace(/^["']|["']$/g, ''));
      return decoded.replace(/\.xlsx$/i, '').trim() || 'Public Google Spreadsheet';
    } catch {
      // fall through
    }
  }
  const basicMatch = header.match(/filename\s*=\s*"([^"]+)"|filename\s*=\s*([^;]+)/i);
  const rawName = (basicMatch?.[1] || basicMatch?.[2] || '').trim().replace(/^["']|["']$/g, '');
  return rawName.replace(/\.xlsx$/i, '').trim() || 'Public Google Spreadsheet';
}

async function fetchPublicSpreadsheetXlsx(
  spreadsheetId: string,
  fetchImpl: FetchLike = fetch
): Promise<{ title: string; tabs: SheetTabInspectionInput[] }> {
  const exportUrl = `${PUBLIC_EXPORT_BASE}/${encodeURIComponent(spreadsheetId)}/export?format=xlsx`;
  const res = await fetchImpl(exportUrl, {
    method: 'GET',
    redirect: 'follow',
    headers: {
      Accept: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/octet-stream,*/*',
    },
  });

  if (res.status === 404) {
    throw new SheetHubWorkerError(
      'Google Spreadsheet not found. Verify the spreadsheet URL or ID.',
      404,
      'SPREADSHEET_NOT_FOUND'
    );
  }

  if (res.status === 401 || res.status === 403) {
    throw new SheetHubWorkerError(
      'This Google Spreadsheet is private or restricted. Either change sharing to "Anyone with the link (Viewer)" or authorize with Google.',
      403,
      'SHEET_PRIVATE_AUTH_REQUIRED'
    );
  }

  if (!res.ok) {
    const errMsg = await readGoogleError(res);
    throw new SheetHubWorkerError(
      `Unable to read public spreadsheet (HTTP ${res.status}): ${errMsg}`,
      res.status >= 400 && res.status < 500 ? res.status : 502,
      'SHEETS_UPSTREAM_ERROR'
    );
  }

  const contentType = (res.headers.get('content-type') || '').toLowerCase();
  const arrayBuf = await res.arrayBuffer();
  const buffer = Buffer.from(arrayBuf);

  if (contentType.includes('text/html') || !isZipBuffer(buffer)) {
    throw new SheetHubWorkerError(
      'This Google Spreadsheet requires sign-in (it is not shared publicly). Set sharing to "Anyone with the link → Viewer" to import without sign-in, or click Authorize with Google.',
      403,
      'SHEET_PRIVATE_AUTH_REQUIRED'
    );
  }

  let parsedTabs: SheetTabInspectionInput[];
  try {
    parsedTabs = parseXlsxBuffer(buffer);
  } catch (err) {
    throw new SheetHubWorkerError(
      `Failed to parse exported spreadsheet workbook: ${err instanceof Error ? err.message : String(err)}`,
      502,
      'MALFORMED_SHEETS_RESPONSE'
    );
  }

  const title = extractTitleFromContentDisposition(res.headers.get('content-disposition'));
  return { title, tabs: parsedTabs.slice(0, MAX_INSPECT_TABS) };
}

/**
 * Zero-OAuth Public Link Inspect:
 * Reads spreadsheets shared as "Anyone with the link can view" via OpenXML export,
 * detects private login redirects cleanly, and runs the exact same schema detector.
 */
export async function inspectPublicSpreadsheet(
  input: {
    spreadsheetId?: string;
    spreadsheetUrl?: string;
    previewRows?: number;
  },
  fetchImpl: FetchLike = fetch
): Promise<SheetInspectResponse> {
  const { spreadsheetId, canonicalUrl } = resolveSpreadsheetIdInput(input);
  const previewRows = Math.max(
    10,
    Math.min(MAX_PREVIEW_ROWS, Math.floor(input.previewRows || DEFAULT_PREVIEW_ROWS))
  );

  const { title, tabs: rawTabs } = await fetchPublicSpreadsheetXlsx(spreadsheetId, fetchImpl);
  const boundedInputs: SheetTabInspectionInput[] = rawTabs.map((tab) => ({
    sheetId: tab.sheetId,
    sheetTitle: tab.sheetTitle,
    rowCount: tab.rows.length,
    columnCount: tab.rows.reduce((max, r) => Math.max(max, r.length), 0),
    rows: tab.rows.slice(0, previewRows),
  }));

  const workbookSchema = detectWorkbookSchema(boundedInputs);

  return {
    spreadsheetId,
    title,
    canonicalUrl,
    tabs: workbookSchema.tabs,
    summary: {
      totalTabs: workbookSchema.tabs.length,
      dataTabs: workbookSchema.dataTabCount,
      overviewTabs: workbookSchema.overviewTabCount,
      emptyTabs: workbookSchema.emptyTabCount,
      requiresUserConfirmation: workbookSchema.requiresUserConfirmation,
    },
    inspectedAt: new Date().toISOString(),
  };
}

/**
 * Zero-OAuth Public Link Pull:
 * Pulls full rows from selected tabs of a publicly viewable Google Spreadsheet.
 */
export async function pullPublicSpreadsheetTabs(
  input: {
    spreadsheetId: string;
    tabs: SheetPullTabRequest[];
  },
  fetchImpl: FetchLike = fetch
): Promise<SheetPullResponse> {
  const { spreadsheetId } = resolveSpreadsheetIdInput({ spreadsheetId: input.spreadsheetId });

  if (!Array.isArray(input.tabs) || input.tabs.length === 0) {
    throw new SheetHubWorkerError(
      'At least one tab must be specified to pull data.',
      400,
      'INVALID_PULL_REQUEST'
    );
  }

  const requestedTabs = input.tabs.slice(0, MAX_PULL_TABS);
  const { title, tabs: parsedTabs } = await fetchPublicSpreadsheetXlsx(spreadsheetId, fetchImpl);
  const detectedSchema = detectWorkbookSchema(
    parsedTabs.map((t) => ({ ...t, rows: t.rows.slice(0, DEFAULT_PREVIEW_ROWS) }))
  );

  const pulledTabs: SheetPullTabResult[] = requestedTabs.map((reqTab) => {
    const normalizedReqTitle = (reqTab.sheetTitle || '').trim().toLowerCase();
    const matchedTab =
      parsedTabs.find((pt) => pt.sheetTitle.trim().toLowerCase() === normalizedReqTitle) ||
      (typeof reqTab.sheetId === 'number'
        ? parsedTabs.find((pt) => pt.sheetId === reqTab.sheetId)
        : undefined);

    if (!matchedTab) {
      return {
        sheetTitle: reqTab.sheetTitle.trim(),
        sheetId: reqTab.sheetId ?? null,
        range: `${escapeSheetTitleForA1(reqTab.sheetTitle.trim())}!A1:Z1000`,
        headers: [],
        headerRowIndex: reqTab.headerRowIndex || 1,
        rows: [],
        formulaColumnIndices: [],
        totalRows: 0,
      };
    }

    const detectedTab = detectedSchema.tabs.find((dt) => dt.sheetId === matchedTab.sheetId);
    const headerRowIndex = Math.max(1, Math.floor(reqTab.headerRowIndex || detectedTab?.headerRowIndex || 1));
    const headerRow0 = headerRowIndex - 1;
    const headerCells = matchedTab.rows[headerRow0] || [];
    const headers = headerCells.map((cell) =>
      cell?.value === null || cell?.value === undefined ? '' : String(cell.value).trim()
    );

    const formulaColCounts = new Map<number, number>();
    const normalizedRows: SheetPullTabResult['rows'] = [];

    for (let r = headerRow0 + 1; r < matchedTab.rows.length; r++) {
      const cellRow = matchedTab.rows[r] || [];
      const colLen = Math.max(headers.length, cellRow.length);
      const scalars: SheetCellScalar[] = [];
      const formulaCols: number[] = [];
      let hasAnyValue = false;

      for (let c = 0; c < colLen; c++) {
        const cell = cellRow[c];
        const val = normalizeBatchScalar(cell?.value ?? null);
        if (cell?.formula) {
          formulaCols.push(c);
          formulaColCounts.set(c, (formulaColCounts.get(c) || 0) + 1);
        }
        if (val !== null && (typeof val !== 'string' || val.trim() !== '')) {
          hasAnyValue = true;
        }
        scalars.push(val);
      }

      if (hasAnyValue || formulaCols.length > 0) {
        normalizedRows.push({
          sheetRowNumber: r + 1,
          values: scalars,
          formulaColumns: formulaCols,
        });
      }
    }

    const formulaColumnIndices = Array.from(formulaColCounts.entries())
      .filter(([, count]) => count > 0)
      .map(([colIdx]) => colIdx)
      .sort((a, b) => a - b);

    return {
      sheetTitle: matchedTab.sheetTitle,
      sheetId: matchedTab.sheetId,
      range: `${escapeSheetTitleForA1(matchedTab.sheetTitle)}!A1:Z${Math.max(1, matchedTab.rows.length)}`,
      headers,
      headerRowIndex,
      rows: normalizedRows,
      formulaColumnIndices,
      totalRows: normalizedRows.length,
    };
  });

  return {
    spreadsheetId,
    title,
    tabs: pulledTabs,
    pulledAt: new Date().toISOString(),
  };
}

