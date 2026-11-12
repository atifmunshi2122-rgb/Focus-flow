import { Router, Request, Response } from 'express';
import {
  dbService,
  Task,
  FocusSession,
  IncomeTransaction,
  ExpenseTransaction,
  RecurringExpense,
  Bill,
  SavingsGoal,
} from './db.js';
import { AuthenticatedRequest, requireUserContext } from './auth.js';
import {
  ALLOWED_CATEGORY_TYPES,
  ALLOWED_CURRENCIES,
  ALLOWED_FOCUS_MODES,
  ALLOWED_PAYMENT_METHODS,
  ALLOWED_RECURRENCES,
  ALLOWED_TASK_PRIORITIES,
  ALLOWED_TASK_RECURRENCES,
  ALLOWED_TASK_STATUSES,
  ALLOWED_THEMES,
  calculateBoundedStreakDays,
  computeBestStreakDays,
  computeNextRecurrenceDueDate,
  parseEnum,
  parseIsoDate,
  parseNonEmptyString,
  parseNonNegativeInt,
  parseOptionalString,
  parsePositiveInt,
  parseSubtasks,
} from './validation.js';

export const apiRouter = Router();

// Enforce authenticated token verification (or isolated guest session in non-strict dev/demo mode)
apiRouter.use(requireUserContext);

const getAuth = (req: Request) => (req as AuthenticatedRequest).auth;

// ----------------------------------------------------
// User & Settings
// ----------------------------------------------------
apiRouter.get('/auth/me', (req: Request, res: Response) => {
  const auth = getAuth(req);
  const { user, settings } = dbService.ensureUserWorkspace(auth.userId, auth);
  res.json({ user, settings });
});

apiRouter.put('/settings', (req: Request, res: Response) => {
  const auth = getAuth(req);
  const { settings } = dbService.ensureUserWorkspace(auth.userId, auth);

  const body = (req.body && typeof req.body === 'object' ? req.body : {}) as Record<string, unknown>;
  const {
    currency,
    pomodoroWorkDuration,
    shortBreakDuration,
    longBreakDuration,
    autoSwitchSessions,
    soundEnabled,
    theme,
    themeConfig,
    savedThemes,
    activeSavedThemeId,
    googleSpreadsheetId,
    lastSyncedAt,
    dailyFocusGoalMinutes,
    weeklyFocusGoalMinutes,
    monthlyBudgetPaise,
    categoryBudgets,
    dashboardLayout,
    notificationPrefs,
    favoriteStyleIds,
    favoriteThemeIds,
    keyboardShortcutsEnabled,
  } = body;

  if (currency !== undefined) {
    const parsedCurrency = parseEnum(currency, ALLOWED_CURRENCIES);
    if (!parsedCurrency) {
      res.status(400).json({ error: 'Invalid currency code' });
      return;
    }
    settings.currency = parsedCurrency;
  }

  if (pomodoroWorkDuration !== undefined) {
    const parsedWork = parsePositiveInt(pomodoroWorkDuration, 1, 180);
    if (parsedWork === null) {
      res.status(400).json({ error: 'pomodoroWorkDuration must be a whole number between 1 and 180' });
      return;
    }
    settings.pomodoroWorkDuration = parsedWork;
  }

  if (shortBreakDuration !== undefined) {
    const parsedShort = parsePositiveInt(shortBreakDuration, 1, 60);
    if (parsedShort === null) {
      res.status(400).json({ error: 'shortBreakDuration must be a whole number between 1 and 60' });
      return;
    }
    settings.shortBreakDuration = parsedShort;
  }

  if (longBreakDuration !== undefined) {
    const parsedLong = parsePositiveInt(longBreakDuration, 1, 120);
    if (parsedLong === null) {
      res.status(400).json({ error: 'longBreakDuration must be a whole number between 1 and 120' });
      return;
    }
    settings.longBreakDuration = parsedLong;
  }

  if (autoSwitchSessions !== undefined) {
    if (typeof autoSwitchSessions !== 'boolean') {
      res.status(400).json({ error: 'autoSwitchSessions must be a boolean' });
      return;
    }
    settings.autoSwitchSessions = autoSwitchSessions;
  }

  if (soundEnabled !== undefined) {
    if (typeof soundEnabled !== 'boolean') {
      res.status(400).json({ error: 'soundEnabled must be a boolean' });
      return;
    }
    settings.soundEnabled = soundEnabled;
  }

  if (theme !== undefined) {
    const parsedTheme = parseEnum(theme, ALLOWED_THEMES);
    if (!parsedTheme) {
      res.status(400).json({ error: 'Invalid theme mode' });
      return;
    }
    settings.theme = parsedTheme;
  }

  if (themeConfig !== undefined) {
    if (typeof themeConfig !== 'object' || themeConfig === null || Array.isArray(themeConfig)) {
      res.status(400).json({ error: 'Invalid themeConfig object' });
      return;
    }
    settings.themeConfig = themeConfig as Record<string, unknown>;
  }

  if (savedThemes !== undefined) {
    if (!Array.isArray(savedThemes)) {
      res.status(400).json({ error: 'savedThemes must be an array' });
      return;
    }
    settings.savedThemes = savedThemes as Array<Record<string, unknown>>;
  }

  if (activeSavedThemeId !== undefined) {
    if (activeSavedThemeId !== null && typeof activeSavedThemeId !== 'string') {
      res.status(400).json({ error: 'Invalid activeSavedThemeId' });
      return;
    }
    settings.activeSavedThemeId = activeSavedThemeId;
  }

  if (googleSpreadsheetId !== undefined) {
    if (googleSpreadsheetId !== null && typeof googleSpreadsheetId !== 'string') {
      res.status(400).json({ error: 'Invalid googleSpreadsheetId' });
      return;
    }
    settings.googleSpreadsheetId = googleSpreadsheetId ?? undefined;
  }

  if (lastSyncedAt !== undefined) {
    if (lastSyncedAt !== null && typeof lastSyncedAt !== 'string') {
      res.status(400).json({ error: 'Invalid lastSyncedAt' });
      return;
    }
    settings.lastSyncedAt = lastSyncedAt ?? undefined;
  }

  if (dailyFocusGoalMinutes !== undefined) {
    const parsedGoal = parsePositiveInt(dailyFocusGoalMinutes, 5, 720);
    if (parsedGoal === null) {
      res.status(400).json({ error: 'dailyFocusGoalMinutes must be between 5 and 720' });
      return;
    }
    settings.dailyFocusGoalMinutes = parsedGoal;
  }

  if (weeklyFocusGoalMinutes !== undefined) {
    const parsedWeekly = parsePositiveInt(weeklyFocusGoalMinutes, 30, 5040);
    if (parsedWeekly === null) {
      res.status(400).json({ error: 'weeklyFocusGoalMinutes must be between 30 and 5040' });
      return;
    }
    settings.weeklyFocusGoalMinutes = parsedWeekly;
  }

  if (monthlyBudgetPaise !== undefined) {
    const parsedBudget = parseNonNegativeInt(monthlyBudgetPaise, 1_000_000_000);
    if (parsedBudget === null) {
      res.status(400).json({ error: 'monthlyBudgetPaise must be a non-negative integer' });
      return;
    }
    settings.monthlyBudgetPaise = parsedBudget;
  }

  if (categoryBudgets !== undefined) {
    if (typeof categoryBudgets !== 'object' || categoryBudgets === null || Array.isArray(categoryBudgets)) {
      res.status(400).json({ error: 'categoryBudgets must be a key-value map' });
      return;
    }
    const cleanMap: Record<string, number> = {};
    for (const [k, v] of Object.entries(categoryBudgets as Record<string, unknown>)) {
      const parsedVal = parseNonNegativeInt(v, 1_000_000_000);
      if (parsedVal === null) {
        res.status(400).json({ error: `Invalid budget value for category ${k}` });
        return;
      }
      cleanMap[k] = parsedVal;
    }
    settings.categoryBudgets = cleanMap;
  }

  if (dashboardLayout !== undefined) {
    if (typeof dashboardLayout !== 'object' || dashboardLayout === null || Array.isArray(dashboardLayout)) {
      res.status(400).json({ error: 'Invalid dashboardLayout object' });
      return;
    }
    settings.dashboardLayout = dashboardLayout as Record<string, unknown>;
  }

  if (notificationPrefs !== undefined) {
    if (typeof notificationPrefs !== 'object' || notificationPrefs === null || Array.isArray(notificationPrefs)) {
      res.status(400).json({ error: 'Invalid notificationPrefs object' });
      return;
    }
    settings.notificationPrefs = notificationPrefs as Record<string, unknown>;
  }

  if (favoriteStyleIds !== undefined) {
    if (!Array.isArray(favoriteStyleIds) || !favoriteStyleIds.every((x) => typeof x === 'string')) {
      res.status(400).json({ error: 'favoriteStyleIds must be an array of strings' });
      return;
    }
    settings.favoriteStyleIds = favoriteStyleIds;
  }

  if (favoriteThemeIds !== undefined) {
    if (!Array.isArray(favoriteThemeIds) || !favoriteThemeIds.every((x) => typeof x === 'string')) {
      res.status(400).json({ error: 'favoriteThemeIds must be an array of strings' });
      return;
    }
    settings.favoriteThemeIds = favoriteThemeIds;
  }

  if (keyboardShortcutsEnabled !== undefined) {
    if (typeof keyboardShortcutsEnabled !== 'boolean') {
      res.status(400).json({ error: 'keyboardShortcutsEnabled must be a boolean' });
      return;
    }
    settings.keyboardShortcutsEnabled = keyboardShortcutsEnabled;
  }

  dbService.save();
  res.json({ success: true, settings });
});

