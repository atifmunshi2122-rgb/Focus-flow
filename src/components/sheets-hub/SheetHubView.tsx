import React, { useState, useEffect, useMemo, useCallback } from 'react';
import {
  FileSpreadsheet,
  Plus,
  RotateCcw,
  Layers,
  Database,
  ShieldCheck,
  CheckCircle2,
  AlertTriangle,
  ArrowLeft,
  ExternalLink,
  Table as TableIcon,
  Sparkles,
  SlidersHorizontal,
  Trash2,
  Lock,
} from 'lucide-react';
import { useApp } from '../../context/AppContext.tsx';
import { api } from '../../lib/api.ts';
import { sheetHubStore } from '../../lib/sheetHub/sheetHubStore.ts';
import type {
  SheetConnection,
  SheetSyncedRow,
  SheetTabSchema,
  SheetCellScalar,
} from '../../types/sheetHub.ts';
import { ThemeCard, ThemeButton, ThemeBadge, ThemeModal } from '../ui/ThemePrimitives.tsx';
import { AnimatedNumber } from '../ui/MotionPrimitives.tsx';
import { SheetConnectionCard } from './SheetConnectionCard.tsx';
import { SheetSyncStatusPanel } from './SheetSyncStatusPanel.tsx';
import { DynamicSheetRenderer } from './DynamicSheetRenderer.tsx';
import { DynamicOverviewPanel } from './DynamicOverviewPanel.tsx';
import { ConnectSheetWizard } from './ConnectSheetWizard.tsx';
import { SchemaMappingEditor } from './SchemaMappingEditor.tsx';

