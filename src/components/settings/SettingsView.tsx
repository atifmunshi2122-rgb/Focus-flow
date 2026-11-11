import React, { useState } from 'react';
import { useApp } from '../../context/AppContext.tsx';
import { CurrencyCode } from '../../types/index.ts';
import {
  Settings,
  User,
  Sliders,
  DollarSign,
  Moon,
  Sun,
  RotateCcw,
  ShieldCheck,
  FileSpreadsheet,
  ExternalLink,
  RefreshCw,
  CheckCircle2,
  AlertCircle,
  Layers,
  Database,
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
    syncQueueCount,
    createOrConnectSpreadsheet,
    syncNowToGoogleSheets,
  } = useApp();

  const [currency, setCurrency] = useState<CurrencyCode>(settings?.currency || 'INR');
  const [workDuration, setWorkDuration] = useState(String(settings?.pomodoroWorkDuration || 25));
  const [shortBreak, setShortBreak] = useState(String(settings?.shortBreakDuration || 5));
  const [longBreak, setLongBreak] = useState(String(settings?.longBreakDuration || 15));
  const [autoSwitch, setAutoSwitch] = useState(settings?.autoSwitchSessions || false);
  const [sound, setSound] = useState(settings?.soundEnabled ?? true);
  const [saving, setSaving] = useState(false);
  const [isInitializingSheets, setIsInitializingSheets] = useState(false);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      await updateSettings({
        currency,
        pomodoroWorkDuration: Number(workDuration) || 25,
        shortBreakDuration: Number(shortBreak) || 5,
        longBreakDuration: Number(longBreak) || 15,
        autoSwitchSessions: autoSwitch,
        soundEnabled: sound,
      });
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
    <div className="max-w-3xl space-y-8">
      <div>
        <h3 className="text-base font-bold text-slate-900 dark:text-white">System &amp; User Settings</h3>
        <p className="text-xs text-slate-500 dark:text-slate-400">
          Configure Firebase authentication, Google Sheets synchronization, financial currency, and Pomodoro intervals.
        </p>
      </div>

      {/* SECTION: GOOGLE SHEETS & FIREBASE REPORTING INTEGRATION */}
      <div className="p-6 rounded-2xl bg-gradient-to-br from-white to-emerald-50/40 dark:from-slate-900 dark:to-emerald-950/20 border border-emerald-200/80 dark:border-emerald-800/60 shadow-xs space-y-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-xl bg-emerald-600 text-white flex items-center justify-center font-bold shadow-xs">
              <FileSpreadsheet className="w-4 h-4" />
            </div>
            <div>
              <h4 className="text-sm font-bold text-slate-900 dark:text-white">
                Google Sheets Automated Synchronization
              </h4>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Synchronize 12 master worksheets with professional formatting, formulas, and real-time updates.
              </p>
            </div>
          </div>

          {/* Sync Status Badge */}
          <div className="flex items-center gap-1.5 text-xs">
            <span
              className={`w-2 h-2 rounded-full ${
                googleSpreadsheetId ? 'bg-emerald-500' : 'bg-slate-400'
              }`}
            />
            <span className="font-semibold text-slate-700 dark:text-slate-300">
              {googleSpreadsheetId ? 'Connected' : 'Not Connected'}
            </span>
          </div>
        </div>

        {/* Authentication State */}
        <div className="p-4 rounded-xl bg-white/80 dark:bg-slate-800/80 border border-slate-200 dark:border-slate-700/60 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs">
          <div>
            <span className="font-semibold text-slate-900 dark:text-white block">
              Google Account &amp; OAuth Status
            </span>
            <span className="text-slate-500 dark:text-slate-400">
              {isAuthenticated
                ? `Signed in as ${firebaseUser?.displayName || firebaseUser?.email}`
                : 'Sign in with Google to grant permission to synchronize your Google Drive & Sheets.'}
            </span>
          </div>

          {!isAuthenticated ? (
            <button
              type="button"
              onClick={signInWithGoogle}
              className="flex items-center gap-2 px-3.5 py-2 text-xs font-semibold rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white shadow-xs transition-colors shrink-0"
            >
              <span>Sign in with Google</span>
            </button>
          ) : (
            <button
              type="button"
              onClick={signOutGoogle}
              className="px-3 py-1.5 text-xs text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white border border-slate-200 dark:border-slate-700 rounded-lg transition-colors shrink-0"
            >
              Switch Account
            </button>
          )}
        </div>

        {/* Master Workbook Controls */}
        {googleSpreadsheetId ? (
          <div className="p-4 rounded-xl bg-emerald-50/60 dark:bg-emerald-950/30 border border-emerald-200 dark:border-emerald-800/80 space-y-3">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div>
                <span className="text-xs font-bold text-emerald-900 dark:text-emerald-300 block">
                  Master Ledger Active in Google Drive
                </span>
                <span className="text-[11px] font-mono text-emerald-700/80 dark:text-emerald-400/80 block mt-0.5 truncate max-w-md">
                  Sheet ID: {googleSpreadsheetId}
                </span>
                {lastSyncedAt && (
                  <span className="text-[11px] text-slate-500 dark:text-slate-400 block mt-1">
                    Last synchronized: {new Date(lastSyncedAt).toLocaleString()}
                  </span>
                )}
              </div>

              <div className="flex items-center gap-2 shrink-0">
                <a
                  href={`https://docs.google.com/spreadsheets/d/${googleSpreadsheetId}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold text-emerald-700 dark:text-emerald-300 bg-white dark:bg-slate-800 border border-emerald-300 dark:border-emerald-700 rounded-lg shadow-xs hover:bg-emerald-50 dark:hover:bg-slate-700 transition-colors"
                >
                  <span>Open in Sheets</span>
                  <ExternalLink className="w-3.5 h-3.5" />
                </a>

                <button
                  type="button"
                  onClick={() => syncNowToGoogleSheets()}
                  disabled={syncStatus === 'syncing'}
                  className="flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold text-white bg-emerald-600 hover:bg-emerald-700 rounded-lg shadow-xs transition-colors disabled:opacity-50"
                >
                  <RefreshCw className={`w-3.5 h-3.5 ${syncStatus === 'syncing' ? 'animate-spin' : ''}`} />
                  <span>{syncStatus === 'syncing' ? 'Syncing...' : 'Sync Now'}</span>
                </button>
              </div>
            </div>
          </div>
        ) : (
          <div className="p-4 rounded-xl bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div>
              <span className="text-xs font-bold text-slate-900 dark:text-white block">
                Initialize Master Spreadsheet
              </span>
              <span className="text-[11px] text-slate-500 dark:text-slate-400 block mt-0.5">
                Automatically generate the 12 formatted worksheets with frozen headers, INR currency styling, and live formulas.
              </span>
            </div>

            <button
              type="button"
              onClick={handleCreateWorkbook}
              disabled={isInitializingSheets}
              className="flex items-center justify-center gap-1.5 px-4 py-2 text-xs font-semibold text-white bg-emerald-600 hover:bg-emerald-700 rounded-lg shadow-xs transition-colors shrink-0 disabled:opacity-50"
            >
              <FileSpreadsheet className="w-3.5 h-3.5" />
              <span>{isInitializingSheets ? 'Creating 12 Tabs...' : 'Create Master Workbook'}</span>
            </button>
          </div>
        )}

        {/* 12 Worksheets Catalog */}
        <div className="pt-2">
          <span className="text-[11px] font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider block mb-2">
            The 12 Synchronized Worksheets
          </span>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-[11px] text-slate-600 dark:text-slate-400 font-mono">
            <span className="p-1.5 rounded-md bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700">1. Focus_Sessions</span>
            <span className="p-1.5 rounded-md bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700">2. Focus_Daily</span>
            <span className="p-1.5 rounded-md bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700">3. Focus_Weekly</span>
            <span className="p-1.5 rounded-md bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700">4. Focus_Monthly</span>
            <span className="p-1.5 rounded-md bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700">5. Income</span>
            <span className="p-1.5 rounded-md bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700">6. Fixed_Expenses</span>
            <span className="p-1.5 rounded-md bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700">7. Variable_Expenses</span>
            <span className="p-1.5 rounded-md bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700">8. Bills_Payments</span>
            <span className="p-1.5 rounded-md bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700">9. Finance_Daily</span>
            <span className="p-1.5 rounded-md bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700">10. Finance_Weekly</span>
            <span className="p-1.5 rounded-md bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700">11. Finance_Monthly</span>
            <span className="p-1.5 rounded-md bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700">12. Overall_Analytics</span>
          </div>
        </div>
      </div>

      <form onSubmit={handleSave} className="space-y-6">
        {/* User Profile Card */}
        <div className="p-6 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-xs">
          <div className="flex items-center gap-2 mb-4 text-xs font-semibold uppercase tracking-wider text-slate-500">
            <User className="w-4 h-4 text-indigo-500" />
            <span>Profile Identity</span>
          </div>

          <div className="flex items-center gap-4">
            <div className="w-14 h-14 rounded-2xl bg-gradient-to-tr from-indigo-600 to-violet-600 text-white font-bold text-lg flex items-center justify-center shadow-md shadow-indigo-500/20 overflow-hidden">
              {firebaseUser?.photoURL ? (
                <img src={firebaseUser.photoURL} alt={user?.name || 'User'} className="w-full h-full object-cover" />
              ) : (
                <span>{user?.name ? user.name.slice(0, 2).toUpperCase() : 'AM'}</span>
              )}
            </div>
            <div>
              <h4 className="text-base font-bold text-slate-900 dark:text-white">
                {firebaseUser?.displayName || user?.name || 'Atif Munshi'}
              </h4>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                {firebaseUser?.email || user?.email || 'atifmunshi2122@gmail.com'}
              </p>
              <div className="flex items-center gap-1.5 mt-1 text-[11px] text-emerald-600 dark:text-emerald-400 font-medium">
                <ShieldCheck className="w-3.5 h-3.5" />
                <span>Cloud Firestore Database Active &amp; Isolated</span>
              </div>
            </div>
          </div>
        </div>

        {/* Financial Preferences */}
        <div className="p-6 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-xs">
          <div className="flex items-center gap-2 mb-4 text-xs font-semibold uppercase tracking-wider text-slate-500">
            <DollarSign className="w-4 h-4 text-emerald-500" />
            <span>Financial Configuration</span>
          </div>

          <div className="max-w-xs">
            <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
              Active Currency Standard
            </label>
            <select
              value={currency}
              onChange={(e) => setCurrency(e.target.value as CurrencyCode)}
              className="w-full px-3 py-2 text-sm rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
            >
              <option value="INR">INR (₹) - Indian Rupee</option>
              <option value="USD">USD ($) - US Dollar</option>
              <option value="EUR">EUR (€) - Euro</option>
              <option value="GBP">GBP (£) - British Pound</option>
            </select>
            <span className="text-[11px] text-slate-400 block mt-1">
              All financial values are strictly stored in integer minor units (paise/cents).
            </span>
          </div>
        </div>

        {/* Pomodoro Intervals */}
        <div className="p-6 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-xs">
          <div className="flex items-center gap-2 mb-4 text-xs font-semibold uppercase tracking-wider text-slate-500">
            <Sliders className="w-4 h-4 text-indigo-500" />
            <span>Pomodoro Interval Preferences</span>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div>
              <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                Work Session (min)
              </label>
              <input
                type="number"
                min="1"
                max="120"
                value={workDuration}
                onChange={(e) => setWorkDuration(e.target.value)}
                className="w-full px-3 py-2 text-sm rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white font-mono tabular-nums focus:outline-none focus:ring-2 focus:ring-indigo-500"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                Short Break (min)
              </label>
              <input
                type="number"
                min="1"
                max="30"
                value={shortBreak}
                onChange={(e) => setShortBreak(e.target.value)}
                className="w-full px-3 py-2 text-sm rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white font-mono tabular-nums focus:outline-none focus:ring-2 focus:ring-indigo-500"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                Long Break (min)
              </label>
              <input
                type="number"
                min="1"
                max="60"
                value={longBreak}
                onChange={(e) => setLongBreak(e.target.value)}
                className="w-full px-3 py-2 text-sm rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white font-mono tabular-nums focus:outline-none focus:ring-2 focus:ring-indigo-500"
              />
            </div>
          </div>

          {/* Toggles */}
          <div className="mt-5 pt-4 border-t border-slate-100 dark:border-slate-800 space-y-3">
            <label className="flex items-center gap-3 cursor-pointer">
              <input
                type="checkbox"
                checked={autoSwitch}
                onChange={(e) => setAutoSwitch(e.target.checked)}
                className="rounded border-slate-300 text-indigo-600 focus:ring-indigo-500 w-4 h-4"
              />
              <span className="text-xs text-slate-700 dark:text-slate-300 font-medium">
                Auto-switch sessions (automatically start break after work session ends)
              </span>
            </label>

            <label className="flex items-center gap-3 cursor-pointer">
              <input
                type="checkbox"
                checked={sound}
                onChange={(e) => setSound(e.target.checked)}
                className="rounded border-slate-300 text-indigo-600 focus:ring-indigo-500 w-4 h-4"
              />
              <span className="text-xs text-slate-700 dark:text-slate-300 font-medium">
                Synthesized audio alerts (Web Audio API focus completion and break chimes)
              </span>
            </label>
          </div>
        </div>

        {/* Display & Theme */}
        <div className="p-6 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-xs flex items-center justify-between">
          <div>
            <h4 className="text-sm font-bold text-slate-900 dark:text-white">Interface Theme</h4>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              Toggle between clean light and sleek dark mode.
            </p>
          </div>
          <button
            type="button"
            onClick={toggleTheme}
            className="flex items-center gap-2 px-4 py-2 rounded-xl border border-slate-300 dark:border-slate-700 text-xs font-semibold text-slate-800 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
          >
            {theme === 'dark' ? (
              <>
                <Sun className="w-4 h-4 text-amber-400" />
                <span>Switch to Light</span>
              </>
            ) : (
              <>
                <Moon className="w-4 h-4 text-slate-600" />
                <span>Switch to Dark</span>
              </>
            )}
          </button>
        </div>

        {/* Actions bar */}
        <div className="flex items-center justify-between pt-2">
          <button
            type="button"
            onClick={handleReseed}
            className="flex items-center gap-1.5 px-4 py-2 text-xs font-semibold text-rose-600 dark:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-950/40 rounded-xl transition-colors"
          >
            <RotateCcw className="w-3.5 h-3.5" />
            <span>Reset Demo Data</span>
          </button>

          <button
            type="submit"
            disabled={saving}
            className="px-6 py-2.5 text-xs font-semibold text-white bg-indigo-600 hover:bg-indigo-700 rounded-xl shadow-xs transition-colors disabled:opacity-50"
          >
            {saving ? 'Saving...' : 'Save Preferences'}
          </button>
        </div>
      </form>
    </div>
  );
};
