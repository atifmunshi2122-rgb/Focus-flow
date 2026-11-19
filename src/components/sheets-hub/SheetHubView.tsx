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
import {
  getSheetHubAccessToken,
  getSheetHubWriteAccessToken,
  setSheetHubWriteAccessToken,
} from '../../lib/firebase.ts';
import { sheetHubStore } from '../../lib/sheetHub/sheetHubStore.ts';
import type {
  SheetColumnMapping,
  SheetConnection,
  SheetHubCellUpdateRequest,
  SheetSyncedRow,
  SheetTabSchema,
  SheetCellScalar,
  SheetSyncMode,
} from '../../types/sheetHub.ts';
import { ThemeCard, ThemeButton, ThemeBadge, ThemeModal, ThemeInput } from '../ui/ThemePrimitives.tsx';
import { AnimatedNumber } from '../ui/MotionPrimitives.tsx';
import { SheetConnectionCard } from './SheetConnectionCard.tsx';
import { SheetSyncStatusPanel } from './SheetSyncStatusPanel.tsx';
import { DynamicSheetRenderer } from './DynamicSheetRenderer.tsx';
import { DynamicOverviewPanel } from './DynamicOverviewPanel.tsx';
import { ConnectSheetWizard } from './ConnectSheetWizard.tsx';
import { SchemaMappingEditor } from './SchemaMappingEditor.tsx';
import { NativeSpreadsheetEditor } from './NativeSpreadsheetEditor.tsx';
import { flushPendingWritebacks } from '../../lib/sheetHub/sheetStudySyncService.ts';
import type { SheetTemplateHint } from '../../types/sheetHub.ts';

