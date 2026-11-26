import { Router, Request, Response, NextFunction } from 'express';
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
import { vaultBackendService } from './vaultBackendService.js';
import {
  awardAuthoritativeXP,
  getGamificationSnapshot,
  getPaginatedGamificationLeaderboard,
} from './gamificationService.js';
import * as socialService from './socialService.js';
import { validateAndSanitizeAvatarConfig } from '../src/features/avatar/avatar-catalog.ts';
import type { GamificationLeaderboardCategory, XPSource } from '../src/features/gamification/types.ts';
import { buildDefaultStudyWorkspace } from '../src/data/studySeedData.ts';
import { AuthenticatedRequest, requireUserContext } from './auth.js';
import { rateLimiter, sanitizeForLogging } from './security.js';
import {
  DEFAULT_TIMEZONE,
  getTodayDateString,
  getStartOfWeek,
  getEndOfWeek,
  getStartOfMonth,
  getEndOfMonth,
  formatDateInTimezone,
} from './dateTime.js';
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
  ALLOWED_STUDY_PRIORITIES,
  ALLOWED_REVISION_DIFFICULTIES,
  ALLOWED_REVISION_STATUSES,
  ALLOWED_MISTAKE_SEVERITIES,
  ALLOWED_HABIT_FREQUENCIES,
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
import {
  verifySpreadsheet,
  createMasterWorkbook,
  applyWorkbookFormatting,
  syncAllData,
  historicalResync,
  flushQueueOperations,
} from './sheetsWorker.js';
import {
  inspectSpreadsheet,
  inspectPublicSpreadsheet,
  pullSpreadsheetTabs,
  pullPublicSpreadsheetTabs,
  SheetHubWorkerError,
} from './universalSheetsWorker.ts';
import { isValidGoogleSpreadsheetId } from '../src/lib/sheetHub/urlParser.ts';
import type {
  SkillNode,
  WhiteboardDrawing,
  ExamSimulationState,
  DecisionEntry,
  DoomscrollTaxEntry,
  LifeMilestone,
  TimeCapsuleLetter,
  EmergencyAssetProfile,
  MaskedAccountRecord,
  InsurancePolicyRecord,
  NomineeContactRecord,
} from '../src/types/features15.ts';
import crypto from 'crypto';
import { v18StorageService, StorageOwnershipError, StorageNotFoundError } from './v18StorageService.js';
import { pushSheetHubCellUpdates } from './sheetHubWriteWorker.ts';
import { duplicateGoogleDriveFile } from './driveWorker.ts';
import { defaultIdempotencyLedger } from './durableIdempotencyLedger.ts';
import {
  isSpreadsheetAllowlisted,
  dispatchAppsScriptWriteback,
  AppsScriptBridgeError,
} from './appsScriptBridgeWorker.ts';
import type { SheetsSnapshotPayload } from '../src/lib/sheetsSpec.js';
import { googleCalendarOAuthCallbackRouter } from './routes/googleCalendarOAuthCallback.js';
import { googleCalendarRouter } from './routes/googleCalendarRoutes.js';
import { pushRouter } from './routes/pushRoutes.js';
import { cronNotificationRouter } from './routes/cronNotificationRoutes.js';
import { getAdminFirestore, hasServiceAccountCredentials } from './firebaseAdmin.js';

export const apiRouter = Router();

// Specialized system / callback routes mounted before requireUserContext
apiRouter.use(googleCalendarOAuthCallbackRouter);
apiRouter.use(cronNotificationRouter);

// Enforce authenticated token verification (or isolated guest session in non-strict dev/demo mode)
apiRouter.use(requireUserContext);
apiRouter.use(rateLimiter({ maxRequests: 300, windowMs: 60_000 }));

// Authenticated integration routes
apiRouter.use(googleCalendarRouter);
apiRouter.use(pushRouter);

const getAuth = (req: Request) => (req as AuthenticatedRequest).auth;

const canAccess = (itemUserId: string, authUserId: string) => itemUserId === authUserId;

// ----------------------------------------------------
// User & Settings
// ----------------------------------------------------
apiRouter.get('/auth/me', (req: Request, res: Response) => {
  const auth = getAuth(req);
  const { user, settings } = dbService.ensureUserWorkspace(auth.userId, auth);
  res.json({ user, settings });
});

apiRouter.put('/settings', async (req: Request, res: Response, next: NextFunction) => {
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
    studyRoomCustomization,
    studyPlannerSettings,
    avatarConfig,
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

  if (studyRoomCustomization !== undefined) {
    if (typeof studyRoomCustomization !== 'object' || studyRoomCustomization === null || Array.isArray(studyRoomCustomization)) {
      res.status(400).json({ error: 'studyRoomCustomization must be an object' });
      return;
    }
    settings.studyRoomCustomization = studyRoomCustomization as Record<string, unknown>;
  }

  if (studyPlannerSettings !== undefined) {
    if (typeof studyPlannerSettings !== 'object' || studyPlannerSettings === null || Array.isArray(studyPlannerSettings)) {
      res.status(400).json({ error: 'studyPlannerSettings must be an object' });
      return;
    }
    settings.studyPlannerSettings = studyPlannerSettings as Record<string, unknown>;
  }

  if (avatarConfig !== undefined) {
    // Strictly validate against approved catalog & never trust client-supplied modelUrl
    settings.avatarConfig = validateAndSanitizeAvatarConfig(avatarConfig) as unknown as Record<string, unknown>;
  }

  try {
    await dbService.save();
    res.json({ success: true, settings });
  } catch {
    res.status(500).json({ error: 'Database persistence failed' });
  }
});

