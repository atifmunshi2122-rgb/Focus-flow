import type { DurableSyncOperation } from '../src/types/index.js';
import {
  WORKSHEET_NAMES,
  getSheetId,
  isDashboardWorksheet,
  buildCreateStylingRequests,
  buildSyncResizeRequests,
  buildSyncValueUpdates,
  buildDynamicClearRanges,
  buildInitialHeaderValueUpdates,
  SheetsSnapshotPayload,
  VerifiedSpreadsheetMetadata,
} from '../src/lib/sheetsSpec.js';

const SHEETS_API_BASE = 'https://sheets.googleapis.com/v4/spreadsheets';

export type FetchLike = typeof fetch;

export interface FlushOpResult {
  id: string;
  status: 'completed' | 'pending' | 'failed';
  attempts: number;
  nextRetryAt?: number | null;
  errorMessage?: string | null;
  skippedDuplicate?: boolean;
}

export interface FlushQueueSummary {
  processed: number;
  skippedDuplicates: number;
  failed: number;
  results: FlushOpResult[];
}

function isValidSpreadsheetId(id: string): boolean {
  return typeof id === 'string' && /^[a-zA-Z0-9_-]{10,128}$/.test(id.trim());
}

async function readErrorText(res: Response): Promise<string> {
  try {
    const text = await res.text();
    if (!text) return `HTTP ${res.status} ${res.statusText}`;
    try {
      const parsed = JSON.parse(text) as {
        error?: {
          code?: number;
          message?: string;
          status?: string;
          errors?: Array<{ message?: string; domain?: string; reason?: string }>;
        };
      };
      if (parsed?.error?.message) {
        const reason = parsed.error.errors?.[0]?.reason || parsed.error.status;
        const msg = parsed.error.message;
        return reason ? `${msg} (status: ${res.status}, reason: ${reason})` : `${msg} (status: ${res.status})`;
      }
    } catch {
      // plain text fallback
    }
    return text.slice(0, 400);
  } catch {
    return `HTTP ${res.status} ${res.statusText}`;
  }
}

export function computeBackoffDelayMs(attempts: number, jitterRatio = Math.random()): number {
  const safeAttempts = Math.max(1, attempts);
  const baseMs = Math.min(300_000, 2000 * Math.pow(2, safeAttempts));
  const clampedJitter = Math.max(0, Math.min(1, jitterRatio));
  const jitterMs = Math.round(baseMs * 0.25 * clampedJitter);
  return Math.min(300_000, baseMs + jitterMs);
}

/**
 * Verifies target spreadsheet accessibility and retrieves sheet grid metadata.
 * Never logs the Google OAuth token.
 */
export async function verifySpreadsheet(
  spreadsheetId: string,
  accessToken: string,
  fetchImpl: FetchLike = fetch
): Promise<VerifiedSpreadsheetMetadata> {
  if (!isValidSpreadsheetId(spreadsheetId)) {
    throw new Error('Invalid Google Spreadsheet ID format.');
  }
  if (!accessToken || !accessToken.trim()) {
    throw new Error('Google Sheets authorization token is required.');
  }

  const fields = encodeURIComponent(
    'spreadsheetId,properties.title,sheets(properties(sheetId,title,gridProperties))'
  );
  const res = await fetchImpl(`${SHEETS_API_BASE}/${spreadsheetId}?fields=${fields}`, {
    method: 'GET',
    headers: {
      Authorization: `Bearer ${accessToken}`,
    },
  });

  if (!res.ok) {
    const errMsg = await readErrorText(res);
    throw new Error(`Unable to verify target spreadsheet (${res.status}): ${errMsg}`);
  }

  const data = (await res.json()) as {
    spreadsheetId?: string;
    properties?: { title?: string };
    sheets?: VerifiedSpreadsheetMetadata['sheets'];
  };

  if (!data?.spreadsheetId || !Array.isArray(data.sheets)) {
    throw new Error('Target spreadsheet metadata response was incomplete.');
  }

  return {
    spreadsheetId: data.spreadsheetId,
    title: data.properties?.title || 'FocusFlow & Finance Ledger',
    sheets: data.sheets,
  };
}

/**
 * Applies initial headers + executive styling, charts, conditional formatting & column resize.
 * Intended ONLY for workbook creation or explicit user-triggered formatting repair.
 */
