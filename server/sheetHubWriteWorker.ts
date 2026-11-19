/**
 * Universal Sheet Sync Hub — Stateless Google Sheets API v4 Cell Writeback Worker
 *
 * Kept strictly separate from `server/universalSheetsWorker.ts` so the read-only
 * inspection & pull pipeline maintains zero write/POST paths while explicit,
 * user-confirmed checkbox/cell updates use least-privilege `values:batchUpdate`.
 */

import type { SheetCellScalar, SheetHubCellUpdateRequest, SheetHubPushCellsResponse } from '../src/types/sheetHub.ts';
import { isValidGoogleSpreadsheetId } from '../src/lib/sheetHub/urlParser.ts';
import { SheetHubWorkerError, type FetchLike } from './universalSheetsWorker.ts';

const SHEETS_API_BASE = 'https://sheets.googleapis.com/v4/spreadsheets';
const MAX_CELL_UPDATES_PER_BATCH = 500;
const MAX_ROW_NUMBER = 1_000_000;
const A1_COL_PATTERN = /^[A-Z]{1,3}$/;

export interface SheetHubPushCellsInput {
  spreadsheetId: string;
  updates: SheetHubCellUpdateRequest[];
}

export function escapeSheetTitleForA1(title: string): string {
  const escaped = title.replace(/'/g, "''");
  return `'${escaped}'`;
}

function normalizeCellWriteValue(value: SheetCellScalar): string | number | boolean {
  if (value === null || value === undefined) return '';
  if (typeof value === 'boolean') return value;
  if (typeof value === 'number') {
    return Number.isFinite(value) ? value : '';
  }
  return String(value);
}

function parseGoogleErrorMessage(rawText: string, status: number): string {
  if (!rawText) return `Google Sheets API write error (${status})`;
  try {
    const parsed = JSON.parse(rawText) as { error?: { message?: string; status?: string } };
    if (parsed?.error?.message) {
      return parsed.error.message;
    }
  } catch {
    // Non-JSON response body
  }
  return rawText.slice(0, 300);
}

export async function pushSheetHubCellUpdates(
  input: SheetHubPushCellsInput,
  accessToken: string,
  fetchImpl: FetchLike = fetch
): Promise<SheetHubPushCellsResponse> {
  const token = (accessToken || '').trim();
  if (!token) {
    throw new SheetHubWorkerError(
      'Google Sheets edit authorization is required before pushing changes.',
      401,
      'SHEETS_AUTH_REQUIRED'
    );
  }

  const spreadsheetId = (input.spreadsheetId || '').trim();
  if (!isValidGoogleSpreadsheetId(spreadsheetId)) {
    throw new SheetHubWorkerError(
      'Invalid Google Spreadsheet ID.',
      400,
      'INVALID_SPREADSHEET_ID'
    );
  }

  if (!Array.isArray(input.updates) || input.updates.length === 0) {
    throw new SheetHubWorkerError(
      'At least one cell update is required.',
      400,
      'INVALID_PUSH_REQUEST'
    );
  }

  if (input.updates.length > MAX_CELL_UPDATES_PER_BATCH) {
    throw new SheetHubWorkerError(
      `Too many cell updates in a single batch (max ${MAX_CELL_UPDATES_PER_BATCH}).`,
      400,
      'INVALID_PUSH_REQUEST'
    );
  }

  // Validate and deduplicate by exact A1 target (last update wins)
  const dedupedRanges = new Map<string, { range: string; value: string | number | boolean }>();

  for (const item of input.updates) {
    const sheetTitle = typeof item?.sheetTitle === 'string' ? item.sheetTitle.trim() : '';
    if (!sheetTitle) {
      throw new SheetHubWorkerError(
        'Each cell update must specify a valid sheetTitle.',
        400,
        'INVALID_PUSH_REQUEST'
      );
    }

    const rowNumber = Number(item?.rowNumber);
    if (!Number.isInteger(rowNumber) || rowNumber < 1 || rowNumber > MAX_ROW_NUMBER) {
      throw new SheetHubWorkerError(
        `Invalid sheet row number "${String(item?.rowNumber)}" for tab "${sheetTitle}".`,
        400,
        'INVALID_PUSH_REQUEST'
      );
    }

    const colLetter = typeof item?.colLetter === 'string' ? item.colLetter.trim().toUpperCase() : '';
    if (!A1_COL_PATTERN.test(colLetter)) {
      throw new SheetHubWorkerError(
        `Invalid A1 column letter "${String(item?.colLetter)}" for tab "${sheetTitle}".`,
        400,
        'INVALID_PUSH_REQUEST'
      );
    }

    const rawVal = item.value;
    if (
      rawVal !== null &&
      rawVal !== undefined &&
      typeof rawVal !== 'string' &&
      typeof rawVal !== 'number' &&
      typeof rawVal !== 'boolean'
    ) {
      throw new SheetHubWorkerError(
        `Unsupported cell value type for ${sheetTitle}!${colLetter}${rowNumber}.`,
        400,
        'INVALID_PUSH_REQUEST'
      );
    }

    const range = `${escapeSheetTitleForA1(sheetTitle)}!${colLetter}${rowNumber}`;
    dedupedRanges.set(range, {
      range,
      value: normalizeCellWriteValue(rawVal ?? null),
    });
  }

  const dataPayload = Array.from(dedupedRanges.values()).map((entry) => ({
    range: entry.range,
    majorDimension: 'ROWS',
    values: [[entry.value]],
  }));

  const url = `${SHEETS_API_BASE}/${encodeURIComponent(spreadsheetId)}/values:batchUpdate`;
  const response = await fetchImpl(url, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      valueInputOption: 'USER_ENTERED',
      includeValuesInResponse: false,
      data: dataPayload,
    }),
  });

  if (!response.ok) {
    const rawText = await response.text().catch(() => '');
    const googleMsg = parseGoogleErrorMessage(rawText, response.status);

    if (response.status === 401) {
      throw new SheetHubWorkerError(
        'Google OAuth session expired. Please re-authorize Google Sheets edit access and retry.',
        401,
        'SHEETS_AUTH_REQUIRED'
      );
    }

    if (response.status === 403) {
      throw new SheetHubWorkerError(
        `Google Sheets write permission denied. Ensure you approved edit access and have Editor permissions on this spreadsheet. (${googleMsg})`,
        403,
        'SHEETS_WRITE_PERMISSION_DENIED'
      );
    }

    if (response.status === 404) {
      throw new SheetHubWorkerError(
        'Google Spreadsheet not found or no longer accessible.',
        404,
        'SPREADSHEET_NOT_FOUND'
      );
    }

    if (response.status === 429) {
      throw new SheetHubWorkerError(
        'Google Sheets API rate limit reached. Your change is saved locally — retry pushing in a few seconds.',
        429,
        'SHEETS_RATE_LIMITED'
      );
    }

    throw new SheetHubWorkerError(
      `Failed to update Google Sheet: ${googleMsg}`,
      response.status >= 400 && response.status < 600 ? response.status : 502,
      'SHEETS_WRITE_FAILED'
    );
  }

  const resultJson = (await response.json().catch(() => ({}))) as {
    totalUpdatedCells?: number;
    totalUpdatedSheets?: number;
    responses?: unknown[];
  };

  return {
    spreadsheetId,
    updatedCells:
      typeof resultJson.totalUpdatedCells === 'number'
        ? resultJson.totalUpdatedCells
        : dataPayload.length,
    updatedRangeCount: Array.isArray(resultJson.responses)
      ? resultJson.responses.length
      : dataPayload.length,
    pushedAt: new Date().toISOString(),
  };
}