apiRouter.post('/reseed', (req: Request, res: Response) => {
  const { userId } = getAuth(req);
  dbService.reseed(userId);
  res.json({ success: true, message: 'Workspace reset to starter seed data' });
});

// ----------------------------------------------------
// Unified Dashboard
// ----------------------------------------------------
apiRouter.get('/dashboard', (req: Request, res: Response) => {
  const auth = getAuth(req);
  const userId = auth.userId;
  dbService.ensureUserWorkspace(userId, auth);
  dbService.checkRecurringBills(userId);
  const db = dbService.getRaw();

  const now = new Date();
  const todayStr = now.toISOString().split('T')[0];
  const currentMonthKey = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;

  // 7-day start (Monday)
  const day = now.getDay();
  const diffToMonday = (day + 6) % 7;
  const startOfWeek = new Date(now);
  startOfWeek.setDate(now.getDate() - diffToMonday);
  const weekStartStr = startOfWeek.toISOString().split('T')[0];

  // 1. Focus metrics
  const userSessions = db.focusSessions.filter((s) => s.userId === userId);
  const todaySessions = userSessions.filter((s) => s.startedAt.startsWith(todayStr) && s.completed);
  const weekSessions = userSessions.filter(
    (s) => s.completed && s.mode === 'work' && s.startedAt.slice(0, 10) >= weekStartStr
  );

  const todayFocusSeconds = todaySessions.reduce((acc, s) => acc + s.durationSeconds, 0);
  const weeklyFocusMinutes = Math.round(
    weekSessions.reduce((acc, s) => acc + s.durationSeconds, 0) / 60
  );
  const completedPomodoroSessions = todaySessions.filter((s) => s.mode === 'work').length;
  const streak = calculateBoundedStreakDays(userSessions, now);
  const bestStreakDays = computeBestStreakDays(userSessions);

  // Tasks summary (exclude trashed)
  const activeTasks = db.tasks.filter((t) => t.userId === userId && !t.deletedAt);
  const completedTasksCount = activeTasks.filter((t) => t.status === 'completed').length;
  const pendingTasksCount = activeTasks.filter((t) => t.status !== 'completed').length;

  // 2. Financial Metrics for current month & today (exclude trashed)
  const activeIncomes = db.incomeTransactions.filter(
    (inc) => inc.userId === userId && !inc.deletedAt
  );
  const currentIncomes = activeIncomes.filter((inc) => inc.date.startsWith(currentMonthKey));
  const monthlyIncomePaise = currentIncomes.reduce((acc, inc) => acc + inc.amountPaise, 0);
  const todayIncomePaise = activeIncomes
    .filter((inc) => inc.date === todayStr)
    .reduce((acc, inc) => acc + inc.amountPaise, 0);

  const activeExpenses = db.expenseTransactions.filter(
    (exp) => exp.userId === userId && !exp.deletedAt
  );
  const currentExpenses = activeExpenses.filter((exp) => exp.date.startsWith(currentMonthKey));
  const monthlyExpensesPaise = currentExpenses.reduce((acc, exp) => acc + exp.amountPaise, 0);
  const todayExpensesPaise = activeExpenses
    .filter((exp) => exp.date === todayStr)
    .reduce((acc, exp) => acc + exp.amountPaise, 0);

  const fixedExpensesPaise = currentExpenses
    .filter((e) => e.type === 'fixed')
    .reduce((acc, e) => acc + e.amountPaise, 0);

  const variableExpensesPaise = currentExpenses
    .filter((e) => e.type === 'variable')
    .reduce((acc, e) => acc + e.amountPaise, 0);

  const remainingBalancePaise = monthlyIncomePaise - monthlyExpensesPaise;

  // 3. Bills metrics (exclude trashed)
  const activeBills = db.bills.filter((b) => b.userId === userId && !b.deletedAt);
  const currentBills = activeBills.filter(
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

  const upcomingPayments = activeBills
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
      db.categories.find((c) => c.id === exp.categoryId)?.name ||
      (exp.type === 'fixed' ? 'Fixed Expense' : 'Variable Expense'),
    amountPaise: exp.amountPaise,
    date: exp.date,
    notes: exp.notes,
    paymentMethod: exp.paymentMethod,
  }));

  const recentTransactions = [...recentIncome, ...recentExpense]
    .sort((a, b) => b.date.localeCompare(a.date))
    .slice(0, 8);

  res.json({
    todayFocusMinutes: Math.round(todayFocusSeconds / 60),
    weeklyFocusMinutes,
    completedPomodoroSessions,
    focusStreakDays: streak,
    bestStreakDays,
    completedTasksCount,
    pendingTasksCount,
    todayIncomePaise,
    todayExpensesPaise,
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
  });
});

// ----------------------------------------------------
// Focus & Pomodoro
// ----------------------------------------------------
apiRouter.get('/focus/sessions', (req: Request, res: Response) => {
  const { userId } = getAuth(req);
  const db = dbService.getRaw();
  const sessions = db.focusSessions
    .filter((s) => s.userId === userId)
    .sort((a, b) => b.startedAt.localeCompare(a.startedAt));
  res.json(sessions);
});

