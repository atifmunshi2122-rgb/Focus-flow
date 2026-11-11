export type CurrencyCode = 'INR' | 'USD' | 'EUR' | 'GBP';

export interface User {
  id: string;
  email: string;
  name: string;
  avatarUrl: string;
  createdAt: string;
}

export interface UserSettings {
  userId: string;
  currency: CurrencyCode;
  pomodoroWorkDuration: number; // minutes
  shortBreakDuration: number;
  longBreakDuration: number;
  autoSwitchSessions: boolean;
  soundEnabled: boolean;
  theme: 'light' | 'dark' | 'system';
  googleSpreadsheetId?: string;
  lastSyncedAt?: string;
}

export interface Task {
  id: string;
  userId: string;
  title: string;
  description: string;
  priority: 'low' | 'medium' | 'high';
  status: 'todo' | 'in_progress' | 'completed';
  estimatedPomodoros: number;
  completedPomodoros: number;
  dueDate: string | null;
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
  notes: string;
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
  createdAt: string;
}

export interface DashboardData {
  todayFocusMinutes: number;
  completedPomodoroSessions: number;
  focusStreakDays: number;
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

export interface FocusStatsData {
  last7Days: Array<{
    date: string;
    dayName: string;
    minutes: number;
    sessionsCount: number;
  }>;
  monthMinutes: number;
  monthSessionsCount: number;
  totalMinutes: number;
  totalCompletedSessions: number;
}
