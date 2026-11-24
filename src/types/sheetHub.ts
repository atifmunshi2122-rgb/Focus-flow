/**
 * Universal Sheet Sync Hub — Phase 1 Foundation TypeScript Models
 * Independent, reusable models for dynamically connecting and syncing arbitrary Google Spreadsheets.
 * Strictly isolated from Study OS, Finance, Calendar, Tasks, and the legacy 23-tab sheetsSpec.
 */

export type SheetFieldType =
  | 'text'
  | 'long_text'
  | 'boolean'
  | 'checkbox'
  | 'number'
  | 'currency'
  | 'date'
  | 'url'
  | 'status'
  | 'priority'
  | 'formula';

export type SheetSemanticRole =
  | 'id'
  | 'group'
  | 'subgroup'
  | 'title'
  | 'done'
  | 'notes'
  | 'status'
  | 'priority'
  | 'due_date'
  | 'link'
  | 'metric'
  | 'custom';

export type SheetSyncStatus =
  | 'active'
  | 'paused'
  | 'auth_required'
  | 'error';

export type SheetIdentityStrategy =
  | 'column_key'
  | 'composite_key'
  | 'metadata_column';

export type SheetTabRole =
  | 'data'
  | 'overview'
  | 'summary'
  | 'metadata'
  | 'instructions'
  | 'uncertain'
  | 'ignored';
export type SheetDetectedPurpose =
  | 'syllabus'
  | 'summary'
  | 'metadata'
  | 'instructions'
  | 'uncertain'
  | 'empty';
export type SheetConfidence = 'high' | 'medium' | 'low';
export type SheetDefaultView = 'checklist' | 'table' | 'grouped_list';
export type SheetSyncMode = 'two_way' | 'sheet_to_app' | 'manual_only';
export type SheetTemplateHint = 'checklist' | 'tracker' | 'table' | 'custom';
export type SheetRowSyncState = 'synced' | 'pending_push' | 'conflict' | 'missing_in_sheet';
export type SheetSyncOrigin = 'sheet' | 'app';

export type SheetCellScalar = string | number | boolean | null;

/**
 * Write authorization status for a connection's Native OAuth.
 * - 'authorized'    : User has granted Google Sheets write scope; token is live in memory.
 * - 'not_requested' : User has not yet gone through the write-auth consent flow.
 * - 'expired'       : Token was previously granted but has since expired or been revoked.
 * - 'denied'        : User explicitly declined the write consent.
 */
export type SheetWriteAuthStatus =
  | 'authorized'
  | 'not_requested'
  | 'expired'
  | 'denied';

/**
 * Write mode for a connection:
 * - 'native_oauth' : Primary. Per-user Google Sheets API v4 via the user's own OAuth token.
 * - 'apps_script'  : Personal/test-only. Owner-executed Apps Script webhook. Single user only.
 * - 'none'         : No remote write path configured.
 */
export type SheetWriteMode = 'native_oauth' | 'apps_script' | 'none';

export interface SheetConnection {
  id: string;
  userId: string;
  ownerUid?: string;
  spreadsheetId: string;
  spreadsheetUrl: string;
  title: string;
  description?: string | null;
  schemaVersion?: number;
  sortOrder?: number;
  isNative?: boolean;
  templateHint: SheetTemplateHint;
  syncMode: SheetSyncMode;
  /**
   * Primary write mode for this connection.
   * Defaults to 'native_oauth'. Only explicitly set to 'apps_script' for personal/test connections.
   */
  writeMode?: SheetWriteMode;
  /**
   * Native OAuth write authorization status for this connection.
   * Updated after each authorization attempt.
   */
  writeAuthStatus?: SheetWriteAuthStatus;
  /**
   * ISO timestamp of the last time the user granted or renewed Google Sheets write authorization.
   */
  writeAuthorizedAt?: string | null;
  pollIntervalSec: number | null;
  syncOnOpen: boolean;
  status: SheetSyncStatus;
  lastSyncedAt: string | null;
  lastSuccessfulPullAt: string | null;
  lastSuccessfulPushAt: string | null;
  lastError: string | null;
  pendingChangesCount: number;
  conflictCount: number;
  tabOrder: string[];
  createdAt: string;
  updatedAt: string;
  deletedAt: string | null;
  /** Dual-Copy Architecture fields */
  isDualCopy?: boolean;
  driveFileId?: string | null;
  sourceSpreadsheetId?: string | null;
  nativeSheetId?: string | null;
  lastDriveSyncAt?: string | null;
  driveSyncStatus?: 'synced' | 'pending' | 'conflict' | 'error' | 'not_connected';
  lastDriveModifiedTime?: string | null;
  /** Public Link (Zero-OAuth) Import flag (strictly read-only) */
  isPublicLink?: boolean;
}