apiRouter.post('/focus/sessions', (req: Request, res: Response) => {
  const { userId } = getAuth(req);
  const db = dbService.getRaw();
  const body = (req.body && typeof req.body === 'object' ? req.body : {}) as Record<string, unknown>;
  const { taskId, mode, durationMinutes, durationSeconds, completed, startedAt, endedAt } = body;

  const parsedMode = mode === undefined ? 'work' : parseEnum(mode, ALLOWED_FOCUS_MODES);
  if (!parsedMode) {
    res.status(400).json({ error: 'Invalid focus session mode' });
    return;
  }

  const parsedMinutes =
    durationMinutes === undefined ? 25 : parsePositiveInt(durationMinutes, 1, 180);
  if (parsedMinutes === null) {
    res.status(400).json({ error: 'durationMinutes must be a positive integer between 1 and 180' });
    return;
  }

  const parsedSeconds =
    durationSeconds === undefined
      ? parsedMinutes * 60
      : parsePositiveInt(durationSeconds, 1, 10800);
  if (parsedSeconds === null) {
    res.status(400).json({ error: 'durationSeconds must be a positive integer between 1 and 10800' });
    return;
  }

  if (completed !== undefined && typeof completed !== 'boolean') {
    res.status(400).json({ error: 'completed must be a boolean' });
    return;
  }

  if (taskId !== undefined && taskId !== null && typeof taskId !== 'string') {
    res.status(400).json({ error: 'Invalid taskId' });
    return;
  }

  const startIso =
    typeof startedAt === 'string' && !Number.isNaN(Date.parse(startedAt))
      ? startedAt
      : new Date().toISOString();
  const endIso =
    typeof endedAt === 'string' && !Number.isNaN(Date.parse(endedAt))
      ? endedAt
      : new Date().toISOString();

  let taskTitle: string | undefined;
  const resolvedTaskId = typeof taskId === 'string' && taskId.trim() ? taskId.trim() : null;
  if (resolvedTaskId) {
    const task = db.tasks.find((t) => t.id === resolvedTaskId && t.userId === userId && !t.deletedAt);
    if (task) {
      taskTitle = task.title;
      if ((completed ?? true) && parsedMode === 'work') {
        task.completedPomodoros = (task.completedPomodoros || 0) + 1;
        task.updatedAt = new Date().toISOString();
      }
    }
  }

  const session: FocusSession = {
    id: `foc_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
    userId,
    taskId: resolvedTaskId,
    taskTitle,
    mode: parsedMode,
    durationMinutes: parsedMinutes,
    durationSeconds: parsedSeconds,
    completed: completed !== undefined ? completed : true,
    startedAt: startIso,
    endedAt: endIso,
  };

  db.focusSessions.push(session);
  dbService.save();
  res.status(201).json(session);
});

apiRouter.get('/focus/stats', (req: Request, res: Response) => {
  const { userId } = getAuth(req);
  const db = dbService.getRaw();
  const sessions = db.focusSessions.filter((s) => s.userId === userId && s.completed);

  const last7Days: { date: string; dayName: string; minutes: number; sessionsCount: number }[] = [];
  const dayNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

  for (let i = 6; i >= 0; i--) {
    const d = new Date();
    d.setDate(d.getDate() - i);
    const dateStr = d.toISOString().split('T')[0];
    const dayName = dayNames[d.getDay()];

    const daysSessions = sessions.filter((s) => s.startedAt.startsWith(dateStr) && s.mode === 'work');
    const totalSecs = daysSessions.reduce((acc, s) => acc + s.durationSeconds, 0);

    last7Days.push({
      date: dateStr,
      dayName,
      minutes: Math.round(totalSecs / 60),
      sessionsCount: daysSessions.length,
    });
  }

  // 84-day calendar heatmap (12 weeks)
  const dailyHeatmap: { date: string; minutes: number; sessionsCount: number }[] = [];
  for (let i = 83; i >= 0; i--) {
    const d = new Date();
    d.setDate(d.getDate() - i);
    const dateStr = d.toISOString().split('T')[0];
    const daySessions = sessions.filter((s) => s.startedAt.startsWith(dateStr) && s.mode === 'work');
    const totalSecs = daySessions.reduce((acc, s) => acc + s.durationSeconds, 0);
    dailyHeatmap.push({
      date: dateStr,
      minutes: Math.round(totalSecs / 60),
      sessionsCount: daySessions.length,
    });
  }

  const weeklyMinutes = last7Days.reduce((acc, d) => acc + d.minutes, 0);

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

  res.json({
    last7Days,
    dailyHeatmap,
    weeklyMinutes,
    monthMinutes,
    monthSessionsCount: monthSessions.length,
    totalMinutes,
    totalCompletedSessions,
  });
});

// ----------------------------------------------------
// Tasks
// ----------------------------------------------------
apiRouter.get('/tasks', (req: Request, res: Response) => {
  const { userId } = getAuth(req);
  const db = dbService.getRaw();
  const tasks = db.tasks
    .filter((t) => t.userId === userId && !t.deletedAt)
    .sort((a, b) => {
      if (typeof a.order === 'number' && typeof b.order === 'number' && a.order !== b.order) {
        return a.order - b.order;
      }
      return b.createdAt.localeCompare(a.createdAt);
    });
  res.json(tasks);
});

apiRouter.post('/tasks', (req: Request, res: Response) => {
  const { userId } = getAuth(req);
  const db = dbService.getRaw();
  const body = (req.body && typeof req.body === 'object' ? req.body : {}) as Record<string, unknown>;
  const { title, description, priority, status, estimatedPomodoros, dueDate, category, subtasks, recurrence, order } = body;

  const parsedTitle = parseNonEmptyString(title, 200);
  if (!parsedTitle) {
    res.status(400).json({ error: 'Title is required and must be a non-empty string' });
    return;
  }

  const parsedDesc = parseOptionalString(description, 2000);
  if (parsedDesc === null) {
    res.status(400).json({ error: 'Description must be a string' });
    return;
  }

  const parsedPriority =
    priority === undefined ? 'medium' : parseEnum(priority, ALLOWED_TASK_PRIORITIES);
  if (!parsedPriority) {
    res.status(400).json({ error: 'Invalid task priority' });
    return;
  }

  const parsedStatus =
    status === undefined ? 'todo' : parseEnum(status, ALLOWED_TASK_STATUSES);
  if (!parsedStatus) {
    res.status(400).json({ error: 'Invalid task status' });
    return;
  }

  const parsedRecurrence =
    recurrence === undefined ? 'none' : parseEnum(recurrence, ALLOWED_TASK_RECURRENCES);
  if (!parsedRecurrence) {
    res.status(400).json({ error: 'Invalid task recurrence' });
    return;
  }

  const parsedEst =
    estimatedPomodoros === undefined ? 1 : parsePositiveInt(estimatedPomodoros, 1, 100);
  if (parsedEst === null) {
    res.status(400).json({ error: 'estimatedPomodoros must be a positive integer between 1 and 100' });
    return;
  }

  let parsedDueDate: string | null = null;
  if (dueDate !== undefined && dueDate !== null && dueDate !== '') {
    parsedDueDate = parseIsoDate(dueDate);
    if (!parsedDueDate) {
      res.status(400).json({ error: 'dueDate must be a valid YYYY-MM-DD date' });
      return;
    }
  }

  const parsedCategory =
    category === undefined || category === '' ? 'General' : parseNonEmptyString(category, 60);
  if (!parsedCategory) {
    res.status(400).json({ error: 'Invalid category' });
    return;
  }

  const parsedSubtasks = subtasks === undefined ? [] : parseSubtasks(subtasks);
  if (parsedSubtasks === null) {
    res.status(400).json({ error: 'Invalid subtasks array' });
    return;
  }

  const parsedOrder =
    order === undefined ? 0 : parseNonNegativeInt(order, 100_000);
  if (parsedOrder === null) {
    res.status(400).json({ error: 'Invalid task order index' });
    return;
  }

  const nowIso = new Date().toISOString();
  const newTask: Task = {
    id: `tsk_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
    userId,
    title: parsedTitle,
    description: parsedDesc,
    priority: parsedPriority,
    status: parsedStatus,
    category: parsedCategory,
    subtasks: parsedSubtasks,
    recurrence: parsedRecurrence,
    order: parsedOrder,
    estimatedPomodoros: parsedEst,
    completedPomodoros: 0,
    dueDate: parsedDueDate,
    completedAt: parsedStatus === 'completed' ? nowIso : null,
    deletedAt: null,
    createdAt: nowIso,
    updatedAt: nowIso,
  };

  db.tasks.unshift(newTask);
  dbService.save();
  res.status(201).json(newTask);
});

