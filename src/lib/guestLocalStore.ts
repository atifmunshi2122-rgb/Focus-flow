import type {
  AuditLogEntry,
  Bill,
  BudgetEnvelope,
  DashboardData,
  ExpenseCategory,
  ExpenseTransaction,
  FinanceSummaryData,
  FocusSession,
  FocusStatsData,
  Habit,
  IncomeTransaction,
  PaymentHistory,
  RecurringExpense,
  SavingsGoal,
  SubscriptionPlan,
  Task,
  TimeBlock,
  TrashRecord,
  User,
  UserSettings,
} from '../types/index.ts';
import { addDays, DEFAULT_TIMEZONE, getTodayDateString } from './dateTime.ts';
import { DASHBOARD_LAYOUT_PRESETS } from './dashboardIntelligence.ts';

const DEFAULT_GUEST_CATEGORIES: ExpenseCategory[] = [
  { id: 'cat_food', userId: 'guest', name: 'Food & Dining', type: 'variable', icon: 'Utensils', color: '#f59e0b' },
  { id: 'cat_transport', userId: 'guest', name: 'Transport', type: 'variable', icon: 'Car', color: '#3b82f6' },
  { id: 'cat_housing', userId: 'guest', name: 'Rent & Utilities', type: 'fixed', icon: 'Home', color: '#8b5cf6' },
  { id: 'cat_study', userId: 'guest', name: 'Education & Books', type: 'both', icon: 'BookOpen', color: '#10b981' },
  { id: 'cat_other', userId: 'guest', name: 'General', type: 'both', icon: 'Tag', color: '#64748b' },
];

function createDefaultGuestSettings(userId: string): UserSettings {
  return {
    userId,
    currency: 'INR',
    timezone: DEFAULT_TIMEZONE,
    pomodoroWorkDuration: 25,
    shortBreakDuration: 5,
    longBreakDuration: 15,
    autoSwitchSessions: false,
    soundEnabled: true,
    soundVolume: 70,
    theme: 'dark',
    dailyFocusGoalMinutes: 100,
    weeklyFocusGoalMinutes: 500,
    monthlyBudgetPaise: 0,
    categoryBudgets: {},
    dashboardLayout: DASHBOARD_LAYOUT_PRESETS.executive.config,
    keyboardShortcutsEnabled: true,
  };
}

function createDefaultGuestUser(userId: string): User {
  return {
    id: userId,
    email: '',
    name: 'Guest Workspace',
    avatarUrl: '',
    createdAt: new Date().toISOString(),
  };
}

