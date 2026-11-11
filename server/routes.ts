import { Router, Request, Response } from 'express';
import { dbService, Task, FocusSession, IncomeTransaction, ExpenseTransaction, RecurringExpense, Bill, PaymentHistory } from './db.js';

export const apiRouter = Router();

// Middleware to get current user ID (defaults to 'usr_atif_default')
const getUserId = (req: Request): string => {
  return (req.headers['x-user-id'] as string) || 'usr_atif_default';
};

// ----------------------------------------------------
// User & Settings
// ----------------------------------------------------
apiRouter.get('/auth/me', (req: Request, res: Response) => {
  const userId = getUserId(req);
  const db = dbService.getRaw();
  const user = db.users.find((u) => u.id === userId) || db.users[0];
  const settings = db.userSettings.find((s) => s.userId === userId) || db.userSettings[0];
  res.json({ user, settings });
});

apiRouter.put('/settings', (req: Request, res: Response) => {
  const userId = getUserId(req);
  const db = dbService.getRaw();
  let settings = db.userSettings.find((s) => s.userId === userId);

  if (!settings) {
    settings = {
      userId,
      currency: 'INR',
      pomodoroWorkDuration: 25,
      shortBreakDuration: 5,
      longBreakDuration: 15,
      autoSwitchSessions: false,
      soundEnabled: true,
      theme: 'dark',
    };
    db.userSettings.push(settings);
  }

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
  } = req.body;
  if (currency) settings.currency = currency;
  if (pomodoroWorkDuration !== undefined) settings.pomodoroWorkDuration = Number(pomodoroWorkDuration);
  if (shortBreakDuration !== undefined) settings.shortBreakDuration = Number(shortBreakDuration);
  if (longBreakDuration !== undefined) settings.longBreakDuration = Number(longBreakDuration);
  if (autoSwitchSessions !== undefined) settings.autoSwitchSessions = Boolean(autoSwitchSessions);
  if (soundEnabled !== undefined) settings.soundEnabled = Boolean(soundEnabled);
  if (theme) settings.theme = theme;
  if (themeConfig !== undefined) settings.themeConfig = themeConfig;
  if (savedThemes !== undefined) settings.savedThemes = savedThemes;
  if (activeSavedThemeId !== undefined) settings.activeSavedThemeId = activeSavedThemeId;
  if (googleSpreadsheetId !== undefined) settings.googleSpreadsheetId = googleSpreadsheetId;
  if (lastSyncedAt !== undefined) settings.lastSyncedAt = lastSyncedAt;

  dbService.save();
  res.json({ success: true, settings });
});

apiRouter.post('/reseed', (_req: Request, res: Response) => {
  dbService.reseed();
  res.json({ success: true, message: 'Database reset to premium seed data' });
});

