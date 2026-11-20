import React from 'react';
import {
  CheckCircle2,
  AlertTriangle,
  RotateCcw,
  Clock,
  ShieldCheck,
  PauseCircle,
  ArrowLeftRight,
  CloudUpload,
  Lock,
  FolderSync,
} from 'lucide-react';
import type { SheetConnection, SheetSyncStatus } from '../../types/sheetHub.ts';
import { ThemeButton, ThemeBadge } from '../ui/ThemePrimitives.tsx';

interface SheetSyncStatusPanelProps {
  connection: SheetConnection;
  isPulling?: boolean;
  isPushing?: boolean;
  pendingCount?: number;
  isDemoSheet?: boolean;
  onPull?: () => void;
  onPushPending?: () => void;
  onToggleSyncMode?: () => void;
  onReconnect?: () => void;
  className?: string;
}

export const SheetSyncStatusPanel: React.FC<SheetSyncStatusPanelProps> = ({
  connection,
  isPulling = false,
  isPushing = false,
  pendingCount = 0,
  isDemoSheet = false,
  onPull,
  onPushPending,
  onToggleSyncMode,
  onReconnect,
  className = '',
}) => {
  const isManualBatchMode = connection.syncMode === 'manual_only';

  const getStatusBadge = (status: SheetSyncStatus) => {
    switch (status) {
      case 'active':
        return (
          <ThemeBadge tone="success" className="flex items-center gap-1.5 font-medium px-2.5 py-1">
            <CheckCircle2 className="w-3.5 h-3.5" />
            <span>Connected</span>
          </ThemeBadge>
        );
      case 'paused':
        return (
          <ThemeBadge tone="neutral" className="flex items-center gap-1.5 font-medium px-2.5 py-1">
            <PauseCircle className="w-3.5 h-3.5" />
            <span>Sync Paused</span>
          </ThemeBadge>
        );
      case 'auth_required':
        return (
          <ThemeBadge tone="warning" className="flex items-center gap-1.5 font-medium px-2.5 py-1">
            <AlertTriangle className="w-3.5 h-3.5" />
            <span>Auth Required</span>
          </ThemeBadge>
        );
      case 'error':
      default:
        return (
          <ThemeBadge tone="danger" className="flex items-center gap-1.5 font-medium px-2.5 py-1">
            <AlertTriangle className="w-3.5 h-3.5" />
            <span>Sync Error</span>
          </ThemeBadge>
        );
    }
  };

  const formatTimestamp = (iso: string | null | undefined) => {
    if (!iso) return 'Never';
    try {
      const d = new Date(iso);
      return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) + ' on ' + d.toLocaleDateString();
    } catch {
      return iso;
    }
  };

  return (
    <div
      className={`flex flex-wrap items-center justify-between gap-3 p-3 rounded-xl border bg-[var(--ff-surface)] border-[var(--ff-border-color)] ${className}`}
    >
      <div className="flex flex-wrap items-center gap-2.5 min-w-0">
        {getStatusBadge(connection.status)}

        {connection.isDualCopy && (
          <div className="flex items-center gap-1.5 text-xs font-semibold px-2.5 py-1 rounded-md bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/30">
            <FolderSync className="w-3.5 h-3.5" />
            <span>Dual-Copy Active</span>
          </div>
        )}

        <div className="flex items-center gap-1.5 text-xs text-[var(--ff-text-muted)]">
          <Clock className="w-3.5 h-3.5 text-[var(--ff-text-muted)]" />
          <span>Last pulled: {formatTimestamp(connection.lastSuccessfulPullAt || connection.lastSyncedAt)}</span>
        </div>

        {connection.lastDriveSyncAt && (
          <div className="hidden lg:flex items-center gap-1.5 text-xs text-emerald-600 dark:text-emerald-400 font-medium">
            <Clock className="w-3.5 h-3.5" />
            <span>Drive Synced: {formatTimestamp(connection.lastDriveSyncAt)}</span>
          </div>
        )}

        {connection.lastSuccessfulPushAt && !isDemoSheet && (
          <div className="hidden md:flex items-center gap-1.5 text-xs text-emerald-500">
            <CloudUpload className="w-3.5 h-3.5" />
            <span>Last pushed: {formatTimestamp(connection.lastSuccessfulPushAt)}</span>
          </div>
        )}

        {isDemoSheet ? (
          <div className="hidden sm:flex items-center gap-1.5 text-xs font-medium px-2 py-0.5 rounded-md bg-[var(--ff-surface-muted)] text-[var(--ff-text-secondary)] border border-[var(--ff-border-color)]">
            <Lock className="w-3 h-3 text-[var(--ff-accent)]" />
            <span>Demo Sheet (Local Only)</span>
          </div>
        ) : onToggleSyncMode ? (
          <button
            type="button"
            onClick={onToggleSyncMode}
            className={`flex items-center gap-1.5 text-xs font-medium px-2.5 py-1 rounded-md border transition-colors cursor-pointer ${
              connection.syncMode === 'sheet_to_app'
                ? 'bg-blue-500/10 text-blue-500 border-blue-500/30 hover:bg-blue-500/20'
                : isManualBatchMode
                ? 'bg-amber-500/10 text-amber-500 border-amber-500/30 hover:bg-amber-500/20'
                : 'bg-emerald-500/10 text-emerald-500 border-emerald-500/30 hover:bg-emerald-500/20'
            }`}
            title={
              connection.syncMode === 'sheet_to_app'
                ? 'Read-Only Mode: Pulls changes from Google Sheet. Click to configure edit sync.'
                : isManualBatchMode
                ? 'Batch Mode: Mark items locally, then click Push Changes. Click to switch to Instant Two-Way Sync.'
                : 'Two-Way Sync: Marking/unmarking a checkbox syncs immediately to Google Sheet (with confirmation). Click to switch to Batch Mode.'
            }
          >
            <ArrowLeftRight className="w-3 h-3" />
            <span>
              {connection.syncMode === 'sheet_to_app'
                ? 'Read-Only (Sheet → App)'
                : isManualBatchMode
                ? 'Batch Push (Local → Sheet)'
                : 'Two-Way Sync (App ↔ Sheet)'}
            </span>
          </button>
        ) : (
          <div
            className={`hidden sm:flex items-center gap-1.5 text-xs font-medium px-2 py-0.5 rounded-md border ${
              connection.syncMode === 'sheet_to_app'
                ? 'bg-blue-500/10 text-blue-500 border-blue-500/25'
                : isManualBatchMode
                ? 'bg-amber-500/10 text-amber-500 border-amber-500/25'
                : 'bg-emerald-500/10 text-emerald-500 border-emerald-500/25'
            }`}
          >
            <ArrowLeftRight className="w-3 h-3" />
            <span>
              {connection.syncMode === 'sheet_to_app'
                ? 'Read-Only (Sheet → App)'
                : isManualBatchMode
                ? 'Batch Push (Local → Sheet)'
                : 'Two-Way Sync (App ↔ Sheet)'}
            </span>
          </div>
        )}
      </div>

      <div className="flex flex-wrap items-center gap-2 ml-auto">
        {!isDemoSheet && pendingCount > 0 && onPushPending && (
          <ThemeButton
            variant="primary"
            size="sm"
            onClick={onPushPending}
            disabled={isPushing || isPulling || connection.status === 'paused'}
            className="flex items-center gap-1.5"
            title="Push all local mark/unmark changes to Google Sheets"
          >
            <CloudUpload className={`w-3.5 h-3.5 ${isPushing ? 'animate-pulse' : ''}`} />
            <span>
              {isPushing
                ? 'Pushing...'
                : `Push ${pendingCount} ${pendingCount === 1 ? 'Change' : 'Changes'} to Sheet`}
            </span>
          </ThemeButton>
        )}

        {connection.status === 'auth_required' && onReconnect && (
          <ThemeButton variant="secondary" size="sm" onClick={onReconnect}>
            <ShieldCheck className="w-3.5 h-3.5 text-[var(--ff-accent)]" />
            <span>Reconnect Google</span>
          </ThemeButton>
        )}

        {onPull && (
          <ThemeButton
            variant="secondary"
            size="sm"
            onClick={onPull}
            disabled={isPulling || isPushing || connection.status === 'paused'}
            className="flex items-center gap-1.5"
            title="Pull latest changes from Google Spreadsheet"
          >
            <RotateCcw className={`w-3.5 h-3.5 ${isPulling ? 'animate-spin' : ''}`} />
            <span>{isPulling ? 'Pulling...' : 'Pull Updates'}</span>
          </ThemeButton>
        )}
      </div>

      {connection.lastError && (
        <div className="w-full text-xs text-rose-500 bg-rose-500/10 border border-rose-500/20 px-3 py-2 rounded-lg flex items-center gap-2">
          <AlertTriangle className="w-4 h-4 shrink-0" />
          <span className="truncate">{connection.lastError}</span>
        </div>
      )}
    </div>
  );
};
