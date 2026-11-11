import React from 'react';
import { useApp, NavTab } from '../../context/AppContext.tsx';
import {
  LayoutDashboard,
  Timer,
  CheckSquare,
  Wallet,
  ReceiptText,
  CreditCard,
  BarChart3,
  Settings,
  ChevronLeft,
  ChevronRight,
  Flame,
  Sun,
  Moon,
  Zap,
} from 'lucide-react';

interface SidebarProps {
  collapsed: boolean;
  setCollapsed: (collapsed: boolean) => void;
  mobileOpen: boolean;
  setMobileOpen: (open: boolean) => void;
}

interface NavItem {
  id: NavTab;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  tag?: string;
}

export const Sidebar: React.FC<SidebarProps> = ({
  collapsed,
  setCollapsed,
  mobileOpen,
  setMobileOpen,
}) => {
  const { currentTab, setCurrentTab, user, theme, toggleTheme, isRunning, timerMode } = useApp();

  const navItems: NavItem[] = [
    { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard },
    { id: 'focus', label: 'Focus & Timer', icon: Timer, tag: isRunning ? 'Active' : undefined },
    { id: 'tasks', label: 'Tasks', icon: CheckSquare },
    { id: 'finance', label: 'Finance Overview', icon: Wallet },
    { id: 'transactions', label: 'Transactions', icon: ReceiptText },
    { id: 'bills', label: 'Bills & Payments', icon: CreditCard },
    { id: 'analytics', label: 'Analytics', icon: BarChart3 },
    { id: 'settings', label: 'Settings', icon: Settings },
  ];

  const handleNavClick = (tab: NavTab) => {
    setCurrentTab(tab);
    setMobileOpen(false);
  };

  return (
    <>
      {/* Mobile Backdrop */}
      {mobileOpen && (
        <div
          className="fixed inset-0 bg-slate-950/60 backdrop-blur-xs z-40 lg:hidden"
          onClick={() => setMobileOpen(false)}
        />
      )}

      {/* Sidebar Container */}
      <aside
        className={`fixed lg:sticky top-0 left-0 z-50 h-screen flex flex-col justify-between border-r transition-all duration-300 ease-in-out ${
          collapsed ? 'w-20' : 'w-64'
        } ${
          mobileOpen ? 'translate-x-0' : '-translate-x-full lg:translate-x-0'
        } bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800 text-slate-800 dark:text-slate-200 select-none`}
      >
        {/* Top Header / Brand */}
        <div className="flex items-center justify-between h-16 px-4 border-b border-slate-200 dark:border-slate-800">
          <div className="flex items-center gap-3 overflow-hidden">
            <div className="w-9 h-9 rounded-xl bg-gradient-to-tr from-indigo-600 to-violet-500 flex items-center justify-center text-white font-bold shadow-md shadow-indigo-500/20 shrink-0">
              <Zap className="w-5 h-5 fill-current" />
            </div>
            {!collapsed && (
              <div className="flex flex-col min-w-0">
                <span className="font-bold text-base tracking-tight text-slate-900 dark:text-white truncate">
                  FocusFlow
                </span>
                <span className="text-[11px] font-medium text-slate-500 dark:text-slate-400 truncate">
                  &amp; Finance Command
                </span>
              </div>
            )}
          </div>

          {/* Desktop Collapse Toggle */}
          <button
            onClick={() => setCollapsed(!collapsed)}
            className="hidden lg:flex items-center justify-center w-7 h-7 rounded-lg text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
            title={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
            aria-label="Toggle sidebar collapse"
          >
            {collapsed ? <ChevronRight className="w-4 h-4" /> : <ChevronLeft className="w-4 h-4" />}
          </button>
        </div>

        {/* Live Timer Pill in Sidebar when running */}
        {isRunning && (
          <div className="px-3 pt-3">
            <button
              onClick={() => handleNavClick('focus')}
              className={`w-full text-left rounded-lg p-2.5 transition-all flex items-center gap-2.5 ${
                timerMode === 'work'
                  ? 'bg-indigo-50/80 dark:bg-indigo-950/40 border border-indigo-200 dark:border-indigo-800/60 text-indigo-700 dark:text-indigo-300'
                  : 'bg-emerald-50/80 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-800/60 text-emerald-700 dark:text-emerald-300'
              }`}
            >
              <Timer className="w-4 h-4 shrink-0 animate-spin" style={{ animationDuration: '4s' }} />
              {!collapsed && (
                <div className="flex-1 truncate">
                  <div className="text-[11px] font-semibold uppercase tracking-wider">
                    {timerMode === 'work' ? 'Focusing' : 'On Break'}
                  </div>
                  <div className="text-xs font-mono font-medium opacity-80">Timer Running</div>
                </div>
              )}
            </button>
          </div>
        )}

        {/* Nav Items List */}
        <nav className="flex-1 px-3 py-4 space-y-1 overflow-y-auto">
          {navItems.map((item) => {
            const Icon = item.icon;
            const isActive = currentTab === item.id;

            return (
              <button
                key={item.id}
                onClick={() => handleNavClick(item.id)}
                className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-all ${
                  isActive
                    ? 'bg-indigo-50 dark:bg-indigo-950/60 text-indigo-600 dark:text-indigo-400 font-semibold shadow-xs'
                    : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-100 hover:bg-slate-100/70 dark:hover:bg-slate-800/50'
                }`}
                title={collapsed ? item.label : undefined}
              >
                <Icon
                  className={`w-5 h-5 shrink-0 ${
                    isActive ? 'text-indigo-600 dark:text-indigo-400' : 'text-slate-500 dark:text-slate-400'
                  }`}
                />
                {!collapsed && (
                  <span className="flex-1 text-left truncate whitespace-nowrap">{item.label}</span>
                )}
                {!collapsed && item.tag && (
                  <span className="text-[10px] font-semibold text-indigo-600 dark:text-indigo-400">
                    {item.tag}
                  </span>
                )}
              </button>
            );
          })}
        </nav>

        {/* Footer / User Profile & Controls */}
        <div className="p-3 border-t border-slate-200 dark:border-slate-800 space-y-2">
          {/* Theme Quick Switcher */}
          <button
            onClick={toggleTheme}
            className={`w-full flex items-center gap-3 px-3 py-2 rounded-xl text-xs font-medium text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors ${
              collapsed ? 'justify-center' : ''
            }`}
            title={`Switch to ${theme === 'dark' ? 'Light' : 'Dark'} mode`}
          >
            {theme === 'dark' ? (
              <Sun className="w-4 h-4 text-amber-400 shrink-0" />
            ) : (
              <Moon className="w-4 h-4 text-slate-600 shrink-0" />
            )}
            {!collapsed && <span>{theme === 'dark' ? 'Light Mode' : 'Dark Mode'}</span>}
          </button>

          {/* User mini badge */}
          <div
            className={`flex items-center gap-2.5 p-2 rounded-xl bg-slate-50 dark:bg-slate-800/50 ${
              collapsed ? 'justify-center' : ''
            }`}
          >
            <div className="w-8 h-8 rounded-lg bg-gradient-to-tr from-slate-700 to-slate-900 text-white flex items-center justify-center font-bold text-xs shrink-0 shadow-xs">
              {user?.name ? user.name.slice(0, 2).toUpperCase() : 'AM'}
            </div>
            {!collapsed && (
              <div className="flex-1 min-w-0">
                <p className="text-xs font-semibold text-slate-900 dark:text-white truncate">
                  {user?.name || 'Atif Munshi'}
                </p>
                <div className="flex items-center gap-1 text-[11px] text-slate-500 dark:text-slate-400 truncate">
                  <Flame className="w-3 h-3 text-amber-500" />
                  <span>Pro Plan</span>
                </div>
              </div>
            )}
          </div>
        </div>
      </aside>
    </>
  );
};