apiRouter.put('/tasks/:id', (req: Request, res: Response) => {
  const { userId } = getAuth(req);
  const db = dbService.getRaw();
  const task = db.tasks.find((t) => t.id === req.params.id && t.userId === userId && !t.deletedAt);

  if (!task) {
    res.status(404).json({ error: 'Task not found' });
    return;
  }

  const body = (req.body && typeof req.body === 'object' ? req.body : {}) as Record<string, unknown>;
  const {
    title,
    description,
    priority,
    status,
    category,
    subtasks,
    recurrence,
    order,
    estimatedPomodoros,
    completedPomodoros,
    dueDate,
  } = body;

  const previousStatus = task.status;

  if (title !== undefined) {
    const parsedTitle = parseNonEmptyString(title, 200);
    if (!parsedTitle) {
      res.status(400).json({ error: 'Title must be a non-empty string' });
      return;
    }
    task.title = parsedTitle;
  }

  if (description !== undefined) {
    const parsedDesc = parseOptionalString(description, 2000);
    if (parsedDesc === null) {
      res.status(400).json({ error: 'Description must be a string' });
      return;
    }
    task.description = parsedDesc;
  }

  if (priority !== undefined) {
    const parsedPriority = parseEnum(priority, ALLOWED_TASK_PRIORITIES);
    if (!parsedPriority) {
      res.status(400).json({ error: 'Invalid task priority' });
      return;
    }
    task.priority = parsedPriority;
  }

  if (status !== undefined) {
    const parsedStatus = parseEnum(status, ALLOWED_TASK_STATUSES);
    if (!parsedStatus) {
      res.status(400).json({ error: 'Invalid task status' });
      return;
    }
    task.status = parsedStatus;
    task.completedAt = parsedStatus === 'completed' ? new Date().toISOString() : null;
  }

  if (category !== undefined) {
    const parsedCategory = parseNonEmptyString(category, 60);
    if (!parsedCategory) {
      res.status(400).json({ error: 'category must be a non-empty string' });
      return;
    }
    task.category = parsedCategory;
  }

  if (subtasks !== undefined) {
    const parsedSubtasks = parseSubtasks(subtasks);
    if (parsedSubtasks === null) {
      res.status(400).json({ error: 'Invalid subtasks array' });
      return;
    }
    task.subtasks = parsedSubtasks;
  }

  if (recurrence !== undefined) {
    const parsedRecurrence = parseEnum(recurrence, ALLOWED_TASK_RECURRENCES);
    if (!parsedRecurrence) {
      res.status(400).json({ error: 'Invalid recurrence value' });
      return;
    }
    task.recurrence = parsedRecurrence;
  }

  if (order !== undefined) {
    const parsedOrder = parseNonNegativeInt(order, 100_000);
    if (parsedOrder === null) {
      res.status(400).json({ error: 'Invalid order index' });
      return;
    }
    task.order = parsedOrder;
  }

  if (estimatedPomodoros !== undefined) {
    const parsedEst = parsePositiveInt(estimatedPomodoros, 1, 100);
    if (parsedEst === null) {
      res.status(400).json({ error: 'estimatedPomodoros must be an integer between 1 and 100' });
      return;
    }
    task.estimatedPomodoros = parsedEst;
  }

  if (completedPomodoros !== undefined) {
    const parsedCompleted = parseNonNegativeInt(completedPomodoros, 100);
    if (parsedCompleted === null) {
      res.status(400).json({ error: 'completedPomodoros must be a non-negative integer' });
      return;
    }
    task.completedPomodoros = parsedCompleted;
  }

  if (dueDate !== undefined) {
    if (dueDate === null || dueDate === '') {
      task.dueDate = null;
    } else {
      const parsedDue = parseIsoDate(dueDate);
      if (!parsedDue) {
        res.status(400).json({ error: 'dueDate must be null or YYYY-MM-DD' });
        return;
      }
      task.dueDate = parsedDue;
    }
  }

  const nowIso = new Date().toISOString();
  task.updatedAt = nowIso;

  // Auto-spawn next occurrence when a recurring task transitions to completed
  if (
    previousStatus !== 'completed' &&
    task.status === 'completed' &&
    task.recurrence &&
    task.recurrence !== 'none'
  ) {
    const nextDue = computeNextRecurrenceDueDate(task.dueDate, task.recurrence);
    const nextTask: Task = {
      id: `tsk_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
      userId,
      title: task.title,
      description: task.description,
      priority: task.priority,
      status: 'todo',
      category: task.category || 'General',
      subtasks: (task.subtasks || []).map((s) => ({ ...s, done: false })),
      recurrence: task.recurrence,
      order: task.order ?? 0,
      estimatedPomodoros: task.estimatedPomodoros,
      completedPomodoros: 0,
      dueDate: nextDue,
      completedAt: null,
      deletedAt: null,
      createdAt: nowIso,
      updatedAt: nowIso,
    };
    db.tasks.unshift(nextTask);
  }

  dbService.save();
  res.json(task);
});

apiRouter.delete('/tasks/:id', (req: Request, res: Response) => {
  const { userId } = getAuth(req);
  const db = dbService.getRaw();
  const task = db.tasks.find((t) => t.id === req.params.id && t.userId === userId && !t.deletedAt);

  if (!task) {
    res.status(404).json({ error: 'Task not found' });
    return;
  }

  task.deletedAt = new Date().toISOString();
  task.updatedAt = task.deletedAt;
  dbService.save();
  res.json({ success: true, message: 'Task moved to trash' });
});

// ----------------------------------------------------
// Categories
// ----------------------------------------------------
apiRouter.get('/finance/categories', (req: Request, res: Response) => {
  const auth = getAuth(req);
  dbService.ensureUserWorkspace(auth.userId, auth);
  const db = dbService.getRaw();
  const categories = db.categories.filter((c) => c.userId === auth.userId || c.userId === 'system');
  res.json(categories);
});

apiRouter.post('/finance/categories', (req: Request, res: Response) => {
  const { userId } = getAuth(req);
  const db = dbService.getRaw();
  const body = (req.body && typeof req.body === 'object' ? req.body : {}) as Record<string, unknown>;
  const { name, type, icon, color } = body;

  const parsedName = parseNonEmptyString(name, 80);
  if (!parsedName) {
    res.status(400).json({ error: 'Category name is required' });
    return;
  }

  const parsedType = type === undefined ? 'both' : parseEnum(type, ALLOWED_CATEGORY_TYPES);
  if (!parsedType) {
    res.status(400).json({ error: 'Invalid category type' });
    return;
  }

  const category = {
    id: `cat_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
    userId,
    name: parsedName,
    type: parsedType,
    icon: typeof icon === 'string' && icon.trim() ? icon.trim() : 'Tag',
    color: typeof color === 'string' && /^#[0-9a-fA-F]{6}$/.test(color.trim()) ? color.trim() : '#6366f1',
  };

  db.categories.push(category);
  dbService.save();
  res.status(201).json(category);
});

// ----------------------------------------------------
// Finance: Summary & Analytics with Filter
// ----------------------------------------------------
apiRouter.get('/finance/summary', (req: Request, res: Response) => {
  const auth = getAuth(req);
  const userId = auth.userId;
  dbService.ensureUserWorkspace(userId, auth);
  dbService.checkRecurringBills(userId);
  const db = dbService.getRaw();

  const filter = (req.query.filter as string) || 'this_month';
  const customStart = req.query.startDate as string;
  const customEnd = req.query.endDate as string;

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
  } else if (filter === 'this_month') {
    startDateStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-01`;
    endDateStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-31`;
  } else if (filter === 'last_month') {
    const lastMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    const lastDay = new Date(now.getFullYear(), now.getMonth(), 0).getDate();
    startDateStr = `${lastMonth.getFullYear()}-${String(lastMonth.getMonth() + 1).padStart(2, '0')}-01`;
    endDateStr = `${lastMonth.getFullYear()}-${String(lastMonth.getMonth() + 1).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`;
  } else if (filter === 'custom' && customStart && customEnd) {
    const validStart = parseIsoDate(customStart);
    const validEnd = parseIsoDate(customEnd);
    if (!validStart || !validEnd) {
      res.status(400).json({ error: 'Custom range requires valid YYYY-MM-DD startDate and endDate' });
      return;
    }
    startDateStr = validStart;
    endDateStr = validEnd;
  } else {
    startDateStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-01`;
    endDateStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-31`;
  }

  const incomes = db.incomeTransactions.filter(
    (inc) => inc.userId === userId && !inc.deletedAt && inc.date >= startDateStr && inc.date <= endDateStr
  );
  const totalIncomePaise = incomes.reduce((acc, inc) => acc + inc.amountPaise, 0);

  const expenses = db.expenseTransactions.filter(
    (exp) => exp.userId === userId && !exp.deletedAt && exp.date >= startDateStr && exp.date <= endDateStr
  );
  const totalExpensePaise = expenses.reduce((acc, exp) => acc + exp.amountPaise, 0);
  const fixedExpensesPaise = expenses
    .filter((e) => e.type === 'fixed')
    .reduce((acc, e) => acc + e.amountPaise, 0);
  const variableExpensesPaise = expenses
    .filter((e) => e.type === 'variable')
    .reduce((acc, e) => acc + e.amountPaise, 0);

  const remainingBalancePaise = totalIncomePaise - totalExpensePaise;

  const bills = db.bills.filter(
    (b) => b.userId === userId && !b.deletedAt && b.dueDate >= startDateStr && b.dueDate <= endDateStr
  );
  const paidBills = bills.filter((b) => b.status === 'PAID');
  const unpaidBills = bills.filter((b) => b.status === 'UNPAID' || b.status === 'OVERDUE');

  const totalPaidAmountPaise = paidBills.reduce((acc, b) => acc + b.amountPaise, 0);
  const totalUnpaidAmountPaise = unpaidBills.reduce((acc, b) => acc + b.amountPaise, 0);

  const categoryMap: {
    [catId: string]: { categoryId: string; name: string; color: string; amountPaise: number };
  } = {};
  for (const exp of expenses) {
    const cat = db.categories.find((c) => c.id === exp.categoryId);
    const catId = exp.categoryId || 'other';
    const catName = cat?.name || (exp.type === 'fixed' ? 'Fixed Expense' : 'Variable Expense');
    const catColor = cat?.color || '#94a3b8';

    if (!categoryMap[catId]) {
      categoryMap[catId] = { categoryId: catId, name: catName, color: catColor, amountPaise: 0 };
    }
    categoryMap[catId].amountPaise += exp.amountPaise;
  }
  const categoryBreakdown = Object.values(categoryMap).sort((a, b) => b.amountPaise - a.amountPaise);

  const monthlyTrend: { month: string; incomePaise: number; expensePaise: number }[] = [];
  const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  for (let m = 5; m >= 0; m--) {
    const d = new Date(now.getFullYear(), now.getMonth() - m, 1);
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
    const label = `${monthNames[d.getMonth()]} ${String(d.getFullYear()).slice(-2)}`;

    const mInc = db.incomeTransactions
      .filter((inc) => inc.userId === userId && !inc.deletedAt && inc.date.startsWith(key))
      .reduce((acc, inc) => acc + inc.amountPaise, 0);

    const mExp = db.expenseTransactions
      .filter((exp) => exp.userId === userId && !exp.deletedAt && exp.date.startsWith(key))
      .reduce((acc, exp) => acc + exp.amountPaise, 0);

    monthlyTrend.push({
      month: label,
      incomePaise: mInc,
      expensePaise: mExp,
    });
  }

  res.json({
    filter,
    startDate: startDateStr,
    endDate: endDateStr,
    totalIncomePaise,
    totalExpensePaise,
    fixedExpensesPaise,
    variableExpensesPaise,
    remainingBalancePaise,
    totalPaidAmountPaise,
    totalUnpaidAmountPaise,
    paidBillsCount: paidBills.length,
    unpaidBillsCount: unpaidBills.length,
    categoryBreakdown,
    monthlyTrend,
  });
});

