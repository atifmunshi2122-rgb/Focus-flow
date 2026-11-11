import React from 'react';
import { useApp } from '../../context/AppContext.tsx';
import {
  Menu,
  Play,
  Pause,
  Plus,
  RefreshCw,
  Sun,
  Moon,
  FileSpreadsheet,
  ExternalLink,
  Check,
  AlertCircle,
  LogIn,
  LogOut,
} from 'lucide-react';

interface HeaderProps {
  onOpenMobileMenu: () => void;
  onOpenQuickAction: () => void;
}

export const Header: React.FC<HeaderProps> = ({ onOpenMobileMenu, onOpenQuickAction }) => {
  const {
    currentTab,
    setCurrentTab,
    isRunning,
    timeLeft,
    timerMode,
    startTimer,
    pauseTimer,
    theme,
    toggleTheme,
    triggerRefresh,
    firebaseUser,
    isAuthenticated,
    signInWithGoogle,
    signOutGoogle,
    googleSpreadsheetId,
    syncStatus,
    syncNowToGoogleSheets,
  } = useApp();

  const tabLabels: Record<string, string> = {
    dashboard: 'Executive Dashboard',
    focus: 'Focus & Pomodoro Timer',
    tasks: 'Task Management',
    finance: 'Financial Command',
    transactions: 'Transaction Ledger',
    bills: 'Bills & Payments Tracker',
    analytics: 'Visual Intelligence & Reports',
    settings: 'System & User Preferences',
  };

  const formatTimerMinSec = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
  };

  return (
    <header className="sticky top-0 z-30 flex items-center justify-between gap-8 h-16 px-4 md:px-8 border-b border-slate-200 dark:border-slate-800 bg-white/80 dark:bg-slate-900/80 backdrop-blur-md">
      {/* Zone 1: Single text element wordmark or contextual section breadcrumb */}
      <div className="flex items-center gap-3 shrink-0">
        <button
          onClick={onOpenMobileMenu}
          className="lg:hidden p-2 rounded-lg text-slate-500 hover:text-slate-900 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
          aria-label="Open navigation menu"
        >
          <Menu className="w-5 h-5" />
        </button>

        <div className="flex items-center gap-2">
          <span className="text-base md:text-lg font-bold tracking-tight text-slate-900 dark:text-white whitespace-nowrap">
            {tabLabels[currentTab] || 'Dashboard'}
          </span>
        </div>
      </div>

      {/* Zone 2: 4-5 clean single-line text links / status indicator */}
      <nav className="hidden md:flex items-center gap-6 text-sm font-medium text-slate-600 dark:text-slate-400">
        <button
          onClick={() => setCurrentTab('dashboard')}
          className={`transition-colors whitespace-nowrap shrink-0 hover:text-slate-900 dark:hover:text-white ${
            currentTab === 'dashboard' ? 'text-indigo-600 dark:text-indigo-400 font-semibold' : ''
          }`}
        >
          Overview
        </button>
        <button
          onClick={() => setCurrentTab('focus')}
          className={`transition-colors whitespace-nowrap shrink-0 hover:text-slate-900 dark:hover:text-white ${
            currentTab === 'focus' ? 'text-indigo-600 dark:text-indigo-400 font-semibold' : ''
          }`}
        >
          Focus
        </button>
        <button
          onClick={() => setCurrentTab('finance')}
          className={`transition-colors whitespace-nowrap shrink-0 hover:text-slate-900 dark:hover:text-white ${
            currentTab === 'finance' ? 'text-indigo-600 dark:text-indigo-400 font-semibold' : ''
          }`}
        >
          Finance
        </button>
        <button
          onClick={() => setCurrentTab('bills')}
          className={`transition-colors whitespace-nowrap shrink-0 hover:text-slate-900 dark:hover:text-white ${
            currentTab === 'bills' ? 'text-indigo-600 dark:text-indigo-400 font-semibold' : ''
          }`}
        >
          Bills
        </button>
        <button
          onClick={() => setCurrentTab('analytics')}
          className={`transition-colors whitespace-nowrap shrink-0 hover:text-slate-900 dark:hover:text-white ${
            currentTab === 'analytics' ? 'text-indigo-600 dark:text-indigo-400 font-semibold' : ''
          }`}
        >
          Analytics
        </button>
      </nav>

      {/* Zone 3: 1 primary action cluster */}
      <div className="flex items-center gap-2.5 shrink-0">
        {/* Floating Mini Timer Indicator */}
        <div className="hidden xl:flex items-center gap-2 px-2.5 py-1.5 rounded-lg bg-slate-100 dark:bg-slate-800 text-xs font-mono font-medium text-slate-700 dark:text-slate-300">
          <span className="tabular-nums font-semibold">{formatTimerMinSec(timeLeft)}</span>
          <span className="text-[10px] uppercase font-sans text-slate-500 dark:text-slate-400">
            {timerMode === 'work' ? 'Work' : 'Break'}
          </span>
          <button
            onClick={isRunning ? pauseTimer : startTimer}
            className="p-1 rounded text-slate-600 hover:text-indigo-600 dark:text-slate-300 dark:hover:text-indigo-400"
            title={isRunning ? 'Pause timer' : 'Start timer'}
          >
            {isRunning ? <Pause className="w-3.5 h-3.5" /> : <Play className="w-3.5 h-3.5" />}
          </button>
        </div>

        {/* Google Sheets Sync Pill */}
        {googleSpreadsheetId ? (
          <div className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-800/60 text-emerald-700 dark:text-emerald-300 text-xs">
            <FileSpreadsheet className="w-3.5 h-3.5 shrink-0 text-emerald-600 dark:text-emerald-400" />
            <a
              href={`https://docs.google.com/spreadsheets/d/${googleSpreadsheetId}`}
              target="_blank"
              rel="noopener noreferrer"
              className="hidden sm:inline font-semibold hover:underline"
              title="Open Google Sheets workbook"
            >
              Sheets Synced
            </a>
            <button
              onClick={() => syncNowToGoogleSheets()}
              disabled={syncStatus === 'syncing'}
              className="p-1 rounded hover:bg-emerald-100 dark:hover:bg-emerald-900/60 transition-colors"
              title="Force sync to Google Sheets now"
            >
              <RefreshCw className={`w-3 h-3 ${syncStatus === 'syncing' ? 'animate-spin' : ''}`} />
            </button>
          </div>
        ) : (
          <button
            onClick={() => setCurrentTab('settings')}
            className="hidden sm:flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 text-xs text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
            title="Connect Google Sheets in Settings"
          >
            <FileSpreadsheet className="w-3.5 h-3.5 text-slate-500" />
            <span>Connect Sheets</span>
          </button>
        )}

        {/* Google Sign-in / Profile */}
        {!isAuthenticated ? (
          <button
            onClick={signInWithGoogle}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-800 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-700 shadow-xs transition-colors"
            title="Sign in with Google"
          >
            <svg className="w-3.5 h-3.5" viewBox="0 0 24 24">
              <path
                fill="#4285F4"
                d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
              />
              <path
                fill="#34A853"
                d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
              />
              <path
                fill="#FBBC05"
                d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z"
              />
              <path
                fill="#EA4335"
                d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z"
              />
            </svg>
            <span className="hidden sm:inline">Sign in</span>
          </button>
        ) : (
          <div className="flex items-center gap-1.5">
            <div
              className="w-7 h-7 rounded-full overflow-hidden border border-slate-300 dark:border-slate-700 bg-slate-200 shrink-0"
              title={`Logged in as ${firebaseUser?.displayName || firebaseUser?.email}`}
            >
              {firebaseUser?.photoURL ? (
                <img
                  src={firebaseUser.photoURL}
                  alt={firebaseUser.displayName || 'User'}
                  className="w-full h-full object-cover"
                />
              ) : (
                <div className="w-full h-full flex items-center justify-center font-bold text-xs bg-indigo-600 text-white">
                  {(firebaseUser?.displayName || 'U')[0].toUpperCase()}
                </div>
              )}
            </div>
            <button
              onClick={signOutGoogle}
              className="p-1.5 rounded-lg text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 transition-colors"
              title="Sign out of Google"
            >
              <LogOut className="w-3.5 h-3.5" />
            </button>
          </div>
        )}

        {/* Mobile Theme Toggle */}
        <button
          onClick={toggleTheme}
          className="lg:hidden p-2 rounded-lg text-slate-500 hover:text-slate-800 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
          aria-label="Toggle theme"
        >
          {theme === 'dark' ? <Sun className="w-4 h-4 text-amber-400" /> : <Moon className="w-4 h-4" />}
        </button>

        {/* Primary Action Button */}
        <button
          onClick={onOpenQuickAction}
          className="flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold text-white bg-indigo-600 hover:bg-indigo-700 rounded-lg shadow-sm transition-all whitespace-nowrap shrink-0 active:scale-95"
        >
          <Plus className="w-4 h-4" />
          <span className="hidden sm:inline">Quick Action</span>
          <span className="sm:hidden">Action</span>
        </button>
      </div>
    </header>
  );
};
