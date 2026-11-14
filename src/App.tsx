/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useEffect, useState } from 'react';
import { AppProvider, NavTab, useApp } from './context/AppContext.tsx';
import { Sidebar } from './components/layout/Sidebar.tsx';
import { Header } from './components/layout/Header.tsx';
import { ToastContainer } from './components/layout/ToastContainer.tsx';
import { QuickActionModal } from './components/common/QuickActionModal.tsx';
import { CommandCenter } from './components/common/CommandCenter.tsx';
import { TrashRestoreModal } from './components/common/TrashRestoreModal.tsx';
import { ConfirmDialogModal } from './components/common/ConfirmDialogModal.tsx';
import { AuthRecoveryModal } from './components/common/AuthRecoveryModal.tsx';
import { KeyboardShortcutsModal } from './components/common/KeyboardShortcutsModal.tsx';
import { UnifiedDashboard } from './components/dashboard/UnifiedDashboard.tsx';
import { PomodoroTimer } from './components/focus/PomodoroTimer.tsx';
import { FocusAnalytics } from './components/focus/FocusAnalytics.tsx';
import { TaskManager } from './components/tasks/TaskManager.tsx';
import { HabitTrackerView } from './components/focus/HabitTrackerView.tsx';
import { FinanceOverview } from './components/finance/FinanceOverview.tsx';
import { BillsTracker } from './components/finance/BillsTracker.tsx';
import { TransactionsLedger } from './components/finance/TransactionsLedger.tsx';
import { AnalyticsReportsView } from './components/analytics/AnalyticsReportsView.tsx';
import { SettingsView } from './components/settings/SettingsView.tsx';
import { ProductivityCalendar } from './components/calendar/ProductivityCalendar.tsx';
import { DailyTimeBlockPlanner } from './components/focus/DailyTimeBlockPlanner.tsx';
import { EnvelopeBudgetManager } from './components/finance/EnvelopeBudgetManager.tsx';
import { SubscriptionManager } from './components/finance/SubscriptionManager.tsx';
import { StudyView } from './components/study/StudyView.tsx';
import { DataRecoveryCenter } from './components/settings/DataRecoveryCenter.tsx';
import { getStyleDefinition } from './theme/stylesRegistry.ts';
import { ThemeButton } from './components/ui/ThemePrimitives.tsx';
import { MotionPage } from './components/ui/MotionPrimitives.tsx';
import { MOTION_EASING, MOTION_DURATION, getIntensityFactor, getThemeMotionProfile } from './theme/motionTokens.ts';
import { AnimatePresence, MotionConfig, motion } from 'motion/react';
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
  Flame,
  Calendar,
  Clock,
  ReceiptText,
  CreditCard,
  Layers,
  Repeat,
  BarChart3,
} from 'lucide-react';

const PRIMARY_MOBILE_TABS: NavTab[] = ['dashboard', 'focus', 'tasks', 'finance'];

interface MobileMoreItem {
  id: NavTab;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
}

