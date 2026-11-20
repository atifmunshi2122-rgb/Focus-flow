/**
 * Universal Sheet Sync Hub — Server-Side Google Apps Script Write-Back Bridge Worker
 *
 * Implements authenticated server-to-Apps-Script Web App communication:
 * 1. Generates HMAC-SHA256 signatures over canonical JSON payload.
 * 2. Enforces strict server-side spreadsheet allowlisting (protecting production sheets).
 * 3. Keeps the shared secret exclusively on the server (never exposed to client).
 * 4. Dispatches cell write-back requests to Apps Script Web App endpoints.
 */

import crypto from 'node:crypto';
import { isValidGoogleSpreadsheetId } from '../src/lib/sheetHub/urlParser.ts';

export interface AppsScriptCellUpdate {
  spreadsheetId: string;
  sheetTitle: string;
  rowNumber: number;
  colLetter: string;
  value: boolean | string | number;
  expectedIdentity?: {
    module?: string;
    topic?: string;
    subtopic?: string;
  };
}

export interface AppsScriptBridgeResponse {
  success: boolean;
  updatedCell: string;
  value: boolean | string | number;
  updatedAt: string;
  correctedRowNumber?: number;
  bridgeMode: 'apps_script';
}

export class AppsScriptBridgeError extends Error {
  public status: number;
  public code: string;

  constructor(message: string, status = 500, code = 'APPS_SCRIPT_ERROR') {
    super(message);
    this.name = 'AppsScriptBridgeError';
    this.status = status;
    this.code = code;
  }
}

/**
 * Produces a deterministic canonical JSON string:
 * - Omits any existing 'signature' key.
 * - Sorts all keys in lexicographical order.
 * - Stringifies without arbitrary formatting.
 */
export function toCanonicalJson(data: Record<string, unknown>): string {
  const keys = Object.keys(data)
    .filter((k) => k !== 'signature')
    .sort();
  const sorted: Record<string, unknown> = {};
  for (const k of keys) {
    sorted[k] = data[k];
  }
  return JSON.stringify(sorted);
}

/**
 * Computes HMAC-SHA256 hex digest matching Apps Script Utilities.computeHmacSha256Signature.
 */
export function computeAppsScriptHmac(canonicalString: string, secret: string): string {
  return crypto.createHmac('sha256', secret).update(canonicalString, 'utf8').digest('hex');
}

/**
 * Allowlist verification.
 * Strictly limits write-back to the dedicated test spreadsheet and explicitly configured IDs.
 */
export const KNOWN_TEST_SPREADSHEETS = new Set<string>([
  'FocusFlow Writeback Test',
  'sem3-syllabus-sample',
  'test_sheet_123',
  '1BxiMVs0XRA5nFMdKvBdBZjgmUUqptlbs74OgvE2upms', // Public test fixture ID
]);

