/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState } from 'react';
import { AppProvider, useApp } from './context/AppContext.tsx';
import { Sidebar } from './components/layout/Sidebar.tsx';
import { Header } from './components/layout/Header.tsx';
import { ToastContainer } from './components/layout/ToastContainer.tsx';
import { QuickActionModal } from './components/common/QuickActionModal.tsx';
import { UnifiedDashboard } from './components/dashboard/UnifiedDashboard.tsx';
import { PomodoroTimer } from './components/focus/PomodoroTimer.tsx';
import { FocusAnalytics } from './components/focus/FocusAnalytics.tsx';
import { TaskManager } from './components/tasks/TaskManager.tsx';
import { FinanceOverview } from './components/finance/FinanceOverview.tsx';
import { ExpenseManager } from './components/finance/ExpenseManager.tsx';
import { BillsTracker } from './components/finance/BillsTracker.tsx';
import { TransactionsLedger } from './components/finance/TransactionsLedger.tsx';
import { SettingsView } from './components/settings/SettingsView.tsx';

const MainContent: React.FC = () => {
  const { currentTab } = useApp();
  const [collapsed, setCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [quickActionOpen, setQuickActionOpen] = useState(false);

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-slate-100 flex flex-col lg:flex-row font-sans selection:bg-indigo-500 selection:text-white">
      {/* Sidebar */}
      <Sidebar
        collapsed={collapsed}
        setCollapsed={setCollapsed}
        mobileOpen={mobileOpen}
        setMobileOpen={setMobileOpen}
      />

      {/* Main Viewport */}
      <div className="flex-1 flex flex-col min-w-0 min-h-screen overflow-x-hidden">
        {/* Top Header */}
        <Header
          onOpenMobileMenu={() => setMobileOpen(true)}
          onOpenQuickAction={() => setQuickActionOpen(true)}
        />

        {/* Viewport Content Area */}
        <main className="flex-1 p-4 md:p-8 max-w-7xl w-full mx-auto">
          {currentTab === 'dashboard' && (
            <UnifiedDashboard onOpenQuickAction={() => setQuickActionOpen(true)} />
          )}

          {currentTab === 'focus' && (
            <div className="space-y-8">
              <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
                <div className="lg:col-span-5 sticky top-24">
                  <PomodoroTimer />
                </div>
                <div className="lg:col-span-7">
                  <FocusAnalytics />
                </div>
              </div>
            </div>
          )}

          {currentTab === 'tasks' && <TaskManager />}

          {currentTab === 'finance' && (
            <FinanceOverview onOpenQuickAction={() => setQuickActionOpen(true)} />
          )}

          {currentTab === 'transactions' && <TransactionsLedger />}

          {currentTab === 'bills' && <BillsTracker />}

          {currentTab === 'analytics' && (
            <div className="space-y-6">
              <FinanceOverview onOpenQuickAction={() => setQuickActionOpen(true)} />
            </div>
          )}

          {currentTab === 'settings' && <SettingsView />}
        </main>
      </div>

      {/* Quick Action Global Modal */}
      <QuickActionModal
        isOpen={quickActionOpen}
        onClose={() => setQuickActionOpen(false)}
      />

      {/* Notification Toast Container */}
      <ToastContainer />
    </div>
  );
};

export default function App() {
  return (
    <AppProvider>
      <MainContent />
    </AppProvider>
  );
}
