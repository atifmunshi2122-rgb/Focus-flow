import type { ThemeConfig, SavedCustomTheme } from './theme.ts';
export * from './theme.ts';

export type CurrencyCode = 'INR' | 'USD' | 'EUR' | 'GBP';

export interface User {
  id: string;
  email: string;
  name: string;
  avatarUrl: string;
  createdAt: string;
}

export type DashboardWidgetId =
  | 'hero'
  | 'clock_greeting'
  | 'focus_kpis'
  | 'finance_kpis'
  | 'productivity_goals'
  | 'gamification'
  | 'upcoming_bills'
  | 'recent_transactions';

export type DashboardWidgetSize = 'compact' | 'standard' | 'wide';
export type DashboardLayoutPreset = 'executive' | 'focus_first' | 'finance_pulse' | 'minimal';

export interface DashboardLayoutConfig {
  preset: DashboardLayoutPreset;
  widgetOrder: DashboardWidgetId[];
  hiddenWidgets: DashboardWidgetId[];
  widgetSizes: Partial<Record<DashboardWidgetId, DashboardWidgetSize>>;
}

export interface NotificationPreferences {
  enabled: boolean;
  taskDeadlines: boolean;
  upcomingBills: boolean;
  billLeadDays: number;
  overdueBills: boolean;
  focusCompletion: boolean;
  dailyFocusGoal: boolean;
  budgetWarnings: boolean;
  budgetWarningPercent: number;
  syncFailures: boolean;
}

export interface UserSettings {
  userId: string;
  currency: CurrencyCode;
  timezone?: string; // Default: 'Asia/Kolkata'
  pomodoroWorkDuration: number; // minutes
  shortBreakDuration: number;
  longBreakDuration: number;
  autoSwitchSessions: boolean;
  soundEnabled: boolean;
  theme: 'light' | 'dark' | 'system';
  themeConfig?: ThemeConfig;
  savedThemes?: SavedCustomTheme[];
  activeSavedThemeId?: string | null;
  googleSpreadsheetId?: string;
  lastSyncedAt?: string;
  dailyFocusGoalMinutes?: number;
  weeklyFocusGoalMinutes?: number;
  monthlyBudgetPaise?: number;
  dailySpendingLimitPaise?: number;
  weeklySpendingLimitPaise?: number;
  categoryBudgets?: Record<string, number>;
  dashboardLayout?: DashboardLayoutConfig;
  notificationPrefs?: NotificationPreferences;
  favoriteStyleIds?: string[];
  favoriteThemeIds?: string[];
  keyboardShortcutsEnabled?: boolean;
}

export interface SubtaskItem {
  id: string;
  title: string;
  done: boolean;
}

export type TaskRecurrence = 'none' | 'daily' | 'weekly' | 'monthly';