// ----------------------------------------------------
// Income Management
// ----------------------------------------------------
apiRouter.get('/finance/income', (req: Request, res: Response) => {
  const { userId } = getAuth(req);
  const db = dbService.getRaw();
  const incomes = db.incomeTransactions
    .filter((inc) => inc.userId === userId && !inc.deletedAt)
    .sort((a, b) => b.date.localeCompare(a.date));
  res.json(incomes);
});

apiRouter.post('/finance/income', (req: Request, res: Response) => {
  const { userId } = getAuth(req);
  const db = dbService.getRaw();
  const body = (req.body && typeof req.body === 'object' ? req.body : {}) as Record<string, unknown>;
  const { source, amountPaise, date, category, notes } = body;

  const parsedSource = parseNonEmptyString(source, 200);
  if (!parsedSource) {
    res.status(400).json({ error: 'Income source is required' });
    return;
  }

  const parsedAmount = parsePositiveInt(amountPaise, 1, 1_000_000_000);
  if (parsedAmount === null) {
    res.status(400).json({ error: 'Valid positive integer amountPaise is required' });
    return;
  }

  const parsedDate =
    date === undefined || date === ''
      ? new Date().toISOString().split('T')[0]
      : parseIsoDate(date);
  if (!parsedDate) {
    res.status(400).json({ error: 'date must be YYYY-MM-DD' });
    return;
  }

  const parsedCategory = category === undefined ? 'Salary' : parseNonEmptyString(category, 80);
  if (!parsedCategory) {
    res.status(400).json({ error: 'Invalid category' });
    return;
  }

  const parsedNotes = parseOptionalString(notes, 1000);
  if (parsedNotes === null) {
    res.status(400).json({ error: 'notes must be a string' });
    return;
  }

  const newIncome: IncomeTransaction = {
    id: `inc_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
    userId,
    source: parsedSource,
    amountPaise: parsedAmount,
    date: parsedDate,
    category: parsedCategory,
    notes: parsedNotes,
    deletedAt: null,
    createdAt: new Date().toISOString(),
  };

  db.incomeTransactions.unshift(newIncome);
  dbService.save();
  res.status(201).json(newIncome);
});

apiRouter.put('/finance/income/:id', (req: Request, res: Response) => {
  const { userId } = getAuth(req);
  const db = dbService.getRaw();
  const income = db.incomeTransactions.find(
    (inc) => inc.id === req.params.id && inc.userId === userId && !inc.deletedAt
  );

  if (!income) {
    res.status(404).json({ error: 'Income record not found' });
    return;
  }

  const body = (req.body && typeof req.body === 'object' ? req.body : {}) as Record<string, unknown>;
  const { source, amountPaise, date, category, notes } = body;

  if (source !== undefined) {
    const parsedSource = parseNonEmptyString(source, 200);
    if (!parsedSource) {
      res.status(400).json({ error: 'source must be a non-empty string' });
      return;
    }
    income.source = parsedSource;
  }

  if (amountPaise !== undefined) {
    const parsedAmount = parsePositiveInt(amountPaise, 1, 1_000_000_000);
    if (parsedAmount === null) {
      res.status(400).json({ error: 'amountPaise must be a positive integer' });
      return;
    }
    income.amountPaise = parsedAmount;
  }

  if (date !== undefined) {
    const parsedDate = parseIsoDate(date);
    if (!parsedDate) {
      res.status(400).json({ error: 'date must be YYYY-MM-DD' });
      return;
    }
    income.date = parsedDate;
  }

  if (category !== undefined) {
    const parsedCategory = parseNonEmptyString(category, 80);
    if (!parsedCategory) {
      res.status(400).json({ error: 'category must be a non-empty string' });
      return;
    }
    income.category = parsedCategory;
  }

  if (notes !== undefined) {
    const parsedNotes = parseOptionalString(notes, 1000);
    if (parsedNotes === null) {
      res.status(400).json({ error: 'notes must be a string' });
      return;
    }
    income.notes = parsedNotes;
  }

  dbService.save();
  res.json(income);
});

apiRouter.delete('/finance/income/:id', (req: Request, res: Response) => {
  const { userId } = getAuth(req);
  const db = dbService.getRaw();
  const income = db.incomeTransactions.find(
    (inc) => inc.id === req.params.id && inc.userId === userId && !inc.deletedAt
  );

  if (!income) {
    res.status(404).json({ error: 'Income record not found' });
    return;
  }

  income.deletedAt = new Date().toISOString();
  dbService.save();
  res.json({ success: true, message: 'Income record moved to trash' });
});

// ----------------------------------------------------
// Expenses (Variable & All)
// ----------------------------------------------------
apiRouter.get('/finance/expenses', (req: Request, res: Response) => {
  const { userId } = getAuth(req);
  const db = dbService.getRaw();
  const typeFilter = req.query.type as string;

  let expenses = db.expenseTransactions.filter((e) => e.userId === userId && !e.deletedAt);
  if (typeFilter === 'fixed' || typeFilter === 'variable') {
    expenses = expenses.filter((e) => e.type === typeFilter);
  }

  const mapped = expenses
    .map((e) => ({
      ...e,
      categoryName: db.categories.find((c) => c.id === e.categoryId)?.name || 'Expense',
      categoryColor: db.categories.find((c) => c.id === e.categoryId)?.color || '#6366f1',
    }))
    .sort((a, b) => b.date.localeCompare(a.date));

  res.json(mapped);
});

apiRouter.post('/finance/expenses', (req: Request, res: Response) => {
  const { userId } = getAuth(req);
  const db = dbService.getRaw();
  const body = (req.body && typeof req.body === 'object' ? req.body : {}) as Record<string, unknown>;
  const { categoryId, amountPaise, date, description, paymentMethod, notes, type } = body;

  const parsedDesc = parseNonEmptyString(description, 250);
  if (!parsedDesc) {
    res.status(400).json({ error: 'Description is required' });
    return;
  }

  const parsedAmount = parsePositiveInt(amountPaise, 1, 1_000_000_000);
  if (parsedAmount === null) {
    res.status(400).json({ error: 'Valid positive integer amountPaise is required' });
    return;
  }

  const parsedDate =
    date === undefined || date === ''
      ? new Date().toISOString().split('T')[0]
      : parseIsoDate(date);
  if (!parsedDate) {
    res.status(400).json({ error: 'date must be YYYY-MM-DD' });
    return;
  }

  const parsedMethod =
    paymentMethod === undefined ? 'upi_bank' : parseEnum(paymentMethod, ALLOWED_PAYMENT_METHODS);
  if (!parsedMethod) {
    res.status(400).json({ error: 'Invalid paymentMethod' });
    return;
  }

  if (type !== undefined && type !== 'fixed' && type !== 'variable') {
    res.status(400).json({ error: 'type must be fixed or variable' });
    return;
  }

  const parsedNotes = parseOptionalString(notes, 1000);
  if (parsedNotes === null) {
    res.status(400).json({ error: 'notes must be a string' });
    return;
  }

  const resolvedCategoryId =
    typeof categoryId === 'string' && categoryId.trim()
      ? categoryId.trim()
      : dbService.getFallbackCategoryId(userId);

  const newExpense: ExpenseTransaction = {
    id: `exp_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
    userId,
    billId: null,
    type: type === 'fixed' ? 'fixed' : 'variable',
    categoryId: resolvedCategoryId,
    amountPaise: parsedAmount,
    date: parsedDate,
    description: parsedDesc,
    paymentMethod: parsedMethod,
    notes: parsedNotes,
    deletedAt: null,
    createdAt: new Date().toISOString(),
  };

  db.expenseTransactions.unshift(newExpense);
  dbService.save();

  res.status(201).json({
    ...newExpense,
    categoryName: db.categories.find((c) => c.id === newExpense.categoryId)?.name || 'Expense',
  });
});