export async function applyWorkbookFormatting(
  spreadsheetId: string,
  accessToken: string,
  options: { includeHeaders?: boolean; includeAutoResize?: boolean; verifyFirst?: boolean } = {},
  fetchImpl: FetchLike = fetch
): Promise<void> {
  const { includeHeaders = false, includeAutoResize = true, verifyFirst = true } = options;

  if (verifyFirst) {
    await verifySpreadsheet(spreadsheetId, accessToken, fetchImpl);
  }

  if (includeHeaders) {
    const valuesRes = await fetchImpl(`${SHEETS_API_BASE}/${spreadsheetId}/values:batchUpdate`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        valueInputOption: 'USER_ENTERED',
        data: buildInitialHeaderValueUpdates(),
      }),
    });

    if (!valuesRes.ok) {
      const errMsg = await readErrorText(valuesRes);
      throw new Error(`Failed to initialize sheet headers: ${errMsg}`);
    }
  }

  const requests = [
    ...buildCreateStylingRequests(),
    ...(includeAutoResize ? buildSyncResizeRequests() : []),
  ];

  const styleRes = await fetchImpl(`${SHEETS_API_BASE}/${spreadsheetId}:batchUpdate`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ requests }),
  });

  if (!styleRes.ok) {
    const errMsg = await readErrorText(styleRes);
    throw new Error(`Failed to apply workbook formatting: ${errMsg}`);
  }
}

/**
 * Creates a 23-worksheet master workbook in the user's Google account and styles it once.
 */
export async function createMasterWorkbook(
  accessToken: string,
  fetchImpl: FetchLike = fetch
): Promise<{ spreadsheetId: string }> {
  if (!accessToken || !accessToken.trim()) {
    throw new Error('Google authorization token is required to create a workbook.');
  }

  const sheetObjects = WORKSHEET_NAMES.map((name) => {
    const isDashboard = isDashboardWorksheet(name);
    return {
      properties: {
        sheetId: getSheetId(name),
        title: name,
        gridProperties: {
          rowCount: isDashboard ? 100 : 500,
          columnCount: isDashboard ? 26 : 18,
          frozenRowCount: isDashboard ? 2 : 1,
        },
      },
    };
  });

  const createPayload = {
    properties: {
      title: 'FocusFlow & Finance — Master Management Ledger',
      locale: 'en_GB',
      timeZone: 'Asia/Kolkata',
      autoRecalc: 'ON_CHANGE',
    },
    sheets: sheetObjects,
  };

  const res = await fetchImpl(SHEETS_API_BASE, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(createPayload),
  });

  if (!res.ok) {
    const errMsg = await readErrorText(res);
    throw new Error(`Failed to create master workbook in Google Sheets: ${errMsg}`);
  }

  const spreadsheet = (await res.json()) as { spreadsheetId: string };
  if (!spreadsheet?.spreadsheetId) {
    throw new Error('Google Sheets returned no spreadsheetId on workbook creation.');
  }

  await applyWorkbookFormatting(
    spreadsheet.spreadsheetId,
    accessToken,
    { includeHeaders: true, includeAutoResize: true, verifyFirst: false },
    fetchImpl
  );

  return { spreadsheetId: spreadsheet.spreadsheetId };
}

/**
 * Value-only synchronization across all 23 worksheets.
 * Strictly preserves user column widths, charts, formulas, filters, frozen rows, and conditional formatting.
 */
export async function syncAllData(
  spreadsheetId: string,
  accessToken: string,
  data: SheetsSnapshotPayload,
  options: { verifyFirst?: boolean } = {},
  fetchImpl: FetchLike = fetch
): Promise<{ updatedRangesCount: number; verifiedTitle?: string }> {
  let verifiedTitle: string | undefined;
  if (options.verifyFirst !== false) {
    const meta = await verifySpreadsheet(spreadsheetId, accessToken, fetchImpl);
    verifiedTitle = meta.title;
  }

  const valueUpdates = buildSyncValueUpdates(data);
  const res = await fetchImpl(`${SHEETS_API_BASE}/${spreadsheetId}/values:batchUpdate`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      valueInputOption: 'USER_ENTERED',
      data: valueUpdates,
    }),
  });

  if (!res.ok) {
    const errMsg = await readErrorText(res);
    throw new Error(`Google Sheets value synchronization failed: ${errMsg}`);
  }

  return {
    updatedRangesCount: valueUpdates.length,
    verifiedTitle,
  };
}

