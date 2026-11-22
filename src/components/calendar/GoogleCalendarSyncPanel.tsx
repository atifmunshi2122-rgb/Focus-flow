import React, { useState, useEffect } from 'react';
import { Calendar, RefreshCw, CheckCircle2, AlertCircle, Unlink, ExternalLink } from 'lucide-react';
import { googleCalendarClient } from '../../lib/googleCalendarService.ts';
import type { GoogleCalendarConnectionStatus } from '../../types/calendar.ts';

interface GoogleCalendarSyncPanelProps {
  onSyncComplete?: () => void;
  showEventsToggle?: boolean;
  showEvents?: boolean;
  onToggleShowEvents?: (val: boolean) => void;
}

export const GoogleCalendarSyncPanel: React.FC<GoogleCalendarSyncPanelProps> = ({
  onSyncComplete,
  showEventsToggle,
  showEvents = true,
  onToggleShowEvents,
}) => {
  const [status, setStatus] = useState<GoogleCalendarConnectionStatus>({
    connected: false,
    calendarId: 'primary',
    autoSyncTasks: false,
    autoSyncTimeBlocks: false,
    autoSyncStudySchedule: false,
    lastSyncAt: null,
  });
  const [loading, setLoading] = useState<boolean>(false);
  const [syncing, setSyncing] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  const loadStatus = async () => {
    try {
      const s = await googleCalendarClient.getStatus();
      setStatus(s);
    } catch {
      // Ignore
    }
  };

  useEffect(() => {
    loadStatus();
  }, []);

  const handleConnect = async () => {
    setLoading(true);
    setError(null);
    try {
      await googleCalendarClient.connectCalendar();
      await loadStatus();
      setSuccessMsg('Google Calendar connected successfully!');
      setTimeout(() => setSuccessMsg(null), 4000);
      if (onSyncComplete) onSyncComplete();
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Failed to connect Google Calendar';
      setError(msg);
    } finally {
      setLoading(false);
    }
  };

  const handleDisconnect = async () => {
    if (!window.confirm('Disconnect Google Calendar? FocusFlow events already synced to Google Calendar will remain.')) {
      return;
    }
    setLoading(true);
    try {
      await googleCalendarClient.disconnect();
      await loadStatus();
      setSuccessMsg('Google Calendar disconnected.');
      setTimeout(() => setSuccessMsg(null), 3000);
      if (onSyncComplete) onSyncComplete();
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Failed to disconnect';
      setError(msg);
    } finally {
      setLoading(false);
    }
  };

  const handleSyncNow = async () => {
    setSyncing(true);
    setError(null);
    try {
      const res = await googleCalendarClient.syncTasks();
      await loadStatus();
      setSuccessMsg(`Synced: ${res.synced} created, ${res.updated} updated.`);
      setTimeout(() => setSuccessMsg(null), 4000);
      if (onSyncComplete) onSyncComplete();
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Failed to sync tasks';
      setError(msg);
    } finally {
      setSyncing(false);
    }
  };

  return (
    <div className="flex flex-wrap items-center justify-between gap-3 p-3 rounded-xl border border-[var(--ff-border-color)] bg-[var(--ff-surface-subtle)] text-sm">
      <div className="flex items-center gap-2.5">
        <div className={`p-2 rounded-lg ${status.connected ? 'bg-emerald-500/10 text-emerald-500' : 'bg-slate-500/10 text-slate-500'}`}>
          <Calendar className="w-4 h-4" />
        </div>
        <div>
          <div className="flex items-center gap-2 font-medium">
            <span>Google Calendar</span>
            {status.connected ? (
              <span className="inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 font-medium">
                <CheckCircle2 className="w-3 h-3" /> Connected
              </span>
            ) : (
              <span className="text-xs px-2 py-0.5 rounded-full bg-slate-500/15 text-slate-500">
                Not Connected
              </span>
            )}
          </div>
          {status.connected && status.lastSyncAt && (
            <p className="text-xs text-[var(--ff-text-muted)] mt-0.5">
              Last synced: {new Date(status.lastSyncAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
            </p>
          )}
        </div>
      </div>

      <div className="flex items-center gap-2">
        {showEventsToggle && status.connected && onToggleShowEvents && (
          <label className="flex items-center gap-1.5 text-xs cursor-pointer select-none px-2 py-1 rounded bg-[var(--ff-surface)] border border-[var(--ff-border-color)]">
            <input
              type="checkbox"
              checked={showEvents}
              onChange={(e) => onToggleShowEvents(e.target.checked)}
              className="rounded border-[var(--ff-border-color)]"
            />
            Show in Grid
          </label>
        )}

        {status.connected ? (
          <>
            <button
              onClick={handleSyncNow}
              disabled={syncing}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-[var(--ff-accent-color)] text-white hover:opacity-90 disabled:opacity-50 transition"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${syncing ? 'animate-spin' : ''}`} />
              {syncing ? 'Syncing...' : 'Sync Tasks'}
            </button>
            <button
              onClick={handleDisconnect}
              disabled={loading}
              title="Disconnect Google Calendar"
              className="p-1.5 rounded-lg text-xs text-rose-500 hover:bg-rose-500/10 transition"
            >
              <Unlink className="w-3.5 h-3.5" />
            </button>
          </>
        ) : (
          <button
            onClick={handleConnect}
            disabled={loading}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-[var(--ff-accent-color)] text-white hover:opacity-90 disabled:opacity-50 transition"
          >
            <ExternalLink className="w-3.5 h-3.5" />
            {loading ? 'Connecting...' : 'Connect Calendar'}
          </button>
        )}
      </div>

      {error && (
        <div className="w-full flex items-center gap-1.5 text-xs text-rose-500 bg-rose-500/10 p-2 rounded-lg mt-1">
          <AlertCircle className="w-3.5 h-3.5 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {successMsg && (
        <div className="w-full flex items-center gap-1.5 text-xs text-emerald-500 bg-emerald-500/10 p-2 rounded-lg mt-1">
          <CheckCircle2 className="w-3.5 h-3.5 shrink-0" />
          <span>{successMsg}</span>
        </div>
      )}
    </div>
  );
};

