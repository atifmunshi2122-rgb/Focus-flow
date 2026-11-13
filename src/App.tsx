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
import { UnifiedDashboard } from './components/dashboard/UnifiedDashboard.tsx';
import { PomodoroTimer } from './components/focus/PomodoroTimer.tsx';
import { FocusAnalytics } from './components/focus/FocusAnalytics.tsx';
import { TaskManager } from './components/tasks/TaskManager.tsx';
import { FinanceOverview } from './components/finance/FinanceOverview.tsx';
import { BillsTracker } from './components/finance/BillsTracker.tsx';
import { TransactionsLedger } from './components/finance/TransactionsLedger.tsx';
import { AnalyticsReportsView } from './components/analytics/AnalyticsReportsView.tsx';
import { SettingsView } from './components/settings/SettingsView.tsx';
import { ProductivityCalendar } from './components/calendar/ProductivityCalendar.tsx';
import { DailyTimeBlockPlanner } from './components/focus/DailyTimeBlockPlanner.tsx';
import { EnvelopeBudgetManager } from './components/finance/EnvelopeBudgetManager.tsx';
import { SubscriptionManager } from './components/finance/SubscriptionManager.tsx';
import { DataRecoveryCenter } from './components/settings/DataRecoveryCenter.tsx';
import { getStyleDefinition } from './theme/stylesRegistry.ts';
import { ThemeButton } from './components/ui/ThemePrimitives.tsx';
import { MotionPage } from './components/ui/MotionPrimitives.tsx';
import { MOTION_EASING, MOTION_DURATION, getIntensityFactor } from './theme/motionTokens.ts';
import { AnimatePresence, MotionConfig, motion } from 'motion/react';
import { Check, Eye, X, LayoutDashboard, Timer, CheckSquare, Wallet, Settings } from 'lucide-react';

const mobileBottomNavItems: Array<{ id: NavTab; label: string; icon: React.ComponentType<{ className?: string }> }> = [
  { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { id: 'focus', label: 'Focus', icon: Timer },
  { id: 'tasks', label: 'Tasks', icon: CheckSquare },
  { id: 'finance', label: 'Finance', icon: Wallet },
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
  } = useApp();
  const [collapsed, setCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [quickActionOpen, setQuickActionOpen] = useState(false);

  // Global keyboard shortcuts (Cmd/Ctrl + K & Alt + 1..8)
  useEffect(() => {
    const enabled = settings?.keyboardShortcutsEnabled ?? true;
    const onKeyDown = (e: KeyboardEvent) => {
      if (!enabled) return;
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setCommandCenterOpen(true);
        return;
      }
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
        };
        const target = map[e.key];
        if (target) {
          e.preventDefault();
          setCurrentTab(target);
        }
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [settings?.keyboardShortcutsEnabled, setCommandCenterOpen, setCurrentTab]);

  const previewStyleName = previewThemeConfig
    ? getStyleDefinition(previewThemeConfig.styleId).name
    : '';
  const motionFactor = getIntensityFactor(effectiveThemeConfig.animationIntensity);

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
          onOpenQuickAction={() => setQuickActionOpen(true)}
        />

        {/* Viewport Content Area */}
        <main
          className="flex-1 p-4 sm:p-6 lg:p-8 w-full max-w-[1920px] mx-auto min-w-0 pb-[calc(5.5rem+env(safe-area-inset-bottom))] lg:pb-8"
          style={{ paddingBottom: isFullAppPreview ? '8rem' : undefined }}
        >
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

            {currentTab === 'finance' && (
              <FinanceOverview onOpenQuickAction={() => setQuickActionOpen(true)} />
            )}

            {currentTab === 'transactions' && <TransactionsLedger />}

            {currentTab === 'bills' && <BillsTracker />}

            {currentTab === 'envelopes' && <EnvelopeBudgetManager />}

            {currentTab === 'subscriptions' && <SubscriptionManager />}

            {currentTab === 'analytics' && <AnalyticsReportsView />}

            {currentTab === 'recovery' && <DataRecoveryCenter />}

            {currentTab === 'settings' && <SettingsView />}
          </MotionPage>
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
            {mobileBottomNavItems.map((item) => {
              const Icon = item.icon;
              const isActive = currentTab === item.id;
              return (
                <button
                  key={item.id}
                  type="button"
                  data-tab={item.id}
                  data-bottom-nav={item.id}
                  onClick={() => setCurrentTab(item.id)}
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
          </div>
        </nav>
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
      />

      {/* Global Command Center, Trash Restore & In-App Confirmation Modal */}
      <CommandCenter onOpenQuickAction={() => setQuickActionOpen(true)} />
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