// ----------------------------------------------------
// Unified Dashboard
// ----------------------------------------------------
apiRouter.get('/dashboard', (req: Request, res: Response) => {
  const userId = getUserId(req);
  dbService.checkRecurringBills(userId);
  const db = dbService.getRaw();

  const now = new Date();
  const todayStr = now.toISOString().split('T')[0];
  const currentMonthKey = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;

  // 1. Focus metrics
  const userSessions = db.focusSessions.filter((s) => s.userId === userId);
  const todaySessions = userSessions.filter((s) => s.startedAt.startsWith(todayStr) && s.completed);

  const todayFocusSeconds = todaySessions.reduce((acc, s) => acc + s.durationSeconds, 0);
  const completedPomodoroSessions = todaySessions.filter((s) => s.mode === 'work').length;

  // Streak calculation (consecutive days with at least 1 completed focus session)
  let streak = 0;
  let checkDate = new Date();
  while (true) {
    const dateStr = checkDate.toISOString().split('T')[0];
    const hasSession = userSessions.some(
      (s) => s.startedAt.startsWith(dateStr) && s.completed && s.mode === 'work'
    );
    if (hasSession) {
      streak++;
      checkDate.setDate(checkDate.getDate() - 1);
    } else {
      // If today has no sessions yet, check if yesterday had sessions before breaking streak
      if (dateStr === todayStr && streak === 0) {
        checkDate.setDate(checkDate.getDate() - 1);
        const yesterdayStr = checkDate.toISOString().split('T')[0];
        const yesterdayHas = userSessions.some(
          (s) => s.startedAt.startsWith(yesterdayStr) && s.completed && s.mode === 'work'
        );
        if (yesterdayHas) {
          streak = 1;
          checkDate.setDate(checkDate.getDate() - 1);
          continue;
        }
      }
      break;
    }
  }

  // 2. Financial Metrics for current month
  const currentIncomes = db.incomeTransactions.filter(
    (inc) => inc.userId === userId && inc.date.startsWith(currentMonthKey)
  );
  const monthlyIncomePaise = currentIncomes.reduce((acc, inc) => acc + inc.amountPaise, 0);

  const currentExpenses = db.expenseTransactions.filter(
    (exp) => exp.userId === userId && exp.date.startsWith(currentMonthKey)
  );
  const monthlyExpensesPaise = currentExpenses.reduce((acc, exp) => acc + exp.amountPaise, 0);

  const fixedExpensesPaise = currentExpenses
    .filter((e) => e.type === 'fixed')
    .reduce((acc, e) => acc + e.amountPaise, 0);

  const variableExpensesPaise = currentExpenses
    .filter((e) => e.type === 'variable')
    .reduce((acc, e) => acc + e.amountPaise, 0);

  const remainingBalancePaise = monthlyIncomePaise - monthlyExpensesPaise;

  // 3. Bills metrics
  const currentBills = db.bills.filter(
    (b) => b.userId === userId && (b.periodKey === currentMonthKey || b.status === 'OVERDUE')
  );

  const paidBillsCount = currentBills.filter((b) => b.status === 'PAID').length;
  const unpaidBillsCount = currentBills.filter((b) => b.status === 'UNPAID' || b.status === 'OVERDUE').length;

  const totalPaidAmountPaise = currentBills
    .filter((b) => b.status === 'PAID')
    .reduce((acc, b) => acc + b.amountPaise, 0);

  const totalUnpaidAmountPaise = currentBills
    .filter((b) => b.status === 'UNPAID' || b.status === 'OVERDUE')
    .reduce((acc, b) => acc + b.amountPaise, 0);

  // Upcoming payments (due in the next 15 days or currently unpaid)
  const upcomingPayments = db.bills
    .filter((b) => b.userId === userId && (b.status === 'UNPAID' || b.status === 'OVERDUE'))
    .sort((a, b) => a.dueDate.localeCompare(b.dueDate))
    .slice(0, 5);

  // Recent transactions (merged Income + Expenses)
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
    completedPomodoroSessions,
    focusStreakDays: streak,
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
  const userId = getUserId(req);
  const db = dbService.getRaw();
  const sessions = db.focusSessions
    .filter((s) => s.userId === userId)
    .sort((a, b) => b.startedAt.localeCompare(a.startedAt));
  res.json(sessions);
});

apiRouter.post('/focus/sessions', (req: Request, res: Response) => {
  const userId = getUserId(req);
  const db = dbService.getRaw();
  const { taskId, mode, durationMinutes, durationSeconds, completed, startedAt, endedAt } = req.body;

  let taskTitle: string | undefined;
  if (taskId) {
    const task = db.tasks.find((t) => t.id === taskId && t.userId === userId);
    if (task) {
      taskTitle = task.title;
      if (completed && mode === 'work') {
        task.completedPomodoros = (task.completedPomodoros || 0) + 1;
        task.updatedAt = new Date().toISOString();
      }
    }
  }

  const session: FocusSession = {
    id: `foc_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
    userId,
    taskId: taskId || null,
    taskTitle,
    mode: mode || 'work',
    durationMinutes: Number(durationMinutes) || 25,
    durationSeconds: Number(durationSeconds) || 1500,
    completed: completed !== undefined ? Boolean(completed) : true,
    startedAt: startedAt || new Date().toISOString(),
    endedAt: endedAt || new Date().toISOString(),
  };

  db.focusSessions.push(session);
  dbService.save();
  res.status(201).json(session);
});

apiRouter.get('/focus/stats', (req: Request, res: Response) => {
  const userId = getUserId(req);
  const db = dbService.getRaw();
  const sessions = db.focusSessions.filter((s) => s.userId === userId && s.completed);

  // Daily focus duration for last 7 days
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

  // Monthly stats
  const now = new Date();
  const currentMonthKey = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  const monthSessions = sessions.filter((s) => s.startedAt.startsWith(currentMonthKey) && s.mode === 'work');
  const monthMinutes = Math.round(monthSessions.reduce((acc, s) => acc + s.durationSeconds, 0) / 60);

  // Total stats
  const totalMinutes = Math.round(sessions.reduce((acc, s) => acc + s.durationSeconds, 0) / 60);
  const totalCompletedSessions = sessions.filter((s) => s.mode === 'work').length;

  res.json({
    last7Days,
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
  const userId = getUserId(req);
  const db = dbService.getRaw();
  const tasks = db.tasks.filter((t) => t.userId === userId).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  res.json(tasks);
});

apiRouter.post('/tasks', (req: Request, res: Response) => {
  const userId = getUserId(req);
  const db = dbService.getRaw();
  const { title, description, priority, estimatedPomodoros, dueDate } = req.body;

  if (!title || !title.trim()) {
    res.status(400).json({ error: 'Title is required' });
    return;
  }

  const newTask: Task = {
    id: `tsk_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
    userId,
    title: title.trim(),
    description: (description || '').trim(),
    priority: priority || 'medium',
    status: 'todo',
    estimatedPomodoros: Number(estimatedPomodoros) || 1,
    completedPomodoros: 0,
    dueDate: dueDate || null,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };

  db.tasks.unshift(newTask);
  dbService.save();
  res.status(201).json(newTask);
});