export interface Task {
  id: string;
  userId: string;
  title: string;
  description: string;
  priority: 'low' | 'medium' | 'high';
  status: 'todo' | 'in_progress' | 'completed';
  category?: string;
  subtasks?: SubtaskItem[];
  recurrence?: TaskRecurrence;
  order?: number;
  estimatedPomodoros: number;
  completedPomodoros: number;
  dueDate: string | null;
  completedAt?: string | null;
  deletedAt?: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface FocusSession {
  id: string;
  userId: string;
  taskId: string | null;
  taskTitle?: string;
  mode: 'work' | 'short_break' | 'long_break';
  durationMinutes: number;
  durationSeconds: number;
  completed: boolean;
  startedAt: string;
  endedAt: string;
}

export interface ExpenseCategory {
  id: string;
  userId: string;
  name: string;
  type: 'fixed' | 'variable' | 'both';
  icon: string;
  color: string;
}

export interface RecurringExpense {
  id: string;
  userId: string;
  name: string;
  amountPaise: number;
  categoryId: string;
  categoryName?: string;
  recurrence: 'monthly' | 'quarterly' | 'yearly';
  dueDay: number;
  isActive: boolean;
  notes: string;
  createdAt: string;
  updatedAt: string;
}

export interface Bill {
  id: string;
  userId: string;
  recurringExpenseId: string | null;
  name: string;
  amountPaise: number;
  categoryId: string;
  categoryName?: string;
  categoryColor?: string;
  dueDate: string;
  status: 'PAID' | 'UNPAID' | 'OVERDUE';
  paymentDate: string | null;
  notes: string;
  periodKey: string;
  lastPaymentId?: string | null;
  lastPaymentIdempotencyKey?: string | null;
  deletedAt?: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface PaymentHistory {
  id: string;
  userId: string;
  billId: string;
  billName?: string;
  amountPaise: number;
  paidDate: string;
  paymentMethod: 'credit_card' | 'debit_card' | 'upi_bank' | 'cash' | 'other';
  transactionRef: string;
  idempotencyKey?: string;
  notes: string;
  status?: 'completed' | 'reversed';
  reversedAt?: string | null;
  createdAt: string;
}

export interface IncomeTransaction {
  id: string;
  userId: string;
  source: string;
  amountPaise: number;
  date: string;
  category: string;
  notes: string;
  deletedAt?: string | null;
  createdAt: string;
}

export interface ExpenseTransaction {
  id: string;
  userId: string;
  billId: string | null;
  type: 'fixed' | 'variable';
  categoryId: string;
  categoryName?: string;
  categoryColor?: string;
  amountPaise: number;
  date: string;
  description: string;
  paymentMethod: 'credit_card' | 'debit_card' | 'upi_bank' | 'cash' | 'other';
  notes: string;
  deletedAt?: string | null;
  createdAt: string;
}

export interface SavingsGoal {
  id: string;
  userId: string;
  title: string;
  targetPaise: number;
  savedPaise: number;
  targetDate: string | null;
  color: string;
  createdAt: string;
  updatedAt: string;
}

export interface TimeBlock {
  id: string;
  userId: string;
  date: string; // YYYY-MM-DD in target timezone
  title: string;
  startMinute: number; // 0 - 1440
  endMinute: number;   // 0 - 1440
  category: string;
  taskId?: string | null;
  completed: boolean;
  notes?: string;
  deletedAt?: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface BudgetEnvelope {
  id: string;
  userId: string;
  name: string;
  categoryId?: string | null;
  allocatedPaise: number;
  spentPaise?: number;
  monthKey: string; // YYYY-MM
  color: string;
  notes?: string;
  deletedAt?: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface SubscriptionPlan {
  id: string;
  userId: string;
  name: string;
  amountPaise: number;
  categoryId: string;
  categoryName?: string;
  billingCycle: 'monthly' | 'quarterly' | 'yearly';
  nextRenewalDate: string; // YYYY-MM-DD
  reminderDays: number;
  autoRenew: boolean;
  status: 'active' | 'paused' | 'cancelled';
  websiteUrl?: string;
  notes?: string;
  deletedAt?: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface AuditLogEntry {
  id: string;
  userId: string;
  action: 'create' | 'update' | 'delete' | 'restore' | 'pay' | 'undo_payment' | 'import_backup' | 'purge' | 'envelope_transfer' | 'backup_restore';
  entityType: 'task' | 'income' | 'expense' | 'bill' | 'time_block' | 'envelope' | 'subscription' | 'settings' | 'backup';
  entityId: string;
  entityTitle?: string;
  details?: string;
  timestamp: string;
}

export interface DurableSyncOperation {
  id: string;
  userId: string;
  entityType:
    | 'focus_session'
    | 'task'
    | 'income'
    | 'expense'
    | 'bill'
    | 'budget'
    | 'savings_goal'
    | 'category'
    | 'full_sync';
  action: 'append' | 'update' | 'delete' | 'full_sync';
  sheetName: string;
  payload: unknown;
  dedupeKey?: string;
  status: 'pending' | 'processing' | 'completed' | 'failed';
  attempts: number;
  lastAttemptAt?: string | null;
  nextRetryAt?: number | null; // epoch ms for exponential backoff
  errorMessage?: string | null;
  createdAt: string;
}

export interface TrashRecord {
  id: string;
  entityType: 'task' | 'income' | 'expense' | 'bill' | 'time_block' | 'envelope' | 'subscription';
  title: string;
  subtitle: string;
  amountPaise?: number;
  deletedAt: string;
}

export interface DashboardData {
  todayFocusMinutes: number;
  weeklyFocusMinutes?: number;
  completedPomodoroSessions: number;
  focusStreakDays: number;
  bestStreakDays?: number;
  completedTasksCount?: number;
  pendingTasksCount?: number;
  todayIncomePaise?: number;
  todayExpensesPaise?: number;
  weeklyExpensesPaise?: number;
  monthlyIncomePaise: number;
  monthlyExpensesPaise: number;
  fixedExpensesPaise: number;
  variableExpensesPaise: number;
  remainingBalancePaise: number;
  paidBillsCount: number;
  unpaidBillsCount: number;
  totalPaidAmountPaise: number;
  totalUnpaidAmountPaise: number;
  upcomingPayments: Bill[];
  recentTransactions: Array<{
    id: string;
    type: 'income' | 'fixed' | 'variable';
    name: string;
    category: string;
    amountPaise: number;
    date: string;
    notes?: string;
    paymentMethod?: string;
  }>;
}

export interface FinanceSummaryData {
  filter: string;
  startDate: string;
  endDate: string;
  totalIncomePaise: number;
  totalExpensePaise: number;
  fixedExpensesPaise: number;
  variableExpensesPaise: number;
  remainingBalancePaise: number;
  totalPaidAmountPaise: number;
  totalUnpaidAmountPaise: number;
  paidBillsCount: number;
  unpaidBillsCount: number;
  categoryBreakdown: Array<{
    categoryId?: string;
    name: string;
    color: string;
    amountPaise: number;
  }>;
  monthlyTrend: Array<{
    month: string;
    incomePaise: number;
    expensePaise: number;
  }>;
}

export type FinancialReportType =
  | 'daily'
  | 'weekly'
  | 'monthly'
  | 'category'
  | 'income'
  | 'expense'
  | 'budget';

export interface FocusStatsData {
  last7Days: Array<{
    date: string;
    dayName: string;
    minutes: number;
    sessionsCount: number;
  }>;
  dailyHeatmap?: Array<{
    date: string;
    minutes: number;
    sessionsCount: number;
  }>;
  weeklyMinutes?: number;
  monthMinutes: number;
  monthSessionsCount: number;
  totalMinutes: number;
  totalCompletedSessions: number;
}

export interface CursorPage<T> {
  items: T[];
  nextCursor: string | null;
  hasMore: boolean;
}

export interface OfflineOutboxOperation {
  id: string;
  userId: string;
  dedupeKey: string;
  operationType:
    | 'create_task'
    | 'update_task'
    | 'delete_task'
    | 'create_focus_session'
    | 'create_income'
    | 'update_income'
    | 'delete_income'
    | 'create_expense'
    | 'update_expense'
    | 'delete_expense'
    | 'create_recurring'
    | 'update_recurring'
    | 'delete_recurring'
    | 'create_bill'
    | 'pay_bill'
    | 'undo_bill_payment'
    | 'delete_bill'
    | 'save_time_block'
    | 'delete_time_block'
    | 'save_envelope'
    | 'delete_envelope'
    | 'save_subscription'
    | 'delete_subscription'
    | 'create_savings_goal'
    | 'update_savings_goal'
    | 'contribute_savings_goal'
    | 'delete_savings_goal'
    | 'update_settings';
  payload: Record<string, unknown>;
  createdAt: string;
  attempts: number;
  lastError?: string;
}

