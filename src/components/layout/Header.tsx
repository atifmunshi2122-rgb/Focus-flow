import React from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { useApp } from '../../context/AppContext.tsx';
import { getStyleDefinition } from '../../theme/stylesRegistry.ts';
import { ThemeButton } from '../ui/ThemePrimitives.tsx';
import { useMotionPreferences } from '../ui/MotionPrimitives.tsx';
import { MOTION_DURATION, MOTION_EASING } from '../../theme/motionTokens.ts';
import { NotificationCenter } from '../common/NotificationCenter.tsx';
import {
  Menu,
  Play,
  Pause,
  Plus,
  RefreshCw,
  Sun,
  Moon,
  FileSpreadsheet,
  LogOut,
  Palette,
  Search,
  WifiOff,
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
    stopwatchElapsed,
    timerEngine,
    timerMode,
    startTimer,
    pauseTimer,
    theme,
    toggleTheme,
    firebaseUser,
    isAuthenticated,
    signInWithGoogle,
    signOutGoogle,
    googleSpreadsheetId,
    syncStatus,
    syncNowToGoogleSheets,
    effectiveThemeConfig,
    setCommandCenterOpen,
    isOnline,
  } = useApp();

  const { isDisabled } = useMotionPreferences();
  const activeStyle = getStyleDefinition(effectiveThemeConfig.styleId);

  const tabLabels: Record<string, string> = {
    dashboard: 'Executive Dashboard',
    calendar: 'Productivity Calendar',
    focus: 'Focus & Pomodoro Timer',
    timeblocks: 'Daily Time-Block Planner',
    tasks: 'Task Management',
    finance: 'Financial Command',
    transactions: 'Transaction Ledger',
    bills: 'Bills & Payments Tracker',
    envelopes: 'Envelope Budgets',
    subscriptions: 'Recurring Subscriptions',
    analytics: 'Visual Intelligence & Reports',
    recovery: 'Data Recovery Center',
    settings: 'Settings & Theme Studio',
  };

  const formatTimerMinSec = (seconds: number) => {
    const safeSecs = Math.max(0, Math.floor(Number.isFinite(seconds) ? seconds : 0));
    const mins = Math.floor(safeSecs / 60);
    const secs = safeSecs % 60;
    return `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
  };

  return (
    <header className="ff-header sticky top-0 z-30 flex items-center justify-between gap-2 sm:gap-4 md:gap-6 h-16 px-3 sm:px-4 md:px-6 lg:px-8 max-w-full">
      {/* Zone 1: Mobile Menu Trigger + Section Heading */}
      <div className="flex items-center gap-2.5 sm:gap-3 shrink-0">
        <button
          type="button"
          onClick={onOpenMobileMenu}
          className="lg:hidden p-2 rounded-lg text-[var(--ff-text-muted)] hover:text-[var(--ff-text-primary)] hover:bg-[var(--ff-surface-hover)] transition-colors"
          aria-label="Open navigation menu"
        >
          <Menu className="w-5 h-5" />
        </button>

        <div className="flex items-center gap-2 overflow-hidden">
          <AnimatePresence mode="wait" initial={false}>
            <motion.span
              key={currentTab}
              initial={isDisabled ? false : { opacity: 0, y: 5 }}
              animate={{ opacity: 1, y: 0 }}
              exit={isDisabled ? { opacity: 0 } : { opacity: 0, y: -5 }}
              transition={{ duration: MOTION_DURATION.dropdown * 0.8, ease: MOTION_EASING.decelerate }}
              className="ff-heading text-base md:text-lg font-bold text-[var(--ff-text-primary)] whitespace-nowrap inline-block truncate max-w-[200px] sm:max-w-none"
            >
              {tabLabels[currentTab] || 'Dashboard'}
            </motion.span>
          </AnimatePresence>
        </div>
      </div>

      {/* Zone 2: Refined Breadcrumb & Workspace Context */}
      <div className="hidden lg:flex items-center gap-2 text-xs text-[var(--ff-text-muted)] min-w-0 overflow-hidden">
        <span className="font-semibold text-[var(--ff-text-muted)]/75">FocusFlow</span>
        <span className="text-[var(--ff-text-muted)]/40 font-mono">/</span>
        <span className="font-bold text-[var(--ff-text-primary)] truncate max-w-[220px]">
          {tabLabels[currentTab] || 'Dashboard'}
        </span>
      </div>

      {/* Zone 3: Primary Action Cluster */}
      <div className="flex items-center gap-1.5 sm:gap-2 shrink-0">
        {!isOnline && (
          <span
            className="hidden sm:inline-flex items-center gap-1 px-2 py-1 text-[11px] font-semibold border border-[var(--ff-warning)]/40 bg-[var(--ff-warning-soft)] text-[var(--ff-warning)]"
            style={{ borderRadius: 'var(--ff-radius-button)' }}
            title="Offline mode: changes queue locally until back online"
          >
            <WifiOff className="w-3 h-3" /> Offline
          </span>
        )}

        {/* Universal Command Center Trigger */}
        <button
          type="button"
          onClick={() => setCommandCenterOpen(true)}
          className="flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium border border-[var(--ff-border-color)] text-[var(--ff-text-secondary)] hover:text-[var(--ff-text-primary)] hover:bg-[var(--ff-surface-hover)] transition-colors"
          style={{ borderRadius: 'var(--ff-radius-button)' }}
          title="Open Command Center (Cmd/Ctrl + K)"
          aria-label="Open Command Center"
        >
          <Search className="w-3.5 h-3.5" />
          <span className="hidden lg:inline">Search</span>
          <kbd className="hidden xl:inline text-[10px] font-bold px-1 py-0.2 rounded bg-[var(--ff-surface-subtle)] border border-[var(--ff-border-color)]">
            ⌘K
          </kbd>
        </button>

        {/* Rule-Based Notifications Bell */}
        <NotificationCenter />

        {/* Floating Mini Timer Indicator */}
        <div
          className="hidden xl:flex items-center gap-2 px-2.5 py-1.5 text-xs font-mono font-medium border transition-colors"
          style={{
            borderRadius: 'var(--ff-radius-button)',
            background: isRunning ? 'var(--ff-accent-soft)' : 'var(--ff-surface-muted)',
            borderColor: isRunning ? 'var(--ff-accent-border)' : 'var(--ff-border-color)',
            color: 'var(--ff-text-primary)',
          }}
        >
          {isRunning && (
            <motion.span
              aria-hidden="true"
              animate={isDisabled ? undefined : { scale: [1, 1.35, 1], opacity: [0.65, 1, 0.65] }}
              transition={{ duration: 1.8, repeat: Infinity, ease: 'easeInOut' }}
              className="w-2 h-2 rounded-full shrink-0"
              style={{ backgroundColor: timerMode === 'work' ? 'var(--ff-accent)' : 'var(--ff-success)' }}
            />
          )}
          <span className="tabular-nums font-semibold">
            {formatTimerMinSec(timerEngine === 'stopwatch' ? stopwatchElapsed : timeLeft)}
          </span>
          <span className="text-[10px] uppercase font-sans text-[var(--ff-text-muted)]">
            {timerEngine === 'stopwatch'
              ? 'SW'
              : timerEngine === 'countdown'
                ? 'CD'
                : timerMode === 'work'
                  ? 'Work'
                  : 'Break'}
          </span>
          <button
            type="button"
            onClick={isRunning ? pauseTimer : startTimer}
            className="p-1 rounded hover:bg-[var(--ff-surface-hover)] transition-transform active:scale-90"
            style={{ color: 'var(--ff-accent-text)' }}
            title={isRunning ? 'Pause timer' : 'Start timer'}
            aria-label={isRunning ? 'Pause timer' : 'Start timer'}
          >
            <AnimatePresence mode="wait" initial={false}>
              <motion.span
                key={isRunning ? 'pause' : 'play'}
                initial={isDisabled ? false : { scale: 0.7, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                exit={isDisabled ? { opacity: 0 } : { scale: 0.7, opacity: 0 }}
                transition={{ duration: MOTION_DURATION.micro }}
                className="inline-flex"
              >
                {isRunning ? <Pause className="w-3.5 h-3.5" /> : <Play className="w-3.5 h-3.5" />}
              </motion.span>
            </AnimatePresence>
          </button>
        </div>

        {/* Theme Studio Quick Pill */}
        <button
          type="button"
          onClick={() => setCurrentTab('settings')}
          className="hidden xl:flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-semibold border transition-colors"
          style={{
            borderRadius: 'var(--ff-radius-button)',
            background: 'var(--ff-accent-soft)',
            borderColor: 'var(--ff-accent-border)',
            color: 'var(--ff-accent-text)',
          }}
          title="Customize design style in Theme Studio"
        >
          <Palette className="w-3.5 h-3.5 shrink-0" />
          <span className="hidden lg:inline">{activeStyle.name}</span>
        </button>

        {/* Google Sheets Sync Pill */}
        {googleSpreadsheetId ? (
          <div
            className="flex items-center gap-1.5 px-2.5 py-1.5 text-xs border"
            style={{
              borderRadius: 'var(--ff-radius-button)',
              background: 'var(--ff-success-soft)',
              borderColor: 'color-mix(in oklab, var(--ff-success) 35%, transparent)',
              color: 'var(--ff-success)',
            }}
          >
            <FileSpreadsheet className="w-3.5 h-3.5 shrink-0" />
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
              type="button"
              onClick={() => void syncNowToGoogleSheets()}
              disabled={syncStatus === 'syncing'}
              className="p-1 rounded hover:opacity-80 transition-opacity"
              title="Force sync to Google Sheets now"
              aria-label="Sync to Google Sheets now"
            >
              <RefreshCw className={`w-3 h-3 ${syncStatus === 'syncing' ? 'animate-spin' : ''}`} />
            </button>
          </div>
        ) : (
          <button
            type="button"
            onClick={() => setCurrentTab('settings')}
            className="hidden 2xl:flex items-center gap-1.5 px-2.5 py-1.5 text-xs border border-[var(--ff-border-color)] text-[var(--ff-text-secondary)] hover:bg-[var(--ff-surface-hover)] transition-colors"
            style={{ borderRadius: 'var(--ff-radius-button)' }}
            title="Connect Google Sheets in Settings"
          >
            <FileSpreadsheet className="w-3.5 h-3.5 text-[var(--ff-text-muted)]" />
            <span>Connect Sheets</span>
          </button>
        )}

        {/* Google Sign-in / Profile */}
        {!isAuthenticated ? (
          <ThemeButton
            variant="secondary"
            size="sm"
            onClick={signInWithGoogle}
            title="Sign in with Google"
          >
            <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" aria-hidden="true">
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
          </ThemeButton>
        ) : (
          <div className="flex items-center gap-1.5">
            <div
              className="w-7 h-7 rounded-full overflow-hidden border border-[var(--ff-border-color)] shrink-0"
              title={`Logged in as ${firebaseUser?.displayName || firebaseUser?.email}`}
            >
              {firebaseUser?.photoURL ? (
                <img
                  src={firebaseUser.photoURL}
                  alt={firebaseUser.displayName || 'User'}
                  className="w-full h-full object-cover"
                />
              ) : (
                <div
                  className="w-full h-full flex items-center justify-center font-bold text-xs"
                  style={{
                    background: 'var(--ff-accent)',
                    color: 'var(--ff-accent-contrast)',
                  }}
                >
                  {(firebaseUser?.displayName || 'U')[0].toUpperCase()}
                </div>
              )}
            </div>
            <button
              type="button"
              onClick={signOutGoogle}
              className="p-1.5 rounded-lg text-[var(--ff-text-muted)] hover:text-[var(--ff-text-primary)] transition-colors"
              title="Sign out of Google"
              aria-label="Sign out of Google"
            >
              <LogOut className="w-3.5 h-3.5" />
            </button>
          </div>
        )}

        {/* Mobile Theme Toggle */}
        <button
          type="button"
          onClick={toggleTheme}
          className="lg:hidden p-2 rounded-lg text-[var(--ff-text-muted)] hover:text-[var(--ff-text-primary)] hover:bg-[var(--ff-surface-hover)] transition-colors"
          aria-label="Toggle light or dark mode"
        >
          <AnimatePresence mode="wait" initial={false}>
            <motion.span
              key={theme}
              initial={isDisabled ? false : { rotate: -35, scale: 0.7, opacity: 0 }}
              animate={{ rotate: 0, scale: 1, opacity: 1 }}
              exit={isDisabled ? { opacity: 0 } : { rotate: 35, scale: 0.7, opacity: 0 }}
              transition={{ duration: MOTION_DURATION.micro }}
              className="inline-flex"
            >
              {theme === 'dark' ? (
                <Sun className="w-4 h-4" style={{ color: 'var(--ff-warning)' }} />
              ) : (
                <Moon className="w-4 h-4" />
              )}
            </motion.span>
          </AnimatePresence>
        </button>

        {/* Primary Action Button */}
        <ThemeButton
          variant="primary"
          size="sm"
          onClick={onOpenQuickAction}
          className="whitespace-nowrap shrink-0"
        >
          <Plus className="w-4 h-4" />
          <span className="hidden sm:inline">Quick Action</span>
          <span className="sm:hidden">Action</span>
        </ThemeButton>
      </div>
    </header>
  );
};