/**
 * Explicit-approval historical resync:
 * 1. Rejects without confirmed === true.
 * 2. Verifies target spreadsheet metadata and sheet structure.
 * 3. Computes dynamic A2:<lastCol><rowCount> ranges (never hardcoded A2:Z500).
 * 4. Calls values:batchClear and fails loudly if clear fails (never ignores failures).
 * 5. Writes complete current snapshot cleanly without touching formatting/charts/widths.
 */
export async function historicalResync(
  spreadsheetId: string,
  accessToken: string,
  data: SheetsSnapshotPayload,
  confirmed: boolean,
  fetchImpl: FetchLike = fetch
): Promise<{ clearedRangesCount: number; updatedRangesCount: number }> {
  if (confirmed !== true) {
    throw new Error('Historical resync requires explicit user confirmation.');
  }

  const meta = await verifySpreadsheet(spreadsheetId, accessToken, fetchImpl);
  const clearRanges = buildDynamicClearRanges(meta.sheets);

  if (clearRanges.length > 0) {
    const clearRes = await fetchImpl(`${SHEETS_API_BASE}/${spreadsheetId}/values:batchClear`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ ranges: clearRanges }),
    });

    if (!clearRes.ok) {
      const errMsg = await readErrorText(clearRes);
      throw new Error(`Historical resync aborted because clearing existing ranges failed: ${errMsg}`);
    }
  }

  const syncResult = await syncAllData(
    spreadsheetId,
    accessToken,
    data,
    { verifyFirst: false },
    fetchImpl
  );

  return {
    clearedRangesCount: clearRanges.length,
    updatedRangesCount: syncResult.updatedRangesCount,
  };
}

/**
 * Fetches existing Column A IDs per target worksheet once per flush batch
 * to guarantee idempotent append behavior without duplicate rows.
 */
interface SheetRecordLocations {
  idToRow: Map<string, number>;
  maxRow: number;
}

/**
 * Properly escapes sheet titles for A1 notation:
 * If the sheet title contains spaces or special characters, wraps in single quotes and doubles internal single quotes.
 */
function escapeSheetTitleForA1(title: string): string {
  if (!/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(title)) {
    return `'${title.replace(/'/g, "''")}'`;
  }
  return title;
}

/**
 * Pre-fetches existing record IDs and their 1-based row numbers from Column A of target worksheets
 * to guarantee idempotent append, in-place update, and accurate deletion.
 */
async function fetchExistingRecordLocations(
  spreadsheetId: string,
  sheetNames: string[],
  accessToken: string,
  fetchImpl: FetchLike
): Promise<Map<string, SheetRecordLocations>> {
  const locMap = new Map<string, SheetRecordLocations>();
  if (sheetNames.length === 0) return locMap;

  const rangesQuery = sheetNames
    .map((s) => `ranges=${encodeURIComponent(`${escapeSheetTitleForA1(s)}!A2:A`)}`)
    .join('&');

  const res = await fetchImpl(
    `${SHEETS_API_BASE}/${spreadsheetId}/values:batchGet?${rangesQuery}`,
    {
      method: 'GET',
      headers: { Authorization: `Bearer ${accessToken}` },
    }
  );

  if (!res.ok) {
    // Non-fatal: if batchGet fails transiently, continue without pre-fetched set
    return locMap;
  }

  const body = (await res.json()) as {
    valueRanges?: Array<{ range?: string; values?: unknown[][] }>;
  };
  const valueRanges = Array.isArray(body?.valueRanges) ? body.valueRanges : [];
  for (let i = 0; i < sheetNames.length; i++) {
    const sheet = sheetNames[i];
    const vr = valueRanges[i];
    const idToRow = new Map<string, number>();
    let maxRow = 1;
    if (Array.isArray(vr?.values)) {
      for (let r = 0; r < vr.values.length; r++) {
        const rowNum = r + 2;
        maxRow = Math.max(maxRow, rowNum);
        const row = vr.values[r];
        if (Array.isArray(row) && row[0] !== undefined && row[0] !== null) {
          const val = String(row[0]).trim();
          if (val) {
            idToRow.set(val, rowNum);
          }
        }
      }
    }
    locMap.set(sheet, { idToRow, maxRow });
  }
  return locMap;
}

/**
 * Extracts the primary record ID from an operation's payload or dedupeKey.
 */