apiRouter.put('/finance/expenses/:id', (req: Request, res: Response) => {
  const { userId } = getAuth(req);
  const db = dbService.getRaw();
  const expense = db.expenseTransactions.find(
    (e) => e.id === req.params.id && e.userId === userId && !e.deletedAt
  );

  if (!expense) {
    res.status(404).json({ error: 'Expense record not found' });
    return;
  }

  const body = (req.body && typeof req.body === 'object' ? req.body : {}) as Record<string, unknown>;
  const { categoryId, amountPaise, date, description, paymentMethod, notes, type } = body;

  if (categoryId !== undefined) {
    if (typeof categoryId !== 'string' || !categoryId.trim()) {
      res.status(400).json({ error: 'Invalid categoryId' });
      return;
    }
    expense.categoryId = categoryId.trim();
  }

  if (amountPaise !== undefined) {
    const parsedAmount = parsePositiveInt(amountPaise, 1, 1_000_000_000);
    if (parsedAmount === null) {
      res.status(400).json({ error: 'amountPaise must be a positive integer' });
      return;
    }
    expense.amountPaise = parsedAmount;
  }

  if (date !== undefined) {
    const parsedDate = parseIsoDate(date);
    if (!parsedDate) {
      res.status(400).json({ error: 'date must be YYYY-MM-DD' });
      return;
    }
    expense.date = parsedDate;
  }

  if (description !== undefined) {
    const parsedDesc = parseNonEmptyString(description, 250);
    if (!parsedDesc) {
      res.status(400).json({ error: 'description must be a non-empty string' });
      return;
    }
    expense.description = parsedDesc;
  }

  if (paymentMethod !== undefined) {
    const parsedMethod = parseEnum(paymentMethod, ALLOWED_PAYMENT_METHODS);
    if (!parsedMethod) {
      res.status(400).json({ error: 'Invalid paymentMethod' });
      return;
    }
    expense.paymentMethod = parsedMethod;
  }

  if (notes !== undefined) {
    const parsedNotes = parseOptionalString(notes, 1000);
    if (parsedNotes === null) {
      res.status(400).json({ error: 'notes must be a string' });
      return;
    }
    expense.notes = parsedNotes;
  }

  if (type !== undefined) {
    if (type !== 'fixed' && type !== 'variable') {
      res.status(400).json({ error: 'type must be fixed or variable' });
      return;
    }
    expense.type = type;
  }

  dbService.save();
  res.json({
    ...expense,
    categoryName: db.categories.find((c) => c.id === expense.categoryId)?.name || 'Expense',
  });
});

apiRouter.delete('/finance/expenses/:id', (req: Request, res: Response) => {
  const { userId } = getAuth(req);
  const db = dbService.getRaw();
  const expense = db.expenseTransactions.find(
    (e) => e.id === req.params.id && e.userId === userId && !e.deletedAt
  );

  if (!expense) {
    res.status(404).json({ error: 'Expense record not found' });
    return;
  }

  expense.deletedAt = new Date().toISOString();
  dbService.save();
  res.json({ success: true, message: 'Expense record moved to trash' });
});

// ----------------------------------------------------
// Recurring Expenses (Fixed Expenses)
// ----------------------------------------------------
apiRouter.get('/finance/recurring', (req: Request, res: Response) => {
  const { userId } = getAuth(req);
  const db = dbService.getRaw();
  const recurring = db.recurringExpenses
    .filter((r) => r.userId === userId)
    .map((r) => ({
      ...r,
      categoryName: db.categories.find((c) => c.id === r.categoryId)?.name || 'Fixed Expense',
    }))
    .sort((a, b) => a.dueDay - b.dueDay);
  res.json(recurring);
});

apiRouter.post('/finance/recurring', (req: Request, res: Response) => {
  const { userId } = getAuth(req);
  const db = dbService.getRaw();
  const body = (req.body && typeof req.body === 'object' ? req.body : {}) as Record<string, unknown>;
  const { name, amountPaise, categoryId, recurrence, dueDay, notes } = body;

  const parsedName = parseNonEmptyString(name, 200);
  if (!parsedName) {
    res.status(400).json({ error: 'Expense name is required' });
    return;
  }

  const parsedAmount = parsePositiveInt(amountPaise, 1, 1_000_000_000);
  if (parsedAmount === null) {
    res.status(400).json({ error: 'Valid positive integer amountPaise is required' });
    return;
  }

  const parsedRecurrence =
    recurrence === undefined ? 'monthly' : parseEnum(recurrence, ALLOWED_RECURRENCES);
  if (!parsedRecurrence) {
    res.status(400).json({ error: 'Invalid recurrence frequency' });
    return;
  }

  const parsedDueDay = dueDay === undefined ? 1 : parsePositiveInt(dueDay, 1, 31);
  if (parsedDueDay === null) {
    res.status(400).json({ error: 'dueDay must be an integer between 1 and 31' });
    return;
  }

  const parsedNotes = parseOptionalString(notes, 1000);
  if (parsedNotes === null) {
    res.status(400).json({ error: 'notes must be a string' });
    return;
  }

  const resolvedCategoryId =
    typeof categoryId === 'string' && categoryId.trim()
      ? categoryId.trim()
      : dbService.getFallbackCategoryId(userId);

  const newRec: RecurringExpense = {
    id: `rec_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
    userId,
    name: parsedName,
    amountPaise: parsedAmount,
    categoryId: resolvedCategoryId,
    recurrence: parsedRecurrence,
    dueDay: parsedDueDay,
    isActive: true,
    notes: parsedNotes,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };

  db.recurringExpenses.push(newRec);
  dbService.save();
  dbService.checkRecurringBills(userId);

  res.status(201).json({
    ...newRec,
    categoryName: db.categories.find((c) => c.id === newRec.categoryId)?.name || 'Fixed Expense',
  });
});

apiRouter.put('/finance/recurring/:id', (req: Request, res: Response) => {
  const { userId } = getAuth(req);
  const db = dbService.getRaw();
  const rec = db.recurringExpenses.find((r) => r.id === req.params.id && r.userId === userId);

  if (!rec) {
    res.status(404).json({ error: 'Recurring expense not found' });
    return;
  }

  const body = (req.body && typeof req.body === 'object' ? req.body : {}) as Record<string, unknown>;
  const { name, amountPaise, categoryId, recurrence, dueDay, isActive, notes } = body;

  if (name !== undefined) {
    const parsedName = parseNonEmptyString(name, 200);
    if (!parsedName) {
      res.status(400).json({ error: 'name must be a non-empty string' });
      return;
    }
    rec.name = parsedName;
  }

  if (amountPaise !== undefined) {
    const parsedAmount = parsePositiveInt(amountPaise, 1, 1_000_000_000);
    if (parsedAmount === null) {
      res.status(400).json({ error: 'amountPaise must be a positive integer' });
      return;
    }
    rec.amountPaise = parsedAmount;
  }

  if (categoryId !== undefined) {
    if (typeof categoryId !== 'string' || !categoryId.trim()) {
      res.status(400).json({ error: 'Invalid categoryId' });
      return;
    }
    rec.categoryId = categoryId.trim();
  }

  if (recurrence !== undefined) {
    const parsedRecurrence = parseEnum(recurrence, ALLOWED_RECURRENCES);
    if (!parsedRecurrence) {
      res.status(400).json({ error: 'Invalid recurrence' });
      return;
    }
    rec.recurrence = parsedRecurrence;
  }

  if (dueDay !== undefined) {
    const parsedDueDay = parsePositiveInt(dueDay, 1, 31);
    if (parsedDueDay === null) {
      res.status(400).json({ error: 'dueDay must be an integer between 1 and 31' });
      return;
    }
    rec.dueDay = parsedDueDay;
  }

  if (isActive !== undefined) {
    if (typeof isActive !== 'boolean') {
      res.status(400).json({ error: 'isActive must be a boolean' });
      return;
    }
    rec.isActive = isActive;
  }

  if (notes !== undefined) {
    const parsedNotes = parseOptionalString(notes, 1000);
    if (parsedNotes === null) {
      res.status(400).json({ error: 'notes must be a string' });
      return;
    }
    rec.notes = parsedNotes;
  }

  rec.updatedAt = new Date().toISOString();
  dbService.save();
  res.json({
    ...rec,
    categoryName: db.categories.find((c) => c.id === rec.categoryId)?.name || 'Fixed Expense',
  });
});

apiRouter.delete('/finance/recurring/:id', (req: Request, res: Response) => {
  const { userId } = getAuth(req);
  const db = dbService.getRaw();
  const index = db.recurringExpenses.findIndex(
    (r) => r.id === req.params.id && r.userId === userId
  );

  if (index === -1) {
    res.status(404).json({ error: 'Recurring expense not found' });
    return;
  }

  db.recurringExpenses.splice(index, 1);
  dbService.save();
  res.json({ success: true, message: 'Recurring expense removed' });
});

// ----------------------------------------------------
// Bills & Payment Tracker
// ----------------------------------------------------
apiRouter.get('/finance/bills', (req: Request, res: Response) => {
  const auth = getAuth(req);
  const userId = auth.userId;
  dbService.ensureUserWorkspace(userId, auth);
  dbService.checkRecurringBills(userId);
  const db = dbService.getRaw();

  const statusFilter = req.query.status as string;

  let bills = db.bills.filter((b) => b.userId === userId && !b.deletedAt);
  if (statusFilter && statusFilter !== 'ALL') {
    if (statusFilter === 'UNPAID') {
      bills = bills.filter((b) => b.status === 'UNPAID' || b.status === 'OVERDUE');
    } else {
      bills = bills.filter((b) => b.status === statusFilter);
    }
  }

  const mapped = bills
    .map((b) => ({
      ...b,
      categoryName: db.categories.find((c) => c.id === b.categoryId)?.name || 'Bill',
      categoryColor: db.categories.find((c) => c.id === b.categoryId)?.color || '#6366f1',
    }))
    .sort((a, b) => a.dueDate.localeCompare(b.dueDate));

  res.json(mapped);
});

apiRouter.post('/finance/bills', (req: Request, res: Response) => {
  const { userId } = getAuth(req);
  const db = dbService.getRaw();
  const body = (req.body && typeof req.body === 'object' ? req.body : {}) as Record<string, unknown>;
  const { name, amountPaise, categoryId, dueDate, notes } = body;

  const parsedName = parseNonEmptyString(name, 200);
  if (!parsedName) {
    res.status(400).json({ error: 'Bill name is required' });
    return;
  }

  const parsedAmount = parsePositiveInt(amountPaise, 1, 1_000_000_000);
  if (parsedAmount === null) {
    res.status(400).json({ error: 'Valid positive integer amountPaise is required' });
    return;
  }

  const parsedDueDate = parseIsoDate(dueDate);
  if (!parsedDueDate) {
    res.status(400).json({ error: 'Valid dueDate (YYYY-MM-DD) is required' });
    return;
  }

  const parsedNotes = parseOptionalString(notes, 1000);
  if (parsedNotes === null) {
    res.status(400).json({ error: 'notes must be a string' });
    return;
  }

  const todayStr = new Date().toISOString().split('T')[0];
  const isPastDue = parsedDueDate < todayStr;
  const periodKey = parsedDueDate.substring(0, 7);
  const resolvedCategoryId =
    typeof categoryId === 'string' && categoryId.trim()
      ? categoryId.trim()
      : dbService.getFallbackCategoryId(userId);

  const newBill: Bill = {
    id: `bill_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
    userId,
    recurringExpenseId: null,
    name: parsedName,
    amountPaise: parsedAmount,
    categoryId: resolvedCategoryId,
    dueDate: parsedDueDate,
    status: isPastDue ? 'OVERDUE' : 'UNPAID',
    paymentDate: null,
    notes: parsedNotes,
    periodKey,
    deletedAt: null,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };

  db.bills.unshift(newBill);
  dbService.save();

  res.status(201).json({
    ...newBill,
    categoryName: db.categories.find((c) => c.id === newBill.categoryId)?.name || 'Bill',
  });
});

