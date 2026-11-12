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
  SavingsGoal,
  TrashRecord,
  TimeBlock,
  BudgetEnvelope,
  SubscriptionPlan,
  AuditLogEntry,
  DurableSyncOperation,
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

  clearWorkspace: () =>
    withPrimaryPersistence(
      async (uid) => {
        await firestoreService.reseedWorkspace(uid);
        return { success: true, message: 'Workspace cleared cleanly' };
      },
      () => request<{ success: boolean; message: string }>('/workspace/clear', { method: 'POST' })
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

  // Savings Goals
  getSavingsGoals: () =>
    withPrimaryPersistence(
      (uid) => firestoreService.getSavingsGoals(uid),
      () => request<SavingsGoal[]>('/finance/savings-goals')
    ),

  createSavingsGoal: (data: Partial<SavingsGoal>) =>
    withPrimaryPersistence(
      (uid) => firestoreService.createSavingsGoal(uid, data),
      () =>
        request<SavingsGoal>('/finance/savings-goals', {
          method: 'POST',
          body: JSON.stringify(data),
        })
    ),

  updateSavingsGoal: (id: string, data: Partial<SavingsGoal>) =>
    withPrimaryPersistence(
      (uid) => firestoreService.updateSavingsGoal(uid, id, data),
      () =>
        request<SavingsGoal>(`/finance/savings-goals/${encodeURIComponent(id)}`, {
          method: 'PUT',
          body: JSON.stringify(data),
        })
    ),

  contributeSavingsGoal: (id: string, deltaPaise: number) =>
    withPrimaryPersistence(
      (uid) => firestoreService.contributeSavingsGoal(uid, id, deltaPaise),
      () =>
        request<SavingsGoal>(`/finance/savings-goals/${encodeURIComponent(id)}/contribute`, {
          method: 'POST',
          body: JSON.stringify({ deltaPaise }),
        })
    ),

  deleteSavingsGoal: (id: string) =>
    withPrimaryPersistence(
      async (uid) => {
        await firestoreService.deleteSavingsGoal(uid, id);
        return { success: true };
      },
      () =>
        request<{ success: boolean }>(`/finance/savings-goals/${encodeURIComponent(id)}`, {
          method: 'DELETE',
        })
    ),

  // Trash & Restore
  getTrash: () =>
    withPrimaryPersistence(
      (uid) => firestoreService.getTrashItems(uid),
      () => request<TrashRecord[]>('/trash')
    ),

  restoreTrashItem: (entityType: TrashRecord['entityType'], id: string) =>
    withPrimaryPersistence(
      async (uid) => {
        await firestoreService.restoreTrashItem(uid, entityType, id);
        return { success: true };
      },
      () =>
        request<{ success: boolean }>(
          `/trash/${encodeURIComponent(entityType)}/${encodeURIComponent(id)}/restore`,
          { method: 'POST' }
        )
    ),

  permanentlyDeleteTrashItem: (entityType: TrashRecord['entityType'], id: string) =>
    withPrimaryPersistence(
      async (uid) => {
        await firestoreService.permanentlyDeleteTrashItem(uid, entityType, id);
        return { success: true };
      },
      () =>
        request<{ success: boolean }>(
          `/trash/${encodeURIComponent(entityType)}/${encodeURIComponent(id)}`,
          { method: 'DELETE' }
        )
    ),

  // Time Blocks
  getTimeBlocks: (date?: string) =>
    withPrimaryPersistence(
      (uid) => firestoreService.getTimeBlocks(uid, date),
      () => request<TimeBlock[]>(`/time-blocks${date ? `?date=${encodeURIComponent(date)}` : ''}`)
    ),

  createTimeBlock: (block: Partial<TimeBlock>) =>
    withPrimaryPersistence(
      (uid) => firestoreService.saveTimeBlock(uid, block),
      () =>
        request<TimeBlock>('/time-blocks', {
          method: 'POST',
          body: JSON.stringify(block),
        })
    ),

  updateTimeBlock: (id: string, block: Partial<TimeBlock>) =>
    withPrimaryPersistence(
      (uid) => firestoreService.saveTimeBlock(uid, { ...block, id }),
      () =>
        request<TimeBlock>(`/time-blocks/${encodeURIComponent(id)}`, {
          method: 'PUT',
          body: JSON.stringify(block),
        })
    ),

  deleteTimeBlock: (id: string) =>
    withPrimaryPersistence(
      async (uid) => {
        await firestoreService.deleteTimeBlock(uid, id);
        return { success: true };
      },
      () =>
        request<{ success: boolean }>(`/time-blocks/${encodeURIComponent(id)}`, {
          method: 'DELETE',
        })
    ),

  // Envelope Budgeting
  getEnvelopes: (monthKey?: string) =>
    withPrimaryPersistence(
      (uid) => firestoreService.getEnvelopes(uid, monthKey),
      () => request<BudgetEnvelope[]>(`/envelopes${monthKey ? `?monthKey=${encodeURIComponent(monthKey)}` : ''}`)
    ),

  createEnvelope: (env: Partial<BudgetEnvelope>) =>
    withPrimaryPersistence(
      (uid) => firestoreService.saveEnvelope(uid, env),
      () =>
        request<BudgetEnvelope>('/envelopes', {
          method: 'POST',
          body: JSON.stringify(env),
        })
    ),

  updateEnvelope: (id: string, env: Partial<BudgetEnvelope>) =>
    withPrimaryPersistence(
      (uid) => firestoreService.saveEnvelope(uid, { ...env, id }),
      () =>
        request<BudgetEnvelope>(`/envelopes/${encodeURIComponent(id)}`, {
          method: 'PUT',
          body: JSON.stringify(env),
        })
    ),

  deleteEnvelope: (id: string) =>
    withPrimaryPersistence(
      async (uid) => {
        await firestoreService.deleteEnvelope(uid, id);
        return { success: true };
      },
      () =>
        request<{ success: boolean }>(`/envelopes/${encodeURIComponent(id)}`, {
          method: 'DELETE',
        })
    ),

  transferEnvelopeFunds: (fromId: string, toId: string, amountPaise: number) =>
    withPrimaryPersistence(
      (uid) => firestoreService.transferEnvelopeFunds(uid, fromId, toId, amountPaise),
      () =>
        request<{ success: boolean }>('/envelopes/transfer', {
          method: 'POST',
          body: JSON.stringify({ fromId, toId, amountPaise }),
        })
    ),

  // Subscriptions
  getSubscriptions: () =>
    withPrimaryPersistence(
      (uid) => firestoreService.getSubscriptions(uid),
      () => request<SubscriptionPlan[]>('/subscriptions')
    ),

  createSubscription: (sub: Partial<SubscriptionPlan>) =>
    withPrimaryPersistence(
      (uid) => firestoreService.saveSubscription(uid, sub),
      () =>
        request<SubscriptionPlan>('/subscriptions', {
          method: 'POST',
          body: JSON.stringify(sub),
        })
    ),

  updateSubscription: (id: string, sub: Partial<SubscriptionPlan>) =>
    withPrimaryPersistence(
      (uid) => firestoreService.saveSubscription(uid, { ...sub, id }),
      () =>
        request<SubscriptionPlan>(`/subscriptions/${encodeURIComponent(id)}`, {
          method: 'PUT',
          body: JSON.stringify(sub),
        })
    ),

  deleteSubscription: (id: string) =>
    withPrimaryPersistence(
      async (uid) => {
        await firestoreService.deleteSubscription(uid, id);
        return { success: true };
      },
      () =>
        request<{ success: boolean }>(`/subscriptions/${encodeURIComponent(id)}`, {
          method: 'DELETE',
        })
    ),

  // Audit Logs
  getAuditLogs: (limit = 100) =>
    withPrimaryPersistence(
      (uid) => firestoreService.getAuditLogs(uid, limit),
      () => request<AuditLogEntry[]>(`/audit-logs?limit=${limit}`)
    ),

  // Durable Sync Queue
  getSyncQueue: () =>
    withPrimaryPersistence(
      (uid) => firestoreService.getDurableSyncQueue(uid),
      () => request<DurableSyncOperation[]>('/sync/queue')
    ),

  enqueueSync: (op: Omit<DurableSyncOperation, 'id' | 'userId' | 'status' | 'attempts' | 'createdAt'>) =>
    withPrimaryPersistence(
      (uid) => firestoreService.enqueueDurableSync(uid, op),
      () =>
        request<DurableSyncOperation>('/sync/queue/enqueue', {
          method: 'POST',
          body: JSON.stringify(op),
        })
    ),

  updateSyncOpStatus: (id: string, updates: Partial<DurableSyncOperation>) =>
    withPrimaryPersistence(
      async (uid) => {
        await firestoreService.updateDurableSyncOp(uid, id, updates);
        return { success: true };
      },
      () =>
        request<{ success: boolean }>(`/sync/queue/${encodeURIComponent(id)}/status`, {
          method: 'POST',
          body: JSON.stringify(updates),
        })
    ),

  // Backups & Data Recovery
  exportBackup: () =>
    withPrimaryPersistence(
      async (uid) => {
        // Construct comprehensive client-side Firestore export
        const [
          settings,
          tasks,
          focusSessions,
          categories,
          recurringExpenses,
          bills,
          paymentHistory,
          income,
          expenses,
          savingsGoals,
          timeBlocks,
          envelopes,
          subscriptions,
          auditLogs,
        ] = await Promise.all([
          firestoreService.getSettings(uid),
          firestoreService.getTasks(uid),
          firestoreService.getFocusSessions(uid),
          firestoreService.getCategories(uid),
          firestoreService.getRecurringExpenses(uid),
          firestoreService.getBills(uid),
          firestoreService.getPaymentHistory(uid),
          firestoreService.getIncomes(uid),
          firestoreService.getExpenses(uid),
          firestoreService.getSavingsGoals(uid),
          firestoreService.getTimeBlocks(uid),
          firestoreService.getEnvelopes(uid),
          firestoreService.getSubscriptions(uid),
          firestoreService.getAuditLogs(uid),
        ]);

        return {
          version: '2.0.0',
          exportedAt: new Date().toISOString(),
          userId: uid,
          userSettings: settings,
          tasks,
          focusSessions,
          categories,
          recurringExpenses,
          bills,
          paymentHistory,
          incomeTransactions: income,
          expenseTransactions: expenses,
          savingsGoals,
          timeBlocks,
          envelopes,
          subscriptions,
          auditLogs,
        };
      },
      () => request<Record<string, unknown>>('/backup/export')
    ),

  restoreBackup: (data: unknown) =>
    withPrimaryPersistence(
      async (uid) => {
        // Fallback to server restore or execute batch restore
        return request<{ success: boolean; counts: Record<string, number> }>('/backup/restore', {
          method: 'POST',
          body: JSON.stringify(data),
        });
      },
      () =>
        request<{ success: boolean; counts: Record<string, number> }>('/backup/restore', {
          method: 'POST',
          body: JSON.stringify(data),
        })
    ),
};

// Keep auth referenced to ensure tree-shaking preserves initialized instance
void auth;
