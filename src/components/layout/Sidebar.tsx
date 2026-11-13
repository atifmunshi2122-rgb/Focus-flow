import React from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { useApp, NavTab } from '../../context/AppContext.tsx';
import { getStyleDefinition } from '../../theme/stylesRegistry.ts';
import { useMotionPreferences } from '../ui/MotionPrimitives.tsx';
import { MOTION_DURATION, MOTION_EASING, getIntensityFactor } from '../../theme/motionTokens.ts';
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
  Flame,
  Sun,
  Moon,
  Palette,
  Calendar,
  Clock,
  Layers,
  Repeat,
  ShieldAlert,
  X,
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
  section: string;
}

export const Sidebar: React.FC<SidebarProps> = ({
  collapsed,
  setCollapsed,
  mobileOpen,
  setMobileOpen,
}) => {
  const {
    currentTab,
    setCurrentTab,
    user,
    theme,
    toggleTheme,
    isRunning,
    timerMode,
    effectiveThemeConfig,
  } = useApp();

  const { isDisabled, intensity } = useMotionPreferences();
  const activeStyle = getStyleDefinition(effectiveThemeConfig.styleId);
  const factor = getIntensityFactor(intensity);
  const isExpanded = !collapsed || mobileOpen;

  const navItems: NavItem[] = [
    { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard, section: 'Overview' },
    { id: 'calendar', label: 'Calendar', icon: Calendar, section: 'Overview' },
    { id: 'focus', label: 'Focus & Timer', icon: Timer, tag: isRunning ? 'Active' : undefined, section: 'Focus & Productivity' },
    { id: 'timeblocks', label: 'Time Blocks', icon: Clock, section: 'Focus & Productivity' },
    { id: 'tasks', label: 'Tasks', icon: CheckSquare, section: 'Focus & Productivity' },
    { id: 'finance', label: 'Finance Overview', icon: Wallet, section: 'Wealth & Finance' },
    { id: 'transactions', label: 'Transactions', icon: ReceiptText, section: 'Wealth & Finance' },
    { id: 'bills', label: 'Bills & Payments', icon: CreditCard, section: 'Wealth & Finance' },
    { id: 'envelopes', label: 'Envelope Budgets', icon: Layers, section: 'Wealth & Finance' },
    { id: 'subscriptions', label: 'Subscriptions', icon: Repeat, section: 'Wealth & Finance' },
    { id: 'analytics', label: 'Analytics', icon: BarChart3, section: 'System & Intelligence' },
    { id: 'recovery', label: 'Data Recovery', icon: ShieldAlert, section: 'System & Intelligence' },
    { id: 'settings', label: 'Settings', icon: Settings, section: 'System & Intelligence' },
  ];

  const handleNavClick = (tab: NavTab) => {
    setCurrentTab(tab);
    setMobileOpen(false);
  };

  return (
    <>
      {/* Mobile Backdrop */}
      <AnimatePresence>
        {mobileOpen && (
          <motion.div
            key="sidebar-mobile-backdrop"
            initial={isDisabled ? { opacity: 1 } : { opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={isDisabled ? { opacity: 0 } : { opacity: 0 }}
            transition={{ duration: MOTION_DURATION.dropdown, ease: MOTION_EASING.standard }}
            className="fixed inset-0 bg-slate-950/60 backdrop-blur-xs z-40 lg:hidden"
            onClick={() => setMobileOpen(false)}
            aria-hidden="true"
          />
        )}
      </AnimatePresence>

      {/* Sidebar Container */}
      <aside
        className={`ff-sidebar fixed lg:sticky top-0 left-0 z-50 h-[100dvh] flex flex-col justify-between select-none transition-[transform,width] duration-300 ease-out w-64 ${
          collapsed ? 'lg:w-20' : 'lg:w-64'
        } ${mobileOpen ? 'translate-x-0' : '-translate-x-full lg:translate-x-0'}`}
      >
        {/* Top Header / Brand */}
        <div
          className="flex items-center justify-between h-16 px-4 border-b"
          style={{ borderColor: 'var(--ff-border-color)' }}
        >
          <div className="flex items-center gap-3 overflow-hidden">
            <motion.div
              whileHover={isDisabled ? undefined : { scale: 1.05, rotate: -4 }}
              whileTap={isDisabled ? undefined : { scale: 0.95 }}
              transition={{ duration: MOTION_DURATION.micro, ease: MOTION_EASING.standard }}
              className="w-10 h-10 flex items-center justify-center overflow-hidden shrink-0 bg-black"
              style={{
                borderRadius: 'var(--ff-radius-button)',
                boxShadow: 'var(--ff-shadow-button)',
              }}
            >
              <img
                src="/logo.png"
                alt="FocusFlow & Finance Logo"
                className="w-full h-full object-cover"
              />
            </motion.div>
            {isExpanded && (
              <div className="flex flex-col min-w-0">
                <span className="ff-heading font-bold text-base truncate">
                  FocusFlow
                </span>
                <span className="ff-sidebar-muted text-[11px] font-medium text-[var(--ff-text-muted)] truncate">
                  &amp; Finance Command
                </span>
              </div>
            )}
          </div>

          {/* Desktop Collapse Toggle */}
          <button
            type="button"
            onClick={() => setCollapsed(!collapsed)}
            className="hidden lg:flex items-center justify-center w-7 h-7 rounded-lg text-[var(--ff-text-muted)] hover:text-[var(--ff-text-primary)] hover:bg-[var(--ff-surface-hover)] transition-colors"
            title={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
            aria-label="Toggle sidebar collapse"
          >
            <motion.span
              animate={{ rotate: collapsed ? 180 : 0 }}
              transition={{ duration: isDisabled ? 0.01 : MOTION_DURATION.control, ease: MOTION_EASING.standard }}
              className="inline-flex"
            >
              <ChevronLeft className="w-4 h-4" />
            </motion.span>
          </button>

          {/* Mobile Close Button (>= 44x44px touch target) */}
          <button
            type="button"
            onClick={() => setMobileOpen(false)}
            className="lg:hidden flex items-center justify-center min-w-[44px] min-h-[44px] rounded-lg text-[var(--ff-text-muted)] hover:text-[var(--ff-text-primary)] hover:bg-[var(--ff-surface-hover)] transition-colors"
            aria-label="Close navigation drawer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Live Timer Pill in Sidebar when running */}
        <AnimatePresence initial={false}>
          {isRunning && (
            <motion.div
              key="sidebar-live-timer"
              initial={isDisabled ? false : { opacity: 0, height: 0, y: -6 }}
              animate={{ opacity: 1, height: 'auto', y: 0 }}
              exit={isDisabled ? { opacity: 0 } : { opacity: 0, height: 0, y: -6 }}
              transition={{ duration: MOTION_DURATION.card * Math.max(0.5, factor || 0.01), ease: MOTION_EASING.decelerate }}
              className="px-3 pt-3 overflow-hidden"
            >
              <button
                type="button"
                onClick={() => handleNavClick('focus')}
                className="w-full text-left p-2.5 transition-all flex items-center gap-2.5 border hover:brightness-105"
                style={{
                  borderRadius: 'var(--ff-radius-button)',
                  background: timerMode === 'work' ? 'var(--ff-accent-soft)' : 'var(--ff-success-soft)',
                  borderColor: timerMode === 'work' ? 'var(--ff-accent-border)' : 'var(--ff-success)',
                  color: timerMode === 'work' ? 'var(--ff-accent-text)' : 'var(--ff-success)',
                }}
              >
                <Timer
                  className={`w-4 h-4 shrink-0 ${isDisabled ? '' : 'animate-spin'}`}
                  style={{ animationDuration: '4s' }}
                />
                {isExpanded && (
                  <div className="flex-1 truncate">
                    <div className="text-[11px] font-semibold uppercase tracking-wider">
                      {timerMode === 'work' ? 'Focusing' : 'On Break'}
                    </div>
                    <div className="text-xs font-mono font-medium opacity-80">Timer Running</div>
                  </div>
                )}
              </button>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Nav Items List */}
        <nav aria-label="Primary Sidebar" className="flex-1 px-3 py-3 space-y-1 overflow-y-auto scrollbar-thin">
          {navItems.map((item, index) => {
            const Icon = item.icon;
            const isActive = currentTab === item.id;
            const isFirstOfSection = index === 0 || navItems[index - 1].section !== item.section;

            return (
              <React.Fragment key={item.id}>
                {/* Section Header when Expanded */}
                {isExpanded && isFirstOfSection && (
                  <div
                    className={`px-2.5 text-[10px] font-bold uppercase tracking-wider text-[var(--ff-text-muted)] select-none opacity-75 ${
                      index === 0 ? 'mb-1' : 'mt-3 mb-1'
                    }`}
                  >
                    {item.section}
                  </div>
                )}

                {/* Subtle Divider when Collapsed */}
                {!isExpanded && index > 0 && isFirstOfSection && (
                  <div className="my-1.5 mx-2 border-t border-[var(--ff-border-color)] opacity-40" />
                )}

                <motion.button
                  type="button"
                  data-tab={item.id}
                  data-nav-id={item.id}
                  data-active={isActive ? 'true' : 'false'}
                  onClick={() => handleNavClick(item.id)}
                  whileHover={isDisabled ? undefined : { x: !isExpanded || isActive ? 0 : 2 }}
                  whileTap={isDisabled ? undefined : { scale: 0.98 }}
                  transition={{ duration: MOTION_DURATION.micro, ease: MOTION_EASING.standard }}
                  className="ff-sidebar-item group relative w-full flex items-center gap-2.5 px-2.5 py-2 text-sm font-medium transition-colors hover:bg-[var(--ff-surface-hover)]"
                  style={{
                    borderRadius: 'var(--ff-radius-button)',
                    color: isActive ? 'var(--ff-accent-text)' : 'var(--ff-text-secondary)',
                    fontWeight: isActive ? 700 : 500,
                  }}
                  title={!isExpanded ? item.label : undefined}
                >
                  {/* Left Accent Bar on Active Tab */}
                  {isActive && (
                    <motion.span
                      layoutId="sidebar-active-indicator"
                      aria-hidden="true"
                      className="absolute left-0 top-1.5 bottom-1.5 w-1 rounded-r-full z-20 pointer-events-none"
                      style={{
                        backgroundColor: 'var(--ff-accent)',
                        boxShadow: '0 0 8px var(--ff-accent-border)',
                      }}
                    />
                  )}

                  {/* Active Surface Pill */}
                  {isActive && (
                    <motion.span
                      layoutId="sidebar-nav-active-pill"
                      aria-hidden="true"
                      transition={
                        isDisabled
                          ? { duration: 0.01 }
                          : { type: 'spring', stiffness: 420, damping: 34 }
                      }
                      className="absolute inset-0 pointer-events-none z-0"
                      style={{
                        borderRadius: 'var(--ff-radius-button)',
                        background: 'color-mix(in oklab, var(--ff-accent) 15%, var(--ff-surface-card))',
                        border: '1px solid var(--ff-accent-border)',
                        boxShadow: '0 1px 3px rgba(0, 0, 0, 0.05)',
                      }}
                    />
                  )}

                  {/* Icon Box */}
                  <span
                    className="relative z-10 w-7 h-7 flex items-center justify-center shrink-0 rounded-md transition-all"
                    style={{
                      color: isActive ? 'var(--ff-accent)' : 'inherit',
                      background: isActive ? 'var(--ff-accent-soft)' : 'transparent',
                    }}
                  >
                    <Icon className="w-4 h-4 transition-transform group-hover:scale-105" />
                  </span>

                  {/* Text Label */}
                  {isExpanded && (
                    <span
                      className="relative z-10 flex-1 text-left truncate whitespace-nowrap text-xs transition-colors"
                      style={{
                        color: isActive ? 'var(--ff-accent-text)' : 'inherit',
                        fontWeight: isActive ? 700 : 500,
                      }}
                    >
                      {item.label}
                    </span>
                  )}

                  {/* Tag Badge */}
                  {isExpanded && item.tag && (
                    <span
                      className="relative z-10 px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wider rounded"
                      style={{
                        background: 'var(--ff-accent)',
                        color: 'var(--ff-accent-contrast)',
                        boxShadow: 'var(--ff-shadow-button)',
                      }}
                    >
                      {item.tag}
                    </span>
                  )}
                </motion.button>
              </React.Fragment>
            );
          })}
        </nav>

        {/* Footer / Style Indicator, Theme Mode & Profile */}
        <div
          className="p-3 border-t space-y-2 pb-[max(0.75rem,env(safe-area-inset-bottom))]"
          style={{ borderColor: 'var(--ff-border-color)' }}
        >
          {/* Active Style Quick Jump */}
          <button
            type="button"
            onClick={() => handleNavClick('settings')}
            className={`w-full flex items-center gap-2.5 px-3 py-2 text-xs font-medium transition-colors border ${
              !isExpanded ? 'justify-center' : ''
            }`}
            style={{
              borderRadius: 'var(--ff-radius-button)',
              background: 'var(--ff-surface-muted)',
              borderColor: 'var(--ff-border-color)',
              color: 'var(--ff-text-primary)',
            }}
            title={`Active style: ${activeStyle.name} — Open Theme Studio`}
          >
            <Palette className="w-4 h-4 shrink-0" style={{ color: 'var(--ff-accent-text)' }} />
            {isExpanded && (
              <span className="flex-1 text-left truncate">{activeStyle.name}</span>
            )}
          </button>

          {/* Theme Quick Switcher */}
          <button
            type="button"
            onClick={toggleTheme}
            className={`w-full flex items-center gap-3 px-3 py-2 text-xs font-medium text-[var(--ff-text-secondary)] hover:bg-[var(--ff-surface-hover)] transition-colors ${
              !isExpanded ? 'justify-center' : ''
            }`}
            style={{ borderRadius: 'var(--ff-radius-button)' }}
            title={`Switch to ${theme === 'dark' ? 'Light' : 'Dark'} mode`}
          >
            <AnimatePresence mode="popLayout" initial={false}>
              <motion.span
                key={theme}
                initial={isDisabled ? false : { rotate: -35, scale: 0.7, opacity: 0 }}
                animate={{ rotate: 0, scale: 1, opacity: 1 }}
                exit={isDisabled ? { opacity: 0 } : { rotate: 35, scale: 0.7, opacity: 0 }}
                transition={{ duration: MOTION_DURATION.micro, ease: MOTION_EASING.standard }}
                className="inline-flex shrink-0"
              >
                {theme === 'dark' ? (
                  <Sun className="w-4 h-4" style={{ color: 'var(--ff-warning)' }} />
                ) : (
                  <Moon className="w-4 h-4" />
                )}
              </motion.span>
            </AnimatePresence>
            {isExpanded && <span>{theme === 'dark' ? 'Light Mode' : 'Dark Mode'}</span>}
          </button>

          {/* User mini badge */}
          <div
            className={`flex items-center gap-2.5 p-2 ${!isExpanded ? 'justify-center' : ''}`}
            style={{
              borderRadius: 'var(--ff-radius-button)',
              background: 'var(--ff-surface-muted)',
            }}
          >
            <div
              className="w-8 h-8 flex items-center justify-center font-bold text-xs shrink-0"
              style={{
                borderRadius: 'var(--ff-radius-badge)',
                background: 'var(--ff-accent)',
                color: 'var(--ff-accent-contrast)',
              }}
            >
              {user?.name ? user.name.slice(0, 2).toUpperCase() : 'AM'}
            </div>
            {isExpanded && (
              <div className="flex-1 min-w-0">
                <p className="text-xs font-semibold truncate text-[var(--ff-text-primary)]">
                  {user?.name || 'Atif Munshi'}
                </p>
                <div className="ff-sidebar-muted flex items-center gap-1 text-[11px] text-[var(--ff-text-muted)] truncate">
                  <Flame className="w-3 h-3" style={{ color: 'var(--ff-warning)' }} />
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
