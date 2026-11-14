import React from 'react';
import {
  Bill,
  BudgetEnvelope,
  ExpenseTransaction,
  Habit,
  IncomeTransaction,
  SavingsGoal,
  SubscriptionPlan,
  Task,
  TimeBlock,
  UserSettings,
} from '../types/index.ts';
import { formatCurrency } from './currency.ts';
import { SETTINGS_CATEGORIES } from '../components/settings/SettingsView.tsx';
import { COMPLETE_THEME_COLLECTION } from '../theme/presetThemes.ts';
import { DESIGN_STYLES } from '../theme/stylesRegistry.ts';
import { NavTab } from '../context/AppContext.tsx';

export type SearchFilterType =
  | 'all'
  | 'actions'
  | 'navigation'
  | 'tasks'
  | 'finance'
  | 'habits'
  | 'budgets'
  | 'settings';

export interface UniversalSearchHit {
  id: string;
  filterGroup: SearchFilterType;
  groupLabel: string;
  title: string;
  subtitle: string;
  badge?: string;
  badgeTone?: 'accent' | 'success' | 'warning' | 'danger' | 'neutral';
  category?: string;
  date?: string;
  amountFormatted?: string;
  iconName: string;
  shortcut?: string;
  score: number;
  run: () => void;
}

export interface UniversalSearchDataSources {
  tasks: Task[];
  bills: Bill[];
  incomes: IncomeTransaction[];
  expenses: ExpenseTransaction[];
  habits: Habit[];
  envelopes: BudgetEnvelope[];
  savingsGoals: SavingsGoal[];
  timeBlocks?: TimeBlock[];
  subscriptions?: SubscriptionPlan[];
  settings?: UserSettings | null;
  onNavigate: (tab: NavTab) => void;
  onOpenQuickAction: (initialType?: 'task' | 'expense' | 'income' | 'bill' | 'habit' | 'envelope' | 'goal') => void;
  onStartTimer?: () => void;
  onPauseTimer?: () => void;
  isTimerRunning?: boolean;
  onToggleTheme?: () => void;
  isDarkMode?: boolean;
  onSyncSheets?: () => Promise<void> | void;
  onExportBackup?: () => void;
  onOpenTrash?: () => void;
  onApplyThemeId?: (styleId: string) => void;
}

export type UniversalSearchSources = UniversalSearchDataSources;

const RECENT_SEARCHES_KEY = 'focusflow_recent_searches';
const RECENT_ACTIONS_KEY = 'focusflow_recent_actions';

function getStorage(custom?: Storage): Storage | null {
  if (custom) return custom;
  try {
    if (typeof localStorage !== 'undefined') return localStorage;
  } catch {}
  return null;
}

