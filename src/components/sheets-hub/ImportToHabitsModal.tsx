/**
 * FocusFlow & Finance — Import to Habit Tracker Wizard & Preview Modal (Phase 1)
 *
 * 100% deterministic (zero-AI) 2-step workflow:
 * Step 1: Select Tabs, Verify Layout (Matrix Grid vs List/Log), Set Month/Year & Merge Mode
 * Step 2: Preview Parsed Habits, Completed Dates & Streaks, then Execute Safe Upsert
 */

import React, { useState, useEffect, useMemo } from 'react';
import {
  Flame,
  FileSpreadsheet,
  CheckCircle2,
  AlertTriangle,
  ArrowRight,
  ArrowLeft,
  Search,
  ShieldCheck,
  Check,
  Calendar,
  Grid3X3,
  List,
} from 'lucide-react';
import {
  ThemeModal,
  ThemeButton,
  ThemeBadge,
  ThemeInput,
  ThemeSelect,
  ThemeProgressBar,
} from '../ui/ThemePrimitives.tsx';
import type { SheetConnection, SheetSyncedRow, SheetTabSchema } from '../../types/sheetHub.ts';
import type { Habit } from '../../types/index.ts';
import { api } from '../../lib/api.ts';
import { clientDataCache } from '../../lib/dataCache.ts';
import { sheetHubStore } from '../../lib/sheetHub/sheetHubStore.ts';
import {
  detectHabitTabConfig,
  generateHabitImportPreview,
  isOverviewOrSummaryTab,
  type HabitImportMergeMode,
  type HabitImportPreviewResult,
  type HabitSheetLayout,
  type HabitTabImportConfig,
} from '../../lib/sheetHub/sheetToHabitTransformer.ts';
import {
  executeSheetToHabitImport,
  type SheetToHabitImportResult,
} from '../../lib/sheetHub/sheetToHabitImportEngine.ts';

type HabitImportStep = 'configure' | 'preview';

interface ImportToHabitsModalProps {
  isOpen: boolean;
  onClose: () => void;
  connection: SheetConnection;
  userId: string;
  onImportSuccess?: (result: SheetToHabitImportResult) => void;
}