apiRouter.put('/tasks/:id', (req: Request, res: Response) => {
  const userId = getUserId(req);
  const db = dbService.getRaw();
  const task = db.tasks.find((t) => t.id === req.params.id && t.userId === userId);

  if (!task) {
    res.status(404).json({ error: 'Task not found' });
    return;
  }

  const { title, description, priority, status, estimatedPomodoros, completedPomodoros, dueDate } = req.body;
  if (title !== undefined) task.title = title.trim();
  if (description !== undefined) task.description = description.trim();
  if (priority !== undefined) task.priority = priority;
  if (status !== undefined) task.status = status;
  if (estimatedPomodoros !== undefined) task.estimatedPomodoros = Number(estimatedPomodoros);
  if (completedPomodoros !== undefined) task.completedPomodoros = Number(completedPomodoros);
  if (dueDate !== undefined) task.dueDate = dueDate;
  task.updatedAt = new Date().toISOString();

  dbService.save();
  res.json(task);
});

apiRouter.delete('/tasks/:id', (req: Request, res: Response) => {
  const userId = getUserId(req);
  const db = dbService.getRaw();
  const index = db.tasks.findIndex((t) => t.id === req.params.id && t.userId === userId);

  if (index === -1) {
    res.status(404).json({ error: 'Task not found' });
    return;
  }

  db.tasks.splice(index, 1);
  dbService.save();
  res.json({ success: true, message: 'Task deleted' });
});

// ----------------------------------------------------
// Categories
// ----------------------------------------------------
apiRouter.get('/finance/categories', (req: Request, res: Response) => {
  const userId = getUserId(req);
  const db = dbService.getRaw();
  const categories = db.categories.filter((c) => c.userId === userId || c.userId === 'system');
  res.json(categories);
});

