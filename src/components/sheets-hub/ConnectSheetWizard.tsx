import React, { useState, useEffect } from 'react';
import {
  FileSpreadsheet,
  CheckCircle2,
  AlertTriangle,
  ArrowRight,
  ArrowLeft,
  ShieldCheck,
  Search,
  Sparkles,
  Layers,
  Key,
  Eye,
  RotateCcw,
  Lock,
  ExternalLink,
  Check,
  AlertCircle,
  HelpCircle,
  FolderSync,
  Copy,
} from 'lucide-react';
import { useApp } from '../../context/AppContext.tsx';
import { api } from '../../lib/api.ts';
import { activeFirebaseConfig, auth, getSheetHubAccessToken, getSheetHubWriteAccessToken } from '../../lib/firebase.ts';
import { detectEmbeddedIframe, getCurrentAppUrl } from '../../lib/authDiagnostics.ts';
import { parseGoogleSheetUrl } from '../../lib/sheetHub/urlParser.ts';
import { evaluateRowIdentities } from '../../lib/sheetHub/rowIdentity.ts';
import { sheetHubStore } from '../../lib/sheetHub/sheetHubStore.ts';
import type {
  DetectedTabSchema,
  SheetColumnMapping,
  SheetConnection,
  SheetIdentityStrategy,
  SheetInspectResponse,
  SheetPullResponse,
  SheetSyncedRow,
  SheetSyncMode,
  SheetTabRole,
  SheetTabSchema,
  SheetTemplateHint,
} from '../../types/sheetHub.ts';
import { ThemeCard, ThemeButton, ThemeBadge, ThemeInput } from '../ui/ThemePrimitives.tsx';
import { AnimatedProgressBar } from '../ui/MotionPrimitives.tsx';
import { SchemaMappingEditor } from './SchemaMappingEditor.tsx';
import { GoogleSheetPickerModal, type SelectedGoogleSheet } from './GoogleSheetPickerModal.tsx';
import { requestGoogleDriveToken, getGisDualCopyToken, GHOST_PROJECT_ID } from '../../lib/googleAuthGis.ts';
import { isTabOverview, isSummaryOrInvalidSyllabusRow } from '../../lib/sheetHub/sheetToStudyTransformer.ts';

interface ConnectSheetWizardProps {
  onCancel: () => void;
  onSuccess: (connectionId: string) => void;
}

type WizardStep =
  | 'url'
  | 'auth'
  | 'inspect'
  | 'tabs'
  | 'mapping'
  | 'identity'
  | 'view'
  | 'confirm'
  | 'importing';

const STEPS: Array<{ id: WizardStep; label: string }> = [
  { id: 'url', label: '1. URL' },
  { id: 'auth', label: '2. Auth' },
  { id: 'tabs', label: '3. Tabs' },
  { id: 'mapping', label: '4. Columns' },
  { id: 'identity', label: '5. Identity' },
  { id: 'view', label: '6. View' },
  { id: 'confirm', label: '7. Confirm' },
];

// ============================================================================
// TASK 6: CLIENT OPERATION ID SESSION PERSISTENCE HELPERS
// ============================================================================
function getClientSessionOpKey(userId: string, targetSheetId: string): string {
  return `focusflow_op_dual_${userId}_${targetSheetId}`;
}

function loadPersistedOpId(userId: string, targetSheetId: string): string | null {
  if (typeof window === 'undefined' || !targetSheetId) return null;
  try {
    return window.sessionStorage.getItem(getClientSessionOpKey(userId, targetSheetId));
  } catch {
    return null;
  }
}

function savePersistedOpId(userId: string, targetSheetId: string, opId: string): void {
  if (typeof window === 'undefined' || !targetSheetId || !opId) return;
  try {
    window.sessionStorage.setItem(getClientSessionOpKey(userId, targetSheetId), opId);
  } catch {}
}

function clearPersistedOpId(userId: string, targetSheetId: string): void {
  if (typeof window === 'undefined' || !targetSheetId) return;
  try {
    window.sessionStorage.removeItem(getClientSessionOpKey(userId, targetSheetId));
  } catch {}
}

