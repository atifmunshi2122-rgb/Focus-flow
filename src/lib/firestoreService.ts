import {
  collection,
  doc,
  getDoc,
  getDocs,
  setDoc,
  deleteDoc,
  onSnapshot,
  Unsubscribe,
} from 'firebase/firestore';
import type { User as FirebaseUser } from 'firebase/auth';
import { db, handleFirestoreError, OperationType } from './firebase.ts';
import {
  User,
  Task,
  FocusSession,
  IncomeTransaction,
  ExpenseTransaction,
  RecurringExpense,
  Bill,
  PaymentHistory,
  UserSettings,
  ExpenseCategory,
  DashboardData,
  FinanceSummaryData,
  FocusStatsData,
} from '../types/index.ts';

const DEFAULT_CATEGORY_TEMPLATES: Omit<ExpenseCategory, 'id' | 'userId'>[] = [
  { name: 'Housing & Rent', type: 'fixed', icon: 'Home', color: '#6366f1' },
  { name: 'Internet & Utilities', type: 'fixed', icon: 'Wifi', color: '#0ea5e9' },
  { name: 'Subscriptions', type: 'fixed', icon: 'Tv', color: '#8b5cf6' },
  { name: 'Insurance & Healthcare', type: 'fixed', icon: 'Shield', color: '#ec4899' },
  { name: 'Education & Fees', type: 'fixed', icon: 'GraduationCap', color: '#f59e0b' },
  { name: 'Food & Dining', type: 'variable', icon: 'Utensils', color: '#10b981' },
  { name: 'Groceries', type: 'variable', icon: 'ShoppingBag', color: '#14b8a6' },
  { name: 'Transportation & Fuel', type: 'variable', icon: 'Car', color: '#f97316' },
  { name: 'Shopping & Retail', type: 'variable', icon: 'ShoppingBag', color: '#a855f7' },
  { name: 'Entertainment & Leisure', type: 'variable', icon: 'Film', color: '#06b6d4' },
  { name: 'Personal & Wellness', type: 'variable', icon: 'Heart', color: '#e11d48' },
  { name: 'Emergency & Miscellaneous', type: 'variable', icon: 'AlertCircle', color: '#64748b' },
];

function stripUndefined<T extends Record<string, unknown>>(obj: T): T {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(obj)) {
    if (v !== undefined) {
      out[k] = v;
    }
  }
  return out as T;
}

function defaultSettingsForUser(userId: string): UserSettings {
  return {
    userId,
    currency: 'INR',
    pomodoroWorkDuration: 25,
    shortBreakDuration: 5,
    longBreakDuration: 15,
    autoSwitchSessions: false,
    soundEnabled: true,
    theme: 'dark',
  };
}

function isIsoDate(val: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(val)) return false;
  const parsed = new Date(`${val}T00:00:00.000Z`);
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === val;
}

function calculateBoundedStreakDays(sessions: FocusSession[], referenceDate = new Date()): number {
  const completedDates = new Set<string>();
  for (const s of sessions) {
    if (!s || !s.completed || s.mode !== 'work' || typeof s.startedAt !== 'string') continue;
    const candidate = s.startedAt.slice(0, 10);
    if (isIsoDate(candidate)) {
      completedDates.add(candidate);
    }
  }
  if (completedDates.size === 0) return 0;

  const baseUtc = new Date(
    Date.UTC(referenceDate.getUTCFullYear(), referenceDate.getUTCMonth(), referenceDate.getUTCDate())
  );
  const fmt = (d: Date) => d.toISOString().slice(0, 10);
  const todayStr = fmt(baseUtc);
  const yest = new Date(baseUtc);
  yest.setUTCDate(yest.getUTCDate() - 1);
  const yesterdayStr = fmt(yest);

  let startOffset = -1;
  if (completedDates.has(todayStr)) startOffset = 0;
  else if (completedDates.has(yesterdayStr)) startOffset = 1;
  else return 0;

  let streak = 0;
  for (let i = 0; i < 365; i++) {
    const cursor = new Date(baseUtc);
    cursor.setUTCDate(cursor.getUTCDate() - (startOffset + i));
    if (completedDates.has(fmt(cursor))) streak++;
    else break;
  }
  return streak;
}

async function listSubcollection<T>(path: string): Promise<T[]> {
  try {
    const snap = await getDocs(collection(db, path));
    return snap.docs.map((d) => d.data() as T);
  } catch (err) {
    handleFirestoreError(err, OperationType.LIST, path);
  }
}

