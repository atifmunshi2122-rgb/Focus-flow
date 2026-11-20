import React, { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import {
  ArrowLeft,
  Plus,
  PlusSquare,
  Search,
  Trash2,
  Edit2,
  Check,
  X,
  Lock,
  CheckCircle2,
  Circle,
  RotateCcw,
  AlertCircle,
  FileSpreadsheet,
  ChevronLeft,
  ChevronRight,
  Save,
  Sparkles,
} from 'lucide-react';
import { sheetHubStore } from '../../lib/sheetHub/sheetHubStore.ts';
import type {
  SheetCellScalar,
  SheetColumnMapping,
  SheetConnection,
  SheetFieldType,
  SheetSyncedRow,
  SheetTabSchema,
} from '../../types/sheetHub.ts';
import { ThemeButton, ThemeBadge, ThemeModal, ThemeInput, ThemeCard } from '../ui/ThemePrimitives.tsx';

interface NativeSpreadsheetEditorProps {
  sheet: SheetConnection;
  tabs: SheetTabSchema[];
  rowsByTabId: Record<string, SheetSyncedRow[]>;
  userId: string;
  onClose: () => void;
  onUpdateSheet: (updated: SheetConnection) => void;
  onUpdateTabs: (tabs: SheetTabSchema[]) => void;
  onUpdateRows: (tabId: string, rows: SheetSyncedRow[]) => void;
  onDeleteSheet: (sheetId: string) => void;
  showToast: (msg: string, type?: 'success' | 'error' | 'info') => void;
}

type SaveState = 'saved' | 'saving' | 'unsaved' | 'error' | 'conflict';

export const NativeSpreadsheetEditor: React.FC<NativeSpreadsheetEditorProps> = ({
  sheet,
  tabs,
  rowsByTabId,
  userId,
  onClose,
  onUpdateSheet,
  onUpdateTabs,
  onUpdateRows,
  onDeleteSheet,
  showToast,
}) => {
  // Tab Selection
  const [activeTabId, setActiveTabId] = useState<string>(
    tabs[0]?.id || sheet.tabOrder[0] || ''
  );

  // Sync activeTabId if tabs change and current tab is deleted
  useEffect(() => {
    if (!tabs.some((t) => t.id === activeTabId) && tabs.length > 0) {
      setActiveTabId(tabs[0].id);
    }
  }, [tabs, activeTabId]);

  const activeTab = useMemo(
    () => tabs.find((t) => t.id === activeTabId) || tabs[0] || null,
    [tabs, activeTabId]
  );

  const activeRows = useMemo(
    () => (activeTab ? rowsByTabId[activeTab.id] || [] : []),
    [rowsByTabId, activeTab]
  );

  // Search
  const [searchQuery, setSearchQuery] = useState('');

  // Save state
  const [saveState, setSaveState] = useState<SaveState>('saved');
  const [lastSavedTime, setLastSavedTime] = useState<string>(new Date().toLocaleTimeString());

  // Editing state
  const [editingCell, setEditingCell] = useState<{
    rowUid: string;
    fieldKey: string;
  } | null>(null);
  const [editValue, setEditValue] = useState<string>('');
  const cellInputRef = useRef<HTMLInputElement>(null);

  // Title Rename Modal / State
  const [isRenamingSheet, setIsRenamingSheet] = useState(false);
  const [sheetTitleInput, setSheetTitleInput] = useState(sheet.title);

  // Tab Modals
  const [newTabModalOpen, setNewTabModalOpen] = useState(false);
  const [newTabTitle, setNewTabTitle] = useState('');

  const [renameTabModalOpen, setRenameTabModalOpen] = useState(false);
  const [renameTabId, setRenameTabId] = useState<string | null>(null);
  const [renameTabTitle, setRenameTabTitle] = useState('');

  const [deleteTabModalOpen, setDeleteTabModalOpen] = useState(false);
  const [deleteTabTargetId, setDeleteTabTargetId] = useState<string | null>(null);

  // Column Modal
  const [newColModalOpen, setNewColModalOpen] = useState(false);
  const [newColName, setNewColName] = useState('');
  const [newColType, setNewColType] = useState<SheetFieldType>('text');

  // Sheet Delete Confirmation Modal
  const [deleteSheetModalOpen, setDeleteSheetModalOpen] = useState(false);

  // Focus input when editing starts
  useEffect(() => {
    if (editingCell && cellInputRef.current) {
      cellInputRef.current.focus();
      cellInputRef.current.select();
    }
  }, [editingCell]);

  // Filtered rows based on search
  const filteredRows = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return activeRows;
    return activeRows.filter((r) =>
      Object.values(r.values || {}).some((val) => {
        if (val === null || val === undefined) return false;
        return String(val).toLowerCase().includes(q);
      })
    );
  }, [activeRows, searchQuery]);

  // Flush cell edit commit
  const commitCellEdit = useCallback(
    async (rowUid: string, fieldKey: string, nextRawVal: string) => {
      if (!activeTab) return;
      const col = activeTab.columns.find((c) => c.fieldKey === fieldKey);
      let parsedVal: SheetCellScalar = nextRawVal;

      if (col?.inferredType === 'number') {
        const num = parseFloat(nextRawVal);
        parsedVal = isNaN(num) ? (nextRawVal.trim() === '' ? null : nextRawVal) : num;
      } else if (col?.inferredType === 'checkbox' || col?.inferredType === 'boolean') {
        parsedVal = nextRawVal === 'true';
      } else if (nextRawVal.trim() === '') {
        parsedVal = null;
      }

      // Optimistic update in state
      const nextRows = activeRows.map((r) => {
        if (r.rowUid === rowUid) {
          return {
            ...r,
            values: { ...r.values, [fieldKey]: parsedVal },
            cells: { ...(r.cells || r.values), [fieldKey]: parsedVal },
            dirtyFields: Array.from(new Set([...(r.dirtyFields || []), fieldKey])),
            localUpdatedAt: new Date().toISOString(),
          };
        }
        return r;
      });

      onUpdateRows(activeTab.id, nextRows);
      setEditingCell(null);
      setSaveState('saving');

      try {
        await sheetHubStore.saveNativeCellEdit(userId, {
          sheetId: sheet.id,
          tabId: activeTab.id,
          rowUid,
          fieldKey,
          value: parsedVal,
        });
        setSaveState('saved');
        setLastSavedTime(new Date().toLocaleTimeString());
      } catch (err: any) {
        setSaveState('error');
        showToast(err?.message || 'Failed to save cell edit.', 'error');
      }
    },
    [activeTab, activeRows, userId, sheet.id, onUpdateRows, showToast]
  );

  // Toggle checkbox directly
  const handleToggleCheckbox = async (rowUid: string, fieldKey: string, currentVal: boolean) => {
    if (!activeTab) return;
    const nextVal = !currentVal;

    const nextRows = activeRows.map((r) => {
      if (r.rowUid === rowUid) {
        return {
          ...r,
          values: { ...r.values, [fieldKey]: nextVal },
          cells: { ...(r.cells || r.values), [fieldKey]: nextVal },
        };
      }
      return r;
    });

    onUpdateRows(activeTab.id, nextRows);
    setSaveState('saving');

    try {
      await sheetHubStore.saveNativeCellEdit(userId, {
        sheetId: sheet.id,
        tabId: activeTab.id,
        rowUid,
        fieldKey,
        value: nextVal,
      });
      setSaveState('saved');
      setLastSavedTime(new Date().toLocaleTimeString());
    } catch {
      setSaveState('error');
      showToast('Failed to save checkbox change.', 'error');
    }
  };

  // Add row
  const handleAddRow = async () => {
    if (!activeTab) return;
    setSaveState('saving');
    try {
      const newRow = await sheetHubStore.addNativeRow(userId, sheet.id, activeTab.id);
      onUpdateRows(activeTab.id, [...activeRows, newRow]);
      setSaveState('saved');
      setLastSavedTime(new Date().toLocaleTimeString());
      showToast('New row added.', 'info');
    } catch (err: any) {
      setSaveState('error');
      showToast(err?.message || 'Failed to add row.', 'error');
    }
  };

  // Retry saving pending operations
  const handleRetryPendingSave = async () => {
    setSaveState('saving');
    try {
      const res = await sheetHubStore.retryPendingOperations(userId);
      if (res.conflicts > 0) {
        setSaveState('conflict');
        showToast(
          `Conflict detected: ${res.conflicts} operation(s) conflict with newer cloud changes. Please reload to review.`,
          'error'
        );
      } else if (res.failed === 0) {
        setSaveState('saved');
        setLastSavedTime(new Date().toLocaleTimeString());
        showToast('All pending changes successfully saved to Cloud Firestore.', 'success');
      } else {
        setSaveState('error');
        showToast(`Retry finished: ${res.succeeded} saved, ${res.failed} still failing.`, 'error');
      }
    } catch (err: any) {
      setSaveState('error');
      showToast(err?.message || 'Failed to retry saving.', 'error');
    }
  };

  // Delete row
  const handleDeleteRow = async (rowUid: string) => {
    if (!activeTab) return;
    const nextRows = activeRows.filter((r) => r.rowUid !== rowUid);
    onUpdateRows(activeTab.id, nextRows);
    setSaveState('saving');

    try {
      await sheetHubStore.deleteNativeRow(userId, sheet.id, activeTab.id, rowUid);
      setSaveState('saved');
      setLastSavedTime(new Date().toLocaleTimeString());
      showToast('Row deleted.', 'info');
    } catch {
      setSaveState('error');
      showToast('Failed to delete row.', 'error');
    }
  };

  // Add column
  const handleAddColumn = async () => {
    if (!activeTab || !newColName.trim()) return;
    setSaveState('saving');
    try {
      const updatedTab = await sheetHubStore.addNativeColumn(
        userId,
        sheet.id,
        activeTab.id,
        newColName.trim(),
        newColType
      );
      const updatedTabs = tabs.map((t) => (t.id === updatedTab.id ? updatedTab : t));
      onUpdateTabs(updatedTabs);

      // Reload rows for new column default
      const rows = await sheetHubStore.loadTabRows(userId, activeTab.id);
      onUpdateRows(activeTab.id, rows);

      setNewColModalOpen(false);
      setNewColName('');
      setSaveState('saved');
      setLastSavedTime(new Date().toLocaleTimeString());
      showToast(`Column "${newColName}" added successfully.`, 'success');
    } catch (err: any) {
      setSaveState('error');
      showToast(err?.message || 'Failed to add column.', 'error');
    }
  };

  // Create tab
  const handleCreateTab = async () => {
    if (!newTabTitle.trim()) return;
    setSaveState('saving');
    try {
      const newTab = await sheetHubStore.createNativeTab(userId, sheet.id, newTabTitle.trim());
      const updatedTabs = [...tabs, newTab];
      onUpdateTabs(updatedTabs);
      setActiveTabId(newTab.id);

      const rows = await sheetHubStore.loadTabRows(userId, newTab.id);
      onUpdateRows(newTab.id, rows);

      setNewTabModalOpen(false);
      setNewTabTitle('');
      setSaveState('saved');
      setLastSavedTime(new Date().toLocaleTimeString());
      showToast(`Tab "${newTab.sheetTitle}" created.`, 'success');
    } catch (err: any) {
      setSaveState('error');
      showToast(err?.message || 'Failed to create tab.', 'error');
    }
  };

  // Rename tab
  const handleRenameTab = async () => {
    if (!renameTabId || !renameTabTitle.trim()) return;
    setSaveState('saving');
    try {
      const updatedTab = await sheetHubStore.renameNativeTab(
        userId,
        sheet.id,
        renameTabId,
        renameTabTitle.trim()
      );
      const updatedTabs = tabs.map((t) => (t.id === updatedTab.id ? updatedTab : t));
      onUpdateTabs(updatedTabs);
      setRenameTabModalOpen(false);
      setSaveState('saved');
      setLastSavedTime(new Date().toLocaleTimeString());
      showToast(`Tab renamed to "${updatedTab.sheetTitle}".`, 'success');
    } catch (err: any) {
      setSaveState('error');
      showToast(err?.message || 'Failed to rename tab.', 'error');
    }
  };

  // Delete tab
  const handleDeleteTab = async () => {
    if (!deleteTabTargetId) return;
    if (tabs.length <= 1) {
      showToast('Cannot delete the only tab in a spreadsheet.', 'error');
      setDeleteTabModalOpen(false);
      return;
    }
    setSaveState('saving');
    try {
      await sheetHubStore.deleteNativeTab(userId, sheet.id, deleteTabTargetId);
      const nextTabs = tabs.filter((t) => t.id !== deleteTabTargetId);
      onUpdateTabs(nextTabs);
      if (activeTabId === deleteTabTargetId) {
        setActiveTabId(nextTabs[0]?.id || '');
      }
      setDeleteTabModalOpen(false);
      setSaveState('saved');
      setLastSavedTime(new Date().toLocaleTimeString());
      showToast('Tab removed.', 'info');
    } catch (err: any) {
      setSaveState('error');
      showToast(err?.message || 'Failed to delete tab.', 'error');
    }
  };

  // Reorder tabs
  const handleMoveTab = async (tabIndex: number, direction: 'left' | 'right') => {
    const targetIdx = direction === 'left' ? tabIndex - 1 : tabIndex + 1;
    if (targetIdx < 0 || targetIdx >= tabs.length) return;

    const previousTabs = [...tabs];
    const newTabs = [...tabs];
    const [moved] = newTabs.splice(tabIndex, 1);
    newTabs.splice(targetIdx, 0, moved);

    const newOrder = newTabs.map((t) => t.id);
    onUpdateTabs(newTabs);

    try {
      await sheetHubStore.reorderNativeTabs(userId, sheet.id, newOrder);
      onUpdateSheet({ ...sheet, tabOrder: newOrder });
    } catch {
      onUpdateTabs(previousTabs);
      showToast('Failed to save new tab order.', 'error');
    }
  };

  // Rename spreadsheet
  const handleRenameSheet = async () => {
    if (!sheetTitleInput.trim()) return;
    try {
      const updated = await sheetHubStore.renameNativeSpreadsheet(userId, sheet.id, sheetTitleInput.trim());
      onUpdateSheet(updated);
      setIsRenamingSheet(false);
      showToast(`Spreadsheet renamed to "${updated.title}".`, 'success');
    } catch (err: any) {
      showToast(err?.message || 'Failed to rename spreadsheet.', 'error');
    }
  };

  // Delete spreadsheet
  const handleDeleteSheet = async () => {
    try {
      await sheetHubStore.deleteConnection(userId, sheet.id, true);
      onDeleteSheet(sheet.id);
      showToast(`Spreadsheet "${sheet.title}" deleted cleanly.`, 'success');
    } catch (err: any) {
      showToast(err?.message || 'Failed to delete spreadsheet.', 'error');
    }
  };

  return (
    <div className="space-y-4">
      {/* 1. TOP HEADER & WORKSPACE TOOLBAR */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3 p-4 rounded-2xl border border-[var(--ff-border-color)] bg-[var(--ff-surface)] shadow-sm">
        <div className="flex items-center gap-3 min-w-0">
          <button
            type="button"
            onClick={onClose}
            className="p-2 rounded-xl text-[var(--ff-text-muted)] hover:text-[var(--ff-text-primary)] hover:bg-[var(--ff-surface-hover)] border border-[var(--ff-border-color)] transition-colors shrink-0"
            title="Return to Spreadsheets List"
          >
            <ArrowLeft className="w-4 h-4" />
          </button>

          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <span className="text-xs text-[var(--ff-text-muted)] font-medium">Native Workspace</span>
              <span className="text-xs text-[var(--ff-text-muted)]">/</span>
              <ThemeBadge tone="success" className="text-[10px] px-1.5 py-0.2">
                100% Private Firestore
              </ThemeBadge>
            </div>

            {/* Editable Title */}
            {isRenamingSheet ? (
              <div className="flex items-center gap-2 mt-1">
                <input
                  type="text"
                  value={sheetTitleInput}
                  onChange={(e) => setSheetTitleInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') handleRenameSheet();
                    if (e.key === 'Escape') setIsRenamingSheet(false);
                  }}
                  autoFocus
                  className="px-2.5 py-1 text-base font-bold rounded-lg bg-[var(--ff-surface-muted)] border border-[var(--ff-accent)] text-[var(--ff-text-primary)] focus:outline-none"
                />
                <button
                  type="button"
                  onClick={handleRenameSheet}
                  className="p-1.5 rounded-lg bg-emerald-500 text-white hover:bg-emerald-600 transition-colors"
                >
                  <Check className="w-3.5 h-3.5" />
                </button>
                <button
                  type="button"
                  onClick={() => setIsRenamingSheet(false)}
                  className="p-1.5 rounded-lg bg-[var(--ff-surface-muted)] text-[var(--ff-text-muted)] hover:text-[var(--ff-text-primary)] transition-colors"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              </div>
            ) : (
              <div className="flex items-center gap-2 mt-1 group">
                <h2
                  className="text-lg font-bold text-[var(--ff-text-primary)] truncate cursor-pointer hover:text-[var(--ff-accent)] transition-colors"
                  onClick={() => {
                    setSheetTitleInput(sheet.title);
                    setIsRenamingSheet(true);
                  }}
                  title="Click to rename"
                >
                  {sheet.title}
                </h2>
                <button
                  type="button"
                  onClick={() => {
                    setSheetTitleInput(sheet.title);
                    setIsRenamingSheet(true);
                  }}
                  className="opacity-0 group-hover:opacity-100 p-1 text-[var(--ff-text-muted)] hover:text-[var(--ff-text-primary)] transition-opacity"
                  title="Rename spreadsheet"
                >
                  <Edit2 className="w-3.5 h-3.5" />
                </button>
              </div>
            )}

            <div className="flex items-center gap-3 text-[11px] text-[var(--ff-text-muted)] mt-0.5">
              <span>Created {new Date(sheet.createdAt).toLocaleDateString()}</span>
              <span>•</span>
              <span>Updated {new Date(sheet.updatedAt).toLocaleTimeString()}</span>
            </div>
          </div>
        </div>

        {/* Toolbar Status & Global Actions */}
        <div className="flex flex-wrap items-center gap-2.5">
          {/* Real-time saving status badge */}
          <div className="flex items-center gap-1.5 text-xs px-2.5 py-1.5 rounded-xl border border-[var(--ff-border-color)] bg-[var(--ff-surface-muted)]">
            {saveState === 'saved' && (
              <>
                <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500" />
                <span className="text-emerald-500 font-medium">Saved ({lastSavedTime})</span>
              </>
            )}
            {saveState === 'saving' && (
              <>
                <RotateCcw className="w-3.5 h-3.5 text-blue-500 animate-spin" />
                <span className="text-blue-500 font-medium">Saving to Firestore...</span>
              </>
            )}
            {saveState === 'unsaved' && (
              <>
                <div className="w-2 h-2 rounded-full bg-amber-500 animate-pulse" />
                <span className="text-amber-500 font-medium">Unsaved changes</span>
              </>
            )}
            {saveState === 'error' && (
              <button
                type="button"
                onClick={handleRetryPendingSave}
                className="flex items-center gap-1.5 text-rose-500 hover:text-rose-600 font-medium cursor-pointer transition-colors"
                title="Click to retry saving pending operations to Cloud Firestore"
              >
                <AlertCircle className="w-3.5 h-3.5 text-rose-500" />
                <span>Save error (Click to Retry)</span>
              </button>
            )}
            {saveState === 'conflict' && (
              <button
                type="button"
                onClick={() => window.location.reload()}
                className="flex items-center gap-1.5 text-amber-500 hover:text-amber-600 font-medium cursor-pointer transition-colors"
                title="Remote spreadsheet has newer changes. Click to reload and view latest cloud data."
              >
                <AlertCircle className="w-3.5 h-3.5 text-amber-500" />
                <span>Version Conflict (Click to Reload)</span>
              </button>
            )}
          </div>

          <ThemeButton
            variant="secondary"
            size="sm"
            onClick={handleAddRow}
            className="flex items-center gap-1.5"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>Add Row</span>
          </ThemeButton>

          <ThemeButton
            variant="secondary"
            size="sm"
            onClick={() => setNewColModalOpen(true)}
            className="flex items-center gap-1.5"
          >
            <PlusSquare className="w-3.5 h-3.5" />
            <span>Add Column</span>
          </ThemeButton>

          <button
            type="button"
            onClick={() => setDeleteSheetModalOpen(true)}
            className="p-2 rounded-xl text-rose-500 hover:bg-rose-500/10 border border-transparent hover:border-rose-500/20 transition-colors"
            title="Delete this spreadsheet"
          >
            <Trash2 className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* 2. TAB SWITCHER BAR */}
      <div className="flex items-center justify-between gap-2 border-b border-[var(--ff-border-color)] pb-2 overflow-x-auto">
        <div className="flex items-center gap-1.5 min-w-0">
          {tabs.map((tab, idx) => {
            const isSelected = tab.id === activeTab?.id;
            const rowCount = (rowsByTabId[tab.id] || []).length;

            return (
              <div
                key={tab.id}
                className={`group/tab relative flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold transition-all whitespace-nowrap border ${
                  isSelected
                    ? 'bg-[var(--ff-accent)] text-[var(--ff-accent-contrast)] border-transparent shadow-sm'
                    : 'bg-[var(--ff-surface)] text-[var(--ff-text-secondary)] hover:text-[var(--ff-text-primary)] hover:bg-[var(--ff-surface-hover)] border-[var(--ff-border-color)]'
                }`}
              >
                {/* Reorder Left */}
                {idx > 0 && (
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      handleMoveTab(idx, 'left');
                    }}
                    className="opacity-0 group-hover/tab:opacity-100 hover:scale-110 p-0.5 rounded transition-all"
                    title="Move tab left"
                  >
                    <ChevronLeft className="w-3 h-3" />
                  </button>
                )}

                <span
                  onClick={() => setActiveTabId(tab.id)}
                  className="cursor-pointer"
                  title="Switch to tab"
                >
                  {tab.sheetTitle}
                </span>

                <span
                  className={`text-[10px] px-1.5 py-0.2 rounded-full font-mono ${
                    isSelected
                      ? 'bg-[var(--ff-accent-contrast)]/20 text-[var(--ff-accent-contrast)]'
                      : 'bg-[var(--ff-surface-muted)] text-[var(--ff-text-muted)]'
                  }`}
                >
                  {rowCount}
                </span>

                {/* Rename tab trigger */}
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    setRenameTabId(tab.id);
                    setRenameTabTitle(tab.sheetTitle);
                    setRenameTabModalOpen(true);
                  }}
                  className="opacity-0 group-hover/tab:opacity-100 hover:scale-110 p-0.5 rounded transition-all"
                  title="Rename tab"
                >
                  <Edit2 className="w-2.5 h-2.5" />
                </button>

                {/* Delete tab trigger */}
                {tabs.length > 1 && (
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      setDeleteTabTargetId(tab.id);
                      setDeleteTabModalOpen(true);
                    }}
                    className="opacity-0 group-hover/tab:opacity-100 hover:text-rose-500 hover:scale-110 p-0.5 rounded transition-all"
                    title="Delete tab"
                  >
                    <X className="w-3 h-3" />
                  </button>
                )}

                {/* Reorder Right */}
                {idx < tabs.length - 1 && (
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      handleMoveTab(idx, 'right');
                    }}
                    className="opacity-0 group-hover/tab:opacity-100 hover:scale-110 p-0.5 rounded transition-all"
                    title="Move tab right"
                  >
                    <ChevronRight className="w-3 h-3" />
                  </button>
                )}
              </div>
            );
          })}

          {/* New Tab Button */}
          <button
            type="button"
            onClick={() => {
              setNewTabTitle(`Sheet ${tabs.length + 1}`);
              setNewTabModalOpen(true);
            }}
            className="flex items-center gap-1 px-2.5 py-1.5 text-xs font-semibold rounded-xl bg-[var(--ff-surface)] text-[var(--ff-text-secondary)] hover:text-[var(--ff-text-primary)] hover:bg-[var(--ff-surface-hover)] border border-[var(--ff-border-color)] transition-all"
            title="Add new sheet tab"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>New Tab</span>
          </button>
        </div>

        {/* Live Filter / Search within sheet */}
        <div className="relative w-48 sm:w-64 shrink-0">
          <Search className="w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-[var(--ff-text-muted)]" />
          <input
            type="text"
            placeholder="Search cells..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-8 pr-2.5 py-1 text-xs rounded-lg bg-[var(--ff-surface-muted)] border border-[var(--ff-border-color)] text-[var(--ff-text-primary)] placeholder-[var(--ff-text-muted)] focus:outline-none focus:border-[var(--ff-accent)]"
          />
        </div>
      </div>

      {/* 3. INTERACTIVE SPREADSHEET GRID */}
      {activeTab && (
        <div className="overflow-x-auto rounded-2xl border border-[var(--ff-border-color)] bg-[var(--ff-surface)] shadow-sm">
          <table className="w-full text-left text-xs border-collapse">
            {/* Header Row */}
            <thead>
              <tr className="border-b border-[var(--ff-border-color)] bg-[var(--ff-surface-muted)] text-[var(--ff-text-muted)] font-semibold text-[11px]">
                <th className="p-2.5 w-12 text-center border-r border-[var(--ff-border-color)]">#</th>
                {activeTab.columns.map((col) => (
                  <th
                    key={col.fieldKey}
                    className="p-2.5 border-r border-[var(--ff-border-color)] whitespace-nowrap min-w-[130px]"
                  >
                    <div className="flex items-center justify-between gap-1.5">
                      <div className="flex items-center gap-1.5 truncate">
                        <span className="font-mono text-[10px] text-[var(--ff-text-muted)] bg-[var(--ff-surface)] px-1 rounded border border-[var(--ff-border-color)]">
                          {col.colLetter}
                        </span>
                        <span className="font-bold text-[var(--ff-text-primary)]">
                          {col.displayName || col.headerName}
                        </span>
                      </div>
                      {col.inferredType === 'formula' && <Lock className="w-3 h-3 text-amber-500" />}
                    </div>
                  </th>
                ))}
                <th className="p-2.5 w-12 text-center">Actions</th>
              </tr>
            </thead>

            {/* Grid Data Rows */}
            <tbody className="divide-y divide-[var(--ff-border-color)] text-[var(--ff-text-primary)]">
              {filteredRows.length === 0 ? (
                <tr>
                  <td
                    colSpan={activeTab.columns.length + 2}
                    className="py-12 text-center text-xs text-[var(--ff-text-muted)]"
                  >
                    {searchQuery ? 'No matching rows found.' : 'This tab is empty.'}
                    <div className="mt-2">
                      <ThemeButton variant="secondary" size="sm" onClick={handleAddRow}>
                        <Plus className="w-3.5 h-3.5 mr-1" /> Add First Row
                      </ThemeButton>
                    </div>
                  </td>
                </tr>
              ) : (
                filteredRows.map((row, rIdx) => (
                  <tr
                    key={row.rowUid}
                    className="hover:bg-[var(--ff-surface-hover)]/70 transition-colors group/row"
                  >
                    {/* Physical Row Index */}
                    <td className="p-2.5 text-center font-mono text-[var(--ff-text-muted)] border-r border-[var(--ff-border-color)] bg-[var(--ff-surface-muted)]/30">
                      {row.lastKnownSheetRow || rIdx + 1}
                    </td>

                    {/* Data Cells */}
                    {activeTab.columns.map((col) => {
                      const val = row.values[col.fieldKey];
                      const isEditing =
                        editingCell?.rowUid === row.rowUid && editingCell?.fieldKey === col.fieldKey;

                      // Checkbox Cell
                      if (col.inferredType === 'checkbox' || col.inferredType === 'boolean') {
                        const isChecked = val === true;
                        return (
                          <td
                            key={col.fieldKey}
                            className="p-2.5 border-r border-[var(--ff-border-color)] cursor-pointer select-none"
                            onClick={() => handleToggleCheckbox(row.rowUid, col.fieldKey, isChecked)}
                          >
                            <div className="inline-flex items-center gap-1.5">
                              {isChecked ? (
                                <CheckCircle2 className="w-4 h-4 text-emerald-500 fill-emerald-500/20" />
                              ) : (
                                <Circle className="w-4 h-4 text-[var(--ff-text-muted)] hover:text-[var(--ff-accent)]" />
                              )}
                              <span className="text-[11px] font-medium text-[var(--ff-text-secondary)]">
                                {isChecked ? 'Done' : 'Pending'}
                              </span>
                            </div>
                          </td>
                        );
                      }

                      // Inline Cell Editor Active
                      if (isEditing) {
                        return (
                          <td
                            key={col.fieldKey}
                            className="p-1 border-r border-[var(--ff-border-color)] bg-[var(--ff-surface-muted)]"
                          >
                            <input
                              ref={cellInputRef}
                              type={col.inferredType === 'number' ? 'number' : col.inferredType === 'date' ? 'date' : 'text'}
                              value={editValue}
                              onChange={(e) => setEditValue(e.target.value)}
                              onBlur={() => commitCellEdit(row.rowUid, col.fieldKey, editValue)}
                              onKeyDown={(e) => {
                                if (e.key === 'Enter') {
                                  commitCellEdit(row.rowUid, col.fieldKey, editValue);
                                } else if (e.key === 'Escape') {
                                  setEditingCell(null);
                                }
                              }}
                              className="w-full px-2 py-1 text-xs rounded bg-[var(--ff-surface)] border border-[var(--ff-accent)] text-[var(--ff-text-primary)] focus:outline-none"
                            />
                          </td>
                        );
                      }

                      // Normal Cell Display
                      const displayVal = val === null || val === undefined ? '' : String(val);
                      return (
                        <td
                          key={col.fieldKey}
                          onClick={() => {
                            setEditingCell({ rowUid: row.rowUid, fieldKey: col.fieldKey });
                            setEditValue(displayVal);
                          }}
                          className="p-2.5 border-r border-[var(--ff-border-color)] cursor-text hover:bg-[var(--ff-surface-hover)] transition-colors truncate max-w-xs"
                          title="Click to edit cell"
                        >
                          {displayVal === '' ? (
                            <span className="text-[var(--ff-text-muted)]/50 italic text-[11px]">empty</span>
                          ) : (
                            <span className="text-xs text-[var(--ff-text-primary)] font-medium">
                              {displayVal}
                            </span>
                          )}
                        </td>
                      );
                    })}

                    {/* Row Delete Action */}
                    <td className="p-2.5 text-center">
                      <button
                        type="button"
                        onClick={() => handleDeleteRow(row.rowUid)}
                        className="opacity-0 group-hover/row:opacity-100 p-1 text-[var(--ff-text-muted)] hover:text-rose-500 hover:bg-rose-500/10 rounded transition-all"
                        title="Delete row"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>

          {/* Bottom Grid Actions */}
          <div className="p-3 border-t border-[var(--ff-border-color)] bg-[var(--ff-surface-muted)]/20 flex items-center justify-between">
            <ThemeButton variant="secondary" size="sm" onClick={handleAddRow} className="flex items-center gap-1.5">
              <Plus className="w-3.5 h-3.5" />
              <span>Add Row</span>
            </ThemeButton>
            <span className="text-xs text-[var(--ff-text-muted)] font-mono">
              {filteredRows.length} {filteredRows.length === 1 ? 'row' : 'rows'}
            </span>
          </div>
        </div>
      )}

      {/* 4. MODALS */}

      {/* A. Create Tab Modal */}
      <ThemeModal
        isOpen={newTabModalOpen}
        onClose={() => setNewTabModalOpen(false)}
        title="Create New Sheet Tab"
      >
        <div className="space-y-4">
          <div>
            <label className="text-xs font-semibold text-[var(--ff-text-primary)] block mb-1">
              Tab Title
            </label>
            <ThemeInput
              value={newTabTitle}
              onChange={(e) => setNewTabTitle(e.target.value)}
              placeholder="e.g. Expenses, Tasks, Semester 4"
              autoFocus
            />
          </div>
          <div className="flex justify-end gap-2 pt-2 border-t border-[var(--ff-border-color)]">
            <ThemeButton variant="secondary" onClick={() => setNewTabModalOpen(false)}>
              Cancel
            </ThemeButton>
            <ThemeButton variant="primary" onClick={handleCreateTab} disabled={!newTabTitle.trim()}>
              Create Tab
            </ThemeButton>
          </div>
        </div>
      </ThemeModal>

      {/* B. Rename Tab Modal */}
      <ThemeModal
        isOpen={renameTabModalOpen}
        onClose={() => setRenameTabModalOpen(false)}
        title="Rename Tab"
      >
        <div className="space-y-4">
          <div>
            <label className="text-xs font-semibold text-[var(--ff-text-primary)] block mb-1">
              New Tab Name
            </label>
            <ThemeInput
              value={renameTabTitle}
              onChange={(e) => setRenameTabTitle(e.target.value)}
              placeholder="Tab name"
              autoFocus
            />
          </div>
          <div className="flex justify-end gap-2 pt-2 border-t border-[var(--ff-border-color)]">
            <ThemeButton variant="secondary" onClick={() => setRenameTabModalOpen(false)}>
              Cancel
            </ThemeButton>
            <ThemeButton variant="primary" onClick={handleRenameTab} disabled={!renameTabTitle.trim()}>
              Save
            </ThemeButton>
          </div>
        </div>
      </ThemeModal>

      {/* C. Delete Tab Confirmation Modal */}
      <ThemeModal
        isOpen={deleteTabModalOpen}
        onClose={() => setDeleteTabModalOpen(false)}
        title="Delete Tab?"
      >
        <div className="space-y-4">
          <p className="text-xs text-[var(--ff-text-secondary)]">
            Are you sure you want to delete this tab and all its contained rows? This action cannot be undone.
          </p>
          <div className="flex justify-end gap-2 pt-2 border-t border-[var(--ff-border-color)]">
            <ThemeButton variant="secondary" onClick={() => setDeleteTabModalOpen(false)}>
              Cancel
            </ThemeButton>
            <ThemeButton variant="danger" onClick={handleDeleteTab}>
              Delete Tab
            </ThemeButton>
          </div>
        </div>
      </ThemeModal>

      {/* D. Add Column Modal */}
      <ThemeModal
        isOpen={newColModalOpen}
        onClose={() => setNewColModalOpen(false)}
        title="Add New Column"
      >
        <div className="space-y-4">
          <div>
            <label className="text-xs font-semibold text-[var(--ff-text-primary)] block mb-1">
              Column Header Name
            </label>
            <ThemeInput
              value={newColName}
              onChange={(e) => setNewColName(e.target.value)}
              placeholder="e.g. Due Date, Price, Description"
              autoFocus
            />
          </div>
          <div>
            <label className="text-xs font-semibold text-[var(--ff-text-primary)] block mb-1">
              Data Type
            </label>
            <select
              value={newColType}
              onChange={(e) => setNewColType(e.target.value as SheetFieldType)}
              className="w-full px-3 py-2 text-xs rounded-lg bg-[var(--ff-surface-muted)] border border-[var(--ff-border-color)] text-[var(--ff-text-primary)] focus:outline-none focus:border-[var(--ff-accent)]"
            >
              <option value="text">Text (Single-line)</option>
              <option value="long_text">Long Text (Notes)</option>
              <option value="number">Number</option>
              <option value="checkbox">Checkbox (True/False)</option>
              <option value="date">Date</option>
              <option value="priority">Priority</option>
              <option value="status">Status</option>
            </select>
          </div>
          <div className="flex justify-end gap-2 pt-2 border-t border-[var(--ff-border-color)]">
            <ThemeButton variant="secondary" onClick={() => setNewColModalOpen(false)}>
              Cancel
            </ThemeButton>
            <ThemeButton variant="primary" onClick={handleAddColumn} disabled={!newColName.trim()}>
              Add Column
            </ThemeButton>
          </div>
        </div>
      </ThemeModal>

      {/* E. Delete Entire Spreadsheet Modal */}
      <ThemeModal
        isOpen={deleteSheetModalOpen}
        onClose={() => setDeleteSheetModalOpen(false)}
        title={`Delete "${sheet.title}"?`}
      >
        <div className="space-y-4">
          <p className="text-xs text-[var(--ff-text-secondary)]">
            Are you sure you want to permanently delete <strong>{sheet.title}</strong>? All tabs, columns, and rows will be deleted from your Firestore workspace.
          </p>
          <div className="flex justify-end gap-2 pt-2 border-t border-[var(--ff-border-color)]">
            <ThemeButton variant="secondary" onClick={() => setDeleteSheetModalOpen(false)}>
              Keep Spreadsheet
            </ThemeButton>
            <ThemeButton variant="danger" onClick={handleDeleteSheet}>
              Delete Permanently
            </ThemeButton>
          </div>
        </div>
      </ThemeModal>
    </div>
  );
};
