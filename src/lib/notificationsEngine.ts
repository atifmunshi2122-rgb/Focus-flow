import type {
  Bill,
  DashboardData,
  ExpenseTransaction,
  FinanceSummaryData,
  Habit,
  NotificationPreferences,
  SavingsGoal,
  Task,
  UserSettings,
} from '../types/index.ts';
import { formatCurrency } from './currency.ts';
import { isHabitScheduledOnDate } from './productivityIntelligence.ts';

export type NotificationSeverity = 'info' | 'warning' | 'danger' | 'success';

export interface AppNotificationItem {
  id: string;
  severity: NotificationSeverity;
  category: 'task' | 'bill' | 'focus' | 'budget' | 'sync' | 'habit';
  title: string;
  message: string;
  targetTab: 'dashboard' | 'focus' | 'tasks' | 'finance' | 'bills' | 'analytics' | 'settings' | 'habits';
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
  savingsGoals?: SavingsGoal[];
  expenses?: ExpenseTransaction[];
  syncLastError?: string | null;
  habits?: Habit[];
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

  // Daily Spending Limit Alert
  if (
    prefs.budgetWarnings &&
    input.settings?.dailySpendingLimitPaise &&
    input.settings.dailySpendingLimitPaise > 0 &&
    input.dashboard?.todayExpensesPaise !== undefined
  ) {
    const dailyLimit = input.settings.dailySpendingLimitPaise;
    const spentToday = input.dashboard.todayExpensesPaise;
    if (spentToday >= dailyLimit) {
      items.push({
        id: `daily_limit_reached_${todayStr}`,
        severity: 'danger',
        category: 'budget',
        title: 'Daily Spending Limit Reached',
        message: `Spent ${formatCurrency(spentToday)} today against your ${formatCurrency(dailyLimit)} daily ceiling.`,
        targetTab: 'finance',
        actionLabel: 'Inspect Spending',
      });
    }
  }

  // Weekly Spending Limit Alert
  if (
    prefs.budgetWarnings &&
    input.settings?.weeklySpendingLimitPaise &&
    input.settings.weeklySpendingLimitPaise > 0 &&
    input.expenses
  ) {
    const weeklyLimit = input.settings.weeklySpendingLimitPaise;
    const sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 6);
    const sevenDaysAgoStr = sevenDaysAgo.toISOString().slice(0, 10);
    const spentWeek = input.expenses
      .filter((e) => !e.deletedAt && e.date >= sevenDaysAgoStr && e.date <= todayStr)
      .reduce((sum, e) => sum + e.amountPaise, 0);
    const pct = Math.round((spentWeek / weeklyLimit) * 100);
    const threshold = Math.max(50, Math.min(100, prefs.budgetWarningPercent || 80));
    if (pct >= 100) {
      items.push({
        id: `weekly_limit_exceeded_${todayStr.slice(0, 7)}`,
        severity: 'danger',
        category: 'budget',
        title: 'Weekly Budget Exceeded',
        message: `Spent ${formatCurrency(spentWeek)} this week against your ${formatCurrency(weeklyLimit)} budget (${pct}%).`,
        targetTab: 'finance',
        actionLabel: 'View Budgets',
      });
    } else if (pct >= threshold) {
      items.push({
        id: `weekly_limit_warning_${todayStr.slice(0, 7)}`,
        severity: 'warning',
        category: 'budget',
        title: `Weekly Budget at ${pct}%`,
        message: `${formatCurrency(weeklyLimit - spentWeek)} remaining in this week's spending allowance.`,
        targetTab: 'finance',
        actionLabel: 'View Budgets',
      });
    }
  }

  // Savings Goal Milestones
  if (input.savingsGoals) {
    for (const goal of input.savingsGoals) {
      if (goal.targetPaise > 0) {
        const pct = Math.round((goal.savedPaise / goal.targetPaise) * 100);
        if (pct >= 100) {
          items.push({
            id: `goal_achieved_${goal.id}`,
            severity: 'success',
            category: 'budget',
            title: `Goal Achieved: ${goal.title}!`,
            message: `Congratulations! You've reached 100% of your ${formatCurrency(goal.targetPaise)} target.`,
            targetTab: 'finance',
            actionLabel: 'View Goals',
          });
        }
      }
    }
  }

  // Unusual Single Expense Detection
  if (input.expenses && input.expenses.length > 0) {
    const todayExpenses = input.expenses.filter((e) => !e.deletedAt && e.date === todayStr);
    for (const exp of todayExpenses) {
      if (exp.amountPaise >= 1000000) {
        items.push({
          id: `unusual_expense_${exp.id}`,
          severity: 'info',
          category: 'budget',
          title: 'Large Expense Recorded',
          message: `${exp.description}: ${formatCurrency(exp.amountPaise)} logged today.`,
          targetTab: 'finance',
          actionLabel: 'Inspect Ledger',
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

  // Pending Habits Reminder
  if (input.habits && input.habits.length > 0) {
    const pendingHabits = input.habits.filter(
      (h) =>
        !h.deletedAt &&
        !h.archived &&
        isHabitScheduledOnDate(h, todayStr) &&
        !(h.completedDates || []).includes(todayStr)
    );
    if (pendingHabits.length > 0) {
      items.push({
        id: `habits_pending_${todayStr}`,
        severity: 'info',
        category: 'habit',
        title: `${pendingHabits.length} Habit${pendingHabits.length > 1 ? 's' : ''} Remaining Today`,
        message: `${pendingHabits[0].title}${pendingHabits.length > 1 ? ` and ${pendingHabits.length - 1} more` : ''} scheduled for today.`,
        targetTab: 'habits',
        actionLabel: 'Complete Habits',
      });
    }
  }

  // Daily Planning Reminder: If active tasks exist but none are scheduled for today
  const activeUncompletedTasks = input.tasks.filter((t) => !t.deletedAt && t.status !== 'completed');
  const todayTasks = input.tasks.filter(
    (t) =>
      !t.deletedAt &&
      (t.dueDate === todayStr || (t.completedAt && t.completedAt.slice(0, 10) === todayStr))
  );
  if (todayTasks.length === 0 && activeUncompletedTasks.length > 0) {
    items.push({
      id: `daily_plan_needed_${todayStr}`,
      severity: 'info',
      category: 'task',
      title: 'Plan Your Day',
      message: 'No tasks scheduled for today yet. Review and set your daily priority list.',
      targetTab: 'tasks',
      actionLabel: 'Plan Today',
    });
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
