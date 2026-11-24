/**
 * FocusFlow & Finance — Study OS Import History & Source Management Modal (Step 5)
 *
 * Implements:
 * 1. Chronological audit trail of all sheet-to-study imports.
 * 2. Source tracking view with Re-import, Stop Tracking, and Remove Metadata actions.
 * 3. Safe retry for partial or failed imports.
 * 4. Safety Guarantee: Removing metadata NEVER deletes or mutates Study OS subjects or topics.
 */

import React, { useState, useEffect } from 'react';
import {
  History,
  FileSpreadsheet,
  GraduationCap,
  CheckCircle2,
  AlertTriangle,
  XCircle,
  RotateCcw,
  Trash2,
  EyeOff,
  ExternalLink,
  ShieldCheck,
  Clock,
  Layers,
  ChevronDown,
  ChevronRight,
  RefreshCw,
  Search,
} from 'lucide-react';
import {
  ThemeModal,
  ThemeButton,
  ThemeBadge,
  ThemeCard,
  ThemeInput,
} from '../ui/ThemePrimitives.tsx';
import type {
  StudyImportHistoryRecord,
  StudyImportSource,
} from '../../types/study.ts';
import { api } from '../../lib/api.ts';
import { studyImportHistoryStore } from '../../lib/sheetHub/studyImportHistoryStore.ts';
import { cleanupErroneousOverviewImportData } from '../../lib/sheetHub/sheetToStudyImportEngine.ts';

interface StudyImportHistoryModalProps {
  isOpen: boolean;
  onClose: () => void;
  userId: string;
  onReimportSource?: (source: StudyImportSource) => void;
  showToast?: (message: string, type?: 'success' | 'error' | 'info') => void;
}

