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
import { escapeSheetFormulaCell } from './validation.ts';
import {
  type IdempotencyLedgerRepository,
  defaultIdempotencyLedger,
} from './durableIdempotencyLedger.ts';

export { escapeSheetFormulaCell };

const DRIVE_API_BASE = 'https://www.googleapis.com/drive/v3/files';
const SHEETS_API_BASE = 'https://sheets.googleapis.com/v4/spreadsheets';

/**
 * Searches Google Drive for any existing duplicate tagged with this exact operation marker in appProperties.
 */
export async function searchDriveByOperationMarker(
  fetchImpl: FetchLike,
  token: string,
  operationId: string,
  sourceId: string,
  ownerUid?: string,
  expectedRole: string = 'dual_copy_duplicate'
): Promise<{
  matches: Array<{
    id: string;
    name: string;
    webViewLink?: string;
    createdTime?: string;
    appProperties?: Record<string, string>;
  }>;
}> {
  const escapeDriveQ = (val: string) => val.replace(/\\/g, '\\\\').replace(/'/g, "\\'");
  const searchUrl = `${DRIVE_API_BASE}?q=appProperties has { key='focusFlowOpId' and value='${escapeDriveQ(operationId)}' } and trashed = false&fields=files(id,name,webViewLink,createdTime,appProperties)`;
  try {
    const searchRes = await fetchImpl(searchUrl, {
      method: 'GET',
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!searchRes.ok) return { matches: [] };
    const searchData = (await searchRes.json()) as { files?: any[] };
    const matches = (searchData.files || []).filter(
      (f) =>
        f.id &&
        f.id !== sourceId &&
        f.appProperties?.focusFlowOpId === operationId &&
        f.appProperties?.sourceSpreadsheetId === sourceId &&
        (!ownerUid || f.appProperties?.ownerUid === ownerUid) &&
        (!f.appProperties?.focusFlowRole || f.appProperties.focusFlowRole === expectedRole)
    );
    return { matches };
  } catch {
    return { matches: [] };
  }
}

export interface DriveDuplicateInput {
  sourceSpreadsheetId: string;
  title?: string;
  operationId?: string;
  idempotencyKey?: string;
  ownerUid?: string;
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
  operationId: string;
  status: string;
  reusedExistingCopy?: boolean;
}

// In-memory idempotency cache (keyed by idempotencyKey or `${userId}:${sourceSpreadsheetId}`)
const idempotencyCache = new Map<string, { result: DriveDuplicateResult; expiresAt: number }>();
const CACHE_TTL_MS = 10 * 60 * 1000; // 10 minutes

export function clearDriveIdempotencyCache(): void {
  idempotencyCache.clear();
  defaultIdempotencyLedger.clearLedger();
}

/**
 * Duplicates a source Google Spreadsheet into the user's Google Drive.
 * Requires Google OAuth token with `drive.file` and `spreadsheets` scopes.
 *
 * Durable Idempotency Architecture:
 * 1. Checks DurableIdempotencyLedger on disk/store for existing completed/reusable operation.
 * 2. Searches Google Drive files for existing duplicate carrying the exact `appProperties.focusFlowOpId`.
 * 3. Atomic claim with lease timeout prevents concurrent duplicate worker calls.
 * 4. Binds ownerUid and sourceSpreadsheetId strictly to operationId.
 * 5. Uses Drive `appProperties` to associate resulting file with its stable operation ID.
 */
export async function duplicateGoogleDriveFile(
  input: DriveDuplicateInput,
  accessToken: string,
  fetchImpl: FetchLike = fetch,
  ledger: IdempotencyLedgerRepository = defaultIdempotencyLedger
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

  const operationId = (input.operationId || input.idempotencyKey || `dual_copy_${sourceId}`).trim();
  const ownerUid = (input.ownerUid || 'usr_anonymous').trim();
  const targetTitle = (input.title || '').trim() || `FocusFlow Copy — ${sourceId.slice(0, 8)}`;

  // Step 1: Check Durable Operation Ledger
  const claimResult = await ledger.claimOperation({
    operationId,
    ownerUid,
    sourceSpreadsheetId: sourceId,
    targetTitle,
    leaseTimeoutMs: 60_000,
  });

  if ((claimResult.action === 'reused' || claimResult.action === 'reclaimed') && claimResult.record.driveFileId) {
    const existingFileId = claimResult.record.driveFileId;
    const existingUrl =
      claimResult.record.driveUrl ||
      `https://docs.google.com/spreadsheets/d/${encodeURIComponent(existingFileId)}/edit`;

    const result: DriveDuplicateResult = {
      driveFileId: existingFileId,
      driveUrl: existingUrl,
      title: claimResult.record.targetTitle || targetTitle,
      sourceSpreadsheetId: sourceId,
      progressTrackerTabCreated: true,
      createdAt: claimResult.record.createdAt,
      operationId,
      status: claimResult.record.status,
      reusedExistingCopy: true,
    };
    return result;
  }

  // Task 4: Handle ambiguous previous outcome (COPY_REQUESTED or COPY_OUTCOME_UNKNOWN)
  if (claimResult.action === 'requires_ambiguous_resolution') {
    const markerSearch = await searchDriveByOperationMarker(fetchImpl, token, operationId, sourceId, ownerUid);
    if (markerSearch.matches.length === 1) {
      const recovered = markerSearch.matches[0];
      const recoveredUrl =
        recovered.webViewLink ||
        `https://docs.google.com/spreadsheets/d/${encodeURIComponent(recovered.id)}/edit`;
      await ledger.recordCopyConfirmed({
        operationId,
        leaseGeneration: claimResult.record.leaseGeneration,
        driveFileId: recovered.id,
        driveUrl: recoveredUrl,
      });

      let progressTrackerTabCreated = false;
      try {
        progressTrackerTabCreated = await ensureDriveProgressTrackerTab(
          recovered.id,
          token,
          input.topics,
          fetchImpl
        );
      } catch {}

      return {
        driveFileId: recovered.id,
        driveUrl: recoveredUrl,
        title: recovered.name || targetTitle,
        sourceSpreadsheetId: sourceId,
        progressTrackerTabCreated,
        createdAt: recovered.createdTime || claimResult.record.createdAt,
        operationId,
        status: 'DRIVE_COPY_CREATED',
        reusedExistingCopy: true,
      };
    } else if (markerSearch.matches.length > 1) {
      await ledger.reconcileOperation({
        operationId,
        status: 'FAILED_REQUIRES_RECONCILIATION',
        errorMessage: `Ambiguous Drive outcome: multiple (${markerSearch.matches.length}) duplicates found with marker "${operationId}".`,
      });
      throw new SheetHubWorkerError(
        `Ambiguous Google Drive outcome: Multiple duplicate spreadsheets (${markerSearch.matches.length}) were found with operation marker "${operationId}". Duplication halted to prevent file proliferation. Please inspect your Google Drive.`,
        409,
        'MULTIPLE_DRIVE_DUPLICATES_FOUND'
      );
    } else {
      // 0 matches found after ambiguous outcome: do NOT automatically copy again!
      throw new SheetHubWorkerError(
        `Google Drive duplication outcome is uncertain for operation "${operationId}". A previous duplication was initiated but no duplicate file has been confirmed in Google Drive yet. Automatic copy is blocked to prevent duplicate files. Please wait a moment and retry.`,
        409,
        'COPY_OUTCOME_UNKNOWN'
      );
    }
  }

  // Step 2: Search Google Drive for existing duplicate tagged with this operation marker in appProperties
  const existingSearch = await searchDriveByOperationMarker(fetchImpl, token, operationId, sourceId, ownerUid);
  if (existingSearch.matches.length === 1) {
    const foundFile = existingSearch.matches[0];
    const foundDriveUrl =
      foundFile.webViewLink ||
      `https://docs.google.com/spreadsheets/d/${encodeURIComponent(foundFile.id)}/edit`;

    await ledger.recordCopyConfirmed({
      operationId,
      leaseGeneration: claimResult.record.leaseGeneration,
      driveFileId: foundFile.id,
      driveUrl: foundDriveUrl,
    });

    let progressTrackerTabCreated = false;
    try {
      progressTrackerTabCreated = await ensureDriveProgressTrackerTab(
        foundFile.id,
        token,
        input.topics,
        fetchImpl
      );
    } catch {}

    return {
      driveFileId: foundFile.id,
      driveUrl: foundDriveUrl,
      title: foundFile.name || targetTitle,
      sourceSpreadsheetId: sourceId,
      progressTrackerTabCreated,
      createdAt: foundFile.createdTime || claimResult.record.createdAt,
      operationId,
      status: 'DRIVE_COPY_CREATED',
      reusedExistingCopy: true,
    };
  } else if (existingSearch.matches.length > 1) {
    await ledger.reconcileOperation({
      operationId,
      status: 'FAILED_REQUIRES_RECONCILIATION',
      errorMessage: `Multiple (${existingSearch.matches.length}) Drive duplicates found with marker "${operationId}".`,
    });
    throw new SheetHubWorkerError(
      `Multiple duplicate files (${existingSearch.matches.length}) were found in Google Drive for operation "${operationId}". Halting to prevent further file proliferation.`,
      409,
      'MULTIPLE_DRIVE_DUPLICATES_FOUND'
    );
  }

  // Step 3: Pre-flight check: Verify source file existence, permissions, and canCopy capabilities
  const metaUrl = `${DRIVE_API_BASE}/${encodeURIComponent(sourceId)}?fields=id,name,owners(displayName,emailAddress),capabilities(canCopy),trashed`;
  const metaRes = await fetchImpl(metaUrl, {
    method: 'GET',
    headers: {
      Authorization: `Bearer ${token}`,
    },
  });

  if (!metaRes.ok) {
    const errText = await metaRes.text().catch(() => '');
    let googleMessage = `HTTP ${metaRes.status} ${metaRes.statusText}`;
    let googleReason: string | undefined;

    try {
      const parsed = JSON.parse(errText);
      if (parsed?.error?.message) {
        googleMessage = parsed.error.message;
        googleReason = parsed.error.errors?.[0]?.reason || parsed.error.status;
      }
    } catch {
      if (errText) googleMessage = errText.slice(0, 300);
    }

    await ledger.recordFailed(operationId, googleMessage, false).catch(() => {});

    if (metaRes.status === 401) {
      throw new SheetHubWorkerError(
        `Google Drive authorization expired or invalid: ${googleMessage}. Please re-authenticate.`,
        401,
        'DRIVE_AUTH_REQUIRED',
        { status: 401, reason: googleReason, sourceSpreadsheetId: sourceId }
      );
    }

    if (metaRes.status === 404) {
      throw new SheetHubWorkerError(
        `Source spreadsheet "${sourceId}" was not found or is not accessible with current permissions (${googleMessage}). If this is a private spreadsheet in your Google Drive, please select it using "Browse My Google Drive" (Google Picker) so Google can grant per-file copy authorization under drive.file. For public sheets, ensure sharing is set to "Anyone with the link (Viewer)".`,
        404,
        'DRIVE_FILE_NOT_FOUND',
        { status: 404, reason: googleReason || 'notFound', sourceSpreadsheetId: sourceId }
      );
    }

    if (metaRes.status === 403) {
      const reasonDetail = googleReason ? ` (Reason: ${googleReason})` : '';
      throw new SheetHubWorkerError(
        `Google Drive permission denied when copying "${sourceId}": ${googleMessage}${reasonDetail}. If this is a private spreadsheet, select it using "Browse My Google Drive" (Google Picker) to grant per-file authorization.`,
        403,
        'DRIVE_PERMISSION_DENIED',
        { status: 403, reason: googleReason, sourceSpreadsheetId: sourceId }
      );
    }

    throw new SheetHubWorkerError(
      `Failed to verify source spreadsheet in Google Drive (${metaRes.status}): ${googleMessage}`,
      metaRes.status >= 400 && metaRes.status < 500 ? metaRes.status : 502,
      'DRIVE_PREFLIGHT_FAILED',
      { status: metaRes.status, reason: googleReason, sourceSpreadsheetId: sourceId }
    );
  }

  const meta = (await metaRes.json()) as {
    id?: string;
    name?: string;
    owners?: Array<{ displayName?: string; emailAddress?: string }>;
    capabilities?: { canCopy?: boolean };
    trashed?: boolean;
  };

  // Integrity: Ensure metadata returned corresponds to the exact requested source ID
  if (meta.id && meta.id !== sourceId) {
    await ledger.recordFailed(operationId, 'Drive metadata ID mismatch', false).catch(() => {});
    throw new SheetHubWorkerError(
      `Drive metadata returned unexpected file ID "${meta.id}" for requested source "${sourceId}".`,
      502,
      'DRIVE_ID_MISMATCH',
      { requestedId: sourceId, returnedId: meta.id }
    );
  }

  if (meta.trashed) {
    await ledger.recordFailed(operationId, 'Source spreadsheet is in trash', false).catch(() => {});
    throw new SheetHubWorkerError(
      `Source spreadsheet "${sourceId}" is in Google Drive trash. Please restore it before duplicating.`,
      400,
      'DRIVE_FILE_TRASHED',
      { sourceSpreadsheetId: sourceId }
    );
  }

  if (meta.capabilities && meta.capabilities.canCopy === false) {
    await ledger.recordFailed(operationId, 'Drive capabilities reports canCopy: false', false).catch(() => {});
    throw new SheetHubWorkerError(
      `You do not have copy permissions for source spreadsheet "${sourceId}" (Google Drive reports canCopy: false). The owner may have restricted downloading or copying.`,
      403,
      'DRIVE_CANNOT_COPY',
      { sourceSpreadsheetId: sourceId }
    );
  }

  // Step 4: Advance ledger stage to COPY_REQUESTED before sending HTTP POST files.copy (Task 4 & 5)
  const currentLeaseGen = claimResult.record.leaseGeneration;
  await ledger.recordCopyRequested(operationId, currentLeaseGen);

  const copyUrl = `${DRIVE_API_BASE}/${encodeURIComponent(sourceId)}/copy?fields=id,name,webViewLink,modifiedTime,appProperties`;
  let copyRes: Response;
  try {
    copyRes = await fetchImpl(copyUrl, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        name: targetTitle,
        description: 'FocusFlow & Finance Dual-Copy Progress Tracker',
        appProperties: {
          focusFlowOpId: operationId,
          sourceSpreadsheetId: sourceId,
          ownerUid,
          focusFlowRole: 'dual_copy_duplicate',
        },
      }),
    });
  } catch (netErr: any) {
    // Ambiguous outcome: Network error or timeout occurred after request was dispatched!
    await ledger.recordCopyOutcomeUnknown(operationId, currentLeaseGen, 'NETWORK_OR_TIMEOUT_ERROR');

    const ambiguousCheck = await searchDriveByOperationMarker(fetchImpl, token, operationId, sourceId, ownerUid);
    if (ambiguousCheck.matches.length === 1) {
      const recovered = ambiguousCheck.matches[0];
      const recoveredUrl =
        recovered.webViewLink ||
        `https://docs.google.com/spreadsheets/d/${encodeURIComponent(recovered.id)}/edit`;
      await ledger.recordCopyConfirmed({
        operationId,
        leaseGeneration: currentLeaseGen,
        driveFileId: recovered.id,
        driveUrl: recoveredUrl,
      });

      let progressTrackerTabCreated = false;
      try {
        progressTrackerTabCreated = await ensureDriveProgressTrackerTab(
          recovered.id,
          token,
          input.topics,
          fetchImpl
        );
      } catch {}

      return {
        driveFileId: recovered.id,
        driveUrl: recoveredUrl,
        title: recovered.name || targetTitle,
        sourceSpreadsheetId: sourceId,
        progressTrackerTabCreated,
        createdAt: recovered.createdTime || claimResult.record.createdAt,
        operationId,
        status: 'DRIVE_COPY_CREATED',
        reusedExistingCopy: true,
      };
    } else if (ambiguousCheck.matches.length > 1) {
      await ledger.reconcileOperation({
        operationId,
        status: 'FAILED_REQUIRES_RECONCILIATION',
        errorMessage: `Multiple (${ambiguousCheck.matches.length}) duplicates found following network error.`,
      });
      throw new SheetHubWorkerError(
        `Ambiguous Google Drive outcome: Multiple duplicates (${ambiguousCheck.matches.length}) were found with operation ID "${operationId}". Duplication halted to prevent duplicate file proliferation.`,
        409,
        'MULTIPLE_DRIVE_DUPLICATES_FOUND'
      );
    } else {
      throw new SheetHubWorkerError(
        `Google Drive duplication request timed out or was interrupted, and no duplicate file could be confirmed yet (operation: "${operationId}"). An ambiguous outcome has been recorded. To avoid creating duplicate files, please retry in a few moments after Drive indexes the operation.`,
        504,
        'COPY_OUTCOME_UNKNOWN'
      );
    }
  }

  if (!copyRes.ok) {
    const errText = await copyRes.text().catch(() => '');
    let googleMessage = `HTTP ${copyRes.status} ${copyRes.statusText}`;
    let googleReason: string | undefined;

    try {
      const parsed = JSON.parse(errText);
      if (parsed?.error?.message) {
        googleMessage = parsed.error.message;
        googleReason = parsed.error.errors?.[0]?.reason || parsed.error.status;
      }
    } catch {
      if (errText) googleMessage = errText.slice(0, 300);
    }

    // In case of 5xx server error from Google, check if duplicate was actually created
    if (copyRes.status >= 500) {
      const ambiguousCheck = await searchDriveByOperationMarker(fetchImpl, token, operationId, sourceId, ownerUid);
      if (ambiguousCheck.matches.length === 1) {
        const recovered = ambiguousCheck.matches[0];
        const recoveredUrl =
          recovered.webViewLink ||
          `https://docs.google.com/spreadsheets/d/${encodeURIComponent(recovered.id)}/edit`;
        await ledger.recordCopyConfirmed({
          operationId,
          leaseGeneration: currentLeaseGen,
          driveFileId: recovered.id,
          driveUrl: recoveredUrl,
        });
        return {
          driveFileId: recovered.id,
          driveUrl: recoveredUrl,
          title: recovered.name || targetTitle,
          sourceSpreadsheetId: sourceId,
          progressTrackerTabCreated: true,
          createdAt: recovered.createdTime || claimResult.record.createdAt,
          operationId,
          status: 'DRIVE_COPY_CREATED',
          reusedExistingCopy: true,
        };
      }
    }

    await ledger.recordFailed(operationId, googleMessage, false).catch(() => {});

    if (copyRes.status === 401) {
      throw new SheetHubWorkerError(
        `Google Drive authorization expired during copy: ${googleMessage}. Please re-authenticate.`,
        401,
        'DRIVE_AUTH_REQUIRED',
        { status: 401, reason: googleReason, sourceSpreadsheetId: sourceId }
      );
    }
    if (copyRes.status === 404) {
      throw new SheetHubWorkerError(
        `Source spreadsheet "${sourceId}" was not found or is not accessible with current permissions (${googleMessage}). If this is a private spreadsheet in your Google Drive, please select it using "Browse My Google Drive" (Google Picker) so Google can grant per-file copy authorization under drive.file. For public sheets, ensure sharing is set to "Anyone with the link (Viewer)".`,
        404,
        'DRIVE_FILE_NOT_FOUND',
        { status: 404, reason: googleReason, sourceSpreadsheetId: sourceId }
      );
    }
    if (copyRes.status === 403) {
      const reasonDetail = googleReason ? ` (Reason: ${googleReason})` : '';
      throw new SheetHubWorkerError(
        `Google Drive permission denied when copying "${sourceId}": ${googleMessage}${reasonDetail}. If this is a private spreadsheet, select it using "Browse My Google Drive" (Google Picker) to grant per-file authorization.`,
        403,
        'DRIVE_PERMISSION_DENIED',
        { status: 403, reason: googleReason, sourceSpreadsheetId: sourceId }
      );
    }
    throw new SheetHubWorkerError(
      `Failed to duplicate Google Spreadsheet (${copyRes.status}): ${googleMessage}`,
      502,
      'DRIVE_COPY_FAILED',
      { status: copyRes.status, reason: googleReason, sourceSpreadsheetId: sourceId }
    );
  }

  const copyData = (await copyRes.json()) as {
    id: string;
    name: string;
    webViewLink?: string;
  };

  const newDriveId = (copyData.id || '').trim();
  if (!newDriveId || newDriveId === sourceId) {
    await ledger.recordFailed(operationId, 'Invalid copy ID returned', false).catch(() => {});
    throw new SheetHubWorkerError(
      `Google Drive copy returned invalid or identical file ID "${newDriveId}". Source file must remain isolated and untouched.`,
      502,
      'DRIVE_INVALID_COPY_ID',
      { sourceSpreadsheetId: sourceId, newDriveId }
    );
  }
  const newDriveUrl =
    copyData.webViewLink || `https://docs.google.com/spreadsheets/d/${encodeURIComponent(newDriveId)}/edit`;

  // Step 5: DURABLY RECORD Drive copy in ledger immediately!
  await ledger.recordCopyConfirmed({
    operationId,
    leaseGeneration: currentLeaseGen,
    driveFileId: newDriveId,
    driveUrl: newDriveUrl,
  });

  // Step 6: Add "Progress Tracker" worksheet tab in the newly copied spreadsheet
  let progressTrackerTabCreated = false;
  try {
    progressTrackerTabCreated = await ensureDriveProgressTrackerTab(
      newDriveId,
      token,
      input.topics,
      fetchImpl
    );
  } catch (err) {
    console.warn(`[DriveWorker] Notice: Progress Tracker tab setup deferred for ${newDriveId}:`, err);
  }

  const result: DriveDuplicateResult = {
    driveFileId: newDriveId,
    driveUrl: newDriveUrl,
    title: copyData.name || targetTitle,
    sourceSpreadsheetId: sourceId,
    progressTrackerTabCreated,
    createdAt: claimResult.record.createdAt,
    operationId,
    status: 'DRIVE_COPY_CREATED',
  };

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
    escapeSheetFormulaCell(t.unit || ''),
    escapeSheetFormulaCell(t.topic || ''),
    escapeSheetFormulaCell(t.subtopic || ''),
    Boolean(t.isCompleted),
    new Date().toISOString(),
  ]);

  const allRows = [headerRow, ...topicRows];

  const updateUrl = `${SHEETS_API_BASE}/${encodeURIComponent(spreadsheetId)}/values/'Progress Tracker'!A1:E${allRows.length}?valueInputOption=USER_ENTERED`;
  const updateRes = await fetchImpl(updateUrl, {
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

  if (!updateRes.ok) {
    return false;
  }

  return true;
}

