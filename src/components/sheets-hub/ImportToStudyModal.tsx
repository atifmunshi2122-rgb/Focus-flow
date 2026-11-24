/**
 * FocusFlow & Finance — Import to Study OS Wizard & Preview Modal (Step 3)
 *
 * Provides a 5-step interactive workflow:
 * Step A: Select Academic Tier
 * Step B: Select Sheet Tabs
 * Step C: Map Subjects (Create new vs map existing)
 * Step D: Map Columns (Unit, Topic, Subtopic, Done -> Theory, Notes, Priority)
 * Step E: Preview & Safety Check (Non-destructive validation, summary metrics & safety guarantees)
 *
 * STRICT INVARIANT: Implements ONLY the selection, mapping and preview workflow.
 * Does NOT execute actual Firestore writes/imports in this step.
 */

import React, { useState, useEffect, useMemo } from 'react';
import {
  GraduationCap,
  Layers,
  FileSpreadsheet,
  CheckCircle2,
  AlertTriangle,
  ArrowRight,
  ArrowLeft,
  Search,
  ShieldCheck,
  Plus,
  Info,
  Check,
  SlidersHorizontal,
  Table,
  RefreshCw,
  GitCompare,
} from 'lucide-react';
import {
  ThemeModal,
  ThemeButton,
  ThemeBadge,
  ThemeCard,
  ThemeInput,
  ThemeSelect,
  ThemeTextarea,
  ThemeProgressBar,
} from '../ui/ThemePrimitives.tsx';
import type { SheetConnection, SheetSyncedRow, SheetTabSchema } from '../../types/sheetHub.ts';
import type { AcademicTier, StudyImportSource, StudySubject, StudyTopic, TopicConflictAnalysis } from '../../types/study.ts';
import { DEFAULT_ACADEMIC_TIERS } from '../../data/studySeedData.ts';
import { api } from '../../lib/api.ts';
import { sheetHubStore } from '../../lib/sheetHub/sheetHubStore.ts';
import { studyImportHistoryStore } from '../../lib/sheetHub/studyImportHistoryStore.ts';
import {
  ColumnToFieldMapping,
  ImportPreviewSubject,
  ImportPreviewSummary,
  StudyTargetField,
  TabToSubjectMapping,
  generateImportPreview,
  generateSubjectCode,
  inferInitialColumnMappings,
  isTabOverview,
} from '../../lib/sheetHub/sheetToStudyTransformer.ts';
import {
  executeSheetToStudyImport,
  SheetToStudyImportResult,
} from '../../lib/sheetHub/sheetToStudyImportEngine.ts';

const COLOR_PRESETS = [
  '#3b82f6', // Blue
  '#8b5cf6', // Purple
  '#10b981', // Emerald
  '#f59e0b', // Amber
  '#ef4444', // Rose
  '#06b6d4', // Cyan
  '#ec4899', // Pink
  '#6366f1', // Indigo
];

export type ImportWizardStep = 'tier' | 'tabs' | 'subjects' | 'columns' | 'preview';

interface ImportToStudyModalProps {
  isOpen: boolean;
  onClose: () => void;
  connection: SheetConnection;
  userId: string;
  onImportSuccess?: (result: SheetToStudyImportResult) => void;
}

