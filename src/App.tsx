/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useEffect, useState, Suspense, lazy } from 'react';
import { AppProvider, NavTab, useApp } from './context/AppContext.tsx';
import { Sidebar } from './components/layout/Sidebar.tsx';
import { Header } from './components/layout/Header.tsx';
import { ToastContainer } from './components/layout/ToastContainer.tsx';
import { QuickActionModal, type QuickActionType } from './components/common/QuickActionModal.tsx';
import { CommandCenter } from './components/common/CommandCenter.tsx';
import { TrashRestoreModal } from './components/common/TrashRestoreModal.tsx';
import { ConfirmDialogModal } from './components/common/ConfirmDialogModal.tsx';
import { AuthRecoveryModal } from './components/common/AuthRecoveryModal.tsx';
import { KeyboardShortcutsModal } from './components/common/KeyboardShortcutsModal.tsx';
import { TabLoadingFallback } from './components/common/TabLoadingFallback.tsx';
import { LazyChunkErrorBoundary } from './components/common/LazyChunkErrorBoundary.tsx';
import { StagingConfigurationFallback } from './components/common/StagingConfigurationFallback.tsx';
import { configurationError } from './lib/firebase.ts';
import { UnifiedDashboard } from './components/dashboard/UnifiedDashboard.tsx';
import { PomodoroTimer } from './components/focus/PomodoroTimer.tsx';
import { getStyleDefinition } from './theme/stylesRegistry.ts';
import { ThemeButton } from './components/ui/ThemePrimitives.tsx';
import { MotionPage } from './components/ui/MotionPrimitives.tsx';
import { MOTION_EASING, MOTION_DURATION, getIntensityFactor, getThemeMotionProfile } from './theme/motionTokens.ts';
import { AnimatePresence, MotionConfig, motion } from 'motion/react';

// Resilient lazy loader: retries once after a short backoff on transient chunk/module fetch errors
function lazyWithRetry<T extends React.ComponentType<any>>(
  loader: () => Promise<{ default: T }>
): React.LazyExoticComponent<T> {
  return lazy(async () => {
    try {
      return await loader();
    } catch (err) {
      await new Promise((resolve) => setTimeout(resolve, 400));
      return await loader();
    }
  });
}

// Lazy-loaded tab components (loaded on-demand to optimize initial bundle size)
const RealClock = lazyWithRetry(() => import('./components/focus/RealClock.tsx').then((m) => ({ default: m.RealClock })));
const FocusAnalytics = lazyWithRetry(() => import('./components/focus/FocusAnalytics.tsx').then((m) => ({ default: m.FocusAnalytics })));
const TaskManager = lazyWithRetry(() => import('./components/tasks/TaskManager.tsx').then((m) => ({ default: m.TaskManager })));
const HabitTrackerView = lazyWithRetry(() => import('./components/focus/HabitTrackerView.tsx').then((m) => ({ default: m.HabitTrackerView })));
const FinanceOverview = lazyWithRetry(() => import('./components/finance/FinanceOverview.tsx').then((m) => ({ default: m.FinanceOverview })));
const BillsTracker = lazyWithRetry(() => import('./components/finance/BillsTracker.tsx').then((m) => ({ default: m.BillsTracker })));
const TransactionsLedger = lazyWithRetry(() => import('./components/finance/TransactionsLedger.tsx').then((m) => ({ default: m.TransactionsLedger })));
const EnvelopeBudgetManager = lazyWithRetry(() => import('./components/finance/EnvelopeBudgetManager.tsx').then((m) => ({ default: m.EnvelopeBudgetManager })));
const SubscriptionManager = lazyWithRetry(() => import('./components/finance/SubscriptionManager.tsx').then((m) => ({ default: m.SubscriptionManager })));
const JointVaultsView = lazyWithRetry(() => import('./components/finance/JointVaultsView.tsx').then((m) => ({ default: m.JointVaultsView })));
const StudyView = lazyWithRetry(() => import('./components/study/StudyView.tsx').then((m) => ({ default: m.StudyView })));
const StudyLeaderboardView = lazyWithRetry(() => import('./components/study/StudyLeaderboardView.tsx').then((m) => ({ default: m.StudyLeaderboardView })));
const AnalyticsReportsView = lazyWithRetry(() => import('./components/analytics/AnalyticsReportsView.tsx').then((m) => ({ default: m.AnalyticsReportsView })));
const ExportCenterView = lazyWithRetry(() => import('./components/export/ExportCenterView.tsx').then((m) => ({ default: m.ExportCenterView })));
const ProductivityCalendar = lazyWithRetry(() => import('./components/calendar/ProductivityCalendar.tsx').then((m) => ({ default: m.ProductivityCalendar })));
const DailyTimeBlockPlanner = lazyWithRetry(() => import('./components/focus/DailyTimeBlockPlanner.tsx').then((m) => ({ default: m.DailyTimeBlockPlanner })));
const SettingsView = lazyWithRetry(() => import('./components/settings/SettingsView.tsx').then((m) => ({ default: m.SettingsView })));
const DataRecoveryCenter = lazyWithRetry(() => import('./components/settings/DataRecoveryCenter.tsx').then((m) => ({ default: m.DataRecoveryCenter })));
const SheetHubView = lazyWithRetry(() => import('./components/sheets-hub/SheetHubView.tsx').then((m) => ({ default: m.SheetHubView })));
import {
  Check,
  Eye,
  X,
  LayoutDashboard,
  Timer,
  CheckSquare,
  Wallet,
  Settings,
  MoreHorizontal,
  GraduationCap,
  Trophy,
  Flame,
  Calendar,
  Clock,
  ReceiptText,
  CreditCard,
  Layers,
  Repeat,
  Heart,
  BarChart3,
  Download,
  FileSpreadsheet,
  ShieldAlert,
  LogOut,
} from 'lucide-react';

