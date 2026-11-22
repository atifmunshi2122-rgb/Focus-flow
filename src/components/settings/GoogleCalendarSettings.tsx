import React, { useState, useEffect } from 'react';
import { Calendar, RefreshCw, CheckCircle2, AlertCircle, Unlink, ExternalLink, Settings } from 'lucide-react';
import { googleCalendarClient } from '../../lib/googleCalendarService.ts';
import type { GoogleCalendarConnectionStatus, GoogleCalendarListEntry } from '../../types/calendar.ts';

export const GoogleCalendarSettings: React.FC = () => {
  const [status, setStatus] = useState<GoogleCalendarConnectionStatus>({
    connected: false,
    calendarId: 'primary',
    autoSyncTasks: true,
    autoSyncTimeBlocks: true,
    autoSyncStudySchedule: true,
    lastSyncAt: null,
  });
  const [calendars, setCalendars] = useState<GoogleCalendarListEntry[]>([]);
  const [loading, setLoading] = useState<boolean>(false);
  const [syncing, setSyncing] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  const loadStatus = async () => {
    try {
      const s = await googleCalendarClient.getStatus();
      setStatus(s);
      if (s.connected) {
        const cals = await googleCalendarClient.getCalendars();
        setCalendars(cals);
      }
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
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Connection failed';
      setError(msg);
    } finally {
      setLoading(false);
    }
  };

  const handleDisconnect = async () => {
    if (!window.confirm('Are you sure you want to disconnect Google Calendar?')) return;
    setLoading(true);
    try {
      await googleCalendarClient.disconnect();
      await loadStatus();
      setSuccessMsg('Google Calendar disconnected.');
      setTimeout(() => setSuccessMsg(null), 3000);
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
      const res = await googleCalendarClient.syncTasks(status.calendarId);
      await loadStatus();
      setSuccessMsg(`Synced: ${res.synced} created, ${res.updated} updated, ${res.removed} removed.`);
      setTimeout(() => setSuccessMsg(null), 4000);
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
          <div className="p-2.5 rounded-xl bg-[var(--ff-accent-color)]/10 text-[var(--ff-accent-color)]">
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
                onChange={(e) => setStatus((s) => ({ ...s, calendarId: e.target.value }))}
                className="w-full text-xs p-2.5 rounded-lg border border-[var(--ff-border-color)] bg-[var(--ff-surface-subtle)] focus:outline-none focus:ring-1 focus:ring-[var(--ff-accent-color)]"
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
                onChange={(e) => setStatus((s) => ({ ...s, autoSyncTasks: e.target.checked }))}
                className="rounded border-[var(--ff-border-color)]"
              />
              <span className="text-xs font-medium">Sync Tasks</span>
            </label>

            <label className="flex items-center gap-2.5 p-3 rounded-lg border border-[var(--ff-border-color)] bg-[var(--ff-surface-subtle)] cursor-pointer">
              <input
                type="checkbox"
                checked={status.autoSyncTimeBlocks}
                onChange={(e) => setStatus((s) => ({ ...s, autoSyncTimeBlocks: e.target.checked }))}
                className="rounded border-[var(--ff-border-color)]"
              />
              <span className="text-xs font-medium">Sync Time Blocks</span>
            </label>

            <label className="flex items-center gap-2.5 p-3 rounded-lg border border-[var(--ff-border-color)] bg-[var(--ff-surface-subtle)] cursor-pointer">
              <input
                type="checkbox"
                checked={status.autoSyncStudySchedule}
                onChange={(e) => setStatus((s) => ({ ...s, autoSyncStudySchedule: e.target.checked }))}
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
              className="inline-flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-medium bg-[var(--ff-accent-color)] text-white hover:opacity-90 disabled:opacity-50 transition"
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
            className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl text-xs font-medium bg-[var(--ff-accent-color)] text-white hover:opacity-90 disabled:opacity-50 transition"
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