export const ImportToStudyModal: React.FC<ImportToStudyModalProps> = ({
  isOpen,
  onClose,
  connection,
  userId,
  onImportSuccess,
}) => {
  const [currentStep, setCurrentStep] = useState<ImportWizardStep>('tier');

  // Academic tiers
  const [tiers, setTiers] = useState<AcademicTier[]>(DEFAULT_ACADEMIC_TIERS);
  const [selectedTierId, setSelectedTierId] = useState<string>('tier1_sem3');
  const [isCreatingTier, setIsCreatingTier] = useState(false);
  const [newTierName, setNewTierName] = useState('');
  const [newTierShortTitle, setNewTierShortTitle] = useState('');
  const [newTierDescription, setNewTierDescription] = useState('');
  const [creatingTierLoading, setCreatingTierLoading] = useState(false);

  // Existing Study OS data
  const [existingSubjects, setExistingSubjects] = useState<StudySubject[]>([]);
  const [existingTopics, setExistingTopics] = useState<StudyTopic[]>([]);

  // Tabs from connected spreadsheet
  const [tabsLoading, setTabsLoading] = useState(true);
  const [sheetTabs, setSheetTabs] = useState<SheetTabSchema[]>([]);
  const [tabMappings, setTabMappings] = useState<Record<string, TabToSubjectMapping>>({});
  const [loadedRowsByTabId, setLoadedRowsByTabId] = useState<Record<string, SheetSyncedRow[]>>({});
  const [activeColumnMappingTabId, setActiveColumnMappingTabId] = useState<string>('');

  // Search and filter for Step E (preview)
  const [previewFilterTab, setPreviewFilterTab] = useState<string>('all');
  const [previewSearchQuery, setPreviewSearchQuery] = useState<string>('');
  const [isImportReadyConfirmed, setIsImportReadyConfirmed] = useState(false);

  // Execution states
  const [isImporting, setIsImporting] = useState(false);
  const [importProgress, setImportProgress] = useState<{ stage: string; percent: number } | null>(null);
  const [importResult, setImportResult] = useState<SheetToStudyImportResult | null>(null);

  // Step 5: Source Recognition & Conflict Management
  const [recognizedSource, setRecognizedSource] = useState<StudyImportSource | null>(null);
  const [updateSourceManagedContent, setUpdateSourceManagedContent] = useState<boolean>(true);
  const [previewSubTab, setPreviewSubTab] = useState<'table' | 'conflicts'>('table');

  // Error & loading states
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);

  // Computed preview result
  const [previewData, setPreviewData] = useState<{
    summary: ImportPreviewSummary;
    previewSubjects: ImportPreviewSubject[];
    conflictAnalysis?: TopicConflictAnalysis;
  } | null>(null);

  // Reset or load initial data when modal opens
  useEffect(() => {
    if (!isOpen) {
      setCurrentStep('tier');
      setIsImportReadyConfirmed(false);
      setErrorMsg(null);
      setRecognizedSource(null);
      return;
    }

    let isMounted = true;

    async function loadInitialContext() {
      setTabsLoading(true);
      setErrorMsg(null);
      try {
        const [fetchedTiers, fetchedSubjects, fetchedTopics, fetchedTabs, existingSources] = await Promise.all([
          api.getStudyTiers().catch(() => DEFAULT_ACADEMIC_TIERS),
          api.getStudySubjects().catch(() => []),
          api.getStudyTopics().catch(() => []),
          sheetHubStore.listTabsForConnection(userId, connection.id).catch(() => []),
          studyImportHistoryStore.getImportSources(userId).catch(() => []),
        ]);

        if (!isMounted) return;

        const effectiveTiers = fetchedTiers.length > 0 ? fetchedTiers : DEFAULT_ACADEMIC_TIERS;
        setTiers(effectiveTiers);

        // Check if this spreadsheet was previously imported as a Study OS source
        const spreadsheetId = connection.sourceSpreadsheetId || connection.id;
        const matchedSource = existingSources.find(
          (s) => s.spreadsheetId === spreadsheetId || s.id === connection.id
        );

        if (matchedSource) {
          setRecognizedSource(matchedSource);
          setSelectedTierId(matchedSource.targetTierId);
        } else {
          setSelectedTierId(effectiveTiers[0]?.id || 'tier1_sem3');
        }

        setExistingSubjects(fetchedSubjects);
        setExistingTopics(fetchedTopics);
        setSheetTabs(fetchedTabs);

        // Build initial tab mappings
        const initialMappings: Record<string, TabToSubjectMapping> = {};
        const existingCodes = fetchedSubjects.map((s) => s.code);

        fetchedTabs.forEach((tab, idx) => {
          const isOverview = isTabOverview(tab.sheetTitle, tab.role);
          const generatedCode = generateSubjectCode(tab.sheetTitle, existingCodes);
          const color = COLOR_PRESETS[idx % COLOR_PRESETS.length];

          initialMappings[tab.id] = {
            tabId: tab.id,
            sheetId: tab.sheetId,
            sheetTitle: tab.sheetTitle,
            isIncluded: !isOverview, // overview unchecked by default
            action: 'create_new',
            targetSubjectCode: generatedCode,
            targetSubjectName: tab.sheetTitle,
            targetColor: color,
            columns: inferInitialColumnMappings(tab.columns || []),
            detectedRowCount: tab.rowCount || 0,
          };
        });

        setTabMappings(initialMappings);
        if (fetchedTabs.length > 0) {
          const firstSelected = fetchedTabs.find((t) => !isTabOverview(t.sheetTitle, t.role)) || fetchedTabs[0];
          setActiveColumnMappingTabId(firstSelected.id);
        }
      } catch (err: unknown) {
        if (!isMounted) return;
        setErrorMsg(err instanceof Error ? err.message : 'Failed to initialize import data.');
      } finally {
        if (isMounted) setTabsLoading(false);
      }
    }

    void loadInitialContext();

    return () => {
      isMounted = false;
    };
  }, [isOpen, connection.id, userId]);

  const handleExecuteImport = async () => {
    setIsImporting(true);
    setErrorMsg(null);
    try {
      const res = await executeSheetToStudyImport({
        userId,
        connection,
        selectedTierId,
        tabMappings,
        cachedRowsByTabId: loadedRowsByTabId,
        updateSourceManagedContent,
        onProgress: (p) => setImportProgress({ stage: p.stage, percent: p.percent }),
      });
      setImportResult(res);
      onImportSuccess?.(res);
    } catch (err: unknown) {
      setErrorMsg(err instanceof Error ? err.message : 'Import failed');
    } finally {
      setIsImporting(false);
    }
  };

  // Selected tabs helper
  const selectedTabsList = useMemo(() => {
    return Object.values(tabMappings).filter((t) => t.isIncluded);
  }, [tabMappings]);

  // Pre-load rows for all selected tabs
  const ensureSelectedTabRowsLoaded = async () => {
    const updatedRows = { ...loadedRowsByTabId };
    let hasNewLoads = false;

    for (const mapping of selectedTabsList) {
      if (!updatedRows[mapping.tabId]) {
        try {
          const rows = await sheetHubStore.loadTabRows(userId, mapping.tabId, connection.id);
          updatedRows[mapping.tabId] = rows;
          hasNewLoads = true;
        } catch (err) {
          console.warn(`[ImportToStudyModal] Failed to load rows for tab ${mapping.tabId}:`, err);
          updatedRows[mapping.tabId] = [];
        }
      }
    }

    if (hasNewLoads) {
      setLoadedRowsByTabId(updatedRows);
    }
    return updatedRows;
  };

  // Re-generate preview when entering preview step or mapping changes
  const runPreviewCalculation = async () => {
    setPreviewLoading(true);
    setErrorMsg(null);
    try {
      const rowsMap = await ensureSelectedTabRowsLoaded();
      const tabInputs = selectedTabsList.map((mapping) => ({
        mapping,
        rows: rowsMap[mapping.tabId] || [],
      }));

      const result = generateImportPreview({
        tabs: tabInputs,
        existingSubjects,
        existingTopics,
        spreadsheetId: connection.sourceSpreadsheetId || connection.id,
        selectedTierId,
      });

      setPreviewData(result);
    } catch (err: unknown) {
      setErrorMsg(err instanceof Error ? err.message : 'Error generating preview calculation.');
    } finally {
      setPreviewLoading(false);
    }
  };

  // Handle creating a new academic tier
  const handleCreateNewTier = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newTierName.trim()) {
      setErrorMsg('Please specify a tier name.');
      return;
    }

    setCreatingTierLoading(true);
    setErrorMsg(null);
    try {
      const cleanName = newTierName.trim();
      const cleanShortTitle = newTierShortTitle.trim() || cleanName.slice(0, 18);
      const cleanId = `tier_${cleanShortTitle.toLowerCase().replace(/[^a-z0-9]/g, '_').slice(0, 20)}_${Date.now().toString(36)}`;

      const created = await api.saveStudyTier({
        id: cleanId,
        name: cleanName,
        shortTitle: cleanShortTitle,
        description: newTierDescription.trim(),
        subjectCodes: [],
      });

      setTiers((prev) => [...prev, created]);
      setSelectedTierId(created.id);
      setIsCreatingTier(false);
      setNewTierName('');
      setNewTierShortTitle('');
      setNewTierDescription('');
    } catch (err: unknown) {
      setErrorMsg(err instanceof Error ? err.message : 'Failed to create tier.');
    } finally {
      setCreatingTierLoading(false);
    }
  };

  // Step transitions
  const handleNextFromTier = () => {
    if (!selectedTierId) {
      setErrorMsg('Please select an Academic Tier.');
      return;
    }
    setErrorMsg(null);
    setCurrentStep('tabs');
  };

  const handleNextFromTabs = async () => {
    if (selectedTabsList.length === 0) {
      setErrorMsg('Please select at least one tab to import.');
      return;
    }
    setErrorMsg(null);
    void ensureSelectedTabRowsLoaded();
    setCurrentStep('subjects');
  };

  const handleNextFromSubjects = () => {
    // Validate subject codes
    for (const mapping of selectedTabsList) {
      if (mapping.action === 'create_new') {
        if (!mapping.targetSubjectCode.trim()) {
          setErrorMsg(`Please specify a Subject Code for tab "${mapping.sheetTitle}".`);
          return;
        }
        if (!mapping.targetSubjectName.trim()) {
          setErrorMsg(`Please specify a Subject Name for tab "${mapping.sheetTitle}".`);
          return;
        }
      } else if (mapping.action === 'map_existing') {
        if (!mapping.targetSubjectCode) {
          setErrorMsg(`Please select an existing subject for tab "${mapping.sheetTitle}".`);
          return;
        }
      }
    }
    setErrorMsg(null);
    // Ensure active tab for column mapping is valid
    if (!selectedTabsList.some((t) => t.tabId === activeColumnMappingTabId)) {
      if (selectedTabsList.length > 0) {
        setActiveColumnMappingTabId(selectedTabsList[0].tabId);
      }
    }
    setCurrentStep('columns');
  };

  const handleNextFromColumns = async () => {
    setErrorMsg(null);
    await runPreviewCalculation();
    setCurrentStep('preview');
  };

  // Column target changer
  const handleUpdateColumnTarget = (tabId: string, fieldKey: string, newTarget: StudyTargetField) => {
    setTabMappings((prev) => {
      const tab = prev[tabId];
      if (!tab) return prev;
      const updatedCols = tab.columns.map((c) => (c.fieldKey === fieldKey ? { ...c, targetField: newTarget } : c));
      return {
        ...prev,
        [tabId]: { ...tab, columns: updatedCols },
      };
    });
  };

  // Toggle tab selection
  const handleToggleTab = (tabId: string) => {
    setTabMappings((prev) => {
      const tab = prev[tabId];
      if (!tab) return prev;
      return {
        ...prev,
        [tabId]: { ...tab, isIncluded: !tab.isIncluded },
      };
    });
  };

  // Filter preview rows
  const filteredPreviewRows = useMemo(() => {
    if (!previewData) return [];
    let list: Array<ImportPreviewSubject['topics'][0] & { subjectName: string; subjectCode: string }> = [];

    for (const subj of previewData.previewSubjects) {
      if (previewFilterTab !== 'all' && subj.subjectCode !== previewFilterTab) {
        continue;
      }
      for (const t of subj.topics) {
        list.push({
          ...t,
          subjectName: subj.subjectName,
          subjectCode: subj.subjectCode,
        });
      }
    }

    if (previewSearchQuery.trim()) {
      const q = previewSearchQuery.trim().toLowerCase();
      list = list.filter(
        (r) =>
          r.topic.toLowerCase().includes(q) ||
          r.subtopic.toLowerCase().includes(q) ||
          r.unit.toLowerCase().includes(q) ||
          r.subjectName.toLowerCase().includes(q) ||
          (r.notes && r.notes.toLowerCase().includes(q))
      );
    }

    return list;
  }, [previewData, previewFilterTab, previewSearchQuery]);

  return (
    <ThemeModal
      isOpen={isOpen}
      onClose={onClose}
      title="Import to Study OS"
      subtitle={`Spreadsheet: ${connection.title} • Multi-Tab Syllabus Import Bridge`}
      maxWidthClass="max-w-4xl"
    >
      <div className="space-y-5">
        {/* Step Indicator Wizard Header */}
        <div className="flex items-center justify-between border-b border-[var(--ff-border-color)] pb-3 overflow-x-auto gap-2">
          {[
            { id: 'tier', label: '1. Academic Tier' },
            { id: 'tabs', label: '2. Select Tabs' },
            { id: 'subjects', label: '3. Map Subjects' },
            { id: 'columns', label: '4. Map Columns' },
            { id: 'preview', label: '5. Preview & Safety' },
          ].map((s) => {
            const isActive = currentStep === s.id;
            const isCompleted =
              (s.id === 'tier' && currentStep !== 'tier') ||
              (s.id === 'tabs' && (currentStep === 'subjects' || currentStep === 'columns' || currentStep === 'preview')) ||
              (s.id === 'subjects' && (currentStep === 'columns' || currentStep === 'preview')) ||
              (s.id === 'columns' && currentStep === 'preview');

            return (
              <div
                key={s.id}
                className={`flex items-center gap-1.5 text-xs whitespace-nowrap font-medium px-2 py-1 rounded-lg transition-colors ${
                  isActive
                    ? 'text-[var(--ff-accent-text)] bg-[var(--ff-accent-soft)] font-bold'
                    : isCompleted
                    ? 'text-emerald-500 font-semibold'
                    : 'text-[var(--ff-text-muted)]'
                }`}
              >
                {isCompleted ? <Check className="w-3.5 h-3.5 text-emerald-500" /> : null}
                <span>{s.label}</span>
              </div>
            );
          })}
        </div>

        {/* Global Error Banner */}
        {errorMsg && (
          <div className="p-3 text-xs rounded-xl bg-rose-500/10 border border-rose-500/20 text-rose-400 flex items-center gap-2">
            <AlertTriangle className="w-4 h-4 shrink-0 text-rose-500" />
            <span className="flex-1">{errorMsg}</span>
          </div>
        )}

        {/* ------------------------------------------------------------------ */}
        {/* STEP A: SELECT ACADEMIC TIER                                       */}
        {/* ------------------------------------------------------------------ */}
        {currentStep === 'tier' && (
          <div className="space-y-4">
            {recognizedSource && (
              <div className="p-3.5 rounded-xl border border-blue-500/30 bg-blue-500/10 text-blue-800 dark:text-blue-300 flex items-start gap-3">
                <RefreshCw className="w-4 h-4 text-blue-500 shrink-0 mt-0.5" />
                <div className="text-xs space-y-0.5">
                  <span className="font-bold text-[var(--ff-text-primary)] block">
                    Recognized Previously Imported Source
                  </span>
                  <p className="leading-relaxed">
                    This spreadsheet was imported into{' '}
                    <strong>{recognizedSource.targetTierName || recognizedSource.targetTierId}</strong> on{' '}
                    {new Date(recognizedSource.lastImportedAt).toLocaleDateString(undefined, {
                      month: 'short',
                      day: 'numeric',
                      year: 'numeric',
                    })}{' '}
                    ({recognizedSource.importedSubjectCodes.length} subject
                    {recognizedSource.importedSubjectCodes.length === 1 ? '' : 's'} tracked).
                  </p>
                  <p className="text-[11px] text-blue-700 dark:text-blue-400">
                    Target tier has been pre-selected. Re-importing will add new topics and update approved fields while protecting your progress.
                  </p>
                </div>
              </div>
            )}

            <div>
              <h3 className="text-sm font-semibold text-[var(--ff-text-primary)]">
                Select Academic Tier
              </h3>
              <p className="text-xs text-[var(--ff-text-muted)] mt-0.5">
                Choose the Study OS academic tier where imported subjects and syllabus topics will reside.
              </p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-3 max-h-60 overflow-y-auto pr-1">
              {tiers.map((t) => {
                const isSelected = selectedTierId === t.id;
                return (
                  <div
                    key={t.id}
                    onClick={() => setSelectedTierId(t.id)}
                    className={`p-3.5 rounded-xl border text-left cursor-pointer transition-all ${
                      isSelected
                        ? 'border-[var(--ff-accent)] bg-[var(--ff-accent-soft)]/20 shadow-sm'
                        : 'border-[var(--ff-border-color)] hover:border-[var(--ff-border-strong)] bg-[var(--ff-surface)]'
                    }`}
                  >
                    <div className="flex items-center justify-between mb-1">
                      <span className="font-semibold text-xs text-[var(--ff-text-primary)]">{t.name}</span>
                      <ThemeBadge tone={isSelected ? 'accent' : 'neutral'}>
                        {t.shortTitle || 'Tier'}
                      </ThemeBadge>
                    </div>
                    {t.description && (
                      <p className="text-[11px] text-[var(--ff-text-muted)] line-clamp-2 leading-relaxed">
                        {t.description}
                      </p>
                    )}
                  </div>
                );
              })}
            </div>

            {/* Create New Tier Toggle */}
            <div className="pt-2 border-t border-[var(--ff-border-color)]">
              {!isCreatingTier ? (
                <ThemeButton
                  variant="ghost"
                  size="sm"
                  onClick={() => setIsCreatingTier(true)}
                  className="flex items-center gap-1.5 text-xs text-[var(--ff-accent-text)]"
                >
                  <Plus className="w-3.5 h-3.5" />
                  <span>Create Custom Academic Tier</span>
                </ThemeButton>
              ) : (
                <form onSubmit={handleCreateNewTier} className="p-4 rounded-xl border border-[var(--ff-border-color)] bg-[var(--ff-surface)] space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold text-[var(--ff-text-primary)]">New Academic Tier</span>
                    <button
                      type="button"
                      onClick={() => setIsCreatingTier(false)}
                      className="text-xs text-[var(--ff-text-muted)] hover:text-[var(--ff-text-primary)]"
                    >
                      Cancel
                    </button>
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                    <div>
                      <label className="block text-[11px] font-medium text-[var(--ff-text-muted)] mb-1">
                        Tier Name *
                      </label>
                      <ThemeInput
                        type="text"
                        placeholder="e.g. Master's Core & Research"
                        value={newTierName}
                        onChange={(e) => setNewTierName(e.target.value)}
                        required
                      />
                    </div>
                    <div>
                      <label className="block text-[11px] font-medium text-[var(--ff-text-muted)] mb-1">
                        Short Title
                      </label>
                      <ThemeInput
                        type="text"
                        placeholder="e.g. M.Tech Core"
                        value={newTierShortTitle}
                        onChange={(e) => setNewTierShortTitle(e.target.value)}
                      />
                    </div>
                  </div>
                  <div>
                    <label className="block text-[11px] font-medium text-[var(--ff-text-muted)] mb-1">
                      Description
                    </label>
                    <ThemeInput
                      type="text"
                      placeholder="Optional details or target goals"
                      value={newTierDescription}
                      onChange={(e) => setNewTierDescription(e.target.value)}
                    />
                  </div>
                  <div className="flex justify-end gap-2 pt-1">
                    <ThemeButton
                      variant="primary"
                      size="sm"
                      type="submit"
                      loading={creatingTierLoading}
                    >
                      Save & Select Tier
                    </ThemeButton>
                  </div>
                </form>
              )}
            </div>

            {/* Bottom Actions */}
            <div className="flex items-center justify-between pt-4 border-t border-[var(--ff-border-color)]">
              <ThemeButton variant="ghost" size="sm" onClick={onClose}>
                Cancel
              </ThemeButton>
              <ThemeButton variant="primary" size="sm" onClick={handleNextFromTier}>
                <span>Next: Select Tabs</span>
                <ArrowRight className="w-4 h-4 ml-1 inline" />
              </ThemeButton>
            </div>
          </div>
        )}

        {/* ------------------------------------------------------------------ */}
        {/* STEP B: SELECT SHEET TABS                                          */}
        {/* ------------------------------------------------------------------ */}
        {currentStep === 'tabs' && (
          <div className="space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
              <div>
                <h3 className="text-sm font-semibold text-[var(--ff-text-primary)]">
                  Select Sheet Tabs to Import
                </h3>
                <p className="text-xs text-[var(--ff-text-muted)] mt-0.5">
                  Each selected data tab will become a Study Subject. Overview tabs are deselected by default.
                </p>
              </div>

              <div className="flex items-center gap-2 flex-wrap">
                <button
                  type="button"
                  onClick={() => {
                    setTabMappings((prev) => {
                      const next = { ...prev };
                      sheetTabs.forEach((tab) => {
                        const isOverview = isTabOverview(tab.sheetTitle, tab.role);
                        if (next[tab.id]) {
                          next[tab.id].isIncluded = !isOverview;
                        }
                      });
                      return next;
                    });
                  }}
                  className="text-[11px] text-[var(--ff-accent-text)] hover:underline font-semibold"
                >
                  Select Syllabus Tabs (Skip Overview)
                </button>
                <span className="text-[var(--ff-text-muted)] text-xs">•</span>
                <button
                  type="button"
                  onClick={() => {
                    setTabMappings((prev) => {
                      const next = { ...prev };
                      Object.keys(next).forEach((k) => (next[k].isIncluded = true));
                      return next;
                    });
                  }}
                  className="text-[11px] text-[var(--ff-text-muted)] hover:text-[var(--ff-text-primary)] hover:underline"
                >
                  Select All Tabs
                </button>
                <span className="text-[var(--ff-text-muted)] text-xs">•</span>
                <button
                  type="button"
                  onClick={() => {
                    setTabMappings((prev) => {
                      const next = { ...prev };
                      Object.keys(next).forEach((k) => (next[k].isIncluded = false));
                      return next;
                    });
                  }}
                  className="text-[11px] text-[var(--ff-text-muted)] hover:text-[var(--ff-text-primary)] hover:underline"
                >
                  Deselect All
                </button>
              </div>
            </div>

            {tabsLoading ? (
              <div className="p-8 text-center text-xs text-[var(--ff-text-muted)]">
                Loading worksheet tabs...
              </div>
            ) : sheetTabs.length === 0 ? (
              <div className="p-8 text-center text-xs text-[var(--ff-text-muted)]">
                No tabs discovered in this spreadsheet.
              </div>
            ) : (
              <div className="space-y-2 max-h-72 overflow-y-auto pr-1">
                {sheetTabs.map((tab) => {
                  const mapping = tabMappings[tab.id];
                  const isIncluded = mapping?.isIncluded ?? false;
                  const isOverview = isTabOverview(tab.sheetTitle, tab.role);

                  return (
                    <div
                      key={tab.id}
                      onClick={() => handleToggleTab(tab.id)}
                      className={`flex items-center justify-between p-3 rounded-xl border cursor-pointer transition-all ${
                        isIncluded
                          ? 'border-[var(--ff-accent)] bg-[var(--ff-accent-soft)]/10'
                          : 'border-[var(--ff-border-color)] bg-[var(--ff-surface)] opacity-70 hover:opacity-100'
                      }`}
                    >
                      <div className="flex items-center gap-3">
                        <input
                          type="checkbox"
                          checked={isIncluded}
                          onChange={() => handleToggleTab(tab.id)}
                          onClick={(e) => e.stopPropagation()}
                          className="rounded border-[var(--ff-border-color)] text-[var(--ff-accent)] focus:ring-[var(--ff-accent)] cursor-pointer"
                        />
                        <div className="flex items-center gap-2">
                          <FileSpreadsheet className="w-4 h-4 text-emerald-500 shrink-0" />
                          <span className="text-xs font-semibold text-[var(--ff-text-primary)]">
                            {tab.sheetTitle}
                          </span>
                        </div>
                      </div>

                      <div className="flex items-center gap-2">
                        {isOverview && (
                          <ThemeBadge tone="warning">Overview Tab (Skipped by default)</ThemeBadge>
                        )}
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            handleToggleTab(tab.id);
                          }}
                          className={`text-xs px-2.5 py-1 rounded-lg border font-medium transition-colors ${
                            isIncluded
                              ? 'border-emerald-500/40 bg-emerald-500/10 text-emerald-400'
                              : 'border-[var(--ff-border-color)] bg-[var(--ff-surface-muted)] text-[var(--ff-text-muted)]'
                          }`}
                        >
                          {isIncluded ? 'Included' : 'Skipped'}
                        </button>
                        <span className="text-[11px] text-[var(--ff-text-muted)]">
                          {tab.rowCount || 0} rows • {tab.columns?.length || 0} cols
                        </span>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}

            <div className="flex items-center justify-between pt-4 border-t border-[var(--ff-border-color)]">
              <ThemeButton variant="secondary" size="sm" onClick={() => setCurrentStep('tier')}>
                <ArrowLeft className="w-4 h-4 mr-1 inline" />
                <span>Back</span>
              </ThemeButton>
              <div className="flex items-center gap-2">
                <span className="text-xs text-[var(--ff-text-muted)]">
                  {selectedTabsList.length} tab(s) selected
                </span>
                <ThemeButton
                  variant="primary"
                  size="sm"
                  onClick={handleNextFromTabs}
                  disabled={selectedTabsList.length === 0}
                >
                  <span>Next: Map Subjects</span>
                  <ArrowRight className="w-4 h-4 ml-1 inline" />
                </ThemeButton>
              </div>
            </div>
          </div>
        )}

        {/* ------------------------------------------------------------------ */}
        {/* STEP C: MAP SUBJECTS                                               */}
        {/* ------------------------------------------------------------------ */}
        {currentStep === 'subjects' && (
          <div className="space-y-4">
            <div>
              <h3 className="text-sm font-semibold text-[var(--ff-text-primary)]">
                Map Tabs to Study OS Subjects
              </h3>
              <p className="text-xs text-[var(--ff-text-muted)] mt-0.5">
                Define whether each tab creates a new Study Subject or maps into an existing one.
              </p>
            </div>

            <div className="space-y-3 max-h-72 overflow-y-auto pr-1">
              {selectedTabsList.map((mapping) => {
                const existingCodesSet = new Set(existingSubjects.map((s) => s.code.toUpperCase()));
                const isCodeConflict =
                  mapping.action === 'create_new' &&
                  existingCodesSet.has(mapping.targetSubjectCode.toUpperCase());

                return (
                  <div
                    key={mapping.tabId}
                    className="p-3.5 rounded-xl border border-[var(--ff-border-color)] bg-[var(--ff-surface)] space-y-3"
                  >
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-[var(--ff-border-color)] pb-2">
                      <div className="flex items-center gap-2">
                        <FileSpreadsheet className="w-4 h-4 text-emerald-500" />
                        <span className="text-xs font-bold text-[var(--ff-text-primary)]">
                          Tab: &ldquo;{mapping.sheetTitle}&rdquo;
                        </span>
                        <ThemeBadge tone="neutral">{mapping.detectedRowCount} rows</ThemeBadge>
                      </div>

                      {/* Action selector */}
                      <div className="flex items-center gap-1">
                        <button
                          type="button"
                          onClick={() => {
                            setTabMappings((prev) => ({
                              ...prev,
                              [mapping.tabId]: { ...mapping, action: 'create_new' },
                            }));
                          }}
                          className={`px-2.5 py-1 text-[11px] rounded-lg transition-colors font-medium ${
                            mapping.action === 'create_new'
                              ? 'bg-[var(--ff-accent)] text-[var(--ff-accent-contrast)]'
                              : 'bg-[var(--ff-surface-hover)] text-[var(--ff-text-secondary)]'
                          }`}
                        >
                          Create New Subject
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            const firstSubj = existingSubjects[0];
                            setTabMappings((prev) => ({
                              ...prev,
                              [mapping.tabId]: {
                                ...mapping,
                                action: 'map_existing',
                                targetSubjectId: firstSubj?.id,
                                targetSubjectCode: firstSubj?.code || mapping.targetSubjectCode,
                                targetSubjectName: firstSubj?.name || mapping.targetSubjectName,
                              },
                            }));
                          }}
                          className={`px-2.5 py-1 text-[11px] rounded-lg transition-colors font-medium ${
                            mapping.action === 'map_existing'
                              ? 'bg-[var(--ff-accent)] text-[var(--ff-accent-contrast)]'
                              : 'bg-[var(--ff-surface-hover)] text-[var(--ff-text-secondary)]'
                          }`}
                        >
                          Map to Existing Subject
                        </button>
                      </div>
                    </div>

                    {mapping.action === 'create_new' ? (
                      <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                        <div>
                          <label className="block text-[11px] font-medium text-[var(--ff-text-muted)] mb-1">
                            Subject Name
                          </label>
                          <ThemeInput
                            type="text"
                            value={mapping.targetSubjectName}
                            onChange={(e) => {
                              const val = e.target.value;
                              setTabMappings((prev) => ({
                                ...prev,
                                [mapping.tabId]: { ...mapping, targetSubjectName: val },
                              }));
                            }}
                          />
                        </div>
                        <div>
                          <div className="flex items-center justify-between mb-1">
                            <label className="text-[11px] font-medium text-[var(--ff-text-muted)]">
                              Subject Code
                            </label>
                            {isCodeConflict && (
                              <span className="text-[10px] text-amber-500 font-bold">Code exists!</span>
                            )}
                          </div>
                          <ThemeInput
                            type="text"
                            value={mapping.targetSubjectCode}
                            onChange={(e) => {
                              const val = e.target.value.replace(/\s+/g, '');
                              setTabMappings((prev) => ({
                                ...prev,
                                [mapping.tabId]: { ...mapping, targetSubjectCode: val },
                              }));
                            }}
                          />
                        </div>
                        <div>
                          <label className="block text-[11px] font-medium text-[var(--ff-text-muted)] mb-1">
                            Theme Color
                          </label>
                          <div className="flex items-center gap-1.5 pt-1">
                            {COLOR_PRESETS.map((hex) => (
                              <button
                                key={hex}
                                type="button"
                                onClick={() => {
                                  setTabMappings((prev) => ({
                                    ...prev,
                                    [mapping.tabId]: { ...mapping, targetColor: hex },
                                  }));
                                }}
                                className={`w-5 h-5 rounded-full transition-transform ${
                                  mapping.targetColor === hex ? 'scale-125 ring-2 ring-offset-1 ring-[var(--ff-accent)]' : ''
                                }`}
                                style={{ backgroundColor: hex }}
                                title={hex}
                              />
                            ))}
                          </div>
                        </div>
                      </div>
                    ) : (
                      <div>
                        <label className="block text-[11px] font-medium text-[var(--ff-text-muted)] mb-1">
                          Select Target Study Subject
                        </label>
                        {existingSubjects.length === 0 ? (
                          <div className="text-xs text-amber-500 p-2 rounded bg-amber-500/10">
                            No existing Study OS subjects found. Please select &ldquo;Create New Subject&rdquo;.
                          </div>
                        ) : (
                          <ThemeSelect
                            value={mapping.targetSubjectCode}
                            onChange={(e) => {
                              const code = e.target.value;
                              const matched = existingSubjects.find((s) => s.code === code);
                              setTabMappings((prev) => ({
                                ...prev,
                                [mapping.tabId]: {
                                  ...mapping,
                                  targetSubjectCode: code,
                                  targetSubjectName: matched?.name || mapping.targetSubjectName,
                                  targetSubjectId: matched?.id,
                                },
                              }));
                            }}
                          >
                            {existingSubjects.map((s) => (
                              <option key={s.id} value={s.code}>
                                {s.code} — {s.name} ({s.totalSubtopics || 0} topics)
                              </option>
                            ))}
                          </ThemeSelect>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>

            <div className="flex items-center justify-between pt-4 border-t border-[var(--ff-border-color)]">
              <ThemeButton variant="secondary" size="sm" onClick={() => setCurrentStep('tabs')}>
                <ArrowLeft className="w-4 h-4 mr-1 inline" />
                <span>Back</span>
              </ThemeButton>
              <ThemeButton variant="primary" size="sm" onClick={handleNextFromSubjects}>
                <span>Next: Map Columns</span>
                <ArrowRight className="w-4 h-4 ml-1 inline" />
              </ThemeButton>
            </div>
          </div>
        )}

        {/* ------------------------------------------------------------------ */}
        {/* STEP D: MAP COLUMNS                                                */}
        {/* ------------------------------------------------------------------ */}
        {currentStep === 'columns' && (
          <div className="space-y-4">
            <div>
              <h3 className="text-sm font-semibold text-[var(--ff-text-primary)]">
                Map Sheet Columns to Study OS Fields
              </h3>
              <p className="text-xs text-[var(--ff-text-muted)] mt-0.5">
                Verify automatic column detections. Map Unit, Topic, Subtopic, Done, Notes and Priority.
              </p>
            </div>

            {/* Sub-tab switcher for multi-tab setups */}
            {selectedTabsList.length > 1 && (
              <div className="flex items-center gap-1.5 overflow-x-auto pb-1 border-b border-[var(--ff-border-color)]">
                {selectedTabsList.map((t) => (
                  <button
                    key={t.tabId}
                    type="button"
                    onClick={() => setActiveColumnMappingTabId(t.tabId)}
                    className={`px-3 py-1.5 text-xs font-semibold rounded-lg transition-all whitespace-nowrap ${
                      activeColumnMappingTabId === t.tabId
                        ? 'bg-[var(--ff-accent)] text-[var(--ff-accent-contrast)] shadow-sm'
                        : 'bg-[var(--ff-surface)] text-[var(--ff-text-muted)] hover:text-[var(--ff-text-primary)]'
                    }`}
                  >
                    {t.sheetTitle}
                  </button>
                ))}
              </div>
            )}

            {/* Active tab columns list */}
            {(() => {
              const activeTabMapping = tabMappings[activeColumnMappingTabId] || selectedTabsList[0];
              if (!activeTabMapping) return null;

              const unmappedCount = activeTabMapping.columns.filter((c) => c.targetField === 'unmapped').length;

              return (
                <div className="space-y-3">
                  <div className="flex items-center justify-between text-xs">
                    <span className="font-semibold text-[var(--ff-text-primary)]">
                      Tab Columns for: &ldquo;{activeTabMapping.sheetTitle}&rdquo;
                    </span>
                    <ThemeBadge tone={unmappedCount > 0 ? 'neutral' : 'success'}>
                      {unmappedCount} Unmapped Column(s)
                    </ThemeBadge>
                  </div>

                  <div className="border border-[var(--ff-border-color)] rounded-xl overflow-hidden max-h-64 overflow-y-auto">
                    <table className="w-full text-xs text-left">
                      <thead className="bg-[var(--ff-surface-muted)] text-[var(--ff-text-muted)] sticky top-0 border-b border-[var(--ff-border-color)]">
                        <tr>
                          <th className="px-3 py-2 font-medium">Sheet Column Header</th>
                          <th className="px-3 py-2 font-medium">Target Study OS Field</th>
                          <th className="px-3 py-2 font-medium">Mapping Role</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-[var(--ff-border-color)] bg-[var(--ff-surface)]">
                        {activeTabMapping.columns.map((col) => (
                          <tr key={col.fieldKey} className="hover:bg-[var(--ff-surface-hover)]">
                            <td className="px-3 py-2 font-medium text-[var(--ff-text-primary)]">
                              {col.headerName}
                            </td>
                            <td className="px-3 py-2">
                              <ThemeSelect
                                value={col.targetField}
                                onChange={(e) =>
                                  handleUpdateColumnTarget(
                                    activeTabMapping.tabId,
                                    col.fieldKey,
                                    e.target.value as StudyTargetField
                                  )
                                }
                                className="text-xs py-1 px-2"
                              >
                                <option value="unit">Unit / Module</option>
                                <option value="topic">Topic (Main Topic)</option>
                                <option value="subtopic">Subtopic (Concept)</option>
                                <option value="done">Done (Theory Completion)</option>
                                <option value="notes">Notes / References</option>
                                <option value="priority">Priority</option>
                                <option value="unmapped">Do Not Map (Ignore)</option>
                              </ThemeSelect>
                            </td>
                            <td className="px-3 py-2">
                              {col.targetField === 'done' ? (
                                <ThemeBadge tone="success">Theory Complete</ThemeBadge>
                              ) : col.targetField === 'unit' ? (
                                <ThemeBadge tone="info">Module Unit</ThemeBadge>
                              ) : col.targetField === 'topic' ? (
                                <ThemeBadge tone="accent">Primary Topic</ThemeBadge>
                              ) : col.targetField === 'subtopic' ? (
                                <ThemeBadge tone="accent">Subtopic Concept</ThemeBadge>
                              ) : col.targetField === 'notes' ? (
                                <ThemeBadge tone="neutral">Resource Notes</ThemeBadge>
                              ) : col.targetField === 'priority' ? (
                                <ThemeBadge tone="warning">Priority Rank</ThemeBadge>
                              ) : (
                                <ThemeBadge tone="neutral">Ignored</ThemeBadge>
                              )}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              );
            })()}

            <div className="flex items-center justify-between pt-4 border-t border-[var(--ff-border-color)]">
              <ThemeButton variant="secondary" size="sm" onClick={() => setCurrentStep('subjects')}>
                <ArrowLeft className="w-4 h-4 mr-1 inline" />
                <span>Back</span>
              </ThemeButton>
              <ThemeButton
                variant="primary"
                size="sm"
                onClick={handleNextFromColumns}
                loading={previewLoading}
              >
                <span>Next: Review Preview</span>
                <ArrowRight className="w-4 h-4 ml-1 inline" />
              </ThemeButton>
            </div>
          </div>
        )}

        {/* ------------------------------------------------------------------ */}
        {/* STEP E: PREVIEW & SAFETY CHECK                                     */}
        {/* ------------------------------------------------------------------ */}
        {currentStep === 'preview' && (
          <div className="space-y-4">
            {/* Safety Guarantee Banner */}
            <div className="p-4 rounded-xl border border-emerald-500/30 bg-emerald-500/10 text-emerald-800 dark:text-emerald-300 space-y-1">
              <div className="flex items-center gap-2 font-bold text-xs text-emerald-700 dark:text-emerald-200">
                <ShieldCheck className="w-4 h-4 text-emerald-500 shrink-0" />
                <span>Non-Destructive Import Guarantee</span>
              </div>
              <p className="text-xs leading-relaxed pl-6">
                &ldquo;Existing Study OS progress, revisions, PYQ data and personal notes will be preserved.&rdquo;
              </p>
              <p className="text-[11px] text-emerald-700 dark:text-emerald-400 pl-6">
                When rows have <strong>Done = TRUE</strong>, they map as:
                <span className="font-semibold ml-1">Theory: Completed</span> •
                <span className="font-semibold ml-1">Practice: Unchanged (Pending)</span> •
                <span className="font-semibold ml-1">PYQ: Unchanged (Pending)</span>
              </p>
            </div>

            {/* Summary Stat Grid */}
            {previewData?.summary && (
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
                <div className="p-3 rounded-xl border border-[var(--ff-border-color)] bg-[var(--ff-surface)]">
                  <div className="text-[11px] text-[var(--ff-text-muted)] font-medium">Tabs Selected</div>
                  <div className="text-lg font-bold text-[var(--ff-text-primary)]">
                    {previewData.summary.tabsSelectedCount}
                  </div>
                </div>

                <div className="p-3 rounded-xl border border-[var(--ff-border-color)] bg-[var(--ff-surface)]">
                  <div className="text-[11px] text-[var(--ff-text-muted)] font-medium">Subjects to Create</div>
                  <div className="text-lg font-bold text-emerald-500">
                    {previewData.summary.subjectsToCreateCount}
                  </div>
                </div>

                <div className="p-3 rounded-xl border border-[var(--ff-border-color)] bg-[var(--ff-surface)]">
                  <div className="text-[11px] text-[var(--ff-text-muted)] font-medium">Subjects to Merge</div>
                  <div className="text-lg font-bold text-blue-500">
                    {previewData.summary.subjectsToMergeCount}
                  </div>
                </div>

                <div className="p-3 rounded-xl border border-[var(--ff-border-color)] bg-[var(--ff-surface)]">
                  <div className="text-[11px] text-[var(--ff-text-muted)] font-medium">New Topics</div>
                  <div className="text-lg font-bold text-[var(--ff-accent-text)]">
                    {previewData.summary.newTopicsCount}
                  </div>
                </div>

                <div className="p-3 rounded-xl border border-[var(--ff-border-color)] bg-[var(--ff-surface)]">
                  <div className="text-[11px] text-[var(--ff-text-muted)] font-medium">Existing Matches</div>
                  <div className="text-lg font-bold text-[var(--ff-text-secondary)]">
                    {previewData.summary.existingTopicsCount}
                  </div>
                </div>

                <div className="p-3 rounded-xl border border-[var(--ff-border-color)] bg-[var(--ff-surface)]">
                  <div className="text-[11px] text-[var(--ff-text-muted)] font-medium">Duplicate Rows</div>
                  <div className="text-lg font-bold text-amber-500">
                    {previewData.summary.duplicateRowsCount}
                  </div>
                </div>

                <div className="p-3 rounded-xl border border-[var(--ff-border-color)] bg-[var(--ff-surface)]">
                  <div className="text-[11px] text-[var(--ff-text-muted)] font-medium">Invalid / Missing Rows</div>
                  <div className="text-lg font-bold text-rose-500">
                    {previewData.summary.invalidRowsCount}
                  </div>
                </div>

                <div className="p-3 rounded-xl border border-[var(--ff-border-color)] bg-[var(--ff-surface)]">
                  <div className="text-[11px] text-[var(--ff-text-muted)] font-medium">Theory Completed</div>
                  <div className="text-lg font-bold text-emerald-600 dark:text-emerald-400">
                    {previewData.summary.theoryCompletedCount}
                  </div>
                </div>
              </div>
            )}

            {/* Preview Sub-Tab Switcher */}
            <div className="flex items-center justify-between border-b border-[var(--ff-border-color)] pb-2">
              <div className="flex items-center gap-1.5 p-1 bg-[var(--ff-surface)] border border-[var(--ff-border-color)] rounded-xl">
                <button
                  type="button"
                  onClick={() => setPreviewSubTab('table')}
                  className={`flex items-center gap-2 px-3 py-1 rounded-lg text-xs font-semibold transition-colors ${
                    previewSubTab === 'table'
                      ? 'bg-blue-600 text-white shadow-sm'
                      : 'text-[var(--ff-text-secondary)] hover:text-[var(--ff-text-primary)]'
                  }`}
                >
                  <Table className="w-3.5 h-3.5" />
                  <span>Syllabus Topics</span>
                  <ThemeBadge tone="neutral" className="text-[10px] px-1 py-0 ml-1">
                    {filteredPreviewRows.length}
                  </ThemeBadge>
                </button>

                <button
                  type="button"
                  onClick={() => setPreviewSubTab('conflicts')}
                  className={`flex items-center gap-2 px-3 py-1 rounded-lg text-xs font-semibold transition-colors ${
                    previewSubTab === 'conflicts'
                      ? 'bg-blue-600 text-white shadow-sm'
                      : 'text-[var(--ff-text-secondary)] hover:text-[var(--ff-text-primary)]'
                  }`}
                >
                  <GitCompare className="w-3.5 h-3.5" />
                  <span>Conflict &amp; Change Analysis</span>
                  {previewData?.conflictAnalysis && (previewData.conflictAnalysis.changedTopics.length > 0 || previewData.conflictAnalysis.missingSourceTopics.length > 0) && (
                    <ThemeBadge tone="warning" className="text-[10px] px-1 py-0 ml-1">
                      {previewData.conflictAnalysis.changedTopics.length + previewData.conflictAnalysis.missingSourceTopics.length}
                    </ThemeBadge>
                  )}
                </button>
              </div>

              {previewSubTab === 'conflicts' && (
                <label className="flex items-center gap-2 text-xs font-medium text-[var(--ff-text-secondary)] cursor-pointer select-none">
                  <input
                    type="checkbox"
                    checked={updateSourceManagedContent}
                    onChange={(e) => setUpdateSourceManagedContent(e.target.checked)}
                    className="rounded border-[var(--ff-border-color)] text-blue-600 focus:ring-blue-500"
                  />
                  <span>Update changed module &amp; topic names from spreadsheet</span>
                </label>
              )}
            </div>

            {/* VIEW A: INTERACTIVE PREVIEW TABLE */}
            {previewSubTab === 'table' && (
              <div className="space-y-3">
                {/* Search and Tab Filter for Preview Table */}
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-semibold text-[var(--ff-text-primary)]">
                      Preview Rows ({filteredPreviewRows.length})
                    </span>
                    <ThemeSelect
                      value={previewFilterTab}
                      onChange={(e) => setPreviewFilterTab(e.target.value)}
                      className="text-xs py-1 px-2"
                    >
                      <option value="all">All Subjects</option>
                      {previewData?.previewSubjects.map((s) => (
                        <option key={s.subjectCode} value={s.subjectCode}>
                          {s.subjectCode} — {s.subjectName} ({s.topics.length})
                        </option>
                      ))}
                    </ThemeSelect>
                  </div>

                  <div className="relative w-full sm:w-60">
                    <Search className="w-3.5 h-3.5 text-[var(--ff-text-muted)] absolute left-2.5 top-2.5" />
                    <ThemeInput
                      type="text"
                      placeholder="Filter preview topics..."
                      value={previewSearchQuery}
                      onChange={(e) => setPreviewSearchQuery(e.target.value)}
                      className="pl-8 text-xs py-1.5"
                    />
                  </div>
                </div>

                <div className="border border-[var(--ff-border-color)] rounded-xl overflow-hidden max-h-56 overflow-y-auto">
                  <table className="w-full text-xs text-left">
                    <thead className="bg-[var(--ff-surface-muted)] text-[var(--ff-text-muted)] sticky top-0 border-b border-[var(--ff-border-color)]">
                      <tr>
                        <th className="px-3 py-2 font-medium">Subject</th>
                        <th className="px-3 py-2 font-medium">Unit</th>
                        <th className="px-3 py-2 font-medium">Topic &amp; Subtopic</th>
                        <th className="px-3 py-2 font-medium">Priority</th>
                        <th className="px-3 py-2 font-medium">Theory</th>
                        <th className="px-3 py-2 font-medium">Practice</th>
                        <th className="px-3 py-2 font-medium">Status</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-[var(--ff-border-color)] bg-[var(--ff-surface)]">
                      {filteredPreviewRows.length === 0 ? (
                        <tr>
                          <td colSpan={7} className="px-3 py-6 text-center text-[var(--ff-text-muted)]">
                            No rows found matching current filters.
                          </td>
                        </tr>
                      ) : (
                        filteredPreviewRows.map((r, i) => (
                          <tr key={i} className="hover:bg-[var(--ff-surface-hover)]">
                            <td className="px-3 py-2 font-medium text-[var(--ff-text-primary)]">
                              {r.subjectCode}
                            </td>
                            <td className="px-3 py-2 text-[var(--ff-text-secondary)] truncate max-w-[120px]" title={r.unit}>
                              {r.unit}
                            </td>
                            <td className="px-3 py-2">
                              <div className="font-semibold text-[var(--ff-text-primary)]">{r.topic}</div>
                              {r.subtopic !== r.topic && (
                                <div className="text-[11px] text-[var(--ff-text-muted)]">{r.subtopic}</div>
                              )}
                            </td>
                            <td className="px-3 py-2">
                              <ThemeBadge
                                tone={r.priority === 'High' ? 'danger' : r.priority === 'Low' ? 'neutral' : 'warning'}
                              >
                                {r.priority}
                              </ThemeBadge>
                            </td>
                            <td className="px-3 py-2">
                              {r.theory ? (
                                <ThemeBadge tone="success">Completed</ThemeBadge>
                              ) : (
                                <ThemeBadge tone="neutral">Pending</ThemeBadge>
                              )}
                            </td>
                            <td className="px-3 py-2">
                              <ThemeBadge tone="neutral">Unchanged (Pending)</ThemeBadge>
                            </td>
                            <td className="px-3 py-2">
                              {r.isExistingMatch ? (
                                <ThemeBadge tone="info">Existing Match</ThemeBadge>
                              ) : (
                                <ThemeBadge tone="accent">New Topic</ThemeBadge>
                              )}
                            </td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {/* VIEW B: CONFLICT & CHANGE ANALYSIS */}
            {previewSubTab === 'conflicts' && previewData?.conflictAnalysis && (
              <div className="space-y-3.5">
                {/* Conflict Breakdown Metrics */}
                <div className="grid grid-cols-2 sm:grid-cols-5 gap-2 text-xs">
                  <div className="p-2.5 rounded-xl border border-emerald-500/20 bg-emerald-500/5">
                    <span className="text-[10px] text-[var(--ff-text-muted)] block font-medium">New Topics</span>
                    <span className="text-base font-bold text-emerald-500">
                      +{previewData.conflictAnalysis.newTopics.length}
                    </span>
                  </div>

                  <div className="p-2.5 rounded-xl border border-[var(--ff-border-color)] bg-[var(--ff-surface)]">
                    <span className="text-[10px] text-[var(--ff-text-muted)] block font-medium">Unchanged Topics</span>
                    <span className="text-base font-bold text-[var(--ff-text-secondary)]">
                      {previewData.conflictAnalysis.unchangedTopics.length}
                    </span>
                  </div>

                  <div className="p-2.5 rounded-xl border border-blue-500/20 bg-blue-500/5">
                    <span className="text-[10px] text-[var(--ff-text-muted)] block font-medium">Changed Content</span>
                    <span className="text-base font-bold text-blue-500">
                      {previewData.conflictAnalysis.changedTopics.length}
                    </span>
                  </div>

                  <div className="p-2.5 rounded-xl border border-purple-500/20 bg-purple-500/5">
                    <span className="text-[10px] text-[var(--ff-text-muted)] block font-medium">Missing in Sheet</span>
                    <span className="text-base font-bold text-purple-500">
                      {previewData.conflictAnalysis.missingSourceTopics.length}
                    </span>
                  </div>

                  <div className="p-2.5 rounded-xl border border-amber-500/20 bg-amber-500/5">
                    <span className="text-[10px] text-[var(--ff-text-muted)] block font-medium">Duplicate Rows</span>
                    <span className="text-base font-bold text-amber-500">
                      {previewData.conflictAnalysis.duplicateSourceRows.length}
                    </span>
                  </div>
                </div>

                {/* Changed Source Content Detail List */}
                {previewData.conflictAnalysis.changedTopics.length > 0 ? (
                  <div className="border border-[var(--ff-border-color)] rounded-xl p-3 bg-[var(--ff-surface)] space-y-2">
                    <div className="flex items-center justify-between text-xs font-semibold text-[var(--ff-text-primary)]">
                      <span>Changed Source Content ({previewData.conflictAnalysis.changedTopics.length})</span>
                      <span className="text-[11px] text-[var(--ff-text-muted)]">
                        {updateSourceManagedContent ? 'Will update on import' : 'Frozen: keeping Study OS names'}
                      </span>
                    </div>

                    <div className="space-y-2 max-h-44 overflow-y-auto pr-1">
                      {previewData.conflictAnalysis.changedTopics.map((item, idx) => (
                        <div
                          key={idx}
                          className="p-2 rounded-lg border border-[var(--ff-border-color)] bg-[var(--ff-bg-card)] text-xs flex flex-col sm:flex-row sm:items-center justify-between gap-2"
                        >
                          <div className="min-w-0">
                            <div className="flex items-center gap-1.5 font-bold text-[var(--ff-text-primary)]">
                              <span className="text-blue-500 font-mono text-[11px]">{item.subjectCode}</span>
                              <span>•</span>
                              <span className="truncate">{item.existing.topic}</span>
                            </div>
                            <div className="text-[11px] text-[var(--ff-text-secondary)] mt-0.5 flex items-center gap-2 flex-wrap">
                              <span>Existing: <em>{item.existing.unit} / {item.existing.priority}</em></span>
                              <span>→</span>
                              <span className="font-semibold text-blue-500">Incoming: <em>{item.incoming.unit} / {item.incoming.priority}</em></span>
                            </div>
                          </div>

                          <div className="flex items-center gap-1 shrink-0">
                            {item.diffFields.map((f) => (
                              <ThemeBadge key={f} tone="info" className="text-[10px] px-1 py-0 uppercase">
                                {f}
                              </ThemeBadge>
                            ))}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                ) : (
                  <div className="p-3 text-xs rounded-xl bg-[var(--ff-surface)] border border-[var(--ff-border-color)] text-[var(--ff-text-secondary)] flex items-center gap-2">
                    <CheckCircle2 className="w-4 h-4 text-emerald-500 shrink-0" />
                    <span>No conflicting or changed content detected. All existing topic descriptions match the spreadsheet.</span>
                  </div>
                )}

                {/* Missing Source Rows Preservation Banner */}
                {previewData.conflictAnalysis.missingSourceTopics.length > 0 && (
                  <div className="p-3.5 rounded-xl border border-purple-500/30 bg-purple-500/10 text-purple-800 dark:text-purple-300 space-y-1 text-xs">
                    <div className="flex items-center gap-2 font-bold text-purple-700 dark:text-purple-200">
                      <ShieldCheck className="w-4 h-4 text-purple-500 shrink-0" />
                      <span>{previewData.conflictAnalysis.missingSourceTopics.length} Topics in Study OS Absent from Sheet</span>
                    </div>
                    <p className="leading-relaxed pl-6">
                      These topics currently exist in Study OS but were not present in the selected spreadsheet tabs.
                      <strong> They are guaranteed preserved</strong> and will never be pruned or deleted. All practice records and Ebbinghaus revisions remain completely intact.
                    </p>
                  </div>
                )}
              </div>
            )}

            {/* Progress Bar during active import execution */}
            {isImporting && (
              <div className="p-4 rounded-xl border border-[var(--ff-accent)]/30 bg-[var(--ff-accent-soft)]/20 space-y-2">
                <div className="flex items-center justify-between text-xs font-semibold text-[var(--ff-text-primary)]">
                  <span>{importProgress?.stage || 'Importing syllabus topics into Study OS...'}</span>
                  <span>{importProgress?.percent || 0}%</span>
                </div>
                <ThemeProgressBar value={importProgress?.percent || 0} tone="accent" />
              </div>
            )}

            {/* Final Import Summary Results */}
            {importResult && (
              <div className="p-4 rounded-xl border border-emerald-500/30 bg-emerald-500/10 text-emerald-800 dark:text-emerald-300 space-y-3">
                <div className="flex items-center gap-2 font-bold text-sm text-emerald-700 dark:text-emerald-200">
                  <CheckCircle2 className="w-5 h-5 text-emerald-500 shrink-0" />
                  <span>Import to Study OS Completed Successfully!</span>
                </div>

                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs">
                  <div className="p-2 rounded-lg bg-[var(--ff-surface)] border border-[var(--ff-border-color)]">
                    <span className="text-[10px] text-[var(--ff-text-muted)] block">Created Subjects</span>
                    <span className="font-bold text-emerald-500">{importResult.createdSubjectsCount}</span>
                  </div>
                  <div className="p-2 rounded-lg bg-[var(--ff-surface)] border border-[var(--ff-border-color)]">
                    <span className="text-[10px] text-[var(--ff-text-muted)] block">Updated Subjects</span>
                    <span className="font-bold text-blue-500">{importResult.updatedSubjectsCount}</span>
                  </div>
                  <div className="p-2 rounded-lg bg-[var(--ff-surface)] border border-[var(--ff-border-color)]">
                    <span className="text-[10px] text-[var(--ff-text-muted)] block">Created Topics</span>
                    <span className="font-bold text-emerald-500">{importResult.createdTopicsCount}</span>
                  </div>
                  <div className="p-2 rounded-lg bg-[var(--ff-surface)] border border-[var(--ff-border-color)]">
                    <span className="text-[10px] text-[var(--ff-text-muted)] block">Updated Topics</span>
                    <span className="font-bold text-blue-500">{importResult.updatedTopicsCount}</span>
                  </div>
                  <div className="p-2 rounded-lg bg-[var(--ff-surface)] border border-[var(--ff-border-color)]">
                    <span className="text-[10px] text-[var(--ff-text-muted)] block">Unchanged Topics</span>
                    <span className="font-bold text-[var(--ff-text-secondary)]">{importResult.skippedTopicsCount}</span>
                  </div>
                  <div className="p-2 rounded-lg bg-[var(--ff-surface)] border border-[var(--ff-border-color)]">
                    <span className="text-[10px] text-[var(--ff-text-muted)] block">Duplicate Rows</span>
                    <span className="font-bold text-amber-500">{importResult.duplicateRowsCount}</span>
                  </div>
                  <div className="p-2 rounded-lg bg-[var(--ff-surface)] border border-[var(--ff-border-color)]">
                    <span className="text-[10px] text-[var(--ff-text-muted)] block">Skipped Blank</span>
                    <span className="font-bold text-rose-500">{importResult.invalidRowsCount}</span>
                  </div>
                  <div className="p-2 rounded-lg bg-[var(--ff-surface)] border border-[var(--ff-border-color)]">
                    <span className="text-[10px] text-[var(--ff-text-muted)] block">Theory Done</span>
                    <span className="font-bold text-emerald-600 dark:text-emerald-400">{importResult.theoryCompletedCount}</span>
                  </div>
                </div>

                <p className="text-xs text-emerald-700 dark:text-emerald-300">
                  All subjects, syllabus modules, and topics have been saved to your Study OS workspace with full progress protection.
                </p>
              </div>
            )}

            {/* Bottom Actions */}
            <div className="flex items-center justify-between pt-4 border-t border-[var(--ff-border-color)]">
              <ThemeButton
                variant="secondary"
                size="sm"
                onClick={() => setCurrentStep('columns')}
                disabled={isImporting || Boolean(importResult)}
              >
                <ArrowLeft className="w-4 h-4 mr-1 inline" />
                <span>Back</span>
              </ThemeButton>

              <div className="flex items-center gap-2">
                {importResult && (importResult.status === 'partial' || importResult.status === 'failed' || !importResult.success) && (
                  <ThemeButton
                    variant="danger"
                    size="sm"
                    onClick={handleExecuteImport}
                    loading={isImporting}
                    className="flex items-center gap-1.5"
                  >
                    <RefreshCw className="w-3.5 h-3.5" />
                    <span>Retry Failed Records</span>
                  </ThemeButton>
                )}

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
                      disabled={isImporting}
                    >
                      <GraduationCap className="w-4 h-4 mr-1 inline" />
                      <span>Execute Import to Study OS</span>
                    </ThemeButton>
                  </>
                ) : (
                  <ThemeButton
                    variant="primary"
                    size="sm"
                    onClick={onClose}
                  >
                    <Check className="w-4 h-4 mr-1 inline" />
                    <span>Done & Close</span>
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
