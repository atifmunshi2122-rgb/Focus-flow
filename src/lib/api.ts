import {
  User,
  UserSettings,
  Task,
  FocusSession,
  ExpenseCategory,
  RecurringExpense,
  Bill,
  PaymentHistory,
  IncomeTransaction,
  ExpenseTransaction,
  DashboardData,
  FinanceSummaryData,
  FocusStatsData,
} from '../types/index.ts';

const BASE_URL = '/api';

async function request<T>(endpoint: string, options: RequestInit = {}): Promise<T> {
  const headers = {
    'Content-Type': 'application/json',
    'x-user-id': 'usr_atif_default',
    ...options.headers,
  };

  const response = await fetch(`${BASE_URL}${endpoint}`, {
    ...options,
    headers,
  });

  if (!response.ok) {
    let errorMsg = `API Error: ${response.status} ${response.statusText}`;
    try {
      const errorData = await response.json();
      if (errorData.error) errorMsg = errorData.error;
    } catch {
      // ignore
    }
    throw new Error(errorMsg);
  }

  return response.json();
}

export const api = {
  // Auth & Settings
  getMe: () => request<{ user: User; settings: UserSettings }>('/auth/me'),
  updateSettings: (settings: Partial<UserSettings>) =>
    request<{ success: boolean; settings: UserSettings }>('/settings', {
      method: 'PUT',
      body: JSON.stringify(settings),
    }),
  reseed: () => request<{ success: boolean; message: string }>('/reseed', { method: 'POST' }),

  // Unified Dashboard
  getDashboard: () => request<DashboardData>('/dashboard'),

  // Focus & Pomodoro
  getFocusSessions: () => request<FocusSession[]>('/focus/sessions'),
  createFocusSession: (session: Partial<FocusSession>) =>
    request<FocusSession>('/focus/sessions', {
      method: 'POST',
      body: JSON.stringify(session),
    }),
  getFocusStats: () => request<FocusStatsData>('/focus/stats'),

  // Tasks
  getTasks: () => request<Task[]>('/tasks'),
  createTask: (task: Partial<Task>) =>
    request<Task>('/tasks', {
      method: 'POST',
      body: JSON.stringify(task),
    }),
  updateTask: (id: string, task: Partial<Task>) =>
    request<Task>(`/tasks/${id}`, {
      method: 'PUT',
      body: JSON.stringify(task),
    }),
  deleteTask: (id: string) =>
    request<{ success: boolean }>(`/tasks/${id}`, {
      method: 'DELETE',
    }),

  // Categories
  getCategories: () => request<ExpenseCategory[]>('/finance/categories'),
  createCategory: (cat: Partial<ExpenseCategory>) =>
    request<ExpenseCategory>('/finance/categories', {
      method: 'POST',
      body: JSON.stringify(cat),
    }),

  // Finance Summary
  getFinanceSummary: (filter: string = 'this_month', startDate?: string, endDate?: string) => {
    let query = `?filter=${encodeURIComponent(filter)}`;
    if (startDate) query += `&startDate=${encodeURIComponent(startDate)}`;
    if (endDate) query += `&endDate=${encodeURIComponent(endDate)}`;
    return request<FinanceSummaryData>(`/finance/summary${query}`);
  },

  // Income
  getIncomes: () => request<IncomeTransaction[]>('/finance/income'),
  createIncome: (data: Partial<IncomeTransaction>) =>
    request<IncomeTransaction>('/finance/income', {
      method: 'POST',
      body: JSON.stringify(data),
    }),
  updateIncome: (id: string, data: Partial<IncomeTransaction>) =>
    request<IncomeTransaction>(`/finance/income/${id}`, {
      method: 'PUT',
      body: JSON.stringify(data),
    }),
  deleteIncome: (id: string) =>
    request<{ success: boolean }>(`/finance/income/${id}`, {
      method: 'DELETE',
    }),

  // Expenses (Variable and All)
  getExpenses: (type?: 'fixed' | 'variable') => {
    const q = type ? `?type=${type}` : '';
    return request<ExpenseTransaction[]>(`/finance/expenses${q}`);
  },
  createExpense: (data: Partial<ExpenseTransaction>) =>
    request<ExpenseTransaction>('/finance/expenses', {
      method: 'POST',
      body: JSON.stringify(data),
    }),
  updateExpense: (id: string, data: Partial<ExpenseTransaction>) =>
    request<ExpenseTransaction>(`/finance/expenses/${id}`, {
      method: 'PUT',
      body: JSON.stringify(data),
    }),
  deleteExpense: (id: string) =>
    request<{ success: boolean }>(`/finance/expenses/${id}`, {
      method: 'DELETE',
    }),

  // Recurring Expenses (Fixed)
  getRecurringExpenses: () => request<RecurringExpense[]>('/finance/recurring'),
  createRecurringExpense: (data: Partial<RecurringExpense>) =>
    request<RecurringExpense>('/finance/recurring', {
      method: 'POST',
      body: JSON.stringify(data),
    }),
  updateRecurringExpense: (id: string, data: Partial<RecurringExpense>) =>
    request<RecurringExpense>(`/finance/recurring/${id}`, {
      method: 'PUT',
      body: JSON.stringify(data),
    }),
  deleteRecurringExpense: (id: string) =>
    request<{ success: boolean }>(`/finance/recurring/${id}`, {
      method: 'DELETE',
    }),

  // Bills & Payment Tracker
  getBills: (status?: string) => {
    const q = status ? `?status=${status}` : '';
    return request<Bill[]>(`/finance/bills${q}`);
  },
  createBill: (data: Partial<Bill>) =>
    request<Bill>('/finance/bills', {
      method: 'POST',
      body: JSON.stringify(data),
    }),
  payBill: (id: string, paidDate?: string, paymentMethod?: string, notes?: string) =>
    request<{ success: boolean; bill: Bill }>(`/finance/bills/${id}/pay`, {
      method: 'POST',
      body: JSON.stringify({ paidDate, paymentMethod, notes }),
    }),
  undoBillPayment: (id: string) =>
    request<{ success: boolean; bill: Bill }>(`/finance/bills/${id}/undo`, {
      method: 'POST',
    }),
  deleteBill: (id: string) =>
    request<{ success: boolean }>(`/finance/bills/${id}`, {
      method: 'DELETE',
    }),
  getPaymentHistory: () => request<PaymentHistory[]>('/finance/payments-history'),
};