apiRouter.post('/finance/categories', (req: Request, res: Response) => {
  const userId = getUserId(req);
  const db = dbService.getRaw();
  const { name, type, icon, color } = req.body;

  if (!name || !name.trim()) {
    res.status(400).json({ error: 'Category name is required' });
    return;
  }

  const category = {
    id: `cat_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
    userId,
    name: name.trim(),
    type: type || 'both',
    icon: icon || 'Tag',
    color: color || '#6366f1',
  };

  db.categories.push(category);
  dbService.save();
  res.status(201).json(category);
});

// ----------------------------------------------------
// Finance: Summary & Analytics with Filter
// ----------------------------------------------------
apiRouter.get('/finance/summary', (req: Request, res: Response) => {
  const userId = getUserId(req);
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
    startDateStr = customStart;
    endDateStr = customEnd;
  } else {
    // Default to this month
    startDateStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-01`;
    endDateStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-31`;
  }

  // Filter incomes
  const incomes = db.incomeTransactions.filter(
    (inc) => inc.userId === userId && inc.date >= startDateStr && inc.date <= endDateStr
  );
  const totalIncomePaise = incomes.reduce((acc, inc) => acc + inc.amountPaise, 0);

  // Filter expenses
  const expenses = db.expenseTransactions.filter(
    (exp) => exp.userId === userId && exp.date >= startDateStr && exp.date <= endDateStr
  );
  const totalExpensePaise = expenses.reduce((acc, exp) => acc + exp.amountPaise, 0);
  const fixedExpensesPaise = expenses
    .filter((e) => e.type === 'fixed')
    .reduce((acc, e) => acc + e.amountPaise, 0);
  const variableExpensesPaise = expenses
    .filter((e) => e.type === 'variable')
    .reduce((acc, e) => acc + e.amountPaise, 0);

  const remainingBalancePaise = totalIncomePaise - totalExpensePaise;

  // Bills within range
  const bills = db.bills.filter(
    (b) => b.userId === userId && b.dueDate >= startDateStr && b.dueDate <= endDateStr
  );
  const paidBills = bills.filter((b) => b.status === 'PAID');
  const unpaidBills = bills.filter((b) => b.status === 'UNPAID' || b.status === 'OVERDUE');

  const totalPaidAmountPaise = paidBills.reduce((acc, b) => acc + b.amountPaise, 0);
  const totalUnpaidAmountPaise = unpaidBills.reduce((acc, b) => acc + b.amountPaise, 0);

  // Category breakdown
  const categoryMap: { [catId: string]: { name: string; color: string; amountPaise: number } } = {};
  for (const exp of expenses) {
    const cat = db.categories.find((c) => c.id === exp.categoryId);
    const catId = exp.categoryId || 'other';
    const catName = cat?.name || (exp.type === 'fixed' ? 'Fixed Expense' : 'Variable Expense');
    const catColor = cat?.color || '#94a3b8';

    if (!categoryMap[catId]) {
      categoryMap[catId] = { name: catName, color: catColor, amountPaise: 0 };
    }
    categoryMap[catId].amountPaise += exp.amountPaise;
  }
  const categoryBreakdown = Object.values(categoryMap).sort((a, b) => b.amountPaise - a.amountPaise);

  // Monthly trend for last 6 months
  const monthlyTrend: { month: string; incomePaise: number; expensePaise: number }[] = [];
  const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  for (let m = 5; m >= 0; m--) {
    const d = new Date(now.getFullYear(), now.getMonth() - m, 1);
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
    const label = `${monthNames[d.getMonth()]} ${String(d.getFullYear()).slice(-2)}`;

    const mInc = db.incomeTransactions
      .filter((inc) => inc.userId === userId && inc.date.startsWith(key))
      .reduce((acc, inc) => acc + inc.amountPaise, 0);

    const mExp = db.expenseTransactions
      .filter((exp) => exp.userId === userId && exp.date.startsWith(key))
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
  const userId = getUserId(req);
  const db = dbService.getRaw();
  const incomes = db.incomeTransactions
    .filter((inc) => inc.userId === userId)
    .sort((a, b) => b.date.localeCompare(a.date));
  res.json(incomes);
});

apiRouter.post('/finance/income', (req: Request, res: Response) => {
  const userId = getUserId(req);
  const db = dbService.getRaw();
  const { source, amountPaise, date, category, notes } = req.body;

  if (!source || !source.trim()) {
    res.status(400).json({ error: 'Income source is required' });
    return;
  }
  if (!amountPaise || Number(amountPaise) <= 0) {
    res.status(400).json({ error: 'Valid amount is required' });
    return;
  }

  const newIncome: IncomeTransaction = {
    id: `inc_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
    userId,
    source: source.trim(),
    amountPaise: Math.round(Number(amountPaise)),
    date: date || new Date().toISOString().split('T')[0],
    category: category || 'Salary',
    notes: (notes || '').trim(),
    createdAt: new Date().toISOString(),
  };

  db.incomeTransactions.unshift(newIncome);
  dbService.save();
  res.status(201).json(newIncome);
});

apiRouter.put('/finance/income/:id', (req: Request, res: Response) => {
  const userId = getUserId(req);
  const db = dbService.getRaw();
  const income = db.incomeTransactions.find((inc) => inc.id === req.params.id && inc.userId === userId);

  if (!income) {
    res.status(404).json({ error: 'Income record not found' });
    return;
  }

  const { source, amountPaise, date, category, notes } = req.body;
  if (source !== undefined) income.source = source.trim();
  if (amountPaise !== undefined) income.amountPaise = Math.round(Number(amountPaise));
  if (date !== undefined) income.date = date;
  if (category !== undefined) income.category = category;
  if (notes !== undefined) income.notes = notes.trim();

  dbService.save();
  res.json(income);
});