function readBucket<T>(sessionId: string, bucket: string, fallback: T): T {
  if (typeof window === 'undefined' || !window.localStorage) return fallback;
  try {
    const raw = window.localStorage.getItem(`ff_guest_v2_${sessionId}_${bucket}`);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}

function writeBucket<T>(sessionId: string, bucket: string, value: T): void {
  if (typeof window === 'undefined' || !window.localStorage) return;
  try {
    window.localStorage.setItem(`ff_guest_v2_${sessionId}_${bucket}`, JSON.stringify(value));
  } catch {
    // ignore quota errors
  }
}

function clearAllGuestBuckets(sessionId: string): void {
  if (typeof window === 'undefined' || !window.localStorage) return;
  const prefix = `ff_guest_v2_${sessionId}_`;
  const legacyPrefix = `ff_guest_`;
  const toRemove: string[] = [];
  for (let i = 0; i < window.localStorage.length; i++) {
    const key = window.localStorage.key(i);
    if (key && (key.startsWith(prefix) || (key.startsWith(legacyPrefix) && key.endsWith(`_${sessionId}`)))) {
      toRemove.push(key);
    }
  }
  for (const key of toRemove) {
    window.localStorage.removeItem(key);
  }
}

function makeId(prefix: string): string {
  return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

function parseJsonBody(body: BodyInit | null | undefined): Record<string, unknown> {
  if (typeof body !== 'string' || !body.trim()) return {};
  try {
    const parsed = JSON.parse(body);
    return parsed && typeof parsed === 'object' ? (parsed as Record<string, unknown>) : {};
  } catch {
    return {};
  }
}

function buildGuestDashboard(sessionId: string): DashboardData {
  const settings = readBucket<UserSettings>(sessionId, 'settings', createDefaultGuestSettings(sessionId));
  const tz = settings.timezone || DEFAULT_TIMEZONE;
  const todayStr = getTodayDateString(tz);
  const monthPrefix = todayStr.slice(0, 7);
  const weekStartStr = addDays(todayStr, -6);

  const tasks = readBucket<Task[]>(sessionId, 'tasks', []).filter((t) => !t.deletedAt);
  const sessions = readBucket<FocusSession[]>(sessionId, 'focus_sessions', []);
  const bills = readBucket<Bill[]>(sessionId, 'bills', []).filter((b) => !b.deletedAt);
  const incomes = readBucket<IncomeTransaction[]>(sessionId, 'income', []).filter((i) => !i.deletedAt);
  const expenses = readBucket<ExpenseTransaction[]>(sessionId, 'expenses', []).filter((e) => !e.deletedAt);

  const workSessions = sessions.filter((s) => s.completed && s.mode === 'work');
  const getMins = (s: FocusSession) =>
    Math.round(
      (typeof s.actualDurationSeconds === 'number'
        ? s.actualDurationSeconds
        : s.durationMinutes * 60) / 60
    );

  const todaySessions = workSessions.filter((s) => (s.startedAt || '').slice(0, 10) === todayStr);
  const weekSessions = workSessions.filter((s) => (s.startedAt || '').slice(0, 10) >= weekStartStr);

  const todayFocusMinutes = todaySessions.reduce((acc, s) => acc + getMins(s), 0);
  const weeklyFocusMinutes = weekSessions.reduce((acc, s) => acc + getMins(s), 0);

  const todayIncomePaise = incomes
    .filter((i) => i.date.slice(0, 10) === todayStr)
    .reduce((acc, i) => acc + (i.amountPaise || 0), 0);
  const todayExpensesPaise = expenses
    .filter((e) => e.date.slice(0, 10) === todayStr)
    .reduce((acc, e) => acc + (e.amountPaise || 0), 0);
  const monthlyIncomePaise = incomes
    .filter((i) => i.date.startsWith(monthPrefix))
    .reduce((acc, i) => acc + (i.amountPaise || 0), 0);
  const monthlyExpensesList = expenses.filter((e) => e.date.startsWith(monthPrefix));
  const monthlyExpensesPaise = monthlyExpensesList.reduce((acc, e) => acc + (e.amountPaise || 0), 0);
  const fixedExpensesPaise = monthlyExpensesList
    .filter((e) => e.type === 'fixed')
    .reduce((acc, e) => acc + (e.amountPaise || 0), 0);
  const variableExpensesPaise = monthlyExpensesPaise - fixedExpensesPaise;

  const paidBills = bills.filter((b) => b.status === 'PAID');
  const unpaidBills = bills.filter((b) => b.status !== 'PAID');

  const recentTransactions: DashboardData['recentTransactions'] = [
    ...incomes.map((i) => ({
      id: i.id,
      type: 'income' as const,
      name: i.source || i.notes || 'Income',
      category: i.category || 'Income',
      amountPaise: i.amountPaise,
      date: i.date,
      notes: i.notes,
    })),
    ...expenses.map((e) => ({
      id: e.id,
      type: (e.type === 'fixed' ? 'fixed' : 'variable') as 'fixed' | 'variable',
      name: e.description || e.notes || 'Expense',
      category: e.categoryName || 'General',
      amountPaise: e.amountPaise,
      date: e.date,
      notes: e.notes,
      paymentMethod: e.paymentMethod,
    })),
  ]
    .sort((a, b) => b.date.localeCompare(a.date))
    .slice(0, 8);

  return {
    todayFocusMinutes,
    weeklyFocusMinutes,
    completedPomodoroSessions: todaySessions.length,
    focusStreakDays: todayFocusMinutes > 0 ? 1 : 0,
    bestStreakDays: todayFocusMinutes > 0 ? 1 : 0,
    completedTasksCount: tasks.filter((t) => t.status === 'completed').length,
    pendingTasksCount: tasks.filter((t) => t.status !== 'completed').length,
    todayIncomePaise,
    todayExpensesPaise,
    weeklyExpensesPaise: expenses
      .filter((e) => e.date.slice(0, 10) >= weekStartStr)
      .reduce((acc, e) => acc + (e.amountPaise || 0), 0),
    monthlyIncomePaise,
    monthlyExpensesPaise,
    fixedExpensesPaise,
    variableExpensesPaise,
    remainingBalancePaise: monthlyIncomePaise - monthlyExpensesPaise,
    paidBillsCount: paidBills.length,
    unpaidBillsCount: unpaidBills.length,
    totalPaidAmountPaise: paidBills.reduce((acc, b) => acc + (b.amountPaise || 0), 0),
    totalUnpaidAmountPaise: unpaidBills.reduce((acc, b) => acc + (b.amountPaise || 0), 0),
    upcomingPayments: unpaidBills.sort((a, b) => a.dueDate.localeCompare(b.dueDate)).slice(0, 5),
    recentTransactions,
  };
}

function buildGuestFinanceSummary(sessionId: string, searchParams: URLSearchParams): FinanceSummaryData {
  const settings = readBucket<UserSettings>(sessionId, 'settings', createDefaultGuestSettings(sessionId));
  const tz = settings.timezone || DEFAULT_TIMEZONE;
  const todayStr = getTodayDateString(tz);
  const filter = searchParams.get('filter') || 'this_month';
  const monthStart = `${todayStr.slice(0, 7)}-01`;
  const startDate = searchParams.get('startDate') || (filter === 'today' ? todayStr : filter === 'this_week' ? addDays(todayStr, -6) : monthStart);
  const endDate = searchParams.get('endDate') || todayStr;

  const categories = readBucket<ExpenseCategory[]>(sessionId, 'categories', DEFAULT_GUEST_CATEGORIES);
  const incomes = readBucket<IncomeTransaction[]>(sessionId, 'income', []).filter(
    (i) => !i.deletedAt && i.date.slice(0, 10) >= startDate && i.date.slice(0, 10) <= endDate
  );
  const expenses = readBucket<ExpenseTransaction[]>(sessionId, 'expenses', []).filter(
    (e) => !e.deletedAt && e.date.slice(0, 10) >= startDate && e.date.slice(0, 10) <= endDate
  );
  const bills = readBucket<Bill[]>(sessionId, 'bills', []).filter((b) => !b.deletedAt);

  const totalIncomePaise = incomes.reduce((acc, i) => acc + (i.amountPaise || 0), 0);
  const totalExpensePaise = expenses.reduce((acc, e) => acc + (e.amountPaise || 0), 0);
  const fixedExpensesPaise = expenses
    .filter((e) => e.type === 'fixed')
    .reduce((acc, e) => acc + (e.amountPaise || 0), 0);
  const variableExpensesPaise = totalExpensePaise - fixedExpensesPaise;

  const catTotals = new Map<string, { categoryId: string; name: string; color: string; amountPaise: number }>();
  for (const exp of expenses) {
    const cat = categories.find((c) => c.id === exp.categoryId);
    const key = exp.categoryId || 'other';
    const existing = catTotals.get(key) || {
      categoryId: key,
      name: exp.categoryName || cat?.name || 'General',
      color: exp.categoryColor || cat?.color || '#64748b',
      amountPaise: 0,
    };
    existing.amountPaise += exp.amountPaise || 0;
    catTotals.set(key, existing);
  }

  const paidBills = bills.filter((b) => b.status === 'PAID');
  const unpaidBills = bills.filter((b) => b.status !== 'PAID');

  return {
    filter,
    startDate,
    endDate,
    totalIncomePaise,
    totalExpensePaise,
    fixedExpensesPaise,
    variableExpensesPaise,
    remainingBalancePaise: totalIncomePaise - totalExpensePaise,
    totalPaidAmountPaise: paidBills.reduce((acc, b) => acc + (b.amountPaise || 0), 0),
    totalUnpaidAmountPaise: unpaidBills.reduce((acc, b) => acc + (b.amountPaise || 0), 0),
    paidBillsCount: paidBills.length,
    unpaidBillsCount: unpaidBills.length,
    categoryBreakdown: Array.from(catTotals.values()).sort((a, b) => b.amountPaise - a.amountPaise),
    monthlyTrend: [
      {
        month: todayStr.slice(0, 7),
        incomePaise: totalIncomePaise,
        expensePaise: totalExpensePaise,
      },
    ],
  };
}

function buildGuestFocusStats(sessionId: string): FocusStatsData {
  const settings = readBucket<UserSettings>(sessionId, 'settings', createDefaultGuestSettings(sessionId));
  const tz = settings.timezone || DEFAULT_TIMEZONE;
  const todayStr = getTodayDateString(tz);
  const sessions = readBucket<FocusSession[]>(sessionId, 'focus_sessions', []).filter(
    (s) => s.completed && s.mode === 'work'
  );

  const getMins = (s: FocusSession) =>
    Math.round(
      (typeof s.actualDurationSeconds === 'number'
        ? s.actualDurationSeconds
        : s.durationMinutes * 60) / 60
    );

  const dayNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  const last7Days = Array.from({ length: 7 }, (_, idx) => {
    const date = addDays(todayStr, idx - 6);
    const parsed = new Date(`${date}T00:00:00Z`);
    const daySessions = sessions.filter((s) => (s.startedAt || '').slice(0, 10) === date);
    return {
      date,
      dayName: dayNames[parsed.getUTCDay()] || '',
      minutes: daySessions.reduce((acc, s) => acc + getMins(s), 0),
      sessionsCount: daySessions.length,
    };
  });

  const monthPrefix = todayStr.slice(0, 7);
  const monthSessions = sessions.filter((s) => (s.startedAt || '').startsWith(monthPrefix));

  return {
    last7Days,
    dailyHeatmap: last7Days.map(({ date, minutes, sessionsCount }) => ({
      date,
      minutes,
      sessionsCount,
    })),
    weeklyMinutes: last7Days.reduce((acc, d) => acc + d.minutes, 0),
    monthMinutes: monthSessions.reduce((acc, s) => acc + getMins(s), 0),
    monthSessionsCount: monthSessions.length,
    totalMinutes: sessions.reduce((acc, s) => acc + getMins(s), 0),
    totalCompletedSessions: sessions.length,
  };
}

/**
 * Isolated client-side localStorage fallback for unauthenticated Guest sessions
 * when the production API enforces authentication (HTTP 401).
 * NEVER invoked for signed-in Firebase users.
 * Joint Vault routes intentionally return `undefined` so 401 propagates.
 */
export function handleGuestLocalFallback(
  sessionId: string,
  endpoint: string,
  options: RequestInit = {}
): unknown | undefined {
  const method = (options.method || 'GET').toUpperCase();
  const [pathname, queryStr = ''] = endpoint.split('?');
  const searchParams = new URLSearchParams(queryStr);
  const body = parseJsonBody(options.body);
  const nowIso = new Date().toISOString();

  // Joint Vaults strictly require Google Sign-In
  if (pathname.startsWith('/joint-vaults')) {
    return undefined;
  }

  // Auth & Settings
  if (pathname === '/auth/me' && method === 'GET') {
    const settings = readBucket<UserSettings>(sessionId, 'settings', createDefaultGuestSettings(sessionId));
    return { user: createDefaultGuestUser(sessionId), settings };
  }
  if (pathname === '/settings' && (method === 'PUT' || method === 'PATCH')) {
    const current = readBucket<UserSettings>(sessionId, 'settings', createDefaultGuestSettings(sessionId));
    const next: UserSettings = { ...current, ...(body as Partial<UserSettings>), userId: sessionId, updatedAt: nowIso };
    writeBucket(sessionId, 'settings', next);
    return { success: true, settings: next };
  }
  if (pathname === '/workspace/clear' && method === 'POST') {
    clearAllGuestBuckets(sessionId);
    return { success: true, message: 'Local guest workspace cleared.' };
  }
  if (pathname === '/reseed' && method === 'POST') {
    return { success: true, message: 'Guest workspace ready.' };
  }

  // Dashboard & Focus
  if (pathname === '/dashboard' && method === 'GET') {
    return buildGuestDashboard(sessionId);
  }
  if (pathname === '/focus/stats' && method === 'GET') {
    return buildGuestFocusStats(sessionId);
  }
  if (pathname === '/focus/sessions') {
    const list = readBucket<FocusSession[]>(sessionId, 'focus_sessions', []);
    if (method === 'GET') return list;
    if (method === 'POST') {
      const completed = Boolean(body.completed);
      const durationMinutes = Number(body.durationMinutes || 25);
      const durationSeconds = Number(body.durationSeconds || durationMinutes * 60);
      const created: FocusSession = {
        id: (body.id as string) || makeId('fs'),
        userId: sessionId,
        taskId: (body.taskId as string | null) ?? null,
        taskTitle: (body.taskTitle as string) || undefined,
        subjectCode: (body.subjectCode as string | null) ?? null,
        subjectId: (body.subjectId as string | null) ?? null,
        topicId: (body.topicId as string | null) ?? null,
        activityType: (body.activityType as FocusSession['activityType']) ?? null,
        presetId: (body.presetId as string | null) ?? null,
        mode: (body.mode as FocusSession['mode']) || 'work',
        durationMinutes,
        durationSeconds,
        actualDurationSeconds:
          typeof body.actualDurationSeconds === 'number'
            ? body.actualDurationSeconds
            : completed
              ? durationSeconds
              : 0,
        completed,
        status: (body.status as FocusSession['status']) || (completed ? 'completed' : 'in_progress'),
        interrupted: Boolean(body.interrupted),
        pauseCount: typeof body.pauseCount === 'number' ? body.pauseCount : 0,
        totalPauseSeconds: typeof body.totalPauseSeconds === 'number' ? body.totalPauseSeconds : 0,
        interruptionReason: typeof body.interruptionReason === 'string' ? body.interruptionReason : undefined,
        startedAt: (body.startedAt as string) || nowIso,
        endedAt: (body.endedAt as string | null) ?? (completed ? nowIso : null),
        endReason: (body.endReason as FocusSession['endReason']) ?? (completed ? 'completed' : null),
        createdAt: nowIso,
      };
      writeBucket(sessionId, 'focus_sessions', [created, ...list.filter((s) => s.id !== created.id)]);
      return created;
    }
  }
  if (pathname.startsWith('/focus/sessions/') && (method === 'PATCH' || method === 'PUT')) {
    const id = decodeURIComponent(pathname.slice('/focus/sessions/'.length));
    const list = readBucket<FocusSession[]>(sessionId, 'focus_sessions', []);
    let updated: FocusSession | null = null;
    const next = list.map((s) => {
      if (s.id !== id) return s;
      updated = { ...s, ...(body as Partial<FocusSession>) };
      return updated;
    });
    if (!updated) {
      const completed = Boolean(body.completed);
      const durationMinutes = Number(body.durationMinutes || 25);
      const durationSeconds = Number(body.durationSeconds || durationMinutes * 60);
      const upserted: FocusSession = {
        ...(body as Partial<FocusSession>),
        id,
        userId: sessionId,
        taskId: (body.taskId as string | null) ?? null,
        mode: (body.mode as FocusSession['mode']) || 'work',
        durationMinutes,
        durationSeconds,
        actualDurationSeconds:
          typeof body.actualDurationSeconds === 'number'
            ? body.actualDurationSeconds
            : completed
              ? durationSeconds
              : 0,
        completed,
        status: (body.status as FocusSession['status']) || (completed ? 'completed' : 'in_progress'),
        startedAt: (body.startedAt as string) || nowIso,
        endedAt: (body.endedAt as string | null) ?? (completed ? nowIso : null),
        endReason: (body.endReason as FocusSession['endReason']) ?? (completed ? 'completed' : null),
      };
      updated = upserted;
      next.unshift(upserted);
    }
    writeBucket(sessionId, 'focus_sessions', next);
    return updated;
  }

  // Tasks
  if (pathname === '/tasks') {
    const list = readBucket<Task[]>(sessionId, 'tasks', []);
    if (method === 'GET') return list.filter((t) => !t.deletedAt);
    if (method === 'POST') {
      const created: Task = {
        id: (body.id as string) || makeId('tsk'),
        userId: sessionId,
        title: String(body.title || 'Untitled Task'),
        description: String(body.description || ''),
        priority: (body.priority as Task['priority']) || 'medium',
        status: (body.status as Task['status']) || 'todo',
        estimatedPomodoros: Number(body.estimatedPomodoros || 1),
        completedPomodoros: Number(body.completedPomodoros || 0),
        dueDate: (body.dueDate as string | null) ?? null,
        category: body.category as string | undefined,
        subtasks: Array.isArray(body.subtasks) ? (body.subtasks as Task['subtasks']) : undefined,
        createdAt: nowIso,
        updatedAt: nowIso,
      };
      writeBucket(sessionId, 'tasks', [created, ...list]);
      return created;
    }
  }
  if (pathname.startsWith('/tasks/')) {
    const id = decodeURIComponent(pathname.slice('/tasks/'.length));
    const list = readBucket<Task[]>(sessionId, 'tasks', []);
    if (method === 'PUT' || method === 'PATCH') {
      let updated: Task | null = null;
      const next = list.map((t) => {
        if (t.id !== id) return t;
        updated = { ...t, ...(body as Partial<Task>), updatedAt: nowIso };
        return updated;
      });
      writeBucket(sessionId, 'tasks', next);
      return updated || { id, userId: sessionId, ...(body as Partial<Task>) };
    }
    if (method === 'DELETE') {
      writeBucket(sessionId, 'tasks', list.filter((t) => t.id !== id));
      return { success: true };
    }
  }

  // Habits
  if (pathname === '/habits') {
    const list = readBucket<Habit[]>(sessionId, 'habits', []);
    if (method === 'GET') return list.filter((h) => !h.deletedAt);
    if (method === 'POST') {
      const created: Habit = {
        id: (body.id as string) || makeId('hab'),
        userId: sessionId,
        title: String(body.title || 'New Habit'),
        description: body.description as string | undefined,
        category: String(body.category || 'Productivity'),
        color: String(body.color || '#f59e0b'),
        frequency: (body.frequency as Habit['frequency']) || 'daily',
        targetDaysPerWeek: Number(body.targetDaysPerWeek || 7),
        customDays: Array.isArray(body.customDays) ? (body.customDays as number[]) : undefined,
        completedDates: Array.isArray(body.completedDates) ? (body.completedDates as string[]) : [],
        bestStreakDays: Number(body.bestStreakDays || 0),
        createdAt: nowIso,
        updatedAt: nowIso,
      };
      writeBucket(sessionId, 'habits', [created, ...list]);
      return created;
    }
  }
  if (pathname.startsWith('/habits/')) {
    const rest = pathname.slice('/habits/'.length);
    const list = readBucket<Habit[]>(sessionId, 'habits', []);
    if (rest.endsWith('/toggle') && method === 'POST') {
      const id = decodeURIComponent(rest.slice(0, -'/toggle'.length));
      const dateStr = String(body.dateStr || body.date || getTodayDateString(DEFAULT_TIMEZONE));
      let toggled: Habit | null = null;
      const next = list.map((h) => {
        if (h.id !== id) return h;
        const set = new Set(h.completedDates || []);
        if (set.has(dateStr)) set.delete(dateStr);
        else set.add(dateStr);
        toggled = { ...h, completedDates: Array.from(set).sort(), updatedAt: nowIso };
        return toggled;
      });
      writeBucket(sessionId, 'habits', next);
      return toggled;
    }
    const id = decodeURIComponent(rest);
    if (method === 'PUT' || method === 'PATCH') {
      let updated: Habit | null = null;
      const next = list.map((h) => {
        if (h.id !== id) return h;
        updated = { ...h, ...(body as Partial<Habit>), updatedAt: nowIso };
        return updated;
      });
      writeBucket(sessionId, 'habits', next);
      return updated;
    }
    if (method === 'DELETE') {
      writeBucket(sessionId, 'habits', list.filter((h) => h.id !== id));
      return { success: true };
    }
  }

  // Time Blocks
  if (pathname === '/time-blocks') {
    const list = readBucket<TimeBlock[]>(sessionId, 'time_blocks', []);
    if (method === 'GET') {
      const dateFilter = searchParams.get('date');
      const active = list.filter((tb) => !tb.deletedAt);
      return dateFilter ? active.filter((tb) => tb.date === dateFilter) : active;
    }
    if (method === 'POST') {
      const created: TimeBlock = {
        id: (body.id as string) || makeId('tb'),
        userId: sessionId,
        date: String(body.date || getTodayDateString(DEFAULT_TIMEZONE)),
        title: String(body.title || 'Time Block'),
        startMinute: Number(body.startMinute ?? 540),
        endMinute: Number(body.endMinute ?? 600),
        category: String(body.category || 'focus'),
        completed: Boolean(body.completed),
        notes: body.notes as string | undefined,
        createdAt: nowIso,
        updatedAt: nowIso,
      };
      writeBucket(sessionId, 'time_blocks', [...list, created]);
      return created;
    }
  }
  if (pathname.startsWith('/time-blocks/')) {
    const id = decodeURIComponent(pathname.slice('/time-blocks/'.length));
    const list = readBucket<TimeBlock[]>(sessionId, 'time_blocks', []);
    if (method === 'PUT' || method === 'PATCH') {
      let updated: TimeBlock | null = null;
      const next = list.map((tb) => {
        if (tb.id !== id) return tb;
        updated = { ...tb, ...(body as Partial<TimeBlock>), updatedAt: nowIso };
        return updated;
      });
      writeBucket(sessionId, 'time_blocks', next);
      return updated;
    }
    if (method === 'DELETE') {
      writeBucket(sessionId, 'time_blocks', list.filter((tb) => tb.id !== id));
      return { success: true };
    }
  }

  // Finance
  if (pathname === '/finance/summary' && method === 'GET') {
    return buildGuestFinanceSummary(sessionId, searchParams);
  }
  if (pathname === '/finance/categories') {
    const list = readBucket<ExpenseCategory[]>(sessionId, 'categories', DEFAULT_GUEST_CATEGORIES);
    if (method === 'GET') return list;
    if (method === 'POST') {
      const created: ExpenseCategory = {
        id: (body.id as string) || makeId('cat'),
        userId: sessionId,
        name: String(body.name || 'Category'),
        type: (body.type as ExpenseCategory['type']) || 'variable',
        icon: String(body.icon || 'Tag'),
        color: String(body.color || '#f59e0b'),
      };
      writeBucket(sessionId, 'categories', [...list, created]);
      return created;
    }
  }
  if (pathname === '/finance/income') {
    const list = readBucket<IncomeTransaction[]>(sessionId, 'income', []);
    if (method === 'GET') return list.filter((i) => !i.deletedAt);
    if (method === 'POST') {
      const created: IncomeTransaction = {
        id: (body.id as string) || makeId('inc'),
        userId: sessionId,
        source: String(body.source || 'Income'),
        amountPaise: Number(body.amountPaise || 0),
        date: String(body.date || getTodayDateString(DEFAULT_TIMEZONE)),
        category: String(body.category || 'Salary'),
        notes: String(body.notes || ''),
        createdAt: nowIso,
      };
      writeBucket(sessionId, 'income', [created, ...list]);
      return created;
    }
  }
  if (pathname.startsWith('/finance/income/')) {
    const id = decodeURIComponent(pathname.slice('/finance/income/'.length));
    const list = readBucket<IncomeTransaction[]>(sessionId, 'income', []);
    if (method === 'PUT' || method === 'PATCH') {
      let updated: IncomeTransaction | null = null;
      writeBucket(
        sessionId,
        'income',
        list.map((i) => {
          if (i.id !== id) return i;
          updated = { ...i, ...(body as Partial<IncomeTransaction>) };
          return updated;
        })
      );
      return updated;
    }
    if (method === 'DELETE') {
      writeBucket(sessionId, 'income', list.filter((i) => i.id !== id));
      return { success: true };
    }
  }
  if (pathname === '/finance/expenses') {
    const list = readBucket<ExpenseTransaction[]>(sessionId, 'expenses', []);
    if (method === 'GET') return list.filter((e) => !e.deletedAt);
    if (method === 'POST') {
      const created: ExpenseTransaction = {
        id: (body.id as string) || makeId('exp'),
        userId: sessionId,
        billId: (body.billId as string | null) ?? null,
        description: String(body.description || body.name || 'Expense'),
        amountPaise: Number(body.amountPaise || 0),
        categoryId: String(body.categoryId || 'cat_other'),
        categoryName: body.categoryName as string | undefined,
        categoryColor: body.categoryColor as string | undefined,
        type: (body.type as ExpenseTransaction['type']) || 'variable',
        date: String(body.date || getTodayDateString(DEFAULT_TIMEZONE)),
        paymentMethod: (body.paymentMethod as ExpenseTransaction['paymentMethod']) || 'upi_bank',
        notes: String(body.notes || ''),
        createdAt: nowIso,
      };
      writeBucket(sessionId, 'expenses', [created, ...list]);
      return created;
    }
  }
  if (pathname.startsWith('/finance/expenses/')) {
    const id = decodeURIComponent(pathname.slice('/finance/expenses/'.length));
    const list = readBucket<ExpenseTransaction[]>(sessionId, 'expenses', []);
    if (method === 'PUT' || method === 'PATCH') {
      let updated: ExpenseTransaction | null = null;
      writeBucket(
        sessionId,
        'expenses',
        list.map((e) => {
          if (e.id !== id) return e;
          updated = { ...e, ...(body as Partial<ExpenseTransaction>) };
          return updated;
        })
      );
      return updated;
    }
    if (method === 'DELETE') {
      writeBucket(sessionId, 'expenses', list.filter((e) => e.id !== id));
      return { success: true };
    }
  }
  if (pathname === '/finance/bills') {
    const list = readBucket<Bill[]>(sessionId, 'bills', []);
    if (method === 'GET') return list.filter((b) => !b.deletedAt);
    if (method === 'POST') {
      const created: Bill = {
        id: (body.id as string) || makeId('bill'),
        userId: sessionId,
        recurringExpenseId: null,
        name: String(body.name || 'Bill'),
        amountPaise: Number(body.amountPaise || 0),
        categoryId: String(body.categoryId || 'cat_housing'),
        categoryName: body.categoryName as string | undefined,
        dueDate: String(body.dueDate || getTodayDateString(DEFAULT_TIMEZONE)),
        status: (body.status as Bill['status']) || 'UNPAID',
        paymentDate: null,
        notes: String(body.notes || ''),
        periodKey: String(body.dueDate || getTodayDateString(DEFAULT_TIMEZONE)).slice(0, 7),
        createdAt: nowIso,
        updatedAt: nowIso,
      };
      writeBucket(sessionId, 'bills', [created, ...list]);
      return created;
    }
  }
  if (pathname.startsWith('/finance/bills/')) {
    const rest = pathname.slice('/finance/bills/'.length);
    const list = readBucket<Bill[]>(sessionId, 'bills', []);
    if (rest.endsWith('/pay') && method === 'POST') {
      const id = decodeURIComponent(rest.slice(0, -'/pay'.length));
      let updated: Bill | null = null;
      writeBucket(
        sessionId,
        'bills',
        list.map((b) => {
          if (b.id !== id) return b;
          updated = { ...b, status: 'PAID', paymentDate: getTodayDateString(DEFAULT_TIMEZONE), updatedAt: nowIso };
          return updated;
        })
      );
      return { success: true, bill: updated };
    }
    if ((rest.endsWith('/undo-payment') || rest.endsWith('/undo')) && method === 'POST') {
      const suffix = rest.endsWith('/undo-payment') ? '/undo-payment' : '/undo';
      const id = decodeURIComponent(rest.slice(0, -suffix.length));
      let updated: Bill | null = null;
      writeBucket(
        sessionId,
        'bills',
        list.map((b) => {
          if (b.id !== id) return b;
          updated = { ...b, status: 'UNPAID', paymentDate: null, updatedAt: nowIso };
          return updated;
        })
      );
      return { success: true, bill: updated };
    }
    if (method === 'DELETE') {
      const id = decodeURIComponent(rest);
      writeBucket(sessionId, 'bills', list.filter((b) => b.id !== id));
      return { success: true };
    }
  }
  if (pathname === '/finance/recurring') {
    const list = readBucket<RecurringExpense[]>(sessionId, 'recurring', []);
    if (method === 'GET') return list;
    if (method === 'POST') {
      const created = { id: makeId('rec'), userId: sessionId, ...body, createdAt: nowIso, updatedAt: nowIso } as RecurringExpense;
      writeBucket(sessionId, 'recurring', [created, ...list]);
      return created;
    }
  }
  if (pathname === '/finance/payments-history' && method === 'GET') {
    return readBucket<PaymentHistory[]>(sessionId, 'payments_history', []);
  }
  if (pathname === '/finance/savings-goals') {
    const list = readBucket<SavingsGoal[]>(sessionId, 'savings_goals', []);
    if (method === 'GET') return list;
    if (method === 'POST') {
      const created = { id: makeId('sg'), userId: sessionId, ...body, createdAt: nowIso, updatedAt: nowIso } as SavingsGoal;
      writeBucket(sessionId, 'savings_goals', [created, ...list]);
      return created;
    }
  }
  if (pathname === '/envelopes') {
    const list = readBucket<BudgetEnvelope[]>(sessionId, 'envelopes', []);
    if (method === 'GET') return list.filter((e) => !e.deletedAt);
    if (method === 'POST') {
      const created = { id: makeId('env'), userId: sessionId, ...body, createdAt: nowIso, updatedAt: nowIso } as BudgetEnvelope;
      writeBucket(sessionId, 'envelopes', [created, ...list]);
      return created;
    }
  }
  if (pathname === '/subscriptions') {
    const list = readBucket<SubscriptionPlan[]>(sessionId, 'subscriptions', []);
    if (method === 'GET') return list.filter((s) => !s.deletedAt);
    if (method === 'POST') {
      const created = { id: makeId('sub'), userId: sessionId, ...body, createdAt: nowIso, updatedAt: nowIso } as SubscriptionPlan;
      writeBucket(sessionId, 'subscriptions', [created, ...list]);
      return created;
    }
  }
  if (pathname === '/trash' && method === 'GET') {
    return readBucket<TrashRecord[]>(sessionId, 'trash', []);
  }
  if (pathname === '/audit-logs' && method === 'GET') {
    return readBucket<AuditLogEntry[]>(sessionId, 'audit_logs', []);
  }

  // Generic local guest fallback for /study/* collections
  if (pathname.startsWith('/study/')) {
    const parts = pathname.split('/').filter(Boolean); // ['study', 'subjects', id?]
    const collection = parts[1] || 'misc';
    const itemId = parts[2] ? decodeURIComponent(parts[2]) : null;
    const bucket = `study_${collection}`;
    const list = readBucket<Array<Record<string, unknown>>>(sessionId, bucket, []);
    if (method === 'GET') {
      return list.filter((item) => !item.deletedAt);
    }
    if (method === 'POST' || method === 'PUT' || method === 'PATCH') {
      const id = String(body.id || itemId || makeId(collection.slice(0, 3)));
      const saved = { ...body, id, userId: sessionId, updatedAt: nowIso, createdAt: body.createdAt || nowIso };
      writeBucket(sessionId, bucket, [saved, ...list.filter((item) => item.id !== id)]);
      return saved;
    }
    if (method === 'DELETE' && itemId) {
      writeBucket(sessionId, bucket, list.filter((item) => item.id !== itemId));
      return { success: true };
    }
  }

  // Emergency Profile local guest fallback
  if (pathname === '/emergency-profile') {
    if (method === 'GET') {
      return readBucket<any>(sessionId, 'emergency_profile', null);
    }
    if (method === 'POST' || method === 'PUT') {
      const saved = { ...body, id: `ep_${sessionId}`, userId: sessionId, updatedAt: nowIso };
      writeBucket(sessionId, 'emergency_profile', saved);
      return saved;
    }
    if (method === 'DELETE') {
      writeBucket(sessionId, 'emergency_profile', null);
      return { success: true };
    }
  }

  return undefined;
}