export const ConnectSheetWizard: React.FC<ConnectSheetWizardProps> = ({
  onCancel,
  onSuccess,
}) => {
  const {
    user,
    firebaseUser,
    authorizeSheetHubReadOnly,
    authorizeSheetHubWrite,
    showToast,
  } = useApp();

  const [currentStep, setCurrentStep] = useState<WizardStep>('url');
  const [urlInput, setUrlInput] = useState('');
  const [urlError, setUrlError] = useState<string | null>(null);
  const [spreadsheetId, setSpreadsheetId] = useState<string>('');
  const [isDemoMode, setIsDemoMode] = useState(false);
  const [isPublicLinkMode, setIsPublicLinkMode] = useState(false);
  const [isDualCopyEnabled, setIsDualCopyEnabled] = useState(true);
  const [isPickerOpen, setIsPickerOpen] = useState(false);

  // Durable Idempotency state for Dual-Copy
  const [duplicationOpId, setDuplicationOpId] = useState<string>('');
  const [persistedDriveDuplicate, setPersistedDriveDuplicate] = useState<{ driveFileId: string; driveUrl: string } | null>(null);

  // Auth & Sync mode state
  const [selectedSyncMode, setSelectedSyncMode] = useState<SheetSyncMode>('two_way');
  const [oauthToken, setOauthToken] = useState<string | null>(null);
  const [isAuthorizing, setIsAuthorizing] = useState(false);
  const [isAuthorizingWrite, setIsAuthorizingWrite] = useState(false);
  const [authLocalError, setAuthLocalError] = useState<string | null>(null);

  // Inspection state
  const [isInspecting, setIsInspecting] = useState(false);
  const [inspectData, setInspectData] = useState<SheetInspectResponse | null>(null);
  const [inspectError, setInspectError] = useState<string | null>(null);
  const [inspectErrorCode, setInspectErrorCode] = useState<string | null>(null);

  useEffect(() => {
    let mounted = true;
    void getSheetHubAccessToken().then((cached) => {
      if (mounted && cached) {
        setOauthToken(cached);
      }
    });
    return () => {
      mounted = false;
    };
  }, []);

  // Tab selections
  const [selectedTabIds, setSelectedTabIds] = useState<number[]>([]);
  const [tabRoles, setTabRoles] = useState<Record<number, SheetTabRole>>({});
  const [activeEditingTabId, setActiveEditingTabId] = useState<number | null>(null);
  const [tabColumns, setTabColumns] = useState<Record<number, SheetColumnMapping[]>>({});

  // Identity state
  const [identityStrategy, setIdentityStrategy] = useState<SheetIdentityStrategy>('composite_key');
  const [selectedKeyColumns, setSelectedKeyColumns] = useState<Record<number, string[]>>({});

  // View state
  const [preferredView, setPreferredView] = useState<'checklist' | 'table' | 'grouped_list' | 'cards'>('checklist');

  // Import pipeline state
  const [importProgress, setImportProgress] = useState(0);
  const [importStatusText, setImportStatusText] = useState('');
  const [importError, setImportError] = useState<string | null>(null);

  // Step 1: Validate URL
  const handleValidateUrl = (overrideUrl?: string) => {
    const raw = (overrideUrl || urlInput).trim();
    if (!raw) {
      setUrlError('Please enter a Google Sheets URL or spreadsheet ID.');
      return false;
    }
    const parsed = parseGoogleSheetUrl(raw);
    if (!parsed.ok) {
      setUrlError(parsed.error);
      return false;
    }
    setUrlError(null);
    setSpreadsheetId(parsed.spreadsheetId);
    return true;
  };

  // Quick Demo: Semester 3 Syllabus Tracker
  const handleLoadSemester3Demo = async () => {
    setIsDemoMode(true);
    setDuplicationOpId('');
    setPersistedDriveDuplicate(null);
    setUrlInput('https://docs.google.com/spreadsheets/d/sem3-syllabus-sample/edit');
    setSpreadsheetId('sem3-syllabus-sample');
    setCurrentStep('inspect');
    setIsInspecting(true);

    try {
      const res = await api.sheetHubSampleSemester3();
      setInspectData(res.inspect);

      // Initialize tabs
      const initialTabIds: number[] = [];
      const initialRoles: Record<number, SheetTabRole> = {};
      const initialCols: Record<number, SheetColumnMapping[]> = {};
      const initialKeys: Record<number, string[]> = {};

      for (const t of res.inspect.tabs) {
        if (t.role !== 'ignored') {
          initialTabIds.push(t.sheetId);
        }
        initialRoles[t.sheetId] = t.role;
        initialCols[t.sheetId] = t.columns;

        // Composite key for subject tabs: module + topic + subtopic
        const keys = t.columns
          .filter((c) => c.semanticRole === 'group' || c.semanticRole === 'subgroup' || c.semanticRole === 'title')
          .map((c) => c.fieldKey);
        initialKeys[t.sheetId] = keys.length > 0 ? keys : t.columns.slice(0, 3).map((c) => c.fieldKey);
      }

      setSelectedTabIds(initialTabIds);
      setTabRoles(initialRoles);
      setTabColumns(initialCols);
      setSelectedKeyColumns(initialKeys);
      setActiveEditingTabId(initialTabIds.find((id) => initialRoles[id] === 'data') || initialTabIds[0]);
      setPreferredView('checklist');
      setCurrentStep('tabs');
    } catch (err) {
      setInspectError('Failed to load local Semester 3 fixture: ' + String(err));
      setCurrentStep('url');
    } finally {
      setIsInspecting(false);
    }
  };

  // Step 1: Select via Google Picker Dialog (Grants drive.file permission to existing private spreadsheet)
  const handleSelectPickedSheet = async (picked: SelectedGoogleSheet, tokenFromPicker?: string) => {
    setIsPickerOpen(false);
    const pickedId = (picked.id || '').trim();
    const pickedUrl = (picked.url || '').trim() || `https://docs.google.com/spreadsheets/d/${encodeURIComponent(pickedId)}/edit`;
    setUrlInput(pickedUrl);
    setSpreadsheetId(pickedId);
    setIsDemoMode(false);
    setIsPublicLinkMode(false);
    setSelectedSyncMode('two_way');
    setAuthLocalError(null);
    setInspectError(null);
    setInspectErrorCode(null);
    // Clear old inspection data and session op ID when spreadsheet changes
    const activeUid = firebaseUser?.uid || auth.currentUser?.uid || user?.id || 'usr_guest';
    if (spreadsheetId) {
      clearPersistedOpId(activeUid, spreadsheetId);
    }
    setInspectData(null);
    setSelectedTabIds([]);
    setDuplicationOpId('');
    setPersistedDriveDuplicate(null);

    const token =
      tokenFromPicker ||
      oauthToken ||
      (await getSheetHubWriteAccessToken()) ||
      (await getSheetHubAccessToken());
    if (token) {
      setOauthToken(token);
    }
    // Note: Success toast is deferred until inspection verifies metadata access!
    await runInspection(token, false, pickedId, pickedUrl);
  };

  // Step 2A: Connect Publicly Viewable Google Sheet (Zero OAuth)
  const handleInspectPublicLink = async (overrideSpreadsheetId?: string, overrideUrl?: string) => {
    setIsDemoMode(false);
    setIsPublicLinkMode(true);
    setIsDualCopyEnabled(false);
    setSelectedSyncMode('sheet_to_app');
    setAuthLocalError(null);
    setInspectError(null);
    setInspectErrorCode(null);
    setInspectData(null);
    setSelectedTabIds([]);
    setDuplicationOpId('');
    setPersistedDriveDuplicate(null);
    await runInspection(null, true, overrideSpreadsheetId, overrideUrl);
  };

  // Step 2B0: Request Google Drive Duplicate + Sheets Write Authorization strictly via Project focus-flow-by-atif (GIS)
  const handleAuthorizeGoogleDriveDualCopy = async () => {
    setIsAuthorizingWrite(true);
    setIsDemoMode(false);
    setIsPublicLinkMode(false);
    setIsDualCopyEnabled(true);
    setAuthLocalError(null);
    setInspectError(null);
    setInspectErrorCode(null);
    try {
      const res = await requestGoogleDriveToken({
        loginHint: firebaseUser?.email || null,
      });
      if (res) {
        setOauthToken(res);
        setSelectedSyncMode('two_way');
        // Do not show success toast yet! Must verify metadata access via Google Sheets API first.
        await runInspection(res, false);
      } else {
        setAuthLocalError(
          `Google Drive authorization did not finish. If Google showed "Access blocked (Error 403)", ensure your email (${firebaseUser?.email || 'your account'}) is added under Test users in Google Cloud project ${GHOST_PROJECT_ID}.`
        );
      }
    } catch (err) {
      setAuthLocalError(
        err instanceof Error
          ? err.message
          : 'Google Drive authorization failed. Please check popup permissions or use Public Link mode.'
      );
    } finally {
      setIsAuthorizingWrite(false);
    }
  };

  // Step 2B1: Request Google Two-Way Write Authorization (Automatic Checkbox Write-Back via Firebase OAuth)
  const handleAuthorizeGoogleWrite = async () => {
    setIsAuthorizingWrite(true);
    setIsDemoMode(false);
    setIsPublicLinkMode(false);
    setIsDualCopyEnabled(false);
    setAuthLocalError(null);
    setInspectError(null);
    setInspectErrorCode(null);
    try {
      const res = await authorizeSheetHubWrite();
      if (res) {
        setOauthToken(res);
        setSelectedSyncMode('two_way');
        // Do not show success toast yet! Must verify metadata access via Google Sheets API first.
        await runInspection(res, false);
      } else {
        setAuthLocalError(
          `Google Sheets edit authorization did not finish. If Google showed "Access blocked (Error 403)", ensure your email (${firebaseUser?.email || 'your account'}) is added under Test users in Google Cloud project ${activeFirebaseConfig.projectId}, or use "Import Public Link (Zero Auth)" above.`
        );
      }
    } catch (err) {
      setAuthLocalError(
        err instanceof Error
          ? err.message
          : 'Google authorization failed. Please check popup permissions or try Public Link mode.'
      );
    } finally {
      setIsAuthorizingWrite(false);
    }
  };

  // Step 2B2: Request Google Read-Only Authorization (via Firebase OAuth)
  const handleAuthorizeGoogleReadOnly = async () => {
    setIsAuthorizing(true);
    setIsDemoMode(false);
    setIsPublicLinkMode(false);
    setIsDualCopyEnabled(false);
    setAuthLocalError(null);
    setInspectError(null);
    setInspectErrorCode(null);
    try {
      const res = await authorizeSheetHubReadOnly();
      if (res) {
        setOauthToken(res);
        setSelectedSyncMode('sheet_to_app');
        // Do not show success toast yet! Must verify metadata access via Google Sheets API first.
        await runInspection(res, false);
      } else {
        setAuthLocalError(
          `Google Sheets read authorization did not finish. If Google showed "Access blocked (Error 403)", ensure your email (${firebaseUser?.email || 'your account'}) is added under Test users in Google Cloud project ${activeFirebaseConfig.projectId}, or use "Import Public Link (Zero Auth)" above.`
        );
      }
    } catch (err) {
      setAuthLocalError(
        err instanceof Error
          ? err.message
          : 'Google authorization failed. Please check popup permissions or try Public Link mode.'
      );
    } finally {
      setIsAuthorizing(false);
    }
  };

  // Alias for backward compatibility
  const handleAuthorizeGoogle = handleAuthorizeGoogleWrite;

  // Step 2C: Continue with Existing In-Memory Auth Token
  const handleContinueWithExistingAuth = async () => {
    setAuthLocalError(null);
    setInspectError(null);
    setInspectErrorCode(null);
    const cachedToken = oauthToken || (await getSheetHubAccessToken());
    if (!cachedToken) {
      setAuthLocalError(
        'No active Google Sheets authorization token found in this session. Choose "Import Public Link (Zero Auth)" for publicly shared sheets, or click "Authorize Read-Only Sheets Access" for private sheets.'
      );
      return;
    }
    setOauthToken(cachedToken);
    setIsPublicLinkMode(false);
    await runInspection(cachedToken, false);
  };

  // Step 3: Run Inspection via API
  const runInspection = async (
    token?: string | null,
    usePublicAccess = false,
    overrideSpreadsheetId?: string,
    overrideUrl?: string
  ) => {
    setIsInspecting(true);
    setInspectError(null);
    setInspectErrorCode(null);
    // Bug 3: Clear inspection state when new inspection starts
    setInspectData(null);
    setSelectedTabIds([]);
    setCurrentStep('inspect');

    const targetId = (overrideSpreadsheetId ?? spreadsheetId).trim();
    const targetUrl = (overrideUrl ?? urlInput).trim();
    const resolvedToken = usePublicAccess
      ? null
      : token || oauthToken || (await getSheetHubAccessToken());

    // Task 6: Generate or restore stable duplication operation ID from client session storage
    const activeUserId = firebaseUser?.uid || auth.currentUser?.uid || user?.id || 'usr_guest';
    let opId = duplicationOpId;
    if (!opId && targetId) {
      opId = loadPersistedOpId(activeUserId, targetId) || `op_dual_${activeUserId}_${targetId.slice(0, 16)}_${Date.now().toString(36)}`;
      savePersistedOpId(activeUserId, targetId, opId);
      setDuplicationOpId(opId);
    }

    try {
      const res = await api.sheetHubInspect(
        {
          spreadsheetId: targetId || undefined,
          spreadsheetUrl: targetUrl || undefined,
          previewRows: 40,
          publicAccess: usePublicAccess ? true : undefined,
        },
        resolvedToken
      );

      // Verify metadata integrity
      if (!res || !res.spreadsheetId || !Array.isArray(res.tabs)) {
        throw new Error('Inspection received invalid or incomplete spreadsheet metadata.');
      }

      // Bug 1 & 3: Ensure inspected ID matches target ID
      if (targetId && res.spreadsheetId !== targetId) {
        throw new Error(
          `Spreadsheet ID integrity check failed: expected "${targetId}" but Google API returned "${res.spreadsheetId}".`
        );
      }

      setIsPublicLinkMode(usePublicAccess);
      setInspectData(res);
      setSpreadsheetId(res.spreadsheetId);

      const initialTabIds: number[] = [];
      const initialRoles: Record<number, SheetTabRole> = {};
      const initialCols: Record<number, SheetColumnMapping[]> = {};
      const initialKeys: Record<number, string[]> = {};

      for (const t of res.tabs) {
        const isOverview = isTabOverview(t.sheetTitle, t.role);
        if (t.role !== 'ignored' && t.role !== 'overview' && !isOverview) {
          initialTabIds.push(t.sheetId);
        }
        initialRoles[t.sheetId] = isOverview ? 'overview' : t.role;
        initialCols[t.sheetId] = t.columns;

        // Auto select key candidates
        const keys = t.columns
          .filter((c) => c.semanticRole === 'id' || c.semanticRole === 'group' || c.semanticRole === 'title')
          .map((c) => c.fieldKey);
        initialKeys[t.sheetId] = keys.length > 0 ? keys : t.columns.slice(0, 2).map((c) => c.fieldKey);
      }

      setSelectedTabIds(initialTabIds);
      setTabRoles(initialRoles);
      setTabColumns(initialCols);
      setSelectedKeyColumns(initialKeys);
      setActiveEditingTabId(initialTabIds.find((id) => initialRoles[id] === 'data') || initialTabIds[0]);

      // Suggest default view based on tabs
      const hasDoneCol = res.tabs.some((t) =>
        t.columns.some((c) => c.semanticRole === 'done' || c.inferredType === 'checkbox')
      );
      setPreferredView(hasDoneCol ? 'checklist' : 'table');

      // Bug 2: ONLY show success toast after inspection and metadata verification succeed!
      showToast(`Successfully connected and inspected "${res.title || 'Spreadsheet'}"!`, 'success');
      setCurrentStep('tabs');
    } catch (err: any) {
      setInspectData(null);
      setSelectedTabIds([]);
      const msg = err?.message || 'Inspection failed. Please verify the Google Sheet link and permissions.';
      const code = typeof err?.code === 'string' ? err.code : null;
      setInspectError(msg);
      setInspectErrorCode(code);
      showToast(msg, 'error');

      if (
        code === 'INVALID_SPREADSHEET_ID' ||
        code === 'UNSUPPORTED_HOST'
      ) {
        setCurrentStep('url');
      } else {
        setCurrentStep('auth');
      }
    } finally {
      setIsInspecting(false);
    }
  };


  const toggleTabSelection = (sheetId: number) => {
    setSelectedTabIds((prev) =>
      prev.includes(sheetId) ? prev.filter((id) => id !== sheetId) : [...prev, sheetId]
    );
  };

  const toggleKeyColumn = (tabId: number, fieldKey: string) => {
    setSelectedKeyColumns((prev) => {
      const current = prev[tabId] || [];
      const updated = current.includes(fieldKey)
        ? current.filter((k) => k !== fieldKey)
        : [...current, fieldKey];
      return { ...prev, [tabId]: updated };
    });
  };

  // Step 8: Execute Import Pipeline
  const executeImportPipeline = async () => {
    // Bug 3 & Bug 6: Prevent Confirm & Import from proceeding on invalid state
    if (!inspectData) {
      const noDataErr = 'No spreadsheet inspection data available. Please inspect the spreadsheet first.';
      setImportError(noDataErr);
      showToast(noDataErr, 'error');
      setCurrentStep('url');
      return;
    }
    if (inspectData.spreadsheetId !== spreadsheetId) {
      const mismatchMsg = `Spreadsheet ID mismatch: inspected sheet (${inspectData.spreadsheetId}) does not match current selection (${spreadsheetId}). Please re-inspect before importing.`;
      setImportError(mismatchMsg);
      showToast(mismatchMsg, 'error');
      setInspectData(null);
      setSelectedTabIds([]);
      setCurrentStep('url');
      return;
    }
    if (selectedTabIds.length === 0) {
      const tabErr = 'Please select at least one tab to import.';
      setImportError(tabErr);
      showToast(tabErr, 'error');
      setCurrentStep('tabs');
      return;
    }
    if (!isDemoMode && !isPublicLinkMode) {
      const activeToken = oauthToken || (await getSheetHubAccessToken());
      if (!activeToken) {
        const tokenMsg = 'Google authorization is required for private sheet import. Please authorize access.';
        setImportError(tokenMsg);
        showToast(tokenMsg, 'error');
        setCurrentStep('auth');
        return;
      }
    }

    setCurrentStep('importing');
    setImportProgress(10);
    setImportStatusText('Preparing spreadsheet connection metadata...');
    setImportError(null);

    const activeUserId = firebaseUser?.uid || auth.currentUser?.uid || user?.id || 'usr_guest';
    const isDualCopy = Boolean(isDualCopyEnabled && !isDemoMode && !isPublicLinkMode);
    const standardConnectionId = `conn_${spreadsheetId.slice(0, 24)}_${Date.now().toString(36)}`;

    try {
      const nowIso = new Date().toISOString();
      const templateHint: SheetTemplateHint =
        preferredView === 'checklist' ? 'checklist' : preferredView === 'table' ? 'table' : 'custom';
      const trimmedInput = urlInput.trim();
      const canonicalSpreadsheetUrl =
        inspectData.canonicalUrl ||
        (trimmedInput.startsWith('http://') || trimmedInput.startsWith('https://')
          ? trimmedInput
          : `https://docs.google.com/spreadsheets/d/${encodeURIComponent(spreadsheetId)}/edit`);

      setImportProgress(20);
      setImportStatusText('Fetching spreadsheet rows...');

      // 1. Fetch full rows (either via sample endpoint or live Google Sheets API)
      let pullResult: SheetPullResponse;

      if (isDemoMode) {
        const sample = await api.sheetHubSampleSemester3();
        pullResult = sample.pull;
      } else {
        const tabsToPull = selectedTabIds.map((id) => {
          const tab = inspectData.tabs.find((t) => t.sheetId === id);
          return {
            sheetId: id,
            sheetTitle: tab?.sheetTitle || '',
            headerRowIndex: tab?.headerRowIndex || 1,
          };
        });
        const pullToken = isPublicLinkMode
          ? null
          : oauthToken || (await getSheetHubWriteAccessToken()) || (await getSheetHubAccessToken()) || getGisDualCopyToken();
        pullResult = await api.sheetHubPull(
          {
            spreadsheetId,
            tabs: tabsToPull,
            publicAccess: isPublicLinkMode ? true : undefined,
          },
          pullToken
        );
      }

      setImportProgress(40);
      setImportStatusText('Resolving deterministic row identities...');

      // Process rows for all selected tabs
      const processedTabs: Array<{
        sheetTitle: string;
        sheetId?: number;
        role?: SheetTabRole;
        columns: SheetColumnMapping[];
        rows: SheetSyncedRow[];
      }> = [];

      const topicsForTracker: Array<{ unit: string; topic: string; subtopic?: string; isCompleted?: boolean }> = [];
      let totalImportedRows = 0;

      for (let i = 0; i < selectedTabIds.length; i++) {
        const sheetId = selectedTabIds[i];
        const tabMeta = inspectData.tabs.find((t) => t.sheetId === sheetId);
        if (!tabMeta) continue;

        const activeColumns = tabColumns[sheetId] || tabMeta.columns;
        const keyCols = selectedKeyColumns[sheetId] || [];

        const pulledTab = pullResult.tabs.find((pt) => pt.sheetId === sheetId);
        const rawRows = pulledTab?.rows || [];

        const rawRowsForIdentity = rawRows.map((r) => {
          const vals: Record<string, any> = {};
          for (const col of activeColumns) {
            vals[col.fieldKey] = r.values[col.colIndex] ?? null;
          }
          return {
            sheetRowNumber: r.sheetRowNumber,
            values: vals,
          };
        });

        // Evaluate row identities
        const identityScopeId = isDualCopy ? `dual_${spreadsheetId.slice(0, 16)}` : standardConnectionId;
        const identityAudit = evaluateRowIdentities({
          tabScope: `${identityScopeId}:${sheetId}`,
          strategy: identityStrategy,
          keyColumns: keyCols,
          rows: rawRowsForIdentity,
        });

        const syncedRows: SheetSyncedRow[] = identityAudit.resolvedRows.map((r) => ({
          rowUid: r.rowUid,
          lastKnownSheetRow: r.sheetRowNumber,
          values: r.values,
          baseValues: r.values,
          rowHash: r.rowUid,
          version: 1,
          lastSyncOrigin: 'sheet',
          dirtyFields: [],
          localUpdatedAt: null,
          sheetSyncedAt: nowIso,
          status: 'synced',
        }));

        totalImportedRows += syncedRows.length;

        // Extract topics for Progress Tracker
        const unitCol = activeColumns.find((c) => c.semanticRole === 'group')?.fieldKey;
        const topicCol = activeColumns.find((c) => c.semanticRole === 'title')?.fieldKey;
        const subtopicCol = activeColumns.find((c) => c.semanticRole === 'subgroup')?.fieldKey;
        const doneCol = activeColumns.find((c) => c.semanticRole === 'done')?.fieldKey;

        for (const r of syncedRows) {
          const topicVal = String(r.values[topicCol || ''] || '').trim();
          const unitVal = String(r.values[unitCol || ''] || tabMeta.sheetTitle).trim();
          const subtopicVal = subtopicCol ? String(r.values[subtopicCol] || '').trim() : undefined;
          const rowCheck = isSummaryOrInvalidSyllabusRow(unitVal, topicVal, subtopicVal || '');
          if (topicVal && !rowCheck.isInvalid) {
            topicsForTracker.push({
              unit: unitVal,
              topic: topicVal,
              subtopic: subtopicVal,
              isCompleted: doneCol ? Boolean(r.values[doneCol]) : false,
            });
          }
        }

        processedTabs.push({
          sheetTitle: tabMeta.sheetTitle,
          sheetId,
          role: tabRoles[sheetId] || tabMeta.role,
          columns: activeColumns,
          rows: syncedRows,
        });
      }

      // BRANCH A: Dual-Copy Google Drive Duplicate + Firestore Native Architecture
      if (isDualCopy) {
        const effectiveOpId = duplicationOpId || `op_dual_${activeUserId}_${spreadsheetId.slice(0, 16)}_${Date.now().toString(36)}`;
        if (!duplicationOpId) {
          setDuplicationOpId(effectiveOpId);
        }

        // Isolated GIS Dual-Copy token (strictly separated from standard Firebase tokens)
        let dualCopyToken = oauthToken || getGisDualCopyToken();
        if (!dualCopyToken) {
          setImportProgress(60);
          setImportStatusText('Requesting Google Drive authorization for duplicate copy...');
          dualCopyToken = await requestGoogleDriveToken({
            loginHint: firebaseUser?.email || null,
          });
        }
        if (!dualCopyToken) {
          throw new Error(`Google authorization with Google Drive access (project ${GHOST_PROJECT_ID}) is required to duplicate to your Google Drive.`);
        }

        let driveDup: { driveFileId: string; driveUrl: string; sourceSpreadsheetId?: string };

        // Task 4: Resume using existing Drive duplicate if already created during previous attempt
        if (persistedDriveDuplicate && persistedDriveDuplicate.driveFileId) {
          setImportProgress(75);
          setImportStatusText(`Reusing existing verified Google Drive duplicate (${persistedDriveDuplicate.driveFileId})...`);
          driveDup = {
            driveFileId: persistedDriveDuplicate.driveFileId,
            driveUrl: persistedDriveDuplicate.driveUrl,
            sourceSpreadsheetId: spreadsheetId,
          };
        } else {
          setImportProgress(75);
          setImportStatusText('Duplicating to your Google Drive & provisioning Progress Tracker tab...');

          const dupResult = await api.sheetHubDriveDuplicate(
            {
              sourceSpreadsheetId: spreadsheetId,
              title: inspectData.title || 'FocusFlow Spreadsheet',
              topics: topicsForTracker,
              idempotencyKey: effectiveOpId,
              operationId: effectiveOpId,
            },
            dualCopyToken
          );

          if (!dupResult || !dupResult.driveFileId) {
            throw new Error('Google Drive duplication did not return a valid Drive file ID. Native Firestore sheet creation aborted.');
          }

          if (dupResult.sourceSpreadsheetId && dupResult.sourceSpreadsheetId !== spreadsheetId) {
            throw new Error(
              `Drive duplicate source mismatch: requested "${spreadsheetId}" but Drive returned "${dupResult.sourceSpreadsheetId}".`
            );
          }

          driveDup = dupResult;
          setPersistedDriveDuplicate({
            driveFileId: dupResult.driveFileId,
            driveUrl: dupResult.driveUrl,
          });
        }

        if (!driveDup || !driveDup.driveFileId) {
          throw new Error('Google Drive duplication did not return a valid Drive file ID. Native Firestore sheet creation aborted.');
        }

        setImportProgress(90);
        setImportStatusText('Creating native FocusFlow spreadsheet in Cloud Firestore...');

        let createdConn: SheetConnection;
        try {
          const res = await sheetHubStore.createDualCopySpreadsheet(
            activeUserId,
            {
              title: `${inspectData.title || 'FocusFlow Spreadsheet'} (Dual-Copy)`,
              sourceSpreadsheetId: spreadsheetId,
              driveFileId: driveDup.driveFileId,
              driveUrl: driveDup.driveUrl,
              tabs: processedTabs,
              progressTrackerTopics: topicsForTracker,
            }
          );
          createdConn = res.connection;

          // Reconcile operation as COMPLETED in the durable ledger
          await api.sheetHubDriveDuplicateReconcile(
            {
              operationId: effectiveOpId,
              driveFileId: driveDup.driveFileId,
              nativeSheetId: createdConn.id,
              status: 'COMPLETED',
            },
            dualCopyToken
          ).catch((e) => console.warn('[ConnectSheetWizard] Reconcile COMPLETED warning:', e));
        } catch (nativeErr: any) {
          // Reconcile operation as FAILED_REQUIRES_RECONCILIATION in the durable ledger
          await api.sheetHubDriveDuplicateReconcile(
            {
              operationId: effectiveOpId,
              driveFileId: driveDup.driveFileId,
              status: 'FAILED_REQUIRES_RECONCILIATION',
              errorMessage: nativeErr?.message || String(nativeErr),
            },
            dualCopyToken
          ).catch((e) => console.warn('[ConnectSheetWizard] Reconcile FAILED warning:', e));

          throw new Error(
            `Google Drive duplicate was preserved (${driveDup.driveFileId}), but native Firestore creation failed: ${nativeErr?.message || nativeErr}. Retrying will safely resume using this existing Drive duplicate without creating another file.`
          );
        }

        setImportProgress(100);
        setImportStatusText('Dual-Copy setup complete!');
        showToast(`Dual-Copy created! Saved to your Google Drive and FocusFlow Firestore.`, 'success');
        clearPersistedOpId(activeUserId, spreadsheetId);

        setTimeout(() => {
          onSuccess(createdConn.id);
        }, 400);
        return;
      }

      // BRANCH B: Standard Single-Copy / Public Link Import Pipeline
      setImportProgress(50);
      setImportStatusText('Saving spreadsheet connection document...');

      const connectionDoc: SheetConnection = {
        id: standardConnectionId,
        userId: activeUserId,
        ownerUid: activeUserId,
        spreadsheetId,
        spreadsheetUrl: canonicalSpreadsheetUrl,
        title: inspectData.title || 'Connected Spreadsheet',
        templateHint,
        // Preserves read-only import mode contract (syncMode: 'sheet_to_app')
        syncMode: selectedSyncMode,
        isPublicLink: isPublicLinkMode,
        pollIntervalSec: null,
        syncOnOpen: true,
        status: 'active',
        lastSyncedAt: nowIso,
        lastSuccessfulPullAt: nowIso,
        lastSuccessfulPushAt: null,
        lastError: null,
        pendingChangesCount: 0,
        conflictCount: 0,
        tabOrder: selectedTabIds.map((id) => `${standardConnectionId}__tab_${id}`),
        schemaVersion: 1,
        sortOrder: 0,
        isNative: false,
        createdAt: nowIso,
        updatedAt: nowIso,
        deletedAt: null,
      };

      await sheetHubStore.saveConnection(activeUserId, connectionDoc);

      setImportProgress(65);
      setImportStatusText('Saving tab schemas and chunked records...');

      for (let i = 0; i < processedTabs.length; i++) {
        const tabItem = processedTabs[i];
        const sheetId = tabItem.sheetId ?? i;
        const tabDocId = `${standardConnectionId}__tab_${sheetId}`;
        const keyCols = selectedKeyColumns[sheetId] || [];

        const chunkResult = await sheetHubStore.saveTabRowsChunked({
          userId: activeUserId,
          connectionId: standardConnectionId,
          tabId: tabDocId,
          rows: tabItem.rows,
        });

        const tabSchemaDoc: SheetTabSchema = {
          id: tabDocId,
          connectionId: standardConnectionId,
          userId: activeUserId,
          sheetId,
          sheetTitle: tabItem.sheetTitle,
          role: tabItem.role || 'data',
          headerRowIndex: 1,
          dataStartRow: 2,
          dataEndColumn: tabItem.columns[tabItem.columns.length - 1]?.colLetter || 'D',
          identityStrategy,
          identityColumns: keyCols,
          metadataIdColumn: null,
          columns: tabItem.columns,
          defaultView: preferredView === 'checklist' ? 'checklist' : 'table',
          groupByColumnId: tabItem.columns.find((c) => c.semanticRole === 'group')?.fieldKey || null,
          lastPullHash: 'pull_initial',
          rowCount: tabItem.rows.length,
          chunkCount: chunkResult.chunkCount,
          updatedAt: nowIso,
        };

        await sheetHubStore.saveTabSchema(activeUserId, tabSchemaDoc);
        setImportProgress(65 + Math.round(((i + 1) / processedTabs.length) * 30));
      }

      setImportProgress(100);
      setImportStatusText('Import complete!');
      showToast(`Successfully imported ${totalImportedRows.toLocaleString()} records!`, 'success');

      // Finish wizard and switch to workspace
      setTimeout(() => {
        onSuccess(standardConnectionId);
      }, 400);
    } catch (err: any) {
      console.error('[ConnectSheetWizard] Import pipeline failed:', err);
      setImportProgress(0);
      setImportError(err?.message || 'Import pipeline failed.');
      setCurrentStep('confirm');
    }
  };

  return (
    <div className="space-y-6 max-w-4xl mx-auto">
      {/* Wizard Header Bar & Stepper */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-[var(--ff-border-color)]">
        <div>
          <h2 className="text-xl font-bold text-[var(--ff-text-primary)] flex items-center gap-2.5">
            <FileSpreadsheet className="w-5 h-5 text-emerald-500" />
            <span>Connect Google Spreadsheet</span>
          </h2>
          <p className="text-xs text-[var(--ff-text-muted)] mt-1">
            Universal Sheet Sync Hub &bull; Checkbox Write-Back &amp; Two-Way Sync Import
          </p>
        </div>

        <ThemeButton variant="secondary" size="sm" onClick={onCancel}>
          Cancel
        </ThemeButton>
      </div>

      {/* Stepper Indicator */}
      <div className="flex items-center justify-between gap-1 overflow-x-auto pb-2 border-b border-[var(--ff-border-color)]/60 text-xs">
        {STEPS.map((s, idx) => {
          const isActive = currentStep === s.id;
          return (
            <div
              key={s.id}
              className={`flex items-center gap-1.5 px-3 py-1 rounded-lg font-medium whitespace-nowrap transition-colors ${
                isActive
                  ? 'bg-[var(--ff-accent-soft)] text-[var(--ff-accent-text)] font-bold border border-[var(--ff-accent-border)]'
                  : 'text-[var(--ff-text-muted)]'
              }`}
            >
              <span>{s.label}</span>
            </div>
          );
        })}
      </div>

      {/* STEP 1: Enter URL */}
      {currentStep === 'url' && (
        <ThemeCard variant="elevated" className="p-6 border border-[var(--ff-border-color)] space-y-5">
          <div>
            <h3 className="font-semibold text-base text-[var(--ff-text-primary)] mb-1">
              Step 1: Enter Google Spreadsheet URL
            </h3>
            <p className="text-xs text-[var(--ff-text-secondary)]">
              Paste the link to your Google Spreadsheet. It will be inspected and imported dynamically into FocusFlow.
            </p>
          </div>

          <div className="space-y-2">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <label className="text-xs font-semibold text-[var(--ff-text-muted)] uppercase tracking-wider block">
                Google Spreadsheet URL
              </label>
              <ThemeButton
                variant="secondary"
                size="sm"
                type="button"
                onClick={() => setIsPickerOpen(true)}
                className="text-xs py-1 px-2.5 bg-emerald-600/10 border border-emerald-500/30 text-emerald-600 hover:bg-emerald-600/20"
                title="Select directly from your Google Drive using Google Picker"
              >
                <FolderSync className="w-3.5 h-3.5 mr-1 text-emerald-500" />
                <span>Browse My Google Drive</span>
              </ThemeButton>
            </div>
            <ThemeInput
              placeholder="https://docs.google.com/spreadsheets/d/1BxiMVs0XRA5nFMdKvBdBZjgmUUqptlbs74OgvE2upms/edit"
              value={urlInput}
              onChange={(e) => {
                const newVal = e.target.value;
                setUrlInput(newVal);
                setUrlError(null);
                setInspectError(null);
                setInspectErrorCode(null);
                // Bug 3 & Task 6: Clear stale inspectData, tab selections, and client session op ID when URL changes
                setInspectData(null);
                setSelectedTabIds([]);
                setTabRoles({});
                setTabColumns({});
                setSelectedKeyColumns({});
                const activeUid = firebaseUser?.uid || auth.currentUser?.uid || user?.id || 'usr_guest';
                if (spreadsheetId) {
                  clearPersistedOpId(activeUid, spreadsheetId);
                }
                setDuplicationOpId('');
                setPersistedDriveDuplicate(null);
                const parsed = parseGoogleSheetUrl(newVal);
                if (parsed.ok) {
                  setSpreadsheetId(parsed.spreadsheetId);
                }
              }}
            />
            {urlError && <p className="text-xs text-rose-500 font-medium">{urlError}</p>}
            {inspectError && (
              <div className="p-3 rounded-lg bg-rose-500/10 border border-rose-500/25 text-xs text-rose-500 flex items-start gap-2">
                <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
                <div className="space-y-1">
                  <p className="font-semibold">Unable to inspect spreadsheet</p>
                  <p className="leading-relaxed opacity-95">{inspectError}</p>
                </div>
              </div>
            )}
          </div>

          <div className="p-4 rounded-xl bg-amber-500/10 border border-amber-500/20 text-xs text-amber-500 space-y-1">
            <span className="font-semibold block flex items-center gap-1.5">
              <ShieldCheck className="w-4 h-4 shrink-0" /> Read-Only &amp; Safe — Public Link or Google Auth
            </span>
            <p className="text-[11px] opacity-90">
              For sheets shared as &ldquo;Anyone with the link → Viewer&rdquo;, click <strong>Connect Public Link</strong> to import instantly without a Google sign-in popup. For private sheets, continue to read-only Google authorization.
            </p>
          </div>

          {/* Quick Demo Option */}
          <div className="p-4 rounded-xl bg-[var(--ff-surface-muted)] border border-[var(--ff-border-color)] flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div>
              <span className="text-xs font-bold text-[var(--ff-text-primary)] block">
                ⚡ Quick Demo: Semester 3 Syllabus Tracker
              </span>
              <span className="text-[11px] text-[var(--ff-text-muted)]">
                Instantly test with the reference 5-tab, 597-topic syllabus tracker fixture.
              </span>
            </div>
            <ThemeButton variant="secondary" size="sm" onClick={handleLoadSemester3Demo}>
              Load Demo Fixture
            </ThemeButton>
          </div>

          <div className="flex flex-wrap items-center justify-end gap-2.5 pt-4 border-t border-[var(--ff-border-color)]">
            <ThemeButton
              variant="secondary"
              onClick={() => {
                const raw = urlInput.trim();
                if (!handleValidateUrl(raw)) return;
                const parsed = parseGoogleSheetUrl(raw);
                if (parsed.ok) {
                  void handleInspectPublicLink(parsed.spreadsheetId, raw);
                }
              }}
            >
              <ExternalLink className="w-4 h-4 inline mr-1.5" />
              Connect Public Link (No Sign-In)
            </ThemeButton>

            <ThemeButton
              variant="primary"
              onClick={() => {
                if (handleValidateUrl()) {
                  setInspectError(null);
                  setInspectErrorCode(null);
                  setAuthLocalError(null);
                  setCurrentStep('auth');
                }
              }}
            >
              Continue to Access Options <ArrowRight className="w-4 h-4 inline ml-1" />
            </ThemeButton>
          </div>
        </ThemeCard>
      )}

      {/* STEP 2: Access Method & Google Authorization */}
      {currentStep === 'auth' && (
        <ThemeCard variant="elevated" className="p-6 border border-[var(--ff-border-color)] space-y-5">
          <div>
            <h3 className="font-semibold text-base text-[var(--ff-text-primary)] mb-1">
              Step 2: Choose How to Access Your Google Sheet
            </h3>
            <p className="text-xs text-[var(--ff-text-secondary)]">
              Import instantly via a public viewer link (zero OAuth sign-in), or authorize private read-only access via Google (<code className="font-mono">spreadsheets.readonly</code>).
            </p>
          </div>

          {inspectError && (
            <div className="p-3.5 rounded-lg bg-rose-500/10 border border-rose-500/25 text-xs text-rose-500 space-y-2">
              <div className="flex items-start gap-2">
                <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
                <div className="space-y-1">
                  <p className="font-semibold">
                    {inspectErrorCode === 'SHEET_PRIVATE_AUTH_REQUIRED'
                      ? 'This Spreadsheet Is Private'
                      : 'Spreadsheet Inspection Error'}
                  </p>
                  <p className="leading-relaxed">{inspectError}</p>
                  {inspectErrorCode === 'SHEET_PRIVATE_AUTH_REQUIRED' && (
                    <div className="pt-1.5 space-y-2">
                      <p className="text-[11px] opacity-90 leading-relaxed">
                        Tip: For private spreadsheets in your Google Drive, select it with <strong>Browse My Google Drive</strong> to grant per-file authorization via Google Picker under <code className="font-mono">drive.file</code>. Alternatively, in Google Sheets set <strong>Share → Anyone with the link (Viewer)</strong> and click <strong>Import Public Link</strong> below.
                      </p>
                      <ThemeButton
                        variant="secondary"
                        size="sm"
                        type="button"
                        onClick={() => setIsPickerOpen(true)}
                        className="text-xs"
                      >
                        <FolderSync className="w-3.5 h-3.5 mr-1 text-[var(--ff-accent)]" />
                        Select via Browse My Google Drive
                      </ThemeButton>
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* Option A: Instant Public Link Mode */}
          <div className="p-4 rounded-xl border border-emerald-500/30 bg-emerald-500/5 space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span className="text-xs font-bold text-[var(--ff-text-primary)] flex items-center gap-1.5">
                <Sparkles className="w-4 h-4 text-emerald-500 shrink-0" />
                Option A: Public Viewer Link (Recommended — Zero OAuth)
              </span>
              <ThemeBadge tone="success" className="text-[10px]">
                No 403 Block
              </ThemeBadge>
            </div>
            <p className="text-xs text-[var(--ff-text-secondary)] leading-relaxed">
              Works immediately for any Google Sheet shared as <strong>&ldquo;Anyone with the link → Viewer&rdquo;</strong> — imports all tabs, headers, formulas, and checkboxes without triggering Google OAuth consent screens or popup blockers.
            </p>
            <div className="flex flex-wrap items-center gap-2">
              <ThemeButton
                variant="success"
                onClick={() => void handleInspectPublicLink()}
                disabled={isInspecting}
                className="w-full sm:w-auto"
              >
                <ExternalLink className="w-4 h-4 mr-1.5" />
                <span>Import Public Link (Zero Auth)</span>
              </ThemeButton>
            </div>
          </div>

          {/* Option B: Private Sheet via Google OAuth */}
          <div className="p-4 rounded-xl border border-[var(--ff-border-color)] bg-[var(--ff-surface-muted)] space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span className="text-xs font-bold text-[var(--ff-text-primary)] flex items-center gap-1.5">
                <Lock className="w-4 h-4 text-[var(--ff-accent)] shrink-0" />
                Option B: Private Sheet via Google Sign-In
              </span>
              {firebaseUser ? (
                <ThemeBadge tone="success" className="text-xs flex items-center gap-1">
                  <Check className="w-3 h-3" /> Signed in as {firebaseUser.email}
                </ThemeBadge>
              ) : (
                <ThemeBadge tone="warning" className="text-xs">
                  Guest / Not Signed In
                </ThemeBadge>
              )}
            </div>

            <p className="text-xs text-[var(--ff-text-muted)]">
              Uses least-privilege read-only Google Sheets access (<code className="font-mono">spreadsheets.readonly</code>) for private spreadsheets. Never modifies your sheet or requests Drive permissions.
            </p>

            {authLocalError && (
              <div className="p-3.5 rounded-lg bg-rose-500/10 border border-rose-500/20 text-xs text-rose-500 space-y-2">
                <div className="flex items-start gap-2">
                  <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
                  <p className="leading-relaxed font-medium">{authLocalError}</p>
                </div>
              </div>
            )}

            {detectEmbeddedIframe() && (
              <div
                className="p-3 rounded-lg border flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-xs"
                style={{
                  background: 'rgba(234, 179, 8, 0.08)',
                  borderColor: 'rgba(234, 179, 8, 0.25)',
                }}
              >
                <span className="text-[11px] text-[var(--ff-text-secondary)]">
                  Running inside an embedded preview frame. If Google Sign-In popups close automatically, open the app in a full browser tab or use <strong>Option A (Public Link)</strong> above.
                </span>
                <a
                  href={getCurrentAppUrl() || '#'}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="ff-btn ff-btn-secondary px-3 py-1.5 text-xs inline-flex items-center gap-1.5 shrink-0"
                >
                  <span>Open in New Tab</span>
                  <ExternalLink className="w-3 h-3" />
                </a>
              </div>
            )}

            {/* Google Cloud Testing Mode Guidance (Dynamic Project ID & Routing) */}
            <div
              className="p-3.5 rounded-lg border space-y-2.5 text-xs"
              style={{
                background: 'rgba(234, 179, 8, 0.06)',
                borderColor: 'rgba(234, 179, 8, 0.2)',
              }}
            >
              <div className="flex items-center justify-between gap-2 font-semibold text-amber-500">
                <div className="flex items-center gap-1.5">
                  <AlertTriangle className="w-4 h-4 shrink-0" />
                  <span>OAuth Project Routing & Testing Mode (Error 403)</span>
                </div>
                <span className="text-[10px] uppercase font-mono px-1.5 py-0.5 rounded bg-amber-500/10 border border-amber-500/20">
                  Dual-Provider Architecture
                </span>
              </div>
              <p className="text-[11px] text-[var(--ff-text-secondary)] leading-relaxed">
                If Google displays <em>&ldquo;Access blocked (Error 403: access_denied)&rdquo;</em> while authorizing, your email ({firebaseUser?.email || 'your Google account'}) must be added to the <strong>Test Users</strong> list of the corresponding Google Cloud project:
              </p>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-[11px]">
                <div className="p-2 rounded bg-[var(--ff-surface-subtle)] border border-[var(--ff-border-color)] space-y-1">
                  <div className="flex items-center justify-between font-semibold text-[var(--ff-text-primary)]">
                    <span>Direct Write & Read-Only</span>
                    <span className="font-mono text-[10px] text-emerald-500">{activeFirebaseConfig.projectId}</span>
                  </div>
                  <p className="text-[10px] text-[var(--ff-text-muted)]">
                    Uses Firebase Google OAuth. Required for checkbox write-back & read-only pull.
                  </p>
                  <a
                    href={`https://console.cloud.google.com/apis/credentials/consent?project=${encodeURIComponent(activeFirebaseConfig.projectId)}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-[var(--ff-accent)] hover:underline font-medium inline-flex items-center gap-0.5 pt-0.5"
                  >
                    {activeFirebaseConfig.projectId} Consent Screen → Test users <ExternalLink className="w-2.5 h-2.5" />
                  </a>
                </div>

                <div className="p-2 rounded bg-[var(--ff-surface-subtle)] border border-[var(--ff-border-color)] space-y-1">
                  <div className="flex items-center justify-between font-semibold text-[var(--ff-text-primary)]">
                    <span>Dual-Copy & Drive Picker</span>
                    <span className="font-mono text-[10px] text-blue-500">{GHOST_PROJECT_ID}</span>
                  </div>
                  <p className="text-[10px] text-[var(--ff-text-muted)]">
                    Uses Google Identity Services (GIS). Required for Drive duplication & file picker.
                  </p>
                  <a
                    href={`https://console.cloud.google.com/apis/credentials/consent?project=${encodeURIComponent(GHOST_PROJECT_ID)}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-[var(--ff-accent)] hover:underline font-medium inline-flex items-center gap-0.5 pt-0.5"
                  >
                    {GHOST_PROJECT_ID} Consent Screen → Test users <ExternalLink className="w-2.5 h-2.5" />
                  </a>
                </div>
              </div>
              <div className="text-[10px] text-[var(--ff-text-muted)] pt-0.5">
                💡 Tip: Use <strong>Option A (Public Link)</strong> above for immediate read-only import with zero OAuth or Test Users setup.
              </div>
            </div>

            <div className="pt-1 flex flex-wrap items-center gap-2.5">
              <ThemeButton
                variant="primary"
                onClick={handleAuthorizeGoogleDriveDualCopy}
                disabled={isAuthorizingWrite || isAuthorizing}
                className="w-full sm:w-auto bg-emerald-600 hover:bg-emerald-500 text-white font-semibold"
                title={`Authorize personal Google Drive copy & live Sheets two-way sync via ${GHOST_PROJECT_ID} OAuth`}
              >
                <FolderSync className="w-4 h-4 mr-1.5" />
                <span>
                  {isAuthorizingWrite
                    ? 'Authorizing Google Drive...'
                    : `Authorize Dual-Copy (${GHOST_PROJECT_ID})`}
                </span>
              </ThemeButton>

              <ThemeButton
                variant="secondary"
                onClick={handleAuthorizeGoogleWrite}
                disabled={isAuthorizingWrite || isAuthorizing}
                className="w-full sm:w-auto"
                title={`Authorize two-way checkbox writeback to existing Google Sheet via ${activeFirebaseConfig.projectId}`}
              >
                <ShieldCheck className="w-4 h-4 mr-1.5 text-emerald-500" />
                <span>
                  {isAuthorizingWrite
                    ? 'Authorizing Edit Access...'
                    : 'Authorize Two-Way Checkbox Write-Back (Recommended)'}
                </span>
                <span className="ml-1.5 font-mono text-[10px] px-1 py-0.5 rounded bg-[var(--ff-surface)] border border-[var(--ff-border-color)] text-emerald-500">
                  {activeFirebaseConfig.projectId}
                </span>
              </ThemeButton>

              <ThemeButton
                variant="secondary"
                onClick={handleAuthorizeGoogleReadOnly}
                disabled={isAuthorizingWrite || isAuthorizing}
                className="w-full sm:w-auto"
                title={`Only pull data from Google Sheets into FocusFlow via ${activeFirebaseConfig.projectId} (no write-back)`}
              >
                <Eye className="w-4 h-4 mr-1.5 text-[var(--ff-accent)]" />
                <span>
                  {isAuthorizing ? 'Authorizing Read-Only...' : 'Authorize Read-Only Access'}
                </span>
                <span className="ml-1.5 font-mono text-[10px] px-1 py-0.5 rounded bg-[var(--ff-surface)] border border-[var(--ff-border-color)] text-[var(--ff-accent)]">
                  {activeFirebaseConfig.projectId}
                </span>
              </ThemeButton>

              <ThemeButton
                variant="secondary"
                onClick={handleLoadSemester3Demo}
                title="Use local demo fixture without Google OAuth"
                className="w-full sm:w-auto"
              >
                <Sparkles className="w-4 h-4 mr-1.5 text-amber-500" />
                <span>Load Demo Fixture</span>
              </ThemeButton>
            </div>
          </div>

          <div className="flex flex-wrap items-center justify-between gap-2 pt-4 border-t border-[var(--ff-border-color)]">
            <ThemeButton variant="secondary" onClick={() => setCurrentStep('url')}>
              <ArrowLeft className="w-4 h-4 inline mr-1" /> Back
            </ThemeButton>

            <ThemeButton
              variant="secondary"
              onClick={() => void handleContinueWithExistingAuth()}
              title="Continue using an active Google Sheets token already granted in this session"
            >
              Continue with Existing Auth <ArrowRight className="w-4 h-4 inline ml-1" />
            </ThemeButton>
          </div>
        </ThemeCard>
      )}

      {/* STEP 3: Inspecting Loading State */}
      {currentStep === 'inspect' && (
        <ThemeCard variant="elevated" className="p-12 text-center border border-[var(--ff-border-color)] space-y-4">
          <RotateCcw className="w-8 h-8 text-[var(--ff-accent)] animate-spin mx-auto" />
          <h3 className="font-bold text-base text-[var(--ff-text-primary)]">Inspecting Spreadsheet...</h3>
          <p className="text-xs text-[var(--ff-text-muted)] max-w-sm mx-auto">
            Reading workbook structure, discovering tabs, inferring headers, and detecting data validation...
          </p>
        </ThemeCard>
      )}

      {/* STEP 4: Tab Selection */}
      {currentStep === 'tabs' && inspectData && (
        <ThemeCard variant="elevated" className="p-6 border border-[var(--ff-border-color)] space-y-5">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="font-semibold text-base text-[var(--ff-text-primary)] mb-1">
                Step 3: Select Tabs to Import
              </h3>
              <p className="text-xs text-[var(--ff-text-secondary)]">
                Discovered <strong>{inspectData.tabs.length} tabs</strong> in &ldquo;{inspectData.title}&rdquo;. Select which tabs to include in your workspace.
              </p>
            </div>
          </div>

          <div className="space-y-2">
            {inspectData.tabs.map((tab) => {
              const isSelected = selectedTabIds.includes(tab.sheetId);
              const isOverview = isTabOverview(tab.sheetTitle, tab.role);
              const currentRole = tabRoles[tab.sheetId] || (isOverview ? 'overview' : tab.role);

              return (
                <div
                  key={tab.sheetId}
                  className={`flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-3.5 rounded-xl border transition-all ${
                    isSelected
                      ? 'border-[var(--ff-accent)] bg-[var(--ff-surface)] shadow-sm'
                      : 'border-[var(--ff-border-color)] bg-[var(--ff-surface-muted)] opacity-60'
                  }`}
                >
                  <label className="flex items-center gap-3 cursor-pointer select-none min-w-0">
                    <input
                      type="checkbox"
                      checked={isSelected}
                      onChange={() => toggleTabSelection(tab.sheetId)}
                      className="rounded accent-[var(--ff-accent)] w-4 h-4 cursor-pointer"
                    />
                    <div className="min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-semibold text-sm text-[var(--ff-text-primary)] block truncate">
                          {tab.sheetTitle}
                        </span>
                        {isOverview && (
                          <ThemeBadge tone="warning" className="text-[10px]">
                            Overview / Summary Tab (Excluded by default)
                          </ThemeBadge>
                        )}
                      </div>
                      <span className="text-xs text-[var(--ff-text-muted)]">
                        {tab.columns.length} columns &bull; Header row {tab.headerRowIndex}
                      </span>
                    </div>
                  </label>

                  <div className="flex items-center gap-2 shrink-0">
                    <button
                      type="button"
                      onClick={() => toggleTabSelection(tab.sheetId)}
                      className={`text-xs px-2.5 py-1 rounded-lg border font-medium transition-colors ${
                        isSelected
                          ? 'border-emerald-500/40 bg-emerald-500/10 text-emerald-400'
                          : 'border-[var(--ff-border-color)] bg-[var(--ff-surface-muted)] text-[var(--ff-text-muted)]'
                      }`}
                    >
                      {isSelected ? 'Included' : 'Skipped'}
                    </button>

                    <select
                      value={currentRole}
                      disabled={!isSelected}
                      onChange={(e) =>
                        setTabRoles((prev) => ({ ...prev, [tab.sheetId]: e.target.value as SheetTabRole }))
                      }
                      className="text-xs py-1 px-2.5 rounded-lg bg-[var(--ff-surface)] border border-[var(--ff-border-color)] text-[var(--ff-text-primary)]"
                    >
                      <option value="data">Data Tab (Rows)</option>
                      <option value="overview">Overview / KPI</option>
                      <option value="ignored">Ignore Tab</option>
                    </select>

                    {isSelected && (
                      <ThemeButton
                        variant="secondary"
                        size="sm"
                        onClick={() => {
                          setActiveEditingTabId(tab.sheetId);
                          setCurrentStep('mapping');
                        }}
                      >
                        Map Columns
                      </ThemeButton>
                    )}
                  </div>
                </div>
              );
            })}
          </div>

          <div className="flex items-center justify-between pt-4 border-t border-[var(--ff-border-color)]">
            <ThemeButton variant="secondary" onClick={() => setCurrentStep('url')}>
              <ArrowLeft className="w-4 h-4 inline mr-1" /> Back
            </ThemeButton>

            <ThemeButton
              variant="primary"
              disabled={selectedTabIds.length === 0}
              onClick={() => {
                if (!activeEditingTabId) {
                  setActiveEditingTabId(selectedTabIds[0]);
                }
                setCurrentStep('mapping');
              }}
            >
              Continue to Column Mapping <ArrowRight className="w-4 h-4 inline ml-1" />
            </ThemeButton>
          </div>
        </ThemeCard>
      )}

      {/* STEP 5: Column Mapping */}
      {currentStep === 'mapping' && activeEditingTabId && inspectData && (
        <ThemeCard variant="elevated" className="p-6 border border-[var(--ff-border-color)] space-y-5">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div>
              <h3 className="font-semibold text-base text-[var(--ff-text-primary)] mb-1">
                Step 4: Column Mapping &amp; Protection
              </h3>
              <p className="text-xs text-[var(--ff-text-secondary)]">
                Review detected field types, roles, and formula protection rules for each column.
              </p>
            </div>

            {/* Tab Switcher */}
            <div className="flex items-center gap-1.5 overflow-x-auto pb-1">
              {selectedTabIds.map((sId) => {
                const tab = inspectData.tabs.find((t) => t.sheetId === sId);
                const isActive = activeEditingTabId === sId;
                return (
                  <button
                    key={sId}
                    type="button"
                    onClick={() => setActiveEditingTabId(sId)}
                    className={`px-2.5 py-1 text-xs rounded-lg font-medium transition-colors whitespace-nowrap ${
                      isActive
                        ? 'bg-[var(--ff-accent)] text-[var(--ff-accent-contrast)] font-bold'
                        : 'bg-[var(--ff-surface-muted)] text-[var(--ff-text-muted)] hover:text-[var(--ff-text-primary)]'
                    }`}
                  >
                    {tab?.sheetTitle}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Embedded Schema Mapping Editor */}
          <SchemaMappingEditor
            columns={tabColumns[activeEditingTabId] || []}
            selectedKeyColumns={selectedKeyColumns[activeEditingTabId] || []}
            onChangeColumns={(cols) => setTabColumns((prev) => ({ ...prev, [activeEditingTabId]: cols }))}
            onToggleKeyColumn={(fieldKey) => toggleKeyColumn(activeEditingTabId, fieldKey)}
          />

          <div className="flex items-center justify-between pt-4 border-t border-[var(--ff-border-color)]">
            <ThemeButton variant="secondary" onClick={() => setCurrentStep('tabs')}>
              <ArrowLeft className="w-4 h-4 inline mr-1" /> Back to Tabs
            </ThemeButton>

            <ThemeButton variant="primary" onClick={() => setCurrentStep('identity')}>
              Continue to Row Identity <ArrowRight className="w-4 h-4 inline ml-1" />
            </ThemeButton>
          </div>
        </ThemeCard>
      )}

      {/* STEP 6: Row Identity */}
      {currentStep === 'identity' && inspectData && (
        <ThemeCard variant="elevated" className="p-6 border border-[var(--ff-border-color)] space-y-5">
          <div>
            <h3 className="font-semibold text-base text-[var(--ff-text-primary)] mb-1">
              Step 5: Row Identity Strategy
            </h3>
            <p className="text-xs text-[var(--ff-text-secondary)]">
              FocusFlow NEVER relies on volatile row numbers as permanent IDs. Choose how records are uniquely identified.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div
              onClick={() => setIdentityStrategy('composite_key')}
              className={`p-4 rounded-xl border cursor-pointer select-none transition-all ${
                identityStrategy === 'composite_key'
                  ? 'border-[var(--ff-accent)] bg-[var(--ff-surface)] shadow-md'
                  : 'border-[var(--ff-border-color)] bg-[var(--ff-surface-muted)] opacity-70'
              }`}
            >
              <div className="flex items-center justify-between mb-2">
                <span className="font-bold text-sm text-[var(--ff-text-primary)] flex items-center gap-1.5">
                  <Key className="w-4 h-4 text-[var(--ff-accent)]" />
                  <span>Composite Key (Recommended)</span>
                </span>
                {identityStrategy === 'composite_key' && <Check className="w-4 h-4 text-emerald-500" />}
              </div>
              <p className="text-xs text-[var(--ff-text-muted)]">
                Combines multiple columns (e.g. Module + Topic + Subtopic) into a stable deterministic hash. Zero modification to your Google Sheet.
              </p>
            </div>

            <div
              onClick={() => setIdentityStrategy('column_key')}
              className={`p-4 rounded-xl border cursor-pointer select-none transition-all ${
                identityStrategy === 'column_key'
                  ? 'border-[var(--ff-accent)] bg-[var(--ff-surface)] shadow-md'
                  : 'border-[var(--ff-border-color)] bg-[var(--ff-surface-muted)] opacity-70'
              }`}
            >
              <div className="flex items-center justify-between mb-2">
                <span className="font-bold text-sm text-[var(--ff-text-primary)] flex items-center gap-1.5">
                  <FileSpreadsheet className="w-4 h-4 text-emerald-500" />
                  <span>Single Unique Column</span>
                </span>
                {identityStrategy === 'column_key' && <Check className="w-4 h-4 text-emerald-500" />}
              </div>
              <p className="text-xs text-[var(--ff-text-muted)]">
                Uses an existing ID column (e.g. Task ID, Topic Code, SKU). Best when your spreadsheet already has unique IDs.
              </p>
            </div>
          </div>

          <div className="flex items-center justify-between pt-4 border-t border-[var(--ff-border-color)]">
            <ThemeButton variant="secondary" onClick={() => setCurrentStep('mapping')}>
              <ArrowLeft className="w-4 h-4 inline mr-1" /> Back
            </ThemeButton>

            <ThemeButton variant="primary" onClick={() => setCurrentStep('view')}>
              Continue to View Selection <ArrowRight className="w-4 h-4 inline ml-1" />
            </ThemeButton>
          </div>
        </ThemeCard>
      )}

      {/* STEP 7: View Selection */}
      {currentStep === 'view' && (
        <ThemeCard variant="elevated" className="p-6 border border-[var(--ff-border-color)] space-y-5">
          <div>
            <h3 className="font-semibold text-base text-[var(--ff-text-primary)] mb-1">
              Step 6: Choose Workspace View
            </h3>
            <p className="text-xs text-[var(--ff-text-secondary)]">
              Choose the primary display layout for your data tabs. You can easily switch views anytime.
            </p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
            {(
              [
                {
                  id: 'checklist',
                  label: 'Hierarchical Checklist',
                  desc: 'Nested modules & topics with completion status. Best for study trackers and syllabi.',
                },
                {
                  id: 'table',
                  label: 'Data Table',
                  desc: 'Classic spreadsheet grid with sortable columns, formulas, and high-density view.',
                },
                {
                  id: 'cards',
                  label: 'Cards Grid',
                  desc: 'Responsive cards for content-rich records, book summaries, or video trackers.',
                },
                {
                  id: 'grouped_list',
                  label: 'Grouped List',
                  desc: 'Grouped sections by categories or priority levels.',
                },
              ] as const
            ).map((v) => (
              <div
                key={v.id}
                onClick={() => setPreferredView(v.id)}
                className={`p-4 rounded-xl border cursor-pointer select-none transition-all ${
                  preferredView === v.id
                    ? 'border-[var(--ff-accent)] bg-[var(--ff-surface)] shadow-md'
                    : 'border-[var(--ff-border-color)] bg-[var(--ff-surface-muted)] opacity-70'
                }`}
              >
                <div className="flex items-center justify-between mb-1.5">
                  <span className="font-bold text-sm text-[var(--ff-text-primary)]">{v.label}</span>
                  {preferredView === v.id && <Check className="w-4 h-4 text-emerald-500" />}
                </div>
                <p className="text-xs text-[var(--ff-text-muted)]">{v.desc}</p>
              </div>
            ))}
          </div>

          <div className="flex items-center justify-between pt-4 border-t border-[var(--ff-border-color)]">
            <ThemeButton variant="secondary" onClick={() => setCurrentStep('identity')}>
              <ArrowLeft className="w-4 h-4 inline mr-1" /> Back
            </ThemeButton>

            <ThemeButton variant="primary" onClick={() => setCurrentStep('confirm')}>
              Continue to Confirmation <ArrowRight className="w-4 h-4 inline ml-1" />
            </ThemeButton>
          </div>
        </ThemeCard>
      )}

      {/* STEP 8: Confirmation & Start Import */}
      {currentStep === 'confirm' && inspectData && (
        <ThemeCard variant="elevated" className="p-6 border border-[var(--ff-border-color)] space-y-5">
          <div>
            <h3 className="font-semibold text-base text-[var(--ff-text-primary)] mb-1">
              Step 7: Confirm &amp; Import
            </h3>
            <p className="text-xs text-[var(--ff-text-secondary)]">
              Review your import configuration. Clicking Start Import will pull the spreadsheet records into FocusFlow.
            </p>
          </div>

          <div className="p-4 rounded-xl bg-[var(--ff-surface-muted)] border border-[var(--ff-border-color)] space-y-2 text-xs">
            <div className="flex justify-between py-1 border-b border-[var(--ff-border-color)]">
              <span className="text-[var(--ff-text-muted)]">Spreadsheet</span>
              <span className="font-semibold text-[var(--ff-text-primary)]">{inspectData.title}</span>
            </div>
            <div className="flex justify-between py-1 border-b border-[var(--ff-border-color)]">
              <span className="text-[var(--ff-text-muted)]">Selected Tabs</span>
              <span className="font-semibold text-[var(--ff-text-primary)]">
                {selectedTabIds.length} tabs ({selectedTabIds.map((id) => inspectData.tabs.find((t) => t.sheetId === id)?.sheetTitle).join(', ')})
              </span>
            </div>
            <div className="flex justify-between py-1 border-b border-[var(--ff-border-color)]">
              <span className="text-[var(--ff-text-muted)]">Identity Strategy</span>
              <span className="font-semibold text-[var(--ff-text-primary)] capitalize">
                {identityStrategy.replace('_', ' ')}
              </span>
            </div>
            <div className="flex justify-between py-1 border-b border-[var(--ff-border-color)]">
              <span className="text-[var(--ff-text-muted)]">Default View</span>
              <span className="font-semibold text-[var(--ff-text-primary)] capitalize">{preferredView}</span>
            </div>
            <div className="flex flex-col sm:flex-row sm:items-center justify-between py-2 gap-2">
              <span className="text-[var(--ff-text-muted)]">Sync Boundary</span>
              <div className="flex items-center gap-2">
                <span
                  className={`font-semibold px-2 py-0.5 rounded text-[11px] ${
                    selectedSyncMode === 'two_way'
                      ? 'text-emerald-400 bg-emerald-500/10 border border-emerald-500/20'
                      : selectedSyncMode === 'manual_only'
                      ? 'text-amber-400 bg-amber-500/10 border border-amber-500/20'
                      : 'text-blue-400 bg-blue-500/10 border border-blue-500/20'
                  }`}
                >
                  {selectedSyncMode === 'two_way'
                    ? 'FocusFlow → Google Sheet Automatic Checkbox Write-Back'
                    : selectedSyncMode === 'manual_only'
                    ? 'Batch Push (FocusFlow → Google Sheet)'
                    : 'Google Sheet → FocusFlow (Read-Only)'}
                </span>

                {isPublicLinkMode ? (
                  <span className="text-[11px] text-[var(--ff-text-secondary)] italic">
                    Public link import is strictly read-only (zero OAuth). Write-back is disabled.
                  </span>
                ) : (
                  <select
                    value={selectedSyncMode}
                    onChange={(e) => setSelectedSyncMode(e.target.value as SheetSyncMode)}
                    className="bg-[var(--ff-surface-subtle)] border border-[var(--ff-border-color)] text-[var(--ff-text-primary)] text-xs rounded px-2 py-0.5 outline-none"
                    aria-label="Select Sync Mode"
                  >
                    <option value="two_way">FocusFlow → Google Sheet Automatic Checkbox Write-Back</option>
                    <option value="manual_only">Batch Push (Push Button)</option>
                    <option value="sheet_to_app">Read-Only (Sheet → App)</option>
                  </select>
                )}
              </div>
            </div>
          </div>

          {/* Dual-Copy Google Drive + Firestore Architecture Card */}
          {!isPublicLinkMode && !isDemoMode && (
            <div className="p-4 rounded-xl border border-emerald-500/30 bg-emerald-500/5 space-y-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <FolderSync className="w-4 h-4 text-emerald-500 shrink-0" />
                  <span className="text-xs font-bold text-[var(--ff-text-primary)]">
                    Dual-Copy Architecture (Google Drive + FocusFlow Firestore)
                  </span>
                </div>
                <label className="flex items-center gap-2 text-xs font-medium cursor-pointer">
                  <input
                    type="checkbox"
                    checked={isDualCopyEnabled}
                    onChange={(e) => setIsDualCopyEnabled(e.target.checked)}
                    className="rounded border-[var(--ff-border-color)] text-emerald-500 focus:ring-emerald-500"
                  />
                  <span>Enable Dual-Copy</span>
                </label>
              </div>

              {isDualCopyEnabled ? (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs pt-1">
                  <div className="p-2.5 rounded-lg bg-[var(--ff-surface)] border border-[var(--ff-border-color)]">
                    <span className="font-semibold text-emerald-600 dark:text-emerald-400 block mb-1">
                      📂 1. Google Drive Duplicate
                    </span>
                    <p className="text-[11px] text-[var(--ff-text-secondary)] leading-relaxed">
                      Creates an isolated duplicate copy in your personal Google Drive with a dedicated <strong>&ldquo;Progress Tracker&rdquo;</strong> tab. Source sheet stays completely untouched!
                    </p>
                  </div>
                  <div className="p-2.5 rounded-lg bg-[var(--ff-surface)] border border-[var(--ff-border-color)]">
                    <span className="font-semibold text-blue-600 dark:text-blue-400 block mb-1">
                      ⚡ 2. FocusFlow Native Firestore
                    </span>
                    <p className="text-[11px] text-[var(--ff-text-secondary)] leading-relaxed">
                      Creates a private native spreadsheet in Cloud Firestore with full offline support, fast checklist views, and two-way writeback.
                    </p>
                  </div>
                </div>
              ) : (
                <p className="text-xs text-[var(--ff-text-muted)]">
                  Dual-Copy is disabled. FocusFlow will connect directly to the source spreadsheet in read-only or manual push mode.
                </p>
              )}
            </div>
          )}

          {inspectData.spreadsheetId !== spreadsheetId && (
            <div className="p-3 rounded-lg bg-rose-500/10 border border-rose-500/25 text-xs text-rose-500 flex items-center gap-2">
              <AlertCircle className="w-4 h-4 shrink-0" />
              <span>
                Spreadsheet ID mismatch: inspected sheet ({inspectData.spreadsheetId}) does not match current selection ({spreadsheetId}). Please re-inspect before importing.
              </span>
            </div>
          )}

          {importError && (
            <div className="p-3 rounded-lg bg-rose-500/10 border border-rose-500/20 text-rose-500 text-xs flex items-center gap-2">
              <AlertCircle className="w-4 h-4 shrink-0" />
              <span>{importError}</span>
            </div>
          )}

          <div className="flex items-center justify-between pt-4 border-t border-[var(--ff-border-color)]">
            <ThemeButton variant="secondary" onClick={() => setCurrentStep('view')}>
              <ArrowLeft className="w-4 h-4 inline mr-1" /> Back
            </ThemeButton>

            <ThemeButton
              variant="primary"
              onClick={executeImportPipeline}
              disabled={
                !inspectData ||
                inspectData.spreadsheetId !== spreadsheetId ||
                selectedTabIds.length === 0 ||
                isInspecting ||
                (!isDemoMode && !isPublicLinkMode && !oauthToken)
              }
              title={
                !inspectData || inspectData.spreadsheetId !== spreadsheetId
                  ? 'Please complete spreadsheet inspection first'
                  : selectedTabIds.length === 0
                  ? 'Select at least one tab'
                  : 'Start Import'
              }
            >
              Start Import <Check className="w-4 h-4 inline ml-1" />
            </ThemeButton>
          </div>
        </ThemeCard>
      )}

      {/* STEP 9: Importing Progress State */}
      {currentStep === 'importing' && (
        <ThemeCard variant="elevated" className="p-8 border border-[var(--ff-border-color)] text-center space-y-4">
          <RotateCcw className="w-8 h-8 text-[var(--ff-accent)] animate-spin mx-auto" />
          <h3 className="font-bold text-base text-[var(--ff-text-primary)]">Importing Spreadsheet Data</h3>
          <p className="text-xs text-[var(--ff-text-muted)]">{importStatusText}</p>

          <div className="max-w-md mx-auto pt-2">
            <AnimatedProgressBar value={importProgress} max={100} heightClass="h-2" />
          </div>
          <span className="text-xs font-mono text-[var(--ff-accent)]">{importProgress}%</span>
        </ThemeCard>
      )}

      <GoogleSheetPickerModal
        isOpen={isPickerOpen}
        onClose={() => setIsPickerOpen(false)}
        onSelectSheet={handleSelectPickedSheet}
        oauthToken={oauthToken}
        loginHint={firebaseUser?.email}
      />
    </div>
  );
};