apiRouter.delete('/finance/income/:id', (req: Request, res: Response) => {
  const userId = getUserId(req);
  const db = dbService.getRaw();
  const index = db.incomeTransactions.findIndex((inc) => inc.id === req.params.id && inc.userId === userId);

  if (index === -1) {
    res.status(404).json({ error: 'Income record not found' });
    return;
  }

  db.incomeTransactions.splice(index, 1);
  dbService.save();
  res.json({ success: true, message: 'Income record deleted' });
});

// ----------------------------------------------------
// Expenses (Variable & All)
// ----------------------------------------------------
apiRouter.get('/finance/expenses', (req: Request, res: Response) => {
  const userId = getUserId(req);
  const db = dbService.getRaw();
  const typeFilter = req.query.type as string; // 'fixed' | 'variable'

  let expenses = db.expenseTransactions.filter((e) => e.userId === userId);
  if (typeFilter) {
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
  const userId = getUserId(req);
  const db = dbService.getRaw();
  const { categoryId, amountPaise, date, description, paymentMethod, notes, type } = req.body;

  if (!description || !description.trim()) {
    res.status(400).json({ error: 'Description is required' });
    return;
  }
  if (!amountPaise || Number(amountPaise) <= 0) {
    res.status(400).json({ error: 'Valid amount is required' });
    return;
  }

  const newExpense: ExpenseTransaction = {
    id: `exp_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
    userId,
    billId: null,
    type: type === 'fixed' ? 'fixed' : 'variable',
    categoryId: categoryId || db.categories[0].id,
    amountPaise: Math.round(Number(amountPaise)),
    date: date || new Date().toISOString().split('T')[0],
    description: description.trim(),
    paymentMethod: paymentMethod || 'upi_bank',
    notes: (notes || '').trim(),
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
  const userId = getUserId(req);
  const db = dbService.getRaw();
  const expense = db.expenseTransactions.find((e) => e.id === req.params.id && e.userId === userId);

  if (!expense) {
    res.status(404).json({ error: 'Expense record not found' });
    return;
  }

  const { categoryId, amountPaise, date, description, paymentMethod, notes, type } = req.body;
  if (categoryId !== undefined) expense.categoryId = categoryId;
  if (amountPaise !== undefined) expense.amountPaise = Math.round(Number(amountPaise));
  if (date !== undefined) expense.date = date;
  if (description !== undefined) expense.description = description.trim();
  if (paymentMethod !== undefined) expense.paymentMethod = paymentMethod;
  if (notes !== undefined) expense.notes = notes.trim();
  if (type !== undefined) expense.type = type;

  dbService.save();
  res.json({
    ...expense,
    categoryName: db.categories.find((c) => c.id === expense.categoryId)?.name || 'Expense',
  });
});

apiRouter.delete('/finance/expenses/:id', (req: Request, res: Response) => {
  const userId = getUserId(req);
  const db = dbService.getRaw();
  const index = db.expenseTransactions.findIndex((e) => e.id === req.params.id && e.userId === userId);

  if (index === -1) {
    res.status(404).json({ error: 'Expense record not found' });
    return;
  }

  // If this was linked to a bill, we should be aware
  db.expenseTransactions.splice(index, 1);
  dbService.save();
  res.json({ success: true, message: 'Expense record deleted' });
});

// ----------------------------------------------------
// Recurring Expenses (Fixed Expenses)
// ----------------------------------------------------
apiRouter.get('/finance/recurring', (req: Request, res: Response) => {
  const userId = getUserId(req);
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
  const userId = getUserId(req);
  const db = dbService.getRaw();
  const { name, amountPaise, categoryId, recurrence, dueDay, notes } = req.body;

  if (!name || !name.trim()) {
    res.status(400).json({ error: 'Expense name is required' });
    return;
  }
  if (!amountPaise || Number(amountPaise) <= 0) {
    res.status(400).json({ error: 'Valid amount is required' });
    return;
  }

  const newRec: RecurringExpense = {
    id: `rec_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
    userId,
    name: name.trim(),
    amountPaise: Math.round(Number(amountPaise)),
    categoryId: categoryId || db.categories[0].id,
    recurrence: recurrence || 'monthly',
    dueDay: Math.min(Math.max(Number(dueDay) || 1, 1), 31),
    isActive: true,
    notes: (notes || '').trim(),
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };

  db.recurringExpenses.push(newRec);
  dbService.save();
  // Ensure bill generated for this month
  dbService.checkRecurringBills(userId);

  res.status(201).json({
    ...newRec,
    categoryName: db.categories.find((c) => c.id === newRec.categoryId)?.name || 'Fixed Expense',
  });
});

apiRouter.put('/finance/recurring/:id', (req: Request, res: Response) => {
  const userId = getUserId(req);
  const db = dbService.getRaw();
  const rec = db.recurringExpenses.find((r) => r.id === req.params.id && r.userId === userId);

  if (!rec) {
    res.status(404).json({ error: 'Recurring expense not found' });
    return;
  }

  const { name, amountPaise, categoryId, recurrence, dueDay, isActive, notes } = req.body;
  if (name !== undefined) rec.name = name.trim();
  if (amountPaise !== undefined) rec.amountPaise = Math.round(Number(amountPaise));
  if (categoryId !== undefined) rec.categoryId = categoryId;
  if (recurrence !== undefined) rec.recurrence = recurrence;
  if (dueDay !== undefined) rec.dueDay = Math.min(Math.max(Number(dueDay), 1), 31);
  if (isActive !== undefined) rec.isActive = Boolean(isActive);
  if (notes !== undefined) rec.notes = notes.trim();
  rec.updatedAt = new Date().toISOString();

  dbService.save();
  res.json({
    ...rec,
    categoryName: db.categories.find((c) => c.id === rec.categoryId)?.name || 'Fixed Expense',
  });
});

apiRouter.delete('/finance/recurring/:id', (req: Request, res: Response) => {
  const userId = getUserId(req);
  const db = dbService.getRaw();
  const index = db.recurringExpenses.findIndex((r) => r.id === req.params.id && r.userId === userId);

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
  const userId = getUserId(req);
  dbService.checkRecurringBills(userId);
  const db = dbService.getRaw();

  const statusFilter = req.query.status as string; // 'PAID' | 'UNPAID' | 'OVERDUE' | 'ALL'

  let bills = db.bills.filter((b) => b.userId === userId);
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
  const userId = getUserId(req);
  const db = dbService.getRaw();
  const { name, amountPaise, categoryId, dueDate, notes } = req.body;

  if (!name || !name.trim()) {
    res.status(400).json({ error: 'Bill name is required' });
    return;
  }
  if (!amountPaise || Number(amountPaise) <= 0) {
    res.status(400).json({ error: 'Valid amount is required' });
    return;
  }
  if (!dueDate) {
    res.status(400).json({ error: 'Due date is required' });
    return;
  }

  const todayStr = new Date().toISOString().split('T')[0];
  const isPastDue = dueDate < todayStr;
  const periodKey = dueDate.substring(0, 7);

  const newBill: Bill = {
    id: `bill_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
    userId,
    recurringExpenseId: null,
    name: name.trim(),
    amountPaise: Math.round(Number(amountPaise)),
    categoryId: categoryId || db.categories[0].id,
    dueDate,
    status: isPastDue ? 'OVERDUE' : 'UNPAID',
    paymentDate: null,
    notes: (notes || '').trim(),
    periodKey,
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
  const userId = getUserId(req);
  const { paidDate, paymentMethod, notes } = req.body;

  const result = dbService.markBillAsPaid(
    userId,
    req.params.id,
    paidDate,
    paymentMethod || 'upi_bank',
    notes
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
  const userId = getUserId(req);
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
  const userId = getUserId(req);
  const db = dbService.getRaw();
  const index = db.bills.findIndex((b) => b.id === req.params.id && b.userId === userId);

  if (index === -1) {
    res.status(404).json({ error: 'Bill not found' });
    return;
  }

  // Also remove linked expense if it was paid
  const bill = db.bills[index];
  db.expenseTransactions = db.expenseTransactions.filter((e) => !(e.userId === userId && e.billId === bill.id));
  db.paymentHistory = db.paymentHistory.filter((p) => !(p.userId === userId && p.billId === bill.id));
  db.bills.splice(index, 1);

  dbService.save();
  res.json({ success: true, message: 'Bill removed' });
});

apiRouter.get('/finance/payments-history', (req: Request, res: Response) => {
  const userId = getUserId(req);
  const db = dbService.getRaw();
  const history = db.paymentHistory
    .filter((p) => p.userId === userId)
    .sort((a, b) => b.paidDate.localeCompare(a.paidDate));
  res.json(history);
});
