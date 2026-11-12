import React, { useEffect, useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { useApp } from '../../context/AppContext.tsx';
import { CurrencyCode } from '../../types/index.ts';
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
  DollarSign,
  ExternalLink,
  FileSpreadsheet,
  Moon,
  Palette,
  RefreshCw,
  RotateCcw,
  ShieldCheck,
  Sliders,
  Sun,
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
    firebaseUser,
    isAuthenticated,
    signInWithGoogle,
    signOutGoogle,
    googleSpreadsheetId,
    syncStatus,
    lastSyncedAt,
    createOrConnectSpreadsheet,
    syncNowToGoogleSheets,
  } = useApp();

  const [activeSection, setActiveSection] = useState<'studio' | 'system'>('studio');

  const [currency, setCurrency] = useState<CurrencyCode>(settings?.currency || 'INR');
  const [workDuration, setWorkDuration] = useState(String(settings?.pomodoroWorkDuration || 25));
  const [shortBreak, setShortBreak] = useState(String(settings?.shortBreakDuration || 5));
  const [longBreak, setLongBreak] = useState(String(settings?.longBreakDuration || 15));
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
      setWorkDuration(String(nextWork));
      setShortBreak(String(nextShort));
      setLongBreak(String(nextLong));
      await updateSettings({
        currency,
        pomodoroWorkDuration: nextWork,
        shortBreakDuration: nextShort,
        longBreakDuration: nextLong,
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
                    Google Sheets Automated Synchronization
                  </h2>
                  <p className="text-xs text-[var(--ff-text-muted)]">
                    Synchronize 12 master worksheets with professional formatting, formulas, and real-time updates.
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
                    Initialize Master Spreadsheet
                  </span>
                  <span className="text-[11px] text-[var(--ff-text-muted)] block mt-0.5">
                    Automatically generate the 12 formatted worksheets with frozen headers, INR currency styling, and live formulas.
                  </span>
                </div>

                <ThemeButton
                  variant="success"
                  size="sm"
                  onClick={handleCreateWorkbook}
                  loading={isInitializingSheets}
                  loadingText="Creating 12 Tabs..."
                  className="shrink-0"
                >
                  <FileSpreadsheet className="w-3.5 h-3.5" />
                  <span>Create Master Workbook</span>
                </ThemeButton>
              </ThemeCard>
            )}

            {/* 12 Worksheets Catalog */}
            <div className="pt-2">
              <span className="text-[11px] font-semibold text-[var(--ff-text-muted)] uppercase tracking-wider block mb-2">
                The 12 Synchronized Worksheets
              </span>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-[11px] text-[var(--ff-text-secondary)] font-mono">
                {[
                  '1. Focus_Sessions',
                  '2. Focus_Daily',
                  '3. Focus_Weekly',
                  '4. Focus_Monthly',
                  '5. Income',
                  '6. Fixed_Expenses',
                  '7. Variable_Expenses',
                  '8. Bills_Payments',
                  '9. Finance_Daily',
                  '10. Finance_Weekly',
                  '11. Finance_Monthly',
                  '12. Overall_Analytics',
                ].map((sheet) => (
                  <span
                    key={sheet}
                    className="p-1.5 rounded-md bg-[var(--ff-surface-inset)] border border-[var(--ff-border-color)] truncate"
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
            <div className="flex items-center justify-between pt-2">
              <ThemeButton
                variant="ghost"
                size="sm"
                onClick={handleReseed}
                style={{ color: 'var(--ff-danger)' }}
              >
                <RotateCcw className="w-3.5 h-3.5" />
                <span>Reset Demo Data</span>
              </ThemeButton>

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
