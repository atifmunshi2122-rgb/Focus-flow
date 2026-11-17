import React, { useEffect, useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { useApp } from '../../context/AppContext.tsx';
import { getStyleDefinition } from '../../theme/stylesRegistry.ts';
import { ThemeButton } from '../ui/ThemePrimitives.tsx';
import { RollingTimerDigits, useMotionPreferences } from '../ui/MotionPrimitives.tsx';
import { MOTION_DURATION, MOTION_EASING } from '../../theme/motionTokens.ts';
import { NotificationCenter } from '../common/NotificationCenter.tsx';
import type { QuickActionType } from '../common/QuickActionModal.tsx';
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
  Keyboard,
} from 'lucide-react';

interface HeaderProps {
  onOpenMobileMenu: () => void;
  onOpenQuickAction: (initialType?: QuickActionType) => void;
}

export const Header: React.FC<HeaderProps> = ({ onOpenMobileMenu, onOpenQuickAction }) => {
  const {
    currentTab,
    setCurrentTab,
    isRunning,
    timeLeft,
    totalDuration,
    stopwatchElapsed,
    timerEngine,
    timerMode,
    startTimer,
    pauseTimer,
    theme,
    toggleTheme,
    firebaseUser,
    isAuthenticated,
    isSigningIn,
    signInWithGoogle,
    signOutGoogle,
    googleSpreadsheetId,
    syncStatus,
    syncNowToGoogleSheets,
    effectiveThemeConfig,
    setCommandCenterOpen,
    isOnline,
    offlineOutboxCount,
    isSyncingOutbox,
    reconcileOutboxNow,
    setKeyboardShortcutsGuideOpen,
  } = useApp();

  const { isDisabled, profile } = useMotionPreferences();
  const activeStyle = getStyleDefinition(effectiveThemeConfig.styleId);
  const [isScrolled, setIsScrolled] = useState(false);

  const isPaused = !isRunning && (
    timerEngine === 'stopwatch'
      ? stopwatchElapsed > 0
      : timeLeft < totalDuration && timeLeft > 0
  );

  useEffect(() => {
    const onScroll = () => {
      const next = window.scrollY > 8;
      setIsScrolled((prev) => (prev === next ? prev : next));
    };
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  const tabLabels: Record<string, string> = {
    dashboard: 'Executive Dashboard',
    calendar: 'Productivity Calendar',
    focus: 'Focus & Pomodoro Timer',
    clock: 'Real Clock & World Time',
    timeblocks: 'Daily Time-Block Planner',
    tasks: 'Task Management',
    habits: 'Habit Tracker & Streaks',
    study: 'Study & Academic Management',
    finance: 'Financial Command',
    transactions: 'Transaction Ledger',
    bills: 'Bills & Payments Tracker',
    envelopes: 'Envelope Budgets',
    subscriptions: 'Recurring Subscriptions',
    analytics: 'Visual Intelligence & Reports',
    recovery: 'Data Recovery Center',
    settings: 'Settings & Theme Studio',
  };

  const tabSectionMap: Record<string, string> = {
    dashboard: 'Overview',
    calendar: 'Overview',
    focus: 'Focus Lab',
    clock: 'Focus Lab',
    timeblocks: 'Focus Lab',
    tasks: 'Focus Lab',
    habits: 'Focus Lab',
    study: 'Academics & Focus',
    finance: 'Wealth Command',
    transactions: 'Wealth Command',
    bills: 'Wealth Command',
    envelopes: 'Wealth Command',
    subscriptions: 'Wealth Command',
    analytics: 'Intelligence',
    recovery: 'Intelligence',
    settings: 'Preferences',
  };

  const formatTimerMinSec = (seconds: number) => {
    const safeSecs = Math.max(0, Math.floor(Number.isFinite(seconds) ? seconds : 0));
    const mins = Math.floor(safeSecs / 60);
    const secs = safeSecs % 60;
    return `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
  };

  return (
    <header
      data-scrolled={isScrolled ? 'true' : 'false'}
      className="ff-header sticky top-0 z-30 flex items-center justify-between gap-1.5 sm:gap-3 lg:gap-4 h-16 px-2.5 sm:px-4 md:px-6 lg:px-6 2xl:px-8 max-w-full"
    >
      {/* Zone 1: Mobile Menu Trigger + Section Heading */}
      <div className="flex items-center gap-1.5 sm:gap-3 min-w-0 shrink">
        <button
          type="button"
          onClick={onOpenMobileMenu}
          className="lg:hidden min-w-[40px] min-h-[40px] sm:min-w-[44px] sm:min-h-[44px] flex items-center justify-center p-2 rounded-lg text-[var(--ff-text-muted)] hover:text-[var(--ff-text-primary)] hover:bg-[var(--ff-surface-hover)] transition-colors shrink-0"
          aria-label="Open navigation menu"
        >
          <Menu className="w-5 h-5" />
        </button>

        <div className="flex items-center gap-2 overflow-hidden min-w-0">
          <AnimatePresence mode="popLayout" initial={false}>
            <motion.span
              key={currentTab}
              initial={isDisabled ? false : { opacity: 0, y: 5 }}
              animate={{ opacity: 1, y: 0 }}
              exit={isDisabled ? { opacity: 0 } : { opacity: 0, y: -5 }}
              transition={{ duration: MOTION_DURATION.dropdown * 0.8, ease: MOTION_EASING.decelerate }}
              className="ff-heading text-sm sm:text-base md:text-lg font-bold text-[var(--ff-text-primary)] whitespace-nowrap inline-block truncate max-w-[120px] xs:max-w-[170px] sm:max-w-[220px] xl:max-w-none"
            >
              {tabLabels[currentTab] || 'Dashboard'}
            </motion.span>
          </AnimatePresence>
        </div>
      </div>

      {/* Zone 2: Animated Breadcrumbs & Workspace Context (Shown on wide displays) */}
      <div className="hidden 2xl:flex items-center gap-1.5 text-xs shrink-0 select-none">
        <button
          type="button"
          onClick={() => setCurrentTab('dashboard')}
          className="text-[var(--ff-text-muted)] hover:text-[var(--ff-text-primary)] transition-colors font-medium whitespace-nowrap shrink-0"
          title="Go to Dashboard"
        >
          FocusFlow
        </button>
        <span className="text-[var(--ff-text-muted)] opacity-50 select-none">/</span>
        <span className="text-[var(--ff-text-muted)] font-medium whitespace-nowrap shrink-0">
          {tabSectionMap[currentTab] || 'Workspace'}
        </span>
        <span className="text-[var(--ff-text-muted)] opacity-50 select-none">/</span>
        <AnimatePresence mode="wait">
          <motion.span
            key={currentTab}
            initial={isDisabled ? false : { opacity: 0, x: -3 }}
            animate={{ opacity: 1, x: 0 }}
            exit={isDisabled ? { opacity: 0 } : { opacity: 0, x: 3 }}
            transition={{ duration: 0.16 }}
            className="font-bold text-[var(--ff-accent-text)] whitespace-nowrap shrink-0"
          >
            {tabLabels[currentTab] || 'Dashboard'}
          </motion.span>
        </AnimatePresence>
      </div>

      {/* Zone 3: Primary Action Cluster */}
      <div className="flex items-center gap-1.5 sm:gap-2 shrink-0">
        {!isOnline && (
          <span
            className="inline-flex items-center gap-1 px-2 py-1 text-[11px] font-semibold border border-[var(--ff-warning)]/40 bg-[var(--ff-warning-soft)] text-[var(--ff-warning)]"
            style={{ borderRadius: 'var(--ff-radius-button)' }}
            title="Offline mode: changes queue locally until back online"
          >
            <WifiOff className="w-3 h-3" />
            <span className="hidden xs:inline sm:inline">Offline</span>
          </span>
        )}

        {isOnline && offlineOutboxCount > 0 && (
          <button
            type="button"
            onClick={() => void reconcileOutboxNow()}
            disabled={isSyncingOutbox}
            className="inline-flex items-center gap-1 px-2 py-1 text-[11px] font-medium border border-blue-500/30 bg-blue-500/10 text-blue-600 dark:text-blue-400 hover:bg-blue-500/20 transition-colors disabled:opacity-50"
            style={{ borderRadius: 'var(--ff-radius-button)' }}
            title="Pending changes queued offline. Click to sync now."
          >
            <RefreshCw className={`w-3 h-3 ${isSyncingOutbox ? 'animate-spin' : ''}`} />
            <span>{offlineOutboxCount} pending</span>
          </button>
        )}

        {/* Universal Command Center Trigger */}
        <motion.button
          type="button"
          whileHover={isDisabled ? undefined : { y: profile.hoverLiftPx * 0.5 }}
          whileTap={isDisabled ? undefined : { scale: profile.tapScale }}
          transition={profile.microSpring}
          onClick={() => setCommandCenterOpen(true)}
          className="flex items-center justify-center gap-1.5 p-2 sm:px-2.5 sm:py-1.5 min-w-[38px] min-h-[38px] text-xs font-medium border border-[var(--ff-border-color)] text-[var(--ff-text-secondary)] hover:text-[var(--ff-text-primary)] hover:bg-[var(--ff-surface-hover)] transition-colors shrink-0"
          style={{ borderRadius: 'var(--ff-radius-button)' }}
          title="Open Command Center (Cmd/Ctrl + K)"
          aria-label="Open Command Center"
        >
          <Search className="w-3.5 h-3.5 shrink-0" />
          <span className="hidden 2xl:inline">Search</span>
          <kbd className="hidden sm:inline text-[10px] font-bold px-1 py-0.2 rounded bg-[var(--ff-surface-subtle)] border border-[var(--ff-border-color)]">
            ⌘K
          </kbd>
        </motion.button>

        {/* Keyboard Shortcuts Cheat-Sheet Trigger */}
        <motion.button
          type="button"
          whileHover={isDisabled ? undefined : { y: profile.hoverLiftPx * 0.5 }}
          whileTap={isDisabled ? undefined : { scale: profile.tapScale }}
          transition={profile.microSpring}
          onClick={() => setKeyboardShortcutsGuideOpen(true)}
          className="hidden sm:flex items-center justify-center p-2 rounded-lg border border-[var(--ff-border-color)] text-[var(--ff-text-secondary)] hover:text-[var(--ff-text-primary)] hover:bg-[var(--ff-surface-hover)] transition-colors shrink-0"
          style={{ borderRadius: 'var(--ff-radius-button)' }}
          title="Keyboard Shortcuts Cheat-Sheet (?)"
          aria-label="Keyboard Shortcuts Guide"
        >
          <Keyboard className="w-3.5 h-3.5" />
        </motion.button>

        {/* Rule-Based Notifications Bell */}
        <NotificationCenter />

        {/* Floating Mini Timer Indicator (Stable layout capsule with zero overlap) */}
        <div
          className="hidden xl:flex items-center gap-1.5 2xl:gap-2 px-2 2xl:px-2.5 py-1.5 text-xs font-mono font-medium border transition-colors select-none shrink-0"
          style={{
            borderRadius: 'var(--ff-radius-button)',
            background: isRunning
              ? 'var(--ff-accent-soft)'
              : isPaused
              ? 'rgba(245, 158, 11, 0.14)'
              : 'var(--ff-surface-muted)',
            borderColor: isRunning
              ? 'var(--ff-accent-border)'
              : isPaused
              ? 'rgba(245, 158, 11, 0.45)'
              : 'var(--ff-border-color)',
            color: 'var(--ff-text-primary)',
          }}
        >
          {/* Status Indicator Dot with fixed layout slot */}
          <div className="w-2 h-2 flex items-center justify-center shrink-0">
            {isRunning ? (
              <span
                className="w-2 h-2 rounded-full shrink-0"
                style={{
                  backgroundColor: timerMode === 'work' ? 'var(--ff-accent)' : 'var(--ff-success)',
                  animation: isDisabled ? 'none' : 'pulse 1.8s cubic-bezier(0.4, 0, 0.6, 1) infinite',
                }}
                aria-hidden="true"
              />
            ) : isPaused ? (
              <span
                className="w-2 h-2 rounded-full shrink-0 bg-amber-500"
                aria-hidden="true"
              />
            ) : (
              <span
                className="w-1.5 h-1.5 rounded-full shrink-0 bg-[var(--ff-text-muted)] opacity-40"
                aria-hidden="true"
              />
            )}
          </div>

          <RollingTimerDigits
            value={formatTimerMinSec(timerEngine === 'stopwatch' ? stopwatchElapsed : timeLeft)}
            className="font-semibold tabular-nums"
          />
          <span className="hidden 2xl:inline text-[10px] uppercase font-sans text-[var(--ff-text-muted)] shrink-0">
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
            className="p-1 rounded hover:bg-[var(--ff-surface-hover)] transition-colors shrink-0 ml-0.5"
            style={{ color: isPaused ? '#f59e0b' : 'var(--ff-accent-text)' }}
            title={isRunning ? 'Pause timer' : isPaused ? 'Resume timer' : 'Start timer'}
            aria-label={isRunning ? 'Pause timer' : isPaused ? 'Resume timer' : 'Start timer'}
          >
            {isRunning ? <Pause className="w-3.5 h-3.5" /> : <Play className="w-3.5 h-3.5" />}
          </button>
        </div>

        {/* Theme Studio Quick Pill */}
        <button
          type="button"
          onClick={() => setCurrentTab('settings')}
          className="hidden xl:flex items-center gap-1.5 px-2 2xl:px-2.5 py-1.5 text-xs font-semibold border transition-colors shrink-0"
          style={{
            borderRadius: 'var(--ff-radius-button)',
            background: 'var(--ff-accent-soft)',
            borderColor: 'var(--ff-accent-border)',
            color: 'var(--ff-accent-text)',
          }}
          title={`Active theme: ${activeStyle.name}. Click to open Theme Studio`}
          aria-label={`Active theme: ${activeStyle.name}`}
        >
          <Palette className="w-3.5 h-3.5 shrink-0" />
          <span className="hidden 2xl:inline">{activeStyle.name}</span>
        </button>

        {/* Google Sheets Sync Pill */}
        {googleSpreadsheetId ? (
          <div
            className="flex items-center gap-1.5 px-2 2xl:px-2.5 py-1.5 text-xs border shrink-0"
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
              className="hidden 2xl:inline font-semibold hover:underline"
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
            className="hidden 2xl:flex items-center gap-1.5 px-2.5 py-1.5 text-xs border border-[var(--ff-border-color)] text-[var(--ff-text-secondary)] hover:bg-[var(--ff-surface-hover)] transition-colors shrink-0"
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
            loading={isSigningIn}
            loadingText="Signing in..."
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
          className="lg:hidden min-w-[38px] min-h-[38px] flex items-center justify-center p-2 rounded-lg text-[var(--ff-text-muted)] hover:text-[var(--ff-text-primary)] hover:bg-[var(--ff-surface-hover)] transition-colors shrink-0"
          aria-label="Toggle light or dark mode"
        >
          <AnimatePresence mode="popLayout" initial={false}>
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
          onClick={() => onOpenQuickAction()}
          className="whitespace-nowrap shrink-0 ff-header-quick-action"
        >
          <Plus className="w-4 h-4" />
          <span className="hidden sm:inline">Quick Action</span>
          <span className="hidden xs:inline sm:hidden">Action</span>
        </ThemeButton>
      </div>
    </header>
  );
};