apiRouter.post('/finance/bills/:id/pay', (req: Request, res: Response) => {
  const { userId } = getAuth(req);
  const body = (req.body && typeof req.body === 'object' ? req.body : {}) as Record<string, unknown>;
  const { paidDate, paymentMethod, notes } = body;

  let validPaidDate: string | undefined;
  if (paidDate !== undefined && paidDate !== '') {
    const parsed = parseIsoDate(paidDate);
    if (!parsed) {
      res.status(400).json({ error: 'paidDate must be YYYY-MM-DD' });
      return;
    }
    validPaidDate = parsed;
  }

  const parsedMethod =
    paymentMethod === undefined ? 'upi_bank' : parseEnum(paymentMethod, ALLOWED_PAYMENT_METHODS);
  if (!parsedMethod) {
    res.status(400).json({ error: 'Invalid paymentMethod' });
    return;
  }

  const parsedNotes = parseOptionalString(notes, 1000);
  if (parsedNotes === null) {
    res.status(400).json({ error: 'notes must be a string' });
    return;
  }

  const result = dbService.markBillAsPaid(
    userId,
    req.params.id,
    validPaidDate,
    parsedMethod,
    parsedNotes
  );

  if (!result.success) {
    res.status(400).json({ error: result.error });
    return;
  }

  const db = dbService.getRaw();
  const bill = result.bill!;
  res.json({
    success: true,
    bill: {
      ...bill,
      categoryName: db.categories.find((c) => c.id === bill.categoryId)?.name || 'Bill',
    },
  });
});

apiRouter.post('/finance/bills/:id/undo', (req: Request, res: Response) => {
  const { userId } = getAuth(req);
  const result = dbService.undoBillPayment(userId, req.params.id);

  if (!result.success) {
    res.status(400).json({ error: result.error });
    return;
  }

  const db = dbService.getRaw();
  const bill = result.bill!;
  res.json({
    success: true,
    bill: {
      ...bill,
      categoryName: db.categories.find((c) => c.id === bill.categoryId)?.name || 'Bill',
    },
  });
});

apiRouter.delete('/finance/bills/:id', (req: Request, res: Response) => {
  const { userId } = getAuth(req);
  const db = dbService.getRaw();
  const bill = db.bills.find((b) => b.id === req.params.id && b.userId === userId && !b.deletedAt);

  if (!bill) {
    res.status(404).json({ error: 'Bill not found' });
    return;
  }

  const nowIso = new Date().toISOString();
  bill.deletedAt = nowIso;
  bill.updatedAt = nowIso;
  for (const exp of db.expenseTransactions) {
    if (exp.userId === userId && exp.billId === bill.id && !exp.deletedAt) {
      exp.deletedAt = nowIso;
    }
  }

  dbService.save();
  res.json({ success: true, message: 'Bill moved to trash' });
});

apiRouter.get('/finance/payments-history', (req: Request, res: Response) => {
  const { userId } = getAuth(req);
  const db = dbService.getRaw();
  const history = db.paymentHistory
    .filter((p) => p.userId === userId)
    .sort((a, b) => b.paidDate.localeCompare(a.paidDate));
  res.json(history);
});

// ----------------------------------------------------
// Savings Goals
// ----------------------------------------------------
apiRouter.get('/finance/savings-goals', (req: Request, res: Response) => {
  const { userId } = getAuth(req);
  const db = dbService.getRaw();
  const goals = db.savingsGoals
    .filter((g) => g.userId === userId)
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  res.json(goals);
});

