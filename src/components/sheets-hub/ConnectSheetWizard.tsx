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
} from 'lucide-react';
import { useApp } from '../../context/AppContext.tsx';
import { api } from '../../lib/api.ts';
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
  SheetTabRole,
  SheetTabSchema,
  SheetTemplateHint,
} from '../../types/sheetHub.ts';
import { ThemeCard, ThemeButton, ThemeBadge, ThemeInput } from '../ui/ThemePrimitives.tsx';
import { AnimatedProgressBar } from '../ui/MotionPrimitives.tsx';
import { SchemaMappingEditor } from './SchemaMappingEditor.tsx';

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

export const ConnectSheetWizard: React.FC<ConnectSheetWizardProps> = ({
  onCancel,
  onSuccess,
}) => {
  const { user, firebaseUser, signInWithGoogle, authorizeGoogleSheets, showToast } = useApp();

  const [currentStep, setCurrentStep] = useState<WizardStep>('url');
  const [urlInput, setUrlInput] = useState('');
  const [urlError, setUrlError] = useState<string | null>(null);
  const [spreadsheetId, setSpreadsheetId] = useState<string>('');
  const [isDemoMode, setIsDemoMode] = useState(false);

  // Auth state
  const [oauthToken, setOauthToken] = useState<string | null>(null);
  const [isAuthorizing, setIsAuthorizing] = useState(false);

  // Inspection state
  const [isInspecting, setIsInspecting] = useState(false);
  const [inspectData, setInspectData] = useState<SheetInspectResponse | null>(null);
  const [inspectError, setInspectError] = useState<string | null>(null);

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

  // Step 2: Request Google Authorization
  const handleAuthorizeGoogle = async () => {
    setIsAuthorizing(true);
    try {
      const res = await authorizeGoogleSheets();
      if (res) {
        setOauthToken(res);
        showToast('Google Sheets authorized successfully!', 'success');
        runInspection(res);
      }
    } catch (err) {
      showToast('Google authorization failed. Please retry.', 'error');
    } finally {
      setIsAuthorizing(false);
    }
  };

  // Step 3: Run Inspection via API
  const runInspection = async (token?: string | null) => {
    setIsInspecting(true);
    setInspectError(null);
    setCurrentStep('inspect');

    try {
      const res = await api.sheetHubInspect(
        { spreadsheetId: spreadsheetId || undefined, spreadsheetUrl: urlInput || undefined, previewRows: 40 },
        token || oauthToken
      );
      setInspectData(res);

      const initialTabIds: number[] = [];
      const initialRoles: Record<number, SheetTabRole> = {};
      const initialCols: Record<number, SheetColumnMapping[]> = {};
      const initialKeys: Record<number, string[]> = {};

      for (const t of res.tabs) {
        if (t.role !== 'ignored') initialTabIds.push(t.sheetId);
        initialRoles[t.sheetId] = t.role;
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

      setCurrentStep('tabs');
    } catch (err: any) {
      const msg = err?.message || 'Inspection failed.';
      setInspectError(msg);
      if (msg.includes('AUTH_REQUIRED') || msg.includes('authorization')) {
        setCurrentStep('auth');
      } else {
        setCurrentStep('url');
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
    if (!inspectData) return;
    setCurrentStep('importing');
    setImportProgress(10);
    setImportStatusText('Preparing spreadsheet connection metadata...');
    setImportError(null);

    const activeUserId = user?.id || firebaseUser?.uid || 'usr_guest';
    const connectionId = `conn_${spreadsheetId.slice(0, 24)}_${Date.now().toString(36)}`;

    try {
      const nowIso = new Date().toISOString();
      const templateHint: SheetTemplateHint =
        preferredView === 'checklist' ? 'checklist' : preferredView === 'table' ? 'table' : 'custom';

      // 1. Create connection document
      const connectionDoc: SheetConnection = {
        id: connectionId,
        userId: activeUserId,
        spreadsheetId,
        spreadsheetUrl: urlInput,
        title: inspectData.title || 'Connected Spreadsheet',
        templateHint,
        syncMode: 'sheet_to_app',
        pollIntervalSec: null,
        syncOnOpen: true,
        status: 'active',
        lastSyncedAt: nowIso,
        lastSuccessfulPullAt: nowIso,
        lastSuccessfulPushAt: null,
        lastError: null,
        pendingChangesCount: 0,
        conflictCount: 0,
        tabOrder: selectedTabIds.map((id) => `${connectionId}__tab_${id}`),
        createdAt: nowIso,
        updatedAt: nowIso,
        deletedAt: null,
      };

      await sheetHubStore.saveConnection(activeUserId, connectionDoc);
      setImportProgress(25);
      setImportStatusText('Saving confirmed tab schemas and column mappings...');

      // 2. Fetch full rows (either via sample endpoint or live Google Sheets API)
      let pullResult: SheetPullResponse;

      if (isDemoMode) {
        const sample = await api.sheetHubSampleSemester3();
        pullResult = sample.pull;
      } else {
        const tabsToPull = selectedTabIds.map((id) => {
          const tab = inspectData.tabs.find((t) => t.sheetId === id);
          return { sheetId: id, sheetTitle: tab?.sheetTitle || '' };
        });
        pullResult = await api.sheetHubPull(
          { spreadsheetId, tabs: tabsToPull },
          oauthToken
        );
      }

      setImportProgress(50);
      setImportStatusText('Resolving deterministic row identities and packaging chunks...');

      let totalImportedRows = 0;

      // 3. Process and save each tab
      for (let i = 0; i < selectedTabIds.length; i++) {
        const sheetId = selectedTabIds[i];
        const tabMeta = inspectData.tabs.find((t) => t.sheetId === sheetId);
        if (!tabMeta) continue;

        const tabDocId = `${connectionId}__tab_${sheetId}`;
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
        const identityAudit = evaluateRowIdentities({
          tabScope: `${connectionId}:${sheetId}`,
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

        // Save chunked rows
        const chunkResult = await sheetHubStore.saveTabRowsChunked({
          userId: activeUserId,
          connectionId,
          tabId: tabDocId,
          rows: syncedRows,
        });

        // Save Tab Schema
        const tabSchemaDoc: SheetTabSchema = {
          id: tabDocId,
          connectionId,
          userId: activeUserId,
          sheetId,
          sheetTitle: tabMeta.sheetTitle,
          role: tabRoles[sheetId] || tabMeta.role,
          headerRowIndex: tabMeta.headerRowIndex,
          dataStartRow: tabMeta.dataStartRow,
          dataEndColumn: tabMeta.dataEndColumn,
          identityStrategy,
          identityColumns: keyCols,
          metadataIdColumn: null,
          columns: activeColumns,
          defaultView: preferredView === 'checklist' ? 'checklist' : 'table',
          groupByColumnId: activeColumns.find((c) => c.semanticRole === 'group')?.fieldKey || null,
          lastPullHash: 'pull_initial',
          rowCount: syncedRows.length,
          chunkCount: chunkResult.chunkCount,
          updatedAt: nowIso,
        };

        await sheetHubStore.saveTabSchema(activeUserId, tabSchemaDoc);
        setImportProgress(50 + Math.round(((i + 1) / selectedTabIds.length) * 45));
      }

      setImportProgress(100);
      setImportStatusText('Import complete!');
      showToast(`Successfully imported ${totalImportedRows.toLocaleString()} records!`, 'success');

      // Finish wizard and switch to workspace
      setTimeout(() => {
        onSuccess(connectionId);
      }, 400);
    } catch (err: any) {
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
            Universal Sheet Sync Hub &bull; Phase 2 Guided Read-Only Import
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
            <label className="text-xs font-semibold text-[var(--ff-text-muted)] uppercase tracking-wider block">
              Google Spreadsheet URL
            </label>
            <ThemeInput
              placeholder="https://docs.google.com/spreadsheets/d/1BxiMVs0XRA5nFMdKvBdBZjgmUUqptlbs74OgvE2upms/edit"
              value={urlInput}
              onChange={(e) => {
                setUrlInput(e.target.value);
                setUrlError(null);
              }}
            />
            {urlError && <p className="text-xs text-rose-500 font-medium">{urlError}</p>}
          </div>

          <div className="p-4 rounded-xl bg-amber-500/10 border border-amber-500/20 text-xs text-amber-500 space-y-1">
            <span className="font-semibold block flex items-center gap-1.5">
              <ShieldCheck className="w-4 h-4 shrink-0" /> Read-Only &amp; Safe
            </span>
            <p className="text-[11px] opacity-90">
              FocusFlow imports spreadsheet data securely into your personal workspace without modifying your Google Sheets or requesting unnecessary Drive permissions.
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

          <div className="flex items-center justify-end gap-3 pt-4 border-t border-[var(--ff-border-color)]">
            <ThemeButton
              variant="primary"
              onClick={() => {
                if (handleValidateUrl()) {
                  setCurrentStep('auth');
                }
              }}
            >
              Continue to Authorization <ArrowRight className="w-4 h-4 inline ml-1" />
            </ThemeButton>
          </div>
        </ThemeCard>
      )}

      {/* STEP 2: Google Authorization */}
      {currentStep === 'auth' && (
        <ThemeCard variant="elevated" className="p-6 border border-[var(--ff-border-color)] space-y-5">
          <div>
            <h3 className="font-semibold text-base text-[var(--ff-text-primary)] mb-1">
              Step 2: Google Sheets Authorization
            </h3>
            <p className="text-xs text-[var(--ff-text-secondary)]">
              Authorize FocusFlow to inspect and read your spreadsheet using Google OAuth.
            </p>
          </div>

          <div className="p-4 rounded-xl border border-[var(--ff-border-color)] bg-[var(--ff-surface-muted)] space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-[var(--ff-text-primary)]">Google Account Status</span>
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
              FocusFlow uses incremental Google OAuth for Google Sheets access. We never request broad Google Drive permissions.
            </p>

            <div className="pt-2">
              <ThemeButton
                variant="primary"
                onClick={handleAuthorizeGoogle}
                disabled={isAuthorizing}
                className="w-full sm:w-auto"
              >
                <ShieldCheck className="w-4 h-4 mr-1.5" />
                <span>{isAuthorizing ? 'Authorizing with Google...' : 'Authorize Google Sheets Access'}</span>
              </ThemeButton>
            </div>
          </div>

          <div className="flex items-center justify-between pt-4 border-t border-[var(--ff-border-color)]">
            <ThemeButton variant="secondary" onClick={() => setCurrentStep('url')}>
              <ArrowLeft className="w-4 h-4 inline mr-1" /> Back
            </ThemeButton>

            <ThemeButton
              variant="secondary"
              onClick={() => runInspection()}
              title="Continue if already authorized"
            >
              Skip / Continue with Existing Auth <ArrowRight className="w-4 h-4 inline ml-1" />
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
              const currentRole = tabRoles[tab.sheetId] || tab.role;

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
                      <span className="font-semibold text-sm text-[var(--ff-text-primary)] block truncate">
                        {tab.sheetTitle}
                      </span>
                      <span className="text-xs text-[var(--ff-text-muted)]">
                        {tab.columns.length} columns &bull; Header row {tab.headerRowIndex}
                      </span>
                    </div>
                  </label>

                  <div className="flex items-center gap-2 shrink-0">
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
            {[
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
            ].map((v) => (
              <div
                key={v.id}
                onClick={() => setPreferredView(v.id as any)}
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
            <div className="flex justify-between py-1">
              <span className="text-[var(--ff-text-muted)]">Sync Boundary</span>
              <span className="font-semibold text-emerald-500">Google Sheet → FocusFlow (Read-Only)</span>
            </div>
          </div>

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

            <ThemeButton variant="primary" onClick={executeImportPipeline}>
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
    </div>
  );
};
