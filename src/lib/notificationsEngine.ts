import type {
  Bill,
  DashboardData,
  FinanceSummaryData,
  NotificationPreferences,
  Task,
  UserSettings,
} from '../types/index.ts';
import { formatCurrency } from './currency.ts';

export type NotificationSeverity = 'info' | 'warning' | 'danger' | 'success';

export interface AppNotificationItem {
  id: string;
  severity: NotificationSeverity;
  category: 'task' | 'bill' | 'focus' | 'budget' | 'sync';
  title: string;
  message: string;
  targetTab: 'dashboard' | 'focus' | 'tasks' | 'finance' | 'bills' | 'analytics' | 'settings';
  actionLabel: string;
}

const DEFAULT_PREFS: NotificationPreferences = {
  enabled: true,
  taskDeadlines: true,
  upcomingBills: true,
  billLeadDays: 3,
  overdueBills: true,
  focusCompletion: true,
  dailyFocusGoal: true,
  budgetWarnings: true,
  budgetWarningPercent: 80,
  syncFailures: true,
};

export function evaluateDeterministicNotifications(input: {
  settings: UserSettings | null;
  tasks: Task[];
  bills: Bill[];
  dashboard: DashboardData | null;
  financeSummary: FinanceSummaryData | null;
  syncLastError?: string | null;
}): AppNotificationItem[] {
  const prefs: NotificationPreferences = {
    ...DEFAULT_PREFS,
    ...(input.settings?.notificationPrefs || {}),
  };
  if (!prefs.enabled) return [];

  const items: AppNotificationItem[] = [];
  const today = new Date();
  const todayStr = today.toISOString().slice(0, 10);

  if (prefs.overdueBills) {
    const overdue = input.bills.filter((b) => !b.deletedAt && b.status === 'OVERDUE');
    if (overdue.length > 0) {
      const total = overdue.reduce((acc, b) => acc + b.amountPaise, 0);
      items.push({
        id: `bills_overdue_${overdue.length}`,
        severity: 'danger',
        category: 'bill',
        title: `${overdue.length} Overdue Bill${overdue.length > 1 ? 's' : ''}`,
        message: `${formatCurrency(total)} past due (${overdue[0].name}${overdue.length > 1 ? ` +${overdue.length - 1} more` : ''}).`,
        targetTab: 'bills',
        actionLabel: 'Pay Bills',
      });
    }
  }

  if (prefs.upcomingBills) {
    const horizon = new Date(today);
    horizon.setDate(horizon.getDate() + Math.max(1, prefs.billLeadDays || 3));
    const horizonStr = horizon.toISOString().slice(0, 10);

    const upcoming = input.bills.filter(
      (b) =>
        !b.deletedAt &&
        b.status === 'UNPAID' &&
        b.dueDate >= todayStr &&
        b.dueDate <= horizonStr
    );
    if (upcoming.length > 0) {
      const total = upcoming.reduce((acc, b) => acc + b.amountPaise, 0);
      items.push({
        id: `bills_upcoming_${upcoming.length}`,
        severity: 'warning',
        category: 'bill',
        title: `${upcoming.length} Bill${upcoming.length > 1 ? 's' : ''} Due Soon`,
        message: `${formatCurrency(total)} due within ${prefs.billLeadDays} days.`,
        targetTab: 'bills',
        actionLabel: 'Review Schedule',
      });
    }
  }

  if (prefs.taskDeadlines) {
    const dueOrOverdue = input.tasks.filter(
      (t) =>
        !t.deletedAt &&
        t.status !== 'completed' &&
        Boolean(t.dueDate) &&
        (t.dueDate as string) <= todayStr
    );
    if (dueOrOverdue.length > 0) {
      const overdueCount = dueOrOverdue.filter((t) => (t.dueDate as string) < todayStr).length;
      items.push({
        id: `tasks_due_${dueOrOverdue.length}`,
        severity: overdueCount > 0 ? 'warning' : 'info',
        category: 'task',
        title:
          overdueCount > 0
            ? `${dueOrOverdue.length} Task${dueOrOverdue.length > 1 ? 's' : ''} Due / Overdue`
            : `${dueOrOverdue.length} Task${dueOrOverdue.length > 1 ? 's' : ''} Due Today`,
        message: `${dueOrOverdue[0].title}${dueOrOverdue.length > 1 ? ` and ${dueOrOverdue.length - 1} more` : ''}.`,
        targetTab: 'tasks',
        actionLabel: 'Open Tasks',
      });
    }
  }

  if (prefs.budgetWarnings && input.settings?.monthlyBudgetPaise && input.settings.monthlyBudgetPaise > 0 && input.dashboard) {
    const cap = input.settings.monthlyBudgetPaise;
    const spent = input.dashboard.monthlyExpensesPaise;
    const pct = Math.round((spent / cap) * 100);
    const threshold = Math.max(50, Math.min(100, prefs.budgetWarningPercent || 80));
    if (pct >= 100) {
      items.push({
        id: `budget_exceeded_${pct}`,
        severity: 'danger',
        category: 'budget',
        title: 'Monthly Budget Exceeded',
        message: `Spent ${formatCurrency(spent)} of ${formatCurrency(cap)} (${pct}%).`,
        targetTab: 'finance',
        actionLabel: 'Inspect Budgets',
      });
    } else if (pct >= threshold) {
      items.push({
        id: `budget_warn_${pct}`,
        severity: 'warning',
        category: 'budget',
        title: `Budget at ${pct}% Capacity`,
        message: `${formatCurrency(cap - spent)} remaining in your monthly spending limit.`,
        targetTab: 'finance',
        actionLabel: 'View Budgets',
      });
    }
  }

  if (prefs.budgetWarnings && input.settings?.categoryBudgets && input.financeSummary) {
    for (const cat of input.financeSummary.categoryBreakdown) {
      const cap = cat.categoryId ? input.settings.categoryBudgets[cat.categoryId] : undefined;
      if (cap && cap > 0 && cat.amountPaise >= (cap * (prefs.budgetWarningPercent || 80)) / 100) {
        const pct = Math.round((cat.amountPaise / cap) * 100);
        items.push({
          id: `cat_budget_${cat.categoryId || cat.name}`,
          severity: pct >= 100 ? 'danger' : 'warning',
          category: 'budget',
          title: `${cat.name}: ${pct}% of Budget`,
          message: `${formatCurrency(cat.amountPaise)} spent vs ${formatCurrency(cap)} target.`,
          targetTab: 'finance',
          actionLabel: 'Manage Budgets',
        });
      }
    }
  }

  if (prefs.dailyFocusGoal && input.dashboard && input.settings) {
    const goal = Math.max(15, input.settings.dailyFocusGoalMinutes || 100);
    if (input.dashboard.todayFocusMinutes >= goal) {
      items.push({
        id: `focus_goal_hit_${todayStr}`,
        severity: 'success',
        category: 'focus',
        title: 'Daily Focus Goal Reached',
        message: `Completed ${input.dashboard.todayFocusMinutes} min against your ${goal} min target.`,
        targetTab: 'focus',
        actionLabel: 'View Stats',
      });
    }
  }

  if (prefs.syncFailures && input.syncLastError) {
    items.push({
      id: 'sheets_sync_error',
      severity: 'warning',
      category: 'sync',
      title: 'Google Sheets Sync Deferred',
      message: input.syncLastError,
      targetTab: 'settings',
      actionLabel: 'Sync Settings',
    });
  }

  return items;
}
