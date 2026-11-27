import React, { useState } from 'react';
import { Bell, Send, CheckCircle2, AlertCircle, Smartphone, ShieldCheck, ShieldAlert, Laptop } from 'lucide-react';
import { usePushNotifications } from '../../hooks/usePushNotifications.ts';

interface PushNotificationSettingsProps {
  notificationPrefs: Record<string, any>;
  onUpdatePrefs: (updated: Record<string, any>) => void;
}

export const PushNotificationSettings: React.FC<PushNotificationSettingsProps> = ({
  notificationPrefs,
  onUpdatePrefs,
}) => {
  const {
    supported,
    permission,
    isRegistered,
    deviceCount,
    loading,
    error,
    enable,
    disable,
    sendTest,
  } = usePushNotifications();

  const [testSent, setTestSent] = useState<boolean>(false);
  const [localMsg, setLocalMsg] = useState<string | null>(null);

  const handleTogglePush = async () => {
    if (isRegistered) {
      const ok = await disable();
      if (ok) {
        setLocalMsg('Push notifications disabled on this device.');
        setTimeout(() => setLocalMsg(null), 3000);
      }
    } else {
      const ok = await enable();
      if (ok) {
        setLocalMsg('Device registered for push notifications!');
        setTimeout(() => setLocalMsg(null), 3000);
      }
    }
  };

  const handleSendTest = async () => {
    const ok = await sendTest();
    if (ok) {
      setTestSent(true);
      setTimeout(() => setTestSent(false), 4000);
    }
  };

  const toggleCategory = (key: string) => {
    onUpdatePrefs({
      ...notificationPrefs,
      [key]: !notificationPrefs[key],
    });
  };

  return (
    <div className="space-y-4 p-5 rounded-2xl border border-[var(--ff-border-color)] bg-[var(--ff-surface)] shadow-sm">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="p-2.5 rounded-xl bg-indigo-500/10 text-indigo-500">
            <Bell className="w-5 h-5" />
          </div>
          <div>
            <h3 className="font-semibold text-base">Web Push Notifications (FCM)</h3>
            <p className="text-xs text-[var(--ff-text-muted)]">
              Real-time push notifications for task deadlines, bill reminders, and study revisions
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {supported ? (
            permission === 'granted' ? (
              <span className="inline-flex items-center gap-1.5 text-xs px-3 py-1 rounded-full bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 font-medium">
                <ShieldCheck className="w-3.5 h-3.5" /> Permission Granted
              </span>
            ) : permission === 'denied' ? (
              <span className="inline-flex items-center gap-1.5 text-xs px-3 py-1 rounded-full bg-rose-500/15 text-rose-600 dark:text-rose-400 font-medium">
                <ShieldAlert className="w-3.5 h-3.5" /> Blocked in Browser
              </span>
            ) : (
              <span className="text-xs px-3 py-1 rounded-full bg-amber-500/15 text-amber-600 dark:text-amber-400 font-medium">
                Permission Needed
              </span>
            )
          ) : (
            <span className="text-xs px-3 py-1 rounded-full bg-slate-500/15 text-slate-500 font-medium">
              Unsupported Browser
            </span>
          )}
        </div>
      </div>

      {/* Device Registration & Actions */}
      <div className="flex flex-wrap items-center justify-between gap-3 p-3 rounded-xl border border-[var(--ff-border-color)] bg-[var(--ff-surface-subtle)] text-xs">
        <div className="flex items-center gap-2.5">
          <Laptop className="w-4 h-4 text-[var(--ff-text-muted)]" />
          <span>
            {deviceCount > 0 ? (
              <span className="font-medium text-emerald-500">
                {deviceCount} active device{deviceCount > 1 ? 's' : ''} registered for push
              </span>
            ) : (
              <span className="text-[var(--ff-text-muted)]">No devices currently registered for push</span>
            )}
          </span>
        </div>

        <div className="flex items-center gap-2">
          {supported && permission !== 'denied' && (
            <button
              onClick={handleTogglePush}
              disabled={loading}
              className={`px-3 py-1.5 rounded-lg font-medium transition ${
                isRegistered
                  ? 'bg-rose-500/10 text-rose-500 hover:bg-rose-500/20'
                  : 'bg-[var(--ff-accent)] text-white hover:opacity-90'
              }`}
            >
              {loading ? 'Updating...' : isRegistered ? 'Disable on This Device' : 'Enable on This Device'}
            </button>
          )}

          {isRegistered && (
            <button
              onClick={handleSendTest}
              disabled={loading}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg font-medium bg-[var(--ff-surface)] border border-[var(--ff-border-color)] hover:bg-[var(--ff-surface-subtle)] transition"
            >
              <Send className="w-3 h-3" />
              {testSent ? 'Sent!' : 'Send Test Push'}
            </button>
          )}
        </div>
      </div>

      {/* Push Notification Category Toggles */}
      <div className="space-y-2 pt-2">
        <h4 className="text-xs font-semibold text-[var(--ff-text-muted)] uppercase tracking-wider">
          Notification Rules & Channels
        </h4>
        <div className="grid sm:grid-cols-2 gap-2.5">
          {[
            { key: 'taskDeadlines', label: 'Task Deadline Reminders', desc: 'Alerts when tasks approach or pass due dates' },
            { key: 'upcomingBills', label: 'Upcoming Bill Reminders', desc: 'Lead time alerts before payment due dates' },
            { key: 'overdueBills', label: 'Overdue Bill Alerts', desc: 'Urgent notices for past-due recurring expenses' },
            { key: 'focusCompletion', label: 'Pomodoro Completion', desc: 'Audio chime & push when focus session ends' },
            { key: 'dailyFocusGoal', label: 'Daily Focus Goal Milestones', desc: 'Celebrates hitting your daily target minutes' },
            { key: 'budgetWarnings', label: 'Budget Envelope Warnings', desc: 'Alerts when category spending crosses threshold' },
            { key: 'studyReminders', label: 'Study Spaced Repetition', desc: 'Reminders for daily review ladder deadlines' },
            { key: 'syncFailures', label: 'Google Sheets Sync Failures', desc: 'Immediate alert if background sync encounters an error' },
          ].map(({ key, label, desc }) => (
            <label
              key={key}
              className="flex items-start gap-3 p-3 rounded-xl border border-[var(--ff-border-color)] bg-[var(--ff-surface-subtle)] cursor-pointer hover:border-[var(--ff-accent)]/30 transition"
            >
              <input
                type="checkbox"
                checked={notificationPrefs[key] ?? true}
                onChange={() => toggleCategory(key)}
                className="mt-0.5 rounded border-[var(--ff-border-color)]"
              />
              <div className="space-y-0.5">
                <div className="text-xs font-medium">{label}</div>
                <div className="text-[11px] text-[var(--ff-text-muted)] leading-tight">{desc}</div>
              </div>
            </label>
          ))}
        </div>
      </div>

      {error && (
        <div className="flex items-center gap-2 text-xs text-rose-500 bg-rose-500/10 p-3 rounded-xl">
          <AlertCircle className="w-4 h-4 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {localMsg && (
        <div className="flex items-center gap-2 text-xs text-emerald-500 bg-emerald-500/10 p-3 rounded-xl">
          <CheckCircle2 className="w-4 h-4 shrink-0" />
          <span>{localMsg}</span>
        </div>
      )}
    </div>
  );
};