export function isSpreadsheetAllowlisted(spreadsheetId: string, customAllowlist?: string[]): boolean {
  if (!spreadsheetId) return false;
  const trimmed = spreadsheetId.trim();

  // 1. Check known test spreadsheet identifiers
  if (KNOWN_TEST_SPREADSHEETS.has(trimmed)) return true;

  // 2. Check environment variable allowlist
  const envAllowlist = (process.env.APPS_SCRIPT_ALLOWLISTED_SPREADSHEETS || '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);

  const combined = new Set([...envAllowlist, ...(customAllowlist || [])]);
  return combined.has(trimmed);
}

export interface DispatchOptions {
  webAppUrl?: string;
  secret?: string;
  fetchImpl?: typeof fetch;
  allowedSpreadsheets?: string[];
}

/**
 * Dispatches an authenticated cell write to the Google Apps Script Web App.
 */
export async function dispatchAppsScriptWriteback(
  update: AppsScriptCellUpdate,
  options: DispatchOptions = {}
): Promise<AppsScriptBridgeResponse> {
  const spreadsheetId = (update.spreadsheetId || '').trim();
  const sheetTitle = (update.sheetTitle || '').trim();
  const rowNumber = Number(update.rowNumber);
  const colLetter = (update.colLetter || '').trim().toUpperCase();
  const value = update.value;

  // 1. Validation
  if (!spreadsheetId) {
    throw new AppsScriptBridgeError('spreadsheetId is required.', 400, 'INVALID_SPREADSHEET_ID');
  }

  if (!isSpreadsheetAllowlisted(spreadsheetId, options.allowedSpreadsheets)) {
    throw new AppsScriptBridgeError(
      `Spreadsheet "${spreadsheetId}" is not allowlisted for Apps Script write-back. Only the dedicated test spreadsheet is permitted.`,
      403,
      'SPREADSHEET_NOT_ALLOWLISTED'
    );
  }

  if (!sheetTitle) {
    throw new AppsScriptBridgeError('sheetTitle is required.', 400, 'INVALID_SHEET_TITLE');
  }

  if (!Number.isInteger(rowNumber) || rowNumber < 1) {
    throw new AppsScriptBridgeError(`Invalid rowNumber: ${rowNumber}. Must be a positive integer.`, 400, 'INVALID_ROW_NUMBER');
  }

  if (!/^[A-Z]{1,3}$/.test(colLetter)) {
    throw new AppsScriptBridgeError(`Invalid colLetter: ${colLetter}. Must be valid column letters (e.g. A-Z).`, 400, 'INVALID_COL_LETTER');
  }

  // 2. Secret and URL retrieval
  const secret = options.secret || process.env.APPS_SCRIPT_WEBHOOK_SECRET;
  if (!secret) {
    throw new AppsScriptBridgeError(
      'APPS_SCRIPT_WEBHOOK_SECRET is not configured on the server. Please add it to your server environment configuration.',
      503,
      'APPS_SCRIPT_NOT_CONFIGURED'
    );
  }

  const webAppUrl = options.webAppUrl || process.env.APPS_SCRIPT_WEBAPP_URL;
  if (!webAppUrl) {
    throw new AppsScriptBridgeError(
      'APPS_SCRIPT_WEBAPP_URL is not configured on the server. Please deploy Code.gs and set APPS_SCRIPT_WEBAPP_URL.',
      503,
      'APPS_SCRIPT_NOT_CONFIGURED'
    );
  }

  // 3. Construct Canonical Payload with Timestamp and Nonce
  const timestamp = Date.now();
  const nonce = crypto.randomBytes(12).toString('hex');

  const payloadData: Record<string, unknown> = {
    action: 'write_cell',
    colLetter,
    nonce,
    rowNumber,
    sheetTitle,
    spreadsheetId,
    timestamp,
    value,
  };

  if (update.expectedIdentity) {
    payloadData.expectedIdentity = update.expectedIdentity;
  }

  const canonicalJson = toCanonicalJson(payloadData);
  const signature = computeAppsScriptHmac(canonicalJson, secret);

  const requestBody = JSON.stringify({
    ...payloadData,
    signature,
  });

  // 4. HTTP POST to Apps Script Web App
  const fetcher = options.fetchImpl || fetch;
  let response: Response;

  try {
    response = await fetcher(webAppUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-FocusFlow-Signature': signature,
        'X-FocusFlow-Timestamp': String(timestamp),
      },
      body: requestBody,
      redirect: 'follow',
    });
  } catch (netErr) {
    throw new AppsScriptBridgeError(
      `Network failure connecting to Apps Script Web App: ${netErr instanceof Error ? netErr.message : String(netErr)}`,
      502,
      'APPS_SCRIPT_NETWORK_ERROR'
    );
  }

  const responseText = await response.text();
  let result: any = null;

  try {
    result = JSON.parse(responseText);
  } catch {
    throw new AppsScriptBridgeError(
      `Apps Script Web App returned non-JSON response (${response.status}): ${responseText.slice(0, 300)}`,
      502,
      'APPS_SCRIPT_INVALID_RESPONSE'
    );
  }

  if (!response.ok || !result.success) {
    const errorMsg = result?.error || `Apps Script write failed with HTTP status ${response.status}`;
    const errorCode = result?.code || 'APPS_SCRIPT_REJECTED';

    let effectiveStatus = 500;
    if (typeof result?.statusCode === 'number' && result.statusCode >= 400 && result.statusCode < 600) {
      effectiveStatus = result.statusCode;
    } else if (response.status >= 400) {
      effectiveStatus = response.status;
    } else {
      switch (errorCode) {
        case 'INVALID_SIGNATURE':
        case 'MISSING_SIGNATURE':
          effectiveStatus = 401;
          break;
        case 'NONCE_REPLAY':
          effectiveStatus = 403;
          break;
        case 'SPREADSHEET_NOT_FOUND':
        case 'SHEET_NOT_FOUND':
        case 'ROW_NOT_FOUND':
          effectiveStatus = 404;
          break;
        case 'DUPLICATE_ROW_IDENTITY':
          effectiveStatus = 409;
          break;
        case 'INVALID_COORDINATES':
        case 'UNSUPPORTED_ACTION':
        case 'TIMESTAMP_OUT_OF_BOUNDS':
        case 'MALFORMED_JSON':
        case 'EMPTY_BODY':
          effectiveStatus = 400;
          break;
        case 'SECRET_NOT_CONFIGURED':
          effectiveStatus = 503;
          break;
        default:
          effectiveStatus = 500;
          break;
      }
    }

    throw new AppsScriptBridgeError(errorMsg, effectiveStatus, errorCode);
  }

  return {
    success: true,
    updatedCell: result.updatedCell || `${sheetTitle}!${colLetter}${rowNumber}`,
    value: result.value !== undefined ? result.value : value,
    updatedAt: result.updatedAt || new Date().toISOString(),
    correctedRowNumber: result.correctedRowNumber,
    bridgeMode: 'apps_script',
  };
}