apiRouter.post('/finance/savings-goals', (req: Request, res: Response) => {
  const { userId } = getAuth(req);
  const db = dbService.getRaw();
  const body = (req.body && typeof req.body === 'object' ? req.body : {}) as Record<string, unknown>;
  const { title, targetPaise, savedPaise, targetDate, color } = body;

  const parsedTitle = parseNonEmptyString(title, 150);
  if (!parsedTitle) {
    res.status(400).json({ error: 'Savings goal title is required' });
    return;
  }
  const parsedTarget = parsePositiveInt(targetPaise, 100, 1_000_000_000);
  if (parsedTarget === null) {
    res.status(400).json({ error: 'targetPaise must be a positive integer' });
    return;
  }
  const parsedSaved = savedPaise === undefined ? 0 : parseNonNegativeInt(savedPaise, 1_000_000_000);
  if (parsedSaved === null) {
    res.status(400).json({ error: 'savedPaise must be a non-negative integer' });
    return;
  }

  let parsedDate: string | null = null;
  if (targetDate !== undefined && targetDate !== null && targetDate !== '') {
    parsedDate = parseIsoDate(targetDate);
    if (!parsedDate) {
      res.status(400).json({ error: 'targetDate must be YYYY-MM-DD' });
      return;
    }
  }

  const nowIso = new Date().toISOString();
  const created: SavingsGoal = {
    id: `sav_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
    userId,
    title: parsedTitle,
    targetPaise: parsedTarget,
    savedPaise: parsedSaved,
    targetDate: parsedDate,
    color: typeof color === 'string' && /^#[0-9a-fA-F]{6}$/.test(color.trim()) ? color.trim() : '#10b981',
    createdAt: nowIso,
    updatedAt: nowIso,
  };
  db.savingsGoals.unshift(created);
  dbService.save();
  res.status(201).json(created);
});

apiRouter.put('/finance/savings-goals/:id', (req: Request, res: Response) => {
  const { userId } = getAuth(req);
  const db = dbService.getRaw();
  const goal = db.savingsGoals.find((g) => g.id === req.params.id && g.userId === userId);
  if (!goal) {
    res.status(404).json({ error: 'Savings goal not found' });
    return;
  }

  const body = (req.body && typeof req.body === 'object' ? req.body : {}) as Record<string, unknown>;
  const { title, targetPaise, savedPaise, targetDate, color } = body;

  if (title !== undefined) {
    const parsedTitle = parseNonEmptyString(title, 150);
    if (!parsedTitle) {
      res.status(400).json({ error: 'Invalid title' });
      return;
    }
    goal.title = parsedTitle;
  }
  if (targetPaise !== undefined) {
    const parsedTarget = parsePositiveInt(targetPaise, 100, 1_000_000_000);
    if (parsedTarget === null) {
      res.status(400).json({ error: 'Invalid targetPaise' });
      return;
    }
    goal.targetPaise = parsedTarget;
  }
  if (savedPaise !== undefined) {
    const parsedSaved = parseNonNegativeInt(savedPaise, 1_000_000_000);
    if (parsedSaved === null) {
      res.status(400).json({ error: 'Invalid savedPaise' });
      return;
    }
    goal.savedPaise = parsedSaved;
  }
  if (targetDate !== undefined) {
    if (targetDate === null || targetDate === '') {
      goal.targetDate = null;
    } else {
      const parsedDate = parseIsoDate(targetDate);
      if (!parsedDate) {
        res.status(400).json({ error: 'targetDate must be YYYY-MM-DD' });
        return;
      }
      goal.targetDate = parsedDate;
    }
  }
  if (color !== undefined && typeof color === 'string' && /^#[0-9a-fA-F]{6}$/.test(color.trim())) {
    goal.color = color.trim();
  }

  goal.updatedAt = new Date().toISOString();
  dbService.save();
  res.json(goal);
});

apiRouter.post('/finance/savings-goals/:id/contribute', (req: Request, res: Response) => {
  const { userId } = getAuth(req);
  const db = dbService.getRaw();
  const goal = db.savingsGoals.find((g) => g.id === req.params.id && g.userId === userId);
  if (!goal) {
    res.status(404).json({ error: 'Savings goal not found' });
    return;
  }
  const body = (req.body && typeof req.body === 'object' ? req.body : {}) as Record<string, unknown>;
  const delta = Number(body.deltaPaise);
  if (!Number.isFinite(delta) || !Number.isInteger(delta) || delta === 0) {
    res.status(400).json({ error: 'deltaPaise must be a non-zero integer' });
    return;
  }
  if (goal.savedPaise + delta < 0) {
    res.status(400).json({ error: 'Cannot withdraw more than current saved amount' });
    return;
  }
  goal.savedPaise = goal.savedPaise + delta;
  goal.updatedAt = new Date().toISOString();
  dbService.save();
  res.json(goal);
});

apiRouter.delete('/finance/savings-goals/:id', (req: Request, res: Response) => {
  const { userId } = getAuth(req);
  const db = dbService.getRaw();
  const idx = db.savingsGoals.findIndex((g) => g.id === req.params.id && g.userId === userId);
  if (idx === -1) {
    res.status(404).json({ error: 'Savings goal not found' });
    return;
  }
  db.savingsGoals.splice(idx, 1);
  dbService.save();
  res.json({ success: true });
});

// ----------------------------------------------------
// Trash & Restore
// ----------------------------------------------------
apiRouter.get('/trash', (req: Request, res: Response) => {
  const { userId } = getAuth(req);
  const db = dbService.getRaw();

  const items = [
    ...db.tasks
      .filter((t) => t.userId === userId && t.deletedAt)
      .map((t) => ({
        id: t.id,
        entityType: 'task' as const,
        title: t.title,
        subtitle: `Task · ${t.priority} priority`,
        deletedAt: t.deletedAt!,
      })),
    ...db.incomeTransactions
      .filter((i) => i.userId === userId && i.deletedAt)
      .map((i) => ({
        id: i.id,
        entityType: 'income' as const,
        title: i.source,
        subtitle: `Income · ${i.date}`,
        amountPaise: i.amountPaise,
        deletedAt: i.deletedAt!,
      })),
    ...db.expenseTransactions
      .filter((e) => e.userId === userId && e.deletedAt)
      .map((e) => ({
        id: e.id,
        entityType: 'expense' as const,
        title: e.description,
        subtitle: `Expense · ${e.date}`,
        amountPaise: e.amountPaise,
        deletedAt: e.deletedAt!,
      })),
    ...db.bills
      .filter((b) => b.userId === userId && b.deletedAt)
      .map((b) => ({
        id: b.id,
        entityType: 'bill' as const,
        title: b.name,
        subtitle: `Bill · Due ${b.dueDate}`,
        amountPaise: b.amountPaise,
        deletedAt: b.deletedAt!,
      })),
  ].sort((a, b) => b.deletedAt.localeCompare(a.deletedAt));

  res.json(items);
});

apiRouter.post('/trash/:entityType/:id/restore', (req: Request, res: Response) => {
  const { userId } = getAuth(req);
  const { entityType, id } = req.params;
  const db = dbService.getRaw();

  if (entityType === 'task') {
    const item = db.tasks.find((t) => t.id === id && t.userId === userId && t.deletedAt);
    if (!item) {
      res.status(404).json({ error: 'Trashed task not found' });
      return;
    }
    item.deletedAt = null;
    item.updatedAt = new Date().toISOString();
  } else if (entityType === 'income') {
    const item = db.incomeTransactions.find((i) => i.id === id && i.userId === userId && i.deletedAt);
    if (!item) {
      res.status(404).json({ error: 'Trashed income not found' });
      return;
    }
    item.deletedAt = null;
  } else if (entityType === 'expense') {
    const item = db.expenseTransactions.find((e) => e.id === id && e.userId === userId && e.deletedAt);
    if (!item) {
      res.status(404).json({ error: 'Trashed expense not found' });
      return;
    }
    item.deletedAt = null;
  } else if (entityType === 'bill') {
    const item = db.bills.find((b) => b.id === id && b.userId === userId && b.deletedAt);
    if (!item) {
      res.status(404).json({ error: 'Trashed bill not found' });
      return;
    }
    item.deletedAt = null;
    for (const exp of db.expenseTransactions) {
      if (exp.userId === userId && exp.billId === item.id && exp.deletedAt) {
        exp.deletedAt = null;
      }
    }
  } else {
    res.status(400).json({ error: 'Invalid entity type' });
    return;
  }

  dbService.save();
  res.json({ success: true });
});

apiRouter.delete('/trash/:entityType/:id', (req: Request, res: Response) => {
  const { userId } = getAuth(req);
  const { entityType, id } = req.params;
  const db = dbService.getRaw();

  if (entityType === 'task') {
    const idx = db.tasks.findIndex((t) => t.id === id && t.userId === userId && t.deletedAt);
    if (idx === -1) {
      res.status(404).json({ error: 'Trashed task not found' });
      return;
    }
    db.tasks.splice(idx, 1);
  } else if (entityType === 'income') {
    const idx = db.incomeTransactions.findIndex((i) => i.id === id && i.userId === userId && i.deletedAt);
    if (idx === -1) {
      res.status(404).json({ error: 'Trashed income not found' });
      return;
    }
    db.incomeTransactions.splice(idx, 1);
  } else if (entityType === 'expense') {
    const idx = db.expenseTransactions.findIndex((e) => e.id === id && e.userId === userId && e.deletedAt);
    if (idx === -1) {
      res.status(404).json({ error: 'Trashed expense not found' });
      return;
    }
    db.expenseTransactions.splice(idx, 1);
  } else if (entityType === 'bill') {
    const idx = db.bills.findIndex((b) => b.id === id && b.userId === userId && b.deletedAt);
    if (idx === -1) {
      res.status(404).json({ error: 'Trashed bill not found' });
      return;
    }
    const bill = db.bills[idx];
    db.expenseTransactions = db.expenseTransactions.filter(
      (e) => !(e.userId === userId && e.billId === bill.id)
    );
    db.paymentHistory = db.paymentHistory.filter(
      (p) => !(p.userId === userId && p.billId === bill.id)
    );
    db.bills.splice(idx, 1);
  } else {
    res.status(400).json({ error: 'Invalid entity type' });
    return;
  }

  dbService.save();
  res.json({ success: true });
});