export interface SheetHubDriveDuplicateRequest {
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

export interface SheetHubDriveDuplicateResponse {
  success: boolean;
  driveFileId: string;
  driveUrl: string;
  title: string;
  sourceSpreadsheetId: string;
  progressTrackerTabCreated: boolean;
  createdAt: string;
  operationId?: string;
  status?: string;
  reusedExistingCopy?: boolean;
}

export interface SheetHubDriveDuplicateReconcileRequest {
  operationId: string;
  status: 'COMPLETED' | 'FAILED_REQUIRES_RECONCILIATION';
  driveFileId?: string;
  nativeSheetId?: string;
  errorMessage?: string;
}

export interface SheetColumnMapping {
  colIndex: number;
  colLetter: string;
  fieldKey: string;
  headerName: string;
  displayName: string;
  inferredType: SheetFieldType;
  confirmedType: SheetFieldType;
  semanticRole: SheetSemanticRole;
  confidence: SheetConfidence;
  editable: boolean;
  readOnlyReason?: string | null;
  requiresConfirmation: boolean;
  enumOptions?: string[];
}

export interface SheetTabSchema {
  id: string;
  connectionId: string;
  sheetDocId?: string;
  userId: string;
  ownerUid?: string;
  sheetId: number;
  sheetTitle: string;
  position?: number;
  role: SheetTabRole;
  headerRowIndex: number; // 1-based; 0 if empty tab
  dataStartRow: number;   // 1-based first data row
  dataEndColumn: string;  // e.g. "E"
  identityStrategy: SheetIdentityStrategy;
  identityColumns: string[];
  metadataIdColumn: string | null;
  columns: SheetColumnMapping[];
  defaultView: SheetDefaultView;
  groupByColumnId: string | null;
  lastPullHash: string;
  rowCount: number;
  chunkCount: number;
  createdAt?: string;
  updatedAt: string;
}

export interface SheetSyncedRow {
  rowUid: string;
  id?: string;
  tabId?: string;
  sheetDocId?: string;
  userId?: string;
  ownerUid?: string;
  rowIndex?: number;
  lastKnownSheetRow: number; // 1-based physical row cache (NEVER used as permanent ID)
  cells?: Record<string, SheetCellScalar>;
  values: Record<string, SheetCellScalar>;
  baseValues: Record<string, SheetCellScalar>;
  rowHash: string;
  version: number;
  lastSyncOrigin: SheetSyncOrigin;
  dirtyFields: string[];
  localUpdatedAt: string | null;
  sheetSyncedAt: string;
  status: SheetRowSyncState;
  createdAt?: string;
  updatedAt?: string;
}

export interface SheetRowChunk {
  id: string;
  connectionId: string;
  tabId: string;
  userId: string;
  chunkIndex: number;
  rowCount: number;
  byteSize: number;
  rows: Record<string, SheetSyncedRow>;
  updatedAt: string;
}

export interface SheetSyncOperation {
  id: string;
  connectionId: string;
  tabId: string;
  userId: string;
  rowUid: string;
  colLetter: string;
  fieldKey: string;
  baseValue: SheetCellScalar;
  nextValue: SheetCellScalar;
  dedupeKey: string;
  status: 'pending' | 'syncing' | 'completed' | 'failed' | 'conflict';
  attempts: number;
  nextRetryAt: number | null;
  errorMessage: string | null;
  createdAt: string;
  lastAttemptAt: string | null;
}

export interface SheetConflict {
  id: string;
  connectionId: string;
  tabId: string;
  userId: string;
  rowUid: string;
  fieldKey: string;
  fieldLabel: string;
  baseValue: SheetCellScalar;
  localValue: SheetCellScalar;
  remoteValue: SheetCellScalar;
  status: 'open' | 'resolved';
  resolution: 'keep_app' | 'keep_sheet' | 'custom' | null;
  detectedAt: string;
  resolvedAt: string | null;
}

// ============================================================================
// INSPECTION, DETECTION & PULL DTOs (PHASE 1 READ-ONLY PIPELINE)
// ============================================================================

export interface SheetInspectCellMeta {
  value: SheetCellScalar;
  formattedValue?: string | null;
  formula?: string | null;
  numberFormatType?: string | null; // e.g. 'DATE' | 'DATE_TIME' | 'CURRENCY' | 'NUMBER' | 'PERCENT'
  dataValidationType?: string | null; // e.g. 'BOOLEAN' | 'ONE_OF_LIST'
  dataValidationValues?: string[];
  isBooleanCell?: boolean;
}

export interface SheetTabInspectionInput {
  sheetId: number;
  sheetTitle: string;
  rowCount?: number;
  columnCount?: number;
  rows: SheetInspectCellMeta[][]; // Preview or full grid rows starting from row 1
}

export interface DetectedTabSchema {
  sheetId: number;
  sheetTitle: string;
  role: SheetTabRole;
  roleConfidence: SheetConfidence;
  roleReason: string;
  detectedPurpose?: SheetDetectedPurpose;
  purposeConfidence?: number;
  requiresUserClassification?: boolean;
  headerRowIndex: number;
  dataStartRow: number;
  dataEndColumn: string;
  columns: SheetColumnMapping[];
  suggestedIdentityStrategy: SheetIdentityStrategy;
  suggestedIdentityColumns: string[];
  suggestedDefaultView: SheetDefaultView;
  suggestedGroupByFieldKey: string | null;
  requiresMappingConfirmation: boolean;
  sampleRowCount: number;
  formulaCellCount: number;
  sampleRows: Array<Record<string, SheetCellScalar>>;
}

export interface DetectedWorkbookSchema {
  tabs: DetectedTabSchema[];
  dataTabCount: number;
  overviewTabCount: number;
  emptyTabCount: number;
  requiresUserConfirmation: boolean;
}

export interface SheetInspectResponse {
  spreadsheetId: string;
  title: string;
  canonicalUrl: string;
  tabs: DetectedTabSchema[];
  summary: {
    totalTabs: number;
    dataTabs: number;
    overviewTabs: number;
    emptyTabs: number;
    requiresUserConfirmation: boolean;
  };
  inspectedAt: string;
}

export interface SheetPullTabRequest {
  sheetTitle: string;
  sheetId?: number;
  range?: string; // Optional A1 sub-range; defaults to full tab
  headerRowIndex?: number;
}

export interface SheetPullTabResult {
  sheetTitle: string;
  sheetId: number | null;
  range: string;
  headers: string[];
  headerRowIndex: number;
  rows: Array<{
    sheetRowNumber: number; // 1-based physical row index from pull
    values: SheetCellScalar[];
    formulaColumns: number[]; // 0-based column indices containing formulas
  }>;
  formulaColumnIndices: number[];
  totalRows: number;
}

export interface SheetPullResponse {
  spreadsheetId: string;
  title: string;
  tabs: SheetPullTabResult[];
  pulledAt: string;
}

export interface SheetHubCellUpdateRequest {
  sheetTitle: string;
  rowNumber: number;
  colLetter: string;
  value: SheetCellScalar;
}

export interface SheetHubPushCellsResponse {
  spreadsheetId: string;
  updatedCells: number;
  updatedRangeCount: number;
  pushedAt: string;
}

export interface SheetIdentityDuplicateEntry {
  keySignature: string;
  rowNumbers: number[];
}

export interface SheetIdentityAuditResult {
  strategy: SheetIdentityStrategy;
  keyColumns: string[];
  totalRows: number;
  uniqueCount: number;
  isUnique: boolean;
  missingKeyRowNumbers: number[];
  duplicates: SheetIdentityDuplicateEntry[];
  resolvedRows: Array<{
    sheetRowNumber: number;
    rowUid: string;
    keySignature: string;
    isDuplicate: boolean;
    hasMissingKey: boolean;
    values: Record<string, SheetCellScalar>;
  }>;
}

export interface SheetChunkPackResult {
  chunks: SheetRowChunk[];
  totalRows: number;
  maxChunkBytes: number;
  oversizedRowUids: string[];
}

export interface AppsScriptRowIdentity {
  module?: string;
  topic?: string;
  subtopic?: string;
}

export interface AppsScriptWritebackRequest {
  connectionId: string;
  spreadsheetId: string;
  sheetTitle: string;
  rowNumber: number;
  colLetter: string;
  value: boolean | string | number;
  expectedIdentity?: AppsScriptRowIdentity;
}

export interface AppsScriptWritebackResponse {
  success: boolean;
  updatedCell: string;
  value: boolean | string | number;
  updatedAt: string;
  correctedRowNumber?: number;
  bridgeMode: 'apps_script';
}

// ============================================================================
// PENDING TOPIC WRITEBACK QUEUE (Native OAuth path — offline / auth-expired)
// ============================================================================

/**
 * A pending sheet checkbox update queued when the OAuth token is missing or expired.
 * Flushed when the user re-authorizes or the token is refreshed.
 */
export interface PendingTopicWriteback {
  id: string;
  userId: string;
  connectionId: string;
  spreadsheetId: string;
  sheetTitle: string;
  rowNumber: number;
  colLetter: string;
  cellRef: string;
  value: boolean;
  /** Composite identity for row-drift safety on flush. */
  topicUnit: string;
  topicTopic: string;
  topicSubtopic: string;
  createdAt: string;
  attempts: number;
  lastAttemptAt: string | null;
  lastError: string | null;
}

/**
 * Result returned from syncStudyTopicCompletionToGoogleSheets.
 */
export type StudyTopicSyncStatus =
  | 'synced'           // Successfully written to Google Sheets
  | 'queued'           // Queued — OAuth token missing or expired; local state preserved
  | 'demo'             // Sample sheet: local state only, no remote write needed
  | 'no_connection'    // No active two-way write connection found
  | 'no_matching_tab'  // No sheet tab matched the topic's subject code
  | 'error';           // Unexpected error; local state preserved

export interface StudyTopicSyncResult {
  status: StudyTopicSyncStatus;
  synced: boolean;
  sheetTitle?: string;
  rowNumber?: number;
  colLetter?: string;
  cellRef?: string;
  spreadsheetId?: string;
  value?: boolean;
  connectionId?: string;
  pendingId?: string;    // Set when status === 'queued'
  error?: string;
}

