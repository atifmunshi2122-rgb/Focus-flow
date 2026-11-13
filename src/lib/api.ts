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
  CursorPage,
  OfflineOutboxOperation,
} from '../types/index.ts';
import { auth, getFirebaseIdToken, waitForInitialAuth } from './firebase.ts';
import { firestoreService } from './firestoreService.ts';
import { offlineOutbox } from './offlineOutbox.ts';
import type { SheetsSnapshotPayload } from './sheetsSpec.ts';

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
    let errorCode: string | undefined;
    try {
      const errorData = (await response.json()) as { error?: string; code?: string };
      if (errorData.error) errorMsg = errorData.error;
      if (typeof errorData.code === 'string') errorCode = errorData.code;
    } catch {
      // ignore non-JSON error body
    }
    const apiErr = new Error(errorMsg) as Error & { status?: number; code?: string };
    apiErr.status = response.status;
    if (errorCode) apiErr.code = errorCode;
    throw apiErr;
  }

  return response.json();
}

export function isTransientFirestoreError(err: unknown): boolean {
  const code =
    typeof err === 'object' && err !== null && 'code' in err
      ? String((err as { code?: unknown }).code || '').toLowerCase()
      : '';
  const msg = err instanceof Error ? err.message.toLowerCase() : String(err || '').toLowerCase();
  return (
    (typeof navigator !== 'undefined' && navigator.onLine === false) ||
    code.includes('unavailable') ||
    code.includes('network') ||
    msg.includes('offline') ||
    msg.includes('unavailable') ||
    msg.includes('network')
  );
}

/**
 * Reads: When signed in with Firebase, Firestore is the sole source of truth.
 * Signed-in users NEVER fall back to Express JSON reads so source of truth never diverges.
 */
async function withPrimaryRead<T>(
  cloudFn: (userId: string) => Promise<T>,
  guestApiFn: () => Promise<T>
): Promise<T> {
  const fbUser = await waitForInitialAuth();
  if (fbUser) {
    return cloudFn(fbUser.uid);
  }
  return guestApiFn();
}

/**
 * Writes: When signed in with Firebase, writes execute against Firestore.
 * If Firestore fails transiently offline/unavailable, enqueue into the per-user durable Offline Outbox
 * and return an optimistic response — NEVER write signed-in records into Express JSON storage.
 */
async function withPrimaryWrite<T>(
  cloudFn: (userId: string) => Promise<T>,
  guestApiFn: () => Promise<T>,
  offlineHandler?: {
    operationType: OfflineOutboxOperation['operationType'];
    dedupeKey: string;
    payload: Record<string, unknown>;
    optimisticResult: (userId: string) => T;
  }
): Promise<T> {
  const fbUser = await waitForInitialAuth();
  if (fbUser) {
    try {
      return await cloudFn(fbUser.uid);
    } catch (err) {
      if (offlineHandler && isTransientFirestoreError(err)) {
        offlineOutbox.enqueue(
          fbUser.uid,
          offlineHandler.operationType,
          offlineHandler.payload,
          offlineHandler.dedupeKey
        );
        return offlineHandler.optimisticResult(fbUser.uid);
      }
      throw err;
    }
  }
  return guestApiFn();
}

async function applyOfflineOutboxOp(userId: string, op: OfflineOutboxOperation): Promise<void> {
  const p = op.payload;
  switch (op.operationType) {
    case 'update_settings':
      await firestoreService.updateSettingsAndReturn(userId, p as Partial<UserSettings>);
      return;
    case 'create_task':
      await firestoreService.createTask(userId, p as Partial<Task>);
      return;
    case 'update_task':
      await firestoreService.updateTask(userId, String(p.id), p.updates as Partial<Task>);
      return;
    case 'delete_task':
      await firestoreService.deleteTask(userId, String(p.id));
      return;
    case 'create_focus_session':
      await firestoreService.createFocusSession(userId, p as Partial<FocusSession>);
      return;
    case 'create_income':
      await firestoreService.createIncome(userId, p as Partial<IncomeTransaction>);
      return;
    case 'update_income':
      await firestoreService.updateIncome(userId, String(p.id), p.updates as Partial<IncomeTransaction>);
      return;
    case 'delete_income':
      await firestoreService.deleteIncome(userId, String(p.id));
      return;
    case 'create_expense':
      await firestoreService.createExpense(userId, p as Partial<ExpenseTransaction>);
      return;
    case 'update_expense':
      await firestoreService.updateExpense(userId, String(p.id), p.updates as Partial<ExpenseTransaction>);
      return;
    case 'delete_expense':
      await firestoreService.deleteExpense(userId, String(p.id));
      return;
    case 'create_recurring':
      await firestoreService.createRecurringExpense(userId, p as Partial<RecurringExpense>);
      return;
    case 'update_recurring':
      await firestoreService.updateRecurringExpense(
        userId,
        String(p.id),
        p.updates as Partial<RecurringExpense>
      );
      return;
    case 'delete_recurring':
      await firestoreService.deleteRecurringExpense(userId, String(p.id));
      return;
    case 'create_bill':
      await firestoreService.createBill(userId, p as Partial<Bill>);
      return;
    case 'pay_bill':
      await firestoreService.payBill(
        userId,
        String(p.id),
        typeof p.paidDate === 'string' ? p.paidDate : undefined,
        (p.paymentMethod as PaymentHistory['paymentMethod']) || 'upi_bank',
        typeof p.notes === 'string' ? p.notes : undefined,
        typeof p.idempotencyKey === 'string' ? p.idempotencyKey : undefined
      );
      return;
    case 'undo_bill_payment':
      await firestoreService.undoBillPayment(userId, String(p.id));
      return;
    case 'delete_bill':
      await firestoreService.deleteBill(userId, String(p.id));
      return;
    case 'save_time_block':
      await firestoreService.saveTimeBlock(userId, p as Partial<TimeBlock>);
      return;
    case 'delete_time_block':
      await firestoreService.deleteTimeBlock(userId, String(p.id));
      return;
    case 'save_envelope':
      await firestoreService.saveEnvelope(userId, p as Partial<BudgetEnvelope>);
      return;
    case 'delete_envelope':
      await firestoreService.deleteEnvelope(userId, String(p.id));
      return;
    case 'save_subscription':
      await firestoreService.saveSubscription(userId, p as Partial<SubscriptionPlan>);
      return;
    case 'delete_subscription':
      await firestoreService.deleteSubscription(userId, String(p.id));
      return;
    case 'create_savings_goal':
      await firestoreService.createSavingsGoal(userId, p as Partial<SavingsGoal>);
      return;
    case 'update_savings_goal':
      await firestoreService.updateSavingsGoal(userId, String(p.id), p.updates as Partial<SavingsGoal>);
      return;
    case 'contribute_savings_goal':
      await firestoreService.contributeSavingsGoal(userId, String(p.id), Number(p.deltaPaise));
      return;
    case 'delete_savings_goal':
      await firestoreService.deleteSavingsGoal(userId, String(p.id));
      return;
  }
}