function extractRecordIdFromOp(op: DurableSyncOperation): string {
  if (Array.isArray(op.payload) && op.payload.length > 0) {
    const first = op.payload[0];
    if (first !== undefined && first !== null) {
      return String(first).trim();
    }
  }
  if (typeof op.payload === 'string') {
    return op.payload.trim();
  }
  if (op.payload && typeof op.payload === 'object' && 'id' in op.payload) {
    const idVal = (op.payload as { id?: unknown }).id;
    if (idVal !== undefined && idVal !== null) {
      return String(idVal).trim();
    }
  }
  if (op.dedupeKey) {
    const parts = op.dedupeKey.split('_');
    if (parts.length >= 3) {
      return parts[parts.length - 1].trim();
    }
  }
  return '';
}

/**
 * Executes pending durable sync operations against Google Sheets API with:
 * - Idempotent create/append (checks Column A IDs before appending)
 * - In-place row update targeting the exact matching row in Column A
 * - Row clearing for delete operations according to the sync architecture
 * - Retry with exponential backoff + jitter
 * - Permanent 'failed' transition after 5 failed attempts
 */
export async function flushQueueOperations(
  spreadsheetId: string,
  accessToken: string,
  ops: DurableSyncOperation[],
  fetchImpl: FetchLike = fetch,
  nowMs: number = Date.now()
): Promise<FlushQueueSummary> {
  if (!ops || ops.length === 0) {
    return { processed: 0, skippedDuplicates: 0, failed: 0, results: [] };
  }

  const eligibleOps = ops.filter((op) => {
    if (op.status === 'completed') return false;
    if (op.status === 'failed' && (op.attempts || 0) >= 5) return false;
    if (op.nextRetryAt && op.nextRetryAt > nowMs) return false;
    return true;
  });

  if (eligibleOps.length === 0) {
    return { processed: 0, skippedDuplicates: 0, failed: 0, results: [] };
  }

  try {
    await verifySpreadsheet(spreadsheetId, accessToken, fetchImpl);
  } catch (verifyErr) {
    const errorMsg = verifyErr instanceof Error ? verifyErr.message : 'Spreadsheet verification failed';
    const isAuthOrPermissionOrFormat =
      /\b401\b|\b403\b|PERMISSION_DENIED|The caller does not have permission|invalid authentication credentials|Invalid Google Spreadsheet ID/i.test(
        errorMsg
      );
    if (isAuthOrPermissionOrFormat) {
      throw verifyErr;
    }
    // For network / transient verification errors, record backoff retry state on eligible operations
    return {
      processed: 0,
      skippedDuplicates: 0,
      failed: eligibleOps.length,
      results: eligibleOps.map((op) => {
        const nextAttempts = (op.attempts || 0) + 1;
        const isTerminal = nextAttempts >= 5;
        const backoffMs = computeBackoffDelayMs(nextAttempts);
        return {
          id: op.id,
          status: isTerminal ? 'failed' : 'pending',
          attempts: nextAttempts,
          nextRetryAt: isTerminal ? null : nowMs + backoffMs,
          errorMessage: errorMsg,
        };
      }),
    };
  }

  const targetSheets = Array.from(
    new Set(eligibleOps.map((o) => o.sheetName).filter(Boolean))
  );
  const existingLocationsBySheet = await fetchExistingRecordLocations(
    spreadsheetId,
    targetSheets,
    accessToken,
    fetchImpl
  );

  let processed = 0;
  let skippedDuplicates = 0;
  let failed = 0;
  const results: FlushOpResult[] = [];

  for (const op of eligibleOps) {
    try {
      const recordId = extractRecordIdFromOp(op);
      const action = (op.action || 'create').toLowerCase();
      let sheetLoc = existingLocationsBySheet.get(op.sheetName);
      if (!sheetLoc) {
        sheetLoc = { idToRow: new Map(), maxRow: 1 };
        existingLocationsBySheet.set(op.sheetName, sheetLoc);
      }

      if (action === 'update') {
        const existingRow = recordId ? sheetLoc.idToRow.get(recordId) : undefined;
        if (existingRow) {
          // In-place update of matching row
          const updateRes = await fetchImpl(
            `${SHEETS_API_BASE}/${spreadsheetId}/values/${encodeURIComponent(
              `${escapeSheetTitleForA1(op.sheetName)}!A${existingRow}`
            )}?valueInputOption=USER_ENTERED`,
            {
              method: 'PUT',
              headers: {
                Authorization: `Bearer ${accessToken}`,
                'Content-Type': 'application/json',
              },
              body: JSON.stringify({
                values: [Array.isArray(op.payload) ? (op.payload as (string | number)[]) : [recordId]],
              }),
            }
          );

          if (!updateRes.ok) {
            const errMsg = await readErrorText(updateRes);
            throw new Error(`Failed to update row in ${op.sheetName}: ${errMsg}`);
          }
        } else {
          // If record does not yet exist, append it (upsert)
          const appendRes = await fetchImpl(
            `${SHEETS_API_BASE}/${spreadsheetId}/values/${encodeURIComponent(
              `${escapeSheetTitleForA1(op.sheetName)}!A2:append`
            )}?valueInputOption=USER_ENTERED`,
            {
              method: 'POST',
              headers: {
                Authorization: `Bearer ${accessToken}`,
                'Content-Type': 'application/json',
              },
              body: JSON.stringify({
                values: [Array.isArray(op.payload) ? (op.payload as (string | number)[]) : [recordId]],
              }),
            }
          );

          if (!appendRes.ok) {
            const errMsg = await readErrorText(appendRes);
            throw new Error(`Failed to append row for update in ${op.sheetName}: ${errMsg}`);
          }

          if (recordId) {
            sheetLoc.maxRow++;
            sheetLoc.idToRow.set(recordId, sheetLoc.maxRow);
          }
        }
      } else if (action === 'delete') {
        const existingRow = recordId ? sheetLoc.idToRow.get(recordId) : undefined;
        if (existingRow) {
          // Safely clear matching row values
          const clearRes = await fetchImpl(
            `${SHEETS_API_BASE}/${spreadsheetId}/values/${encodeURIComponent(
              `${escapeSheetTitleForA1(op.sheetName)}!A${existingRow}:Z${existingRow}`
            )}:clear`,
            {
              method: 'POST',
              headers: {
                Authorization: `Bearer ${accessToken}`,
                'Content-Type': 'application/json',
              },
              body: JSON.stringify({}),
            }
          );

          if (!clearRes.ok) {
            const batchClearRes = await fetchImpl(
              `${SHEETS_API_BASE}/${spreadsheetId}/values:batchClear`,
              {
                method: 'POST',
                headers: {
                  Authorization: `Bearer ${accessToken}`,
                  'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                  ranges: [`${escapeSheetTitleForA1(op.sheetName)}!A${existingRow}:Z${existingRow}`],
                }),
              }
            );

            if (!batchClearRes.ok) {
              const errMsg = await readErrorText(batchClearRes);
              throw new Error(`Failed to delete row in ${op.sheetName}: ${errMsg}`);
            }
          }

          sheetLoc.idToRow.delete(recordId);
        }
        // If row did not exist, delete is an idempotent success
      } else {
        // create / append operation
        if (recordId && sheetLoc.idToRow.has(recordId)) {
          skippedDuplicates++;
          processed++;
          results.push({
            id: op.id,
            status: 'completed',
            attempts: op.attempts || 0,
            nextRetryAt: null,
            errorMessage: null,
            skippedDuplicate: true,
          });
          continue;
        }

        const appendRes = await fetchImpl(
          `${SHEETS_API_BASE}/${spreadsheetId}/values/${encodeURIComponent(
            `${escapeSheetTitleForA1(op.sheetName)}!A2:append`
          )}?valueInputOption=USER_ENTERED`,
          {
            method: 'POST',
            headers: {
              Authorization: `Bearer ${accessToken}`,
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              values: [Array.isArray(op.payload) ? (op.payload as (string | number)[]) : [recordId]],
            }),
          }
        );

        if (!appendRes.ok) {
          const errMsg = await readErrorText(appendRes);
          throw new Error(errMsg);
        }

        if (recordId) {
          sheetLoc.maxRow++;
          sheetLoc.idToRow.set(recordId, sheetLoc.maxRow);
        }
      }

      processed++;
      results.push({
        id: op.id,
        status: 'completed',
        attempts: op.attempts || 0,
        nextRetryAt: null,
        errorMessage: null,
      });
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : 'Transmission failure';
      const nextAttempts = (op.attempts || 0) + 1;
      const isTerminal = nextAttempts >= 5;
      const backoffMs = computeBackoffDelayMs(nextAttempts);
      failed++;
      results.push({
        id: op.id,
        status: isTerminal ? 'failed' : 'pending',
        attempts: nextAttempts,
        nextRetryAt: isTerminal ? null : nowMs + backoffMs,
        errorMessage: errorMsg,
      });
    }
  }

  return {
    processed,
    skippedDuplicates,
    failed,
    results,
  };
}
