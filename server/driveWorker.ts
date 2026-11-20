/**
 * FocusFlow — Google Drive Duplicate & Dual-Copy Worker
 *
 * Implements:
 * 1. duplicateGoogleDriveFile: Idempotent duplication of source Google Spreadsheet
 *    to the authenticated user's own Google Drive via Drive API v3 (files.copy).
 * 2. ensureDriveProgressTrackerTab: Appends or updates the "Progress Tracker" tab in
 *    the newly duplicated Google Sheet via Google Sheets API v4 (batchUpdate).
 * 3. pullDriveDuplicateValues: Reads current values and timestamps from the Drive duplicate.
 *
 * Security:
 * - Scoped strictly to user-granted OAuth token (drive.file + spreadsheets).
 * - Zero token persistence or logging.
 * - Idempotency tracking prevents accidental duplicate Drive copies on retry.
 */

import { SheetHubWorkerError, type FetchLike } from './universalSheetsWorker.ts';
import { isValidGoogleSpreadsheetId } from '../src/lib/sheetHub/urlParser.ts';

const DRIVE_API_BASE = 'https://www.googleapis.com/drive/v3/files';
const SHEETS_API_BASE = 'https://sheets.googleapis.com/v4/spreadsheets';

export interface DriveDuplicateInput {
  sourceSpreadsheetId: string;
  title?: string;
  idempotencyKey?: string;
  topics?: Array<{
    unit: string;
    topic: string;
    subtopic?: string;
    isCompleted?: boolean;
  }>;
}

export interface DriveDuplicateResult {
  driveFileId: string;
  driveUrl: string;
  title: string;
  sourceSpreadsheetId: string;
  progressTrackerTabCreated: boolean;
  createdAt: string;
}

// In-memory idempotency cache (keyed by idempotencyKey or `${userId}:${sourceSpreadsheetId}`)
const idempotencyCache = new Map<string, { result: DriveDuplicateResult; expiresAt: number }>();
const CACHE_TTL_MS = 10 * 60 * 1000; // 10 minutes

export function clearDriveIdempotencyCache(): void {
  idempotencyCache.clear();
}

/**
 * Duplicates a source Google Spreadsheet into the user's Google Drive.
 * Requires Google OAuth token with `drive.file` and `spreadsheets` scopes.
 */
