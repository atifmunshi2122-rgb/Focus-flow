import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Calendar, RefreshCw, CheckCircle2, AlertCircle, Unlink, ExternalLink, Settings } from 'lucide-react';
import { useApp } from '../../context/AppContext.tsx';
import { googleCalendarClient } from '../../lib/googleCalendarService.ts';
import type { GoogleCalendarConnectionStatus, GoogleCalendarListEntry } from '../../types/calendar.ts';

export const GoogleCalendarSettings: React.FC = () => {
  const { user, confirmAction } = useApp();
  const prefsKey = `focusflow_gcal_prefs_${user?.id || 'usr_guest'}`;
  const [status, setStatus] = useState<GoogleCalendarConnectionStatus>(() => {
    try {
      const raw = localStorage.getItem(prefsKey);
      if (raw) {
        const parsed = JSON.parse(raw);
        return {
          connected: false,
          calendarId: parsed.calendarId || 'primary',
          autoSyncTasks: parsed.autoSyncTasks ?? true,
          autoSyncTimeBlocks: parsed.autoSyncTimeBlocks ?? true,
          autoSyncStudySchedule: parsed.autoSyncStudySchedule ?? true,
          lastSyncAt: null,
        };
      }
    } catch {
      // ignore
    }
    return {
      connected: false,
      calendarId: 'primary',
      autoSyncTasks: true,
      autoSyncTimeBlocks: true,
      autoSyncStudySchedule: true,
      lastSyncAt: null,
    };
  });
  const [calendars, setCalendars] = useState<GoogleCalendarListEntry[]>([]);
  const [loading, setLoading] = useState<boolean>(false);
  const [syncing, setSyncing] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);
  const successTimerRef = useRef<number | null>(null);

  const showTransientSuccess = useCallback((msg: string, ms = 4000) => {
    setSuccessMsg(msg);
    if (successTimerRef.current !== null) {
      window.clearTimeout(successTimerRef.current);
    }
    successTimerRef.current = window.setTimeout(() => {
      setSuccessMsg(null);
      successTimerRef.current = null;
    }, ms);
  }, []);

  useEffect(() => {
    return () => {
      if (successTimerRef.current !== null) {
        window.clearTimeout(successTimerRef.current);
      }
    };
  }, []);

  const persistPrefs = (next: Partial<GoogleCalendarConnectionStatus>) => {
    setStatus((prev) => {
      const merged = { ...prev, ...next };
      try {
        localStorage.setItem(
          prefsKey,
          JSON.stringify({
            calendarId: merged.calendarId,
            autoSyncTasks: merged.autoSyncTasks,
            autoSyncTimeBlocks: merged.autoSyncTimeBlocks,
            autoSyncStudySchedule: merged.autoSyncStudySchedule,
          })
        );
      } catch {
        // ignore
      }
      return merged;
    });
  };

  const loadStatus = useCallback(async () => {
    try {
      const s = await googleCalendarClient.getStatus();
      let savedPrefs: Partial<GoogleCalendarConnectionStatus> = {};
      try {
        const raw = localStorage.getItem(prefsKey);
        if (raw) savedPrefs = JSON.parse(raw);
      } catch {
        // ignore
      }
      setStatus({
        ...s,
        calendarId: savedPrefs.calendarId || s.calendarId || 'primary',
        autoSyncTasks: savedPrefs.autoSyncTasks ?? s.autoSyncTasks,
        autoSyncTimeBlocks: savedPrefs.autoSyncTimeBlocks ?? s.autoSyncTimeBlocks,
        autoSyncStudySchedule: savedPrefs.autoSyncStudySchedule ?? s.autoSyncStudySchedule,
      });
      if (s.connected) {
        const cals = await googleCalendarClient.getCalendars();
        setCalendars(cals);
      } else {
        setCalendars([]);
      }
    } catch {
      // Ignore
    }
  }, [prefsKey]);

  useEffect(() => {
    void loadStatus();
  }, [loadStatus]);

  const handleConnect = async () => {
    setLoading(true);
    setError(null);
    try {
      await googleCalendarClient.connectCalendar();
      await loadStatus();
      showTransientSuccess('Google Calendar connected successfully!', 4000);
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Connection failed';
      setError(msg);
    } finally {
      setLoading(false);
    }
  };

  const handleDisconnect = async () => {
    const confirmed = await confirmAction({
      title: 'Disconnect Google Calendar?',
      message: 'Are you sure you want to disconnect Google Calendar?',
      confirmLabel: 'Disconnect',
      cancelLabel: 'Keep Connected',
      tone: 'danger',
    });
    if (!confirmed) return;
    setLoading(true);
    try {
      await googleCalendarClient.disconnect();
      await loadStatus();
      showTransientSuccess('Google Calendar disconnected.', 3000);
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Disconnection failed';
      setError(msg);
    } finally {
      setLoading(false);
    }
  };

  const handleSyncNow = async () => {
    setSyncing(true);
    setError(null);
    try {
      const res = await googleCalendarClient.syncTasks(status.calendarId, {
        autoSyncTasks: status.autoSyncTasks,
        autoSyncTimeBlocks: status.autoSyncTimeBlocks,
        autoSyncStudySchedule: status.autoSyncStudySchedule,
      });
      await loadStatus();
      showTransientSuccess(`Synced: ${res.synced} created, ${res.updated} updated, ${res.removed} removed.`, 4000);
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Sync failed';
      setError(msg);
      if (msg.toLowerCase().includes('expired') || msg.toLowerCase().includes('revoked') || msg.toLowerCase().includes('reauthorize')) {
        setStatus((prev) => ({ ...prev, connected: false, revoked: true }));
      }
    } finally {
      setSyncing(false);
    }
  };

  return (
    <div className="space-y-4 p-5 rounded-2xl border border-[var(--ff-border-color)] bg-[var(--ff-surface)] shadow-sm">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="p-2.5 rounded-xl bg-[var(--ff-accent)]/10 text-[var(--ff-accent)]">
            <Calendar className="w-5 h-5" />
          </div>
          <div>
            <h3 className="font-semibold text-base">Google Calendar Integration</h3>
            <p className="text-xs text-[var(--ff-text-muted)]">
              Two-way synchronization of FocusFlow tasks, time blocks, and study deadlines
            </p>
          </div>
        </div>

        {status.connected ? (
          <span className="inline-flex items-center gap-1.5 text-xs px-3 py-1 rounded-full bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 font-medium">
            <CheckCircle2 className="w-3.5 h-3.5" /> Connected
          </span>
        ) : status.revoked ? (
          <span className="inline-flex items-center gap-1.5 text-xs px-3 py-1 rounded-full bg-amber-500/15 text-amber-600 dark:text-amber-400 font-medium">
            <AlertCircle className="w-3.5 h-3.5" /> Reauthorization Required
          </span>
        ) : (
          <span className="text-xs px-3 py-1 rounded-full bg-slate-500/15 text-slate-500 font-medium">
            Not Connected
          </span>
        )}
      </div>

      {status.revoked && (
        <div className="flex items-start gap-3 p-3.5 rounded-xl border border-amber-500/30 bg-amber-500/10 text-amber-900 dark:text-amber-200 text-xs">
          <AlertCircle className="w-4 h-4 mt-0.5 flex-shrink-0 text-amber-600 dark:text-amber-400" />
          <div className="flex-1">
            <p className="font-semibold text-amber-900 dark:text-amber-100">
              Google Calendar Authorization Expired or Revoked
            </p>
            <p className="mt-0.5 text-amber-700 dark:text-amber-300">
              Google has expired or revoked access for this application. Please reconnect and reauthorize FocusFlow to resume automatic task and deadline synchronization.
            </p>
            <button
              onClick={handleConnect}
              disabled={loading}
              className="mt-2.5 inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-amber-600 hover:bg-amber-700 text-white font-medium text-xs transition disabled:opacity-50"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
              {loading ? 'Opening Google Auth...' : 'Reauthorize Google Calendar'}
            </button>
          </div>
        </div>
      )}

      {status.connected ? (
        <div className="space-y-4 pt-2">
          {/* Target Calendar Selector */}
          <div className="grid sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-medium text-[var(--ff-text-muted)] mb-1">
                Target Google Calendar
              </label>
              <select
                value={status.calendarId}
                onChange={(e) => persistPrefs({ calendarId: e.target.value })}
                className="w-full text-xs p-2.5 rounded-lg border border-[var(--ff-border-color)] bg-[var(--ff-surface-subtle)] focus:outline-none focus:ring-1 focus:ring-[var(--ff-accent)]"
              >
                <option value="primary">Primary Calendar</option>
                {calendars
                  .filter((c) => c.id !== 'primary')
                  .map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.summary}
                    </option>
                  ))}
              </select>
            </div>

            <div>
              <label className="block text-xs font-medium text-[var(--ff-text-muted)] mb-1">
                Last Synchronized
              </label>
              <div className="text-xs p-2.5 rounded-lg border border-[var(--ff-border-color)] bg-[var(--ff-surface-subtle)] text-[var(--ff-text-muted)]">
                {status.lastSyncAt ? new Date(status.lastSyncAt).toLocaleString() : 'Never synced'}
              </div>
            </div>
          </div>

          {/* Sync Preferences Toggles */}
          <div className="grid sm:grid-cols-3 gap-3 pt-1">
            <label className="flex items-center gap-2.5 p-3 rounded-lg border border-[var(--ff-border-color)] bg-[var(--ff-surface-subtle)] cursor-pointer">
              <input
                type="checkbox"
                checked={status.autoSyncTasks}
                onChange={(e) => persistPrefs({ autoSyncTasks: e.target.checked })}
                className="rounded border-[var(--ff-border-color)]"
              />
              <span className="text-xs font-medium">Sync Tasks</span>
            </label>

            <label className="flex items-center gap-2.5 p-3 rounded-lg border border-[var(--ff-border-color)] bg-[var(--ff-surface-subtle)] cursor-pointer">
              <input
                type="checkbox"
                checked={status.autoSyncTimeBlocks}
                onChange={(e) => persistPrefs({ autoSyncTimeBlocks: e.target.checked })}
                className="rounded border-[var(--ff-border-color)]"
              />
              <span className="text-xs font-medium">Sync Time Blocks</span>
            </label>

            <label className="flex items-center gap-2.5 p-3 rounded-lg border border-[var(--ff-border-color)] bg-[var(--ff-surface-subtle)] cursor-pointer">
              <input
                type="checkbox"
                checked={status.autoSyncStudySchedule}
                onChange={(e) => persistPrefs({ autoSyncStudySchedule: e.target.checked })}
                className="rounded border-[var(--ff-border-color)]"
              />
              <span className="text-xs font-medium">Sync Study Deadlines</span>
            </label>
          </div>

          {/* Actions */}
          <div className="flex items-center justify-between pt-2 border-t border-[var(--ff-border-color)]">
            <button
              onClick={handleSyncNow}
              disabled={syncing}
              className="inline-flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-medium bg-[var(--ff-accent)] text-white hover:opacity-90 disabled:opacity-50 transition"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${syncing ? 'animate-spin' : ''}`} />
              {syncing ? 'Syncing...' : 'Sync Tasks to Calendar'}
            </button>

            <button
              onClick={handleDisconnect}
              disabled={loading}
              className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-medium text-rose-500 hover:bg-rose-500/10 transition"
            >
              <Unlink className="w-3.5 h-3.5" /> Disconnect
            </button>
          </div>
        </div>
      ) : (
        <div className="pt-2">
          <p className="text-xs text-[var(--ff-text-muted)] mb-4">
            Connect your Google account with offline access to sync scheduled tasks and deadlines to Google Calendar automatically.
          </p>
          <button
            onClick={handleConnect}
            disabled={loading}
            className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl text-xs font-medium bg-[var(--ff-accent)] text-white hover:opacity-90 disabled:opacity-50 transition"
          >
            <ExternalLink className="w-4 h-4" />
            {loading ? 'Opening Google Auth...' : 'Connect Google Calendar'}
          </button>
        </div>
      )}

      {error && (
        <div className="flex items-center gap-2 text-xs text-rose-500 bg-rose-500/10 p-3 rounded-xl mt-2">
          <AlertCircle className="w-4 h-4 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {successMsg && (
        <div className="flex items-center gap-2 text-xs text-emerald-500 bg-emerald-500/10 p-3 rounded-xl mt-2">
          <CheckCircle2 className="w-4 h-4 shrink-0" />
          <span>{successMsg}</span>
        </div>
      )}
    </div>
  );
};