export const SheetHubView: React.FC = () => {
  const { user, firebaseUser, authorizeGoogleSheets, showToast } = useApp();
  const activeUserId = user?.id || firebaseUser?.uid || 'usr_guest';

  // State
  const [connections, setConnections] = useState<SheetConnection[]>([]);
  const [activeConnectionId, setActiveConnectionId] = useState<string | null>(null);
  const [tabs, setTabs] = useState<SheetTabSchema[]>([]);
  const [selectedTabId, setSelectedTabId] = useState<string | null>(null);
  const [rowsByTabId, setRowsByTabId] = useState<Record<string, SheetSyncedRow[]>>({});

  const [isLoading, setIsLoading] = useState(true);
  const [isPulling, setIsPulling] = useState(false);
  const [wizardOpen, setWizardOpen] = useState(false);
  const [schemaModalOpen, setSchemaModalOpen] = useState(false);

  // Load connections
  const loadConnections = useCallback(async () => {
    setIsLoading(true);
    try {
      const conns = await sheetHubStore.listConnections(activeUserId);
      setConnections(conns);
      if (conns.length > 0 && !activeConnectionId) {
        // check if URL hash or previous selection
      }
    } catch {
      showToast('Failed to load connections.', 'error');
    } finally {
      setIsLoading(false);
    }
  }, [activeUserId, showToast, activeConnectionId]);

  useEffect(() => {
    loadConnections();
  }, [loadConnections]);

  // Load active connection tabs and rows
  const loadActiveWorkspace = useCallback(
    async (connId: string) => {
      try {
        const loadedTabs = await sheetHubStore.listTabsForConnection(activeUserId, connId);
        setTabs(loadedTabs);

        // Preload rows for data tabs
        const rowsMap: Record<string, SheetSyncedRow[]> = {};
        for (const tab of loadedTabs) {
          const tabRows = await sheetHubStore.loadTabRows(activeUserId, tab.id);
          rowsMap[tab.id] = tabRows;
        }
        setRowsByTabId(rowsMap);

        // Select overview or first data tab
        const overviewTab = loadedTabs.find((t) => t.role === 'overview');
        const firstDataTab = loadedTabs.find((t) => t.role === 'data');
        setSelectedTabId(overviewTab ? overviewTab.id : firstDataTab ? firstDataTab.id : loadedTabs[0]?.id || null);
      } catch {
        showToast('Failed to load spreadsheet tabs.', 'error');
      }
    },
    [activeUserId, showToast]
  );

  useEffect(() => {
    if (activeConnectionId) {
      loadActiveWorkspace(activeConnectionId);
    }
  }, [activeConnectionId, loadActiveWorkspace]);

  const activeConnection = useMemo(
    () => connections.find((c) => c.id === activeConnectionId) || null,
    [connections, activeConnectionId]
  );

  const activeTab = useMemo(
    () => tabs.find((t) => t.id === selectedTabId) || null,
    [tabs, selectedTabId]
  );

  // Hub Aggregate Snapshot Metrics
  const hubMetrics = useMemo(() => {
    const totalConns = connections.length;
    let totalTabs = 0;
    let totalRecords = 0;

    for (const c of connections) {
      totalTabs += c.tabOrder.length;
    }

    if (activeConnectionId && tabs.length > 0) {
      for (const t of tabs) {
        totalRecords += (rowsByTabId[t.id] || []).length;
      }
    }

    return {
      totalConns,
      totalTabs,
      totalRecords,
      isAuthHealthy: Boolean(firebaseUser),
    };
  }, [connections, activeConnectionId, tabs, rowsByTabId, firebaseUser]);

  // Pull / Refresh action for active spreadsheet
  const handlePullUpdates = async (connId = activeConnectionId) => {
    if (!connId) return;
    setIsPulling(true);
    try {
      const conn = connections.find((c) => c.id === connId);
      if (!conn) return;

      showToast(`Pulling updates for "${conn.title}"...`, 'info');

      // If sample demo spreadsheet
      if (conn.spreadsheetId === 'sem3-syllabus-sample') {
        const sample = await api.sheetHubSampleSemester3();
        const loadedTabs = await sheetHubStore.listTabsForConnection(activeUserId, connId);

        let totalPulled = 0;
        const nowIso = new Date().toISOString();

        for (const tab of loadedTabs) {
          const pt = sample.pull.tabs.find((t) => t.sheetId === tab.sheetId);
          if (pt) {
            const rows: SheetSyncedRow[] = pt.rows.map((r) => {
              const rowVals: Record<string, SheetCellScalar> = {};
              for (const col of tab.columns) {
                rowVals[col.fieldKey] = r.values[col.colIndex] ?? null;
              }
              return {
                rowUid: `row_${tab.sheetId}_${r.sheetRowNumber}`,
                lastKnownSheetRow: r.sheetRowNumber,
                values: rowVals,
                baseValues: rowVals,
                rowHash: `hash_${r.sheetRowNumber}`,
                version: 1,
                lastSyncOrigin: 'sheet',
                dirtyFields: [],
                localUpdatedAt: null,
                sheetSyncedAt: nowIso,
                status: 'synced',
              };
            });
            await sheetHubStore.saveTabRowsChunked({
              userId: activeUserId,
              connectionId: connId,
              tabId: tab.id,
              rows,
            });
            totalPulled += rows.length;
          }
        }

        // Update connection timestamp
        const updatedConn: SheetConnection = {
          ...conn,
          lastSyncedAt: nowIso,
          lastSuccessfulPullAt: nowIso,
          status: 'active',
        };
        await sheetHubStore.saveConnection(activeUserId, updatedConn);
        await loadConnections();
        if (activeConnectionId === connId) await loadActiveWorkspace(connId);

        showToast(`Successfully pulled ${totalPulled.toLocaleString()} records!`, 'success');
      } else {
        // Live Google Sheets pull
        const loadedTabs = await sheetHubStore.listTabsForConnection(activeUserId, connId);
        const tabsPayload = loadedTabs.map((t) => ({ sheetId: t.sheetId, sheetTitle: t.sheetTitle }));

        const res = await api.sheetHubPull(
          { spreadsheetId: conn.spreadsheetId, tabs: tabsPayload },
          null
        );

        const nowIso = new Date().toISOString();
        let totalPulled = 0;

        for (const pt of res.tabs) {
          const tab = loadedTabs.find((t) => t.sheetId === pt.sheetId);
          if (tab) {
            const rows: SheetSyncedRow[] = pt.rows.map((r) => {
              const rowVals: Record<string, SheetCellScalar> = {};
              for (const col of tab.columns) {
                rowVals[col.fieldKey] = r.values[col.colIndex] ?? null;
              }
              return {
                rowUid: `row_${tab.sheetId}_${r.sheetRowNumber}`,
                lastKnownSheetRow: r.sheetRowNumber,
                values: rowVals,
                baseValues: rowVals,
                rowHash: `hash_${r.sheetRowNumber}`,
                version: 1,
                lastSyncOrigin: 'sheet',
                dirtyFields: [],
                localUpdatedAt: null,
                sheetSyncedAt: nowIso,
                status: 'synced',
              };
            });
            await sheetHubStore.saveTabRowsChunked({
              userId: activeUserId,
              connectionId: connId,
              tabId: tab.id,
              rows,
            });
            totalPulled += rows.length;
          }
        }

        const updatedConn: SheetConnection = {
          ...conn,
          lastSyncedAt: nowIso,
          lastSuccessfulPullAt: nowIso,
          status: 'active',
        };
        await sheetHubStore.saveConnection(activeUserId, updatedConn);
        await loadConnections();
        if (activeConnectionId === connId) await loadActiveWorkspace(connId);

        showToast(`Successfully refreshed ${totalPulled.toLocaleString()} records!`, 'success');
      }
    } catch (err: any) {
      showToast(err?.message || 'Failed to pull updates from Google Sheets.', 'error');
    } finally {
      setIsPulling(false);
    }
  };

  const handleTogglePause = async (connId: string) => {
    const conn = connections.find((c) => c.id === connId);
    if (!conn) return;
    const nextStatus = conn.status === 'paused' ? 'active' : 'paused';
    await sheetHubStore.saveConnection(activeUserId, { ...conn, status: nextStatus });
    await loadConnections();
    showToast(`Spreadsheet ${nextStatus === 'paused' ? 'paused' : 'resumed'}.`, 'info');
  };

  const handleRemoveConnection = async (connId: string, purgeCache: boolean) => {
    await sheetHubStore.deleteConnection(activeUserId, connId, purgeCache);
    if (activeConnectionId === connId) {
      setActiveConnectionId(null);
      setTabs([]);
      setRowsByTabId({});
    }
    await loadConnections();
    showToast('Spreadsheet connection unlinked cleanly.', 'success');
  };

  // ----------------------------------------------------
  // RENDER: Guided Connect Wizard
  // ----------------------------------------------------
  if (wizardOpen) {
    return (
      <div className="py-2">
        <ConnectSheetWizard
          onCancel={() => setWizardOpen(false)}
          onSuccess={(connId) => {
            setWizardOpen(false);
            loadConnections();
            setActiveConnectionId(connId);
          }}
        />
      </div>
    );
  }

  // ----------------------------------------------------
  // RENDER: Active Connection Workspace
  // ----------------------------------------------------
  if (activeConnectionId && activeConnection) {
    return (
      <div className="space-y-5">
        {/* Workspace Top Header Bar */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-[var(--ff-border-color)]">
          <div className="flex items-center gap-3 min-w-0">
            <button
              type="button"
              onClick={() => setActiveConnectionId(null)}
              className="p-2 rounded-xl text-[var(--ff-text-muted)] hover:text-[var(--ff-text-primary)] hover:bg-[var(--ff-surface-hover)] border border-[var(--ff-border-color)] transition-colors shrink-0"
              title="Return to Sheet Sync Hub Landing"
            >
              <ArrowLeft className="w-4 h-4" />
            </button>

            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <span className="text-xs text-[var(--ff-text-muted)] font-medium">Sheet Sync Hub</span>
                <span className="text-xs text-[var(--ff-text-muted)]">/</span>
                <span className="text-xs font-semibold text-[var(--ff-accent-text)]">Active Workspace</span>
              </div>
              <h2 className="text-lg font-bold text-[var(--ff-text-primary)] truncate" title={activeConnection.title}>
                {activeConnection.title}
              </h2>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <ThemeButton
              variant="secondary"
              size="sm"
              onClick={() => setSchemaModalOpen(true)}
              className="flex items-center gap-1.5"
            >
              <SlidersHorizontal className="w-3.5 h-3.5" />
              <span>Inspect Schema</span>
            </ThemeButton>

            <a
              href={activeConnection.spreadsheetUrl}
              target="_blank"
              rel="noreferrer noopener"
              className="p-2 rounded-lg text-xs font-medium border border-[var(--ff-border-color)] bg-[var(--ff-surface)] hover:bg-[var(--ff-surface-hover)] text-[var(--ff-text-secondary)] inline-flex items-center gap-1.5 transition-colors"
              title="Open Google Spreadsheet in new tab"
            >
              <ExternalLink className="w-3.5 h-3.5 text-blue-500" />
              <span className="hidden sm:inline">Google Sheets</span>
            </a>
          </div>
        </div>

        {/* Sync Status Banner */}
        <SheetSyncStatusPanel
          connection={activeConnection}
          isPulling={isPulling}
          onPull={() => handlePullUpdates(activeConnection.id)}
          onReconnect={() => authorizeGoogleSheets()}
        />

        {/* Tabs Navigation Switcher */}
        <div className="flex items-center gap-1.5 overflow-x-auto pb-1 border-b border-[var(--ff-border-color)]">
          {tabs.map((tab) => {
            const isSelected = selectedTabId === tab.id;
            const rowCount = (rowsByTabId[tab.id] || []).length;
            const isOverview = tab.role === 'overview';

            return (
              <button
                key={tab.id}
                type="button"
                onClick={() => setSelectedTabId(tab.id)}
                className={`flex items-center gap-2 px-3.5 py-2 text-xs font-semibold rounded-xl transition-all whitespace-nowrap ${
                  isSelected
                    ? 'bg-[var(--ff-accent)] text-[var(--ff-accent-contrast)] shadow-md'
                    : 'bg-[var(--ff-surface)] text-[var(--ff-text-secondary)] hover:text-[var(--ff-text-primary)] hover:bg-[var(--ff-surface-hover)] border border-[var(--ff-border-color)]'
                }`}
              >
                {isOverview ? (
                  <Sparkles className="w-3.5 h-3.5" />
                ) : (
                  <TableIcon className="w-3.5 h-3.5" />
                )}
                <span>{tab.sheetTitle}</span>
                {!isOverview && (
                  <span
                    className={`text-[10px] px-1.5 py-0.2 rounded-full font-mono ${
                      isSelected
                        ? 'bg-[var(--ff-accent-contrast)]/20 text-[var(--ff-accent-contrast)]'
                        : 'bg-[var(--ff-surface-muted)] text-[var(--ff-text-muted)]'
                    }`}
                  >
                    {rowCount}
                  </span>
                )}
              </button>
            );
          })}
        </div>

        {/* Render Tab Contents */}
        {activeTab && activeTab.role === 'overview' ? (
          <DynamicOverviewPanel
            tabs={tabs}
            rowsByTabId={rowsByTabId}
            onSelectTab={(tabId) => setSelectedTabId(tabId)}
          />
        ) : activeTab ? (
          <DynamicSheetRenderer
            schema={activeTab}
            rows={rowsByTabId[activeTab.id] || []}
            viewMode={activeTab.defaultView || 'checklist'}
          />
        ) : (
          <div className="py-12 text-center text-[var(--ff-text-muted)]">No active tab selected.</div>
        )}

        {/* Schema Inspection & Mapping Modal */}
        {activeTab && (
          <ThemeModal
            isOpen={schemaModalOpen}
            onClose={() => setSchemaModalOpen(false)}
            title={`Schema Mapping & Protection: ${activeTab.sheetTitle}`}
          >
            <div className="space-y-4">
              <p className="text-xs text-[var(--ff-text-muted)]">
                Review detected field types, semantic roles, and formula protection locks for tab <strong>{activeTab.sheetTitle}</strong>.
              </p>

              <SchemaMappingEditor
                columns={activeTab.columns}
                selectedKeyColumns={activeTab.identityColumns}
                onChangeColumns={async (updatedCols) => {
                  const updatedTab: SheetTabSchema = { ...activeTab, columns: updatedCols };
                  await sheetHubStore.saveTabSchema(activeUserId, updatedTab);
                  setTabs((prev) => prev.map((t) => (t.id === activeTab.id ? updatedTab : t)));
                }}
              />

              <div className="flex justify-end pt-3 border-t border-[var(--ff-border-color)]">
                <ThemeButton variant="secondary" onClick={() => setSchemaModalOpen(false)}>
                  Done
                </ThemeButton>
              </div>
            </div>
          </ThemeModal>
        )}
      </div>
    );
  }

  // ----------------------------------------------------
  // RENDER: Main Landing Dashboard (No active sheet)
  // ----------------------------------------------------
  return (
    <div className="space-y-6">
      {/* Top Banner Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-[var(--ff-border-color)]">
        <div>
          <div className="flex items-center gap-2">
            <span className="text-xs uppercase font-bold tracking-wider text-[var(--ff-text-muted)]">
              Data &amp; Integrations
            </span>
            <ThemeBadge tone="success" className="text-[10px] px-1.5 py-0.2">
              Phase 2 Active
            </ThemeBadge>
          </div>
          <h2 className="text-2xl font-bold text-[var(--ff-text-primary)] mt-0.5 flex items-center gap-2.5">
            <FileSpreadsheet className="w-6 h-6 text-emerald-500" />
            <span>Universal Sheet Sync Hub</span>
          </h2>
          <p className="text-xs text-[var(--ff-text-secondary)] mt-1">
            Connect ANY compatible Google Spreadsheet dynamically without writing custom code.
          </p>
        </div>

        <div className="flex items-center gap-2.5">
          <ThemeButton
            variant="primary"
            onClick={() => setWizardOpen(true)}
            className="flex items-center gap-2 shadow-lg shadow-[var(--ff-accent)]/10"
          >
            <Plus className="w-4 h-4" />
            <span>Connect New Spreadsheet</span>
          </ThemeButton>
        </div>
      </div>

      {/* Snapshot KPI Summary Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <ThemeCard variant="elevated" className="p-4 border border-[var(--ff-border-color)]">
          <div className="flex items-center justify-between text-xs text-[var(--ff-text-muted)] mb-1">
            <span className="uppercase font-semibold tracking-wider text-[10px]">Connected Sheets</span>
            <FileSpreadsheet className="w-4 h-4 text-emerald-500" />
          </div>
          <div className="text-2xl font-bold text-[var(--ff-text-primary)]">
            <AnimatedNumber value={hubMetrics.totalConns} />
          </div>
          <p className="text-xs text-[var(--ff-text-muted)] mt-1">Active spreadsheet integrations</p>
        </ThemeCard>

        <ThemeCard variant="elevated" className="p-4 border border-[var(--ff-border-color)]">
          <div className="flex items-center justify-between text-xs text-[var(--ff-text-muted)] mb-1">
            <span className="uppercase font-semibold tracking-wider text-[10px]">Imported Tabs</span>
            <Layers className="w-4 h-4 text-[var(--ff-accent)]" />
          </div>
          <div className="text-2xl font-bold text-[var(--ff-accent)]">
            <AnimatedNumber value={hubMetrics.totalTabs} />
          </div>
          <p className="text-xs text-[var(--ff-text-muted)] mt-1">Syllabi, trackers &amp; grids</p>
        </ThemeCard>

        <ThemeCard variant="elevated" className="p-4 border border-[var(--ff-border-color)]">
          <div className="flex items-center justify-between text-xs text-[var(--ff-text-muted)] mb-1">
            <span className="uppercase font-semibold tracking-wider text-[10px]">Google Auth Status</span>
            <ShieldCheck className="w-4 h-4 text-blue-500" />
          </div>
          <div className="text-base font-bold text-[var(--ff-text-primary)] flex items-center gap-1.5 mt-1">
            {firebaseUser ? (
              <span className="text-emerald-500 flex items-center gap-1 text-sm font-semibold">
                <CheckCircle2 className="w-4 h-4" /> Authorized
              </span>
            ) : (
              <span className="text-amber-500 text-sm font-semibold">Guest Mode</span>
            )}
          </div>
          <p className="text-xs text-[var(--ff-text-muted)] mt-1">Incremental Sheets scope</p>
        </ThemeCard>

        <ThemeCard variant="elevated" className="p-4 border border-[var(--ff-border-color)]">
          <div className="flex items-center justify-between text-xs text-[var(--ff-text-muted)] mb-1">
            <span className="uppercase font-semibold tracking-wider text-[10px]">Sync Boundary</span>
            <Lock className="w-4 h-4 text-emerald-500" />
          </div>
          <div className="text-sm font-bold text-emerald-500 mt-1">
            Sheet → FocusFlow
          </div>
          <p className="text-xs text-[var(--ff-text-muted)] mt-1">Phase 2: Read-Only Guaranteed</p>
        </ThemeCard>
      </div>

      {/* Connected Spreadsheets Grid */}
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="font-semibold text-base text-[var(--ff-text-primary)]">
            Connected Spreadsheets ({connections.length})
          </h3>
          {connections.length > 0 && (
            <span className="text-xs text-[var(--ff-text-muted)]">
              Click &ldquo;Open&rdquo; to launch interactive workspace
            </span>
          )}
        </div>

        {isLoading ? (
          <div className="py-16 text-center text-xs text-[var(--ff-text-muted)]">
            <RotateCcw className="w-6 h-6 animate-spin mx-auto mb-2 text-[var(--ff-accent)]" />
            <span>Loading spreadsheet connections...</span>
          </div>
        ) : connections.length === 0 ? (
          /* Empty State */
          <ThemeCard
            variant="elevated"
            className="p-10 border border-dashed border-[var(--ff-border-color)] text-center space-y-4 max-w-lg mx-auto"
          >
            <div className="w-14 h-14 rounded-2xl bg-emerald-500/10 text-emerald-500 flex items-center justify-center mx-auto border border-emerald-500/20">
              <FileSpreadsheet className="w-7 h-7" />
            </div>

            <div>
              <h4 className="font-bold text-base text-[var(--ff-text-primary)]">No Spreadsheets Connected Yet</h4>
              <p className="text-xs text-[var(--ff-text-secondary)] mt-1 max-w-sm mx-auto">
                Connect your study syllabus, project trackers, or reading logs from Google Sheets into your executive FocusFlow dashboard.
              </p>
            </div>

            <div className="pt-2 flex flex-col sm:flex-row items-center justify-center gap-3">
              <ThemeButton variant="primary" onClick={() => setWizardOpen(true)}>
                <Plus className="w-4 h-4 mr-1.5" /> Connect New Spreadsheet
              </ThemeButton>
            </div>
          </ThemeCard>
        ) : (
          /* Grid of Connection Cards */
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {connections.map((conn) => (
              <SheetConnectionCard
                key={conn.id}
                connection={conn}
                tabCount={conn.tabOrder.length}
                onOpen={(id) => setActiveConnectionId(id)}
                onRefresh={(id) => handlePullUpdates(id)}
                onTogglePause={(id) => handleTogglePause(id)}
                onReconnect={() => authorizeGoogleSheets()}
                onRemove={(id, purge) => handleRemoveConnection(id, purge)}
                isPulling={isPulling}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
};