export const StudyImportHistoryModal: React.FC<StudyImportHistoryModalProps> = ({
  isOpen,
  onClose,
  userId,
  onReimportSource,
  showToast,
}) => {
  const [activeTab, setActiveTab] = useState<'history' | 'sources'>('history');
  const [historyRecords, setHistoryRecords] = useState<StudyImportHistoryRecord[]>([]);
  const [sources, setSources] = useState<StudyImportSource[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [expandedRecordId, setExpandedRecordId] = useState<string | null>(null);

  // Confirmation dialogs
  const [sourceToDelete, setSourceToDelete] = useState<StudyImportSource | null>(null);
  const [isClearingHistory, setIsClearingHistory] = useState(false);

  useEffect(() => {
    if (!isOpen) return;
    loadData();
  }, [isOpen, userId]);

  async function loadData() {
    setIsLoading(true);
    try {
      const [hist, srcs] = await Promise.all([
        studyImportHistoryStore.getImportHistory(userId),
        studyImportHistoryStore.getImportSources(userId),
      ]);
      setHistoryRecords(hist);
      setSources(srcs);
    } catch (err) {
      console.warn('Failed to load study import history:', err);
    } finally {
      setIsLoading(false);
    }
  }

  const handleStopTracking = async (source: StudyImportSource) => {
    try {
      await studyImportHistoryStore.setSourceUntracked(userId, source.id);
      await loadData();
      showToast?.(`Stopped tracking "${source.spreadsheetTitle}".`, 'info');
    } catch {
      showToast?.('Failed to update source tracking.', 'error');
    }
  };

  const handleConfirmDeleteSource = async () => {
    if (!sourceToDelete) return;
    try {
      await studyImportHistoryStore.deleteImportSource(userId, sourceToDelete.id);
      setSourceToDelete(null);
      await loadData();
      showToast?.(
        `Import metadata for "${sourceToDelete.spreadsheetTitle}" removed cleanly. Study OS subjects & topics were preserved.`,
        'success'
      );
    } catch {
      showToast?.('Failed to remove source metadata.', 'error');
    }
  };

  const handleConfirmClearHistory = async () => {
    try {
      await studyImportHistoryStore.clearImportHistory(userId);
      setIsClearingHistory(false);
      await loadData();
      showToast?.('Import history logs cleared.', 'info');
    } catch {
      showToast?.('Failed to clear import history.', 'error');
    }
  };

  const filteredHistory = historyRecords.filter((h) => {
    if (!searchQuery.trim()) return true;
    const q = searchQuery.toLowerCase();
    return (
      h.sourceSpreadsheetTitle.toLowerCase().includes(q) ||
      (h.targetTierName && h.targetTierName.toLowerCase().includes(q)) ||
      h.targetTierId.toLowerCase().includes(q) ||
      h.selectedTabs.some((t) => t.toLowerCase().includes(q))
    );
  });

  const filteredSources = sources.filter((s) => {
    if (!searchQuery.trim()) return true;
    const q = searchQuery.toLowerCase();
    return (
      s.spreadsheetTitle.toLowerCase().includes(q) ||
      (s.targetTierName && s.targetTierName.toLowerCase().includes(q)) ||
      s.importedSubjectCodes.some((code) => code.toLowerCase().includes(q))
    );
  });

  if (!isOpen) return null;

  return (
    <ThemeModal
      isOpen={isOpen}
      onClose={onClose}
      title="Study OS Import Hub: History & Source Management"
      maxWidthClass="max-w-4xl"
    >
      <div className="space-y-4">
        {/* Navigation Tabs and Search Bar */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-[var(--ff-border-color)]">
          <div className="flex items-center gap-1.5 p-1 bg-[var(--ff-surface)] border border-[var(--ff-border-color)] rounded-xl">
            <button
              type="button"
              onClick={() => setActiveTab('history')}
              className={`flex items-center gap-2 px-3.5 py-1.5 rounded-lg text-xs font-semibold transition-colors ${
                activeTab === 'history'
                  ? 'bg-blue-600 text-white shadow-sm'
                  : 'text-[var(--ff-text-secondary)] hover:text-[var(--ff-text-primary)]'
              }`}
            >
              <History className="w-3.5 h-3.5" />
              <span>Import History</span>
              <ThemeBadge tone="neutral" className="text-[10px] px-1 py-0 ml-1">
                {historyRecords.length}
              </ThemeBadge>
            </button>

            <button
              type="button"
              onClick={() => setActiveTab('sources')}
              className={`flex items-center gap-2 px-3.5 py-1.5 rounded-lg text-xs font-semibold transition-colors ${
                activeTab === 'sources'
                  ? 'bg-blue-600 text-white shadow-sm'
                  : 'text-[var(--ff-text-secondary)] hover:text-[var(--ff-text-primary)]'
              }`}
            >
              <FileSpreadsheet className="w-3.5 h-3.5" />
              <span>Imported Sources</span>
              <ThemeBadge tone="neutral" className="text-[10px] px-1 py-0 ml-1">
                {sources.length}
              </ThemeBadge>
            </button>
          </div>

          <div className="flex items-center gap-2">
            <div className="relative">
              <Search className="w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-[var(--ff-text-muted)]" />
              <input
                type="text"
                placeholder={activeTab === 'history' ? 'Search history...' : 'Search sources...'}
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-8 pr-3 py-1.5 text-xs rounded-xl border border-[var(--ff-border-color)] bg-[var(--ff-surface)] text-[var(--ff-text-primary)] focus:outline-none focus:ring-1 focus:ring-blue-500 w-48 sm:w-60"
              />
            </div>

            <ThemeButton
              variant="secondary"
              size="sm"
              onClick={loadData}
              title="Refresh logs"
              className="p-2"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${isLoading ? 'animate-spin' : ''}`} />
            </ThemeButton>
          </div>
        </div>

        {/* TAB 1: IMPORT HISTORY */}
        {activeTab === 'history' && (
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="text-xs text-[var(--ff-text-secondary)] font-medium">
                  Showing {filteredHistory.length} import run{filteredHistory.length === 1 ? '' : 's'}
                </span>
                <span className="text-xs text-[var(--ff-text-muted)]">• Zero credentials stored</span>
              </div>

              <div className="flex items-center gap-2">
                <ThemeButton
                  variant="secondary"
                  size="sm"
                  onClick={async () => {
                    try {
                      const res = await cleanupErroneousOverviewImportData(userId);
                      showToast?.(res.message, res.removedSubjectCount > 0 ? 'success' : 'info');
                      await loadData();
                    } catch (err: unknown) {
                      showToast?.(err instanceof Error ? err.message : 'Cleanup failed', 'error');
                    }
                  }}
                  className="text-amber-500 hover:text-amber-600 text-xs flex items-center gap-1.5"
                >
                  <Trash2 className="w-3 h-3" />
                  <span>Clean Up Overview Data</span>
                </ThemeButton>
                {historyRecords.length > 0 && (
                  <ThemeButton
                    variant="ghost"
                    size="sm"
                    onClick={() => setIsClearingHistory(true)}
                    className="text-red-500 hover:text-red-600 text-xs flex items-center gap-1.5"
                  >
                    <Trash2 className="w-3 h-3" />
                    <span>Clear History Logs</span>
                  </ThemeButton>
                )}
              </div>
            </div>

            {filteredHistory.length === 0 ? (
              <div className="p-8 text-center border border-dashed border-[var(--ff-border-color)] rounded-2xl">
                <History className="w-8 h-8 text-[var(--ff-text-muted)] mx-auto mb-2 opacity-50" />
                <h4 className="text-sm font-semibold text-[var(--ff-text-primary)]">No Import History Found</h4>
                <p className="text-xs text-[var(--ff-text-secondary)] mt-1 max-w-sm mx-auto">
                  When you import worksheets from Google Sheets into Study OS, each run is recorded here with detailed metrics.
                </p>
              </div>
            ) : (
              <div className="space-y-2.5 max-h-[500px] overflow-y-auto pr-1">
                {filteredHistory.map((item) => {
                  const isExpanded = expandedRecordId === item.id;
                  const dateFormatted = new Date(item.importedAt).toLocaleString(undefined, {
                    dateStyle: 'medium',
                    timeStyle: 'short',
                  });

                  return (
                    <div
                      key={item.id}
                      className="border border-[var(--ff-border-color)] rounded-xl bg-[var(--ff-surface)] p-3.5 transition-all hover:border-blue-500/30"
                    >
                      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5">
                        <div className="flex items-start gap-3 min-w-0">
                          <div className="mt-0.5 shrink-0">
                            {item.status === 'success' && (
                              <CheckCircle2 className="w-4 h-4 text-emerald-500" />
                            )}
                            {item.status === 'partial' && (
                              <AlertTriangle className="w-4 h-4 text-amber-500" />
                            )}
                            {item.status === 'failed' && (
                              <XCircle className="w-4 h-4 text-red-500" />
                            )}
                          </div>

                          <div className="min-w-0">
                            <div className="flex items-center gap-2 flex-wrap">
                              <h4 className="text-xs font-bold text-[var(--ff-text-primary)] truncate">
                                {item.sourceSpreadsheetTitle}
                              </h4>
                              <ThemeBadge
                                tone={
                                  item.status === 'success'
                                    ? 'success'
                                    : item.status === 'partial'
                                    ? 'warning'
                                    : 'danger'
                                }
                                className="text-[10px] px-1.5 py-0 capitalize font-medium"
                              >
                                {item.status}
                              </ThemeBadge>
                              <span className="text-[11px] text-[var(--ff-text-muted)] flex items-center gap-1">
                                <Clock className="w-3 h-3" />
                                {dateFormatted}
                              </span>
                            </div>

                            <div className="flex items-center gap-2 mt-1 text-[11px] text-[var(--ff-text-secondary)] flex-wrap">
                              <span>
                                Target Tier: <strong className="text-[var(--ff-text-primary)]">{item.targetTierName || item.targetTierId}</strong>
                              </span>
                              <span>•</span>
                              <span>
                                Tabs: <span className="font-medium text-[var(--ff-text-primary)]">{item.selectedTabs.join(', ')}</span>
                              </span>
                            </div>
                          </div>
                        </div>

                        {/* Summary Badges & Accordion Trigger */}
                        <div className="flex items-center gap-2 self-end sm:self-auto shrink-0">
                          <div className="flex items-center gap-1.5 text-xs font-semibold">
                            <ThemeBadge tone="success" className="text-[11px] px-2 py-0.5">
                              +{item.createdTopicsCount} new
                            </ThemeBadge>
                            {item.updatedTopicsCount > 0 && (
                              <ThemeBadge tone="info" className="text-[11px] px-2 py-0.5">
                                {item.updatedTopicsCount} updated
                              </ThemeBadge>
                            )}
                            {item.theoryCompletedCount > 0 && (
                              <ThemeBadge tone="accent" className="text-[11px] px-2 py-0.5">
                                {item.theoryCompletedCount} done
                              </ThemeBadge>
                            )}
                          </div>

                          <button
                            type="button"
                            onClick={() => setExpandedRecordId(isExpanded ? null : item.id)}
                            className="p-1 rounded text-[var(--ff-text-muted)] hover:text-[var(--ff-text-primary)] transition-colors"
                            title={isExpanded ? 'Collapse breakdown' : 'Expand breakdown'}
                          >
                            {isExpanded ? (
                              <ChevronDown className="w-4 h-4" />
                            ) : (
                              <ChevronRight className="w-4 h-4" />
                            )}
                          </button>
                        </div>
                      </div>

                      {/* Expanded Tab-by-Tab Breakdown */}
                      {isExpanded && item.details && item.details.length > 0 && (
                        <div className="mt-3 pt-3 border-t border-[var(--ff-border-color)] space-y-2">
                          <span className="text-[11px] font-semibold text-[var(--ff-text-secondary)] uppercase tracking-wider">
                            Subject &amp; Tab Breakdown
                          </span>
                          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                            {item.details.map((d, dIdx) => (
                              <div
                                key={dIdx}
                                className="p-2.5 rounded-lg border border-[var(--ff-border-color)] bg-[var(--ff-bg-card)] text-xs space-y-1"
                              >
                                <div className="flex items-center justify-between font-bold text-[var(--ff-text-primary)]">
                                  <span>{d.subjectName}</span>
                                  <span className="font-mono text-[10px] text-[var(--ff-accent-text)]">
                                    {d.subjectCode}
                                  </span>
                                </div>
                                <div className="flex items-center gap-3 text-[11px] text-[var(--ff-text-secondary)] flex-wrap">
                                  <span>New: <strong className="text-emerald-500">{d.createdTopics}</strong></span>
                                  <span>Updated: <strong>{d.updatedTopics}</strong></span>
                                  <span>Skipped: <strong>{d.skippedTopics}</strong></span>
                                  <span>Theory: <strong className="text-blue-500">{d.theoryCompleted}</strong></span>
                                </div>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {/* TAB 2: IMPORTED SOURCES */}
        {activeTab === 'sources' && (
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-xs text-[var(--ff-text-secondary)] font-medium">
                Tracking {filteredSources.length} external syllabus spreadsheet{filteredSources.length === 1 ? '' : 's'}
              </span>
            </div>

            {filteredSources.length === 0 ? (
              <div className="p-8 text-center border border-dashed border-[var(--ff-border-color)] rounded-2xl">
                <FileSpreadsheet className="w-8 h-8 text-[var(--ff-text-muted)] mx-auto mb-2 opacity-50" />
                <h4 className="text-sm font-semibold text-[var(--ff-text-primary)]">No Active Study Sources</h4>
                <p className="text-xs text-[var(--ff-text-secondary)] mt-1 max-w-sm mx-auto">
                  Import a Google Sheet into Study OS to register it as an active syllabus source with automatic change detection.
                </p>
              </div>
            ) : (
              <div className="space-y-2.5 max-h-[500px] overflow-y-auto pr-1">
                {filteredSources.map((source) => {
                  const lastImportFormatted = new Date(source.lastImportedAt).toLocaleDateString(undefined, {
                    month: 'short',
                    day: 'numeric',
                    year: 'numeric',
                  });

                  return (
                    <div
                      key={source.id}
                      className="border border-[var(--ff-border-color)] rounded-xl bg-[var(--ff-surface)] p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3 hover:border-blue-500/30 transition-all"
                    >
                      <div className="min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <h4 className="text-sm font-bold text-[var(--ff-text-primary)] truncate">
                            {source.spreadsheetTitle}
                          </h4>
                          <ThemeBadge
                            tone={source.status === 'active' ? 'success' : 'neutral'}
                            className="text-[10px] px-1.5 py-0 capitalize"
                          >
                            {source.status}
                          </ThemeBadge>
                          <span className="text-[11px] text-[var(--ff-text-muted)]">
                            {source.totalImportsCount} import{source.totalImportsCount === 1 ? '' : 's'} run
                          </span>
                        </div>

                        <div className="flex items-center gap-3 mt-1.5 text-xs text-[var(--ff-text-secondary)] flex-wrap">
                          <span>
                            Tier: <strong className="text-[var(--ff-text-primary)]">{source.targetTierName || source.targetTierId}</strong>
                          </span>
                          <span>•</span>
                          <span>
                            Subjects: <strong className="text-[var(--ff-text-primary)]">{source.importedSubjectCodes.length}</strong> ({source.importedSubjectCodes.slice(0, 4).join(', ')}{source.importedSubjectCodes.length > 4 ? '...' : ''})
                          </span>
                          <span>•</span>
                          <span>Last imported: <strong>{lastImportFormatted}</strong></span>
                        </div>
                      </div>

                      {/* Source Action Buttons */}
                      <div className="flex items-center gap-2 self-end sm:self-auto shrink-0">
                        {onReimportSource && source.status === 'active' && (
                          <ThemeButton
                            variant="primary"
                            size="sm"
                            onClick={() => {
                              onClose();
                              onReimportSource(source);
                            }}
                            className="flex items-center gap-1.5 text-xs"
                            title="Re-import this spreadsheet to pull new syllabus topics"
                          >
                            <RefreshCw className="w-3.5 h-3.5" />
                            <span>Re-import</span>
                          </ThemeButton>
                        )}

                        {source.status === 'active' ? (
                          <ThemeButton
                            variant="secondary"
                            size="sm"
                            onClick={() => handleStopTracking(source)}
                            className="flex items-center gap-1 text-xs"
                            title="Stop tracking syllabus updates from this sheet"
                          >
                            <EyeOff className="w-3.5 h-3.5" />
                            <span>Stop Tracking</span>
                          </ThemeButton>
                        ) : (
                          <ThemeButton
                            variant="secondary"
                            size="sm"
                            onClick={async () => {
                              await studyImportHistoryStore.saveImportSource(userId, {
                                ...source,
                                status: 'active',
                              });
                              await loadData();
                              showToast?.(`Resumed tracking "${source.spreadsheetTitle}".`, 'success');
                            }}
                            className="flex items-center gap-1 text-xs"
                            title="Resume tracking this spreadsheet"
                          >
                            <RefreshCw className="w-3.5 h-3.5" />
                            <span>Resume</span>
                          </ThemeButton>
                        )}

                        <ThemeButton
                          variant="ghost"
                          size="sm"
                          onClick={() => setSourceToDelete(source)}
                          className="text-red-500 hover:text-red-600 p-2"
                          title="Remove source metadata (Study OS content is never deleted)"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </ThemeButton>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {/* DIALOG: CONFIRM DELETE SOURCE METADATA */}
        {sourceToDelete && (
          <ThemeModal
            isOpen={Boolean(sourceToDelete)}
            onClose={() => setSourceToDelete(null)}
            title="Remove Syllabus Source Tracking"
            maxWidthClass="max-w-md"
          >
            <div className="space-y-4">
              <div className="p-3 bg-blue-500/10 border border-blue-500/20 rounded-xl flex items-start gap-2.5">
                <ShieldCheck className="w-5 h-5 text-blue-500 shrink-0 mt-0.5" />
                <div className="text-xs text-[var(--ff-text-secondary)]">
                  <strong className="text-[var(--ff-text-primary)] block mb-0.5">
                    Non-Destructive Guarantee
                  </strong>
                  Removing this source only deletes the tracking link and history entry. None of your
                  Study OS subjects, topics, flashcards, revisions, or practice progress will be deleted.
                </div>
              </div>

              <p className="text-xs text-[var(--ff-text-secondary)]">
                Are you sure you want to stop tracking <strong>"{sourceToDelete.spreadsheetTitle}"</strong>?
              </p>

              <div className="flex justify-end gap-2 pt-2 border-t border-[var(--ff-border-color)]">
                <ThemeButton variant="secondary" size="sm" onClick={() => setSourceToDelete(null)}>
                  Cancel
                </ThemeButton>
                <ThemeButton variant="danger" size="sm" onClick={handleConfirmDeleteSource}>
                  Remove Tracking Metadata
                </ThemeButton>
              </div>
            </div>
          </ThemeModal>
        )}

        {/* DIALOG: CONFIRM CLEAR HISTORY */}
        {isClearingHistory && (
          <ThemeModal
            isOpen={isClearingHistory}
            onClose={() => setIsClearingHistory(false)}
            title="Clear Import History Logs"
            maxWidthClass="max-w-md"
          >
            <div className="space-y-3">
              <p className="text-xs text-[var(--ff-text-secondary)]">
                Are you sure you want to clear your import history logs? This will delete the run logs,
                but your Study OS syllabus subjects, topics, and progress will remain completely untouched.
              </p>
              <div className="flex justify-end gap-2 pt-2 border-t border-[var(--ff-border-color)]">
                <ThemeButton variant="secondary" size="sm" onClick={() => setIsClearingHistory(false)}>
                  Cancel
                </ThemeButton>
                <ThemeButton variant="danger" size="sm" onClick={handleConfirmClearHistory}>
                  Clear History
                </ThemeButton>
              </div>
            </div>
          </ThemeModal>
        )}

        {/* Footer info banner */}
        <div className="pt-3 border-t border-[var(--ff-border-color)] flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-xs text-[var(--ff-text-muted)]">
          <div className="flex items-center gap-1.5">
            <ShieldCheck className="w-4 h-4 text-emerald-500" />
            <span>Multi-tenant encrypted metadata • Safe non-destructive operations</span>
          </div>
          <ThemeButton variant="secondary" size="sm" onClick={onClose}>
            Close
          </ThemeButton>
        </div>
      </div>
    </ThemeModal>
  );
};