apiRouter.post('/reseed', async (req: Request, res: Response, next: NextFunction) => {
  const { userId } = getAuth(req);
  try {
    dbService.reseed(userId);
    await dbService.flush();
    res.json({ success: true, message: 'Workspace reset to starter seed data' });
  } catch {
    res.status(500).json({ error: 'Database persistence failed' });
  }
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

  const userSettings = db.userSettings.find((s) => s.userId === userId);
  const tz = userSettings?.timezone || DEFAULT_TIMEZONE;
  const todayStr = getTodayDateString(tz);
  const currentMonthKey = todayStr.substring(0, 7);
  const weekStartStr = getStartOfWeek(todayStr);

  // 1. Focus metrics
  const userSessions = db.focusSessions.filter((s) => s.userId === userId);
  const todaySessions = userSessions.filter((s) => formatDateInTimezone(s.startedAt, tz) === todayStr && s.completed);
  const weekSessions = userSessions.filter(
    (s) => s.completed && s.mode === 'work' && formatDateInTimezone(s.startedAt, tz) >= weekStartStr
  );

  const getSessionDurationSecs = (s: FocusSession) =>
    typeof s.actualDurationSeconds === 'number' && !Number.isNaN(s.actualDurationSeconds)
      ? s.actualDurationSeconds
      : typeof s.durationSeconds === 'number' && !Number.isNaN(s.durationSeconds)
        ? s.durationSeconds
        : (s.durationMinutes || 0) * 60;
  const todayFocusSeconds = todaySessions
    .filter((s) => s.mode === 'work')
    .reduce((acc, s) => acc + getSessionDurationSecs(s), 0);
  const weeklyFocusMinutes = Math.round(
    weekSessions.reduce((acc, s) => acc + getSessionDurationSecs(s), 0) / 60
  );
  const completedPomodoroSessions = todaySessions.filter((s) => s.mode === 'work').length;
  const streak = calculateBoundedStreakDays(userSessions, tz);
  const bestStreakDays = computeBestStreakDays(userSessions, tz);

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
      db.categories.find(
        (c) => c.id === exp.categoryId && (c.userId === userId || c.userId === 'usr_atif_default')
      )?.name ||
      (exp.type === 'fixed' ? 'Fixed Expense' : 'Uncategorized'),
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

apiRouter.post('/focus/sessions', async (req: Request, res: Response, _next: NextFunction) => {
  const { userId } = getAuth(req);
  const db = dbService.getRaw();
  const body = (req.body && typeof req.body === 'object' ? req.body : {}) as Record<string, unknown>;
  const {
    id,
    taskId,
    subjectCode,
    subjectId,
    topicId,
    activityType,
    mode,
    presetId,
    durationMinutes,
    durationSeconds,
    actualDurationSeconds,
    completed,
    status,
    interrupted,
    pauseCount,
    totalPauseSeconds,
    interruptionReason,
    startedAt,
    endedAt,
    endReason,
  } = body;

  const parsedMode = mode === undefined ? 'work' : parseEnum(mode, ALLOWED_FOCUS_MODES);
  if (!parsedMode) {
    res.status(400).json({ error: 'Invalid focus session mode' });
    return;
  }

  const parsedMinutes =
    durationMinutes === undefined ? 25 : parsePositiveInt(durationMinutes, 1, 1440);
  if (parsedMinutes === null) {
    res.status(400).json({ error: 'durationMinutes must be a positive integer between 1 and 1440' });
    return;
  }

  const parsedSeconds =
    durationSeconds === undefined
      ? parsedMinutes * 60
      : parsePositiveInt(durationSeconds, 1, 86400);
  if (parsedSeconds === null) {
    res.status(400).json({ error: 'durationSeconds must be a positive integer between 1 and 86400' });
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

  const parsedStatus =
    status === undefined
      ? undefined
      : parseEnum(status, ['in_progress', 'completed', 'interrupted'] as const);
  if (status !== undefined && !parsedStatus) {
    res.status(400).json({ error: 'Invalid session status' });
    return;
  }

  const parsedEndReason =
    endReason === undefined || endReason === null
      ? null
      : parseEnum(endReason, ['completed', 'reset', 'skipped', 'abandoned'] as const);
  if (endReason !== undefined && endReason !== null && !parsedEndReason) {
    res.status(400).json({ error: 'Invalid endReason' });
    return;
  }

  const isCompleted =
    completed !== undefined
      ? completed
      : parsedStatus !== undefined
        ? parsedStatus === 'completed'
        : true;
  const resolvedStatus: 'in_progress' | 'completed' | 'interrupted' =
    parsedStatus || (isCompleted ? 'completed' : 'in_progress');

  const parsedActualDurationSeconds =
    actualDurationSeconds === undefined
      ? isCompleted
        ? parsedSeconds
        : 0
      : parseNonNegativeInt(actualDurationSeconds, 86400);
  if (parsedActualDurationSeconds === null) {
    res.status(400).json({ error: 'actualDurationSeconds must be a non-negative integer between 0 and 86400' });
    return;
  }

  const parsedPauseCount =
    pauseCount === undefined ? 0 : parseNonNegativeInt(pauseCount, 1000);
  if (parsedPauseCount === null) {
    res.status(400).json({ error: 'pauseCount must be a non-negative integer' });
    return;
  }

  const parsedTotalPauseSeconds =
    totalPauseSeconds === undefined ? 0 : parseNonNegativeInt(totalPauseSeconds, 86400);
  if (parsedTotalPauseSeconds === null) {
    res.status(400).json({ error: 'totalPauseSeconds must be a non-negative integer' });
    return;
  }

  const startIso =
    typeof startedAt === 'string' && !Number.isNaN(Date.parse(startedAt))
      ? startedAt
      : new Date().toISOString();
  const endIso: string | null =
    endedAt === null
      ? null
      : typeof endedAt === 'string' && !Number.isNaN(Date.parse(endedAt))
        ? endedAt
        : isCompleted
          ? new Date().toISOString()
          : null;

  const clientProvidedId =
    typeof id === 'string' && id.trim().length > 0 && id.trim().length <= 128 ? id.trim() : null;
  const resolvedSessionId =
    clientProvidedId || `foc_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;

  const existing = clientProvidedId
    ? db.focusSessions.find((s) => s.id === resolvedSessionId && s.userId === userId)
    : undefined;
  const wasCompleted = Boolean(existing?.completed);

  let taskTitle: string | null | undefined = existing?.taskTitle;
  const resolvedTaskId = typeof taskId === 'string' && taskId.trim() ? taskId.trim() : null;
  if (resolvedTaskId) {
    const task = db.tasks.find((t) => t.id === resolvedTaskId && t.userId === userId && !t.deletedAt);
    if (task) {
      taskTitle = task.title;
      if (!wasCompleted && isCompleted && parsedMode === 'work') {
        task.completedPomodoros = (task.completedPomodoros || 0) + 1;
        task.updatedAt = new Date().toISOString();
      }
    }
  }

  const resolvedSubjectCode = typeof subjectCode === 'string' && subjectCode.trim() ? subjectCode.trim() : null;
  const resolvedSubjectId = typeof subjectId === 'string' && subjectId.trim() ? subjectId.trim() : null;
  const resolvedTopicId = typeof topicId === 'string' && topicId.trim() ? topicId.trim() : null;
  const resolvedPresetId = typeof presetId === 'string' && presetId.trim() ? presetId.trim() : null;
  const resolvedActivityType =
    typeof activityType === 'string' && ['study', 'practice', 'theory', 'revision'].includes(activityType)
      ? (activityType as 'study' | 'practice' | 'theory' | 'revision')
      : null;

  const sessionPayload: FocusSession = {
    id: resolvedSessionId,
    userId,
    taskId: resolvedTaskId,
    taskTitle: taskTitle ?? null,
    subjectCode: resolvedSubjectCode,
    subjectId: resolvedSubjectId,
    topicId: resolvedTopicId,
    activityType: resolvedActivityType,
    mode: parsedMode,
    presetId: resolvedPresetId,
    durationMinutes: parsedMinutes,
    durationSeconds: parsedSeconds,
    actualDurationSeconds: parsedActualDurationSeconds,
    completed: isCompleted,
    status: resolvedStatus,
    interrupted: typeof interrupted === 'boolean' ? interrupted : resolvedStatus === 'interrupted',
    pauseCount: parsedPauseCount,
    totalPauseSeconds: parsedTotalPauseSeconds,
    interruptionReason: typeof interruptionReason === 'string' ? interruptionReason.trim() : undefined,
    startedAt: existing?.startedAt || startIso,
    endedAt: endIso,
    endReason: parsedEndReason ?? (isCompleted ? 'completed' : null),
  };

  if (existing) {
    Object.assign(existing, sessionPayload);
  } else {
    db.focusSessions.push(sessionPayload);
  }

  try {
    await dbService.save();
    res.status(existing ? 200 : 201).json(existing || sessionPayload);
  } catch {
    res.status(500).json({ error: 'Database persistence failed' });
  }
});

apiRouter.patch('/focus/sessions/:id', async (req: Request, res: Response) => {
  const { userId } = getAuth(req);
  const { id } = req.params;
  const db = dbService.getRaw();
  const session = db.focusSessions.find((s) => s.id === id && s.userId === userId);
  if (!session) {
    res.status(404).json({ error: 'Focus session not found' });
    return;
  }

  const body = (req.body && typeof req.body === 'object' ? req.body : {}) as Record<string, unknown>;
  const wasCompleted = Boolean(session.completed);

  if (body.status !== undefined) {
    const parsedStatus = parseEnum(body.status, ['in_progress', 'completed', 'interrupted'] as const);
    if (!parsedStatus) {
      res.status(400).json({ error: 'Invalid session status' });
      return;
    }
    session.status = parsedStatus;
    if (body.completed === undefined) {
      session.completed = parsedStatus === 'completed';
    }
  }

  if (body.completed !== undefined) {
    if (typeof body.completed !== 'boolean') {
      res.status(400).json({ error: 'completed must be a boolean' });
      return;
    }
    session.completed = body.completed;
    if (body.status === undefined) {
      session.status = body.completed ? 'completed' : 'interrupted';
    }
  }

  if (body.actualDurationSeconds !== undefined) {
    const parsedActual = parseNonNegativeInt(body.actualDurationSeconds, 86400);
    if (parsedActual === null) {
      res.status(400).json({ error: 'actualDurationSeconds must be a non-negative integer between 0 and 86400' });
      return;
    }
    session.actualDurationSeconds = parsedActual;
  }

  if (body.endedAt !== undefined) {
    if (body.endedAt === null) {
      session.endedAt = null;
    } else if (typeof body.endedAt === 'string' && !Number.isNaN(Date.parse(body.endedAt))) {
      session.endedAt = body.endedAt;
    } else {
      res.status(400).json({ error: 'Invalid endedAt timestamp' });
      return;
    }
  }

  if (body.endReason !== undefined) {
    if (body.endReason === null) {
      session.endReason = null;
    } else {
      const parsedEndReason = parseEnum(body.endReason, ['completed', 'reset', 'skipped', 'abandoned'] as const);
      if (!parsedEndReason) {
        res.status(400).json({ error: 'Invalid endReason' });
        return;
      }
      session.endReason = parsedEndReason;
    }
  }

  if (body.interrupted !== undefined) {
    session.interrupted = Boolean(body.interrupted);
  }

  if (body.pauseCount !== undefined) {
    const parsedPauseCount = parseNonNegativeInt(body.pauseCount, 1000);
    if (parsedPauseCount === null) {
      res.status(400).json({ error: 'pauseCount must be a non-negative integer' });
      return;
    }
    session.pauseCount = parsedPauseCount;
  }

  if (body.totalPauseSeconds !== undefined) {
    const parsedTotalPause = parseNonNegativeInt(body.totalPauseSeconds, 86400);
    if (parsedTotalPause === null) {
      res.status(400).json({ error: 'totalPauseSeconds must be a non-negative integer' });
      return;
    }
    session.totalPauseSeconds = parsedTotalPause;
  }

  if (typeof body.interruptionReason === 'string') {
    session.interruptionReason = body.interruptionReason.trim();
  }

  if (!wasCompleted && session.completed && session.mode === 'work' && session.taskId) {
    const task = db.tasks.find((t) => t.id === session.taskId && t.userId === userId && !t.deletedAt);
    if (task) {
      task.completedPomodoros = (task.completedPomodoros || 0) + 1;
      task.updatedAt = new Date().toISOString();
    }
  }

  try {
    await dbService.save();
    res.json(session);
  } catch {
    res.status(500).json({ error: 'Database persistence failed' });
  }
});

apiRouter.get('/focus/stats', (req: Request, res: Response) => {
  const { userId } = getAuth(req);
  const db = dbService.getRaw();
  const userSettings = db.userSettings.find((s) => s.userId === userId);
  const tz = userSettings?.timezone || DEFAULT_TIMEZONE;
  const todayStr = getTodayDateString(tz);
  const workSessions = db.focusSessions.filter(
    (s) => s.userId === userId && s.completed && s.mode === 'work'
  );
  const getSessionDurationSecs = (s: FocusSession) =>
    typeof s.actualDurationSeconds === 'number' ? s.actualDurationSeconds : s.durationSeconds;

  const last7Days: { date: string; dayName: string; minutes: number; sessionsCount: number }[] = [];
  const dayNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

  for (let i = 6; i >= 0; i--) {
    const d = new Date(`${todayStr}T12:00:00Z`);
    d.setUTCDate(d.getUTCDate() - i);
    const dateStr = d.toISOString().split('T')[0];
    const dayName = dayNames[d.getUTCDay()];

    const daysSessions = workSessions.filter((s) => formatDateInTimezone(s.startedAt, tz) === dateStr);
    const totalSecs = daysSessions.reduce((acc, s) => acc + getSessionDurationSecs(s), 0);

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
    const d = new Date(`${todayStr}T12:00:00Z`);
    d.setUTCDate(d.getUTCDate() - i);
    const dateStr = d.toISOString().split('T')[0];
    const daySessions = workSessions.filter((s) => formatDateInTimezone(s.startedAt, tz) === dateStr);
    const totalSecs = daySessions.reduce((acc, s) => acc + getSessionDurationSecs(s), 0);
    dailyHeatmap.push({
      date: dateStr,
      minutes: Math.round(totalSecs / 60),
      sessionsCount: daySessions.length,
    });
  }

  const weeklyMinutes = last7Days.reduce((acc, d) => acc + d.minutes, 0);

  const currentMonthKey = todayStr.substring(0, 7);
  const monthSessions = workSessions.filter((s) =>
    formatDateInTimezone(s.startedAt, tz).startsWith(currentMonthKey)
  );
  const monthMinutes = Math.round(
    monthSessions.reduce((acc, s) => acc + getSessionDurationSecs(s), 0) / 60
  );

  const totalMinutes = Math.round(
    workSessions.reduce((acc, s) => acc + getSessionDurationSecs(s), 0) / 60
  );
  const totalCompletedSessions = workSessions.length;

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

apiRouter.post('/tasks', async (req: Request, res: Response, next: NextFunction) => {
  const { userId } = getAuth(req);
  const db = dbService.getRaw();
  const body = (req.body && typeof req.body === 'object' ? req.body : {}) as Record<string, unknown>;
  const {
    title,
    description,
    priority,
    status,
    estimatedPomodoros,
    dueDate,
    category,
    subtasks,
    recurrence,
    order,
    subjectId,
    subjectCode,
    topicId,
    unit,
    subtopicTitle,
  } = body;

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

  const parsedSubjectId = parseOptionalString(subjectId, 128);
  const parsedSubjectCode = parseOptionalString(subjectCode, 128);
  const parsedTopicId = parseOptionalString(topicId, 128);
  const parsedUnit = parseOptionalString(unit, 128);
  const parsedSubtopicTitle = parseOptionalString(subtopicTitle, 200);

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
    subjectId: parsedSubjectId || null,
    subjectCode: parsedSubjectCode || null,
    topicId: parsedTopicId || null,
    unit: parsedUnit || null,
    subtopicTitle: parsedSubtopicTitle || null,
  };

  db.tasks.unshift(newTask);
  try {
    await dbService.save();
    res.status(201).json(newTask);
  } catch {
    res.status(500).json({ error: 'Database persistence failed' });
  }
});

apiRouter.put('/tasks/:id', async (req: Request, res: Response, next: NextFunction) => {
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
    subjectId,
    subjectCode,
    topicId,
    unit,
    subtopicTitle,
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

  if (subjectId !== undefined) {
    task.subjectId = parseOptionalString(subjectId, 128) || null;
  }
  if (subjectCode !== undefined) {
    task.subjectCode = parseOptionalString(subjectCode, 128) || null;
  }
  if (topicId !== undefined) {
    task.topicId = parseOptionalString(topicId, 128) || null;
  }
  if (unit !== undefined) {
    task.unit = parseOptionalString(unit, 128) || null;
  }
  if (subtopicTitle !== undefined) {
    task.subtopicTitle = parseOptionalString(subtopicTitle, 200) || null;
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

  try {
    await dbService.save();
    res.json(task);
  } catch {
    res.status(500).json({ error: 'Database persistence failed' });
  }
});

apiRouter.delete('/tasks/:id', async (req: Request, res: Response, next: NextFunction) => {
  const { userId } = getAuth(req);
  const db = dbService.getRaw();
  const task = db.tasks.find(
    (t) => t.id === req.params.id && canAccess(t.userId, userId) && !t.deletedAt
  );

  if (!task) {
    res.status(404).json({ error: 'Task not found' });
    return;
  }

  task.deletedAt = new Date().toISOString();
  task.updatedAt = task.deletedAt;
  try {
    await dbService.save();
    res.json({ success: true, message: 'Task moved to trash' });
  } catch {
    res.status(500).json({ error: 'Database persistence failed' });
  }
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

apiRouter.post('/finance/categories', async (req: Request, res: Response, next: NextFunction) => {
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
  try {
    await dbService.save();
    res.status(201).json(category);
  } catch {
    res.status(500).json({ error: 'Database persistence failed' });
  }
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

  const userSettings = db.userSettings.find((s) => s.userId === userId);
  const tz = userSettings?.timezone || DEFAULT_TIMEZONE;
  const todayStr = getTodayDateString(tz);
  let startDateStr = '';
  let endDateStr = '';

  if (filter === 'today') {
    startDateStr = todayStr;
    endDateStr = todayStr;
  } else if (filter === 'this_week') {
    startDateStr = getStartOfWeek(todayStr);
    endDateStr = getEndOfWeek(todayStr);
  } else if (filter === 'this_month') {
    startDateStr = getStartOfMonth(todayStr);
    endDateStr = getEndOfMonth(todayStr);
  } else if (filter === 'last_month') {
    const [yStr, mStr] = todayStr.split('-');
    let y = parseInt(yStr, 10);
    let m = parseInt(mStr, 10) - 1;
    if (m === 0) {
      m = 12;
      y -= 1;
    }
    const lastMonthSample = `${y}-${String(m).padStart(2, '0')}-01`;
    startDateStr = getStartOfMonth(lastMonthSample);
    endDateStr = getEndOfMonth(lastMonthSample);
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
    startDateStr = getStartOfMonth(todayStr);
    endDateStr = getEndOfMonth(todayStr);
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
    const cat = db.categories.find(
      (c) => c.id === exp.categoryId && (c.userId === userId || c.userId === 'usr_atif_default')
    );
    const catId = exp.categoryId || 'other';
    const catName = cat?.name || (exp.type === 'fixed' ? 'Fixed Expense' : 'Uncategorized');
    const catColor = cat?.color || '#94a3b8';

    if (!categoryMap[catId]) {
      categoryMap[catId] = { categoryId: catId, name: catName, color: catColor, amountPaise: 0 };
    }
    categoryMap[catId].amountPaise += exp.amountPaise;
  }
  const categoryBreakdown = Object.values(categoryMap).sort((a, b) => b.amountPaise - a.amountPaise);

  const monthlyTrend: { month: string; incomePaise: number; expensePaise: number }[] = [];
  const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const [currentY, currentM] = todayStr.split('-').map(Number);
  for (let m = 5; m >= 0; m--) {
    let y = currentY;
    let mo = currentM - m;
    while (mo <= 0) {
      mo += 12;
      y -= 1;
    }
    const key = `${y}-${String(mo).padStart(2, '0')}`;
    const label = `${monthNames[mo - 1]} ${String(y).slice(-2)}`;

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

apiRouter.post('/finance/income', async (req: Request, res: Response, next: NextFunction) => {
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
      ? getTodayDateString(DEFAULT_TIMEZONE)
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
  try {
    await dbService.save();
    res.status(201).json(newIncome);
  } catch {
    res.status(500).json({ error: 'Database persistence failed' });
  }
});

apiRouter.put('/finance/income/:id', async (req: Request, res: Response, next: NextFunction) => {
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

  try {
    await dbService.save();
    res.json(income);
  } catch {
    res.status(500).json({ error: 'Database persistence failed' });
  }
});

apiRouter.delete('/finance/income/:id', async (req: Request, res: Response, next: NextFunction) => {
  const { userId } = getAuth(req);
  const db = dbService.getRaw();
  const income = db.incomeTransactions.find(
    (inc) => inc.id === req.params.id && canAccess(inc.userId, userId) && !inc.deletedAt
  );

  if (!income) {
    res.status(404).json({ error: 'Income record not found' });
    return;
  }

  income.deletedAt = new Date().toISOString();
  try {
    await dbService.save();
    res.json({ success: true, message: 'Income record moved to trash' });
  } catch {
    res.status(500).json({ error: 'Database persistence failed' });
  }
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
      categoryName:
        db.categories.find(
          (c) => c.id === e.categoryId && (c.userId === userId || c.userId === 'usr_atif_default')
        )?.name || 'Uncategorized',
      categoryColor:
        db.categories.find(
          (c) => c.id === e.categoryId && (c.userId === userId || c.userId === 'usr_atif_default')
        )?.color || '#6366f1',
    }))
    .sort((a, b) => b.date.localeCompare(a.date));

  res.json(mapped);
});

apiRouter.post('/finance/expenses', async (req: Request, res: Response, next: NextFunction) => {
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
      ? getTodayDateString(DEFAULT_TIMEZONE)
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

  const rawCatName = typeof body.categoryName === 'string' && body.categoryName.trim() ? body.categoryName.trim() : null;
  let resolvedCategoryId: string | null = null;

  if (typeof categoryId === 'string' && categoryId.trim()) {
    const directMatch = db.categories.find((c) => c.id === categoryId.trim() && (c.userId === userId || c.userId === 'usr_atif_default'));
    if (directMatch) {
      resolvedCategoryId = directMatch.id;
    } else {
      const nameMatch = db.categories.find(
        (c) => (c.userId === userId || c.userId === 'usr_atif_default') &&
          c.name.trim().toLowerCase() === categoryId.trim().toLowerCase()
      ) || db.categories.find(
        (c) => (c.userId === userId || c.userId === 'usr_atif_default') &&
          (c.name.toLowerCase().includes(categoryId.trim().toLowerCase()) || categoryId.trim().toLowerCase().includes(c.name.toLowerCase()))
      );
      if (nameMatch) {
        resolvedCategoryId = nameMatch.id;
      }
    }
  }

  if (!resolvedCategoryId && rawCatName) {
    const nameMatch = db.categories.find(
      (c) => (c.userId === userId || c.userId === 'usr_atif_default') &&
        c.name.trim().toLowerCase() === rawCatName.toLowerCase()
    ) || db.categories.find(
      (c) => (c.userId === userId || c.userId === 'usr_atif_default') &&
        (c.name.toLowerCase().includes(rawCatName.toLowerCase()) || rawCatName.toLowerCase().includes(c.name.toLowerCase()))
    );
    if (nameMatch) {
      resolvedCategoryId = nameMatch.id;
    }
  }

  if (!resolvedCategoryId) {
    resolvedCategoryId = dbService.getFallbackCategoryId(userId);
  }

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
  try {
    await dbService.save();
    res.status(201).json({
      ...newExpense,
      categoryName: db.categories.find((c) => c.id === newExpense.categoryId)?.name || 'Expense',
    });
  } catch {
    res.status(500).json({ error: 'Database persistence failed' });
  }
});

apiRouter.put('/finance/expenses/:id', async (req: Request, res: Response, next: NextFunction) => {
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
  const { categoryId, categoryName, amountPaise, date, description, paymentMethod, notes, type } = body;

  if (categoryId !== undefined) {
    if (typeof categoryId !== 'string' || !categoryId.trim()) {
      res.status(400).json({ error: 'Invalid categoryId', code: 'INVALID_CATEGORY' });
      return;
    }
    const trimmedCat = categoryId.trim();
    const catExists = db.categories.some(
      (c) => c.id === trimmedCat && (c.userId === userId || c.userId === 'usr_atif_default')
    );
    if (!catExists) {
      res.status(400).json({ error: 'Referenced category does not exist or belongs to another user', code: 'INVALID_CATEGORY' });
      return;
    }
    expense.categoryId = trimmedCat;
  } else if (typeof categoryName === 'string' && categoryName.trim()) {
    const trimmedName = categoryName.trim().toLowerCase();
    const nameMatch =
      db.categories.find(
        (c) =>
          (c.userId === userId || c.userId === 'usr_atif_default' || c.userId === 'system') &&
          c.name.trim().toLowerCase() === trimmedName
      ) ||
      db.categories.find(
        (c) =>
          (c.userId === userId || c.userId === 'usr_atif_default' || c.userId === 'system') &&
          (c.name.toLowerCase().includes(trimmedName) || trimmedName.includes(c.name.toLowerCase()))
      );
    if (nameMatch) {
      expense.categoryId = nameMatch.id;
    }
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

  try {
    await dbService.save();
    res.json({
      ...expense,
      categoryName: db.categories.find((c) => c.id === expense.categoryId)?.name || 'Expense',
    });
  } catch {
    res.status(500).json({ error: 'Database persistence failed' });
  }
});

apiRouter.delete('/finance/expenses/:id', async (req: Request, res: Response, next: NextFunction) => {
  const { userId } = getAuth(req);
  const db = dbService.getRaw();
  const expense = db.expenseTransactions.find(
    (e) => e.id === req.params.id && canAccess(e.userId, userId) && !e.deletedAt
  );

  if (!expense) {
    res.status(404).json({ error: 'Expense record not found' });
    return;
  }

  expense.deletedAt = new Date().toISOString();
  try {
    await dbService.save();
    res.json({ success: true, message: 'Expense record moved to trash' });
  } catch {
    res.status(500).json({ error: 'Database persistence failed' });
  }
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

apiRouter.post('/finance/recurring', async (req: Request, res: Response, next: NextFunction) => {
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

  const rawCatName = typeof body.categoryName === 'string' && body.categoryName.trim() ? body.categoryName.trim() : null;
  let resolvedCategoryId: string | null = null;

  if (typeof categoryId === 'string' && categoryId.trim()) {
    const directMatch = db.categories.find((c) => c.id === categoryId.trim() && (c.userId === userId || c.userId === 'usr_atif_default'));
    if (directMatch) {
      resolvedCategoryId = directMatch.id;
    } else {
      const nameMatch = db.categories.find(
        (c) => (c.userId === userId || c.userId === 'usr_atif_default') &&
          c.name.trim().toLowerCase() === categoryId.trim().toLowerCase()
      ) || db.categories.find(
        (c) => (c.userId === userId || c.userId === 'usr_atif_default') &&
          (c.name.toLowerCase().includes(categoryId.trim().toLowerCase()) || categoryId.trim().toLowerCase().includes(c.name.toLowerCase()))
      );
      if (nameMatch) {
        resolvedCategoryId = nameMatch.id;
      }
    }
  }

  if (!resolvedCategoryId && rawCatName) {
    const nameMatch = db.categories.find(
      (c) => (c.userId === userId || c.userId === 'usr_atif_default') &&
        c.name.trim().toLowerCase() === rawCatName.toLowerCase()
    ) || db.categories.find(
      (c) => (c.userId === userId || c.userId === 'usr_atif_default') &&
        (c.name.toLowerCase().includes(rawCatName.toLowerCase()) || rawCatName.toLowerCase().includes(c.name.toLowerCase()))
    );
    if (nameMatch) {
      resolvedCategoryId = nameMatch.id;
    }
  }

  if (!resolvedCategoryId) {
    resolvedCategoryId = dbService.getFallbackCategoryId(userId);
  }

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
  try {
    await dbService.save();
    dbService.checkRecurringBills(userId);
    res.status(201).json({
      ...newRec,
      categoryName: db.categories.find((c) => c.id === newRec.categoryId)?.name || 'Fixed Expense',
    });
  } catch {
    res.status(500).json({ error: 'Database persistence failed' });
  }
});

apiRouter.put('/finance/recurring/:id', async (req: Request, res: Response, next: NextFunction) => {
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
      res.status(400).json({ error: 'Invalid categoryId', code: 'INVALID_CATEGORY' });
      return;
    }
    const trimmedCat = categoryId.trim();
    const catExists = db.categories.some(
      (c) => c.id === trimmedCat && (c.userId === userId || c.userId === 'usr_atif_default')
    );
    if (!catExists) {
      res.status(400).json({ error: 'Referenced category does not exist or belongs to another user', code: 'INVALID_CATEGORY' });
      return;
    }
    rec.categoryId = trimmedCat;
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
  try {
    await dbService.save();
    res.json({
      ...rec,
      categoryName: db.categories.find((c) => c.id === rec.categoryId)?.name || 'Fixed Expense',
    });
  } catch {
    res.status(500).json({ error: 'Database persistence failed' });
  }
});

apiRouter.delete('/finance/recurring/:id', async (req: Request, res: Response, next: NextFunction) => {
  const { userId } = getAuth(req);
  const db = dbService.getRaw();
  const index = db.recurringExpenses.findIndex(
    (r) => r.id === req.params.id && canAccess(r.userId, userId)
  );

  if (index === -1) {
    res.status(404).json({ error: 'Recurring expense not found' });
    return;
  }

  db.recurringExpenses.splice(index, 1);
  try {
    await dbService.save();
    res.json({ success: true, message: 'Recurring expense removed' });
  } catch {
    res.status(500).json({ error: 'Database persistence failed' });
  }
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

apiRouter.post('/finance/bills', async (req: Request, res: Response, next: NextFunction) => {
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

  const todayStr = getTodayDateString(DEFAULT_TIMEZONE);
  const isPastDue = parsedDueDate < todayStr;
  const periodKey = parsedDueDate.substring(0, 7);
  const rawCatName = typeof body.categoryName === 'string' && body.categoryName.trim() ? body.categoryName.trim() : null;
  let resolvedCategoryId: string | null = null;

  if (typeof categoryId === 'string' && categoryId.trim()) {
    const directMatch = db.categories.find((c) => c.id === categoryId.trim() && (c.userId === userId || c.userId === 'usr_atif_default'));
    if (directMatch) {
      resolvedCategoryId = directMatch.id;
    } else {
      const nameMatch = db.categories.find(
        (c) => (c.userId === userId || c.userId === 'usr_atif_default') &&
          c.name.trim().toLowerCase() === categoryId.trim().toLowerCase()
      ) || db.categories.find(
        (c) => (c.userId === userId || c.userId === 'usr_atif_default') &&
          (c.name.toLowerCase().includes(categoryId.trim().toLowerCase()) || categoryId.trim().toLowerCase().includes(c.name.toLowerCase()))
      );
      if (nameMatch) {
        resolvedCategoryId = nameMatch.id;
      }
    }
  }

  if (!resolvedCategoryId && rawCatName) {
    const nameMatch = db.categories.find(
      (c) => (c.userId === userId || c.userId === 'usr_atif_default') &&
        c.name.trim().toLowerCase() === rawCatName.toLowerCase()
    ) || db.categories.find(
      (c) => (c.userId === userId || c.userId === 'usr_atif_default') &&
        (c.name.toLowerCase().includes(rawCatName.toLowerCase()) || rawCatName.toLowerCase().includes(c.name.toLowerCase()))
    );
    if (nameMatch) {
      resolvedCategoryId = nameMatch.id;
    }
  }

  if (!resolvedCategoryId) {
    resolvedCategoryId = dbService.getFallbackCategoryId(userId);
  }

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
  try {
    await dbService.save();
    res.status(201).json({
      ...newBill,
      categoryName: db.categories.find((c) => c.id === newBill.categoryId)?.name || 'Bill',
    });
  } catch {
    res.status(500).json({ error: 'Database persistence failed' });
  }
});

apiRouter.post('/finance/bills/:id/pay', async (req: Request, res: Response, next: NextFunction) => {
  const { userId } = getAuth(req);
  const body = (req.body && typeof req.body === 'object' ? req.body : {}) as Record<string, unknown>;
  const { paidDate, paymentMethod, notes, idempotencyKey } = body;

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

  const parsedIdemKey =
    typeof idempotencyKey === 'string' && idempotencyKey.trim()
      ? idempotencyKey.trim().slice(0, 128)
      : undefined;

  try {
    const result = dbService.markBillAsPaid(
      userId,
      req.params.id,
      validPaidDate,
      parsedMethod,
      parsedNotes,
      parsedIdemKey
    );
    if (!result.success) {
      res.status(400).json({ error: result.error });
      return;
    }
    await dbService.flush();

    const db = dbService.getRaw();
    const bill = result.bill!;
    res.json({
      success: true,
      bill: {
        ...bill,
        categoryName: db.categories.find((c) => c.id === bill.categoryId)?.name || 'Bill',
      },
    });
  } catch {
    res.status(500).json({ error: 'Database persistence failed' });
  }
});

apiRouter.post('/finance/bills/:id/undo', async (req: Request, res: Response, next: NextFunction) => {
  const { userId } = getAuth(req);
  try {
    const result = dbService.undoBillPayment(userId, req.params.id);
    if (!result.success) {
      res.status(400).json({ error: result.error });
      return;
    }
    await dbService.flush();

    const db = dbService.getRaw();
    const bill = result.bill!;
    res.json({
      success: true,
      bill: {
        ...bill,
        categoryName: db.categories.find((c) => c.id === bill.categoryId)?.name || 'Bill',
      },
    });
  } catch {
    res.status(500).json({ error: 'Database persistence failed' });
  }
});

apiRouter.delete('/finance/bills/:id', async (req: Request, res: Response, next: NextFunction) => {
  const { userId } = getAuth(req);
  const db = dbService.getRaw();
  const bill = db.bills.find(
    (b) => b.id === req.params.id && canAccess(b.userId, userId) && !b.deletedAt
  );

  if (!bill) {
    res.status(404).json({ error: 'Bill not found' });
    return;
  }

  const nowIso = new Date().toISOString();
  bill.deletedAt = nowIso;
  bill.updatedAt = nowIso;
  for (const exp of db.expenseTransactions) {
    if (canAccess(exp.userId, userId) && exp.billId === bill.id && !exp.deletedAt) {
      exp.deletedAt = nowIso;
    }
  }

  try {
    await dbService.save();
    res.json({ success: true, message: 'Bill moved to trash' });
  } catch {
    res.status(500).json({ error: 'Database persistence failed' });
  }
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

apiRouter.post('/finance/savings-goals', async (req: Request, res: Response, next: NextFunction) => {
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
  try {
    await dbService.save();
    res.status(201).json(created);
  } catch {
    res.status(500).json({ error: 'Database persistence failed' });
  }
});

apiRouter.put('/finance/savings-goals/:id', async (req: Request, res: Response, next: NextFunction) => {
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
  try {
    await dbService.save();
    res.json(goal);
  } catch {
    res.status(500).json({ error: 'Database persistence failed' });
  }
});

apiRouter.post('/finance/savings-goals/:id/contribute', async (req: Request, res: Response, next: NextFunction) => {
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
  try {
    await dbService.save();
    res.json(goal);
  } catch {
    res.status(500).json({ error: 'Database persistence failed' });
  }
});

apiRouter.delete('/finance/savings-goals/:id', async (req: Request, res: Response, next: NextFunction) => {
  const { userId } = getAuth(req);
  const db = dbService.getRaw();
  const idx = db.savingsGoals.findIndex(
    (g) => g.id === req.params.id && canAccess(g.userId, userId)
  );
  if (idx === -1) {
    res.status(404).json({ error: 'Savings goal not found' });
    return;
  }
  db.savingsGoals.splice(idx, 1);
  try {
    await dbService.save();
    res.json({ success: true });
  } catch {
    res.status(500).json({ error: 'Database persistence failed' });
  }
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
    ...(db.timeBlocks || [])
      .filter((tb) => tb.userId === userId && tb.deletedAt)
      .map((tb) => ({
        id: tb.id,
        entityType: 'time_block' as const,
        title: tb.title,
        subtitle: `Time Block · ${tb.date}`,
        deletedAt: tb.deletedAt!,
      })),
    ...(db.envelopes || [])
      .filter((env) => env.userId === userId && env.deletedAt)
      .map((env) => ({
        id: env.id,
        entityType: 'envelope' as const,
        title: env.name,
        subtitle: `Envelope · ${env.monthKey}`,
        amountPaise: env.allocatedPaise,
        deletedAt: env.deletedAt!,
      })),
    ...(db.subscriptions || [])
      .filter((s) => s.userId === userId && s.deletedAt)
      .map((s) => ({
        id: s.id,
        entityType: 'subscription' as const,
        title: s.name,
        subtitle: `Subscription · ${s.billingCycle}`,
        amountPaise: s.amountPaise,
        deletedAt: s.deletedAt!,
      })),
  ].sort((a, b) => b.deletedAt.localeCompare(a.deletedAt));

  res.json(items);
});

apiRouter.post('/trash/:entityType/:id/restore', async (req: Request, res: Response, next: NextFunction) => {
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
  } else if (entityType === 'time_block') {
    const item = (db.timeBlocks || []).find((tb) => tb.id === id && tb.userId === userId && tb.deletedAt);
    if (!item) {
      res.status(404).json({ error: 'Trashed time block not found' });
      return;
    }
    item.deletedAt = null;
    item.updatedAt = new Date().toISOString();
  } else if (entityType === 'envelope') {
    const item = (db.envelopes || []).find((env) => env.id === id && env.userId === userId && env.deletedAt);
    if (!item) {
      res.status(404).json({ error: 'Trashed envelope not found' });
      return;
    }
    item.deletedAt = null;
    item.updatedAt = new Date().toISOString();
  } else if (entityType === 'subscription') {
    const item = (db.subscriptions || []).find((sub) => sub.id === id && sub.userId === userId && sub.deletedAt);
    if (!item) {
      res.status(404).json({ error: 'Trashed subscription not found' });
      return;
    }
    item.deletedAt = null;
    item.updatedAt = new Date().toISOString();
  } else {
    res.status(400).json({ error: 'Invalid entity type' });
    return;
  }

  try {
    await dbService.save();
    res.json({ success: true });
  } catch {
    res.status(500).json({ error: 'Database persistence failed' });
  }
});

apiRouter.delete('/trash/:entityType/:id', async (req: Request, res: Response, next: NextFunction) => {
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
  } else if (entityType === 'time_block') {
    const idx = (db.timeBlocks || []).findIndex((tb) => tb.id === id && tb.userId === userId && tb.deletedAt);
    if (idx === -1) {
      res.status(404).json({ error: 'Trashed time block not found' });
      return;
    }
    db.timeBlocks.splice(idx, 1);
  } else if (entityType === 'envelope') {
    const idx = (db.envelopes || []).findIndex((env) => env.id === id && env.userId === userId && env.deletedAt);
    if (idx === -1) {
      res.status(404).json({ error: 'Trashed envelope not found' });
      return;
    }
    db.envelopes.splice(idx, 1);
  } else if (entityType === 'subscription') {
    const idx = (db.subscriptions || []).findIndex((sub) => sub.id === id && sub.userId === userId && sub.deletedAt);
    if (idx === -1) {
      res.status(404).json({ error: 'Trashed subscription not found' });
      return;
    }
    db.subscriptions.splice(idx, 1);
  } else {
    res.status(400).json({ error: 'Invalid entity type' });
    return;
  }

  try {
    await dbService.save();
    res.json({ success: true });
  } catch {
    res.status(500).json({ error: 'Database persistence failed' });
  }
});

// ----------------------------------------------------
// TIME BLOCKS
// ----------------------------------------------------
apiRouter.get('/time-blocks', (req: Request, res: Response) => {
  const { userId } = getAuth(req);
  const date = typeof req.query.date === 'string' ? req.query.date : undefined;
  const blocks = dbService.getTimeBlocks(userId, date);
  res.json(blocks);
});

apiRouter.post('/time-blocks', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { userId } = getAuth(req);
    const body = req.body || {};
    const block = dbService.saveTimeBlock(userId, body);
    await dbService.flush();
    res.status(201).json(block);
  } catch (err) {
    res.status(500).json({ error: 'Database persistence failed' });
  }
});

apiRouter.put('/time-blocks/:id', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { userId } = getAuth(req);
    const { id } = req.params;
    const body = req.body || {};
    const block = dbService.saveTimeBlock(userId, { ...body, id });
    await dbService.flush();
    res.json(block);
  } catch (err) {
    res.status(500).json({ error: 'Database persistence failed' });
  }
});

apiRouter.delete('/time-blocks/:id', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { userId } = getAuth(req);
    const { id } = req.params;
    const ok = dbService.deleteTimeBlock(userId, id);
    if (!ok) {
      res.status(404).json({ error: 'Time block not found' });
      return;
    }
    await dbService.flush();
    res.json({ success: true, message: 'Time block moved to trash' });
  } catch (err) {
    res.status(500).json({ error: 'Database persistence failed' });
  }
});

// ----------------------------------------------------
// ENVELOPE BUDGETING
// ----------------------------------------------------
apiRouter.get('/envelopes', (req: Request, res: Response) => {
  const { userId } = getAuth(req);
  const monthKey = typeof req.query.monthKey === 'string' ? req.query.monthKey : undefined;
  const envelopes = dbService.getEnvelopes(userId, monthKey);
  res.json(envelopes);
});

apiRouter.post('/envelopes', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { userId } = getAuth(req);
    const body = req.body || {};
    const env = dbService.saveEnvelope(userId, body);
    await dbService.flush();
    res.status(201).json(env);
  } catch (err) {
    res.status(500).json({ error: 'Database persistence failed' });
  }
});

apiRouter.put('/envelopes/:id', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { userId } = getAuth(req);
    const { id } = req.params;
    const body = req.body || {};
    const env = dbService.saveEnvelope(userId, { ...body, id });
    await dbService.flush();
    res.json(env);
  } catch (err) {
    res.status(500).json({ error: 'Database persistence failed' });
  }
});

apiRouter.delete('/envelopes/:id', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { userId } = getAuth(req);
    const { id } = req.params;
    const ok = dbService.deleteEnvelope(userId, id);
    if (!ok) {
      res.status(404).json({ error: 'Envelope not found' });
      return;
    }
    await dbService.flush();
    res.json({ success: true, message: 'Envelope moved to trash' });
  } catch (err) {
    res.status(500).json({ error: 'Database persistence failed' });
  }
});

apiRouter.post('/envelopes/transfer', async (req: Request, res: Response, next: NextFunction) => {
  const { userId } = getAuth(req);
  const { fromId, toId, amountPaise } = req.body || {};
  const parsedFromId = parseNonEmptyString(fromId, 128);
  const parsedToId = parseNonEmptyString(toId, 128);
  const parsedAmount = parsePositiveInt(amountPaise, 1, 1000000000000);
  if (!parsedFromId || !parsedToId || !parsedAmount) {
    res.status(400).json({ error: 'Valid fromId, toId, and positive integer amountPaise are required' });
    return;
  }
  if (parsedFromId === parsedToId) {
    res.status(400).json({ error: 'Cannot transfer funds to the same envelope' });
    return;
  }
  try {
    const result = dbService.transferEnvelopeFunds(userId, parsedFromId, parsedToId, parsedAmount);
    if (!result.success) {
      res.status(400).json({ error: result.error || 'Failed to transfer envelope funds' });
      return;
    }
    await dbService.flush();
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: 'Database persistence failed' });
  }
});

// ----------------------------------------------------
// SUBSCRIPTIONS
// ----------------------------------------------------
apiRouter.get('/subscriptions', (req: Request, res: Response) => {
  const { userId } = getAuth(req);
  const subs = dbService.getSubscriptions(userId);
  res.json(subs);
});

apiRouter.post('/subscriptions', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { userId } = getAuth(req);
    const body = req.body || {};
    const sub = dbService.saveSubscription(userId, body);
    await dbService.flush();
    res.status(201).json(sub);
  } catch (err) {
    res.status(500).json({ error: 'Database persistence failed' });
  }
});

apiRouter.put('/subscriptions/:id', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { userId } = getAuth(req);
    const { id } = req.params;
    const body = req.body || {};
    const sub = dbService.saveSubscription(userId, { ...body, id });
    await dbService.flush();
    res.json(sub);
  } catch (err) {
    res.status(500).json({ error: 'Database persistence failed' });
  }
});

apiRouter.delete('/subscriptions/:id', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { userId } = getAuth(req);
    const { id } = req.params;
    const ok = dbService.deleteSubscription(userId, id);
    if (!ok) {
      res.status(404).json({ error: 'Subscription not found' });
      return;
    }
    await dbService.flush();
    res.json({ success: true, message: 'Subscription moved to trash' });
  } catch (err) {
    res.status(500).json({ error: 'Database persistence failed' });
  }
});

// ----------------------------------------------------
// WORKSPACE MANAGEMENT (CLEAN DATA)
// ----------------------------------------------------
apiRouter.post('/workspace/clear', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { userId } = getAuth(req);
    dbService.clearWorkspace(userId);
    await dbService.flush();
    res.json({ success: true, message: 'All transactions, tasks, bills, and demo data cleared successfully' });
  } catch (err) {
    res.status(500).json({ error: 'Database persistence failed' });
  }
});

// ----------------------------------------------------
// STUDY MANAGEMENT (NEXTSTUDY INTEGRATION)
// ----------------------------------------------------
apiRouter.get('/study/tiers', (req: Request, res: Response) => {
  const { userId } = getAuth(req);
  const tiers = dbService.getStudyTiers(userId);
  res.json(tiers);
});

apiRouter.post('/study/tiers', async (req: Request, res: Response, next: NextFunction) => {
  const { userId } = getAuth(req);
  const body = (req.body && typeof req.body === 'object' ? req.body : {}) as Record<string, unknown>;
  const name = parseNonEmptyString(body.name, 128);
  if (!name) {
    res.status(400).json({ error: 'Tier name is required (max 128 chars)' });
    return;
  }
  const shortTitle = parseNonEmptyString(body.shortTitle, 64) || name.slice(0, 24);
  const description = parseOptionalString(body.description, 256) || '';
  try {
    const tier = dbService.saveStudyTier(userId, {
      id: parseOptionalString(body.id, 128) || undefined,
      name,
      shortTitle,
      description,
    });
    await dbService.flush();
    res.json(tier);
  } catch (err) {
    if (err instanceof Error && err.message.startsWith('Forbidden')) {
      res.status(403).json({ error: err.message });
      return;
    }
    res.status(500).json({ error: 'Database persistence failed' });
  }
});

apiRouter.delete('/study/tiers/:id', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { userId } = getAuth(req);
    const success = dbService.deleteStudyTier(userId, req.params.id);
    if (!success) {
      res.status(404).json({ error: 'Tier not found' });
      return;
    }
    await dbService.flush();
    res.json({ success: true, message: 'Tier deleted' });
  } catch (err) {
    res.status(500).json({ error: 'Database persistence failed' });
  }
});

apiRouter.delete('/study/all', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { userId } = getAuth(req);
    dbService.clearStudyData(userId);
    await dbService.flush();
    res.json({ success: true, message: 'All study subjects and topics cleared' });
  } catch (err) {
    res.status(500).json({ error: 'Database persistence failed' });
  }
});

apiRouter.get('/study/subjects', (req: Request, res: Response) => {
  const { userId } = getAuth(req);
  const subjects = dbService.getStudySubjects(userId);
  res.json(subjects);
});

apiRouter.post('/study/subjects', async (req: Request, res: Response, next: NextFunction) => {
  const { userId } = getAuth(req);
  const body = (req.body && typeof req.body === 'object' ? req.body : {}) as Record<string, unknown>;
  const code = parseNonEmptyString(body.code, 64);
  if (!code || !/^[A-Za-z0-9_-]+$/.test(code)) {
    res.status(400).json({ error: 'Valid subject code is required (alphanumeric, underscore, hyphen, max 64 chars)' });
    return;
  }
  const name = parseNonEmptyString(body.name, 256);
  if (!name) {
    res.status(400).json({ error: 'Subject name is required and must not exceed 256 characters' });
    return;
  }
  const tierId = parseOptionalString(body.tierId, 64) || 'custom';
  const semesterOrDomain = parseOptionalString(body.semesterOrDomain, 128) || undefined;
  const targetExam = parseOptionalString(body.targetExam, 128) || undefined;
  const color = parseOptionalString(body.color, 32) || '#3b82f6';

  try {
    const subject = dbService.saveStudySubject(userId, {
      id: parseOptionalString(body.id, 128) || undefined,
      code,
      name,
      tierId,
      semesterOrDomain,
      targetExam,
      color,
      totalSubtopics: parseNonNegativeInt(body.totalSubtopics, 10000) ?? 0,
      completedSubtopics: parseNonNegativeInt(body.completedSubtopics, 10000) ?? 0,
    });
    await dbService.flush();
    res.json(subject);
  } catch (err) {
    res.status(500).json({ error: 'Database persistence failed' });
  }
});

apiRouter.delete('/study/subjects/:code', async (req: Request, res: Response, next: NextFunction) => {
  const { userId } = getAuth(req);
  try {
    const result = dbService.deleteStudySubject(userId, req.params.code);
    if (!result.success) {
      res.status(404).json({ error: 'Subject not found' });
      return;
    }
    await dbService.flush();
    res.json({
      success: true,
      deletedCount: result.deletedCount,
      subjectCode: result.subjectCode,
      message: 'Subject and associated topics deleted',
    });
  } catch (err) {
    res.status(500).json({ error: 'Database persistence failed' });
  }
});

apiRouter.post('/study/cleanup-overview-import', async (req: Request, res: Response, next: NextFunction) => {
  const { userId } = getAuth(req);
  try {
    const result = dbService.cleanupOverviewImportData(userId);
    await dbService.flush();
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: 'Failed to clean overview data' });
  }
});

apiRouter.post('/study/undo-import-session', async (req: Request, res: Response, next: NextFunction) => {
  const { userId } = getAuth(req);
  const { sessionId, force } = (req.body && typeof req.body === 'object' ? req.body : {}) as { sessionId?: string; force?: boolean };
  if (!sessionId) {
    return res.status(400).json({ error: 'sessionId is required' });
  }
  try {
    const result = dbService.undoImportSession(userId, sessionId, Boolean(force));
    await dbService.flush();
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: 'Failed to undo import session' });
  }
});

apiRouter.get('/study/topics', (req: Request, res: Response) => {
  const { userId } = getAuth(req);
  const subjectCode = typeof req.query.subjectCode === 'string' ? req.query.subjectCode : undefined;
  const topics = dbService.getStudyTopics(userId, subjectCode);
  res.json(topics);
});

apiRouter.post('/study/topics', async (req: Request, res: Response, next: NextFunction) => {
  const { userId } = getAuth(req);
  const body = (req.body && typeof req.body === 'object' ? req.body : {}) as Record<string, unknown>;
  const topicId = parseOptionalString(body.id, 128) || undefined;
  const existingTopic = topicId
    ? dbService.getStudyTopics(userId).find((t) => t.id === topicId)
    : undefined;

  const subjectCode = existingTopic
    ? existingTopic.subjectCode
    : parseNonEmptyString(body.subjectCode, 64);
  if (!subjectCode) {
    res.status(400).json({ error: 'subjectCode is required' });
    return;
  }
  const unit = body.unit !== undefined ? parseNonEmptyString(body.unit, 128) : existingTopic?.unit;
  if (!unit) {
    res.status(400).json({ error: 'unit is required (max 128 characters)' });
    return;
  }
  const subtopic = body.subtopic !== undefined ? parseNonEmptyString(body.subtopic, 256) : existingTopic?.subtopic;
  if (!subtopic) {
    res.status(400).json({ error: 'subtopic is required (max 256 characters)' });
    return;
  }
  const topic = body.topic !== undefined ? (parseOptionalString(body.topic, 256) || unit) : (existingTopic?.topic || unit);
  const priority =
    (body.priority ? parseEnum(body.priority, ALLOWED_STUDY_PRIORITIES) : existingTopic?.priority || 'Medium') || 'Medium';
  const notes = body.notes !== undefined ? (parseOptionalString(body.notes, 2000) || '') : existingTopic?.notes;
  const rowIndex = body.rowIndex !== undefined ? (parseNonNegativeInt(body.rowIndex, 100000) ?? 0) : existingTopic?.rowIndex;

  try {
    const topicRecord = dbService.saveStudyTopic(userId, {
      id: topicId,
      subjectCode,
      unit,
      topic,
      subtopic,
      priority,
      theory: body.theory !== undefined ? Boolean(body.theory) : existingTopic?.theory,
      practice: body.practice !== undefined ? Boolean(body.practice) : existingTopic?.practice,
      pyq: body.pyq !== undefined ? Boolean(body.pyq) : existingTopic?.pyq,
      revisionCount:
        body.revisionCount !== undefined
          ? (parseNonNegativeInt(body.revisionCount, 1000) ?? 0)
          : existingTopic?.revisionCount,
      notes,
      rowIndex,
    });
    await dbService.flush();
    res.json(topicRecord);
  } catch (err) {
    res.status(500).json({ error: 'Database persistence failed' });
  }
});

apiRouter.delete('/study/topics/:id', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { userId } = getAuth(req);
    const success = dbService.deleteStudyTopic(userId, req.params.id);
    if (!success) {
      res.status(404).json({ error: 'Topic not found' });
      return;
    }
    await dbService.flush();
    res.json({ success: true, message: 'Topic deleted' });
  } catch (err) {
    res.status(500).json({ error: 'Database persistence failed' });
  }
});

apiRouter.get('/study/revisions', (req: Request, res: Response) => {
  const { userId } = getAuth(req);
  const revisions = dbService.getStudyRevisions(userId);
  res.json(revisions);
});

apiRouter.post('/study/revisions', async (req: Request, res: Response, next: NextFunction) => {
  const { userId } = getAuth(req);
  const body = (req.body && typeof req.body === 'object' ? req.body : {}) as Record<string, unknown>;
  const topicId = parseNonEmptyString(body.topicId, 128);
  if (!topicId) {
    res.status(400).json({ error: 'topicId is required' });
    return;
  }
  const subjectCode = parseNonEmptyString(body.subjectCode, 64);
  if (!subjectCode) {
    res.status(400).json({ error: 'subjectCode is required' });
    return;
  }
  const topicTitle = parseNonEmptyString(body.topicTitle, 256);
  if (!topicTitle) {
    res.status(400).json({ error: 'topicTitle is required' });
    return;
  }
  const lastStudiedAt = parseIsoDate(body.lastStudiedAt) || getTodayDateString(DEFAULT_TIMEZONE);
  const nextRevisionAt = parseIsoDate(body.nextRevisionAt) || lastStudiedAt;
  const difficulty = (body.difficulty ? parseEnum(body.difficulty, ALLOWED_REVISION_DIFFICULTIES) : 'medium') || 'medium';
  const status = (body.status ? parseEnum(body.status, ALLOWED_REVISION_STATUSES) : 'scheduled') || 'scheduled';
  const intervalDays = parsePositiveInt(body.intervalDays, 1, 365) || 1;
  const repetition = parseNonNegativeInt(body.repetition, 100) || 0;
  const notes = parseOptionalString(body.notes, 2000) || undefined;

  try {
    const revision = dbService.saveStudyRevision(userId, {
      id: parseOptionalString(body.id, 128) || undefined,
      topicId,
      subjectCode,
      topicTitle,
      lastStudiedAt,
      nextRevisionAt,
      intervalDays,
      repetition,
      difficulty,
      status,
      notes,
    });
    await dbService.flush();
    res.json(revision);
  } catch (err) {
    res.status(500).json({ error: 'Database persistence failed' });
  }
});

apiRouter.post('/study/revisions/:id/recall', async (req: Request, res: Response, next: NextFunction) => {
  const { userId } = getAuth(req);
  const difficulty = req.body.difficulty as 'easy' | 'medium' | 'hard';
  if (!difficulty || !['easy', 'medium', 'hard'].includes(difficulty)) {
    res.status(400).json({ error: 'Invalid difficulty. Must be easy, medium, or hard' });
    return;
  }
  try {
    const updated = dbService.recordStudyRecall(userId, req.params.id, difficulty);
    if (!updated) {
      res.status(404).json({ error: 'Revision not found' });
      return;
    }
    await dbService.flush();
    res.json(updated);
  } catch (err) {
    res.status(500).json({ error: 'Database persistence failed' });
  }
});

apiRouter.delete('/study/revisions/:id', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { userId } = getAuth(req);
    const success = dbService.deleteStudyRevision(userId, req.params.id);
    if (!success) {
      res.status(404).json({ error: 'Revision not found' });
      return;
    }
    await dbService.flush();
    res.json({ success: true, message: 'Revision deleted' });
  } catch (err) {
    res.status(500).json({ error: 'Database persistence failed' });
  }
});

apiRouter.get('/study/mistakes', (req: Request, res: Response) => {
  const { userId } = getAuth(req);
  const mistakes = dbService.getStudyMistakes(userId);
  res.json(mistakes);
});

apiRouter.post('/study/mistakes', async (req: Request, res: Response, next: NextFunction) => {
  const { userId } = getAuth(req);
  const body = (req.body && typeof req.body === 'object' ? req.body : {}) as Record<string, unknown>;
  const subjectCode = parseNonEmptyString(body.subjectCode, 64);
  if (!subjectCode) {
    res.status(400).json({ error: 'subjectCode is required' });
    return;
  }
  const topic = parseNonEmptyString(body.topic, 256);
  if (!topic) {
    res.status(400).json({ error: 'topic is required' });
    return;
  }
  const trap = parseNonEmptyString(body.trap, 1024);
  if (!trap) {
    res.status(400).json({ error: 'trap (what went wrong) is required' });
    return;
  }
  const goldenRule = parseNonEmptyString(body.goldenRule, 1024);
  if (!goldenRule) {
    res.status(400).json({ error: 'goldenRule (corrective takeaway) is required' });
    return;
  }
  const date = parseIsoDate(body.date) || getTodayDateString(DEFAULT_TIMEZONE);
  const severity = (body.severity ? parseEnum(body.severity, ALLOWED_MISTAKE_SEVERITIES) : 'Medium') || 'Medium';
  const source = parseOptionalString(body.source, 128) || 'Mock / PYQ';
  const rootCause = parseOptionalString(body.rootCause, 1024) || '';
  const subjectName = parseOptionalString(body.subjectName, 128) || undefined;

  try {
    const mistake = dbService.saveStudyMistake(userId, {
      id: parseOptionalString(body.id, 128) || undefined,
      date,
      subjectCode,
      subjectName,
      topic,
      source,
      severity,
      trap,
      rootCause,
      goldenRule,
      resolved: Boolean(body.resolved),
    });
    await dbService.flush();
    res.json(mistake);
  } catch (err) {
    res.status(500).json({ error: 'Database persistence failed' });
  }
});

apiRouter.delete('/study/mistakes/:id', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { userId } = getAuth(req);
    const success = dbService.deleteStudyMistake(userId, req.params.id);
    if (!success) {
      res.status(404).json({ error: 'Mistake not found' });
      return;
    }
    await dbService.flush();
    res.json({ success: true, message: 'Mistake deleted' });
  } catch (err) {
    res.status(500).json({ error: 'Database persistence failed' });
  }
});

// ----------------------------------------------------
// AUDIT LOGS
// ----------------------------------------------------
apiRouter.get('/audit-logs', (req: Request, res: Response) => {
  const { userId } = getAuth(req);
  const limit = typeof req.query.limit === 'string' ? parseInt(req.query.limit, 10) : 100;
  const logs = dbService.getAuditLogs(userId, limit);
  res.json(logs);
});

// ----------------------------------------------------
// DURABLE SYNC QUEUE
// ----------------------------------------------------
apiRouter.get('/sync/queue', (req: Request, res: Response) => {
  const { userId } = getAuth(req);
  const queue = dbService.getSyncQueue(userId);
  res.json(queue);
});

apiRouter.post('/sync/queue/enqueue', async (req: Request, res: Response, next: NextFunction) => {
  const { userId } = getAuth(req);
  const body = req.body || {};
  if (!body.entityType || !body.action || !body.sheetName) {
    res.status(400).json({ error: 'entityType, action, and sheetName are required' });
    return;
  }
  try {
    const item = dbService.enqueueSync(userId, body);
    await dbService.flush();
    res.status(201).json(item);
  } catch (err) {
    res.status(500).json({ error: 'Database persistence failed' });
  }
});

apiRouter.post('/sync/queue/:id/status', async (req: Request, res: Response, next: NextFunction) => {
  const { userId } = getAuth(req);
  const { id } = req.params;
  const { status, errorMessage, nextRetryAt, attempts } = req.body || {};
  const updates: Record<string, unknown> = {
    status,
    errorMessage,
    nextRetryAt,
    lastAttemptAt: new Date().toISOString(),
  };
  if (typeof attempts === 'number' && Number.isFinite(attempts) && attempts >= 0) {
    updates.attempts = Math.floor(attempts);
  }
  try {
    const item = dbService.updateSyncOp(userId, id, updates);
    if (!item) {
      res.status(404).json({ error: 'Queue item not found' });
      return;
    }
    await dbService.flush();
    res.json(item);
  } catch (err) {
    res.status(500).json({ error: 'Database persistence failed' });
  }
});

// ----------------------------------------------------
// SECURE BACKEND GOOGLE SHEETS WORKER ENDPOINTS
// ----------------------------------------------------
function extractGoogleAccessToken(req: Request): string | null {
  const raw = req.headers['x-google-access-token'];
  if (typeof raw === 'string' && raw.trim().length > 10) {
    return raw.trim();
  }
  return null;
}

function sendSheetsError(res: Response, err: unknown, fallbackMessage: string, defaultStatus = 502): void {
  const message = err instanceof Error ? err.message : fallbackMessage;
  const isAuthError =
    /\b401\b|UNAUTHENTICATED|invalid authentication credentials|Invalid Credentials/i.test(
      message
    );
  if (isAuthError) {
    res.status(401).json({ error: message, code: 'SHEETS_AUTH_REQUIRED' });
    return;
  }
  const isPermissionError =
    /\b403\b|PERMISSION_DENIED|The caller does not have permission|insufficient authentication scopes/i.test(
      message
    );
  if (isPermissionError) {
    res.status(403).json({ error: message, code: 'SHEETS_PERMISSION_DENIED' });
    return;
  }
  res.status(defaultStatus).json({ error: message });
}

apiRouter.post('/sheets/verify', async (req: Request, res: Response) => {
  const accessToken = extractGoogleAccessToken(req);
  if (!accessToken) {
    res.status(401).json({ error: 'Google authorization token header is required.', code: 'SHEETS_AUTH_REQUIRED' });
    return;
  }
  const spreadsheetId = typeof req.body?.spreadsheetId === 'string' ? req.body.spreadsheetId.trim() : '';
  if (!spreadsheetId) {
    res.status(400).json({ error: 'spreadsheetId is required.' });
    return;
  }
  try {
    const meta = await verifySpreadsheet(spreadsheetId, accessToken);
    res.json({
      spreadsheetId: meta.spreadsheetId,
      title: meta.title,
      sheetsCount: meta.sheets.length,
    });
  } catch (err) {
    sendSheetsError(res, err, 'Spreadsheet verification failed.', 400);
  }
});

apiRouter.post('/sheets/create-workbook', async (req: Request, res: Response) => {
  const accessToken = extractGoogleAccessToken(req);
  if (!accessToken) {
    res.status(401).json({ error: 'Google authorization token header is required.', code: 'SHEETS_AUTH_REQUIRED' });
    return;
  }
  try {
    const created = await createMasterWorkbook(accessToken);
    res.status(201).json(created);
  } catch (err) {
    sendSheetsError(res, err, 'Workbook creation failed.');
  }
});

apiRouter.post('/sheets/sync', async (req: Request, res: Response) => {
  const accessToken = extractGoogleAccessToken(req);
  if (!accessToken) {
    res.status(401).json({ error: 'Google authorization token header is required.', code: 'SHEETS_AUTH_REQUIRED' });
    return;
  }
  const spreadsheetId = typeof req.body?.spreadsheetId === 'string' ? req.body.spreadsheetId.trim() : '';
  const data = req.body?.data as SheetsSnapshotPayload | undefined;
  if (!spreadsheetId || !data || typeof data !== 'object') {
    res.status(400).json({ error: 'spreadsheetId and snapshot data are required.' });
    return;
  }
  try {
    const result = await syncAllData(spreadsheetId, accessToken, data);
    res.json({ success: true, ...result });
  } catch (err) {
    sendSheetsError(res, err, 'Google Sheets sync failed.');
  }
});

apiRouter.post('/sheets/apply-formatting', async (req: Request, res: Response) => {
  const accessToken = extractGoogleAccessToken(req);
  if (!accessToken) {
    res.status(401).json({ error: 'Google authorization token header is required.', code: 'SHEETS_AUTH_REQUIRED' });
    return;
  }
  const spreadsheetId = typeof req.body?.spreadsheetId === 'string' ? req.body.spreadsheetId.trim() : '';
  if (!spreadsheetId) {
    res.status(400).json({ error: 'spreadsheetId is required.' });
    return;
  }
  try {
    await applyWorkbookFormatting(spreadsheetId, accessToken, {
      includeHeaders: Boolean(req.body?.includeHeaders),
      includeAutoResize: req.body?.includeAutoResize !== false,
      verifyFirst: true,
    });
    res.json({ success: true });
  } catch (err) {
    sendSheetsError(res, err, 'Formatting update failed.');
  }
});

apiRouter.post('/sheets/historical-resync', async (req: Request, res: Response) => {
  const accessToken = extractGoogleAccessToken(req);
  if (!accessToken) {
    res.status(401).json({ error: 'Google authorization token header is required.', code: 'SHEETS_AUTH_REQUIRED' });
    return;
  }
  const spreadsheetId = typeof req.body?.spreadsheetId === 'string' ? req.body.spreadsheetId.trim() : '';
  const data = req.body?.data as SheetsSnapshotPayload | undefined;
  const confirmed = req.body?.confirmed === true;

  if (!confirmed) {
    res.status(400).json({ error: 'Explicit user confirmation (confirmed: true) is required for historical resync.' });
    return;
  }
  if (!spreadsheetId || !data || typeof data !== 'object') {
    res.status(400).json({ error: 'spreadsheetId and snapshot data are required.' });
    return;
  }

  try {
    const result = await historicalResync(spreadsheetId, accessToken, data, true);
    res.json({ success: true, ...result });
  } catch (err) {
    sendSheetsError(res, err, 'Historical resync failed.');
  }
});

apiRouter.post('/sheets/flush-queue', async (req: Request, res: Response) => {
  const { userId } = getAuth(req);
  const accessToken = extractGoogleAccessToken(req);
  if (!accessToken) {
    res.status(401).json({ error: 'Google authorization token header is required.', code: 'SHEETS_AUTH_REQUIRED' });
    return;
  }
  const spreadsheetId = typeof req.body?.spreadsheetId === 'string' ? req.body.spreadsheetId.trim() : '';
  if (!spreadsheetId) {
    res.status(400).json({ error: 'spreadsheetId is required.' });
    return;
  }

  const incomingOps = Array.isArray(req.body?.operations) ? req.body.operations : dbService.getSyncQueue(userId);
  try {
    const summary = await flushQueueOperations(spreadsheetId, accessToken, incomingOps);
    for (const r of summary.results) {
      dbService.updateSyncOp(userId, r.id, {
        status: r.status,
        attempts: r.attempts,
        nextRetryAt: r.nextRetryAt ?? null,
        errorMessage: r.errorMessage ?? null,
        lastAttemptAt: new Date().toISOString(),
      });
    }
    await dbService.flush();
    res.json(summary);
  } catch (err) {
    sendSheetsError(res, err, 'Queue flush failed.');
  }
});

// ----------------------------------------------------
// UNIVERSAL SHEET SYNC HUB — PHASE 1 READ-ONLY ENDPOINTS
// ----------------------------------------------------
function sendSheetHubError(res: Response, err: unknown, fallbackMessage: string): void {
  const sanitized = sanitizeForLogging(
    err instanceof Error ? { message: err.message, stack: err.stack } : { error: err }
  );
  console.error('[SheetHub Error]', JSON.stringify(sanitized));

  if (err instanceof SheetHubWorkerError) {
    res.status(err.status).json({
      error: err.message,
      code: err.code,
      status: err.status,
      timestamp: new Date().toISOString(),
    });
    return;
  }

  const rawMessage = err instanceof Error ? err.message : fallbackMessage;
  const isAuthError =
    /\b401\b|UNAUTHENTICATED|invalid authentication credentials|Invalid Credentials/i.test(
      rawMessage
    );
  if (isAuthError) {
    res.status(401).json({
      error: rawMessage,
      code: 'SHEETS_AUTH_REQUIRED',
      status: 401,
      timestamp: new Date().toISOString(),
    });
    return;
  }

  const isPermissionError =
    /\b403\b|PERMISSION_DENIED|The caller does not have permission|insufficient authentication scopes/i.test(
      rawMessage
    );
  if (isPermissionError) {
    res.status(403).json({
      error: rawMessage,
      code: 'SHEETS_PERMISSION_DENIED',
      status: 403,
      timestamp: new Date().toISOString(),
    });
    return;
  }

  const isNotFound = /\b404\b|not found|inaccessible/i.test(rawMessage);
  if (isNotFound) {
    res.status(404).json({
      error: rawMessage,
      code: 'SPREADSHEET_NOT_FOUND',
      status: 404,
      timestamp: new Date().toISOString(),
    });
    return;
  }

  const isRateLimited = /\b429\b|RESOURCE_EXHAUSTED|rate limit/i.test(rawMessage);
  if (isRateLimited) {
    res.status(429).json({
      error: rawMessage,
      code: 'SHEETS_RATE_LIMITED',
      status: 429,
      timestamp: new Date().toISOString(),
    });
    return;
  }

  const isUpstreamNetwork =
    /fetch failed|ENOTFOUND|ECONNREFUSED|ETIMEDOUT|network|socket|getaddrinfo/i.test(rawMessage);
  if (isUpstreamNetwork) {
    res.status(502).json({
      error: `Upstream network communication failed: ${rawMessage}`,
      code: 'SHEETS_UPSTREAM_NETWORK_ERROR',
      status: 502,
      timestamp: new Date().toISOString(),
    });
    return;
  }

  res.status(500).json({
    error: rawMessage,
    code: 'INTERNAL_ERROR',
    status: 500,
    timestamp: new Date().toISOString(),
  });
}

apiRouter.post('/sheet-hub/inspect', async (req: Request, res: Response) => {
  const publicAccess = req.body?.publicAccess === true;
  const authCtx = getAuth(req);
  const accessToken = extractGoogleAccessToken(req);

  if (!publicAccess) {
    if (!authCtx || authCtx.isGuest) {
      res.status(401).json({
        error: 'Signed-in FocusFlow authentication is required for private Google Sheets.',
        code: 'AUTH_REQUIRED',
      });
      return;
    }

    if (!accessToken) {
      res.status(401).json({
        error: 'Google authorization token header is required.',
        code: 'SHEETS_AUTH_REQUIRED',
      });
      return;
    }
  }

  const spreadsheetId =
    typeof req.body?.spreadsheetId === 'string' ? req.body.spreadsheetId.trim() : undefined;
  const spreadsheetUrl =
    typeof req.body?.spreadsheetUrl === 'string' ? req.body.spreadsheetUrl.trim() : undefined;
  const previewRows =
    typeof req.body?.previewRows === 'number' && Number.isFinite(req.body.previewRows)
      ? req.body.previewRows
      : undefined;

  if (!spreadsheetId && !spreadsheetUrl) {
    res.status(400).json({
      error: 'spreadsheetId or spreadsheetUrl is required.',
      code: 'INVALID_SPREADSHEET_ID',
    });
    return;
  }

  try {
    const inspected = publicAccess
      ? await inspectPublicSpreadsheet({ spreadsheetId, spreadsheetUrl, previewRows })
      : await inspectSpreadsheet(
          { spreadsheetId, spreadsheetUrl, previewRows },
          accessToken!
        );
    res.json(inspected);
  } catch (err) {
    sendSheetHubError(res, err, 'Spreadsheet inspection failed.');
  }
});

apiRouter.post('/sheet-hub/pull', async (req: Request, res: Response) => {
  const publicAccess = req.body?.publicAccess === true;
  const authCtx = getAuth(req);
  const accessToken = extractGoogleAccessToken(req);

  if (!publicAccess) {
    if (!authCtx || authCtx.isGuest) {
      res.status(401).json({
        error: 'Signed-in FocusFlow authentication is required for private Google Sheets.',
        code: 'AUTH_REQUIRED',
      });
      return;
    }

    if (!accessToken) {
      res.status(401).json({
        error: 'Google authorization token header is required.',
        code: 'SHEETS_AUTH_REQUIRED',
      });
      return;
    }
  }

  const spreadsheetId =
    typeof req.body?.spreadsheetId === 'string' ? req.body.spreadsheetId.trim() : '';
  const tabs = Array.isArray(req.body?.tabs) ? req.body.tabs : [];

  if (!spreadsheetId || !isValidGoogleSpreadsheetId(spreadsheetId)) {
    res.status(400).json({
      error: 'Valid spreadsheetId is required.',
      code: 'INVALID_SPREADSHEET_ID',
    });
    return;
  }
  if (tabs.length === 0) {
    res.status(400).json({
      error: 'At least one tab selection is required.',
      code: 'INVALID_PULL_REQUEST',
    });
    return;
  }

  try {
    const pulled = publicAccess
      ? await pullPublicSpreadsheetTabs({ spreadsheetId, tabs })
      : await pullSpreadsheetTabs({ spreadsheetId, tabs }, accessToken!);
    res.json(pulled);
  } catch (err) {
    sendSheetHubError(res, err, 'Spreadsheet pull failed.');
  }
});

apiRouter.post('/sheet-hub/push-cells', async (req: Request, res: Response) => {
  const authCtx = getAuth(req);
  if (!authCtx || authCtx.isGuest) {
    res.status(401).json({
      error: 'Signed-in FocusFlow authentication is required to sync changes to Google Sheets.',
      code: 'AUTH_REQUIRED',
    });
    return;
  }

  const accessToken = extractGoogleAccessToken(req);
  if (!accessToken) {
    res.status(401).json({
      error: 'Google Sheets edit authorization token header is required.',
      code: 'SHEETS_AUTH_REQUIRED',
    });
    return;
  }

  const spreadsheetId =
    typeof req.body?.spreadsheetId === 'string' ? req.body.spreadsheetId.trim() : '';
  const updates = Array.isArray(req.body?.updates) ? req.body.updates : [];

  if (!spreadsheetId || !isValidGoogleSpreadsheetId(spreadsheetId)) {
    res.status(400).json({
      error: 'Valid spreadsheetId is required.',
      code: 'INVALID_SPREADSHEET_ID',
    });
    return;
  }

  if (updates.length === 0) {
    res.status(400).json({
      error: 'At least one cell update is required.',
      code: 'INVALID_PUSH_REQUEST',
    });
    return;
  }

  try {
    const result = await pushSheetHubCellUpdates({ spreadsheetId, updates }, accessToken);
    res.json({ success: true, ...result });
  } catch (err) {
    sendSheetHubError(res, err, 'Failed to push cell updates to Google Sheets.');
  }
});

apiRouter.post('/sheet-hub/drive-duplicate', async (req: Request, res: Response) => {
  const authCtx = getAuth(req);
  if (!authCtx || authCtx.isGuest) {
    res.status(401).json({
      error: 'Signed-in FocusFlow authentication is required to create a Google Drive duplicate.',
      code: 'AUTH_REQUIRED',
    });
    return;
  }

  const accessToken = extractGoogleAccessToken(req);
  if (!accessToken) {
    res.status(401).json({
      error: 'Google Drive authorization token header is required.',
      code: 'DRIVE_AUTH_REQUIRED',
    });
    return;
  }

  const { sourceSpreadsheetId, title, idempotencyKey, operationId, topics, ownerUid: bodyOwnerUid } = req.body || {};
  if (bodyOwnerUid && typeof bodyOwnerUid === 'string' && bodyOwnerUid.trim() !== authCtx.userId) {
    res.status(403).json({
      error: 'Security violation: Request body ownerUid does not match authenticated user.',
      code: 'FORGED_OWNER_UID',
    });
    return;
  }

  if (!sourceSpreadsheetId || typeof sourceSpreadsheetId !== 'string') {
    res.status(400).json({
      error: 'sourceSpreadsheetId is required.',
      code: 'INVALID_SPREADSHEET_ID',
    });
    return;
  }

  const effectiveOpId = (operationId || idempotencyKey || '').trim();

  try {
    const result = await duplicateGoogleDriveFile(
      {
        sourceSpreadsheetId,
        title,
        operationId: effectiveOpId,
        idempotencyKey: effectiveOpId,
        ownerUid: authCtx.userId,
        topics,
      },
      accessToken
    );
    res.json({ success: true, ...result });
  } catch (err) {
    sendSheetHubError(res, err, 'Failed to duplicate spreadsheet in Google Drive.');
  }
});

apiRouter.post('/sheet-hub/drive-duplicate/reconcile', async (req: Request, res: Response) => {
  const authCtx = getAuth(req);
  if (!authCtx || authCtx.isGuest) {
    res.status(401).json({
      error: 'Signed-in FocusFlow authentication is required.',
      code: 'AUTH_REQUIRED',
    });
    return;
  }

  const { operationId, status, driveFileId, nativeSheetId, errorMessage, ownerUid: bodyOwnerUid } = req.body || {};
  if (bodyOwnerUid && typeof bodyOwnerUid === 'string' && bodyOwnerUid.trim() !== authCtx.userId) {
    res.status(403).json({
      error: 'Security violation: Request body ownerUid does not match authenticated user.',
      code: 'FORGED_OWNER_UID',
    });
    return;
  }

  if (!operationId || typeof operationId !== 'string') {
    res.status(400).json({
      error: 'operationId is required.',
      code: 'INVALID_OPERATION_ID',
    });
    return;
  }

  try {
    const record = await defaultIdempotencyLedger.reconcileOperation({
      operationId,
      status: status || 'COMPLETED',
      ownerUid: authCtx.userId,
      driveFileId,
      nativeSheetId,
      errorMessage,
    });
    res.json({ success: true, record });
  } catch (err) {
    sendSheetHubError(res, err, 'Failed to reconcile operation.');
  }
});

async function verifyAppsScriptConnectionOwnership(
  userId: string,
  connectionId: string,
  spreadsheetId?: string
): Promise<boolean> {
  const rawDb = dbService.getRawDatabase() as any;
  const localConns: any[] = [
    ...(Array.isArray(rawDb.sheetHubConnections) ? rawDb.sheetHubConnections : []),
    ...(Array.isArray(rawDb.sheetConnections) ? rawDb.sheetConnections : []),
  ];
  const localMatch = localConns.find((c) => c && c.id === connectionId);
  if (localMatch) {
    if (localMatch.userId !== userId) return false;
    if (spreadsheetId && localMatch.spreadsheetId && localMatch.spreadsheetId !== spreadsheetId) {
      return false;
    }
    return true;
  }

  if (hasServiceAccountCredentials()) {
    try {
      const adminDb = getAdminFirestore();
      const canonicalSnap = await adminDb
        .collection('users')
        .doc(userId)
        .collection('sheet_hub_connections')
        .doc(connectionId)
        .get();
      const snap = canonicalSnap.exists
        ? canonicalSnap
        : await adminDb
            .collection('users')
            .doc(userId)
            .collection('sheet_connections')
            .doc(connectionId)
            .get();

      if (snap.exists) {
        const data = snap.data() || {};
        if (data.userId && data.userId !== userId) return false;
        if (spreadsheetId && data.spreadsheetId && data.spreadsheetId !== spreadsheetId) {
          return false;
        }
        return true;
      }
    } catch (err) {
      console.warn('[AppsScriptWriteback] Connection ownership verification failed:', err);
    }
  }

  return false;
}

apiRouter.post('/sheet-hub/apps-script-writeback', async (req: Request, res: Response) => {
  const authCtx = getAuth(req);
  if (!authCtx || authCtx.isGuest) {
    res.status(401).json({
      error: 'Signed-in FocusFlow authentication is required for Apps Script write-back.',
      code: 'AUTH_REQUIRED',
    });
    return;
  }

  const { connectionId, spreadsheetId, sheetTitle, rowNumber, colLetter, value, expectedIdentity } = req.body || {};

  if (!connectionId || typeof connectionId !== 'string') {
    res.status(400).json({
      error: 'connectionId is required.',
      code: 'INVALID_CONNECTION_ID',
    });
    return;
  }

  // Connection ownership verification
  // Rejects spoofed userId and verifies connectionId actually belongs to authCtx.userId
  const requestedUserId = typeof req.body?.userId === 'string' ? req.body.userId.trim() : '';
  if (requestedUserId && requestedUserId !== authCtx.userId) {
    res.status(403).json({
      error: 'Tenant isolation violation: connection does not belong to the authenticated user.',
      code: 'TENANT_ISOLATION_VIOLATION',
    });
    return;
  }

  // Verify spreadsheet allowlist (protects production spreadsheets)
  if (!isSpreadsheetAllowlisted(spreadsheetId)) {
    res.status(403).json({
      error: `Spreadsheet "${spreadsheetId}" is not allowlisted for Apps Script write-back. Only the dedicated test spreadsheet is permitted.`,
      code: 'SPREADSHEET_NOT_ALLOWLISTED',
    });
    return;
  }

  const isOwner = await verifyAppsScriptConnectionOwnership(
    authCtx.userId,
    connectionId.trim(),
    typeof spreadsheetId === 'string' ? spreadsheetId.trim() : undefined
  );
  if (!isOwner) {
    res.status(403).json({
      error: 'Tenant isolation violation: connection does not belong to the authenticated user.',
      code: 'TENANT_ISOLATION_VIOLATION',
    });
    return;
  }

  try {
    const result = await dispatchAppsScriptWriteback({
      spreadsheetId,
      sheetTitle,
      rowNumber,
      colLetter,
      value,
      expectedIdentity,
    });
    res.json(result);
  } catch (err) {
    if (err instanceof AppsScriptBridgeError) {
      res.status(err.status).json({
        error: err.message,
        code: err.code,
      });
      return;
    }
    res.status(500).json({
      error: err instanceof Error ? err.message : 'Apps Script write-back failed',
      code: 'APPS_SCRIPT_ERROR',
    });
  }
});

apiRouter.get('/sheet-hub/sample-semester3', async (_req: Request, res: Response) => {
  try {
    const fs = await import('node:fs');
    const path = await import('node:path');
    const { parseLocalXlsxFixture } = await import('./localXlsxParser.js');
    const { detectWorkbookSchema } = await import('../src/lib/sheetHub/schemaDetector.js');
    const candidatePaths = [
      path.resolve(process.cwd(), 'test/fixtures/Semester 3 - Syllabus & Topic Tracker.xlsx'),
      path.resolve(process.cwd(), 'Semester 3 - Syllabus & Topic Tracker.xlsx'),
      '/Users/munshimdatif/Downloads/Semester 3 - Syllabus & Topic Tracker.xlsx',
    ];
    const fixturePath = candidatePaths.find((p) => fs.existsSync(p)) || candidatePaths[0];
    const parsedTabs = parseLocalXlsxFixture(fixturePath);
    const inspectedWorkbook = detectWorkbookSchema(parsedTabs);
    const inspectedTabs = inspectedWorkbook.tabs;

    const pullTabs = parsedTabs.map((pt) => {
      const detected = inspectedTabs.find((it) => it.sheetId === pt.sheetId);
      const headerRowIndex = detected?.headerRowIndex || 1;
      const headers = (detected?.columns || []).map((c) => c.headerName);
      const rows = (pt.rows || []).slice(headerRowIndex).map((cellArr, rIdx) => {
        const values: any[] = [];
        const formulaColumns: number[] = [];
        for (let c = 0; c < cellArr.length; c++) {
          values.push(cellArr[c]?.value ?? null);
          if (cellArr[c]?.formula) formulaColumns.push(c);
        }
        return {
          sheetRowNumber: (detected?.dataStartRow || 2) + rIdx,
          values,
          formulaColumns,
        };
      });
      return {
        sheetTitle: pt.sheetTitle,
        sheetId: pt.sheetId,
        range: `'${pt.sheetTitle}'!A1:Z1000`,
        headers,
        headerRowIndex,
        rows,
        totalRows: rows.length,
      };
    });

    res.json({
      inspect: {
        spreadsheetId: 'sem3-syllabus-sample',
        spreadsheetUrl: 'https://docs.google.com/spreadsheets/d/sem3-syllabus-sample/edit',
        title: 'Semester 3 - Syllabus & Topic Tracker',
        tabs: inspectedTabs,
      },
      pull: {
        spreadsheetId: 'sem3-syllabus-sample',
        title: 'Semester 3 - Syllabus & Topic Tracker',
        tabs: pullTabs,
        pulledAt: new Date().toISOString(),
      },
    });
  } catch (err) {
    res.status(500).json({ error: String(err), code: 'FIXTURE_LOAD_ERROR' });
  }
});

// ----------------------------------------------------
// DATA RECOVERY & BACKUPS
// ----------------------------------------------------
apiRouter.get('/backup/export', (req: Request, res: Response) => {
  const { userId } = getAuth(req);
  const backup = dbService.exportUserData(userId);
  res.json(backup);
});

apiRouter.post('/backup/restore', async (req: Request, res: Response, next: NextFunction) => {
  const { userId } = getAuth(req);
  const body = req.body;
  const result = dbService.restoreUserData(userId, body);
  if (!result.success) {
    res.status(400).json(result);
    return;
  }
  try {
    await dbService.flush();
    res.json(result);
  } catch {
    res.status(500).json({ error: 'Database persistence failed' });
  }
});

// ----------------------------------------------------
// JOINT VAULTS (COUPLE SHARED SAVINGS)
// ----------------------------------------------------
apiRouter.get('/joint-vaults', (req: Request, res: Response) => {
  const { userId } = getAuth(req);
  const vaults = dbService.getJointVaultsForUser(userId);
  res.json(vaults);
});

apiRouter.post('/joint-vaults', async (req: Request, res: Response) => {
  const auth = getAuth(req);
  const body = req.body || {};

  if (!body.name || typeof body.name !== 'string' || !body.name.trim()) {
    res.status(400).json({ error: 'Vault name is required' });
    return;
  }
  if (!body.targetPaise || !Number.isInteger(body.targetPaise) || body.targetPaise <= 0) {
    res.status(400).json({ error: 'Target amount must be a positive integer in minor units (paise)' });
    return;
  }

  const allowedCurrencies = ['INR', 'USD', 'EUR', 'GBP'];
  const currency = allowedCurrencies.includes(body.currency) ? body.currency : 'INR';

  try {
    const vault = dbService.createJointVault(
      {
        name: body.name,
        description: body.description,
        targetPaise: body.targetPaise,
        monthlyTargetPaise: body.monthlyTargetPaise,
        currency,
        targetRatio: body.targetRatio,
      },
      { id: auth.userId, email: auth.email, name: auth.name }
    );
    await dbService.flush();
    const summary = dbService.getVaultSummary(vault.id, auth.userId);
    res.status(201).json(summary || vault);
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Failed to create joint vault';
    res.status(400).json({ error: msg });
  }
});

apiRouter.get('/joint-vaults/:vaultId', (req: Request, res: Response) => {
  const { userId } = getAuth(req);
  const { vaultId } = req.params;
  const summary = dbService.getVaultSummary(vaultId, userId);
  if (!summary) {
    res.status(404).json({ error: 'Vault not found or access denied' });
    return;
  }
  res.json(summary);
});

apiRouter.post('/joint-vaults/:vaultId/invitations', async (req: Request, res: Response) => {
  const auth = getAuth(req);
  const { vaultId } = req.params;
  const body = req.body || {};
  const { invitedEmail, id, inviteCode } = body;

  try {
    const invitation = dbService.createVaultInvitation(
      vaultId,
      { id: auth.userId, name: auth.name },
      invitedEmail,
      { id, inviteCode }
    );
    await dbService.flush();
    res.status(201).json(invitation);
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Failed to create invitation';
    res.status(400).json({ error: msg });
  }
});

apiRouter.post('/joint-vaults/invitations/accept', async (req: Request, res: Response) => {
  const auth = getAuth(req);
  const { inviteCode } = req.body || {};
  if (!inviteCode || typeof inviteCode !== 'string') {
    res.status(400).json({ error: 'Invite code is required' });
    return;
  }

  try {
    const result = await vaultBackendService.acceptVaultInvitation(inviteCode, {
      id: auth.userId,
      email: auth.email,
      name: auth.name,
      isGuest: auth.isGuest,
    });
    if (auth.isGuest) {
      await dbService.flush();
    }
    const summary = await vaultBackendService.getVaultSummary(result.vault.id, auth.userId);
    res.json(summary || result);
  } catch (err: any) {
    const status = err?.status || 400;
    const code = err?.code || (status === 503 ? 'FIREBASE_ADMIN_NOT_CONFIGURED' : 'VAULT_ERROR');
    const msg = err instanceof Error ? err.message : 'Failed to accept invitation';
    res.status(status).json({ error: msg, code });
  }
});

apiRouter.post('/joint-vaults/invitations/reject', async (req: Request, res: Response) => {
  const auth = getAuth(req);
  const { inviteCode } = req.body || {};
  if (!inviteCode || typeof inviteCode !== 'string') {
    res.status(400).json({ error: 'Invite code is required' });
    return;
  }

  try {
    const invitation = await vaultBackendService.rejectVaultInvitation(inviteCode, {
      id: auth.userId,
      email: auth.email,
      isGuest: auth.isGuest,
    });
    if (auth.isGuest) {
      await dbService.flush();
    }
    res.json(invitation);
  } catch (err: any) {
    const status = err?.status || 400;
    const code = err?.code || 'VAULT_ERROR';
    const msg = err instanceof Error ? err.message : 'Failed to reject invitation';
    res.status(status).json({ error: msg, code });
  }
});

apiRouter.post('/joint-vaults/:vaultId/invitations/:inviteId/revoke', async (req: Request, res: Response) => {
  const auth = getAuth(req);
  const { vaultId, inviteId } = req.params;

  try {
    const result = await vaultBackendService.revokeVaultInvitation(vaultId, inviteId, {
      id: auth.userId,
      isGuest: auth.isGuest,
    });
    if (auth.isGuest) {
      await dbService.flush();
    }
    res.json(result);
  } catch (err: any) {
    const status = err?.status || 400;
    const code = err?.code || 'VAULT_ERROR';
    const msg = err instanceof Error ? err.message : 'Failed to revoke invitation';
    res.status(status).json({ error: msg, code });
  }
});

apiRouter.post('/joint-vaults/:vaultId/contributions', async (req: Request, res: Response) => {
  const auth = getAuth(req);
  const { vaultId } = req.params;
  const body = req.body || {};

  try {
    const contribution = dbService.addVaultContribution(
      vaultId,
      { id: auth.userId, name: auth.name },
      {
        amountPaise: body.amountPaise,
        date: body.date,
        description: body.description,
      }
    );
    await dbService.flush();
    const summary = dbService.getVaultSummary(vaultId, auth.userId);
    res.status(201).json({ contribution, summary });
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Failed to add contribution';
    res.status(400).json({ error: msg });
  }
});

apiRouter.post('/joint-vaults/:vaultId/contributions/:id/reverse', async (req: Request, res: Response) => {
  const { userId } = getAuth(req);
  const { vaultId, id } = req.params;
  const { reason } = req.body || {};

  try {
    const contribution = dbService.reverseVaultContribution(vaultId, id, userId, reason || 'Reversed by member');
    await dbService.flush();
    const summary = dbService.getVaultSummary(vaultId, userId);
    res.json({ contribution, summary });
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Failed to reverse contribution';
    res.status(400).json({ error: msg });
  }
});

apiRouter.post('/joint-vaults/:vaultId/expenses', async (req: Request, res: Response) => {
  const auth = getAuth(req);
  const { vaultId } = req.params;
  const body = req.body || {};

  try {
    const expense = dbService.addVaultExpense(
      vaultId,
      { id: auth.userId, name: auth.name },
      {
        amountPaise: body.amountPaise,
        description: body.description,
        date: body.date,
        splitMode: body.splitMode,
        customShares: body.customShares,
      }
    );
    await dbService.flush();
    const summary = dbService.getVaultSummary(vaultId, auth.userId);
    res.status(201).json({ expense, summary });
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Failed to add joint expense';
    res.status(400).json({ error: msg });
  }
});

apiRouter.post('/joint-vaults/:vaultId/expenses/:id/reverse', async (req: Request, res: Response) => {
  const auth = getAuth(req);
  const { vaultId, id } = req.params;
  const { reason } = req.body || {};

  try {
    const result = await vaultBackendService.reverseVaultExpense(
      vaultId,
      id,
      { id: auth.userId, isGuest: auth.isGuest },
      reason
    );
    if (auth.isGuest) {
      await dbService.flush();
    }
    const summary = await vaultBackendService.getVaultSummary(vaultId, auth.userId);
    res.json({ success: true, ...result, summary });
  } catch (err: any) {
    const status = err?.status || 400;
    const code = err?.code || 'VAULT_ERROR';
    const msg = err instanceof Error ? err.message : 'Failed to reverse expense';
    res.status(status).json({ error: msg, code });
  }
});

apiRouter.post('/joint-vaults/:vaultId/settlements', async (req: Request, res: Response) => {
  const auth = getAuth(req);
  const { vaultId } = req.params;
  const body = req.body || {};

  try {
    const settlement = dbService.recordVaultSettlement(
      vaultId,
      { id: auth.userId, name: auth.name },
      {
        toUid: body.toUid,
        toName: body.toName,
        amountPaise: body.amountPaise,
        date: body.date,
        notes: body.notes,
      }
    );
    await dbService.flush();
    const summary = dbService.getVaultSummary(vaultId, auth.userId);
    res.status(201).json({ settlement, summary });
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Failed to record settlement';
    res.status(400).json({ error: msg });
  }
});

apiRouter.patch('/joint-vaults/:vaultId/ratio', async (req: Request, res: Response) => {
  const { userId } = getAuth(req);
  const { vaultId } = req.params;
  const { targetRatio } = req.body || {};

  try {
    const vault = dbService.updateVaultRatio(vaultId, userId, targetRatio);
    await dbService.flush();
    const summary = dbService.getVaultSummary(vaultId, userId);
    res.json(summary || vault);
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Failed to update target ratio';
    res.status(400).json({ error: msg });
  }
});

apiRouter.post('/joint-vaults/:vaultId/leave', async (req: Request, res: Response) => {
  const auth = getAuth(req);
  const { vaultId } = req.params;

  try {
    const result = await vaultBackendService.leaveVault(vaultId, {
      id: auth.userId,
      email: auth.email,
      name: auth.name,
      isGuest: auth.isGuest,
    });
    if (auth.isGuest) {
      await dbService.flush();
    }
    res.json(result);
  } catch (err: any) {
    const status = err?.status || (err?.code === 'LAST_MEMBER_MUST_ARCHIVE' ? 409 : 400);
    const code = err?.code || (status === 409 ? 'LAST_MEMBER_MUST_ARCHIVE' : 'VAULT_ERROR');
    const msg = err instanceof Error ? err.message : 'Failed to leave vault';
    res.status(status).json({ error: msg, code });
  }
});

apiRouter.post('/joint-vaults/:vaultId/archive', async (req: Request, res: Response) => {
  const auth = getAuth(req);
  const { vaultId } = req.params;

  try {
    const vault = await vaultBackendService.archiveVault(vaultId, {
      id: auth.userId,
      email: auth.email,
      name: auth.name,
      isGuest: auth.isGuest,
    });
    if (auth.isGuest) {
      await dbService.flush();
    }
    res.json({ success: true, vault });
  } catch (err: any) {
    const status = err?.status || 400;
    const code = err?.code || 'VAULT_ERROR';
    const msg = err instanceof Error ? err.message : 'Failed to archive vault';
    res.status(status).json({ error: msg, code });
  }
});

// ----------------------------------------------------
// FocusFlow v1.8 Multi-Tenant Routes (Hardened)
// ----------------------------------------------------

function requireAuthUser(req: Request, res: Response) {
  const auth = getAuth(req);
  if (!auth || !auth.userId || auth.isGuest) {
    res.status(401).json({
      error: 'Signed-in FocusFlow authentication is required for this resource.',
      code: 'AUTH_REQUIRED',
    });
    return null;
  }
  return auth;
}

// -------------------------------------------------------------
// 1. Skill Tree Nodes
// -------------------------------------------------------------
apiRouter.get('/skill-nodes', async (req: Request, res: Response) => {
  const auth = requireAuthUser(req, res);
  if (!auth) return;
  try {
    const nodes = await v18StorageService.getSkillNodes(auth.userId);
    res.json(nodes);
  } catch {
    res.status(500).json({ error: 'Failed to retrieve skill nodes' });
  }
});

apiRouter.get('/skill-nodes/:id', async (req: Request, res: Response) => {
  const auth = requireAuthUser(req, res);
  if (!auth) return;
  try {
    const node = await v18StorageService.getSkillNode(auth.userId, req.params.id);
    if (!node) {
      res.status(404).json({ error: 'Skill node not found', code: 'NOT_FOUND' });
      return;
    }
    res.json(node);
  } catch (err) {
    if (err instanceof StorageOwnershipError) {
      res.status(403).json({ error: err.message, code: err.code });
      return;
    }
    res.status(500).json({ error: 'Failed to retrieve skill node' });
  }
});

apiRouter.post('/skill-nodes', async (req: Request, res: Response) => {
  const auth = requireAuthUser(req, res);
  if (!auth) return;
  const body = req.body || {};
  const title = typeof body.title === 'string' ? body.title.trim().slice(0, 128) : '';
  if (!title) {
    res.status(400).json({ error: 'title is required and must be a non-empty string' });
    return;
  }
  const allowedStatuses = ['locked', 'available', 'in_progress', 'completed'];
  const status = allowedStatuses.includes(body.status) ? body.status : 'available';
  const tier = typeof body.tier === 'number' && body.tier >= 1 && body.tier <= 10 ? Math.floor(body.tier) : 1;
  const xpPoints = typeof body.xpPoints === 'number' && body.xpPoints >= 0 ? Math.floor(body.xpPoints) : 10;

  const recordId = typeof body.id === 'string' && body.id ? body.id.slice(0, 128) : `sn_${Date.now()}_${crypto.randomBytes(6).toString('hex')}`;

  const node: SkillNode = {
    id: recordId,
    userId: auth.userId,
    trackId: typeof body.trackId === 'string' ? body.trackId.slice(0, 128) : 'default',
    title,
    description: typeof body.description === 'string' ? body.description.slice(0, 1000) : '',
    tier,
    prerequisites: Array.isArray(body.prerequisites) ? body.prerequisites.filter((p: unknown) => typeof p === 'string').slice(0, 20) : [],
    status,
    category: typeof body.category === 'string' ? body.category.slice(0, 64) : 'General',
    xpPoints,
    completedAt: body.completedAt ? String(body.completedAt) : null,
    notes: typeof body.notes === 'string' ? body.notes.slice(0, 2000) : undefined,
    icon: typeof body.icon === 'string' ? body.icon.slice(0, 64) : undefined,
    tags: Array.isArray(body.tags) ? body.tags.filter((t: unknown) => typeof t === 'string').slice(0, 10) : undefined,
  };

  try {
    const saved = await v18StorageService.saveSkillNode(auth.userId, node);
    await dbService.flush();
    res.status(201).json(saved);
  } catch (err) {
    if (err instanceof StorageOwnershipError) {
      res.status(403).json({ error: err.message, code: err.code });
      return;
    }
    res.status(500).json({ error: 'Database persistence failed' });
  }
});

apiRouter.put('/skill-nodes/:id', async (req: Request, res: Response) => {
  const auth = requireAuthUser(req, res);
  if (!auth) return;
  try {
    const updated = await v18StorageService.updateSkillNode(auth.userId, req.params.id, req.body || {});
    await dbService.flush();
    res.json(updated);
  } catch (err) {
    if (err instanceof StorageOwnershipError) {
      res.status(403).json({ error: err.message, code: err.code });
      return;
    }
    if (err instanceof StorageNotFoundError) {
      res.status(404).json({ error: err.message, code: err.code });
      return;
    }
    res.status(500).json({ error: 'Failed to update skill node' });
  }
});

apiRouter.delete('/skill-nodes/:id', async (req: Request, res: Response) => {
  const auth = requireAuthUser(req, res);
  if (!auth) return;
  try {
    const success = await v18StorageService.deleteSkillNode(auth.userId, req.params.id);
    await dbService.flush();
    if (!success) {
      res.status(404).json({ error: 'Skill node not found', code: 'NOT_FOUND' });
      return;
    }
    res.json({ success: true });
  } catch (err) {
    if (err instanceof StorageOwnershipError) {
      res.status(403).json({ error: err.message, code: err.code });
      return;
    }
    res.status(500).json({ error: 'Database persistence failed' });
  }
});

// -------------------------------------------------------------
// 2. Whiteboard Rough-Work Drawings
// -------------------------------------------------------------
apiRouter.get('/whiteboard', async (req: Request, res: Response) => {
  const auth = requireAuthUser(req, res);
  if (!auth) return;
  try {
    const drawings = await v18StorageService.getWhiteboardDrawings(auth.userId);
    res.json(drawings);
  } catch {
    res.status(500).json({ error: 'Failed to retrieve whiteboard drawings' });
  }
});

apiRouter.get('/whiteboard/:id', async (req: Request, res: Response) => {
  const auth = requireAuthUser(req, res);
  if (!auth) return;
  try {
    const drawing = await v18StorageService.getWhiteboardDrawing(auth.userId, req.params.id);
    if (!drawing) {
      res.status(404).json({ error: 'Whiteboard drawing not found', code: 'NOT_FOUND' });
      return;
    }
    res.json(drawing);
  } catch (err) {
    if (err instanceof StorageOwnershipError) {
      res.status(403).json({ error: err.message, code: err.code });
      return;
    }
    res.status(500).json({ error: 'Failed to retrieve whiteboard drawing' });
  }
});

apiRouter.post('/whiteboard', async (req: Request, res: Response) => {
  const auth = requireAuthUser(req, res);
  if (!auth) return;
  const body = req.body || {};
  const dataUrl = typeof body.dataUrl === 'string' ? body.dataUrl.trim() : '';

  const isDataUrl = /^data:image\/(png|jpeg|webp|svg\+xml);base64,[A-Za-z0-9+/=]+$/.test(dataUrl) ||
    (dataUrl.startsWith('data:image/') && dataUrl.length <= 2 * 1024 * 1024);

  if (!isDataUrl) {
    res.status(400).json({
      error: 'Invalid whiteboard dataUrl: must be a valid base64 image data URL under 2MB',
      code: 'INVALID_PAYLOAD',
    });
    return;
  }

  const recordId = typeof body.id === 'string' && body.id ? body.id.slice(0, 128) : `wb_${Date.now()}_${crypto.randomBytes(6).toString('hex')}`;

  const drawing: WhiteboardDrawing = {
    id: recordId,
    userId: auth.userId,
    title: typeof body.title === 'string' && body.title.trim() ? body.title.trim().slice(0, 128) : 'Rough Sketch',
    dataUrl,
    sizeBytes: typeof body.sizeBytes === 'number' && body.sizeBytes > 0 ? body.sizeBytes : dataUrl.length,
    width: typeof body.width === 'number' && body.width > 0 && body.width <= 4096 ? body.width : 800,
    height: typeof body.height === 'number' && body.height > 0 && body.height <= 4096 ? body.height : 600,
    topicId: typeof body.topicId === 'string' ? body.topicId.slice(0, 128) : undefined,
    topicTitle: typeof body.topicTitle === 'string' ? body.topicTitle.slice(0, 128) : undefined,
    createdAt: typeof body.createdAt === 'string' ? body.createdAt : new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };

  try {
    const saved = await v18StorageService.saveWhiteboardDrawing(auth.userId, drawing);
    await dbService.flush();
    res.status(201).json(saved);
  } catch (err) {
    if (err instanceof StorageOwnershipError) {
      res.status(403).json({ error: err.message, code: err.code });
      return;
    }
    res.status(500).json({ error: 'Database persistence failed' });
  }
});

apiRouter.put('/whiteboard/:id', async (req: Request, res: Response) => {
  const auth = requireAuthUser(req, res);
  if (!auth) return;
  try {
    const updated = await v18StorageService.updateWhiteboardDrawing(auth.userId, req.params.id, req.body || {});
    await dbService.flush();
    res.json(updated);
  } catch (err) {
    if (err instanceof StorageOwnershipError) {
      res.status(403).json({ error: err.message, code: err.code });
      return;
    }
    if (err instanceof StorageNotFoundError) {
      res.status(404).json({ error: err.message, code: err.code });
      return;
    }
    res.status(500).json({ error: 'Failed to update whiteboard drawing' });
  }
});

apiRouter.delete('/whiteboard/:id', async (req: Request, res: Response) => {
  const auth = requireAuthUser(req, res);
  if (!auth) return;
  try {
    const success = await v18StorageService.deleteWhiteboardDrawing(auth.userId, req.params.id);
    await dbService.flush();
    if (!success) {
      res.status(404).json({ error: 'Whiteboard drawing not found', code: 'NOT_FOUND' });
      return;
    }
    res.json({ success: true });
  } catch (err) {
    if (err instanceof StorageOwnershipError) {
      res.status(403).json({ error: err.message, code: err.code });
      return;
    }
    res.status(500).json({ error: 'Database persistence failed' });
  }
});

// -------------------------------------------------------------
// 3. Exam Hall Simulator Sessions
// -------------------------------------------------------------
apiRouter.get('/exam-simulations', async (req: Request, res: Response) => {
  const auth = requireAuthUser(req, res);
  if (!auth) return;
  try {
    const sims = await v18StorageService.getExamSimulations(auth.userId);
    res.json(sims);
  } catch {
    res.status(500).json({ error: 'Failed to retrieve exam simulations' });
  }
});

apiRouter.get('/exam-simulations/:id', async (req: Request, res: Response) => {
  const auth = requireAuthUser(req, res);
  if (!auth) return;
  try {
    const sim = await v18StorageService.getExamSimulation(auth.userId, req.params.id);
    if (!sim) {
      res.status(404).json({ error: 'Exam simulation not found', code: 'NOT_FOUND' });
      return;
    }
    res.json(sim);
  } catch (err) {
    if (err instanceof StorageOwnershipError) {
      res.status(403).json({ error: err.message, code: err.code });
      return;
    }
    res.status(500).json({ error: 'Failed to retrieve exam simulation' });
  }
});

apiRouter.post('/exam-simulations', async (req: Request, res: Response) => {
  const auth = requireAuthUser(req, res);
  if (!auth) return;
  const body = req.body || {};
  const title = typeof body.title === 'string' ? body.title.trim().slice(0, 128) : '';
  if (!title) {
    res.status(400).json({ error: 'title is required and must be a non-empty string' });
    return;
  }
  const totalDurationMinutes = typeof body.totalDurationMinutes === 'number' && body.totalDurationMinutes > 0
    ? Math.min(body.totalDurationMinutes, 1440)
    : 180;
  const allowedStatuses = ['idle', 'running', 'paused', 'completed', 'in_progress'];
  const status = allowedStatuses.includes(body.status) ? body.status : 'idle';

  const recordId = typeof body.id === 'string' && body.id ? body.id.slice(0, 128) : `sim_${Date.now()}_${crypto.randomBytes(6).toString('hex')}`;

  const sim: ExamSimulationState = {
    id: recordId,
    title,
    totalDurationMinutes,
    sections: Array.isArray(body.sections) ? body.sections.slice(0, 20) : [],
    currentSectionIndex: typeof body.currentSectionIndex === 'number' ? Math.max(0, body.currentSectionIndex) : 0,
    status,
    sectionElapsedSeconds: typeof body.sectionElapsedSeconds === 'object' && body.sectionElapsedSeconds !== null ? body.sectionElapsedSeconds : {},
    totalElapsedSeconds: typeof body.totalElapsedSeconds === 'number' ? Math.max(0, body.totalElapsedSeconds) : 0,
    startedAt: typeof body.startedAt === 'string' ? body.startedAt : undefined,
    completedAt: typeof body.completedAt === 'string' ? body.completedAt : undefined,
  };

  try {
    const saved = await v18StorageService.saveExamSimulation(auth.userId, sim);
    await dbService.flush();
    res.status(201).json(saved);
  } catch (err) {
    if (err instanceof StorageOwnershipError) {
      res.status(403).json({ error: err.message, code: err.code });
      return;
    }
    res.status(500).json({ error: 'Database persistence failed' });
  }
});

apiRouter.put('/exam-simulations/:id', async (req: Request, res: Response) => {
  const auth = requireAuthUser(req, res);
  if (!auth) return;
  try {
    const updated = await v18StorageService.updateExamSimulation(auth.userId, req.params.id, req.body || {});
    await dbService.flush();
    res.json(updated);
  } catch (err) {
    if (err instanceof StorageOwnershipError) {
      res.status(403).json({ error: err.message, code: err.code });
      return;
    }
    if (err instanceof StorageNotFoundError) {
      res.status(404).json({ error: err.message, code: err.code });
      return;
    }
    res.status(500).json({ error: 'Failed to update exam simulation' });
  }
});

apiRouter.delete('/exam-simulations/:id', async (req: Request, res: Response) => {
  const auth = requireAuthUser(req, res);
  if (!auth) return;
  try {
    const success = await v18StorageService.deleteExamSimulation(auth.userId, req.params.id);
    await dbService.flush();
    if (!success) {
      res.status(404).json({ error: 'Exam simulation not found', code: 'NOT_FOUND' });
      return;
    }
    res.json({ success: true });
  } catch (err) {
    if (err instanceof StorageOwnershipError) {
      res.status(403).json({ error: err.message, code: err.code });
      return;
    }
    res.status(500).json({ error: 'Database persistence failed' });
  }
});

// -------------------------------------------------------------
// 4. Decision Journal
// -------------------------------------------------------------
apiRouter.get('/decisions', async (req: Request, res: Response) => {
  const auth = requireAuthUser(req, res);
  if (!auth) return;
  try {
    const decisions = await v18StorageService.getDecisionEntries(auth.userId);
    res.json(decisions);
  } catch {
    res.status(500).json({ error: 'Failed to retrieve decision entries' });
  }
});

apiRouter.get('/decisions/:id', async (req: Request, res: Response) => {
  const auth = requireAuthUser(req, res);
  if (!auth) return;
  try {
    const decision = await v18StorageService.getDecisionEntry(auth.userId, req.params.id);
    if (!decision) {
      res.status(404).json({ error: 'Decision entry not found', code: 'NOT_FOUND' });
      return;
    }
    res.json(decision);
  } catch (err) {
    if (err instanceof StorageOwnershipError) {
      res.status(403).json({ error: err.message, code: err.code });
      return;
    }
    res.status(500).json({ error: 'Failed to retrieve decision entry' });
  }
});

apiRouter.post('/decisions', async (req: Request, res: Response) => {
  const auth = requireAuthUser(req, res);
  if (!auth) return;
  const body = req.body || {};
  const title = typeof body.title === 'string' ? body.title.trim().slice(0, 256) : '';
  if (!title) {
    res.status(400).json({ error: 'title is required and must be a non-empty string' });
    return;
  }

  const allowedCategories = ['career', 'academic', 'financial', 'personal', 'health'];
  const category = allowedCategories.includes(body.category) ? body.category : 'personal';
  const confidenceScore = typeof body.confidenceScore === 'number' && body.confidenceScore >= 1 && body.confidenceScore <= 10
    ? Math.floor(body.confidenceScore)
    : 5;

  const recordId = typeof body.id === 'string' && body.id ? body.id.slice(0, 128) : `dec_${Date.now()}_${crypto.randomBytes(6).toString('hex')}`;

  const decision: DecisionEntry = {
    id: recordId,
    userId: auth.userId,
    title,
    category,
    rationale: typeof body.rationale === 'string' ? body.rationale.slice(0, 2000) : '',
    expectedOutcome: typeof body.expectedOutcome === 'string' ? body.expectedOutcome.slice(0, 2000) : '',
    confidenceScore,
    expectedReviewDate: typeof body.expectedReviewDate === 'string' ? body.expectedReviewDate.slice(0, 32) : getTodayDateString(DEFAULT_TIMEZONE),
    reviewIntervalDays: typeof body.reviewIntervalDays === 'number' ? body.reviewIntervalDays : 30,
    status: body.status === 'reviewed' ? 'reviewed' : 'pending_review',
    actualOutcome: typeof body.actualOutcome === 'string' ? body.actualOutcome.slice(0, 2000) : undefined,
    successRating: typeof body.successRating === 'number' ? Math.max(1, Math.min(5, Math.floor(body.successRating))) : undefined,
    reflection: typeof body.reflection === 'string' ? body.reflection.slice(0, 2000) : undefined,
    lessonsLearned: typeof body.lessonsLearned === 'string' ? body.lessonsLearned.slice(0, 2000) : undefined,
    createdAt: typeof body.createdAt === 'string' ? body.createdAt : new Date().toISOString(),
    reviewedAt: typeof body.reviewedAt === 'string' ? body.reviewedAt : undefined,
  };

  try {
    const saved = await v18StorageService.saveDecisionEntry(auth.userId, decision);
    await dbService.flush();
    res.status(201).json(saved);
  } catch (err) {
    if (err instanceof StorageOwnershipError) {
      res.status(403).json({ error: err.message, code: err.code });
      return;
    }
    res.status(500).json({ error: 'Database persistence failed' });
  }
});

apiRouter.put('/decisions/:id', async (req: Request, res: Response) => {
  const auth = requireAuthUser(req, res);
  if (!auth) return;
  try {
    const updated = await v18StorageService.updateDecisionEntry(auth.userId, req.params.id, req.body || {});
    await dbService.flush();
    res.json(updated);
  } catch (err) {
    if (err instanceof StorageOwnershipError) {
      res.status(403).json({ error: err.message, code: err.code });
      return;
    }
    if (err instanceof StorageNotFoundError) {
      res.status(404).json({ error: err.message, code: err.code });
      return;
    }
    res.status(500).json({ error: 'Failed to update decision entry' });
  }
});

apiRouter.delete('/decisions/:id', async (req: Request, res: Response) => {
  const auth = requireAuthUser(req, res);
  if (!auth) return;
  try {
    const success = await v18StorageService.deleteDecisionEntry(auth.userId, req.params.id);
    await dbService.flush();
    if (!success) {
      res.status(404).json({ error: 'Decision entry not found', code: 'NOT_FOUND' });
      return;
    }
    res.json({ success: true });
  } catch (err) {
    if (err instanceof StorageOwnershipError) {
      res.status(403).json({ error: err.message, code: err.code });
      return;
    }
    res.status(500).json({ error: 'Database persistence failed' });
  }
});

// -------------------------------------------------------------
// 5. Doomscroll Self-Tax Jar
// -------------------------------------------------------------
apiRouter.get('/doomscroll-tax', async (req: Request, res: Response) => {
  const auth = requireAuthUser(req, res);
  if (!auth) return;
  try {
    const logs = await v18StorageService.getDoomscrollLogs(auth.userId);
    res.json(logs);
  } catch {
    res.status(500).json({ error: 'Failed to retrieve doomscroll logs' });
  }
});

apiRouter.get('/doomscroll-tax/:id', async (req: Request, res: Response) => {
  const auth = requireAuthUser(req, res);
  if (!auth) return;
  try {
    const log = await v18StorageService.getDoomscrollLog(auth.userId, req.params.id);
    if (!log) {
      res.status(404).json({ error: 'Doomscroll log not found', code: 'NOT_FOUND' });
      return;
    }
    res.json(log);
  } catch (err) {
    if (err instanceof StorageOwnershipError) {
      res.status(403).json({ error: err.message, code: err.code });
      return;
    }
    res.status(500).json({ error: 'Failed to retrieve doomscroll log' });
  }
});

apiRouter.post('/doomscroll-tax', async (req: Request, res: Response) => {
  const auth = requireAuthUser(req, res);
  if (!auth) return;
  const body = req.body || {};
  const minutes = typeof body.minutes === 'number' && body.minutes > 0 ? Math.floor(body.minutes) : 0;
  if (minutes <= 0) {
    res.status(400).json({ error: 'minutes is required and must be a positive number' });
    return;
  }

  const recordId = typeof body.id === 'string' && body.id ? body.id.slice(0, 128) : `tax_${Date.now()}_${crypto.randomBytes(6).toString('hex')}`;

  const log: DoomscrollTaxEntry = {
    id: recordId,
    userId: auth.userId,
    minutes,
    durationMinutes: minutes,
    distractionApp: typeof body.distractionApp === 'string' ? body.distractionApp.slice(0, 64) : 'Social Media',
    platform: typeof body.platform === 'string' ? body.platform.slice(0, 64) : undefined,
    ratePerHour: typeof body.ratePerHour === 'number' && body.ratePerHour >= 0 ? body.ratePerHour : 0,
    amountTaxed: typeof body.amountTaxed === 'number' && body.amountTaxed >= 0 ? body.amountTaxed : 0,
    taxAmountPaise: typeof body.taxAmountPaise === 'number' && body.taxAmountPaise >= 0 ? body.taxAmountPaise : undefined,
    currency: typeof body.currency === 'string' ? body.currency.slice(0, 8) : '₹',
    notes: typeof body.notes === 'string' ? body.notes.slice(0, 500) : undefined,
    reason: typeof body.reason === 'string' ? body.reason.slice(0, 500) : undefined,
    linkedSavingsGoalId: typeof body.linkedSavingsGoalId === 'string' ? body.linkedSavingsGoalId.slice(0, 128) : undefined,
    createdAt: typeof body.createdAt === 'string' ? body.createdAt : new Date().toISOString(),
  };

  try {
    const saved = await v18StorageService.saveDoomscrollLog(auth.userId, log);
    await dbService.flush();
    res.status(201).json(saved);
  } catch (err) {
    if (err instanceof StorageOwnershipError) {
      res.status(403).json({ error: err.message, code: err.code });
      return;
    }
    res.status(500).json({ error: 'Database persistence failed' });
  }
});

apiRouter.put('/doomscroll-tax/:id', async (req: Request, res: Response) => {
  const auth = requireAuthUser(req, res);
  if (!auth) return;
  try {
    const updated = await v18StorageService.updateDoomscrollLog(auth.userId, req.params.id, req.body || {});
    await dbService.flush();
    res.json(updated);
  } catch (err) {
    if (err instanceof StorageOwnershipError) {
      res.status(403).json({ error: err.message, code: err.code });
      return;
    }
    if (err instanceof StorageNotFoundError) {
      res.status(404).json({ error: err.message, code: err.code });
      return;
    }
    res.status(500).json({ error: 'Failed to update doomscroll log' });
  }
});

apiRouter.delete('/doomscroll-tax/:id', async (req: Request, res: Response) => {
  const auth = requireAuthUser(req, res);
  if (!auth) return;
  try {
    const success = await v18StorageService.deleteDoomscrollLog(auth.userId, req.params.id);
    await dbService.flush();
    if (!success) {
      res.status(404).json({ error: 'Doomscroll log not found', code: 'NOT_FOUND' });
      return;
    }
    res.json({ success: true });
  } catch (err) {
    if (err instanceof StorageOwnershipError) {
      res.status(403).json({ error: err.message, code: err.code });
      return;
    }
    res.status(500).json({ error: 'Database persistence failed' });
  }
});

apiRouter.delete('/doomscroll-tax', async (req: Request, res: Response) => {
  const auth = requireAuthUser(req, res);
  if (!auth) return;
  try {
    const success = await v18StorageService.clearDoomscrollLogs(auth.userId);
    await dbService.flush();
    res.json({ success });
  } catch {
    res.status(500).json({ error: 'Database persistence failed' });
  }
});

// -------------------------------------------------------------
// 6. Time Capsule Letters (Date-Restricted Reflections)
// -------------------------------------------------------------
// Never trust client-controlled req.query.tz or x-timezone for lock enforcement.
function getTrustedServerToday(): string {
  return getTodayDateString(DEFAULT_TIMEZONE);
}

function isTimeCapsuleUnlockedOnServer(capsule: { unlockDate?: string }, serverToday: string): boolean {
  if (!capsule.unlockDate) return true;
  return capsule.unlockDate <= serverToday;
}

function sanitizeTimeCapsuleForResponse(capsule: TimeCapsuleLetter, serverToday: string): TimeCapsuleLetter {
  const isUnlocked = isTimeCapsuleUnlockedOnServer(capsule, serverToday);
  if (isUnlocked) {
    return {
      ...capsule,
      isUnlocked: true,
      isSealed: false,
      openedAt: capsule.openedAt || new Date().toISOString(),
    };
  }

  // Strictly redact content for locked letters; return only safe metadata
  return {
    id: capsule.id,
    userId: capsule.userId,
    title: capsule.title,
    content: '', // Redacted on server! Content never leaves server until unlock date
    unlockDate: capsule.unlockDate,
    isUnlocked: false,
    isSealed: true,
    sealedAt: capsule.sealedAt || capsule.createdAt,
    createdAt: capsule.createdAt,
    tags: capsule.tags,
  };
}

apiRouter.get('/time-capsules', async (req: Request, res: Response) => {
  const auth = requireAuthUser(req, res);
  if (!auth) return;
  try {
    const serverToday = getTrustedServerToday();
    const capsules = await v18StorageService.getTimeCapsules(auth.userId);
    const sanitized = capsules.map((c) => sanitizeTimeCapsuleForResponse(c, serverToday));
    res.json(sanitized);
  } catch {
    res.status(500).json({ error: 'Failed to retrieve time capsules' });
  }
});

apiRouter.get('/time-capsules/:id', async (req: Request, res: Response) => {
  const auth = requireAuthUser(req, res);
  if (!auth) return;
  try {
    const serverToday = getTrustedServerToday();
    const capsule = await v18StorageService.getTimeCapsule(auth.userId, req.params.id);
    if (!capsule) {
      res.status(404).json({ error: 'Time capsule not found', code: 'NOT_FOUND' });
      return;
    }
    if (capsule.userId !== auth.userId) {
      res.status(403).json({ error: 'Cross-user access forbidden', code: 'FORBIDDEN' });
      return;
    }
    res.json(sanitizeTimeCapsuleForResponse(capsule, serverToday));
  } catch (err) {
    if (err instanceof StorageOwnershipError) {
      res.status(403).json({ error: err.message, code: err.code });
      return;
    }
    res.status(500).json({ error: 'Failed to retrieve time capsule' });
  }
});

apiRouter.post('/time-capsules', async (req: Request, res: Response) => {
  const auth = requireAuthUser(req, res);
  if (!auth) return;
  const body = req.body || {};
  const title = typeof body.title === 'string' ? body.title.trim().slice(0, 256) : '';
  const content = typeof body.content === 'string' ? body.content.trim().slice(0, 20000) : '';
  const rawUnlockDate = typeof body.unlockDate === 'string' ? body.unlockDate.trim() : '';

  if (!title || !content || !rawUnlockDate) {
    res.status(400).json({ error: 'title, content, and unlockDate are required' });
    return;
  }

  const unlockDate = parseIsoDate(rawUnlockDate);
  if (!unlockDate) {
    res.status(400).json({ error: 'unlockDate must be a valid YYYY-MM-DD date' });
    return;
  }

  const serverToday = getTrustedServerToday();
  // Never trust client-provided isUnlocked. Calculate strictly using trusted server time!
  const isUnlocked = isTimeCapsuleUnlockedOnServer({ unlockDate }, serverToday);

  const recordId = typeof body.id === 'string' && body.id ? body.id.slice(0, 128) : `cap_${Date.now()}_${crypto.randomBytes(6).toString('hex')}`;

  const capsule: TimeCapsuleLetter = {
    id: recordId,
    userId: auth.userId,
    title,
    content, // Stored safely in authoritative database
    unlockDate,
    isUnlocked,
    isSealed: !isUnlocked,
    sealedAt: typeof body.sealedAt === 'string' ? body.sealedAt : new Date().toISOString(),
    createdAt: typeof body.createdAt === 'string' ? body.createdAt : new Date().toISOString(),
    openedAt: isUnlocked ? (typeof body.openedAt === 'string' ? body.openedAt : new Date().toISOString()) : undefined,
    tags: Array.isArray(body.tags) ? body.tags.filter((t: unknown) => typeof t === 'string').slice(0, 10) : undefined,
  };

  try {
    const saved = await v18StorageService.saveTimeCapsule(auth.userId, capsule);
    await dbService.flush();
    // Return sanitized response: if locked, content is redacted
    res.status(201).json(sanitizeTimeCapsuleForResponse(saved, serverToday));
  } catch (err) {
    if (err instanceof StorageOwnershipError) {
      res.status(403).json({ error: err.message, code: err.code });
      return;
    }
    res.status(500).json({ error: 'Database persistence failed' });
  }
});

apiRouter.put('/time-capsules/:id', async (req: Request, res: Response) => {
  const auth = requireAuthUser(req, res);
  if (!auth) return;
  try {
    const serverToday = getTrustedServerToday();
    const existing = await v18StorageService.getTimeCapsule(auth.userId, req.params.id);
    if (!existing) {
      res.status(404).json({ error: 'Time capsule not found', code: 'NOT_FOUND' });
      return;
    }
    if (existing.userId !== auth.userId) {
      res.status(403).json({ error: 'Cross-user write forbidden', code: 'FORBIDDEN' });
      return;
    }

    const wasUnlocked = isTimeCapsuleUnlockedOnServer(existing, serverToday);
    const body = req.body || {};

    let effectiveUnlockDate = existing.unlockDate;
    if (body.unlockDate !== undefined) {
      const parsedUnlockDate = parseIsoDate(body.unlockDate);
      if (!parsedUnlockDate) {
        res.status(400).json({ error: 'unlockDate must be a valid YYYY-MM-DD date' });
        return;
      }
      if (!wasUnlocked && (parsedUnlockDate < existing.unlockDate || parsedUnlockDate <= serverToday)) {
        res.status(403).json({
          error: 'Cannot shorten or bypass unlockDate on a sealed time capsule',
          code: 'CAPSULE_SEALED',
        });
        return;
      }
      effectiveUnlockDate = parsedUnlockDate;
    }

    const isUnlocked = wasUnlocked && isTimeCapsuleUnlockedOnServer({ unlockDate: effectiveUnlockDate }, serverToday);

    const updates: Partial<TimeCapsuleLetter> = {
      unlockDate: effectiveUnlockDate,
      isUnlocked,
      isSealed: !isUnlocked,
    };
    if (typeof body.title === 'string') updates.title = body.title.trim().slice(0, 256);
    if (Array.isArray(body.tags)) updates.tags = body.tags.filter((t: unknown) => typeof t === 'string').slice(0, 10);

    // If client sent non-empty content, update it; otherwise preserve existing content
    if (typeof body.content === 'string' && body.content.trim()) {
      updates.content = body.content.trim().slice(0, 20000);
    }

    const updated = await v18StorageService.updateTimeCapsule(auth.userId, req.params.id, updates);
    await dbService.flush();
    res.json(sanitizeTimeCapsuleForResponse(updated, serverToday));
  } catch (err) {
    if (err instanceof StorageOwnershipError) {
      res.status(403).json({ error: err.message, code: err.code });
      return;
    }
    if (err instanceof StorageNotFoundError) {
      res.status(404).json({ error: err.message, code: err.code });
      return;
    }
    res.status(500).json({ error: 'Failed to update time capsule' });
  }
});

apiRouter.delete('/time-capsules/:id', async (req: Request, res: Response) => {
  const auth = requireAuthUser(req, res);
  if (!auth) return;
  try {
    const existing = await v18StorageService.getTimeCapsule(auth.userId, req.params.id);
    if (!existing) {
      res.status(404).json({ error: 'Time capsule not found', code: 'NOT_FOUND' });
      return;
    }
    if (existing.userId !== auth.userId) {
      res.status(403).json({ error: 'Cross-user delete forbidden', code: 'FORBIDDEN' });
      return;
    }

    const success = await v18StorageService.deleteTimeCapsule(auth.userId, req.params.id);
    await dbService.flush();
    if (!success) {
      res.status(404).json({ error: 'Time capsule not found', code: 'NOT_FOUND' });
      return;
    }
    res.json({ success: true });
  } catch (err) {
    if (err instanceof StorageOwnershipError) {
      res.status(403).json({ error: err.message, code: err.code });
      return;
    }
    res.status(500).json({ error: 'Database persistence failed' });
  }
});

// -------------------------------------------------------------
// 7. Life Milestones (Life-in-Weeks Grid)
// -------------------------------------------------------------
apiRouter.get('/life-milestones', async (req: Request, res: Response) => {
  const auth = requireAuthUser(req, res);
  if (!auth) return;
  try {
    const milestones = await v18StorageService.getLifeMilestones(auth.userId);
    res.json(milestones);
  } catch {
    res.status(500).json({ error: 'Failed to retrieve life milestones' });
  }
});

apiRouter.get('/life-milestones/:id', async (req: Request, res: Response) => {
  const auth = requireAuthUser(req, res);
  if (!auth) return;
  try {
    const milestone = await v18StorageService.getLifeMilestone(auth.userId, req.params.id);
    if (!milestone) {
      res.status(404).json({ error: 'Life milestone not found', code: 'NOT_FOUND' });
      return;
    }
    res.json(milestone);
  } catch (err) {
    if (err instanceof StorageOwnershipError) {
      res.status(403).json({ error: err.message, code: err.code });
      return;
    }
    res.status(500).json({ error: 'Failed to retrieve life milestone' });
  }
});

apiRouter.post('/life-milestones', async (req: Request, res: Response) => {
  const auth = requireAuthUser(req, res);
  if (!auth) return;
  const body = req.body || {};
  const label = typeof body.label === 'string' ? body.label.trim().slice(0, 128) : '';
  if (!label) {
    res.status(400).json({ error: 'label is required and must be a non-empty string' });
    return;
  }
  const allowedCategories = ['education', 'career', 'personal', 'health', 'target'];
  const category = allowedCategories.includes(body.category) ? body.category : 'personal';
  const age = typeof body.age === 'number' && body.age >= 0 && body.age <= 120 ? Math.floor(body.age) : 25;
  const weekIndex = typeof body.weekIndex === 'number' && body.weekIndex >= 0 ? Math.floor(body.weekIndex) : age * 52;

  const recordId = typeof body.id === 'string' && body.id ? body.id.slice(0, 128) : `m_${Date.now()}_${crypto.randomBytes(6).toString('hex')}`;

  const milestone: LifeMilestone = {
    id: recordId,
    weekIndex,
    age,
    label,
    title: typeof body.title === 'string' ? body.title.trim().slice(0, 128) : label,
    category,
    date: typeof body.date === 'string' ? body.date.slice(0, 32) : undefined,
    color: typeof body.color === 'string' ? body.color.slice(0, 32) : undefined,
  };

  try {
    const saved = await v18StorageService.saveLifeMilestone(auth.userId, milestone);
    await dbService.flush();
    res.status(201).json(saved);
  } catch (err) {
    if (err instanceof StorageOwnershipError) {
      res.status(403).json({ error: err.message, code: err.code });
      return;
    }
    res.status(500).json({ error: 'Database persistence failed' });
  }
});

apiRouter.put('/life-milestones/:id', async (req: Request, res: Response) => {
  const auth = requireAuthUser(req, res);
  if (!auth) return;
  try {
    const updated = await v18StorageService.updateLifeMilestone(auth.userId, req.params.id, req.body || {});
    await dbService.flush();
    res.json(updated);
  } catch (err) {
    if (err instanceof StorageOwnershipError) {
      res.status(403).json({ error: err.message, code: err.code });
      return;
    }
    if (err instanceof StorageNotFoundError) {
      res.status(404).json({ error: err.message, code: err.code });
      return;
    }
    res.status(500).json({ error: 'Failed to update life milestone' });
  }
});

apiRouter.delete('/life-milestones/:id', async (req: Request, res: Response) => {
  const auth = requireAuthUser(req, res);
  if (!auth) return;
  try {
    const success = await v18StorageService.deleteLifeMilestone(auth.userId, req.params.id);
    await dbService.flush();
    if (!success) {
      res.status(404).json({ error: 'Life milestone not found', code: 'NOT_FOUND' });
      return;
    }
    res.json({ success: true });
  } catch (err) {
    if (err instanceof StorageOwnershipError) {
      res.status(403).json({ error: err.message, code: err.code });
      return;
    }
    res.status(500).json({ error: 'Database persistence failed' });
  }
});

// -------------------------------------------------------------
// 8. Emergency Profile & Asset Summary
// -------------------------------------------------------------
function sanitizeMaskedAccount(raw: any, index: number): MaskedAccountRecord {
  const institution = typeof raw?.institution === 'string' ? raw.institution.trim().slice(0, 128) : 'Financial Institution';
  const nickname = typeof raw?.nickname === 'string' ? raw.nickname.trim().slice(0, 128) : 'Account';
  const rawNum = typeof raw?.maskedNumber === 'string' ? raw.maskedNumber.trim() : (typeof raw?.accountNumber === 'string' ? raw.accountNumber.trim() : '');
  const digits = rawNum.replace(/\s+/g, '');
  const last4 = digits.length > 4 ? digits.slice(-4) : (digits || '••••');
  const maskedNumber = last4.startsWith('••••') ? last4 : `•••• ${last4}`;

  const validTypes = ['Savings', 'Checking', 'Fixed Deposit', 'Demat/Brokerage', 'Credit Card'];
  const accountType = validTypes.includes(raw?.accountType) ? raw.accountType : 'Savings';
  const nomineeName = typeof raw?.nomineeName === 'string' && raw.nomineeName.trim() ? raw.nomineeName.trim().slice(0, 128) : undefined;
  const notes = typeof raw?.notes === 'string' && raw.notes.trim() ? raw.notes.trim().slice(0, 500) : undefined;

  return {
    id: typeof raw?.id === 'string' && raw.id ? raw.id.slice(0, 64) : `acc_${Date.now()}_${index}`,
    institution,
    nickname,
    maskedNumber,
    accountType,
    nomineeName,
    notes,
  };
}

function sanitizeInsurancePolicy(raw: any, index: number): InsurancePolicyRecord {
  const provider = typeof raw?.provider === 'string' ? raw.provider.trim().slice(0, 128) : 'Insurance Provider';
  const rawNum = typeof raw?.policyNumber === 'string' ? raw.policyNumber.trim() : (typeof raw?.policyRef === 'string' ? raw.policyRef.trim() : '');
  const digits = rawNum.replace(/\s+/g, '');
  const last4 = digits.length > 4 ? digits.slice(-4) : (digits || '••••');
  const policyNumber = last4.startsWith('••••') ? last4 : `•••• ${last4}`;

  const policyType = typeof raw?.policyType === 'string' && raw.policyType.trim() ? raw.policyType.trim().slice(0, 64) : 'Health Insurance';
  const coverageAmountPaise = typeof raw?.coverageAmountPaise === 'number' && Number.isFinite(raw.coverageAmountPaise) && raw.coverageAmountPaise >= 0
    ? Math.min(raw.coverageAmountPaise, 100000000000)
    : 0;
  const emergencyHelpline = typeof raw?.emergencyHelpline === 'string' ? raw.emergencyHelpline.trim().slice(0, 64) : '';
  const nomineeName = typeof raw?.nomineeName === 'string' ? raw.nomineeName.trim().slice(0, 128) : '';

  return {
    id: typeof raw?.id === 'string' && raw.id ? raw.id.slice(0, 64) : `pol_${Date.now()}_${index}`,
    provider,
    policyNumber,
    policyType,
    coverageAmountPaise,
    emergencyHelpline,
    nomineeName,
  };
}

function sanitizeEmergencyContact(raw: any, index: number): NomineeContactRecord {
  return {
    id: typeof raw?.id === 'string' && raw.id ? raw.id.slice(0, 64) : `c_${Date.now()}_${index}`,
    name: typeof raw?.name === 'string' ? raw.name.trim().slice(0, 128) : 'Contact',
    relationship: typeof raw?.relationship === 'string' ? raw.relationship.trim().slice(0, 64) : 'Next-of-Kin',
    phone: typeof raw?.phone === 'string' ? raw.phone.trim().slice(0, 32) : '',
    email: typeof raw?.email === 'string' && raw.email.trim() ? raw.email.trim().slice(0, 128) : undefined,
    isPrimary: Boolean(raw?.isPrimary),
  };
}

apiRouter.get('/emergency-profile', async (req: Request, res: Response) => {
  const auth = requireAuthUser(req, res);
  if (!auth) return;
  try {
    const profile = await v18StorageService.getEmergencyProfile(auth.userId);
    res.json(
      profile || {
        id: `ep_${auth.userId}`,
        userId: auth.userId,
        accounts: [],
        policies: [],
        emergencyContacts: [],
        updatedAt: new Date().toISOString(),
      }
    );
  } catch {
    res.status(500).json({ error: 'Failed to retrieve emergency profile' });
  }
});

apiRouter.post('/emergency-profile', async (req: Request, res: Response) => {
  const auth = requireAuthUser(req, res);
  if (!auth) return;
  const body = req.body || {};

  const rawAccounts = Array.isArray(body.accounts) ? body.accounts.slice(0, 50) : [];
  const rawPolicies = Array.isArray(body.policies) ? body.policies.slice(0, 50) : [];
  const rawContacts = Array.isArray(body.emergencyContacts)
    ? body.emergencyContacts.slice(0, 20)
    : Array.isArray(body.contacts)
      ? body.contacts.slice(0, 20)
      : [];

  const sanitizedAccounts = rawAccounts.map(sanitizeMaskedAccount);
  const sanitizedPolicies = rawPolicies.map(sanitizeInsurancePolicy);
  const sanitizedContacts = rawContacts.map(sanitizeEmergencyContact);

  const profile: EmergencyAssetProfile = {
    id: `ep_${auth.userId}`,
    userId: auth.userId,
    fullName: typeof body.fullName === 'string' && body.fullName.trim() ? body.fullName.trim().slice(0, 128) : undefined,
    bloodGroup: typeof body.bloodGroup === 'string' && body.bloodGroup.trim() ? body.bloodGroup.trim().slice(0, 16) : undefined,
    primaryHospital: typeof body.primaryHospital === 'string' && body.primaryHospital.trim() ? body.primaryHospital.trim().slice(0, 256) : undefined,
    accounts: sanitizedAccounts,
    policies: sanitizedPolicies,
    emergencyContacts: sanitizedContacts,
    contacts: sanitizedContacts,
    importantDocumentLocations: typeof body.importantDocumentLocations === 'string' && body.importantDocumentLocations.trim() ? body.importantDocumentLocations.trim().slice(0, 2000) : undefined,
    instructionsNote: typeof body.instructionsNote === 'string' && body.instructionsNote.trim() ? body.instructionsNote.trim().slice(0, 2000) : undefined,
    notes: typeof body.notes === 'string' && body.notes.trim() ? body.notes.trim().slice(0, 2000) : undefined,
    updatedAt: new Date().toISOString(),
  };

  try {
    const saved = await v18StorageService.saveEmergencyProfile(auth.userId, profile);
    await dbService.flush();
    res.status(201).json(saved);
  } catch (err) {
    if (err instanceof StorageOwnershipError) {
      res.status(403).json({ error: err.message, code: err.code });
      return;
    }
    res.status(500).json({ error: 'Database persistence failed' });
  }
});

apiRouter.put('/emergency-profile', async (req: Request, res: Response) => {
  const auth = requireAuthUser(req, res);
  if (!auth) return;
  const body = req.body || {};

  const rawAccounts = Array.isArray(body.accounts) ? body.accounts.slice(0, 50) : [];
  const rawPolicies = Array.isArray(body.policies) ? body.policies.slice(0, 50) : [];
  const rawContacts = Array.isArray(body.emergencyContacts)
    ? body.emergencyContacts.slice(0, 20)
    : Array.isArray(body.contacts)
      ? body.contacts.slice(0, 20)
      : [];

  const sanitizedAccounts = rawAccounts.map(sanitizeMaskedAccount);
  const sanitizedPolicies = rawPolicies.map(sanitizeInsurancePolicy);
  const sanitizedContacts = rawContacts.map(sanitizeEmergencyContact);

  const profile: EmergencyAssetProfile = {
    id: `ep_${auth.userId}`,
    userId: auth.userId,
    fullName: typeof body.fullName === 'string' && body.fullName.trim() ? body.fullName.trim().slice(0, 128) : undefined,
    bloodGroup: typeof body.bloodGroup === 'string' && body.bloodGroup.trim() ? body.bloodGroup.trim().slice(0, 16) : undefined,
    primaryHospital: typeof body.primaryHospital === 'string' && body.primaryHospital.trim() ? body.primaryHospital.trim().slice(0, 256) : undefined,
    accounts: sanitizedAccounts,
    policies: sanitizedPolicies,
    emergencyContacts: sanitizedContacts,
    contacts: sanitizedContacts,
    importantDocumentLocations: typeof body.importantDocumentLocations === 'string' && body.importantDocumentLocations.trim() ? body.importantDocumentLocations.trim().slice(0, 2000) : undefined,
    instructionsNote: typeof body.instructionsNote === 'string' && body.instructionsNote.trim() ? body.instructionsNote.trim().slice(0, 2000) : undefined,
    notes: typeof body.notes === 'string' && body.notes.trim() ? body.notes.trim().slice(0, 2000) : undefined,
    updatedAt: new Date().toISOString(),
  };

  try {
    const saved = await v18StorageService.saveEmergencyProfile(auth.userId, profile);
    await dbService.flush();
    res.json(saved);
  } catch (err) {
    if (err instanceof StorageOwnershipError) {
      res.status(403).json({ error: err.message, code: err.code });
      return;
    }
    res.status(500).json({ error: 'Database persistence failed' });
  }
});

apiRouter.delete('/emergency-profile', async (req: Request, res: Response) => {
  const auth = requireAuthUser(req, res);
  if (!auth) return;
  try {
    const success = await v18StorageService.deleteEmergencyProfile(auth.userId);
    await dbService.flush();
    res.json({ success });
  } catch {
    res.status(500).json({ error: 'Database persistence failed' });
  }
});

// ----------------------------------------------------
// Phase 5 — Authoritative Gamification & XP Endpoints
// ----------------------------------------------------
apiRouter.get('/gamification/profile', (req: Request, res: Response) => {
  const { userId } = getAuth(req);
  try {
    const snapshot = getGamificationSnapshot(dbService.getRawDatabase(), userId);
    res.json(snapshot);
  } catch {
    res.status(500).json({ error: 'Failed to load gamification profile' });
  }
});

apiRouter.post('/gamification/award', async (req: Request, res: Response) => {
  const { userId } = getAuth(req);
  const { eventId, source, sourceId } = req.body || {};

  const allowedSources: readonly XPSource[] = [
    'task_completion',
    'focus_session',
    'topic_completion',
    'daily_goal',
    'streak',
  ];
  if (
    typeof eventId !== 'string' ||
    !eventId.trim() ||
    typeof sourceId !== 'string' ||
    !sourceId.trim() ||
    typeof source !== 'string' ||
    !(allowedSources as readonly string[]).includes(source)
  ) {
    res.status(400).json({ error: 'Invalid XP award request: eventId, source, and sourceId are required.' });
    return;
  }

  try {
    const result = awardAuthoritativeXP(dbService.getRawDatabase(), userId, {
      eventId: eventId.trim(),
      source: source as XPSource,
      sourceId: sourceId.trim(),
    });
    if (result.awarded) {
      await dbService.save();
    }
    res.json(result);
  } catch {
    res.status(500).json({ error: 'Failed to award XP' });
  }
});

apiRouter.get('/gamification/leaderboard', (req: Request, res: Response) => {
  const { userId } = getAuth(req);
  const category = (typeof req.query.category === 'string'
    ? req.query.category
    : 'all_time') as GamificationLeaderboardCategory;
  const page = Number(req.query.page || 1);
  const limit = Number(req.query.limit || 10);

  try {
    const data = getPaginatedGamificationLeaderboard(dbService.getRawDatabase(), userId, {
      category,
      page: Number.isFinite(page) ? page : 1,
      limit: Number.isFinite(limit) ? limit : 10,
    });
    res.json(data);
  } catch {
    res.status(500).json({ error: 'Failed to load gamification leaderboard' });
  }
});

// ----------------------------------------------------
// Phase 6 — Social, Friends, Squads, Timer, Chat & Notifications
// ----------------------------------------------------
apiRouter.get('/social/overview', (req: Request, res: Response) => {
  const { userId } = getAuth(req);
  const db = dbService.getRawDatabase();
  const friends = socialService.getFriendsOverview(db, userId);
  const squads = socialService.getUserSquadsOverview(db, userId);
  const privacy = socialService.getUserPrivacy(db, userId);
  const acceptedFriendIds = new Set(friends.friends.map((f) => f.userId));
  const mySquadIds = new Set(squads.squads.map((s) => s.id));
  const roomInvitations = (db.roomInvitations || []).filter(
    (r) => r.recipientId === userId && r.status === 'pending' && r.expiresAt > Date.now()
  );
  const notifications = (db.socialNotifications || []).filter((n) => n.userId === userId).slice(0, 30);
  const activities = (db.socialActivities || [])
    .filter((a) => {
      if (socialService.isBlockedBetween(db, userId, a.actorId)) return false;
      if (a.actorId === userId) return true;
      if (a.visibility === 'private') return false;
      if (a.squadId) return mySquadIds.has(a.squadId);
      return acceptedFriendIds.has(a.actorId);
    })
    .slice(0, 30);
  const activeSessions = (db.groupSessions || []).filter((s) => {
    if (s.status !== 'scheduled' && s.status !== 'running' && s.status !== 'paused') {
      return false;
    }
    if (socialService.isBlockedBetween(db, userId, s.hostId)) return false;
    if (s.hostId === userId) return true;
    if (Array.isArray(s.participantIds) && s.participantIds.includes(userId)) return true;
    if (s.squadId) return mySquadIds.has(s.squadId);
    return acceptedFriendIds.has(s.hostId);
  });
  res.json({
    ...friends,
    ...squads,
    privacy,
    roomInvitations,
    notifications,
    activities,
    activeSessions,
  });
});

apiRouter.get('/social/users/search', (req: Request, res: Response) => {
  const { userId } = getAuth(req);
  const q = typeof req.query.q === 'string' ? req.query.q : '';
  const page = Number(req.query.page || 1);
  const limit = Number(req.query.limit || 10);
  res.json(socialService.searchSocialUsers(dbService.getRawDatabase(), userId, q, page, limit));
});

apiRouter.post('/social/friends/request', async (req: Request, res: Response) => {
  const { userId } = getAuth(req);
  try {
    const f = socialService.sendFriendRequest(dbService.getRawDatabase(), userId, String(req.body?.recipientId || ''));
    await dbService.save();
    res.json(f);
  } catch (err: any) {
    res.status(400).json({ error: err?.message || 'Unable to send friend request' });
  }
});

apiRouter.post('/social/friends/:id/respond', async (req: Request, res: Response) => {
  const { userId } = getAuth(req);
  const action = req.body?.action;
  if (!['accept', 'reject', 'cancel', 'remove'].includes(action)) {
    res.status(400).json({ error: 'Invalid friend response action' });
    return;
  }
  try {
    const f = socialService.respondFriendRequest(dbService.getRawDatabase(), userId, String(req.params.id), action);
    await dbService.save();
    res.json(f);
  } catch (err: any) {
    res.status(403).json({ error: err?.message || 'Unauthorized' });
  }
});

apiRouter.post('/social/users/:id/block', async (req: Request, res: Response) => {
  const { userId } = getAuth(req);
  try {
    const blk = socialService.blockSocialUser(dbService.getRawDatabase(), userId, String(req.params.id));
    await dbService.save();
    res.json(blk);
  } catch (err: any) {
    res.status(400).json({ error: err?.message || 'Unable to block user' });
  }
});

apiRouter.post('/social/users/:id/report', async (req: Request, res: Response) => {
  const { userId } = getAuth(req);
  try {
    const rep = socialService.reportSocialUser(dbService.getRawDatabase(), userId, String(req.params.id), String(req.body?.reason || ''));
    await dbService.save();
    res.json(rep);
  } catch (err: any) {
    res.status(400).json({ error: err?.message || 'Unable to report user' });
  }
});

apiRouter.put('/social/privacy', async (req: Request, res: Response) => {
  const { userId } = getAuth(req);
  const next = socialService.updateUserPrivacy(dbService.getRawDatabase(), userId, req.body || {});
  await dbService.save();
  res.json(next);
});

apiRouter.post('/social/squads', async (req: Request, res: Response) => {
  const { userId } = getAuth(req);
  try {
    const squad = socialService.createSocialSquad(dbService.getRawDatabase(), userId, req.body || {});
    await dbService.save();
    res.json(squad);
  } catch (err: any) {
    res.status(400).json({ error: err?.message || 'Unable to create squad' });
  }
});

apiRouter.post('/social/squads/:id/invite', async (req: Request, res: Response) => {
  const { userId } = getAuth(req);
  try {
    const inv = socialService.inviteToSocialSquad(
      dbService.getRawDatabase(),
      userId,
      String(req.params.id),
      String(req.body?.recipientId || '')
    );
    await dbService.save();
    res.json(inv);
  } catch (err: any) {
    res.status(403).json({ error: err?.message || 'Unable to invite to squad' });
  }
});

apiRouter.post('/social/squad-invitations/:id/respond', async (req: Request, res: Response) => {
  const { userId } = getAuth(req);
  const action = req.body?.action;
  if (action !== 'accept' && action !== 'reject') {
    res.status(400).json({ error: 'Invalid action' });
    return;
  }
  try {
    const out = socialService.respondSquadInvitation(dbService.getRawDatabase(), userId, String(req.params.id), action);
    await dbService.save();
    res.json(out);
  } catch (err: any) {
    res.status(403).json({ error: err?.message || 'Unable to respond to squad invitation' });
  }
});

apiRouter.post('/social/squads/:id/members', async (req: Request, res: Response) => {
  const { userId } = getAuth(req);
  const { targetUserId, action } = req.body || {};
  if (!['remove', 'promote', 'demote', 'transfer_ownership', 'leave'].includes(action)) {
    res.status(400).json({ error: 'Invalid member action' });
    return;
  }
  try {
    const squad = socialService.manageSocialSquadMember(
      dbService.getRawDatabase(),
      userId,
      String(req.params.id),
      String(targetUserId || userId),
      action
    );
    await dbService.save();
    res.json(squad);
  } catch (err: any) {
    res.status(403).json({ error: err?.message || 'Unauthorized' });
  }
});

apiRouter.delete('/social/squads/:id', async (req: Request, res: Response) => {
  const { userId } = getAuth(req);
  try {
    const deleted = socialService.deleteSocialSquad(dbService.getRawDatabase(), userId, String(req.params.id));
    await dbService.save();
    res.json({ success: deleted });
  } catch (err: any) {
    res.status(403).json({ error: err?.message || 'Unauthorized' });
  }
});

apiRouter.get('/social/squads/:id/challenges', (req: Request, res: Response) => {
  const { userId } = getAuth(req);
  try {
    const list = socialService.getSquadWeeklyChallenges(dbService.getRawDatabase(), userId, String(req.params.id));
    res.json({ challenges: list });
  } catch (err: any) {
    res.status(403).json({ error: err?.message || 'Unauthorized' });
  }
});

apiRouter.post('/social/room-invitations', async (req: Request, res: Response) => {
  const { userId } = getAuth(req);
  try {
    const inv = socialService.sendRoomInvitation(dbService.getRawDatabase(), userId, req.body || {});
    await dbService.save();
    res.json(inv);
  } catch (err: any) {
    res.status(400).json({ error: err?.message || 'Unable to send room invite' });
  }
});

apiRouter.post('/social/room-invitations/:id/respond', async (req: Request, res: Response) => {
  const { userId } = getAuth(req);
  const action = req.body?.action;
  if (action !== 'accept' && action !== 'reject') {
    res.status(400).json({ error: 'Invalid action' });
    return;
  }
  try {
    const inv = socialService.respondRoomInvitation(dbService.getRawDatabase(), userId, String(req.params.id), action);
    await dbService.save();
    res.json(inv);
  } catch (err: any) {
    res.status(400).json({ error: err?.message || 'Unable to respond to room invite' });
  }
});

apiRouter.post('/social/sessions', async (req: Request, res: Response) => {
  const { userId } = getAuth(req);
  try {
    const sess = socialService.createGroupStudySession(dbService.getRawDatabase(), userId, req.body || {});
    await dbService.save();
    res.json(sess);
  } catch (err: any) {
    res.status(400).json({ error: err?.message || 'Unable to create group session' });
  }
});

apiRouter.post('/social/sessions/:id/transition', async (req: Request, res: Response) => {
  const { userId } = getAuth(req);
  const action = req.body?.action;
  if (!['start', 'pause', 'resume', 'end', 'join'].includes(action)) {
    res.status(400).json({ error: 'Invalid session action' });
    return;
  }
  try {
    const sess = socialService.transitionGroupStudySession(dbService.getRawDatabase(), userId, String(req.params.id), action);
    await dbService.save();
    res.json(sess);
  } catch (err: any) {
    res.status(403).json({ error: err?.message || 'Unable to update session' });
  }
});

apiRouter.get('/social/chat', (req: Request, res: Response) => {
  const { userId } = getAuth(req);
  try {
    const messages = socialService.getChatMessages(dbService.getRawDatabase(), userId, {
      squadId: typeof req.query.squadId === 'string' ? req.query.squadId : undefined,
      roomId: typeof req.query.roomId === 'string' ? req.query.roomId : undefined,
      limit: Number(req.query.limit || 25),
      before: req.query.before ? Number(req.query.before) : undefined,
    });
    res.json({ messages });
  } catch (err: any) {
    res.status(403).json({ error: err?.message || 'Unauthorized' });
  }
});

apiRouter.post('/social/chat', async (req: Request, res: Response) => {
  const { userId } = getAuth(req);
  try {
    const msg = socialService.sendChatMessage(dbService.getRawDatabase(), userId, req.body || {});
    await dbService.save();
    res.json(msg);
  } catch (err: any) {
    const status = String(err?.message || '').includes('Rate limit') ? 429 : 400;
    res.status(status).json({ error: err?.message || 'Unable to send message' });
  }
});

apiRouter.post('/social/chat/:id/react', async (req: Request, res: Response) => {
  const { userId } = getAuth(req);
  try {
    const msg = socialService.reactToChatMessage(dbService.getRawDatabase(), userId, String(req.params.id), String(req.body?.emoji || ''));
    await dbService.save();
    res.json(msg);
  } catch (err: any) {
    res.status(400).json({ error: err?.message || 'Unable to react' });
  }
});

apiRouter.delete('/social/chat/:id', async (req: Request, res: Response) => {
  const { userId } = getAuth(req);
  try {
    const msg = socialService.deleteChatMessage(dbService.getRawDatabase(), userId, String(req.params.id));
    await dbService.save();
    res.json(msg);
  } catch (err: any) {
    res.status(403).json({ error: err?.message || 'Unauthorized' });
  }
});

apiRouter.post('/social/notifications/:id/read', async (req: Request, res: Response) => {
  const { userId } = getAuth(req);
  const db = dbService.getRawDatabase();
  const n = (db.socialNotifications || []).find((x) => x.id === req.params.id && x.userId === userId);
  if (n) {
    n.read = true;
    await dbService.save();
  }
  res.json({ success: true });
});

// ----------------------------------------------------
// Habits API (supports local dev & guest fallback)
// ----------------------------------------------------
apiRouter.get('/habits', (req: Request, res: Response) => {
  const { userId } = getAuth(req);
  const db = dbService.getRawDatabase() as any;
  const list = Array.isArray(db.habits) ? db.habits : [];
  res.json(list.filter((h: any) => h.userId === userId && !h.deletedAt));
});

apiRouter.post('/habits', async (req: Request, res: Response) => {
  const { userId } = getAuth(req);
  const db = dbService.getRawDatabase() as any;
  if (!Array.isArray(db.habits)) db.habits = [];
  const nowIso = new Date().toISOString();
  const created = {
    id: req.body?.id || `hab_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
    userId,
    title: String(req.body?.title || 'Daily Habit').trim().slice(0, 128),
    category: req.body?.category || 'Study',
    targetPerWeek: Number(req.body?.targetPerWeek ?? 7),
    completedDates: Array.isArray(req.body?.completedDates) ? req.body.completedDates : [],
    bestStreakDays: Number(req.body?.bestStreakDays ?? 0),
    createdAt: nowIso,
    updatedAt: nowIso,
    deletedAt: null,
  };
  db.habits.unshift(created);
  await dbService.save();
  res.status(201).json(created);
});

function validateAndApplyHabitUpdate(
  habit: Record<string, any>,
  rawBody: unknown
): { ok: true } | { ok: false; error: string } {
  const body = (rawBody && typeof rawBody === 'object' ? rawBody : {}) as Record<string, unknown>;

  if (body.title !== undefined) {
    const title = parseNonEmptyString(body.title, 128);
    if (!title) return { ok: false, error: 'title must be a non-empty string up to 128 characters' };
    habit.title = title;
  }

  if (body.category !== undefined) {
    const category = parseNonEmptyString(body.category, 64);
    if (!category) return { ok: false, error: 'category must be a non-empty string up to 64 characters' };
    habit.category = category;
  }

  if (body.frequency !== undefined) {
    const freq = parseEnum(body.frequency, ALLOWED_HABIT_FREQUENCIES);
    if (!freq) return { ok: false, error: 'frequency must be daily, weekly, or custom' };
    habit.frequency = freq;
  }

  if (body.targetPerWeek !== undefined) {
    const target = parsePositiveInt(body.targetPerWeek, 1, 7);
    if (target === null) return { ok: false, error: 'targetPerWeek must be an integer between 1 and 7' };
    habit.targetPerWeek = target;
  }

  if (body.scheduledDays !== undefined) {
    if (!Array.isArray(body.scheduledDays)) {
      return { ok: false, error: 'scheduledDays must be an array of integers (0-6)' };
    }
    const normalizedDays = Array.from(
      new Set(
        body.scheduledDays.map((d) => Number(d)).filter((d) => Number.isInteger(d) && d >= 0 && d <= 6)
      )
    ).sort((a, b) => a - b);
    if (normalizedDays.length !== body.scheduledDays.length) {
      return { ok: false, error: 'scheduledDays may only contain unique integers between 0 and 6' };
    }
    habit.scheduledDays = normalizedDays;
  }

  if (body.completedDates !== undefined) {
    if (!Array.isArray(body.completedDates)) {
      return { ok: false, error: 'completedDates must be an array of YYYY-MM-DD strings' };
    }
    const validDates: string[] = [];
    for (const d of body.completedDates) {
      const parsed = parseIsoDate(d);
      if (!parsed) return { ok: false, error: 'completedDates entries must be valid YYYY-MM-DD dates' };
      validDates.push(parsed);
    }
    habit.completedDates = Array.from(new Set(validDates)).sort();
  }

  if (body.bestStreakDays !== undefined) {
    const streak = parseNonNegativeInt(body.bestStreakDays, 10000);
    if (streak === null) return { ok: false, error: 'bestStreakDays must be a non-negative integer' };
    habit.bestStreakDays = streak;
  }

  if (body.archived !== undefined) {
    if (typeof body.archived !== 'boolean') return { ok: false, error: 'archived must be a boolean' };
    habit.archived = body.archived;
  }

  for (const field of ['sourceSpreadsheetId', 'sourceSheetId', 'sourceRowId', 'sourceMappingKey', 'sourceLayout'] as const) {
    if (body[field] !== undefined) {
      if (body[field] === null) {
        delete habit[field];
      } else if (typeof body[field] === 'string' && body[field].length <= 256) {
        habit[field] = body[field].trim();
      } else {
        return { ok: false, error: `${field} must be a string up to 256 characters` };
      }
    }
  }

  habit.updatedAt = new Date().toISOString();
  return { ok: true };
}

apiRouter.post('/habits/:id/toggle', async (req: Request, res: Response) => {
  const { userId } = getAuth(req);
  const db = dbService.getRawDatabase() as any;
  const list = Array.isArray(db.habits) ? db.habits : [];
  const habit = list.find((h: any) => h.id === req.params.id && h.userId === userId && !h.deletedAt);
  if (!habit) {
    res.status(404).json({ error: 'Habit not found' });
    return;
  }
  const userSettings = Array.isArray(db.userSettings)
    ? db.userSettings.find((s: any) => s.userId === userId)
    : undefined;
  const tz = userSettings?.timezone || DEFAULT_TIMEZONE;
  const rawDate = req.body?.dateStr ?? req.body?.date;
  let dateStr: string;
  if (rawDate !== undefined && rawDate !== null && rawDate !== '') {
    const parsedDate = parseIsoDate(rawDate);
    if (!parsedDate) {
      res.status(400).json({ error: 'dateStr must be a valid YYYY-MM-DD date' });
      return;
    }
    dateStr = parsedDate;
  } else {
    dateStr = getTodayDateString(tz);
  }
  const set = new Set<string>(Array.isArray(habit.completedDates) ? habit.completedDates : []);
  if (set.has(dateStr)) set.delete(dateStr);
  else set.add(dateStr);
  habit.completedDates = Array.from(set).sort();
  habit.updatedAt = new Date().toISOString();
  await dbService.save();
  res.json(habit);
});

const handleUpdateHabit = async (req: Request, res: Response) => {
  const { userId } = getAuth(req);
  const db = dbService.getRawDatabase() as any;
  const list = Array.isArray(db.habits) ? db.habits : [];
  const habit = list.find((h: any) => h.id === req.params.id && h.userId === userId && !h.deletedAt);
  if (!habit) {
    res.status(404).json({ error: 'Habit not found' });
    return;
  }
  const applied = validateAndApplyHabitUpdate(habit, req.body);
  if (!applied.ok) {
    res.status(400).json({ error: applied.error });
    return;
  }
  await dbService.save();
  res.json(habit);
};

apiRouter.put('/habits/:id', handleUpdateHabit);
apiRouter.patch('/habits/:id', handleUpdateHabit);

apiRouter.delete('/habits/:id', async (req: Request, res: Response) => {
  const { userId } = getAuth(req);
  const db = dbService.getRawDatabase() as any;
  const list = Array.isArray(db.habits) ? db.habits : [];
  const habit = list.find((h: any) => h.id === req.params.id && h.userId === userId);
  if (habit) {
    habit.deletedAt = new Date().toISOString();
    habit.updatedAt = new Date().toISOString();
    await dbService.save();
  }
  res.json({ success: true });
});

// ----------------------------------------------------
// Final 404 handler for unmatched /api routes
// ----------------------------------------------------
apiRouter.use((_req: Request, res: Response) => {
  res.status(404).json({ error: 'API route not found' });
});
