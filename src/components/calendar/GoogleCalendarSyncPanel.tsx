import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Calendar, RefreshCw, CheckCircle2, AlertCircle, Unlink, ExternalLink } from 'lucide-react';
import { useApp } from '../../context/AppContext.tsx';
import { googleCalendarClient } from '../../lib/googleCalendarService.ts';
import type { GoogleCalendarConnectionStatus } from '../../types/calendar.ts';

const DEFAULT_GCAL_STATUS: GoogleCalendarConnectionStatus = {
  connected: false,
  calendarId: 'primary',
  autoSyncTasks: false,
  autoSyncTimeBlocks: false,
  autoSyncStudySchedule: false,
  lastSyncAt: null,
};

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
  const { user, confirmAction } = useApp();
  const [status, setStatus] = useState<GoogleCalendarConnectionStatus>(DEFAULT_GCAL_STATUS);
  const [loading, setLoading] = useState<boolean>(false);
  const [syncing, setSyncing] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);
  const successTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const showTransientSuccess = useCallback((msg: string, ms = 4000) => {
    setSuccessMsg(msg);
    if (successTimerRef.current) clearTimeout(successTimerRef.current);
    successTimerRef.current = setTimeout(() => {
      setSuccessMsg(null);
      successTimerRef.current = null;
    }, ms);
  }, []);

  useEffect(() => {
    return () => {
      if (successTimerRef.current) clearTimeout(successTimerRef.current);
    };
  }, []);

  const loadStatus = useCallback(async () => {
    try {
      const s = await googleCalendarClient.getStatus();
      setStatus(s);
    } catch {
      // Ignore
    }
  }, []);

  useEffect(() => {
    setStatus(DEFAULT_GCAL_STATUS);
    setError(null);
    setSuccessMsg(null);
    void loadStatus();
  }, [user?.id, loadStatus]);

  const handleConnect = async () => {
    setLoading(true);
    setError(null);
    try {
      await googleCalendarClient.connectCalendar();
      await loadStatus();
      showTransientSuccess('Google Calendar connected successfully!', 4000);
      if (onSyncComplete) onSyncComplete();
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Failed to connect Google Calendar';
      setError(msg);
    } finally {
      setLoading(false);
    }
  };

  const handleDisconnect = async () => {
    const confirmed = await confirmAction({
      title: 'Disconnect Google Calendar?',
      message: 'FocusFlow events already synced to Google Calendar will remain.',
      confirmLabel: 'Disconnect',
      tone: 'danger',
    });
    if (!confirmed) return;
    setLoading(true);
    try {
      await googleCalendarClient.disconnect();
      await loadStatus();
      showTransientSuccess('Google Calendar disconnected.', 3000);
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
      let savedPrefs: Partial<GoogleCalendarConnectionStatus> = {};
      try {
        const raw = localStorage.getItem(`ff_gcal_prefs_${user?.id || 'guest'}`);
        if (raw) savedPrefs = JSON.parse(raw) as Partial<GoogleCalendarConnectionStatus>;
      } catch {
        // ignore storage parse errors
      }
      const targetCalendarId = savedPrefs.calendarId || status.calendarId || 'primary';
      const res = await googleCalendarClient.syncTasks(targetCalendarId, {
        autoSyncTasks: savedPrefs.autoSyncTasks ?? status.autoSyncTasks,
        autoSyncTimeBlocks: savedPrefs.autoSyncTimeBlocks ?? status.autoSyncTimeBlocks,
        autoSyncStudySchedule: savedPrefs.autoSyncStudySchedule ?? status.autoSyncStudySchedule,
      });
      await loadStatus();
      showTransientSuccess(`Synced: ${res.synced} created, ${res.updated} updated.`, 4000);
      if (onSyncComplete) onSyncComplete();
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Failed to sync tasks';
      setError(msg);
      if (msg.toLowerCase().includes('expired') || msg.toLowerCase().includes('revoked') || msg.toLowerCase().includes('reauthorize')) {
        setStatus((prev) => ({ ...prev, connected: false, revoked: true }));
      }
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
            ) : status.revoked ? (
              <span className="inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full bg-amber-500/15 text-amber-600 dark:text-amber-400 font-medium">
                <AlertCircle className="w-3 h-3" /> Reauthorization Required
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
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-[var(--ff-accent)] text-white hover:opacity-90 disabled:opacity-50 transition"
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
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-[var(--ff-accent)] text-white hover:opacity-90 disabled:opacity-50 transition"
          >
            <ExternalLink className="w-3.5 h-3.5" />
            {loading ? 'Connecting...' : status.revoked ? 'Reauthorize Calendar' : 'Connect Calendar'}
          </button>
        )}
      </div>

      {status.revoked && (
        <div className="w-full flex items-center justify-between gap-2 text-xs text-amber-800 dark:text-amber-200 bg-amber-500/10 border border-amber-500/20 p-2.5 rounded-lg mt-1">
          <div className="flex items-center gap-1.5">
            <AlertCircle className="w-3.5 h-3.5 text-amber-600 dark:text-amber-400 shrink-0" />
            <span>Google authorization expired or revoked. Please reauthorize to resume syncing.</span>
          </div>
          <button
            onClick={handleConnect}
            disabled={loading}
            className="px-2.5 py-1 rounded bg-amber-600 hover:bg-amber-700 text-white font-medium text-[11px] shrink-0 transition disabled:opacity-50"
          >
            Reauthorize
          </button>
        </div>
      )}

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

