import React, { useEffect, useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { useApp } from '../../context/AppContext.tsx';
import { api } from '../../lib/api.ts';
import { CurrencyCode, NotificationPreferences } from '../../types/index.ts';
import { ThemeStudio } from './ThemeStudio.tsx';
import {
  ThemeBadge,
  ThemeButton,
  ThemeCard,
  ThemeInput,
  ThemeSegmentedControl,
  ThemeSelect,
} from '../ui/ThemePrimitives.tsx';
import { useMotionPreferences } from '../ui/MotionPrimitives.tsx';
import { MOTION_DURATION, MOTION_EASING, getIntensityFactor } from '../../theme/motionTokens.ts';
import {
  Bell,
  DollarSign,
  Download,
  ExternalLink,
  FileSpreadsheet,
  Keyboard,
  Moon,
  Palette,
  RefreshCw,
  RotateCcw,
  ShieldCheck,
  Sliders,
  Sun,
  Target,
  Trash2,
  User,
} from 'lucide-react';

export const SettingsView: React.FC = () => {
  const {
    user,
    settings,
    updateSettings,
    theme,
    toggleTheme,
    reseedData,
    clearAllData,
    firebaseUser,
    isAuthenticated,
    signInWithGoogle,
    signOutGoogle,
    googleSpreadsheetId,
    syncStatus,
    lastSyncedAt,
    createOrConnectSpreadsheet,
    syncNowToGoogleSheets,
    setTrashModalOpen,
    showToast,
  } = useApp();

  const [activeSection, setActiveSection] = useState<'studio' | 'system'>('studio');

  const [currency, setCurrency] = useState<CurrencyCode>(settings?.currency || 'INR');
  const [workDuration, setWorkDuration] = useState(String(settings?.pomodoroWorkDuration || 25));
  const [shortBreak, setShortBreak] = useState(String(settings?.shortBreakDuration || 5));
  const [longBreak, setLongBreak] = useState(String(settings?.longBreakDuration || 15));
  const [dailyGoalMin, setDailyGoalMin] = useState(String(settings?.dailyFocusGoalMinutes || 100));
  const [weeklyGoalMin, setWeeklyGoalMin] = useState(String(settings?.weeklyFocusGoalMinutes || 500));
  const [shortcutsEnabled, setShortcutsEnabled] = useState(settings?.keyboardShortcutsEnabled ?? true);
  const [notifPrefs, setNotifPrefs] = useState<NotificationPreferences>(
    settings?.notificationPrefs || {
      enabled: true,
      taskDeadlines: true,
      upcomingBills: true,
      billLeadDays: 3,
      overdueBills: true,
      focusCompletion: true,
      dailyFocusGoal: true,
      budgetWarnings: true,
      budgetWarningPercent: 80,
      syncFailures: true,
    }
  );
  const [autoSwitch, setAutoSwitch] = useState(settings?.autoSwitchSessions || false);
  const [sound, setSound] = useState(settings?.soundEnabled ?? true);
  const [saving, setSaving] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);
  const [isInitializingSheets, setIsInitializingSheets] = useState(false);
  const { isDisabled, intensity } = useMotionPreferences();
  const factor = getIntensityFactor(intensity);

  useEffect(() => {
    if (settings) {
      setCurrency(settings.currency || 'INR');
      setWorkDuration(String(settings.pomodoroWorkDuration || 25));
      setShortBreak(String(settings.shortBreakDuration || 5));
      setLongBreak(String(settings.longBreakDuration || 15));
      setDailyGoalMin(String(settings.dailyFocusGoalMinutes || 100));
      setWeeklyGoalMin(String(settings.weeklyFocusGoalMinutes || 500));
      setShortcutsEnabled(settings.keyboardShortcutsEnabled ?? true);
      if (settings.notificationPrefs) setNotifPrefs(settings.notificationPrefs);
      setAutoSwitch(Boolean(settings.autoSwitchSessions));
      setSound(settings.soundEnabled ?? true);
    }
  }, [settings]);

  const clampInt = (raw: string, fallback: number, min: number, max: number) => {
    const n = Number(raw);
    if (!raw.trim() || !Number.isFinite(n)) return fallback;
    return Math.min(max, Math.max(min, Math.round(n)));
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setSaveSuccess(false);
    try {
      const nextWork = clampInt(workDuration, 25, 1, 120);
      const nextShort = clampInt(shortBreak, 5, 1, 30);
      const nextLong = clampInt(longBreak, 15, 1, 60);
      const nextDaily = clampInt(dailyGoalMin, 100, 5, 720);
      const nextWeekly = clampInt(weeklyGoalMin, 500, 15, 5000);
      setWorkDuration(String(nextWork));
      setShortBreak(String(nextShort));
      setLongBreak(String(nextLong));
      setDailyGoalMin(String(nextDaily));
      setWeeklyGoalMin(String(nextWeekly));
      await updateSettings({
        currency,
        pomodoroWorkDuration: nextWork,
        shortBreakDuration: nextShort,
        longBreakDuration: nextLong,
        dailyFocusGoalMinutes: nextDaily,
        weeklyFocusGoalMinutes: nextWeekly,
        keyboardShortcutsEnabled: shortcutsEnabled,
        notificationPrefs: notifPrefs,
        autoSwitchSessions: autoSwitch,
        soundEnabled: sound,
      });
      setSaveSuccess(true);
      setTimeout(() => setSaveSuccess(false), 1600);
    } finally {
      setSaving(false);
    }
  };

  const handleCreateWorkbook = async () => {
    setIsInitializingSheets(true);
    try {
      await createOrConnectSpreadsheet();
    } finally {
      setIsInitializingSheets(false);
    }
  };

  const handleReseed = async () => {
    if (
      window.confirm(
        'Reset database to initial pristine seed data? This will restore sample transactions, bills, and focus sessions.'
      )
    ) {
      await reseedData();
    }
  };

  const handleClearAllWorkspace = async () => {
    if (
      window.confirm(
        'Are you sure you want to delete ALL transactions, tasks, bills, time blocks, and subscriptions to start completely clean? This action cannot be undone.'
      )
    ) {
      await clearAllData();
    }
  };

  return (
    <div className="space-y-6">
      {/* Settings Module Switcher */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-lg font-bold text-[var(--ff-text-primary)]">
            Settings &amp; Customization
          </h1>
          <p className="text-xs text-[var(--ff-text-muted)]">
            Customize your UI design system in Theme Studio or configure sync, currency, and Pomodoro intervals.
          </p>
        </div>

        <ThemeSegmentedControl<'studio' | 'system'>
          ariaLabel="Settings section switcher"
          value={activeSection}
          onChange={setActiveSection}
          options={[
            {
              id: 'studio',
              label: 'Theme Studio',
              icon: <Palette className="w-3.5 h-3.5" />,
            },
            {
              id: 'system',
              label: 'System & Sync',
              icon: <Sliders className="w-3.5 h-3.5" />,
            },
          ]}
        />
      </div>

      <AnimatePresence mode="wait" initial={false}>
        {activeSection === 'studio' ? (
          <motion.div
            key="settings-section-studio"
            initial={isDisabled ? false : { opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={isDisabled ? { opacity: 0 } : { opacity: 0, y: -6 }}
            transition={{
              duration: MOTION_DURATION.card * Math.max(0.55, factor || 0.01),
              ease: MOTION_EASING.decelerate,
            }}
          >
            <ThemeStudio />
          </motion.div>
        ) : (
          <motion.div
            key="settings-section-system"
            initial={isDisabled ? false : { opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={isDisabled ? { opacity: 0 } : { opacity: 0, y: -6 }}
            transition={{
              duration: MOTION_DURATION.card * Math.max(0.55, factor || 0.01),
              ease: MOTION_EASING.decelerate,
            }}
            className="max-w-3xl space-y-6"
          >
          {/* SECTION: GOOGLE SHEETS & FIREBASE REPORTING INTEGRATION */}
          <ThemeCard className="space-y-4">
            <div className="flex items-center justify-between gap-3">
              <div className="flex items-center gap-2.5">
                <div
                  className="w-9 h-9 rounded-xl flex items-center justify-center font-bold shrink-0"
                  style={{
                    background: 'var(--ff-success)',
                    color: '#ffffff',
                  }}
                >
                  <FileSpreadsheet className="w-4 h-4" />
                </div>
                <div>
                  <h2 className="text-sm font-bold text-[var(--ff-text-primary)]">
                    Google Sheets Executive Synchronization
                  </h2>
                  <p className="text-xs text-[var(--ff-text-muted)]">
                    Synchronize 23 master worksheets with executive dashboards, native charts, INR currency formatting, and live formulas.
                  </p>
                </div>
              </div>

              <ThemeBadge tone={googleSpreadsheetId ? 'success' : 'neutral'}>
                {googleSpreadsheetId ? 'Connected' : 'Not Connected'}
              </ThemeBadge>
            </div>

            {/* Authentication State */}
            <ThemeCard
              variant="inset"
              className="p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs"
            >
              <div>
                <span className="font-semibold text-[var(--ff-text-primary)] block">
                  Google Account &amp; OAuth Status
                </span>
                <span className="text-[var(--ff-text-muted)]">
                  {isAuthenticated
                    ? `Signed in as ${firebaseUser?.displayName || firebaseUser?.email}`
                    : 'Sign in with Google to grant permission to synchronize your Google Drive & Sheets.'}
                </span>
              </div>

              {!isAuthenticated ? (
                <ThemeButton variant="primary" size="sm" onClick={signInWithGoogle}>
                  Sign in with Google
                </ThemeButton>
              ) : (
                <ThemeButton variant="secondary" size="sm" onClick={signOutGoogle}>
                  Switch Account
                </ThemeButton>
              )}
            </ThemeCard>

            {/* Master Workbook Controls */}
            {googleSpreadsheetId ? (
              <ThemeCard
                variant="inset"
                className="p-4 space-y-3"
                style={{
                  background: 'var(--ff-success-soft)',
                  borderColor: 'color-mix(in oklab, var(--ff-success) 35%, transparent)',
                }}
              >
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                  <div>
                    <span
                      className="text-xs font-bold block"
                      style={{ color: 'var(--ff-success)' }}
                    >
                      Master Ledger Active in Google Drive
                    </span>
                    <span className="text-[11px] font-mono text-[var(--ff-text-secondary)] block mt-0.5 truncate max-w-md">
                      Sheet ID: {googleSpreadsheetId}
                    </span>
                    {lastSyncedAt && (
                      <span className="text-[11px] text-[var(--ff-text-muted)] block mt-1">
                        Last synchronized: {new Date(lastSyncedAt).toLocaleString()}
                      </span>
                    )}
                  </div>

                  <div className="flex items-center gap-2 shrink-0">
                    <a
                      href={`https://docs.google.com/spreadsheets/d/${googleSpreadsheetId}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="ff-btn ff-btn-secondary px-3.5 py-2 text-xs"
                    >
                      <span>Open in Sheets</span>
                      <ExternalLink className="w-3.5 h-3.5" />
                    </a>

                    <ThemeButton
                      variant="success"
                      size="sm"
                      onClick={() => void syncNowToGoogleSheets()}
                      disabled={syncStatus === 'syncing'}
                    >
                      <RefreshCw
                        className={`w-3.5 h-3.5 ${syncStatus === 'syncing' ? 'animate-spin' : ''}`}
                      />
                      <span>{syncStatus === 'syncing' ? 'Syncing...' : 'Sync Now'}</span>
                    </ThemeButton>
                  </div>
                </div>
              </ThemeCard>
            ) : (
              <ThemeCard
                variant="inset"
                className="p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3"
              >
                <div>
                  <span className="text-xs font-bold text-[var(--ff-text-primary)] block">
                    Initialize Executive Master Spreadsheet
                  </span>
                  <span className="text-[11px] text-[var(--ff-text-muted)] block mt-0.5">
                    Automatically generate all 23 formatted worksheets with executive dashboards, frozen headers, INR currency styling, and live formulas.
                  </span>
                </div>

                <ThemeButton
                  variant="success"
                  size="sm"
                  onClick={handleCreateWorkbook}
                  loading={isInitializingSheets}
                  loadingText="Creating 23 Tabs..."
                  className="shrink-0"
                >
                  <FileSpreadsheet className="w-3.5 h-3.5" />
                  <span>Create Master Workbook</span>
                </ThemeButton>
              </ThemeCard>
            )}

            {/* 23 Worksheets Catalog */}
            <div className="pt-2">
              <span className="text-[11px] font-semibold text-[var(--ff-text-muted)] uppercase tracking-wider block mb-2">
                The 23 Master Worksheets Architecture
              </span>
              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-2 text-[11px] text-[var(--ff-text-secondary)] font-mono">
                {[
                  '1. Executive_Dashboard ★',
                  '2. Finance_Dashboard',
                  '3. Productivity_Dashboard',
                  '4. Focus_Sessions',
                  '5. Focus_Daily',
                  '6. Focus_Weekly',
                  '7. Focus_Monthly',
                  '8. Tasks',
                  '9. Task_Analytics',
                  '10. Productivity_Goals',
                  '11. Income',
                  '12. Fixed_Expenses',
                  '13. Variable_Expenses',
                  '14. Bills_Payments',
                  '15. Budgets',
                  '16. Savings_Goals',
                  '17. Finance_Daily',
                  '18. Finance_Weekly',
                  '19. Finance_Monthly',
                  '20. Sync_Control',
                  '21. Sync_Error_Log',
                  '22. Data_Dictionary',
                  '23. Settings',
                ].map((sheet) => (
                  <span
                    key={sheet}
                    className={`p-1.5 rounded-md border truncate ${
                      sheet.includes('★')
                        ? 'bg-[var(--ff-accent-soft)] border-[var(--ff-accent-text)] text-[var(--ff-accent-text)] font-bold'
                        : 'bg-[var(--ff-surface-inset)] border-[var(--ff-border-color)]'
                    }`}
                  >
                    {sheet}
                  </span>
                ))}
              </div>
            </div>
          </ThemeCard>

          <form onSubmit={handleSave} className="space-y-6">
            {/* User Profile Card */}
            <ThemeCard>
              <div className="flex items-center gap-2 mb-4 text-xs font-semibold uppercase tracking-wider text-[var(--ff-text-muted)]">
                <User className="w-4 h-4" style={{ color: 'var(--ff-accent-text)' }} />
                <span>Profile Identity</span>
              </div>

              <div className="flex items-center gap-4">
                <div
                  className="w-14 h-14 rounded-2xl font-bold text-lg flex items-center justify-center overflow-hidden shrink-0"
                  style={{
                    background: 'linear-gradient(135deg, var(--ff-accent), var(--ff-accent-secondary))',
                    color: 'var(--ff-accent-contrast)',
                    boxShadow: 'var(--ff-shadow-button)',
                  }}
                >
                  {firebaseUser?.photoURL ? (
                    <img
                      src={firebaseUser.photoURL}
                      alt={user?.name || 'User'}
                      className="w-full h-full object-cover"
                    />
                  ) : (
                    <span>{user?.name ? user.name.slice(0, 2).toUpperCase() : 'AM'}</span>
                  )}
                </div>
                <div>
                  <h2 className="text-base font-bold text-[var(--ff-text-primary)]">
                    {firebaseUser?.displayName || user?.name || 'Atif Munshi'}
                  </h2>
                  <p className="text-xs text-[var(--ff-text-muted)]">
                    {firebaseUser?.email || user?.email || 'atifmunshi2122@gmail.com'}
                  </p>
                  <div
                    className="flex items-center gap-1.5 mt-1 text-[11px] font-medium"
                    style={{ color: 'var(--ff-success)' }}
                  >
                    <ShieldCheck className="w-3.5 h-3.5" />
                    <span>Cloud Firestore Database Active &amp; Isolated</span>
                  </div>
                </div>
              </div>
            </ThemeCard>

            {/* Financial Preferences */}
            <ThemeCard>
              <div className="flex items-center gap-2 mb-4 text-xs font-semibold uppercase tracking-wider text-[var(--ff-text-muted)]">
                <DollarSign className="w-4 h-4" style={{ color: 'var(--ff-success)' }} />
                <span>Financial Configuration</span>
              </div>

              <div className="max-w-xs">
                <label
                  htmlFor="currency-select"
                  className="block text-xs font-medium text-[var(--ff-text-secondary)] mb-1"
                >
                  Active Currency Standard
                </label>
                <ThemeSelect
                  id="currency-select"
                  value={currency}
                  onChange={(e) => setCurrency(e.target.value as CurrencyCode)}
                >
                  <option value="INR">INR (₹) - Indian Rupee</option>
                  <option value="USD">USD ($) - US Dollar</option>
                  <option value="EUR">EUR (€) - Euro</option>
                  <option value="GBP">GBP (£) - British Pound</option>
                </ThemeSelect>
                <span className="text-[11px] text-[var(--ff-text-muted)] block mt-1">
                  All financial values are strictly stored in integer minor units (paise/cents).
                </span>
              </div>
            </ThemeCard>

            {/* Pomodoro Intervals */}
            <ThemeCard>
              <div className="flex items-center gap-2 mb-4 text-xs font-semibold uppercase tracking-wider text-[var(--ff-text-muted)]">
                <Sliders className="w-4 h-4" style={{ color: 'var(--ff-accent-text)' }} />
                <span>Pomodoro Interval Preferences</span>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div>
                  <label
                    htmlFor="work-duration-input"
                    className="block text-xs font-medium text-[var(--ff-text-secondary)] mb-1"
                  >
                    Work Session (min)
                  </label>
                  <ThemeInput
                    id="work-duration-input"
                    type="number"
                    min="1"
                    max="120"
                    value={workDuration}
                    onChange={(e) => setWorkDuration(e.target.value)}
                    className="font-mono tabular-nums"
                  />
                </div>

                <div>
                  <label
                    htmlFor="short-break-input"
                    className="block text-xs font-medium text-[var(--ff-text-secondary)] mb-1"
                  >
                    Short Break (min)
                  </label>
                  <ThemeInput
                    id="short-break-input"
                    type="number"
                    min="1"
                    max="30"
                    value={shortBreak}
                    onChange={(e) => setShortBreak(e.target.value)}
                    className="font-mono tabular-nums"
                  />
                </div>

                <div>
                  <label
                    htmlFor="long-break-input"
                    className="block text-xs font-medium text-[var(--ff-text-secondary)] mb-1"
                  >
                    Long Break (min)
                  </label>
                  <ThemeInput
                    id="long-break-input"
                    type="number"
                    min="1"
                    max="60"
                    value={longBreak}
                    onChange={(e) => setLongBreak(e.target.value)}
                    className="font-mono tabular-nums"
                  />
                </div>
              </div>

              {/* Toggles */}
              <div className="mt-5 pt-4 border-t border-[var(--ff-border-color)] space-y-3">
                <label className="flex items-center gap-3 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={autoSwitch}
                    onChange={(e) => setAutoSwitch(e.target.checked)}
                    className="w-4 h-4 rounded"
                  />
                  <span className="text-xs text-[var(--ff-text-secondary)] font-medium">
                    Auto-switch sessions (automatically start break after work session ends)
                  </span>
                </label>

                <label className="flex items-center gap-3 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={sound}
                    onChange={(e) => setSound(e.target.checked)}
                    className="w-4 h-4 rounded"
                  />
                  <span className="text-xs text-[var(--ff-text-secondary)] font-medium">
                    Synthesized audio alerts (Web Audio API focus completion and break chimes)
                  </span>
                </label>
              </div>
            </ThemeCard>

            {/* Focus Goals & Keyboard Shortcuts */}
            <ThemeCard>
              <div className="flex items-center gap-2 mb-4 text-xs font-semibold uppercase tracking-wider text-[var(--ff-text-muted)]">
                <Target className="w-4 h-4 text-[var(--ff-accent-text)]" />
                <span>Productivity Targets &amp; Navigation Shortcuts</span>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-medium text-[var(--ff-text-secondary)] mb-1">
                    Daily Focus Goal (minutes)
                  </label>
                  <ThemeInput
                    type="number"
                    min="5"
                    max="720"
                    value={dailyGoalMin}
                    onChange={(e) => setDailyGoalMin(e.target.value)}
                    className="font-mono"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-[var(--ff-text-secondary)] mb-1">
                    Weekly Focus Goal (minutes)
                  </label>
                  <ThemeInput
                    type="number"
                    min="15"
                    max="5000"
                    value={weeklyGoalMin}
                    onChange={(e) => setWeeklyGoalMin(e.target.value)}
                    className="font-mono"
                  />
                </div>
              </div>
              <div className="mt-4 pt-4 border-t border-[var(--ff-border-color)] flex flex-wrap items-center justify-between gap-3">
                <label className="flex items-center gap-3 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={shortcutsEnabled}
                    onChange={(e) => setShortcutsEnabled(e.target.checked)}
                    className="w-4 h-4 rounded"
                  />
                  <span className="text-xs text-[var(--ff-text-secondary)] font-medium flex items-center gap-1.5">
                    <Keyboard className="w-3.5 h-3.5" /> Enable Global Shortcuts (Cmd/Ctrl+K, Alt+1..8)
                  </span>
                </label>
              </div>
            </ThemeCard>

            {/* Deterministic Notification Rules */}
            <ThemeCard className="space-y-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-[var(--ff-text-muted)]">
                  <Bell className="w-4 h-4 text-[var(--ff-warning)]" />
                  <span>Rule-Based Notifications</span>
                </div>
                <label className="flex items-center gap-2 text-xs font-semibold cursor-pointer">
                  <input
                    type="checkbox"
                    checked={notifPrefs.enabled}
                    onChange={(e) => setNotifPrefs((p) => ({ ...p, enabled: e.target.checked }))}
                  />
                  <span>Active</span>
                </label>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
                {(
                  [
                    ['taskDeadlines', 'Task due & overdue alerts'],
                    ['upcomingBills', 'Upcoming bill due reminders'],
                    ['overdueBills', 'Overdue bill urgent warnings'],
                    ['dailyFocusGoal', 'Daily focus goal milestone notice'],
                    ['budgetWarnings', 'Budget threshold warnings'],
                    ['syncFailures', 'Google Sheets sync error alerts'],
                  ] as const
                ).map(([key, label]) => (
                  <label key={key} className="flex items-center gap-2.5 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={Boolean(notifPrefs[key])}
                      onChange={(e) =>
                        setNotifPrefs((p) => ({ ...p, [key]: e.target.checked }))
                      }
                    />
                    <span className="text-[var(--ff-text-secondary)]">{label}</span>
                  </label>
                ))}
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-2 border-t border-[var(--ff-border-color)]">
                <div>
                  <label className="block text-[11px] font-medium text-[var(--ff-text-muted)] mb-1">
                    Bill Reminder Lead Days (1–14)
                  </label>
                  <ThemeInput
                    type="number"
                    min="1"
                    max="14"
                    value={String(notifPrefs.billLeadDays)}
                    onChange={(e) =>
                      setNotifPrefs((p) => ({
                        ...p,
                        billLeadDays: Math.min(14, Math.max(1, Number(e.target.value) || 3)),
                      }))
                    }
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-medium text-[var(--ff-text-muted)] mb-1">
                    Budget Warning Percent (50–100%)
                  </label>
                  <ThemeInput
                    type="number"
                    min="50"
                    max="100"
                    value={String(notifPrefs.budgetWarningPercent)}
                    onChange={(e) =>
                      setNotifPrefs((p) => ({
                        ...p,
                        budgetWarningPercent: Math.min(100, Math.max(50, Number(e.target.value) || 80)),
                      }))
                    }
                  />
                </div>
              </div>
            </ThemeCard>

            {/* Data Safety, Trash & JSON Backup */}
            <ThemeCard className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div>
                <h2 className="text-sm font-bold text-[var(--ff-text-primary)]">
                  Data Backup &amp; Soft-Deleted Trash
                </h2>
                <p className="text-xs text-[var(--ff-text-muted)]">
                  Export a full JSON archive of your workspace or recover deleted records.
                </p>
              </div>
              <div className="flex flex-wrap items-center gap-2 shrink-0">
                <ThemeButton
                  type="button"
                  variant="secondary"
                  size="sm"
                  onClick={() => setTrashModalOpen(true)}
                >
                  <Trash2 className="w-3.5 h-3.5" /> Open Trash Bin
                </ThemeButton>
                <ThemeButton
                  type="button"
                  variant="secondary"
                  size="sm"
                  onClick={async () => {
                    try {
                      const [tasks, sessions, incomes, expenses, bills, goals] = await Promise.all([
                        api.getTasks(),
                        api.getFocusSessions(),
                        api.getIncomes(),
                        api.getExpenses(),
                        api.getBills(),
                        api.getSavingsGoals(),
                      ]);
                      const payload = JSON.stringify(
                        { exportedAt: new Date().toISOString(), settings, tasks, sessions, incomes, expenses, bills, savingsGoals: goals },
                        null,
                        2
                      );
                      const blob = new Blob([payload], { type: 'application/json' });
                      const url = URL.createObjectURL(blob);
                      const a = document.createElement('a');
                      a.href = url;
                      a.download = `focusflow-backup-${new Date().toISOString().slice(0, 10)}.json`;
                      a.click();
                      setTimeout(() => URL.revokeObjectURL(url), 1000);
                      showToast('Workspace JSON backup downloaded', 'success');
                    } catch {
                      showToast('Failed to create JSON backup', 'error');
                    }
                  }}
                >
                  <Download className="w-3.5 h-3.5" /> Backup JSON
                </ThemeButton>
              </div>
            </ThemeCard>

            {/* Display & Quick Theme Studio Link */}
            <ThemeCard className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div>
                <h2 className="text-sm font-bold text-[var(--ff-text-primary)]">
                  Interface Theme &amp; Design Studio
                </h2>
                <p className="text-xs text-[var(--ff-text-muted)]">
                  Switch light/dark mode quickly or customize all 16 design systems in Theme Studio.
                </p>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <ThemeButton variant="secondary" size="sm" onClick={toggleTheme}>
                  {theme === 'dark' ? (
                    <>
                      <Sun className="w-4 h-4" style={{ color: 'var(--ff-warning)' }} />
                      <span>Switch to Light</span>
                    </>
                  ) : (
                    <>
                      <Moon className="w-4 h-4" />
                      <span>Switch to Dark</span>
                    </>
                  )}
                </ThemeButton>
                <ThemeButton
                  variant="primary"
                  size="sm"
                  onClick={() => setActiveSection('studio')}
                >
                  <Palette className="w-4 h-4" />
                  <span>Open Studio</span>
                </ThemeButton>
              </div>
            </ThemeCard>

            {/* Actions bar */}
            <div className="flex flex-wrap items-center justify-between gap-2 pt-2">
              <div className="flex items-center gap-2">
                <ThemeButton
                  variant="ghost"
                  size="sm"
                  onClick={handleClearAllWorkspace}
                  style={{ color: 'var(--ff-danger)' }}
                  title="Wipe all data and start with an empty workspace"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                  <span>Wipe All Data</span>
                </ThemeButton>

                <ThemeButton
                  variant="ghost"
                  size="sm"
                  onClick={handleReseed}
                  style={{ color: 'var(--ff-text-muted)' }}
                  title="Load sample starter data"
                >
                  <RotateCcw className="w-3.5 h-3.5" />
                  <span>Load Sample Data</span>
                </ThemeButton>
              </div>

              <ThemeButton
                type="submit"
                variant="primary"
                size="md"
                loading={saving}
                success={saveSuccess}
                loadingText="Saving..."
              >
                {saveSuccess ? 'Saved!' : 'Save Preferences'}
              </ThemeButton>
            </div>
          </form>
        </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};
