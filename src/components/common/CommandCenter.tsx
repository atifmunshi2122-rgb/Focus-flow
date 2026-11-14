import React, { useEffect, useMemo, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import {
  Search,
  LayoutDashboard,
  Timer,
  CheckSquare,
  Wallet,
  Receipt,
  ReceiptText,
  CreditCard,
  BarChart3,
  Settings,
  Palette,
  Trash2,
  Sun,
  Moon,
  ArrowRight,
  Calendar,
  Clock,
  Layers,
  Repeat,
  ShieldAlert,
  Download,
  RefreshCw,
  Flame,
  Target,
  X,
  History,
  Sparkles,
  Zap,
  GraduationCap,
} from 'lucide-react';
import { useApp, NavTab } from '../../context/AppContext.tsx';
import { api } from '../../lib/api.ts';
import { Bill, ExpenseTransaction, Habit, IncomeTransaction, SavingsGoal, SubscriptionPlan, Task, TimeBlock, BudgetEnvelope } from '../../types/index.ts';
import { useMotionPreferences } from '../ui/MotionPrimitives.tsx';
import {
  clearRecentSearches,
  getContextualCommandSuggestions,
  getRecentActions,
  getRecentSearches,
  HighlightMatch,
  recordRecentAction,
  removeRecentSearch,
  saveRecentSearch,
  SearchFilterType,
  searchUniversalWorkspace,
  UniversalSearchHit,
} from '../../lib/searchEngine.tsx';
import { ThemeBadge } from '../ui/ThemePrimitives.tsx';

interface CommandCenterProps {
  onOpenQuickAction: (initialType?: 'task' | 'expense' | 'income' | 'bill' | 'habit' | 'envelope' | 'goal') => void;
}

const FILTER_TABS: Array<{ id: SearchFilterType; label: string }> = [
  { id: 'all', label: 'All' },
  { id: 'actions', label: 'Actions' },
  { id: 'navigation', label: 'Pages' },
  { id: 'tasks', label: 'Tasks' },
  { id: 'finance', label: 'Finance' },
  { id: 'habits', label: 'Habits' },
  { id: 'budgets', label: 'Budgets' },
  { id: 'settings', label: 'Settings' },
];

export const CommandCenter: React.FC<CommandCenterProps> = ({ onOpenQuickAction }) => {
  const {
    commandCenterOpen,
    setCommandCenterOpen,
    setCurrentTab,
    isRunning,
    startTimer,
    pauseTimer,
    toggleTheme,
    theme,
    savedThemes,
    applySavedTheme,
    themeConfig,
    applyThemeConfig,
    syncNowToGoogleSheets,
    setTrashModalOpen,
    showToast,
  } = useApp();

  const { isDisabled, profile } = useMotionPreferences();
  const [query, setQuery] = useState('');
  const [activeFilter, setActiveFilter] = useState<SearchFilterType>('all');
  const [selectedIndex, setSelectedIndex] = useState(0);

  // Data caches
  const [tasks, setTasks] = useState<Task[]>([]);
  const [bills, setBills] = useState<Bill[]>([]);
  const [incomes, setIncomes] = useState<IncomeTransaction[]>([]);
  const [expenses, setExpenses] = useState<ExpenseTransaction[]>([]);
  const [habits, setHabits] = useState<Habit[]>([]);
  const [envelopes, setEnvelopes] = useState<BudgetEnvelope[]>([]);
  const [savingsGoals, setSavingsGoals] = useState<SavingsGoal[]>([]);
  const [timeBlocks, setTimeBlocks] = useState<TimeBlock[]>([]);
  const [subscriptions, setSubscriptions] = useState<SubscriptionPlan[]>([]);

  // Recent history
  const [recentSearchesList, setRecentSearchesList] = useState<string[]>([]);
  const [recentActionsList, setRecentActionsList] = useState<string[]>([]);

  const inputRef = useRef<HTMLInputElement>(null);
  const resultsContainerRef = useRef<HTMLDivElement>(null);

  // Load data on open
  useEffect(() => {
    if (!commandCenterOpen) return;
    setQuery('');
    setActiveFilter('all');
    setSelectedIndex(0);
    setRecentSearchesList(getRecentSearches());
    setRecentActionsList(getRecentActions());
    setTimeout(() => inputRef.current?.focus(), 50);

    Promise.all([
      api.getTasks().catch(() => [] as Task[]),
      api.getBills().catch(() => [] as Bill[]),
      api.getIncomes().catch(() => [] as IncomeTransaction[]),
      api.getExpenses().catch(() => [] as ExpenseTransaction[]),
      api.getHabits().catch(() => [] as Habit[]),
      api.getEnvelopes().catch(() => [] as BudgetEnvelope[]),
      api.getSavingsGoals().catch(() => [] as SavingsGoal[]),
      api.getTimeBlocks().catch(() => [] as TimeBlock[]),
      api.getSubscriptions().catch(() => [] as SubscriptionPlan[]),
    ])
      .then(([t, b, i, e, h, env, sg, tb, sub]) => {
        setTasks(t);
        setBills(b);
        setIncomes(i);
        setExpenses(e);
        setHabits(h);
        setEnvelopes(env);
        setSavingsGoals(sg);
        setTimeBlocks(tb);
        setSubscriptions(sub);
      })
      .catch(console.error);
  }, [commandCenterOpen]);

  // Search Results
  const searchResults = useMemo<UniversalSearchHit[]>(() => {
    return searchUniversalWorkspace(query, activeFilter, {
      tasks,
      bills,
      incomes,
      expenses,
      habits,
      envelopes,
      savingsGoals,
      timeBlocks,
      subscriptions,
      onNavigate: (tab: NavTab) => {
        setCommandCenterOpen(false);
        setCurrentTab(tab);
      },
      onOpenQuickAction: (initialType) => {
        setCommandCenterOpen(false);
        onOpenQuickAction(initialType);
      },
      onStartTimer: () => {
        setCommandCenterOpen(false);
        startTimer();
      },
      onPauseTimer: () => {
        setCommandCenterOpen(false);
        pauseTimer();
      },
      isTimerRunning: isRunning,
      onToggleTheme: () => {
        setCommandCenterOpen(false);
        toggleTheme();
      },
      isDarkMode: theme === 'dark',
      onSyncSheets: () => {
        setCommandCenterOpen(false);
        void syncNowToGoogleSheets();
      },
      onExportBackup: () => {
        setCommandCenterOpen(false);
        void api.exportBackup().then((b) => {
          const blob = new Blob([JSON.stringify(b, null, 2)], { type: 'application/json' });
          const u = URL.createObjectURL(blob);
          const a = document.createElement('a');
          a.href = u;
          a.download = `focusflow-backup-${new Date().toISOString().slice(0, 10)}.json`;
          a.click();
          showToast('Backup JSON exported successfully', 'success');
        });
      },
      onOpenTrash: () => {
        setCommandCenterOpen(false);
        setTrashModalOpen(true);
      },
      onApplyThemeId: (styleId: string) => {
        setCommandCenterOpen(false);
        void applyThemeConfig({ ...themeConfig, styleId: styleId as any }, null);
      },
    });
  }, [
    query,
    activeFilter,
    tasks,
    bills,
    incomes,
    expenses,
    habits,
    envelopes,
    savingsGoals,
    timeBlocks,
    subscriptions,
    isRunning,
    theme,
    themeConfig,
    setCommandCenterOpen,
    setCurrentTab,
    onOpenQuickAction,
    startTimer,
    pauseTimer,
    toggleTheme,
    syncNowToGoogleSheets,
    setTrashModalOpen,
    applyThemeConfig,
    showToast,
  ]);

  // Contextual rule-based suggestions when query is empty
  const contextualSuggestions = useMemo(() => {
    return getContextualCommandSuggestions({
      tasks,
      expenses,
      habits,
      isTimerRunning: isRunning,
    });
  }, [tasks, expenses, habits, isRunning]);

  // Reset selected index on query/filter change
  useEffect(() => {
    setSelectedIndex(0);
  }, [query, activeFilter]);

  // Keyboard navigation
  useEffect(() => {
    if (!commandCenterOpen) return;

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        setCommandCenterOpen(false);
      } else if (e.key === 'ArrowDown') {
        e.preventDefault();
        setSelectedIndex((prev) => (prev < searchResults.length - 1 ? prev + 1 : 0));
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        setSelectedIndex((prev) => (prev > 0 ? prev - 1 : Math.max(0, searchResults.length - 1)));
      } else if (e.key === 'Enter') {
        e.preventDefault();
        const selected = searchResults[selectedIndex];
        if (selected) {
          if (query.trim()) {
            saveRecentSearch(query.trim());
          }
          recordRecentAction(selected.id);
          selected.run();
        }
      } else if (e.key === 'Tab') {
        e.preventDefault();
        // Cycle filter tabs
        const currentIdx = FILTER_TABS.findIndex((f) => f.id === activeFilter);
        const nextIdx = (currentIdx + 1) % FILTER_TABS.length;
        setActiveFilter(FILTER_TABS[nextIdx].id);
      }
    };

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [commandCenterOpen, searchResults, selectedIndex, query, activeFilter, setCommandCenterOpen]);

  // Auto-scroll selected item into view
  useEffect(() => {
    if (!resultsContainerRef.current) return;
    const items = resultsContainerRef.current.querySelectorAll('[data-search-item]');
    const activeItem = items[selectedIndex] as HTMLElement | undefined;
    if (activeItem) {
      activeItem.scrollIntoView({ block: 'nearest' });
    }
  }, [selectedIndex]);

  const renderIcon = (name: string) => {
    switch (name) {
      case 'LayoutDashboard': return <LayoutDashboard className="w-4 h-4" />;
      case 'Timer': return <Timer className="w-4 h-4" />;
      case 'CheckSquare': return <CheckSquare className="w-4 h-4" />;
      case 'Flame': return <Flame className="w-4 h-4" />;
      case 'Wallet': return <Wallet className="w-4 h-4" />;
      case 'Receipt': return <Receipt className="w-4 h-4" />;
      case 'ReceiptText': return <ReceiptText className="w-4 h-4" />;
      case 'CreditCard': return <CreditCard className="w-4 h-4" />;
      case 'Layers': return <Layers className="w-4 h-4" />;
      case 'Repeat': return <Repeat className="w-4 h-4" />;
      case 'BarChart3': return <BarChart3 className="w-4 h-4" />;
      case 'Calendar': return <Calendar className="w-4 h-4" />;
      case 'Clock': return <Clock className="w-4 h-4" />;
      case 'Target': return <Target className="w-4 h-4" />;
      case 'ShieldAlert': return <ShieldAlert className="w-4 h-4" />;
      case 'Settings': return <Settings className="w-4 h-4" />;
      case 'Palette': return <Palette className="w-4 h-4" />;
      case 'RefreshCw': return <RefreshCw className="w-4 h-4" />;
      case 'Download': return <Download className="w-4 h-4" />;
      case 'Trash2': return <Trash2 className="w-4 h-4" />;
      case 'Sun': return <Sun className="w-4 h-4" />;
      case 'Moon': return <Moon className="w-4 h-4" />;
      case 'GraduationCap': return <GraduationCap className="w-4 h-4" />;
      default: return <Sparkles className="w-4 h-4" />;
    }
  };

  return (
    <AnimatePresence>
      {commandCenterOpen && (
        <div className="fixed inset-0 z-50 flex items-start justify-center pt-12 sm:pt-20 px-3 sm:px-4">
          {/* Glass Backdrop */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: isDisabled ? 0.01 : 0.16 }}
            onClick={() => setCommandCenterOpen(false)}
            className="fixed inset-0 bg-black/60 backdrop-blur-md"
          />

          {/* Palette Dialog */}
          <motion.div
            initial={isDisabled ? false : { opacity: 0, scale: 0.96, y: -14 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={isDisabled ? { opacity: 0 } : { opacity: 0, scale: 0.96, y: -10 }}
            transition={profile.modal}
            className="relative w-full max-w-2xl rounded-2xl border border-[var(--ff-border-color)] bg-[var(--ff-surface-elevated)] shadow-2xl overflow-hidden flex flex-col max-h-[85vh] z-10"
            style={{
              boxShadow: '0 25px 60px -15px rgba(0, 0, 0, 0.5), 0 0 0 1px var(--ff-border-color)',
            }}
          >
            {/* Search Bar Input */}
            <div className="flex items-center gap-3 px-4 py-3.5 border-b border-[var(--ff-border-color)] bg-[var(--ff-surface-card)]">
              <Search className="w-5 h-5 text-[var(--ff-accent-text)] shrink-0" />
              <input
                ref={inputRef}
                type="text"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search tasks, transactions, habits, budgets, pages, or commands..."
                className="w-full bg-transparent text-sm text-[var(--ff-text-primary)] placeholder-[var(--ff-text-muted)] focus:outline-none"
                aria-label="Universal Command Center Search"
              />
              {query && (
                <button
                  type="button"
                  onClick={() => setQuery('')}
                  className="p-1 rounded-md text-[var(--ff-text-muted)] hover:text-[var(--ff-text-primary)]"
                >
                  <X className="w-4 h-4" />
                </button>
              )}
              <kbd className="hidden sm:inline-block px-1.5 py-0.5 text-[10px] font-mono font-bold rounded border border-[var(--ff-border-color)] bg-[var(--ff-surface-muted)] text-[var(--ff-text-muted)]">
                ESC to close
              </kbd>
            </div>

            {/* Category Filter Pills */}
            <div className="flex items-center gap-1 px-3 py-2 border-b border-[var(--ff-border-color)] bg-[var(--ff-surface-muted)]/50 overflow-x-auto scrollbar-none">
              {FILTER_TABS.map((tab) => {
                const isActive = activeFilter === tab.id;
                return (
                  <button
                    key={tab.id}
                    type="button"
                    onClick={() => setActiveFilter(tab.id)}
                    className={`relative px-2.5 py-1 text-xs font-semibold rounded-lg whitespace-nowrap transition-colors ${
                      isActive
                        ? 'text-[var(--ff-accent-contrast)]'
                        : 'text-[var(--ff-text-secondary)] hover:text-[var(--ff-text-primary)] hover:bg-[var(--ff-surface-hover)]'
                    }`}
                  >
                    {isActive && (
                      <motion.span
                        layoutId="cmd-filter-pill"
                        transition={profile.spring}
                        className="absolute inset-0 rounded-lg bg-[var(--ff-accent)] shadow-sm pointer-events-none"
                      />
                    )}
                    <span className="relative z-10">{tab.label}</span>
                  </button>
                );
              })}
            </div>

            {/* Search Results / Contextual Dashboard */}
            <div
              ref={resultsContainerRef}
              className="flex-1 overflow-y-auto p-2 divide-y divide-[var(--ff-border-color)]/50 max-h-[60vh]"
            >
              {/* Contextual Suggestions & Recent Searches when query is empty */}
              {!query.trim() && (
                <div className="p-2 space-y-4">
                  {/* Contextual Real-Time Suggestions */}
                  <div className="space-y-1.5">
                    <div className="flex items-center justify-between px-2">
                      <span className="text-[11px] font-bold text-[var(--ff-text-muted)] uppercase tracking-wider flex items-center gap-1.5">
                        <Zap className="w-3.5 h-3.5 text-amber-500" />
                        <span>Contextual Recommendations</span>
                      </span>
                      <span className="text-[10px] text-[var(--ff-text-muted)]">Based on live data</span>
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                      {contextualSuggestions.map((sugg) => (
                        <div
                          key={sugg.id}
                          className="p-3 rounded-xl border border-[var(--ff-border-color)] bg-[var(--ff-surface-card)] hover:border-[var(--ff-accent-border)] transition-all flex items-start gap-2.5"
                        >
                          <div className="mt-0.5 text-[var(--ff-accent-text)]">
                            {renderIcon(sugg.iconName)}
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center justify-between gap-1">
                              <span className="text-xs font-bold truncate text-[var(--ff-text-primary)]">
                                {sugg.title}
                              </span>
                              <ThemeBadge tone={sugg.badgeTone}>{sugg.badge}</ThemeBadge>
                            </div>
                            <p className="text-[11px] text-[var(--ff-text-muted)] line-clamp-1 mt-0.5">
                              {sugg.subtitle}
                            </p>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Recent Searches */}
                  {recentSearchesList.length > 0 && (
                    <div className="space-y-1.5 pt-2 border-t border-[var(--ff-border-color)]">
                      <div className="flex items-center justify-between px-2">
                        <span className="text-[11px] font-bold text-[var(--ff-text-muted)] uppercase tracking-wider flex items-center gap-1.5">
                          <History className="w-3.5 h-3.5" />
                          <span>Recent Searches</span>
                        </span>
                        <button
                          type="button"
                          onClick={() => {
                            clearRecentSearches();
                            setRecentSearchesList([]);
                          }}
                          className="text-[10px] text-[var(--ff-accent-text)] hover:underline"
                        >
                          Clear History
                        </button>
                      </div>
                      <div className="flex flex-wrap gap-1.5 px-1">
                        {recentSearchesList.map((q) => (
                          <span
                            key={q}
                            className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs bg-[var(--ff-surface-muted)] text-[var(--ff-text-secondary)] border border-[var(--ff-border-color)] hover:border-[var(--ff-accent)] cursor-pointer"
                            onClick={() => setQuery(q)}
                          >
                            <span>{q}</span>
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                removeRecentSearch(q);
                                setRecentSearchesList((prev) => prev.filter((item) => item !== q));
                              }}
                              className="text-[var(--ff-text-muted)] hover:text-[var(--ff-danger)] ml-0.5"
                            >
                              <X className="w-3 h-3" />
                            </button>
                          </span>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Top Actions Shortcut Strip */}
                  <div className="space-y-1.5 pt-2 border-t border-[var(--ff-border-color)]">
                    <span className="text-[11px] font-bold text-[var(--ff-text-muted)] uppercase tracking-wider block px-2">
                      Quick Command Directory
                    </span>
                  </div>
                </div>
              )}

              {/* Universal Search Results List */}
              {searchResults.length === 0 ? (
                <div className="py-12 text-center space-y-2">
                  <Search className="w-8 h-8 mx-auto text-[var(--ff-text-muted)] opacity-40" />
                  <div className="text-sm font-semibold text-[var(--ff-text-primary)]">
                    No matching results found
                  </div>
                  <p className="text-xs text-[var(--ff-text-muted)] max-w-xs mx-auto">
                    Try searching by title, category, price, date, or switch category filter to &ldquo;All&rdquo;.
                  </p>
                </div>
              ) : (
                searchResults.map((hit, index) => {
                  const isSelected = index === selectedIndex;
                  return (
                    <div
                      key={hit.id}
                      data-search-item
                      onClick={() => {
                        if (query.trim()) saveRecentSearch(query.trim());
                        recordRecentAction(hit.id);
                        hit.run();
                      }}
                      onMouseEnter={() => setSelectedIndex(index)}
                      className={`relative flex items-center justify-between gap-3 px-3 py-2.5 rounded-xl cursor-pointer transition-colors select-none border ${
                        isSelected
                          ? 'text-[var(--ff-text-primary)] border-transparent'
                          : 'hover:bg-[var(--ff-surface-hover)] text-[var(--ff-text-secondary)] border-transparent'
                      }`}
                    >
                      {isSelected && (
                        <motion.div
                          layoutId="cmd-active-row"
                          transition={profile.microSpring}
                          className="absolute inset-0 rounded-xl bg-[var(--ff-accent-soft)] border border-[var(--ff-accent-border)] pointer-events-none"
                        />
                      )}
                      <div className="relative z-10 flex items-center gap-3 min-w-0">
                        <span
                          className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0 border transition-colors"
                          style={{
                            background: isSelected ? 'var(--ff-accent)' : 'var(--ff-surface-muted)',
                            color: isSelected ? 'var(--ff-accent-contrast)' : 'var(--ff-accent-text)',
                            borderColor: 'var(--ff-border-color)',
                          }}
                        >
                          {renderIcon(hit.iconName)}
                        </span>
                        <div className="min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="text-xs font-bold truncate text-[var(--ff-text-primary)]">
                              <HighlightMatch text={hit.title} query={query} />
                            </span>
                            {hit.badge && (
                              <ThemeBadge tone={hit.badgeTone || 'neutral'}>
                                {hit.badge}
                              </ThemeBadge>
                            )}
                          </div>
                          <p className="text-[11px] text-[var(--ff-text-muted)] truncate">
                            <HighlightMatch text={hit.subtitle} query={query} />
                          </p>
                        </div>
                      </div>

                      <div className="relative z-10 flex items-center gap-2 shrink-0">
                        {hit.shortcut && (
                          <kbd className="hidden sm:inline-block px-1.5 py-0.5 text-[10px] font-mono font-bold rounded border border-[var(--ff-border-color)] bg-[var(--ff-surface-card)] text-[var(--ff-text-muted)]">
                            {hit.shortcut}
                          </kbd>
                        )}
                        <ArrowRight className={`w-3.5 h-3.5 transition-transform ${isSelected ? 'translate-x-0.5 text-[var(--ff-accent-text)]' : 'opacity-0'}`} />
                      </div>
                    </div>
                  );
                })
              )}
            </div>

            {/* Bottom Keyboard Guide Footer */}
            <div className="flex flex-wrap items-center justify-between gap-2 px-4 py-2.5 border-t border-[var(--ff-border-color)] bg-[var(--ff-surface-card)] text-[11px] text-[var(--ff-text-muted)]">
              <div className="flex items-center gap-3 flex-wrap">
                <span className="flex items-center gap-1">
                  <kbd className="px-1 rounded bg-[var(--ff-surface-muted)] border border-[var(--ff-border-color)]">↑</kbd>
                  <kbd className="px-1 rounded bg-[var(--ff-surface-muted)] border border-[var(--ff-border-color)]">↓</kbd>
                  <span>Navigate</span>
                </span>
                <span className="flex items-center gap-1">
                  <kbd className="px-1.5 rounded bg-[var(--ff-surface-muted)] border border-[var(--ff-border-color)]">↵</kbd>
                  <span>Select</span>
                </span>
                <span className="flex items-center gap-1">
                  <kbd className="px-1.5 rounded bg-[var(--ff-surface-muted)] border border-[var(--ff-border-color)]">Tab</kbd>
                  <span>Filter</span>
                </span>
              </div>
              <span className="font-medium text-[var(--ff-text-secondary)]">
                {searchResults.length} {searchResults.length === 1 ? 'result' : 'results'}
              </span>
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
};