export const ImportToHabitsModal: React.FC<ImportToHabitsModalProps> = ({
  isOpen,
  onClose,
  connection,
  userId,
  onImportSuccess,
}) => {
  const [step, setStep] = useState<HabitImportStep>('configure');
  const [loading, setLoading] = useState(true);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [isImporting, setIsImporting] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const [sheetTabs, setSheetTabs] = useState<SheetTabSchema[]>([]);
  const [tabConfigs, setTabConfigs] = useState<Record<string, HabitTabImportConfig>>({});
  const [existingHabits, setExistingHabits] = useState<Habit[]>([]);
  const [loadedRowsByTabId, setLoadedRowsByTabId] = useState<Record<string, SheetSyncedRow[]>>({});
  const [mergeMode, setMergeMode] = useState<HabitImportMergeMode>('merge');

  const [previewData, setPreviewData] = useState<HabitImportPreviewResult | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [importProgress, setImportProgress] = useState<{ stage: string; percent: number } | null>(null);
  const [importResult, setImportResult] = useState<SheetToHabitImportResult | null>(null);

  useEffect(() => {
    if (!isOpen) {
      setStep('configure');
      setErrorMsg(null);
      setPreviewData(null);
      setImportResult(null);
      setImportProgress(null);
      setLoadedRowsByTabId({});
      setSearchQuery('');
      return;
    }

    let isMounted = true;

    async function init() {
      setLoading(true);
      setErrorMsg(null);
      setImportResult(null);
      setPreviewData(null);
      clientDataCache.invalidate('habits');
      try {
        const [fetchedTabs, fetchedHabits] = await Promise.all([
          sheetHubStore.listTabsForConnection(userId, connection.id).catch(() => []),
          api.getHabits().catch(() => [] as Habit[]),
        ]);
        if (!isMounted) return;

        setSheetTabs(fetchedTabs);
        setExistingHabits(fetchedHabits);

        const configs: Record<string, HabitTabImportConfig> = {};
        const now = new Date();
        for (const tab of fetchedTabs) {
          configs[tab.id] = detectHabitTabConfig(tab, now);
        }
        setTabConfigs(configs);
      } catch (err: unknown) {
        if (!isMounted) return;
        setErrorMsg(err instanceof Error ? err.message : 'Failed to load spreadsheet tabs.');
      } finally {
        if (isMounted) setLoading(false);
      }
    }

    void init();
    return () => {
      isMounted = false;
    };
  }, [isOpen, connection.id, userId]);

  const selectedTabs = useMemo(
    () => sheetTabs.filter((t) => tabConfigs[t.id]?.isIncluded),
    [sheetTabs, tabConfigs]
  );

  const updateTabConfig = (tabId: string, patch: Partial<HabitTabImportConfig>) => {
    setTabConfigs((prev) => {
      const curr = prev[tabId];
      if (!curr) return prev;
      return { ...prev, [tabId]: { ...curr, ...patch } };
    });
  };

  const handleNextToPreview = async () => {
    if (selectedTabs.length === 0) {
      setErrorMsg('Please select at least one tab to import.');
      return;
    }

    setPreviewLoading(true);
    setErrorMsg(null);
    try {
      const rowsMap = { ...loadedRowsByTabId };
      for (const tab of selectedTabs) {
        if (!rowsMap[tab.id]) {
          rowsMap[tab.id] = await sheetHubStore
            .loadTabRows(userId, tab.id, connection.id)
            .catch(() => []);
        }
      }
      setLoadedRowsByTabId(rowsMap);

      const spreadsheetId = connection.sourceSpreadsheetId || connection.spreadsheetId || connection.id;
      const preview = generateHabitImportPreview({
        tabs: selectedTabs.map((tab) => ({
          tab,
          config: tabConfigs[tab.id],
          rows: rowsMap[tab.id] || [],
        })),
        existingHabits,
        spreadsheetId,
        mergeMode,
      });

      setPreviewData(preview);
      setStep('preview');
    } catch (err: unknown) {
      setErrorMsg(err instanceof Error ? err.message : 'Failed to preview habits from selected tabs.');
    } finally {
      setPreviewLoading(false);
    }
  };

  const handleExecuteImport = async () => {
    setIsImporting(true);
    setErrorMsg(null);
    try {
      const res = await executeSheetToHabitImport({
        userId,
        connection,
        tabs: sheetTabs,
        tabConfigs,
        cachedRowsByTabId: loadedRowsByTabId,
        mergeMode,
        onProgress: (p) => setImportProgress(p),
      });
      setImportResult(res);
      onImportSuccess?.(res);
    } catch (err: unknown) {
      setErrorMsg(err instanceof Error ? err.message : 'Habit import failed.');
    } finally {
      setIsImporting(false);
    }
  };

  const filteredHabits = useMemo(() => {
    if (!previewData) return [];
    const q = searchQuery.trim().toLowerCase();
    if (!q) return previewData.habits;
    return previewData.habits.filter(
      (h) =>
        h.title.toLowerCase().includes(q) ||
        h.category.toLowerCase().includes(q) ||
        h.sourceTabTitle.toLowerCase().includes(q)
    );
  }, [previewData, searchQuery]);

  return (
    <ThemeModal
      isOpen={isOpen}
      onClose={onClose}
      title="Import to Habit Tracker"
      subtitle={`Spreadsheet: ${connection.title} • Deterministic Matrix & List Importer`}
      maxWidthClass="max-w-4xl"
    >
      <div className="space-y-5">
        {/* Step Indicator */}
        <div className="flex items-center justify-between border-b border-[var(--ff-border-color)] pb-3 gap-2">
          <div className="flex items-center gap-2">
            {[
              { id: 'configure', label: '1. Select Tabs & Layout' },
              { id: 'preview', label: '2. Preview & Import' },
            ].map((s) => {
              const isActive = step === s.id;
              const isDone = s.id === 'configure' && step === 'preview';
              return (
                <div
                  key={s.id}
                  className={`flex items-center gap-1.5 text-xs font-medium px-2.5 py-1 rounded-lg ${
                    isActive
                      ? 'text-[var(--ff-accent-text)] bg-[var(--ff-accent-soft)] font-bold'
                      : isDone
                      ? 'text-emerald-500 font-semibold'
                      : 'text-[var(--ff-text-muted)]'
                  }`}
                >
                  {isDone && <Check className="w-3.5 h-3.5 text-emerald-500" />}
                  <span>{s.label}</span>
                </div>
              );
            })}
          </div>

          <ThemeBadge tone="neutral">Phase 1 • Zero-AI Import</ThemeBadge>
        </div>

        {/* Error Banner */}
        {errorMsg && (
          <div className="p-3 text-xs rounded-xl bg-rose-500/10 border border-rose-500/20 text-rose-400 flex items-center gap-2">
            <AlertTriangle className="w-4 h-4 shrink-0 text-rose-500" />
            <span className="flex-1">{errorMsg}</span>
          </div>
        )}

        {/* STEP 1: CONFIGURE TABS & LAYOUT */}
        {step === 'configure' && (
          <div className="space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
              <div>
                <h3 className="text-sm font-semibold text-[var(--ff-text-primary)]">
                  Select Habit Tabs &amp; Verify Layout
                </h3>
                <p className="text-xs text-[var(--ff-text-muted)] mt-0.5">
                  Auto-detects <strong>Monthly Matrix</strong> (rows = habits, columns = dates 1..31) and{' '}
                  <strong>List / Log</strong> sheets. Multiple monthly tabs with the same habit name merge automatically.
                </p>
              </div>
            </div>

            {loading ? (
              <div className="p-8 text-center text-xs text-[var(--ff-text-muted)]">
                Loading spreadsheet tabs...
              </div>
            ) : sheetTabs.length === 0 ? (
              <div className="p-8 text-center text-xs text-[var(--ff-text-muted)]">
                No tabs found in this spreadsheet.
              </div>
            ) : (
              <div className="space-y-2.5 max-h-72 overflow-y-auto pr-1">
                {sheetTabs.map((tab) => {
                  const cfg = tabConfigs[tab.id];
                  if (!cfg) return null;
                  const isOverview = isOverviewOrSummaryTab(tab.sheetTitle, tab.role);

                  return (
                    <div
                      key={tab.id}
                      className={`p-3.5 rounded-xl border transition-all space-y-3 ${
                        cfg.isIncluded
                          ? 'border-[var(--ff-accent)] bg-[var(--ff-accent-soft)]/10'
                          : 'border-[var(--ff-border-color)] bg-[var(--ff-surface)] opacity-75'
                      }`}
                    >
                      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                        <label className="flex items-center gap-2.5 cursor-pointer select-none min-w-0">
                          <input
                            type="checkbox"
                            checked={cfg.isIncluded}
                            onChange={(e) => updateTabConfig(tab.id, { isIncluded: e.target.checked })}
                            className="rounded border-[var(--ff-border-color)] text-[var(--ff-accent)] focus:ring-[var(--ff-accent)] cursor-pointer"
                          />
                          <FileSpreadsheet className="w-4 h-4 text-emerald-500 shrink-0" />
                          <span className="text-xs font-bold text-[var(--ff-text-primary)] truncate">
                            {tab.sheetTitle}
                          </span>
                          <span className="text-[11px] text-[var(--ff-text-muted)] shrink-0">
                            ({tab.rowCount || 0} rows)
                          </span>
                        </label>

                        <div className="flex items-center gap-2 flex-wrap">
                          {isOverview ? (
                            <ThemeBadge tone="warning">Overview / Summary</ThemeBadge>
                          ) : cfg.detectedLayout === 'matrix' ? (
                            <ThemeBadge tone="success">
                              Matrix ({cfg.detectedDateColsCount} date cols)
                            </ThemeBadge>
                          ) : (
                            <ThemeBadge tone="info">List / Log</ThemeBadge>
                          )}
                        </div>
                      </div>

                      {cfg.isIncluded && (
                        <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5 pt-2 border-t border-[var(--ff-border-color)]/60">
                          <div>
                            <label className="block text-[10px] font-semibold uppercase tracking-wider text-[var(--ff-text-muted)] mb-1">
                              Sheet Layout
                            </label>
                            <div className="flex items-center gap-1">
                              <button
                                type="button"
                                onClick={() => updateTabConfig(tab.id, { layout: 'matrix' as HabitSheetLayout })}
                                className={`flex-1 px-2 py-1.5 rounded-lg text-[11px] font-medium flex items-center justify-center gap-1 border transition-colors ${
                                  cfg.layout === 'matrix'
                                    ? 'bg-[var(--ff-accent)] text-[var(--ff-accent-contrast)] border-[var(--ff-accent)]'
                                    : 'bg-[var(--ff-surface)] text-[var(--ff-text-secondary)] border-[var(--ff-border-color)]'
                                }`}
                              >
                                <Grid3X3 className="w-3 h-3" />
                                <span>Matrix</span>
                              </button>
                              <button
                                type="button"
                                onClick={() => updateTabConfig(tab.id, { layout: 'log' as HabitSheetLayout })}
                                className={`flex-1 px-2 py-1.5 rounded-lg text-[11px] font-medium flex items-center justify-center gap-1 border transition-colors ${
                                  cfg.layout === 'log'
                                    ? 'bg-[var(--ff-accent)] text-[var(--ff-accent-contrast)] border-[var(--ff-accent)]'
                                    : 'bg-[var(--ff-surface)] text-[var(--ff-text-secondary)] border-[var(--ff-border-color)]'
                                }`}
                              >
                                <List className="w-3 h-3" />
                                <span>List / Log</span>
                              </button>
                            </div>
                          </div>

                          <div>
                            <label className="block text-[10px] font-semibold uppercase tracking-wider text-[var(--ff-text-muted)] mb-1">
                              Month &amp; Year (for 1..31 cols)
                            </label>
                            <div className="relative">
                              <Calendar className="w-3.5 h-3.5 text-[var(--ff-text-muted)] absolute left-2.5 top-2 pointer-events-none" />
                              <input
                                type="month"
                                value={cfg.monthYear}
                                onChange={(e) => updateTabConfig(tab.id, { monthYear: e.target.value })}
                                className="w-full pl-8 pr-2 py-1 text-xs rounded-lg bg-[var(--ff-surface)] border border-[var(--ff-border-color)] text-[var(--ff-text-primary)] focus:outline-none focus:ring-1 focus:ring-[var(--ff-accent)]"
                              />
                            </div>
                          </div>

                          <div>
                            <label className="block text-[10px] font-semibold uppercase tracking-wider text-[var(--ff-text-muted)] mb-1">
                              Default Category
                            </label>
                            <ThemeSelect
                              value={cfg.defaultCategory}
                              onChange={(e) => updateTabConfig(tab.id, { defaultCategory: e.target.value })}
                              className="text-xs py-1 px-2"
                            >
                              <option value="General">General</option>
                              <option value="Health">Health</option>
                              <option value="Study">Study</option>
                              <option value="Work">Work</option>
                              <option value="Mindfulness">Mindfulness</option>
                              <option value="Finance">Finance</option>
                            </ThemeSelect>
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}

            {/* Merge Mode Selector */}
            <div className="p-3.5 rounded-xl border border-[var(--ff-border-color)] bg-[var(--ff-surface)] flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div>
                <div className="text-xs font-semibold text-[var(--ff-text-primary)]">
                  Existing Habit Conflict Strategy
                </div>
                <p className="text-[11px] text-[var(--ff-text-muted)] mt-0.5">
                  When a habit already exists in Habit Tracker, choose how completed dates are updated.
                </p>
              </div>
              <div className="flex items-center gap-1.5 shrink-0">
                <button
                  type="button"
                  onClick={() => setMergeMode('merge')}
                  className={`px-3 py-1.5 rounded-lg text-xs font-semibold border transition-colors ${
                    mergeMode === 'merge'
                      ? 'bg-emerald-500/15 text-emerald-500 border-emerald-500/40'
                      : 'bg-[var(--ff-surface-muted)] text-[var(--ff-text-muted)] border-[var(--ff-border-color)]'
                  }`}
                >
                  Merge Dates (Safe)
                </button>
                <button
                  type="button"
                  onClick={() => setMergeMode('replace')}
                  className={`px-3 py-1.5 rounded-lg text-xs font-semibold border transition-colors ${
                    mergeMode === 'replace'
                      ? 'bg-amber-500/15 text-amber-500 border-amber-500/40'
                      : 'bg-[var(--ff-surface-muted)] text-[var(--ff-text-muted)] border-[var(--ff-border-color)]'
                  }`}
                >
                  Replace Dates
                </button>
              </div>
            </div>

            <div className="flex items-center justify-between pt-4 border-t border-[var(--ff-border-color)]">
              <ThemeButton variant="ghost" size="sm" onClick={onClose}>
                Cancel
              </ThemeButton>
              <div className="flex items-center gap-2">
                <span className="text-xs text-[var(--ff-text-muted)]">
                  {selectedTabs.length} tab(s) selected
                </span>
                <ThemeButton
                  variant="primary"
                  size="sm"
                  onClick={handleNextToPreview}
                  loading={previewLoading}
                  disabled={selectedTabs.length === 0 || loading}
                >
                  <span>Next: Preview Habits</span>
                  <ArrowRight className="w-4 h-4 ml-1 inline" />
                </ThemeButton>
              </div>
            </div>
          </div>
        )}

        {/* STEP 2: PREVIEW & EXECUTE */}
        {step === 'preview' && previewData && (
          <div className="space-y-4">
            <div className="p-3.5 rounded-xl border border-emerald-500/30 bg-emerald-500/10 text-emerald-800 dark:text-emerald-300 flex items-start gap-2.5 text-xs">
              <ShieldCheck className="w-4 h-4 text-emerald-500 shrink-0 mt-0.5" />
              <div>
                <strong className="block text-emerald-700 dark:text-emerald-200">
                  {mergeMode === 'merge'
                    ? 'Non-Destructive Merge Mode Active'
                    : 'Replace Dates Mode Active'}
                </strong>
                <span>
                  {mergeMode === 'merge'
                    ? 'Existing Habit Tracker check-ins are preserved and combined with incoming sheet dates. Summary/total rows are skipped automatically.'
                    : 'Matched habits will have their completed dates replaced with the sheet dates. Non-matching habits in Habit Tracker stay untouched.'}
                </span>
              </div>
            </div>

            {/* Summary KPI Grid */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
              <div className="p-3 rounded-xl border border-[var(--ff-border-color)] bg-[var(--ff-surface)]">
                <div className="text-[11px] text-[var(--ff-text-muted)]">New Habits</div>
                <div className="text-lg font-bold text-emerald-500">
                  {previewData.summary.habitsToCreateCount}
                </div>
              </div>
              <div className="p-3 rounded-xl border border-[var(--ff-border-color)] bg-[var(--ff-surface)]">
                <div className="text-[11px] text-[var(--ff-text-muted)]">Habits to Update</div>
                <div className="text-lg font-bold text-blue-500">
                  {previewData.summary.habitsToUpdateCount}
                </div>
              </div>
              <div className="p-3 rounded-xl border border-[var(--ff-border-color)] bg-[var(--ff-surface)]">
                <div className="text-[11px] text-[var(--ff-text-muted)]">Check-ins Parsed</div>
                <div className="text-lg font-bold text-[var(--ff-accent-text)]">
                  {previewData.summary.totalIncomingCheckins}
                  {previewData.summary.newCheckinsAddedCount > 0 && (
                    <span className="text-[11px] font-medium text-emerald-500 ml-1">
                      (+{previewData.summary.newCheckinsAddedCount} new)
                    </span>
                  )}
                </div>
              </div>
              <div className="p-3 rounded-xl border border-[var(--ff-border-color)] bg-[var(--ff-surface)]">
                <div className="text-[11px] text-[var(--ff-text-muted)]">Skipped Summary / Blank</div>
                <div className="text-lg font-bold text-amber-500">
                  {previewData.summary.skippedRowsCount}
                </div>
              </div>
            </div>

            {/* Search Bar */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
              <span className="text-xs font-semibold text-[var(--ff-text-primary)]">
                Parsed Habits ({filteredHabits.length})
              </span>
              <div className="relative w-full sm:w-64">
                <Search className="w-3.5 h-3.5 text-[var(--ff-text-muted)] absolute left-2.5 top-2.5" />
                <ThemeInput
                  type="text"
                  placeholder="Filter habits..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="pl-8 text-xs py-1.5"
                />
              </div>
            </div>

            {/* Preview Table */}
            <div className="border border-[var(--ff-border-color)] rounded-xl overflow-hidden max-h-60 overflow-y-auto">
              <table className="w-full text-xs text-left">
                <thead className="bg-[var(--ff-surface-muted)] text-[var(--ff-text-muted)] sticky top-0 border-b border-[var(--ff-border-color)]">
                  <tr>
                    <th className="px-3 py-2 font-medium">Habit</th>
                    <th className="px-3 py-2 font-medium">Category</th>
                    <th className="px-3 py-2 font-medium">Frequency</th>
                    <th className="px-3 py-2 font-medium">Completed Dates</th>
                    <th className="px-3 py-2 font-medium">Best Streak</th>
                    <th className="px-3 py-2 font-medium">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[var(--ff-border-color)] bg-[var(--ff-surface)]">
                  {filteredHabits.length === 0 ? (
                    <tr>
                      <td colSpan={6} className="px-3 py-6 text-center text-[var(--ff-text-muted)]">
                        No valid habits detected. Check your selected tab layout or headers.
                      </td>
                    </tr>
                  ) : (
                    filteredHabits.map((h) => (
                      <tr key={h.sourceMappingKey} className="hover:bg-[var(--ff-surface-hover)]">
                        <td className="px-3 py-2">
                          <div className="flex items-center gap-2">
                            <span
                              className="w-2.5 h-2.5 rounded-full shrink-0"
                              style={{ backgroundColor: h.color }}
                            />
                            <div>
                              <div className="font-semibold text-[var(--ff-text-primary)]">{h.title}</div>
                              <div className="text-[10px] text-[var(--ff-text-muted)]">
                                {h.sourceTabTitle} • {h.sourceLayout === 'matrix' ? 'Matrix' : 'List'}
                              </div>
                            </div>
                          </div>
                        </td>
                        <td className="px-3 py-2 text-[var(--ff-text-secondary)]">{h.category}</td>
                        <td className="px-3 py-2 text-[var(--ff-text-secondary)] capitalize">
                          {h.frequency} ({h.targetDaysPerWeek}d/wk)
                        </td>
                        <td className="px-3 py-2 font-mono">
                          <span className="font-semibold text-[var(--ff-text-primary)]">
                            {h.mergedDates.length}
                          </span>
                          {h.newDatesAddedCount > 0 && (
                            <span className="text-[10px] text-emerald-500 ml-1">
                              (+{h.newDatesAddedCount})
                            </span>
                          )}
                        </td>
                        <td className="px-3 py-2 font-mono text-amber-500">
                          {h.bestStreakDays}d
                        </td>
                        <td className="px-3 py-2">
                          {h.isExistingMatch ? (
                            <ThemeBadge tone="info">
                              {mergeMode === 'merge' ? 'Merge Dates' : 'Replace Dates'}
                            </ThemeBadge>
                          ) : (
                            <ThemeBadge tone="success">New Habit</ThemeBadge>
                          )}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>

            {/* Active Import Progress */}
            {isImporting && (
              <div className="p-4 rounded-xl border border-[var(--ff-accent)]/30 bg-[var(--ff-accent-soft)]/20 space-y-2">
                <div className="flex items-center justify-between text-xs font-semibold text-[var(--ff-text-primary)]">
                  <span>{importProgress?.stage || 'Importing habits...'}</span>
                  <span>{importProgress?.percent || 0}%</span>
                </div>
                <ThemeProgressBar value={importProgress?.percent || 0} tone="accent" />
              </div>
            )}

            {/* Import Result Summary */}
            {importResult && (
              <div className="p-4 rounded-xl border border-emerald-500/30 bg-emerald-500/10 text-emerald-800 dark:text-emerald-300 space-y-3">
                <div className="flex items-center gap-2 font-bold text-sm text-emerald-700 dark:text-emerald-200">
                  <CheckCircle2 className="w-5 h-5 text-emerald-500 shrink-0" />
                  <span>Habits Imported Successfully!</span>
                </div>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs">
                  <div className="p-2 rounded-lg bg-[var(--ff-surface)] border border-[var(--ff-border-color)]">
                    <span className="text-[10px] text-[var(--ff-text-muted)] block">Created</span>
                    <span className="font-bold text-emerald-500">{importResult.createdHabitsCount}</span>
                  </div>
                  <div className="p-2 rounded-lg bg-[var(--ff-surface)] border border-[var(--ff-border-color)]">
                    <span className="text-[10px] text-[var(--ff-text-muted)] block">Updated</span>
                    <span className="font-bold text-blue-500">{importResult.updatedHabitsCount}</span>
                  </div>
                  <div className="p-2 rounded-lg bg-[var(--ff-surface)] border border-[var(--ff-border-color)]">
                    <span className="text-[10px] text-[var(--ff-text-muted)] block">New Check-ins</span>
                    <span className="font-bold text-emerald-600 dark:text-emerald-400">
                      +{importResult.newCheckinsAddedCount}
                    </span>
                  </div>
                  <div className="p-2 rounded-lg bg-[var(--ff-surface)] border border-[var(--ff-border-color)]">
                    <span className="text-[10px] text-[var(--ff-text-muted)] block">Unchanged</span>
                    <span className="font-bold text-[var(--ff-text-secondary)]">
                      {importResult.unchangedHabitsCount}
                    </span>
                  </div>
                </div>
                {importResult.errors.length > 0 && (
                  <div className="text-xs text-rose-500 space-y-1">
                    {importResult.errors.map((e, i) => (
                      <div key={i}>• {e}</div>
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* Footer */}
            <div className="flex items-center justify-between pt-4 border-t border-[var(--ff-border-color)]">
              <ThemeButton
                variant="secondary"
                size="sm"
                onClick={() => setStep('configure')}
                disabled={isImporting || Boolean(importResult)}
              >
                <ArrowLeft className="w-4 h-4 mr-1 inline" />
                <span>Back</span>
              </ThemeButton>

              <div className="flex items-center gap-2">
                {!importResult ? (
                  <>
                    <ThemeButton variant="ghost" size="sm" onClick={onClose} disabled={isImporting}>
                      Cancel
                    </ThemeButton>
                    <ThemeButton
                      variant="primary"
                      size="sm"
                      onClick={handleExecuteImport}
                      loading={isImporting}
                      disabled={isImporting || previewData.habits.length === 0}
                    >
                      <Flame className="w-4 h-4 mr-1 inline" />
                      <span>Import {previewData.habits.length} Habit{previewData.habits.length === 1 ? '' : 's'}</span>
                    </ThemeButton>
                  </>
                ) : (
                  <ThemeButton variant="primary" size="sm" onClick={onClose}>
                    <Check className="w-4 h-4 mr-1 inline" />
                    <span>Done &amp; Close</span>
                  </ThemeButton>
                )}
              </div>
            </div>
          </div>
        )}
      </div>
    </ThemeModal>
  );
};
