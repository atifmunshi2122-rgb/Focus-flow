import React, { useState, useMemo } from 'react';
import {
  CheckCircle2,
  Circle,
  Search,
  Filter,
  ChevronDown,
  ChevronRight,
  ExternalLink,
  Lock,
  Table as TableIcon,
  CheckSquare,
  LayoutGrid,
  List,
  Sparkles,
  Info,
  Maximize2,
  Minimize2,
  Loader2,
  CloudUpload,
} from 'lucide-react';
import type {
  SheetColumnMapping,
  SheetSyncedRow,
  SheetSyncMode,
  SheetTabSchema,
} from '../../types/sheetHub.ts';
import { ThemeCard, ThemeButton, ThemeBadge, ThemeInput } from '../ui/ThemePrimitives.tsx';
import { AnimatedProgressBar } from '../ui/MotionPrimitives.tsx';

const isCellDone = (val: unknown): boolean =>
  val === true || (typeof val === 'string' && val.trim().toLowerCase() === 'true');

interface DynamicSheetRendererProps {
  schema: SheetTabSchema;
  rows: SheetSyncedRow[];
  viewMode?: 'checklist' | 'table' | 'grouped_list' | 'cards';
  onChangeViewMode?: (mode: 'checklist' | 'table' | 'grouped_list' | 'cards') => void;
  onToggleCell?: (row: SheetSyncedRow, col: SheetColumnMapping, nextValue: boolean) => void | Promise<void>;
  syncingRowUids?: Record<string, boolean>;
  syncMode?: SheetSyncMode;
  isDemoSheet?: boolean;
}