export const SheetHubView: React.FC = () => {
  const {
    user,
    firebaseUser,
    signInWithGoogle,
    authorizeSheetHubReadOnly,
    authorizeSheetHubWrite,
    confirmAction,
    showToast,
  } = useApp();
  const activeUserId = firebaseUser?.uid || user?.id || 'usr_guest';

  // State
  const [connections, setConnections] = useState<SheetConnection[]>([]);
  const [activeConnectionId, setActiveConnectionId] = useState<string | null>(null);
  const [tabs, setTabs] = useState<SheetTabSchema[]>([]);
  const [selectedTabId, setSelectedTabId] = useState<string | null>(null);
  const [rowsByTabId, setRowsByTabId] = useState<Record<string, SheetSyncedRow[]>>({});

  const [isLoading, setIsLoading] = useState(true);
  const [isPulling, setIsPulling] = useState(false);
  const [isPushing, setIsPushing] = useState(false);
  const [syncingRowUids, setSyncingRowUids] = useState<Record<string, boolean>>({});
  const [wizardOpen, setWizardOpen] = useState(false);
  const [schemaModalOpen, setSchemaModalOpen] = useState(false);

  // Native Sheet Creation State
  const [createSheetModalOpen, setCreateSheetModalOpen] = useState(false);
  const [newSheetTitle, setNewSheetTitle] = useState('');
  const [newSheetDesc, setNewSheetDesc] = useState('');
  const [newSheetTemplate, setNewSheetTemplate] = useState<SheetTemplateHint>('table');
  const [filterMode, setFilterMode] = useState<'all' | 'native' | 'google'>('all');

  // Reset state when user changes to prevent cross-account data remnants
  useEffect(() => {
    setActiveConnectionId(null);
    setTabs([]);
    setSelectedTabId(null);
    setRowsByTabId({});
  }, [activeUserId]);

  // Load connections (always bypasses stale cache when forceCloud is true or on Gmail account change)
  const loadConnections = useCallback(
    async (forceCloud = false) => {
      setIsLoading(true);
      try {
        const conns = await sheetHubStore.listConnections(activeUserId, { forceCloud });
        setConnections(conns);
        if (activeConnectionId && !conns.some((c) => c.id === activeConnectionId)) {
          setActiveConnectionId(null);
          setTabs([]);
          setSelectedTabId(null);
          setRowsByTabId({});
        }
      } catch {
        showToast('Failed to load connections.', 'error');
      } finally {
        setIsLoading(false);
      }
    },
    [activeUserId, showToast, activeConnectionId]
  );

  useEffect(() => {
    loadConnections(Boolean(firebaseUser?.uid));
  }, [loadConnections, firebaseUser?.uid]);

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

  const isDemoSheet = activeConnection?.spreadsheetId === 'sem3-syllabus-sample';

  const pendingChangesCount = useMemo(() => {
    let count = 0;
    for (const tabRows of Object.values(rowsByTabId)) {
      for (const r of tabRows) {
        if (r.status === 'pending_push') count++;
      }
    }
    return count;
  }, [rowsByTabId]);

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

  // Helper: execute Google Sheets cell writeback with least-privilege write OAuth & 401 retry
  const pushUpdatesWithWriteAuth = useCallback(
    async (
      conn: SheetConnection,
      updates: SheetHubCellUpdateRequest[]
    ): Promise<{ pushed: boolean; cancelled?: boolean; updatedCells?: number; pushedAt?: string }> => {
      if (!firebaseUser) {
        showToast('Please sign in with Google first to sync changes back to Google Sheets.', 'error');
        return { pushed: false };
      }

      let writeToken = await getSheetHubWriteAccessToken();
      if (!writeToken) {
        writeToken = await authorizeSheetHubWrite();
        if (!writeToken) {
          return { pushed: false, cancelled: true };
        }
      }

      try {
        const res = await api.sheetHubPushCells(
          { spreadsheetId: conn.spreadsheetId, updates },
          writeToken
        );
        return { pushed: true, updatedCells: res.updatedCells, pushedAt: res.pushedAt };
      } catch (err: any) {
        const code = err?.code;
        if (code === 'SHEETS_AUTH_REQUIRED' || err?.status === 401) {
          setSheetHubWriteAccessToken(null);
          const freshToken = await authorizeSheetHubWrite();
          if (!freshToken) {
            return { pushed: false, cancelled: true };
          }
          const retryRes = await api.sheetHubPushCells(
            { spreadsheetId: conn.spreadsheetId, updates },
            freshToken
          );
          return { pushed: true, updatedCells: retryRes.updatedCells, pushedAt: retryRes.pushedAt };
        }
        throw err;
      }
    },
    [firebaseUser, authorizeSheetHubWrite, showToast]
  );

  // Toggle sync mode between Read-Only (sheet_to_app), Batch Push (manual_only), and Two-Way Sync (two_way)
  const handleToggleSyncMode = useCallback(async () => {
    if (!activeConnection || activeConnection.spreadsheetId === 'sem3-syllabus-sample') return;

    let nextMode: SheetSyncMode;
    if (activeConnection.syncMode === 'sheet_to_app') {
      // Transition from Read-Only to Batch Push (local-first edits)
      nextMode = 'manual_only';
    } else if (activeConnection.syncMode === 'manual_only') {
      // Transition from Batch Push to Two-Way Sync: verify Google write authorization first
      const hasWriteAuth = await getSheetHubWriteAccessToken();
      if (!hasWriteAuth) {
        showToast('Google write authorization required for Two-Way Sync. Requesting permission...', 'info');
        try {
          const authRes = await authorizeSheetHubWrite();
          if (!authRes) {
            showToast('Write authorization was not granted. Remaining in Batch Push mode.', 'info');
            return;
          }
          const flushed = await flushPendingWritebacks(activeUserId);
          if (flushed > 0) {
            showToast(`Synced ${flushed} pending study update(s) to Google Sheets.`, 'success');
          }
        } catch {
          showToast('Could not obtain Google Sheets write access. Remaining in Batch Push mode.', 'error');
          return;
        }
      } else {
        const flushed = await flushPendingWritebacks(activeUserId);
        if (flushed > 0) {
          showToast(`Synced ${flushed} pending study update(s) to Google Sheets.`, 'success');
        }
      }
      nextMode = 'two_way';
    } else {
      // Transition from Two-Way Sync back to Read-Only
      nextMode = 'sheet_to_app';
    }

    const updatedConn: SheetConnection = {
      ...activeConnection,
      syncMode: nextMode,
      updatedAt: new Date().toISOString(),
    };
    await sheetHubStore.saveConnection(activeUserId, updatedConn);
    setConnections((prev) => prev.map((c) => (c.id === updatedConn.id ? updatedConn : c)));
    showToast(
      nextMode === 'two_way'
        ? 'Two-Way Sync enabled: marking/unmarking checkboxes will sync directly to Google Sheet.'
        : nextMode === 'manual_only'
        ? 'Batch Push mode enabled: mark multiple items locally, then click "Push Changes" to sync at once.'
        : 'Read-Only mode enabled: changes in Google Sheet will be pulled into the app.',
      'info'
    );
  }, [activeConnection, activeUserId, authorizeSheetHubWrite, showToast]);

  // Reconnect handler: intelligently re-authorizes write access if needed and flushes pending queue
  const handleReconnect = useCallback(
    async (conn?: SheetConnection) => {
      const target = conn || activeConnection;
      if (target?.syncMode === 'two_way' || target?.writeAuthStatus === 'expired') {
        const writeToken = await authorizeSheetHubWrite();
        if (writeToken) {
          const flushed = await flushPendingWritebacks(activeUserId);
          if (flushed > 0) {
            showToast(`Reconnected write access and synced ${flushed} pending update(s) to Google Sheets.`, 'success');
          } else {
            showToast('Google Sheets write access re-authorized successfully.', 'success');
          }
          return;
        }
      }
      await authorizeSheetHubReadOnly();
    },
    [activeConnection, activeUserId, authorizeSheetHubReadOnly, authorizeSheetHubWrite, showToast]
  );

  // Interactive Mark / Unmark handler (FocusFlow <-> Google Sheets)
  const handleToggleCell = useCallback(
    async (tab: SheetTabSchema, row: SheetSyncedRow, col: SheetColumnMapping, nextValue: boolean) => {
      if (!activeConnection) return;
      if (col.inferredType === 'formula' || col.editable === false) {
        showToast(col.readOnlyReason || 'This column is read-only and cannot be edited.', 'info');
        return;
      }
      if (!row.lastKnownSheetRow || row.lastKnownSheetRow < 1) {
        showToast('Cannot locate sheet row number. Pull latest updates first.', 'error');
        return;
      }

      const nowIso = new Date().toISOString();
      const currentTabRows = rowsByTabId[tab.id] || [];
      const baseVal = row.baseValues?.[col.fieldKey];
      const normalizedBase =
        baseVal === true || (typeof baseVal === 'string' && baseVal.trim().toLowerCase() === 'true');
      const existingDirty = Array.isArray(row.dirtyFields) ? row.dirtyFields : [];
      const nextDirty =
        nextValue === normalizedBase
          ? existingDirty.filter((f) => f !== col.fieldKey)
          : Array.from(new Set([...existingDirty, col.fieldKey]));

      const localUpdatedRow: SheetSyncedRow = {
        ...row,
        values: { ...row.values, [col.fieldKey]: nextValue },
        dirtyFields: nextDirty,
        localUpdatedAt: nowIso,
        lastSyncOrigin: 'app',
        status: nextDirty.length > 0 ? 'pending_push' : 'synced',
        updatedAt: nowIso,
      };

      const nextTabRows = currentTabRows.map((r) => (r.rowUid === row.rowUid ? localUpdatedRow : r));
      const nextRowsByTabId = { ...rowsByTabId, [tab.id]: nextTabRows };
      setRowsByTabId(nextRowsByTabId);

      // Compute live pending count across all tabs for connection metadata
      let nextPendingCount = 0;
      for (const list of Object.values(nextRowsByTabId)) {
        for (const item of list) {
          if (item.status === 'pending_push') nextPendingCount++;
        }
      }

      // Persist immediately to Firestore so local state is never lost
      try {
        await sheetHubStore.saveTabRowsChunked({
          userId: activeUserId,
          connectionId: activeConnection.id,
          tabId: tab.id,
          rows: nextTabRows,
        });
      } catch (saveErr: any) {
        showToast(saveErr?.message || 'Failed to save checkbox state locally.', 'error');
        return;
      }

      // Demo spreadsheet stays local-only
      if (activeConnection.spreadsheetId === 'sem3-syllabus-sample') {
        showToast(nextValue ? 'Marked as done (demo sheet)' : 'Unmarked (demo sheet)', 'success');
        return;
      }

      // Batch push mode: keep saved locally as pending_push without prompting on every click
      if (activeConnection.syncMode === 'manual_only') {
        const updatedConn: SheetConnection = {
          ...activeConnection,
          pendingChangesCount: nextPendingCount,
          updatedAt: nowIso,
        };
        await sheetHubStore.saveConnection(activeUserId, updatedConn);
        setConnections((prev) => prev.map((c) => (c.id === updatedConn.id ? updatedConn : c)));
        return;
      }

      // Two-Way Sync: direct automatic write-back to Google Sheets (zero prompt interruption)
      const titleCol =
        tab.columns.find((c) => c.semanticRole === 'title') ||
        tab.columns.find((c) => c.inferredType === 'text');
      const itemLabel = titleCol
        ? String(row.values[titleCol.fieldKey] || `Row ${row.lastKnownSheetRow}`).trim()
        : `Row ${row.lastKnownSheetRow}`;
      const cellRef = `${col.colLetter}${row.lastKnownSheetRow}`;

      // If user has not granted write permissions or explicitly requested confirmation:
      const hasWriteToken = Boolean(await getSheetHubWriteAccessToken());
      if (!hasWriteToken && !firebaseUser) {
        const confirmed = await confirmAction({
          title: nextValue ? 'Mark item in Google Sheet?' : 'Unmark item in Google Sheet?',
          message: `Update "${itemLabel}" in tab "${tab.sheetTitle}" (Cell ${cellRef}) to ${
            nextValue ? 'Checked (TRUE)' : 'Unchecked (FALSE)'
          } in Google Sheet "${activeConnection.title}"?`,
          confirmLabel: 'Sync to Google Sheet',
          cancelLabel: 'Keep Local Only',
          tone: 'primary',
        });
        if (!confirmed) {
          const updatedConn: SheetConnection = {
            ...activeConnection,
            pendingChangesCount: nextPendingCount,
            updatedAt: nowIso,
          };
          await sheetHubStore.saveConnection(activeUserId, updatedConn);
          setConnections((prev) => prev.map((c) => (c.id === updatedConn.id ? updatedConn : c)));
          showToast('Saved locally. Use "Push Changes" anytime to sync to Google Sheet.', 'info');
          return;
        }
      }

      setSyncingRowUids((prev) => ({ ...prev, [row.rowUid]: true }));
      try {
        const pushRes = await pushUpdatesWithWriteAuth(activeConnection, [
          {
            sheetTitle: tab.sheetTitle,
            rowNumber: row.lastKnownSheetRow,
            colLetter: col.colLetter,
            value: nextValue,
          },
        ]);

        if (!pushRes.pushed) {
          const updatedConn: SheetConnection = {
            ...activeConnection,
            pendingChangesCount: nextPendingCount,
            updatedAt: nowIso,
          };
          await sheetHubStore.saveConnection(activeUserId, updatedConn);
          setConnections((prev) => prev.map((c) => (c.id === updatedConn.id ? updatedConn : c)));
          if (pushRes.cancelled) {
            showToast('Saved locally. Authorize edit access to push to Google Sheet.', 'info');
          }
          return;
        }

        const pushedAt = pushRes.pushedAt || new Date().toISOString();
        const syncedRow: SheetSyncedRow = {
          ...localUpdatedRow,
          baseValues: { ...localUpdatedRow.baseValues, [col.fieldKey]: nextValue },
          dirtyFields: nextDirty.filter((f) => f !== col.fieldKey),
          status: nextDirty.filter((f) => f !== col.fieldKey).length > 0 ? 'pending_push' : 'synced',
          sheetSyncedAt: pushedAt,
          updatedAt: pushedAt,
        };

        const finalTabRows = nextTabRows.map((r) => (r.rowUid === row.rowUid ? syncedRow : r));
        const finalRowsByTabId = { ...nextRowsByTabId, [tab.id]: finalTabRows };
        setRowsByTabId(finalRowsByTabId);

        let remainingPending = 0;
        for (const list of Object.values(finalRowsByTabId)) {
          for (const item of list) {
            if (item.status === 'pending_push') remainingPending++;
          }
        }

        await sheetHubStore.saveTabRowsChunked({
          userId: activeUserId,
          connectionId: activeConnection.id,
          tabId: tab.id,
          rows: finalTabRows,
        });

        const updatedConn: SheetConnection = {
          ...activeConnection,
          syncMode: 'two_way',
          status: 'active',
          lastError: null,
          lastSyncedAt: pushedAt,
          lastSuccessfulPushAt: pushedAt,
          pendingChangesCount: remainingPending,
          updatedAt: pushedAt,
        };
        await sheetHubStore.saveConnection(activeUserId, updatedConn);
        setConnections((prev) => prev.map((c) => (c.id === updatedConn.id ? updatedConn : c)));

        showToast(
          nextValue
            ? `Marked done & synced to Google Sheet (${tab.sheetTitle}!${cellRef})`
            : `Unmarked & synced to Google Sheet (${tab.sheetTitle}!${cellRef})`,
          'success'
        );
      } catch (err: any) {
        const errMsg = err?.message || 'Could not update Google Sheet. Change is saved locally.';
        const updatedConn: SheetConnection = {
          ...activeConnection,
          lastError: errMsg,
          pendingChangesCount: nextPendingCount,
          updatedAt: new Date().toISOString(),
        };
        await sheetHubStore.saveConnection(activeUserId, updatedConn);
        setConnections((prev) => prev.map((c) => (c.id === updatedConn.id ? updatedConn : c)));
        showToast(errMsg, 'error');
      } finally {
        setSyncingRowUids((prev) => {
          const copy = { ...prev };
          delete copy[row.rowUid];
          return copy;
        });
      }
    },
    [activeConnection, activeUserId, rowsByTabId, confirmAction, pushUpdatesWithWriteAuth, showToast]
  );

  // Batch push all pending_push mark/unmark changes across all tabs of active connection
  const handlePushPendingChanges = useCallback(async () => {
    if (!activeConnection || activeConnection.spreadsheetId === 'sem3-syllabus-sample') return;

    const updates: SheetHubCellUpdateRequest[] = [];
    const affectedTabNames = new Set<string>();
    const pendingByTab = new Map<string, SheetSyncedRow[]>();

    for (const tab of tabs) {
      const tabRows = rowsByTabId[tab.id] || [];
      const dirtyRows = tabRows.filter((r) => r.status === 'pending_push' && r.lastKnownSheetRow >= 1);
      if (dirtyRows.length === 0) continue;

      pendingByTab.set(tab.id, dirtyRows);
      for (const row of dirtyRows) {
        const fieldsToPush =
          row.dirtyFields && row.dirtyFields.length > 0
            ? row.dirtyFields
            : tab.columns
                .filter((c) => c.semanticRole === 'done' || c.inferredType === 'checkbox' || c.inferredType === 'boolean')
                .map((c) => c.fieldKey);

        for (const fieldKey of fieldsToPush) {
          const col = tab.columns.find((c) => c.fieldKey === fieldKey);
          if (!col || col.inferredType === 'formula' || col.editable === false) continue;
          updates.push({
            sheetTitle: tab.sheetTitle,
            rowNumber: row.lastKnownSheetRow,
            colLetter: col.colLetter,
            value: row.values[fieldKey] ?? null,
          });
          affectedTabNames.add(tab.sheetTitle);
        }
      }
    }

    if (updates.length === 0) {
      showToast('No pending local changes to push.', 'info');
      return;
    }

    const confirmed = await confirmAction({
      title: `Push ${updates.length} ${updates.length === 1 ? 'Change' : 'Changes'} to Google Sheet?`,
      message: `This will update ${updates.length} cell(s) across ${Array.from(affectedTabNames).join(
        ', '
      )} in "${activeConnection.title}".`,
      confirmLabel: 'Push to Google Sheet',
      cancelLabel: 'Cancel',
      tone: 'primary',
    });

    if (!confirmed) return;

    setIsPushing(true);
    try {
      const pushRes = await pushUpdatesWithWriteAuth(activeConnection, updates);
      if (!pushRes.pushed) {
        if (pushRes.cancelled) {
          showToast('Push cancelled. Your changes remain saved locally.', 'info');
        }
        return;
      }

      const pushedAt = pushRes.pushedAt || new Date().toISOString();
      const updatedRowsByTabId: Record<string, SheetSyncedRow[]> = { ...rowsByTabId };

      for (const [tabId] of pendingByTab.entries()) {
        const tabRows = rowsByTabId[tabId] || [];
        const syncedRows: SheetSyncedRow[] = tabRows.map((r) =>
          r.status === 'pending_push'
            ? {
                ...r,
                baseValues: { ...r.values },
                dirtyFields: [],
                status: 'synced',
                sheetSyncedAt: pushedAt,
                updatedAt: pushedAt,
              }
            : r
        );
        updatedRowsByTabId[tabId] = syncedRows;
        await sheetHubStore.saveTabRowsChunked({
          userId: activeUserId,
          connectionId: activeConnection.id,
          tabId,
          rows: syncedRows,
        });
      }

      setRowsByTabId(updatedRowsByTabId);

      const updatedConn: SheetConnection = {
        ...activeConnection,
        status: 'active',
        lastError: null,
        lastSyncedAt: pushedAt,
        lastSuccessfulPushAt: pushedAt,
        pendingChangesCount: 0,
        updatedAt: pushedAt,
      };
      await sheetHubStore.saveConnection(activeUserId, updatedConn);
      setConnections((prev) => prev.map((c) => (c.id === updatedConn.id ? updatedConn : c)));

      showToast(
        `Successfully synced ${pushRes.updatedCells || updates.length} cell(s) to Google Sheet!`,
        'success'
      );
    } catch (err: any) {
      const errMsg = err?.message || 'Failed to push pending changes to Google Sheets.';
      const updatedConn: SheetConnection = {
        ...activeConnection,
        lastError: errMsg,
        updatedAt: new Date().toISOString(),
      };
      await sheetHubStore.saveConnection(activeUserId, updatedConn);
      setConnections((prev) => prev.map((c) => (c.id === updatedConn.id ? updatedConn : c)));
      showToast(errMsg, 'error');
    } finally {
      setIsPushing(false);
    }
  }, [activeConnection, activeUserId, tabs, rowsByTabId, confirmAction, pushUpdatesWithWriteAuth, showToast]);

  // Pull / Refresh action for active spreadsheet
  const handlePullUpdates = async (connId = activeConnectionId) => {
    if (!connId) return;
    if (connId === activeConnectionId && pendingChangesCount > 0 && !isDemoSheet) {
      const proceedPull = await confirmAction({
        title: 'Unsynced Local Changes Detected',
        message: `You have ${pendingChangesCount} local mark/unmark change(s) not yet pushed to Google Sheets. Pulling now will replace local checkboxes with the latest values from Google Sheets. Continue pulling?`,
        confirmLabel: 'Pull & Overwrite Local',
        cancelLabel: 'Cancel',
        tone: 'warning',
      });
      if (!proceedPull) return;
    }
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
        // Live Google Sheets pull: reuse active OAuth token if present; otherwise try public link first, then prompt OAuth for private sheets
        const loadedTabs = await sheetHubStore.listTabsForConnection(activeUserId, connId);
        const tabsPayload = loadedTabs.map((t) => ({
          sheetId: t.sheetId,
          sheetTitle: t.sheetTitle,
          headerRowIndex: t.headerRowIndex || 1,
        }));

        let activeToken = await getSheetHubAccessToken();
        let res;

        if (activeToken) {
          try {
            res = await api.sheetHubPull(
              { spreadsheetId: conn.spreadsheetId, tabs: tabsPayload },
              activeToken
            );
          } catch (oauthErr: any) {
            const oauthCode = oauthErr?.code;
            if (oauthCode === 'SHEETS_AUTH_REQUIRED' || oauthErr?.status === 401) {
              // Fallback to public link pull before re-prompting OAuth
              try {
                res = await api.sheetHubPull(
                  { spreadsheetId: conn.spreadsheetId, tabs: tabsPayload, publicAccess: true },
                  null
                );
              } catch {
                activeToken = await authorizeSheetHubReadOnly();
                if (!activeToken) {
                  throw new Error('Google Sheets authorization is required to refresh this private spreadsheet.');
                }
                res = await api.sheetHubPull(
                  { spreadsheetId: conn.spreadsheetId, tabs: tabsPayload },
                  activeToken
                );
              }
            } else {
              throw oauthErr;
            }
          }
        } else {
          try {
            res = await api.sheetHubPull(
              { spreadsheetId: conn.spreadsheetId, tabs: tabsPayload, publicAccess: true },
              null
            );
          } catch (publicErr: any) {
            if (publicErr?.code === 'SHEET_PRIVATE_AUTH_REQUIRED') {
              activeToken = await authorizeSheetHubReadOnly();
              if (!activeToken) {
                throw new Error('This spreadsheet is private. Authorize Google Sheets read-only access or share as "Anyone with the link (Viewer)".');
              }
              res = await api.sheetHubPull(
                { spreadsheetId: conn.spreadsheetId, tabs: tabsPayload },
                activeToken
              );
            } else {
              throw publicErr;
            }
          }
        }

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
          lastError: null,
          pendingChangesCount: 0,
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

  const handleCreateNativeSheet = async () => {
    if (!newSheetTitle.trim()) return;
    try {
      const res = await sheetHubStore.createNativeSpreadsheet(activeUserId, {
        title: newSheetTitle.trim(),
        description: newSheetDesc.trim() || null,
        templateHint: newSheetTemplate,
      });
      setCreateSheetModalOpen(false);
      setNewSheetTitle('');
      setNewSheetDesc('');
      await loadConnections();
      setActiveConnectionId(res.sheet.id);
      showToast(`Spreadsheet "${res.sheet.title}" created successfully!`, 'success');
    } catch (err: any) {
      showToast(err?.message || 'Failed to create spreadsheet.', 'error');
    }
  };

  const displayedConnections = useMemo(() => {
    if (filterMode === 'native') return connections.filter((c) => c.isNative);
    if (filterMode === 'google') return connections.filter((c) => !c.isNative);
    return connections;
  }, [connections, filterMode]);

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
    if (activeConnection.isNative) {
      return (
        <NativeSpreadsheetEditor
          sheet={activeConnection}
          tabs={tabs}
          rowsByTabId={rowsByTabId}
          userId={activeUserId}
          onClose={() => setActiveConnectionId(null)}
          onUpdateSheet={(upd) => {
            setConnections((prev) => prev.map((c) => (c.id === upd.id ? upd : c)));
          }}
          onUpdateTabs={(updTabs) => setTabs(updTabs)}
          onUpdateRows={(tabId, rows) => {
            setRowsByTabId((prev) => ({ ...prev, [tabId]: rows }));
          }}
          onDeleteSheet={() => {
            setActiveConnectionId(null);
            setTabs([]);
            setRowsByTabId({});
            loadConnections();
          }}
          showToast={showToast}
        />
      );
    }

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
          isPushing={isPushing}
          pendingCount={pendingChangesCount}
          isDemoSheet={isDemoSheet}
          onPull={() => handlePullUpdates(activeConnection.id)}
          onPushPending={handlePushPendingChanges}
          onToggleSyncMode={handleToggleSyncMode}
          onReconnect={() => handleReconnect()}
        />

        {/* Tabs Navigation Switcher */}
        <div className="flex items-center gap-1.5 overflow-x-auto pb-1 border-b border-[var(--ff-border-color)]">
          {tabs.map((tab) => {
            const isSelected = selectedTabId === tab.id;
            const tabRows = rowsByTabId[tab.id] || [];
            const rowCount = tabRows.length;
            const tabPendingCount = tabRows.filter((r) => r.status === 'pending_push').length;
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
                {!isOverview && !isDemoSheet && tabPendingCount > 0 && (
                  <span
                    className="w-2 h-2 rounded-full bg-amber-400 shrink-0"
                    title={`${tabPendingCount} pending push`}
                  />
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
            onToggleCell={(row, col, nextVal) => handleToggleCell(activeTab, row, col, nextVal)}
            syncingRowUids={syncingRowUids}
            syncMode={activeConnection.syncMode}
            isDemoSheet={isDemoSheet}
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
              Native Sheets Active
            </ThemeBadge>
          </div>
          <h2 className="text-2xl font-bold text-[var(--ff-text-primary)] mt-0.5 flex items-center gap-2.5">
            <FileSpreadsheet className="w-6 h-6 text-emerald-500" />
            <span>Sheet Workspace &amp; Sync Hub</span>
          </h2>
          <p className="text-xs text-[var(--ff-text-secondary)] mt-1">
            Manage your 100% private native spreadsheets or connect external Google Sheets seamlessly.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2.5">
          {firebaseUser ? (
            <ThemeButton
              variant="secondary"
              size="sm"
              onClick={async () => {
                await loadConnections(true);
                showToast('Synced your spreadsheets with Cloud Firestore!', 'success');
              }}
              disabled={isLoading}
              className="flex items-center gap-1.5"
              title="Refresh spreadsheets from your Gmail Cloud account"
            >
              <RotateCcw className={`w-3.5 h-3.5 ${isLoading ? 'animate-spin' : ''}`} />
              <span>Sync Cloud</span>
            </ThemeButton>
          ) : (
            <ThemeButton
              variant="secondary"
              size="sm"
              onClick={() => signInWithGoogle()}
              className="flex items-center gap-1.5 border-amber-500/40 text-amber-500"
              title="Sign in with Gmail so your connected sheets appear on all your devices"
            >
              <ShieldCheck className="w-3.5 h-3.5" />
              <span>Sign in to Sync Across Devices</span>
            </ThemeButton>
          )}

          <ThemeButton
            variant="primary"
            onClick={() => setCreateSheetModalOpen(true)}
            className="flex items-center gap-2 shadow-lg shadow-[var(--ff-accent)]/10"
          >
            <Plus className="w-4 h-4" />
            <span>Create New Sheet</span>
          </ThemeButton>

          <ThemeButton
            variant="secondary"
            onClick={() => setWizardOpen(true)}
            className="flex items-center gap-2"
          >
            <ExternalLink className="w-4 h-4 text-emerald-500" />
            <span>Connect Google Sheet</span>
          </ThemeButton>
        </div>
      </div>

      {/* Snapshot KPI Summary Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <ThemeCard variant="elevated" className="p-4 border border-[var(--ff-border-color)]">
          <div className="flex items-center justify-between text-xs text-[var(--ff-text-muted)] mb-1">
            <span className="uppercase font-semibold tracking-wider text-[10px]">Total Spreadsheets</span>
            <FileSpreadsheet className="w-4 h-4 text-emerald-500" />
          </div>
          <div className="text-2xl font-bold text-[var(--ff-text-primary)]">
            <AnimatedNumber value={connections.length} />
          </div>
          <p className="text-xs text-[var(--ff-text-muted)] mt-1">Workspace spreadsheets</p>
        </ThemeCard>

        <ThemeCard variant="elevated" className="p-4 border border-[var(--ff-border-color)]">
          <div className="flex items-center justify-between text-xs text-[var(--ff-text-muted)] mb-1">
            <span className="uppercase font-semibold tracking-wider text-[10px]">Native Private Sheets</span>
            <Database className="w-4 h-4 text-[var(--ff-accent)]" />
          </div>
          <div className="text-2xl font-bold text-[var(--ff-accent)]">
            <AnimatedNumber value={connections.filter((c) => c.isNative).length} />
          </div>
          <p className="text-xs text-[var(--ff-text-muted)] mt-1">Stored in Cloud Firestore</p>
        </ThemeCard>

        <ThemeCard variant="elevated" className="p-4 border border-[var(--ff-border-color)]">
          <div className="flex items-center justify-between text-xs text-[var(--ff-text-muted)] mb-1">
            <span className="uppercase font-semibold tracking-wider text-[10px]">Synced Sheets</span>
            <Layers className="w-4 h-4 text-blue-500" />
          </div>
          <div className="text-2xl font-bold text-[var(--ff-text-primary)]">
            <AnimatedNumber value={connections.filter((c) => !c.isNative).length} />
          </div>
          <p className="text-xs text-[var(--ff-text-muted)] mt-1">Google Sheets &amp; Demo fixtures</p>
        </ThemeCard>

        <ThemeCard variant="elevated" className="p-4 border border-[var(--ff-border-color)]">
          <div className="flex items-center justify-between text-xs text-[var(--ff-text-muted)] mb-1">
            <span className="uppercase font-semibold tracking-wider text-[10px]">Security Model</span>
            <Lock className="w-4 h-4 text-emerald-500" />
          </div>
          <div className="text-sm font-bold text-emerald-500 mt-1">
            Multi-Tenant Isolated
          </div>
          <p className="text-xs text-[var(--ff-text-muted)] mt-1">UID-enforced Firestore Rules</p>
        </ThemeCard>
      </div>

      {/* Filter Tabs & Search Bar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-2 border-b border-[var(--ff-border-color)]">
        <div className="flex items-center gap-2 overflow-x-auto">
          <button
            type="button"
            onClick={() => setFilterMode('all')}
            className={`px-3 py-1.5 rounded-xl text-xs font-semibold transition-all whitespace-nowrap ${
              filterMode === 'all'
                ? 'bg-[var(--ff-accent)] text-[var(--ff-accent-contrast)] shadow-sm'
                : 'bg-[var(--ff-surface)] text-[var(--ff-text-secondary)] hover:text-[var(--ff-text-primary)] border border-[var(--ff-border-color)]'
            }`}
          >
            All Sheets ({connections.length})
          </button>
          <button
            type="button"
            onClick={() => setFilterMode('native')}
            className={`px-3 py-1.5 rounded-xl text-xs font-semibold transition-all whitespace-nowrap ${
              filterMode === 'native'
                ? 'bg-[var(--ff-accent)] text-[var(--ff-accent-contrast)] shadow-sm'
                : 'bg-[var(--ff-surface)] text-[var(--ff-text-secondary)] hover:text-[var(--ff-text-primary)] border border-[var(--ff-border-color)]'
            }`}
          >
            My Native Sheets ({connections.filter((c) => c.isNative).length})
          </button>
          <button
            type="button"
            onClick={() => setFilterMode('google')}
            className={`px-3 py-1.5 rounded-xl text-xs font-semibold transition-all whitespace-nowrap ${
              filterMode === 'google'
                ? 'bg-[var(--ff-accent)] text-[var(--ff-accent-contrast)] shadow-sm'
                : 'bg-[var(--ff-surface)] text-[var(--ff-text-secondary)] hover:text-[var(--ff-text-primary)] border border-[var(--ff-border-color)]'
            }`}
          >
            Google Sheets Sync ({connections.filter((c) => !c.isNative).length})
          </button>
        </div>

        <span className="text-xs text-[var(--ff-text-muted)]">
          {displayedConnections.length} {displayedConnections.length === 1 ? 'spreadsheet' : 'spreadsheets'} shown
        </span>
      </div>

      {/* Connected Spreadsheets Grid */}
      <div className="space-y-4">
        {isLoading ? (
          <div className="py-16 text-center text-xs text-[var(--ff-text-muted)]">
            <RotateCcw className="w-6 h-6 animate-spin mx-auto mb-2 text-[var(--ff-accent)]" />
            <span>Loading spreadsheets...</span>
          </div>
        ) : displayedConnections.length === 0 ? (
          /* Empty State */
          <ThemeCard
            variant="elevated"
            className="p-10 border border-dashed border-[var(--ff-border-color)] text-center space-y-4 max-w-lg mx-auto"
          >
            <div className="w-14 h-14 rounded-2xl bg-emerald-500/10 text-emerald-500 flex items-center justify-center mx-auto border border-emerald-500/20">
              <FileSpreadsheet className="w-7 h-7" />
            </div>

            <div>
              <h4 className="font-bold text-base text-[var(--ff-text-primary)]">
                {filterMode === 'native'
                  ? 'No Native Spreadsheets Created Yet'
                  : filterMode === 'google'
                  ? 'No Google Sheets Synced Yet'
                  : 'No Spreadsheets Found'}
              </h4>
              <p className="text-xs text-[var(--ff-text-secondary)] mt-1 max-w-sm mx-auto">
                Create a 100% private native spreadsheet with interactive grid editing, or connect an external Google Sheet.
              </p>
            </div>

            <div className="pt-2 flex flex-col sm:flex-row items-center justify-center gap-3">
              <ThemeButton variant="primary" onClick={() => setCreateSheetModalOpen(true)}>
                <Plus className="w-4 h-4 mr-1.5" /> Create New Sheet
              </ThemeButton>
              <ThemeButton variant="secondary" onClick={() => setWizardOpen(true)}>
                <ExternalLink className="w-4 h-4 mr-1.5 text-emerald-500" /> Connect Google Sheet
              </ThemeButton>
            </div>
          </ThemeCard>
        ) : (
          /* Grid of Connection Cards */
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {displayedConnections.map((conn) => (
              <SheetConnectionCard
                key={conn.id}
                connection={conn}
                tabCount={conn.tabOrder.length}
                onOpen={(id) => setActiveConnectionId(id)}
                onRefresh={(id) => handlePullUpdates(id)}
                onTogglePause={(id) => handleTogglePause(id)}
                onReconnect={() => handleReconnect(conn)}
                onRemove={(id, purge) => handleRemoveConnection(id, purge)}
                isPulling={isPulling}
              />
            ))}
          </div>
        )}
      </div>

      {/* CREATE NEW NATIVE SHEET MODAL */}
      <ThemeModal
        isOpen={createSheetModalOpen}
        onClose={() => setCreateSheetModalOpen(false)}
        title="Create Native Spreadsheet"
      >
        <div className="space-y-4">
          <p className="text-xs text-[var(--ff-text-muted)]">
            Create a fast, 100% private spreadsheet stored securely in Cloud Firestore under your account. Zero Google Drive permissions or OAuth required.
          </p>

          <div>
            <label className="text-xs font-semibold text-[var(--ff-text-primary)] block mb-1">
              Spreadsheet Title *
            </label>
            <ThemeInput
              value={newSheetTitle}
              onChange={(e: React.ChangeEvent<HTMLInputElement>) => setNewSheetTitle(e.target.value)}
              placeholder="e.g. Q4 Budget &amp; Financials, Study Schedule, Habit Matrix"
              autoFocus
            />
          </div>

          <div>
            <label className="text-xs font-semibold text-[var(--ff-text-primary)] block mb-1">
              Description (Optional)
            </label>
            <ThemeInput
              value={newSheetDesc}
              onChange={(e: React.ChangeEvent<HTMLInputElement>) => setNewSheetDesc(e.target.value)}
              placeholder="Brief description or purpose of this sheet"
            />
          </div>

          <div>
            <label className="text-xs font-semibold text-[var(--ff-text-primary)] block mb-2">
              Template Preset
            </label>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
              <div
                onClick={() => setNewSheetTemplate('table')}
                className={`p-3 rounded-xl border cursor-pointer transition-all ${
                  newSheetTemplate === 'table'
                    ? 'border-[var(--ff-accent)] bg-[var(--ff-accent)]/10 ring-1 ring-[var(--ff-accent)]'
                    : 'border-[var(--ff-border-color)] bg-[var(--ff-surface)] hover:bg-[var(--ff-surface-hover)]'
                }`}
              >
                <div className="font-bold text-xs text-[var(--ff-text-primary)] flex items-center gap-1.5">
                  <TableIcon className="w-3.5 h-3.5 text-blue-500" />
                  <span>Blank Table</span>
                </div>
                <p className="text-[11px] text-[var(--ff-text-muted)] mt-1">
                  Classic columns (A-E) for general data entry and calculations.
                </p>
              </div>

              <div
                onClick={() => setNewSheetTemplate('checklist')}
                className={`p-3 rounded-xl border cursor-pointer transition-all ${
                  newSheetTemplate === 'checklist'
                    ? 'border-[var(--ff-accent)] bg-[var(--ff-accent)]/10 ring-1 ring-[var(--ff-accent)]'
                    : 'border-[var(--ff-border-color)] bg-[var(--ff-surface)] hover:bg-[var(--ff-surface-hover)]'
                }`}
              >
                <div className="font-bold text-xs text-[var(--ff-text-primary)] flex items-center gap-1.5">
                  <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500" />
                  <span>Task Checklist</span>
                </div>
                <p className="text-[11px] text-[var(--ff-text-muted)] mt-1">
                  Module, Topic, Done checkbox, and Notes for studying &amp; tasks.
                </p>
              </div>

              <div
                onClick={() => setNewSheetTemplate('tracker')}
                className={`p-3 rounded-xl border cursor-pointer transition-all ${
                  newSheetTemplate === 'tracker'
                    ? 'border-[var(--ff-accent)] bg-[var(--ff-accent)]/10 ring-1 ring-[var(--ff-accent)]'
                    : 'border-[var(--ff-border-color)] bg-[var(--ff-surface)] hover:bg-[var(--ff-surface-hover)]'
                }`}
              >
                <div className="font-bold text-xs text-[var(--ff-text-primary)] flex items-center gap-1.5">
                  <Sparkles className="w-3.5 h-3.5 text-purple-500" />
                  <span>Project Tracker</span>
                </div>
                <p className="text-[11px] text-[var(--ff-text-muted)] mt-1">
                  Task Item, Priority, Status, and Due Date tracking.
                </p>
              </div>
            </div>
          </div>

          <div className="flex justify-end gap-2 pt-3 border-t border-[var(--ff-border-color)]">
            <ThemeButton variant="secondary" onClick={() => setCreateSheetModalOpen(false)}>
              Cancel
            </ThemeButton>
            <ThemeButton
              variant="primary"
              onClick={handleCreateNativeSheet}
              disabled={!newSheetTitle.trim()}
              className="flex items-center gap-1.5"
            >
              <Plus className="w-4 h-4" />
              <span>Create Spreadsheet</span>
            </ThemeButton>
          </div>
        </div>
      </ThemeModal>
    </div>
  );
};
