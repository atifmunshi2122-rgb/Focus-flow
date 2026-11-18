import React from 'react';
import {
  CheckCircle2,
  AlertTriangle,
  RotateCcw,
  Clock,
  ShieldCheck,
  PauseCircle,
  Database,
  Lock,
} from 'lucide-react';
import type { SheetConnection, SheetSyncStatus } from '../../types/sheetHub.ts';
import { ThemeButton, ThemeBadge } from '../ui/ThemePrimitives.tsx';

interface SheetSyncStatusPanelProps {
  connection: SheetConnection;
  isPulling?: boolean;
  onPull?: () => void;
  onReconnect?: () => void;
  className?: string;
}

export const SheetSyncStatusPanel: React.FC<SheetSyncStatusPanelProps> = ({
  connection,
  isPulling = false,
  onPull,
  onReconnect,
  className = '',
}) => {
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
            <span>Import Error</span>
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

        <div className="flex items-center gap-1.5 text-xs text-[var(--ff-text-muted)]">
          <Clock className="w-3.5 h-3.5 text-[var(--ff-text-muted)]" />
          <span>Last pulled: {formatTimestamp(connection.lastSuccessfulPullAt || connection.lastSyncedAt)}</span>
        </div>

        <div className="hidden sm:flex items-center gap-1.5 text-xs font-medium px-2 py-0.5 rounded-md bg-[var(--ff-surface-muted)] text-[var(--ff-text-secondary)] border border-[var(--ff-border-color)]">
          <Lock className="w-3 h-3 text-[var(--ff-accent)]" />
          <span>Sheet → FocusFlow (Read-Only)</span>
        </div>
      </div>

      <div className="flex items-center gap-2 ml-auto">
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
            disabled={isPulling || connection.status === 'paused'}
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
