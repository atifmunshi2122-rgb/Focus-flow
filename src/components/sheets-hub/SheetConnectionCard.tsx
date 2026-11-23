import React, { useState } from 'react';
import {
  FileSpreadsheet,
  ArrowRight,
  RotateCcw,
  Pause,
  Play,
  Trash2,
  MoreVertical,
  ExternalLink,
  ShieldCheck,
  CheckCircle2,
  AlertTriangle,
  Clock,
  Layers,
  Database,
  Lock,
  FolderSync,
  Eye,
} from 'lucide-react';
import type { SheetConnection } from '../../types/sheetHub.ts';
import { ThemeCard, ThemeButton, ThemeBadge, ThemeModal } from '../ui/ThemePrimitives.tsx';

interface SheetConnectionCardProps {
  connection: SheetConnection;
  tabCount?: number;
  rowCount?: number;
  onOpen: (connectionId: string) => void;
  onRefresh: (connectionId: string) => void;
  onTogglePause: (connectionId: string) => void;
  onReconnect: (connectionId: string) => void;
  onRemove: (connectionId: string, purgeCache: boolean) => void;
  isPulling?: boolean;
}

export const SheetConnectionCard: React.FC<SheetConnectionCardProps> = ({
  connection,
  tabCount = 0,
  rowCount = 0,
  onOpen,
  onRefresh,
  onTogglePause,
  onReconnect,
  onRemove,
  isPulling = false,
}) => {
  const [menuOpen, setMenuOpen] = useState(false);
  const [deleteModalOpen, setDeleteModalOpen] = useState(false);
  const [purgeCacheOption, setPurgeCacheOption] = useState(true);

  const formatTimestamp = (iso: string | null | undefined) => {
    if (!iso) return 'Never';
    try {
      const d = new Date(iso);
      return d.toLocaleDateString([], { month: 'short', day: 'numeric', year: 'numeric' });
    } catch {
      return iso;
    }
  };

  const isPaused = connection.status === 'paused';
  const isAuthRequired = connection.status === 'auth_required';

  return (
    <>
      <ThemeCard
        variant="elevated"
        className="flex flex-col justify-between border border-[var(--ff-border-color)] p-5 hover:border-[var(--ff-accent)] transition-all duration-200 group"
      >
        <div>
          {/* Card Top: Title, Icon, Badge & Overflow Menu */}
          <div className="flex items-start justify-between gap-3 mb-3">
            <div className="flex items-center gap-3 min-w-0">
              <div className="w-10 h-10 rounded-xl flex items-center justify-center bg-emerald-500/10 text-emerald-500 border border-emerald-500/20 shrink-0">
                <FileSpreadsheet className="w-5 h-5" />
              </div>
              <div className="min-w-0">
                <h3
                  className="font-semibold text-base text-[var(--ff-text-primary)] truncate group-hover:text-[var(--ff-accent)] transition-colors cursor-pointer"
                  onClick={() => onOpen(connection.id)}
                  title={connection.title}
                >
                  {connection.title}
                </h3>
                {connection.isDualCopy ? (
                  <a
                    href={connection.driveFileId ? `https://docs.google.com/spreadsheets/d/${encodeURIComponent(connection.driveFileId)}/edit` : connection.spreadsheetUrl}
                    target="_blank"
                    rel="noreferrer noopener"
                    className="text-xs text-emerald-600 dark:text-emerald-400 hover:text-emerald-500 inline-flex items-center gap-1 mt-0.5 truncate max-w-[220px] font-medium"
                    title="Open duplicated copy in Google Drive"
                    onClick={(e) => e.stopPropagation()}
                  >
                    <span>Google Drive Copy</span>
                    <ExternalLink className="w-3 h-3 shrink-0" />
                  </a>
                ) : connection.isNative ? (
                  <span className="text-xs text-[var(--ff-accent-text)] inline-flex items-center gap-1 mt-0.5 truncate font-medium">
                    <Database className="w-3 h-3 shrink-0" />
                    <span>Native Firestore</span>
                  </span>
                ) : (
                  <a
                    href={connection.spreadsheetUrl}
                    target="_blank"
                    rel="noreferrer noopener"
                    className="text-xs text-[var(--ff-text-muted)] hover:text-[var(--ff-text-primary)] inline-flex items-center gap-1 mt-0.5 truncate max-w-[220px]"
                    title="Open source in Google Sheets"
                    onClick={(e) => e.stopPropagation()}
                  >
                    <span>Google Sheets</span>
                    <ExternalLink className="w-3 h-3 shrink-0" />
                  </a>
                )}
              </div>
            </div>

            <div className="relative shrink-0">
              <button
                type="button"
                onClick={() => setMenuOpen(!menuOpen)}
                className="p-1.5 rounded-lg text-[var(--ff-text-muted)] hover:text-[var(--ff-text-primary)] hover:bg-[var(--ff-surface-hover)] transition-colors"
                aria-label="Connection actions"
              >
                <MoreVertical className="w-4 h-4" />
              </button>

              {menuOpen && (
                <>
                  <div className="fixed inset-0 z-30" onClick={() => setMenuOpen(false)} />
                  <div
                    className="absolute right-0 top-full mt-1 w-48 rounded-xl border border-[var(--ff-border-color)] bg-[var(--ff-surface-elevated)] shadow-xl z-40 py-1 text-xs"
                    style={{ background: 'var(--ff-surface-elevated)' }}
                  >
                    <button
                      type="button"
                      onClick={() => {
                        setMenuOpen(false);
                        onTogglePause(connection.id);
                      }}
                      className="w-full text-left px-3 py-2 flex items-center gap-2 hover:bg-[var(--ff-surface-hover)] text-[var(--ff-text-primary)]"
                    >
                      {isPaused ? <Play className="w-3.5 h-3.5 text-emerald-500" /> : <Pause className="w-3.5 h-3.5 text-amber-500" />}
                      <span>{isPaused ? 'Resume Updates' : 'Pause Updates'}</span>
                    </button>

                    <button
                      type="button"
                      onClick={() => {
                        setMenuOpen(false);
                        onReconnect(connection.id);
                      }}
                      className="w-full text-left px-3 py-2 flex items-center gap-2 hover:bg-[var(--ff-surface-hover)] text-[var(--ff-text-primary)]"
                    >
                      <ShieldCheck className="w-3.5 h-3.5 text-[var(--ff-accent)]" />
                      <span>Check Google Auth</span>
                    </button>

                    {connection.isDualCopy && connection.driveFileId && (
                      <a
                        href={`https://docs.google.com/spreadsheets/d/${encodeURIComponent(connection.driveFileId)}/edit`}
                        target="_blank"
                        rel="noreferrer noopener"
                        onClick={() => setMenuOpen(false)}
                        className="w-full text-left px-3 py-2 flex items-center gap-2 hover:bg-[var(--ff-surface-hover)] text-emerald-600 dark:text-emerald-400 font-medium"
                      >
                        <ExternalLink className="w-3.5 h-3.5 text-emerald-500" />
                        <span>Open Drive Duplicate</span>
                      </a>
                    )}

                    {connection.sourceSpreadsheetId && (
                      <a
                        href={`https://docs.google.com/spreadsheets/d/${encodeURIComponent(connection.sourceSpreadsheetId)}/edit`}
                        target="_blank"
                        rel="noreferrer noopener"
                        onClick={() => setMenuOpen(false)}
                        className="w-full text-left px-3 py-2 flex items-center gap-2 hover:bg-[var(--ff-surface-hover)] text-[var(--ff-text-muted)]"
                      >
                        <ExternalLink className="w-3.5 h-3.5" />
                        <span>View Original Source</span>
                      </a>
                    )}

                    {!connection.isDualCopy && (
                      <a
                        href={connection.spreadsheetUrl}
                        target="_blank"
                        rel="noreferrer noopener"
                        onClick={() => setMenuOpen(false)}
                        className="w-full text-left px-3 py-2 flex items-center gap-2 hover:bg-[var(--ff-surface-hover)] text-[var(--ff-text-primary)]"
                      >
                        <ExternalLink className="w-3.5 h-3.5 text-blue-500" />
                        <span>Open in Google Sheets</span>
                      </a>
                    )}

                    <div className="border-t border-[var(--ff-border-color)] my-1" />

                    <button
                      type="button"
                      onClick={() => {
                        setMenuOpen(false);
                        setDeleteModalOpen(true);
                      }}
                      className="w-full text-left px-3 py-2 flex items-center gap-2 hover:bg-rose-500/10 text-rose-500"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                      <span>Remove Connection</span>
                    </button>
                  </div>
                </>
              )}
            </div>
          </div>

          {/* Status Badge */}
          <div className="flex flex-wrap items-center gap-2 mb-4">
            {connection.isPublicLink && (
              <ThemeBadge tone="info" className="text-xs flex items-center gap-1 bg-blue-500/10 text-blue-600 dark:text-blue-400 border border-blue-500/30 font-semibold">
                <Eye className="w-3 h-3" /> Public (Zero Auth)
              </ThemeBadge>
            )}
            {connection.isDualCopy && (
              <ThemeBadge tone="success" className="text-xs flex items-center gap-1 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/30 font-semibold">
                <FolderSync className="w-3 h-3" /> Dual-Copy
              </ThemeBadge>
            )}
            {connection.isNative && (
              <ThemeBadge tone="neutral" className="text-xs flex items-center gap-1 bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 border border-indigo-500/30 font-semibold">
                <Database className="w-3 h-3" /> Native Sheet
              </ThemeBadge>
            )}
            {connection.spreadsheetId === 'sem3-syllabus-sample' && (
              <ThemeBadge tone="neutral" className="text-xs flex items-center gap-1 bg-amber-500/10 text-amber-600 dark:text-amber-400 border border-amber-500/30 font-semibold">
                Demo Data
              </ThemeBadge>
            )}
            {connection.status === 'active' && !connection.isNative && (
              <ThemeBadge tone="success" className="text-xs flex items-center gap-1">
                <CheckCircle2 className="w-3 h-3" /> Connected
              </ThemeBadge>
            )}
            {isPaused && (
              <ThemeBadge tone="neutral" className="text-xs flex items-center gap-1">
                <Pause className="w-3 h-3" /> Paused
              </ThemeBadge>
            )}
            {isAuthRequired && (
              <ThemeBadge tone="warning" className="text-xs flex items-center gap-1">
                <AlertTriangle className="w-3 h-3" /> Auth Required
              </ThemeBadge>
            )}
            {connection.status === 'error' && (
              <ThemeBadge tone="danger" className="text-xs flex items-center gap-1">
                <AlertTriangle className="w-3 h-3" /> Error
              </ThemeBadge>
            )}
            {connection.isNative ? (
              <span className="text-[11px] font-medium px-2 py-0.5 rounded bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20">
                Editable
              </span>
            ) : (
              <span className="text-[11px] font-medium px-2 py-0.5 rounded bg-[var(--ff-surface-muted)] text-[var(--ff-text-muted)] border border-[var(--ff-border-color)]">
                Read-Only
              </span>
            )}
          </div>

          {/* Stats Grid */}
          <div className="grid grid-cols-2 gap-2 p-3 rounded-lg bg-[var(--ff-surface-muted)] text-xs mb-4">
            <div>
              <span className="text-[var(--ff-text-muted)] block text-[10px] uppercase font-semibold">Tabs</span>
              <span className="font-semibold text-sm text-[var(--ff-text-primary)] flex items-center gap-1 mt-0.5">
                <Layers className="w-3.5 h-3.5 text-[var(--ff-accent)]" /> {tabCount || connection.tabOrder.length}
              </span>
            </div>
            <div>
              <span className="text-[var(--ff-text-muted)] block text-[10px] uppercase font-semibold">Records</span>
              <span className="font-semibold text-sm text-[var(--ff-text-primary)] flex items-center gap-1 mt-0.5">
                <Database className="w-3.5 h-3.5 text-emerald-500" /> {rowCount.toLocaleString()}
              </span>
            </div>
          </div>
        </div>

        {/* Card Footer Actions */}
        <div className="border-t border-[var(--ff-border-color)] pt-3 flex items-center justify-between gap-2 mt-auto">
          <div className="text-[11px] text-[var(--ff-text-muted)] flex items-center gap-1">
            <Clock className="w-3 h-3" />
            <span>Updated {formatTimestamp(connection.lastSuccessfulPullAt || connection.updatedAt)}</span>
          </div>

          <div className="flex items-center gap-2">
            {!connection.isNative && (
              <ThemeButton
                variant="secondary"
                size="sm"
                onClick={() => onRefresh(connection.id)}
                disabled={isPulling || isPaused}
                title="Pull updates now"
              >
                <RotateCcw className={`w-3.5 h-3.5 ${isPulling ? 'animate-spin' : ''}`} />
              </ThemeButton>
            )}

            <ThemeButton
              variant="primary"
              size="sm"
              onClick={() => onOpen(connection.id)}
              className="flex items-center gap-1.5"
            >
              <span>{connection.isNative ? 'Open Sheet' : 'Open'}</span>
              <ArrowRight className="w-3.5 h-3.5" />
            </ThemeButton>
          </div>
        </div>
      </ThemeCard>

      {/* Delete / Remove Modal */}
      <ThemeModal
        isOpen={deleteModalOpen}
        onClose={() => setDeleteModalOpen(false)}
        title="Remove Spreadsheet Connection"
      >
        <div className="space-y-4 text-sm text-[var(--ff-text-secondary)]">
          <div className="p-3 rounded-xl bg-amber-500/10 border border-amber-500/20 text-amber-500 flex items-start gap-2.5 text-xs">
            <ShieldCheck className="w-4 h-4 shrink-0 mt-0.5" />
            <div>
              <strong className="block font-semibold">Your Google Spreadsheet will NOT be deleted</strong>
              <span>
                Removing this connection only unlinks it from FocusFlow. Your original files on Google Drive remain 100% untouched.
              </span>
            </div>
          </div>

          <p>
            Are you sure you want to disconnect <strong>&ldquo;{connection.title}&rdquo;</strong> from FocusFlow?
          </p>

          <label className="flex items-center gap-2.5 p-3 rounded-lg border border-[var(--ff-border-color)] bg-[var(--ff-surface-muted)] cursor-pointer select-none">
            <input
              type="checkbox"
              checked={purgeCacheOption}
              onChange={(e) => setPurgeCacheOption(e.target.checked)}
              className="rounded accent-[var(--ff-accent)] w-4 h-4"
            />
            <span className="text-xs text-[var(--ff-text-primary)]">
              Also remove local FocusFlow cached records for this spreadsheet
            </span>
          </label>

          <div className="flex items-center justify-end gap-2 pt-3 border-t border-[var(--ff-border-color)]">
            <ThemeButton variant="secondary" onClick={() => setDeleteModalOpen(false)}>
              Cancel
            </ThemeButton>
            <ThemeButton
              variant="danger"
              onClick={() => {
                setDeleteModalOpen(false);
                onRemove(connection.id, purgeCacheOption);
              }}
            >
              Confirm Disconnect
            </ThemeButton>
          </div>
        </div>
      </ThemeModal>
    </>
  );
};
