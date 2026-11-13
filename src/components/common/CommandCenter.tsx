import React, { useEffect, useMemo, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import {
  Search,
  LayoutDashboard,
  Timer,
  CheckSquare,
  Wallet,
  ReceiptText,
  CreditCard,
  BarChart3,
  Settings,
  Play,
  Pause,
  Plus,
  Maximize2,
  Palette,
  Trash2,
  Sun,
  Moon,
  ArrowRight,
  Command,
  Calendar,
  Clock,
  Layers,
  Repeat,
  ShieldAlert,
  Download,
  RefreshCw,
} from 'lucide-react';
import { useApp, NavTab } from '../../context/AppContext.tsx';
import { api } from '../../lib/api.ts';
import { formatCurrency } from '../../lib/currency.ts';
import { DESIGN_STYLES } from '../../theme/stylesRegistry.ts';
import { Bill, ExpenseTransaction, IncomeTransaction, Task, TimeBlock, BudgetEnvelope, SubscriptionPlan } from '../../types/index.ts';
import { useMotionPreferences } from '../ui/MotionPrimitives.tsx';
import {
  MOTION_DURATION,
  MOTION_EASING,
  getSpringTransition,
  getStaggerVariants,
} from '../../theme/motionTokens.ts';

interface CommandCenterProps {
  onOpenQuickAction: () => void;
}

interface PaletteEntry {
  id: string;
  group: 'Actions' | 'Navigation' | 'Tasks' | 'Finance & Bills' | 'Themes';
  title: string;
  subtitle: string;
  shortcut?: string;
  icon: React.ComponentType<{ className?: string }>;
  run: () => void;
}

export const CommandCenter: React.FC<CommandCenterProps> = ({ onOpenQuickAction }) => {
  const {
    commandCenterOpen,
    setCommandCenterOpen,
    setCurrentTab,
    isRunning,
    startTimer,
    pauseTimer,
    setFullScreenFocus,
    setTrashModalOpen,
    toggleTheme,
    theme,
    savedThemes,
    applySavedTheme,
    themeConfig,
    applyThemeConfig,
    syncNowToGoogleSheets,
  } = useApp();

  const { intensity, isDisabled } = useMotionPreferences();
  const { container: staggerContainer, item: staggerItem } = getStaggerVariants(
    intensity,
    isDisabled
  );
  const [query, setQuery] = useState('');
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [bills, setBills] = useState<Bill[]>([]);
  const [incomes, setIncomes] = useState<IncomeTransaction[]>([]);
  const [expenses, setExpenses] = useState<ExpenseTransaction[]>([]);
  const [timeBlocks, setTimeBlocks] = useState<TimeBlock[]>([]);
  const [envelopes, setEnvelopes] = useState<BudgetEnvelope[]>([]);
  const [subscriptions, setSubscriptions] = useState<SubscriptionPlan[]>([]);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!commandCenterOpen) return;
    setQuery('');
    setSelectedIndex(0);
    setTimeout(() => inputRef.current?.focus(), 40);

    Promise.all([
      api.getTasks().catch(() => [] as Task[]),
      api.getBills().catch(() => [] as Bill[]),
      api.getIncomes().catch(() => [] as IncomeTransaction[]),
      api.getExpenses().catch(() => [] as ExpenseTransaction[]),
      api.getTimeBlocks().catch(() => [] as TimeBlock[]),
      api.getEnvelopes().catch(() => [] as BudgetEnvelope[]),
      api.getSubscriptions().catch(() => [] as SubscriptionPlan[]),
    ])
      .then(([t, b, i, e, tb, env, sub]) => {
        setTasks(t.slice(0, 20));
        setBills(b.slice(0, 15));
        setIncomes(i.slice(0, 10));
        setExpenses(e.slice(0, 10));
        setTimeBlocks(tb.slice(0, 10));
        setEnvelopes(env.slice(0, 10));
        setSubscriptions(sub.slice(0, 10));
      })
      .catch(console.error);
  }, [commandCenterOpen]);

  const allEntries = useMemo<PaletteEntry[]>(() => {
    const closeAndRun = (fn: () => void) => () => {
      setCommandCenterOpen(false);
      fn();
    };

    const navEntries: Array<{ tab: NavTab; label: string; key: string; icon: React.ComponentType<{ className?: string }> }> = [
      { tab: 'dashboard', label: 'Executive Dashboard', key: 'Alt+1', icon: LayoutDashboard },
      { tab: 'calendar', label: 'Productivity Calendar', key: 'Alt+C', icon: Calendar },
      { tab: 'focus', label: 'Focus & Pomodoro System', key: 'Alt+2', icon: Timer },
      { tab: 'timeblocks', label: 'Daily Time-block Planner', key: 'Alt+B', icon: Clock },
      { tab: 'tasks', label: 'Task Management Workspace', key: 'Alt+3', icon: CheckSquare },
      { tab: 'finance', label: 'Finance Overview', key: 'Alt+4', icon: Wallet },
      { tab: 'transactions', label: 'Transactions Ledger', key: 'Alt+5', icon: ReceiptText },
      { tab: 'bills', label: 'Bills & Payments Tracker', key: 'Alt+6', icon: CreditCard },
      { tab: 'envelopes', label: 'Envelope Budgeting', key: 'Alt+E', icon: Layers },
      { tab: 'subscriptions', label: 'Subscription Manager', key: 'Alt+S', icon: Repeat },
      { tab: 'analytics', label: 'Unified Analytics & Reports', key: 'Alt+7', icon: BarChart3 },
      { tab: 'recovery', label: 'Data Recovery & Integrity Center', key: 'Alt+R', icon: ShieldAlert },
      { tab: 'settings', label: 'Settings & Theme Studio', key: 'Alt+8', icon: Settings },
    ];

    const entries: PaletteEntry[] = [
      {
        id: 'act_timer',
        group: 'Actions',
        title: isRunning ? 'Pause Active Timer' : 'Start Focus Timer',
        subtitle: isRunning ? 'Pause current focus countdown' : 'Begin a deep work session right away',
        icon: isRunning ? Pause : Play,
        run: closeAndRun(() => (isRunning ? pauseTimer() : startTimer())),
      },
      {
        id: 'act_fullscreen',
        group: 'Actions',
        title: 'Enter Full-Screen Focus Mode',
        subtitle: 'Open distraction-free immersive timer overlay',
        icon: Maximize2,
        run: closeAndRun(() => {
          setCurrentTab('focus');
          setFullScreenFocus(true);
        }),
      },
      {
        id: 'act_sheets_sync',
        group: 'Actions',
        title: 'Synchronize Google Sheets Ledger',
        subtitle: 'Flush pending sync queue to 23 executive worksheets',
        icon: RefreshCw,
        run: closeAndRun(() => {
          void syncNowToGoogleSheets();
        }),
      },
      {
        id: 'act_backup_export',
        group: 'Actions',
        title: 'Export Full Workspace JSON Snapshot',
        subtitle: 'Download point-in-time validated backup file',
        icon: Download,
        run: closeAndRun(() => {
          void api.exportBackup().then((b) => {
            const blob = new Blob([JSON.stringify(b, null, 2)], { type: 'application/json' });
            const u = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = u;
            a.download = `focusflow-backup-${new Date().toISOString().slice(0, 10)}.json`;
            a.click();
          });
        }),
      },
      {
        id: 'act_quick',
        group: 'Actions',
        title: 'Quick Create (Task / Expense / Income / Bill)',
        subtitle: 'Launch quick action composer dialog',
        icon: Plus,
        run: closeAndRun(onOpenQuickAction),
      },
      {
        id: 'act_theme_mode',
        group: 'Actions',
        title: `Switch to ${theme === 'dark' ? 'Light' : 'Dark'} Appearance`,
        subtitle: 'Toggle light and dark theme polarity immediately',
        icon: theme === 'dark' ? Sun : Moon,
        run: closeAndRun(toggleTheme),
      },
      {
        id: 'act_trash',
        group: 'Actions',
        title: 'Open Trash & Restore Bin',
        subtitle: 'Recover deleted tasks, expenses, income, bills, envelopes, or time blocks',
        icon: Trash2,
        run: closeAndRun(() => setTrashModalOpen(true)),
      },
      ...navEntries.map((n) => ({
        id: `nav_${n.tab}`,
        group: 'Navigation' as const,
        title: n.label,
        subtitle: `Navigate to ${n.tab}`,
        shortcut: n.key,
        icon: n.icon,
        run: closeAndRun(() => setCurrentTab(n.tab)),
      })),
      ...tasks.map((t) => ({
        id: `task_${t.id}`,
        group: 'Tasks' as const,
        title: t.title,
        subtitle: `${t.status.replace('_', ' ')} • ${t.priority} priority${t.dueDate ? ` • Due ${t.dueDate}` : ''}`,
        icon: CheckSquare,
        run: closeAndRun(() => setCurrentTab('tasks')),
      })),
      ...timeBlocks.map((tb) => ({
        id: `timeblock_${tb.id}`,
        group: 'Tasks' as const,
        title: `Block: ${tb.title}`,
        subtitle: `Time Block • ${tb.date} • ${tb.category}`,
        icon: Clock,
        run: closeAndRun(() => setCurrentTab('timeblocks')),
      })),
      ...bills.map((b) => ({
        id: `bill_${b.id}`,
        group: 'Finance & Bills' as const,
        title: `${b.name} (${formatCurrency(b.amountPaise)})`,
        subtitle: `Bill • ${b.status} • Due ${b.dueDate}`,
        icon: CreditCard,
        run: closeAndRun(() => setCurrentTab('bills')),
      })),
      ...envelopes.map((env) => ({
        id: `env_${env.id}`,
        group: 'Finance & Bills' as const,
        title: `Envelope: ${env.name} (${formatCurrency(env.allocatedPaise)})`,
        subtitle: `Budget • ${env.monthKey} • ${formatCurrency(env.allocatedPaise - (env.spentPaise || 0))} remaining`,
        icon: Layers,
        run: closeAndRun(() => setCurrentTab('envelopes')),
      })),
      ...subscriptions.map((sub) => ({
        id: `sub_${sub.id}`,
        group: 'Finance & Bills' as const,
        title: `Subscription: ${sub.name} (${formatCurrency(sub.amountPaise)})`,
        subtitle: `${sub.billingCycle} • Next renewal ${sub.nextRenewalDate}`,
        icon: Repeat,
        run: closeAndRun(() => setCurrentTab('subscriptions')),
      })),
      ...incomes.map((i) => ({
        id: `inc_${i.id}`,
        group: 'Finance & Bills' as const,
        title: `+${formatCurrency(i.amountPaise)} • ${i.source}`,
        subtitle: `Income • ${i.category} • ${i.date}`,
        icon: ReceiptText,
        run: closeAndRun(() => setCurrentTab('transactions')),
      })),
      ...expenses.map((e) => ({
        id: `exp_${e.id}`,
        group: 'Finance & Bills' as const,
        title: `-${formatCurrency(e.amountPaise)} • ${e.description}`,
        subtitle: `Expense • ${e.categoryName || e.type} • ${e.date}`,
        icon: ReceiptText,
        run: closeAndRun(() => setCurrentTab('transactions')),
      })),
      ...savedThemes.map((s) => ({
        id: `saved_theme_${s.id}`,
        group: 'Themes' as const,
        title: `Apply Saved Theme: ${s.name}`,
        subtitle: s.description || `Style preset: ${s.config.styleId}`,
        icon: Palette,
        run: closeAndRun(() => {
          void applySavedTheme(s.id);
        }),
      })),
      ...DESIGN_STYLES.map((st) => ({
        id: `style_${st.id}`,
        group: 'Themes' as const,
        title: `Switch Style: ${st.name}`,
        subtitle: st.tagline,
        icon: Palette,
        run: closeAndRun(() => {
          void applyThemeConfig({ ...themeConfig, styleId: st.id }, null);
        }),
      })),
    ];

    return entries;
  }, [
    isRunning,
    theme,
    tasks,
    bills,
    incomes,
    expenses,
    timeBlocks,
    envelopes,
    subscriptions,
    savedThemes,
    themeConfig,
    setCommandCenterOpen,
    pauseTimer,
    startTimer,
    setCurrentTab,
    setFullScreenFocus,
    onOpenQuickAction,
    toggleTheme,
    setTrashModalOpen,
    applySavedTheme,
    applyThemeConfig,
    syncNowToGoogleSheets,
  ]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) {
      return allEntries.slice(0, 14);
    }
    return allEntries
      .filter(
        (entry) =>
          entry.title.toLowerCase().includes(q) ||
          entry.subtitle.toLowerCase().includes(q) ||
          entry.group.toLowerCase().includes(q)
      )
      .slice(0, 18);
  }, [allEntries, query]);

  useEffect(() => {
    setSelectedIndex(0);
  }, [query]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') {
      e.preventDefault();
      setCommandCenterOpen(false);
    } else if (e.key === 'ArrowDown') {
      e.preventDefault();
      setSelectedIndex((prev) => (filtered.length > 0 ? (prev + 1) % filtered.length : 0));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setSelectedIndex((prev) =>
        filtered.length > 0 ? (prev - 1 + filtered.length) % filtered.length : 0
      );
    } else if (e.key === 'Enter' && filtered[selectedIndex]) {
      e.preventDefault();
      filtered[selectedIndex].run();
    }
  };

  return (
    <AnimatePresence>
      {commandCenterOpen && (
        <div
          className="fixed inset-0 z-50 flex items-start justify-center pt-[12vh] px-4"
          role="dialog"
          aria-modal="true"
          aria-label="Global Command Center"
        >
          <motion.div
            initial={isDisabled ? { opacity: 1 } : { opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: MOTION_DURATION.dropdown }}
            onClick={() => setCommandCenterOpen(false)}
            className="fixed inset-0 bg-slate-950/65 backdrop-blur-sm"
          />

          <motion.div
            initial={isDisabled ? false : { opacity: 0, y: -12, scale: 0.97 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={isDisabled ? { opacity: 0 } : { opacity: 0, y: -10, scale: 0.97 }}
            transition={{ duration: MOTION_DURATION.card, ease: MOTION_EASING.decelerate }}
            onKeyDown={handleKeyDown}
            className="ff-card-elevated relative z-10 w-full max-w-2xl overflow-hidden"
          >
            {/* Search Bar */}
            <div
              className="flex items-center gap-3 px-4 py-3.5 border-b"
              style={{ borderColor: 'var(--ff-border-color)' }}
            >
              <Search className="w-4 h-4 shrink-0" style={{ color: 'var(--ff-accent-text)' }} />
              <input
                ref={inputRef}
                type="text"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search pages, tasks, bills, transactions, themes, or actions..."
                className="flex-1 bg-transparent outline-none text-sm font-medium text-[var(--ff-text-primary)] placeholder:text-[var(--ff-text-muted)]"
              />
              <kbd className="text-[10px] font-bold px-2 py-0.5 rounded border border-[var(--ff-border-color)] text-[var(--ff-text-muted)]">
                ESC
              </kbd>
            </div>

            {/* Results List */}
            <motion.div
              key={query}
              variants={staggerContainer}
              initial={isDisabled ? false : 'hidden'}
              animate="show"
              className="max-h-[54vh] overflow-y-auto p-2 space-y-1"
            >
              {filtered.length === 0 ? (
                <div className="py-10 text-center text-sm text-[var(--ff-text-muted)]">
                  No matching commands or records for &ldquo;{query}&rdquo;.
                </div>
              ) : (
                filtered.map((item, idx) => {
                  const Icon = item.icon;
                  const active = idx === selectedIndex;
                  return (
                    <motion.button
                      key={item.id}
                      type="button"
                      variants={staggerItem}
                      onMouseEnter={() => setSelectedIndex(idx)}
                      onClick={item.run}
                      className="relative w-full flex items-center justify-between gap-3 px-3 py-2.5 text-left transition-colors"
                      style={{
                        borderRadius: 'var(--ff-radius-button)',
                        color: active ? 'var(--ff-text-primary)' : 'var(--ff-text-secondary)',
                      }}
                    >
                      {active && (
                        <motion.div
                          layoutId="command-selection-pill"
                          transition={getSpringTransition(intensity, isDisabled)}
                          className="absolute inset-0 z-0 pointer-events-none"
                          style={{
                            borderRadius: 'var(--ff-radius-button)',
                            background: 'var(--ff-accent-soft)',
                            border: '1px solid var(--ff-accent-border)',
                            boxShadow: '0 1px 3px rgba(0, 0, 0, 0.04)',
                          }}
                        />
                      )}
                      <div className="relative z-10 flex items-center gap-3 min-w-0">
                        <div
                          className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0 transition-colors"
                          style={{
                            background: active ? 'var(--ff-accent)' : 'var(--ff-surface-subtle)',
                            color: active ? 'var(--ff-accent-contrast)' : 'var(--ff-accent-text)',
                          }}
                        >
                          <Icon className="w-4 h-4" />
                        </div>
                        <div className="min-w-0">
                          <div className="text-sm font-semibold truncate">{item.title}</div>
                          <div className="text-xs text-[var(--ff-text-muted)] truncate">
                            <span className="font-semibold text-[var(--ff-accent-text)]">{item.group}</span>{' '}
                            • {item.subtitle}
                          </div>
                        </div>
                      </div>
                      <div className="relative z-10 flex items-center gap-2 shrink-0">
                        {item.shortcut && (
                          <kbd className="text-[10px] font-bold px-1.5 py-0.5 rounded border border-[var(--ff-border-color)] text-[var(--ff-text-muted)]">
                            {item.shortcut}
                          </kbd>
                        )}
                        {active && <ArrowRight className="w-3.5 h-3.5 text-[var(--ff-accent-text)]" />}
                      </div>
                    </motion.button>
                  );
                })
              )}
            </motion.div>

            {/* Footer Hints */}
            <div
              className="px-4 py-2 border-t flex items-center justify-between text-[11px] text-[var(--ff-text-muted)]"
              style={{
                borderColor: 'var(--ff-border-color)',
                background: 'var(--ff-surface-subtle)',
              }}
            >
              <span className="flex items-center gap-1.5">
                <Command className="w-3 h-3" /> Use ↑ ↓ arrows and Enter to launch
              </span>
              <span>Deterministic Workspace Search</span>
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
};