export const DynamicSheetRenderer: React.FC<DynamicSheetRendererProps> = ({
  schema,
  rows,
  viewMode = 'checklist',
  onChangeViewMode,
  onToggleCell,
  syncingRowUids = {},
  syncMode = 'two_way',
  isDemoSheet = false,
}) => {
  const [activeView, setActiveView] = useState<'checklist' | 'table' | 'grouped_list' | 'cards'>(
    viewMode || schema.defaultView || 'checklist'
  );
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | 'completed' | 'pending'>('all');
  const [collapsedGroups, setCollapsedGroups] = useState<Record<string, boolean>>({});
  const [collapsedSubgroups, setCollapsedSubgroups] = useState<Record<string, boolean>>({});

  const handleSetView = (m: 'checklist' | 'table' | 'grouped_list' | 'cards') => {
    setActiveView(m);
    if (onChangeViewMode) onChangeViewMode(m);
  };

  // Semantic column mappings
  const groupCol = useMemo(() => schema.columns.find((c) => c.semanticRole === 'group'), [schema]);
  const subgroupCol = useMemo(() => schema.columns.find((c) => c.semanticRole === 'subgroup'), [schema]);
  const titleCol = useMemo(
    () =>
      schema.columns.find((c) => c.semanticRole === 'title') ||
      schema.columns.find((c) => c.inferredType === 'text'),
    [schema]
  );
  const doneCol = useMemo(
    () =>
      schema.columns.find((c) => c.semanticRole === 'done') ||
      schema.columns.find((c) => c.inferredType === 'checkbox' || c.inferredType === 'boolean'),
    [schema]
  );
  const notesCol = useMemo(
    () =>
      schema.columns.find((c) => c.semanticRole === 'notes') ||
      schema.columns.find((c) => c.inferredType === 'long_text'),
    [schema]
  );

  // Filtered rows
  const filteredRows = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return rows.filter((r) => {
      // Status filter
      if (doneCol && statusFilter !== 'all') {
        const isDone = isCellDone(r.values[doneCol.fieldKey]);
        if (statusFilter === 'completed' && !isDone) return false;
        if (statusFilter === 'pending' && isDone) return false;
      }
      // Search query filter across all fields
      if (!q) return true;
      return Object.values(r.values).some((v) => {
        if (v === null || v === undefined) return false;
        return String(v).toLowerCase().includes(q);
      });
    });
  }, [rows, doneCol, statusFilter, searchQuery]);

  // Tab live stats (calculated dynamically)
  const stats = useMemo(() => {
    const total = rows.length;
    let completed = 0;
    if (doneCol) {
      completed = rows.filter((r) => isCellDone(r.values[doneCol.fieldKey])).length;
    }
    const percent = total > 0 ? Math.round((completed / total) * 100) : 0;
    return { total, completed, pending: Math.max(0, total - completed), percent };
  }, [rows, doneCol]);

  // Hierarchical tree grouping for Checklist view
  const hierarchicalData = useMemo(() => {
    const groups: Array<{
      groupName: string;
      totalCount: number;
      completedCount: number;
      subgroups: Array<{
        subgroupName: string;
        items: SheetSyncedRow[];
      }>;
    }> = [];

    const groupMap = new Map<string, Map<string, SheetSyncedRow[]>>();

    for (const row of filteredRows) {
      const gName = groupCol ? String(row.values[groupCol.fieldKey] || 'Module 1').trim() || 'Module 1' : 'General';
      const sgName = subgroupCol ? String(row.values[subgroupCol.fieldKey] || 'Topics').trim() || 'Topics' : 'Default';

      let sgMap = groupMap.get(gName);
      if (!sgMap) {
        sgMap = new Map();
        groupMap.set(gName, sgMap);
      }
      const list = sgMap.get(sgName) || [];
      list.push(row);
      sgMap.set(sgName, list);
    }

    for (const [gName, sgMap] of groupMap.entries()) {
      let gTotal = 0;
      let gDone = 0;
      const subgroupsArr: Array<{ subgroupName: string; items: SheetSyncedRow[] }> = [];

      for (const [sgName, items] of sgMap.entries()) {
        gTotal += items.length;
        if (doneCol) {
          gDone += items.filter((r) => isCellDone(r.values[doneCol.fieldKey])).length;
        }
        subgroupsArr.push({ subgroupName: sgName, items });
      }

      groups.push({
        groupName: gName,
        totalCount: gTotal,
        completedCount: gDone,
        subgroups: subgroupsArr,
      });
    }

    return groups;
  }, [filteredRows, groupCol, subgroupCol, doneCol]);

  const toggleGroup = (name: string) => {
    setCollapsedGroups((prev) => ({ ...prev, [name]: !prev[name] }));
  };

  const toggleSubgroup = (key: string) => {
    setCollapsedSubgroups((prev) => ({ ...prev, [key]: !prev[key] }));
  };

  const expandAll = () => {
    setCollapsedGroups({});
    setCollapsedSubgroups({});
  };

  const collapseAll = () => {
    const cg: Record<string, boolean> = {};
    const csg: Record<string, boolean> = {};
    for (const g of hierarchicalData) {
      cg[g.groupName] = true;
      for (const sg of g.subgroups) {
        csg[`${g.groupName}::${sg.subgroupName}`] = true;
      }
    }
    setCollapsedGroups(cg);
    setCollapsedSubgroups(csg);
  };

  return (
    <div className="space-y-4">
      {/* Top Filter & View Controls Bar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-3.5 rounded-xl border border-[var(--ff-border-color)] bg-[var(--ff-surface)]">
        <div className="flex items-center gap-2 flex-1 max-w-md">
          <div className="relative w-full">
            <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-[var(--ff-text-muted)]" />
            <input
              type="text"
              placeholder="Search topics, modules, or notes..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-9 pr-3 py-1.5 text-xs rounded-lg bg-[var(--ff-surface-muted)] border border-[var(--ff-border-color)] text-[var(--ff-text-primary)] placeholder-[var(--ff-text-muted)] focus:outline-none focus:border-[var(--ff-accent)]"
            />
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2 shrink-0">
          {doneCol && (
            <div className="inline-flex rounded-lg border border-[var(--ff-border-color)] p-0.5 bg-[var(--ff-surface-muted)] text-xs">
              <button
                type="button"
                onClick={() => setStatusFilter('all')}
                className={`px-2.5 py-1 rounded-md font-medium transition-colors ${
                  statusFilter === 'all'
                    ? 'bg-[var(--ff-surface)] text-[var(--ff-text-primary)] shadow-sm'
                    : 'text-[var(--ff-text-muted)] hover:text-[var(--ff-text-primary)]'
                }`}
              >
                All ({stats.total})
              </button>
              <button
                type="button"
                onClick={() => setStatusFilter('completed')}
                className={`px-2.5 py-1 rounded-md font-medium transition-colors ${
                  statusFilter === 'completed'
                    ? 'bg-emerald-500/10 text-emerald-500 font-bold shadow-sm'
                    : 'text-[var(--ff-text-muted)] hover:text-[var(--ff-text-primary)]'
                }`}
              >
                Completed ({stats.completed})
              </button>
              <button
                type="button"
                onClick={() => setStatusFilter('pending')}
                className={`px-2.5 py-1 rounded-md font-medium transition-colors ${
                  statusFilter === 'pending'
                    ? 'bg-amber-500/10 text-amber-500 font-bold shadow-sm'
                    : 'text-[var(--ff-text-muted)] hover:text-[var(--ff-text-primary)]'
                }`}
              >
                Pending ({stats.pending})
              </button>
            </div>
          )}

          {/* View switcher */}
          <div className="inline-flex rounded-lg border border-[var(--ff-border-color)] p-0.5 bg-[var(--ff-surface-muted)]">
            <button
              type="button"
              onClick={() => handleSetView('checklist')}
              className={`p-1.5 rounded-md transition-colors ${
                activeView === 'checklist'
                  ? 'bg-[var(--ff-surface)] text-[var(--ff-accent)] shadow-sm'
                  : 'text-[var(--ff-text-muted)] hover:text-[var(--ff-text-primary)]'
              }`}
              title="Hierarchical Checklist View"
            >
              <CheckSquare className="w-4 h-4" />
            </button>
            <button
              type="button"
              onClick={() => handleSetView('table')}
              className={`p-1.5 rounded-md transition-colors ${
                activeView === 'table'
                  ? 'bg-[var(--ff-surface)] text-[var(--ff-accent)] shadow-sm'
                  : 'text-[var(--ff-text-muted)] hover:text-[var(--ff-text-primary)]'
              }`}
              title="Data Table View"
            >
              <TableIcon className="w-4 h-4" />
            </button>
            <button
              type="button"
              onClick={() => handleSetView('cards')}
              className={`p-1.5 rounded-md transition-colors ${
                activeView === 'cards'
                  ? 'bg-[var(--ff-surface)] text-[var(--ff-accent)] shadow-sm'
                  : 'text-[var(--ff-text-muted)] hover:text-[var(--ff-text-primary)]'
              }`}
              title="Cards Grid View"
            >
              <LayoutGrid className="w-4 h-4" />
            </button>
          </div>
        </div>
      </div>

      {/* Progress Header Bar */}
      {doneCol && (
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-3 rounded-xl bg-[var(--ff-surface-muted)] border border-[var(--ff-border-color)] text-xs">
          <div className="flex flex-wrap items-center gap-3">
            <span className="font-semibold text-[var(--ff-text-primary)]">
              Completion: {stats.completed} / {stats.total} topics ({stats.percent}%)
            </span>
            <span className="text-[11px] text-[var(--ff-text-muted)] border-l border-[var(--ff-border-color)] pl-3">
              {isDemoSheet
                ? 'Demo Sheet (Local Interactive Checkboxes)'
                : syncMode === 'manual_only'
                ? 'Batch Sync Mode: Mark items locally, then Push to Google Sheet'
                : 'Two-Way Sync: Click any checkbox to mark/unmark in Google Sheet'}
            </span>
          </div>

          {activeView === 'checklist' && (
            <div className="flex items-center gap-2 ml-auto">
              <button
                type="button"
                onClick={expandAll}
                className="text-[11px] font-medium text-[var(--ff-accent)] hover:underline inline-flex items-center gap-1"
              >
                <Maximize2 className="w-3 h-3" /> Expand All
              </button>
              <span className="text-[var(--ff-border-color)]">|</span>
              <button
                type="button"
                onClick={collapseAll}
                className="text-[11px] font-medium text-[var(--ff-text-muted)] hover:underline inline-flex items-center gap-1"
              >
                <Minimize2 className="w-3 h-3" /> Collapse All
              </button>
            </div>
          )}
        </div>
      )}

      {/* VIEW 1: Hierarchical Checklist View */}
      {activeView === 'checklist' && (
        <div className="space-y-3">
          {hierarchicalData.length === 0 ? (
            <div className="text-center py-12 text-[var(--ff-text-muted)] bg-[var(--ff-surface)] rounded-xl border border-[var(--ff-border-color)]">
              <Info className="w-8 h-8 mx-auto mb-2 text-[var(--ff-text-muted)] opacity-60" />
              <p className="text-sm font-medium">No items match your filter criteria.</p>
            </div>
          ) : (
            hierarchicalData.map((group) => {
              const isGroupCollapsed = Boolean(collapsedGroups[group.groupName]);
              const groupPercent =
                group.totalCount > 0 ? Math.round((group.completedCount / group.totalCount) * 100) : 0;

              return (
                <div
                  key={group.groupName}
                  className="rounded-xl border border-[var(--ff-border-color)] bg-[var(--ff-surface)] overflow-hidden"
                >
                  {/* Module Header Bar */}
                  <div
                    onClick={() => toggleGroup(group.groupName)}
                    className="flex items-center justify-between p-3.5 bg-[var(--ff-surface-muted)] cursor-pointer select-none hover:bg-[var(--ff-surface-hover)] transition-colors"
                  >
                    <div className="flex items-center gap-2.5 min-w-0">
                      {isGroupCollapsed ? (
                        <ChevronRight className="w-4 h-4 text-[var(--ff-text-muted)] shrink-0" />
                      ) : (
                        <ChevronDown className="w-4 h-4 text-[var(--ff-accent)] shrink-0" />
                      )}
                      <h4 className="font-bold text-sm text-[var(--ff-text-primary)] truncate" title={group.groupName}>
                        {group.groupName}
                      </h4>
                    </div>

                    <div className="flex items-center gap-2.5 shrink-0 text-xs">
                      {doneCol && (
                        <span className="font-mono text-[11px] text-[var(--ff-text-muted)]">
                          {group.completedCount} / {group.totalCount} ({groupPercent}%)
                        </span>
                      )}
                      <ThemeBadge tone={groupPercent >= 100 ? 'success' : 'neutral'} className="text-[10px]">
                        {group.totalCount} topics
                      </ThemeBadge>
                    </div>
                  </div>

                  {/* Subgroups & Subtopics */}
                  {!isGroupCollapsed && (
                    <div className="p-3 space-y-3 divide-y divide-[var(--ff-border-color)]">
                      {group.subgroups.map((subgroup) => {
                        const sgKey = `${group.groupName}::${subgroup.subgroupName}`;
                        const isSubgroupCollapsed = Boolean(collapsedSubgroups[sgKey]);
                        const sgDone = doneCol
                          ? subgroup.items.filter((r) => isCellDone(r.values[doneCol.fieldKey])).length
                          : 0;

                        return (
                          <div key={subgroup.subgroupName} className="pt-2.5 first:pt-0">
                            <div
                              onClick={() => toggleSubgroup(sgKey)}
                              className="flex items-center justify-between py-1 cursor-pointer select-none hover:text-[var(--ff-accent)] transition-colors"
                            >
                              <div className="flex items-center gap-2 min-w-0">
                                {isSubgroupCollapsed ? (
                                  <ChevronRight className="w-3.5 h-3.5 text-[var(--ff-text-muted)]" />
                                ) : (
                                  <ChevronDown className="w-3.5 h-3.5 text-[var(--ff-text-muted)]" />
                                )}
                                <span className="font-semibold text-xs text-[var(--ff-text-primary)] truncate">
                                  {subgroup.subgroupName}
                                </span>
                              </div>
                              <span className="text-[11px] text-[var(--ff-text-muted)] shrink-0">
                                {sgDone} / {subgroup.items.length} done
                              </span>
                            </div>

                            {/* Subtopic Items */}
                            {!isSubgroupCollapsed && (
                              <div className="mt-2 space-y-1.5 pl-6">
                                {subgroup.items.map((row) => {
                                  const isDone = doneCol ? isCellDone(row.values[doneCol.fieldKey]) : false;
                                  const titleText = titleCol ? String(row.values[titleCol.fieldKey] || '') : 'Untitled';
                                  const notesText = notesCol ? String(row.values[notesCol.fieldKey] || '').trim() : '';
                                  const isSyncing = Boolean(syncingRowUids[row.rowUid]);
                                  const isPendingPush = row.status === 'pending_push';
                                  const canToggle = Boolean(
                                    onToggleCell &&
                                      doneCol &&
                                      doneCol.inferredType !== 'formula' &&
                                      doneCol.editable !== false &&
                                      row.lastKnownSheetRow >= 1
                                  );

                                  return (
                                    <div
                                      key={row.rowUid}
                                      className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 p-2 rounded-lg bg-[var(--ff-surface-muted)]/50 hover:bg-[var(--ff-surface-hover)] border border-transparent hover:border-[var(--ff-border-color)] transition-all"
                                    >
                                      <div className="flex items-start gap-2.5 min-w-0">
                                        {/* Interactive Two-Way Done Checkbox */}
                                        {canToggle && doneCol ? (
                                          <button
                                            type="button"
                                            disabled={isSyncing}
                                            onClick={() => onToggleCell?.(row, doneCol, !isDone)}
                                            aria-label={isDone ? `Unmark ${titleText}` : `Mark ${titleText} as done`}
                                            aria-pressed={isDone}
                                            className="shrink-0 mt-0.5 rounded-full focus:outline-none focus:ring-2 focus:ring-[var(--ff-accent)]/50 transition-transform active:scale-90 disabled:opacity-60 cursor-pointer"
                                            title={
                                              isSyncing
                                                ? 'Syncing with Google Sheet...'
                                                : isDone
                                                ? 'Click to unmark (syncs with Google Sheet)'
                                                : 'Click to mark done (syncs with Google Sheet)'
                                            }
                                          >
                                            {isSyncing ? (
                                              <Loader2 className="w-4 h-4 text-[var(--ff-accent)] animate-spin" />
                                            ) : isDone ? (
                                              <CheckCircle2 className="w-4 h-4 text-emerald-500 fill-emerald-500/20" />
                                            ) : (
                                              <Circle className="w-4 h-4 text-[var(--ff-text-muted)] hover:text-[var(--ff-accent)]" />
                                            )}
                                          </button>
                                        ) : (
                                          <div
                                            className="shrink-0 mt-0.5 cursor-not-allowed opacity-70"
                                            title={doneCol?.readOnlyReason || 'Read-only formula column'}
                                          >
                                            {isDone ? (
                                              <CheckCircle2 className="w-4 h-4 text-emerald-500 fill-emerald-500/20" />
                                            ) : (
                                              <Circle className="w-4 h-4 text-[var(--ff-text-muted)]" />
                                            )}
                                          </div>
                                        )}

                                        <div className="min-w-0">
                                          <span
                                            className={`text-xs ${
                                              isDone
                                                ? 'text-[var(--ff-text-muted)] line-through'
                                                : 'text-[var(--ff-text-primary)] font-medium'
                                            }`}
                                          >
                                            {titleText}
                                          </span>

                                          {/* Notes / Practice indicator */}
                                          {notesText && (
                                            <p className="text-[11px] text-[var(--ff-text-muted)] mt-0.5 whitespace-pre-wrap line-clamp-2">
                                              📝 {notesText}
                                            </p>
                                          )}
                                        </div>
                                      </div>

                                      <div className="flex items-center gap-2 shrink-0 self-end sm:self-center">
                                        {isPendingPush && !isDemoSheet && (
                                          <span
                                            className="inline-flex items-center gap-1 text-[10px] font-semibold px-1.5 py-0.5 rounded bg-amber-500/15 text-amber-500 border border-amber-500/30"
                                            title="Saved locally — click Push Changes to sync to Google Sheet"
                                          >
                                            <CloudUpload className="w-2.5 h-2.5" />
                                            Pending Push
                                          </span>
                                        )}
                                        {row.lastKnownSheetRow && (
                                          <span className="font-mono text-[10px] text-[var(--ff-text-muted)] px-1.5 py-0.5 rounded bg-[var(--ff-surface)] border border-[var(--ff-border-color)]">
                                            Row {row.lastKnownSheetRow}
                                          </span>
                                        )}
                                      </div>
                                    </div>
                                  );
                                })}
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              );
            })
          )}
        </div>
      )}

      {/* VIEW 2: Data Table View */}
      {activeView === 'table' && (
        <div className="overflow-x-auto rounded-xl border border-[var(--ff-border-color)] bg-[var(--ff-surface)]">
          <table className="w-full text-left text-xs border-collapse">
            <thead>
              <tr className="border-b border-[var(--ff-border-color)] bg-[var(--ff-surface-muted)] text-[var(--ff-text-muted)] font-semibold uppercase tracking-wider text-[10px]">
                <th className="p-2.5 w-12 text-center">#</th>
                {schema.columns.map((c) => (
                  <th key={c.fieldKey} className="p-2.5 whitespace-nowrap">
                    <div className="flex items-center gap-1">
                      <span>{c.displayName || c.headerName}</span>
                      {c.inferredType === 'formula' && <Lock className="w-3 h-3 text-amber-500" />}
                    </div>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-[var(--ff-border-color)] text-[var(--ff-text-primary)]">
              {filteredRows.slice(0, 150).map((row, idx) => (
                <tr key={row.rowUid || idx} className="hover:bg-[var(--ff-surface-hover)] transition-colors">
                  <td className="p-2.5 text-center font-mono text-[var(--ff-text-muted)]">
                    {row.lastKnownSheetRow || idx + 1}
                  </td>
                  {schema.columns.map((col) => {
                    const val = row.values[col.fieldKey];

                    if (
                      col.inferredType === 'checkbox' ||
                      col.inferredType === 'boolean' ||
                      col.semanticRole === 'done' ||
                      typeof val === 'boolean'
                    ) {
                      const checked = isCellDone(val);
                      const isSyncing = Boolean(syncingRowUids[row.rowUid]);
                      const isPendingPush = row.status === 'pending_push' && row.dirtyFields?.includes(col.fieldKey);
                      const canToggle = Boolean(
                        onToggleCell &&
                          col.inferredType !== 'formula' &&
                          col.editable !== false &&
                          row.lastKnownSheetRow >= 1
                      );

                      return (
                        <td key={col.fieldKey} className="p-2.5">
                          {canToggle ? (
                            <button
                              type="button"
                              disabled={isSyncing}
                              onClick={() => onToggleCell?.(row, col, !checked)}
                              className={`inline-flex items-center gap-1.5 text-[11px] px-2 py-0.5 rounded font-medium transition-all cursor-pointer disabled:opacity-60 ${
                                checked
                                  ? 'text-emerald-500 bg-emerald-500/15 hover:bg-emerald-500/25 border border-emerald-500/25'
                                  : 'text-[var(--ff-text-muted)] bg-[var(--ff-surface-muted)] hover:text-[var(--ff-text-primary)] border border-[var(--ff-border-color)]'
                              }`}
                              title={checked ? 'Click to unmark in Google Sheet' : 'Click to mark in Google Sheet'}
                            >
                              {isSyncing ? (
                                <Loader2 className="w-3 h-3 animate-spin" />
                              ) : checked ? (
                                <CheckCircle2 className="w-3 h-3" />
                              ) : (
                                <Circle className="w-3 h-3" />
                              )}
                              <span>{checked ? 'Yes' : 'No'}</span>
                              {isPendingPush && !isDemoSheet && (
                                <span className="w-1.5 h-1.5 rounded-full bg-amber-500" title="Pending push to Google Sheet" />
                              )}
                            </button>
                          ) : checked ? (
                            <span className="inline-flex items-center gap-1 text-[11px] text-emerald-500 bg-emerald-500/10 px-2 py-0.5 rounded font-medium">
                              <CheckCircle2 className="w-3 h-3" /> Yes
                            </span>
                          ) : (
                            <span className="text-[11px] text-[var(--ff-text-muted)]">No</span>
                          )}
                        </td>
                      );
                    }

                    if (col.inferredType === 'url' && typeof val === 'string' && val.startsWith('http')) {
                      return (
                        <td key={col.fieldKey} className="p-2.5">
                          <a
                            href={val}
                            target="_blank"
                            rel="noreferrer noopener"
                            className="text-blue-500 hover:underline inline-flex items-center gap-1 max-w-[150px] truncate"
                          >
                            <span>Link</span>
                            <ExternalLink className="w-3 h-3 shrink-0" />
                          </a>
                        </td>
                      );
                    }

                    return (
                      <td key={col.fieldKey} className="p-2.5 max-w-[240px] truncate" title={String(val ?? '')}>
                        {val === null || val === undefined ? (
                          <span className="text-[var(--ff-text-muted)]">—</span>
                        ) : (
                          String(val)
                        )}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
          {filteredRows.length > 150 && (
            <div className="p-3 text-center text-xs text-[var(--ff-text-muted)] bg-[var(--ff-surface-muted)] border-t border-[var(--ff-border-color)]">
              Showing first 150 of {filteredRows.length} records
            </div>
          )}
        </div>
      )}

      {/* VIEW 3: Cards View */}
      {activeView === 'cards' && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {filteredRows.slice(0, 100).map((row, idx) => {
            const isDone = doneCol ? isCellDone(row.values[doneCol.fieldKey]) : false;
            const titleVal = titleCol ? String(row.values[titleCol.fieldKey] || '') : `Row ${idx + 1}`;
            const groupVal = groupCol ? String(row.values[groupCol.fieldKey] || '') : '';
            const notesVal = notesCol ? String(row.values[notesCol.fieldKey] || '') : '';
            const isSyncing = Boolean(syncingRowUids[row.rowUid]);
            const isPendingPush = row.status === 'pending_push';
            const canToggle = Boolean(
              onToggleCell &&
                doneCol &&
                doneCol.inferredType !== 'formula' &&
                doneCol.editable !== false &&
                row.lastKnownSheetRow >= 1
            );

            return (
              <ThemeCard key={row.rowUid || idx} variant="elevated" className="p-4 border border-[var(--ff-border-color)] flex flex-col justify-between">
                <div>
                  <div className="flex items-start justify-between gap-2 mb-2">
                    {groupVal && (
                      <ThemeBadge tone="neutral" className="text-[10px]">
                        {groupVal}
                      </ThemeBadge>
                    )}
                    {doneCol && (
                      canToggle ? (
                        <button
                          type="button"
                          disabled={isSyncing}
                          onClick={() => onToggleCell?.(row, doneCol, !isDone)}
                          className={`inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded transition-colors cursor-pointer disabled:opacity-60 ${
                            isDone
                              ? 'bg-emerald-500/15 text-emerald-500 hover:bg-emerald-500/25'
                              : 'bg-amber-500/15 text-amber-500 hover:bg-amber-500/25'
                          }`}
                          title={isDone ? 'Click to unmark in Google Sheet' : 'Click to mark done in Google Sheet'}
                        >
                          {isSyncing ? (
                            <Loader2 className="w-3 h-3 animate-spin" />
                          ) : isDone ? (
                            <CheckCircle2 className="w-3 h-3" />
                          ) : (
                            <Circle className="w-3 h-3" />
                          )}
                          <span>{isDone ? 'Done' : 'Pending'}</span>
                        </button>
                      ) : (
                        <span className={`text-[10px] font-bold px-2 py-0.5 rounded ${isDone ? 'bg-emerald-500/10 text-emerald-500' : 'bg-amber-500/10 text-amber-500'}`}>
                          {isDone ? 'Done' : 'Pending'}
                        </span>
                      )
                    )}
                  </div>
                  <h4 className={`font-semibold text-xs mb-2 line-clamp-2 ${isDone ? 'text-[var(--ff-text-muted)] line-through' : 'text-[var(--ff-text-primary)]'}`}>
                    {titleVal}
                  </h4>
                  {notesVal && (
                    <p className="text-[11px] text-[var(--ff-text-muted)] line-clamp-2 bg-[var(--ff-surface-muted)] p-2 rounded">
                      {notesVal}
                    </p>
                  )}
                </div>
                <div className="mt-3 pt-2 border-t border-[var(--ff-border-color)] flex items-center justify-between text-[10px] text-[var(--ff-text-muted)] font-mono">
                  <span>{isPendingPush && !isDemoSheet ? 'Pending push' : ''}</span>
                  <span>Row {row.lastKnownSheetRow || idx + 1}</span>
                </div>
              </ThemeCard>
            );
          })}
        </div>
      )}
    </div>
  );
};