const MORE_GRID_ITEMS: MobileMoreItem[] = [
  { id: 'calendar', label: 'Calendar', icon: Calendar },
  { id: 'timeblocks', label: 'Time Blocks', icon: Clock },
  { id: 'bills', label: 'Bills & Payments', icon: CreditCard },
  { id: 'transactions', label: 'Transactions', icon: ReceiptText },
  { id: 'envelopes', label: 'Envelopes', icon: Layers },
  { id: 'subscriptions', label: 'Subscriptions', icon: Repeat },
  { id: 'analytics', label: 'Analytics', icon: BarChart3 },
  { id: 'settings', label: 'Settings', icon: Settings },
];

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
    isSigningIn,
    signInWithGoogle,
    authorizeGoogleSheets,
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
  const [mobileMoreOpen, setMobileMoreOpen] = useState(false);

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
          'o': 'study',
          'O': 'study',
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
  ]);

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
          onOpenMobileMenu={() => setMobileOpen(true)}
          onOpenQuickAction={(initialType) => {
            if (initialType) setQuickActionInitialType(initialType);
            setQuickActionOpen(true);
          }}
        />

        {/* Viewport Content Area */}
        <main
          className="flex-1 p-4 sm:p-6 lg:p-8 w-full max-w-[1920px] mx-auto min-w-0 pb-[calc(5.5rem+env(safe-area-inset-bottom))] lg:pb-8"
          style={{ paddingBottom: isFullAppPreview ? '8rem' : undefined }}
        >
          <AnimatePresence mode="wait" initial={false}>
            <MotionPage routeKey={currentTab}>
              {currentTab === 'dashboard' && (
                <UnifiedDashboard onOpenQuickAction={() => setQuickActionOpen(true)} />
              )}

              {currentTab === 'calendar' && <ProductivityCalendar />}

              {currentTab === 'focus' && (
                <div className="space-y-8">
                  <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
                    <div className="lg:col-span-5 lg:sticky lg:top-20 max-h-[calc(100dvh-6rem)] overflow-y-auto scrollbar-thin">
                      <PomodoroTimer />
                    </div>
                    <div className="lg:col-span-7">
                      <FocusAnalytics />
                    </div>
                  </div>
                </div>
              )}

              {currentTab === 'timeblocks' && <DailyTimeBlockPlanner />}

              {currentTab === 'tasks' && <TaskManager />}

              {currentTab === 'habits' && <HabitTrackerView />}

              {currentTab === 'finance' && (
                <FinanceOverview onOpenQuickAction={() => setQuickActionOpen(true)} />
              )}

              {currentTab === 'transactions' && <TransactionsLedger />}

              {currentTab === 'bills' && <BillsTracker />}

              {currentTab === 'envelopes' && <EnvelopeBudgetManager />}

              {currentTab === 'subscriptions' && <SubscriptionManager />}

              {currentTab === 'study' && <StudyView />}

              {currentTab === 'analytics' && <AnalyticsReportsView />}

              {currentTab === 'recovery' && <DataRecoveryCenter />}

              {currentTab === 'settings' && <SettingsView />}
            </MotionPage>
          </AnimatePresence>
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
              const moreIcon =
                currentTab === 'study'
                  ? GraduationCap
                  : currentTab === 'habits'
                  ? Flame
                  : currentTab === 'settings'
                  ? Settings
                  : currentTab === 'calendar'
                  ? Calendar
                  : MoreHorizontal;

              const moreLabel =
                currentTab === 'study'
                  ? 'Study'
                  : currentTab === 'habits'
                  ? 'Habits'
                  : currentTab === 'settings'
                  ? 'Settings'
                  : currentTab === 'calendar'
                  ? 'Calendar'
                  : 'More';

              const Icon = moreIcon;
              return (
                <button
                  type="button"
                  data-tab="more"
                  data-bottom-nav="more"
                  onClick={() => setMobileMoreOpen((prev) => !prev)}
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
            <>
              {/* Backdrop */}
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

              {/* Bottom Sheet Drawer */}
              <motion.div
                key="mobile-more-drawer"
                role="dialog"
                aria-modal="true"
                aria-label="All Workspaces and Tools"
                initial={motionFactor === 0 ? false : { y: '100%' }}
                animate={{ y: 0 }}
                exit={motionFactor === 0 ? { opacity: 0 } : { y: '100%' }}
                transition={motionProfile.modal}
                className="fixed inset-x-0 bottom-0 z-50 bg-[var(--ff-surface-elevated)] border-t border-[var(--ff-border-color)] rounded-t-3xl shadow-2xl p-4 sm:p-6 pb-[max(1.5rem,env(safe-area-inset-bottom))] max-h-[85dvh] overflow-y-auto overscroll-contain lg:hidden text-[var(--ff-text-primary)]"
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

                {/* Primary Academic & Habits Spotlight */}
                <div className="mb-4">
                  <div className="text-[11px] font-semibold uppercase tracking-wider text-[var(--ff-text-muted)] mb-2 px-1">
                    Academic & Daily Consistency
                  </div>
                  <div className="grid grid-cols-2 gap-2.5">
                    <button
                      type="button"
                      onClick={() => {
                        setCurrentTab('study');
                        setMobileMoreOpen(false);
                      }}
                      className={`flex items-start gap-3 p-3 rounded-2xl border text-left transition-all min-h-[58px] ${
                        currentTab === 'study'
                          ? 'bg-[var(--ff-accent-soft)] border-[var(--ff-accent)] text-[var(--ff-accent-text)] shadow-sm ring-1 ring-[var(--ff-accent)]'
                          : 'bg-[var(--ff-surface-muted)] border-[var(--ff-border-color)] text-[var(--ff-text-primary)] hover:border-[var(--ff-accent)]'
                      }`}
                    >
                      <div className="w-9 h-9 rounded-xl flex items-center justify-center shrink-0 bg-indigo-500/15 text-indigo-500 dark:text-indigo-400">
                        <GraduationCap className="w-5 h-5" />
                      </div>
                      <div className="min-w-0">
                        <div className="text-xs font-bold truncate">Study OS</div>
                        <div className="text-[10px] text-[var(--ff-text-muted)] truncate">Syllabus & Revisions</div>
                      </div>
                    </button>

                    <button
                      type="button"
                      onClick={() => {
                        setCurrentTab('habits');
                        setMobileMoreOpen(false);
                      }}
                      className={`flex items-start gap-3 p-3 rounded-2xl border text-left transition-all min-h-[58px] ${
                        currentTab === 'habits'
                          ? 'bg-[var(--ff-accent-soft)] border-[var(--ff-accent)] text-[var(--ff-accent-text)] shadow-sm ring-1 ring-[var(--ff-accent)]'
                          : 'bg-[var(--ff-surface-muted)] border-[var(--ff-border-color)] text-[var(--ff-text-primary)] hover:border-[var(--ff-accent)]'
                      }`}
                    >
                      <div className="w-9 h-9 rounded-xl flex items-center justify-center shrink-0 bg-amber-500/15 text-amber-500 dark:text-amber-400">
                        <Flame className="w-5 h-5" />
                      </div>
                      <div className="min-w-0">
                        <div className="text-xs font-bold truncate">Habits</div>
                        <div className="text-[10px] text-[var(--ff-text-muted)] truncate">Streaks & Logs</div>
                      </div>
                    </button>
                  </div>
                </div>

                {/* All Other Tools & Workspaces Grid */}
                <div>
                  <div className="text-[11px] font-semibold uppercase tracking-wider text-[var(--ff-text-muted)] mb-2 px-1">
                    Productivity, Finance & Tools
                  </div>
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                    {MORE_GRID_ITEMS.map((item) => {
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
                          className={`flex items-center gap-2.5 p-3 rounded-xl border text-left transition-all min-h-[48px] ${
                            isActive
                              ? 'bg-[var(--ff-accent-soft)] border-[var(--ff-accent)] text-[var(--ff-accent-text)] font-semibold'
                              : 'bg-[var(--ff-surface-muted)] border-[var(--ff-border-color)] text-[var(--ff-text-secondary)] hover:text-[var(--ff-text-primary)] hover:border-[var(--ff-border-strong)]'
                          }`}
                        >
                          <Icon className="w-4 h-4 shrink-0" />
                          <span className="text-xs truncate">{item.label}</span>
                        </button>
                      );
                    })}
                  </div>
                </div>
              </motion.div>
            </>
          )}
        </AnimatePresence>
      </div>

      {/* Full-App Live Preview Floating Banner */}
      <AnimatePresence>
        {isFullAppPreview && previewThemeConfig && (
          <div className="fixed bottom-5 inset-x-0 z-50 flex justify-center px-4 pointer-events-none">
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
      />

      {/* Keyboard Shortcuts Cheat-Sheet Modal */}
      <KeyboardShortcutsModal
        isOpen={keyboardShortcutsGuideOpen}
        onClose={() => setKeyboardShortcutsGuideOpen(false)}
      />

      {/* Global Command Center, Trash Restore & In-App Confirmation Modal */}
      <CommandCenter
        onOpenQuickAction={(initialType) => {
          if (initialType) setQuickActionInitialType(initialType);
          setQuickActionOpen(true);
        }}
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
          if (authError?.scopeMode === 'sheets') {
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
  return (
    <AppProvider>
      <MainContent />
    </AppProvider>
  );
}