export const firestoreService = {
  // User Profile & Settings
  async getMe(fbUser: FirebaseUser): Promise<{ user: User; settings: UserSettings }> {
    const userId = fbUser.uid;
    const userPath = `users/${userId}`;
    const settingsPath = `users/${userId}/settings/default`;

    try {
      const [userSnap, settingsSnap] = await Promise.all([
        getDoc(doc(db, userPath)),
        getDoc(doc(db, settingsPath)),
      ]);

      let user: User;
      if (userSnap.exists()) {
        user = userSnap.data() as User;
      } else {
        user = {
          id: userId,
          email: fbUser.email || 'user@focusflow.app',
          name: fbUser.displayName || 'Focus User',
          avatarUrl: fbUser.photoURL || '',
          createdAt: new Date().toISOString(),
        };
        await setDoc(doc(db, userPath), stripUndefined({ ...user }), { merge: true });
      }

      let settings: UserSettings;
      if (settingsSnap.exists()) {
        settings = {
          ...defaultSettingsForUser(userId),
          ...(settingsSnap.data() as Partial<UserSettings>),
          userId,
        };
      } else {
        settings = defaultSettingsForUser(userId);
        await setDoc(doc(db, settingsPath), stripUndefined({ ...settings }), { merge: true });
      }

      return { user, settings };
    } catch (err) {
      handleFirestoreError(err, OperationType.GET, userPath);
    }
  },

  async saveSettings(userId: string, settings: Partial<UserSettings>): Promise<void> {
    const path = `users/${userId}/settings/default`;
    try {
      await setDoc(doc(db, path), stripUndefined({ ...settings }), { merge: true });
    } catch (err) {
      handleFirestoreError(err, OperationType.WRITE, path);
    }
  },

  async updateSettingsAndReturn(
    userId: string,
    partial: Partial<UserSettings>
  ): Promise<UserSettings> {
    const path = `users/${userId}/settings/default`;
    try {
      const sanitized: Partial<UserSettings> = { ...partial, userId };
      if (sanitized.pomodoroWorkDuration !== undefined) {
        const n = Number(sanitized.pomodoroWorkDuration);
        if (!Number.isFinite(n) || n < 1 || n > 180) {
          throw new Error('pomodoroWorkDuration must be between 1 and 180 minutes');
        }
        sanitized.pomodoroWorkDuration = Math.round(n);
      }
      if (sanitized.shortBreakDuration !== undefined) {
        const n = Number(sanitized.shortBreakDuration);
        if (!Number.isFinite(n) || n < 1 || n > 60) {
          throw new Error('shortBreakDuration must be between 1 and 60 minutes');
        }
        sanitized.shortBreakDuration = Math.round(n);
      }
      if (sanitized.longBreakDuration !== undefined) {
        const n = Number(sanitized.longBreakDuration);
        if (!Number.isFinite(n) || n < 1 || n > 120) {
          throw new Error('longBreakDuration must be between 1 and 120 minutes');
        }
        sanitized.longBreakDuration = Math.round(n);
      }

      await setDoc(doc(db, path), stripUndefined({ ...sanitized }), { merge: true });
      const snap = await getDoc(doc(db, path));
      return {
        ...defaultSettingsForUser(userId),
        ...(snap.exists() ? (snap.data() as Partial<UserSettings>) : sanitized),
        userId,
      };
    } catch (err) {
      handleFirestoreError(err, OperationType.WRITE, path);
    }
  },

  async getSettings(userId: string): Promise<Partial<UserSettings> | null> {
    const path = `users/${userId}/settings/default`;
    try {
      const defaultSnap = await getDoc(doc(db, path));
      if (defaultSnap.exists()) {
        return defaultSnap.data() as Partial<UserSettings>;
      }
      const snap = await getDocs(collection(db, `users/${userId}/settings`));
      const nonCat = snap.docs.find((d) => d.id !== 'categories');
      if (nonCat) {
        return nonCat.data() as Partial<UserSettings>;
      }
      return null;
    } catch (err) {
      handleFirestoreError(err, OperationType.GET, path);
    }
  },

  // Categories (stored under users/{uid}/settings/categories, covered by firestore.rules)
  async getCategories(userId: string): Promise<ExpenseCategory[]> {
    const path = `users/${userId}/settings/categories`;
    try {
      const snap = await getDoc(doc(db, path));
      if (snap.exists()) {
        const items = (snap.data() as { items?: ExpenseCategory[] }).items;
        if (Array.isArray(items) && items.length > 0) {
          return items;
        }
      }
      const initial: ExpenseCategory[] = DEFAULT_CATEGORY_TEMPLATES.map((tpl, idx) => ({
        id: `cat_${idx + 1}`,
        userId,
        ...tpl,
      }));
      await setDoc(doc(db, path), { items: initial }, { merge: true });
      return initial;
    } catch (err) {
      handleFirestoreError(err, OperationType.GET, path);
    }
  },

  async createCategory(userId: string, cat: Partial<ExpenseCategory>): Promise<ExpenseCategory> {
    const name = typeof cat.name === 'string' ? cat.name.trim() : '';
    if (!name) throw new Error('Category name is required');
    const existing = await this.getCategories(userId);
    const created: ExpenseCategory = {
      id: `cat_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
      userId,
      name,
      type: cat.type === 'fixed' || cat.type === 'variable' ? cat.type : 'both',
      icon: cat.icon || 'Tag',
      color: cat.color || '#6366f1',
    };
    const path = `users/${userId}/settings/categories`;
    try {
      await setDoc(doc(db, path), { items: [...existing, created] }, { merge: true });
      return created;
    } catch (err) {
      handleFirestoreError(err, OperationType.WRITE, path);
    }
  },

  // Focus Sessions
  async getFocusSessions(userId: string): Promise<FocusSession[]> {
    const list = await listSubcollection<FocusSession>(`users/${userId}/focus_sessions`);
    return list.sort((a, b) => b.startedAt.localeCompare(a.startedAt));
  },

  async saveFocusSession(userId: string, session: FocusSession): Promise<void> {
    const path = `users/${userId}/focus_sessions/${session.id}`;
    try {
      await setDoc(doc(db, path), stripUndefined({ ...session }), { merge: true });
    } catch (err) {
      handleFirestoreError(err, OperationType.WRITE, path);
    }
  },

  async createFocusSession(userId: string, input: Partial<FocusSession>): Promise<FocusSession> {
    const durationMinutes = Number(input.durationMinutes);
    const safeMinutes =
      Number.isFinite(durationMinutes) && durationMinutes >= 1 && durationMinutes <= 180
        ? Math.round(durationMinutes)
        : 25;
    const durationSeconds = Number(input.durationSeconds);
    const safeSeconds =
      Number.isFinite(durationSeconds) && durationSeconds >= 1
        ? Math.round(durationSeconds)
        : safeMinutes * 60;
    const mode =
      input.mode === 'short_break' || input.mode === 'long_break' ? input.mode : 'work';
    const completed = input.completed !== undefined ? Boolean(input.completed) : true;

    let taskTitle = input.taskTitle;
    if (input.taskId) {
      const taskPath = `users/${userId}/tasks/${input.taskId}`;
      try {
        const taskSnap = await getDoc(doc(db, taskPath));
        if (taskSnap.exists()) {
          const task = taskSnap.data() as Task;
          taskTitle = task.title;
          if (completed && mode === 'work') {
            await setDoc(
              doc(db, taskPath),
              {
                completedPomodoros: (task.completedPomodoros || 0) + 1,
                updatedAt: new Date().toISOString(),
              },
              { merge: true }
            );
          }
        }
      } catch {
        // non-fatal if linked task was removed
      }
    }

    const session: FocusSession = {
      id: `foc_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
      userId,
      taskId: input.taskId || null,
      ...(taskTitle ? { taskTitle } : {}),
      mode,
      durationMinutes: safeMinutes,
      durationSeconds: safeSeconds,
      completed,
      startedAt: input.startedAt || new Date().toISOString(),
      endedAt: input.endedAt || new Date().toISOString(),
    };

    await this.saveFocusSession(userId, session);
    return session;
  },

  async getFocusStats(userId: string): Promise<FocusStatsData> {
    const all = await this.getFocusSessions(userId);
    const sessions = all.filter((s) => s.completed);
    const dayNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
    const last7Days: FocusStatsData['last7Days'] = [];

    for (let i = 6; i >= 0; i--) {
      const d = new Date();
      d.setDate(d.getDate() - i);
      const dateStr = d.toISOString().split('T')[0];
      const dayName = dayNames[d.getDay()];
      const daySessions = sessions.filter((s) => s.startedAt.startsWith(dateStr) && s.mode === 'work');
      const totalSecs = daySessions.reduce((acc, s) => acc + s.durationSeconds, 0);
      last7Days.push({
        date: dateStr,
        dayName,
        minutes: Math.round(totalSecs / 60),
        sessionsCount: daySessions.length,
      });
    }

    const now = new Date();
    const currentMonthKey = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
    const monthSessions = sessions.filter(
      (s) => s.startedAt.startsWith(currentMonthKey) && s.mode === 'work'
    );
    const monthMinutes = Math.round(
      monthSessions.reduce((acc, s) => acc + s.durationSeconds, 0) / 60
    );
    const totalMinutes = Math.round(sessions.reduce((acc, s) => acc + s.durationSeconds, 0) / 60);
    const totalCompletedSessions = sessions.filter((s) => s.mode === 'work').length;

    return {
      last7Days,
      monthMinutes,
      monthSessionsCount: monthSessions.length,
      totalMinutes,
      totalCompletedSessions,
    };
  },

  listenFocusSessions(userId: string, onUpdate: (sessions: FocusSession[]) => void): Unsubscribe {
    const path = `users/${userId}/focus_sessions`;
    return onSnapshot(
      collection(db, path),
      (snapshot) => {
        const list = snapshot.docs.map((d) => d.data() as FocusSession);
        onUpdate(list.sort((a, b) => b.startedAt.localeCompare(a.startedAt)));
      },
      (err) => {
        handleFirestoreError(err, OperationType.LIST, path);
      }
    );
  },

  // Tasks
  async getTasks(userId: string): Promise<Task[]> {
    const list = await listSubcollection<Task>(`users/${userId}/tasks`);
    return list.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  },

  async createTask(userId: string, input: Partial<Task>): Promise<Task> {
    const title = typeof input.title === 'string' ? input.title.trim() : '';
    if (!title) throw new Error('Title is required');
    const est = Number(input.estimatedPomodoros);
    const now = new Date().toISOString();
    const created: Task = {
      id: `tsk_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
      userId,
      title,
      description: (input.description || '').trim(),
      priority:
        input.priority === 'low' || input.priority === 'high' ? input.priority : 'medium',
      status: 'todo',
      estimatedPomodoros: Number.isFinite(est) && est >= 1 ? Math.min(100, Math.round(est)) : 1,
      completedPomodoros: 0,
      dueDate: input.dueDate || null,
      createdAt: now,
      updatedAt: now,
    };
    await this.saveTask(userId, created);
    return created;
  },

  async updateTask(userId: string, id: string, updates: Partial<Task>): Promise<Task> {
    const path = `users/${userId}/tasks/${id}`;
    try {
      const snap = await getDoc(doc(db, path));
      if (!snap.exists()) throw new Error('Task not found');
      const existing = snap.data() as Task;
      const next: Task = {
        ...existing,
        ...updates,
        id,
        userId,
        title: updates.title !== undefined ? updates.title.trim() : existing.title,
        description:
          updates.description !== undefined ? updates.description.trim() : existing.description,
        updatedAt: new Date().toISOString(),
      };
      if (!next.title) throw new Error('Title is required');
      await setDoc(doc(db, path), stripUndefined({ ...next }), { merge: true });
      return next;
    } catch (err) {
      handleFirestoreError(err, OperationType.WRITE, path);
    }
  },

  async saveTask(userId: string, task: Task): Promise<void> {
    const path = `users/${userId}/tasks/${task.id}`;
    try {
      await setDoc(doc(db, path), stripUndefined({ ...task }), { merge: true });
    } catch (err) {
      handleFirestoreError(err, OperationType.WRITE, path);
    }
  },

  async deleteTask(userId: string, taskId: string): Promise<void> {
    const path = `users/${userId}/tasks/${taskId}`;
    try {
      await deleteDoc(doc(db, path));
    } catch (err) {
      handleFirestoreError(err, OperationType.DELETE, path);
    }
  },

  listenTasks(userId: string, onUpdate: (tasks: Task[]) => void): Unsubscribe {
    const path = `users/${userId}/tasks`;
    return onSnapshot(
      collection(db, path),
      (snapshot) => {
        const list = snapshot.docs.map((d) => d.data() as Task);
        onUpdate(list.sort((a, b) => b.createdAt.localeCompare(a.createdAt)));
      },
      (err) => {
        handleFirestoreError(err, OperationType.LIST, path);
      }
    );
  },

  // Income
  async getIncomes(userId: string): Promise<IncomeTransaction[]> {
    const list = await listSubcollection<IncomeTransaction>(`users/${userId}/income`);
    return list.sort((a, b) => b.date.localeCompare(a.date));
  },

  async createIncome(userId: string, input: Partial<IncomeTransaction>): Promise<IncomeTransaction> {
    const source = typeof input.source === 'string' ? input.source.trim() : '';
    const amount = Number(input.amountPaise);
    if (!source) throw new Error('Income source is required');
    if (!Number.isFinite(amount) || amount <= 0) throw new Error('Valid amount is required');

    const created: IncomeTransaction = {
      id: `inc_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
      userId,
      source,
      amountPaise: Math.round(amount),
      date: input.date || new Date().toISOString().split('T')[0],
      category: (input.category || 'Salary').trim() || 'Salary',
      notes: (input.notes || '').trim(),
      createdAt: new Date().toISOString(),
    };
    await this.saveIncome(userId, created);
    return created;
  },

  async updateIncome(
    userId: string,
    id: string,
    updates: Partial<IncomeTransaction>
  ): Promise<IncomeTransaction> {
    const path = `users/${userId}/income/${id}`;
    try {
      const snap = await getDoc(doc(db, path));
      if (!snap.exists()) throw new Error('Income record not found');
      const existing = snap.data() as IncomeTransaction;
      const next: IncomeTransaction = {
        ...existing,
        ...updates,
        id,
        userId,
        source: updates.source !== undefined ? updates.source.trim() : existing.source,
        amountPaise:
          updates.amountPaise !== undefined
            ? Math.round(Number(updates.amountPaise))
            : existing.amountPaise,
        notes: updates.notes !== undefined ? updates.notes.trim() : existing.notes,
      };
      if (!next.source || !Number.isFinite(next.amountPaise) || next.amountPaise <= 0) {
        throw new Error('Valid source and positive amount are required');
      }
      await setDoc(doc(db, path), stripUndefined({ ...next }), { merge: true });
      return next;
    } catch (err) {
      handleFirestoreError(err, OperationType.WRITE, path);
    }
  },

  async saveIncome(userId: string, income: IncomeTransaction): Promise<void> {
    const path = `users/${userId}/income/${income.id}`;
    try {
      await setDoc(doc(db, path), stripUndefined({ ...income }), { merge: true });
    } catch (err) {
      handleFirestoreError(err, OperationType.WRITE, path);
    }
  },

  async deleteIncome(userId: string, id: string): Promise<void> {
    const path = `users/${userId}/income/${id}`;
    try {
      await deleteDoc(doc(db, path));
    } catch (err) {
      handleFirestoreError(err, OperationType.DELETE, path);
    }
  },

  // Recurring Expenses
  async getRecurringExpenses(userId: string): Promise<RecurringExpense[]> {
    const [recs, cats] = await Promise.all([
      listSubcollection<RecurringExpense>(`users/${userId}/recurring_expenses`),
      this.getCategories(userId),
    ]);
    return recs
      .map((r) => ({
        ...r,
        categoryName: cats.find((c) => c.id === r.categoryId)?.name || 'Fixed Expense',
      }))
      .sort((a, b) => a.dueDay - b.dueDay);
  },

  async createRecurringExpense(
    userId: string,
    input: Partial<RecurringExpense>
  ): Promise<RecurringExpense> {
    const name = typeof input.name === 'string' ? input.name.trim() : '';
    const amount = Number(input.amountPaise);
    if (!name) throw new Error('Expense name is required');
    if (!Number.isFinite(amount) || amount <= 0) throw new Error('Valid amount is required');

    const cats = await this.getCategories(userId);
    const categoryId = input.categoryId || cats[0]?.id || 'cat_1';
    const dueDayNum = Number(input.dueDay);
    const now = new Date().toISOString();

    const created: RecurringExpense = {
      id: `rec_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
      userId,
      name,
      amountPaise: Math.round(amount),
      categoryId,
      recurrence:
        input.recurrence === 'quarterly' || input.recurrence === 'yearly'
          ? input.recurrence
          : 'monthly',
      dueDay:
        Number.isFinite(dueDayNum) && dueDayNum >= 1 ? Math.min(31, Math.round(dueDayNum)) : 1,
      isActive: true,
      notes: (input.notes || '').trim(),
      createdAt: now,
      updatedAt: now,
    };

    await this.saveRecurringExpense(userId, created);
    await this.checkRecurringBills(userId);
    return {
      ...created,
      categoryName: cats.find((c) => c.id === categoryId)?.name || 'Fixed Expense',
    };
  },

  async updateRecurringExpense(
    userId: string,
    id: string,
    updates: Partial<RecurringExpense>
  ): Promise<RecurringExpense> {
    const path = `users/${userId}/recurring_expenses/${id}`;
    try {
      const [snap, cats] = await Promise.all([getDoc(doc(db, path)), this.getCategories(userId)]);
      if (!snap.exists()) throw new Error('Recurring expense not found');
      const existing = snap.data() as RecurringExpense;
      const next: RecurringExpense = {
        ...existing,
        ...updates,
        id,
        userId,
        name: updates.name !== undefined ? updates.name.trim() : existing.name,
        amountPaise:
          updates.amountPaise !== undefined
            ? Math.round(Number(updates.amountPaise))
            : existing.amountPaise,
        dueDay:
          updates.dueDay !== undefined
            ? Math.min(31, Math.max(1, Math.round(Number(updates.dueDay) || 1)))
            : existing.dueDay,
        notes: updates.notes !== undefined ? updates.notes.trim() : existing.notes,
        updatedAt: new Date().toISOString(),
      };
      if (!next.name || !Number.isFinite(next.amountPaise) || next.amountPaise <= 0) {
        throw new Error('Valid name and positive amount are required');
      }
      await setDoc(doc(db, path), stripUndefined({ ...next }), { merge: true });
      return {
        ...next,
        categoryName: cats.find((c) => c.id === next.categoryId)?.name || 'Fixed Expense',
      };
    } catch (err) {
      handleFirestoreError(err, OperationType.WRITE, path);
    }
  },

  async saveRecurringExpense(userId: string, rec: RecurringExpense): Promise<void> {
    const path = `users/${userId}/recurring_expenses/${rec.id}`;
    try {
      await setDoc(doc(db, path), stripUndefined({ ...rec }), { merge: true });
    } catch (err) {
      handleFirestoreError(err, OperationType.WRITE, path);
    }
  },

  async deleteRecurringExpense(userId: string, id: string): Promise<void> {
    const path = `users/${userId}/recurring_expenses/${id}`;
    try {
      await deleteDoc(doc(db, path));
    } catch (err) {
      handleFirestoreError(err, OperationType.DELETE, path);
    }
  },

  // Variable / All Expenses
  async getExpenses(userId: string, type?: 'fixed' | 'variable'): Promise<ExpenseTransaction[]> {
    const [all, cats] = await Promise.all([
      listSubcollection<ExpenseTransaction>(`users/${userId}/expenses`),
      this.getCategories(userId),
    ]);
    const filtered = type ? all.filter((e) => e.type === type) : all;
    return filtered
      .map((e) => ({
        ...e,
        categoryName: cats.find((c) => c.id === e.categoryId)?.name || 'Expense',
        categoryColor: cats.find((c) => c.id === e.categoryId)?.color || '#6366f1',
      }))
      .sort((a, b) => b.date.localeCompare(a.date));
  },

  async createExpense(
    userId: string,
    input: Partial<ExpenseTransaction>
  ): Promise<ExpenseTransaction> {
    const description = typeof input.description === 'string' ? input.description.trim() : '';
    const amount = Number(input.amountPaise);
    if (!description) throw new Error('Description is required');
    if (!Number.isFinite(amount) || amount <= 0) throw new Error('Valid amount is required');

    const cats = await this.getCategories(userId);
    const categoryId = input.categoryId || cats[0]?.id || 'cat_1';
    const created: ExpenseTransaction = {
      id: `exp_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
      userId,
      billId: input.billId || null,
      type: input.type === 'fixed' ? 'fixed' : 'variable',
      categoryId,
      amountPaise: Math.round(amount),
      date: input.date || new Date().toISOString().split('T')[0],
      description,
      paymentMethod: input.paymentMethod || 'upi_bank',
      notes: (input.notes || '').trim(),
      createdAt: new Date().toISOString(),
    };
    await this.saveExpense(userId, created);
    return {
      ...created,
      categoryName: cats.find((c) => c.id === categoryId)?.name || 'Expense',
    };
  },

  async updateExpense(
    userId: string,
    id: string,
    updates: Partial<ExpenseTransaction>
  ): Promise<ExpenseTransaction> {
    const path = `users/${userId}/expenses/${id}`;
    try {
      const [snap, cats] = await Promise.all([getDoc(doc(db, path)), this.getCategories(userId)]);
      if (!snap.exists()) throw new Error('Expense record not found');
      const existing = snap.data() as ExpenseTransaction;
      const next: ExpenseTransaction = {
        ...existing,
        ...updates,
        id,
        userId,
        description:
          updates.description !== undefined ? updates.description.trim() : existing.description,
        amountPaise:
          updates.amountPaise !== undefined
            ? Math.round(Number(updates.amountPaise))
            : existing.amountPaise,
        notes: updates.notes !== undefined ? updates.notes.trim() : existing.notes,
      };
      if (!next.description || !Number.isFinite(next.amountPaise) || next.amountPaise <= 0) {
        throw new Error('Valid description and positive amount are required');
      }
      await setDoc(doc(db, path), stripUndefined({ ...next }), { merge: true });
      return {
        ...next,
        categoryName: cats.find((c) => c.id === next.categoryId)?.name || 'Expense',
      };
    } catch (err) {
      handleFirestoreError(err, OperationType.WRITE, path);
    }
  },

  async saveExpense(userId: string, exp: ExpenseTransaction): Promise<void> {
    const path = `users/${userId}/expenses/${exp.id}`;
    try {
      await setDoc(doc(db, path), stripUndefined({ ...exp }), { merge: true });
    } catch (err) {
      handleFirestoreError(err, OperationType.WRITE, path);
    }
  },

  async deleteExpense(userId: string, id: string): Promise<void> {
    const path = `users/${userId}/expenses/${id}`;
    try {
      await deleteDoc(doc(db, path));
    } catch (err) {
      handleFirestoreError(err, OperationType.DELETE, path);
    }
  },

  // Bills & Payment History
  async checkRecurringBills(userId: string): Promise<Bill[]> {
    const [recs, bills] = await Promise.all([
      listSubcollection<RecurringExpense>(`users/${userId}/recurring_expenses`),
      listSubcollection<Bill>(`users/${userId}/bills`),
    ]);

    const now = new Date();
    const currentYear = now.getFullYear();
    const currentMonth = String(now.getMonth() + 1).padStart(2, '0');
    const todayStr = `${currentYear}-${currentMonth}-${String(now.getDate()).padStart(2, '0')}`;
    const periodKey = `${currentYear}-${currentMonth}`;

    const writes: Promise<void>[] = [];
    for (const rec of recs) {
      if (!rec.isActive) continue;
      const existing = bills.find(
        (b) => b.recurringExpenseId === rec.id && b.periodKey === periodKey
      );
      if (!existing) {
        const clampedDay = Number.isFinite(rec.dueDay) ? Math.min(Math.max(Math.round(rec.dueDay), 1), 28) : 1;
        const dueDate = `${currentYear}-${currentMonth}-${String(clampedDay).padStart(2, '0')}`;
        const created: Bill = {
          id: `bill_${rec.id}_${periodKey}`,
          userId,
          recurringExpenseId: rec.id,
          name: rec.name,
          amountPaise: rec.amountPaise,
          categoryId: rec.categoryId,
          dueDate,
          status: dueDate < todayStr ? 'OVERDUE' : 'UNPAID',
          paymentDate: null,
          notes: rec.notes || `Recurring ${rec.recurrence} expense`,
          periodKey,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        };
        bills.push(created);
        writes.push(this.saveBill(userId, created));
      }
    }

    for (const bill of bills) {
      if (bill.status === 'UNPAID' && bill.dueDate < todayStr) {
        bill.status = 'OVERDUE';
        bill.updatedAt = new Date().toISOString();
        writes.push(this.saveBill(userId, bill));
      }
    }

    if (writes.length > 0) {
      await Promise.all(writes);
    }
    return bills;
  },

  async getBills(userId: string, status?: string): Promise<Bill[]> {
    const [allBills, cats] = await Promise.all([
      this.checkRecurringBills(userId),
      this.getCategories(userId),
    ]);

    let bills = allBills;
    if (status && status !== 'ALL') {
      if (status === 'UNPAID') {
        bills = bills.filter((b) => b.status === 'UNPAID' || b.status === 'OVERDUE');
      } else {
        bills = bills.filter((b) => b.status === status);
      }
    }

    return bills
      .map((b) => ({
        ...b,
        categoryName: cats.find((c) => c.id === b.categoryId)?.name || 'Bill',
        categoryColor: cats.find((c) => c.id === b.categoryId)?.color || '#6366f1',
      }))
      .sort((a, b) => a.dueDate.localeCompare(b.dueDate));
  },

  async createBill(userId: string, input: Partial<Bill>): Promise<Bill> {
    const name = typeof input.name === 'string' ? input.name.trim() : '';
    const amount = Number(input.amountPaise);
    const dueDate = typeof input.dueDate === 'string' ? input.dueDate.trim() : '';
    if (!name) throw new Error('Bill name is required');
    if (!Number.isFinite(amount) || amount <= 0) throw new Error('Valid amount is required');
    if (!dueDate || !isIsoDate(dueDate)) throw new Error('Valid dueDate (YYYY-MM-DD) is required');

    const cats = await this.getCategories(userId);
    const categoryId = input.categoryId || cats[0]?.id || 'cat_1';
    const todayStr = new Date().toISOString().split('T')[0];
    const now = new Date().toISOString();

    const created: Bill = {
      id: `bill_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
      userId,
      recurringExpenseId: null,
      name,
      amountPaise: Math.round(amount),
      categoryId,
      dueDate,
      status: dueDate < todayStr ? 'OVERDUE' : 'UNPAID',
      paymentDate: null,
      notes: (input.notes || '').trim(),
      periodKey: dueDate.substring(0, 7),
      createdAt: now,
      updatedAt: now,
    };
    await this.saveBill(userId, created);
    return {
      ...created,
      categoryName: cats.find((c) => c.id === categoryId)?.name || 'Bill',
    };
  },

  async saveBill(userId: string, bill: Bill): Promise<void> {
    const path = `users/${userId}/bills/${bill.id}`;
    try {
      await setDoc(doc(db, path), stripUndefined({ ...bill }), { merge: true });
    } catch (err) {
      handleFirestoreError(err, OperationType.WRITE, path);
    }
  },

  async payBill(
    userId: string,
    billId: string,
    paidDate?: string,
    paymentMethod: PaymentHistory['paymentMethod'] = 'upi_bank',
    notes?: string
  ): Promise<{ success: boolean; bill: Bill }> {
    const billPath = `users/${userId}/bills/${billId}`;
    const snap = await getDoc(doc(db, billPath));
    if (!snap.exists()) throw new Error('Bill not found');
    const bill = snap.data() as Bill;
    if (bill.status === 'PAID') throw new Error('Bill is already paid');

    const effectivePaidDate = paidDate || new Date().toISOString().split('T')[0];
    const updatedBill: Bill = {
      ...bill,
      status: 'PAID',
      paymentDate: effectivePaidDate,
      updatedAt: new Date().toISOString(),
    };

    const payRecord: PaymentHistory = {
      id: `pay_bill_${bill.id}`,
      userId,
      billId: bill.id,
      billName: bill.name,
      amountPaise: bill.amountPaise,
      paidDate: effectivePaidDate,
      paymentMethod,
      transactionRef: `REF-${Date.now().toString(36).toUpperCase()}`,
      notes: notes || 'Bill payment recorded',
      createdAt: new Date().toISOString(),
    };

    const expenseTx: ExpenseTransaction = {
      id: `exp_bill_${bill.id}`,
      userId,
      billId: bill.id,
      type: 'fixed',
      categoryId: bill.categoryId,
      amountPaise: bill.amountPaise,
      date: effectivePaidDate,
      description: `${bill.name} (Bill payment)`,
      paymentMethod,
      notes: notes || 'Paid bill expense',
      createdAt: new Date().toISOString(),
    };

    await Promise.all([
      this.saveBill(userId, updatedBill),
      this.savePaymentHistory(userId, payRecord),
      this.saveExpense(userId, expenseTx),
    ]);

    const cats = await this.getCategories(userId);
    return {
      success: true,
      bill: {
        ...updatedBill,
        categoryName: cats.find((c) => c.id === updatedBill.categoryId)?.name || 'Bill',
      },
    };
  },

  async undoBillPayment(userId: string, billId: string): Promise<{ success: boolean; bill: Bill }> {
    const billPath = `users/${userId}/bills/${billId}`;
    const snap = await getDoc(doc(db, billPath));
    if (!snap.exists()) throw new Error('Bill not found');
    const bill = snap.data() as Bill;
    if (bill.status !== 'PAID') throw new Error('Bill is not marked as paid');

    const todayStr = new Date().toISOString().split('T')[0];
    const revertedBill: Bill = {
      ...bill,
      status: bill.dueDate < todayStr ? 'OVERDUE' : 'UNPAID',
      paymentDate: null,
      updatedAt: new Date().toISOString(),
    };

    const historyItems = await this.getPaymentHistory(userId);
    const linkedPayments = historyItems.filter((p) => p.billId === billId);

    await Promise.all([
      this.saveBill(userId, revertedBill),
      deleteDoc(doc(db, `users/${userId}/expenses/exp_bill_${billId}`)).catch(() => {}),
      ...linkedPayments.map((p) =>
        deleteDoc(doc(db, `users/${userId}/payment_history/${p.id}`)).catch(() => {})
      ),
    ]);

    const cats = await this.getCategories(userId);
    return {
      success: true,
      bill: {
        ...revertedBill,
        categoryName: cats.find((c) => c.id === revertedBill.categoryId)?.name || 'Bill',
      },
    };
  },

  async deleteBill(userId: string, billId: string): Promise<void> {
    const historyItems = await this.getPaymentHistory(userId);
    const linkedPayments = historyItems.filter((p) => p.billId === billId);
    await Promise.all([
      deleteDoc(doc(db, `users/${userId}/bills/${billId}`)),
      deleteDoc(doc(db, `users/${userId}/expenses/exp_bill_${billId}`)).catch(() => {}),
      ...linkedPayments.map((p) =>
        deleteDoc(doc(db, `users/${userId}/payment_history/${p.id}`)).catch(() => {})
      ),
    ]);
  },

  async getPaymentHistory(userId: string): Promise<PaymentHistory[]> {
    const list = await listSubcollection<PaymentHistory>(`users/${userId}/payment_history`);
    return list.sort((a, b) => b.paidDate.localeCompare(a.paidDate));
  },

  async savePaymentHistory(userId: string, pay: PaymentHistory): Promise<void> {
    const path = `users/${userId}/payment_history/${pay.id}`;
    try {
      await setDoc(doc(db, path), stripUndefined({ ...pay }), { merge: true });
    } catch (err) {
      handleFirestoreError(err, OperationType.WRITE, path);
    }
  },

  // Aggregated Dashboard & Finance Summary
  async getDashboard(userId: string): Promise<DashboardData> {
    const [sessions, incomes, expenses, bills, cats] = await Promise.all([
      this.getFocusSessions(userId),
      this.getIncomes(userId),
      this.getExpenses(userId),
      this.getBills(userId),
      this.getCategories(userId),
    ]);

    const now = new Date();
    const todayStr = now.toISOString().split('T')[0];
    const currentMonthKey = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;

    const todaySessions = sessions.filter((s) => s.startedAt.startsWith(todayStr) && s.completed);
    const todayFocusSeconds = todaySessions.reduce((acc, s) => acc + s.durationSeconds, 0);
    const completedPomodoroSessions = todaySessions.filter((s) => s.mode === 'work').length;
    const focusStreakDays = calculateBoundedStreakDays(sessions, now);

    const currentIncomes = incomes.filter((inc) => inc.date.startsWith(currentMonthKey));
    const monthlyIncomePaise = currentIncomes.reduce((acc, inc) => acc + inc.amountPaise, 0);

    const currentExpenses = expenses.filter((exp) => exp.date.startsWith(currentMonthKey));
    const monthlyExpensesPaise = currentExpenses.reduce((acc, exp) => acc + exp.amountPaise, 0);
    const fixedExpensesPaise = currentExpenses
      .filter((e) => e.type === 'fixed')
      .reduce((acc, e) => acc + e.amountPaise, 0);
    const variableExpensesPaise = currentExpenses
      .filter((e) => e.type === 'variable')
      .reduce((acc, e) => acc + e.amountPaise, 0);
    const remainingBalancePaise = monthlyIncomePaise - monthlyExpensesPaise;

    const currentBills = bills.filter(
      (b) => b.periodKey === currentMonthKey || b.status === 'OVERDUE'
    );
    const paidBillsCount = currentBills.filter((b) => b.status === 'PAID').length;
    const unpaidBillsCount = currentBills.filter(
      (b) => b.status === 'UNPAID' || b.status === 'OVERDUE'
    ).length;
    const totalPaidAmountPaise = currentBills
      .filter((b) => b.status === 'PAID')
      .reduce((acc, b) => acc + b.amountPaise, 0);
    const totalUnpaidAmountPaise = currentBills
      .filter((b) => b.status === 'UNPAID' || b.status === 'OVERDUE')
      .reduce((acc, b) => acc + b.amountPaise, 0);

    const upcomingPayments = bills
      .filter((b) => b.status === 'UNPAID' || b.status === 'OVERDUE')
      .sort((a, b) => a.dueDate.localeCompare(b.dueDate))
      .slice(0, 5);

    const recentIncome = currentIncomes.map((inc) => ({
      id: inc.id,
      type: 'income' as const,
      name: inc.source,
      category: inc.category,
      amountPaise: inc.amountPaise,
      date: inc.date,
      notes: inc.notes,
    }));

    const recentExpense = currentExpenses.map((exp) => ({
      id: exp.id,
      type: exp.type as 'fixed' | 'variable',
      name: exp.description,
      category:
        cats.find((c) => c.id === exp.categoryId)?.name ||
        (exp.type === 'fixed' ? 'Fixed Expense' : 'Variable Expense'),
      amountPaise: exp.amountPaise,
      date: exp.date,
      notes: exp.notes,
      paymentMethod: exp.paymentMethod,
    }));

    const recentTransactions = [...recentIncome, ...recentExpense]
      .sort((a, b) => b.date.localeCompare(a.date))
      .slice(0, 8);

    return {
      todayFocusMinutes: Math.round(todayFocusSeconds / 60),
      completedPomodoroSessions,
      focusStreakDays,
      monthlyIncomePaise,
      monthlyExpensesPaise,
      fixedExpensesPaise,
      variableExpensesPaise,
      remainingBalancePaise,
      paidBillsCount,
      unpaidBillsCount,
      totalPaidAmountPaise,
      totalUnpaidAmountPaise,
      upcomingPayments,
      recentTransactions,
    };
  },

  async getFinanceSummary(
    userId: string,
    filter = 'this_month',
    customStart?: string,
    customEnd?: string
  ): Promise<FinanceSummaryData> {
    const [allIncomes, allExpenses, allBills, cats] = await Promise.all([
      this.getIncomes(userId),
      this.getExpenses(userId),
      this.getBills(userId),
      this.getCategories(userId),
    ]);

    const now = new Date();
    let startDateStr = '';
    let endDateStr = '';

    if (filter === 'today') {
      startDateStr = now.toISOString().split('T')[0];
      endDateStr = startDateStr;
    } else if (filter === 'this_week') {
      const day = now.getDay();
      const diffToMonday = (day + 6) % 7;
      const startOfWeek = new Date(now);
      startOfWeek.setDate(now.getDate() - diffToMonday);
      startDateStr = startOfWeek.toISOString().split('T')[0];
      endDateStr = now.toISOString().split('T')[0];
    } else if (filter === 'last_month') {
      const lastMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1);
      const lastDay = new Date(now.getFullYear(), now.getMonth(), 0).getDate();
      startDateStr = `${lastMonth.getFullYear()}-${String(lastMonth.getMonth() + 1).padStart(2, '0')}-01`;
      endDateStr = `${lastMonth.getFullYear()}-${String(lastMonth.getMonth() + 1).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`;
    } else if (filter === 'custom' && customStart && customEnd) {
      startDateStr = customStart;
      endDateStr = customEnd;
    } else {
      startDateStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-01`;
      endDateStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-31`;
    }

    const incomes = allIncomes.filter((i) => i.date >= startDateStr && i.date <= endDateStr);
    const totalIncomePaise = incomes.reduce((acc, i) => acc + i.amountPaise, 0);

    const expenses = allExpenses.filter((e) => e.date >= startDateStr && e.date <= endDateStr);
    const totalExpensePaise = expenses.reduce((acc, e) => acc + e.amountPaise, 0);
    const fixedExpensesPaise = expenses
      .filter((e) => e.type === 'fixed')
      .reduce((acc, e) => acc + e.amountPaise, 0);
    const variableExpensesPaise = expenses
      .filter((e) => e.type === 'variable')
      .reduce((acc, e) => acc + e.amountPaise, 0);
    const remainingBalancePaise = totalIncomePaise - totalExpensePaise;

    const bills = allBills.filter((b) => b.dueDate >= startDateStr && b.dueDate <= endDateStr);
    const paidBills = bills.filter((b) => b.status === 'PAID');
    const unpaidBills = bills.filter((b) => b.status === 'UNPAID' || b.status === 'OVERDUE');

    const categoryMap: Record<string, { name: string; color: string; amountPaise: number }> = {};
    for (const exp of expenses) {
      const cat = cats.find((c) => c.id === exp.categoryId);
      const key = exp.categoryId || 'other';
      if (!categoryMap[key]) {
        categoryMap[key] = {
          name: cat?.name || (exp.type === 'fixed' ? 'Fixed Expense' : 'Variable Expense'),
          color: cat?.color || '#94a3b8',
          amountPaise: 0,
        };
      }
      categoryMap[key].amountPaise += exp.amountPaise;
    }

    const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    const monthlyTrend: FinanceSummaryData['monthlyTrend'] = [];
    for (let m = 5; m >= 0; m--) {
      const d = new Date(now.getFullYear(), now.getMonth() - m, 1);
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
      const label = `${monthNames[d.getMonth()]} ${String(d.getFullYear()).slice(-2)}`;
      monthlyTrend.push({
        month: label,
        incomePaise: allIncomes
          .filter((i) => i.date.startsWith(key))
          .reduce((acc, i) => acc + i.amountPaise, 0),
        expensePaise: allExpenses
          .filter((e) => e.date.startsWith(key))
          .reduce((acc, e) => acc + e.amountPaise, 0),
      });
    }

    return {
      filter,
      startDate: startDateStr,
      endDate: endDateStr,
      totalIncomePaise,
      totalExpensePaise,
      fixedExpensesPaise,
      variableExpensesPaise,
      remainingBalancePaise,
      totalPaidAmountPaise: paidBills.reduce((acc, b) => acc + b.amountPaise, 0),
      totalUnpaidAmountPaise: unpaidBills.reduce((acc, b) => acc + b.amountPaise, 0),
      paidBillsCount: paidBills.length,
      unpaidBillsCount: unpaidBills.length,
      categoryBreakdown: Object.values(categoryMap).sort((a, b) => b.amountPaise - a.amountPaise),
      monthlyTrend,
    };
  },

  async reseedWorkspace(userId: string): Promise<void> {
    const subcollections = [
      'tasks',
      'focus_sessions',
      'income',
      'recurring_expenses',
      'expenses',
      'bills',
      'payment_history',
    ];
    for (const sub of subcollections) {
      const snap = await getDocs(collection(db, `users/${userId}/${sub}`));
      await Promise.all(snap.docs.map((d) => deleteDoc(d.ref)));
    }
    await this.getCategories(userId);
  },
};
