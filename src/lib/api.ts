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
import { auth, getFirebaseIdToken, waitForInitialAuth } from './firebase.ts';
import { firestoreService } from './firestoreService.ts';

const BASE_URL = '/api';
const GUEST_SESSION_KEY = 'ff_guest_session_id';

function getOrCreateGuestSessionId(): string {
  try {
    const existing = localStorage.getItem(GUEST_SESSION_KEY);
    if (existing && /^gst_[a-zA-Z0-9_-]{8,64}$/.test(existing)) {
      return existing;
    }
    const created = `gst_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;
    localStorage.setItem(GUEST_SESSION_KEY, created);
    return created;
  } catch {
    return `gst_${Date.now().toString(36)}_fallback`;
  }
}

async function resolveAuthHeaders(): Promise<Record<string, string>> {
  const token = await getFirebaseIdToken();
  if (token) {
    return { Authorization: `Bearer ${token}` };
  }
  return { 'x-demo-session': getOrCreateGuestSessionId() };
}

async function request<T>(endpoint: string, options: RequestInit = {}): Promise<T> {
  const authHeaders = await resolveAuthHeaders();
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...authHeaders,
    ...(options.headers as Record<string, string> | undefined),
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
      // ignore non-JSON error body
    }
    throw new Error(errorMsg);
  }

  return response.json();
}

/**
 * Execute an operation with Cloud Firestore as primary persistence when signed in,
 * falling back cleanly to verified Bearer-authenticated API or isolated guest API when offline.
 */
async function withPrimaryPersistence<T>(
  cloudFn: (userId: string) => Promise<T>,
  apiFallbackFn: () => Promise<T>
): Promise<T> {
  const fbUser = await waitForInitialAuth();
  if (fbUser) {
    try {
      return await cloudFn(fbUser.uid);
    } catch (err) {
      const msg = err instanceof Error ? err.message.toLowerCase() : '';
      if (msg.includes('offline') || msg.includes('unavailable') || msg.includes('network')) {
        return apiFallbackFn();
      }
      throw err;
    }
  }
  return apiFallbackFn();
}

export const api = {
  // Auth & Settings
  getMe: async (): Promise<{ user: User; settings: UserSettings }> => {
    const fbUser = await waitForInitialAuth();
    if (fbUser) {
      try {
        return await firestoreService.getMe(fbUser);
      } catch {
        // Fallback to authenticated backend if offline
      }
    }
    return request<{ user: User; settings: UserSettings }>('/auth/me');
  },

  updateSettings: (settings: Partial<UserSettings>) =>
    withPrimaryPersistence(
      async (uid) => ({
        success: true,
        settings: await firestoreService.updateSettingsAndReturn(uid, settings),
      }),
      () =>
        request<{ success: boolean; settings: UserSettings }>('/settings', {
          method: 'PUT',
          body: JSON.stringify(settings),
        })
    ),

  reseed: () =>
    withPrimaryPersistence(
      async (uid) => {
        await firestoreService.reseedWorkspace(uid);
        return { success: true, message: 'Cloud workspace reset cleanly' };
      },
      () => request<{ success: boolean; message: string }>('/reseed', { method: 'POST' })
    ),

  // Unified Dashboard
  getDashboard: () =>
    withPrimaryPersistence(
      (uid) => firestoreService.getDashboard(uid),
      () => request<DashboardData>('/dashboard')
    ),

  // Focus & Pomodoro
  getFocusSessions: () =>
    withPrimaryPersistence(
      (uid) => firestoreService.getFocusSessions(uid),
      () => request<FocusSession[]>('/focus/sessions')
    ),

  createFocusSession: (session: Partial<FocusSession>) =>
    withPrimaryPersistence(
      (uid) => firestoreService.createFocusSession(uid, session),
      () =>
        request<FocusSession>('/focus/sessions', {
          method: 'POST',
          body: JSON.stringify(session),
        })
    ),

  getFocusStats: () =>
    withPrimaryPersistence(
      (uid) => firestoreService.getFocusStats(uid),
      () => request<FocusStatsData>('/focus/stats')
    ),

  // Tasks
  getTasks: () =>
    withPrimaryPersistence(
      (uid) => firestoreService.getTasks(uid),
      () => request<Task[]>('/tasks')
    ),

  createTask: (task: Partial<Task>) =>
    withPrimaryPersistence(
      (uid) => firestoreService.createTask(uid, task),
      () =>
        request<Task>('/tasks', {
          method: 'POST',
          body: JSON.stringify(task),
        })
    ),

  updateTask: (id: string, task: Partial<Task>) =>
    withPrimaryPersistence(
      (uid) => firestoreService.updateTask(uid, id, task),
      () =>
        request<Task>(`/tasks/${encodeURIComponent(id)}`, {
          method: 'PUT',
          body: JSON.stringify(task),
        })
    ),

  deleteTask: (id: string) =>
    withPrimaryPersistence(
      async (uid) => {
        await firestoreService.deleteTask(uid, id);
        return { success: true };
      },
      () =>
        request<{ success: boolean }>(`/tasks/${encodeURIComponent(id)}`, {
          method: 'DELETE',
        })
    ),

  // Categories
  getCategories: () =>
    withPrimaryPersistence(
      (uid) => firestoreService.getCategories(uid),
      () => request<ExpenseCategory[]>('/finance/categories')
    ),

  createCategory: (cat: Partial<ExpenseCategory>) =>
    withPrimaryPersistence(
      (uid) => firestoreService.createCategory(uid, cat),
      () =>
        request<ExpenseCategory>('/finance/categories', {
          method: 'POST',
          body: JSON.stringify(cat),
        })
    ),

  // Finance Summary
  getFinanceSummary: (filter: string = 'this_month', startDate?: string, endDate?: string) =>
    withPrimaryPersistence(
      (uid) => firestoreService.getFinanceSummary(uid, filter, startDate, endDate),
      () => {
        let query = `?filter=${encodeURIComponent(filter)}`;
        if (startDate) query += `&startDate=${encodeURIComponent(startDate)}`;
        if (endDate) query += `&endDate=${encodeURIComponent(endDate)}`;
        return request<FinanceSummaryData>(`/finance/summary${query}`);
      }
    ),

  // Income
  getIncomes: () =>
    withPrimaryPersistence(
      (uid) => firestoreService.getIncomes(uid),
      () => request<IncomeTransaction[]>('/finance/income')
    ),

  createIncome: (data: Partial<IncomeTransaction>) =>
    withPrimaryPersistence(
      (uid) => firestoreService.createIncome(uid, data),
      () =>
        request<IncomeTransaction>('/finance/income', {
          method: 'POST',
          body: JSON.stringify(data),
        })
    ),

  updateIncome: (id: string, data: Partial<IncomeTransaction>) =>
    withPrimaryPersistence(
      (uid) => firestoreService.updateIncome(uid, id, data),
      () =>
        request<IncomeTransaction>(`/finance/income/${encodeURIComponent(id)}`, {
          method: 'PUT',
          body: JSON.stringify(data),
        })
    ),

  deleteIncome: (id: string) =>
    withPrimaryPersistence(
      async (uid) => {
        await firestoreService.deleteIncome(uid, id);
        return { success: true };
      },
      () =>
        request<{ success: boolean }>(`/finance/income/${encodeURIComponent(id)}`, {
          method: 'DELETE',
        })
    ),

  // Expenses (Variable and All)
  getExpenses: (type?: 'fixed' | 'variable') =>
    withPrimaryPersistence(
      (uid) => firestoreService.getExpenses(uid, type),
      () => {
        const q = type ? `?type=${encodeURIComponent(type)}` : '';
        return request<ExpenseTransaction[]>(`/finance/expenses${q}`);
      }
    ),

  createExpense: (data: Partial<ExpenseTransaction>) =>
    withPrimaryPersistence(
      (uid) => firestoreService.createExpense(uid, data),
      () =>
        request<ExpenseTransaction>('/finance/expenses', {
          method: 'POST',
          body: JSON.stringify(data),
        })
    ),

  updateExpense: (id: string, data: Partial<ExpenseTransaction>) =>
    withPrimaryPersistence(
      (uid) => firestoreService.updateExpense(uid, id, data),
      () =>
        request<ExpenseTransaction>(`/finance/expenses/${encodeURIComponent(id)}`, {
          method: 'PUT',
          body: JSON.stringify(data),
        })
    ),

  deleteExpense: (id: string) =>
    withPrimaryPersistence(
      async (uid) => {
        await firestoreService.deleteExpense(uid, id);
        return { success: true };
      },
      () =>
        request<{ success: boolean }>(`/finance/expenses/${encodeURIComponent(id)}`, {
          method: 'DELETE',
        })
    ),

  // Recurring Expenses (Fixed)
  getRecurringExpenses: () =>
    withPrimaryPersistence(
      (uid) => firestoreService.getRecurringExpenses(uid),
      () => request<RecurringExpense[]>('/finance/recurring')
    ),

  createRecurringExpense: (data: Partial<RecurringExpense>) =>
    withPrimaryPersistence(
      (uid) => firestoreService.createRecurringExpense(uid, data),
      () =>
        request<RecurringExpense>('/finance/recurring', {
          method: 'POST',
          body: JSON.stringify(data),
        })
    ),

  updateRecurringExpense: (id: string, data: Partial<RecurringExpense>) =>
    withPrimaryPersistence(
      (uid) => firestoreService.updateRecurringExpense(uid, id, data),
      () =>
        request<RecurringExpense>(`/finance/recurring/${encodeURIComponent(id)}`, {
          method: 'PUT',
          body: JSON.stringify(data),
        })
    ),

  deleteRecurringExpense: (id: string) =>
    withPrimaryPersistence(
      async (uid) => {
        await firestoreService.deleteRecurringExpense(uid, id);
        return { success: true };
      },
      () =>
        request<{ success: boolean }>(`/finance/recurring/${encodeURIComponent(id)}`, {
          method: 'DELETE',
        })
    ),

  // Bills & Payment Tracker
  getBills: (status?: string) =>
    withPrimaryPersistence(
      (uid) => firestoreService.getBills(uid, status),
      () => {
        const q = status ? `?status=${encodeURIComponent(status)}` : '';
        return request<Bill[]>(`/finance/bills${q}`);
      }
    ),

  createBill: (data: Partial<Bill>) =>
    withPrimaryPersistence(
      (uid) => firestoreService.createBill(uid, data),
      () =>
        request<Bill>('/finance/bills', {
          method: 'POST',
          body: JSON.stringify(data),
        })
    ),

  payBill: (id: string, paidDate?: string, paymentMethod?: string, notes?: string) =>
    withPrimaryPersistence(
      (uid) =>
        firestoreService.payBill(
          uid,
          id,
          paidDate,
          (paymentMethod as PaymentHistory['paymentMethod']) || 'upi_bank',
          notes
        ),
      () =>
        request<{ success: boolean; bill: Bill }>(`/finance/bills/${encodeURIComponent(id)}/pay`, {
          method: 'POST',
          body: JSON.stringify({ paidDate, paymentMethod, notes }),
        })
    ),

  undoBillPayment: (id: string) =>
    withPrimaryPersistence(
      (uid) => firestoreService.undoBillPayment(uid, id),
      () =>
        request<{ success: boolean; bill: Bill }>(
          `/finance/bills/${encodeURIComponent(id)}/undo`,
          {
            method: 'POST',
          }
        )
    ),

  deleteBill: (id: string) =>
    withPrimaryPersistence(
      async (uid) => {
        await firestoreService.deleteBill(uid, id);
        return { success: true };
      },
      () =>
        request<{ success: boolean }>(`/finance/bills/${encodeURIComponent(id)}`, {
          method: 'DELETE',
        })
    ),

  getPaymentHistory: () =>
    withPrimaryPersistence(
      (uid) => firestoreService.getPaymentHistory(uid),
      () => request<PaymentHistory[]>('/finance/payments-history')
    ),
};

// Keep auth referenced to ensure tree-shaking preserves initialized instance
void auth;