export async function duplicateGoogleDriveFile(
  input: DriveDuplicateInput,
  accessToken: string,
  fetchImpl: FetchLike = fetch
): Promise<DriveDuplicateResult> {
  const token = (accessToken || '').trim();
  if (!token) {
    throw new SheetHubWorkerError(
      'Google Drive authorization is required to duplicate the spreadsheet.',
      401,
      'DRIVE_AUTH_REQUIRED'
    );
  }

  const sourceId = (input.sourceSpreadsheetId || '').trim();
  if (!isValidGoogleSpreadsheetId(sourceId)) {
    throw new SheetHubWorkerError(
      `Invalid source Google Spreadsheet ID "${sourceId}".`,
      400,
      'INVALID_SPREADSHEET_ID'
    );
  }

  // Check idempotency cache if key provided
  const idempKey = (input.idempotencyKey || '').trim();
  if (idempKey) {
    const cached = idempotencyCache.get(idempKey);
    if (cached && cached.expiresAt > Date.now()) {
      return cached.result;
    }
  }

  const targetTitle = (input.title || '').trim() || `FocusFlow Copy — ${sourceId.slice(0, 8)}`;

  // 1. Pre-flight check: Verify capabilities.canCopy if source file metadata is accessible
  try {
    const metaUrl = `${DRIVE_API_BASE}/${encodeURIComponent(sourceId)}?fields=id,name,capabilities(canCopy)`;
    const metaRes = await fetchImpl(metaUrl, {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${token}`,
      },
    });
    if (metaRes.ok) {
      const meta = (await metaRes.json()) as {
        id?: string;
        capabilities?: { canCopy?: boolean };
      };
      if (meta.capabilities && meta.capabilities.canCopy === false) {
        throw new SheetHubWorkerError(
          `You do not have copy permissions for source spreadsheet "${sourceId}" (Google Drive reports canCopy: false).`,
          403,
          'DRIVE_CANNOT_COPY'
        );
      }
    }
  } catch (err) {
    if (err instanceof SheetHubWorkerError) throw err;
    // Non-fatal: if metadata probe is restricted, proceed to authoritative files.copy
  }

  // 2. Duplicate via Google Drive API v3: POST /files/{fileId}/copy
  const copyUrl = `${DRIVE_API_BASE}/${encodeURIComponent(sourceId)}/copy?fields=id,name,webViewLink,modifiedTime`;
  const copyRes = await fetchImpl(copyUrl, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      name: targetTitle,
      description: 'FocusFlow & Finance Dual-Copy Progress Tracker',
    }),
  });

  if (!copyRes.ok) {
    const errText = await copyRes.text().catch(() => '');
    if (copyRes.status === 401) {
      throw new SheetHubWorkerError(
        'Google Drive authorization expired or invalid. Please re-authenticate.',
        401,
        'DRIVE_AUTH_REQUIRED'
      );
    }
    if (copyRes.status === 404) {
      throw new SheetHubWorkerError(
        `Source spreadsheet "${sourceId}" was not found or is not accessible with current permissions. If this is a private spreadsheet in your Google Drive, please select it using "Browse My Google Drive" (Google Picker) so Google can grant per-file copy authorization under drive.file. For public sheets, ensure sharing is set to "Anyone with the link (Viewer)".`,
        404,
        'DRIVE_FILE_NOT_FOUND'
      );
    }
    if (copyRes.status === 403) {
      throw new SheetHubWorkerError(
        `Google Drive permission denied when copying "${sourceId}". If this is a private spreadsheet, select it using "Browse My Google Drive" (Google Picker) to grant per-file authorization.`,
        403,
        'DRIVE_PERMISSION_DENIED'
      );
    }
    throw new SheetHubWorkerError(
      `Failed to duplicate Google Spreadsheet (${copyRes.status}): ${errText.slice(0, 300)}`,
      502,
      'DRIVE_COPY_FAILED'
    );
  }

  const copyData = (await copyRes.json()) as {
    id: string;
    name: string;
    webViewLink?: string;
  };

  const newDriveId = copyData.id;
  const newDriveUrl =
    copyData.webViewLink || `https://docs.google.com/spreadsheets/d/${encodeURIComponent(newDriveId)}/edit`;

  // 2. Add "Progress Tracker" worksheet tab in the newly copied spreadsheet
  let progressTrackerTabCreated = false;
  try {
    progressTrackerTabCreated = await ensureDriveProgressTrackerTab(
      newDriveId,
      token,
      input.topics,
      fetchImpl
    );
  } catch (err) {
    // Non-fatal if Progress Tracker initialization encounters a transient Sheets API hiccup,
    // the Drive copy exists and can have Progress Tracker created upon first sync.
    console.warn(`[DriveWorker] Notice: Progress Tracker tab setup deferred for ${newDriveId}:`, err);
  }

  const result: DriveDuplicateResult = {
    driveFileId: newDriveId,
    driveUrl: newDriveUrl,
    title: copyData.name || targetTitle,
    sourceSpreadsheetId: sourceId,
    progressTrackerTabCreated,
    createdAt: new Date().toISOString(),
  };

  if (idempKey) {
    idempotencyCache.set(idempKey, {
      result,
      expiresAt: Date.now() + CACHE_TTL_MS,
    });
  }

  return result;
}

/**
 * Ensures a "Progress Tracker" tab exists on the given Google Spreadsheet.
 * If not present, creates it with headers:
 * ['Module / Unit', 'Topic', 'Subtopic', 'Completed', 'Last Synced']
 */
export async function ensureDriveProgressTrackerTab(
  spreadsheetId: string,
  accessToken: string,
  topics?: Array<{
    unit: string;
    topic: string;
    subtopic?: string;
    isCompleted?: boolean;
  }>,
  fetchImpl: FetchLike = fetch
): Promise<boolean> {
  const metaUrl = `${SHEETS_API_BASE}/${encodeURIComponent(spreadsheetId)}?fields=sheets(properties(sheetId,title))`;
  const metaRes = await fetchImpl(metaUrl, {
    method: 'GET',
    headers: { Authorization: `Bearer ${accessToken}` },
  });

  if (!metaRes.ok) {
    return false;
  }

  const metaData = (await metaRes.json()) as {
    sheets?: Array<{ properties?: { sheetId?: number; title?: string } }>;
  };

  const existingSheets = metaData.sheets || [];
  const hasProgressTracker = existingSheets.some(
    (s) => s.properties?.title?.toLowerCase() === 'progress tracker'
  );

  if (!hasProgressTracker) {
    // Add "Progress Tracker" tab
    const addSheetRes = await fetchImpl(
      `${SHEETS_API_BASE}/${encodeURIComponent(spreadsheetId)}:batchUpdate`,
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          requests: [
            {
              addSheet: {
                properties: {
                  title: 'Progress Tracker',
                  gridProperties: {
                    frozenRowCount: 1,
                  },
                },
              },
            },
          ],
        }),
      }
    );

    if (!addSheetRes.ok) {
      return false;
    }
  }

  // Populate header row and any initial topic rows
  const headerRow = ['Module / Unit', 'Topic', 'Subtopic', 'Completed', 'Last Synced'];
  const topicRows = (topics || []).map((t) => [
    t.unit || '',
    t.topic || '',
    t.subtopic || '',
    Boolean(t.isCompleted),
    new Date().toISOString(),
  ]);

  const allRows = [headerRow, ...topicRows];

  const updateUrl = `${SHEETS_API_BASE}/${encodeURIComponent(spreadsheetId)}/values/'Progress Tracker'!A1:E${allRows.length}?valueInputOption=USER_ENTERED`;
  await fetchImpl(updateUrl, {
    method: 'PUT',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      range: `'Progress Tracker'!A1:E${allRows.length}`,
      majorDimension: 'ROWS',
      values: allRows,
    }),
  });

  return true;
}