export function getRecentSearches(storage?: Storage): string[] {
  try {
    const s = getStorage(storage);
    const raw = s?.getItem(RECENT_SEARCHES_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

export function saveRecentSearch(query: string, storage?: Storage): void {
  const trimmed = query.trim();
  if (!trimmed || trimmed.length < 2) return;
  try {
    const s = getStorage(storage);
    if (!s) return;
    const current = getRecentSearches(s).filter((q) => q.toLowerCase() !== trimmed.toLowerCase());
    const updated = [trimmed, ...current].slice(0, 8);
    s.setItem(RECENT_SEARCHES_KEY, JSON.stringify(updated));
  } catch {}
}

export function removeRecentSearch(query: string, storage?: Storage): void {
  try {
    const s = getStorage(storage);
    if (!s) return;
    const updated = getRecentSearches(s).filter((q) => q !== query);
    s.setItem(RECENT_SEARCHES_KEY, JSON.stringify(updated));
  } catch {}
}

export function clearRecentSearches(storage?: Storage): void {
  try {
    const s = getStorage(storage);
    s?.removeItem(RECENT_SEARCHES_KEY);
  } catch {}
}

export function getRecentActions(storage?: Storage): string[] {
  try {
    const s = getStorage(storage);
    const raw = s?.getItem(RECENT_ACTIONS_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

export function recordRecentAction(actionId: string, storage?: Storage): void {
  try {
    const s = getStorage(storage);
    if (!s) return;
    const current = getRecentActions(s).filter((id) => id !== actionId);
    const updated = [actionId, ...current].slice(0, 8);
    s.setItem(RECENT_ACTIONS_KEY, JSON.stringify(updated));
  } catch {}
}

export function calculateRelevancyScore(query: string, text: string, secondaryText?: string): number {
  const q = query.toLowerCase().trim();
  const t = text.toLowerCase();
  const s = secondaryText?.toLowerCase() || '';

  if (t === q) return 100;
  if (t.startsWith(q)) return 80;
  if (t.includes(` ${q}`)) return 60;
  if (t.includes(q)) return 40;
  if (s.startsWith(q)) return 30;
  if (s.includes(q)) return 20;

  // Keyword / token matching
  const tokens = q.split(/\s+/).filter(Boolean);
  let matches = 0;
  for (const token of tokens) {
    if (t.includes(token) || s.includes(token)) matches++;
  }
  return matches > 0 ? (matches / tokens.length) * 15 : 0;
}

export function searchUniversalWorkspace(
  query: string,
  filter: SearchFilterType,
  sources: UniversalSearchDataSources
): UniversalSearchHit[] {
  const q = query.trim().toLowerCase();
  const hits: UniversalSearchHit[] = [];

  const addHit = (hit: UniversalSearchHit) => {
    if (filter !== 'all' && hit.filterGroup !== filter) return;
    if (q) {
      const score = calculateRelevancyScore(q, hit.title, `${hit.subtitle} ${hit.category || ''}`);
      if (score <= 0) return;
      hit.score = score;
    } else {
      hit.score = 10;
    }
    hits.push(hit);
  };

  // 1. Actions
  addHit({
    id: 'act_new_task',
    filterGroup: 'actions',
    groupLabel: 'Quick Actions',
    title: 'Add New Task',
    subtitle: 'Create a prioritized task with due date & subtasks',
    badge: 'Quick Add',
    badgeTone: 'accent',
    iconName: 'CheckSquare',
    shortcut: 'N',
    score: 0,
    run: () => sources.onOpenQuickAction('task'),
  });

  addHit({
    id: 'act_add_expense',
    filterGroup: 'actions',
    groupLabel: 'Quick Actions',
    title: 'Log New Expense',
    subtitle: 'Record an expense with category & payment method',
    badge: 'Finance',
    badgeTone: 'danger',
    iconName: 'Receipt',
    shortcut: 'E',
    score: 0,
    run: () => sources.onOpenQuickAction('expense'),
  });

  addHit({
    id: 'act_add_income',
    filterGroup: 'actions',
    groupLabel: 'Quick Actions',
    title: 'Record New Income',
    subtitle: 'Deposit cash, salary, or client payment',
    badge: 'Finance',
    badgeTone: 'success',
    iconName: 'Wallet',
    shortcut: 'I',
    score: 0,
    run: () => sources.onOpenQuickAction('income'),
  });

  addHit({
    id: 'act_add_habit',
    filterGroup: 'actions',
    groupLabel: 'Quick Actions',
    title: 'Create New Habit',
    subtitle: 'Track daily/weekly rituals & build consistency streaks',
    badge: 'Habits',
    badgeTone: 'accent',
    iconName: 'Flame',
    score: 0,
    run: () => sources.onOpenQuickAction('habit'),
  });

  addHit({
    id: 'act_start_focus',
    filterGroup: 'actions',
    groupLabel: 'Quick Actions',
    title: sources.isTimerRunning ? 'Pause Focus Timer' : 'Start Focus Session',
    subtitle: sources.isTimerRunning ? 'Pause current pomodoro countdown' : 'Begin 25-minute deep focus sprint',
    badge: 'Timer',
    badgeTone: 'warning',
    iconName: 'Timer',
    shortcut: 'F',
    score: 0,
    run: () => (sources.isTimerRunning ? sources.onPauseTimer?.() : sources.onStartTimer?.()),
  });

  addHit({
    id: 'act_create_budget',
    filterGroup: 'actions',
    groupLabel: 'Quick Actions',
    title: 'Create Budget Envelope',
    subtitle: 'Allocate monthly spending limits by category',
    badge: 'Budget',
    badgeTone: 'accent',
    iconName: 'Layers',
    score: 0,
    run: () => sources.onOpenQuickAction('envelope'),
  });

  addHit({
    id: 'act_create_goal',
    filterGroup: 'actions',
    groupLabel: 'Quick Actions',
    title: 'Create Savings Goal',
    subtitle: 'Set financial targets with deadlines & progress milestones',
    badge: 'Savings',
    badgeTone: 'success',
    iconName: 'Target',
    score: 0,
    run: () => sources.onOpenQuickAction('goal'),
  });

  addHit({
    id: 'act_sync_sheets',
    filterGroup: 'actions',
    groupLabel: 'Quick Actions',
    title: 'Synchronize Google Sheets Master',
    subtitle: 'Flush pending records to 23 executive Google Sheets tabs',
    badge: 'Sync',
    badgeTone: 'neutral',
    iconName: 'RefreshCw',
    score: 0,
    run: () => void sources.onSyncSheets?.(),
  });

  addHit({
    id: 'act_export_backup',
    filterGroup: 'actions',
    groupLabel: 'Quick Actions',
    title: 'Export Workspace JSON Backup',
    subtitle: 'Download complete offline snapshot of all records',
    badge: 'Data',
    badgeTone: 'neutral',
    iconName: 'Download',
    score: 0,
    run: () => sources.onExportBackup?.(),
  });

  addHit({
    id: 'act_toggle_theme',
    filterGroup: 'actions',
    groupLabel: 'Quick Actions',
    title: `Switch to ${sources.isDarkMode ? 'Light' : 'Dark'} Mode`,
    subtitle: 'Toggle light and dark appearance polarity immediately',
    badge: 'Theme',
    badgeTone: 'neutral',
    iconName: sources.isDarkMode ? 'Sun' : 'Moon',
    score: 0,
    run: () => sources.onToggleTheme?.(),
  });

  addHit({
    id: 'act_open_trash',
    filterGroup: 'actions',
    groupLabel: 'Quick Actions',
    title: 'Open Trash & Restore Bin',
    subtitle: 'Recover soft-deleted tasks, bills, and transactions',
    badge: 'Recovery',
    badgeTone: 'danger',
    iconName: 'Trash2',
    score: 0,
    run: () => sources.onOpenTrash?.(),
  });

  // 2. Navigation
  const navTabs: Array<{ tab: NavTab; label: string; desc: string; shortcut?: string; icon: string }> = [
    { tab: 'dashboard', label: 'Executive Dashboard', desc: 'Personalized daily productivity & wealth overview', shortcut: 'Alt+1', icon: 'LayoutDashboard' },
    { tab: 'calendar', label: 'Productivity Calendar', desc: 'Schedule activities & financial transaction calendar', shortcut: 'Alt+C', icon: 'Calendar' },
    { tab: 'focus', label: 'Focus & Pomodoro Timer', desc: 'Deep work sessions, break intervals & focus analytics', shortcut: 'Alt+2', icon: 'Timer' },
    { tab: 'timeblocks', label: 'Daily Time-Block Planner', desc: 'Hourly schedule timeline & task distribution', shortcut: 'Alt+B', icon: 'Clock' },
    { tab: 'tasks', label: 'Task Management Workspace', desc: 'Priority matrix, checklists & drag-and-drop tasks', shortcut: 'Alt+3', icon: 'CheckSquare' },
    { tab: 'habits', label: 'Habit Tracker & Streaks', desc: 'Daily completion calendar & consistency scores', shortcut: 'Alt+H', icon: 'Flame' },
    { tab: 'finance', label: 'Financial Command Center', desc: 'Daily expense tracker, cashflow & category breakdown', shortcut: 'Alt+4', icon: 'Wallet' },
    { tab: 'transactions', label: 'Transaction Ledger', desc: 'Full searchable transaction history & CSV exports', shortcut: 'Alt+5', icon: 'ReceiptText' },
    { tab: 'bills', label: 'Bills & Payments Tracker', desc: 'Due dates, recurring schedules & payment status', shortcut: 'Alt+6', icon: 'CreditCard' },
    { tab: 'envelopes', label: 'Envelope Budgeting System', desc: 'Category-wise spending caps & real-time utilization', shortcut: 'Alt+E', icon: 'Layers' },
    { tab: 'subscriptions', label: 'Recurring Subscriptions', desc: 'Monthly renewals, subscription audits & leak alerts', shortcut: 'Alt+S', icon: 'Repeat' },
    { tab: 'analytics', label: 'Analytics & Visual Intelligence', desc: '12-month trend charts, savings rates, financial analytics & KPI reports', shortcut: 'Alt+7', icon: 'BarChart3' },
    { tab: 'recovery', label: 'Data Recovery & Integrity Center', desc: 'Snapshot backups, restore bin & sync diagnosis', shortcut: 'Alt+R', icon: 'ShieldAlert' },
    { tab: 'settings', label: 'Settings & Theme Studio 2.0', desc: 'Custom 3D themes, physics, palettes & preferences', shortcut: 'Alt+8', icon: 'Settings' },
  ];

  for (const n of navTabs) {
    addHit({
      id: `nav_${n.tab}`,
      filterGroup: 'navigation',
      groupLabel: 'Workspace Pages',
      title: n.label,
      subtitle: n.desc,
      badge: 'Page',
      badgeTone: 'neutral',
      iconName: n.icon,
      shortcut: n.shortcut,
      score: 0,
      run: () => sources.onNavigate(n.tab),
    });
  }

  // 3. Tasks
  for (const t of sources.tasks) {
    if (t.deletedAt) continue;
    addHit({
      id: `task_${t.id}`,
      filterGroup: 'tasks',
      groupLabel: 'Tasks',
      title: t.title,
      subtitle: `${t.status.replace('_', ' ')} • ${t.priority} priority${t.dueDate ? ` • Due ${t.dueDate}` : ''}`,
      badge: t.status === 'completed' ? 'Completed' : t.priority.toUpperCase(),
      badgeTone: t.status === 'completed' ? 'success' : t.priority === 'high' ? 'danger' : 'neutral',
      category: t.category || 'General',
      date: t.dueDate || undefined,
      iconName: 'CheckSquare',
      score: 0,
      run: () => sources.onNavigate('tasks'),
    });
  }

  // 4. Habits
  for (const h of sources.habits) {
    if (h.archived || h.deletedAt) continue;
    addHit({
      id: `habit_${h.id}`,
      filterGroup: 'habits',
      groupLabel: 'Habits',
      title: h.title,
      subtitle: `${h.frequency} habit • Best streak: ${h.bestStreakDays || 0}d • Completed: ${h.completedDates?.length || 0} times`,
      badge: `${h.bestStreakDays || 0}d Streak`,
      badgeTone: 'accent',
      category: h.category,
      iconName: 'Flame',
      score: 0,
      run: () => sources.onNavigate('habits'),
    });
  }

  // 5. Finance Transactions (Expenses & Incomes)
  for (const exp of sources.expenses.slice(0, 50)) {
    if (exp.deletedAt) continue;
    addHit({
      id: `exp_${exp.id}`,
      filterGroup: 'finance',
      groupLabel: 'Expenses',
      title: `-${formatCurrency(exp.amountPaise)} • ${exp.description}`,
      subtitle: `Expense • ${exp.categoryName || exp.type} • ${exp.date}`,
      badge: 'Expense',
      badgeTone: 'danger',
      amountFormatted: `-${formatCurrency(exp.amountPaise)}`,
      category: exp.categoryName || 'General',
      date: exp.date,
      iconName: 'Receipt',
      score: 0,
      run: () => sources.onNavigate('transactions'),
    });
  }

  for (const inc of sources.incomes.slice(0, 50)) {
    if (inc.deletedAt) continue;
    addHit({
      id: `inc_${inc.id}`,
      filterGroup: 'finance',
      groupLabel: 'Incomes',
      title: `+${formatCurrency(inc.amountPaise)} • ${inc.source}`,
      subtitle: `Income • ${inc.category} • ${inc.date}`,
      badge: 'Income',
      badgeTone: 'success',
      amountFormatted: `+${formatCurrency(inc.amountPaise)}`,
      category: inc.category,
      date: inc.date,
      iconName: 'Wallet',
      score: 0,
      run: () => sources.onNavigate('transactions'),
    });
  }

  // 6. Bills
  for (const b of sources.bills) {
    if (b.deletedAt) continue;
    addHit({
      id: `bill_${b.id}`,
      filterGroup: 'finance',
      groupLabel: 'Bills',
      title: `${b.name} (${formatCurrency(b.amountPaise)})`,
      subtitle: `Bill • ${b.status} • Due ${b.dueDate}`,
      badge: b.status,
      badgeTone: b.status === 'PAID' ? 'success' : b.status === 'OVERDUE' ? 'danger' : 'warning',
      category: b.categoryId || 'Bills',
      date: b.dueDate,
      iconName: 'CreditCard',
      score: 0,
      run: () => sources.onNavigate('bills'),
    });
  }

  // 7. Budgets (Envelopes) & Savings Goals
  for (const env of sources.envelopes) {
    if (env.deletedAt) continue;
    const remaining = env.allocatedPaise - (env.spentPaise || 0);
    addHit({
      id: `env_${env.id}`,
      filterGroup: 'budgets',
      groupLabel: 'Budget Envelopes',
      title: `${env.name} Budget (${formatCurrency(env.allocatedPaise)})`,
      subtitle: `Allocated ${formatCurrency(env.allocatedPaise)} • ${formatCurrency(remaining)} remaining`,
      badge: remaining < 0 ? 'Over Budget' : 'On Track',
      badgeTone: remaining < 0 ? 'danger' : 'success',
      category: env.name,
      iconName: 'Layers',
      score: 0,
      run: () => sources.onNavigate('envelopes'),
    });
  }

  for (const g of sources.savingsGoals) {
    const progress = g.targetPaise > 0 ? Math.min(100, Math.round((g.savedPaise / g.targetPaise) * 100)) : 0;
    addHit({
      id: `goal_${g.id}`,
      filterGroup: 'budgets',
      groupLabel: 'Savings Goals',
      title: `${g.title} (${progress}% saved)`,
      subtitle: `${formatCurrency(g.savedPaise)} of ${formatCurrency(g.targetPaise)}${g.targetDate ? ` • Target: ${g.targetDate}` : ''}`,
      badge: `${progress}%`,
      badgeTone: progress >= 100 ? 'success' : 'accent',
      category: 'Savings',
      iconName: 'Target',
      score: 0,
      run: () => sources.onNavigate('finance'),
    });
  }

  // 8. Settings Categories
  for (const cat of SETTINGS_CATEGORIES) {
    addHit({
      id: `setting_${cat.id}`,
      filterGroup: 'settings',
      groupLabel: 'Settings & Studio',
      title: `${cat.label} Settings`,
      subtitle: cat.description,
      badge: 'Setting',
      badgeTone: 'neutral',
      iconName: 'Settings',
      score: 0,
      run: () => sources.onNavigate('settings'),
    });
  }

  // 9. Signature Themes
  for (const th of COMPLETE_THEME_COLLECTION) {
    addHit({
      id: `theme_${th.id}`,
      filterGroup: 'settings',
      groupLabel: 'Signature Themes',
      title: `Apply Theme: ${th.name}`,
      subtitle: th.description,
      badge: th.category,
      badgeTone: 'accent',
      iconName: 'Palette',
      score: 0,
      run: () => {
        sources.onApplyThemeId?.(th.config.styleId);
      },
    });
  }

  // Sort by relevancy score descending
  return hits.sort((a, b) => b.score - a.score);
}

export function getContextualCommandSuggestions(sources: {
  tasks: Task[];
  expenses: ExpenseTransaction[];
  habits: Habit[];
  isTimerRunning: boolean;
}): Array<{
  id: string;
  title: string;
  subtitle: string;
  iconName: string;
  badge: string;
  badgeTone: 'accent' | 'success' | 'warning' | 'danger';
  action: () => void;
}> {
  const today = new Date().toISOString().slice(0, 10);
  const suggestions = [];

  // 1. Today's expenses
  const todayExpenses = sources.expenses.filter((e) => !e.deletedAt && e.date === today);
  const todayTotal = todayExpenses.reduce((sum, e) => sum + e.amountPaise, 0);
  suggestions.push({
    id: 'sugg_today_expenses',
    title: "Review Today's Expenses",
    subtitle: `${todayExpenses.length} transactions totaling ${formatCurrency(todayTotal)} logged today`,
    iconName: 'Receipt',
    badge: formatCurrency(todayTotal),
    badgeTone: todayTotal > 0 ? ('warning' as const) : ('success' as const),
    action: () => {},
  });

  // 2. Incomplete tasks
  const pendingTasks = sources.tasks.filter((t) => !t.deletedAt && t.status !== 'completed');
  const overdueTasks = pendingTasks.filter((t) => t.dueDate && t.dueDate < today);
  suggestions.push({
    id: 'sugg_pending_tasks',
    title: 'Open Incomplete Tasks',
    subtitle: `${pendingTasks.length} pending tasks${overdueTasks.length > 0 ? ` (${overdueTasks.length} overdue)` : ''}`,
    iconName: 'CheckSquare',
    badge: `${pendingTasks.length} Pending`,
    badgeTone: overdueTasks.length > 0 ? ('danger' as const) : ('accent' as const),
    action: () => {},
  });

  // 3. Active habits
  const activeHabits = sources.habits.filter((h) => !h.archived);
  suggestions.push({
    id: 'sugg_habits',
    title: "Check Today's Habit Streaks",
    subtitle: `${activeHabits.length} habits active across your routine`,
    iconName: 'Flame',
    badge: `${activeHabits.length} Active`,
    badgeTone: 'accent' as const,
    action: () => {},
  });

  // 4. Pomodoro focus sprint
  suggestions.push({
    id: 'sugg_focus',
    title: sources.isTimerRunning ? 'Timer is running — Stay in flow' : 'Start 25-Min Focus Sprint',
    subtitle: sources.isTimerRunning ? 'Deep work block in progress' : 'Begin a distraction-free Pomodoro session',
    iconName: 'Timer',
    badge: sources.isTimerRunning ? 'Active' : 'Ready',
    badgeTone: sources.isTimerRunning ? ('success' as const) : ('warning' as const),
    action: () => {},
  });

  return suggestions;
}

export const HighlightMatch: React.FC<{ text: string; query: string }> = ({ text, query }) => {
  const q = query.trim();
  if (!q) return <span>{text}</span>;

  // Escape special regex characters safely
  const escaped = q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const regex = new RegExp(`(${escaped})`, 'gi');
  const parts = text.split(regex);

  return (
    <span>
      {parts.map((part, i) =>
        part.toLowerCase() === q.toLowerCase() ? (
          <span
            key={i}
            className="font-bold underline decoration-2 rounded px-0.5"
            style={{
              color: 'var(--ff-accent-text)',
              backgroundColor: 'var(--ff-accent-soft)',
              textDecorationColor: 'var(--ff-accent)',
            }}
          >
            {part}
          </span>
        ) : (
          part
        )
      )}
    </span>
  );
};