export const api = {
  // Offline Outbox Reconciliation
  getOfflineOutboxCount: (userId?: string): number => {
    const uid = userId || auth.currentUser?.uid;
    return uid ? offlineOutbox.count(uid) : 0;
  },

  getOfflineOutboxItems: (userId?: string): OfflineOutboxOperation[] => {
    const uid = userId || auth.currentUser?.uid;
    return uid ? offlineOutbox.list(uid) : [];
  },

  reconcileOfflineOutbox: async (userId?: string): Promise<{ reconciled: number; failed: number }> => {
    const uid = userId || auth.currentUser?.uid;
    if (!uid) return { reconciled: 0, failed: 0 };
    const ops = offlineOutbox.list(uid);
    if (ops.length === 0) return { reconciled: 0, failed: 0 };

    let reconciled = 0;
    let failed = 0;

    for (const op of ops) {
      try {
        await applyOfflineOutboxOp(uid, op);
        offlineOutbox.remove(uid, op.id);
        reconciled++;
      } catch (err) {
        const msg = err instanceof Error ? err.message : 'Reconciliation failed';
        offlineOutbox.recordError(uid, op.id, msg);
        failed++;
        if (isTransientFirestoreError(err)) {
          break;
        }
      }
    }
    return { reconciled, failed };
  },

  // Auth & Settings
  getMe: async (): Promise<{ user: User; settings: UserSettings }> => {
    const fbUser = await waitForInitialAuth();
    if (fbUser) {
      return firestoreService.getMe(fbUser);
    }
    return request<{ user: User; settings: UserSettings }>('/auth/me');
  },

  updateSettings: (settings: Partial<UserSettings>) =>
    withPrimaryWrite(
      async (uid) => ({
        success: true,
        settings: await firestoreService.updateSettingsAndReturn(uid, settings),
      }),
      () =>
        request<{ success: boolean; settings: UserSettings }>('/settings', {
          method: 'PUT',
          body: JSON.stringify(settings),
        }),
      {
        operationType: 'update_settings',
        dedupeKey: 'settings_default',
        payload: settings as Record<string, unknown>,
        optimisticResult: (uid) => ({
          success: true,
          settings: { userId: uid, ...settings } as UserSettings,
        }),
      }
    ),

  reseed: () =>
    withPrimaryWrite(
      async (uid) => {
        offlineOutbox.clear(uid);
        await firestoreService.reseedWorkspace(uid);
        return { success: true, message: 'Cloud workspace reset cleanly' };
      },
      () => request<{ success: boolean; message: string }>('/reseed', { method: 'POST' })
    ),

  clearWorkspace: () =>
    withPrimaryWrite(
      async (uid) => {
        offlineOutbox.clear(uid);
        await firestoreService.reseedWorkspace(uid);
        return { success: true, message: 'Workspace cleared cleanly' };
      },
      () => request<{ success: boolean; message: string }>('/workspace/clear', { method: 'POST' })
    ),

  // Unified Dashboard
  getDashboard: () =>
    withPrimaryRead(
      (uid) => firestoreService.getDashboard(uid),
      () => request<DashboardData>('/dashboard')
    ),

  // Focus & Pomodoro
  getFocusSessions: () =>
    withPrimaryRead(
      (uid) => firestoreService.getFocusSessions(uid),
      () => request<FocusSession[]>('/focus/sessions')
    ),

  getFocusSessionsPage: (pageSize = 50, cursor?: string | null) =>
    withPrimaryRead(
      (uid) => firestoreService.getFocusSessionsPage(uid, pageSize, cursor),
      async () => {
        const all = await request<FocusSession[]>('/focus/sessions');
        const filtered = cursor ? all.filter((s) => s.startedAt < cursor) : all;
        const items = filtered.slice(0, pageSize);
        return {
          items,
          nextCursor: filtered.length > pageSize ? items[items.length - 1]?.startedAt || null : null,
          hasMore: filtered.length > pageSize,
        } satisfies CursorPage<FocusSession>;
      }
    ),

  createFocusSession: (session: Partial<FocusSession>) => {
    const clientId = session.id || `foc_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
    const withId = { ...session, id: clientId };
    return withPrimaryWrite(
      (uid) => firestoreService.createFocusSession(uid, withId),
      () =>
        request<FocusSession>('/focus/sessions', {
          method: 'POST',
          body: JSON.stringify(withId),
        }),
      {
        operationType: 'create_focus_session',
        dedupeKey: `foc_${clientId}`,
        payload: withId as Record<string, unknown>,
        optimisticResult: (uid) => ({
          id: clientId,
          userId: uid,
          taskId: session.taskId || null,
          taskTitle: session.taskTitle,
          mode: session.mode || 'work',
          durationMinutes: session.durationMinutes || 25,
          durationSeconds: session.durationSeconds || 1500,
          completed: session.completed !== false,
          startedAt: session.startedAt || new Date().toISOString(),
          endedAt: session.endedAt || new Date().toISOString(),
        }),
      }
    );
  },

  getFocusStats: () =>
    withPrimaryRead(
      (uid) => firestoreService.getFocusStats(uid),
      () => request<FocusStatsData>('/focus/stats')
    ),

  // Tasks
  getTasks: () =>
    withPrimaryRead(
      (uid) => firestoreService.getTasks(uid),
      () => request<Task[]>('/tasks')
    ),

  createTask: (task: Partial<Task>) => {
    const clientId = task.id || `tsk_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
    const withId = { ...task, id: clientId };
    return withPrimaryWrite(
      (uid) => firestoreService.createTask(uid, withId),
      () =>
        request<Task>('/tasks', {
          method: 'POST',
          body: JSON.stringify(withId),
        }),
      {
        operationType: 'create_task',
        dedupeKey: `tsk_${clientId}`,
        payload: withId as Record<string, unknown>,
        optimisticResult: (uid) => {
          const now = new Date().toISOString();
          return {
            id: clientId,
            userId: uid,
            title: (task.title || 'New Task').trim(),
            description: task.description || '',
            priority: task.priority || 'medium',
            status: task.status || 'todo',
            category: task.category || 'General',
            subtasks: task.subtasks || [],
            recurrence: task.recurrence || 'none',
            order: task.order || 0,
            estimatedPomodoros: task.estimatedPomodoros || 1,
            completedPomodoros: 0,
            dueDate: task.dueDate || null,
            completedAt: null,
            deletedAt: null,
            createdAt: now,
            updatedAt: now,
          };
        },
      }
    );
  },

  updateTask: (id: string, task: Partial<Task>) =>
    withPrimaryWrite(
      (uid) => firestoreService.updateTask(uid, id, task),
      () =>
        request<Task>(`/tasks/${encodeURIComponent(id)}`, {
          method: 'PUT',
          body: JSON.stringify(task),
        }),
      {
        operationType: 'update_task',
        dedupeKey: `update_tsk_${id}`,
        payload: { id, updates: task },
        optimisticResult: (uid) => ({ id, userId: uid, ...task } as Task),
      }
    ),

  deleteTask: (id: string) =>
    withPrimaryWrite(
      async (uid) => {
        await firestoreService.deleteTask(uid, id);
        return { success: true };
      },
      () =>
        request<{ success: boolean }>(`/tasks/${encodeURIComponent(id)}`, {
          method: 'DELETE',
        }),
      {
        operationType: 'delete_task',
        dedupeKey: `delete_tsk_${id}`,
        payload: { id },
        optimisticResult: () => ({ success: true }),
      }
    ),

  // Categories
  getCategories: () =>
    withPrimaryRead(
      (uid) => firestoreService.getCategories(uid),
      () => request<ExpenseCategory[]>('/finance/categories')
    ),

  createCategory: (cat: Partial<ExpenseCategory>) =>
    withPrimaryWrite(
      (uid) => firestoreService.createCategory(uid, cat),
      () =>
        request<ExpenseCategory>('/finance/categories', {
          method: 'POST',
          body: JSON.stringify(cat),
        })
    ),

  // Finance Summary
  getFinanceSummary: (filter: string = 'this_month', startDate?: string, endDate?: string) =>
    withPrimaryRead(
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
    withPrimaryRead(
      (uid) => firestoreService.getIncomes(uid),
      () => request<IncomeTransaction[]>('/finance/income')
    ),

  getIncomesPage: (pageSize = 25, cursor?: string | null) =>
    withPrimaryRead(
      (uid) => firestoreService.getIncomesPage(uid, pageSize, cursor),
      async () => {
        const all = await request<IncomeTransaction[]>('/finance/income');
        const filtered = cursor ? all.filter((i) => i.date < cursor) : all;
        const items = filtered.slice(0, pageSize);
        return {
          items,
          nextCursor: filtered.length > pageSize ? items[items.length - 1]?.date || null : null,
          hasMore: filtered.length > pageSize,
        } satisfies CursorPage<IncomeTransaction>;
      }
    ),

  createIncome: (data: Partial<IncomeTransaction>) => {
    const clientId = data.id || `inc_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
    const withId = { ...data, id: clientId };
    return withPrimaryWrite<IncomeTransaction>(
      (uid) => firestoreService.createIncome(uid, withId),
      () =>
        request<IncomeTransaction>('/finance/income', {
          method: 'POST',
          body: JSON.stringify(withId),
        }),
      {
        operationType: 'create_income',
        dedupeKey: `inc_${clientId}`,
        payload: withId as Record<string, unknown>,
        optimisticResult: (uid) => ({
          id: clientId,
          userId: uid,
          source: data.source || '',
          amountPaise: Number(data.amountPaise) || 0,
          date: data.date || new Date().toISOString().split('T')[0],
          category: data.category || 'Salary',
          notes: data.notes || '',
          createdAt: new Date().toISOString(),
        }),
      }
    );
  },

  updateIncome: (id: string, data: Partial<IncomeTransaction>) =>
    withPrimaryWrite(
      (uid) => firestoreService.updateIncome(uid, id, data),
      () =>
        request<IncomeTransaction>(`/finance/income/${encodeURIComponent(id)}`, {
          method: 'PUT',
          body: JSON.stringify(data),
        }),
      {
        operationType: 'update_income',
        dedupeKey: `update_inc_${id}`,
        payload: { id, updates: data },
        optimisticResult: (uid) => ({ id, userId: uid, ...data } as IncomeTransaction),
      }
    ),

  deleteIncome: (id: string) =>
    withPrimaryWrite(
      async (uid) => {
        await firestoreService.deleteIncome(uid, id);
        return { success: true };
      },
      () =>
        request<{ success: boolean }>(`/finance/income/${encodeURIComponent(id)}`, {
          method: 'DELETE',
        }),
      {
        operationType: 'delete_income',
        dedupeKey: `delete_inc_${id}`,
        payload: { id },
        optimisticResult: () => ({ success: true }),
      }
    ),

  // Expenses (Variable and All)
  getExpenses: (type?: 'fixed' | 'variable') =>
    withPrimaryRead(
      (uid) => firestoreService.getExpenses(uid, type),
      () => {
        const q = type ? `?type=${encodeURIComponent(type)}` : '';
        return request<ExpenseTransaction[]>(`/finance/expenses${q}`);
      }
    ),

  getExpensesPage: (pageSize = 25, cursor?: string | null, type?: 'fixed' | 'variable') =>
    withPrimaryRead(
      (uid) => firestoreService.getExpensesPage(uid, pageSize, cursor, type),
      async () => {
        const q = type ? `?type=${encodeURIComponent(type)}` : '';
        const all = await request<ExpenseTransaction[]>(`/finance/expenses${q}`);
        const filtered = cursor ? all.filter((e) => e.date < cursor) : all;
        const items = filtered.slice(0, pageSize);
        return {
          items,
          nextCursor: filtered.length > pageSize ? items[items.length - 1]?.date || null : null,
          hasMore: filtered.length > pageSize,
        } satisfies CursorPage<ExpenseTransaction>;
      }
    ),

  createExpense: (data: Partial<ExpenseTransaction>) => {
    const clientId = data.id || `exp_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
    const withId = { ...data, id: clientId };
    return withPrimaryWrite<ExpenseTransaction>(
      (uid) => firestoreService.createExpense(uid, withId),
      () =>
        request<ExpenseTransaction>('/finance/expenses', {
          method: 'POST',
          body: JSON.stringify(withId),
        }),
      {
        operationType: 'create_expense',
        dedupeKey: `exp_${clientId}`,
        payload: withId as Record<string, unknown>,
        optimisticResult: (uid) => ({
          id: clientId,
          userId: uid,
          billId: data.billId || null,
          type: data.type === 'fixed' ? 'fixed' : 'variable',
          categoryId: data.categoryId || 'cat_1',
          categoryName: data.categoryName,
          amountPaise: Number(data.amountPaise) || 0,
          date: data.date || new Date().toISOString().split('T')[0],
          description: data.description || '',
          paymentMethod: data.paymentMethod || 'upi_bank',
          notes: data.notes || '',
          createdAt: new Date().toISOString(),
        }),
      }
    );
  },

  updateExpense: (id: string, data: Partial<ExpenseTransaction>) =>
    withPrimaryWrite(
      (uid) => firestoreService.updateExpense(uid, id, data),
      () =>
        request<ExpenseTransaction>(`/finance/expenses/${encodeURIComponent(id)}`, {
          method: 'PUT',
          body: JSON.stringify(data),
        }),
      {
        operationType: 'update_expense',
        dedupeKey: `update_exp_${id}`,
        payload: { id, updates: data },
        optimisticResult: (uid) => ({ id, userId: uid, ...data } as ExpenseTransaction),
      }
    ),

  deleteExpense: (id: string) =>
    withPrimaryWrite(
      async (uid) => {
        await firestoreService.deleteExpense(uid, id);
        return { success: true };
      },
      () =>
        request<{ success: boolean }>(`/finance/expenses/${encodeURIComponent(id)}`, {
          method: 'DELETE',
        }),
      {
        operationType: 'delete_expense',
        dedupeKey: `delete_exp_${id}`,
        payload: { id },
        optimisticResult: () => ({ success: true }),
      }
    ),

  // Recurring Expenses (Fixed)
  getRecurringExpenses: () =>
    withPrimaryRead(
      (uid) => firestoreService.getRecurringExpenses(uid),
      () => request<RecurringExpense[]>('/finance/recurring')
    ),

  createRecurringExpense: (data: Partial<RecurringExpense>) => {
    const clientId = data.id || `rec_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
    const withId = { ...data, id: clientId };
    return withPrimaryWrite<RecurringExpense>(
      (uid) => firestoreService.createRecurringExpense(uid, withId),
      () =>
        request<RecurringExpense>('/finance/recurring', {
          method: 'POST',
          body: JSON.stringify(withId),
        }),
      {
        operationType: 'create_recurring',
        dedupeKey: `rec_${clientId}`,
        payload: withId as Record<string, unknown>,
        optimisticResult: (uid) => {
          const now = new Date().toISOString();
          return {
            id: clientId,
            userId: uid,
            name: data.name || '',
            amountPaise: Number(data.amountPaise) || 0,
            categoryId: data.categoryId || 'cat_1',
            categoryName: data.categoryName,
            recurrence: data.recurrence || 'monthly',
            dueDay: data.dueDay || 1,
            isActive: true,
            notes: data.notes || '',
            createdAt: now,
            updatedAt: now,
          };
        },
      }
    );
  },

  updateRecurringExpense: (id: string, data: Partial<RecurringExpense>) =>
    withPrimaryWrite(
      (uid) => firestoreService.updateRecurringExpense(uid, id, data),
      () =>
        request<RecurringExpense>(`/finance/recurring/${encodeURIComponent(id)}`, {
          method: 'PUT',
          body: JSON.stringify(data),
        }),
      {
        operationType: 'update_recurring',
        dedupeKey: `update_rec_${id}`,
        payload: { id, updates: data },
        optimisticResult: (uid) => ({ id, userId: uid, ...data } as RecurringExpense),
      }
    ),

  deleteRecurringExpense: (id: string) =>
    withPrimaryWrite(
      async (uid) => {
        await firestoreService.deleteRecurringExpense(uid, id);
        return { success: true };
      },
      () =>
        request<{ success: boolean }>(`/finance/recurring/${encodeURIComponent(id)}`, {
          method: 'DELETE',
        }),
      {
        operationType: 'delete_recurring',
        dedupeKey: `delete_rec_${id}`,
        payload: { id },
        optimisticResult: () => ({ success: true }),
      }
    ),

  // Bills & Payment Tracker
  getBills: (status?: string) =>
    withPrimaryRead(
      (uid) => firestoreService.getBills(uid, status),
      () => {
        const q = status ? `?status=${encodeURIComponent(status)}` : '';
        return request<Bill[]>(`/finance/bills${q}`);
      }
    ),

  createBill: (data: Partial<Bill>) => {
    const clientId = data.id || `bill_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
    const withId = { ...data, id: clientId };
    return withPrimaryWrite<Bill>(
      (uid) => firestoreService.createBill(uid, withId),
      () =>
        request<Bill>('/finance/bills', {
          method: 'POST',
          body: JSON.stringify(withId),
        }),
      {
        operationType: 'create_bill',
        dedupeKey: `bill_${clientId}`,
        payload: withId as Record<string, unknown>,
        optimisticResult: (uid): Bill => {
          const now = new Date().toISOString();
          return {
            id: clientId,
            userId: uid,
            recurringExpenseId: null,
            name: data.name || '',
            amountPaise: Number(data.amountPaise) || 0,
            categoryId: data.categoryId || 'cat_1',
            categoryName: data.categoryName,
            dueDate: data.dueDate || now.slice(0, 10),
            status: 'UNPAID',
            paymentDate: null,
            notes: data.notes || '',
            periodKey: (data.dueDate || now.slice(0, 10)).slice(0, 7),
            createdAt: now,
            updatedAt: now,
          };
        },
      }
    );
  },

  payBill: (
    id: string,
    paidDate?: string,
    paymentMethod?: string,
    notes?: string,
    idempotencyKey?: string
  ) => {
    const effectiveKey = idempotencyKey || `pay_${id}_${Date.now().toString(36)}`;
    return withPrimaryWrite(
      (uid) =>
        firestoreService.payBill(
          uid,
          id,
          paidDate,
          (paymentMethod as PaymentHistory['paymentMethod']) || 'upi_bank',
          notes,
          effectiveKey
        ),
      () =>
        request<{ success: boolean; bill: Bill }>(`/finance/bills/${encodeURIComponent(id)}/pay`, {
          method: 'POST',
          body: JSON.stringify({ paidDate, paymentMethod, notes, idempotencyKey: effectiveKey }),
        }),
      {
        operationType: 'pay_bill',
        dedupeKey: `pay_bill_${id}`,
        payload: { id, paidDate, paymentMethod, notes, idempotencyKey: effectiveKey },
        optimisticResult: () => ({
          success: true,
          bill: { id, status: 'PAID', paymentDate: paidDate || new Date().toISOString().slice(0, 10) } as Bill,
        }),
      }
    );
  },

  undoBillPayment: (id: string) =>
    withPrimaryWrite(
      (uid) => firestoreService.undoBillPayment(uid, id),
      () =>
        request<{ success: boolean; bill: Bill }>(
          `/finance/bills/${encodeURIComponent(id)}/undo`,
          {
            method: 'POST',
          }
        ),
      {
        operationType: 'undo_bill_payment',
        dedupeKey: `undo_bill_${id}`,
        payload: { id },
        optimisticResult: () => ({
          success: true,
          bill: { id, status: 'UNPAID', paymentDate: null } as Bill,
        }),
      }
    ),

  deleteBill: (id: string) =>
    withPrimaryWrite(
      async (uid) => {
        await firestoreService.deleteBill(uid, id);
        return { success: true };
      },
      () =>
        request<{ success: boolean }>(`/finance/bills/${encodeURIComponent(id)}`, {
          method: 'DELETE',
        }),
      {
        operationType: 'delete_bill',
        dedupeKey: `delete_bill_${id}`,
        payload: { id },
        optimisticResult: () => ({ success: true }),
      }
    ),

  getPaymentHistory: () =>
    withPrimaryRead(
      (uid) => firestoreService.getPaymentHistory(uid),
      () => request<PaymentHistory[]>('/finance/payments-history')
    ),

  // Savings Goals
  getSavingsGoals: () =>
    withPrimaryRead(
      (uid) => firestoreService.getSavingsGoals(uid),
      () => request<SavingsGoal[]>('/finance/savings-goals')
    ),

  createSavingsGoal: (data: Partial<SavingsGoal>) =>
    withPrimaryWrite(
      (uid) => firestoreService.createSavingsGoal(uid, data),
      () =>
        request<SavingsGoal>('/finance/savings-goals', {
          method: 'POST',
          body: JSON.stringify(data),
        }),
      {
        operationType: 'create_savings_goal',
        dedupeKey: `create_goal_${data.title || Date.now()}`,
        payload: data as Record<string, unknown>,
        optimisticResult: (uid) => {
          const now = new Date().toISOString();
          return {
            id: `svg_${Date.now()}`,
            userId: uid,
            title: data.title || 'Savings Goal',
            targetPaise: Number(data.targetPaise) || 0,
            savedPaise: Number(data.savedPaise) || 0,
            targetDate: data.targetDate || null,
            color: data.color || '#10b981',
            createdAt: now,
            updatedAt: now,
          };
        },
      }
    ),

  updateSavingsGoal: (id: string, data: Partial<SavingsGoal>) =>
    withPrimaryWrite(
      (uid) => firestoreService.updateSavingsGoal(uid, id, data),
      () =>
        request<SavingsGoal>(`/finance/savings-goals/${encodeURIComponent(id)}`, {
          method: 'PUT',
          body: JSON.stringify(data),
        }),
      {
        operationType: 'update_savings_goal',
        dedupeKey: `update_goal_${id}`,
        payload: { id, updates: data },
        optimisticResult: (uid) => ({ id, userId: uid, ...data } as SavingsGoal),
      }
    ),

  contributeSavingsGoal: (id: string, deltaPaise: number) =>
    withPrimaryWrite(
      (uid) => firestoreService.contributeSavingsGoal(uid, id, deltaPaise),
      () =>
        request<SavingsGoal>(`/finance/savings-goals/${encodeURIComponent(id)}/contribute`, {
          method: 'POST',
          body: JSON.stringify({ deltaPaise }),
        }),
      {
        operationType: 'contribute_savings_goal',
        dedupeKey: `contrib_goal_${id}_${Date.now()}`,
        payload: { id, deltaPaise },
        optimisticResult: () => ({ id } as SavingsGoal),
      }
    ),

  deleteSavingsGoal: (id: string) =>
    withPrimaryWrite(
      async (uid) => {
        await firestoreService.deleteSavingsGoal(uid, id);
        return { success: true };
      },
      () =>
        request<{ success: boolean }>(`/finance/savings-goals/${encodeURIComponent(id)}`, {
          method: 'DELETE',
        }),
      {
        operationType: 'delete_savings_goal',
        dedupeKey: `delete_goal_${id}`,
        payload: { id },
        optimisticResult: () => ({ success: true }),
      }
    ),

  // Trash & Restore
  getTrash: () =>
    withPrimaryRead(
      (uid) => firestoreService.getTrashItems(uid),
      () => request<TrashRecord[]>('/trash')
    ),

  restoreTrashItem: (entityType: TrashRecord['entityType'], id: string) =>
    withPrimaryWrite(
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
    withPrimaryWrite(
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
    withPrimaryRead(
      (uid) => firestoreService.getTimeBlocks(uid, date),
      () => request<TimeBlock[]>(`/time-blocks${date ? `?date=${encodeURIComponent(date)}` : ''}`)
    ),

  createTimeBlock: (block: Partial<TimeBlock>) => {
    const clientId = block.id || `tb_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
    const withId = { ...block, id: clientId };
    return withPrimaryWrite(
      (uid) => firestoreService.saveTimeBlock(uid, withId),
      () =>
        request<TimeBlock>('/time-blocks', {
          method: 'POST',
          body: JSON.stringify(withId),
        }),
      {
        operationType: 'save_time_block',
        dedupeKey: `tb_${clientId}`,
        payload: withId as Record<string, unknown>,
        optimisticResult: (uid) => ({ ...withId, id: clientId, userId: uid } as TimeBlock),
      }
    );
  },

  updateTimeBlock: (id: string, block: Partial<TimeBlock>) =>
    withPrimaryWrite(
      (uid) => firestoreService.saveTimeBlock(uid, { ...block, id }),
      () =>
        request<TimeBlock>(`/time-blocks/${encodeURIComponent(id)}`, {
          method: 'PUT',
          body: JSON.stringify(block),
        }),
      {
        operationType: 'save_time_block',
        dedupeKey: `tb_${id}`,
        payload: { ...block, id },
        optimisticResult: (uid) => ({ id, userId: uid, ...block } as TimeBlock),
      }
    ),

  deleteTimeBlock: (id: string) =>
    withPrimaryWrite(
      async (uid) => {
        await firestoreService.deleteTimeBlock(uid, id);
        return { success: true };
      },
      () =>
        request<{ success: boolean }>(`/time-blocks/${encodeURIComponent(id)}`, {
          method: 'DELETE',
        }),
      {
        operationType: 'delete_time_block',
        dedupeKey: `delete_tb_${id}`,
        payload: { id },
        optimisticResult: () => ({ success: true }),
      }
    ),

  // Envelope Budgeting
  getEnvelopes: (monthKey?: string) =>
    withPrimaryRead(
      (uid) => firestoreService.getEnvelopes(uid, monthKey),
      () =>
        request<BudgetEnvelope[]>(
          `/envelopes${monthKey ? `?monthKey=${encodeURIComponent(monthKey)}` : ''}`
        )
    ),

  createEnvelope: (env: Partial<BudgetEnvelope>) => {
    const clientId = env.id || `env_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
    const withId = { ...env, id: clientId };
    return withPrimaryWrite(
      (uid) => firestoreService.saveEnvelope(uid, withId),
      () =>
        request<BudgetEnvelope>('/envelopes', {
          method: 'POST',
          body: JSON.stringify(withId),
        }),
      {
        operationType: 'save_envelope',
        dedupeKey: `env_${clientId}`,
        payload: withId as Record<string, unknown>,
        optimisticResult: (uid) => ({ ...withId, id: clientId, userId: uid } as BudgetEnvelope),
      }
    );
  },

  updateEnvelope: (id: string, env: Partial<BudgetEnvelope>) =>
    withPrimaryWrite(
      (uid) => firestoreService.saveEnvelope(uid, { ...env, id }),
      () =>
        request<BudgetEnvelope>(`/envelopes/${encodeURIComponent(id)}`, {
          method: 'PUT',
          body: JSON.stringify(env),
        }),
      {
        operationType: 'save_envelope',
        dedupeKey: `env_${id}`,
        payload: { ...env, id },
        optimisticResult: (uid) => ({ id, userId: uid, ...env } as BudgetEnvelope),
      }
    ),

  deleteEnvelope: (id: string) =>
    withPrimaryWrite(
      async (uid) => {
        await firestoreService.deleteEnvelope(uid, id);
        return { success: true };
      },
      () =>
        request<{ success: boolean }>(`/envelopes/${encodeURIComponent(id)}`, {
          method: 'DELETE',
        }),
      {
        operationType: 'delete_envelope',
        dedupeKey: `delete_env_${id}`,
        payload: { id },
        optimisticResult: () => ({ success: true }),
      }
    ),

  transferEnvelopeFunds: (fromId: string, toId: string, amountPaise: number) =>
    withPrimaryWrite(
      (uid) => firestoreService.transferEnvelopeFunds(uid, fromId, toId, amountPaise),
      () =>
        request<{ success: boolean }>('/envelopes/transfer', {
          method: 'POST',
          body: JSON.stringify({ fromId, toId, amountPaise }),
        })
    ),

  // Subscriptions
  getSubscriptions: () =>
    withPrimaryRead(
      (uid) => firestoreService.getSubscriptions(uid),
      () => request<SubscriptionPlan[]>('/subscriptions')
    ),

  createSubscription: (sub: Partial<SubscriptionPlan>) => {
    const clientId = sub.id || `sub_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
    const withId = { ...sub, id: clientId };
    return withPrimaryWrite(
      (uid) => firestoreService.saveSubscription(uid, withId),
      () =>
        request<SubscriptionPlan>('/subscriptions', {
          method: 'POST',
          body: JSON.stringify(withId),
        }),
      {
        operationType: 'save_subscription',
        dedupeKey: `sub_${clientId}`,
        payload: withId as Record<string, unknown>,
        optimisticResult: (uid) => ({ ...withId, id: clientId, userId: uid } as SubscriptionPlan),
      }
    );
  },

  updateSubscription: (id: string, sub: Partial<SubscriptionPlan>) =>
    withPrimaryWrite(
      (uid) => firestoreService.saveSubscription(uid, { ...sub, id }),
      () =>
        request<SubscriptionPlan>(`/subscriptions/${encodeURIComponent(id)}`, {
          method: 'PUT',
          body: JSON.stringify(sub),
        }),
      {
        operationType: 'save_subscription',
        dedupeKey: `sub_${id}`,
        payload: { ...sub, id },
        optimisticResult: (uid) => ({ id, userId: uid, ...sub } as SubscriptionPlan),
      }
    ),

  deleteSubscription: (id: string) =>
    withPrimaryWrite(
      async (uid) => {
        await firestoreService.deleteSubscription(uid, id);
        return { success: true };
      },
      () =>
        request<{ success: boolean }>(`/subscriptions/${encodeURIComponent(id)}`, {
          method: 'DELETE',
        }),
      {
        operationType: 'delete_subscription',
        dedupeKey: `delete_sub_${id}`,
        payload: { id },
        optimisticResult: () => ({ success: true }),
      }
    ),

  // Audit Logs
  getAuditLogs: (limit = 100) =>
    withPrimaryRead(
      (uid) => firestoreService.getAuditLogs(uid, limit),
      () => request<AuditLogEntry[]>(`/audit-logs?limit=${limit}`)
    ),

  getAuditLogsPage: (pageSize = 25, cursorTimestamp?: string | null) =>
    withPrimaryRead(
      (uid) => firestoreService.getAuditLogsPage(uid, pageSize, cursorTimestamp),
      async () => {
        const all = await request<AuditLogEntry[]>('/audit-logs?limit=200');
        const filtered = cursorTimestamp
          ? all.filter((l) => l.timestamp < cursorTimestamp)
          : all;
        const items = filtered.slice(0, pageSize);
        return {
          items,
          nextCursor: filtered.length > pageSize ? items[items.length - 1]?.timestamp || null : null,
          hasMore: filtered.length > pageSize,
        } satisfies CursorPage<AuditLogEntry>;
      }
    ),

  // Durable Sync Queue
  getSyncQueue: () =>
    withPrimaryRead(
      (uid) => firestoreService.getDurableSyncQueue(uid),
      () => request<DurableSyncOperation[]>('/sync/queue')
    ),

  enqueueSync: (
    op: Omit<DurableSyncOperation, 'id' | 'userId' | 'status' | 'attempts' | 'createdAt'>
  ) =>
    withPrimaryWrite(
      (uid) => firestoreService.enqueueDurableSync(uid, op),
      () =>
        request<DurableSyncOperation>('/sync/queue/enqueue', {
          method: 'POST',
          body: JSON.stringify(op),
        })
    ),

  updateSyncOpStatus: (id: string, updates: Partial<DurableSyncOperation>) =>
    withPrimaryWrite(
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

  // Backend-Controlled Google Sheets Worker Routes
  sheetsVerify: (spreadsheetId: string, googleAccessToken: string) =>
    request<{ spreadsheetId: string; title: string; sheetsCount: number }>('/sheets/verify', {
      method: 'POST',
      headers: { 'x-google-access-token': googleAccessToken },
      body: JSON.stringify({ spreadsheetId }),
    }),

  sheetsCreateWorkbook: (googleAccessToken: string) =>
    request<{ spreadsheetId: string }>('/sheets/create-workbook', {
      method: 'POST',
      headers: { 'x-google-access-token': googleAccessToken },
      body: JSON.stringify({}),
    }),

  sheetsSync: (spreadsheetId: string, googleAccessToken: string, data: SheetsSnapshotPayload) =>
    request<{ success: boolean; updatedRangesCount: number; verifiedTitle?: string }>('/sheets/sync', {
      method: 'POST',
      headers: { 'x-google-access-token': googleAccessToken },
      body: JSON.stringify({ spreadsheetId, data }),
    }),

  sheetsApplyFormatting: (
    spreadsheetId: string,
    googleAccessToken: string,
    includeAutoResize = true
  ) =>
    request<{ success: boolean }>('/sheets/apply-formatting', {
      method: 'POST',
      headers: { 'x-google-access-token': googleAccessToken },
      body: JSON.stringify({ spreadsheetId, includeAutoResize }),
    }),

  sheetsHistoricalResync: (
    spreadsheetId: string,
    googleAccessToken: string,
    data: SheetsSnapshotPayload,
    confirmed: boolean
  ) =>
    request<{ success: boolean; clearedRangesCount: number; updatedRangesCount: number }>(
      '/sheets/historical-resync',
      {
        method: 'POST',
        headers: { 'x-google-access-token': googleAccessToken },
        body: JSON.stringify({ spreadsheetId, data, confirmed }),
      }
    ),

  sheetsFlushQueue: (
    spreadsheetId: string,
    googleAccessToken: string,
    operations: DurableSyncOperation[]
  ) =>
    request<{
      processed: number;
      skippedDuplicates: number;
      failed: number;
      results: Array<{
        id: string;
        status: 'completed' | 'pending' | 'failed';
        attempts: number;
        nextRetryAt?: number | null;
        errorMessage?: string | null;
        skippedDuplicate?: boolean;
      }>;
    }>('/sheets/flush-queue', {
      method: 'POST',
      headers: { 'x-google-access-token': googleAccessToken },
      body: JSON.stringify({ spreadsheetId, operations }),
    }),

  // Backups & Data Recovery
  exportBackup: () =>
    withPrimaryRead(
      async (uid) => {
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
    withPrimaryWrite(
      async (uid) => {
        const payload = (data && typeof data === 'object' ? data : {}) as Record<string, unknown>;
        const counts: Record<string, number> = {};

        if (Array.isArray(payload.tasks)) {
          await Promise.all(
            payload.tasks
              .filter((t): t is Task => Boolean(t && typeof t === 'object' && 'id' in t))
              .map((t) => firestoreService.saveTask(uid, { ...t, userId: uid }))
          );
          counts.tasks = payload.tasks.length;
        }
        if (Array.isArray(payload.incomeTransactions)) {
          await Promise.all(
            payload.incomeTransactions
              .filter((i): i is IncomeTransaction => Boolean(i && typeof i === 'object' && 'id' in i))
              .map((i) => firestoreService.saveIncome(uid, { ...i, userId: uid }))
          );
          counts.incomeTransactions = payload.incomeTransactions.length;
        }
        if (Array.isArray(payload.expenseTransactions)) {
          await Promise.all(
            payload.expenseTransactions
              .filter((e): e is ExpenseTransaction => Boolean(e && typeof e === 'object' && 'id' in e))
              .map((e) => firestoreService.saveExpense(uid, { ...e, userId: uid }))
          );
          counts.expenseTransactions = payload.expenseTransactions.length;
        }
        if (Array.isArray(payload.bills)) {
          await Promise.all(
            payload.bills
              .filter((b): b is Bill => Boolean(b && typeof b === 'object' && 'id' in b))
              .map((b) => firestoreService.saveBill(uid, { ...b, userId: uid }))
          );
          counts.bills = payload.bills.length;
        }
        if (Array.isArray(payload.timeBlocks)) {
          await Promise.all(
            payload.timeBlocks
              .filter((tb): tb is TimeBlock => Boolean(tb && typeof tb === 'object' && 'id' in tb))
              .map((tb) => firestoreService.saveTimeBlock(uid, { ...tb, userId: uid }))
          );
          counts.timeBlocks = payload.timeBlocks.length;
        }
        if (Array.isArray(payload.envelopes)) {
          await Promise.all(
            payload.envelopes
              .filter((env): env is BudgetEnvelope => Boolean(env && typeof env === 'object' && 'id' in env))
              .map((env) => firestoreService.saveEnvelope(uid, { ...env, userId: uid }))
          );
          counts.envelopes = payload.envelopes.length;
        }
        if (Array.isArray(payload.subscriptions)) {
          await Promise.all(
            payload.subscriptions
              .filter((s): s is SubscriptionPlan => Boolean(s && typeof s === 'object' && 'id' in s))
              .map((s) => firestoreService.saveSubscription(uid, { ...s, userId: uid }))
          );
          counts.subscriptions = payload.subscriptions.length;
        }
        if (Array.isArray(payload.savingsGoals)) {
          await firestoreService.saveSavingsGoalsList(
            uid,
            payload.savingsGoals.map((g: SavingsGoal) => ({ ...g, userId: uid }))
          );
          counts.savingsGoals = payload.savingsGoals.length;
        }

        await firestoreService.recordAuditLog(uid, {
          action: 'backup_restore',
          entityType: 'backup',
          entityId: `rst_${Date.now()}`,
          entityTitle: 'Cloud Backup Restore',
          details: `Restored to Firestore: ${JSON.stringify(counts)}`,
        });

        return { success: true, counts };
      },
      () =>
        request<{ success: boolean; counts: Record<string, number> }>('/backup/restore', {
          method: 'POST',
          body: JSON.stringify(data),
        })
    ),
};

void auth;