const PRIMARY_MOBILE_TABS: NavTab[] = ['dashboard', 'focus', 'tasks', 'finance'];

interface MobileMoreItem {
  id: NavTab;
  label: string;
  shortLabel: string;
  icon: React.ComponentType<{ className?: string }>;
  badge?: string;
}

const MOBILE_MORE_SECTIONS: Array<{ title: string; items: MobileMoreItem[] }> = [
  {
    title: 'Focus & Schedule',
    items: [
      { id: 'calendar', label: 'Calendar', shortLabel: 'Calendar', icon: Calendar },
      { id: 'clock', label: 'Real Clock', shortLabel: 'Clock', icon: Clock },
      { id: 'timeblocks', label: 'Time Blocks', shortLabel: 'Blocks', icon: Clock },
    ],
  },
  {
    title: 'Wealth & Finance',
    items: [
      { id: 'vaults', label: 'Couple Vaults', shortLabel: 'Vaults', icon: Heart, badge: 'New' },
      { id: 'transactions', label: 'Transactions', shortLabel: 'Ledger', icon: ReceiptText },
      { id: 'bills', label: 'Bills & Payments', shortLabel: 'Bills', icon: CreditCard },
      { id: 'envelopes', label: 'Envelope Budgets', shortLabel: 'Envelopes', icon: Layers },
      { id: 'subscriptions', label: 'Subscriptions', shortLabel: 'Subs', icon: Repeat },
    ],
  },
  {
    title: 'Data, Reports & System',
    items: [
      { id: 'sheet_hub', label: 'Sheet Sync Hub', shortLabel: 'Sheets', icon: FileSpreadsheet, badge: 'Sync' },
      { id: 'analytics', label: 'Analytics', shortLabel: 'Analytics', icon: BarChart3 },
      { id: 'exports', label: 'Export Center', shortLabel: 'Exports', icon: Download },
      { id: 'recovery', label: 'Data Recovery', shortLabel: 'Recovery', icon: ShieldAlert },
      { id: 'settings', label: 'Settings', shortLabel: 'Settings', icon: Settings },
    ],
  },
];

const MOBILE_ACTIVE_TAB_META: Record<string, { label: string; icon: React.ComponentType<{ className?: string }> }> = {
  study: { label: 'Study', icon: GraduationCap },
  leaderboard: { label: 'Ranks', icon: Trophy },
  habits: { label: 'Habits', icon: Flame },
  ...Object.fromEntries(
    MOBILE_MORE_SECTIONS.flatMap((sec) =>
      sec.items.map((item) => [item.id, { label: item.shortLabel, icon: item.icon }])
    )
  ),
};

const MainContent: React.FC = () => {
  const {
    currentTab,
    setCurrentTab,
    settings,
    setCommandCenterOpen,
    effectiveThemeConfig,
    isFullAppPreview,
    previewThemeConfig,
    applyThemeConfig,
    stopFullAppPreview,
    resolvedThemeMode,
    confirmDialogState,
    resolveConfirmDialog,
    authError,
    clearAuthError,
    isAuthenticated,
    user,
    isSigningIn,
    signInWithGoogle,
    signOutGoogle,
    authorizeGoogleSheets,
    authorizeSheetHubReadOnly,
    isRunning,
    startTimer,
    pauseTimer,
    showToast,
    keyboardShortcutsGuideOpen,
    setKeyboardShortcutsGuideOpen,
    quickActionInitialType,
    setQuickActionInitialType,
  } = useApp();
  const [collapsed, setCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [quickActionOpen, setQuickActionOpen] = useState(false);
  const [quickActionInitialDate, setQuickActionInitialDate] = useState<string | undefined>(undefined);
  const [quickActionContext, setQuickActionContext] = useState<'global' | 'finance' | 'calendar'>('global');
  const [mobileMoreOpen, setMobileMoreOpen] = useState(false);
  const [guestBannerDismissed, setGuestBannerDismissed] = useState(false);

  const handleOpenQuickAction = (
    initialType?: QuickActionType | string,
    initialDate?: string,
    context: 'global' | 'finance' | 'calendar' = 'global'
  ) => {
    setQuickActionContext(context);
    if (
      initialType === 'expense' ||
      initialType === 'income' ||
      initialType === 'task' ||
      initialType === 'bill' ||
      initialType === 'habit' ||
      initialType === 'envelope' ||
      initialType === 'goal'
    ) {
      setQuickActionInitialType(initialType);
    } else {
      setQuickActionInitialType(context === 'finance' ? 'expense' : 'task');
    }
    setQuickActionInitialDate(initialDate);
    setQuickActionOpen(true);
  };

  // Global keyboard shortcuts (Cmd/Ctrl + K, Alt + 1..8, Quick Actions N, E, I, F, ?)
  useEffect(() => {
    const enabled = settings?.keyboardShortcutsEnabled ?? true;
    const isFormElement = (element: Element | null): boolean => {
      if (!element) return false;
      const tag = element.tagName.toLowerCase();
      return (
        tag === 'input' ||
        tag === 'textarea' ||
        tag === 'select' ||
        (element as HTMLElement).isContentEditable
      );
    };

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        if (mobileMoreOpen) {
          setMobileMoreOpen(false);
          return;
        }
        if (mobileOpen) {
          setMobileOpen(false);
          return;
        }
      }

      if (!enabled) return;

      // Cmd/Ctrl + K opens command palette from anywhere
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setCommandCenterOpen(true);
        return;
      }

      // Alt + 1..8, Alt+H, Alt+C, Alt+B, Alt+E, Alt+S, Alt+R
      if (e.altKey && !e.metaKey && !e.ctrlKey) {
        const map: Record<string, NavTab> = {
          '1': 'dashboard',
          '2': 'focus',
          '3': 'tasks',
          '4': 'finance',
          '5': 'transactions',
          '6': 'bills',
          '7': 'analytics',
          '8': 'settings',
          '9': 'study',
          '0': 'clock',
          'o': 'study',
          'O': 'study',
          'l': 'leaderboard',
          'L': 'leaderboard',
          'h': 'habits',
          'H': 'habits',
          'c': 'calendar',
          'C': 'calendar',
          'b': 'timeblocks',
          'B': 'timeblocks',
          'e': 'envelopes',
          'E': 'envelopes',
          's': 'subscriptions',
          'S': 'subscriptions',
          'r': 'recovery',
          'R': 'recovery',
        };
        const target = map[e.key];
        if (target) {
          e.preventDefault();
          setCurrentTab(target);
          return;
        }
      }

      // If user is currently typing in an input field, do not trigger single-key action shortcuts
      if (isFormElement(document.activeElement)) {
        return;
      }

      // Standalone single-key shortcuts
      if (!e.metaKey && !e.ctrlKey && !e.altKey) {
        if (e.key === '?' || (e.shiftKey && e.key === '/')) {
          e.preventDefault();
          setKeyboardShortcutsGuideOpen(true);
        } else if (e.key.toLowerCase() === 'n') {
          e.preventDefault();
          setQuickActionInitialType('task');
          setQuickActionOpen(true);
        } else if (e.key.toLowerCase() === 'e') {
          e.preventDefault();
          setQuickActionInitialType('expense');
          setQuickActionOpen(true);
        } else if (e.key.toLowerCase() === 'i') {
          e.preventDefault();
          setQuickActionInitialType('income');
          setQuickActionOpen(true);
        } else if (e.key.toLowerCase() === 'f') {
          e.preventDefault();
          if (isRunning) {
            pauseTimer();
            showToast('Focus timer paused', 'info');
          } else {
            startTimer();
            showToast('Focus timer started', 'info');
          }
        }
      }
    };

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [
    settings?.keyboardShortcutsEnabled,
    setCommandCenterOpen,
    setCurrentTab,
    isRunning,
    startTimer,
    pauseTimer,
    showToast,
    setKeyboardShortcutsGuideOpen,
    setQuickActionInitialType,
    mobileMoreOpen,
    mobileOpen,
  ]);

  // Lock background page scroll while any mobile navigation drawer is open
  useEffect(() => {
    if (typeof document === 'undefined') return;
    if (!mobileMoreOpen && !mobileOpen) return;
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = prevOverflow;
    };
  }, [mobileMoreOpen, mobileOpen]);

  const previewStyleName = previewThemeConfig
    ? getStyleDefinition(previewThemeConfig.styleId).name
    : '';
  const motionFactor = getIntensityFactor(effectiveThemeConfig.animationIntensity);
  const motionProfile = getThemeMotionProfile(
    effectiveThemeConfig.styleId,
    effectiveThemeConfig.animationIntensity,
    motionFactor === 0
  );

  return (
    <MotionConfig reducedMotion={effectiveThemeConfig.animationIntensity === 'none' ? 'always' : 'user'}>
      <div className="ff-app-shell flex flex-col lg:flex-row">
      {/* Ambient / Atmospheric Layer for Glassmorphism, Cyberpunk & Aurora */}
      <div className="ff-ambient-layer" aria-hidden="true" />

      {/* Sidebar */}
      <Sidebar
        collapsed={collapsed}
        setCollapsed={setCollapsed}
        mobileOpen={mobileOpen}
        setMobileOpen={setMobileOpen}
      />

      {/* Main Viewport */}
      <div className="relative z-10 flex-1 flex flex-col min-w-0 min-h-screen overflow-x-hidden">
        {/* Top Header */}
        <Header
          onOpenMobileMenu={() => {
            setMobileMoreOpen(false);
            setMobileOpen(true);
          }}
          onOpenQuickAction={(type) => handleOpenQuickAction(type, undefined, 'global')}
        />

        {/* Viewport Content Area */}
        <main
          className="flex-1 p-4 sm:p-6 lg:p-8 w-full max-w-[1920px] mx-auto min-w-0 pb-[calc(5.5rem+env(safe-area-inset-bottom))] lg:pb-8"
          style={{ paddingBottom: isFullAppPreview ? '8rem' : undefined }}
        >
          {!isAuthenticated && Boolean(user) && !guestBannerDismissed && (
            <div
              className="mb-4 px-4 py-2.5 rounded-xl border flex flex-wrap items-center justify-between gap-3 text-xs"
              style={{
                background: 'var(--ff-surface-card)',
                borderColor: 'var(--ff-accent-border)',
              }}
            >
              <div className="flex items-center gap-2 min-w-0">
                <span
                  className="w-2 h-2 rounded-full shrink-0"
                  style={{ background: 'var(--ff-accent)' }}
                />
                <span className="text-[var(--ff-text-primary)] font-medium">
                  Viewing local Guest Mode.{' '}
                  <span className="text-[var(--ff-text-muted)]">
                    Sign in with Google to load and sync your cloud FocusFlow &amp; Finance data.
                  </span>
                </span>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <button
                  type="button"
                  disabled={isSigningIn}
                  onClick={() => void signInWithGoogle()}
                  className="px-3 py-1 rounded-lg font-bold text-xs transition-opacity disabled:opacity-60"
                  style={{
                    background: 'var(--ff-accent)',
                    color: 'var(--ff-accent-contrast)',
                  }}
                >
                  {isSigningIn ? 'Signing in...' : 'Sign in with Google'}
                </button>
                <button
                  type="button"
                  onClick={() => setGuestBannerDismissed(true)}
                  className="px-2 py-1 text-[var(--ff-text-muted)] hover:text-[var(--ff-text-primary)]"
                  aria-label="Dismiss guest mode notice"
                >
                  Dismiss
                </button>
              </div>
            </div>
          )}
          <LazyChunkErrorBoundary key={currentTab} onReset={() => setCurrentTab('dashboard')}>
            <Suspense fallback={<TabLoadingFallback />}>
              <AnimatePresence mode="wait" initial={false}>
                <MotionPage key={currentTab} routeKey={currentTab}>
                  {currentTab === 'dashboard' && (
                    <UnifiedDashboard onOpenQuickAction={() => handleOpenQuickAction('expense', undefined, 'finance')} />
                  )}

                  {currentTab === 'calendar' && (
                    <ProductivityCalendar
                      onOpenQuickAction={(initialType, initialDate) =>
                        handleOpenQuickAction(initialType, initialDate, 'calendar')
                      }
                    />
                  )}

                  {currentTab === 'focus' && (
                    <div className="space-y-8">
                      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
                        <div className="lg:col-span-5 lg:sticky lg:top-20 max-h-[calc(100dvh-6rem)] overflow-y-auto scrollbar-thin">
                          <PomodoroTimer />
                        </div>
                        <div className="lg:col-span-7">
                          <Suspense
                            fallback={
                              <div className="p-6 rounded-2xl border border-slate-200/70 dark:border-slate-800/70 bg-white/50 dark:bg-slate-900/50 backdrop-blur-sm animate-pulse space-y-4">
                                <div className="h-6 w-48 bg-slate-200 dark:bg-slate-800 rounded-lg" />
                                <div className="h-64 bg-slate-100 dark:bg-slate-800/50 rounded-xl" />
                              </div>
                            }
                          >
                            <FocusAnalytics />
                          </Suspense>
                        </div>
                      </div>
                    </div>
                  )}

                  {currentTab === 'clock' && <RealClock />}

                  {currentTab === 'timeblocks' && <DailyTimeBlockPlanner />}

                  {currentTab === 'tasks' && <TaskManager />}

                  {currentTab === 'habits' && <HabitTrackerView />}

                  {currentTab === 'finance' && (
                    <FinanceOverview onOpenQuickAction={(type, date) => handleOpenQuickAction(type, date, 'finance')} />
                  )}

                  {currentTab === 'transactions' && <TransactionsLedger />}

                  {currentTab === 'bills' && <BillsTracker />}

                  {currentTab === 'envelopes' && <EnvelopeBudgetManager />}

                  {currentTab === 'subscriptions' && <SubscriptionManager />}

                  {currentTab === 'vaults' && <JointVaultsView />}

                  {currentTab === 'study' && <StudyView />}

                  {currentTab === 'leaderboard' && <StudyLeaderboardView />}

                  {currentTab === 'analytics' && <AnalyticsReportsView />}

                  {currentTab === 'exports' && <ExportCenterView />}

                  {currentTab === 'recovery' && <DataRecoveryCenter />}

                  {currentTab === 'settings' && <SettingsView />}

                  {currentTab === 'sheet_hub' && <SheetHubView />}
                </MotionPage>
              </AnimatePresence>
            </Suspense>
          </LazyChunkErrorBoundary>
        </main>

        {/* Sticky Mobile Bottom Navigation Bar (lg:hidden) */}
        <nav
          aria-label="Mobile Bottom Navigation"
          className="lg:hidden fixed bottom-0 inset-x-0 z-40 bg-[var(--ff-surface-header)] backdrop-blur-md border-t border-[var(--ff-border-color)] px-2 py-1 pb-[max(0.5rem,env(safe-area-inset-bottom))]"
          style={{
            boxShadow: '0 -4px 16px rgba(0, 0, 0, 0.12)',
          }}
        >
          <div className="flex items-center justify-around max-w-lg mx-auto">
            {/* Primary 4 Tabs */}
            {[
              { id: 'dashboard' as NavTab, label: 'Dashboard', icon: LayoutDashboard },
              { id: 'focus' as NavTab, label: 'Focus', icon: Timer },
              { id: 'tasks' as NavTab, label: 'Tasks', icon: CheckSquare },
              { id: 'finance' as NavTab, label: 'Finance', icon: Wallet },
            ].map((item) => {
              const Icon = item.icon;
              const isActive = currentTab === item.id;
              return (
                <button
                  key={item.id}
                  type="button"
                  data-tab={item.id}
                  data-bottom-nav={item.id}
                  onClick={() => {
                    setCurrentTab(item.id);
                    setMobileMoreOpen(false);
                  }}
                  className="relative flex flex-col items-center justify-center flex-1 py-1.5 px-1 min-h-[48px] rounded-xl transition-all"
                  style={{
                    color: isActive ? 'var(--ff-accent-text)' : 'var(--ff-text-muted)',
                  }}
                  aria-label={item.label}
                  aria-current={isActive ? 'page' : undefined}
                >
                  {isActive && (
                    <motion.div
                      layoutId="mobile-bottom-nav-active"
                      className="absolute inset-0 rounded-xl pointer-events-none"
                      style={{
                        background: 'var(--ff-accent-soft)',
                        border: '1px solid var(--ff-accent-border)',
                      }}
                      transition={{ type: 'spring', stiffness: 400, damping: 30 }}
                    />
                  )}
                  <div className="relative z-10 flex flex-col items-center gap-0.5">
                    <Icon className="w-5 h-5" />
                    <span
                      className="text-[10px] font-medium tracking-tight"
                      style={{
                        fontWeight: isActive ? 700 : 500,
                      }}
                    >
                      {item.label}
                    </span>
                  </div>
                </button>
              );
            })}

            {/* 5th Tab: Intuitive More Overflow Tab */}
            {(() => {
              const isMoreActive = !PRIMARY_MOBILE_TABS.includes(currentTab);
              const activeMeta = isMoreActive ? MOBILE_ACTIVE_TAB_META[currentTab] : null;
              const Icon = activeMeta?.icon || MoreHorizontal;
              const moreLabel = activeMeta?.label || 'More';
              return (
                <button
                  type="button"
                  data-tab="more"
                  data-bottom-nav="more"
                  onClick={() => {
                    setMobileOpen(false);
                    setMobileMoreOpen((prev) => !prev);
                  }}
                  className="relative flex flex-col items-center justify-center flex-1 py-1.5 px-1 min-h-[48px] rounded-xl transition-all"
                  style={{
                    color: isMoreActive || mobileMoreOpen ? 'var(--ff-accent-text)' : 'var(--ff-text-muted)',
                  }}
                  aria-label="More Workspaces"
                  aria-expanded={mobileMoreOpen}
                  aria-current={isMoreActive ? 'page' : undefined}
                >
                  {(isMoreActive || mobileMoreOpen) && (
                    <motion.div
                      layoutId="mobile-bottom-nav-active"
                      className="absolute inset-0 rounded-xl pointer-events-none"
                      style={{
                        background: 'var(--ff-accent-soft)',
                        border: '1px solid var(--ff-accent-border)',
                      }}
                      transition={{ type: 'spring', stiffness: 400, damping: 30 }}
                    />
                  )}
                  <div className="relative z-10 flex flex-col items-center gap-0.5">
                    <Icon className="w-5 h-5" />
                    <span
                      className="text-[10px] font-medium tracking-tight"
                      style={{
                        fontWeight: isMoreActive || mobileMoreOpen ? 700 : 500,
                      }}
                    >
                      {moreLabel}
                    </span>
                  </div>
                </button>
              );
            })()}
          </div>
        </nav>

        {/* Mobile Navigation "More" Overflow Sheet */}
        <AnimatePresence>
          {mobileMoreOpen && (
            <motion.div
              key="mobile-more-backdrop"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: motionFactor === 0 ? 0.01 : 0.18 }}
              className="fixed inset-0 bg-slate-950/60 backdrop-blur-xs z-50 lg:hidden"
              onClick={() => setMobileMoreOpen(false)}
              aria-hidden="true"
            />
          )}
          {mobileMoreOpen && (
            <motion.div
              key="mobile-more-drawer"
              role="dialog"
              aria-modal="true"
              aria-label="All Workspaces and Tools"
              initial={motionFactor === 0 ? false : { y: '100%' }}
              animate={{ y: 0 }}
              exit={motionFactor === 0 ? { opacity: 0 } : { y: '100%' }}
              transition={motionProfile.modal}
              className="fixed inset-x-0 bottom-0 z-[60] bg-[var(--ff-surface-elevated)] border-t border-[var(--ff-border-color)] rounded-t-3xl shadow-2xl p-4 sm:p-6 pb-[max(1.5rem,env(safe-area-inset-bottom))] max-h-[85dvh] overflow-y-auto overscroll-contain lg:hidden text-[var(--ff-text-primary)]"
              style={{
                boxShadow: '0 -8px 32px rgba(0, 0, 0, 0.28)',
              }}
            >
              {/* Mobile Grab Handle */}
              <div className="w-12 h-1 bg-[var(--ff-border-strong)] rounded-full mx-auto mb-3.5 opacity-50 shrink-0" />

              {/* Header */}
              <div className="flex items-center justify-between pb-3 mb-4 border-b border-[var(--ff-border-color)]">
                <div>
                  <h3 className="text-base font-bold text-[var(--ff-text-primary)]">All Workspaces & Tools</h3>
                  <p className="text-xs text-[var(--ff-text-muted)]">Switch to any FocusFlow workspace</p>
                </div>
                <button
                  type="button"
                  onClick={() => setMobileMoreOpen(false)}
                  className="min-w-[44px] min-h-[44px] flex items-center justify-center p-2 rounded-xl text-[var(--ff-text-muted)] hover:text-[var(--ff-text-primary)] hover:bg-[var(--ff-surface-muted)] transition-colors shrink-0"
                  aria-label="Close menu"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              {/* Primary Academic, Leaderboard & Habits Spotlight */}
              <div className="mb-4">
                <div className="text-[11px] font-semibold uppercase tracking-wider text-[var(--ff-text-muted)] mb-2 px-1">
                  Academic, Squads &amp; Daily Consistency
                </div>
                <div className="grid grid-cols-3 gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      setCurrentTab('study');
                      setMobileMoreOpen(false);
                    }}
                    className={`flex flex-col items-start gap-2 p-3 rounded-2xl border text-left transition-all min-h-[76px] ${
                      currentTab === 'study'
                        ? 'bg-[var(--ff-accent-soft)] border-[var(--ff-accent)] text-[var(--ff-accent-text)] shadow-sm ring-1 ring-[var(--ff-accent)]'
                        : 'bg-[var(--ff-surface-muted)] border-[var(--ff-border-color)] text-[var(--ff-text-primary)] hover:border-[var(--ff-accent)]'
                    }`}
                  >
                    <div className="w-8 h-8 rounded-xl flex items-center justify-center shrink-0 bg-indigo-500/15 text-indigo-400">
                      <GraduationCap className="w-4 h-4" />
                    </div>
                    <div className="min-w-0 w-full">
                      <div className="text-xs font-bold truncate">Study OS</div>
                      <div className="text-[10px] text-[var(--ff-text-muted)] truncate">Syllabus</div>
                    </div>
                  </button>

                  <button
                    type="button"
                    onClick={() => {
                      setCurrentTab('leaderboard');
                      setMobileMoreOpen(false);
                    }}
                    className={`flex flex-col items-start gap-2 p-3 rounded-2xl border text-left transition-all min-h-[76px] ${
                      currentTab === 'leaderboard'
                        ? 'bg-[var(--ff-accent-soft)] border-[var(--ff-accent)] text-[var(--ff-accent-text)] shadow-sm ring-1 ring-[var(--ff-accent)]'
                        : 'bg-[var(--ff-surface-muted)] border-[var(--ff-border-color)] text-[var(--ff-text-primary)] hover:border-[var(--ff-accent)]'
                    }`}
                  >
                    <div className="flex items-center justify-between w-full">
                      <div className="w-8 h-8 rounded-xl flex items-center justify-center shrink-0 bg-emerald-500/15 text-emerald-400">
                        <Trophy className="w-4 h-4" />
                      </div>
                      <span className="text-[9px] font-bold uppercase px-1.5 py-0.5 rounded-full bg-emerald-500/15 text-emerald-400">
                        Live
                      </span>
                    </div>
                    <div className="min-w-0 w-full">
                      <div className="text-xs font-bold truncate">Leaderboard</div>
                      <div className="text-[10px] text-[var(--ff-text-muted)] truncate">Squads</div>
                    </div>
                  </button>

                  <button
                    type="button"
                    onClick={() => {
                      setCurrentTab('habits');
                      setMobileMoreOpen(false);
                    }}
                    className={`flex flex-col items-start gap-2 p-3 rounded-2xl border text-left transition-all min-h-[76px] ${
                      currentTab === 'habits'
                        ? 'bg-[var(--ff-accent-soft)] border-[var(--ff-accent)] text-[var(--ff-accent-text)] shadow-sm ring-1 ring-[var(--ff-accent)]'
                        : 'bg-[var(--ff-surface-muted)] border-[var(--ff-border-color)] text-[var(--ff-text-primary)] hover:border-[var(--ff-accent)]'
                    }`}
                  >
                    <div className="w-8 h-8 rounded-xl flex items-center justify-center shrink-0 bg-amber-500/15 text-amber-400">
                      <Flame className="w-4 h-4" />
                    </div>
                    <div className="min-w-0 w-full">
                      <div className="text-xs font-bold truncate">Habits</div>
                      <div className="text-[10px] text-[var(--ff-text-muted)] truncate">Streaks</div>
                    </div>
                  </button>
                </div>
              </div>

              {/* Categorized Full Directory (100% parity with Desktop Sidebar) */}
              <div className="space-y-4">
                {MOBILE_MORE_SECTIONS.map((section) => (
                  <div key={section.title}>
                    <div className="text-[11px] font-semibold uppercase tracking-wider text-[var(--ff-text-muted)] mb-2 px-1">
                      {section.title}
                    </div>
                    <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                      {section.items.map((item) => {
                        const Icon = item.icon;
                        const isActive = currentTab === item.id;
                        return (
                          <button
                            key={item.id}
                            type="button"
                            onClick={() => {
                              setCurrentTab(item.id);
                              setMobileMoreOpen(false);
                            }}
                            className={`flex items-center justify-between gap-2 p-3 rounded-xl border text-left transition-all min-h-[48px] ${
                              isActive
                                ? 'bg-[var(--ff-accent-soft)] border-[var(--ff-accent)] text-[var(--ff-accent-text)] font-semibold'
                                : 'bg-[var(--ff-surface-muted)] border-[var(--ff-border-color)] text-[var(--ff-text-secondary)] hover:text-[var(--ff-text-primary)] hover:border-[var(--ff-border-strong)]'
                            }`}
                          >
                            <span className="flex items-center gap-2 min-w-0">
                              <Icon className="w-4 h-4 shrink-0" />
                              <span className="text-xs truncate">{item.label}</span>
                            </span>
                            {item.badge && (
                              <span className="text-[9px] font-bold uppercase px-1.5 py-0.5 rounded bg-[var(--ff-accent-soft)] text-[var(--ff-accent-text)] shrink-0">
                                {item.badge}
                              </span>
                            )}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                ))}
              </div>

              {/* Mobile Account Footer */}
              {isAuthenticated && (
                <div className="mt-5 pt-3 border-t border-[var(--ff-border-color)] flex items-center justify-between gap-3">
                  <div className="text-xs text-[var(--ff-text-muted)] truncate">
                    Signed in as <strong className="text-[var(--ff-text-primary)]">{user?.name || user?.email}</strong>
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      setMobileMoreOpen(false);
                      void signOutGoogle();
                    }}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold text-rose-400 bg-rose-500/10 border border-rose-500/20 hover:bg-rose-500/15 shrink-0"
                  >
                    <LogOut className="w-3.5 h-3.5" />
                    <span>Sign Out</span>
                  </button>
                </div>
              )}
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* Full-App Live Preview Floating Banner */}
      <AnimatePresence>
        {isFullAppPreview && previewThemeConfig && (
          <div className="fixed bottom-[calc(4.5rem+env(safe-area-inset-bottom))] lg:bottom-5 inset-x-0 z-50 flex justify-center px-4 pointer-events-none">
            <motion.div
              key="full-app-preview-banner"
              role="region"
              aria-label="Live theme preview controls"
              initial={motionFactor === 0 ? false : { opacity: 0, y: 18, scale: 0.96 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={motionFactor === 0 ? { opacity: 0 } : { opacity: 0, y: 14, scale: 0.96 }}
              transition={{
                duration: MOTION_DURATION.card * Math.max(0.6, motionFactor || 0.01),
                ease: MOTION_EASING.decelerate,
              }}
              className="ff-card-elevated pointer-events-auto px-4 py-2.5 flex flex-wrap items-center gap-3 max-w-full"
            >
              <div className="flex items-center gap-2 text-xs">
                <Eye className="w-4 h-4 shrink-0" style={{ color: 'var(--ff-accent-text)' }} />
                <span className="font-semibold text-[var(--ff-text-primary)]">
                  Previewing <strong>{previewStyleName}</strong> ({resolvedThemeMode})
                </span>
              </div>
              <div className="flex items-center gap-2">
                <ThemeButton
                  variant="primary"
                  size="xs"
                  onClick={() => void applyThemeConfig(previewThemeConfig, null)}
                >
                  <Check className="w-3.5 h-3.5" />
                  <span>Apply Theme</span>
                </ThemeButton>
                <ThemeButton variant="secondary" size="xs" onClick={stopFullAppPreview}>
                  <X className="w-3.5 h-3.5" />
                  <span>Exit Preview</span>
                </ThemeButton>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Quick Action Global Modal */}
      <QuickActionModal
        isOpen={quickActionOpen}
        onClose={() => setQuickActionOpen(false)}
        initialType={quickActionInitialType}
        initialDate={quickActionInitialDate}
        context={quickActionContext}
      />

      {/* Keyboard Shortcuts Cheat-Sheet Modal */}
      <KeyboardShortcutsModal
        isOpen={keyboardShortcutsGuideOpen}
        onClose={() => setKeyboardShortcutsGuideOpen(false)}
      />

      {/* Global Command Center, Trash Restore & In-App Confirmation Modal */}
      <CommandCenter
        onOpenQuickAction={(type) => handleOpenQuickAction(type, undefined, 'global')}
      />
      <TrashRestoreModal />
      {confirmDialogState && (
        <ConfirmDialogModal
          isOpen={confirmDialogState.isOpen}
          title={confirmDialogState.title}
          message={confirmDialogState.message}
          itemLabel={confirmDialogState.itemLabel}
          confirmLabel={confirmDialogState.confirmLabel}
          cancelLabel={confirmDialogState.cancelLabel}
          tone={confirmDialogState.tone}
          onConfirm={() => resolveConfirmDialog(true)}
          onCancel={() => resolveConfirmDialog(false)}
        />
      )}
      <AuthRecoveryModal
        diagnostic={authError}
        isRetrying={isSigningIn}
        onRetry={() => {
          if (authError?.scopeMode === 'sheet_hub_readonly') {
            void authorizeSheetHubReadOnly();
          } else if (authError?.scopeMode === 'sheets') {
            void authorizeGoogleSheets();
          } else {
            void signInWithGoogle();
          }
        }}
        onClose={clearAuthError}
      />

      {/* Notification Toast Container */}
      <ToastContainer />
    </div>
    </MotionConfig>
  );
};

export default function App() {
  if (configurationError) {
    return <StagingConfigurationFallback error={configurationError} />;
  }

  return (
    <AppProvider>
      <MainContent />
    </AppProvider>
  );
}
